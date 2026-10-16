BOOM POS — Módulo Clientes (integración inicial)

Incluye:
- Listado persistente desde Supabase, filtrado por company_id.
- Crear y editar fichas de persona/empresa.
- Campos: nombre/razón social, tipo, RUT, teléfono, correo, dirección y notas.
- Validación de dígito verificador del RUT chileno cuando se informa.
- Búsqueda por nombre, RUT, teléfono o correo.
- Filtros Todos/Activos/Archivados.
- Archivado lógico y reactivación (no se borran fichas).
- Exportación CSV de los registros filtrados.
- RLS por profiles.company_id; no se permite borrar registros desde el cliente.

Instalación:
1. Haz respaldo antes de modificar producción.
2. En Supabase SQL Editor, ejecuta el contenido de BOOM-POS-MODULO-CLIENTES.sql una sola vez.
3. Sustituye componentes/pos-shell.tsx por el archivo incluido en el ZIP.
4. Despliega en Vercel y prueba crear, editar, archivar/reactivar y exportar un cliente de prueba.

Dependencias esperadas del esquema existente:
- public.companies(id uuid)
- public.profiles(id uuid, company_id uuid)
- public.set_updated_at() ya creado por la migración inicial.

Alcance explícito:
Este sprint implementa el directorio CRUD de clientes. La vinculación formal de client_id con ventas históricas y la selección de ficha de cliente desde el checkout deben hacerse como integración coordinada posterior, porque la función transaccional de ventas actualmente recibe customer_name/customer_rut y el esquema real de ventas se ha modificado durante el diagnóstico de producción.

Validación:
No se declara validado en producción hasta ejecutar la migración, confirmar compilación en Vercel y hacer pruebas CRUD con la cuenta de la empresa correcta.
