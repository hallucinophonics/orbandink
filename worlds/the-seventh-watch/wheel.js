// wheel.js — shared engine for The Seventh Watch site.
// One law: the realms pass; the hull does not. Six rooms stand one after another in the same
// hull, each with its own sky, and the frame's six lamps follow whichever room is on screen.
// Everything here only enhances markup that already reads on its own: with this file missing,
// or with prefers-reduced-motion, every room shows a still frame of its scene.
// The scenes themselves (WebGL) live in light.js and are loaded only when they can be used.

/* ---------------------------------------------------------------------------------
   RETAIL — the one edit that turns "See the book at Orb & Ink" into live buy buttons.
   Paste a store URL into any slot. While every slot of a book is empty (as today) that
   book shows its coming-state everywhere and nothing dead is rendered. As soon as one
   slot holds a URL:
     · that edition's tile swaps its "Coming" chip for a solid button;
     · every primary button for the book (hero, plate, persistent bar, closing section,
       end of its page) becomes "Buy the e-book" / "Listen to the audiobook" …, pointing
       at the best edition available, in this order: ebook, paperback, hardcover,
       audiobook, immersive, drama.
   --------------------------------------------------------------------------------- */
export const RETAIL = {
  'the-early-dusk':      { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '' },
  'the-drained-sea':     { ebook: '', paperback: '', hardcover: '', audiobook: '', drama: '' },
  'the-continuous-city': { ebook: '', paperback: '', hardcover: '', audiobook: '', drama: '' },
  'the-slow-court':      { ebook: '', paperback: '', hardcover: '', audiobook: '', drama: '' },
  'the-ingathering':     { ebook: '', paperback: '', hardcover: '', audiobook: '' },
  'the-far-shore':       { ebook: '', paperback: '', hardcover: '', audiobook: '' },
};

// The six positions. Pages carry their own copy as real HTML; this is only what the
// engine needs for the furniture it keeps in step (rail, persistent buy control).
export const BOOKS = [
  { slug: 'the-early-dusk',      title: 'The Early Dusk',      bg: '#D8703F', ink: '#1B0E08' },
  { slug: 'the-drained-sea',     title: 'The Drained Sea',     bg: '#9DB8C6', ink: '#0F1A20' },
  { slug: 'the-continuous-city', title: 'The Continuous City', bg: '#D09A4A', ink: '#17110A' },
  { slug: 'the-slow-court',      title: 'The Slow Court',      bg: '#EDE4D6', ink: '#4A1820' },
  { slug: 'the-ingathering',     title: 'The Ingathering',     bg: '#D9C48A', ink: '#1A1710' },
  { slug: 'the-far-shore',       title: 'The Far Shore',       bg: '#A9C9B3', ink: '#10201A' },
];
// A lit lamp must read on graphite: the oxblood position lights in a lifted tint.
const LAMP = ['#D0693F', '#8FA9B6', '#C9934F', '#C25664', '#E6D29A', '#9DBBA6'];
const CATALOGUE = 'https://orbandink.co.uk/en/books/';

const ORDER = ['ebook', 'paperback', 'hardcover', 'audiobook', 'immersive', 'drama'];
// Plain words first: what the button does, for someone who has never heard of the series.
const VERB = {
  ebook:     { book: 'Buy the e-book',        tile: 'Get the e-book',     one: 'Buy Book One' },
  paperback: { book: 'Buy the paperback',     tile: 'Buy the paperback',  one: 'Buy Book One' },
  hardcover: { book: 'Buy the hardcover',     tile: 'Buy the hardcover',  one: 'Buy Book One' },
  audiobook: { book: 'Listen to the audiobook', tile: 'Listen now',       one: 'Listen to Book One' },
  immersive: { book: 'Listen to the immersive audiobook', tile: 'Listen now', one: 'Listen to Book One' },
  drama:     { book: 'Listen to the audio drama', tile: 'Listen now',     one: 'Listen to Book One' },
};
const NAME = { ebook: 'e-book', paperback: 'paperback', hardcover: 'hardcover', audiobook: 'audiobook', immersive: 'immersive audiobook', drama: 'audio drama' };
const COMING = { book: 'See the book at Orb & Ink', one: 'See Book One at Orb & Ink', short: 'See the book', bar: 'See the book' };

const q = (s, r) => (r || document).querySelector(s);
const qa = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
let LIVE = RETAIL;

