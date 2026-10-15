
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("DTE_ALLOWED_ORIGIN");

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8",
};

function respond(
  status: number,
  body: Record<string, unknown>,
  origin?: string | null,
): Response {
  const headers = new Headers(corsHeaders);

  if (allowedOrigin && origin === allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
  }

  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  // Responder al preflight antes de validar el origen.
  if (req.method === "OPTIONS") {
    const headers = new Headers(corsHeaders);

    if (allowedOrigin && origin === allowedOrigin) {
      headers.set("Access-Control-Allow-Origin", allowedOrigin);
    }

    return new Response(null, { status: 204, headers });
  }

  // Validar el origen en las solicitudes reales.
  if (origin && (!allowedOrigin || origin !== allowedOrigin)) {
    return respond(403, {
      ok: false,
      code: "ORIGIN_NOT_ALLOWED",
    }, origin);
  }

  if (req.method !== "POST") {
    return respond(405, {
      ok: false,
      code: "METHOD_NOT_ALLOWED",
    }, origin);
  }

  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return respond(401, {
      ok: false,
      code: "AUTH_REQUIRED",
    }, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return respond(503, {
      ok: false,
      code: "SERVER_NOT_CONFIGURED",
    }, origin);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authorization },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    // 1. Validar usuario autenticado.
    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      return respond(401, {
        ok: false,
        code: "INVALID_SESSION",
      }, origin);
    }

    // 2. Validar JSON de entrada.
    let body: Record<string, unknown>;

    try {
      const parsed: unknown = await req.json();

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return respond(400, {
          ok: false,
          code: "INVALID_BODY",
        }, origin);
      }

      body = parsed as Record<string, unknown>;
    } catch {
      return respond(400, {
        ok: false,
        code: "INVALID_JSON",
      }, origin);
    }

    // 3. Validar tipo de documento.
    const documentType = Number(body.document_type);
    const supportedTypes = [33, 34, 39, 41];

    if (!supportedTypes.includes(documentType)) {
      return respond(400, {
        ok: false,
        code: "UNSUPPORTED_DOCUMENT_TYPE",
        allowed_document_types: supportedTypes,
      }, origin);
    }

    // 4. Exigir clave de idempotencia UUID.
    const idempotencyKey = String(
      req.headers.get("Idempotency-Key") ??
        body.idempotency_key ??
        "",
    );

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(idempotencyKey)) {
      return respond(400, {
        ok: false,
        code: "IDEMPOTENCY_KEY_REQUIRED",
      }, origin);
    }

    // 5. Resolver empresa desde el perfil autenticado.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile?.company_id) {
      return respond(403, {
        ok: false,
        code: "COMPANY_REQUIRED",
      }, origin);
    }

    const companyId = profile.company_id;

    // 6. Comprobar si la solicitud ya existe.
    const { data: existing, error: existingError } = await supabase
      .from("dte_issuance_jobs")
      .select(
        "id,status,environment,document_type,folio,sii_track_id",
      )
      .eq("company_id", companyId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingError) {
      return respond(503, {
        ok: false,
        code: "DTE_STORAGE_UNAVAILABLE",
      }, origin);
    }

    if (existing) {
      return respond(200, {
        ok: true,
        reused: true,
        job: existing,
        message: "Se recuperó la solicitud existente.",
      }, origin);
    }

    // 7. Consultar configuración tributaria.
    const { data: settings, error: settingsError } = await supabase
      .from("dte_company_settings")
      .select(
        "environment,enabled,issuer_rut,legal_name,certificate_configured,caf_configured",
      )
      .eq("company_id", companyId)
      .maybeSingle();

    if (settingsError) {
      return respond(503, {
        ok: false,
        code: "DTE_SETTINGS_UNAVAILABLE",
      }, origin);
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

    // 8. Emisión bloqueada hasta implementar el adaptador SII real.
    return respond(409, {
      ok: false,
      code: "SII_ADAPTER_NOT_READY",
      environment: settings?.environment ?? "certification",
      document_type: documentType,
      missing,
      message:
        "Emisión bloqueada. Falta implementar y validar XML oficial, " +
        "esquema XSD, firma XMLDSIG, CAF y folios autorizados, " +
        "autenticación, transmisión y consulta de estado del SII. " +
        "No se generó ni transmitió ningún DTE.",
    }, origin);
  } catch (error) {
    console.error("dte-issue internal error", error);

    return respond(500, {
      ok: false,
      code: "INTERNAL_ERROR",
      message: "Error interno al validar la solicitud DTE.",
    }, origin);
  }
});
