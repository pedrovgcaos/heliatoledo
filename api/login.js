import { passwordMatches, sessionCookie, clearCookie, isConfigured } from './_lib/auth.js';
import { readJson, send, sameOrigin } from './_lib/http.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method === 'DELETE') return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(), 'Cache-Control': 'no-store' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST, DELETE'); return send(res, 405, { error: 'Método no permitido.' }); }
  if (!isConfigured()) return send(res, 503, { error: 'El panel aún no tiene contraseña. Defínela en Vercel con la variable ADMIN_PASSWORD.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Origen no permitido.' });
  let body = {};
  try { body = await readJson(req, 10_000); } catch { /* invalid body counts as a wrong password */ }
  if (!passwordMatches(body.password)) {
    await wait(700); // slows down repeated guesses
    return send(res, 401, { error: 'Contraseña incorrecta.' });
  }
  return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(), 'Cache-Control': 'no-store' });
}
