// stair.js — shared engine for The Drowned Houses site.
//
// One law: DEPTH IS TIME. A clock held at radius r outside a horizon of radius rs runs at
//     dτ/dt = √(1 − rs/r)
// of the rate of a clock far above it. Everything this file animates is that number.
// Nothing here is eased, smoothed or lerped: a designer's curve would be a lie about the physics.
//
//   depth  u   = −log10((r − rs)/rs)      the gauge's scale: decades of height above the horizon
//   lag    γ   = √(1 + 10^u)              = 1/√(1 − rs/r); "one year here is γ years above"
//   yours      = surface − ∫(1 − 1/γ) dt  the visitor's clock, integrated at the depth on screen
//
// Pages declare depth in their markup (data-lag, data-lag-top, data-lag-bottom) and the engine
// interpolates u linearly between those anchors at the middle of the viewport. So the gauge is a
// depth gauge, not a scrollbar: on the landing page it goes down, then comes back up.

/* ------------------------------------------------------------------------------------------
   RETAIL — the one place a shop link goes.
   Every value is empty today, so every buy button reads "See the book at Orb & Ink" and goes
   to that book's page in the imprint catalogue, and every edition shows a quiet "Coming" chip.
   Paste a URL here and, on every page:
     · that edition becomes a solid live button ("Buy the e-book", "Listen to the audiobook" …)
     · the book's main button becomes "Buy …" / "Listen …" and points at the best edition
       available, in the order below (e-book first)
     · the persistent buy control follows the main button.
   ------------------------------------------------------------------------------------------ */
