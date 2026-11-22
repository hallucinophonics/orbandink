// floor.js — shared engine for The Human Factor site.
// One law: the floor is never in a hurry. Things settle into place and nothing bounces;
// the only violent motion in the building is a sticker going on at the end of the appraisal.
// Every behaviour here improves a page that already reads, and already sells, without it.

/* RETAIL — the one edit on release day.
   Paste a store URL into any slot. That edition's tile turns from a quiet "Coming soon" into
   a solid button, and every buy control for the book (hero, bar, line-up, close) stops saying
   "See the book at Orb & Ink" and says "Buy the …" for the best edition on sale, e-book first.
   Leave a slot empty and nothing dead is shown for it. */
export const RETAIL = {
  'the-assessment':  { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '' },
  'the-asset':       { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '' },
  'full-disclosure': { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '' },
};
// key, what the book's main button says when this is the best edition on sale, what its own tile says
const EDITIONS = [
  ['ebook', 'Buy the e-book', 'Get the e-book'],
  ['paperback', 'Buy the paperback', 'Buy the paperback'],
  ['hardcover', 'Buy the hardcover', 'Buy the hardcover'],
  ['audiobook', 'Buy the audiobook', 'Listen to the audiobook'],
  ['immersive', 'Buy the immersive audiobook', 'Listen to the immersive edition'],
  ['drama', 'Buy the audio drama', 'Listen to the audio drama'],
];

const q = (s, r) => (r || document).querySelector(s);
const qa = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const root = document.documentElement;

// cfg: { page: 'landing' | 'book' | 'lost' }
export function boot(cfg) {
  cfg = cfg || {};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = { cfg, reduced, motion: !reduced, visit: openVisit(cfg.page === 'landing'), appraised: false, clocks: [], ap: 0 };
  initRetail();
  initRise(S);
  initOdometers(S);
  initBar(S);
  initTube(S);
  initSigns(S);
  initClose(S);
  initLamp(S);
  if (cfg.page === 'landing') initAppraisal(S);
  else if (S.visit.appraised) markAppraised(S);
  initShaders(S);
  setInterval(() => tick(S), 1000);
  return S;
}

