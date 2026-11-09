# Activar pedidos gratis — Lucy Boutique

La landing calcula el pedido, lo registra en Google Sheets y abre WhatsApp con el resumen:

- Bogotá: $10.000.
- Cualquier otra ciudad escrita por la clienta: aproximado $22.900.
- Pago anticipado: producto + envío; incluye regalo.
- Apartado: paga solo envío; el producto se paga al recibir; no incluye regalo.
- La clienta solicita por WhatsApp los datos para pagar y luego envía el comprobante en el mismo chat.

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
2. El pedido se registra en Sheets.
3. Se abre WhatsApp con todos los datos.
4. La clienta solicita los datos de Nequi, DaviPlata, Bancolombia o transferencia.
5. Envía el comprobante por WhatsApp.
6. La encargada verifica el pago y cambia manualmente el estado en Sheets.
7. Solo se empaca un pedido con comprobante confirmado.

## Antes de publicar anuncios

1. Haz una prueba de pago anticipado en Bogotá.
2. Haz una prueba de apartado para otra ciudad.
3. Verifica la fila en Google Sheets y el correo opcional.
4. Comprueba que el mensaje de WhatsApp se abre con los datos correctos.
5. Envía un comprobante de prueba y cambia manualmente el estado en Sheets.
