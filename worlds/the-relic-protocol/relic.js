// relic.js — shared engine for The Relic Protocol site.
// One law: every miracle loosens a law, and nothing un-unravels.
// The page is a small physics with a balance. Each territory spends the law it
// leans on (weight, light, law) and every spend is a ratchet: scrolling back up
// shows the spent region still spent. Decoration decays; content never does.
// Every effect starts from the composition already in the markup: with JS off,
// with prefers-reduced-motion, or without WebGL, the page is the designed still
// of each set-piece (mid-catastrophe) and nothing here moves.

/* ── RETAIL ──────────────────────────────────────────────────────────────────
   The one edit that puts a book on sale.
   Paste a store URL into a slot. That edition becomes a solid live button on
   the book's page, and every primary button for that book, on every page, turns
   from "See the book at Orb & Ink" into "Buy …" pointing at the best edition
   available (e-book first, in the order below).
   Empty string = not on sale yet = the quiet "coming" state. Nothing dead is shown. */
export const RETAIL = {
  'the-gravity-king':   { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
  'the-stolen-light':   { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
  'the-final-observer': { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
};

/* ── SCENES ──────────────────────────────────────────────────────────────────
   The books are shown by their real covers, whole; no picture here is a crop of
   one. Every other picture is a scene the site builds: a poster plate painted in
   the covers' own rendering (and figures cut out to stand in front of it), laid
   on paper, layered, moved and spent by a shader (seed.js), with the Seed (a
   shader) hanging in it. The markup holds each scene's still; this list is only
   the record of which slot is which.
     hero          the plain and its crowd; in front of it the brass stand (a cut-out) and the Seed (the shader)
     book1-place   Barrow: the hoists, and the city that has left the ground
     book2-place   the Vesper Chain: the dying star and its chain of stations, the brass optical bench
     book3-place   the Constant: the banked star in its armillary, the archive, the observer's glass
     closing       the same plain at dusk, for the three books to stand on */
export const SCENES = ['hero', 'book1-place', 'book2-place', 'book3-place', 'closing'];

/* Review pull-quotes. Real ones only: { quote: '…', source: '…' }. Empty = the slot stays hidden. */
export const REVIEWS = [];

const CATALOGUE = 'https://orbandink.co.uk/en/books/';
const BOOKS = {
  'the-gravity-king':   { n: '01', ord: 'One',   title: 'The Gravity King',   voice: 'Begin the dig',     law: 'weight', terr: 'barrow',   live: [] },
  'the-stolen-light':   { n: '02', ord: 'Two',   title: 'The Stolen Light',   voice: 'Take the job',      law: 'light',  terr: 'vesper',   live: [] },
  'the-final-observer': { n: '03', ord: 'Three', title: 'The Final Observer', voice: 'Answer the signal', law: 'law',    terr: 'constant', live: [] },
};
// best first: the primary button points at the first of these that has a URL
const ORDER = ['ebook', 'paperback', 'hardcover', 'audiobook', 'immersive', 'drama', 'graphic'];
const EDITION = {
  ebook:     { buy: 'Buy the e-book',                    short: 'Buy the e-book',    verb: 'Buy' },
  paperback: { buy: 'Buy the paperback',                 short: 'Buy the paperback', verb: 'Buy' },
  hardcover: { buy: 'Buy the hardcover',                 short: 'Buy the hardcover', verb: 'Buy' },
  audiobook: { buy: 'Listen to the audiobook',           short: 'Listen now',        verb: 'Listen to' },
  immersive: { buy: 'Listen to the immersive audiobook', short: 'Listen now',        verb: 'Listen to' },
  drama:     { buy: 'Listen to the audio drama',         short: 'Listen now',        verb: 'Listen to' },
  graphic:   { buy: 'Buy the graphic novel',             short: 'Buy the graphic novel', verb: 'Buy' },
};
const ACCENT = { barrow: 'amber', vesper: 'cyan', constant: 'pale' };

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, k) => a + (b - a) * k;
const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
const prng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// cfg: { page: 'landing' | 'book', book: '<slug>' }
export function boot(cfg = {}) {
  const root = document.documentElement;
  const S = {
    cfg, landing: cfg.page === 'landing',
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    y: window.scrollY, vh: window.innerHeight, vw: root.clientWidth,
    travel: 0, now: performance.now(), dt: 16, dy: 0, tasks: [], layout: [], ptr: null,
    spent: { barrow: 0, vesper: 0, constant: 0 },
  };
  S.motion = !S.reduced;
  root.classList.add('js', S.motion ? 'motion' : 'still');
  S.applyRetail = applyRetail;
  applyRetail(RETAIL);
  initReviews();
  initBar(S);
  if (S.motion) {
    if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
      window.addEventListener('pointermove', (e) => { S.ptr = [e.clientX, e.clientY]; }, { passive: true });
      root.addEventListener('pointerleave', () => { S.ptr = null; });
    }
    initEntrances();
    initBarrow(S); initVesper(S); initConstant(S);
    initBruise(S); initTop(S);
    initWorld(S);
  } else {
    S.spent = { barrow: 0.5, vesper: 0.5, constant: 0.5 };
  }

  const measure = () => { S.vh = window.innerHeight; S.vw = root.clientWidth; S.layout.forEach((f) => f(S)); };
  let pending = 0;
  const remeasure = () => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; measure(); if (!S.motion) run(); }); };
  const run = () => { S.tasks.forEach((f) => f(S)); };
  measure();
  window.addEventListener('resize', remeasure);
  window.addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  if (window.ResizeObserver) new ResizeObserver(remeasure).observe(document.body);

  if (S.motion) {
    let last = performance.now();
    const tick = (now) => {
      requestAnimationFrame(tick);
      if (document.hidden) { last = now; return; }      // nothing is spent while nobody is looking
      const y = window.scrollY;
      S.dt = Math.min(64, now - last); last = now; S.now = now;
      S.dy = y - S.y; S.travel += Math.abs(S.dy); S.y = y;
      run();
    };
    requestAnimationFrame(tick);
  } else {
    let q = 0;
    window.addEventListener('scroll', () => { if (q) return; q = requestAnimationFrame(() => { q = 0; S.y = window.scrollY; run(); }); }, { passive: true });
    run();
  }
  return S;
}