/* The visit. Kept on this page and in this tab; it goes nowhere. It doesn't need to. */
function openVisit(landing) {
  const now = Date.now();
  let t0 = now, appraised = false;
  try {
    const s = +sessionStorage.getItem('hf.arrived');
    if (s && now - s < 6 * 3600e3) t0 = s; else sessionStorage.setItem('hf.arrived', String(now));
    // Reloading the landing page is a fresh showing of the sheet; coming back to it from a
    // book page is not: the appraisal is still on the lot, exactly as it was left.
    const nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
    if (landing && nav && nav.type === 'reload') sessionStorage.removeItem('hf.appraised');
    appraised = sessionStorage.getItem('hf.appraised') === '1';
  } catch (e) {}
  const V = { t0, appraised, dist: 0, walks: 0, coarse: matchMedia('(pointer: coarse)').matches };
  let last = window.scrollY, run = 0, flagged = false;
  addEventListener('scroll', () => {
    const y = window.scrollY, d = y - last; last = y;
    V.dist += Math.abs(d);
    if (d < 0) { run -= d; if (run > 280 && !flagged) { flagged = true; V.walks++; } }
    else if (d > 0) { run = 0; flagged = false; }
  }, { passive: true });
  return V;
}
const onLot = (V) => { const s = Math.max(0, Math.floor((Date.now() - V.t0) / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s % 60); };
const mileage = (V) => (V.dist / 96 * 0.0254).toFixed(2) + ' m of page, by ' + (V.coarse ? 'thumb.' : 'hand.');
const walks = (V) => V.walks === 0 ? 'None attempted.' : V.walks === 1 ? '1 attempted. Returned.' : V.walks + ' attempted. Returned each time.';

function tick(S) {
  if (!S.appraised && !S.clocks.length) return;
  const t = onLot(S.visit);
  S.clocks.forEach(fn => fn(t));
}

/* RETAIL — see the map at the top of this file. */
function initRetail() {
  const out = (a, url) => { a.href = url; a.target = '_blank'; a.rel = 'noopener'; };
  qa('[data-buy]').forEach(a => {
    const r = RETAIL[a.dataset.buy]; if (!r) return;
    const best = EDITIONS.find(e => r[e[0]]); if (!best) return;
    out(a, r[best[0]]);
    a.classList.add('is-live'); a.classList.remove('btn--ghost');
    qa('[data-buy-label]', a).forEach(el => { el.textContent = best[1]; });
    qa('[data-buy-sub]', a).forEach(el => { if (el.dataset.liveSub) el.textContent = el.dataset.liveSub; else el.remove(); });
  });
  qa('[data-edition]').forEach(el => {
    const p = el.dataset.edition.split(':'), url = RETAIL[p[0]] && RETAIL[p[0]][p[1]];
    if (!url) return;
    const ed = EDITIONS.find(e => e[0] === p[1]);
    const a = document.createElement('a'); a.className = 'btn btn--sm is-live'; out(a, url);
    a.innerHTML = '<span class="btn-main"><span></span> <i aria-hidden="true">→</i></span>';
    q('span span', a).textContent = ed[2];
    el.textContent = ''; el.appendChild(a);
    const tile = el.closest('.ed'); if (tile) tile.classList.add('is-live');
  });
  qa('[data-coming]').forEach(el => {
    const r = RETAIL[el.dataset.coming];
    if (r && EDITIONS.some(e => r[e[0]])) el.textContent = el.dataset.released || '';
  });
}

/* Arrivals — whatever is below the fold when the page opens comes up slowly as it is reached.
   Anything already on screen is left exactly as it was painted. */
function initRise(S) {
  if (!S.motion || !('IntersectionObserver' in window)) return;
  const els = qa('[data-rise]').filter(el => el.getBoundingClientRect().top > innerHeight * 0.94);
  if (!els.length) return;
  els.forEach(el => el.classList.add('pre-rise'));
  const io = new IntersectionObserver(entries => {
    let i = 0;
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target; io.unobserve(el);
      el.classList.add('rise');
      el.style.transitionDelay = (i++ * 110) + 'ms';
      requestAnimationFrame(() => el.classList.remove('pre-rise'));
      setTimeout(() => { el.classList.remove('rise'); el.style.transitionDelay = ''; }, 1500 + i * 110);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -7% 0px' });
  els.forEach(el => io.observe(el));
}

/* Prices settle into place — each digit rolls up to its figure and stops, last digit last. */
function initOdometers(S) {
  qa('[data-odo]').forEach(el => {
    const txt = el.textContent.trim();
    if (!S.motion) return;
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', txt);
    const strips = [];
    const frag = document.createElement('span'); frag.className = 'odo'; frag.setAttribute('aria-hidden', 'true');
    let n = 0;
    txt.split('').forEach(ch => {
      if (!/\d/.test(ch)) { const s = document.createElement('span'); s.textContent = ch; frag.appendChild(s); return; }
      const target = +ch, turns = 6 + ((n * 7) % 5) + n, start = ((target - turns) % 10 + 10) % 10;
      const cell = document.createElement('span'); cell.className = 'odo-c';
      const strip = document.createElement('span'); strip.className = 'odo-s';
      for (let k = 0; k <= turns; k++) { const b = document.createElement('b'); b.textContent = String((start + k) % 10); strip.appendChild(b); }
      strip.style.setProperty('--d', (1.5 + n * 0.17) + 's');
      strip._turns = turns;
      cell.appendChild(strip); frag.appendChild(cell); strips.push(strip); n++;
    });
    el.textContent = ''; el.appendChild(frag);
    const go = () => strips.forEach(s => { s.style.transform = 'translateY(' + (-s._turns) + 'em)'; });
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); setTimeout(go, 350); } }, { threshold: 0.5 });
    io.observe(el);
  });
}

/* The bar — which step of the sale the visitor is standing in, and, once the hero's own
   button has scrolled away, the one buy control that is always within reach. After the
   appraisal it also shows how long they have been on the lot. */
function initBar(S) {
  const lead = q('[data-hero-buy]') || q('[data-hero]');
  if (lead && 'IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      const e = es[0];
      root.classList.toggle('past-hero', !e.isIntersecting && e.boundingClientRect.top < innerHeight * 0.5);
    }, { rootMargin: '-46px 0px 0px 0px' }).observe(lead);
  } else root.classList.add('past-hero');

  const el = q('[data-bar-step]'); if (!el) return;
  const base = el.textContent;
  el.textContent = '';
  const long = document.createElement('span'); long.className = 'bs-long'; long.textContent = base;
  const sep = document.createElement('span'); sep.className = 'bs-long bs-sep'; sep.textContent = '';
  const time = document.createElement('span'); time.className = 'bs-time num';
  el.appendChild(long); el.appendChild(sep); el.appendChild(time);
  S.barTime = (t) => { sep.textContent = ' · On the lot '; time.textContent = t; };
  const secs = qa('[data-step]');
  if (!secs.length) return;
  let cur = base, raf = 0;
  const name = (sec) => (S.appraised && sec.dataset.stepAfter) || sec.dataset.stepName;
  const read = () => {
    raf = 0;
    let at = secs[0];
    for (const sec of secs) if (sec.getBoundingClientRect().top <= innerHeight * 0.5) at = sec;
    const txt = 'Step ' + at.dataset.step + ' of ' + secs.length + ' · ' + name(at);
    if (txt === cur) return;
    cur = txt;
    if (!S.motion) { long.textContent = txt; return; }
    long.style.transition = 'opacity .45s ease'; long.style.opacity = '0';
    setTimeout(() => { long.textContent = cur; long.style.opacity = '1'; }, 460);
  };
  S.readBar = read;
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(read); }, { passive: true });
  read();
}

