import { createClient } from "@/lib/supabase/server";

type HealthState = {
  label: string;
  tone: "ok" | "warn" | "error";
  detail: string;
};

export default async function Home() {
  const supabase = await createClient();
  const { error } = await supabase.from("companies").select("id").limit(1);

  let health: HealthState;

  if (!error) {
    health = {
      label: "CONSULTA AUTORIZADA",
      tone: "ok",
      detail: "Vercel puede consultar la tabla companies mediante Supabase."
    };
  } else if (error.code === "42501" || error.status === 401 || error.status === 403) {
    health = {
      label: "SUPABASE OK · ACCESO PROTEGIDO",
      tone: "warn",
      detail: "Supabase respondió correctamente, pero el acceso a companies está bloqueado por permisos/RLS. Esto es esperado antes de configurar Auth y sus políticas."
    };
  } else if (error.code === "42P01") {
    health = {
      label: "TABLA NO ENCONTRADA",
      tone: "error",
      detail: "Supabase respondió, pero la tabla companies no existe en el esquema esperado."
    };
  } else if (String(error.code ?? "").startsWith("08") || String(error.message).toLowerCase().includes("fetch")) {
    health = {
      label: "ERROR DE CONEXIÓN",
      tone: "error",
      detail: error.message
    };
  } else {
    health = {
      label: "RESPUESTA DE SUPABASE",
      tone: "warn",
      detail: `${error.code ? `Código ${error.code}: ` : ""}${error.message}`
    };
  }

  return (
    <main className="shell">
      <header className="header">
        <div>
          <div className="brand">Somos Software POS</div>
          <div className="muted">Sprint 0.1 · Health Check técnico</div>
        </div>
        <div className="badge">Supabase operativo</div>
      </header>

      <section className="grid">
        <div className="card">
          <div className="muted">Vercel → Next.js</div>
          <div className="status ok">OK</div>
          <div className="muted">La aplicación está ejecutándose en producción.</div>
        </div>

        <div className="card">
          <div className="muted">Supabase → PostgreSQL</div>
          <div className={`status ${health.tone}`}>{health.label}</div>
          <div className="muted">{health.detail}</div>
        </div>

        <div className="card">
          <div className="muted">Siguiente incremento</div>
          <div className="status">Auth + RLS</div>
          <div className="muted">Registro, sesión, empresa y políticas por compañía.</div>
        </div>
      </section>

      <section className="modules">
        {["Productos", "Inventario", "Ventas", "Caja", "Compras", "Proveedores", "Finanzas", "DTE / SII"].map((m) => (
          <div className="module" key={m}>
            <strong>{m}</strong>
            <div className="muted">Preparado</div>
          </div>
        ))}
      </section>

      <div className="footer">
        Sprint 0.1 · Somos Software · Health Check basado en códigos de PostgreSQL/PostgREST.
      </div>
    </main>
  );
}
