// calculus.js — shared engine for The Calculus of Fortune site.
// One law: chance is real, budgeted, and filed. Every visit is seeded (timestamp -> xorshift);
// the seed sets the stamp and wax angles, the one irregular light, and which three incidents fire.
// Three, never more, never fewer — and each is filed. The ledger always balances.
//
// Pages boot this with their own config:  import { boot } from './calculus.js'; boot({ page: 'landing' });

// ---------------------------------------------------------------------------------------------
// RETAIL — the one place store links live. Every value is empty today, so every buy control says
// "See the book at Orb & Ink" and goes to the imprint's page for that book. Paste a URL here and,
// on every page: that edition's tile becomes a live button, and the book's primary button becomes
// "Buy ..." and points at the best edition on sale (e-book first, then paper, then audio).
// ---------------------------------------------------------------------------------------------
export const RETAIL = {
  'the-actuarys-burden': { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
  'the-probability-war': { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
  'the-unrigged':        { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' }     // no immersive edition exists for this book: its page has no tile for one
};
const EDITIONS = {            // in order of preference for the primary button: [what it is, plain verb, short verb for narrow tiles]
  ebook:     ['E-book', 'Buy the e-book', 'Buy'],
  paperback: ['Paperback', 'Buy the paperback', 'Buy'],
  hardcover: ['Hardcover', 'Buy the hardcover', 'Buy'],
  audiobook: ['Audiobook', 'Listen to the audiobook', 'Listen'],
  immersive: ['Immersive audiobook', 'Listen to the immersive edition', 'Listen'],
  drama:     ['Audio drama', 'Listen to the audio drama', 'Listen'],
  graphic:   ['Graphic novel', 'Buy the graphic novel', 'Buy']
};
const WAX = '<svg class="buy-ink" aria-hidden="true" focusable="false"><rect width="100%" height="100%" rx="7"/></svg><span class="buy-glare" aria-hidden="true"></span>';
const EXT = '<svg class="ar" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1.8 8.2L8 2M3 2h5v5"/></svg><span class="vh"> (opens in a new tab)</span>';

const q = (s, r) => (r || document).querySelector(s);
const qa = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const pad2 = n => String(n).padStart(2, '0');

// --- seeded chance ---------------------------------------------------------------------------
function xorshift(seed) {
  let x = (seed >>> 0) || 0x9E3779B9;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = 0; i < 6; i++) next();
  return next;
}
const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// xorshift is linear, so sibling streams must not be started from seed ^ name directly: mix first (murmur3 finaliser)
const mix32 = h => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };

function openSession() {
  let s = null;
  try { s = JSON.parse(sessionStorage.getItem('cof.visit') || 'null'); } catch (e) {}
  let forced = null;
  try { forced = new URLSearchParams(location.search).get('seed'); } catch (e) {}
  if (forced) s = { seed: (parseInt(forced, 10) >>> 0) || 1, inc: [] };          // ?seed=N — a fresh visit, on demand
  if (!s || !s.seed) { const now = Date.now(); s = { seed: ((now ^ Math.floor(now / 4294967296) ^ (now << 11)) >>> 0) || 1, inc: [] }; }
  s.save = () => { try { sessionStorage.setItem('cof.visit', JSON.stringify({ seed: s.seed, inc: s.inc })); } catch (e) {} };
  s.stream = name => xorshift(mix32((mix32(s.seed) ^ fnv(name)) >>> 0));
  s.save();
  return s;
}

export function boot(cfg) {
  cfg = cfg || {};
  const root = document.documentElement;
  const S = { cfg, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, ses: openSession(), page: cfg.page || 'landing', scrollAt: 0 };
  root.classList.add('live'); if (S.reduced) root.classList.add('reduced');
  if (cfg.hero) Object.keys(cfg.hero).forEach(k => { const el = q('[data-hero-copy="' + k + '"]'); if (el && cfg.hero[k]) el.textContent = cfg.hero[k]; });
  window.addEventListener('scroll', () => { S.scrollAt = performance.now(); }, { passive: true });
  applyRetail();
  initStamps(S);
  initPrint(S);
  initMeter(S);
  initSlip(S);
  initDossier(S);
  initRibbon(S);
  const ledger = initLedger(S);
  if (!S.reduced) { initReadouts(S); initSway(S); S.incidents = initIncidents(S, ledger); }
  requestAnimationFrame(() => setTimeout(() => lazy(S), 80));     // the heavy pieces wait for first paint
  window.calculus = { get seed() { return S.ses.seed; }, get incidents() { return S.ses.inc.slice(); }, fire: () => S.incidents && S.incidents.fire(), S };
  return S;
}

// --- RETAIL: where a URL exists, the coming-state becomes a live button ---------------------------
export function applyRetail() {
  const url = (slug, f) => (RETAIL[slug] && RETAIL[slug][f]) || '';
  qa('[data-buy]').forEach(a => {
    const slug = a.getAttribute('data-buy'), best = Object.keys(EDITIONS).find(f => url(slug, f)); if (!best) return;
    const special = best !== 'paperback' && best !== 'hardcover';                      // say what it is when it is not simply the book: "Buy the e-book", "Listen to the audiobook"
    a.href = url(slug, best); a.classList.add('live'); a.classList.remove('line');
    const b1 = q('[data-b1]', a), b2 = q('[data-b2]', a);
    if (b1) b1.textContent = a.classList.contains('sm') || !special ? (a.getAttribute('data-live') || 'Buy the book') : EDITIONS[best][1];
    if (b2) b2.textContent = EDITIONS[best][0] + ' \u00B7 on sale now';
    qa('[data-micro="' + slug + '"]').forEach(m => { m.textContent = 'No account. No newsletter. One click to the store.'; });
  });
  qa('[data-ed]').forEach(cell => {
    const parts = cell.getAttribute('data-ed').split(':'), u = url(parts[0], parts[1]); if (!u) return;
    const e = EDITIONS[parts[1]];
    cell.innerHTML = '<a class="buy sm live" href="' + u + '" target="_blank" rel="noopener">' + WAX + '<span class="b1"><span class="lng">' + e[1] + '</span><span class="sht">' + e[2] + '</span> ' + EXT + '</span></a>';
    const tile = cell.closest('.tile'); if (tile) tile.classList.add('live');
  });
}

// --- THE STAMP and THE WAX: seeded angle, seeded ink, no two impressions alike -----------------------
function initStamps(S) {
  const rough = q('#rough'), waxF = q('#wax'), defs = rough && rough.parentNode;
  const own = (base, id, r) => { const f = base.cloneNode(true); f.id = id; qa('feTurbulence', f).forEach((t, k) => t.setAttribute('seed', String(Math.floor(r() * 997) + k))); defs.appendChild(f); return 'url(#' + id + ')'; };
  qa('[data-stamp]').forEach((el, i) => {
    const r = S.ses.stream('stamp' + i + S.page);
    const sign = r() < 0.5 ? -1 : 1, mag = (1.5 + r() * 1.5) * (el.classList.contains('mark') ? 1.9 : 1);    // 1.5\u20133\u00B0 off-axis; marks are struck harder
    el.style.setProperty('--rot', (sign * mag).toFixed(2) + 'deg');
    el.style.setProperty('--mx', Math.round(r() * 240) + 'px'); el.style.setProperty('--my', Math.round(r() * 240) + 'px');
    const rect = q('.stamp-frame rect', el);
    if (rect && defs) rect.setAttribute('filter', own(rough, 'rough-' + i, r));
  });
  qa('.buy').forEach((el, i) => {
    const r = S.ses.stream('wax' + i + S.page);
    if (!el.closest('.slip')) el.style.setProperty('--rot', ((r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.9)).toFixed(2) + 'deg');   // a poured slab sits nearly square
    const rect = q('.buy-ink rect', el);
    if (rect && defs && waxF) rect.style.filter = el.classList.contains('line') ? own(rough, 'rough-b' + i, r) : own(waxF, 'wax-' + i, r);
  });
  // gaslight on wax: the glare follows the pointer across each slab
  if (matchMedia('(hover: hover)').matches) document.addEventListener('pointermove', e => {
    const b = e.target.closest && e.target.closest('.buy'); if (!b) return;
    const bx = b.getBoundingClientRect();
    b.style.setProperty('--gx', ((e.clientX - bx.left) / bx.width * 100).toFixed(1) + '%'); b.style.setProperty('--gy', ((e.clientY - bx.top) / bx.height * 100).toFixed(1) + '%');
  }, { passive: true });
}

// --- print, don't fade ---------------------------------------------------------------------------
function initPrint(S) {
  const els = qa('[data-print]');
  if (S.reduced || !('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in')); return; }
  const r = S.ses.stream('print');
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const v = parseFloat((e.target.closest('[data-v]') || root()).getAttribute('data-v') || '0');
    const slack = Math.round(v * r() * 260);            // downriver, timing develops slack
    if (slack > 12) setTimeout(() => e.target.classList.add('in'), slack); else e.target.classList.add('in');
  }), { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });
  els.forEach(el => io.observe(el));
}
const root = () => document.documentElement;

