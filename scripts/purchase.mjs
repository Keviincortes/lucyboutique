#!/usr/bin/env node
/**
 * Envía un evento Purchase real a Meta cuando confirmas un pago.
 *
 * Uso:
 *   node scripts/purchase.mjs --value 69900 --reference LUCY-123 --fbp "fb.2..." --fbc "fb.1..."
 *
 * Variables de entorno:
 *   SITE_URL          por defecto https://lucyboutique.vercel.app
 *   META_CAPI_SECRET  el mismo valor configurado en Vercel
 *
 * El event_id es la referencia del pedido. Si algún día el navegador
 * dispara el mismo Purchase, Meta lo deduplica y no lo cuenta dos veces.
 */

const args = process.argv.slice(2);

function flag(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const value = Number(flag('value', '0'));
const reference = flag('reference');
const currency = flag('currency', 'COP');
const quantity = Number(flag('quantity', '1'));

if (!value || !reference) {
  console.error('Faltan datos: --value y --reference son obligatorios.');
  console.error('Ejemplo: node scripts/purchase.mjs --value 69900 --reference LUCY-123 --fbp "fb.2..." --fbc "fb.1..."');
  process.exit(1);
}

const site = (process.env.SITE_URL || 'https://lucyboutique.vercel.app').replace(/\/$/, '');
const secret = process.env.META_CAPI_SECRET || flag('secret');

const payload = {
  event_name: 'Purchase',
  event_id: reference,
  event_time: Math.floor(Date.now() / 1000),
  event_source_url: `${site}/`,
  action_source: 'website',
  fbp: flag('fbp'),
  fbc: flag('fbc'),
  email: flag('email'),
  phone: flag('phone'),
  test_event_code: flag('test-event-code') || undefined,
  custom_data: {
    value,
    currency,
    content_ids: ['lucy-conjunto'],
    content_type: 'product',
    num_items: quantity,
    order_id: reference,
  },
};

const response = await fetch(`${site}/api/meta-capi`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(secret ? { 'x-capi-secret': secret } : {}),
  },
  body: JSON.stringify(payload),
});

const text = await response.text();

if (response.status === 204) {
  console.error('El servidor no tiene META_CAPI_TOKEN configurado: no se envió nada.');
  console.error('Agrega el token en Vercel > Settings > Environment Variables y redeploy.');
  process.exit(2);
}

console.log(`HTTP ${response.status}`);
console.log(text.slice(0, 600));
process.exit(response.ok ? 0 : 1);
