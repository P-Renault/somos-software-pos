"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Product={id:string;name:string;sale_price:number;stock:number;barcode:string|null;sku:string|null};
type Line={id:string;qty:number};
type Method="cash"|"debit"|"credit"|"transfer"|"credit_account"|"mixed";
type Props={companyId:string;onNotice?:(message:string)=>void};
type SaleRpcArgs={p_idempotency_key:string;p_items:{product_id:string;quantity:number}[];p_payment_method:Method;p_customer_name:string;p_customer_rut:string|null;p_document_type:number;p_cash_received:number;p_payments:any[]};
type PendingSale={companyId:string;args:SaleRpcArgs;customer:string;docType:number;createdAt:string};
const pendingStorageKey=(companyId:string)=>`boom-pos:pending-sale:${companyId}`;
function isPendingSale(value:unknown,companyId:string):value is PendingSale{
 if(!value||typeof value!=="object")return false;
 const p=value as Partial<PendingSale>;
 const a=p.args as Partial<SaleRpcArgs>|undefined;
 return p.companyId===companyId
  && typeof p.customer==="string"
  && Number.isInteger(p.docType)
  && typeof p.createdAt==="string"
  && !!a
  && typeof a.p_idempotency_key==="string"
  && a.p_idempotency_key.length>=8
  && Array.isArray(a.p_items)
  && a.p_items.length>0
  && a.p_items.every(i=>!!i&&typeof i.product_id==="string"&&i.product_id.length>0&&Number.isInteger(i.quantity)&&i.quantity>0)
  && ["cash","debit","credit","transfer","credit_account","mixed"].includes(String(a.p_payment_method))
  && typeof a.p_customer_name==="string"
  && (a.p_customer_rut===null||typeof a.p_customer_rut==="string")
  && Number.isInteger(a.p_document_type)
  && typeof a.p_cash_received==="number"&&Number.isFinite(a.p_cash_received)&&a.p_cash_received>=0
  && Array.isArray(a.p_payments);
}
const clp=(n:number)=>new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(n);

/** Panel de ventas integrado al RPC. Montar desde el shell existente con companyId={company.id}.
 * No sustituye por sí solo todos los demás módulos del pos-shell original. */
