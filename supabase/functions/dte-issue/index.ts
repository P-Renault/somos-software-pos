// BOOM POS — Edge Function de emisión DTE: guardia segura inicial.
// Esta versión es deliberadamente fail-closed: no firma, no consume folios y no envía al SII.
// Completar el adaptador SII tras validar esquema vigente, certificados, CAF y habilitación.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("DTE_ALLOWED_ORIGIN") ?? "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { ok: false, code: "METHOD_NOT_ALLOWED" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return reply(401, { ok: false, code: "AUTH_REQUIRED" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return reply(503, { ok: false, code: "SERVER_NOT_CONFIGURED" });

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return reply(401, { ok: false, code: "INVALID_SESSION" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, code: "INVALID_JSON" });
  }

  const documentType = Number(body.document_type);
  const idempotencyKey = String(req.headers.get("Idempotency-Key") ?? body.idempotency_key ?? "");
  const allowedTypes = [33, 34, 39, 41];
  if (!allowedTypes.includes(documentType)) {
    return reply(400, { ok: false, code: "UNSUPPORTED_DOCUMENT_TYPE" });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return reply(400, { ok: false, code: "IDEMPOTENCY_KEY_REQUIRED" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("company_id").eq("id", userData.user.id).maybeSingle();
  if (profileError || !profile?.company_id) {
    return reply(403, { ok: false, code: "COMPANY_REQUIRED" });
  }

  // Do not trust the company_id supplied by the client.
  const companyId = profile.company_id;
  const { data: existing, error: existingError } = await supabase
    .from("dte_issuance_jobs")
    .select("id,status,environment,document_type,folio,sii_track_id")
    .eq("company_id", companyId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingError) return reply(503, { ok: false, code: "DTE_STORAGE_UNAVAILABLE" });
  if (existing) {
    return reply(200, {
      ok: true,
      reused: true,
      job: existing,
      message: "Solicitud idempotente recuperada; no se ha creado otro documento.",
    });
  }

  // Fail closed: until the official SII adapter, certificate/CAF vault, issuer
  // authorization checks, schema validation and certification are implemented,
  // never create a production DTE or claim that one was sent/accepted.
  const { data: settings, error: settingsError } = await supabase
    .from("dte_company_settings")
    .select("environment,enabled,issuer_rut,legal_name,certificate_configured,caf_configured")
    .eq("company_id", companyId)
    .maybeSingle();

  if (settingsError) return reply(503, { ok: false, code: "DTE_SETTINGS_UNAVAILABLE" });

  const missing: string[] = [];
  if (!settings?.issuer_rut) missing.push("issuer_rut");
  if (!settings?.legal_name) missing.push("legal_name");
  if (settings?.enabled !== true) missing.push("issuer_not_enabled");
  if (settings?.certificate_configured !== true) missing.push("certificate_not_configured");
  if (settings?.caf_configured !== true) missing.push("caf_not_configured");

  return reply(409, {
    ok: false,
    code: "SII_ADAPTER_NOT_READY",
    environment: settings?.environment ?? "certification",
    missing,
    message: "Emisión bloqueada: esta versión no incluye aún XML oficial, firma XMLDSIG, reserva CAF/folio ni transmisión/consulta al SII. No se generó ni envió un DTE.",
  });
});
