import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentResult = "approved" | "rejected" | "pending";

function redirectToDashboard(request: Request, result: PaymentResult) {
  const configuredUrl = process.env.BOOM_POS_APP_URL?.trim();
  const requestUrl = new URL(request.url);

  // La URL de destino se toma de la configuración del servidor.
  // Se conserva el mismo dominio para mantener la cookie de sesión del navegador.
  let appOrigin: string;

  try {
    const configured = new URL(configuredUrl || requestUrl.origin);
    if (configured.protocol !== "https:") throw new Error("HTTPS requerido");
    appOrigin = configured.origin;
  } catch {
    appOrigin = requestUrl.origin;
  }

  const destination = new URL("/gestion", appOrigin);
  destination.searchParams.set("payment_result", result);
  destination.searchParams.set("payment_provider", "flow");

  return NextResponse.redirect(destination, 303);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token");

  // Si se abre manualmente el endpoint sin token, se informa estado pendiente
  // dentro del dashboard, sin enviar al usuario a la landing comercial.
  if (!token || token.length > 500) {
    return redirectToDashboard(request, "pending");
  }

  try {
    // La confirmación consulta el estado real directamente con Flow.
    const confirmationUrl = new URL(
      "/api/flow/confirmation",
      requestUrl.origin,
    );

    const form = new URLSearchParams();
    form.set("token", token);

    const response = await fetch(confirmationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
      console.error("Flow return: no se pudo confirmar el pago", {
        httpStatus: response.status,
        response: data,
      });
      return redirectToDashboard(request, "pending");
    }

    let result: PaymentResult = "pending";
    if (data.paymentStatus === "approved") result = "approved";
    else if (data.paymentStatus === "rejected") result = "rejected";

    return redirectToDashboard(request, result);
  } catch (error) {
    console.error("Flow return: error verificando el resultado", error);
    return redirectToDashboard(request, "pending");
  }
}
