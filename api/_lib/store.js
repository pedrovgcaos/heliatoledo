// JSON storage. On Vercel: a *private* Vercel Blob store (BLOB_READ_WRITE_TOKEN), so customer
// data is never publicly reachable. Locally (no token): files in .data/ (git-ignored).
import fs from 'node:fs/promises';
import path from 'node:path';

const LOCAL_DIR = path.join(process.cwd(), '.data');
export const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

let blobLib;
const blob = async () => (blobLib ??= await import('@vercel/blob'));

/** Read a JSON document. Returns { data, etag } or { data: null } when missing. */
export async function readDoc(name) {
  if (!useBlob()) {
    try {
      const file = path.join(LOCAL_DIR, name);
      const [text, stat] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
      return { data: JSON.parse(text), etag: String(stat.mtimeMs) };
    } catch (err) {
      if (err.code === 'ENOENT') return { data: null, etag: null };
      throw err;
    }
  }
  const { get } = await blob();
  const r = await get(name, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return { data: null, etag: null };
  const text = await new Response(r.stream).text();
  return { data: JSON.parse(text), etag: r.blob.etag };
}

/** Write a JSON document. With `etag`, the write only succeeds if nobody changed it meanwhile. */
export async function writeDoc(name, data, { etag } = {}) {
  const body = JSON.stringify(data);
  if (!useBlob()) {
    const file = path.join(LOCAL_DIR, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    if (etag) {
      const stat = await fs.stat(file).catch(() => null);
      if (stat && String(stat.mtimeMs) !== etag) throw Object.assign(new Error('conflict'), { conflict: true });
    }
    await fs.writeFile(file, body);
    return;
  }
  const { put, BlobPreconditionFailedError } = await blob();
  try {
    await put(name, body, {
      access: 'private', addRandomSuffix: false, allowOverwrite: true,
      contentType: 'application/json', cacheControlMaxAge: 60, ...(etag ? { ifMatch: etag } : {}),
    });
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError) throw Object.assign(new Error('conflict'), { conflict: true });
    throw err;
  }
}

/** Read-modify-write with retries, for documents several requests may update at once. */
export async function updateDoc(name, fn, fallback) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, etag } = await readDoc(name);
    const next = await fn(data ?? structuredClone(fallback));
    try {
      await writeDoc(name, next, { etag: etag || undefined });
      return next;
    } catch (err) {
      if (!err.conflict) throw err;
      await new Promise(r => setTimeout(r, 80 + Math.random() * 200));
    }
  }
  throw Object.assign(new Error('Too many concurrent updates'), { status: 503 });
}

/** Names of all documents under a prefix, e.g. "orders/". */
export async function listDocs(prefix) {
  if (!useBlob()) {
    try { return (await fs.readdir(path.join(LOCAL_DIR, prefix))).map(f => prefix + f); } catch { return []; }
  }
  const { list } = await blob();
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    out.push(...page.blobs.map(b => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}
