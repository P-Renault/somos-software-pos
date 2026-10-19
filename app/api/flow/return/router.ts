
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Método no permitido.", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const appUrl = Deno.env.get("BOOM_POS_APP_URL");

    if (!appUrl) {
      return new Response("Falta configurar BOOM_POS_APP_URL.", {
        status: 503,
        headers: corsHeaders,
      });
    }

    const normalizedAppUrl = appUrl.replace(/\/$/, "");

    // Evitar redirecciones a dominios arbitrarios.
    if (!normalizedAppUrl.startsWith("https://")) {
      return new Response("BOOM_POS_APP_URL debe utilizar HTTPS.", {
        status: 503,
        headers: corsHeaders,
      });
    }

    let token: string | null = null;

    if (request.method === "GET") {
      const incomingUrl = new URL(request.url);
      token = incomingUrl.searchParams.get("token");
    } else {
      const contentType = request.headers.get("content-type") || "";

      if (contentType.includes("application/x-www-form-urlencoded")) {
        const form = new URLSearchParams(await request.text());
        token = form.get("token");
      } else if (contentType.includes("application/json")) {
        const body = await request.json().catch(() => ({}));
        token = typeof body.token === "string" ? body.token : null;
      }
    }

    // El token solo indica que el usuario volvió desde Flow.
    // No es prueba de pago ni debe activar una suscripción.
    const destination = new URL("/", normalizedAppUrl);

    destination.searchParams.set("provider", "flow");
    destination.searchParams.set("payment", "return_received");

    if (token && token.length <= 500) {
      destination.searchParams.set("flow_return", "1");
    } else {
      destination.searchParams.set("flow_return", "1");
    }

    return new Response(null, {
      status: 303,
      headers: {
        ...corsHeaders,
        Location: destination.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("flow-return error:", error);

    return new Response("No fue posible volver a BOOM POS.", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
