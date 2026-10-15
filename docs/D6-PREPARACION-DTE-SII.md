# D6 — Preparación segura de integración DTE/SII

**Estado:** especificación técnica de preparación. Este paquete NO habilita emisión tributaria real.

## Estado confirmado en la rama `P-Renault-patch-1`

- `lib/dte-engine.ts` valida RUT, calcula totales y produce XML expresamente etiquetado como simulación.
- `componentes/pos-shell.tsx` guarda simulaciones mediante `create_dte_simulation_atomic`.
- La interfaz mantiene bloqueada la producción y guarda los indicadores de certificado/CAF como no configurados.
- El flujo de ventas todavía muestra un prototipo visual que no registra ventas reales; no debe generar DTE oficiales hasta que ventas y caja estén transaccionales.

## Secuencia técnica

1. Mantener las simulaciones aisladas del flujo oficial.
2. Priorizar factura electrónica tipo 33; después boleta electrónica tipo 39.
3. Construir la integración en servidor: validar emisor, reservar folio CAF, generar XML oficial, firmar, transmitir al SII, procesar la respuesta y registrar auditoría.
4. Proteger certificado, clave privada y CAF mediante secretos del servidor. No guardarlos en tablas accesibles desde el cliente ni exponerlos en variables `NEXT_PUBLIC`.
5. Vincular la emisión al registro transaccional de la venta/caja; una venta fallida no puede dejar un DTE aceptado ni consumir folios sin control.
6. Mantener Flow para la última etapa funcional, tal como quedó acordado.

## Bloqueos obligatorios antes de producción

- Emisor/titular habilitado ante el SII y autorización correspondiente.
- Certificado digital vigente, con custodia segura en servidor.
- CAF y folios autorizados; reserva transaccional sin duplicados.
- XML oficial conforme al esquema aplicable y firma electrónica válida.
- Transmisión al endpoint oficial y seguimiento de respuesta/track ID.
- Pruebas de certificación y cumplimiento del proceso de habilitación aplicable.
- Persistencia idempotente de la solicitud, folio, documento firmado, respuesta y eventos de auditoría.
- Control de acceso por empresa con RLS y validación de autorización también en el servidor.

**Un RUT por sí solo no autoriza a emitir en nombre de otra empresa.** Debe existir autorización del titular y la configuración/habilitación tributaria que corresponda.

## Modelo recomendado

- **Cliente web:** captura datos y muestra estados; no firma ni transmite documentos.
- **Backend/Edge Function:** valida usuario y empresa, comprueba requisitos, reserva folio, genera XML oficial, firma, transmite y persiste resultado.
- **Base de datos:** unicidad por emisor/ambiente/tipo/folio; idempotencia; control de concurrencia; eventos append-only; aislamiento por empresa.
- **Estados sugeridos:** `draft → validated → signed → queued/sent → accepted/rejected/error`.
- Solo una respuesta verificable del SII permite marcar un documento como `accepted`.
- Los reintentos reutilizan la clave de idempotencia y no deben crear un nuevo documento/folio para la misma solicitud.
- Un error de firma o transmisión nunca debe mostrarse como aceptación.

## Criterios de aceptación

- Toda simulación se identifica claramente como no oficial.
- La API rechaza emisión productiva si falta cualquier requisito de habilitación.
- Una empresa no puede leer ni modificar documentos de otra.
- Repetir una solicitud no crea folios ni documentos duplicados.
- La aceptación se establece únicamente tras una respuesta verificable del SII.
- Las transiciones quedan auditadas; no se inventan eventos históricos.
- Una venta/caja todavía no conectada no puede originar documentos tributarios oficiales.

## Fuera del alcance de este paquete

Este documento no implementa firma, CAF, folios, XML oficial, transmisión al SII ni certificación. No se debe aplicar a producción ni habilitar emisión real por la sola existencia de esta especificación.
