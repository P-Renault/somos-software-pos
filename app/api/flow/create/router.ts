import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function flowSignature(params: Record<string, string>, secret: string) {
  const payload = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export async function POST(request: Request) {
  try {
    const sessionClient = await createServerClient();
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId : "";
    if (!subscriptionId) return NextResponse.json({ error: "Falta subscriptionId." }, { status: 400 });

    const projectUrl = process.env.PROJECT_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.PROJECT_SERVICE_ROLE_KEY;
    const flowApiKey = process.env.FLOW_API_KEY;
    const flowSecret = process.env.FLOW_SECRET_KEY;
    const flowApiUrl = (process.env.FLOW_API_BASE_URL || process.env.FLOW_API_URL || "https://www.flow.cl/api").replace(/\/$/, "");
    const appUrl = (process.env.BOOM_POS_APP_URL || "").replace(/\/$/, "");
    if (!projectUrl || !serviceKey || !flowApiKey || !flowSecret || !appUrl.startsWith("https://")) {
      return NextResponse.json({ error: "Faltan secretos o BOOM_POS_APP_URL no es HTTPS." }, { status: 503 });
    }

    const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
    if (profileError || !profile?.company_id) return NextResponse.json({ error: "No se encontró la empresa del usuario." }, { status: 403 });

    const { data: subscription, error: subError } = await admin.from("boom_pos_subscriptions")
      .select("id,company_id,user_id,plan_code,status")
      .eq("id", subscriptionId).eq("company_id", profile.company_id).eq("user_id", user.id).maybeSingle();
    if (subError || !subscription) return NextResponse.json({ error: "No se encontró la suscripción." }, { status: 404 });
    if (subscription.status === "active") return NextResponse.json({ error: "La suscripción ya está activa." }, { status: 409 });

    const { data: payment, error: paymentError } = await admin.from("boom_pos_subscription_payments")
      .select("id,subscription_id,company_id,user_id,amount_clp,status,metadata")
      .eq("subscription_id", subscription.id).eq("company_id", profile.company_id).eq("user_id", user.id)
      .eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (paymentError || !payment) return NextResponse.json({ error: "No existe un pago pendiente para esta suscripción." }, { status: 409 });
    const amount = Number(payment.amount_clp);
    if (!Number.isSafeInteger(amount) || amount <= 0) return NextResponse.json({ error: "Importe de pago inválido." }, { status: 409 });
    const metadata = payment.metadata && typeof payment.metadata === "object" ? payment.metadata as Record<string, unknown> : {};
    if (typeof metadata.flow_url === "string" && typeof metadata.flow_expires_at === "string" && new Date(metadata.flow_expires_at).getTime() > Date.now()) {
      return NextResponse.json({ url: metadata.flow_url });
    }
    if (!user.email) return NextResponse.json({ error: "La cuenta no tiene correo electrónico." }, { status: 400 });

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
    const response = await fetch(`${flowApiUrl}/payment/create`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, s: flowSignature(params, flowSecret) }), cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || typeof result?.url !== "string" || typeof result?.token !== "string") {
      return NextResponse.json({ error: "Flow no pudo crear el pago.", detail: result?.message ?? null }, { status: 502 });
    }
    const { error: saveError } = await admin.from("boom_pos_subscription_payments").update({
      provider: "flow", provider_payment_id: result.token,
      metadata: { ...metadata, flow_order: String(result.flowOrder ?? ""), flow_url: result.url, flow_expires_at: new Date(Date.now() + 25 * 60 * 1000).toISOString() },
    }).eq("id", payment.id).eq("status", "pending");
    if (saveError) return NextResponse.json({ error: "Pago creado en Flow, pero no se pudo guardar la referencia. Revisa antes de reintentar." }, { status: 500 });
    return NextResponse.json({ url: result.url, token: result.token });
  } catch (error) {
    console.error("flow create error", error);
    return NextResponse.json({ error: "Error interno al crear el pago." }, { status: 500 });
  }
}
