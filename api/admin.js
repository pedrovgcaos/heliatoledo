// Panel routes (signed-in only). Messages are in Spanish: they're shown to Helia in the panel.
// GET  ?view=index | order&id= | csv | products | settings
// POST {action: status | note | shipping | email | products | settings | rebuild-index, ...}
import { isAdmin } from './_lib/auth.js';
import { readJson, send, sameOrigin, query, httpError, siteUrl } from './_lib/http.js';
import { writeDoc, useBlob } from './_lib/store.js';
import { getProducts, getSettings, baseProducts, ZONES, DEFAULT_SETTINGS } from './_lib/catalog.js';
import { getIndex, getOrder, saveOrder, allOrders, rebuildIndex, addHistory, STATUSES, STATUS_LABEL, PAYMENT_METHODS } from './_lib/orders.js';
import { emailConfigured, sendEmail, confirmationToCustomer, shippedToCustomer } from './_lib/email.js';
import { getChecklist, setManual } from './_lib/checklist.js';

const money = n => (n == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n));

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const num = v => (v === '' || v === null || v === undefined ? null : Number(v));
const madrid = iso => (iso ? new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : '');
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async function handler(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: 'Tu sesión ha caducado. Vuelve a entrar.' });
  try {
    if (req.method === 'GET') return await get(req, res);
    if (req.method !== 'POST') throw httpError(405, 'Método no permitido.');
    if (!sameOrigin(req)) throw httpError(403, 'Origen no permitido.');
    return await post(req, res, await readJson(req, 100_000));
  } catch (err) {
    if (!err.status) console.error('admin', err);
    return send(res, err.status || 500, { error: err.status ? err.message : 'No se pudo completar la operación. Inténtalo de nuevo.' });
  }
}

async function get(req, res) {
  const p = query(req);
  const view = p.get('view');
  const nocache = { 'Cache-Control': 'no-store' };

  if (view === 'index') return send(res, 200, { rows: await getIndex(), statuses: STATUS_LABEL, methods: PAYMENT_METHODS }, nocache);

  if (view === 'order') {
    const order = await getOrder(p.get('id'));
    if (!order) throw httpError(404, 'No se encontró el pedido.');
    return send(res, 200, { order, link: `${siteUrl(req)}/shop/order/?id=${order.id}&t=${order.token}`, email: emailConfigured() }, nocache);
  }

  if (view === 'products') return send(res, 200, { products: await getProducts() }, nocache);

  if (view === 'checklist') return send(res, 200, { items: await getChecklist() }, nocache);

  if (view === 'settings') {
    return send(res, 200, {
      settings: await getSettings(), zones: ZONES,
      status: { storage: useBlob() ? 'blob' : 'local', email: emailConfigured(), emailFrom: process.env.EMAIL_FROM || '' },
    }, nocache);
  }

  if (view === 'csv') {
    const orders = await allOrders();
    const head = ['Pedido', 'Fecha', 'Estado', 'Cliente', 'E-mail', 'Teléfono', 'Dirección', 'Código postal', 'Ciudad', 'Provincia/Región', 'País',
      'Artículos', 'Subtotal', 'Envío', 'Total', 'Método de pago', 'Pagado el', 'Transportista', 'Seguimiento', 'Nota del cliente', 'Nota interna'];
    const lines = orders.map(o => [o.id, madrid(o.createdAt), STATUS_LABEL[o.status], o.customer.name, o.customer.email, o.customer.phone,
      o.shipping.address, o.shipping.postal, o.shipping.city, o.shipping.region, o.shipping.countryName,
      o.items.map(i => `${i.title} ${i.size} x${i.qty}`).join(' | '),
      String(o.subtotal).replace('.', ','), o.shippingCost == null ? '' : String(o.shippingCost).replace('.', ','), String(o.total).replace('.', ','),
      o.payment?.method || '', madrid(o.payment?.paidAt), o.tracking?.carrier || '', o.tracking?.number || '', o.notes, o.internalNote].map(csvCell).join(';'));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pedidos-heliatoledo-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(`﻿${[head.map(csvCell).join(';'), ...lines].join('\r\n')}`);
    return undefined;
  }
  throw httpError(400, 'Vista desconocida.');
}

