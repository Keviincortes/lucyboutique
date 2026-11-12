import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist');
const port = Number(process.argv[2] || 4321);
const types = { '.html':'text/html; charset=utf-8', '.webp':'image/webp', '.mp4':'video/mp4', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p === '/' || p === '\\') p = '/index.html';
    let file = join(root, p);
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch {}
    if (!extname(file)) {
      try { await stat(file + '.html'); file += '.html'; } catch {}
    }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
  }
}).listen(port, () => console.log(`http://127.0.0.1:${port}`));
