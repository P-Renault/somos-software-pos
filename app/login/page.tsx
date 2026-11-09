"use client";
import { FormEvent,useEffect,useState } from "react";
import { createClient } from "@/lib/supabase/client";

function normalizeRut(value:string){return value.replace(/[^0-9kK]/g,"").toUpperCase();}
function isValidRut(value:string){
  const rut=normalizeRut(value);
  if(rut.length<2)return false;
  const body=rut.slice(0,-1),dv=rut.slice(-1);
  if(!/^\d+$/.test(body))return false;
  let sum=0,multiplier=2;
  for(let i=body.length-1;i>=0;i--){sum+=Number(body[i])*multiplier;multiplier=multiplier===7?2:multiplier+1;}
  const remainder=11-(sum%11);
  const expected=remainder===11?"0":remainder===10?"K":String(remainder);
  return dv===expected;
}


type PromoIconName = "sales" | "inventory" | "clients" | "billing" | "reports" | "finance";

function PromoModuleIcon({ name }: { name: PromoIconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  let shape;
  switch (name) {
    case "sales":
      shape = <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2.5 3h2l2.7 12.2a2 2 0 0 0 2 1.6h9.5a2 2 0 0 0 1.9-1.4L22 8H6" /></>;
      break;
    case "inventory":
      shape = <><path d="m3 7.5 9-4.5 9 4.5v9L12 21l-9-4.5v-9Z" /><path d="m3 7.5 9 4.5 9-4.5M12 12v9" /></>;
      break;
    case "clients":
      shape = <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20v-1.5a6.5 6.5 0 0 1 13 0V20zM16 5.2a3.5 3.5 0 0 1 0 6.6M18 14a5 5 0 0 1 3.5 4.8V20h-3" /></>;
      break;
    case "billing":
      shape = <><path d="M6 2.5h9l4 4V21H6z" /><path d="M15 2.5v5h4M9 12h7M9 16h7" /></>;
      break;
    case "reports":
      shape = <><path d="M3 3h18v18H3z" /><path d="M7 17v-5M12 17V7M17 17v-8" /></>;
      break;
    case "finance":
      shape = <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 2 6-7M15 6h5v5" /></>;
      break;
  }

  return <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true" {...common}>{shape}</svg>;
}

export default function LoginPage(){const supabase=createClient();const [mode,setMode]=useState<"login"|"signup"|"reset">("login"),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[fullName,setFullName]=useState(""),[companyName,setCompanyName]=useState(""),[taxId,setTaxId]=useState(""),[userTaxId,setUserTaxId]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(false);
useEffect(()=>{if(new URLSearchParams(window.location.search).get("error")==="confirmation_failed")setMessage("No fue posible confirmar la cuenta. Solicita un nuevo correo de confirmación.");},[]);
async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setMessage("");if(mode==="signup"&&(!isValidRut(taxId)||!isValidRut(userTaxId))){setMessage("Ingresa un RUT válido para la empresa y para el usuario responsable.");return;}setLoading(true);if(mode==="login"){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setMessage(error.message);else window.location.assign("/gestion");}else if(mode==="reset"){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/auth/confirm`});setMessage(error?error.message:"Si el correo está registrado, recibirás instrucciones.");}else{const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${window.location.origin}/auth/confirm`,data:{full_name:fullName,company_name:companyName,tax_id:taxId,user_tax_id:userTaxId}}});if(error)setMessage(error.message);else if(data.session)window.location.assign("/gestion");else setMessage("Cuenta creada. Revisa tu correo para confirmar la cuenta antes de ingresar.");}setLoading(false);}
return <main className="login-page"><section className="login-promo"><div className="login-logo"><span className="logo-word">B<span>OO</span>M</span><span className="logo-pos">POS</span></div><div className="promo-copy"><span className="promo-kicker">GESTIÓN COMERCIAL INTELIGENTE</span><h1>Tu negocio,<br/>en <em>un solo sistema.</em></h1><p>Vende, controla, factura y haz crecer tu negocio desde cualquier lugar.</p><div className="promo-modules">{([
{name:"Ventas",icon:"sales"},
{name:"Inventario",icon:"inventory"},
{name:"Clientes",icon:"clients"},
{name:"Facturación",icon:"billing"},
{name:"Reportes",icon:"reports"},
{name:"Finanzas",icon:"finance"}
] as {name:string;icon:PromoIconName}[]).map(item=><div key={item.name}><span><PromoModuleIcon name={item.icon}/></span><small>{item.name}</small></div>)}</div></div><div className="promo-bottom"><span>☁ 100% en la nube</span><span>◇ Seguro y confiable</span><span>⟳ Siempre actualizado</span><span>♧ Soporte continuo</span></div></section><section className="login-side"><div className="language">🇨🇱 Español⌄</div><div className="login-card"><div className="login-brand"><div className="logo-lockup"><span className="logo-word">B<span>OO</span>M</span><span className="logo-pos">POS</span></div></div><h2>{mode==="login"?"Bienvenido nuevamente":mode==="signup"?"Crea tu cuenta BOOM POS":"Recuperar contraseña"}</h2><p className="login-subtitle">{mode==="login"?"Ingresa a tu cuenta para continuar":mode==="signup"?"Comienza a gestionar tu negocio":"Te enviaremos instrucciones a tu correo"}</p><form onSubmit={submit} className="login-form">{mode==="signup"&&<><label>Nombre completo<input value={fullName} onChange={e=>setFullName(e.target.value)} required placeholder="Tu nombre"/></label><label>Nombre de la empresa<input value={companyName} onChange={e=>setCompanyName(e.target.value)} required placeholder="Nombre comercial"/></label><label>RUT de la empresa<input value={taxId} onChange={e=>setTaxId(e.target.value.toUpperCase())} placeholder="76.123.456-7" autoComplete="organization" required/></label><label>RUT del usuario responsable<input value={userTaxId} onChange={e=>setUserTaxId(e.target.value.toUpperCase())} placeholder="12.345.678-9" autoComplete="off" required/></label></>}<label>Correo electrónico<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="tu@correo.cl"/></label>{mode!=="reset"&&<label>Contraseña<input type="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength={6} value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Mínimo 6 caracteres"/></label>}{mode==="login"&&<button type="button" className="forgot" onClick={()=>{setMode("reset");setMessage("");}}>¿Olvidaste tu contraseña?</button>}<button className="login-submit" disabled={loading}>{loading?"Procesando…":mode==="login"?"→ Iniciar sesión":mode==="signup"?"Crear cuenta":"Enviar instrucciones"}</button></form>{message&&<div className="auth-message">{message}</div>}<div className="login-divider"><span/> o continúa con <span/></div><div className="oauth-row"><button disabled>Google · Próximamente</button><button disabled>Microsoft · Próximamente</button></div><button className="signup-promo" onClick={()=>{setMode(mode==="login"?"signup":"login");setMessage("");}}><span>▣</span><span><b>{mode==="login"?"¿Aún no tienes una cuenta?":"¿Ya tienes una cuenta?"}</b><small>{mode==="login"?"Empieza hoy con BOOM POS":"Vuelve a iniciar sesión"}</small></span><strong>›</strong></button><footer className="login-footer">Términos de uso　|　Política de privacidad　|　Soporte<br/><br/>BOOM POS v1.0.0　|　Somos Software　|　Chile</footer></div></section></main>}
