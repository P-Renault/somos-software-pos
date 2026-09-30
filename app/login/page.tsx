"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else window.location.assign("/");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, company_name: companyName, tax_id: taxId } }
      });
      if (error) setMessage(error.message);
      else if (data.session) window.location.assign("/");
      else setMessage("Cuenta creada. Revisa tu correo si Supabase tiene activada la confirmación de email.");
    }

    setLoading(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand">Somos Software POS</div>
        <h1>{mode === "login" ? "Ingresar al sistema" : "Crear empresa"}</h1>
        <p className="muted">Sprint 0.2 · Autenticación y aislamiento por empresa</p>

        <form onSubmit={submit} className="auth-form">
          {mode === "signup" && <>
            <label>Nombre completo<input value={fullName} onChange={e=>setFullName(e.target.value)} required /></label>
            <label>Empresa<input value={companyName} onChange={e=>setCompanyName(e.target.value)} required /></label>
            <label>RUT empresa<input value={taxId} onChange={e=>setTaxId(e.target.value)} /></label>
          </>}
          <label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
          <label>Contraseña<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required /></label>
          <button disabled={loading}>{loading ? "Procesando…" : mode === "login" ? "Ingresar" : "Crear cuenta"}</button>
        </form>

        {message && <div className="auth-message">{message}</div>}
        <button className="secondary" onClick={() => {setMode(mode === "login" ? "signup" : "login");setMessage("");}}>
          {mode === "login" ? "Crear una cuenta nueva" : "Ya tengo una cuenta"}
        </button>
      </section>
    </main>
  );
}
