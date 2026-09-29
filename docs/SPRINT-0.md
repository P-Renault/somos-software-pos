# Somos Software POS — Sprint 0

## Objetivo
Dejar la base técnica lista para continuar con autenticación y configuración inicial de empresa.

## Incluye
- Next.js + TypeScript
- Supabase SSR
- Variables de entorno
- Cliente navegador y servidor
- Dashboard inicial
- Diagnóstico básico de conexión
- Migración PostgreSQL inicial
- RLS habilitado en las tablas base
- `.env.local` excluido de Git

## Configuración
La aplicación utiliza:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

No se incluye ninguna `sb_secret` ni `service_role`.

## Antes de crear el primer usuario
Ejecutar `supabase/migrations/001_initial_schema.sql` en el SQL Editor del proyecto si las tablas todavía no existen.

Después:
1. `npm install`
2. `npm run dev`
3. Abrir `http://localhost:3000`
4. Confirmar el estado de conexión.
5. Continuar con Sprint 0.1: Auth + perfil + empresa.

## Seguridad
La Publishable Key está diseñada para aplicaciones cliente, pero RLS debe controlar el acceso a los datos. Las claves secretas de servidor nunca deben exponerse en el navegador ni subir a GitHub.
