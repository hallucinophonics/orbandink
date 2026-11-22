/* app.js — progressive enhancement boot.
   Everything on the page already works without this file:
   real links, prerendered content, working buy buttons.
   This adds: language menu behavior, the shelf's filters, page
   transitions, the opening books and the shader/particle layer. */

import { site } from './data.js';

document.documentElement.classList.add('js');

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fx = { gl: null, lattice: null, stage: null };

/* ---- dev-only font shim ----
   The repo ships without font binaries (run tools/fetch_fonts.py once).
   Until then, previews/localhost pull the same faces from Google Fonts
   so design review sees real typography. This NEVER runs on the
   production domain — the deployed site makes no external requests. */
async function devFontShim() {
  try {
    if (!document.fonts) return;
    const have = await document.fonts.load('16px Unbounded');
    if (have.length) return; // self-hosted subsets present
    const domain = (await site()).domain;
    const h = location.hostname;
    if (h === domain || h === 'www.' + domain) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@400;700'
      + '&family=Playfair+Display:wght@700&family=Manrope:wght@400;500;700'
      + '&family=JetBrains+Mono:wght@400;700&family=Zen+Kaku+Gothic+New:wght@700;900'
      + '&family=Noto+Sans+JP:wght@400;700&family=Shippori+Mincho+B1:wght@700&display=swap';
    document.head.appendChild(l);
    console.info('dev font shim active (local woff2 absent; never runs on ' + domain + ')');
  } catch { /* decorative */ }
}

/* ---- language menu ---- */
function initLangMenu() {
  document.querySelectorAll('details.langs').forEach(d => {
    document.addEventListener('click', e => { if (!d.contains(e.target)) d.open = false; });
    d.addEventListener('keydown', e => { if (e.key === 'Escape') { d.open = false; d.querySelector('summary').focus(); } });
  });
}

/* ---- page transitions: dissolve out, assemble in (≤600ms, skippable) ---- */
let pending = null;
function initTransitions() {
  document.addEventListener('click', e => {
    if (pending) { location.assign(pending); return; } // second click skips
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    let url;
    try { url = new URL(a.href); } catch { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.hash) return;
    if (reduced) return; // plain navigation
    e.preventDefault();
    pending = a.href;
    // into a world: its own picture opens over the screen, then the page turns
    if (a.hasAttribute('data-enter') && fx.stage) {
      fx.stage.enter(a, e).then(() => location.assign(pending));
      return;
    }
    document.documentElement.classList.add('leaving');
    fx.gl && fx.gl.burst();
    fx.lattice && fx.lattice.burst();
    setTimeout(() => location.assign(pending), 400);
  });
  addEventListener('keydown', () => { if (pending) location.assign(pending); });
  addEventListener('pageshow', e => {
    if (e.persisted) {
      document.documentElement.classList.remove('leaving'); pending = null;
      fx.stage && fx.stage.clearEnter();
    }
  });
}

/* ---- the shelf's filters ----
   The controls are prerendered by build.py; this only wires them.
   Within a group, chips widen the selection (audiobook OR drama); across
   groups they narrow it (… AND by this author). The state lives in the
   URL, so a filtered shelf can be linked to — the home page's format
   tiles do exactly that. */
