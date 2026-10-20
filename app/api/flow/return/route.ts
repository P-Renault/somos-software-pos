
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const incoming = new URL(request.url);

  const appUrlValue = process.env.BOOM_POS_APP_URL;
  const apiKey = process.env.FLOW_API_KEY;
  const secret = process.env.FLOW_SECRET_KEY;

  const apiBase = (
    process.env.FLOW_API_BASE_URL ||
    process.env.FLOW_API_URL ||
    "https://www.flow.cl/api"
  ).replace(/\/+$/, "");

  let appUrl: URL;

  try {
    if (!appUrlValue) {
      throw new Error("Falta BOOM_POS_APP_URL");
    }

    appUrl = new URL(appUrlValue);

    if (appUrl.protocol !== "https:") {
      throw new Error("BOOM_POS_APP_URL debe usar HTTPS");
    }
  } catch {
    return NextResponse.json(
      { error: "La URL pública de BOOM POS no está configurada correctamente." },
      { status: 503 },
    );
  }

  function redirectResult(result: "approved" | "rejected" | "pending") {
    const destination = new URL("/", appUrl);

    destination.searchParams.set("payment_result", result);
    destination.searchParams.set("payment_provider", "flow");

    return NextResponse.redirect(destination, 303);
  }

  const token = incoming.searchParams.get("token");

  if (!token || token.length > 500 || !apiKey || !secret) {
    return redirectResult("pending");
  }

  try {
    const params: Record<string, string> = { apiKey, token };

    const data = Object.keys(params)
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join("");

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      new TextEncoder().encode(data),
    );

    const sign = Array.from(new Uint8Array(signature))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const statusUrl = new URL(`${apiBase}/payment/getStatus`);

    statusUrl.search = new URLSearchParams({
      ...params,
      s: sign,
    }).toString();

    const response = await fetch(statusUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error("Flow getStatus HTTP:", response.status);
      return redirectResult("pending");
    }

    const payment = await response.json();
    const status = Number(payment.status);

    if (status === 2) {
      return redirectResult("approved");
    }

    if (status === 3 || status === 4) {
      return redirectResult("rejected");
    }

    return redirectResult("pending");
  } catch (error) {
    console.error("Error verificando el retorno de Flow:", error);
    return redirectResult("pending");
  }
}
