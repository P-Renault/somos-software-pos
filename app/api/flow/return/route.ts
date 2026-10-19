import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const appUrl = (process.env.BOOM_POS_APP_URL || url.origin).replace(/\/$/, "");
  const destination = new URL("/", appUrl);
  destination.searchParams.set("payment", token ? "return_received" : "return_without_token");
  destination.searchParams.set("provider", "flow");
  // El retorno del navegador no confirma un pago. La confirmación fiable llega por callback servidor-servidor.
  return NextResponse.redirect(destination);
}
