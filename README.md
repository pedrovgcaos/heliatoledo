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

The output goes to `dist/`. On Vercel, `vercel.json` already sets the build command, the output folder, cache headers and the redirects from the old WordPress addresses (`/proyecto/…`, `/pr-cat/…`, `/tienda/`), so existing links and search results keep working.

## Edit content

Everything lives in `src/content.json`:

| Key | What it controls |
| --- | --- |
| `site` | Name, email, Instagram, bio paragraphs, portrait |
| `repeats` | The patterns on the home page wall, in order (`name` matches `public/img/tile-<name>-*.webp`) |
| `home`, `illustration`, `surface` | The grids, in display order. `project` links an item to its page; `null` opens it in the image viewer |
| `projects` | Project pages: year, type, medium, English and Spanish text, images |
| `shop` | Tapestries, sizes and the link to buy each one |
| `legal` | Aviso legal, privacy and cookie policy (HTML) |

After editing, run `npm run dev` again to regenerate the pages.

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
```

The typeface is Bricolage Grotesque, licensed under the SIL Open Font License (`public/fonts/OFL.txt`).
