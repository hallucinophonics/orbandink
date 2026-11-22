// dark.js — shared engine for The Breathing Dark.
// Three verbs only: dim, kindle, breathe. Nothing in here slides, bounces or spins.
//
// Each page boots it with its own config:  boot({ page: 'landing' })
// Everything it touches already exists in the markup in a settled state, so the
// page reads complete with scripting off; this file only removes light, restores
// it, or lets it breathe.

/* ── RETAIL ───────────────────────────────────────────────────────────────────
   The one place shop links live. Keys per book: ebook, paperback, hardcover,
   audiobook, immersive, drama. Every value is empty today, so every button reads
   "See the book at Orb & Ink" and opens the book's page at the imprint, and every
   edition shows a quiet "Coming" chip.
   Paste a URL here and, for that book, everywhere on the site:
     · the edition's chip becomes a solid button ("Get the e-book", "Listen to …");
     · the book's main buttons, and the dock at the foot of the window, become
       "Buy …" and point at the best edition on sale (e-book first, then in the
       order below).
   Nothing else needs editing. */
export const RETAIL = {
  'the-vanishing': { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '' },
  'the-exhale':    { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '' },
  'the-outside':   { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '' }
};
const ORDER = ['ebook', 'paperback', 'hardcover', 'audiobook', 'immersive', 'drama'];
const BUY = { ebook: 'Buy the e\u2011book', paperback: 'Buy the paperback', hardcover: 'Buy the hardcover', audiobook: 'Buy the audiobook', immersive: 'Buy the immersive audiobook', drama: 'Buy the audio drama' };
const GET = { ebook: 'Get the e\u2011book', paperback: 'Buy the paperback', hardcover: 'Buy the hardcover', audiobook: 'Listen to the audiobook', immersive: 'Listen to the immersive audiobook', drama: 'Listen to the audio drama' };

const root = document.documentElement;
const q = (s, r) => (r || document).querySelector(s);
const qa = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const sstep = (t) => t * t * (3 - 2 * t);
const onScroll = (fn) => { let tick = false; const run = () => { tick = false; fn(); }; const h = () => { if (!tick) { tick = true; requestAnimationFrame(run); } };
  addEventListener('scroll', h, { passive: true }); addEventListener('resize', h); fn(); };

export function boot(cfg) {
  cfg = cfg || {};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('js');
  root.classList.toggle('still', reduced);
  const murmur = initMurmur(cfg, reduced);
  initRetail();
  initKindle(reduced);
  initNav();
  initDock();
  const sky = initSky(cfg, reduced, murmur);
  if (cfg.page === 'landing') { initDescent(sky, reduced); initRidge(reduced); }
  if (cfg.scene === 'vigil') initVigil(sky, reduced);
  if (cfg.scene === 'blueshift') initBlueshift(sky, reduced);
  if (cfg.scene === 'negative') initNegative(sky);
  initPlates(reduced, murmur);
  initWarm();
  return { murmur, sky };
}

/* ── The Murmur ───────────────────────────────────────────────────────────────
   One clock for the whole site. It writes a single custom property, --murmur
   (0..1), and CSS does the rest: page luminance, hero scale, the door's rim. The
   sky reads the same clock as a uniform. A 19 s sinusoid moves so slowly that
   twelve writes a second are indistinguishable from sixty. */
function initMurmur(cfg, reduced) {
  const m = cfg.murmur || {}, period = m.period || 19, amp = m.amp == null ? 1 : m.amp;
  root.style.setProperty('--amp', String(amp));
  if (reduced) { root.style.setProperty('--murmur', '0.5'); return () => 0; }
  const t0 = performance.now();
  const wave = (now) => Math.sin(((now - t0) / 1000 / period) * Math.PI * 2);
  let lastWrite = -1e9;
  const tick = (now) => {
    requestAnimationFrame(tick);
    if (document.hidden || now - lastWrite < 80) return;
    lastWrite = now;
    root.style.setProperty('--murmur', (0.5 + 0.5 * wave(now)).toFixed(3));
  };
  requestAnimationFrame(tick);
  return () => wave(performance.now()) * amp;
}

