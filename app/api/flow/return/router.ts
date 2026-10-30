import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function readFlowToken(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;

  if (request.method !== "POST") return null;

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      return typeof body?.token === "string" ? body.token : null;
    }

    const raw = await request.text();
    const form = new URLSearchParams(raw);
    return form.get("token");
  } catch {
    return null;
  }
}

async function handleFlowReturn(request: Request) {
  const token = await readFlowToken(request);

  if (!token || token.length > 500) {
    return redirectToApp(request, "pending");
  }

  try {
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

    let result: PaymentResult = "pending";
    if (data.paymentStatus === "approved") result = "approved";
    if (data.paymentStatus === "rejected") result = "rejected";

    return redirectToApp(request, result);
  } catch (error) {
    console.error("Flow return: error verifying payment", error);
    return redirectToApp(request, "pending");
  }
}

export async function GET(request: Request) {
  return handleFlowReturn(request);
}

export async function POST(request: Request) {
  return handleFlowReturn(request);
}
