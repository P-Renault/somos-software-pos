# BOOM POS D2 — RUT de empresa, RUT de usuario e indicadores DTE

## Archivos integrados
- `app/login/page.tsx`: el registro solicita nombre, empresa, RUT de empresa, RUT del usuario responsable, correo y contraseña. Valida el dígito verificador del RUT antes de enviar el registro a Supabase Auth.
- `componentes/pos-shell.tsx`: elimina las métricas de muestra del encabezado DTE, muestra métricas calculadas a partir de `dte_documents`, incorpora el RUT del usuario responsable y actualiza `companies.tax_id` y `companies.name` al guardar la configuración tributaria.

## SQL
Ejecutar `supabase/migrations/005_company_user_rut.sql` en Supabase después de D1. Agrega `profiles.user_tax_id` y políticas de actualización por usuario/empresa. Revisar políticas RLS existentes antes de producción.

## Importante sobre el alta
El RUT del usuario se guarda como metadato de Supabase Auth durante el registro; para persistirlo en `profiles.user_tax_id`, el proceso de provisión de perfil debe copiar `auth.users.raw_user_meta_data->>'user_tax_id'` a `profiles.user_tax_id`. Si la cuenta ya existe, el nuevo campo puede actualizarse desde una pantalla de perfil o con una operación administrativa segura.

## Prueba
1. Aplicar la migración SQL.
2. Integrar los archivos y desplegar.
3. Registrar una cuenta de prueba con RUTs válidos.
4. Confirmar que el perfil tiene `user_tax_id`.
5. En DTE/SII, ingresar el RUT oficial de Somos Software y guardar.
6. Recargar y confirmar que `companies.tax_id` y `dte_company_settings.issuer_rut` coinciden.
7. Confirmar que los indicadores superiores no muestran cifras ficticias.

No habilita emisión real ni transmite documentos al SII.
