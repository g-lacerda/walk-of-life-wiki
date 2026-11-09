#!/usr/bin/env node
// Local preview of dist/ with hot reload. Usage: node tools/serve.js [port]
// Edits under tools/ rebuild the site and refresh open tabs. The reload script is
// injected only in responses from this server, so dist/ stays clean for publishing.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const tools = __dirname;
const project = path.resolve(tools, '..');
const root = path.join(project, 'dist');
const port = Number(process.argv[2]) || 4173;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml' };
const RELOAD = '<script>new EventSource("/__reload").onmessage=function(){location.reload()}</script>';

const clients = new Set();
const notify = () => { for (const c of clients) c.write('data: reload\n\n'); };

let building = false, again = false;
function rebuild() {
  if (building) { again = true; return; }
  building = true;
  const started = Date.now();
  const child = spawn(process.execPath, [path.join(tools, 'build-site.js')], { cwd: project, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = '';
  child.stderr.on('data', d => { errors += d; });
  child.on('close', code => {
    building = false;
    if (code === 0) { console.log(`rebuilt in ${Date.now() - started} ms`); notify(); }
    else console.error(`build failed, keeping the page as it is:\n${errors}`);
    if (again) { again = false; rebuild(); }
  });
}

// Stylesheets and browser scripts only need copying; anything else needs a full build.
let timer = null, pendingFull = false;
const pendingAssets = new Set();
fs.watch(tools, { recursive: true }, (_, name) => {
  if (!name || name === 'serve.js') return;
  if (/^assets[\\/]/.test(name)) pendingAssets.add(path.basename(name)); else pendingFull = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (pendingFull) { pendingFull = false; pendingAssets.clear(); rebuild(); return; }
    for (const f of pendingAssets) {
      const from = path.join(tools, 'assets', f);
      // A build may be swapping dist/ right now; the next build copies the file anyway.
      try { if (fs.existsSync(from)) fs.copyFileSync(from, path.join(root, 'assets', f)); }
      catch (e) { console.error(`could not copy ${f}: ${e.code}`); }
    }
    pendingAssets.clear();
    notify();
  }, 150);
});

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400).end(); return; }
  if (rel === '/__reload') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let file = path.join(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('404'); return; }
    const ext = path.extname(file);
    const body = ext === '.html' ? Buffer.from(data.toString('utf8').replace('</body>', `${RELOAD}</body>`)) : data;
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  });
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/ (hot reload on)`));
