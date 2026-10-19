import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
function flowSignature(params: Record<string, string>, secret: string) {
  const payload = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export async function POST(request: Request) {
  const projectUrl = process.env.PROJECT_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.PROJECT_SERVICE_ROLE_KEY;
  const flowApiKey = process.env.FLOW_API_KEY;
  const flowSecret = process.env.FLOW_SECRET_KEY;
  const flowApiUrl = (process.env.FLOW_API_BASE_URL || process.env.FLOW_API_URL || "https://www.flow.cl/api").replace(/\/$/, "");
  if (!projectUrl || !serviceKey || !flowApiKey || !flowSecret) return NextResponse.json({ error: "Faltan secretos de configuración." }, { status: 503 });

  try {
    const contentType = request.headers.get("content-type") || "";
    let token = "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({})); token = typeof body.token === "string" ? body.token : "";
    } else {
      token = new URLSearchParams(await request.text()).get("token") || "";
    }
    if (!token || token.length > 500) return NextResponse.json({ error: "Token de Flow ausente o inválido." }, { status: 400 });

    const params = { apiKey: flowApiKey, token };
    const statusUrl = new URL(`${flowApiUrl}/payment/getStatus`);
    statusUrl.search = new URLSearchParams({ ...params, s: flowSignature(params, flowSecret) }).toString();
    const flowResponse = await fetch(statusUrl, { cache: "no-store" });
    const flow = await flowResponse.json().catch(() => null);
    if (!flowResponse.ok || !flow || flow.commerceOrder == null || flow.amount == null || flow.status == null) {
      return NextResponse.json({ error: "No se pudo verificar la transacción directamente con Flow." }, { status: 502 });
    }

    const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: payment, error: paymentError } = await admin.from("boom_pos_subscription_payments")
      .select("id,subscription_id,company_id,user_id,amount_clp,status,metadata")
      .eq("id", String(flow.commerceOrder)).eq("provider", "flow").maybeSingle();
    if (paymentError) return NextResponse.json({ error: "Error consultando el pago." }, { status: 500 });
    if (!payment) return NextResponse.json({ error: "Orden de BOOM POS no encontrada." }, { status: 404 });
    if (Number(flow.amount) !== Number(payment.amount_clp) || (flow.currency && String(flow.currency) !== "CLP")) {
      return NextResponse.json({ error: "Importe o moneda no coinciden." }, { status: 409 });
    }

    const flowStatus = Number(flow.status);
    if (flowStatus === 2) {
      if (payment.status === "confirmed") return NextResponse.json({ received: true, alreadyProcessed: true });
      if (payment.status !== "pending") return NextResponse.json({ received: true, ignored: true });
      const paidAt = new Date().toISOString();
      // Guardar el pago primero; el webhook no debe reactivar pagos ya procesados.
      const { data: updatedPayment, error: updateError } = await admin.from("boom_pos_subscription_payments").update({
        status: "confirmed", paid_at: paidAt, provider_payment_id: token,
        metadata: { ...(payment.metadata && typeof payment.metadata === "object" ? payment.metadata as Record<string, unknown> : {}), flow_order: String(flow.flowOrder ?? ""), verified_status: flowStatus, verified_at: paidAt },
      }).eq("id", payment.id).eq("status", "pending").select("id").maybeSingle();
      if (updateError) return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 500 });
      if (!updatedPayment) return NextResponse.json({ received: true, alreadyProcessed: true });

      const { data: subscription, error: subError } = await admin.from("boom_pos_subscriptions")
        .select("id,status").eq("id", payment.subscription_id).eq("company_id", payment.company_id).eq("user_id", payment.user_id).maybeSingle();
      if (subError || !subscription) {
        console.error("Pago confirmado; suscripción no encontrada", subError);
        return NextResponse.json({ received: true, paymentConfirmed: true, activationPendingReview: true });
      }
      if (subscription.status !== "active") {
        const { error: activateError } = await admin.from("boom_pos_subscriptions").update({
          status: "active", payment_status: "confirmed", activated_at: paidAt,
          provider: "flow", provider_transaction_id: String(flow.flowOrder ?? ""),
        }).eq("id", subscription.id).eq("company_id", payment.company_id).eq("user_id", payment.user_id).eq("status", "pending_payment");
        if (activateError) {
          console.error("Pago confirmado; activación pendiente", activateError);
          return NextResponse.json({ received: true, paymentConfirmed: true, activationPendingReview: true });
        }
      }
      return NextResponse.json({ received: true, paymentConfirmed: true });
    }

    if ([3, 4].includes(flowStatus) && payment.status === "pending") {
      const { error: failError } = await admin.from("boom_pos_subscription_payments").update({
        status: "failed", metadata: { ...(payment.metadata && typeof payment.metadata === "object" ? payment.metadata as Record<string, unknown> : {}), flow_order: String(flow.flowOrder ?? ""), verified_status: flowStatus, verified_at: new Date().toISOString() },
      }).eq("id", payment.id).eq("status", "pending");
      if (failError) return NextResponse.json({ error: "No se pudo registrar el resultado del pago." }, { status: 500 });
      return NextResponse.json({ received: true, paymentFailed: true });
    }
    return NextResponse.json({ received: true, paymentPending: true, flowStatus });
  } catch (error) {
    console.error("flow confirmation error", error);
    return NextResponse.json({ error: "Error procesando la confirmación." }, { status: 500 });
  }
}
