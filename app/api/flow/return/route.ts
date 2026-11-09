import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type PaymentResult = "approved" | "rejected" | "pending";

function getAppOrigin(request: Request): string {
  const requestOrigin = new URL(request.url).origin;
  const configured = process.env.BOOM_POS_APP_URL?.trim();

  if (!configured) return requestOrigin;

  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:") return requestOrigin;
    return parsed.origin;
  } catch {
    return requestOrigin;
  }
}

function redirectToDashboard(request: Request, result: PaymentResult) {
  const destination = new URL("/gestion", getAppOrigin(request));
  destination.searchParams.set("payment_result", result);
  destination.searchParams.set("payment_provider", "flow");

  return NextResponse.redirect(destination, 303);
}

async function readToken(request: Request): Promise<string> {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken.trim();

  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const body: unknown = await request.json().catch(() => null);
    if (body && typeof body === "object" && "token" in body) {
      const value = (body as { token?: unknown }).token;
      return typeof value === "string" ? value.trim() : "";
    }
    return "";
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const value = form?.get("token");
    return typeof value === "string" ? value.trim() : "";
  }

  const raw = await request.text().catch(() => "");
  return raw ? (new URLSearchParams(raw).get("token") || "").trim() : "";
}

async function handleFlowReturn(request: Request) {
  try {
    const token = await readToken(request);

    // Abrir manualmente esta URL sin token no es un pago. Mostrar estado
    // pendiente en el dashboard, nunca responder 405 ni enviar a la landing.
    if (!token || token.length > 500) {
      return redirectToDashboard(request, "pending");
    }

    const confirmationUrl = new URL(
      "/api/flow/confirmation",
      new URL(request.url).origin,
    );

    const response = await fetch(confirmationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    const data: { paymentStatus?: unknown } | null = await response
      .json()
      .catch(() => null);

    if (!response.ok || !data) {
      console.error("BOOM POS Flow return: confirmation failed", {
        status: response.status,
      });
      return redirectToDashboard(request, "pending");
    }

    const result: PaymentResult =
      data.paymentStatus === "approved"
        ? "approved"
        : data.paymentStatus === "rejected"
          ? "rejected"
          : "pending";

    return redirectToDashboard(request, result);
  } catch (error) {
    console.error("BOOM POS Flow return error", error);
    return redirectToDashboard(request, "pending");
  }
}

export async function GET(request: Request) {
  return handleFlowReturn(request);
}

export async function POST(request: Request) {
  return handleFlowReturn(request);
}
