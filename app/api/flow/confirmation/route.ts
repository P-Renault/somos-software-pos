import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
function flowSign(params: Record<string,string>, secret:string) { return createHmac("sha256",secret).update(Object.keys(params).sort().map(k=>`${k}${params[k]}`).join("")).digest("hex"); }
export async function POST(request: Request) {
 try {
  const projectUrl=process.env.PROJECT_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.PROJECT_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey=process.env.FLOW_API_KEY, secret=process.env.FLOW_SECRET_KEY;
  const apiBase=(process.env.FLOW_API_BASE_URL||process.env.FLOW_API_URL||"https://www.flow.cl/api").replace(/\/$/,"");
  if(!projectUrl||!serviceKey||!apiKey||!secret) return NextResponse.json({error:"Configuración de Flow incompleta."},{status:503});
  const form=new URLSearchParams(await request.text()); const token=form.get("token");
  if(!token||token.length>500) return NextResponse.json({error:"Token de Flow ausente o inválido."},{status:400});
  const params={apiKey,token}; const url=new URL(`${apiBase}/payment/getStatus`); url.search=new URLSearchParams({...params,s:flowSign(params,secret)}).toString();
  const flowResponse=await fetch(url,{cache:"no-store"}); const flow=await flowResponse.json().catch(()=>null);
  if(!flowResponse.ok||!flow||flow.commerceOrder==null||flow.amount==null||flow.status==null) return NextResponse.json({error:"No se pudo verificar el pago directamente con Flow."},{status:502});
  const admin=createClient(projectUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:payment,error}=await admin.from("boom_pos_subscription_payments").select("id,subscription_id,company_id,user_id,amount_clp,status").eq("id",String(flow.commerceOrder)).eq("provider","flow").maybeSingle();
  if(error||!payment) return NextResponse.json({error:"Orden de pago BOOM POS no encontrada."},{status:404});
  if(Number(flow.amount)!==Number(payment.amount_clp)||(flow.currency&&String(flow.currency)!=="CLP")) return NextResponse.json({error:"El importe o moneda no coincide con la orden."},{status:409});
  const status=Number(flow.status); const now=new Date().toISOString();
  if(status===2){
   if(payment.status!=="confirmed") {
    const {data:updated,error:updateError}=await admin.from("boom_pos_subscription_payments").update({status:"confirmed",paid_at:now,provider_payment_id:token,metadata:{verified_status:status,flow_order:String(flow.flowOrder??""),verified_at:now}}).eq("id",payment.id).eq("status","pending").select("id").maybeSingle();
    if(updateError) return NextResponse.json({error:"No se pudo guardar el pago confirmado."},{status:500});
    if(updated){
     const {data:sub,error:subError}=await admin.from("boom_pos_subscriptions").select("id,status,billing_type").eq("id",payment.subscription_id).eq("company_id",payment.company_id).eq("user_id",payment.user_id).maybeSingle();
     if(subError||!sub) return NextResponse.json({received:true,paymentConfirmed:true,activationPendingReview:true});
     if(sub.status!=="active") {
      const periodEnd=sub.billing_type==="monthly"?new Date(Date.now()+30*86400000).toISOString():null;
      const {error:activateError}=await admin.from("boom_pos_subscriptions").update({status:"active",payment_status:"confirmed",activated_at:now,current_period_start:now,current_period_end:periodEnd,provider:"flow",provider_transaction_id:String(flow.flowOrder??"")}).eq("id",sub.id).eq("status","pending_payment");
      if(activateError) return NextResponse.json({received:true,paymentConfirmed:true,activationPendingReview:true});
     }
    }
   }
   return NextResponse.json({received:true,paymentStatus:"approved"});
  }
  if([3,4].includes(status)&&payment.status==="pending") {
   const {error:updateError}=await admin.from("boom_pos_subscription_payments").update({status:"failed",metadata:{verified_status:status,flow_order:String(flow.flowOrder??""),verified_at:now}}).eq("id",payment.id).eq("status","pending");
   if(updateError) return NextResponse.json({error:"No se pudo registrar el rechazo."},{status:500});
   await admin.from("boom_pos_subscriptions").update({payment_status:"failed"}).eq("id",payment.subscription_id).eq("company_id",payment.company_id).eq("status","pending_payment");
   return NextResponse.json({received:true,paymentStatus:"rejected"});
  }
  return NextResponse.json({received:true,paymentStatus:"pending",flowStatus:status});
 } catch(error){ console.error("BOOM POS Flow confirmation error",error); return NextResponse.json({error:"Error procesando confirmación de Flow."},{status:500}); }
}
