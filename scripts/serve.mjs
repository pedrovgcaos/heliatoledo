// Local preview server (no dependencies). `npm run dev` → http://localhost:4321
// Pages come from dist/, static files from public/, and /api/<name> runs api/<name>.js like on Vercel.
// Put local-only settings in .env.local (e.g. ADMIN_PASSWORD=… to try the panel). Orders go to .data/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PUBLIC = path.join(ROOT, 'public');
const PORT = +process.env.PORT || 4321;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json' };

// .env.local → process.env (only keys not already set)
const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
process.chdir(ROOT); // api code reads src/ and .data/ relative to the project

const findFile = (base, p) => {
  let f = path.join(base, p);
  if (!f.startsWith(base) || !fs.existsSync(f)) return null;
  if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
};

http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);

  const api = p.match(/^\/api\/([a-z-]+)\/?$/);
  if (api) {
    const file = path.join(ROOT, 'api', `${api[1]}.js`);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    try {
      const mod = await import(`${pathToFileURL(file).href}?t=${fs.statSync(file).mtimeMs}`);
      return await mod.default(req, res);
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: String(err.message) }));
    }
  }

  const file = findFile(PUBLIC, p) || findFile(DIST, p);
  if (!file) { res.writeHead(404, { 'Content-Type': TYPES['.html'] }); return fs.createReadStream(path.join(DIST, '404.html')).pipe(res); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Preview on http://localhost:${PORT}`));
