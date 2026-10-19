# BOOM POS — Facturación, Fase 1

## Entrega
- `componentes/billing-panel.tsx`: módulo de facturación conectado a ventas y solicitudes DTE de Supabase.
- `componentes/pos-shell.tsx`: conecta el módulo Facturación y reemplaza el panel ficticio anterior; la vista DTE/SII informa el estado real de preparación y mantiene la emisión oficial bloqueada.

## Funcionalidad
- Consulta ventas reales filtradas por `company_id`, búsqueda y filtro de estado.
- Indicadores derivados de la consulta real, sin cifras de muestra.
- Detalle de venta con referencia interna, receptor, tipo de documento solicitado, estado y total.
- Lista de trabajos de `dte_issuance_jobs` de la empresa actual.
- Acción autenticada `prepare` hacia la Edge Function `dte-issue`, con clave de idempotencia nueva y payload vinculado a la venta.
- Mensajes explícitos: preparar una solicitud no significa emitir, firmar, foliar ni transmitir un DTE.
- Diseño adaptable y coherente con las clases visuales de BOOM POS.

## Requisitos
- La migración existente que crea `dte_issuance_jobs` y el RPC `dte_prepare_job_atomic` debe estar instalada.
- La Edge Function `dte-issue` debe estar desplegada con JWT verificado.
- La tabla `sales` debe exponer `company_id`; se consultan sus filas con la sesión autenticada y el filtro de empresa.

## Límites de esta fase
No genera XML oficial, no firma, no reserva folios CAF, no envía documentos al SII, no afirma aceptación tributaria y no habilita producción. Tampoco crea una tabla de facturas paralela: las ventas siguen siendo la fuente comercial y las solicitudes DTE su propio historial.

## Pruebas recomendadas en staging
1. Iniciar sesión con una empresa que tenga ventas.
2. Confirmar que la lista solo contiene ventas de esa empresa y que los totales coinciden con Supabase.
3. Abrir el detalle de una venta.
4. Preparar un DTE de prueba y verificar una solicitud/evento en las tablas DTE.
5. Confirmar que el mensaje indica que no hubo emisión oficial.
6. Probar en móvil y escritorio; revisar errores de esquema/RLS antes de producción.
