import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const root = process.cwd();
const dist = `${root}/dist`;
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

let html = await readFile(`${root}/index.html`, 'utf8');
const pixelId = process.env.VITE_META_PIXEL_ID || '';
html = html.replaceAll('__VITE_META_PIXEL_ID__', pixelId);
await writeFile(`${dist}/index.html`, html, 'utf8');
await cp(`${root}/assets`, `${dist}/assets`, { recursive: true });
