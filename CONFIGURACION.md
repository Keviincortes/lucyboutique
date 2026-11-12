# Activar pedidos gratis — Lucy Boutique

La landing calcula el pedido, intenta registrarlo en Google Sheets y abre WhatsApp con el resumen aunque Sheets tarde o falle:

- Bogotá: $10.000.
- Cualquier otra ciudad escrita por la clienta: $22.900.
- Pago anticipado: producto + envío; incluye regalo.
- Pago contra entrega: paga solo el envío primero; el producto se paga al recibir; no incluye regalo.
- La clienta solicita por WhatsApp los datos para pagar y luego envía el comprobante en el mismo chat. Los datos de pago no se muestran en la landing.

Para registrar pedidos automáticamente, el sitio necesita el Web App gratuito de Google Apps Script. No es seguro ni correcto poner secretos de Google o WhatsApp en `index.html`.

## 1. Crear el Google Sheet

1. Crea un archivo llamado `PEDIDOS LUCY BOUTIQUE`.
2. Abre `Extensiones > Apps Script`.
3. Reemplaza el contenido por [`apps-script/Code.gs`](apps-script/Code.gs).
4. Copia el ID del Sheet desde su URL y guárdalo como propiedad `SHEET_ID`.

## 2. Añadir propiedades de Script

En Apps Script abre `Project Settings > Script properties` y agrega:

| Propiedad | Valor |
| --- | --- |
| `SHEET_ID` | ID del archivo Google Sheet |
| `OWNER_EMAIL` | correo de respaldo de la dueña, opcional |

No hay que poner claves de Wompi ni de WhatsApp. El número de WhatsApp está configurado en `index.html` y la clienta envía el pedido desde el botón que se abre automáticamente.

## 3. Publicar Apps Script

1. Haz clic en `Deploy > New deployment > Web app`.
2. Ejecutar como: tu cuenta.
3. Acceso: quien corresponda a tus pruebas y al sitio público.
4. Copia la URL que termina en `/exec`.
5. En `index.html`, reemplaza `PENDIENTE_URL_ENDPOINT_PEDIDOS` en `CONFIG.orderEndpoint` por esa URL.

## 4. Flujo gratuito

1. La clienta llena el pedido.
2. Se prepara el enlace de WhatsApp y se intenta registrar el pedido en Sheets.
3. WhatsApp se abre en un máximo de 3 segundos, aunque Sheets falle.
4. La clienta solicita los datos de Nequi, DaviPlata, Bancolombia o transferencia.
5. Envía el comprobante por WhatsApp.
6. La encargada verifica el pago y cambia manualmente el estado en Sheets.
7. Solo se empaca un pedido con comprobante confirmado.

## Antes de publicar anuncios

1. Haz una prueba de pago anticipado en Bogotá.
2. Haz una prueba de pago contra entrega para otra ciudad.
3. Verifica la fila en Google Sheets y el correo opcional.
4. Comprueba que el mensaje de WhatsApp se abre con los datos correctos.
5. Envía un comprobante de prueba y cambia manualmente el estado en Sheets.

## Meta Pixel

La landing carga una única instalación del Pixel 1441414194212741 en la sección head. El ID también puede sobrescribirse en Vercel con VITE_META_PIXEL_ID.

Cuando tengas el ID real del Pixel:

1. En Vercel abre el proyecto y entra a `Settings > Environment Variables`.
2. Crea `VITE_META_PIXEL_ID` con el ID numérico del Pixel. No pongas tokens de Conversions API en el navegador.
3. Actívala para `Production` y, si vas a probar previews, también para `Preview`.
4. Ejecuta un nuevo redeploy desde `Deployments > Redeploy` o publica un nuevo commit.
5. Abre la web y comprueba en Meta Events Manager > Test events.

Eventos preparados:

- `PageView`: al cargar la página.
- `ViewContent`: al inicializar la vista del conjunto.
- `InitiateCheckout`: una vez al primer foco del formulario, con el valor de la promoción seleccionada.
- `Contact`: una vez por sesión al hacer clic en el botón flotante de WhatsApp.
- `Lead`: una vez al enviar el pedido, antes de abrir WhatsApp, con referencia como event ID.

No se envían nombres, teléfonos, direcciones, cédulas ni correos a Meta. Purchase no se dispara porque el pago no se confirma en la landing. No se implementa Conversions API todavía.

## Vercel

El repositorio incluye `vercel.json` y un build estático mínimo. El build copia la landing, `politica.html`, `terminos.html` y solo los recursos optimizados (WebP y MP4 ligeros) a `dist/`. Los archivos originales pesados quedan fuera del despliegue mediante `.vercelignore` y la lista del propio build.

Para vincularlo desde tu cuenta: importa `Keviincortes/lucyboutique` en Vercel, conserva la raíz del proyecto, deja `npm run build` como comando de build y `dist` como directorio de salida. La publicación en GitHub Pages continúa funcionando desde `index.html`.

## Pruebas recomendadas antes de anuncios

- Completar una compra de un conjunto y otra de dos conjuntos.
- Probar Bogotá y otra ciudad para validar $10.000 y $22.900.
- Probar pago anticipado y pago contra entrega.
- Confirmar que WhatsApp recibe colores, tallas, cantidades, promoción, envío y total.
- Confirmar la fila en Google Sheets y el estado de comprobante.
- Comprobar `PageView`, `ViewContent`, `InitiateCheckout`, `Contact` y `Lead` en Meta Test Events.