/* ── Kindle: every reveal is a fade, once, one way ───────────────────────────── */
function initKindle(reduced) {
  const els = qa('[data-k]');
  if (reduced || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-lit')); return; }
  // lit as it crosses the foot of the window, so nothing is ever waited for
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-lit'); io.unobserve(e.target); } }), { threshold: 0, rootMargin: '0px 0px 6% 0px' });
  els.forEach((el) => io.observe(el));
}

/* ── Nav: on the landing page it is not shown until the first screen is behind you ── */
function initNav() {
  const nav = q('[data-nav]');
  if (!nav) return;
  if (nav.classList.contains('is-shy')) onScroll(() => nav.classList.toggle('is-on', scrollY > innerHeight * 0.62));
  // the bar takes the ground of whatever room is passing under it
  const rooms = qa('[data-tone]').filter((el) => el !== nav); // a page may also give the bar a fixed tone of its own
  if (rooms.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { e.target._under = e.isIntersecting; });
      const r = rooms.find((x) => x._under);
      if (r) nav.setAttribute('data-tone', r.getAttribute('data-tone')); else nav.removeAttribute('data-tone');
    }, { rootMargin: '-30px 0px -95% 0px' });
    rooms.forEach((r) => io.observe(r));
  }
}

/* ── The dock: the persistent buy control, once the page's own first button is out of sight ── */
function initDock() {
  const dock = q('[data-dock]');
  if (!dock) return;
  const first = q('[data-hero-buy]'), beat = first && first.closest('[data-beat]');
  // the page's own first button is "away" once it has scrolled off, or once its beat has dimmed
  const away = () => { if (!first) return true; const r = first.getBoundingClientRect(); return r.bottom < 0 || r.top > innerHeight || (beat && !beat.classList.contains('is-on')); };
  // a page too short to scroll (the 404) has no first screen to get past
  const short = root.scrollHeight - innerHeight < innerHeight * 0.5;
  // while another buy button is already on screen the dock steps back: never two of the same call at once
  const shown = new Set();
  const update = () => dock.classList.toggle('is-seen', !shown.size && away() && (short || scrollY > innerHeight * 0.5));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) shown.add(e.target); else shown.delete(e.target); }); requestAnimationFrame(update); }, { rootMargin: '-6% 0px -6% 0px' });
    qa('a.buy[data-buy]').filter((a) => a !== first && !a.closest('[data-dock]')).forEach((a) => io.observe(a));
  }
  // checked a frame late, after the descent has dimmed or kindled its beats for this scroll position
  onScroll(() => requestAnimationFrame(update));
}

/* ── Retail: when RETAIL holds a link, the plain "see" becomes a plain "buy" ── */
export function bestEdition(slug) { const r = RETAIL[slug] || {}, k = ORDER.find((x) => r[x]); return k ? { key: k, url: r[k], verb: BUY[k] } : null; }
function initRetail() {
  qa('[data-buy]').forEach((a) => {
    const slug = a.getAttribute('data-buy'), r = RETAIL[slug] || {};
    // a control that offers listening only ever becomes an audio link
    const ear = a.getAttribute('data-buy-pref') === 'listen' ? ['audiobook', 'immersive', 'drama'].find((k) => r[k]) : null;
    const best = a.hasAttribute('data-buy-pref') ? (ear ? { url: r[ear], verb: GET[ear] } : null) : bestEdition(slug);
    if (!best) return;
    a.href = best.url; a.rel = 'noopener';
    a.classList.add('is-live');
    const verb = q('[data-buy-verb]', a); if (verb) verb.textContent = best.verb;
  });
  qa('[data-ed]').forEach((el) => {
    const key = el.getAttribute('data-ed'), url = (RETAIL[el.getAttribute('data-book')] || {})[key], chip = q('.chip', el);
    if (!url || !chip) return;
    const a = document.createElement('a'), v = document.createElement('span');
    a.className = 'buy buy--sm is-live'; a.href = url; a.rel = 'noopener';
    v.className = 'buy-verb'; v.textContent = GET[key] || 'Buy';
    a.appendChild(v); chip.replaceWith(a);
  });
}

