// Panel session: HMAC-signed cookie, no database (same approach as the House Media panels).
// ADMIN_PASSWORD gives access; ADMIN_SECRET signs the cookie (changing it signs everyone out).
import crypto from 'node:crypto';
import { parseCookies } from './http.js';

const COOKIE = 'ht_admin';
const MAX_AGE = 60 * 60 * 12; // 12 hours

const secret = () => process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || '';
const sign = payload => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
const secureFlag = () => (process.env.VERCEL ? '; Secure' : '');

export const isConfigured = () => Boolean(process.env.ADMIN_PASSWORD);

export function passwordMatches(input) {
  // ignore stray spaces/newlines that often come with a pasted password
  const expected = String(process.env.ADMIN_PASSWORD || '').trim();
  if (!expected || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input.trim()).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function sessionCookie() {
  const payload = String(Date.now() + MAX_AGE * 1000);
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${secureFlag()}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureFlag()}`;

export function isAdmin(req) {
  if (!isConfigured()) return false;
  const value = parseCookies(req)[COOKIE];
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!payload || !sig) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  return Number(payload) > Date.now();
}
