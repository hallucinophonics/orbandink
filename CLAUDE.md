# CLAUDE.md — repo conventions

## What this is
Static multilingual home of Orb & Ink — the imprint's catalogue and
its four bylines (Belenkiy, Bianco, Weiss, Blanc).
Plain HTML/CSS/ES-modules + `build.py` (Python stdlib generator).
No frameworks, no npm, no bundlers, no CDNs, no analytics, no external
requests at runtime. Deployed as-is to Cloudflare Pages (build command:
none, output dir: `/`).

## Hard rules
- `/{en,ru,fr,pt,de,it,es,ja}/` trees + root `index.html`, `404.html`,
  `_redirects`, `robots.txt`, `sitemap.xml` are **build output**.
  Never hand-edit them — edit `data/*.csv`, `templates/`, `assets/`,
  or `build.py`, then run `python3 build.py` and commit the result.
- `worlds/<slug>/` are **mounted copies** of the series sites that live
  in the folders beside this repo (`tools/sync_worlds.py`). Change a
  series site in its own folder and re-mount; never edit it here. They
  are the one place external requests happen (their Google Fonts).
- `data/editions.csv` is written by `tools/sync_editions.py` from the
  bookshelf's release sheet; edit the sheet, not the CSV.
- All content and every UI string lives in `data/*.csv`. No hardcoded
  copy in HTML templates or JS.
- Missing translations must degrade to `en`, never break a page.
- Real store URLs only when provided; otherwise keep them clearly
  marked `PLACEHOLDER`.
- Real DOM text under every canvas/shader effect; effects are
  decoration, never content.
- Fonts are self-hosted woff2 in `assets/fonts/`
  (`tools/fetch_fonts.py` regenerates them + `assets/css/fonts.css`).

## Workflow
- Content changes (CSV rows, covers, translations): run `build.py`,
  commit source + regenerated output together, straight to `main`.
- Structural changes (templates, build.py, assets/js, assets/css):
  work on a branch, verify locally (`python3 -m http.server`, check
  `/en/`, `/ru/`, `/ja/`, reduced-motion, JS disabled), then merge.
- Commit messages: short imperative, prefixed `content:` / `site:` /
  `fx:` / `build:`. **No Co-Authored-By trailers.**

## Checks before pushing structural work
- `python3 build.py` exits clean (validation warns on missing covers /
  translations; fatals on duplicate slugs or missing en rows).
- Console clean on `/en/`, `/ru/`, `/ja/`.
- Buy panel: language with no store rows falls back to `en` rows;
  `coming_soon` books show the note, not an empty panel.
- 404 localizes: visit `/ru/nonexistent`.