/* ── buying: the coming-state, and the swap out of it ─────────────────────────
   Every primary control is <a data-buy="slug" data-buy-form="hero|full|shelf|bar">.
   The words are plain in both states; the series' own voice only ever rides second. */
function paintBuy(a) {
  const book = BOOKS[a.dataset.buy]; if (!book) return;
  const form = a.dataset.buyForm || 'full', label = $('[data-buy-label]', a), sub = $('[data-buy-sub]', a), best = book.live[0];
  if (!a._coming) a._coming = { sub: sub ? sub.textContent : '', alt: a.classList.contains('alt') };
  if (!best) {
    a.href = CATALOGUE + a.dataset.buy + '/'; a.removeAttribute('target'); a.removeAttribute('rel');
    a.classList.remove('live'); a.classList.toggle('alt', a._coming.alt);
    if (label) label.textContent = form === 'hero' ? 'See Book ' + book.ord + ' at Orb & Ink' : form === 'bar' ? 'See the book' : 'See the book at Orb & Ink';
    if (sub) sub.textContent = form === 'full' ? book.voice : a._coming.sub;
    return;
  }
  const E = EDITION[best.k];
  a.href = best.url; a.target = '_blank'; a.rel = 'noopener';
  a.classList.add('live'); a.classList.remove('alt');
  if (label) label.textContent = form === 'hero' ? E.verb + ' Book ' + book.ord : form === 'full' ? E.buy : E.short;
  if (sub) sub.textContent = form === 'shelf' ? 'available now' : (form === 'full' ? book.voice : book.title) + ' · available now';
}
function setEdition(li, f, note, slug, brief) {
  const box = $('.ed-do', li); if (!box) return;
  if (box._coming == null) box._coming = box.innerHTML;
  const img = $('img', li);
  if (img && slug) {                                   // on the landing page the tile shows the book that is on sale
    if (!img._src) img._src = [img.getAttribute('src'), img.alt];
    const art = f ? (li.classList.contains('ed-sq') ? 'assets/listen-' + slug + '-' + f.k + '.webp' : 'assets/cover-' + slug + '-760.jpg') : img._src[0];
    if (img.getAttribute('src') !== art) { img.src = art; img.alt = f ? BOOKS[slug].title : img._src[1]; }
  }
  li.classList.toggle('live', !!f);
  if (!f) { box.innerHTML = box._coming; return; }
  const a = document.createElement('a');
  a.className = 'buy live sm'; a.href = f.url; a.target = '_blank'; a.rel = 'noopener'; a.dataset.edition = f.k;
  a.innerHTML = '<b>' + (brief ? EDITION[f.k].short : EDITION[f.k].buy) + ' <i aria-hidden="true"></i></b>' + (note ? '<small>' + note + '</small>' : '');
  box.textContent = ''; box.appendChild(a);
}
export function applyRetail(map) {
  const slugs = Object.keys(BOOKS);
  slugs.forEach((slug) => {
    const r = (map && map[slug]) || {}, book = BOOKS[slug];
    book.live = ORDER.filter((k) => r[k]).map((k) => ({ k, url: r[k] }));
    // on the book's own page, each edition that has a URL becomes a live button
    $$('[data-editions="' + slug + '"] [data-edition]').forEach((li) => setEdition(li, book.live.find((f) => f.k === li.dataset.edition), ''));
  });
  // the landing page shows each edition once: it goes live with the first book that has it
  $$('[data-editions="series"] [data-edition]').forEach((li) => {
    const slug = slugs.find((s) => BOOKS[s].live.some((f) => f.k === li.dataset.edition));
    setEdition(li, slug ? BOOKS[slug].live.find((f) => f.k === li.dataset.edition) : null, slug ? 'Book ' + BOOKS[slug].ord : '', slug || slugs[0], true);
  });
  $$('[data-buy]').forEach(paintBuy);
}

function initReviews() {
  const box = $('[data-reviews]');
  if (!box || !REVIEWS.length) return;
  REVIEWS.forEach((r) => {
    const f = document.createElement('figure'), q = document.createElement('blockquote'), c = document.createElement('figcaption');
    q.textContent = r.quote; c.className = 'mono'; c.textContent = r.source; f.append(q, c); box.appendChild(f);
  });
  box.hidden = false;
}

/* ── entrances: each territory's CSS decides what "arriving" means ────────── */
function initEntrances() {
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -9% 0px', threshold: 0.12 });
  $$('[data-rise],[data-in],[data-ledger]').forEach((el) => io.observe(el));
}