// --- THE VARIANCE METER: scroll position, read as spread ------------------------------------------
const SCALE = [[0, 0], [0.05, 0.14], [0.5, 0.3], [3, 0.46], [10, 0.58], [30, 0.72], [50, 0.83], [70, 0.92], [100, 1]];
const toAngle = v => {
  let p = 1;
  for (let i = 1; i < SCALE.length; i++) if (v <= SCALE[i][0]) { const a = SCALE[i - 1], b = SCALE[i]; p = a[1] + (b[1] - a[1]) * (v - a[0]) / (b[0] - a[0]); break; }
  return -58 + 116 * p;
};
function initMeter(S) {
  const m = q('[data-meter]'); if (!m) return;
  const btn = q('button', m), docket = q('[data-docket-box]', m), list = q('[data-docket]', m);
  const needle = q('[data-needle]', m), wedge = q('[data-wedge]', m), fig = q('[data-fig]', m), ferr = q('[data-figerr]', m), unit = q('[data-figunit]', m);
  const secs = qa('[data-sec]'); if (!secs.length) return;
  const r = S.ses.stream('meter');
  secs.forEach((s, i) => {
    const li = document.createElement('li'), a = document.createElement('a');
    a.href = '#' + s.id;
    const val = s.getAttribute('data-range') ? s.getAttribute('data-range') : (s.getAttribute('data-mils') || '0.000') + (s.hasAttribute('data-bloom') ? ' ±' : '');
    a.innerHTML = '<span>' + pad2(i) + '</span><span>' + s.getAttribute('data-sec') + '</span><span>' + val + '</span>';
    li.appendChild(a); list.appendChild(li);
  });
  m.hidden = false;
  const open = on => { docket.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false'); m.classList.toggle('open', on); };
  btn.addEventListener('click', () => open(docket.hidden));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !docket.hidden) { open(false); btn.focus(); } });
  document.addEventListener('click', e => { if (!docket.hidden && !m.contains(e.target)) open(false); });
  list.addEventListener('click', e => { if (e.target.closest('a')) open(false); });

  const st = { cur: -1, a: -58, target: -58, lo: 0, hi: 0, mode: 'fig', raf: 0, t0: performance.now(), lastFig: 0 };
  const arc = (a0, a1, rad) => {            // sector of the dial between two needle angles
    const pt = a => { const x = 74 + rad * Math.sin(a * Math.PI / 180), y = 78 - rad * Math.cos(a * Math.PI / 180); return x.toFixed(1) + ' ' + y.toFixed(1); };
    return 'M' + pt(a0) + ' A' + rad + ' ' + rad + ' 0 0 1 ' + pt(a1);
  };
  const paint = () => { needle.setAttribute('transform', 'rotate(' + st.a.toFixed(2) + ' 74 78)'); };
  const tick = now => {
    st.raf = 0;
    const t = (now - st.t0) / 1000;
    let tgt = st.target;
    if (st.mode === 'bloom') tgt = st.target + 13 * Math.sin(t * 1.3) * Math.sin(t * 0.47 + 1) + 5 * Math.sin(t * 3.1);       // the one thing it was never designed to do
    if (st.mode === 'range') tgt = (st.lo + st.hi) / 2 + (st.hi - st.lo) / 2 * Math.sin(t * 0.63);
    st.a += (tgt - st.a) * (st.mode === 'fig' ? 0.3 : 0.07);
    paint();
    if (st.mode === 'bloom' && now - st.lastFig > 240) { st.lastFig = now; ferr.textContent = ' ±' + (0.08 + Math.abs(st.a - st.target) / 40 + r() * 0.05).toFixed(3); }
    if (st.mode !== 'fig' || Math.abs(tgt - st.a) > 0.05) st.raf = requestAnimationFrame(tick);
  };
  const set = i => {
    if (i === st.cur) return; st.cur = i;
    const s = secs[i], range = s.getAttribute('data-range'), mils = parseFloat(s.getAttribute('data-mils') || '0');
    st.mode = range ? 'range' : s.hasAttribute('data-bloom') ? 'bloom' : 'fig';
    m.setAttribute('data-mode', st.mode);
    qa('a', list).forEach((a, k) => { if (k === i) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    if (range) {
      const [lo, hi] = range.split('–').map(Number); st.lo = toAngle(lo); st.hi = toAngle(hi); st.target = (st.lo + st.hi) / 2;
      fig.textContent = range; ferr.textContent = ''; wedge.setAttribute('d', arc(st.lo, st.hi, 44));
    } else {
      st.target = toAngle(mils); fig.textContent = mils.toFixed(3);
      ferr.textContent = st.mode === 'bloom' ? ' ±0.214' : '';
      wedge.setAttribute('d', st.mode === 'bloom' ? arc(st.target - 17, st.target + 17, 44) : '');
    }
    fig.parentNode.setAttribute('data-val', fig.textContent);
    if (unit) unit.textContent = 'mils';
    const v = parseFloat(s.getAttribute('data-v') || '0');
    if (S.reduced || (st.mode === 'fig' && v < 0.1)) { st.a = st.target; paint(); }     // in the Zone the needle does not travel: it is simply elsewhere
    if (!S.reduced && !st.raf) st.raf = requestAnimationFrame(tick);
  };
  let pending = false;
  const read = () => {
    pending = false;
    const y = innerHeight * 0.45; let cur = 0;
    for (let i = 0; i < secs.length; i++) if (secs[i].getBoundingClientRect().top <= y) cur = i;
    set(cur);
  };
  const onScroll = () => { if (!pending) { pending = true; requestAnimationFrame(read); } };
  window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
  read();
}

// --- the persistent buy slip: appears once the hero has scrolled away --------------------------------
function initSlip(S) {
  const slip = q('[data-slip]'), dock = q('[data-dock]'); if (!slip) return;
  const after = q('[data-slip-after]');
  let shown = null;
  const check = () => {
    const pass = after ? after.getBoundingClientRect().bottom < innerHeight * 0.45 : scrollY > innerHeight;
    if (pass !== shown) { shown = pass; slip.hidden = !pass; if (dock) dock.classList.toggle('on', pass); }
  };
  window.addEventListener('scroll', check, { passive: true }); window.addEventListener('resize', check);
  check();
}

// --- THE FILE: three schedules, each over-stamped as it is read ------------------------------------
function initDossier(S) {
  const sheets = qa('[data-sheet]'); if (!sheets.length) return;
  if (S.reduced || !('IntersectionObserver' in window)) { sheets.forEach(s => s.classList.add('struck')); return; }
  let queue = 0;
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const wait = 420 + queue * 520; queue++;
    setTimeout(() => { e.target.classList.add('struck'); queue = Math.max(0, queue - 1); }, wait);
  }), { threshold: 0.6 });
  sheets.forEach(s => io.observe(s));
}