export default function PosShell({companyId,onNotice}:Props){
 const supabase=createClient();
 const [products,setProducts]=useState<Product[]>([]),[cart,setCart]=useState<Line[]>([]),[query,setQuery]=useState("");
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const [method,setMethod]=useState<Method>("cash"),[received,setReceived]=useState("");
 const [provider,setProvider]=useState("Transbank"),[operation,setOperation]=useState(""),[reference,setReference]=useState("");
 const [paymentStatus,setPaymentStatus]=useState<"pending"|"recorded"|"confirmed">("recorded");
 const [customer,setCustomer]=useState("Consumidor final"),[rut,setRut]=useState(""),[docType,setDocType]=useState(39);
 const [cashPart,setCashPart]=useState(""),[otherPart,setOtherPart]=useState(""),[otherMethod,setOtherMethod]=useState<"debit"|"credit"|"transfer">("debit");
 const [otherProvider,setOtherProvider]=useState("Transbank"),[otherOperation,setOtherOperation]=useState(""),[otherReference,setOtherReference]=useState("");
 const [receipt,setReceipt]=useState<any>(null),[idempotencyKey,setIdempotencyKey]=useState("");
 const [pendingSale,setPendingSale]=useState<PendingSale|null>(null),[restoredPending,setRestoredPending]=useState(false),[recoveryBlocked,setRecoveryBlocked]=useState(false);
 async function load(){if(!companyId){setError("No hay empresa asociada a la sesión.");return;}setLoading(true);setError("");const {data,error}=await supabase.from("products").select("id,name,sale_price,stock,barcode,sku,active").eq("company_id",companyId).eq("active",true).order("name");if(error)setError("No se pudo cargar catálogo: "+error.message);else setProducts((data??[]) as Product[]);setLoading(false);}
 useEffect(()=>{void load();},[companyId]);
 useEffect(()=>{
  if(!companyId)return;
  setRestoredPending(false);setRecoveryBlocked(false);
  try{
   const raw=window.localStorage.getItem(pendingStorageKey(companyId));
   if(raw){const parsed:unknown=JSON.parse(raw);if(isPendingSale(parsed,companyId)){setPendingSale(parsed);setIdempotencyKey(parsed.args.p_idempotency_key);setError("Hay una venta cuyo resultado debe confirmarse. Reintenta la misma solicitud; no registres otra venta hasta resolverla.");}else{setRecoveryBlocked(true);setError("La solicitud pendiente está incompleta o no coincide con esta empresa. No se enviará ni borrará automáticamente; revisa el estado de la venta en Supabase antes de continuar.");}}
  }catch{setRecoveryBlocked(true);setError("No se pudo recuperar la solicitud pendiente de venta. El registro de nuevas ventas queda bloqueado hasta revisar el estado en Supabase.");}
  finally{setRestoredPending(true);}
 },[companyId]);
 const lines=useMemo(()=>cart.map(c=>{const p=products.find(x=>x.id===c.id);return p?{...p,qty:c.qty,lineTotal:Number(p.sale_price)*c.qty}:null}).filter(Boolean) as (Product&{qty:number;lineTotal:number})[],[cart,products]);
 const total=lines.reduce((s,p)=>s+p.lineTotal,0),receivedN=Number(received||0),change=Math.max(0,receivedN-total),cashN=Number(cashPart||0),otherN=Number(otherPart||0);
 const filtered=products.filter(p=>`${p.name} ${p.barcode??""} ${p.sku??""} ${""}`.toLowerCase().includes(query.toLowerCase()));
 function add(p:Product){if(pendingSale)return;setIdempotencyKey("");setCart(old=>{const line=old.find(x=>x.id===p.id),qty=(line?.qty??0)+1;if(qty>p.stock){setError(`Stock insuficiente para ${p.name}. Disponible: ${p.stock}`);return old;}return line?old.map(x=>x.id===p.id?{...x,qty}:x):[...old,{id:p.id,qty:1}]});setError("");}
 function setQty(id:string,qty:number){if(pendingSale)return;const p=products.find(x=>x.id===id);if(!p)return;setIdempotencyKey("");if(qty>p.stock){setError(`Stock insuficiente. Disponible: ${p.stock}`);return;}setCart(old=>qty<1?old.filter(x=>x.id!==id):old.map(x=>x.id===id?{...x,qty}:x));}
 async function submitPending(request:PendingSale){
  if(saving)return;
  if(!isPendingSale(request,companyId)||request.companyId!==companyId){setRecoveryBlocked(true);setError("La solicitud no supera la validación de integridad o pertenece a otra empresa. No se enviará.");return;}
  setSaving(true);setError("");
  try{
   const {data,error}=await supabase.rpc("complete_sale_atomic",request.args);
   if(error)throw new Error(error.message);
   if(!data?.ok||!data?.sale_id)throw new Error("Supabase no confirmó el resultado de la solicitud.");
   setReceipt({...data,customer:request.customer,docType:request.docType});
   try{
    const storedRaw=window.localStorage.getItem(pendingStorageKey(request.companyId));
    if(storedRaw){const stored:unknown=JSON.parse(storedRaw);if(isPendingSale(stored,request.companyId)&&stored.args.p_idempotency_key===request.args.p_idempotency_key)window.localStorage.removeItem(pendingStorageKey(request.companyId));}
   }catch{/* La venta ya fue confirmada por el servidor; no convertir un fallo de limpieza local en fallo de venta. */}
   setPendingSale(null);setRecoveryBlocked(false);setIdempotencyKey("");setCart([]);setReceived("");setOperation("");setReference("");setCashPart("");setOtherPart("");setOtherOperation("");setOtherReference("");
   await load();
   onNotice?.(data.idempotent_replay?`Solicitud recuperada: venta #${data.sale_number} ya estaba registrada.`:`Venta #${data.sale_number} registrada. DTE oficial pendiente de emisión.`);
  }catch(e){setError("No se pudo confirmar el resultado de la venta. La solicitud quedó guardada para reintentar con la misma clave. No crees otra venta. Detalle: "+(e instanceof Error?e.message:"error inesperado"));}
  finally{setSaving(false);}
 }
 async function checkout(){
  if(!lines.length||saving||pendingSale||recoveryBlocked||!restoredPending)return;
  setError("");
  if(method==="cash"&&receivedN<total){setError("El efectivo recibido debe cubrir el total.");return;}
  if((method==="debit"||method==="credit")&&(!provider.trim()||!operation.trim())){setError("Ingresa proveedor del terminal y número de operación.");return;}
  if(method==="transfer"&&!reference.trim()&&!operation.trim()){setError("Ingresa referencia o código de transferencia.");return;}
  if(method==="mixed"&&Math.round((cashN+otherN)*100)!==Math.round(total*100)){setError("La suma del pago mixto debe ser igual al total.");return;}
  if(method==="mixed"&&otherN>0&&(otherMethod!=="transfer"&&!otherOperation.trim())){setError("Ingresa número de operación para el pago con tarjeta.");return;}
  if(method==="mixed"&&otherN>0&&otherMethod==="transfer"&&!otherReference.trim()&&!otherOperation.trim()){setError("Ingresa referencia para la transferencia.");return;}
  let payments:any[]=[];
  if(["debit","credit","transfer"].includes(method))payments=[{method,amount:total,provider:provider.trim()||null,operation_number:operation.trim()||null,bank_reference:reference.trim()||null,status:paymentStatus,notes:"Registro manual; no verifica automáticamente terminal o banco."}];
  else if(method==="mixed"){if(cashN>0)payments.push({method:"cash",amount:cashN,amount_received:cashN,status:"confirmed"});if(otherN>0)payments.push({method:otherMethod,amount:otherN,provider:otherProvider.trim()||null,operation_number:otherOperation.trim()||null,bank_reference:otherReference.trim()||null,status:paymentStatus});}
  const requestKey=crypto.randomUUID();
  const request:PendingSale={companyId,args:{p_idempotency_key:requestKey,p_items:lines.map(p=>({product_id:p.id,quantity:p.qty})),p_payment_method:method,p_customer_name:customer.trim()||"Consumidor final",p_customer_rut:rut.trim()||null,p_document_type:docType,p_cash_received:method==="cash"?receivedN:0,p_payments:payments},customer,docType,createdAt:new Date().toISOString()};
  try{window.localStorage.setItem(pendingStorageKey(companyId),JSON.stringify(request));}catch{setError("No se pudo guardar de forma segura la solicitud pendiente en este dispositivo. No se envió la venta; libera espacio del navegador e inténtalo de nuevo.");return;}
  setPendingSale(request);setIdempotencyKey(requestKey);await submitPending(request);
 }

 return <main className="boom-sales-integrated"><header className="bsi-head"><div><small>BOOM POS / Ventas</small><h1>Ventas</h1><p>Catálogo, cobro y registro transaccional</p></div><button onClick={()=>void load()} disabled={loading||!!pendingSale}>↻ Actualizar catálogo</button></header>{error&&<div role="alert" className="bsi-error">{error}{!pendingSale&&<button onClick={()=>setError("")}>×</button>}</div>}{pendingSale&&<section className="bsi-panel bsi-pending" role="status"><h2>Solicitud de venta pendiente</h2><p>Clave: <code>{pendingSale.args.p_idempotency_key}</code></p><p>Esta solicitud está congelada. Reintentar reutiliza exactamente la misma clave y los mismos parámetros; no edites ni registres otra venta hasta resolverla.</p><button className="bsi-checkout" disabled={saving} onClick={()=>void submitPending(pendingSale)}>{saving?"Verificando resultado…":"Reintentar / recuperar resultado de esta venta"}</button></section>}<div className="bsi-layout"><section className="bsi-panel"><h2>Productos</h2><input disabled={!!pendingSale} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar producto, SKU o código de barras"/>{loading?<p>Cargando catálogo…</p>:<div className="bsi-products">{filtered.map(p=><button key={p.id} className="bsi-product" disabled={!!pendingSale||p.stock<=0} onClick={()=>add(p)}><b>{p.name}</b><strong>{clp(p.sale_price)}</strong><small>Stock: {p.stock}</small><span>＋ Agregar</span></button>)}</div>}</section><section className="bsi-panel"><div className="bsi-row"><h2>Venta actual</h2><button disabled={!!pendingSale} onClick={()=>{setCart([]);setIdempotencyKey("");}}>Limpiar</button></div>{!lines.length?<p>Agrega productos del catálogo.</p>:lines.map(p=><div className="bsi-cart-line" key={p.id}><div><b>{p.name}</b><small>{clp(p.sale_price)} × {p.qty}</small></div><button disabled={!!pendingSale} onClick={()=>setQty(p.id,p.qty-1)}>−</button><span>{p.qty}</span><button disabled={!!pendingSale} onClick={()=>setQty(p.id,p.qty+1)}>＋</button><b>{clp(p.lineTotal)}</b></div>)}<label>Cliente<input disabled={!!pendingSale} value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Consumidor final"/></label><label>RUT cliente (opcional)<input disabled={!!pendingSale} value={rut} onChange={e=>setRut(e.target.value)} placeholder="12.345.678-5"/></label><label>Documento solicitado<select disabled={!!pendingSale} value={docType} onChange={e=>setDocType(Number(e.target.value))}><option value={39}>Boleta electrónica afecta (39)</option><option value={41}>Boleta exenta (41)</option><option value={33}>Factura electrónica afecta (33)</option><option value={34}>Factura exenta (34)</option></select></label>{(docType===33||docType===34)&&<p className="bsi-hint">Factura: completa y valida los datos tributarios del receptor. Este flujo no emite DTE oficial.</p>}<div className="bsi-total"><span>Total (precio de venta, IVA incluido según configuración)</span><strong>{clp(total)}</strong></div><label>Medio de pago<select disabled={!!pendingSale} value={method} onChange={e=>setMethod(e.target.value as Method)}><option value="cash">Efectivo</option><option value="debit">Tarjeta débito</option><option value="credit">Tarjeta crédito</option><option value="transfer">Transferencia</option><option value="mixed">Pago mixto</option><option value="credit_account">Crédito al cliente</option></select></label>{method==="cash"&&<div className="bsi-payment-box"><label>Efectivo recibido<input disabled={!!pendingSale} type="number" min={total} step="1" value={received} onChange={e=>setReceived(e.target.value)} placeholder="Ej. 5000"/></label><div className="bsi-quick-cash">{[total,5000,10000,20000].filter((v,i,a)=>v>0&&a.indexOf(v)===i).map(v=><button key={v} type="button" disabled={!!pendingSale} onClick={()=>setReceived(String(Math.ceil(v)))}>{clp(v)}</button>)}</div><div className="bsi-change"><span>Vuelto</span><strong>{clp(change)}</strong></div></div>}{(method==="debit"||method==="credit"||method==="transfer")&&<div className="bsi-payment-box">{method!=="transfer"?<><label>Proveedor / adquirente<select disabled={!!pendingSale} value={provider} onChange={e=>setProvider(e.target.value)}><option>Transbank</option><option>Mercado Pago</option><option>Getnet</option><option>Compraquí</option><option>Otro</option></select></label><label>N.º operación / autorización<input disabled={!!pendingSale} value={operation} onChange={e=>setOperation(e.target.value)} placeholder="Código entregado por el POS"/></label></>:<><label>Banco / entidad receptora<input disabled={!!pendingSale} value={provider} onChange={e=>setProvider(e.target.value)} placeholder="Banco receptor"/></label><label>Referencia transferencia<input disabled={!!pendingSale} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Código o referencia"/></label></>}<label>Estado de verificación<select disabled={!!pendingSale} value={paymentStatus} onChange={e=>setPaymentStatus(e.target.value as any)}><option value="pending">Pendiente de verificar</option><option value="recorded">Registrado manualmente</option><option value="confirmed">Confirmado por operador</option></select></label><p className="bsi-hint">El registro manual no consulta ni confirma automáticamente el terminal o banco.</p></div>}{method==="mixed"&&<div className="bsi-payment-box"><label>Parte en efectivo<input disabled={!!pendingSale} type="number" min="0" value={cashPart} onChange={e=>setCashPart(e.target.value)}/></label><label>Segundo medio<select disabled={!!pendingSale} value={otherMethod} onChange={e=>setOtherMethod(e.target.value as any)}><option value="debit">Débito</option><option value="credit">Crédito</option><option value="transfer">Transferencia</option></select></label><label>Monto del segundo medio<input disabled={!!pendingSale} type="number" min="0" value={otherPart} onChange={e=>setOtherPart(e.target.value)}/></label><label>Proveedor<input disabled={!!pendingSale} value={otherProvider} onChange={e=>setOtherProvider(e.target.value)}/></label>{otherMethod!=="transfer"?<label>N.º operación<input disabled={!!pendingSale} value={otherOperation} onChange={e=>setOtherOperation(e.target.value)}/></label>:<label>Referencia bancaria<input disabled={!!pendingSale} value={otherReference} onChange={e=>setOtherReference(e.target.value)}/></label>}<p className="bsi-hint">Distribución: {clp(cashN+otherN)} / {clp(total)}</p></div>}{method==="credit_account"&&<p className="bsi-hint">Se registra como venta a crédito; este paquete no crea un plan de cobranza.</p>}<button className="bsi-checkout" disabled={!lines.length||saving||!companyId||!!pendingSale||recoveryBlocked||!restoredPending} onClick={()=>void checkout()}>{saving?"Registrando venta…":`Registrar venta · ${clp(total)}`}</button><small className="bsi-hint">La venta y el descuento de stock se ejecutan en una transacción SQL. La emisión DTE y la integración real del POS bancario son independientes.</small></section></div>{receipt&&<section className="bsi-panel"><h2>Última venta registrada</h2><p>Venta #{receipt.sale_number} · {clp(receipt.total_amount)}</p><p>Vuelto: {clp(receipt.change_due??0)} · Documento solicitado: DTE {receipt.docType}, pendiente de emisión oficial.</p><code>{receipt.sale_id}</code></section>}<style jsx>{`.boom-sales-integrated{display:grid;gap:16px;color:#202433;font:14px system-ui,sans-serif}.bsi-head,.bsi-row{display:flex;justify-content:space-between;align-items:center;gap:12px}.bsi-head h1{margin:4px 0;font-size:26px}.bsi-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.9fr);gap:16px;align-items:start}.bsi-panel{background:#fff;border:1px solid #e6e8ee;border-radius:14px;padding:16px;min-width:0}.bsi-panel h2{font-size:17px;margin:0 0 12px}input,select,button{font:inherit;border:1px solid #d9dce5;border-radius:8px;padding:10px;background:#fff;color:inherit;max-width:100%}label{display:grid;gap:6px;margin:12px 0;font-weight:600}label input,label select{width:100%;box-sizing:border-box}.bsi-products{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-top:12px}.bsi-product{display:grid;gap:8px;text-align:left;cursor:pointer}.bsi-product span{color:#e85a13}.bsi-product small,.bsi-cart-line small{color:#73798a}.bsi-cart-line{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto auto;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid #eef0f4}.bsi-cart-line>div{display:grid;gap:4px;min-width:0}.bsi-total{background:#fff3e9;border-radius:10px;padding:14px;display:flex;justify-content:space-between;gap:12px;margin:14px 0}.bsi-total strong{font-size:22px;color:#e84c16}.bsi-payment-box{border:1px solid #eceef3;background:#fafbfc;border-radius:10px;padding:10px;margin:10px 0}.bsi-quick-cash{display:flex;gap:6px;flex-wrap:wrap}.bsi-change{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-weight:700}.bsi-change strong{font-size:22px;color:#16804a}.bsi-checkout{width:100%;background:linear-gradient(90deg,#ff9800,#f04424);color:white;font-weight:700;border:0;margin:12px 0;cursor:pointer}.bsi-checkout:disabled{opacity:.5;cursor:not-allowed}button:disabled,input:disabled,select:disabled{opacity:.65;cursor:not-allowed}.bsi-pending{border-color:#e5a04b;background:#fffaf2}.bsi-hint{font-size:12px;color:#6e7484;line-height:1.5}.bsi-error{background:#fff0ed;border:1px solid #ffb8a9;border-radius:10px;padding:12px;display:flex;justify-content:space-between}@media(max-width:850px){.bsi-layout{grid-template-columns:1fr}.bsi-head{align-items:flex-start;flex-wrap:wrap}.bsi-cart-line{grid-template-columns:minmax(0,1fr) auto auto auto}.bsi-cart-line>b{grid-column:2/-1;text-align:right}}`}</style></main>;
}
