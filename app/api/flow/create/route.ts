import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Json = Record<string, unknown>;

function reply(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function getSecret(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return "";
}

async function flowSignature(params: Record<string, string>, secret: string) {
  const payload = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeAppUrl(value: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Método no permitido." });

  try {
    // No se exige SUPABASE_ANON_KEY: el JWT del usuario se valida
    // mediante auth.getUser(jwt), usando la clave service role existente.
    const projectUrl = getSecret("PROJECT_URL", "SUPABASE_URL").replace(/\/+$/, "");
    const serviceKey = getSecret("PROJECT_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
    const flowApiKey = getSecret("FLOW_API_KEY");
    const flowSecret = getSecret("FLOW_SECRET_KEY");
    const flowApiBase = (
      getSecret("FLOW_API_BASE_URL", "FLOW_API_URL") || "https://www.flow.cl/api"
    ).replace(/\/+$/, "");
    const appUrl = normalizeAppUrl(getSecret("BOOM_POS_APP_URL"));

    const missing: string[] = [];
    if (!projectUrl) missing.push("PROJECT_URL");
    if (!serviceKey) missing.push("PROJECT_SERVICE_ROLE_KEY");
    if (!flowApiKey) missing.push("FLOW_API_KEY");
    if (!flowSecret) missing.push("FLOW_SECRET_KEY");
    if (!appUrl) missing.push("BOOM_POS_APP_URL (URL HTTPS)");

    if (missing.length) {
      console.error("flow-create-payment: configuración incompleta", { missing });
      return reply(503, {
        error: "Configuración incompleta de BOOM POS o Flow en Supabase Secrets.",
        missing,
      });
    }

    const authorization = req.headers.get("Authorization") || "";
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!accessToken) return reply(401, { error: "Sesión no autenticada." });

    const admin = createClient(projectUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: auth, error: authError } = await admin.auth.getUser(accessToken);
    const user = auth?.user;
    if (authError || !user) {
      console.error("flow-create-payment: JWT inválido", authError?.message);
      return reply(401, { error: "La sesión expiró o no es válida. Inicia sesión nuevamente." });
    }

    const body = await req.json().catch(() => ({}));
    const subscriptionId = typeof body?.subscriptionId === "string"
      ? body.subscriptionId.trim()
      : "";
    if (!subscriptionId) {
      return reply(400, { error: "Falta el identificador de la suscripción." });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("flow-create-payment: error consultando perfil", profileError);
      return reply(500, { error: "No se pudo validar la empresa del usuario." });
    }
    if (!profile?.company_id) {
      return reply(403, { error: "No se encontró la empresa asociada al usuario." });
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from("boom_pos_subscriptions")
      .select("id,company_id,user_id,plan_code,status")
      .eq("id", subscriptionId)
      .eq("company_id", profile.company_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subscriptionError) {
      console.error("flow-create-payment: error consultando suscripción", subscriptionError);
      return reply(500, { error: "No se pudo consultar la suscripción." });
    }
    if (!subscription) {
      return reply(404, { error: "No se encontró la suscripción solicitada." });
    }
    if (subscription.status === "active") {
      return reply(409, { error: "La suscripción ya está activa." });
    }

    // Primero buscamos una orden pendiente vigente.
    const { data: pendingPayment, error: pendingError } = await admin
      .from("boom_pos_subscription_payments")
      .select("id,subscription_id,company_id,user_id,amount_clp,status,metadata")
      .eq("subscription_id", subscription.id)
      .eq("company_id", profile.company_id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingError) {
      console.error("flow-create-payment: error consultando pago pendiente", pendingError);
      return reply(500, { error: "No se pudo consultar el pago pendiente." });
    }

    let payment = pendingPayment;

    // Si la orden anterior terminó fallida/rechazada, no se reutiliza su
    // commerceOrder ni su token de Flow. Se crea una orden nueva para el
    // MISMO plan/suscripción, conservando el importe original.
    if (!payment) {
      const { data: previousPayment, error: previousError } = await admin
        .from("boom_pos_subscription_payments")
        .select("id,subscription_id,company_id,user_id,amount_clp,status")
        .eq("subscription_id", subscription.id)
        .eq("company_id", profile.company_id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousError) {
        console.error("flow-create-payment: error consultando orden anterior", previousError);
        return reply(500, { error: "No se pudo consultar el intento de pago anterior." });
      }

      if (!previousPayment) {
        return reply(409, {
          error: "No existe una orden de pago para esta suscripción. Vuelve a seleccionar el plan.",
        });
      }

      if (previousPayment.status === "confirmed") {
        return reply(409, {
          error: "Este plan ya tiene un pago confirmado. Actualiza el estado de tu suscripción antes de intentar otro cobro.",
        });
      }

      const previousAmount = Number(previousPayment.amount_clp);
      if (!Number.isSafeInteger(previousAmount) || previousAmount <= 0) {
        return reply(409, { error: "El importe de la orden anterior no es válido." });
      }

      const { data: newPayment, error: insertError } = await admin
        .from("boom_pos_subscription_payments")
        .insert({
          subscription_id: subscription.id,
          company_id: profile.company_id,
          user_id: user.id,
          amount_clp: previousAmount,
          status: "pending",
          provider: "flow",
          metadata: {
            retry_of: previousPayment.id,
            retry_created_at: new Date().toISOString(),
          },
        })
        .select("id,subscription_id,company_id,user_id,amount_clp,status,metadata")
        .single();

      if (insertError || !newPayment) {
        console.error("flow-create-payment: no se pudo crear nueva orden para reintento", insertError);
        return reply(500, {
          error: "No se pudo generar una nueva orden para reintentar el pago del mismo plan.",
          detail: insertError?.message ?? null,
        });
      }

      payment = newPayment;
    }

    const amount = Number(payment.amount_clp);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return reply(409, { error: "El importe del pago no es válido." });
    }

    const metadata = payment.metadata && typeof payment.metadata === "object"
      ? payment.metadata as Record<string, unknown>
      : {};

    // Reutiliza el checkout vigente para evitar crear órdenes duplicadas.
    if (
      typeof metadata.flow_url === "string" &&
      typeof metadata.flow_token === "string" &&
      typeof metadata.flow_expires_at === "string" &&
      new Date(metadata.flow_expires_at).getTime() > Date.now()
    ) {
      return reply(200, { url: metadata.flow_url, token: metadata.flow_token });
    }

    if (!user.email) {
      return reply(400, { error: "La cuenta no tiene correo electrónico registrado." });
    }

    const params: Record<string, string> = {
      apiKey: flowApiKey,
      commerceOrder: String(payment.id),
      subject: `BOOM POS - Plan ${subscription.plan_code}`,
      currency: "CLP",
      amount: String(amount),
      email: user.email,
      urlConfirmation: `${projectUrl}/functions/v1/flow-confirmation`,
      urlReturn: `${appUrl}/api/flow/return`,
    };

    const signedParams = { ...params, s: await flowSignature(params, flowSecret) };
    const flowResponse = await fetch(`${flowApiBase}/payment/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(signedParams),
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    const flowResult = await flowResponse.json().catch(() => null);

    if (
      !flowResponse.ok ||
      typeof flowResult?.url !== "string" ||
      typeof flowResult?.token !== "string"
    ) {
      console.error("flow-create-payment: Flow payment/create rechazado", {
        status: flowResponse.status,
        response: flowResult,
      });
      return reply(502, {
        error: "Flow no pudo crear el pago.",
        detail: typeof flowResult?.message === "string"
          ? flowResult.message
          : typeof flowResult?.code === "string" ? flowResult.code : null,
      });
    }

    const checkoutUrl = new URL(flowResult.url);
    if (checkoutUrl.protocol !== "https:") {
      return reply(502, { error: "Flow devolvió una URL de pago no segura." });
    }
    checkoutUrl.searchParams.set("token", flowResult.token);

    const expiresAt = new Date(Date.now() + 25 * 60 * 1000).toISOString();
    const { error: saveError } = await admin
      .from("boom_pos_subscription_payments")
      .update({
        provider: "flow",
        provider_payment_id: flowResult.token,
        metadata: {
          ...metadata,
          flow_order: String(flowResult.flowOrder ?? ""),
          flow_url: checkoutUrl.toString(),
          flow_token: flowResult.token,
          flow_expires_at: expiresAt,
        },
      })
      .eq("id", payment.id)
      .eq("status", "pending");

    if (saveError) {
      console.error("flow-create-payment: no se pudo guardar referencia Flow", saveError);
      return reply(500, {
        error: "Flow creó el pago, pero no se pudo guardar su referencia. No vuelvas a pagar hasta revisar la orden.",
      });
    }

    return reply(200, { url: checkoutUrl.toString(), token: flowResult.token });
  } catch (error) {
    console.error("flow-create-payment: error inesperado", error);
    return reply(500, { error: "Error interno al crear el pago con Flow." });
  }
});
