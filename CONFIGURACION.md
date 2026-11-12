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

## Meta Pixel y API de Conversiones

La landing instala el pixel `1441414194212741` en el `<head>` y dispara los eventos con un `eventID` único. Cada evento se envía dos veces con el mismo `eventID`: una por el pixel del navegador y otra por `/api/meta-capi` (API de Conversiones). Meta las deduplica, así que no se cuentan dobles, pero sí sobreviven a bloqueadores, iOS y cookies restringidas.

### Estado actual (ya configurado, no hay nada pendiente)

| Pieza | Estado |
| --- | --- |
| Pixel `1441414194212741` | Activo, los eventos llegan y salen "Procesados" |
| Dominio `lucyboutique.vercel.app` | Verificado (metaetiqueta + archivo HTML en la raíz) |
| API de conversiones con Meta (gateway) | Activa y recibiendo desde el navegador |
| Integración directa (`/api/meta-capi`) | Activa con token propio y variables de entorno en Vercel |

Variables de entorno ya cargadas en Vercel (producción): `META_CAPI_TOKEN`, `META_PIXEL_ID`, `META_CAPI_SECRET`, `META_API_VERSION`.

### Probar eventos con el código de prueba

La landing acepta el parámetro `?test_event_code=TEST49895` y lo reenvía al pixel y al servidor, de modo que los eventos aparecen en **Events Manager > Probar eventos > Sitio web**:

```
https://lucyboutique.vercel.app/?test_event_code=TEST49895
```

En la pestaña hay que elegir el canal **Sitio web** en "Seleccionador del origen de acción de eventos de prueba".

### Activar la API de Conversiones (si hay que rehacerla)

1. Meta Events Manager > tu pixel > `Configuración` > `API de conversiones` > `Configurar la integración directa` > `Generar identificador de acceso`.
2. En Vercel, proyecto `lucyboutique` > `Settings` > `Environment Variables`, crea:
   - `META_CAPI_TOKEN` = el token que acabas de generar (Production y Preview).
   - `META_CAPI_SECRET` = una clave larga inventada, por ejemplo `lucy-2026-capi-9f3a`.
   - `META_PIXEL_ID` = `1441414194212741` (opcional, es el valor por defecto).
3. Redeploy. Mientras no exista `META_CAPI_TOKEN`, `/api/meta-capi` responde 204 y no envía nada: el pixel del navegador funciona igual.

### Verificar que sí está enviando

- Events Manager > `Probar eventos`: abre la landing con `?test_event_code=TEST49895` y deben aparecer `PageView`, `Ver contenido`, `Finalización de compra iniciada` y `Cliente potencial` (Lead) como "Procesados".
- En la consola del navegador: `fbq.getState()` debe mostrar el pixel con `eventCount` mayor que 0.
- Prueba del servidor: `curl -i https://lucyboutique.vercel.app/api/meta-capi` debe responder 405 (existe) y no 404.
- Confirmación de que Meta recibió el evento del servidor: un POST a `/api/meta-capi` debe responder `{"ok":true,"meta":{"events_received":1}}`.


### Purchase (venta confirmada)

`Purchase` no se dispara con un clic de WhatsApp: se envía cuando el pago está confirmado, usando la referencia del pedido como `event_id`.

```powershell
$env:META_CAPI_SECRET="lucy-2026-capi-9f3a"
node scripts/purchase.mjs --value 152800 --reference LUCY-1794457115195 --fbp "fb.3.1794..." --fbc "fb.1.1794..."
```

Los valores `_fbp` y `_fbc` del pedido quedan guardados en la hoja (columnas `fbp` y `fbc` del JSON enviado). Si no los tienes, el evento igual se envía y Meta lo atribuye con la IP y el navegador del servidor.

### Eventos y datos

- `PageView`: al cargar la página.
- `ViewContent`: al entrar, con el conjunto y su valor.
- `InitiateCheckout`: al primer foco del formulario, con la promoción elegida.
- `Contact`: una vez por sesión al abrir WhatsApp.
- `Lead`: al enviar el pedido, con la referencia como `eventID`.
- `Purchase`: manual, al confirmar el pago.

La coincidencia avanzada envía nombre, celular normalizado a `+57` y ciudad **cifrados con SHA-256**; el texto plano nunca sale del navegador. No se envían direcciones, cédulas ni correos. La política de datos lo describe en `politica.html`.

## Vercel

El repositorio incluye `vercel.json` y un build estático mínimo. El build copia la landing, `politica.html`, `terminos.html`, el archivo de verificación de Meta (`vbpx964ox465z692oh8eid8lgcuq2w.html`) y solo los recursos optimizados (WebP y MP4 ligeros) a `dist/`. Los archivos originales pesados quedan fuera del despliegue mediante `.vercelignore` y la lista del propio build.

Para vincularlo desde tu cuenta: importa `Keviincortes/lucyboutique` en Vercel, conserva la raíz del proyecto, deja `npm run build` como comando de build y `dist` como directorio de salida. La publicación en GitHub Pages continúa funcionando desde `index.html`.

### Verificación de dominio en Meta

Meta rastrea el sitio con `Range: bytes=0-1023`, por eso la metaetiqueta `facebook-domain-verification` va en la **primera línea del `<head>`** (byte 57). Si se mueve más abajo, Meta ya no la ve y el dominio queda "No verificado". Además se sirve el archivo `vbpx964ox465z692oh8eid8lgcuq2w.html` desde `api/verify.js` para el método de archivo HTML (Vercel redirige `/x.html` a `/x` con un 308 que Meta no sigue).

### Selector de color y talla en celular

Las miniaturas del selector de la sección "1. Elige tu promoción" son recortes de tela (`assets/sw-<color>.webp`) generados con ffmpeg:

```powershell
npm run thumbs
```

Miden 266x380 px y pesan menos de 8 KB cada una. En celular se muestran en una cuadrícula 3x2; el color elegido se marca con borde rosado y un check, y los botones de talla miden 48 px de alto para el dedo. Si se cambian las fotos de color hay que volver a correr `npm run thumbs`.


## Pruebas recomendadas antes de anuncios

- Completar una compra de un conjunto y otra de dos conjuntos.
- Probar Bogotá y otra ciudad para validar $10.000 y $22.900.
- Probar pago anticipado y pago contra entrega.
- Confirmar que WhatsApp recibe colores, tallas, cantidades, promoción, envío y total.
- Confirmar la fila en Google Sheets y el estado de comprobante.
- Comprobar `PageView`, `ViewContent`, `InitiateCheckout`, `Contact` y `Lead` en Meta Test Events.
