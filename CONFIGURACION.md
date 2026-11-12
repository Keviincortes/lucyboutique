# Activar pedidos gratis — Lucy Boutique

La landing calcula el pedido, intenta registrarlo en Google Sheets y abre WhatsApp con el resumen aunque Sheets tarde o falle:

- Bogotá: $10.000.
- Cualquier otra ciudad escrita por la clienta: $22.900.
- Pago anticipado: producto + envío; incluye regalo.
- Pago contra entrega: paga solo el envío primero; el producto se paga al recibir; no incluye regalo.
- La clienta solicita por WhatsApp los datos para pagar y luego envía el comprobante en el mismo chat. Los datos de pago no se muestran en la landing.

Para registrar pedidos automáticamente, el sitio necesita el Web App gratuito de Google Apps Script. No es seguro ni correcto poner secretos de Google o WhatsApp en `index.html`.

## Panel de administración (inventario, compras, gastos, facturas)

**URL: https://lucyboutique.vercel.app/panel**
**Clave: `LucyBoutique2026`**

Ahí se maneja todo el negocio:

- **Resumen**: ventas confirmadas, por cobrar, ganancia bruta, ganancia neta, valor del inventario, invertido en compras, gastos y cobrado.
- **Registrar compra**: entra mercadería. Primero eliges el **producto** (puedes agregar otros nuevos con "➕ Agregar producto") y el **color**; luego la **cantidad** y el **costo por set**.
  - **Grupo de tallas**: eliges `S + M` o `L + XL` y la cantidad se aplica a cada talla del grupo (3 en S y 3 en M = 6 sets). Abajo aparecen los números de cada talla para cambiarlos uno por uno, y se muestra el total que se va a guardar.
  - Si no eliges grupo, la entrada queda "sin desglose de talla".
- **Ajustar inventario**: corrige el conteo real (merma, pérdida) por producto, color y talla.
- **Registrar gasto**: empaques, pauta publicitaria, transporte y gasolina, impuestos, otros.
- **Inventario por color**: total y una ficha por talla (S, M, L, XL) con avisos de stock bajo o agotado. Hay pestañas para cambiar de producto.
- **Pedidos**: se cambia el estado (PENDIENTE COMPROBANTE → PAGADO → ENTREGADO) y el panel recalcula las ganancias al instante. Cada pedido tiene un botón **🧾 Facturar**.
- **Facturas emitidas**: número, fecha, pedido, clienta, total y estado. Las **manuales** salen con la etiqueta "Manual".
- **Compras / Gastos / Movimientos**: historial completo con fechas, producto, tallas y valores.

### Tallas y productos

- Tallas manejadas: **S, M, L, XL** (la XS se quitó porque ya no se maneja).
- Grupos de tallas en el panel: **S + M** y **L + XL**.
- Productos: se guardan en la pestaña `PRODUCTOS` de la hoja. Vienen "Conjunto Poly Like" y "Promo 2 Conjuntos Poly Like"; puedes agregar más desde el panel.
- Los pedidos que entran por la landing siempre descuentan del producto "Conjunto Poly Like" (es el único físico que se vende por la web).

### El pedido se descuenta solo

Cada pedido que entra por la landing descuenta **una unidad del color y la talla pedidos** y deja el movimiento registrado en la pestaña `MOVIMIENTOS` con su costo. El stock nunca se actualiza a mano.

### Facturación en PDF

El botón **🧾 Facturar** de cada pedido abre `factura.html`, que arma la factura con los datos reales del pedido (clienta, ciudad, dirección, conjuntos con color y talla, envío, forma de pago, canal de pago y total) y ofrece:

- **⬇ Descargar PDF**: guarda el archivo A4 con el diseño de la factura (lista para mandar a la clienta por WhatsApp).
- **💬 Enviar por WhatsApp**: abre el chat de la clienta con el resumen del pedido.
- **🖨 Imprimir**: imprime o guarda como PDF desde el navegador.

