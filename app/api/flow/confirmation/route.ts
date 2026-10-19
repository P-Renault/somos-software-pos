import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const sign = (params: Record<string, string>, secret: string) => createHmac("sha256", secret).update(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&")).digest("hex");

export async function POST(request: Request) {
  const apiKey = process.env.FLOW_API_KEY;
  const secret = process.env.FLOW_SECRET_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!apiKey || !secret || !serviceKey || !supabaseUrl) return NextResponse.json({ error: "Flow no configurado." }, { status: 503 });
  try {
    const incoming = new URLSearchParams(await request.text());
    const token = incoming.get("token") || "";
    if (!token) return NextResponse.json({ error: "Falta token de Flow." }, { status: 400 });
    const statusParams = { apiKey, token };
    const statusUrl = new URL(`${(process.env.FLOW_API_BASE_URL || "https://sandbox.flow.cl/api").replace(/\/$/, "")}/payment/getStatus`);
    statusUrl.search = new URLSearchParams({ ...statusParams, s: sign(statusParams, secret) }).toString();
    const verifiedResponse = await fetch(statusUrl, { cache: "no-store" });
    const verified = await verifiedResponse.json().catch(() => null) as { status?: number; commerceOrder?: string; flowOrder?: number | string; amount?: number; currency?: string } | null;
    if (!verifiedResponse.ok || !verified?.commerceOrder) return NextResponse.json({ error: "No se pudo verificar el pago directamente con Flow." }, { status: 502 });
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: payment, error } = await admin.from("boom_pos_subscription_payments").select("id,subscription_id,company_id,user_id,amount_clp,status").eq("id", verified.commerceOrder).eq("provider", "flow").maybeSingle();
    if (error || !payment) return NextResponse.json({ error: "La orden no corresponde a un pago BOOM POS." }, { status: 404 });
    if (Number(verified.amount) !== Number(payment.amount_clp) || (verified.currency && verified.currency !== "CLP")) return NextResponse.json({ error: "El monto o la moneda verificados no coinciden." }, { status: 409 });
    if (Number(verified.status) === 2) {
      const paidAt = new Date().toISOString();
      await admin.from("boom_pos_subscription_payments").update({ status: "confirmed", paid_at: paidAt, provider_payment_id: token, metadata: { verified_status: 2, flow_order: String(verified.flowOrder ?? "") } }).eq("id", payment.id).eq("status", "pending");
      const { data: subscription } = await admin.from("boom_pos_subscriptions").select("billing_type").eq("id", payment.subscription_id).maybeSingle();
      const periodEnd = subscription?.billing_type === "monthly" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
      await admin.from("boom_pos_subscriptions").update({ status: "active", payment_status: "confirmed", activated_at: paidAt, current_period_start: paidAt, current_period_end: periodEnd, provider: "flow", provider_transaction_id: String(verified.flowOrder ?? "") }).eq("id", payment.subscription_id).eq("status", "pending_payment");
    } else if ([3, 4].includes(Number(verified.status))) {
      await admin.from("boom_pos_subscription_payments").update({ status: "failed", metadata: { verified_status: Number(verified.status), flow_order: String(verified.flowOrder ?? "") } }).eq("id", payment.id).eq("status", "pending");
      await admin.from("boom_pos_subscriptions").update({ payment_status: "failed" }).eq("id", payment.subscription_id).eq("status", "pending_payment");
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Error procesando la confirmación de Flow." }, { status: 500 });
  }
}
