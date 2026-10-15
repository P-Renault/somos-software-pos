# BOOM POS · D1 — Fundación del motor DTE propio

## Alcance de este incremento

Este incremento prepara la persistencia segura y trazable para boletas electrónicas 39/41 y facturas electrónicas 33/34. No genera folios, no firma XML, no se conecta al SII y no habilita emisión tributaria real. El estado inicial de todo documento es `draft`; el folio queda `NULL`.

## Archivos de esta entrega

- `supabase/migrations/004_dte_foundation.sql`: tablas, índices, RLS y trazabilidad.
- `docs/D1-PLAN-MOTOR-DTE.md`: arquitectura, fases y pruebas.

## Modelo de datos

- `dte_company_settings`: datos tributarios por empresa y ambiente.
- `dte_documents`: cabecera, tipo DTE, estado, receptor, montos, respuesta y referencias SII.
- `dte_document_items`: líneas y snapshot de productos/precios al momento de preparar el documento.
- `dte_events`: historial de cambios de estado y errores.

El esquema no guarda claves privadas ni archivos PFX/P12. En producción, estos deben mantenerse fuera del navegador y de las tablas de acceso normal, usando un servicio seguro de secretos o un gestor de claves. `xml_unsigned` y `xml_signed` están reservados para la siguiente fase; no deben poblarse con XML inventado o sin validar.

## Arquitectura objetivo

1. **D1 — Persistencia** (esta entrega): esquema y políticas RLS por `company_id`.
2. **D2 — Perfil tributario**: validar RUT, razón social, giro, domicilio, comuna/ciudad, sucursales y datos del receptor.
3. **D3 — Núcleo documental**: cálculo de montos, reglas de tipo 33/34/39/41, snapshots de detalle y validaciones. No asignar folios todavía.
4. **D4 — CAF y folios**: carga segura y validación de CAF por tipo DTE; reserva atómica de folios para impedir duplicados.
5. **D5 — XML y firma**: generar XML con el formato/XSD vigente del SII, TED cuando corresponda, firma XMLDSIG y validación local.
6. **D6 — Transporte SII**: autenticación, envío, seguimiento de track ID, consulta de estado, reintentos idempotentes y manejo de rechazos en ambiente de certificación.
7. **D7 — Certificación**: ejecutar el set de pruebas oficial para los tipos que se certifiquen, completar el procedimiento del SII y obtener autorización antes de producción.
8. **D8 — Integración Ventas**: vincular venta, pago, emisión, impresión/representación y entrega del DTE; definir reversas y notas de crédito conforme a normativa.

## Reglas críticas

- El tipo 33 corresponde a factura electrónica afecta; 34 a factura exenta/no afecta; 39 a boleta electrónica afecta; 41 a boleta exenta/no afecta. Confirmar los requisitos vigentes del SII para cada caso antes de certificar.
- No usar folios de prueba en producción ni fabricar CAF/TED.
- No declarar un documento como aceptado por el SII hasta consultar una respuesta real y correlacionarla con el documento.
- No confiar en `company_id` enviado desde el cliente: derivarlo del perfil autenticado en el backend.
- Toda operación de envío debe ser idempotente; los reintentos no pueden emitir un documento duplicado.
- Separar estrictamente certificación y producción.
- No guardar claves tributarias del SII ni claves privadas en código, GitHub, variables `NEXT_PUBLIC_*` o tablas accesibles al usuario.
- Registrar eventos de creación, firma, envío, respuesta, rechazo y anulación, con permisos restringidos.

## Pruebas de aceptación de D1

1. Aplicar la migración en un entorno de desarrollo con las tablas base existentes.
2. Confirmar que se crean las cuatro tablas y sus índices.
3. Confirmar que un usuario autenticado solo puede consultar filas de su empresa.
4. Confirmar que el insert directo de documentos solo permite `draft`, sin folio, sin firma y en certificación.
5. Confirmar que los usuarios no pueden modificar estados ni registrar eventos arbitrarios mediante acceso directo a tablas.
6. Verificar que no se puede asignar un mismo folio para la misma empresa y tipo DTE.
7. Mantener la emisión real deshabilitada hasta terminar D2–D7 y la certificación oficial.

## Referencias oficiales

- SII, Sistema de Facturación Propio o de Mercado: https://www.sii.cl/factura_electronica/factura_mercado/menu_certificacion.html
- SII, Instructivo técnico: https://www.sii.cl/factura_electronica/factura_mercado/instructivo.htm
- SII, formatos XML DTE: https://www.sii.cl/servicios_online/1039-formato_xml-1184.html
- SII, certificación de boletas electrónicas: https://www.sii.cl/factura_electronica/guia_emitir_boleta_servicio.htm

La certificación de software propio requiere seguir el procedimiento y los documentos técnicos oficiales del SII. Esta entrega no significa que BOOM POS esté certificado ni autorizado para emitir DTE reales.