/* ── The scenes below the hero: one shared context, made once, right after first paint.
   Each scene's still is already in the markup, so nothing is ever blank while this loads. ── */
function initPlates(reduced, murmur) {
  const els = qa('[data-plate]');
  if (!els.length) return;
  const start = () => import('./plate.js').then((m) => m.mountPlates(els, { murmur, reduced })).catch((e) => console.warn('plates: the stills hold —', e));
  setTimeout(start, 350);
}

/* ── Warming: the pictures further down are fetched just ahead of the reader, and the
   rest quietly once the first screen has settled, so no section is waited for. ── */
function initWarm() {
  const imgs = qa('img[loading="lazy"]');
  if (!imgs.length) return;
  const wake = (im) => { if (im.loading !== 'eager') im.loading = 'eager'; };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { wake(e.target); io.unobserve(e.target); } }), { rootMargin: '150% 0px 150% 0px' });
    imgs.forEach((im) => io.observe(im));
  }
  // then one at a time, in page order, so the link is never crowded
  const rest = () => { let i = 0; const next = () => { while (i < imgs.length && (imgs[i].complete || imgs[i].loading === 'eager')) i++; if (i >= imgs.length) return; const im = imgs[i++];
    const done = () => { im.removeEventListener('load', done); im.removeEventListener('error', done); setTimeout(next, 60); };
    im.addEventListener('load', done); im.addEventListener('error', done); wake(im); if (im.complete) done(); }; next(); };
  const go = () => setTimeout(rest, 900);
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}

/* ── The sky: compiled after first paint; the static composition holds until then ── */
function initSky(cfg, reduced, murmur) {
  const host = q('[data-sky]');
  const S = { api: null, ready: [] };
  S.then = (fn) => { if (S.api) fn(S.api); else S.ready.push(fn); };
  if (!host || !cfg.sky) return S;
  const start = () => import('./sky.js').then((m) => {
    return m.mountSky(host, Object.assign({ reduced, murmur }, cfg.sky, {
      onStats: (s) => { if (S.onStats) S.onStats(s); },
      onLayout: (a) => { if (S.onLayout) S.onLayout(a); },
      onDeath: (b) => { if (S.onDeath) S.onDeath(b); },
      onFrame: (a) => { if (S.onFrame) S.onFrame(a); }
    }));
  }).then((api) => {
    if (!api) { root.classList.add('no-gl'); return; }
    S.api = api;
    S.ready.splice(0).forEach((fn) => fn(api));
    if (S.onLayout) S.onLayout(api);
    if (S.onStats) S.onStats(api.stats());
    initObits(api, host, cfg, S);
    // pause when the sky is out of sight
    const zone = q('[data-sky-zone]') || host;
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => es.forEach((e) => api.setVisible(e.isIntersecting)), { rootMargin: '10% 0px 10% 0px' }).observe(zone);
    if (!reduced && matchMedia('(hover: hover)').matches) addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') api.pointer(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1); }, { passive: true });
  }).catch((e) => { console.warn('sky: the static sky holds —', e); root.classList.add('no-gl'); });
  requestAnimationFrame(() => setTimeout(start, 0));
  return S;
}

/* ── Obituary captions: hover a bright star (or tap it). And the catalogue itself:
   when a bright star goes, its entry is written beside it and stays a few seconds. ── */
