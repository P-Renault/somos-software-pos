# BOOM POS — Diagnóstico previo DTE/SII (D7)

## Propósito

Este archivo documenta la acción `preflight` añadida a `supabase/functions/dte-issue/index.ts`. El paquete contiene el archivo completo para reemplazo, no un fragmento.

## Llamada

Invocar la función `dte-issue` mediante POST autenticado con el JWT del usuario de Supabase:

```json
{ "action": "preflight" }
```

La función resuelve `company_id` desde el perfil autenticado y lee solamente la configuración DTE asociada a esa empresa. No acepta `company_id` proporcionado por el cliente.

La acción `test_connection` se conserva y sigue comprobando exclusivamente la función de Supabase, sesión y lectura de configuración.

## Interpretación

- `connected: true` significa que el backend y la consulta de configuración respondieron; no significa conexión al SII.
- `official_sii_connected: false` y `adapter_ready: false` son intencionales mientras no exista el adaptador oficial.
- `checks` contiene controles con estado `ok`, `pending` o `blocked`.
- `missing` identifica valores ausentes o controles que requieren atención.
- Los indicadores `certificate_configured` y `caf_configured` son banderas de base de datos. El diagnóstico no descarga ni valida certificados, claves privadas, CAF, firmas, rangos ni folios.
- Los datos de resolución registrados no se verifican con el SII.
- `ready_for_official_issuance` siempre es `false` en esta etapa.

## Seguridad y alcance

- Mantener `verify_jwt = true` en `supabase/config.toml`.
- No enviar certificado digital, clave privada ni CAF desde el navegador.
- No registrar secretos en logs.
- No se genera XML oficial, no se firma, no se reservan folios y no se transmite ningún DTE.
- La solicitud de emisión normal permanece bloqueada con `SII_ADAPTER_NOT_READY`.
- No se debe usar la respuesta de diagnóstico como prueba de habilitación tributaria ni como autorización para emitir.

## Próxima etapa de desarrollo

1. Revisar y definir almacenamiento seguro del certificado digital y CAF.
2. Implementar validación de estructura y firma de CAF y asignación transaccional de folios.
3. Construir XML DTE conforme al esquema vigente del SII y firmarlo en servidor.
4. Implementar autenticación y envío a los endpoints oficiales según ambiente, y persistir respuesta verificable.
5. Añadir pruebas automatizadas para idempotencia, reintentos, concurrencia, rechazos y aislamiento entre empresas.
6. Mantener producción bloqueada hasta completar la certificación/habilitación aplicable.

## Compatibilidad

La implementación utiliza las tablas y columnas ya consultadas por la función: `profiles` y `dte_company_settings`. No requiere migración SQL.
