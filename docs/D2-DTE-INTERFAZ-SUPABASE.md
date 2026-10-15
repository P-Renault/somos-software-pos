# BOOM POS — DTE/SII: integración de interfaz con Supabase

## Archivos
- `componentes/pos-shell.tsx`: reemplazo completo del componente utilizado por `app/page.tsx`.

## Qué incorpora
- Consulta `dte_company_settings` y `dte_documents` filtrando siempre por `company_id`.
- Permite guardar la configuración tributaria de la empresa autenticada.
- Muestra documentos y métricas únicamente desde los datos consultados en Supabase.
- Retira los folios y clientes de muestra de la pantalla DTE/SII.
- Distingue tipos 33, 34, 39 y 41.
- No envía documentos al SII ni firma XML.

## Requisitos previos
Aplicar la migración D1 `004_dte_foundation.sql`, que crea:
`dte_company_settings`, `dte_documents`, `dte_document_items`, `dte_events`.

La tabla `profiles` debe contener `company_id` y la página `app/page.tsx` debe pasar `company.id` al componente, como hace el repositorio actual.

## Integración
Reemplazar el archivo completo `componentes/pos-shell.tsx` por el incluido en este ZIP. No se necesita SQL adicional para este cambio de interfaz.

## Validación pendiente
- Compilar el proyecto y resolver cualquier incompatibilidad con el estado actual de dependencias.
- Probar guardar y volver a cargar configuración.
- Verificar aislamiento entre dos empresas.
- No habilitar emisión real hasta implementar y probar CAF, firma, XML, comunicación y certificación SII.