/* The fluorescent tube over the line-up strikes once, the way they do. */
function initTube(S) {
  const t = q('[data-tube]');
  if (!t || !S.motion) return;
  t.style.opacity = '.08';
  const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); t.style.opacity = ''; t.classList.add('strike'); } }, { threshold: 1, rootMargin: '0px 0px -12% 0px' });
  io.observe(t);
}

/* The signature signs itself when it is reached. It is a flourish; the buttons are the controls. */
function initSigns(S) {
  qa('[data-sign]').forEach(a => {
    if (!S.motion) { a.classList.add('signed'); return; }
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); setTimeout(() => a.classList.add('signed'), 700); } }, { threshold: 0.9 });
    io.observe(a);
  });
}

function initClose(S) {
  const d = new Date();
  qa('[data-today]').forEach(el => { el.textContent = d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); });
}

/* The lot's lamp, reflected. Every laminated thing on the page (stickers, tags, the sheet,
   the buttons) carries one glare, and it sits where a lamp fixed above the window would put
   it: so it slides across each of them as the page moves, and leans toward the pointer.
   The signature's ink is still wet, and takes the same lamp as a glint along the stroke. */
function initLamp(S) {
  if (!S.motion || !('IntersectionObserver' in window)) return;
  const seen = new Set();
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); }), { rootMargin: '10% 0px 10% 0px' });
  qa('.stock, .btn, .bar-buy, .sig, .face').forEach(el => io.observe(el));
  const lamp = { x: innerWidth * 0.74, tx: innerWidth * 0.74 };
  let raf = 0;
  const frame = () => {
    raf = 0;
    lamp.x += (lamp.tx - lamp.x) * 0.12;
    seen.forEach(el => {
      const r = el.getBoundingClientRect(); if (!r.width) return;
      // low in the window the glare is still above the thing; by the top of the window it has crossed it
      el.style.setProperty('--lx', (50 + (lamp.x - (r.left + r.width / 2)) / innerWidth * 130).toFixed(1) + '%');
      el.style.setProperty('--ly', (112 - 165 * (r.top + r.height / 2) / innerHeight).toFixed(1) + '%');
      // wet ink: the glint runs along the signature as it goes by
      if (el._ink === undefined) el._ink = q('linearGradient', el) || null;
      if (el._ink) el._ink.setAttribute('gradientTransform', 'translate(' + ((0.5 - (r.top + r.height / 2) / innerHeight) * 420 + (lamp.x - innerWidth * 0.74) * 0.2).toFixed(1) + ' 0)');
    });
    if (Math.abs(lamp.tx - lamp.x) > 0.5) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', () => { lamp.tx = innerWidth * 0.74; kick(); });
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { lamp.tx = innerWidth * 0.74 + (e.clientX - innerWidth * 0.5) * 0.5; kick(); } }, { passive: true });
  kick();
}

/* Once appraised, always appraised: the sticker in the forecourt turns out to have been
   the visitor's, the bar starts counting, and the close knows what it is being paid in. */
function markAppraised(S) {
  if (S.appraised) return;
  S.appraised = true;
  root.classList.add('appraised');
  try { sessionStorage.setItem('hf.appraised', '1'); } catch (e) {}
  qa('[data-relabel]').forEach(el => {
    const to = el.dataset.relabel;
    if (!S.motion) { el.textContent = to; return; }
    el.style.transition = 'opacity 1s ease'; el.style.opacity = '0';
    setTimeout(() => { el.textContent = to; el.style.opacity = '1'; }, 1050);
  });
  const cons = q('[data-consideration]');
  if (cons) {
    cons.innerHTML = 'In consideration of <b>one reader, <span></span> on the lot</b>';
    const sp = q('span', cons); S.clocks.push(t => { sp.textContent = t; });
  }
  if (S.barTime) S.clocks.push(S.barTime);
  if (S.readBar) S.readBar();
  tick(S);
}

