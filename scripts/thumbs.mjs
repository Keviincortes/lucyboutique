/**
 * Genera las miniaturas de tela (assets/sw-<color>.webp) que usa el selector de
 * color del formulario de pedido. Necesita ffmpeg en el PATH.
 *
 *   npm run thumbs
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const COLORS = ['rosa', 'negro', 'blanco', 'gris', 'cafe', 'chocolate'];

// Recorte del tercer panel de la foto (detalle de la tela con el cordón)
const CROP = 'crop=133:190:267:310,scale=266:380';

let failed = 0;
for (const color of COLORS) {
  const src = `assets/${color}-400.webp`;
  const out = `assets/sw-${color}.webp`;
  if (!existsSync(src)) {
    console.error('Falta', src);
    failed++;
    continue;
  }
  const r = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vf', CROP, '-c:v', 'libwebp', '-q:v', '74', '-compression_level', '6', out],
    { stdio: 'inherit' }
  );
  if (r.status !== 0) failed++;
  else console.log('OK', out);
}

if (failed) {
  console.error('Fallaron', failed, 'miniaturas (¿ffmpeg instalado?)');
  process.exit(1);
}
