import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentResult = "approved" | "rejected" | "pending";

function redirectToApp(request: Request, result: PaymentResult) {
  const configuredUrl = process.env.BOOM_POS_APP_URL?.trim();
  const requestUrl = new URL(request.url);

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

async function readFlowToken(request: Request): Promise<string> {
  const requestUrl = new URL(request.url);
  const queryToken = requestUrl.searchParams.get("token");
  if (queryToken) return queryToken;

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return typeof body?.token === "string" ? body.token : "";
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData().catch(() => null);
    const value = form?.get("token");
    return typeof value === "string" ? value : "";
  }

  const raw = await request.text().catch(() => "");
  if (!raw) return "";
  return new URLSearchParams(raw).get("token") || "";
}

async function handleFlowReturn(request: Request) {
  try {
    const token = await readFlowToken(request);

    if (!token || token.length > 500) {
      return redirectToApp(request, "pending");
    }

    const confirmationUrl = new URL("/api/flow/confirmation", new URL(request.url).origin);
    const form = new URLSearchParams({ token });

    const response = await fetch(confirmationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
      console.error("Flow return: confirmation failed", { httpStatus: response.status });
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
    console.error("Flow return error", error);
    return redirectToApp(request, "pending");
  }
}

// Flow puede volver al navegador mediante GET o POST.
// Ambos métodos pasan por la misma verificación server-to-server.
export async function GET(request: Request) {
  return handleFlowReturn(request);
}

export async function POST(request: Request) {
  return handleFlowReturn(request);
}

