import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * BOOM POS — dte-issue
 * CORS: Supabase SDK default headers.
 * Keep verify_jwt enabled in Supabase.
 * Official SII issuance remains intentionally disabled until a real adapter
 * (XML/XSD, XMLDSIG, CAF/folios, SII authentication/transmission/status) exists.
 */

function responseHeaders(): Headers {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return headers;
}

function respond(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(),
  });
}

Deno.serve(async (req: Request) => {
  // Use the SDK's maintained CORS headers. Do not reject OPTIONS based on
  // a missing Origin header; browsers may omit it in some preflight contexts.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond(405, {
      ok: false,
      code: "METHOD_NOT_ALLOWED",
    });
  }

  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return respond(401, {
      ok: false,
      code: "AUTH_REQUIRED",
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return respond(503, {
      ok: false,
      code: "SERVER_NOT_CONFIGURED",
    });
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
    // 1. Validate authenticated user session.
    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      return respond(401, {
        ok: false,
        code: "INVALID_SESSION",
      });
    }

    // 2. Validate request JSON.
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
        });
      }

      body = parsed as Record<string, unknown>;
    } catch {
      return respond(400, {
        ok: false,
        code: "INVALID_JSON",
      });
    }

    // 3. Validate supported document type.
    const documentType = Number(body.document_type);
    const supportedTypes = [33, 34, 39, 41];

    if (!supportedTypes.includes(documentType)) {
      return respond(400, {
        ok: false,
        code: "UNSUPPORTED_DOCUMENT_TYPE",
        allowed_document_types: supportedTypes,
      });
    }

    // 4. Require idempotency UUID.
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
      });
    }

    // 5. Resolve company from authenticated user's profile.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile?.company_id) {
      return respond(403, {
        ok: false,
        code: "COMPANY_REQUIRED",
      });
    }

    const companyId = profile.company_id;

    // 6. Check whether this idempotency key already exists.
    const { data: existing, error: existingError } = await supabase
      .from("dte_issuance_jobs")
      .select(
        "id,status,environment,document_type,folio,sii_track_id",
      )
      .eq("company_id", companyId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingError) {
      console.error("DTE storage lookup failed", existingError);

      return respond(503, {
        ok: false,
        code: "DTE_STORAGE_UNAVAILABLE",
      });
    }

    if (existing) {
      return respond(200, {
        ok: true,
        reused: true,
        job: existing,
        message: "Se recuperó la solicitud existente.",
      });
    }

    // 7. Read tax configuration for this company.
    const { data: settings, error: settingsError } = await supabase
      .from("dte_company_settings")
      .select(
        "environment,enabled,issuer_rut,legal_name,certificate_configured,caf_configured",
      )
      .eq("company_id", companyId)
      .maybeSingle();

    if (settingsError) {
      console.error("DTE settings lookup failed", settingsError);

      return respond(503, {
        ok: false,
        code: "DTE_SETTINGS_UNAVAILABLE",
      });
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

    // 8. Intentionally block official issuance until a real SII adapter
    // is implemented. This endpoint does not create or transmit an official DTE.
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
    });
  } catch (error) {
    console.error("dte-issue internal error", error);

    return respond(500, {
      ok: false,
      code: "INTERNAL_ERROR",
      message: "Error interno al validar la solicitud DTE.",
    });
  }
});
