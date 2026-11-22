// menu.js — shared behaviours for The Universal Menu site.
// One law: this is table service. Nothing is dropped in front of the guest; everything
// is plated, set down, and left. Every effect improves markup that already reads, and
// already sells, without it; prefers-reduced-motion is served the settled plate.

/* ── RETAIL ─────────────────────────────────────────────────────────────────────────────
   The one edit on release day. Paste a store URL into a slot and that edition goes on sale
   everywhere at once:
     · its row or tile in the book page's editions block becomes a solid red button;
     · every primary button for that book (hero, tasting menu, the pass at the foot of the
       landing page, the end of its own page, "your check") points at the FIRST live edition
       in the order below and says so in plain words ("Buy the e-book", "Listen to the
       audiobook" …), in the same red.
   Leave a slot empty and nothing dead is shown: the edition wears a quiet "Coming" chip and
   the book's primary button reads "See the book at Orb & Ink" and goes to its page in the
   imprint's catalogue (IMPRINT below). No link is ever invented.
   The pages' own markup already shows today's state, so they read correctly without this
   file; when you fill a slot, also update that book page's JSON-LD "offers". */
export const RETAIL = {
  'the-aperitif':         { ebook: 'https://www.amazon.com/dp/B0HFDPP6F4', paperback: 'https://www.amazon.com/dp/1919140611', hardcover: 'https://www.amazon.com/dp/191914062X', audiobook: '', immersive: '', drama: '', graphic: '' },
  'the-recipe-rebellion': { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
  'past-expiration-date': { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
};
const IMPRINT = slug => 'https://orbandink.co.uk/en/books/' + slug + '/';
const IMPRINT_VERB = 'See the book at\u00a0Orb\u00a0&\u00a0Ink';  // breaks, if it must, before "at"
// key, the plain verb a stranger understands; the order is the order of preference for a primary button
const EDITIONS = [
  ['ebook', 'Buy the e-book'], ['paperback', 'Buy the paperback'], ['hardcover', 'Buy the hardcover'],
  ['audiobook', 'Listen to the audiobook'], ['immersive', 'Listen to the immersive audiobook'],
  ['drama', 'Listen to the audio drama'], ['graphic', 'See the graphic novel'],
];

// ── A buy button opens the reader's own Amazon store ───────────────────────────────────
// RETAIL holds amazon.com links (they work for everyone, and in the no-script markup). On
// load each plain https://www.amazon.com/dp/<ID> link is pointed at the store of the country
// the reader is in (amazon.co.uk in Britain, amazon.de in Germany …), read from the device's
// time zone: no request is made, nothing is stored, and it stays a direct Amazon link, so a
// phone still opens it in the Amazon app. STORES lists only stores where every edition on
// sale was opened and checked by hand (2026-11-22); anywhere else the amazon.com link stays.
// To keep one link on amazon.com for everybody, give it a query string (…/dp/<ID>?th=1).
// Same table and rule as orbandink/assets/js/local-store.js and the other series site
// (calorate-site/thermo.js, universal-menu-site/menu.js): change all three together.
// store → the time zones of the countries that shop there; a name ending in "/" is a prefix
const STORES = {
  'co.uk': 'Europe/London Europe/Belfast Europe/Jersey Europe/Guernsey Europe/Isle_of_Man Europe/Dublin GB Eire',
  'de': 'Europe/Berlin Europe/Busingen Europe/Vienna Europe/Zurich Europe/Vaduz',
  'fr': 'Europe/Paris Europe/Monaco',
  'it': 'Europe/Rome Europe/San_Marino Europe/Vatican',
  'es': 'Europe/Madrid Africa/Ceuta Atlantic/Canary',
  'nl': 'Europe/Amsterdam',
  'co.jp': 'Asia/Tokyo Japan',
  'com.au': 'Australia/ Pacific/Auckland Pacific/Chatham NZ',
  'ca': 'Canada/ America/Toronto America/Montreal America/Vancouver America/Edmonton America/Winnipeg '
    + 'America/Regina America/Halifax America/Moncton America/St_Johns America/Whitehorse '
    + 'America/Yellowknife America/Iqaluit',
};
let storeFound; // undefined: not worked out yet · '': stay on amazon.com
function storeHere() {
  if (storeFound !== undefined) return storeFound;
  storeFound = '';
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    for (const store of Object.keys(STORES)) {
      if (STORES[store].split(' ').some((z) => (z.endsWith('/') ? zone.startsWith(z) : zone === z))) { storeFound = store; break; }
    }
  } catch (e) { /* an old browser: amazon.com */ }
  return storeFound;
}
const PLAIN_AMAZON = /^https:\/\/www\.amazon\.com\/dp\/([A-Z0-9]{10})\/?$/;
function localAmazon(url) {
  const m = PLAIN_AMAZON.exec(url || '');
  const store = m && storeHere();
  return store ? 'https://www.amazon.' + store + '/dp/' + m[1] : url;
}

const EASE = 'cubic-bezier(.2,.7,.2,1)';
const q = (s, r) => (r || document).querySelector(s);
const qa = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

// cfg: { page: 'landing' | 'book' }
export function boot(cfg) {
  cfg = cfg || {};
  const root = document.documentElement;
  const S = {
    landing: cfg.page === 'landing',
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    heroP: 0, spoil: cfg.page === 'landing' ? 0 : .3, tables: [],
  };
  S.motion = !S.reduced;
  root.classList.add('js');
  applyRetail(RETAIL);
  initReveal(S);
  initMercy(S);
  initCheck(S);
  if (S.landing) initEntry(S);
  initScroll(S);
  initGL(S);
  return S;
}

/* Retail — see the map at the top of this file. */
export function applyRetail(map) {
  qa('a[data-buy]').forEach(a => {
    const slug = a.dataset.buy, r = map[slug] || {};
    const live = EDITIONS.filter(e => r[e[0]])[0];
    const verb = q('.btn-verb', a), sub = q('.btn-sub', a);
    a.classList.toggle('btn-live', !!live);
    a.classList.toggle('btn-imprint', !live);
    a.href = live ? localAmazon(r[live[0]]) : IMPRINT(slug);
    if (verb) verb.textContent = live ? live[1] : IMPRINT_VERB;
    if (sub) {
      if (!sub.dataset.subAsIs) sub.dataset.subAsIs = sub.textContent;
      const alt = live ? sub.dataset.subLive : sub.dataset.subComing;
      sub.textContent = alt || sub.dataset.subAsIs;
    }
  });
  qa('[data-edition]').forEach(el => {
    const p = el.dataset.edition.split(':'), url = (map[p[0]] || {})[p[1]];
    const slot = q('[data-ed-slot]', el), ed = EDITIONS.filter(e => e[0] === p[1])[0];
    if (!slot || !ed) return;
    el.classList.toggle('is-live', !!url);
    slot.textContent = '';
    if (url) {
      const a = document.createElement('a'), v = document.createElement('span');
      a.className = 'btn btn-live btn-sm'; a.href = localAmazon(url); a.target = '_blank'; a.rel = 'noopener';
      v.className = 'btn-verb'; v.textContent = ed[1]; a.appendChild(v); slot.appendChild(a);
    } else {
      const c = document.createElement('span'); c.className = 'chip'; c.textContent = 'Coming'; slot.appendChild(c);
    }
  });
  // the line under the editions that sends you to the imprint for everything not yet on sale
  qa('[data-ed-more]').forEach(el => {
    const r = map[el.dataset.edMore] || {};
    el.hidden = EDITIONS.every(e => r[e[0]]);
  });
}

/* The serving motion — each course is set down as it reaches the table. */
function initReveal(S) {
  const items = qa('[data-serve],[data-rule]');
  const serve = el => { el.classList.add('is-served'); qa('[data-stamp]', el).forEach(st => st.classList.add('is-served')); };
  if (!S.motion || !('IntersectionObserver' in window)) { items.forEach(serve); qa('[data-stamp]').forEach(st => st.classList.add('is-served')); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { serve(e.target); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  items.forEach(el => io.observe(el));
}

/* The Mercy Rendering — the courtesy word types itself back into the raw one.
   Without JS the <noscript> rule on each page prints both readings instead. */
function initMercy(S) {
  qa('[data-mercy]').forEach(btn => {
    const courtesy = btn.textContent, raw = btn.dataset.raw;
    btn.setAttribute('aria-label', courtesy + ' (rendered from ' + raw + ')');
    const restore = () => { clearInterval(btn._t); clearTimeout(btn._d); btn._on = false; btn.textContent = courtesy; btn.classList.remove('is-raw'); btn.style.color = ''; };
    const flip = () => {
      if (btn._on) return;
      btn._on = true; btn._at = performance.now(); btn.classList.add('is-raw'); btn.style.color = 'var(--verdict)';
      if (!S.motion) { btn.textContent = raw; return; }
      let i = 0; btn.textContent = raw.slice(0, 1);
      clearInterval(btn._t);
      btn._t = setInterval(() => {
        i++; btn.textContent = raw.slice(0, i + 1);
        if (i + 1 >= raw.length) { clearInterval(btn._t); btn._d = setTimeout(() => { if (btn._on) btn.style.color = 'var(--ink)'; }, 280); }
      }, 34);
    };
    btn.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') flip(); });
    btn.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') restore(); });
    btn.addEventListener('focus', flip);
    btn.addEventListener('blur', restore);
    // a tap that has just flipped the word (through focus or hover) must not flip it straight back
    btn.addEventListener('click', e => { e.preventDefault(); if (performance.now() - (btn._at || 0) < 450) return; if (btn._on) restore(); else flip(); });
    // one word shows the guest how it is done, once, as it arrives
    if (btn.hasAttribute('data-demo') && S.motion && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(en => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        setTimeout(() => { if (btn._on) return; flip(); setTimeout(() => { if (document.activeElement !== btn && !btn.matches(':hover')) restore(); }, 2100); }, 900);
      }, { threshold: 1 });
      io.observe(btn);
    }
  });
}

/* Your check — one line that stays on the table once the first screen's button has gone,
   and steps aside while the page's own closing buttons are in view. */
function initCheck(S) {
  const bar = q('[data-check]');
  if (!bar || !('IntersectionObserver' in window)) return;
  const lead = q('.hero-cta .btn, .book-hero .btn'), tail = q('[data-pass], .seat');
  let past = false, atTail = false;
  const set = () => bar.classList.toggle('is-on', past && !atTail);
  if (lead) new IntersectionObserver(en => { past = !en[0].isIntersecting && en[0].boundingClientRect.top < 0; set(); }, { threshold: 0 }).observe(lead);
  if (tail) new IntersectionObserver(en => { atTail = en[0].isIntersecting; set(); }, { threshold: 0, rootMargin: '0px 0px -18% 0px' }).observe(tail);
}

/* Earth's file types its last line when the entry scrolls into view. */
function initEntry(S) {
  const el = q('[data-disposition]');
  if (!el || !S.motion || !('IntersectionObserver' in window)) return;
  const full = el.textContent;
  el.textContent = '';
  const io = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    let i = 0;
    const t = setInterval(() => { i++; el.textContent = full.slice(0, i); if (i >= full.length) clearInterval(t); }, 55);
  }, { threshold: 0.6 });
  io.observe(el);
}

