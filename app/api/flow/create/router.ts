import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Json = Record<string, unknown>;

function respond(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function signFlow(params: Record<string, string>, secret: string): Promise<string> {
  const payload = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  ).then(async (key) => {
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
  });
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond(405, { error: "Método no permitido." });

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return respond(401, { error: "Debes iniciar sesión para contratar un plan." });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const flowApiKey = Deno.env.get("FLOW_API_KEY");
    const flowSecret = Deno.env.get("FLOW_SECRET_KEY");
    const flowApiUrl = (Deno.env.get("FLOW_API_BASE_URL") || "https://www.flow.cl/api").replace(/\/+$/, "");
    const appUrl = (Deno.env.get("BOOM_POS_APP_URL") || "").replace(/\/+$/, "");

    if (!supabaseUrl || !serviceRoleKey || !flowApiKey || !flowSecret || !appUrl.startsWith("https://")) {
      return respond(503, { error: "Falta configurar Supabase o las credenciales/URL de Flow en los secretos de la función." });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    const user = authData?.user;
    if (authError || !user) return respond(401, { error: "La sesión no es válida o ha expirado." });

    const body = await req.json().catch(() => null);
    const subscriptionId = body && typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";
    if (!subscriptionId) return respond(400, { error: "Falta el identificador de la suscripción." });
    if (!user.email) return respond(400, { error: "La cuenta no tiene correo electrónico." });

    const { data: profile, error: profileError } = await admin
      .from("profiles").select("company_id").eq("id", user.id).maybeSingle();
    if (profileError || !profile?.company_id) return respond(403, { error: "No se encontró la empresa del usuario." });

    const { data: subscription, error: subscriptionError } = await admin
      .from("boom_pos_subscriptions")
      .select("id,company_id,user_id,plan_code,status")
      .eq("id", subscriptionId).eq("company_id", profile.company_id).eq("user_id", user.id)
      .maybeSingle();

    if (subscriptionError || !subscription) return respond(404, { error: "No se encontró la suscripción solicitada." });
    if (subscription.status === "active") return respond(409, { error: "La suscripción ya está activa." });

    // Una orden pendiente vigente se reutiliza para impedir cobros duplicados.
    let { data: payment, error: paymentError } = await admin
      .from("boom_pos_subscription_payments")
      .select("id,subscription_id,company_id,user_id,amount_clp,status,metadata,provider_payment_id")
      .eq("subscription_id", subscription.id).eq("company_id", profile.company_id).eq("user_id", user.id)
      .eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (paymentError) {
      console.error("BOOM POS payment lookup:", paymentError);
      return respond(500, { error: "No se pudo consultar el estado del pago." });
    }

    // Si el último intento fue rechazado, generar un nuevo registro de pago.
    // Nunca reabrir ni sobrescribir el registro fallido: se conserva el historial.
    if (!payment) {
      const { data: previous, error: previousError } = await admin
        .from("boom_pos_subscription_payments")
        .select("amount_clp")
        .eq("subscription_id", subscription.id).eq("company_id", profile.company_id).eq("user_id", user.id)
        .eq("status", "failed").order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (previousError || !previous) {
        return respond(409, { error: "No existe un pago pendiente ni un intento rechazado que pueda reintentarse. Vuelve a seleccionar el plan." });
      }

      const amount = Number(previous.amount_clp);
      if (!Number.isSafeInteger(amount) || amount <= 0) return respond(409, { error: "El importe del último intento no es válido." });

      const { data: newPayment, error: insertError } = await admin
        .from("boom_pos_subscription_payments")
        .insert({
          subscription_id: subscription.id,
          company_id: profile.company_id,
          user_id: user.id,
          amount_clp: amount,
          status: "pending",
          provider: "flow",
          metadata: { retry_of_failed_payment: true, retry_created_at: new Date().toISOString() },
        })
        .select("id,subscription_id,company_id,user_id,amount_clp,status,metadata,provider_payment_id")
        .single();

      if (insertError || !newPayment) {
        console.error("BOOM POS retry payment insert:", insertError);
        return respond(500, { error: "No se pudo crear una nueva orden para reintentar el pago." });
      }
      payment = newPayment;

      await admin.from("boom_pos_subscriptions")
        .update({ payment_status: "pending" })
        .eq("id", subscription.id).eq("company_id", profile.company_id).eq("user_id", user.id)
        .neq("status", "active");
    }

    const amount = Number(payment.amount_clp);
    if (!Number.isSafeInteger(amount) || amount <= 0) return respond(409, { error: "El importe del pago es inválido." });

    const metadata = asObject(payment.metadata);

    // Si existe una referencia previa, consultar el estado real antes de crear otro checkout.
    const existingToken = typeof payment.provider_payment_id === "string" ? payment.provider_payment_id : "";
    if (existingToken) {
      const statusParams = { apiKey: flowApiKey, token: existingToken };
      const statusSignature = await signFlow(statusParams, flowSecret);
      const statusUrl = new URL(`${flowApiUrl}/payment/getStatus`);
      statusUrl.search = new URLSearchParams({ ...statusParams, s: statusSignature }).toString();
      const statusResponse = await fetch(statusUrl, { method: "GET", cache: "no-store" });
      const flowStatus = await statusResponse.json().catch(() => null);

      if (statusResponse.ok && flowStatus && Number(flowStatus.status) === 1 &&
          typeof metadata.flow_url === "string") {
        const checkout = new URL(metadata.flow_url);
        checkout.searchParams.set("token", existingToken);
        return respond(200, { url: checkout.toString(), token: existingToken, reused: true });
      }

      if (statusResponse.ok && flowStatus && [3, 4].includes(Number(flowStatus.status))) {
        const { error: failedError } = await admin.from("boom_pos_subscription_payments")
          .update({
            status: "failed",
            metadata: { ...metadata, verified_status: Number(flowStatus.status), verified_at: new Date().toISOString() },
          }).eq("id", payment.id).eq("status", "pending");
        if (failedError) return respond(500, { error: "No se pudo cerrar el intento rechazado antes de reintentar." });

        const { data: retryPayment, error: retryInsertError } = await admin
          .from("boom_pos_subscription_payments")
          .insert({
            subscription_id: subscription.id, company_id: profile.company_id, user_id: user.id,
            amount_clp: amount, status: "pending", provider: "flow",
            metadata: { retry_of_failed_payment: true, retry_created_at: new Date().toISOString() },
          })
          .select("id,subscription_id,company_id,user_id,amount_clp,status,metadata,provider_payment_id")
          .single();
        if (retryInsertError || !retryPayment) return respond(500, { error: "No se pudo crear una nueva orden de pago." });
        payment = retryPayment;
      } else if (statusResponse.ok && flowStatus && Number(flowStatus.status) === 2) {
        return respond(409, { error: "Flow informa que este pago ya fue aprobado. Espera la confirmación de la suscripción." });
      } else if (typeof metadata.flow_url === "string") {
        const checkout = new URL(metadata.flow_url);
        checkout.searchParams.set("token", existingToken);
        return respond(200, { url: checkout.toString(), token: existingToken, reused: true });
      }
    }

    const params: Record<string, string> = {
      apiKey: flowApiKey,
      commerceOrder: String(payment.id),
      subject: `BOOM POS - Plan ${subscription.plan_code}`,
      currency: "CLP",
      amount: String(amount),
      email: user.email,
      urlConfirmation: `${appUrl}/api/flow/confirmation`,
      urlReturn: `${appUrl}/api/flow/return`,
    };

    const signature = await signFlow(params, flowSecret);
    const flowResponse = await fetch(`${flowApiUrl}/payment/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, s: signature }),
      cache: "no-store",
    });
    const result = await flowResponse.json().catch(() => null);

    if (!flowResponse.ok || typeof result?.url !== "string" || typeof result?.token !== "string") {
      console.error("Flow create failed:", result);
      return respond(502, { error: "Flow no pudo crear el pago.", detail: typeof result?.message === "string" ? result.message : undefined });
    }

    const savedMetadata = {
      ...metadata,
      flow_order: String(result.flowOrder ?? ""),
      flow_url: result.url,
      flow_expires_at: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
    };

    const { error: saveError } = await admin.from("boom_pos_subscription_payments")
      .update({ provider: "flow", provider_payment_id: result.token, metadata: savedMetadata })
      .eq("id", payment.id).eq("status", "pending");

    if (saveError) {
      console.error("BOOM POS save Flow reference:", saveError);
      return respond(500, { error: "Flow creó el pago, pero no se pudo guardar la referencia. Revisa el estado antes de reintentar." });
    }

    const checkoutUrl = new URL(result.url);
    checkoutUrl.searchParams.set("token", result.token);
    return respond(200, { url: checkoutUrl.toString(), token: result.token });
  } catch (error) {
    console.error("BOOM POS flow-create-payment:", error);
    return respond(500, { error: "Error interno al crear el pago con Flow." });
  }
});
