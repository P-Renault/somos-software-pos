# BOOM POS — corrección de flujo Flow y retorno

## Rutas Next.js
- `app/api/flow/create/route.ts` crea el pago en Flow.
- `app/api/flow/confirmation/route.ts` valida la operación consultando Flow desde el servidor y registra el pago.
- `app/api/flow/return/route.ts` verifica el estado para informar al usuario y redirige con `payment_result=approved|rejected|pending`.

Se eliminaron los archivos `router.ts` que contenían `Deno.serve()`; no son rutas Next.js y causaban el error de compilación de Vercel.

## Secrets Vercel Production
`FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_API_BASE_URL` (`https://www.flow.cl/api`), `PROJECT_URL`, `PROJECT_SERVICE_ROLE_KEY`, `BOOM_POS_APP_URL`. Las variables de Supabase Edge Functions no se transfieren automáticamente a Vercel.

## Error PLAN_NOT_FOUND_OR_INACTIVE
Este error ocurre antes de redirigir a Flow: el RPC `boom_pos_request_subscription` no encuentra un registro activo para el `p_plan_code` recibido. Revisar en Supabase el catálogo de planes y confirmar que estén activos los códigos exactos: `free`, `emprendedor`, `pro`, `business`, `perpetual_implementation`. No se modifica automáticamente el catálogo porque el ZIP de origen no contiene la definición SQL de esa tabla/RPC y no es seguro adivinar sus columnas.

## Validación pendiente
No declarar producción validada hasta compilar con `npm run build`, revisar el esquema real de las tablas `boom_pos_subscriptions` y `boom_pos_subscription_payments`, y realizar transacciones de prueba aprobada y rechazada.
