# BOOM POS — Caja Fase 11: historial y multicaja

## Archivo actualizado
- `componentes/pos-shell.tsx`

## Requisitos
- Aplicar la migración que crea `cash_registers` y `cash_sessions.cash_register_id`.
- La tabla `profiles` debe contener `id` y `company_id`.
- El usuario autenticado debe tener permisos RLS para crear y consultar cajas, sesiones y movimientos.

## Funcionalidades
- Carga de cajas físicas activas de la empresa.
- Alta de caja con código y nombre.
- Apertura de turno, registro de ingresos/egresos y cierre con efectivo contado.
- Historial visual de los últimos cinco turnos cerrados, sin borrar los anteriores.

## Límites conocidos
- Este cambio calcula el efectivo esperado con saldo inicial y movimientos manuales; no incluye todavía pagos de ventas en el cálculo por caja porque `sale_payments` no tiene vínculo explícito con `cash_register_id` en el esquema confirmado.
- Los turnos históricos creados antes de la migración mantienen `cash_register_id = NULL` y aparecen con etiqueta histórica genérica.
- No se implementa enforcement del límite de cajas por plan; requiere conectarse al motor de licencias/suscripciones.
- La autorización de creación de caja depende de las políticas RLS aplicadas en Supabase.
