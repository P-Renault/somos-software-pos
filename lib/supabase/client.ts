import { createBrowserClient } from "@supabase/ssr";

/**
 * Crea el cliente únicamente cuando una acción del navegador lo necesita.
 * Se admite la clave legacy ANON además de la Publishable para mantener
 * compatibilidad con la configuración existente de BOOM POS.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "Falta configurar NEXT_PUBLIC_SUPABASE_URL y una clave pública (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY) en el entorno de compilación de BOOM POS.",
    );
  }

  return createBrowserClient(url, key);
}
