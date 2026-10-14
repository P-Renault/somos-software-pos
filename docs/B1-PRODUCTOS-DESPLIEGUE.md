# BOOM POS · B1 Catálogo de productos

## Archivos de esta entrega
- `app/page.tsx`: entrega el identificador de la empresa autenticada al shell.
- `componentes/pos-shell.tsx`: catálogo persistente con listado, búsqueda, creación, edición y desactivación lógica.
- `app/globals.css`: estilos de tabla, acciones y errores del catálogo.
- `supabase/migrations/002_products_catalog.sql`: columnas, índices únicos, validaciones, permisos y políticas RLS del catálogo.

## Orden de despliegue
1. En Supabase, abrir SQL Editor y ejecutar completo `supabase/migrations/002_products_catalog.sql`. Esta migración presupone que el esquema inicial ya creó `companies`, `profiles`, `products` y `public.set_updated_at()`.
2. Aplicar los tres archivos de aplicación respetando sus rutas en la rama `P-Renault-patch-1`. No reemplazar todo el repositorio por este parche.
3. Esperar el despliegue automático de Vercel y comprobar que el commit nuevo figure en el deployment.
4. Iniciar sesión, abrir Productos y crear un producto de prueba. Actualizar la página y comprobar que el registro persiste.
5. Probar edición, duplicación de SKU/código de barras y desactivación.

## Notas
- No se insertan productos ficticios. Un catálogo recién creado aparece vacío hasta registrar productos reales.
- La desactivación es lógica (`active=false`), no borra el registro.
- SKU y código de barras son únicos dentro de una empresa cuando se informan.
- RLS limita lectura, creación y edición a la empresa vinculada al perfil autenticado.
- El stock inicial se captura en el producto en este primer sprint. Cuando se implemente el motor de Inventario, las entradas y salidas deberán migrar a movimientos trazables y las recepciones de Compras actualizarán el stock mediante transacciones.
- La fotografía de producto no forma parte de B1; se implementará con Supabase Storage en una iteración posterior.

## Validación técnica
Se validó la sintaxis TSX/TS de los archivos principales con el transpiler TypeScript. La instalación de dependencias excedió el tiempo disponible en el entorno de trabajo, por lo que no se afirma que se haya ejecutado un `next build` completo.
