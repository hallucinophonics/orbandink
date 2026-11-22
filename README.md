# orbandink.co.uk

Static, multilingual home of **Orb & Ink** — a science-fiction imprint
publishing series under four bylines (Alexey Belenkiy,
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
   Optional: `data/series.csv` — see *Series and their worlds* below.
5. Drop the cover in `covers/` (2:3, ≥800px wide).
6. `python3 build.py` → commit → push. Done.

### Series and their worlds
Every series has a page here (`/{lang}/series/{slug}/`: its line, its
premise, the reading order, the ways in) and a site of its own.

- `data/series.csv` — `series,slug,byline,url,ordinal_key`. `byline` is
  one of `belenkiy | bianco | weiss | blanc` and signs every book in the
  series (cards, book pages, JSON-LD). `url` is either an absolute
  address (a series on its own domain — World Without Humans) or a path
  in this repo, `worlds/<slug>/`.
- `data/series_i18n.csv` — `series,lang,tagline,premise`, one row per
  language, falling back to `en`.
- `python3 tools/sync_worlds.py` mounts the series sites that live in
  the folders beside this repo (`calorate-site`, `night-tenant-site`, …)
  under `worlds/<slug>/`, so one deploy carries the imprint and all of
  its worlds. Re-run it after a series site changes, then `build.py`.
  A world that is not mounted simply shows no link — never a dead one.
- `assets/img/worlds/<slug>.jpg` (1200×750) is the preview shown on a
  series page's door: a photograph of the world's landing page, taken by
  `node tools/shoot_worlds.mjs` (dev-only; needs playwright-core and
  Chrome). Without one the door is a plain link.

### Editions (audiobook, immersive, drama, graphic novel)
`data/editions.csv` lists which editions of each book are being made
(`book_id,format`; formats: `ebook | paperback | hardcover | audiobook |
immersive | drama | graphic`). Refresh it from the production sheet:

    python3 tools/sync_editions.py      # reads ../bookshelf/RELEASE_STATUS.csv

An edition with a row in `data/store_links.csv` (same format token) shows
its store buttons; one without shows "Coming soon" (print) or "In
production" (sound and pictures). The shelf filters by the five ways in
— book, audiobook, immersive audiobook, audio drama, graphic novel — and
`/books/?format=drama` links straight to a filtered shelf.

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
- The shelf's filters are prerendered by build.py and only wired up by
  `assets/js/app.js`, which is progressive enhancement — with JS
  disabled every page is fully readable and every buy link works (the
  filter bar is simply absent).
- Books are real objects (`.book3d`, pure CSS 3D): a hinged cover over a
  title page, with a page block as thick as the book's own page count.
  They open on hover and keyboard focus, peek open as they cross the
  middle of a touch screen, and the book page has an Open button.
  `assets/js/fx/book3d.js` adds only the lean toward the cursor, the
  touch peek and that button.
- Effects (`assets/js/fx/`), all in **one** shared WebGL context
  (`gl.js`, one fixed canvas, paused off-screen and in hidden tabs, pixel
  ratio capped at 2, density stepped down on slow devices):
  - `gl.js` — the background field, the temporal-erosion titles
    (`.fx-erode`: page, book and series titles drawn from the real
    heading, eroding at the edges, swelling toward the pointer), and
    `addLayer()` for scene passes.
  - `lattice.js` — **letters that gather**: the home headline is built
    from small glyphs taken from the authors' names and the books' titles.
    They live in the orb as loose ink, stream out of it into the house's
    name, and re-form as each of the four authors' names in turn (the
    house's name returns between them; frames come from `hero_words()` in
    `build.py`). Once a name has gathered, its solid letterform comes up
    under the glyphs so the settled headline is crisp at any size.
  - `orb.js` — **the Orb**: a glass sphere in the middle of that headline,
    drawn by one fragment shader as a layer of the shared context:
    refraction of the headline through the glass (the letters bend and
    fringe as they pass behind it), a short march through a noise volume
    for gold and black ink, and a still of one of the worlds held in the
    middle (every `assets/img/worlds/<slug>-still-640.jpg` that exists,
    cross-faded; with none, the orb is ink only).
  - `passage.js` — the worlds as a pinned, scroll-driven passage on a wide
    screen (each world a full screen, the next one waiting in a glass lens
    that opens over it) and a swipeable row of cards on a phone, with
    reduced motion, or with no script.
  - `stage.js` — the header that leaves on the way down and returns on the
    way up, magnetic buttons, pointer light on stages, shelves and the wall
    of covers, the `/series/` lens, and the passage into a world (its
    picture opens from the click over the whole screen before the page
    turns; links marked `data-enter`).
  - `book3d.js`, `worlds.js`, `reveal.js`, `rain.js` — the opening books,
    each series' colour wash, scroll reveals, the ambient letterfall on the
    inner pages.
  Real DOM text always exists underneath. With no WebGL or no script the
  home page shows a CSS orb and the plain headline; `prefers-reduced-motion`
  gets one composed, settled frame and a swipeable row instead of the
  pinned passage. Safari notes: no `filter` on clipped text (it paints a
  stray box), no `min-height` beside `aspect-ratio` on grid children (the
  card grows past its track).

## Page map

    /{lang}/                 hero (orb + gathering headline) · new and next
                             (one lit stage per book on sale, buy first) ·
                             the passage (12 worlds) · the index · the wall
                             (all covers, in depth) · five ways in · the
                             roster (four authors) · the closing call
    /{lang}/books/           the shelf: filters, books standing on ledges
    /{lang}/series/          the lens index, then every world's card
    /{lang}/series/{slug}/   the world's still behind its name, its books,
                             its display, reading order, ways in
    /{lang}/books/{slug}/    cover lit, buy button first, facts, synopsis,
                             editions box (sticky), buy bar
    /{lang}/about/           the roster in full, press, contact

## Repo map

    data/            all content (CSV)
    covers/          cover art (source of truth)
    assets/          css / js / fonts / img
    templates/       page templates consumed by build.py
    build.py         the generator (Python 3.9+, stdlib)
    tools/           fetch_fonts.py (one-time), sync_editions.py,
                     sync_worlds.py, shoot_worlds.mjs, fill_translations.py
    worlds/          MOUNTED series sites (tools/sync_worlds.py) — do not edit here
    {en,ru,…,ja}/    BUILD OUTPUT — do not edit
    index.html 404.html _redirects robots.txt sitemap.xml   BUILD OUTPUT

See `DEPLOY.md` for GitHub + Cloudflare Pages, `CLAUDE.md` for repo
conventions.
