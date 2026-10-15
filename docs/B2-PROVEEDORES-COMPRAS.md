# BOOM POS B2 — Proveedores y Compras

## Integración

1. Integra los archivos del ZIP respetando sus rutas.
2. En Supabase → SQL Editor, ejecuta el contenido completo de `supabase/migrations/003_suppliers_purchases.sql`.
3. Espera a que el despliegue de Vercel termine y abre BOOM POS con un usuario asociado a una empresa.
4. En **Proveedores**, crea un proveedor, actualízalo y comprueba que aparece después de recargar.
5. En **Productos**, confirma que exista al menos un producto activo.
6. En **Compras**, registra una compra con proveedor, producto, cantidad, costo, fecha y documento opcional.
7. Comprueba que la compra aparece en el historial y que el stock del producto aumentó en la cantidad recibida.

## Qué incorpora

- Proveedores persistentes por empresa: razón social, RUT, contacto, teléfono, correo y dirección.
- Edición y desactivación lógica de proveedores, sin eliminar el historial.
- Registro de compras con un producto por operación en esta primera entrega.
- RPC transaccional `register_purchase_b2`: registra cabecera, detalle y actualiza stock/costo en una única transacción.
- RLS y validación del `company_id` del usuario autenticado.

## Alcance y límites

Esta versión registra una línea de producto por compra para establecer el flujo de abastecimiento de punta a punta. El siguiente incremento podrá añadir múltiples productos por documento, impuestos, descuentos, pagos parciales y recepción parcial. No emite documentos tributarios ni reemplaza la integración DTE/SII.

La ejecución del SQL es necesaria para que el módulo funcione; copiar los archivos no modifica por sí solo Supabase ni publica el sitio.