/* ── the buy bar: the current book and the plain verb. Its top edge is the law's balance. ── */
function initBar(S) {
  const bar = $('[data-bar]'); if (!bar) return;
  const law = $('[data-bar-law]', bar), bal = $('[data-bar-bal]', bar), go = $('[data-bar-go]', bar), title = $('[data-bar-title]', bar);
  let bands = [], cur = '', shown = false, lastBal = -1, endTop = Infinity;
  bar.hidden = false;
  S.layout.push(() => {
    bands = $$('[data-book]').filter((el) => el.matches('[data-band]')).map((el) => ({ slug: el.dataset.book, top: docTop(el) }));
    const end = $('[data-closing]') || $('.end'); endTop = end ? docTop(end) : Infinity;
    S.barH = bar.offsetHeight;
  });
  const set = (slug) => {
    const b = BOOKS[slug]; if (!b) return; cur = slug;
    bar.style.setProperty('--acc', 'var(--' + ACCENT[b.terr] + ')');
    if (law) law.textContent = b.law;
    title.innerHTML = '<b>' + b.n + '</b> ' + b.title;
    go.dataset.buy = slug; paintBuy(go);
    lastBal = -1;
  };
  S.tasks.push(() => {
    const c = S.y + S.vh * 0.5;
    let slug = S.cfg.book || (bands[0] && bands[0].slug) || '';
    if (!S.cfg.book) bands.forEach((b) => { if (c >= b.top) slug = b.slug; });
    if (slug && slug !== cur) set(slug);
    // it appears once the hero has gone, and steps aside for the closing buy section
    const on = !!cur && S.y > S.vh * 0.72 && S.y + S.vh < endTop + S.vh * 0.34;
    if (on !== shown) { shown = on; bar.classList.toggle('on', on); document.documentElement.classList.toggle('bar-on', on); S.barOn = on; }
    const b = BOOKS[cur]; if (!b) return;
    const v = Math.round((1 - clamp(S.spent[b.terr] || 0, 0, 1)) * 100);
    if (v !== lastBal) {
      lastBal = v;
      if (bal) bal.textContent = S.motion ? (v > 0 ? v + '% left' : 'spent') : 'spending';
      bar.style.setProperty('--bal', (S.motion ? v : 50) / 100);
    }
  });
}

/* ── THE WORLD CANVAS: the Seed, and the living plates ─────────────────────────
   One WebGL context, one fixed canvas between the backdrops and the text.
   The Seed lives in a succession of empty "slot" boxes in the layout and is only
   ever drawn exactly in one of them: it hands off from slot to slot while it is
   off the screen (or, where two are in view at once, through a short fade), so it
   never crosses a line of type. A plate is any [data-gl] box with a still of its
   scene inside it (data-src: the far layer, data-src-b: the near one); when the
   layers are ready the still is hidden and the law takes over. */
