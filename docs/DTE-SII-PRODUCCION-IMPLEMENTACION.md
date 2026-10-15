# BOOM POS — Base de integración DTE/SII

## Entregables
- `supabase/migrationes/004_dte_production_foundation.sql`: persistencia de trabajos de emisión y eventos.
- `supabase/functions/dte-issue/index.ts`: Edge Function autenticada que valida sesión/empresa/idempotencia y falla de forma segura mientras no exista el adaptador oficial.
- Esta entrega NO emite documentos tributarios, NO firma XML, NO reserva folios y NO transmite al SII.

## Por qué queda bloqueada
El repositorio inspeccionado tiene un motor local que produce `DTE_SIMULACION`, no un DTE XML oficial. El SII requiere respetar los esquemas de XML y firma, CAF/folios autorizados, autenticación y servicios de envío/consulta. La emisión depende también de credenciales y habilitación propias del emisor.

## Próximos componentes requeridos
1. Adaptador de autenticación SII y manejo de token conforme a la documentación técnica vigente.
2. Gestor seguro de certificados y clave privada; nunca en tablas públicas, cliente web o variables `NEXT_PUBLIC`.
3. Lector/validador de CAF y reserva transaccional de folios, por emisor y tipo documental.
4. Generador XML oficial tipo 33; validar contra XSD oficial y reglas vigentes.
5. Firma XMLDSIG conforme al estándar vigente del SII.
6. Generación y firma del sobre de envío, transmisión y lectura de respuesta/track ID.
7. Adaptador separado para boleta tipo 39 y sus requisitos técnicos específicos.
8. Consulta de estado, reintentos idempotentes, tratamiento de rechazo y auditoría.
9. Pruebas de certificación y habilitación del emisor/software antes de activar producción.

## Requisitos operativos para el titular
- Confirmar que la empresa emisora está habilitada y autorizada.
- Disponer de certificado digital y CAF válidos para el RUT emisor.
- Configurar secretos en el entorno seguro de Supabase Edge Functions o un servicio de firma administrado.
- Probar primero en certificación con datos de prueba.
- No usar RUT de terceros sin autorización expresa y los permisos/habilitaciones que correspondan.

## Aplicación en Supabase
1. Abrir el proyecto de desarrollo/staging.
2. Revisar el SQL con el esquema actual, particularmente las tablas `companies`, `profiles` y `dte_company_settings`.
3. Ejecutar `004_dte_production_foundation.sql`.
4. Desplegar `dte-issue` con autenticación JWT obligatoria. No activar `--no-verify-jwt`.
5. Probar con un usuario autenticado y confirmar que devuelve `SII_ADAPTER_NOT_READY` mientras falten componentes.
6. No habilitar producción ni sustituir la interfaz de simulación hasta que todos los componentes oficiales estén implementados y probados.

## Limitación de este paquete
Es una base segura de arquitectura y persistencia, no una integración SII completa. No debe presentarse como lista para emitir boletas o facturas reales.
