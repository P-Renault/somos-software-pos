import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { error } = await supabase.from("companies").select("id").limit(1);

  const connected = !error || !String(error.message).toLowerCase().includes("fetch");

  return (
    <main className="shell">
      <header className="header">
        <div>
          <div className="brand">Somos Software POS</div>
          <div className="muted">Sprint 0 · Fundación técnica</div>
        </div>
        <div className="badge">Supabase conectado</div>
      </header>

      <section className="grid">
        <div className="card">
          <div className="muted">Conexión</div>
          <div className={"status " + (connected ? "ok" : "warn")}>{connected ? "OK" : "REVISAR"}</div>
          <div className="muted">{error ? error.message : "La aplicación puede comunicarse con Supabase."}</div>
        </div>
        <div className="card">
          <div className="muted">Base de datos</div>
          <div className="status">PostgreSQL</div>
          <div className="muted">Esquema inicial del POS preparado.</div>
        </div>
        <div className="card">
          <div className="muted">Siguiente incremento</div>
          <div className="status">Auth</div>
          <div className="muted">Registro, inicio de sesión y perfil de empresa.</div>
        </div>
      </section>

      <section className="modules">
        {["Productos","Inventario","Ventas","Caja","Compras","Proveedores","Finanzas","DTE / SII"].map((m) => (
          <div className="module" key={m}><strong>{m}</strong><div className="muted">Preparado</div></div>
        ))}
      </section>

      <div className="footer">Sprint 0 · Somos Software · No contiene claves secretas de servidor.</div>
    </main>
  );
}
