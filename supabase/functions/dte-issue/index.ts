import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * BOOM POS — dte-issue
 * Test de conexión: valida JWT, perfil y lectura de configuración.
 * No emite, firma ni transmite documentos oficiales al SII.
 * Mantener verify_jwt habilitado en la configuración de la función.
 */

function respond(status: number, body: Record<string, unknown>): Response {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  // Preflight CORS: responder antes de procesar el POST.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond(405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return respond(401, { ok: false, code: "AUTH_REQUIRED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    return respond(503, { ok: false, code: "SERVER_NOT_CONFIGURED" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      return respond(401, { ok: false, code: "INVALID_SESSION" });
    }

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return respond(400, { ok: false, code: "INVALID_BODY" });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return respond(400, { ok: false, code: "INVALID_JSON" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("DTE profile lookup failed", profileError);
      return respond(503, { ok: false, code: "PROFILE_LOOKUP_FAILED" });
    }

    if (!profile?.company_id) {
      return respond(403, { ok: false, code: "COMPANY_REQUIRED" });
    }

    const companyId = profile.company_id;

    const { data: settings, error: settingsError } = await supabase
      .from("dte_company_settings")
      .select(
        "id,company_id,environment,issuer_rut,legal_name,business_activity," +
        "business_address,commune,city,resolution_date,resolution_number," +
        "certificate_configured,caf_configured,enabled",
      )
      .eq("company_id", companyId)
      .maybeSingle();

    if (settingsError) {
      console.error("DTE settings lookup failed", settingsError);
      return respond(503, { ok: false, code: "DTE_SETTINGS_UNAVAILABLE" });
    }

    const missing: string[] = [];
    if (!settings) {
      missing.push("dte_company_settings");
    } else {
      if (!settings.issuer_rut) missing.push("issuer_rut");
      if (!settings.legal_name) missing.push("legal_name");
      if (settings.enabled !== true) missing.push("issuer_not_enabled");
      if (settings.certificate_configured !== true) {
        missing.push("certificate_not_configured");
      }
      if (settings.caf_configured !== true) {
        missing.push("caf_not_configured");
      }
    }

    // Este es el contrato que invoca el botón "Probar conexión".
    // Comprueba acceso a la función y lectura de configuración; no prueba el SII.
    if (body.action === "test_connection") {
      return respond(200, {
        ok: true,
        connected: true,
        adapter_ready: false,
        environment: settings?.environment ?? "certification",
        missing,
        message:
          "Conexión con la función y la configuración DTE correcta. " +
          "La conexión oficial al SII y el adaptador de emisión todavía " +
          "no están implementados; no se emitió ningún documento.",
      });
    }

    const documentType = Number(body.document_type);
    if (![33, 34, 39, 41].includes(documentType)) {
      return respond(400, {
        ok: false,
        code: "UNSUPPORTED_DOCUMENT_TYPE",
        allowed_document_types: [33, 34, 39, 41],
      });
    }

    const idempotencyKey = String(
      req.headers.get("Idempotency-Key") ?? body.idempotency_key ?? "",
    );
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(idempotencyKey)) {
      return respond(400, { ok: false, code: "IDEMPOTENCY_KEY_REQUIRED" });
    }

    const { data: existing, error: existingError } = await supabase
      .from("dte_issuance_jobs")
      .select("id,status,environment,document_type,folio,sii_track_id")
      .eq("company_id", companyId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingError) {
      console.error("DTE job lookup failed", existingError);
      return respond(503, { ok: false, code: "DTE_STORAGE_UNAVAILABLE" });
    }

    if (existing) {
      return respond(200, {
        ok: true,
        reused: true,
        job: existing,
        message: "Se recuperó la solicitud existente.",
      });
    }

    // Bloqueo explícito: no crear registros que aparenten ser emisiones reales.
    return respond(409, {
      ok: false,
      code: "SII_ADAPTER_NOT_READY",
      environment: settings?.environment ?? "certification",
      document_type: documentType,
      missing,
      message:
        "El adaptador oficial del SII aún no está implementado. " +
        "No se generó ni transmitió ningún documento tributario.",
    });
  } catch (error) {
    console.error("dte-issue internal error", error);
    return respond(500, { ok: false, code: "INTERNAL_ERROR" });
  }
});
