# BOOM POS — Fase 3: PWA y recuperación de navegación sin red

## Archivos de esta entrega
- `app/layout.tsx` (modificado): metadatos PWA y runtime global de conexión.
- `componentes/pos-shell.tsx` (modificado): purga la caché de páginas privadas al cerrar sesión.
- `componentes/offline-runtime.tsx` (nuevo): registra el service worker en producción y muestra el estado offline.
- `app/manifest.ts` (nuevo): manifiesto instalable.
- `app/offline/page.tsx` (nuevo): pantalla de contingencia.
- `public/sw.js` (nuevo): caché de navegación y recursos estáticos.
- `public/boom-icon.svg` (nuevo): icono PWA.

## Despliegue
1. Incorporar los archivos respetando sus rutas.
2. Desplegar en Vercel bajo HTTPS.
3. Abrir BOOM con internet al menos una vez en cada dispositivo/navegador. El service worker se registra solo en producción.
4. Esperar a que termine la carga inicial; luego probar modo avión, navegación/recarga y reconexión.
5. Verificar que al cerrar sesión se elimine la caché de páginas privadas.

## Comportamiento y límites
- El service worker intenta primero la red en las navegaciones; si falla, devuelve la versión cacheada de esa ruta o la pantalla `/offline`.
- Recursos de Next.js que se hayan descargado se guardan en caché para permitir la hidratación cuando sea posible.
- Las solicitudes `/api/`, `/auth/` y `/supabase/` no se cachean.
- La caché de páginas puede contener HTML personalizado de la sesión actual. Se elimina al cerrar sesión desde BOOM. En dispositivos compartidos se debe cerrar sesión.
- El service worker no puede instalarse retroactivamente si el usuario nunca abrió BOOM con internet. Una primera visita totalmente offline no es posible en una web hospedada.
- No garantiza que todas las funciones dependientes del servidor operen offline. No confirma pagos electrónicos ni emite DTE/SII sin conexión.
- Stock entre varias cajas desconectadas requiere conciliación al sincronizar; la copia local no reserva existencias globales.

## Pruebas obligatorias
1. Con internet, abrir BOOM y esperar que termine de cargar; confirmar que el service worker se instaló.
2. Activar modo avión y recargar `/`. Confirmar que la aplicación cacheada abre, o que aparece la pantalla de contingencia en lugar del error de Chrome.
3. Comprobar que ventas pendientes y catálogo sobreviven a la recarga usando la fase 2 (IndexedDB).
4. Desactivar modo avión y confirmar que BOOM vuelve a conectarse y sincroniza la cola sin duplicados.
5. Cerrar sesión con conexión y confirmar que la navegación privada ya no aparece desde caché.
6. Repetir en Chrome Android y en el navegador de escritorio usado para desplegar.

## Validación pendiente
El paquete no incluye dependencias instaladas. Ejecutar `npm install` y `npm run build` en el proyecto completo y resolver cualquier error antes de producción. La prueba real debe hacerse en el dominio desplegado porque los service workers requieren HTTPS (excepto localhost).
