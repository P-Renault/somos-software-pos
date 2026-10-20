import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function flowSign(params: Record<string, string>, secret: string) {
  const payload = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function POST(request: Request) {
  try {
    const sessionClient = await createClient();
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId : "";
    if (!subscriptionId) return NextResponse.json({ error: "Falta el identificador de la suscripción." }, { status: 400 });

    const projectUrl = process.env.PROJECT_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.PROJECT_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const apiKey = process.env.FLOW_API_KEY;
    const secret = process.env.FLOW_SECRET_KEY;
    const apiBase = (process.env.FLOW_API_BASE_URL || process.env.FLOW_API_URL || "https://www.flow.cl/api").replace(/\/$/, "");
    const appUrl = (process.env.BOOM_POS_APP_URL || "").replace(/\/$/, "");
    if (!projectUrl || !serviceKey || !apiKey || !secret || !appUrl.startsWith("https://")) {
      return NextResponse.json({ error: "Configuración incompleta: revisa PROJECT_URL, PROJECT_SERVICE_ROLE_KEY, credenciales Flow y BOOM_POS_APP_URL." }, { status: 503 });
    }

    const { data: profile, error: profileError } = await sessionClient.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
    if (profileError || !profile?.company_id) return NextResponse.json({ error: "No se encontró la empresa asociada al usuario." }, { status: 403 });

    const admin = createAdminClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sub, error: subError } = await admin.from("boom_pos_subscriptions").select("id,company_id,user_id,plan_code,status").eq("id", subscriptionId).eq("company_id", profile.company_id).eq("user_id", user.id).maybeSingle();
    if (subError || !sub) return NextResponse.json({ error: "No se encontró la suscripción de esta empresa." }, { status: 404 });
    if (sub.status === "active") return NextResponse.json({ error: "Este plan ya está activo." }, { status: 409 });

    const { data: payment, error: payError } = await admin.from("boom_pos_subscription_payments").select("id,amount_clp,status,metadata").eq("subscription_id", sub.id).eq("company_id", profile.company_id).eq("user_id", user.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (payError || !payment) return NextResponse.json({ error: "No existe un pago pendiente para este plan. Vuelve a seleccionar el plan para generar la solicitud." }, { status: 409 });
    const amount = Number(payment.amount_clp);
    if (!Number.isSafeInteger(amount) || amount <= 0) return NextResponse.json({ error: "El importe del pago no es válido." }, { status: 409 });
    const metadata = payment.metadata && typeof payment.metadata === "object" ? payment.metadata as Record<string, unknown> : {};
    if (typeof metadata.flow_url === "string" && typeof metadata.flow_expires_at === "string" && new Date(metadata.flow_expires_at).getTime() > Date.now()) return NextResponse.json({ url: metadata.flow_url });
    if (!user.email) return NextResponse.json({ error: "Tu cuenta no tiene correo electrónico." }, { status: 400 });

    const params: Record<string, string> = {
      apiKey,
      commerceOrder: String(payment.id),
      subject: `BOOM POS - Plan ${sub.plan_code}`,
      currency: "CLP",
      amount: String(amount),
      email: user.email,
      urlConfirmation: `${appUrl}/api/flow/confirmation`,
      urlReturn: `${appUrl}/api/flow/return`,
    };
    const response = await fetch(`${apiBase}/payment/create`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, s: flowSign(params, secret) }), cache: "no-store" });
    const result = await response.json().catch(() => null);
    if (!response.ok || typeof result?.url !== "string" || typeof result?.token !== "string") return NextResponse.json({ error: result?.message || "Flow no pudo crear el pago." }, { status: 502 });

    const { error: saveError } = await admin.from("boom_pos_subscription_payments").update({ provider: "flow", provider_payment_id: result.token, metadata: { ...metadata, flow_order: String(result.flowOrder ?? ""), flow_url: result.url, flow_expires_at: new Date(Date.now() + 25 * 60 * 1000).toISOString() } }).eq("id", payment.id).eq("status", "pending");
    if (saveError) return NextResponse.json({ error: "Flow creó el pago, pero no se pudo guardar la referencia. Revisa el registro antes de reintentar." }, { status: 500 });
    return NextResponse.json({ url: result.url });
  } catch (error) {
    console.error("BOOM POS Flow create error", error);
    return NextResponse.json({ error: "No se pudo iniciar el pago." }, { status: 500 });
  }
}
