# BOOM POS — Caja Fase 13: corrección de apertura de turno

## Archivo modificado
- `componentes/pos-shell.tsx`

## Cambio
Al abrir un turno, el cliente ahora obtiene el usuario actual con `supabase.auth.getUser()`, consulta `profiles.company_id` mediante la sesión autenticada, verifica que coincida con la empresa activa y valida que la caja seleccionada pertenezca a esa empresa y esté activa. La inserción usa el `company_id` del perfil y el ID autenticado como `opened_by`.

No modifica políticas RLS ni desactiva controles de seguridad. No se ha compilado ni probado contra el proyecto Supabase del usuario.

## Despliegue y validación
1. Reemplazar el archivo respetando la ruta del ZIP.
2. Desplegar la aplicación.
3. Cerrar sesión y volver a entrar.
4. En Caja, seleccionar `CAJA-01`, ingresar un saldo inicial y confirmar.
5. Si falla, copiar el mensaje completo que aparezca en pantalla.

## Migración multicaja pendiente
La base todavía tiene el índice `cash_sessions_one_open_per_company`, que impide turnos simultáneos en cajas distintas de la misma empresa. No se elimina en esta fase para separar la corrección de RLS de la migración de multicaja.
