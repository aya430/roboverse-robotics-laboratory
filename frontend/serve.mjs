// Zero-dependency static server for the built ROBOVERSE site (dist/).
// Usage:  node serve.mjs [port]      then open http://localhost:5173
// A server is needed because browsers block module scripts and Web Workers on file:// URLs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.argv[2] || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.ico': 'image/x-icon' };

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('dist/index.html not found – run "npm install" and "npm run build" first.');
  process.exit(1);
}
http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.normalize(path.join(root, url));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`ROBOVERSE running at http://localhost:${port}  (Ctrl+C to stop)`));
