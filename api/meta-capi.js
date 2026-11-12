const crypto = require('node:crypto');

/**
 * Puente entre la landing y la API de Conversiones de Meta.
 *
 * - El navegador manda el evento con el MISMO event_id que usa el pixel,
 *   así Meta deduplica y no cuenta doble.
 * - Agrega IP, user-agent, _fbp y _fbc que el navegador no puede enviar.
 * - Si no hay token configurado responde 204 y no rompe nada: el pixel
 *   del navegador sigue funcionando igual.
 *
 * Variables de entorno (Vercel > Settings > Environment Variables):
 *   META_CAPI_TOKEN   token de la API de Conversiones (obligatorio para enviar)
 *   META_PIXEL_ID     por defecto 1441414194212741
 *   META_CAPI_SECRET  protege el evento Purchase (muy recomendado)
 *   META_API_VERSION  por defecto v21.0
 */

const PIXEL_ID = process.env.META_PIXEL_ID || '1441414194212741';
const TOKEN = process.env.META_CAPI_TOKEN || '';
const SECRET = process.env.META_CAPI_SECRET || '';
const API_VERSION = process.env.META_API_VERSION || 'v21.0';

const ALLOWED = new Set([
  'PageView',
  'ViewContent',
  'InitiateCheckout',
  'AddToCart',
  'Contact',
  'Lead',
  'Purchase',
]);

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

function normalizePhone(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('57') && digits.length > 10) return digits;
  return `57${digits}`;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  // Sin token no hay nada que enviar. La landing no se enteró de nada.
  if (!TOKEN) {
    res.status(204).end();
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body && typeof body === 'object' ? body : {};

  const eventName = String(body.event_name || '');
  if (!ALLOWED.has(eventName)) {
    res.status(400).json({ ok: false, error: 'event_not_allowed' });
    return;
  }

  if (eventName === 'Purchase' && SECRET && req.headers['x-capi-secret'] !== SECRET) {
    res.status(401).json({ ok: false, error: 'bad_secret' });
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const userAgent = String(req.headers['user-agent'] || '');

  const userData = {
    client_ip_address: ip || undefined,
    client_user_agent: userAgent || undefined,
    fbp: cookies._fbp || body.fbp || undefined,
    fbc: cookies._fbc || body.fbc || undefined,
  };
  if (body.email) userData.em = [sha256(body.email)];
  if (body.phone) userData.ph = [sha256(normalizePhone(body.phone))];
  if (body.external_id) userData.external_id = [sha256(body.external_id)];
  const cust = body.customer && typeof body.customer === 'object' ? body.customer : {};
  if (cust.fn) userData.fn = [sha256(cust.fn)];
  if (cust.ln) userData.ln = [sha256(cust.ln)];
  if (cust.ct) userData.ct = [sha256(cust.ct)];
  if (cust.country) userData.country = String(cust.country).toLowerCase();
  if (cust.zip) userData.zip = sha256(cust.zip);

  const event = {
    event_name: eventName,
    event_time: Number(body.event_time) || Math.floor(Date.now() / 1000),
    event_id: body.event_id || undefined,
    event_source_url: body.event_source_url || undefined,
    action_source: body.action_source || 'website',
    user_data: userData,
    custom_data: body.custom_data && typeof body.custom_data === 'object' ? body.custom_data : {},
  };

  try {
    const response = await fetch(`https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event], access_token: TOKEN }),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('meta-capi error', response.status, JSON.stringify(json).slice(0, 500));
    }

    res.status(response.ok ? 200 : 502).json({ ok: response.ok, meta: json });
  } catch (error) {
    console.error('meta-capi network', error && error.message);
    res.status(502).json({ ok: false, error: 'network' });
  }
};
