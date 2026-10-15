# D4 — Diagnóstico seguro y puertas de habilitación DTE

## Alcance de este cambio

Se agrega `GET /api/dte/status`, protegido por sesión Supabase. Devuelve indicadores booleanos de configuración y declara explícitamente que el sistema solo genera simulaciones internas. No devuelve valores de variables de entorno, certificados, claves, CAF ni tokens.

## Variables reconocidas (no configurarlas con valores ficticios)

- `DTE_SIGNING_PRIVATE_KEY`: clave privada del certificado tributario, solo en servidor/gestor de secretos.
- `DTE_SIGNING_CERTIFICATE`: certificado público correspondiente, solo en servidor.
- `DTE_CAF_XML`: CAF autorizado para el tipo de documento y ambiente correspondiente, solo en servidor.
- `SII_ENVIRONMENT`: `certification` o `production`. El endpoint solo diagnostica; no activa emisión.

No subir secretos a GitHub, al navegador, a tablas consultables por clientes ni a variables `NEXT_PUBLIC_*`. No reutilizar CAF entre emisores o ambientes.

## Puertas obligatorias antes de emitir

1. Obtener y validar autorización/habilitación del emisor en el SII.
2. Implementar el formato XML oficial específico para boleta electrónica y validar contra el XSD vigente del SII.
3. Implementar TED/FRMT con CAF válido, folio autorizado y control transaccional de folios para evitar duplicados.
4. Firmar XML con certificado tributario en servidor y validar la firma.
5. Implementar autenticación, envío y consulta de estado de acuerdo con la documentación vigente del SII.
6. Registrar solicitudes/respuestas y transiciones de estado sin guardar secretos.
7. Ejecutar el set oficial de pruebas y completar certificación antes de habilitar producción.
8. Habilitar producción mediante una decisión explícita y validaciones server-side; nunca solo cambiando un selector en la interfaz.

## Documentación oficial consultada

- Instructivo técnico de boleta electrónica: https://www.sii.cl/servicios_online/3532-instructivo_tecnico_be-3811.html
- Formato XML y schemas: https://www.sii.cl/servicios_online/3532-formato_xml-3811.html
- Guía de certificación de boletas: https://www.sii.cl/servicios_online/1039-guia_emitir_boleta_servicio-1184.html
- Ambiente de certificación: https://www.sii.cl/servicios_online/1039-menu_certificacion-1184.html

La documentación del SII exige estructura XML conforme al schema, firma y proceso de certificación; por eso este diagnóstico no debe interpretarse como integración oficial ya operativa.
