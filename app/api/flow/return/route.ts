import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type PaymentResult = "approved" | "rejected" | "pending";

function redirectToApp(request: Request, result: PaymentResult) {
  const requestUrl = new URL(request.url);
  const configuredUrl = process.env.BOOM_POS_APP_URL?.trim();
  let appUrl: URL;

  try {
    appUrl = new URL(configuredUrl || requestUrl.origin);
    if (appUrl.protocol !== "https:") throw new Error("HTTPS requerido");
  } catch {
    appUrl = new URL(requestUrl.origin);
  }

  const destination = new URL("/", appUrl);
  destination.searchParams.set("payment_result", result);
  destination.searchParams.set("payment_provider", "flow");
  return NextResponse.redirect(destination, 303);
}

/** Flow puede entregar el token en query string o en el cuerpo del retorno. */
async function readFlowToken(request: Request): Promise<string> {
  const queryToken = new URL(request.url).searchParams.get("token");
  if (queryToken) return queryToken.trim();

  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const body: unknown = await request.json().catch(() => null);
    if (body && typeof body === "object" && "token" in body) {
      const token = (body as { token?: unknown }).token;
      return typeof token === "string" ? token.trim() : "";
    }
    return "";
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const token = form?.get("token");
    return typeof token === "string" ? token.trim() : "";
  }

  const rawBody = await request.text().catch(() => "");
  if (!rawBody) return "";
  return (new URLSearchParams(rawBody).get("token") || "").trim();
}

async function handleFlowReturn(request: Request) {
  try {
    const token = await readFlowToken(request);

    if (!token || token.length > 500) {
      return redirectToApp(request, "pending");
    }

    // La confirmación consulta el estado directamente con Flow y actualiza
    // el pago/suscripción. El retorno del navegador nunca confirma por sí solo.
    const confirmationUrl = new URL("/api/flow/confirmation", new URL(request.url).origin);
    const body = new URLSearchParams({ token });
    const response = await fetch(confirmationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    const data: { paymentStatus?: unknown } | null = await response
      .json()
      .catch(() => null);

    if (!response.ok || !data) {
      console.error("BOOM POS Flow return: confirmation failed", {
        httpStatus: response.status,
      });
      return redirectToApp(request, "pending");
    }

    const result: PaymentResult =
      data.paymentStatus === "approved"
        ? "approved"
        : data.paymentStatus === "rejected"
          ? "rejected"
          : "pending";

    return redirectToApp(request, result);
  } catch (error) {
    console.error("BOOM POS Flow return error", error);
    return redirectToApp(request, "pending");
  }
}

// Admitir ambos métodos evita el HTTP 405 si el proveedor/navegador retorna
// mediante POST en vez de GET. Ambos siguen verificando el pago en Flow.
export async function GET(request: Request) {
  return handleFlowReturn(request);
}

export async function POST(request: Request) {
  return handleFlowReturn(request);
}