const AIR = {
  hero:     { tint: [0.42, 0.38, 0.52], rim: [0.86, 0.74, 0.50], haze: 0.72 },
  barrow:   { tint: [0.80, 0.56, 0.20], rim: [0.93, 0.73, 0.38], haze: 1.0 },
  vesper:   { tint: [0.20, 0.84, 0.78], rim: [0.66, 0.93, 0.90], haze: 1.15 },
  constant: { tint: [0.80, 0.85, 0.94], rim: [0.90, 0.90, 0.88], haze: 0.8 },
};
export const SEED_T0 = 0;   // the frame the posters were taken on; the live Seed starts there
function initWorld(S) {
  const canvas = $('[data-seed-canvas]'); if (!canvas) return;
  const hasSeed = S.landing && !!$('[data-seed]');
  const plates = $$('[data-gl]').map((el) => ({ el, kind: el.dataset.gl, far: null, near: null, on: false, t0: 0, posX: 0.5, posY: 0.5, top: 0.12, bot: 0.16, sk: 0, hz: 0, clip: null, watch: 0 }));
  if (!hasSeed && !plates.length) return;
  let world = null, slots = [], mids = [], t = SEED_T0, stage = 0, tx = 0, ty = 0;
  // ten faces glossed, two dead matte: face 5 will gloss, face 8 will cloud
  const gloss = [1, 0.8, 0.9, 0.7, 1, 0, 0.85, 0.75, 0, 0.9, 0.8, 1];
  const fx = { g11: 0, cloud: 0, lit: 0 };
  const cur = { x: -9999, y: -9999, r: 10, alpha: 0, tint: [0.42, 0.38, 0.52], rim: [0.86, 0.74, 0.50], haze: 1, init: false };

  S.layout.push(() => {
    slots = hasSeed ? $$('[data-seed]').filter((el) => el.offsetWidth > 2).map((el) => {
      const r = el.getBoundingClientRect(), d = r.width, top = r.top + S.y, pin = el.closest('.plate-pin'), gp = el.closest('.gut-pin'), cs = getComputedStyle(el);
      let a = top - S.vh * 0.5, b = top + d * 1.3 + S.vh * 0.5;                 // on screen from a to b (measured at the middle of the window)
      if (pin) {                                                                // held in a pinned plate
        const sec = pin.parentElement, off = r.top - pin.getBoundingClientRect().top, st = docTop(sec);
        a = st + off - S.vh * 0.5; b = st + sec.offsetHeight - S.vh + off + d * 1.3 + S.vh * 0.5;
      } else if (gp) {                                                          // held in a band's gutter
        const gut = gp.parentElement, off = r.top - gp.getBoundingClientRect().top, gt = docTop(gut);
        a = gt + off - S.vh * 0.5; b = gt + gut.offsetHeight - gp.offsetHeight + off + d * 1.3 + S.vh * 0.5;
      }
      const band = el.closest('[data-tint]');
      return { el, a, b, so: parseFloat(cs.getPropertyValue('--so')) || 1, air: AIR[el.dataset.air || (band && band.dataset.tint) || 'hero'] || AIR.hero, gloss: +(el.dataset.gloss || 0), plinth: el.hasAttribute('data-plinth') };
    }).sort((p, q) => p.a - q.a) : [];
    mids = [];
    for (let i = 0; i < slots.length - 1; i++) {
      const p = slots[i], q = slots[i + 1];
      mids.push({ c: (p.b + q.a) * 0.5, w: clamp((p.b - q.a) * 0.5, S.vh * 0.03, S.vh * 0.3) });
    }
    plates.forEach((p) => {
      const cs = getComputedStyle(p.el), num = (k, d) => { const v = parseFloat(cs.getPropertyValue(k)); return isNaN(v) ? d : v; };
      p.posX = num('--fx', 0.5); p.posY = num('--py', 78) / 100; p.top = num('--et', 12) / 100; p.bot = num('--eb', 16) / 100; p.sk = num('--sk', 0); p.hz = num('--hz', 0);
      p.clip = p.el.dataset.clip ? p.el.closest(p.el.dataset.clip) : null;
    });
    if (world) world.resize();
  });

  const drawPlates = () => {
    const bruise = Math.min(1, S.travel / (S.vh * 16));
    plates.forEach((p) => {
      const r = p.el.getBoundingClientRect();
      if (r.width < 2 || r.bottom < -S.vh * 0.6 || r.top > S.vh * 1.6) return;
      if (!p.far) {
        // the drawing is rasterised once, at about the height it is shown at (it is 16:9; the box may be taller or wider)
        const th = clamp(Math.ceil(Math.max(r.height, r.width * 9 / 16) * world.dpr / 48) * 48, 576, 1440);     // (a painted plate is 941 px high and is never enlarged)
        p.far = world.loadTexture(p.el.dataset.src, Math.round(th * 16 / 9), th, false);
        if (p.el.dataset.srcB) p.near = world.loadTexture(p.el.dataset.srcB, Math.round(th * 16 / 9), th, true);
      }
      if (!p.far.ready || (p.near && !p.near.ready)) return;
      if (!p.on) { p.on = true; p.el.classList.add('live'); }
      if (r.bottom < 0 || r.top > S.vh) return;
      if (!p.t0 && r.top < S.vh * 0.9) p.t0 = S.now;
      const el = p.el, k = p.kind;
      let spend = S.spent[k] || 0, enter = p.t0 ? clamp((S.now - p.t0) / 2600, 0, 1) : 0;
      if (k === 'hero') { spend = bruise; enter = el.dataset.dusk ? +el.dataset.dusk : 1; }
      if (k === 'vesper') { spend = el._light || 0; enter = el.classList.contains('lit') || el._gone ? 1 : 0; }
      if (k === 'constant') {                               // the error bars widen while you watch, and never narrow
        if (r.top < S.vh * 0.7 && r.bottom > S.vh * 0.3) p.watch = Math.min(1, p.watch + S.dt / 15000);
        spend = Math.max(spend, p.watch);
      }
      // the near plane moves against the far one: with the scroll, and a little with the hand
      const off = (r.top + r.height * 0.5 - S.vh * 0.5) / S.vh;
      const par = [S.ptr ? (S.ptr[0] / S.vw - 0.5) * -0.006 : 0, k === 'hero' ? 0 : clamp(off, -1, 1) * 0.011];
      let clip = null;
      if (p.clip) { const c = p.clip.getBoundingClientRect(); clip = [c.left, c.top, c.width, c.height]; }
      world.plate({ kind: k, far: p.far, near: p.near, x: r.left, y: r.top, w: r.width, h: r.height, posX: p.posX, posY: p.posY, sk: p.sk, hz: p.hz, clip, side: 0, edge: [0, p.top, p.bot], t, spend, enter, alpha: 1, ptr: S.ptr, par });
    });
  };

  const drawSeed = () => {
    if (!slots.length) return;
    const c = S.y + S.vh * 0.5;
    let i = 0; while (i < mids.length && c >= mids[i].c) i++;
    const A = slots[i];
    let al = A.so;
    if (i > 0) al *= smooth((c - mids[i - 1].c) / mids[i - 1].w);
    if (i < mids.length) al *= smooth((mids[i].c - c) / mids[i].w);
    const r = A.el.getBoundingClientRect();
    const f = cur.init ? 1 - Math.exp(-S.dt / 140) : 1;
    cur.x = r.left + r.width * 0.5; cur.y = r.top + r.height * 0.5;        // never eased: the Seed sits exactly in its slot
    cur.r = cur.alpha < 0.03 || !cur.init ? r.width * 0.5 : mix(cur.r, r.width * 0.5, 1 - Math.exp(-S.dt / 60));
    cur.alpha = al; cur.haze = mix(cur.haze, A.air.haze, f);
    for (let n = 0; n < 3; n++) { cur.tint[n] = mix(cur.tint[n], A.air.tint[n], f); cur.rim[n] = mix(cur.rim[n], A.air.rim[n], f); }
    cur.init = true;
    // the spending: a face glosses in Barrow, one clouds on the Chain, all twelve are lit at the Constant. One way only.
    slots.forEach((s) => { if (s.gloss > stage && c >= s.a + (s.b - s.a) * 0.5) stage = s.gloss; });
    const sec = S.dt / 1000;
    if (stage >= 1) fx.g11 = Math.min(1, fx.g11 + sec / 3.0);
    if (stage >= 2) fx.cloud = Math.min(1, fx.cloud + sec / 3.5);
    if (stage >= 3) fx.lit = Math.min(1, fx.lit + sec / 5.0);
    gloss[5] = 0.9 * smooth(fx.g11);
    const px = S.ptr ? (S.ptr[0] / S.vw - 0.5) * 0.30 : 0, py = S.ptr ? (S.ptr[1] / S.vh - 0.5) * 0.30 : 0;
    tx += (px - tx) * (1 - Math.exp(-S.dt / 420)); ty += (py - ty) * (1 - Math.exp(-S.dt / 420));
    world.render({ x: cur.x, y: cur.y, r: cur.r, tint: cur.tint, rim: cur.rim, gloss, cloud: smooth(fx.cloud), lit: smooth(fx.lit), haze: cur.haze, alpha: cur.alpha, t, turn: S.y * 0.00085, tiltX: tx, tiltY: ty, star: S.y * 0.05, stars: A.plinth ? 0.22 : 1, bruise: Math.min(1, S.travel / (S.vh * 14)), ptr: S.ptr, plinth: A.plinth });
  };

  const frame = () => {
    if (!world || world.dead) return;
    t += S.dt / 1000;
    world.probe(S.dt);
    if (!world.begin()) return;
    drawPlates();
    if (hasSeed) drawSeed();
  };
  // lazy: text, covers and stills are the first paint; the shaders wake after
  const wake = async () => {
    try {
      const { mountSeed } = await import('./seed.js');
      world = mountSeed(canvas);
    } catch (err) { console.warn('seed: unavailable, the stills hold', err); world = null; }
    if (!world) return;
    S.seed = { api: world, slots: () => slots, state: () => ({ cur, gloss, fx, t, stage }), set: (o) => { if (o.stage != null) stage = o.stage; if (o.fx) Object.assign(fx, o.fx); if (o.t != null) t = o.t; } };
    S.tasks.push(frame);
    requestAnimationFrame(() => requestAnimationFrame(() => { canvas.classList.add('on'); if (hasSeed && !world.dead) document.documentElement.classList.add('seed-on'); }));
  };
  (window.requestIdleCallback || ((f) => setTimeout(f, 180)))(wake, { timeout: 900 });
}

