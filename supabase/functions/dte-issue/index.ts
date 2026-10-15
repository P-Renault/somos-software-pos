import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * BOOM POS — dte-issue
 * Fase actual: validación autenticada y prevalidación persistente.
 * NO emite XML oficial, NO firma, NO reserva CAF/folios, NO transmite al SII.
 * Mantener verify_jwt habilitado en Supabase.
 */

function json(status: number, body: Record<string, unknown>): Response {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json(401, { ok: false, code: "AUTH_REQUIRED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    return json(503, { ok: false, code: "SERVER_NOT_CONFIGURED" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      return json(401, { ok: false, code: "INVALID_SESSION" });
    }

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json(400, { ok: false, code: "INVALID_BODY" });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return json(400, { ok: false, code: "INVALID_JSON" });
    }

    const documentType = Number(body.document_type);
    if (![33, 34, 39, 41].includes(documentType)) {
      return json(400, {
        ok: false,
        code: "UNSUPPORTED_DOCUMENT_TYPE",
        allowed_document_types: [33, 34, 39, 41],
      });
    }

    const rawKey = String(
      req.headers.get("Idempotency-Key") ?? body.idempotency_key ?? "",
    );
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(rawKey)) {
      return json(400, { ok: false, code: "IDEMPOTENCY_KEY_REQUIRED" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile?.company_id) {
      return json(403, { ok: false, code: "COMPANY_REQUIRED" });
    }

    const companyId = profile.company_id;

    const { data: existing, error: jobError } = await supabase
      .from("dte_issuance_jobs")
      .select("id,status,environment,document_type,folio,sii_track_id")
      .eq("company_id", companyId)
      .eq("idempotency_key", rawKey)
      .maybeSingle();

    if (jobError) {
      console.error("dte_issuance_jobs lookup failed", jobError);
      return json(503, { ok: false, code: "DTE_STORAGE_UNAVAILABLE" });
    }

    if (existing) {
      return json(200, {
        ok: true,
        reused: true,
        job: existing,
        message: "Solicitud existente recuperada; no se duplicó.",
      });
    }

    const { data: settings, error: settingsError } = await supabase
      .from("dte_company_settings")
      .select(
        "environment,enabled,issuer_rut,legal_name,certificate_configured,caf_configured",
      )
      .eq("company_id", companyId)
      .maybeSingle();

    if (settingsError) {
      console.error("DTE settings lookup failed", settingsError);
      return json(503, { ok: false, code: "DTE_SETTINGS_UNAVAILABLE" });
    }

    const missing: string[] = [];
    if (!settings?.issuer_rut) missing.push("issuer_rut");
    if (!settings?.legal_name) missing.push("legal_name");
    if (settings?.enabled !== true) missing.push("issuer_not_enabled");
    if (settings?.certificate_configured !== true) {
      missing.push("certificate_not_configured");
    }
    if (settings?.caf_configured !== true) {
      missing.push("caf_not_configured");
    }

    // Safe checkpoint: do not create a fake accepted job or consume a folio.
    return json(409, {
      ok: false,
      code: "SII_ADAPTER_NOT_READY",
      environment: settings?.environment ?? "certification",
      document_type: documentType,
      missing,
      message:
        "Prevalidación completada. No se emitió ningún DTE. " +
        "El adaptador oficial requiere XML/XSD, firma XMLDSIG, CAF/folios " +
        "autorizados, autenticación, transmisión y consulta de estado SII.",
    });
  } catch (error) {
    console.error("dte-issue internal error", error);
    return json(500, { ok: false, code: "INTERNAL_ERROR" });
  }
});
