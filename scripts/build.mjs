import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = process.cwd();
const dist = `${root}/dist`;

await rm(dist, { recursive: true, force: true });
await mkdir(`${dist}/assets`, { recursive: true });

let html = await readFile(`${root}/index.html`, 'utf8');
const pixelId = process.env.VITE_META_PIXEL_ID || '1441414194212741';
html = html.replaceAll('1441414194212741', pixelId);
await writeFile(`${dist}/index.html`, html, 'utf8');

for (const page of ['politica.html', 'terminos.html']) {
  if (existsSync(`${root}/${page}`)) {
    await cp(`${root}/${page}`, `${dist}/${page}`);
  }
}

// Archivo de verificación de dominio de Meta (debe quedar en la raíz)
for (const file of ['vbpx964ox465z692oh8eid8lgcuq2w.html']) {
  if (existsSync(`${root}/${file}`)) {
    await cp(`${root}/${file}`, `${dist}/${file}`);
  }
}

// Solo los recursos que la landing usa (los originales pesados se quedan fuera)
const keep = /\.(webp|mp4|jpe?g|png|gif|svg)$/i;
const skip = /^(coleccion|ugc)\.mp4$|^tela-sudadera\.gif$|^lucy-header\.png$|^tabla-|^(rosa|negro|blanco|gris|cafe|chocolate)\.png$|^talla-(xs|s|m|l|xl)\.png$|^tela-sudadera-poster\.png$|^promo\.jpeg$|^logo\.jpeg$|^lucy-header\.jpg$|^(nequi|daviplata|bancolombia)\.png$/i;

const { readdir } = await import('node:fs/promises');
const files = await readdir(`${root}/assets`, { withFileTypes: true });
for (const f of files) {
  if (!f.isFile() || !keep.test(f.name) || skip.test(f.name)) continue;
  await cp(`${root}/assets/${f.name}`, `${dist}/assets/${f.name}`);
}

console.log('Build listo:', dist);