export const RETAIL = {
  'the-resurfacing': { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
  'the-undertow':    { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
};
const BOOKS = {
  'the-resurfacing': { no: 'Book One', title: 'The Resurfacing', record: 'https://orbandink.co.uk/en/books/the-resurfacing/' },
  'the-undertow':    { no: 'Book Two', title: 'The Undertow',    record: 'https://orbandink.co.uk/en/books/the-undertow/' },
};
const EDITIONS = [
  ['ebook', 'Buy the e-book'], ['paperback', 'Buy the paperback'], ['hardcover', 'Buy the hardcover'],
  ['audiobook', 'Listen to the audiobook'], ['immersive', 'Listen to the immersive audiobook'], ['drama', 'Listen to the audio drama'],
  ['graphic', 'Buy the graphic novel'],
];
const VERB = Object.fromEntries(EDITIONS);
const best = (slug) => { const r = RETAIL[slug] || {}; const e = EDITIONS.find((x) => r[x[0]]); return e ? { key: e[0], verb: e[1], url: r[e[0]] } : null; };

export const U_SURFACE = -3;    // 1000 rs above the horizon: lag ×1.0005
export const U_THRESHOLD = 5;   // marked, not numbered
export const U_HORIZON = 7;     // where the gauge stops drawing; the horizon itself is u = ∞
export const U_FLOOR = 4;       // lag ×100: the floor of the Stair, where the drawn stair ends
export const lagAt = (u) => Math.sqrt(1 + Math.pow(10, u));
export const depthOf = (lag) => Math.log10(Math.max(lag * lag - 1, 1e-3));

const q = (s, r) => (r || document).querySelector(s);
const qa = (s, r) => Array.from((r || document).querySelectorAll(s));
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const p2 = (n) => (n < 10 ? '0' : '') + n;
const stamp = (ms) => { const d = new Date(ms); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + '.' + p2(Math.floor(d.getMilliseconds() / 10)); };
export const fmtLag = (g) => '×' + (g < 9.995 ? g.toFixed(2) : g < 99.95 ? g.toFixed(1) : Math.round(g).toLocaleString('en-GB'));
const KEY = 'drowned-houses.lag';

// The gauge's marker is the Stair's own station, point toward the Well.
const BOB = '<img src="assets/scenes/station.png" width="150" height="600" alt="">';

// cfg: { page: 'landing' | 'book' | 'lost', buy: 'book-slug', tint: [r,g,b] }
//   buy = the book the persistent control sells; tint = the station's foil on this page (copper when absent)
export function boot(cfg) {
  cfg = cfg || {};
  const root = document.documentElement;
  const S = {
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    lagMs: 0, last: 0, y: -1, u: NaN, vh: 1, vw: 1, dirty: true, saved: 0, tau: 0, pointer: null, sheen: '', stOn: 0, stZones: [], covers: [], well: null, t0: Date.now(),
    anchors: [], tones: [], edges: [], drift: [], probes: [],
  };
  try { S.lagMs = Math.max(0, +sessionStorage.getItem(KEY) || 0); } catch (e) { /* private mode: the clock simply starts honest */ }
  const preset = new URLSearchParams(location.search).get('lag');   // ?lag=199450 — review hook: arrive already behind
  if (preset !== null && isFinite(+preset)) S.lagMs = Math.max(0, +preset);

  qa('[data-rest]').forEach((n) => n.remove());   // "instrument at rest" is only true without this script
  root.classList.add('gauged');
  liveRetail();
  const I = buildInstrument(cfg);
  S.mineEls = qa('[data-clock="yours"]');
  S.theirEls = qa('[data-clock="surface"]');
  S.lagEls = qa('[data-lag-out]');
  S.dials = qa('[data-dial]').map((n) => ({ who: n.dataset.dial, rate: +n.dataset.rate || 0, h: q('.dial-h', n), m: q('.dial-m', n), s: q('.dial-s', n) }));
  const oval = q('.rim-well'), foilGrad = q('#g-foil');

  /* ---- measuring ------------------------------------------------------------------------ */
  const depthAt = (y) => {
    const a = S.anchors, n = a.length;
    if (!n) return U_SURFACE;
    if (y <= a[0].y) return a[0].u;
    if (y >= a[n - 1].y) return a[n - 1].u;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m].y <= y) lo = m; else hi = m; }
    const A = a[lo], B = a[hi];
    return B.y === A.y ? B.u : A.u + (B.u - A.u) * (y - A.y) / (B.y - A.y);   // linear in u. No easing.
  };
  const toneAt = (y) => {
    const t = S.tones; let tone = t.length ? t[0].tone : 'paper';
    for (let i = 0; i < t.length; i++) { if (t[i].top <= y) tone = t[i].tone; else break; }
    return tone;
  };
  const measure = () => {
    const sy = window.scrollY || 0;
    S.vh = window.innerHeight || root.clientHeight || 1; S.vw = root.clientWidth || window.innerWidth || 1;
    S.dpr = window.devicePixelRatio || 1;
    const anchors = [];
    qa('[data-lag],[data-lag-top],[data-lag-bottom]').forEach((n) => {
      const r = n.getBoundingClientRect(), top = r.top + sy, d = n.dataset;
      if (d.lag) anchors.push({ y: top + r.height / 2, u: depthOf(+d.lag) });
      if (d.lagTop) anchors.push({ y: top, u: depthOf(+d.lagTop) });
      if (d.lagBottom) anchors.push({ y: top + r.height, u: depthOf(+d.lagBottom) });
    });
    S.anchors = anchors.sort((a, b) => a.y - b.y);
    S.tones = qa('[data-tone]').map((n) => { const r = n.getBoundingClientRect(); return { top: r.top + sy, tone: n.dataset.tone }; }).sort((a, b) => a.top - b.top);
    S.edges = [];
    for (let i = 1; i < S.tones.length; i++) if (S.tones[i].tone !== S.tones[i - 1].tone) S.edges.push({ y: S.tones[i].top, above: S.tones[i - 1].tone });
    S.drift = S.reduced ? [] : qa('[data-drift]').map((n) => {
      const r = n.getBoundingClientRect(), s = n._shift || 0;
      return { el: n, top: r.top + sy - s, h: r.height, k: +n.dataset.drift || 0 };
    });
    // phones: the gauge ends above the docked buy bar, whether or not the bar is showing
    I.wrap.style.setProperty('--foot', (I.buy ? I.buy.offsetHeight + 20 : 44) + 'px');
    S.covers = qa('.sheet--foot,.clothpanel').map((n) => { const r = n.getBoundingClientRect(); return [r.top + sy, r.bottom + sy]; });   // opaque: the Stair is not seen
    S.stZones = qa('[data-st]').map((n) => { const r = n.getBoundingClientRect(); return [r.top + sy, r.bottom + sy]; });
    if (S.stair) S.stair.resize();
    if (S.plates) S.plates.layout();
    S.well = null; S.rimFoot = 0;
    if (oval) { const rr = oval.parentElement.getBoundingClientRect(); S.rimFoot = rr.bottom + sy; }
    if (oval) { const r = oval.getBoundingClientRect(); if (r.width) S.well = { x: r.left + r.width / 2, y: r.top + sy + r.height / 2, rx: r.width / 2, ry: r.height / 2 }; }
    S.probes = I.probes.map((n) => { const r = n.getBoundingClientRect(); return { el: n, y: r.top + r.height / 2 }; });
    S.track = I.ink.firstElementChild.clientHeight;
    S.dirty = true; S.u = NaN;
  };

  /* ---- one frame ------------------------------------------------------------------------- */
  const frame = (t) => {
    S.raf = requestAnimationFrame(frame);
    const dt = S.last ? Math.max(0, t - S.last) : 0; S.last = t;
    const y = window.scrollY || 0;
    const u = depthAt(y + S.vh * 0.5), lag = lagAt(u);
    S.lagMs += dt * (1 - 1 / lag);                     // the whole effect
    const now = Date.now();
    const mine = stamp(now - S.lagMs), theirs = stamp(now);
    if (mine !== S.mine) { S.mine = mine; for (const n of S.mineEls) n.textContent = mine; }
    if (theirs !== S.theirs) { S.theirs = theirs; for (const n of S.theirEls) n.textContent = theirs; }
    S.tau += dt / 1000 / lag;                          // proper time: what the drawn world runs on
    for (const d of S.dials) {
      // a clock kept at a depth runs at 1/γ of the surface's rate from the moment the page opened; yours is the visitor's own
      const ms = (d.rate ? S.t0 + (now - S.t0) / d.rate : d.who === 'yours' ? now - S.lagMs : now) - new Date(now).getTimezoneOffset() * 60000;
      const sec = (ms / 1000) % 60, min = (ms / 60000) % 60, hr = (ms / 3600000) % 12;
      d.s.setAttribute('transform', 'rotate(' + (sec * 6).toFixed(2) + ' 60 60)');
      d.m.setAttribute('transform', 'rotate(' + (min * 6).toFixed(2) + ' 60 60)');
      d.h.setAttribute('transform', 'rotate(' + (hr * 30).toFixed(2) + ' 60 60)');
    }
    // the station hangs only where the page leaves it room (composition, so this one is allowed to ease)
    const mid = y + S.vh * 0.5; let want = 0;
    for (const z of S.stZones) if (mid >= z[0] && mid < z[1]) { want = 1; break; }
    S.stOn += (want - S.stOn) * Math.min(1, dt / 320);
    let hidden = false, seenTo = S.vh;
    for (const c of S.covers) { if (y >= c[0] && y + S.vh <= c[1]) { hidden = true; break; } if (c[0] > y && c[0] < y + S.vh) seenTo = Math.min(seenTo, c[0] - y); }
    // the scene: the depth on the gauge is the depth of the eye; the surface's clock turns the rings; the visitor's own
    // clock swings the station; the foil's light goes round with the page and the pointer
    const glint = 0.9 + y * 0.0021 + (S.pointer ? (S.pointer[0] / S.vw - 0.5) * 1.6 : 0), ts = (now - S.t0) / 1000 + 40;
    const px = S.pointer ? (S.pointer[0] / S.vw - 0.5) * 2 : 0, py = S.pointer ? -(S.pointer[1] / S.vh - 0.5) * 2 : 0;
    if (S.stair && !hidden) {
      const w = S.well && y < S.well.y + S.vh ? S.well : null, fit = w ? { cx: (w.x - S.vw / 2) / S.vh, cy: 0.5 - (w.y - y) / S.vh, rx: 0.975 * w.rx / S.vh, ry: 0.975 * w.ry / S.vh } : null;
      // what of the scene can be seen: the oval while the sheet covers the screen, then whatever lies below the sheet's foot
      let clip = seenTo < S.vh ? [0, 0, S.vw, seenTo] : null;
      const foot = S.rimFoot - y;
      if (w && foot > 0) { const wy = w.y - y; clip = foot >= S.vh ? [w.x - w.rx, wy - w.ry, w.x + w.rx, wy + w.ry] : [0, wy + w.ry > 0 ? Math.max(0, wy - w.ry) : foot, S.vw, seenTo]; }
      S.stair.frame({ s: (u - U_SURFACE) / (U_FLOOR - U_SURFACE), fit, clip, t: ts, tau: S.tau, glint, station: S.stOn, tint: cfg.tint, ms: dt, px, py });
    }
    if (S.plates) S.plates.frame({ vh: S.vh, pointer: S.pointer, still: false, t: ts, tau: S.tau, glint });
    if (u !== S.u) {
      S.u = u;
      const f = Math.min(1, Math.max(0, (u - U_SURFACE) / (U_HORIZON - U_SURFACE)));
      const tf = 'translate3d(0,' + (f * S.track).toFixed(1) + 'px,0)';
      I.markers[0].style.transform = tf; I.markers[1].style.transform = tf;
      const label = fmtLag(lag);
      if (label !== S.label) { S.label = label; for (const n of S.lagEls) n.textContent = label; }
      const slow = (1 + Math.log10(lag)).toFixed(1);   // interface transitions take longer the deeper you are
      if (slow !== S.slow) { S.slow = slow; root.style.setProperty('--slow', slow); }
    }
    if (y !== S.y || S.dirty) {
      S.y = y; S.dirty = false;
      const tri = (y * 0.06) % 200, sheen = (tri > 100 ? 200 - tri : tri).toFixed(0) + '%';   // foil takes the light as the page moves
      if (sheen !== S.sheen) { S.sheen = sheen; root.style.setProperty('--sheen', sheen); if (foilGrad) foilGrad.setAttribute('gradientTransform', 'rotate(' + (y * 0.05 % 360).toFixed(1) + ' .5 .5)'); }
      let edge = null;
      for (const e of S.edges) if (e.y > y && e.y < y + S.vh) { edge = e; break; }
      if (!edge) {
        const paper = toneAt(y + S.vh * 0.5) === 'paper';
        I.ink.style.clipPath = paper ? 'none' : 'inset(0 0 100% 0)';
        I.bone.style.clipPath = paper ? 'inset(0 0 100% 0)' : 'none';
      } else {
        const cut = edge.y - y, upper = 'inset(0 0 ' + (S.vh - cut).toFixed(1) + 'px 0)', lower = 'inset(' + cut.toFixed(1) + 'px 0 0 0)';
        I.ink.style.clipPath = edge.above === 'paper' ? upper : lower;
        I.bone.style.clipPath = edge.above === 'paper' ? lower : upper;
      }
      for (const p of S.probes) { const tone = toneAt(y + p.y); if (p.el.dataset.on !== tone) p.el.dataset.on = tone; }
      for (const d of S.drift) {
        const c = d.top + d.h / 2 - (y + S.vh / 2);
        if (Math.abs(c) > S.vh * 1.4) continue;
        const s = Math.round(c * d.k * S.dpr) / S.dpr;   // whole device pixels: a cover must never be resampled
        d.el._shift = s; d.el.style.transform = 'translate3d(0,' + s + 'px,0)';
      }
      if (cfg.page === 'landing') I.wrap.classList.toggle('at-rim', y < S.vh * 0.5);
    }
    if (t - S.saved > 1500) { S.saved = t; save(); }
  };
  const save = () => { try { sessionStorage.setItem(KEY, String(Math.round(S.lagMs))); } catch (e) { /* nothing to do */ } };

  let rz = 0;
  const remeasure = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(measure); };
  const remeasureSoon = remeasure;
  measure();
  initRise(S, depthAt);
  initBuyWatch(I);
  initScene(S, cfg, remeasureSoon);
  S.raf = requestAnimationFrame(frame);


  window.addEventListener('resize', remeasure);
  window.addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);
  window.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') S.pointer = [e.clientX, e.clientY]; }, { passive: true });
  window.addEventListener('pagehide', save);
  window.addEventListener('pageshow', (e) => {   // back from another depth: take the clock that page left
    if (!e.persisted) return;
    try { S.lagMs = Math.max(S.lagMs, +sessionStorage.getItem(KEY) || 0); } catch (err) { /* keep ours */ }
    S.last = 0;
  });
  return S;
}