/* ── 01 · BARROW: the Lift, and then the up-fall ───────────────────────────────
   The picture's own up-fall is in the plate shader. This is the rest of the band:
   strata and inscriptions in the gaps between the blocks of text (never behind
   them), hoisted into place and then let go; and the plumb lines, which go slack. */
const INSCRIPTIONS = ['load-path 07', 'gallery 9, drowned', 'hoist 3 · rated 40 t', 'the Press', 'proof-weight', 'the Deeps', 'shaft 12', 'the Lift'];
function initBarrow(S) {
  $$('[data-territory="barrow"]').forEach((band) => {
    const plumbs = $$('[data-plumb]', band);
    plumbs.forEach((p, i) => { p.style.transition = 'none'; p.style.setProperty('--a', (i % 2 ? -0.4 : 0.4) + 'deg'); p._thr = 0.08 + 0.8 * (i + 0.5) / plumbs.length; });
    requestAnimationFrame(() => requestAnimationFrame(() => plumbs.forEach((p) => { p.style.transition = ''; })));
    const cv = $('[data-upfall]', band), ctx = cv && cv.getContext('2d');
    // d: how far the picture's weight is spent (fast: done by the time the picture has scrolled away). e: the same for the rest of the band.
    const B = { top: 0, h: 1, w: 0, d: 0, e: 0, from: 0.26, span: 0.5, pic: false, segs: [], rules: [], cw: 0, ch: 0, dpr: 1, dirty: false };
    const build = () => {
      const rnd = prng(11), W = B.w, H = B.h;
      // the rows the band keeps clear: its text, and its picture
      const keep = $$('[data-clear], [data-gl], .t-line, .t-label', band).map((el) => { const tp = docTop(el) - B.top; return [tp - 34, tp + el.offsetHeight + 34]; }).sort((p, q) => p[0] - q[0]);
      const gaps = []; let y0 = H * 0.03;
      keep.forEach((k) => { if (k[0] - y0 > 44) gaps.push([y0, k[0]]); y0 = Math.max(y0, k[1]); });
      if (H * 0.975 - y0 > 44) gaps.push([y0, H * 0.975]);
      B.segs = []; B.rules = [];
      let i = 0;
      gaps.forEach((g) => {
        const n = Math.max(1, Math.round((g[1] - g[0]) / 180));
        for (let j = 0; j < n; j++, i++) {
          const y = g[0] + (g[1] - g[0]) * (j + 0.25 + rnd() * 0.5) / n, len = W * (0.22 + rnd() * 0.42);
          const x0 = i % 2 ? W - len - W * rnd() * 0.12 : W * rnd() * 0.12, ry = y / H;
          const rule = { y, lift: -1 }; B.rules.push(rule);
          const thr = () => clamp((ry - 0.16) / 0.7 + (rnd() - 0.5) * 0.2, 0.012, 0.985);
          for (let x = x0; x < x0 + len;) {
            const l = 6 + rnd() * 13;
            B.segs.push({ rule, x, y, l, k: 0, thr: thr(), dl: (x - x0) / len * 700 + rnd() * 240, drop: 46 + rnd() * 110, amber: rnd() < 0.13, free: 0 });
            x += l;
          }
          if (rnd() < 0.72) {     // a tiny inscription riding the stratum; its letters are the first things to go
            const txt = INSCRIPTIONS[(i * 3 + 1) % INSCRIPTIONS.length], gx = x0 + len * (0.08 + rnd() * 0.5);
            for (let c = 0; c < txt.length; c++) if (txt[c] !== ' ') B.segs.push({ rule, x: gx + c * 6.4, y: y - 6, l: 0, k: 1, ch: txt[c], thr: thr() * 0.8, dl: 500 + c * 40, drop: 60 + rnd() * 60, free: 0 });
          }
          for (let q = 0; q < 2; q++) {   // letterforms sunk in the stone
            const sz = 20 + rnd() * 30;
            B.segs.push({ rule, x: x0 + len * rnd() * 0.9, y, l: sz, k: 2, ch: 'GRAVITYKING'[Math.floor(rnd() * 11)], thr: thr(), dl: 300 + rnd() * 600, drop: 80 + rnd() * 90, free: 0 });
          }
        }
      });
    };
    S.layout.push(() => {
      const h = band.offsetHeight, top = docTop(band), w = band.clientWidth;
      const moved = Math.abs(h - B.h) > 40 || Math.abs(w - B.w) > 4;
      B.top = top; B.h = h;
      // spending starts once the band's picture has fully arrived, and is done a little before the band is
      const pic = $('[data-gl]', band);
      B.pic = !!pic;
      if (pic) { const pt = docTop(pic) - top; B.from = clamp((pt + S.vh * 0.5 + 20) / h, 0.05, 0.7); B.span = clamp(pic.offsetHeight / h, 0.1, 0.95 - B.from); }
      if (!ctx) return;
      B.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const cw = Math.round(cv.clientWidth * B.dpr), ch = Math.round(cv.clientHeight * B.dpr);
      if (cw !== B.cw || ch !== B.ch) { cv.width = B.cw = cw; cv.height = B.ch = ch; }
      if (moved) { const keep = B.e; B.w = w; build(); B.segs.forEach((s) => { if (s.thr < keep) s.free = 3; }); }
    });
    S.tasks.push(() => {
      const c = S.y + S.vh * 0.5, q = (c - B.top) / B.h, e = clamp((q - 0.2) / 0.7, 0, 1), d = B.pic ? clamp((q - B.from) / B.span, 0, 1) : e;
      if (e > B.e) B.e = e;
      if (d > B.d) B.d = d;                              // weight, once spent, stays spent
      S.spent.barrow = Math.max(S.spent.barrow, B.d);
      plumbs.forEach((p) => { if (!p._slack && B.e >= p._thr) { p._slack = true; p.style.setProperty('--a', p.dataset.plumb + 'deg'); } });
      if (!ctx) return;
      if (S.y + S.vh < B.top - 100 || S.y > B.top + B.h + 100) { if (B.dirty) { ctx.clearRect(0, 0, B.cw, B.ch); B.dirty = false; } return; }
      const oy = cv.getBoundingClientRect().top + S.y - B.top;     // canvas origin, in band space
      const sec = S.dt / 1000, vhh = cv.clientHeight;
      ctx.setTransform(B.dpr, 0, 0, B.dpr, 0, 0); ctx.clearRect(0, 0, cv.clientWidth, vhh); B.dirty = true;
      B.rules.forEach((r) => { if (r.lift < 0 && r.y - oy < vhh * 0.95) r.lift = S.now; });
      for (let i = 0; i < B.segs.length; i++) {
        const s = B.segs[i]; if (s.free === 3 || s.rule.lift < 0) continue;
        let x = s.x, y = s.y, al = 1, rot = 0;
        if (!s.free) {
          if (B.e >= s.thr) {              // it lets go
            const sy = s.y - oy;
            if (sy < -20 || sy > vhh + 20) { s.free = 3; continue; }
            s.free = 1; s.px = s.x; s.py = s.y; s.vx = (Math.random() - 0.5) * 16; s.vy = -(6 + Math.random() * 26); s.ay = -(34 + Math.random() * 90); s.rot = 0; s.vr = (Math.random() - 0.5) * (s.k ? 1.6 : 0.5);
          } else {                          // the Lift: hoisted into place, heavily
            const q = clamp((S.now - s.rule.lift - s.dl) / 1700, 0, 1), e = 1 - Math.pow(1 - q, 4);
            y = s.y + (1 - e) * s.drop; al = q;
          }
        }
        if (s.free) {                       // the up-fall: the same hoisting, with nothing to stop it
          s.vy += s.ay * sec; s.py += s.vy * sec; s.px += s.vx * sec; s.rot += s.vr * sec;
          x = s.px; y = s.py; rot = s.rot;
          if (y - oy < -40) { s.free = 3; continue; }
          al = clamp((y - oy) / (vhh * 0.22), 0.25, 1);
        }
        const sy = y - oy; if (sy < -40 || sy > vhh + 40) continue;
        if (s.k === 0) {
          ctx.globalAlpha = al * (s.amber ? 0.7 : 0.36); ctx.fillStyle = s.amber ? '#C9922E' : '#6E6A63';
          if (rot) { ctx.save(); ctx.translate(x + s.l / 2, sy); ctx.rotate(rot); ctx.fillRect(-s.l / 2, -0.5, s.l, 1.2); ctx.restore(); } else ctx.fillRect(x, sy, s.l + 0.5, 1);
        } else if (s.k === 1) {
          ctx.globalAlpha = al * 0.46; ctx.fillStyle = '#8A857C'; ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
          if (rot) { ctx.save(); ctx.translate(x, sy); ctx.rotate(rot); ctx.fillText(s.ch, 0, 0); ctx.restore(); } else ctx.fillText(s.ch, x, sy);
        } else {
          ctx.globalAlpha = al * 0.17; ctx.fillStyle = '#B7AE9C'; ctx.font = s.l + "px 'Archivo Black', 'Arial Black', sans-serif";
          ctx.save();
          if (s.free) { ctx.translate(x, sy); ctx.rotate(rot); ctx.beginPath(); ctx.rect(-2, -s.l * 0.62, s.l, s.l * 0.62); ctx.clip(); ctx.fillText(s.ch, 0, s.l * 0.1); }
          else { ctx.beginPath(); ctx.rect(x - 2, sy - s.l * 0.62, s.l, s.l * 0.62); ctx.clip(); ctx.fillText(s.ch, x, sy + s.l * 0.1); }
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    });
  });
}

/* ── 02 · THE VESPER CHAIN: light dies behind you ──────────────────────────────
   Every source ignites as it comes in and browns out for good once it has passed
   the top of the window. The picture is a source too, and it runs on a budget:
   it dims while you look at it, and whatever is left goes when you leave. */
function initVesper(S) {
  $$('[data-territory="vesper"]').forEach((band) => {
    const all = $$('[data-lux]', band), count = $('[data-lux-count]', band);
    all.forEach((el) => { el.classList.remove('spent'); });
    const lux = all.filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed');   // the sources this screen actually shows
    if (!lux.length) return;
    const pic = lux.find((el) => el.matches('[data-gl]'));
    let dead = 0;
    const tell = () => {
      S.spent.vesper = Math.max(S.spent.vesper, dead / lux.length, pic ? (pic._light || 0) * 0.5 : 0);
      if (!count) return;
      count.innerHTML = 'sources lit: <b>' + (lux.length - dead) + '</b> of ' + lux.length + (dead === lux.length ? ' · the Dim' : '');
      count.classList.toggle('out', dead === lux.length);
    };
    tell();
    const ignite = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting && !e.target.classList.contains('spent')) e.target.classList.add('lit'); });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
    // a source that has passed the top of the window browns out, and is never relit
    const die = new IntersectionObserver((es) => {
      es.forEach((e) => {
        const el = e.target;
        if (e.isIntersecting || el._gone || !el.classList.contains('lit')) return;
        if (e.boundingClientRect.top >= (e.rootBounds ? e.rootBounds.top : 0)) return;          // it left by the bottom of the window: still lit
        el._gone = true; el.classList.add('dying'); dead++; tell();
        setTimeout(() => { el.classList.remove('dying', 'lit'); el.classList.add('spent'); }, 320);
      });
    }, { rootMargin: '-13% 0px 0px 0px', threshold: 0 });
    lux.forEach((el) => { ignite.observe(el); die.observe(el); });
    if (pic) {
      pic._light = 0;
      S.tasks.push(() => {
        if (pic._light >= 1) return;
        if (pic._gone) pic._light = Math.min(1, pic._light + S.dt / 800);
        else if (pic.classList.contains('lit')) {
          const r = pic.getBoundingClientRect();
          if (r.bottom > S.vh * 0.2 && r.top < S.vh * 0.8) pic._light = Math.min(0.84, pic._light + S.dt / 30000);    // spent as you watch
        }
        tell();
      });
    }
  });
}

