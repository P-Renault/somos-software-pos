import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: company } = profile?.company_id
    ? await supabase.from("companies").select("name, tax_id").eq("id", profile.company_id).maybeSingle()
    : { data: null };

  return (
    <main className="shell">
      <header className="header">
        <div><div className="brand">Somos Software POS</div><div className="muted">Sprint 0.2 · Auth + RLS</div></div>
        <form action="/api/logout" method="post"><button className="logout">Cerrar sesión</button></form>
      </header>
      <section className="grid">
        <div className="card"><div className="muted">Usuario autenticado</div><div className="status ok">OK</div><div className="muted">{user.email}</div></div>
        <div className="card"><div className="muted">Empresa</div><div className="status">{company?.name ?? "Sin empresa"}</div><div className="muted">RUT: {company?.tax_id ?? "No informado"}</div></div>
        <div className="card"><div className="muted">Perfil</div><div className="status">{profile?.role ?? "—"}</div><div className="muted">{profile?.full_name ?? "Nombre no informado"}</div></div>
      </section>
      {error && <div className="card auth-message">No se pudo leer el perfil: {error.message}</div>}
      <section className="modules">
        {["Productos","Inventario","Ventas","Caja","Compras","Proveedores","Finanzas","DTE / SII"].map(m=><div className="module" key={m}><strong>{m}</strong><div className="muted">Preparado</div></div>)}
      </section>
      <div className="footer">Sprint 0.2 · Auth + RLS · Aislamiento por company_id.</div>
    </main>
  );
}
