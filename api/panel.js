/**
 * Proxy del panel de administración.
 *
 * El panel (panel.html) no habla directo con Apps Script: pasa por aquí, que
 * 1) comprueba la clave de administración (PANEL_PASSWORD en Vercel)
 * 2) y 2) reenvía la petición al script de Google Apps.
 *
 * Así el script de Google sigue siendo la única fuente de datos y la clave
 * nunca viaja dentro del HTML público.
 *
 * Variables de entorno (Vercel):
 *   APPS_SCRIPT_URL  URL /exec del script de Google (tiene valor por defecto)
 *   PANEL_PASSWORD   clave de administración del panel
 */

const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbxzqpDb2BzlxdFaNs4c8ZjRZCDE-p88kDibn2EtKRbFq0siEpGOOwPfTMkARtR_vdUMzQ/exec';

const PANEL_PASSWORD = process.env.PANEL_PASSWORD || '';

function reply(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-panel-key');
    return res.status(204).end();
  }

  if (!PANEL_PASSWORD) {
    return reply(res, 503, { ok: false, error: 'El panel todavía no tiene clave configurada en Vercel.' });
  }

  const key = String(req.headers['x-panel-key'] || '');
  if (!key || key !== PANEL_PASSWORD) {
    return reply(res, 401, { ok: false, error: 'Clave incorrecta' });
  }

  try {
    if (req.method === 'GET') {
      const url = `${APPS_SCRIPT_URL}?action=dashboard&key=${encodeURIComponent(key)}`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      const body = await response.text();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(response.ok ? 200 : 502).send(body);
    }

    if (req.method === 'POST') {
      const raw = req.body && typeof req.body === 'object' ? req.body : {};
      const payload = Object.assign({}, raw, { key });
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      const body = await response.text();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(response.ok ? 200 : 502).send(body);
    }

    return reply(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (error) {
    return reply(res, 502, { ok: false, error: (error && error.message) || 'error de red' });
  }
};
