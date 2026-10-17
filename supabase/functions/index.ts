import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * BOOM POS — dte-issue
 *
 * Secure DTE gateway scaffold:
 * - Authenticates the Supabase user and resolves their company.
 * - Reads the company's DTE configuration.
 * - Exposes preflight diagnostics for the current configuration.
 * - Explicitly blocks official issuance until the SII adapter is implemented.
 *
 * IMPORTANT:
 * This function does NOT generate official DTE XML, sign XML, reserve CAF folios,
 * authenticate with the SII, transmit documents, or interpret an SII receipt.
 * Keep verify_jwt enabled in supabase/config.toml.
 */

type JsonObject = Record<string, unknown>;

function respond(status: number, body: JsonObject): Response {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function normalizeRut(value: string): string {
  return value.toUpperCase().replace(/[^0-9K]/g, "");
}

function isValidRut(value: string): boolean {
  const rut = normalizeRut(value);
  if (rut.length < 2) return false;

  const body = rut.slice(0, -1);
  const dv = rut.slice(-1);
  if (!/^\d+$/.test(body)) return false;

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const result = 11 - (sum % 11);
  const expected = result === 11 ? "0" : result === 10 ? "K" : String(result);
  return dv === expected;
}

function addCheck(
  checks: Array<{ code: string; label: string; status: "ok" | "pending" | "blocked"; detail: string }>,
  code: string,
  label: string,
  status: "ok" | "pending" | "blocked",
  detail: string,
): void {
  checks.push({ code, label, status, detail });
}

Deno.serve(async (req: Request) => {
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
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return respond(401, { ok: false, code: "INVALID_SESSION" });
    }

    let body: JsonObject;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return respond(400, { ok: false, code: "INVALID_BODY" });
      }
      body = parsed as JsonObject;
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

    const companyId = profile.company_id as string;
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

    const environment =
      settings?.environment === "production" || settings?.environment === "certification"
        ? settings.environment
        : "certification";

    const missing: string[] = [];
    const checks: Array<{
      code: string;
      label: string;
      status: "ok" | "pending" | "blocked";
      detail: string;
    }> = [];

    if (!settings) {
      missing.push("dte_company_settings");
      addCheck(
        checks,
        "issuer_settings",
        "Configuración tributaria de la empresa",
        "blocked",
        "No existe una fila de configuración DTE para la empresa actual.",
      );
    } else {
      const rutValid = Boolean(settings.issuer_rut && isValidRut(String(settings.issuer_rut)));
      addCheck(
        checks,
        "issuer_rut",
        "RUT del emisor",
        rutValid ? "ok" : "blocked",
        rutValid ? "El RUT tiene un formato y dígito verificador válidos." : "Falta el RUT o su dígito verificador no es válido.",
      );
      if (!rutValid) missing.push("issuer_rut");

      const legalNameValid = typeof settings.legal_name === "string" && settings.legal_name.trim().length > 0;
      addCheck(
        checks,
        "legal_name",
        "Razón social",
        legalNameValid ? "ok" : "blocked",
        legalNameValid ? "La razón social está informada." : "Debe informarse la razón social legal del emisor.",
      );
      if (!legalNameValid) missing.push("legal_name");

      const activityValid = typeof settings.business_activity === "string" && settings.business_activity.trim().length > 0;
      addCheck(
        checks,
        "business_activity",
        "Actividad económica",
        activityValid ? "ok" : "pending",
        activityValid ? "Hay una actividad económica registrada en la configuración." : "Falta registrar la actividad económica del emisor.",
      );
      if (!activityValid) missing.push("business_activity");

      const addressValid = typeof settings.business_address === "string" && settings.business_address.trim().length > 0;
      const communeValid = typeof settings.commune === "string" && settings.commune.trim().length > 0;
      const cityValid = typeof settings.city === "string" && settings.city.trim().length > 0;
      const addressStatus = addressValid && communeValid && cityValid ? "ok" : "pending";
      addCheck(
        checks,
        "business_address",
        "Domicilio tributario",
        addressStatus,
        addressStatus === "ok" ? "Dirección, comuna y ciudad están informadas." : "Completa dirección, comuna y ciudad según los antecedentes tributarios vigentes.",
      );
      if (addressStatus !== "ok") missing.push("business_address");

      const enabled = settings.enabled === true;
      addCheck(
        checks,
        "issuer_enabled",
        "Emisor habilitado en BOOM POS",
        enabled ? "ok" : "blocked",
        enabled ? "La configuración permite continuar con verificaciones previas." : "La empresa no está habilitada en la configuración DTE de BOOM POS.",
      );
      if (!enabled) missing.push("issuer_not_enabled");

      const certificateConfigured = settings.certificate_configured === true;
      addCheck(
        checks,
        "certificate",
        "Certificado digital",
        certificateConfigured ? "pending" : "pending",
        certificateConfigured
          ? "La base de datos indica que hay un certificado configurado; su vigencia, cadena y clave privada no se han verificado."
          : "El certificado digital todavía no figura como configurado.",
      );
      if (!certificateConfigured) missing.push("certificate_not_configured");

      const cafConfigured = settings.caf_configured === true;
      addCheck(
        checks,
        "caf",
        "CAF y folios autorizados",
        cafConfigured ? "pending" : "pending",
        cafConfigured
          ? "La base de datos indica CAF configurado; el archivo, firma, rango y folios disponibles no se han validado."
          : "El CAF todavía no figura como configurado.",
      );
      if (!cafConfigured) missing.push("caf_not_configured");

      const resolutionPresent = Boolean(settings.resolution_date && settings.resolution_number);
      addCheck(
        checks,
        "sii_resolution",
        "Resolución del SII",
        resolutionPresent ? "pending" : "pending",
        resolutionPresent
          ? "Hay datos de resolución registrados; su validez y alcance no se han confirmado con el SII."
          : "Faltan datos de resolución o no se han ingresado en la configuración.",
      );
      if (!resolutionPresent) missing.push("sii_resolution");
    }

    addCheck(
      checks,
      "sii_adapter",
      "Adaptador oficial de comunicación con el SII",
      "blocked",
      "No implementado: esta función no autentica ante el SII, no genera XML oficial, no firma ni transmite DTE.",
    );

    if (body.action === "test_connection") {
      return respond(200, {
        ok: true,
        connected: true,
        adapter_ready: false,
        official_sii_connected: false,
        company_id: companyId,
        environment,
        missing,
        checks,
        message:
          "La función de Supabase y la lectura de configuración respondieron correctamente. " +
          "Esto no prueba conectividad con el SII ni autoriza la emisión de DTE.",
      });
    }

    if (body.action === "preflight") {
      return respond(200, {
        ok: true,
        diagnostic_only: true,
        ready_for_official_issuance: false,
        official_sii_connected: false,
        company_id: companyId,
        environment,
        missing,
        checks,
        message:
          "Diagnóstico previo completado. La emisión oficial permanece bloqueada hasta implementar y validar " +
          "el adaptador SII, la generación y firma XML, la gestión segura de CAF/folios y la habilitación tributaria.",
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

    // Persistencia atómica de una solicitud de preparación. Esto NO emite un DTE.
    // El RPC obtiene la empresa desde auth.uid(), aplica idempotencia y registra
    // trabajo + evento en una sola transacción.
    if (body.action === "prepare") {
      const document = body.document;
      if (!document || typeof document !== "object" || Array.isArray(document)) {
        return respond(400, { ok: false, code: "DOCUMENT_PAYLOAD_REQUIRED" });
      }

      const { data: prepared, error: prepareError } = await supabase.rpc(
        "dte_prepare_job_atomic",
        {
          p_idempotency_key: idempotencyKey,
          p_document_type: documentType,
          p_document_payload: document,
        },
      );

      if (prepareError) {
        console.error("DTE atomic preparation failed", prepareError);
        return respond(503, {
          ok: false,
          code: "DTE_PERSISTENCE_FAILED",
          message: "No se pudo guardar la solicitud de preparación. No se ha emitido ningún DTE.",
        });
      }

      return respond(200, {
        ...(prepared as JsonObject),
        adapter_ready: false,
        ready_for_official_issuance: false,
      });
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
        message: "Se recuperó la solicitud existente; no se creó una emisión nueva.",
      });
    }

    return respond(409, {
      ok: false,
      code: "SII_ADAPTER_NOT_READY",
      adapter_ready: false,
      official_sii_connected: false,
      environment,
      document_type: documentType,
      missing,
      message:
        "El adaptador oficial del SII todavía no está implementado. " +
        "No se creó ni transmitió ningún documento tributario.",
    });
  } catch (error) {
    console.error("DTE preflight internal error", error);
    return respond(500, { ok: false, code: "INTERNAL_ERROR" });
  }
});
