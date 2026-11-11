// Add or update artwork: drop JPG/PNG files into originals/ and run `npm run images`.
// Writes responsive WebP files to public/img/ and records size + placeholder colour in src/images.json.
// The image key is the file name in lowercase-with-dashes, e.g. "SU40_New Pattern.jpg" → "su40-new-pattern".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sharp = (await import('sharp').catch(() => {
  console.error('This script needs sharp: run `npm install` first.');
  process.exit(1);
})).default;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'originals');
const OUT = path.join(ROOT, 'public/img');
const MANIFEST = path.join(ROOT, 'src/images.json');
const WIDTHS = [480, 960, 1440];

const key = f => path.basename(f).replace(/\.[a-z]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
if (!fs.existsSync(SRC)) { fs.mkdirSync(SRC); console.log('Created originals/. Put images there and run again.'); process.exit(0); }

const files = fs.readdirSync(SRC).filter(f => /\.(jpe?g|png|webp|tiff?)$/i.test(f));
for (const f of files) {
  const file = path.join(SRC, f);
  const k = key(f);
  const meta = await sharp(file).rotate().metadata();
  const top = Math.min(meta.width, 1440);
  const widths = [...WIDTHS.filter(w => w < top - 200), top];
  for (const w of widths) {
    await sharp(file).rotate().resize({ width: w }).webp({ quality: 72, effort: 4 }).toFile(path.join(OUT, `${k}-${w}.webp`));
  }
  // share-preview version (used when this image is the first one on a page)
  fs.mkdirSync(path.join(ROOT, 'public/og'), { recursive: true });
  await sharp(file).rotate().resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 76, mozjpeg: true }).toFile(path.join(ROOT, 'public/og', `${k}.jpg`));
  const { dominant } = await sharp(file).stats();
  manifest[k] = { w: meta.width, h: meta.height, widths, color: `rgb(${dominant.r},${dominant.g},${dominant.b})` };
  console.log(`${k}  (${widths.join(', ')})`);
}
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`${files.length} image(s) processed. Use the key in src/content.json.`);
