# Caja Fase 12 — contexto autenticado y habilitación durante desarrollo

## Cambio incluido

`componentes/pos-shell.tsx` ahora obtiene el usuario mediante `supabase.auth.getUser()` y consulta `profiles.company_id` con la sesión autenticada antes de insertar en `cash_registers`. Inserta `created_by` desde el usuario de Auth y usa la empresa del perfil como fuente de verdad, para que los valores enviados coincidan con la política RLS actual.

También detecta si la empresa cargada en el shell no coincide con la empresa del perfil y muestra un error específico. No desactiva RLS ni introduce permisos globales.

## Planes y modo de desarrollo

Esta modificación no aplica todavía límites comerciales de plan. El motor de suscripciones/licencias debe decidir el límite de cajas en una etapa posterior. No se debe usar esta ausencia de límite como sustituto de autorización: RLS y pertenencia a empresa continúan obligatorias.

## Despliegue

1. Descomprime en la raíz del repositorio, respetando la ruta.
2. Compila y despliega.
3. Inicia sesión de nuevo para renovar el contexto de autenticación.
4. Crea una caja de prueba y confirma que aparece en el selector.
5. Si falla, copia el mensaje exacto. No desactives RLS ni ejecutes políticas abiertas.

## Límite

No se pudo ejecutar una prueba contra el proyecto Supabase del usuario. El cambio corrige el origen de `company_id` y `created_by` en el cliente; si el rechazo persiste, habrá que inspeccionar la sesión real y el JWT usado por la app.
