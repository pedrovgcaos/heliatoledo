// Optional e-mails through Resend (RESEND_API_KEY + EMAIL_FROM, e.g. "Helia Toledo <shop@housemedia.app>").
// Without them the shop still works: orders appear in the panel, which offers ready-made e-mails to send by hand.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const money = n => (n == null ? '—' : `€${Number.isInteger(n) ? n : Number(n).toFixed(2)}`);

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail({ to, subject, text, html, replyTo }) {
  if (!emailConfigured() || !to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!r.ok) console.error('resend', r.status, await r.text());
    return r.ok;
  } catch (err) {
    console.error('resend', err);
    return false;
  }
}

const lines = o => o.items.map(i => `${i.title} tapestry, ${i.size} × ${i.qty} — ${money(i.unit * i.qty)}`);
const wrap = body => `<div style="font-family:Roboto,Arial,sans-serif;color:#1F2A44;max-width:560px;line-height:1.5">${body}</div>`;
const pre = t => esc(t).replace(/\n/g, '<br>');

export function newOrderToHelia(o, url) {
  const text = `Nuevo pedido ${o.id}\n\n${lines(o).join('\n')}\nSubtotal: ${money(o.subtotal)}\nEnvío: ${o.shippingCost == null ? 'por confirmar' : money(o.shippingCost)}\nTotal: ${money(o.total)}\n\n${o.customer.name}\n${o.customer.email}\n${o.customer.phone || ''}\n${o.shipping.address}\n${o.shipping.postal} ${o.shipping.city}\n${o.shipping.region || ''}\n${o.shipping.countryName}\n${o.notes ? `\nNota del cliente: ${o.notes}\n` : ''}\nVer en el panel: ${url}/admin/#pedido/${o.id}`;
  return { subject: `Nuevo pedido ${o.id} · ${money(o.total)}`, text, html: wrap(pre(text)) };
}

export function confirmationToCustomer(o, settings, url) {
  const link = `${url}/shop/order/?id=${o.id}&t=${o.token}`;
  const pay = settings.paymentInstructions?.en ? `\nHow to pay:\n${settings.paymentInstructions.en}\n` : '\nHelia will write to you shortly with the shipping cost (if any) and how to pay.\n';
  const text = `Thank you, ${o.customer.name.split(' ')[0]}!\n\nWe've received your order ${o.id}.\n\n${lines(o).join('\n')}\nSubtotal: ${money(o.subtotal)}\nShipping: ${o.shippingCost == null ? 'to be confirmed' : money(o.shippingCost)}\nTotal: ${money(o.total)}\n${pay}\nEach tapestry is handmade and signed; please allow 10–15 days for delivery.\nFollow your order: ${link}\n\n—\nGracias por tu pedido ${o.id}. Puedes seguirlo aquí: ${link}`;
  return { subject: `Your order ${o.id} — Helia Toledo`, text, html: wrap(pre(text)) };
}

export function shippedToCustomer(o, url) {
  const link = `${url}/shop/order/?id=${o.id}&t=${o.token}`;
  const t = o.tracking || {};
  const track = [t.carrier, t.number].filter(Boolean).join(' ');
  const text = `Hello ${o.customer.name.split(' ')[0]},\n\nYour order ${o.id} is on its way.${track ? `\nTracking: ${track}` : ''}${t.url ? `\n${t.url}` : ''}\n\nOrder details: ${link}\n\nThank you,\nHelia\n\n—\nTu pedido ${o.id} ya está en camino.${track ? ` Seguimiento: ${track}` : ''}`;
  return { subject: `Your order ${o.id} has shipped`, text, html: wrap(pre(text)) };
}
