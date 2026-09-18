/** Loopback-only review server. Serves art proposals and two explicit shared assets. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(repo, 'docs/art-direction/2026-09-17');
const shared = {
  '/screen-designs.json': path.join(repo, 'docs/art-direction/2026-09-18/screen-designs.json'),
  '/assets/varsity-campus.png': path.join(repo, 'client/src/assets/art/varsity-campus.png'),
};
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.woff2':'font/woff2', '.md':'text/plain' };
http.createServer((req,res) => {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = shared[pathname] || path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!shared[pathname] && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch(error) { res.writeHead(error instanceof URIError ? 400 : 404).end('Preview resource unavailable'); }
}).listen(Number(process.env.PAWA_ART_PREVIEW_PORT || 49744),'127.0.0.1',function() {
  console.log(`PAWA art review: http://127.0.0.1:${this.address().port}/screen-book.html`);
});