/* The shaders arrive after first paint and are never needed: the still of the Stair and the cover
   images are already on the page. Reduced motion keeps the still and the covers as they are. */
function initScene(S, cfg, remeasure) {
  const host = q('.scene'), imgs = qa('img[data-gl]');
  if (S.reduced || (!host && !imgs.length)) return;
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 250));
  idle(async () => {
    try {
      const m = await import('./scene.js');
      if (host) { S.stair = await m.mountStair(host, {}); if (S.stair) document.documentElement.classList.add('scene-live'); }
      S.plates = await m.mountPlates(imgs, {});
      remeasure();
    } catch (e) { console.warn('scene: unavailable — the still and the covers hold', e); }
  });
}

/* The gauge, the clock and the persistent buy control. Built here so the pages carry no dead
   furniture when the script is absent; the markup's own depth marks and buttons are the fallback. */
function buildInstrument(cfg) {
  const wrap = el('aside', 'instr');
  wrap.setAttribute('aria-label', 'Depth gauge');
  const bar = el('div', 'instr-bar');
  const home = el('a', 'instr-home', 'The Drowned Houses');
  home.href = cfg.page === 'landing' ? '#rim' : 'index.html';
  if (cfg.page !== 'landing') home.setAttribute('aria-label', 'The Drowned Houses — the series');
  const read = el('div', 'instr-read', '<b data-lag-out title="One year here, in years above">×1.00</b><span data-clock="yours" role="timer" aria-label="Your clock"></span>');
  const pos = (u) => ((u - U_SURFACE) / (U_HORIZON - U_SURFACE) * 100).toFixed(2);
  const ticks = [1.0005, 2, 5, 10, 20, 50, 100].map((g) => '<li style="top:' + pos(depthOf(g)) + '%"><span>×' + Math.round(g) + '</span></li>').join('') +
    '<li class="is-threshold" style="top:' + pos(U_THRESHOLD) + '%"><span>Threshold</span></li>';
  const gauge = '<div class="instr-gauge"><i class="instr-cable"></i><ol class="instr-ticks">' + ticks + '</ol><div class="instr-marker">' + BOB + '<b data-lag-out></b></div></div>';
  const ink = el('div', 'instr-layer ink', gauge), bone = el('div', 'instr-layer bone', gauge);
  ink.setAttribute('aria-hidden', 'true'); bone.setAttribute('aria-hidden', 'true');
  const horizon = el('i', 'instr-horizon'), hlabel = el('span', 'instr-horizon-label', 'Horizon');
  hlabel.setAttribute('aria-hidden', 'true');
  wrap.append(bar, ink, bone, horizon, hlabel, home, read);
  const probes = [bar, home, read, hlabel];
  let buy = null;
  const book = BOOKS[cfg.buy];
  if (book) {
    const b = best(cfg.buy);
    buy = el('div', 'instr-buy');
    buy.setAttribute('role', 'region'); buy.setAttribute('aria-label', 'Buy ' + book.title);
    const what = el('span', 'instr-buy-what', '<b>' + book.no + '</b><i>' + book.title + '</i>');
    const a = el('a', 'buy buy--mini', '<span class="buy-main">' + (b ? b.verb : 'See the book') + '</span>' + (b ? '' : '<span class="buy-sub">at Orb &amp; Ink</span>'));
    a.href = b ? b.url : book.record;
    if (b) a.rel = 'noopener';
    buy.append(what, a);
    wrap.append(buy); probes.push(buy);
  }
  document.body.appendChild(wrap);
  return { wrap, ink, bone, buy, probes, markers: [q('.instr-marker', ink), q('.instr-marker', bone)] };
}

