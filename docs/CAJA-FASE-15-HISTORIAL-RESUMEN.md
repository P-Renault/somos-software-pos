# BOOM POS — Caja Fase 15

## Objetivo
Mostrar el último turno cerrado de la caja seleccionada cuando no exista un turno abierto, cargar sus movimientos persistidos y mostrar el resumen de cierre sin habilitar operaciones sobre un turno cerrado.

## Cambios
- `loadCash` selecciona el turno abierto de la caja; si no existe, selecciona el último turno de esa caja para consulta histórica.
- Carga movimientos desde `cash_movements` usando el `session_id` seleccionado, incluso cuando el turno está cerrado.
- El resumen usa `expected_amount` guardado al cierre y lo identifica como histórico.
- Los botones de ingreso, egreso y cierre solo se muestran para turnos abiertos.
- Permite abrir un nuevo turno sin modificar el registro histórico anterior.

## Validación pendiente
El archivo fue modificado estáticamente; debe compilarse y probarse en el entorno del proyecto. Esta corrección de interfaz no recupera movimientos que nunca se hayan insertado en Supabase.
