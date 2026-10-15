import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Diagnóstico seguro del subsistema DTE.
 * No devuelve secretos ni afirma que exista conexión oficial con el SII.
 * La emisión queda bloqueada hasta implementar firma, CAF, validación XSD y envío.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", message: "Inicia sesión para consultar el estado DTE." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const checks = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    dteSigningPrivateKey: Boolean(process.env.DTE_SIGNING_PRIVATE_KEY),
    dteSigningCertificate: Boolean(process.env.DTE_SIGNING_CERTIFICATE),
    dteCafXml: Boolean(process.env.DTE_CAF_XML),
    siiCertificationEnabled: process.env.SII_ENVIRONMENT === "certification",
    siiProductionEnabled: process.env.SII_ENVIRONMENT === "production",
  };

  const signingConfigured = checks.dteSigningPrivateKey && checks.dteSigningCertificate;
  const cafConfigured = checks.dteCafXml;
  const environmentConfigured = checks.siiCertificationEnabled || checks.siiProductionEnabled;

  return NextResponse.json(
    {
      ok: true,
      subsystem: "DTE",
      currentCapability: "internal_simulation_only",
      officialEmissionEnabled: false,
      checks,
      gates: {
        signingConfigured,
        cafConfigured,
        siiEnvironmentConfigured: environmentConfigured,
        xmlSchemaValidationImplemented: false,
        siiAuthenticationAndSubmissionImplemented: false,
        certificationApproved: false,
      },
      message:
        "El endpoint solo informa configuración. No firma, no reserva folios y no transmite documentos al SII.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
