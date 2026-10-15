# BOOM POS · D3 Motor DTE en simulación

## Alcance implementado
- Motor local para validar RUT chileno, tipos DTE 33, 34, 39 y 41, detalle, cantidad y precio.
- Cálculo de neto, exento, IVA 19 % y total en CLP.
- Generación de XML interno claramente marcado como simulación; no corresponde al formato oficial completo del SII.
- Persistencia de borrador en `dte_documents`, detalle en `dte_document_items` y trazabilidad en `dte_events`.
- El documento queda en estado `draft`, sin folio, sin firma y en ambiente `certification`.
- La opción de producción permanece deshabilitada en la interfaz.

## Aplicación
1. Aplicar primero `BOOM-POS-D1-Motor-DTE-Supabase.sql` si todavía no se ejecutó.
2. Ejecutar `supabase/migrations/006_dte_simulation_insert_policies.sql` en el SQL Editor de Supabase.
3. Integrar los archivos del ZIP manteniendo las rutas incluidas.
4. Desplegar y probar con una empresa de prueba y un RUT válido.

## Límites explícitos
Este incremento no genera un DTE tributario válido, no utiliza CAF, no asigna folios, no firma con certificado digital, no se comunica con el SII y no afirma aceptación tributaria. Los montos se calculan para pruebas de una línea y redondeo a peso; antes de certificar deben revisarse reglas oficiales de redondeo, descuentos, múltiples líneas, exenciones y validaciones específicas por documento.

## Pruebas mínimas
- Probar boleta afecta (39) con línea afecta: IVA = redondeo de neto × 19 %.
- Probar boleta exenta (41): IVA = 0 y total = exento.
- Probar factura (33) sin RUT o con dígito verificador inválido: debe bloquearse.
- Probar factura exenta (34): IVA = 0.
- Confirmar que todo registro se guarda sin folio, `status=draft`, `environment=certification` y `xml_signed=null`.
- Confirmar que un usuario de otra empresa no puede consultar ni insertar registros de esta empresa.
