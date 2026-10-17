# BOOM POS — Módulo de Suscripciones

## Archivos incluidos
- `componentes/pos-shell.tsx`: shell completo actualizado, mantiene los módulos existentes y añade navegación de Suscripciones, planes y panel inicial.
- `supabase/migrations/004_boom_pos_subscriptions.sql`: migración idempotente para planes, solicitudes, pagos y control del primer acceso.
- `BOOM-POS-SUSCRIPCIONES.sql`: copia para pegar directamente en Supabase SQL Editor.
- `docs/SUSCRIPCIONES-INSTALACION.md`: pasos de instalación y límites actuales.

## Instalación
1. Haz una copia del repositorio antes de reemplazar archivos.
2. Ejecuta `BOOM-POS-SUSCRIPCIONES.sql` en Supabase SQL Editor.
3. Sustituye `componentes/pos-shell.tsx` por el incluido en el paquete.
4. Despliega y prueba con un usuario de prueba nuevo.

## Planes configurados
- Gratis: $0 CLP/mes.
- Emprendedor: $4.990 CLP/mes.
- Pro: $9.990 CLP/mes.
- Business: $19.990 CLP/mes.
- Implementación completa: $599.000 CLP pago único, todas las funcionalidades habilitadas.

## Comportamiento y seguridad
- El RPC de onboarding guarda en Supabase que el panel se mostró, para que no se repita en cada login ni dependa del almacenamiento del navegador. El despliegue registra una fecha de inicio: el modal automático se reserva a cuentas creadas desde ese despliegue, para no interrumpir a usuarios antiguos.
- La selección crea una solicitud de suscripción y un pago pendiente. No activa planes pagados ni simula un cobro.
- El plan Gratis queda activo al seleccionarse.
- La confirmación del proveedor de pagos, el cambio de plan, el vencimiento mensual y la autorización real de funcionalidades requieren conectarse al flujo de pago y al control de permisos del producto. Este paquete no declara esa integración como terminada.
- Los planes mensuales conservan los precios establecidos anteriormente. La licencia de implementación se registra como pago único, no como renovación mensual.

## Validación posterior
1. Registrar usuario nuevo y confirmar que aparece el panel inicial una sola vez.
2. Cerrar sesión y entrar nuevamente: no debe volver a abrirse automáticamente.
3. Abrir Suscripciones desde la navegación: los planes siguen disponibles.
4. Solicitar un plan pagado: debe quedar `pending_payment`, nunca `active` por una redirección.
5. Seleccionar Gratis: debe quedar activo con estado de pago `waived`.
6. Confirmar que Productos, Inventario y Clientes siguen funcionando sin cambios de lógica.
