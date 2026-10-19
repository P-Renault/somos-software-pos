
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function flowSignature(
  params: Record<string, string>,
  secret: string,
) {
  const data = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");

  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  ).then(async (key) => {
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(data),
    );

    return Array.from(new Uint8Array(signature))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Método no permitido." }, 405);
  }

  try {
    const projectUrl = Deno.env.get("PROJECT_URL");
    const serviceKey = Deno.env.get("PROJECT_SERVICE_ROLE_KEY");
    const flowApiKey = Deno.env.get("FLOW_API_KEY");
    const flowSecret = Deno.env.get("FLOW_SECRET_KEY");
    const flowApiUrl = (
      Deno.env.get("FLOW_API_URL") ||
      Deno.env.get("FLOW_API_BASE_URL") ||
      "https://www.flow.cl/api"
    ).replace(/\/$/, "");
    const appUrl = Deno.env.get("BOOM_POS_APP_URL");

    if (
      !projectUrl ||
      !serviceKey ||
      !flowApiKey ||
      !flowSecret ||
      !appUrl
    ) {
      return json({
        error: "Faltan secretos de Supabase, Flow o BOOM POS.",
      }, 503);
    }

    const authorization = request.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Debes iniciar sesión." }, 401);
    }

    const userClient = createClient(projectUrl, serviceKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Sesión inválida o vencida." }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const subscriptionId =
      typeof body.subscriptionId === "string"
        ? body.subscriptionId
        : "";

    if (!subscriptionId) {
      return json({
        error: "Falta subscriptionId.",
      }, 400);
    }

    const admin = createClient(projectUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.company_id) {
      return json({
        error: "No se encontró la empresa del usuario.",
      }, 403);
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from("boom_pos_subscriptions")
      .select("id,company_id,user_id,plan_code,status,price_clp")
      .eq("id", subscriptionId)
      .eq("company_id", profile.company_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subscriptionError || !subscription) {
      return json({
        error: "No se encontró la suscripción solicitada.",
      }, 404);
    }

    if (subscription.status === "active") {
      return json({
        error: "La suscripción ya está activa.",
      }, 409);
    }

    const { data: payment, error: paymentError } = await admin
      .from("boom_pos_subscription_payments")
      .select("id,subscription_id,company_id,user_id,amount_clp,status,metadata")
      .eq("subscription_id", subscription.id)
      .eq("company_id", profile.company_id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError || !payment) {
      return json({
        error: "No existe un pago pendiente para esta suscripción.",
      }, 409);
    }

    const amount = Number(payment.amount_clp);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return json({ error: "Importe del pago inválido." }, 409);
    }

    const metadata =
      payment.metadata && typeof payment.metadata === "object"
        ? payment.metadata as Record<string, unknown>
        : {};

    if (
      typeof metadata.flow_url === "string" &&
      typeof metadata.flow_expires_at === "string" &&
      new Date(metadata.flow_expires_at).getTime() > Date.now()
    ) {
      return json({ url: metadata.flow_url });
    }

    const normalizedAppUrl = appUrl.replace(/\/$/, "");

    if (!normalizedAppUrl.startsWith("https://")) {
      return json({
        error: "BOOM_POS_APP_URL debe ser una URL HTTPS.",
      }, 503);
    }

    if (!user.email) {
      return json({ error: "La cuenta no tiene correo electrónico." }, 400);
    }

    const params: Record<string, string> = {
      apiKey: flowApiKey,
      commerceOrder: String(payment.id),
      subject: `BOOM POS - Plan ${subscription.plan_code}`,
      currency: "CLP",
      amount: String(amount),
      email: user.email,
      urlConfirmation: `${normalizedAppUrl}/functions/v1/flow-webhook`,
      urlReturn: `${normalizedAppUrl}/functions/v1/flow-return`,
    };

    const signature = await flowSignature(params, flowSecret);

    const response = await fetch(`${flowApiUrl}/payment/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ ...params, s: signature }),
    });

    const result = await response.json().catch(() => null);

    if (
      !response.ok ||
      typeof result?.url !== "string" ||
      typeof result?.token !== "string"
    ) {
      return json({
        error: "Flow no pudo crear el pago.",
        detail: result?.message || null,
      }, 502);
    }

    const expiresAt = new Date(
      Date.now() + 25 * 60 * 1000,
    ).toISOString();

    const { error: updatePaymentError } = await admin
      .from("boom_pos_subscription_payments")
      .update({
        provider: "flow",
        provider_payment_id: result.token,
        metadata: {
          ...metadata,
          flow_order: String(result.flowOrder ?? ""),
          flow_url: result.url,
          flow_expires_at: expiresAt,
        },
      })
      .eq("id", payment.id)
      .eq("status", "pending");

    if (updatePaymentError) {
      return json({
        error: "No se pudo guardar la referencia del pago.",
      }, 500);
    }

    return json({
      url: result.url,
      token: result.token,
    });
  } catch (error) {
    console.error("flow-create-payment error:", error);
    return json({
      error: "Error interno al crear el pago.",
    }, 500);
  }
});
