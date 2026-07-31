# orbandink.co.uk

Static, multilingual home of **Orb & Ink** — a science-fiction imprint
publishing series and standalones under four bylines (Alexey Belenkiy,
Alessio Bianco, A. P. Weiss, Alec Blanc). No framework, no bundler, no
CMS, no database, no CDNs, no analytics. Plain HTML + CSS + ES-module
JS, prerendered by a single stdlib-Python generator.

- **8 languages** — en ru fr pt de it es ja, language-first URLs
  (`/{lang}/`, `/{lang}/books`, `/{lang}/books/{slug}`, `/{lang}/about`,
  `/{lang}/privacy`), full hreflang alternates, per-language store links.
- **All content lives in `data/*.csv`.** Books, translations, buy links,
  UI strings — everything is a CSV row.
- **The `/{lang}/` trees are build output.** Never hand-edit them.

> Everything marked `PLACEHOLDER` (synopses, store URLs, socials,
> covers, ISBNs) is invented seed content — replace it in the CSVs
> and `covers/`, then rebuild.

## Workflows

### Add or edit a book
1. `data/books.csv` — one row: id, slug, series, year, status
   (`published | preorder | coming_soon`), pages, isbn, cover path,
   accent color, `;`-separated themes.
2. `data/books_i18n.csv` — one row per language: title, tagline,
   synopsis (missing languages fall back to `en` automatically).
3. `data/store_links.csv` — one row per store per language
   (`book_id,lang,store,format,url`; formats: `ebook | paperback |
   hardcover | audiobook`). Pages show the visitor's language rows,
   else the `en` rows.
4. Optional: `data/praise.csv` — review quotes (`book_id,lang,quote,
   source`), shown on the book page between synopsis and themes;
   language rows fall back to `en`, no rows → no section.
   Optional: `data/series.csv` — series with a dedicated world-site
   (`series,url`); book pages and the featured band link out to it.
   `PLACEHOLDER` urls stay hidden until the real domain exists.
5. Drop the cover in `covers/` (2:3, ≥800px wide).
6. `python3 build.py` → commit → push. Done.

### Add or adjust translations
Edit the language columns in `data/i18n.csv` (UI strings — including
the `author.*` roster rows) or the language rows in
`data/books_i18n.csv` / `data/privacy_i18n.csv`, then
`python3 build.py` and push. A new theme token in `books.csv` needs a
matching `theme.*` row in `i18n.csv`.

## One-time setup: fonts

The repo ships without font binaries. Run once:

    python3 tools/fetch_fonts.py   # downloads subset woff2 → assets/fonts/
    python3 build.py               # pages pick up preload hints

Until then the site renders on metric-matched system fallbacks (no
layout shift when the real fonts land). Faces: Unbounded (display,
Latin+Cyrillic), Manrope (body), JetBrains Mono (data), Zen Kaku Gothic
New + Noto Sans JP for `ja`. The deployed site never calls a CDN.

## Build

    python3 build.py            # idempotent; regenerates everything
    python3 build.py --clean    # wipe /{lang}/ trees first

Generates: `/{lang}/**/index.html` (×8), root redirect `index.html`,
localized `404.html`, `_redirects`, `robots.txt`, `sitemap.xml`.
Optional: with **Pillow** installed it also writes responsive cover
sizes (`covers/{id}-480.jpg`, `-800.jpg` + srcset) and OG images
(`og/{id}.jpg`). Without Pillow those steps are skipped and pages use
the base cover — stated here so the stdlib-only rule stays honest.

Preview locally:

    python3 -m http.server      # → http://localhost:8000/en/

## How it works

- build.py stamps every internal link and asset reference with the
  page's relative prefix (`../`, `../../`, …), so pages work at the
  domain root, under any subpath mount, and with JS disabled — no
  `<base>` gymnastics, no runtime path fixups. `assets/js/data.js`
  derives the site root from the `data-rel` attribute stamped on
  `<html>` when it fetches the CSVs.
- `assets/js/data.js` re-parses the CSVs in the browser for the dynamic
  parts (catalog filters); `assets/js/app.js` is progressive
  enhancement — with JS disabled every page is fully readable and every
  buy link works.
- Effects (`assets/js/fx/`): one shared WebGL context drives the
  background world-lines field, the temporal-erosion titles, and the
  per-book cover shaders; the hero glyph-lattice is a 2D canvas. Real
  DOM text always exists underneath. `prefers-reduced-motion` gets a
  designed static frame; no-WebGL gets CSS-only treatments. JS total is
  ~35 KB unminified — far under the 250 KB budget.

## Repo map

    data/            all content (CSV)
    covers/          cover art (source of truth)
    assets/          css / js / fonts / img
    templates/       page templates consumed by build.py
    build.py         the generator (Python 3.9+, stdlib)
    tools/           fetch_fonts.py (one-time)
    {en,ru,…,ja}/    BUILD OUTPUT — do not edit
    index.html 404.html _redirects robots.txt sitemap.xml   BUILD OUTPUT

See `DEPLOY.md` for GitHub + Cloudflare Pages, `CLAUDE.md` for repo
conventions.
