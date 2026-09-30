# Sprint 0.1 — Health Check técnico

## Objetivo

Validar y diferenciar la comunicación entre Vercel/Next.js y Supabase sin confundir una respuesta de permisos/RLS con una caída de conexión.

## Cambios

- `app/page.tsx` ahora clasifica la respuesta de Supabase por código de error.
- `42501` se presenta como acceso protegido por permisos/RLS.
- `42P01` se presenta como tabla no encontrada.
- Códigos de conexión (`08...`) y errores `fetch` se presentan como error de conexión.
- `tsconfig.json` incluye `baseUrl` y el alias `@/*` para resolver imports como `@/lib/supabase/server`.

## Siguiente incremento

Auth + RLS por compañía, sin abrir políticas permisivas ni incorporar secretos al frontend.

## Despliegue

1. Extraer el ZIP.
2. Subir/reemplazar el contenido del repositorio GitHub `P-Renault/somos-software-pos`.
3. Confirmar el commit en `main`.
4. Vercel realizará el despliegue automático.
5. Verificar la tarjeta `Supabase → PostgreSQL` en producción.