// --- the spread ribbon: the hero's rain, continuing down the margin ---------------------------------
const ihash = n => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
function initRibbon(S) {
  const cv = q('[data-ribbon]'); if (!cv) return;
  const ctx = cv.getContext('2d'); if (!ctx) return;
  const els = qa('[data-rib]'); if (!els.length) return;
  let keys = [], W = 0, H = 0, dpr = 1, last = 0;
  const measure = () => {
    W = cv.clientWidth; H = cv.clientHeight; dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    keys = els.map(el => ({ y: el.getBoundingClientRect().top + scrollY, p: el.getAttribute('data-rib').split(',').map(Number) }));
  };
  const at = y => {                                    // sigma, split, wobble, tone — interpolated between section heads
    if (y <= keys[0].y) return keys[0].p;
    for (let i = 1; i < keys.length; i++) if (y < keys[i].y) { const a = keys[i - 1], b = keys[i], f = clamp((y - a.y) / Math.min(b.y - a.y, 520), 0, 1); return a.p.map((v, k) => v + ((b.p[k] || 0) - v) * f); }
    return keys[keys.length - 1].p;
  };
  const STEP = 4, t0 = performance.now();
  const draw = now => {
    const t = S.reduced ? 0 : (now - t0) / 1000, fall = t * 16, sy = scrollY;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const first = Math.floor((sy - fall) / STEP);
    for (let k = 0; k * STEP < H + STEP; k++) {
      const row = first + k, y = row * STEP + fall - sy, p = at(sy + y);
      const sg = p[0], sp = p[1] || 0, wb = p[2] || 0, tone = p[3] || 0;
      const sway = wb ? Math.sin(t * 0.63 + (sy + y) * 0.0035) * W * 0.2 * wb : 0;
      for (let j = 0; j < 2; j++) {
        const h1 = ihash(row * 7 + j), h2 = ihash(row * 13 + j + 911), h3 = ihash(row * 29 + j + 77);
        if (j && sg < 0.02 && !sp) continue;                              // a needle needs one thread
        if (h3 < 0.38) continue;                                          // rain, not a ruled line
        const g = (h1 + h2 + h3 - 1.5) * 1.15;
        const x = W / 2 + (sp ? (h3 < 0.5 ? -1 : 1) * sp * W * 0.3 : 0) + g * sg * W * 0.42 + sway;
        ctx.globalAlpha = 0.42 + 0.4 * h2;
        ctx.fillStyle = tone > 0.5 ? '#B9C2CC' : '#1B1712';
        ctx.fillRect(x - 0.6, y, 1.3, 1.9);
      }
    }
    ctx.globalAlpha = 1;
  };
  const refresh = () => { measure(); draw(performance.now()); };
  refresh();
  cv.classList.add('on');
  window.addEventListener('resize', refresh);
  window.addEventListener('load', refresh);
  setTimeout(refresh, 1500);                               // fonts and covers move the section heads
  if (S.reduced) { window.addEventListener('scroll', () => requestAnimationFrame(draw), { passive: true }); return; }
  const loop = now => { requestAnimationFrame(loop); if (document.hidden || !W || now - last < 33) return; last = now; draw(now); };   // !W: hidden on phones
  requestAnimationFrame(loop);
}