/* The persistent control shows once the page's own buy buttons have scrolled away, and steps
   aside whenever one of them is back on screen, so the same offer is never made twice at once. */
function initBuyWatch(I) {
  if (!I.buy || !('IntersectionObserver' in window)) return;
  const seen = new Set();
  const io = new IntersectionObserver((es) => {
    for (const e of es) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); }
    I.wrap.classList.toggle('buy-on', seen.size === 0);
  }, { threshold: 0.35 });
  const own = qa('a.buy[data-buy]');
  if (!own.length) { I.wrap.classList.add('buy-on'); return; }
  own.forEach((n) => io.observe(n));
}

/* Coming → live, for every edition that has a URL in RETAIL. */
function liveRetail() {
  qa('a.buy[data-buy]').forEach((a) => {                 // each book's main button
    const b = best(a.dataset.buy); if (!b) return;
    const main = q('.buy-main', a);
    if (main) main.textContent = b.verb;
    a.href = b.url; a.rel = 'noopener'; a.classList.add('is-live');
  });
  qa('[data-buy-note]').forEach((n) => {                 // the quiet line under it
    if (!best(n.dataset.buyNote)) return;
    n.textContent = 'Out now'; n.classList.add('is-live');
  });
  qa('[data-edition]').forEach((li) => {                 // one tile per edition
    const key = li.dataset.edition, books = (li.dataset.books || '').split(/\s+/).filter(Boolean), act = q('.ed-act', li);
    const live = books.filter((s) => RETAIL[s] && RETAIL[s][key]);
    if (!act || !live.length) return;
    act.textContent = '';
    live.forEach((s) => {
      const a = el('a', 'buy buy--tile', '<span class="buy-main">' + VERB[key] + '</span>' + (books.length > 1 ? '<span class="buy-sub">' + BOOKS[s].no + '</span>' : ''));
      a.href = RETAIL[s][key]; a.rel = 'noopener';
      act.appendChild(a);
    });
    li.classList.add('is-live');
  });
}

/* Things settle into place: downward where the page is sinking, upward (and quicker) where it
   is rising, and more slowly the deeper they are. Nothing already on screen is ever hidden. */
function initRise(S, depthAt) {
  if (S.reduced || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); e.target.classList.remove('will-rise'); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
  const sy = window.scrollY || 0;
  qa('[data-rise]').forEach((n) => {
    const r = n.getBoundingClientRect();
    if (r.top < S.vh * 0.94) return;
    const y = r.top + sy + r.height / 2, u = depthAt(y);
    const sinking = depthAt(y + 60) >= depthAt(y - 60) - 1e-9;
    const k = 0.6 + 0.4 * (1 + Math.max(0, Math.log10(lagAt(u))));
    const step = +n.dataset.rise || 0;
    n.style.setProperty('--dur', Math.round((sinking ? 780 : 480) * k) + 'ms');
    n.style.setProperty('--from', sinking ? '-16px' : '16px');
    n.style.transition = 'none';
    n.classList.add('will-rise');
    void n.offsetWidth;
    n.style.transition = '';
    if (step) n.style.transitionDelay = Math.round(step * 110 * k) + 'ms';
    io.observe(n);
  });
}
