import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProjectBundle } from './build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const HOST = '0.0.0.0';
const PORT = 5173;

buildProjectBundle();

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/' || url === '/index.html') {
    const htmlPath = path.join(rootDir, 'index.html');
    const body = fs.readFileSync(htmlPath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }

  if (url === '/bundle.js' || url === '/dist/bundle.js') {
    const bundlePath = path.join(rootDir, 'dist', 'bundle.js');
    const body = fs.readFileSync(bundlePath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }

  const staticPath = path.join(rootDir, 'dist', url);
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const body = fs.readFileSync(staticPath);
    res.writeHead(200);
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end(req.method === 'HEAD' ? undefined : 'Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`FEM Studio 2D running at http://${HOST}:${PORT}`);
});
