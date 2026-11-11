// Static site generator — no dependencies. `node scripts/build.mjs` → dist/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
// Public address used for canonical links, share previews and the sitemap.
// Set SITE_URL in the hosting environment (e.g. Vercel → Settings → Environment Variables).
const SITE_URL = (process.env.SITE_URL || 'https://www.heliatoledo.com').replace(/\/$/, '');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content.json'), 'utf8'));
const IMG = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/images.json'), 'utf8'));
const V = Date.now().toString(36); // cache-busting for css/js

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const projectsBySlug = Object.fromEntries(C.projects.map(p => [p.slug, p]));

// ---------- images ----------
function srcset(key) {
  const m = IMG[key];
  if (!m) throw new Error('Missing image ' + key);
  return m.widths.map(w => `/img/${key}-${w}.webp ${w}w`).join(', ');
}
function src(key, target = 960) {
  const m = IMG[key];
  const w = m.widths.find(w => w >= target) || m.widths.at(-1);
  return `/img/${key}-${w}.webp`;
}
function img(key, { alt = '', sizes = '100vw', eager = false, cls = '', attrs = '' } = {}) {
  const m = IMG[key];
  if (!m) throw new Error('Missing image ' + key);
  return `<img src="${src(key)}" srcset="${srcset(key)}" sizes="${sizes}" width="${m.w}" height="${m.h}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${cls ? ` class="${cls}"` : ''} style="--ph:${m.color}"${attrs ? ' ' + attrs : ''}>`;
}

// ---------- layout ----------
const NAV = [
  ['/illustration/', 'illustration'],
  ['/surface-design/', 'surface design'],
  ['/shop/', 'shop'],
  ['/info/', 'info'],
];
const logo = fs.readFileSync(path.join(ROOT, 'public/img/logo-helia.svg'), 'utf8')
  .replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<title>[\s\S]*?<\/title>/g, '')
  .replace('<svg', '<svg aria-hidden="true" focusable="false"').replace(/\s(id|data-name|class)="[^"]*"/g, '');