/* ── 03 · THE CONSTANT: the constants drift ───────────────────────────────── */
const KONST = {
  c: { v: 299792458, dp: 4, mag: -0.0062, err: 0.0071, tail: '' },
  g: { v: 6.6743, dp: 6, mag: 0.000021, err: 0.000027, tail: ' e−11' },
  a: { v: 137.035999084, dp: 8, mag: 0.00000016, err: 0.00000046, tail: '' },
  h: { v: 6.62607015, dp: 8, mag: 0.00000008, err: 0.00000019, tail: ' e−34' },
};
const group = (n, dp) => {
  const s = n.toFixed(dp).split('.');
  return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dp ? '.' + s[1].replace(/(\d{3})(?=\d)/g, '$1 ') : '');
};
function initConstant(S) {
  $$('[data-territory="constant"]').forEach((band) => {
    const ks = $$('[data-k]', band), ers = $$('[data-e]', band), head = $$('[data-err]', band), states = $$('[data-ro-state]', band);
    let top = 0, h = 1, drift = 0, shown = -1, ticks = 0, acc = 0, lastTick = -1;
    band.style.setProperty('--drift', '0');
    S.layout.push(() => { top = docTop(band); h = band.offsetHeight; });
    const noise = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x) - 0.5; };
    S.tasks.push(() => {
      const c = S.y + S.vh * 0.5, inside = c > top && c < top + h;
      const d = smooth(((c - top) / h - 0.10) / 0.74);
      if (d > drift) drift = d;                     // deeper only: law, once spent, stays spent
      S.spent.constant = Math.max(S.spent.constant, drift);
      if (inside) { acc += Math.abs(S.dy || 0); if (acc > 46) { acc = 0; ticks++; } }
      if (Math.abs(drift - shown) > 0.004) { shown = drift; band.style.setProperty('--drift', drift.toFixed(3)); }
      if (ticks === lastTick && shown === drift && lastTick !== -1) return;
      lastTick = ticks;
      const w = Math.pow(drift, 1.35);
      ks.forEach((el, i) => { const K = KONST[el.dataset.k]; if (K) el.textContent = group(K.v + K.mag * w + K.err * 0.16 * w * noise(ticks, i % 4), K.dp) + K.tail; });
      ers.forEach((el) => { const K = KONST[el.dataset.e]; if (K) el.textContent = '±' + group(K.err * w, K.dp); });
      head.forEach((el) => { el.textContent = '±' + (0.0041 * w + (w > 0 ? 0.0003 : 0)).toFixed(4); });
      states.forEach((el) => { el.textContent = drift <= 0 ? 'exact' : 'drifting'; });
    });
  });
}