// --- the visitor is the sink: readouts near the pointer grow error bars -----------------------------
function initReadouts(S) {
  const els = qa('[data-readout]'); if (!els.length || !matchMedia('(hover: hover)').matches) return;
  els.forEach(el => { const e = document.createElement('span'); e.className = 'err'; e.setAttribute('aria-hidden', 'true'); el.appendChild(e); el._err = e; });
  let px = -1, py = -1, pend = false;
  const upd = () => {
    pend = false;
    els.forEach(el => {
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
      const d = Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2));
      const k = d < 150 ? Math.pow(1 - d / 150, 1.4) : 0;
      el._err.textContent = k > 0.02 ? '±' + (k * 0.6 + Math.random() * 0.012).toFixed(3) : '';
    });
  };
  window.addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; if (!pend) { pend = true; requestAnimationFrame(upd); } }, { passive: true });
}

// --- east-bank chits sway on scroll velocity ----------------------------------------------------------
function initSway(S) {
  const els = qa('.sway'); if (!els.length) return;
  let lastY = scrollY, vel = 0, ang = 0, raf = 0;
  const step = () => {
    raf = 0;
    const y = scrollY; vel += ((y - lastY) - vel) * 0.3; lastY = y;
    ang += (clamp(vel * 0.09, -1.5, 1.5) - ang) * 0.12;
    els.forEach((el, i) => { el.style.setProperty('--sway', (ang * (i % 2 ? -1 : 1)).toFixed(2) + 'deg'); });
    if (Math.abs(ang) > 0.02 || Math.abs(vel) > 0.2) raf = requestAnimationFrame(step); else els.forEach(el => el.style.setProperty('--sway', '0deg'));
  };
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(step); }, { passive: true });
}

