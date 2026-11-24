/* UnStevened Social (Cloudflare version) — local preview on your PC. Run "Preview UnStevened Social.bat". */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { pathToFileURL } = require('url');
const ROOT = __dirname, PUB = path.join(ROOT, 'public'), PORT = Number(process.env.PORT) || 8888, DATA = path.join(ROOT, '.preview');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.json': 'application/json' };
(async () => {
  const { localEnv } = await import(pathToFileURL(path.join(ROOT, 'server', 'local-shims.mjs')).href);
  const handler = (await import(pathToFileURL(path.join(ROOT, 'server', 'api.mjs')).href)).default;
  const env = localEnv(DATA);
  try { env.OWNER_HASH = fs.readFileSync(path.join(DATA, 'owner-hash.txt'), 'utf8').trim(); } catch { console.log('\n  Tip: run "Set Owner Password.bat" first so you can log in as stevennn in the preview.'); }
  http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) {
        const chunks = []; for await (const c of req) chunks.push(c);
        const r = await handler(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), { ip: '127.0.0.1', env });
        res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
      }
      let p = path.normalize(path.join(PUB, decodeURIComponent(req.url.split('?')[0])));
      if (!p.startsWith(PUB)) { res.writeHead(404); return res.end('Not found'); }
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
    } catch (e) { console.error(e); res.writeHead(500); res.end(String(e)); }
  }).listen(PORT, () => {
    const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
    console.log(`\n  UnStevened Social preview (Cloudflare version):\n\n    This PC:       http://localhost:${PORT}\n${lan ? `    Other devices: http://${lan}:${PORT}\n` : ''}\n  Test data is saved in the .preview folder. Close this window to stop.\n`);
    require('child_process').exec(process.platform === 'win32' ? `start "" http://localhost:${PORT}` : `open http://localhost:${PORT}`);
  });
})();