/* ── the bruise: the sky of the site, going the wrong colour with use ─────── */
function initBruise(S) {
  let shown = -1;
  S.tasks.push(() => {
    const v = Math.min(0.09, S.travel / (S.vh * 24) * 0.09);
    if (v - shown > 0.0015) { shown = v; document.documentElement.style.setProperty('--bruise', v.toFixed(4)); }
  });
}

/* ── THE TOP: spins on the bar's edge, wrongly, and is set down once ──────── */
function initTop(S) {
  const src = $('[data-top-rest],[data-top-still]'); if (!src) return;
  const rest = src.matches('[data-top-rest]') ? src : null;      // only the landing page sets it down; on a book page it never stops
  const live = document.createElement('div'); live.className = 'top-live'; live.setAttribute('aria-hidden', 'true');
  const svg = src.cloneNode(true); svg.removeAttribute('data-top-rest'); svg.removeAttribute('data-top-still'); svg.setAttribute('class', 'top-svg');
  live.appendChild(svg); document.body.appendChild(live);
  const g = $('.top-g', svg), marks = $$('.top-mk', svg), shadow = $('.top-shadow', svg);
  src.classList.add('gone');
  let ang = 0, tilt = -1, maxY = 1, w = 50, hh = 35, state = 'spin', t0 = 0, dwell = 0, vis = false;
  const setTilt = (deg) => {
    if (Math.abs(deg - tilt) < 0.02) return; tilt = deg;
    g.setAttribute('transform', 'rotate(' + deg.toFixed(2) + ' 20 44)');
    const k = clamp(Math.abs(deg) / 61.3, 0, 1), sgn = deg < 0 ? -1 : 1;
    shadow.setAttribute('cx', (20 + sgn * 18 * k).toFixed(1)); shadow.setAttribute('rx', (9 + 10 * k).toFixed(1));
  };
  setTilt(0);
  S.layout.push(() => { maxY = Math.max(1, document.documentElement.scrollHeight - S.vh); w = live.offsetWidth || 50; hh = w * 48 / 68; });
  S.tasks.push(() => {
    if (state === 'rest') return;
    const sec = S.dt / 1000, pad = Math.max(20, S.vw * 0.056);
    // along the bar's top edge: left at the first line of the page, right at the last
    const bx = mix(pad + 8, S.vw - pad - 8, clamp(S.y / maxY, 0, 1)), by = S.vh - (S.barH || 52);
    let x = bx, y = by, spin = 15;
    const Z = S.vh * 0.85, k = smooth((S.y - (maxY - Z)) / Z);
    if (k > 0) { const r = src.getBoundingClientRect(); x = mix(bx, r.left + r.width * 24 / 68, k); y = mix(by, r.top + r.height * 44 / 48, k); }
    if (!rest || state === 'spin') {
      setTilt(0);
      if (rest && k > 0.985) { dwell += S.dt; if (dwell > 650) { state = 'fall'; t0 = S.now; } } else dwell = 0;
    } else if (state === 'fall') {
      if (k < 0.9) { state = 'spin'; dwell = 0; }         // carried off before it could be set down: it goes on spinning
      else {
        const q = (S.now - t0) / 1000;
        if (q < 2.6) { const a = q / 2.6; spin = mix(15, 4, a); setTilt(Math.sin(q * (5.2 - a * 2.4)) * 15 * a * a); }
        else if (q < 3.5) { const a = (q - 2.6) / 0.9; spin = mix(4, 0.6, a); setTilt(mix(Math.sin(2.6 * 2.8) * 15, 61.3, a * a * a)); }
        else if (q < 4.6) { const a = (q - 3.5) / 1.1; spin = 0.6 * (1 - a); setTilt(61.3 - Math.sin(a * Math.PI) * 3.2 * (1 - a)); }
        else { state = 'rest'; setTilt(61.3); rest.classList.remove('gone'); live.classList.remove('on'); S.topDown = true; return; }
      }
    }
    const on = (S.barOn || k > 0.02) && S.y > S.vh * 0.72;
    if (on !== vis) { vis = on; live.classList.toggle('on', on); }
    if (!on) return;
    live.style.transform = 'translate3d(' + (x - w * 24 / 68).toFixed(1) + 'px,' + (y - hh * 44 / 48).toFixed(1) + 'px,0)';
    ang += spin * sec;
    marks.forEach((m, i) => {
      const th = ang + i * 2.0944, cs = Math.cos(th);
      if (cs <= 0.02) { m.setAttribute('width', '0'); return; }
      const mw = 2.8 * cs; m.setAttribute('x', (20 + 14.5 * Math.sin(th) - mw / 2).toFixed(2)); m.setAttribute('width', mw.toFixed(2));
    });
  });
}
