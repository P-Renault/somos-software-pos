# Fase 7 — KPI con datos reales

- Inicio, Ventas y Reportes consultan `public.sales`, filtrado por la empresa activa y el periodo de los últimos siete días.
- Las tarjetas de ventas se calculan desde ventas con estado `completed` o `confirmed`; si Supabase devuelve error, se muestra “No disponible” y no se inventan cifras.
- Los KPI de Productos e Inventario derivan del catálogo de Supabase cargado por el módulo.
- Caja y Finanzas dejan de mostrar montos de ejemplo y señalan explícitamente que sus fuentes reales aún no están conectadas. Los demás módulos sin fuente KPI conectada muestran estado de integración, no cifras simuladas.

## Importante antes del despliegue
La consulta usa columnas `id, sale_number, customer_name, total_amount, status, created_at` de `public.sales`. Confirma que coincidan con la migración aplicada en Supabase. La consulta depende de RLS y filtra por `company_id`.

Este ZIP no conecta todavía el libro de caja, libro financiero ni motor de facturación. No se ha ejecutado `npm run build` ni se ha conectado a la instancia Supabase del usuario.