function initObits(api, host, cfg, S) {
  const mk = (cls) => { const el = document.createElement('p'); el.className = cls; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); return el; };
  const el = mk('obit');
  let cur = null, timer = 0;
  const text = (s) => {
    if (api.mode === 'negative') return 'NO ENTRY · BEYOND EVERY CATALOGUE';
    if (s.name) return s.name + ' — ' + (s.cap || (s.weighed ? 'MASS: MEASURED · PRESENT' : 'CAUSE: UNKNOWN'));
    return s.weighed ? 'MASS: MEASURED · PRESENT' : 'CATALOGUED: 1,400+ · WITNESSES: EVERYONE';
  };
  const place = (node, s) => {
    const r = host.getBoundingClientRect(), x = r.left + s.x, y = r.top + s.y, w = Math.min(380, innerWidth - 32);
    node.classList.toggle('is-out', s.x < 6 || s.y < 6 || s.x > r.width - 6 || s.y > r.height - 96); // its star has left the frame
    node.style.maxWidth = w + 'px';
    const flip = x + 20 + w > innerWidth - 12;
    node.style.left = flip ? 'auto' : Math.round(x + 18) + 'px';
    node.style.right = flip ? Math.max(12, Math.round(innerWidth - x + 18)) + 'px' : 'auto';
    if (flip && innerWidth - x + 18 + w > innerWidth - 12) { node.style.right = '16px'; }
    node.style.top = Math.round(y < 96 ? y + 18 : y - 40) + 'px'; // above the star, unless it sits at the very top
  };
  const hide = () => { cur = null; el.classList.remove('is-on'); };
  const show = (s) => { if (cur === s) return; cur = s; el.textContent = text(s); place(el, s); el.classList.add('is-on'); };
  const inSky = (e) => { const t = e.target; return t && t.closest && (t.closest('[data-sky-zone]') || t.closest('[data-sky]')) && !t.closest('a,button'); };
  const at = (e, rad) => { const r = host.getBoundingClientRect(); return api.hit(e.clientX - r.left, e.clientY - r.top, rad); };
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const s = inSky(e) ? at(e, 26) : null; if (s) show(s); else if (cur) hide(); }, { passive: true });
  // a tap: pointer events, because a phone does not send clicks from plain sky
  let down = null;
  addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: e.timeStamp }; }, { passive: true });
  addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse' || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || e.timeStamp - down.t > 600 || !inSky(e)) return;
    const s = at(e, 40); clearTimeout(timer);
    if (s) { cur = null; show(s); timer = setTimeout(hide, 4600); } else hide();
  }, { passive: true });
  addEventListener('scroll', () => { if (cur) hide(); }, { passive: true });

  // the catalogue, kept in the sky: "No. 1401 · DENEB · α CYGNI — LAST LIGHT 2104 …"
  if (cfg.page !== 'landing') return;
  const live = [];
  S.onDeath = (b) => {
    if (live.length > 1) { const old = live.shift(); old.el.classList.remove('is-on'); setTimeout(() => old.el.remove(), 900); }
    const n = mk('obit obit--entry'), no = document.createElement('b');
    no.textContent = b.entry || 'Entry'; n.appendChild(no);
    n.appendChild(document.createTextNode((b.name ? b.name + ' — ' : '') + (b.cap || 'LAST LIGHT · CAUSE OF DEATH: UNKNOWN · WITNESSES: ONE')));
    const it = { el: n, b }; live.push(it); place(n, b);
    requestAnimationFrame(() => n.classList.add('is-on'));
    setTimeout(() => { n.classList.remove('is-on'); setTimeout(() => { n.remove(); const i = live.indexOf(it); if (i >= 0) live.splice(i, 1); }, 900); }, 6200);
  };
  // an entry stays with its star while the view draws in
  S.onFrame = () => { for (const it of live) place(it.el, it.b); };
}

/* ── Landing: scroll is the extinction clock ───────────────────────────────────
   The sky also goes on dying, slowly, while you only watch (sky.js, `creep`). The
   scroll does the rest: the front runs out along its veins, the view draws in toward
   the door, the door grows and bends what is left of the sky round itself. */
