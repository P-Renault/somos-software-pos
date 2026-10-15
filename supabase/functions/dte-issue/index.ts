// BOOM POS — dte-issue
// Preflight seguro para la futura emisión DTE/SII.
// No genera XML oficial, no firma, no reserva folios ni transmite al SII.

import { createClient } from "@supabase/supabase-js";

const configuredOrigin = Deno.env.get("DTE_ALLOWED_ORIGIN");
const allowedOrigin = configuredOrigin ?? "https://example.invalid";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8",
};

function json(status: number, body: Record<string, unknown>, origin?: string | null) {
  const headers = new Headers(corsHeaders);
  if (origin && origin === allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    if (origin && origin !== allowedOrigin) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (origin && origin !== allowedOrigin) {
    return json(403, { ok: false, code: "ORIGIN_NOT_ALLOWED" });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json(401, { ok: false, code: "AUTH_REQUIRED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return json(503, { ok: false, code: "SERVER_NOT_CONFIGURED" });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
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

  const idempotencyKey = String(
    req.headers.get("Idempotency-Key") ?? body.idempotency_key ?? "",
  );
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(idempotencyKey)) {
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

  const { data: existing, error: existingError } = await supabase
    .from("dte_issuance_jobs")
    .select("id,status,environment,document_type,folio,sii_track_id")
    .eq("company_id", companyId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingError) {
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
    return json(503, { ok: false, code: "DTE_SETTINGS_UNAVAILABLE" });
  }

  const missing: string[] = [];
  if (!settings?.issuer_rut) missing.push("issuer_rut");
  if (!settings?.legal_name) missing.push("legal_name");
  if (settings?.enabled !== true) missing.push("issuer_not_enabled");
  if (settings?.certificate_configured !== true) missing.push("certificate_not_configured");
  if (settings?.caf_configured !== true) missing.push("caf_not_configured");

  // Deliberadamente no crea jobs ni representa una emisión real.
  return json(409, {
    ok: false,
    code: "SII_ADAPTER_NOT_READY",
    environment: settings?.environment ?? "certification",
    document_type: documentType,
    missing,
    message:
      "Prevalidación completada, pero emisión bloqueada: falta implementar " +
      "el adaptador oficial SII (XML/XSD, XMLDSIG, CAF/folios, autenticación, " +
      "transmisión y consulta de estado). No se generó ni transmitió un DTE.",
  });
});
