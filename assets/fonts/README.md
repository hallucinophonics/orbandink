# assets/fonts/

Self-hosted subset woff2 files live here. The repo intentionally ships
without binaries — generate them once:

    python3 tools/fetch_fonts.py

This downloads (from Google Fonts, at *build* time only — the deployed
site makes zero external requests):

- Unbounded 400/700 — latin, latin-ext, cyrillic
- Manrope 400/500/700 — latin, latin-ext, cyrillic
- JetBrains Mono 400/700 — latin, latin-ext, cyrillic
- Zen Kaku Gothic New 700/900 — japanese (display for `ja`)
- Noto Sans JP 400/700 — japanese (body for `ja`)

…and rewrites `assets/css/fonts.css` with local @font-face rules
(unicode-range preserved, `font-display: swap`). Then run
`python3 build.py` again so pages pick up `<link rel="preload">` hints
for the active language's subsets. Until then the site uses
metric-matched system fallbacks (no layout shift when fonts arrive).
