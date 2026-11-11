# heliatoledo.com

Portfolio of Helia Toledo, illustrator and surface pattern designer (Madrid).

A static site: plain HTML, one CSS file and one small JS file. No framework, no CMS and no cookies, so there is no cookie banner. Pages are generated from `src/content.json` by a dependency-free Node script.

## Run it locally

Needs Node 18 or newer.

```bash
npm run dev
```

Then open http://localhost:4321.

## Build for production

```bash
npm run build
```

The output goes to `dist/`. The site's public address (used for canonical links, share previews and the sitemap) comes from the `SITE_URL` environment variable and defaults to `https://www.heliatoledo.com`. On Vercel it's set under Settings → Environment Variables; change it there when the site moves to another domain, then redeploy. On Vercel, `vercel.json` already sets the build command, the output folder, cache headers and the redirects from the old WordPress addresses (`/proyecto/…`, `/pr-cat/…`, `/tienda/`), so existing links and search results keep working.

## Edit content

Everything lives in `src/content.json`:

| Key | What it controls |
| --- | --- |
| `site` | Name, email, Instagram, bio paragraphs, portrait |
| `repeats` | The patterns on the home page wall, in order (`name` matches `public/img/tile-<name>-*.webp`) |
| `home`, `illustration`, `surface` | The grids, in display order. `project` links an item to its page; `null` opens it in the image viewer |
| `projects` | Project pages: year, type, medium, English and Spanish text, images |
| `shop` | Tapestries: collection, reference, sizes and prices, images |
| `shopInfo` | Material and the English/Spanish description shared by all tapestries |
| `legal` | Aviso legal, privacy and cookie policy (HTML) |

After editing, run `npm run dev` again to regenerate the pages.

## Shop and orders

Each tapestry in `shop` has its own page at `/shop/<slug>/`. The cart is kept in the visitor's browser. At checkout the customer enters their name and shipping address; the order is saved with a number (e.g. `HT-261111-K3F9`) and they get an order page at `/shop/order/` to follow it. **No payment is taken on the site**: Helia sends the payment details (bank transfer, Bizum…) and records the payment in the panel.

Prices, sold-out sizes and shipping costs come from the panel at request time (`/api/catalog`), and the server always recalculates the order from them, so the browser can't change a price.

## Panel (/admin)

The panel is at `/admin`, entirely in Spanish, following the House Media panel layout:

- **Resumen**: revenue, orders, tapestries sold, average order, orders to charge and to ship, daily chart, best sellers, sizes, countries, recent orders and anything waiting too long.
- **Pedidos**: every order, filtered by status and searchable. Each order has: mark as paid (method and reference), mark as shipped (carrier, tracking number, link), delivered, cancel or reopen; shipping cost per order; internal note; history; ready-made emails to the customer in their language; the customer's order link; printable packing slip. CSV export of all orders.
- **Productos**: price per size, sold out per size or for the whole tapestry, hide from the site. Applied on the site within seconds.
- **Envíos y pagos**: shipping cost per zone (Spain, EU, rest of Europe, rest of world; empty = to be confirmed), free shipping threshold, payment instructions (English and Spanish), notification email, open/close the shop.

Orders and settings are stored in a **private** Vercel Blob store (`heliatoledo-pedidos`), never publicly reachable. Locally, without `BLOB_READ_WRITE_TOKEN`, they go to `.data/` (git-ignored).

### Environment variables (Vercel → Settings → Environment Variables)

| Variable | Use |
| --- | --- |
| `ADMIN_PASSWORD` | Panel password. Change it and redeploy to update. |
| `ADMIN_SECRET` | Signs the panel session. Changing it signs everyone out. |
| `BLOB_READ_WRITE_TOKEN` | Created automatically when the Blob store was connected. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional: automatic emails (order confirmation to the customer, new-order alert to Helia, shipping notice). E.g. `Helia Toledo <shop@housemedia.app>` with the domain verified in Resend. Without them, the panel offers ready-written emails to send from Helia's own mail. |
| `SITE_URL` | Public address used in links and emails. |

To try the panel locally, create `.env.local` with `ADMIN_PASSWORD=…` and `ADMIN_SECRET=…`, run `npm run dev` and open http://localhost:4321/admin.

## Add new images

1. Run `npm install` once (it installs `sharp`, the image converter).
2. Put the JPG or PNG files in `originals/` (this folder isn't committed).
3. Run `npm run images`.
4. Use the printed key (for example `su40-new-pattern`) in `src/content.json`.

Each image gets WebP versions at 480, 960 and 1440 px wide, and the pages serve whichever size fits the screen.

## Structure

```
src/content.json     all text and lists
src/images.json      image sizes and placeholder colours (written by the image script)
public/              files copied as-is: images, font, CSS, JS, favicon
scripts/build.mjs    generates dist/
scripts/serve.mjs    local preview server
scripts/images.mjs   converts originals/ to WebP
api/                 Vercel functions: catalog, orders, admin, login, session
public/admin/        the panel (HTML, CSS, JS)
```

The typeface is Roboto (variable, weights 100–900 and widths 75–100%), the same family as the original site, licensed under the SIL Open Font License (`public/fonts/OFL.txt`).
