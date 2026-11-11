// Orders: one private JSON document per order (orders/<id>.json) plus a summary index
// (index/orders.json) that the panel's list and dashboard read in a single request.
import crypto from 'node:crypto';
import { readDoc, writeDoc, updateDoc, listDocs } from './store.js';

export const STATUSES = ['nuevo', 'pagado', 'enviado', 'entregado', 'cancelado'];
export const STATUS_LABEL = { nuevo: 'Pendiente de pago', pagado: 'Pagado', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
export const STATUS_LABEL_EN = { nuevo: 'Awaiting payment', pagado: 'Paid', enviado: 'Shipped', entregado: 'Delivered', cancelado: 'Cancelled' };
export const PAYMENT_METHODS = ['Transferencia', 'Bizum', 'PayPal', 'Tarjeta', 'Efectivo', 'Otro'];

const INDEX = 'index/orders.json';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function newOrderId(now = new Date()) {
  const d = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).replace(/-/g, '').slice(2); // YYMMDD
  const bytes = crypto.randomBytes(4);
  const tail = [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('');
  return `HT-${d}-${tail}`;
}
export const newToken = () => crypto.randomBytes(18).toString('base64url');
export const validId = id => typeof id === 'string' && /^HT-\d{6}-[A-Z0-9]{4}$/.test(id);

export function summary(o) {
  return {
    id: o.id, createdAt: o.createdAt, status: o.status, paidAt: o.payment?.paidAt || null,
    name: o.customer.name, email: o.customer.email, country: o.shipping.country, countryName: o.shipping.countryName,
    subtotal: o.subtotal, shippingCost: o.shippingCost, total: o.total,
    items: o.items.map(i => ({ slug: i.slug, title: i.title, size: i.size, qty: i.qty, unit: i.unit })),
    method: o.payment?.method || null,
  };
}

export async function getOrder(id) {
  if (!validId(id)) return null;
  return (await readDoc(`orders/${id}.json`)).data;
}

export async function saveOrder(order) {
  await writeDoc(`orders/${order.id}.json`, order);
  await updateDoc(INDEX, rows => {
    const list = Array.isArray(rows) ? rows.filter(r => r.id !== order.id) : [];
    list.push(summary(order));
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return list;
  }, []);
  return order;
}

export async function getIndex() {
  const { data } = await readDoc(INDEX);
  return Array.isArray(data) ? data : [];
}

export async function allOrders() {
  const names = await listDocs('orders/');
  const out = [];
  for (let i = 0; i < names.length; i += 20) {
    const docs = await Promise.all(names.slice(i, i + 20).map(n => readDoc(n)));
    out.push(...docs.map(d => d.data).filter(Boolean));
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Rebuild the summary index from the order documents (Ajustes → "Reconstruir índice"). */
export async function rebuildIndex() {
  const orders = await allOrders();
  await writeDoc(INDEX, orders.map(summary));
  return orders.length;
}

export function addHistory(order, text, by = 'panel') {
  order.history = order.history || [];
  order.history.push({ at: new Date().toISOString(), status: order.status, text, by });
}

/** What the customer may see on their order page. */
export function publicView(o, settings) {
  return {
    id: o.id, createdAt: o.createdAt, status: o.status, statusLabel: STATUS_LABEL_EN[o.status],
    name: o.customer.name, items: o.items, subtotal: o.subtotal, shippingCost: o.shippingCost, total: o.total,
    currency: o.currency, shipping: { city: o.shipping.city, countryName: o.shipping.countryName },
    tracking: o.status === 'enviado' || o.status === 'entregado' ? o.tracking : null,
    paymentInstructions: o.status === 'nuevo' ? (settings.paymentInstructions?.en || '') : '',
    paymentInstructionsEs: o.status === 'nuevo' ? (settings.paymentInstructions?.es || '') : '',
  };
}
