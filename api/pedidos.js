/**
 * Punto de entrada estable de los pedidos.
 *
 * La landing envía aquí y este proxy reenvía al script de Google Apps Script.
 * Así la URL /exec de Apps Script vive solo en Vercel (APPS_SCRIPT_URL) y
 * cambiar el script NO obliga a tocar la landing ni a republicarla.
 *
 * Variables de entorno (Vercel):
 *   APPS_SCRIPT_URL  URL /exec del script de Google (tiene valor por defecto)
 */

const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbwVGzo4DHVGlt9_cov7dv4QP63lTtM6u191w18V0Mv-pxRvZeocmZAiHFMuk50WHjQSrg/exec';

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: raw,
    });
    const body = await response.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.ok ? 200 : 502).send(body);
  } catch (error) {
    return res.status(502).json({ ok: false, error: (error && error.message) || 'error de red' });
  }
};
