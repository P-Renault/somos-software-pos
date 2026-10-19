import { NextResponse } from "next/server";
export const runtime = "nodejs";

function redirectToApp(request: Request) {
  const configured = process.env.BOOM_POS_APP_URL;
  const origin = configured || new URL(request.url).origin;
  let destination: URL;
  try { destination = new URL("/", origin); }
  catch { return new Response("BOOM_POS_APP_URL no es válido.", { status: 503 }); }
  if (destination.protocol !== "https:") return new Response("BOOM_POS_APP_URL debe usar HTTPS.", { status: 503 });
  destination.searchParams.set("provider", "flow");
  destination.searchParams.set("payment", "return_received");
  destination.searchParams.set("flow_return", "1");
  return NextResponse.redirect(destination, { status: 303 });
}
export async function GET(request: Request) { return redirectToApp(request); }
export async function POST(request: Request) { return redirectToApp(request); }
