/**
 * Genera las miniaturas de tela (assets/sw-<color>.webp) que usa el selector
 * de color de la landing.
 *
 * Cada miniatura es el FOTOGRAFO COMPLETO del conjunto (chaqueta + pantalon),
 * recortado de la primera foto del color y compuesto sobre el mismo fondo de
 * estudio, para que se vea toda la prenda y no solo una parte.
 *
 *   npm run thumbs
 *
 * Necesita ffmpeg en el PATH.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const COLORES = ['rosa', 'negro', 'blanco', 'gris', 'cafe', 'chocolate'];

// Recorte de la primera foto (frontal) + fondo del propio estudio
const FILTER = '[0:v]crop=133:496:0:2,scale=-1:268[fig];' +
  '[0:v]crop=24:24:2:2,scale=188:268[bg];' +
  '[bg][fig]overlay=(W-w)/2:0';

let failed = 0;
for (const color of COLORES) {
  const src = `assets/${color}-400.webp`;
  const out = `assets/sw-${color}.webp`;
  if (!existsSync(src)) {
    console.error('Falta', src);
    failed++;
    continue;
  }
  const r = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-filter_complex', FILTER,
      '-frames:v', '1', '-c:v', 'libwebp', '-q:v', '78', '-compression_level', '6', out],
    { stdio: 'inherit' }
  );
  if (r.status !== 0) failed++;
  else console.log('OK', out);
}

if (failed) {
  console.error('Fallaron', failed, 'miniaturas (¿ffmpeg instalado?)');
  process.exit(1);
}