function initDescent(sky, reduced) {
  const descent = q('[data-descent]'), stage = q('[data-stage]');
  if (!descent || !stage) return;
  const beats = qa('[data-beat]', descent), lines = qa('[data-at]', descent);
  const present = q('[data-present]'), gone = q('[data-gone]'), count = q('[data-count]');
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  sky.onStats = (s) => { if (present) present.textContent = fmt(s.present); if (gone) gone.textContent = fmt(s.gone); if (count) count.classList.add('is-on'); };
  if (reduced) return; // the copy stays in the flow, the sky stays at its composed half-dead frame
  let api = null; sky.then((a) => { api = a; update(); });
  function update() {
    const vh = stage.offsetHeight || innerHeight, r = descent.getBoundingClientRect(), travel = r.height - vh;
    // zero travel (a first measurement before layout) is the top of the page, never the end of it
    const p = travel > 4 ? clamp(-r.top / travel, -1, 1.6) : 0;
    beats.forEach((b) => b.classList.toggle('is-on', p >= +b.getAttribute('data-from') && p < +b.getAttribute('data-to')));
    lines.forEach((l) => l.classList.toggle('is-on', p >= +l.getAttribute('data-at')));
    if (count) { count.classList.toggle('is-late', p > 0.4); count.classList.toggle('is-up', p > 0.1); }
    root.classList.toggle('past-sky', p > 1.02); // the catalogue's entries belong to the pinned sky only
    if (api) {
      const k = sstep(clamp(p, 0, 1));
      api.setProgress(clamp((p - 0.03) / 0.8, 0, 1));
      api.set({ door: 0.03 + 0.075 * k, zoom: 1 - 0.24 * k, lift: -64 * clamp(p, 0, 1.6), gain: 1 + 0.35 * k });
    }
  }
  onScroll(update);
  // measured again once everything that can move the layout has arrived
  addEventListener('load', update); addEventListener('pageshow', update);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
  if ('ResizeObserver' in window) new ResizeObserver(update).observe(descent);
}

/* ── Book one on the landing page: the vigil. As the ridge comes up into the emptied
   sky its lanterns kindle, the nearest first, off along the hill. They stay lit. ── */
function initRidge(reduced) {
  const ridge = q('[data-ridge]');
  if (!ridge) return;
  if (reduced) { ridge.style.setProperty('--lit', '1'); return; }
  let lit = 0;
  onScroll(() => {
    const r = ridge.getBoundingClientRect();
    const v = clamp((innerHeight * 0.96 - r.top) / (r.height * 0.9 + innerHeight * 0.22), 0, 1);
    if (v > lit) { lit = v; ridge.style.setProperty('--lit', lit.toFixed(3)); }
  });
}

/* ── Book I — the vigil: a city darkening its own windows to see better ───────── */
function initVigil(sky, reduced) {
  const pin = q('[data-pin]'), stage = q('[data-stage]'), chart = q('[data-chart]');
  if (!pin || !stage) return;
  const wins = qa('.win', stage).map((el) => ({ el, o: +el.getAttribute('data-o') })).sort((a, b) => a.o - b.o);
  let hmax = -1, k = 0, api = null;
  const drawChart = (a) => {
    if (!chart) return;
    const v = a.star('vega'), d = a.star('deneb'), al = a.star('altair'), host = q('[data-sky]');
    if (!v || !d || !al) return;
    const W = host.clientWidth, H = host.clientHeight, small = W < 700;
    chart.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const ln = (p, r, cls) => { const dx = r.x - p.x, dy = r.y - p.y, L = Math.hypot(dx, dy), g = 15; return '<line class="' + cls + '" x1="' + (p.x + dx / L * g).toFixed(1) + '" y1="' + (p.y + dy / L * g).toFixed(1) + '" x2="' + (r.x - dx / L * g).toFixed(1) + '" y2="' + (r.y - dy / L * g).toFixed(1) + '"/>'; };
    const tx = (s, t, cls, dx, anchor) => { if (dx > 0 && s.x > W - 96) { dx = -dx; anchor = 'end'; } return '<text class="' + cls + '" x="' + (s.x + dx).toFixed(1) + '" y="' + (s.y + 4).toFixed(1) + '" text-anchor="' + anchor + '">' + t + '</text>'; };
    chart.innerHTML = ln(v, al, 'holds') + ln(d, v, 'breaks') + ln(d, al, 'breaks') + ln(d, v, 'ghost') + ln(d, al, 'ghost')
      + tx(v, 'VEGA', 'holds', 16, 'start') + tx(al, 'ALTAIR', 'holds', 16, 'start')
      + tx(d, (small ? '' : '<tspan class="late">LAST LIGHT 2104 · </tspan>') + 'DENEB', 'breaks', -16, 'end');
    chart.classList.add('is-on');
  };
  sky.onLayout = drawChart;
  sky.then((a) => {
    api = a; drawChart(a);
    // the third vertex fades on entry: a lamp being switched off
    if (reduced) { a.extinguish('deneb', 0.01); if (chart) chart.classList.add('is-broken'); }
    else setTimeout(() => { a.extinguish('deneb', 7); if (chart) chart.classList.add('is-broken'); }, 2600);
    update();
  });
  function update() {
    const vh = stage.offsetHeight || innerHeight, r = pin.getBoundingClientRect();
    const h = reduced ? 0.6 : clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
    if (h > hmax) {
      hmax = h;
      while (k < wins.length && wins[k].o < hmax) wins[k++].el.classList.add('off');
      stage.style.setProperty('--h', hmax.toFixed(3));
      if (api && !reduced) { api.setProgress(0.42 + 0.16 * hmax); api.set({ gain: 1 + 0.32 * hmax }); }
    }
  }
  if (!reduced) wins.forEach((w) => w.el.classList.toggle('off', w.o < 0)); // start the evening over
  onScroll(update);
}