function page({ url, title, description, body, current = '', lang = 'en', ogImage, bodyClass = '', head = '' }) {
  const fullTitle = title ? `${title} — Helia Toledo` : 'Helia Toledo — Illustration & Surface Design';
  // share previews use 1200×630 JPEGs (public/og/<key>.jpg); WebP isn't shown by every app
  const og = SITE_URL + (ogImage && fs.existsSync(path.join(ROOT, 'public/og', ogImage + '.jpg')) ? `/og/${ogImage}.jpg` : '/og.jpg');
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE_URL}${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${SITE_URL}${url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FAFAF7">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/roboto.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=${V}">${head}
<script type="speculationrules">{"prerender":[{"where":{"and":[{"href_matches":"/*"},{"not":{"href_matches":"/cart/*"}}]},"eagerness":"moderate"}]}</script>
<script src="/assets/site.js?v=${V}" defer></script>
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <a class="masthead__logo" href="/" aria-label="Helia Toledo, home">${logo}</a>
  <nav class="masthead__nav" aria-label="Main">
    <ul>${NAV.map(([h, l]) => `<li><a href="${h}"${current === h ? ' aria-current="page"' : ''}>${l}</a></li>`).join('')}<li><a class="masthead__cart" href="/cart/"${current === '/cart/' ? ' aria-current="page"' : ''}>cart<span class="masthead__count" data-cart-count hidden></span></a></li></ul>
  </nav>
</header>
<main id="main">
${body}
</main>
<footer class="colophon">
  <div class="colophon__contact">
    <p>Commissions, licensing and collaborations</p>
    <a class="colophon__mail" href="mailto:${C.site.email}">${C.site.email}</a>
    <a href="https://www.instagram.com/${C.site.instagram}/" rel="me">Instagram @${C.site.instagram}</a>
  </div>
  <nav class="colophon__legal" aria-label="Legal">
    <ul>${C.legal.map(l => `<li><a href="/legal/${l.slug}/" lang="es">${esc(l.title)}</a></li>`).join('')}</ul>
    <p>© ${new Date().getFullYear()} Helia Toledo</p>
  </nav>
</footer>
<dialog class="viewer" aria-label="Image viewer">
  <form method="dialog"><button class="viewer__close" aria-label="Close">Close</button></form>
  <figure><img alt=""><figcaption></figcaption></figure>
</dialog>
</body>
</html>`;
}

// ---------- components ----------
function workGrid(items, { label, sizes = '(min-width: 1100px) 31vw, (min-width: 640px) 47vw, 100vw', firstEager = 0 } = {}) {
  return `<ul class="work" role="list"${label ? ` aria-label="${esc(label)}"` : ''}>
${items.map((it, i) => {
    const p = it.project && projectsBySlug[it.project];
    const alt = `${it.title}, ${it.term}`;
    const picture = img(it.image, { alt: p ? '' : alt, sizes, eager: i < firstEager });
    const caption = `<span class="work__title">${esc(it.title)}</span><span class="work__term">${esc(it.term)}</span>`;
    if (p) {
      return `<li class="work__item"><a class="work__link" href="/work/${p.slug}/" data-vt="${p.slug}">${picture}<span class="work__cap">${caption}<span class="work__more">See project</span></span></a></li>`;
    }
    return `<li class="work__item"><button class="work__link" type="button" data-view="${srcset(it.image)}" data-view-src="${src(it.image, 1600)}" data-caption="${esc(alt)}" aria-label="View ${esc(alt)} larger">${picture}<span class="work__cap">${caption}</span></button></li>`;
  }).join('\n')}
</ul>`;
}

// ---------- pages ----------
const out = [];
const emit = (url, html) => out.push([url, html]);

// Home
{
  const repeats = C.repeats.map(r => ({ ...r, p: r.project && projectsBySlug[r.project] }));
  const first = repeats[0];
  const tile = r => `image-set(url(/img/tile-${r.name}-640.webp) 1x, url(/img/tile-${r.name}-1280.webp) 2x)`;
  const label = r => {
    const meta = [
      r.collection && ['Collection', esc(r.collection)],
      r.year && ['Year', r.year],
      r.technique && ['Medium', esc(cap(r.technique))],
      r.inks?.length && ['Inks', `<span class="swatch__inks">${r.inks.map(c => `<span style="--c:${c}" title="${c}"></span>`).join('')}</span>`],
    ].filter(Boolean);
    return `<p class="swatch__name">${esc(r.title)}</p>
      ${meta.length ? `<dl class="swatch__meta">${meta.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl>` : '<p class="swatch__meta">Seamless repeat, painted by hand</p>'}`;
  };
  const body = `
<section class="wall" aria-label="Pattern repeats by Helia Toledo">
  <div class="wall__paper" style="--tile:${tile(first)};--tile-size:${first.size}px" role="img" aria-label="${esc(first.title)}, a repeating pattern by Helia Toledo"></div>
  <div class="swatch">
    <div class="swatch__label" aria-live="polite">${label(first)}</div>
    <div class="swatch__actions">
      <button class="swatch__next" type="button">Next pattern <span class="swatch__count">1 of ${repeats.length}</span></button>
      <a class="swatch__project" href="${first.p ? `/work/${first.p.slug}/` : '/surface-design/'}">${first.p ? 'See project' : 'All surface design'}</a>
    </div>
  </div>
  <script type="application/json" id="repeats">${JSON.stringify(repeats.map(r => ({ tile: tile(r), preload: `/img/tile-${r.name}-1280.webp`, size: r.size, href: r.p ? `/work/${r.p.slug}/` : '/surface-design/', cta: r.p ? 'See project' : 'All surface design', title: r.title, label: label(r) }))).replace(/</g, '\\u003c')}</script>
</section>
<section class="intro">
  <h1 class="intro__text">Helia Toledo paints wallpapers, murals, books and album covers in watercolour and gouache, from her studio in Madrid.</h1>
  <p class="intro__aside">Art director at Tres Tintas Barcelona and Coordonné from 2021 to 2025. Now working freelance with brands and publishers. <a href="mailto:${C.site.email}">Write to Helia</a></p>
</section>
<section class="section" aria-labelledby="sel">
  <h2 class="section__title" id="sel">Selected work</h2>
  ${workGrid(C.home)}
  <p class="section__more"><a href="/illustration/">All illustration</a><a href="/surface-design/">All surface design</a></p>
</section>`;
  emit('/', page({ url: '/', title: '', description: 'Helia Toledo is a Madrid-based illustrator and surface pattern designer working in watercolour and gouache: wallpapers, murals, books and album artwork.', body, current: '/', ogImage: C.home[0].image, bodyClass: 'is-home', head: `\n<link rel="preload" as="image" imagesrcset="/img/tile-${first.name}-640.webp 1x, /img/tile-${first.name}-1280.webp 2x" fetchpriority="high">` }));
}

// Category pages
for (const [url, list, title, blurb] of [
  ['/illustration/', C.illustration, 'Illustration', 'Books, posters, album artwork and commissioned scenes, painted by hand.'],
  ['/surface-design/', C.surface, 'Surface design', 'Wallpapers, murals, tapestries and objects. Most were designed for Tres Tintas Barcelona and Coordonné.'],
]) {
  const body = `
<header class="pagehead">
  <h1 class="pagehead__title">${title}</h1>
  <p class="pagehead__blurb">${blurb}</p>
</header>
${workGrid(list, { label: title, firstEager: 3 })}`;
  emit(url, page({ url, title, description: `${title} by Helia Toledo. ${blurb}`, body, current: url, ogImage: list[0].image }));
}

// Project pages, ordered as they appear across the site
const order = [...new Set([...C.illustration, ...C.surface].map(i => i.project).filter(Boolean))];
order.forEach((slug, i) => {
  const p = projectsBySlug[slug];
  const prev = projectsBySlug[order[(i - 1 + order.length) % order.length]];
  const next = projectsBySlug[order[(i + 1) % order.length]];
  const discipline = C.illustration.some(x => x.project === slug) ? ['/illustration/', 'Illustration'] : ['/surface-design/', 'Surface design'];
  const body = `
<article class="project">
  <div class="project__images">
    ${p.images.map((k, j) => `<button class="project__img" type="button" data-view="${srcset(k)}" data-view-src="${src(k, 1600)}" data-caption="${esc(p.title)}, image ${j + 1} of ${p.images.length}" aria-label="View image ${j + 1} of ${p.images.length} larger">${img(k, { alt: `${p.title}, image ${j + 1} of ${p.images.length}`, sizes: '(min-width: 900px) 62vw, 100vw', eager: j === 0, attrs: j === 0 ? 'data-hero' : '' })}</button>`).join('\n    ')}
  </div>
  <aside class="project__info">
    <p class="project__crumb"><a href="${discipline[0]}">${discipline[1]}</a></p>
    <h1 class="project__title">${esc(p.title)}</h1>
    <dl class="project__meta">
      <div><dt>Year</dt><dd>${p.year}</dd></div>
      ${p.kind ? `<div><dt>Type</dt><dd>${esc(cap(p.kind))}</dd></div>` : ''}
      <div><dt>Medium</dt><dd>${esc(cap(p.technique))}</dd></div>
    </dl>
    ${p.en ? `<p class="project__text">${esc(p.en)}</p>` : ''}
    ${p.es ? `<p class="project__text project__text--es" lang="es">${esc(p.es)}</p>` : ''}
    ${p.links.length ? `<ul class="project__links">${p.links.map(l => `<li><a href="${esc(l.url)}">${esc(l.label)}</a> <span lang="es">${esc(l.es)}</span></li>`).join('')}</ul>` : ''}
  </aside>
</article>
<nav class="pager" aria-label="More projects">
  <a class="pager__prev" href="/work/${prev.slug}/"><span>Previous</span>${esc(prev.title)}</a>
  <a class="pager__next" href="/work/${next.slug}/"><span>Next</span>${esc(next.title)}</a>
</nav>`;
  emit(`/work/${slug}/`, page({ url: `/work/${slug}/`, title: p.title, description: p.en || `${p.title}, ${p.year}. ${cap(p.technique)}.`, body, current: discipline[0], ogImage: p.images[0] }));
});

// Shop
const money = n => `€${Number.isInteger(n) ? n : n.toFixed(2)}`;
const minPrice = p => Math.min(...p.sizes.map(s => s.price));
const maxPrice = p => Math.max(...p.sizes.map(s => s.price));
const S = C.shopInfo;
{
  const card = (s, i) => `<li class="shop__item">
  <a class="shop__link" href="/shop/${s.slug}/" data-vt="${s.slug}">
    ${img(s.images[0], { alt: '', sizes: '(min-width: 1100px) 23vw, (min-width: 640px) 31vw, 50vw', eager: i < 4 })}
    ${s.images[1] ? img(s.images[1], { alt: '', sizes: '(min-width: 1100px) 23vw, (min-width: 640px) 31vw, 50vw', cls: 'shop__alt' }) : ''}
    <span class="shop__name">${esc(s.title)}</span>
    <span class="shop__price">${money(minPrice(s))} – ${money(maxPrice(s))}</span>
  </a>
</li>`;
  const collections = [...new Set(C.shop.map(s => s.collection))].sort((a, b) => b - a);
  let n = 0;
  const body = `
<header class="pagehead">
  <h1 class="pagehead__title">Shop</h1>
  <p class="pagehead__blurb">Tapestries printed on cotton canvas from Helia’s original paintings, each one handmade and signed. Three sizes, from ${money(Math.min(...C.shop.map(minPrice)))}.</p>
</header>
${collections.map(year => {
    const items = C.shop.filter(s => s.collection === year);
    return `<section class="shopgroup" aria-labelledby="c${year}">
  <h2 class="section__title" id="c${year}">${year} collection <span class="shopgroup__count">${items.length} tapestries</span></h2>
  <ul class="shop" role="list">
${items.map(s => card(s, n++)).join('\n')}
  </ul>
</section>`;
  }).join('\n')}`;
  emit('/shop/', page({ url: '/shop/', title: 'Shop', description: `Tapestries by Helia Toledo, printed on cotton canvas from original watercolour and gouache paintings. Handmade and signed, from ${money(Math.min(...C.shop.map(minPrice)))}.`, body, current: '/shop/', ogImage: C.shop[0].images[0] }));
}

// Product pages
C.shop.forEach((s, i) => {
  const prev = C.shop[(i - 1 + C.shop.length) % C.shop.length];
  const next = C.shop[(i + 1) % C.shop.length];
  const first = s.sizes[0];
  const body = `
<article class="project product">
  <div class="project__images">
    ${s.images.map((k, j) => `<button class="project__img" type="button" data-view="${srcset(k)}" data-view-src="${src(k, 1600)}" data-caption="${esc(s.title)} tapestry, image ${j + 1} of ${s.images.length}" aria-label="View image ${j + 1} of ${s.images.length} larger">${img(k, { alt: `${s.title} tapestry, image ${j + 1} of ${s.images.length}`, sizes: '(min-width: 900px) 58vw, 100vw', eager: j === 0, attrs: j === 0 ? 'data-hero' : '' })}</button>`).join('\n    ')}
  </div>
  <aside class="project__info">
    <p class="project__crumb"><a href="/shop/">Shop</a> <span aria-hidden="true">/</span> <a href="/shop/#c${s.collection}">${s.collection} collection</a></p>
    <h1 class="project__title">${esc(s.title)}</h1>
    <form class="buy" data-slug="${s.slug}" action="mailto:${C.site.email}" method="get">
      <p class="buy__price" aria-live="polite">${money(first.price)}</p>
      <fieldset class="buy__sizes">
        <legend>Size</legend>
        ${s.sizes.map((z, j) => `<label class="buy__size"><input type="radio" name="size" value="${esc(z.label)}" data-price="${z.price}"${j === 0 ? ' checked' : ''}><span>${esc(z.label)}</span><span class="buy__size-price">${money(z.price)}</span></label>`).join('\n        ')}
      </fieldset>
      <div class="buy__row">
        <label class="buy__qty"><span>Quantity</span><input type="number" name="qty" value="1" min="1" max="10" inputmode="numeric"></label>
        <button class="buy__add" type="submit">Add to cart</button>
      </div>
      <p class="buy__added" role="status" hidden>Added to your cart. <a href="/cart/">View cart</a></p>
      <input type="hidden" name="subject" value="Order: ${esc(s.title)} tapestry">
    </form>
    <dl class="project__meta">
      <div><dt>Material</dt><dd>${esc(cap(S.material))}</dd></div>
      <div><dt>Collection</dt><dd>${s.collection}</dd></div>
      <div><dt>Reference</dt><dd>${esc(s.sku)}</dd></div>
      <div><dt>Shipping</dt><dd>10–15 days</dd></div>
    </dl>
    ${S.en.map(p => `<p class="project__text">${esc(p)}</p>`).join('\n    ')}
    <div class="project__text project__text--es" lang="es">${S.es.map(p => `<p>${esc(p)}</p>`).join('')}</div>
  </aside>
</article>
<nav class="pager" aria-label="More tapestries">
  <a class="pager__prev" href="/shop/${prev.slug}/"><span>Previous</span>${esc(prev.title)}</a>
  <a class="pager__next" href="/shop/${next.slug}/"><span>Next</span>${esc(next.title)}</a>
</nav>`;
  emit(`/shop/${s.slug}/`, page({ url: `/shop/${s.slug}/`, title: `${s.title} tapestry`, description: `${s.title}, a tapestry by Helia Toledo. ${cap(S.material)}, handmade and signed, ${s.collection} collection. ${s.sizes.map(z => `${z.label} ${money(z.price)}`).join(', ')}.`, body, current: '/shop/', ogImage: s.images[0] }));
});

// Cart + order confirmation (rendered client-side from the catalogue below)
{
  const catalogue = Object.fromEntries(C.shop.map(s => [s.slug, { title: s.title, thumb: src(s.images[0], 480), sizes: Object.fromEntries(s.sizes.map(z => [z.label, z.price])) }]));
  const body = `
<header class="pagehead">
  <h1 class="pagehead__title">Cart</h1>
</header>
<section class="cart" data-cart data-email="${C.site.email}">
  <p class="cart__empty">Your cart is empty. <a href="/shop/">Browse the tapestries</a></p>
  <noscript><p>The cart needs JavaScript. To order without it, write to <a href="mailto:${C.site.email}">${C.site.email}</a> with the tapestry and size you’d like.</p></noscript>
</section>
<script type="application/json" id="catalogue">${JSON.stringify(catalogue).replace(/</g, '\\u003c')}</script>`;
  emit('/cart/', page({ url: '/cart/', title: 'Cart', description: 'Your cart', body, current: '/cart/' }));

  emit('/shop/thanks/', page({ url: '/shop/thanks/', title: 'Order confirmed', description: 'Thank you for your order', body: `
<section class="pagehead pagehead--404" data-thanks>
  <h1 class="pagehead__title">Thank you</h1>
  <p class="pagehead__blurb">Your order is confirmed and a receipt is on its way to your email. Each tapestry is made by hand, so please allow 10–15 days for delivery. Questions about your order: <a href="mailto:${C.site.email}">${C.site.email}</a></p>
</section>` }));
}

// Info
{
  const body = `
<article class="about">
  <figure class="about__portrait">${img(C.site.portrait, { alt: 'Helia Toledo painting at her desk', sizes: '(min-width: 900px) 34vw, 100vw', eager: true })}</figure>
  <div class="about__text">
    <h1 class="about__title"><img src="/img/about-me.svg" alt="About me" width="300" height="60"></h1>
    ${C.site.bio.map(p => `<p>${esc(p)}</p>`).join('\n    ')}
    <h2 class="about__title about__title--contact"><img src="/img/contact.svg" alt="Contact" width="300" height="60"></h2>
    <p>For commissions, licensing or any other enquiry, write to <a href="mailto:${C.site.email}">${C.site.email}</a>.</p>
    <p>New work appears first on Instagram: <a href="https://www.instagram.com/${C.site.instagram}/" rel="me">@${C.site.instagram}</a></p>
  </div>
</article>`;
  emit('/info/', page({ url: '/info/', title: 'Info', description: C.site.bio[0], body, current: '/info/', ogImage: C.site.portrait }));
}

// Legal
for (const l of C.legal) {
  emit(`/legal/${l.slug}/`, page({ url: `/legal/${l.slug}/`, title: l.title, description: `${l.title} — heliatoledo.com`, lang: 'es', body: `<article class="legal">${l.html}</article>` }));
}

// 404
emit('/404', page({ url: '/404', title: 'Page not found', description: 'Page not found', body: `
<section class="pagehead pagehead--404">
  <h1 class="pagehead__title">This page isn’t here</h1>
  <p class="pagehead__blurb">The address may have changed when the site was rebuilt. Try <a href="/illustration/">illustration</a>, <a href="/surface-design/">surface design</a> or the <a href="/shop/">shop</a>.</p>
</section>` }));

// ---------- write ----------
// Incremental copy of public/ → dist/: skips unchanged files, so rebuilds are fast and
// survive synced folders (Google Drive, Dropbox) that briefly lock files.
function syncDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) { syncDir(a, b); continue; }
    const sa = fs.statSync(a);
    const sb = fs.existsSync(b) && fs.statSync(b);
    if (sb && sb.size === sa.size && sb.mtimeMs >= sa.mtimeMs) continue;
    for (let tries = 0; ; tries++) {
      try { fs.copyFileSync(a, b); break; } catch (err) { if (tries > 4) throw err; }
    }
  }
}
// `--html-only` (used by `npm run dev`) skips the asset copy; the dev server reads public/ directly.
if (!process.argv.includes('--html-only')) syncDir(path.join(ROOT, 'public'), DIST);
else fs.mkdirSync(DIST, { recursive: true });
for (const [url, html] of out) {
  const file = url === '/404' ? path.join(DIST, '404.html') : path.join(DIST, url, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}
const urls = out.map(([u]) => u).filter(u => u !== '/404');
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${SITE_URL}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
console.log(`Built ${out.length} pages → dist/`);
