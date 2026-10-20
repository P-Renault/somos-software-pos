import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
function flowSign(params: Record<string,string>, secret:string) { return createHmac("sha256",secret).update(Object.keys(params).sort().map(k=>`${k}${params[k]}`).join("")).digest("hex"); }
export async function GET(request: Request) {
 const incoming=new URL(request.url); const token=incoming.searchParams.get("token");
 const appUrl=(process.env.BOOM_POS_APP_URL||incoming.origin).replace(/\/$/,"");
 const destination=new URL("/",appUrl);
 let result="pending";
 try {
  const apiKey=process.env.FLOW_API_KEY, secret=process.env.FLOW_SECRET_KEY;
  const apiBase=(process.env.FLOW_API_BASE_URL||process.env.FLOW_API_URL||"https://www.flow.cl/api").replace(/\/$/,"");
  if(token&&apiKey&&secret){
   const params={apiKey,token}; const statusUrl=new URL(`${apiBase}/payment/getStatus`); statusUrl.search=new URLSearchParams({...params,s:flowSign(params,secret)}).toString();
   const response=await fetch(statusUrl,{cache:"no-store"}); const flow=await response.json().catch(()=>null);
   if(response.ok&&flow){ const status=Number(flow.status); if(status===2) result="approved"; else if([3,4].includes(status)) result="rejected"; }
  }
 } catch(error){ console.error("BOOM POS Flow return verification error",error); }
 destination.searchParams.set("payment_result",result);
 destination.searchParams.set("payment_provider","flow");
 return NextResponse.redirect(destination,303);
}
