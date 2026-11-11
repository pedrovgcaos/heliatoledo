// The shop as the server sees it: products from src/content.json, plus the changes made in the
// panel (prices, sold out, hidden) and the shop settings (shipping by zone, payment instructions).
import fs from 'node:fs';
import path from 'node:path';
import { readDoc } from './store.js';

const content = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/content.json'), 'utf8'));
export const baseProducts = content.shop;
export const siteInfo = content.site;
export const CURRENCY = content.shopInfo?.currency || 'EUR';

export const ZONES = {
  es: 'España',
  eu: 'Unión Europea',
  europe: 'Resto de Europa',
  world: 'Resto del mundo',
};

// Country list for the checkout (English names, as the site is in English) → shipping zone.
export const COUNTRIES = [
  ['ES', 'Spain', 'es'],
  ['PT', 'Portugal', 'eu'], ['FR', 'France', 'eu'], ['IT', 'Italy', 'eu'], ['DE', 'Germany', 'eu'],
  ['NL', 'Netherlands', 'eu'], ['BE', 'Belgium', 'eu'], ['LU', 'Luxembourg', 'eu'], ['AT', 'Austria', 'eu'],
  ['IE', 'Ireland', 'eu'], ['DK', 'Denmark', 'eu'], ['SE', 'Sweden', 'eu'], ['FI', 'Finland', 'eu'],
  ['PL', 'Poland', 'eu'], ['CZ', 'Czechia', 'eu'], ['SK', 'Slovakia', 'eu'], ['SI', 'Slovenia', 'eu'],
  ['HR', 'Croatia', 'eu'], ['HU', 'Hungary', 'eu'], ['RO', 'Romania', 'eu'], ['BG', 'Bulgaria', 'eu'],
  ['GR', 'Greece', 'eu'], ['CY', 'Cyprus', 'eu'], ['MT', 'Malta', 'eu'], ['EE', 'Estonia', 'eu'],
  ['LV', 'Latvia', 'eu'], ['LT', 'Lithuania', 'eu'],
  ['GB', 'United Kingdom', 'europe'], ['CH', 'Switzerland', 'europe'], ['NO', 'Norway', 'europe'],
  ['IS', 'Iceland', 'europe'], ['AD', 'Andorra', 'europe'], ['MC', 'Monaco', 'europe'],
  ['US', 'United States', 'world'], ['CA', 'Canada', 'world'], ['MX', 'Mexico', 'world'],
  ['AR', 'Argentina', 'world'], ['BR', 'Brazil', 'world'], ['CL', 'Chile', 'world'], ['CO', 'Colombia', 'world'],
  ['UY', 'Uruguay', 'world'], ['PE', 'Peru', 'world'], ['AU', 'Australia', 'world'], ['NZ', 'New Zealand', 'world'],
  ['JP', 'Japan', 'world'], ['KR', 'South Korea', 'world'], ['SG', 'Singapore', 'world'], ['IL', 'Israel', 'world'],
  ['AE', 'United Arab Emirates', 'world'], ['ZA', 'South Africa', 'world'],
  ['XX', 'Other country', 'world'],
];
export const countryByCode = Object.fromEntries(COUNTRIES.map(([code, name, zone]) => [code, { code, name, zone }]));

export const DEFAULT_SETTINGS = {
  notifyEmail: siteInfo.email,
  shopOpen: true,
  closedMessage: '',
  shipping: { es: null, eu: null, europe: null, world: null }, // € per order; null = to be confirmed
  freeShippingFrom: null,
  paymentInstructions: { en: '', es: '' },
};

export async function getSettings() {
  const { data } = await readDoc('settings/shop.json');
  return {
    ...DEFAULT_SETTINGS, ...(data || {}),
    shipping: { ...DEFAULT_SETTINGS.shipping, ...(data?.shipping || {}) },
    paymentInstructions: { ...DEFAULT_SETTINGS.paymentInstructions, ...(data?.paymentInstructions || {}) },
  };
}

/** Products with the panel's changes applied. */
export async function getProducts() {
  const { data: overrides } = await readDoc('settings/products.json');
  return baseProducts.map(p => {
    const o = overrides?.[p.slug] || {};
    return {
      slug: p.slug, title: p.title, collection: p.collection, sku: p.sku, image: p.images[0],
      hidden: Boolean(o.hidden), soldOut: Boolean(o.soldOut),
      sizes: p.sizes.map(s => {
        const so = o.sizes?.[s.label] || {};
        const price = Number.isFinite(so.price) && so.price > 0 ? so.price : s.price;
        return { label: s.label, price, basePrice: s.price, soldOut: Boolean(so.soldOut) };
      }),
    };
  });
}

/** Shipping cost for a zone and subtotal; null when not set (to be confirmed by Helia). */
export function shippingFor(settings, zone, subtotal) {
  if (settings.freeShippingFrom && subtotal >= settings.freeShippingFrom) return 0;
  const v = settings.shipping?.[zone];
  return Number.isFinite(v) ? v : null;
}
