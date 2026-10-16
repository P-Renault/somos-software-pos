# BOOM POS — Sprint de ventas transaccionales (base backend)

## Alcance de esta entrega

Esta migración crea una base transaccional para registrar ventas desde Supabase y actualizar inventario y pagos dentro de una única transacción de PostgreSQL. Es un paso previo para conectar después el checkout de la interfaz y, cuando corresponda, el flujo de DTE.

Incluye:
- `sales`: cabecera, totales, método de pago, clave idempotente y estado.
- `sale_items`: detalle y snapshot del producto/precio/impuesto aplicado.
- `sale_payments`: pagos individuales para ventas con medio mixto.
- `inventory_movements`: auditoría de las salidas de inventario.
- Campos de tratamiento tributario en `products` (`tax_exempt`, `tax_rate`).
- `complete_sale_atomic(...)`: comprueba usuario y empresa, bloquea productos, valida stock, calcula importes desde los precios almacenados, registra la venta, descuenta stock y registra movimientos/pagos de forma atómica.
- RLS de lectura por empresa. Las escrituras de venta se realizan mediante RPC autenticada.
- Idempotencia por empresa para evitar registrar dos veces la misma solicitud.

## Aplicación

1. Ejecutar `supabase/migrations/002_sales_checkout_atomic.sql` en el SQL Editor de Supabase, después de la migración inicial.
2. Revisar el resultado y comprobar que las tablas y la función se crearon.
3. Probar primero con una empresa de pruebas y productos de prueba.
4. Después conectar el botón de cobro de `Ventas` a `supabase.rpc('complete_sale_atomic', ...)` y recargar productos/stock/ventas tras una respuesta correcta.

## Contrato de RPC

```ts
supabase.rpc('complete_sale_atomic', {
  p_idempotency_key: crypto.randomUUID(),
  p_items: cart.map(item => ({ product_id: item.id, quantity: item.qty })),
  p_payment_method: 'cash', // cash | card | transfer | credit | mixed
  p_customer_name: 'Consumidor final',
  p_customer_rut: null,
  p_payments: null // para mixed: [{ method: 'cash', amount: 5000 }, ...]
});
```

El cliente nunca envía precios ni totales como fuente de verdad: la función los obtiene de `products`. Para `mixed`, la suma de pagos debe coincidir con el total calculado por el servidor.

## Límites conocidos

- Esta entrega añade la base SQL; todavía no conecta el botón de cobro de la interfaz. El checkout sigue siendo prototipo hasta integrar y probar la llamada RPC.
- No emite ni firma DTE, no asigna folios CAF, no se conecta al SII y no reemplaza la certificación tributaria.
- Los productos nuevos heredan IVA de 19% por defecto. Revisar `tax_exempt` y `tax_rate` para cada producto antes de usar datos reales.
- El cálculo considera `sale_price` como precio final con impuesto incluido. Confirmar que este criterio coincide con la política de precios de la empresa.
- No incorpora todavía devoluciones, anulaciones, descuentos, cambio de precio por cliente, cierres de caja ni conciliación bancaria.
- La función no crea una sesión de caja; esa integración debe hacerse en una fase posterior.

## Pruebas mínimas tras aplicar

- Venta en efectivo con stock suficiente: crea venta, detalle, pago y movimiento; reduce stock.
- Stock insuficiente: la transacción completa debe fallar sin dejar registros parciales.
- Repetición de la misma clave de idempotencia: devuelve la venta existente sin volver a descontar stock.
- Pago mixto cuyo total no coincide: rechaza la venta.
- Usuario sin empresa o producto de otra empresa: rechaza la operación.
- Producto exento: no calcula IVA; producto afecto: extrae el impuesto incluido desde `tax_rate`.
