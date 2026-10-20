
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const appUrlValue = process.env.BOOM_POS_APP_URL;

  let appUrl: URL;

  try {
    if (!appUrlValue) {
      throw new Error("Missing BOOM_POS_APP_URL");
    }

    appUrl = new URL(appUrlValue);

    if (appUrl.protocol !== "https:") {
      throw new Error("HTTPS required");
    }
  } catch {
    return NextResponse.json(
      { error: "La URL de BOOM POS no está configurada correctamente." },
      { status: 503 },
    );
  }

  // Si se abre manualmente, no hay resultado de pago que verificar.
  const token = requestUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/", appUrl),
      303,
    );
  }

  // El estado del pago debe verificarse en el servidor.
  // Nunca aceptar un resultado aprobado/rechazado enviado por el navegador.
  const projectUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.PROJECT_URL ||
    ""
  ).trim().replace(/\/+$/, "");

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";

  if (!projectUrl || !anonKey) {
    console.error("Falta configuración pública de Supabase para verificar el retorno.");

    return redirectWithResult(appUrl, "pending");
  }

  try {
    // La Edge Function debe verificar el token consultando a Flow
    // y devolver el estado real de la operación.
    const response = await fetch(
      `${projectUrl}/functions/v1/flow-return`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
        },
        body: JSON.stringify({ token }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("No se pudo verificar el pago en Supabase:", response.status);
      return redirectWithResult(appUrl, "pending");
    }

    const paymentResult =
      result?.payment_result === "approved"
        ? "approved"
        : result?.payment_result === "rejected"
          ? "rejected"
          : "pending";

    return redirectWithResult(appUrl, paymentResult);
  } catch (error) {
    console.error("Error procesando retorno de Flow:", error);
    return redirectWithResult(appUrl, "pending");
  }
}

function redirectWithResult(
  appUrl: URL,
  result: "approved" | "rejected" | "pending",
) {
  const destination = new URL("/", appUrl);

  destination.searchParams.set("payment_result", result);
  destination.searchParams.set("payment_provider", "flow");

  return NextResponse.redirect(destination, 303);
}