El PDF se arma con `html2canvas` + `jsPDF` (los dos están guardados en `assets/`), no con `html2pdf`, porque html2pdf usa un Web Worker que en algunos navegadores deja la página **en blanco**.

El número de factura (`LB-0001`, `LB-0002`…) se asigna solo la primera vez que se genera y queda guardado en la pestaña `FACTURAS`.

### Factura manual (venta por aparte)

En la sección **Facturas emitidas** del panel está el botón **＋ Factura manual**. Sirve para vender sin que el pedido venga de la landing: pones los datos de la clienta, agregas los productos (con cantidad y precio) y se genera la factura con su número. **Queda guardada en la base de datos de ventas**: cuenta en "Ventas confirmadas", en "Cobrado" y en las ganancias del panel.

### Sesión: ya no pide contraseña en la factura

El panel guarda la clave en una **cookie** (`lucy_panel_key`), no solo en la sesión. Por eso, si ya estás dentro del panel, al abrir la factura **no te pide la contraseña** en ninguna pestaña ni en el celular.

### Las pestañas de la hoja

| Pestaña | Contenido |
| --- | --- |
| `PEDIDOS` | Los pedidos (mismas columnas de siempre, no se tocan) |
| `PRODUCTOS` | Catálogo de productos |
| `INVENTARIO` | Stock por producto, color y talla (se recalcula sola) |
| `MOVIMIENTOS` | Libro de entradas y salidas: INICIAL, COMPRA, AJUSTE, PEDIDO, DEVOLUCION |
| `GASTOS` | Empaques, pauta, transporte y demás salidas de dinero |
| `FACTURAS` | Facturas emitidas (de pedido y manuales) con su número consecutivo |



Las pestañas se crean solas la primera vez que se abre el panel.

### Seguridad

- El panel pide clave; sin ella `/api/panel` responde 401.
- La clave se valida dos veces: en Vercel (`PANEL_PASSWORD`) y en Apps Script (propiedad `PANEL_KEY`). Deben ser iguales.
- Para cambiarla: en Vercel `Settings > Environment Variables > PANEL_PASSWORD` y en Apps Script `Configuración del proyecto > Propiedades de las secuencias de comandos > PANEL_KEY`, y redeploy.

### Propiedades del script (Apps Script)

| Propiedad | Valor |
| --- | --- |
| `SHEET_ID` | `1g0AnVlGgD7v-JZXOMbPjKa1GVQq8IxSA35sXvQabP3k` |
| `PANEL_KEY` | la clave de administración del panel |
| `OWNER_EMAIL` | correo para el aviso de pedido nuevo (opcional) |

Variables de entorno en Vercel (producción): `PANEL_PASSWORD`, `APPS_SCRIPT_URL`, `META_CAPI_TOKEN`, `META_PIXEL_ID`, `META_CAPI_SECRET`, `META_API_VERSION`.

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

## Publicar cambios del script de Google

El código vive en `apps-script/Code.gs`. Cada vez que se cambia hay que:

1. Pegar el contenido en `Código.gs` del proyecto de Apps Script y **guardar** (icono del disquete). Si no se guarda, el despliegue sigue con el código viejo.
2. `Implementar > Nueva implementación > App web` con la misma configuración:
   - Descripción: por ejemplo "Inventario, compras, gastos y panel".
   - Ejecutar como: **Yo (lachimbahijueputa@gmail.com)**.
   - Usuarios con acceso: **Cualquiera** (las clientas tienen que poder dejar su pedido).
3. Copiar la URL `/exec` nueva y ponerla en `APPS_SCRIPT_URL` en las variables de entorno de Vercel.
4. `vercel --prod --yes` para publicar.

La landing **no se toca** en este proceso: apunta a `https://lucyboutique.vercel.app/api/pedidos`, que es un proxy estable (`api/pedidos.js`) que reenvía al script usando `APPS_SCRIPT_URL`. Lo mismo hace el panel con `api/panel.js`.

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