async function post(req, res, body) {
  const action = body.action;

  if (action === 'products') {
    const known = Object.fromEntries(baseProducts.map(p => [p.slug, p]));
    const out = {};
    for (const [slug, o] of Object.entries(body.products || {})) {
      const base = known[slug];
      if (!base) continue;
      const sizes = {};
      for (const s of base.sizes) {
        const so = o?.sizes?.[s.label] || {};
        const price = num(so.price);
        if (price !== null && !(price > 0 && price < 100000)) throw httpError(400, `Precio no válido en ${base.title}, ${s.label}.`);
        const entry = {};
        if (price !== null && price !== s.price) entry.price = Math.round(price * 100) / 100;
        if (so.soldOut) entry.soldOut = true;
        if (Object.keys(entry).length) sizes[s.label] = entry;
      }
      const entry = {};
      if (o?.hidden) entry.hidden = true;
      if (o?.soldOut) entry.soldOut = true;
      if (Object.keys(sizes).length) entry.sizes = sizes;
      if (Object.keys(entry).length) out[slug] = entry;
    }
    await writeDoc('settings/products.json', out);
    return send(res, 200, { ok: true, products: await getProducts() });
  }

  if (action === 'settings') {
    const s = body.settings || {};
    const shipping = {};
    for (const z of Object.keys(ZONES)) {
      const v = num(s.shipping?.[z]);
      if (v !== null && !(v >= 0 && v < 10000)) throw httpError(400, `Coste de envío no válido para ${ZONES[z]}.`);
      shipping[z] = v === null ? null : Math.round(v * 100) / 100;
    }
    const free = num(s.freeShippingFrom);
    const settings = {
      ...DEFAULT_SETTINGS,
      notifyEmail: text(s.notifyEmail, 160) || DEFAULT_SETTINGS.notifyEmail,
      shopOpen: s.shopOpen !== false,
      closedMessage: text(s.closedMessage, 400),
      shipping,
      freeShippingFrom: free && free > 0 ? free : null,
      paymentInstructions: { en: text(s.paymentInstructions?.en, 1500), es: text(s.paymentInstructions?.es, 1500) },
    };
    await writeDoc('settings/shop.json', settings);
    return send(res, 200, { ok: true, settings });
  }

  if (action === 'rebuild-index') return send(res, 200, { ok: true, count: await rebuildIndex() });

  if (action === 'checklist') {
    if (!(await setManual(String(body.item || ''), Boolean(body.done)))) throw httpError(400, 'Esta tarea se marca sola cuando está lista.');
    return send(res, 200, { ok: true, items: await getChecklist() });
  }

  // the rest act on one order
  const order = await getOrder(body.id);
  if (!order) throw httpError(404, 'No se encontró el pedido.');
  const url = siteUrl(req);

  if (action === 'status') {
    const to = body.status;
    if (!STATUSES.includes(to)) throw httpError(400, 'Estado no válido.');
    const now = new Date().toISOString();
    const parts = [];
    if (to === 'pagado') {
      const method = PAYMENT_METHODS.includes(body.method) ? body.method : 'Otro';
      order.payment = { ...order.payment, method, reference: text(body.reference, 120), paidAt: order.payment?.paidAt || now };
      parts.push(`Pago registrado: ${method}${order.payment.reference ? ` (${order.payment.reference})` : ''}.`);
    }
    if (to === 'enviado') {
      order.tracking = { carrier: text(body.carrier, 60), number: text(body.number, 80), url: text(body.url, 300) };
      order.shippedAt = now;
      const t = [order.tracking.carrier, order.tracking.number].filter(Boolean).join(' ');
      parts.push(t ? `Enviado con ${t}.` : 'Marcado como enviado.');
    }
    if (to === 'entregado') { order.deliveredAt = now; parts.push('Marcado como entregado.'); }
    if (to === 'cancelado') parts.push(`Cancelado${text(body.reason, 300) ? `: ${text(body.reason, 300)}` : '.'}`);
    if (to === 'nuevo') parts.push('Vuelto a "Pendiente de pago".');
    order.status = to;
    addHistory(order, parts.join(' '));
    if (to === 'enviado' && body.notify && emailConfigured()) {
      const ok = await sendEmail({ to: order.customer.email, ...shippedToCustomer(order, url) });
      addHistory(order, ok ? 'E-mail de envío mandado al cliente.' : 'No se pudo mandar el e-mail de envío.');
      if (ok) order.emails = { ...order.emails, shippedAt: now };
    }
    await saveOrder(order);
    return send(res, 200, { ok: true, order });
  }

  if (action === 'note') {
    order.internalNote = text(body.note, 4000);
    await saveOrder(order);
    return send(res, 200, { ok: true, order });
  }

  if (action === 'shipping') {
    const v = num(body.shippingCost);
    if (v !== null && !(v >= 0 && v < 10000)) throw httpError(400, 'Coste de envío no válido.');
    order.shippingCost = v === null ? null : Math.round(v * 100) / 100;
    order.total = order.subtotal + (order.shippingCost || 0);
    addHistory(order, `Envío: ${order.shippingCost == null ? 'por confirmar' : money(order.shippingCost)}. Total: ${money(order.total)}.`);
    await saveOrder(order);
    return send(res, 200, { ok: true, order });
  }

  if (action === 'email') {
    if (!emailConfigured()) throw httpError(400, 'El envío de e-mails no está configurado (RESEND_API_KEY y EMAIL_FROM).');
    const kind = body.kind === 'shipped' ? 'shipped' : 'confirmation';
    const mail = kind === 'shipped' ? shippedToCustomer(order, url) : confirmationToCustomer(order, await getSettings(), url);
    const ok = await sendEmail({ to: order.customer.email, ...mail });
    if (!ok) throw httpError(502, 'El servicio de e-mail rechazó el envío.');
    addHistory(order, kind === 'shipped' ? 'E-mail de envío reenviado.' : 'Confirmación reenviada al cliente.');
    await saveOrder(order);
    return send(res, 200, { ok: true, order });
  }

  throw httpError(400, 'Acción desconocida.');
}