/* THE APPRAISAL. One composed moment: when the sticker is properly in view it corrects itself,
   one field at a time and from the top, into a sticker about the visitor — with their own
   figures entered. It happens once, by itself, while they read it; it is not withdrawn by
   scrolling away. No sound, no flash; then one HOLD sticker. Without script, and under
   reduced motion, the markup is already the corrected sticker. */
function initAppraisal(S) {
  const sec = q('[data-appraisal]'), sheet = q('[data-ap-sheet]');
  if (!sec || !sheet) return;
  const V = S.visit;
  const live = {}; qa('[data-live]', sec).forEach(el => { live[el.dataset.live] = el; });
  const d = new Date(), hr = d.getHours();
  if (live.presented) live.presented.textContent = d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear() + ' · ' + pad(hr) + ':' + pad(d.getMinutes());
  if (live.condition && (hr >= 23 || hr < 5)) live.condition.textContent = 'Up past closing, and still reading.';
  const all = qa('.swap[data-ap-at]', sec);
  // Each cell is as tall, and each mid-line swap as wide, as whichever reading is showing:
  // the sticker never holds a line open for the reading that has gone.
  const showing = (el) => q(el.classList.contains('flipped') ? '.now' : '.was', el);
  const size = (el) => {
    const on = showing(el); if (!on || !sec.classList.contains('live')) return;
    if (el.hasAttribute('data-fit')) el.style.width = on.offsetWidth + 'px';
    else el.style.height = on.offsetHeight + 'px';
  };
  const sizeAll = () => all.forEach(size);
  const figures = () => {
    if (live.mileage) live.mileage.textContent = mileage(V);
    if (live.walk) live.walk.textContent = walks(V);
    ['mileage', 'walk'].forEach(k => { const sw = live[k] && live[k].closest('.swap'); if (sw && sw.classList.contains('flipped')) size(sw); });
  };
  const clock = (t) => { if (live.time) live.time.textContent = t + ' and counting.'; };
  const counting = () => { clock(onLot(V)); if (S.clocks.indexOf(clock) < 0) S.clocks.push(clock); };
  const io = (fn, threshold) => { const o = new IntersectionObserver(es => { if (es[0].isIntersecting) { o.disconnect(); fn(); } }, { threshold }); o.observe(sheet); };

  if (!S.motion || !('IntersectionObserver' in window)) {
    // Settled: the corrected sticker stands as marked up, with the real figures entered once it is seen.
    S.ap = 1;
    if (!('IntersectionObserver' in window)) return;
    io(() => { figures(); counting(); addEventListener('scroll', figures, { passive: true }); markAppraised(S); }, 0.5);
    return;
  }

  sec.classList.add('live'); sheet.classList.add('live');
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(sizeAll, 180); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeAll);

  if (V.appraised) {
    // Already appraised in this tab: the sticker stands as it was left, with the figures still running.
    all.forEach(el => el.classList.add('flipped'));
    sheet.classList.add('held');
    S.ap = 1;
    figures(); counting(); sizeAll();
    addEventListener('scroll', figures, { passive: true });
    markAppraised(S);
    return;
  }

  sizeAll();
  const T = 5600, LEAD = 900;
  io(() => {
    const t0 = performance.now();
    all.forEach(el => setTimeout(() => {
      el.classList.add('flipped'); size(el);
      const now = q('.now', el), key = now && now.dataset.live;
      if (key === 'time') counting();
      figures();
    }, LEAD + (+el.dataset.apAt) * T));
    // the room goes with it: the showroom's warm light leaves the velvet, and the violet stays
    const ramp = (now) => { S.ap = clamp((now - t0 - LEAD) / T, 0, 1); if (S.ap < 1) requestAnimationFrame(ramp); };
    requestAnimationFrame(ramp);
    setTimeout(() => {
      sheet.classList.add('held', 'jolt');
      setTimeout(() => sheet.classList.remove('jolt'), 400);
      setTimeout(() => markAppraised(S), 700);
    }, LEAD + T * 0.9);
    addEventListener('scroll', figures, { passive: true });
  }, 0.55);
}

/* The lot's light: every shader on the site lives in lot.js and is loaded after first paint,
   over compositions that are already in the markup. If it never arrives, nothing is missing. */
function initShaders(S) {
  if (!q('[data-fx]')) return;
  const start = () => import('./lot.js').then(m => m.light({ reduced: S.reduced, ap: () => S.ap }))
    .catch(err => { console.warn('lot: the static compositions hold', err); });
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 700 }); else setTimeout(start, 250);
}