/* ── Book II — blueshift: the sky smearing to a closing ring ─────────────────── */
function initBlueshift(sky, reduced) {
  const pin = q('[data-pin]'), stage = q('[data-stage]'), num = q('[data-h0]'), word = q('[data-h0-state]'), ring = q('[data-ring]');
  if (!pin || !stage) return;
  let api = null;
  const place = (a) => {
    if (!ring) return;
    const host = q('[data-sky]'), hr = host.getBoundingClientRect(), rr = ring.getBoundingClientRect();
    if (!hr.width || !rr.width) return;
    a.set({ ring: [(rr.left + rr.width / 2 - hr.left) / hr.width, (rr.top + rr.height / 2 - hr.top) / hr.height], ringR: rr.width * 0.5 / Math.min(hr.width, hr.height) });
  };
  sky.onLayout = place;
  sky.then((a) => { api = a; place(a); update(); });
  function update() {
    const vh = stage.offsetHeight || innerHeight, r = pin.getBoundingClientRect();
    const h = reduced ? 0.7 : clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
    stage.style.setProperty('--h', h.toFixed(3));
    // slowed. then stopped. a pause like the top of a breath. then the sky reverses.
    const v = h < 0.5 ? 67.4 * (1 - sstep(h / 0.5)) : h < 0.62 ? 0 : -21.6 * sstep((h - 0.62) / 0.38);
    if (num) num.textContent = (v > 0.04 ? '+' : v < -0.04 ? '−' : '') + Math.abs(v).toFixed(1);
    if (word) word.textContent = h < 0.5 ? 'Slowing' : h < 0.62 ? 'Held' : 'Reversing';
    if (api) api.set({ blue: h, zoom: 1 + 0.22 * h, gain: 1 + 0.3 * h, press: 0.22 * h, deepGain: 0.9 + 0.5 * h });
  }
  onScroll(update);
}

/* ── Book III — the negative: the apertures thin out above the title, so the page stays paper ── */
function initNegative(sky) {
  const copy = q('.hero-copy'), host = q('[data-sky]');
  if (!copy || !host) return;
  sky.onLayout = (a) => {
    const hr = host.getBoundingClientRect(), top = 1 - (copy.getBoundingClientRect().top - hr.top) / Math.max(1, hr.height);
    a.set({ thin: hr.width / hr.height < 0.85 ? [top - 0.02, top + 0.42] : [top - 0.3, top + 0.25] });
  };
  sky.then((a) => sky.onLayout(a));
}
