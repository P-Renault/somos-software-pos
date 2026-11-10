# BOOM POS · Diseño de medición y venta por peso

## Decisiones aprobadas
- Unidad base flexible por producto.
- Captura híbrida: manual y balanza electrónica.
- Precisión máxima de cantidad: 4 decimales.

## Fase 1 implementada en esta entrega
- Se amplía `products` con `inventory_unit`, `sale_unit`, `sale_to_inventory_factor`, `quantity_precision` y `measurement_mode`.
- `stock` y `min_stock` pasan de `numeric(14,3)` a `numeric(14,4)`.
- El formulario de productos permite configurar unidades compatibles, factor de conversión y modo de captura.
- La unidad de inventario es la unidad canónica de existencias. Ejemplo: inventario en kg y venta en g con factor 0.001.
- La migración agrega restricciones de dimensión: masa con masa, volumen con volumen y conteo con conteo.

## Reglas de dominio
1. `cantidad_base = cantidad_venta × sale_to_inventory_factor`.
2. El stock, las compras y los movimientos deben expresarse en `inventory_unit`.
3. Los importes se calculan con la cantidad vendida en `sale_unit` y el precio unitario definido para esa misma unidad.
4. Se redondean cantidades a la precisión configurada (máximo 4 decimales); no se debe usar `toFixed` como mecanismo de cálculo monetario.
5. No se debe confirmar una venta offline como completada. La sincronización debe validar stock en el servidor.

## Próximas fases bloqueadas por el contrato SQL ausente
El ZIP recibido no contiene la definición de `complete_sale_atomic`, ni las definiciones de `sales` y `sale_items`. Por ello esta entrega no altera el contrato RPC ni habilita aún cantidades fraccionarias en el checkout: hacerlo desde el cliente sin adaptar la función SQL permitiría inconsistencias o rechazos.

### Fase 2 · Venta fraccionada
- Cambiar validación de cantidades enteras en `sales-panel.tsx` y `lib/offline-storage.ts`.
- Capturar cantidad con hasta 4 decimales y mostrar la unidad de venta.
- Enviar a la RPC cantidad de venta y cantidad base, o enviar cantidad de venta y resolver la conversión dentro de SQL usando la configuración vigente del producto.
- Actualizar `complete_sale_atomic` para bloquear productos, validar stock base, calcular importe, guardar detalle y movimiento de inventario en una sola transacción.

### Fase 3 · Balanzas
- Crear adaptadores desacoplados por protocolo/interfaz.
- Primer soporte genérico: dispositivos USB/serial compatibles con Web Serial en navegadores soportados, más integración local cuando el fabricante requiera driver o SDK.
- Capturar lectura estable, unidad, tara, peso bruto/neto, dispositivo y timestamp.
- La captura manual permanece disponible como alternativa y contingencia.

### Fase 4 · QA
- Casos: kg↔g, L↔ml, cantidad con 4 decimales, tara, peso cero/negativo, lectura inestable, desconexión, doble envío idempotente, stock concurrente, sincronización offline y redondeo de CLP.
- No desplegar la migración en producción hasta probarla en un entorno Supabase de desarrollo.

## Importante
La migración y los cambios de interfaz deben aplicarse juntos. Esta entrega es la base de configuración del producto, no una implementación terminada de pesaje electrónico ni de ventas fraccionarias.
