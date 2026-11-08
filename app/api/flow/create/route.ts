
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    // 1. Validar la sesión del usuario.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Debes iniciar sesión para contratar un plan." },
        { status: 401 },
      );
    }

    // 2. Obtener el identificador de la suscripción.
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

    // 3. Obtener la URL pública de Supabase.
    // Las claves privadas de Flow permanecen en Supabase Edge Functions.
    const projectUrl = (
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.PROJECT_URL ||
      ""
    ).trim().replace(/\/+$/, "");

    if (!projectUrl) {
      return NextResponse.json(
        {
          error:
            "Falta NEXT_PUBLIC_SUPABASE_URL en Vercel para el proyecto Supabase de BOOM POS.",
        },
        { status: 503 },
      );
    }

    let parsedProjectUrl: URL;

    try {
      parsedProjectUrl = new URL(projectUrl);
    } catch {
      return NextResponse.json(
        { error: "La URL del proyecto Supabase no es válida." },
        { status: 503 },
      );
    }

    if (parsedProjectUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "La URL de Supabase debe utilizar HTTPS." },
        { status: 503 },
      );
    }

    // 4. Obtener el token de la sesión autenticada.
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

    // 5. Invocar la Edge Function de Supabase.
    // Esta función debe validar la suscripción y crear el pago en Flow.
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

      console.error("BOOM POS: error al crear el pago", {
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

    // 6. Flow debe devolver tanto la URL de checkout como el token.
    if (
      !result ||
      typeof result.url !== "string" ||
      typeof result.token !== "string" ||
      !result.url.startsWith("https://") ||
      !result.token.trim()
    ) {
      console.error("BOOM POS: respuesta incompleta de Flow", {
        hasUrl: typeof result?.url === "string",
        hasToken: typeof result?.token === "string",
      });

      return NextResponse.json(
        {
          error:
            "Flow no devolvió la URL y el token requeridos para abrir el pago.",
        },
        { status: 502 },
      );
    }

    // 7. Construir la URL final de checkout.
    // No se debe descartar el token devuelto por Flow.
    const checkoutUrl = new URL(result.url);
    checkoutUrl.searchParams.set("token", result.token);

    // 8. Devolver la URL final al frontend.
    return NextResponse.json(
      { url: checkoutUrl.toString() },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("BOOM POS: error interno al iniciar Flow", error);

    return NextResponse.json(
      {
        error:
          "No se pudo iniciar el pago. Revisa los registros de Supabase y Vercel.",
      },
      { status: 500 },
    );
  }
}
