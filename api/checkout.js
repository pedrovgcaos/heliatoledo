// Vercel serverless function: creates a Stripe Checkout session for the cart.
// Prices always come from src/content.json, never from the browser.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   STRIPE_SECRET_KEY   sk_live_… or sk_test_…  (without it, GET reports enabled:false and the cart
//                       falls back to "Send order by email")
//   SITE_URL            public address, used for the return links
//   SHIP_COUNTRIES      optional, comma-separated ISO codes allowed for delivery (default: EU + GB, CH, NO, US)
//   STRIPE_SHIPPING_RATE optional, one or more shipping rate IDs (shr_…), comma-separated
import fs from 'node:fs';
import path from 'node:path';

const content = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/content.json'), 'utf8'));
const products = Object.fromEntries(content.shop.map(p => [p.slug, p]));
const MAX_QTY = 10;
const DEFAULT_COUNTRIES = 'ES,PT,FR,IT,DE,NL,BE,LU,AT,IE,DK,SE,FI,PL,CZ,GR,GB,CH,NO,US';

export default async function handler(req, res) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (req.method === 'GET') return res.status(200).json({ enabled: Boolean(key) });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
  if (!key) return res.status(503).json({ error: 'not_configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
  const lines = [];
  for (const i of items) {
    const p = products[i?.slug];
    const size = p?.sizes.find(s => s.label === i?.size);
    const qty = Number.parseInt(i?.qty, 10);
    if (!p || !size || !(qty >= 1 && qty <= MAX_QTY)) return res.status(400).json({ error: 'invalid_item' });
    lines.push({ p, size, qty });
  }
  if (!lines.length) return res.status(400).json({ error: 'empty_cart' });

  const origin = (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
  const f = new URLSearchParams();
  f.set('mode', 'payment');
  f.set('locale', 'auto');
  f.set('success_url', `${origin}/shop/thanks/?session_id={CHECKOUT_SESSION_ID}`);
  f.set('cancel_url', `${origin}/cart/`);
  f.set('billing_address_collection', 'auto');
  f.set('phone_number_collection[enabled]', 'true');
  (process.env.SHIP_COUNTRIES || DEFAULT_COUNTRIES).split(',').map(c => c.trim()).filter(Boolean)
    .forEach((c, n) => f.set(`shipping_address_collection[allowed_countries][${n}]`, c));
  (process.env.STRIPE_SHIPPING_RATE || '').split(',').map(s => s.trim()).filter(Boolean)
    .forEach((r, n) => f.set(`shipping_options[${n}][shipping_rate]`, r));
  lines.forEach(({ p, size, qty }, n) => {
    f.set(`line_items[${n}][quantity]`, String(qty));
    f.set(`line_items[${n}][price_data][currency]`, (content.shopInfo.currency || 'EUR').toLowerCase());
    f.set(`line_items[${n}][price_data][unit_amount]`, String(Math.round(size.price * 100)));
    f.set(`line_items[${n}][price_data][product_data][name]`, `${p.title} tapestry, ${size.label}`);
    f.set(`line_items[${n}][price_data][product_data][metadata][sku]`, p.sku);
    f.set(`line_items[${n}][price_data][product_data][metadata][size]`, size.label);
  });

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: f,
    });
    const session = await r.json();
    if (!r.ok) {
      console.error('Stripe error', session?.error?.message);
      return res.status(502).json({ error: 'payment_provider' });
    }
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe request failed', err);
    return res.status(502).json({ error: 'payment_provider' });
  }
}