function initFilters() {
  const scope = document.querySelector('[data-filterable]');
  const form = scope && scope.querySelector('.filters');
  if (!form) return;
  const cards = [...scope.querySelectorAll('.grid-books .card')];
  const chips = [...form.querySelectorAll('.chip')];
  const input = form.querySelector('.fsearch input');
  const count = form.querySelector('.fcount');
  const clear = form.querySelector('.fclear');
  const none = scope.querySelector('.fnone');
  const PARAM = { way: 'format', byline: 'author', series: 'series', theme: 'theme' };
  const state = { way: new Set(), byline: new Set(), series: new Set(), theme: new Set() };
  let q = '';

  const list = (card, key) => (card.dataset[key] || '').split(';').filter(Boolean);
  const matches = card => {
    if (state.way.size && !list(card, 'ways').some(w => state.way.has(w))) return false;
    if (state.byline.size && !state.byline.has(card.dataset.byline)) return false;
    if (state.series.size && !state.series.has(card.dataset.series || 'standalone')) return false;
    if (state.theme.size && !list(card, 'themes').some(th => state.theme.has(th))) return false;
    if (q && !(card.dataset.search || '').includes(q)) return false;
    return true;
  };

  function apply(push = true) {
    let n = 0;
    cards.forEach(card => {
      const show = matches(card);
      card.hidden = !show;
      if (show) { n++; card.classList.add('in'); }
    });
    chips.forEach(c => c.setAttribute('aria-pressed',
      state[c.dataset.kind].has(c.dataset.value) ? 'true' : 'false'));
    const active = q || Object.values(state).some(s => s.size);
    count.textContent = n;
    clear.hidden = !active;
    none.hidden = n > 0;
    if (!push) return;
    const p = new URLSearchParams();
    for (const [kind, name] of Object.entries(PARAM))
      if (state[kind].size) p.set(name, [...state[kind]].join('|'));
    if (q) p.set('q', q);
    const qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  chips.forEach(c => c.addEventListener('click', () => {
    const set = state[c.dataset.kind], v = c.dataset.value;
    set.has(v) ? set.delete(v) : set.add(v);
    apply();
  }));
  input.addEventListener('input', () => { q = input.value.trim().toLowerCase(); apply(); });
  clear.addEventListener('click', () => {
    Object.values(state).forEach(s => s.clear());
    q = ''; input.value = '';
    apply();
  });

  const p = new URLSearchParams(location.search);
  for (const [kind, name] of Object.entries(PARAM)) {
    const known = new Set(chips.filter(c => c.dataset.kind === kind).map(c => c.dataset.value));
    (p.get(name) || '').split('|').forEach(v => { if (v && known.has(v)) state[kind].add(v); });
  }
  if (p.get('q')) { q = p.get('q').trim().toLowerCase(); input.value = p.get('q'); }
  const more = form.querySelector('.fmore');
  if (more && (state.series.size || state.theme.size)) more.open = true;
  apply(false);
}

/* ---- the buy bar (book pages with something on sale) ----
   Hidden while the title's own buy button or the editions panel is on
   screen; otherwise it rides the bottom edge so buying is one tap away. */
function initBuyBar() {
  const bar = document.querySelector('[data-buybar]');
  const head = document.querySelector('.book-title-wrap');
  const panel = document.getElementById('buy');
  if (!bar || !head || !('IntersectionObserver' in window)) return;
  bar.hidden = false;
  const seen = new Set();
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => e.isIntersecting ? seen.add(e.target) : seen.delete(e.target));
    bar.classList.toggle('on', seen.size === 0);
  });
  io.observe(head);
  if (panel) io.observe(panel);
}

/* ---- effects layer ---- */
async function initFx() {
  try {
    const gl = await import('./fx/gl.js');
    if (gl.init({ statics: reduced })) {
      fx.gl = gl;
      document.querySelectorAll('.fx-erode').forEach(el => {
        gl.registerErosion(el, el.dataset.accent || cssAccent());
      });
      // the Orb: a layer of the same context, on the home page only
      if (document.querySelector('[data-hero]')) {
        try { (await import('./fx/orb.js')).init(gl); }
        catch (err) { console.warn('the orb stays still:', err); }
      }
    }
  } catch (err) {
    console.warn('fx disabled:', err);
    document.documentElement.classList.add('no-fx');
  }
  try {
    const reveal = await import('./fx/reveal.js');
    reveal.init(fx);
  } catch (err) {
    console.warn('reveal disabled:', err);
    document.documentElement.classList.remove('fx-ready');
  }
  try {
    const rain = await import('./fx/rain.js');
    document.querySelectorAll('[data-rain]').forEach(s => rain.init(s));
    // ambient letterfall: one sparse fixed layer under the inner pages
    // (the home page has the orb and the passage; it does not need it)
    if (!document.querySelector('[data-hero]')) {
      const amb = document.createElement('div');
      amb.className = 'rain-ambient';
      amb.setAttribute('aria-hidden', 'true');
      amb.dataset.glyphs = 'ORB&INK0123·:/—';
      amb.dataset.rainDensity = '0.3';
      document.body.appendChild(amb);
      rain.init(amb);
    }
  } catch (err) {
    console.warn('rain disabled:', err);
  }
}

/* ---- the physical layer: books that open, worlds that light up ---- */
async function initObjects() {
  try {
    if (document.querySelector('[data-book3d]')) (await import('./fx/book3d.js')).init();
  } catch (err) { console.warn('books stay closed:', err); }
  try {
    if (document.querySelector('[data-tint], [data-tint-page]')) (await import('./fx/worlds.js')).init();
  } catch (err) { console.warn('worlds stay unlit:', err); }
  try {
    fx.stage = await import('./fx/stage.js');
    fx.stage.init();
  } catch (err) { console.warn('stage stays plain:', err); }
  try {
    if (document.querySelector('[data-passage]')) (await import('./fx/passage.js')).init();
  } catch (err) { console.warn('the passage stays a row:', err); }
}

const cssAccent = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#D6AE5E';

devFontShim();
initLangMenu();
initTransitions();
initFilters();
initBuyBar();
initObjects();
initFx();