// cfg: { page: 'landing' | 'book' | 'lost', book: '<slug>' }
export function boot(cfg) {
  cfg = cfg || {};
  const root = document.documentElement;
  const S = {
    page: cfg.page || 'landing',
    book: cfg.book || '',
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    bar: null,
  };
  root.classList.add('js');
  if (S.reduced) root.classList.add('still');
  S.bar = initBar(S);
  initFrame(S);
  initHull(S);
  if (S.page === 'landing') { initCreed(S); initRooms(S); initSeam(S); }
  initReveal(S);
  applyRetail(RETAIL);
  initLight(S);
  return S;
}

/* The frame — the hull's label strip. Fixed once the engine is up; it changes ink over
   vellum, and keeps the rail and the buy control out of the hero, which has its own. */
function initFrame(S) {
  const frame = q('[data-frame]'); if (!frame) return;
  const lights = qa('[data-light]');
  const hero = q('[data-hero]');
  let ticking = false;
  const sync = () => {
    ticking = false;
    const y = 28; // the frame's own centre line
    let onLight = false;
    for (let i = 0; i < lights.length; i++) {
      const r = lights[i].getBoundingClientRect();
      if (r.top <= y && r.bottom > y) { onLight = true; break; }
    }
    frame.classList.toggle('on-light', onLight);
    if (hero) {
      const b = hero.getBoundingClientRect().bottom;
      frame.classList.toggle('past-hero', b < innerHeight * 0.35);
      hero.classList.toggle('away', b < 0); // lamps stop swaying once they are out of sight
    }
  };
  const on = () => { if (!ticking) { ticking = true; requestAnimationFrame(sync); } };
  addEventListener('scroll', on, { passive: true });
  addEventListener('resize', on);
  sync();
}

/* The persistent buy control: the book on screen and the plain verb, one tap from anywhere. */
function initBar(S) {
  const bar = q('[data-bar]'); if (!bar) return null;
  const thumb = q('[data-bar-thumb]', bar), title = q('[data-bar-title]', bar);
  let at = -1, tint = null;
  return {
    set(i, coloured) {
      const b = BOOKS[i]; if (!b) return;
      if (i !== at) {
        at = i;
        bar.setAttribute('data-buy', b.slug);
        if (thumb) thumb.src = 'assets/thumb-' + b.slug + '.jpg';
        if (title) title.textContent = b.title;
        syncBuy(bar);
      }
      if (coloured !== tint) {
        tint = coloured;
        if (coloured) { bar.style.setProperty('--buy-bg', b.bg); bar.style.setProperty('--buy-ink', b.ink); }
        else { bar.style.removeProperty('--buy-bg'); bar.style.removeProperty('--buy-ink'); }
      } else if (coloured) { bar.style.setProperty('--buy-bg', b.bg); bar.style.setProperty('--buy-ink', b.ink); }
    },
  };
}

/* The hull — fixed. Only the rivets on its ribs creep, at a small fraction of the scroll,
   which is all the depth it needs. */
function initHull(S) {
  const hull = q('[data-hull]'); if (!hull || S.reduced) return;
  let ticking = false;
  let hx = 28, hy = 22;
  const sync = () => {
    ticking = false;
    hull.style.setProperty('--creep', (-((scrollY * 0.07) % 96)).toFixed(1) + 'px');
    hull.style.setProperty('--hx', hx.toFixed(1) + '%'); hull.style.setProperty('--hy', hy.toFixed(1) + '%');
  };
  const on = () => { if (!ticking) { ticking = true; requestAnimationFrame(sync); } };
  addEventListener('scroll', on, { passive: true });
  // the metal catches the light where the visitor's hand is
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; hx = e.clientX / innerWidth * 100; hy = e.clientY / innerHeight * 100; on(); }, { passive: true });
  sync();
}

/* The Wheel in three lines — the brass wheel turns as the lines pass; its six worlds stay upright. */
function initCreed(S) {
  const dial = q('[data-dial]'); if (!dial || S.reduced) return;
  const host = dial.closest('section') || dial;
  let ticking = false;
  const sync = () => {
    ticking = false;
    const r = host.getBoundingClientRect(), vh = innerHeight;
    if (r.bottom < -40 || r.top > vh + 40) return;
    const t = clamp((vh - r.top) / (vh + r.height), 0, 1);
    dial.style.setProperty('--rot', (-75 + t * 150).toFixed(2) + 'deg');
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(sync); } }, { passive: true });
  sync();
}