// --- the footer ledger: what this visit cost -----------------------------------------------------------
function initLedger(S) {
  const el = q('[data-ledger]');
  const write = () => {
    if (!el) return;
    const seed = String(S.ses.seed).padStart(10, '0'), inc = S.ses.inc;
    const lines = ['DRAW ' + seed.slice(0, 5) + '-' + seed.slice(5) + ' · INCIDENTS FILED ' + inc.length + ' OF 3'];
    inc.forEach(r => lines.push('INCIDENT ' + r.no + ' · ' + r.title + ', SECTION ' + r.sec + ' · FILED'));
    if (S.reduced) lines.length = 0, lines.push('MOTION REDUCED · PAGE PRE-SETTLED · 1 INCIDENT ON FILE');
    el.textContent = ''; lines.forEach(t => { const d = document.createElement('span'); d.textContent = t; el.appendChild(d); });
  };
  write();
  return write;
}

// --- FILED INCIDENTS: three per visit, drawn from the seed, each one filed ------------------------------
const KIND = {
  rule:   { title: 'RULE FAILURE',    cause: 'SETTLING (ATTRIB.)' },
  letter: { title: 'TYPE SUBSIDENCE', cause: 'FATIGUE (ATTRIB.)' },
  card:   { title: 'ALIGNMENT SLIP',  cause: 'DRAUGHT (ATTRIB.)' }
};
function initIncidents(S, ledger) {
  const doc = q('[data-doc]') || document.body, ses = S.ses, r = ses.stream('incidents');
  const kinds = Object.keys(KIND);
  const plan = [0, 1, 2].map(() => kinds[Math.floor(r() * 3)]);
  if (plan[0] === plan[1] && plan[1] === plan[2]) plan[2] = kinds[(kinds.indexOf(plan[0]) + 1 + Math.floor(r() * 2)) % 3];
  const due = [6 + r() * 5, 17 + r() * 10, 34 + r() * 18];             // seconds of reading
  const all = kind => qa('[data-inc="' + kind + '"]');
  const secNo = el => { const s = el.closest('[data-sec]'); return pad2(Math.max(0, qa('[data-sec]').indexOf(s))); };
  const seen = new WeakMap();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { seen.set(e.target, e.isIntersecting ? performance.now() : 0); }), { threshold: 0.85 }) : null;
  if (io) kinds.forEach(k => all(k).forEach(el => io.observe(el)));

  const damage = (rec, el, instant) => {
    if (instant) el.classList.add('nomo');
    if (rec.kind === 'rule') { el.style.setProperty('--brk', rec.a + '%'); el.classList.add('snapped'); }
    if (rec.kind === 'card') { el.style.setProperty('--slip', rec.a + 'px'); el.classList.add('slipped'); }
    if (rec.kind === 'letter') dropLetter(el, rec.a, instant);
    el.setAttribute('data-damaged', '');
  };
  const chits = [];
  const place = (chit, el) => {
    const d = doc.getBoundingClientRect(), b = el.getBoundingClientRect(), wide = innerWidth >= 1340 && b.right <= innerWidth - 262;
    chit.classList.toggle('tucked', !wide);
    // wide screens file the full chit in the margin; narrow ones tuck a one-line chit into the gap above the damage
    chit.style.top = Math.round(b.top - d.top + (wide ? -6 : el.matches('[data-inc="card"]') ? -11 : el.matches('[data-inc="rule"]') ? -26 : -17)) + 'px';
  };
  const file = (rec, el, instant) => {
    const chit = document.createElement('aside');
    chit.className = 'chit filed'; chit.setAttribute('role', 'note');
    chit.innerHTML = '<b>INCIDENT ' + rec.no + '</b><span>' + rec.title + '<i>, SECTION ' + rec.sec + '</i></span><span>CAUSE: ' + KIND[rec.kind].cause + '</span><span><i>STATUS: </i>FILED</span>';
    doc.appendChild(chit); place(chit, el); chits.push([chit, el]);
    if (instant) chit.classList.add('in'); else requestAnimationFrame(() => requestAnimationFrame(() => chit.classList.add('in')));
  };
  window.addEventListener('resize', () => chits.forEach(c => place(c[0], c[1])));
  window.addEventListener('load', () => chits.forEach(c => place(c[0], c[1])));

  // damage persists for the visit: restore what was already filed on this page
  ses.inc.forEach(rec => { if (rec.page !== S.page) return; const el = all(rec.kind)[rec.idx]; if (el) { damage(rec, el, true); file(rec, el, true); } });

  const usable = (el, force) => {
    if (el.hasAttribute('data-damaged') || el.closest('a,button') || el.matches(':hover')) return false;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.top < 70 || b.bottom > innerHeight - 50) return false;
    if (force) return true;
    const t = seen.get(el); return !!t && performance.now() - t > 2000;       // never inside its first two seconds in view
  };
  const fire = force => {
    const n = ses.inc.length; if (n >= 3) return false;                          // the budget is absolute
    const order = [plan[n]].concat(kinds.filter(k => k !== plan[n]));
    for (const kind of order) {
      const c = all(kind).filter(el => usable(el, force)); if (!c.length) continue;
      const el = c[Math.floor(r() * c.length)];
      const rec = { no: (1000 + Math.floor(r() * 8999)) + '-' + 'ABCDEF'[Math.floor(r() * 6)], kind, title: KIND[kind].title, page: S.page, idx: all(kind).indexOf(el), sec: secNo(el),
        a: kind === 'rule' ? Math.round(22 + r() * 56) : kind === 'card' ? (r() < 0.5 ? -3 : 3) : +r().toFixed(4) };
      damage(rec, el, false);
      ses.inc.push(rec); ses.save(); ledger();
      setTimeout(() => file(rec, el, false), 600);                               // ~600ms later, it files itself
      return true;
    }
    return false;
  };
  let clock = 0, lastTick = performance.now();
  const base = ses.inc.length ? due[Math.min(ses.inc.length, 2)] - 7 : 0;        // on a later page the next one still waits its turn
  setInterval(() => {
    const now = performance.now(); if (!document.hidden) clock += (now - lastTick) / 1000; lastTick = now;
    const n = ses.inc.length; if (n >= 3) return;
    if (clock + base < due[n]) return;
    if (now - S.scrollAt < 900) return;                                           // never during scroll
    fire(false);
  }, 400);
  return { fire: () => fire(true), plan, due };
}
function dropLetter(h, pick, instant) {
  const tw = document.createTreeWalker(h, NodeFilter.SHOW_TEXT), nodes = []; let n;
  while ((n = tw.nextNode())) if (n.nodeValue.trim() && !n.parentNode.closest('.vh,.err')) nodes.push(n);
  const letters = [];
  nodes.forEach((nd, ni) => { for (let i = 0; i < nd.nodeValue.length; i++) if (/[a-z]/.test(nd.nodeValue[i])) letters.push([ni, i]); });
  if (!letters.length) return;
  const [ni, i] = letters[Math.floor(pick * letters.length) % letters.length];
  if (!h.hasAttribute('aria-label')) h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
  const tail = nodes[ni].splitText(i); tail.splitText(1);
  const sp = document.createElement('span'); sp.className = 'drop' + (instant ? ' fell still' : ''); sp.textContent = tail.nodeValue; tail.parentNode.replaceChild(sp, tail);
  if (!instant) requestAnimationFrame(() => requestAnimationFrame(() => sp.classList.add('fell')));
}

