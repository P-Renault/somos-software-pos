# Arquitectura BOOM POS

La presentación es independiente de los motores de dominio. `components/pos-shell.tsx` concentra el shell, navegación y prototipos de módulo. `app/page.tsx` obtiene identidad y empresa reales desde Supabase. `app/auth/confirm/route.ts` valida el correo y middleware protege las rutas privadas.

Motores futuros: catálogo/categorías y Storage; inventario; ventas/pagos/caja; compras/proveedores; clientes; DTE/SII; reportes/finanzas; suscripciones.

Flujo crítico: VENTA → PAGO → INVENTARIO → CAJA → DTE → AUDITORÍA. El backend deberá calcular precios, impuestos, descuentos y stock; no confiar en cálculos del navegador. Cada motor debe validar permisos RLS, aislar por company_id y auditar operaciones críticas.