/* Scroll lowers the cloche, brings the three lids of the amuse-bouche down in turn, runs the
   service down the long table, turns the third plate, brings the lid down over Loomis. */
function initScroll(S) {
  const hero = q('[data-hero]'), stage = q('.hero-stage'), pending = q('[data-hero-pending]');
  const spoilEl = q('[data-spoil-section]'), diner = q('[data-diner]'), lid = q('[data-diner-lid]');
  const flight = q('[data-flight]'), banquet = q('[data-banquet]'), court = q('[data-setting="court"]');
  const lights = qa('[data-light]');
  S.turn = 0; S.flightP = 0; S.banquetP = 0; S.courtP = .3;
  let tick = 0;
  const run = () => {
    tick = 0;
    const vh = window.innerHeight || 1;
    if (hero && stage) {
      const r = hero.getBoundingClientRect();
      // Safari can run this before the tall hero has its height: with no travel yet, the lid stays up
      const travel = r.height - stage.offsetHeight;
      S.heroP = travel > 1 ? clamp(-r.top / travel, 0, 1) : 0;
      if (pending) pending.classList.toggle('is-on', S.heroP > .9);
    }
    if (spoilEl) {
      const r = spoilEl.getBoundingClientRect();
      S.spoil = clamp((vh * .92 - r.top) / (vh * .8), 0, 1);
    } else if (!S.landing) {
      const max = (document.documentElement.scrollHeight - vh) || 1;
      S.spoil = clamp(.28 + (window.scrollY / max) * 1.1, 0, 1);
    }
    if (flight) {
      const r = flight.getBoundingClientRect();
      S.turn = ((r.top + r.height / 2) / vh - .5) * .9;
      S.flightP = clamp((vh * .94 - r.top) / (vh * .62), 0, 1);
    }
    if (banquet) { const r = banquet.getBoundingClientRect(); S.banquetP = clamp((vh - r.top) / (vh + r.height), 0, 1); }
    if (court) { const r = court.getBoundingClientRect(); S.courtP = clamp((vh - r.top) / (vh + r.height), 0, 1); }
    if (diner && lid && S.motion) {
      const r = diner.getBoundingClientRect();
      const p = clamp((vh - r.top) / (vh + r.height), 0, 1);
      lid.style.transform = 'translate3d(0,' + ((p - .5) * r.height * .16).toFixed(1) + 'px,0)';
    }
    // the light from the windows slides a little over the cloth as the page moves
    if (S.motion) lights.forEach(el => {
      const r = el.parentElement.getBoundingClientRect();
      const p = clamp((vh - r.top) / (vh + r.height), 0, 1);
      el.style.transform = 'translate3d(' + ((p - .5) * 7).toFixed(2) + '%,' + ((p - .5) * -5).toFixed(2) + '%,0)';
    });
  };
  const onScroll = () => { if (!tick) tick = requestAnimationFrame(run); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  // measure again once the page has really laid out (Safari lays out later than the first call)
  window.addEventListener('load', onScroll);
  window.addEventListener('pageshow', onScroll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onScroll);
  if ('ResizeObserver' in window && hero) new ResizeObserver(onScroll).observe(hero);
  run();
}

/* The shaders come up after first paint, over markup that already shows the same things as
   stills. One WebGL context serves the whole page (see menu-gl.js). */
function initGL(S) {
  const root = document.documentElement;
  if (!qa('canvas').length) return;
  const hex = getComputedStyle(root.querySelector('body')).getPropertyValue('--ground').trim() || '#F5F0E6';
  const ground = /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) : [.961, .941, .902];
  const ease = x => x * x * (3 - 2 * x);
  const start = () => import('./menu-gl.js').then(m => {
    const vh = () => window.innerHeight || 1;
    const mid = el => { const r = el.getBoundingClientRect(); return ((r.top + r.height / 2) / vh() - .5); };
    const hc = q('[data-hero-canvas]');
    if (hc) {
      const ok = m.dishGL(hc, {
        dishes: [{ box: q('[data-hero-object]'), earth: true }], host: q('.hero-stage'),
        getScroll: () => S.heroP, fade: [0, .08, 0, 0], reduced: S.reduced, ground,
        crease: [.47, .26, 4, 4], window: [.30, .50, .075], getSlide: () => S.heroP * 1.2,
      });
      root.classList.add(ok ? 'gl-hero' : 'no-gl');
    }
    // the amuse-bouche: three lids, brought down one after another as the section arrives
    const fc = q('[data-flight-canvas]');
    if (fc) {
      const turns = [-.62, .05, .7];
      const ok = m.dishGL(fc, {
        dishes: qa('[data-dish]', q('[data-flight]')).map((box, i) => ({
          box, turn: turns[i], lid: () => .40 + .60 * ease(clamp(S.flightP * 2.1 - i * .42, 0, 1)), lidStill: 1,
        })),
        host: q('[data-flight]'), getTurn: () => S.turn, fade: [.07, .10, .07, .10], reduced: S.reduced, ground,
        crease: [.5, .30, 4, 4], window: [.16, .62, .07], getSlide: () => S.flightP,
      });
      if (ok) root.classList.add('gl-flight');
    }
    // the long table
    qa('[data-banquet-canvas]').forEach(bc => {
      const host = bc.closest('[data-banquet]');
      const d = host.dataset;
      const ok = m.banquetGL(bc, {
        world: d.banquet || 'sunset', ships: d.ships == null ? 3 : +d.ships, beam: d.beam == null ? 1 : +d.beam, film: +(d.film || 0),
        getP: () => { const r = host.getBoundingClientRect(); return clamp((vh() - r.top) / (vh() + r.height), 0, 1); },
        host, reduced: S.reduced, onReady: () => host.classList.add('gl-on'),
      });
      if (!ok) host.classList.add('no-gl');
    });
    // each course: its plate, its lid, and the menu card standing at it
    qa('[data-setting]').forEach(t => {
      const world = t.dataset.setting, card = q('[data-card]', t);
      const spec = { box: q('[data-dish]', t), card, world };
      if (world === 'sunset') { spec.lid = 1; spec.steam = 1; }
      if (world === 'court') { spec.key = true; spec.lid = () => .10 + .62 * ease(clamp((S.landing ? S.courtP : .5 + window.scrollY / vh()) * 1.7 - .35, 0, 1)); spec.lidStill = .42; }
      if (world === 'amber') { spec.lid = 1; spec.film = () => S.spoil; }
      const g = m.dishGL(q('canvas', t), {
        dishes: [spec], host: t, fade: [.10, .10, .10, .10], reduced: S.reduced, ground,
        getTurn: () => mid(t) * .7, getSheen: () => mid(t) * -1.5,
        crease: [.56, .33, 4, 4], window: [.34, .56, .08], getSlide: () => mid(t) * 1.6,
        onReady: () => t.classList.add('gl-on'),
      });
      if (!g) return;
      // the lamp leans in on whatever you are about to order
      const zone = t.closest('[data-lamp]') || t;
      const on = () => g.glow(0, 1), off = () => g.glow(0, 0);
      zone.addEventListener('pointerenter', on); zone.addEventListener('pointerleave', off);
      zone.addEventListener('focusin', on); zone.addEventListener('focusout', off);
    });
    // the pass, and the seat at the end of a book's page: the cards standing under the lamp
    qa('[data-pass],[data-seat]').forEach(t => {
      const cards = qa('[data-card]', t);
      const g = m.dishGL(q('canvas', t), {
        dishes: cards.map(card => ({ card })), host: t, fade: [.06, .08, .06, .10], reduced: S.reduced, ground,
        getSheen: () => mid(t) * -1.5, crease: [.5, .36, 4, 4], window: [.22, .60, .08], getSlide: () => mid(t) * 1.6,
        onReady: () => t.classList.add('gl-on'),
      });
      if (!g) return;
      cards.forEach((card, i) => {
        const zone = card.closest('[data-lamp]') || t;
        const on = () => g.glow(i, 1), off = () => g.glow(i, 0);
        zone.addEventListener('pointerenter', on); zone.addEventListener('pointerleave', off);
        zone.addEventListener('focusin', on); zone.addEventListener('focusout', off);
      });
    });
    const dc = q('[data-diner-canvas]');
    if (dc) {
      const neon = () => { const p = (performance.now() / 5500) % 1; return (p >= .20 && p < .22) || (p >= .55 && p < .57) ? .38 : (p >= .84 ? .66 : 1); };
      const ok = m.dinerGL(dc, { lid: q('[data-diner-lid]'), horizon: q('[data-diner-horizon]'), lot: q('[data-diner-shore]'), sign: q('[data-diner-sign]'), getNeon: S.reduced ? null : neon, reduced: S.reduced });
      if (ok) root.classList.add('gl-diner');
    }
    const sc = q('[data-spoil-canvas]');
    if (sc) {
      const ok = m.spoilGL(sc, { getSpread: () => S.spoil, mask: [0, 0], reduced: S.reduced });
      if (ok) sc.style.opacity = '1';
    }
  }).catch(err => { console.warn('[menu-gl] load failed', err); root.classList.add('no-gl'); });
  // Soon after first paint: the type, the cloth and every image are already there.
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 500 });
  else setTimeout(start, 150);
}
