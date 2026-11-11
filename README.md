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

## Shop and payments

Each tapestry in `shop` has its own page at `/shop/<slug>/`, with sizes and prices. The cart is kept in the visitor's browser.

Checkout works in one of two ways:

- **Card payments (Stripe):** set `STRIPE_SECRET_KEY` in Vercel → Settings → Environment Variables and redeploy. "Go to payment" then opens Stripe Checkout. Prices are always read from `src/content.json` on the server (`api/checkout.js`), so they can't be changed from the browser. After paying, customers return to `/shop/thanks/` and Stripe emails them a receipt. Orders appear in the Stripe dashboard.
- **Without a Stripe key:** the button reads "Send order by email" and opens an email to Helia listing the tapestries, sizes and subtotal.

Optional settings for Stripe:

| Variable | Use |
| --- | --- |
| `SHIP_COUNTRIES` | Countries you deliver to, comma-separated ISO codes. Default: EU countries, GB, CH, NO and US |
| `STRIPE_SHIPPING_RATE` | Shipping rate IDs (`shr_…`) created in the Stripe dashboard, comma-separated. Without it, no shipping is charged |

To change a price, edit the `sizes` of the product in `src/content.json`.

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
api/checkout.js      Vercel function that opens Stripe Checkout
```

The typeface is Roboto (variable, weights 100–900 and widths 75–100%), the same family as the original site, licensed under the SIL Open Font License (`public/fonts/OFL.txt`).
