# BOOM POS — corrección de rutas Flow

El registro de Vercel muestra que el código aún compilado está en `app/api/flow/confirmation/router.ts` y contiene `Deno.serve()`. Esta entrega incluye los archivos `router.ts` originales reemplazados además de las rutas válidas `route.ts` de Next.js.

Copiar las carpetas `app` y `docs` a la raíz del repositorio, aceptando reemplazar archivos. Luego comprobar en GitHub que el archivo `app/api/flow/confirmation/router.ts` ya no contenga `Deno.serve` antes de desplegar.

Variables esperadas en Vercel: `FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_API_BASE_URL`, `PROJECT_URL`, `PROJECT_SERVICE_ROLE_KEY`, `BOOM_POS_APP_URL`.

Este paquete corrige la incompatibilidad de runtime señalada por el build. No implica que una transacción real de Flow haya sido validada; antes de producción, confirmar el esquema de tablas y probar el ciclo de pago.
