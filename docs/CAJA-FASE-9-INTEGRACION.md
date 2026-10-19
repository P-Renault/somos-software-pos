# BOOM POS — Caja Fase 9: integración de interfaz

## Archivo modificado
- `componentes/pos-shell.tsx`

## Requisitos previos
La migración de Fase 8 debe estar aplicada: `public.cash_sessions` y `public.cash_movements`, con RLS y `profiles.id = auth.uid()` / `profiles.company_id`.

## Funciones conectadas
- Consulta la última sesión de la empresa y detecta si existe una sesión abierta.
- Apertura persistente con saldo inicial y usuario autenticado.
- Registro de ingresos y egresos manuales con motivo, monto, empresa, sesión y usuario.
- KPI calculados desde la sesión, los movimientos y pagos confirmados en efectivo consultados en `sale_payments` relacionados con `sales`.
- Arqueo y cierre persistente con efectivo contado, esperado y diferencia.
- Muestra errores de consulta/guardado en vez de reemplazar los datos con cifras simuladas.

## Fórmula del efectivo esperado
Saldo inicial + pagos de venta confirmados en efectivo desde la apertura + ingresos manuales − egresos manuales.

## Límites conocidos
- La vista de movimientos lista movimientos manuales; los pagos de ventas se contabilizan por separado en el KPI.
- No se modificó el motor de ventas ni se creó una segunda ruta de registro de pagos.
- Debe verificarse en el esquema instalado que `sale_payments.method`, `sale_payments.status`, `sale_payments.amount` y la relación `sale_payments.sale_id -> sales.id` correspondan a la versión desplegada. Si el esquema difiere, la interfaz mostrará el error de consulta.
- La consulta de pagos usa `sales.status` y `sales.created_at`; el total debe contrastarse en la validación funcional antes de producción.
- No se ejecutó build de Next.js ni prueba contra la instancia de Supabase en este entorno.
