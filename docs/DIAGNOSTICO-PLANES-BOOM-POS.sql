-- Diagnóstico de solo lectura para PLAN_NOT_FOUND_OR_INACTIVE. Ejecutar en Supabase SQL Editor.
-- 1) Identifica tablas y columnas que podrían contener el catálogo de planes.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name ILIKE '%plan%' OR table_name ILIKE '%subscription%')
ORDER BY table_name, ordinal_position;

-- 2) Muestra la definición real del RPC que devuelve PLAN_NOT_FOUND_OR_INACTIVE.
SELECT n.nspname AS schema_name, p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('boom_pos_request_subscription', 'boom_pos_initialize_subscription_onboarding');
