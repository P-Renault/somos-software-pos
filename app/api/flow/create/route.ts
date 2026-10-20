
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Debes iniciar sesión." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);

    const subscriptionId =
      body && typeof body.subscriptionId === "string"
        ? body.subscriptionId.trim()
        : "";

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Falta el identificador de la suscripción." },
        { status: 400 },
      );
    }

    // La URL pública de Supabase se obtiene desde la configuración
    // del cliente de la aplicación. Las credenciales privadas de Flow
    // permanecen en los secretos de Supabase Edge Functions.
    const projectUrl = (
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.PROJECT_URL ||
      ""
    ).trim().replace(/\/+$/, "");

    if (!projectUrl) {
      return NextResponse.json(
        {
          error:
            "Falta NEXT_PUBLIC_SUPABASE_URL en Vercel. Configura la URL pública del proyecto Supabase de BOOM POS.",
        },
        { status: 503 },
      );
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(projectUrl);
    } catch {
      return NextResponse.json(
        { error: "La URL del proyecto Supabase no es válida." },
        { status: 503 },
      );
    }

    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "La URL del proyecto Supabase debe utilizar HTTPS." },
        { status: 503 },
      );
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return NextResponse.json(
        { error: "No se pudo recuperar la sesión autenticada." },
        { status: 401 },
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    };

    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (publishableKey) {
      headers.apikey = publishableKey;
    }

    // La Edge Function se encarga de leer los secretos privados,
    // validar la suscripción y crear el checkout de Flow.
    const edgeResponse = await fetch(
      `${projectUrl}/functions/v1/flow-create-payment`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ subscriptionId }),
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      },
    );

    const result = await edgeResponse.json().catch(() => null);

    if (!edgeResponse.ok) {
      const message =
        typeof result?.error === "string"
          ? result.error
          : "Supabase no pudo iniciar el pago con Flow.";

      console.error("BOOM POS Flow Edge Function error", {
        status: edgeResponse.status,
        message,
      });

      return NextResponse.json(
        {
          error: message,
          detail:
            typeof result?.detail === "string"
              ? result.detail
              : undefined,
        },
        { status: edgeResponse.status },
      );
    }

    if (
      !result ||
      typeof result.url !== "string" ||
      !result.url.startsWith("https://")
    ) {
      return NextResponse.json(
        { error: "Supabase no devolvió una URL de pago HTTPS válida." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: result.url });
  } catch (error) {
    console.error("BOOM POS Flow create proxy error", error);

    return NextResponse.json(
      { error: "No se pudo iniciar el pago. Revisa los registros de Supabase." },
      { status: 500 },
    );
  }
}
