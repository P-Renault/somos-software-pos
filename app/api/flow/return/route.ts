
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retorno del navegador desde Flow.
 * La verificación del pago se realiza en Supabase, donde están
 * configuradas las credenciales privadas de Flow.
 */
export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const token = incoming.searchParams.get("token");

  const projectUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.PROJECT_URL ||
    ""
  ).trim().replace(/\/+$/, "");

  if (!projectUrl) {
    return NextResponse.json(
      { error: "Falta la URL pública de Supabase en Vercel." },
      { status: 503 },
    );
  }

  let supabaseUrl: URL;

  try {
    supabaseUrl = new URL(projectUrl);

    if (supabaseUrl.protocol !== "https:") {
      throw new Error("HTTPS requerido");
    }
  } catch {
    return NextResponse.json(
      { error: "La URL pública de Supabase no es válida." },
      { status: 503 },
    );
  }

  // Una apertura manual no contiene información de un pago.
  if (!token) {
    const appUrlValue = process.env.BOOM_POS_APP_URL;

    if (appUrlValue) {
      try {
        const appUrl = new URL(appUrlValue);

        if (appUrl.protocol === "https:") {
          return NextResponse.redirect(new URL("/", appUrl), 303);
        }
      } catch {
        // No utilizar una URL de retorno inválida.
      }
    }

    return NextResponse.json(
      {
        error:
          "Esta ruta recibe el retorno de Flow. Debes abrirla desde una operación de pago.",
      },
      { status: 400 },
    );
  }

  if (token.length > 500) {
    return NextResponse.json(
      { error: "El token de Flow no es válido." },
      { status: 400 },
    );
  }

  // Delegar la consulta a la Edge Function de Supabase.
  // Allí se verifica el estado real mediante la API de Flow.
  const edgeUrl = new URL(
    `${supabaseUrl.origin}/functions/v1/flow-return`,
  );

  edgeUrl.searchParams.set("token", token);

  return NextResponse.redirect(edgeUrl, 303);
}
