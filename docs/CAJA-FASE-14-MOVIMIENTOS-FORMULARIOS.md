# BOOM POS — Caja Fase 14

## Cambios
- Los movimientos de ingreso y egreso obtienen el usuario con `supabase.auth.getUser()` y consultan `profiles.company_id` desde la sesión autenticada.
- Antes de insertar, validan que el perfil corresponda a la empresa activa y que el turno siga abierto en Supabase.
- Insertan `cash_movements` con `company_id` del perfil autenticado y `created_by` igual a `auth.uid()`.
- Los formularios de apertura, ingreso, egreso y cierre usan las clases visuales compartidas del framework (`modal-head`, `modal-icon`, `form-grid`, `field-label`, `notice error`, `modal-actions`, botones `primary`/`secondary`), textos de ayuda, etiquetas CLP y adaptación responsive heredada del framework.

## Despliegue
Reemplazar `componentes/pos-shell.tsx` por el archivo incluido y desplegar. No requiere SQL y no modifica políticas RLS.

## Validación pendiente
El ZIP no se ha compilado ni probado contra la instancia Supabase del usuario. Después del despliegue, probar un egreso pequeño y confirmar que aparece en Movimientos del turno y actualiza el saldo esperado.
