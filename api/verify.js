/**
 * Archivo de verificación de dominio de Meta.
 * Se sirve por rewrite para evitar el redirect de URLs limpias de Vercel.
 */
module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send('vbpx964ox465z692oh8eid8lgcuq2w');
};