// --- after first paint: the rain, the shaders, the river ---------------------------------------------
async function lazy(S) {
  const gl0 = /[?&]gl=0/.test(location.search);                    // ?gl=0 shows the no-WebGL page
  if (S.reduced) {                                         // motion reduced: the still compositions hold; the shaders paint one settled frame each and stop
    if (!gl0) { try { const m = await import('./shade.js'); S.shade = m.mountShaders({ still: true, seed: S.ses.seed, rnd: S.ses.stream('shade'), dark: document.body.classList.contains('dark') }); } catch (e) { console.warn('shaders: the still compositions hold', e); } }
    return;
  }
  const stages = qa('[data-rain]');
  if (stages.length) {
    try {
      const m = await import('./rain.js');
      const out = { spread: q('[data-hero-spread]'), err: q('[data-hero-err]'), district: q('[data-hero-district]'), mass: q('[data-hero-mass]'), visitor: q('[data-hero-visitor]'), moved: q('[data-hero-moved]') };
      stages.forEach((stage, i) => {
        const d = stage.dataset, hero = d.rain === 'hero', small = stage.clientWidth < 700;
        const h = m.mountRain(stage, {
          rnd: S.ses.stream('rain' + i), mode: d.mode || 'pinned', ink: d.ink || '#1B1712',
          renderer: d.renderer || (gl0 ? '2d' : 'gl'),
          floor: parseFloat(d.floor || '0.78'), sigma: parseFloat(d.sigma || '0'), split: parseFloat(d.split || '0.2'), reflect: d.reflect === '1',
          slotEl: d.slotEl ? q(d.slotEl) : null,
          count: small ? 2600 : 5200, count2d: hero ? 600 : d.rain === 'ledger' ? (small ? 520 : 1700) : (small ? 320 : 820), big: d.rain === 'ledger' && !small, scroll: hero, sigmaMax: 0.11, fall: hero ? 6 : d.rain === 'ledger' ? 5.2 : 4.2,
          depth: parseFloat(d.depth || '0.74'), bin: hero ? 16 : d.rain === 'ledger' ? 12 : 10,
          onState: !hero ? null : st => {
            if (out.err) out.err.textContent = st.present && st.displaced > 0.004 ? ' ±' + (st.displaced * 0.9).toFixed(3) : '';
            if (out.visitor) out.visitor.hidden = !(st.present && st.displaced > 0.004);
            if (out.moved) out.moved.textContent = st.displaced.toFixed(3);
            if (out.spread) out.spread.textContent = (0.041 * Math.pow(st.progress, 1.4)).toFixed(3);
            if (out.district) out.district.textContent = st.progress < 0.05 ? 'PINNED' : st.progress < 0.9 ? 'UNPINNING' : 'UNPINNED';
            if (out.mass) out.mass.textContent = st.slotMass.toFixed(3);
          }
        });
        if (hero) S.rain = h; else (S.rains = S.rains || []).push(h);
      });
    } catch (e) { console.warn('rain: the still composition holds', e); }
  }
  // the shaders: paper and gaslight, the living plates, the wax, the river. Each has its still already in the markup.
  if (!gl0) {
    try { const m = await import('./shade.js'); S.shade = m.mountShaders({ seed: S.ses.seed, rnd: S.ses.stream('shade'), dark: document.body.classList.contains('dark') }); }
    catch (e) { console.warn('shaders: the still compositions hold', e); }
  }
  const cx = q('[data-crossing]');
  if (cx && !(S.shade && S.shade.crossing)) {            // no WebGL: the 2D river, over the still
    try { const m = await import('./crossing.js'); S.crossing = m.mountCrossing(cx, { rnd: S.ses.stream('crossing') }); }
    catch (e) { console.warn('crossing: the still composition holds', e); }
  } else if (S.shade) S.crossing = S.shade.crossing;
}