/* The six rooms. The lamp rail and the buy control follow whichever room is being looked at. */
function initRooms(S) {
  const realms = qa('[data-realm]'), seam = q('[data-seam]'), frame = q('[data-frame]'), rail = qa('[data-rail]');
  if (!realms.length || !frame) return;
  let ticking = false, state = '';
  const sync = () => {
    ticking = false;
    const mid = innerHeight * 0.5;
    let at = -1, all = false;
    realms.forEach((el, i) => { const r = el.getBoundingClientRect(); if (r.top - 20 <= mid && r.bottom + 20 > mid) at = i; });
    if (seam) { const r = seam.getBoundingClientRect(); all = r.top <= mid; }
    const s = all ? 'all' : String(at);
    if (s === state) return; state = s;
    rail.forEach((el, i) => el.classList.toggle('is-lit', all || i === (at < 0 ? 0 : at)));
    frame.classList.toggle('all-lit', all);
    frame.style.setProperty('--lamp', all || at < 0 ? '#EFE6D2' : LAMP[at]);
    if (S.bar) { if (!all && at >= 0) S.bar.set(at, true); else S.bar.set(0, false); }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(sync); } }, { passive: true });
  addEventListener('resize', sync);
  sync();
}

/* THE SEAM. As the six bays come up the page their lamps light one after another, first to sixth;
   the same number drives the light in the scene (light.js). Still, they are simply all lit. */
function initSeam(S) {
  const seam = q('[data-seam]'); if (!seam) return;
  const band = q('.seam-band', seam), lamps = qa('.s-lamps li', seam);
  S.seamLit = 1;
  if (S.reduced) { seam.classList.add('still'); return; }
  let ticking = false, n = -1;
  const sync = () => {
    ticking = false;
    const r = band.getBoundingClientRect();
    const t = clamp((innerHeight * 0.92 - r.top) / (innerHeight * 0.6), 0, 1);
    S.seamLit = t;
    const k = Math.floor(t * 7 + 1e-6);
    if (k !== n) { n = k; lamps.forEach((li, i) => li.classList.toggle('is-lit', i < k)); }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(sync); } }, { passive: true });
  addEventListener('resize', sync);
  sync();
}

/* Quiet arrivals for the column sections. Markup is visible by default; the engine arms
   the entrance only when it is certain it can also deliver it. */
function initReveal(S) {
  const items = qa('[data-rv]');
  if (!items.length || S.reduced || !('IntersectionObserver' in window)) return;
  items.forEach((el) => el.classList.add('rv'));
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach((el) => io.observe(el));
}

/* Buying. A primary button always says, in plain words, what it does: with no retail link
   it goes to the book's page at the publisher; with one it buys the best edition there is. */
function best(slug) { const m = LIVE[slug] || {}; for (let i = 0; i < ORDER.length; i++) if (m[ORDER[i]]) return ORDER[i]; return ''; }
function syncBuy(a) {
  const slug = a.getAttribute('data-buy'), kind = a.getAttribute('data-kind') || 'book';
  const verb = q('[data-verb]', a), fmt = best(slug);
  const book = BOOKS.filter((b) => b.slug === slug)[0], title = book ? book.title : 'the book';
  if (fmt) {
    a.href = LIVE[slug][fmt]; a.target = '_blank'; a.rel = 'noopener';
    a.classList.add('is-live');
    const v = VERB[fmt];
    if (verb) verb.textContent = kind === 'one' ? v.one : v.book;
    a.setAttribute('aria-label', (kind === 'one' ? v.one : v.book) + ': ' + title);
    a.setAttribute('data-format', fmt);
  } else {
    a.href = CATALOGUE + slug + '/'; a.removeAttribute('target'); a.removeAttribute('rel');
    a.classList.remove('is-live'); a.removeAttribute('data-format');
    if (verb) verb.textContent = COMING[kind] || COMING.book;
    a.setAttribute('aria-label', 'See ' + title + ' at Orb & Ink');
  }
}
export function applyRetail(map) {
  LIVE = map || RETAIL;
  qa('a[data-buy]').forEach(syncBuy);
  qa('[data-edition]').forEach((tile) => {
    const parts = tile.getAttribute('data-edition').split(':');
    const url = (LIVE[parts[0]] || {})[parts[1]];
    if (!url || tile.classList.contains('is-live')) return;
    const chip = q('.ed-state', tile), a = document.createElement('a');
    const book = BOOKS.filter((b) => b.slug === parts[0])[0];
    a.className = 'ed-buy'; a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = VERB[parts[1]].tile;
    a.setAttribute('aria-label', VERB[parts[1]].book + (book ? ': ' + book.title : ''));
    if (chip) chip.replaceWith(a); else tile.appendChild(a);
    tile.classList.add('is-live');
  });
  qa('[data-eds-note]').forEach((n) => {
    const slug = n.getAttribute('data-eds-note'), m = LIVE[slug] || {};
    const have = ORDER.filter((k) => m[k]);
    if (!have.length) return;
    n.textContent = have.length === Object.keys(m).length ? 'Every edition is on sale.'
      : 'On sale now: ' + have.map((k) => NAME[k]).join(', ') + '. The others are still in the making at Orb & Ink.';
  });
}

