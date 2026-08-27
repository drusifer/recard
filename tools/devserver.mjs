/**
 * Dev static server with caching disabled.
 *
 * `python3 -m http.server` sends only `Last-Modified` and no
 * `Cache-Control`, so browsers fall back to heuristic caching and hold on
 * to `style.css` and the ES modules across an ordinary reload. During UI
 * work that reads as "my change did nothing" when the change is in fact
 * live on disk - which cost a real round of confusion on 2026-08-20.
 *
 * `no-store` makes every reload fetch fresh. Dev-only; production is a
 * plain static host (D1) and is unaffected.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT ?? 8000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(request.url.split('?', 1)[0]);
  const filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);

  // Don't serve anything outside the project root.
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end('forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`Recard dev server on http://localhost:${PORT} (caching disabled)`);
});
