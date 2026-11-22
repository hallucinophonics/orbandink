#!/usr/bin/env node
/* shoot_worlds.mjs — photograph each series' own site for its monitor.

   A series page shows the world it opens onto on the screen of a display
   (assets/img/worlds/<slug>-1.jpg … -3.jpg, 1440×810, 16:9). This takes
   those three frames: it serves the repo on a loopback port, opens every
   world listed in data/series.csv in headless Chrome and saves the landing
   page's first screen, a screen part-way down it, and the first book's
   page. Worlds on their own domain are photographed there. A series with
   a game (play.html in its world) also gets <slug>-play.jpg for the
   handheld that sits on the desk beside the display.

       node tools/shoot_worlds.mjs                 # all worlds
       node tools/shoot_worlds.mjs the-night-tenant the-calorate

   Dev-only: needs playwright-core and an installed Chrome. It is not part
   of the build and nothing on the site depends on it having run — a world
   without pictures gets a plain door. Point PLAYWRIGHT_CORE at the
   package if it is not in the default place below. */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = process.env.PLAYWRIGHT_CORE || path.resolve(ROOT,
  '../studio-book-series-websites/projects/books/tests/websites/browser/node_modules/playwright-core');
const { chromium } = createRequire(import.meta.url)(PW);

const TYPES = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', woff2: 'font/woff2', csv: 'text/csv', ico: 'image/x-icon' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    let file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).slice(1)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

/* data/series.csv has no quoted commas in the columns read here */
function worlds() {
  const [head, ...rows] = fs.readFileSync(path.join(ROOT, 'data/series.csv'), 'utf8').trim().split(/\r?\n/);
  const cols = head.split(',');
  return rows.map(r => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v])));
}

/* the slug of a series' first book (books.csv: id,slug,series,series_order,…) */
function firstBook(series) {
  const rows = fs.readFileSync(path.join(ROOT, 'data/books.csv'), 'utf8').trim().split(/\r?\n/).slice(1)
    .map(r => r.split(',')).filter(c => c[2] === series)
    .sort((a, b) => Number(a[3] || 0) - Number(b[3] || 0));
  return rows.length ? rows[0][1] : '';
}

const want = process.argv.slice(2);
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ channel: 'chrome', headless: true })
  .catch(() => chromium.launch({ headless: true }));
const page = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
fs.mkdirSync(path.join(ROOT, 'assets/img/worlds'), { recursive: true });

for (const w of worlds()) {
  if (want.length && !want.includes(w.slug)) continue;
  const external = /^https?:\/\//.test(w.url);
  if (!external && !fs.existsSync(path.join(ROOT, w.url, 'index.html'))) {
    console.log(`  · ${w.slug}: not mounted — skipped`);
    continue;
  }
  const home = external ? w.url : base + w.url;
  const shot = n => page.screenshot({
    path: path.join(ROOT, `assets/img/worlds/${w.slug}-${n}.jpg`), type: 'jpeg', quality: 76 });
  // 1 — the first screen
  await page.goto(home, { waitUntil: 'load' });
  await page.waitForTimeout(4500);
  await shot(1);
  // 2 — part-way down the landing page
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight * 0.4, behavior: 'instant' }));
  await page.waitForTimeout(2800);
  await shot(2);
  // 3 — the first book's own page (worlds here), or further down (elsewhere)
  const first = firstBook(w.series);
  if (!external && first && fs.existsSync(path.join(ROOT, w.url, first + '.html'))) {
    await page.goto(home + first + '.html', { waitUntil: 'load' });
    await page.waitForTimeout(3500);
  } else {
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight * 0.72, behavior: 'instant' }));
    await page.waitForTimeout(2800);
  }
  await shot(3);
  // the series' game, for the handheld on the desk
  const play = w.play_url || (!external && fs.existsSync(path.join(ROOT, w.url, 'play.html')) ? home + 'play.html' : '');
  if (play) {
    await page.goto(play, { waitUntil: 'load' });
    await page.waitForTimeout(4000);
    await shot('play');
  }
  console.log(`  ✓ ${w.slug}${play ? ' (+ game)' : ''}`);
}

await browser.close();
server.close();