/* The light. One small module, loaded only if it can run. There is one WebGL context for the
   whole page; it draws each room off screen and the room's own <canvas> is filled from it, so
   a room scrolls with the page like any picture. A room's painted plate is fetched a little
   before the room arrives, and the room is drawn only while it is on screen and the tab is
   visible. Until then, and if the context is lost or a scene will not build, the still frame
   under the canvas is what the visitor sees. */
function initLight(S) {
  if (S.reduced || !window.WebGLRenderingContext) return;
  const els = qa('canvas[data-scene]'); if (!els.length) return;
  const root = document.documentElement;
  const ptr = [0, 0], ptrS = [0, 0], ptrL = [0, 0];
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; ptr[0] = e.clientX / innerWidth - 0.5; ptr[1] = e.clientY / innerHeight - 0.5; }, { passive: true });
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };

  import('./light.js').then((L) => {
    const E = L.create(); if (!E) return;
    const rooms = els.map((c) => ({ c, name: c.getAttribute('data-scene'), flip: c.hasAttribute('data-flip'), fixS: c.hasAttribute('data-s') ? +c.getAttribute('data-s') : null,
      lampEl: q('.r-lamp svg, .lamp.lit svg', c.parentNode.parentNode), ctx: c.getContext('2d'), near: false, on: false, w: 0, h: 0, cw: 0, ch: 0, d: 1, fx: 0.5, fy: 0.6, bad: false }));
    let Q = 1, slow = 0, lastNow = 0;   // if frames run long on this device, the scenes are drawn smaller, never slower
    const measure = (r) => {
      const cw = r.c.clientWidth, ch = r.c.clientHeight; if (!cw || !ch) return false;
      let d = Math.min(cw < 700 ? 2 : 1.5, window.devicePixelRatio || 1) * Q;
      const cap = cw < 700 ? 0.95e6 : 1.5e6; if (cw * ch * d * d > cap) d = Math.sqrt(cap / (cw * ch));   // a budget, not a boast
      const w = Math.max(2, Math.round(cw * d)), h = Math.max(2, Math.round(ch * d));
      if (w !== r.c.width || h !== r.c.height) { r.c.width = w; r.c.height = h; }
      const cs = getComputedStyle(r.c);
      r.w = w; r.h = h; r.cw = cw; r.ch = ch; r.d = w / cw;
      r.fx = num(cs.getPropertyValue('--fx'), 0.5); r.fy = num(cs.getPropertyValue('--fy'), 0.6); r.zoom = num(cs.getPropertyValue('--zoom'), 1);
      return true;
    };
    const gutOf = () => { const p = document.createElement('div'); p.style.cssText = 'position:absolute;visibility:hidden;width:var(--gut)'; document.body.appendChild(p); const g = p.offsetWidth; p.remove(); return g; };
    let gut = gutOf();
    // the pictures: each plate is fetched once, in the size this screen needs, when a room that
    // uses it comes near; the paint (one square of real impasto) is shared by every room
    const small = Math.min(screen.width, screen.height) <= 500 && innerWidth <= 860;
    const asked = {};
    const fetchTex = (name, file, strip) => {
      if (asked[name]) return; asked[name] = true;
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { E.setTex(name, im, strip); kick(); };
      im.onerror = () => { if (/\.webp$/.test(im.src)) im.src = 'assets/scenes/' + file.replace(/\.webp$/, '.jpg'); };   // no WebP here: the JPEG of the same name
      im.src = 'assets/scenes/' + file;
    };
    // a phone holds a strip of each plate at full height: all it can ever show, at a third of the weight
    const want = (scene) => {
      L.needs(scene).forEach((n) => fetchTex(n, 'plate-' + n + (small ? '-m' : '') + '.webp', small ? L.PLATES[n].m : null));
      if (scene === 'hero') fetchTex('herofg', 'plate-hero-fg' + (small ? '-m' : '') + '.webp', small ? L.PLATES.herofg.m : null);
    };
    const t0 = performance.now();
    let raf = 0, any = false;
    const frame = (now) => {
      raf = 0; if (document.hidden) return;
      if (E.lost) { rooms.forEach((r) => { r.c.classList.remove('on'); r.on = false; }); return; }
      const t = (now - t0) / 1000, vh = innerHeight, dt = now - lastNow; lastNow = now;
      if (dt > 27 && dt < 200) slow += 1; else if (slow > 0) slow -= 0.5;
      if (slow > 40 && Q > 0.56) { Q *= 0.82; slow = 0; rooms.forEach((r) => { r.w = 0; }); }
      ptrS[0] += (ptr[0] - ptrS[0]) * 0.06; ptrS[1] += (ptr[1] - ptrS[1]) * 0.06;
      ptrL[0] += (ptr[0] - ptrL[0]) * 0.012; ptrL[1] += (ptr[1] - ptrL[1]) * 0.012;      // forty-to-one slow, for the Still
      any = false;
      for (let i = 0; i < rooms.length; i++) {
        const r = rooms[i]; if (!r.near || r.bad) continue;
        any = true;
        if (!E.ready(r.name)) continue;
        const b = r.c.getBoundingClientRect();
        if (b.bottom < -40 || b.top > vh + 40) continue;
        if (!r.w && !measure(r)) continue;
        // how far this room has passed: -1 as it comes in at the foot of the window, +1 as it leaves at the head
        let s = clamp(((vh - b.top) / (vh + b.height)) * 2 - 1, -1, 1);
        if (r.fixS !== null) s = r.fixS + s * 0.2;
        const fl = r.flip ? -1 : 1;
        const u = { dpr: r.d, t, s, ptr: [ptrS[0] * fl, ptrS[1]], ptrL: [ptrL[0] * fl, ptrL[1]], fx: r.flip ? 1 - r.fx : r.fx, fy: r.fy, zoom: r.zoom, flip: r.flip ? 1 : 0, gut, bay: (r.cw - 2 * gut) / 6 };
        if (r.lampEl) { const lr = r.lampEl.getBoundingClientRect(); u.lamp = [lr.left + lr.width / 2 - b.left, lr.top + lr.height * 0.5 - b.top, 1]; }
        else u.lamp = [r.cw * r.fx, -r.ch * 0.1, 0];
        if (r.name === 'hero') u.s = clamp(-b.top / Math.max(1, b.height), 0, 1) * 1.5 - 0.8;
        if (r.name === 'seam') u.lit = S.seamLit === undefined ? 1 : S.seamLit;
        if (!E.draw(r.name, r.w, r.h, u)) { r.bad = true; r.c.classList.remove('on'); continue; }
        E.blit(r.ctx, r.w, r.h);
        if (!r.on) { r.on = true; r.c.classList.add('on'); }
      }
      if (any) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); };
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { const r = rooms.filter((x) => x.c === e.target)[0]; if (!r) return; r.near = e.isIntersecting; if (r.near) want(r.name); });
      kick();
    }, { rootMargin: '90% 0px' });
    rooms.forEach((r) => io.observe(r.c));
    document.addEventListener('visibilitychange', kick);
    addEventListener('resize', () => { gut = gutOf(); rooms.forEach((r) => { r.w = 0; }); kick(); });
    fetchTex('paint', 'tex-impasto.jpg');
    // build the rooms that are still below, one at a time, while nothing else is happening
    const later = rooms.map((r) => r.name).filter((n, i, a) => a.indexOf(n) === i);
    const warm = () => { const n = later.shift(); if (!n || E.lost) return; E.program(n); setTimeout(warm, 260); };
    setTimeout(warm, 900);
    root.classList.add('gl');
  }).catch((e) => { console.warn('light: not loaded; the still pictures hold', e); });
}
