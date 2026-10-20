
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentResult = "approved" | "rejected" | "pending";

function redirectToApp(request: Request, result: PaymentResult) {
  const configuredUrl = process.env.BOOM_POS_APP_URL?.trim();
  const requestUrl = new URL(request.url);

  // Usar un dominio de aplicación configurado, nunca una URL
  // arbitraria enviada por parámetros del navegador.
  let appUrl: URL;

  try {
    appUrl = new URL(configuredUrl || requestUrl.origin);

    if (appUrl.protocol !== "https:") {
      throw new Error("HTTPS requerido");
    }
  } catch {
    appUrl = new URL(requestUrl.origin);
  }

  const destination = new URL("/", appUrl);
  destination.searchParams.set("payment_result", result);
  destination.searchParams.set("payment_provider", "flow");

  return NextResponse.redirect(destination, 303);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token");

  // Abrir la ruta manualmente no representa una operación de pago.
  if (!token) {
    return redirectToApp(request, "pending");
  }

  if (token.length > 500) {
    return redirectToApp(request, "pending");
  }

  try {
    // Reutilizar la ruta de confirmación existente, que consulta
    // el estado real de la operación con Flow y valida la orden.
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
      });

      return redirectToApp(request, "pending");
    }

    let result: PaymentResult = "pending";

    if (data.paymentStatus === "approved") {
      result = "approved";
    } else if (data.paymentStatus === "rejected") {
      result = "rejected";
    }

    return redirectToApp(request, result);
  } catch (error) {
    console.error("Flow return: error verificando el resultado", error);
    return redirectToApp(request, "pending");
  }
}
