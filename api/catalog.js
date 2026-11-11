// Public: live prices, availability and shipping for the shop pages and the cart.
import { send } from './_lib/http.js';
import { getProducts, getSettings, COUNTRIES } from './_lib/catalog.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  try {
    const [products, settings] = await Promise.all([getProducts(), getSettings()]);
    send(res, 200, {
      shopOpen: settings.shopOpen !== false,
      closedMessage: settings.closedMessage || '',
      products: Object.fromEntries(products.map(p => [p.slug, {
        hidden: p.hidden, soldOut: p.soldOut,
        sizes: Object.fromEntries(p.sizes.map(s => [s.label, { price: s.price, soldOut: s.soldOut }])),
      }])),
      shipping: settings.shipping,
      freeShippingFrom: settings.freeShippingFrom,
      countries: COUNTRIES,
    }, {
      // browsers always ask again; Vercel's CDN may reuse the answer for 5 s to absorb traffic
      'Cache-Control': 'no-cache',
      'CDN-Cache-Control': 'public, max-age=5',
    });
  } catch (err) {
    console.error('catalog', err);
    send(res, 500, { error: 'catalog_unavailable' });
  }
}
