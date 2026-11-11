// Public order endpoint.
// POST  { items:[{slug,size,qty}], customer:{name,email,phone}, shipping:{address,city,postal,region,country}, notes, lang }
//       → creates the order (status "nuevo") and returns { id, token }
// GET   ?id=&t=  → what the customer may see about their order
import { readJson, send, sameOrigin, query, httpError, siteUrl } from './_lib/http.js';
import { getProducts, getSettings, countryByCode, shippingFor, CURRENCY, siteInfo } from './_lib/catalog.js';
import { newOrderId, newToken, saveOrder, getOrder, publicView, addHistory } from './_lib/orders.js';
import { sendEmail, newOrderToHelia, confirmationToCustomer } from './_lib/email.js';

const MAX_QTY = 10;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const p = query(req);
      const order = await getOrder(p.get('id'));
      if (!order || order.token !== p.get('t')) throw httpError(404, 'not_found');
      return send(res, 200, publicView(order, await getSettings()), { 'Cache-Control': 'no-store' });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); throw httpError(405, 'method_not_allowed'); }
    if (!sameOrigin(req)) throw httpError(403, 'forbidden');

    const body = await readJson(req, 20_000);
    if (body.website) throw httpError(400, 'invalid'); // honeypot field, invisible to people

    const [products, settings] = await Promise.all([getProducts(), getSettings()]);
    if (settings.shopOpen === false) throw httpError(409, 'shop_closed');
    const bySlug = Object.fromEntries(products.map(p => [p.slug, p]));

    // items: prices always from the server
    const raw = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
    const items = [];
    for (const i of raw) {
      const p = bySlug[i?.slug];
      const size = p?.sizes.find(s => s.label === i?.size);
      const qty = Number.parseInt(i?.qty, 10);
      if (!p || !size || !(qty >= 1 && qty <= MAX_QTY)) throw httpError(400, 'invalid_item');
      if (p.hidden || p.soldOut || size.soldOut) throw Object.assign(httpError(409, 'sold_out'), { detail: `${p.title}, ${size.label}` });
      const same = items.find(x => x.slug === p.slug && x.size === size.label);
      if (same) same.qty = Math.min(MAX_QTY, same.qty + qty);
      else items.push({ slug: p.slug, title: p.title, sku: p.sku, size: size.label, unit: size.price, qty });
    }
    if (!items.length) throw httpError(400, 'empty_cart');

    // customer + address
    const c = body.customer || {};
    const s = body.shipping || {};
    const customer = { name: str(c.name, 120), email: str(c.email, 160).toLowerCase(), phone: str(c.phone, 40) };
    const country = countryByCode[str(s.country, 2).toUpperCase()];
    const shipping = {
      address: str(s.address, 240), city: str(s.city, 100), postal: str(s.postal, 20), region: str(s.region, 100),
      country: country?.code || '', countryName: country?.code === 'XX' ? str(s.countryOther, 80) || 'Other' : country?.name || '', zone: country?.zone || '',
    };
    const missing = [];
    if (!customer.name) missing.push('name');
    if (!EMAIL_RE.test(customer.email)) missing.push('email');
    if (!shipping.address) missing.push('address');
    if (!shipping.city) missing.push('city');
    if (!shipping.postal) missing.push('postal');
    if (!country) missing.push('country');
    if (missing.length) return send(res, 400, { error: 'missing_fields', fields: missing });

    const subtotal = items.reduce((a, i) => a + i.unit * i.qty, 0);
    const shippingCost = shippingFor(settings, shipping.zone, subtotal);
    const now = new Date();
    const order = {
      id: newOrderId(now), token: newToken(), createdAt: now.toISOString(), status: 'nuevo',
      lang: body.lang === 'es' ? 'es' : 'en', currency: CURRENCY,
      customer, shipping, notes: str(body.notes, 1000), items,
      subtotal, shippingCost, total: subtotal + (shippingCost || 0),
      payment: { method: null, paidAt: null, reference: '' },
      tracking: { carrier: '', number: '', url: '' },
      internalNote: '', history: [], emails: {},
    };
    addHistory(order, 'Pedido recibido en la web.', 'web');
    await saveOrder(order);

    // e-mails are optional and never block the order
    const url = siteUrl(req);
    const toHelia = newOrderToHelia(order, url);
    const toCustomer = confirmationToCustomer(order, settings, url);
    const [a, b] = await Promise.all([
      sendEmail({ to: settings.notifyEmail || siteInfo.email, ...toHelia, replyTo: customer.email }),
      sendEmail({ to: customer.email, ...toCustomer, replyTo: settings.notifyEmail || siteInfo.email }),
    ]);
    if (a || b) {
      order.emails = { ...(a ? { notifiedAt: now.toISOString() } : {}), ...(b ? { confirmationAt: now.toISOString() } : {}) };
      await saveOrder(order);
    }
    return send(res, 201, { id: order.id, token: order.token }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    if (!err.status) console.error('orders', err);
    return send(res, err.status || 500, { error: err.status ? err.message : 'server_error', ...(err.detail ? { detail: err.detail } : {}) });
  }
}
