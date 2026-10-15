# BOOM POS — siguiente paso DTE/SII

## Estado
La interfaz observada corresponde a simulación. Los registros no son documentos tributarios oficiales y no deben declararse aceptados por el SII.

## Qué resuelve este paquete
- Separa las fuentes Deno de Supabase Edge Functions del TypeScript compilado por Next.js.
- Usa `npm:@supabase/supabase-js@2` mediante el mapa de importación de Deno.
- Mantiene autenticación y resolución de empresa desde `profiles`.
- Mantiene bloqueada la emisión real y no simula folios ni respuestas SII.

## Qué no resuelve
No implementa el XML DTE oficial, validación XSD, firma XMLDSIG, token/autenticación SII, CAF, reserva de folios, envío, consulta de track ID ni reconciliación de respuestas. Esos pasos requieren seguir el material técnico del SII y validar en certificación antes de producción.
