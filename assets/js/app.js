/* app.js — progressive enhancement boot.
   Everything on the page already works without this file:
   real links, prerendered content, working buy buttons.
   This adds: language menu behavior, catalog filters (CSV-driven),
   page transitions, and the shader/particle layer. */

import { getLang, i18nReady, t, books, themeKey, site } from './data.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fx = { gl: null, lattice: null };

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
    document.documentElement.classList.add('leaving');
    fx.gl && fx.gl.burst();
    fx.lattice && fx.lattice.burst();
    setTimeout(() => location.assign(pending), 400);
  });
  addEventListener('keydown', () => { if (pending) location.assign(pending); });
  addEventListener('pageshow', e => {
    if (e.persisted) { document.documentElement.classList.remove('leaving'); pending = null; }
  });
}

/* ---- catalog filters (built at runtime from the CSVs) ---- */
async function initFilters() {
  const grid = document.querySelector('[data-filterable] .grid-books');
  const nav = document.querySelector('nav.filters');
  if (!grid || !nav) return;
  await i18nReady();
  const lang = getLang();
  const all = await books(lang);
  const series = [...new Set(all.map(b => b.series).filter(Boolean))];
  const themes = [...new Set(all.flatMap(b => b.themes))];
  const cards = [...grid.querySelectorAll('.card')];

  const mk = (label, kind, value) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = label;
    b.setAttribute('aria-pressed', kind === 'all' ? 'true' : 'false');
    b.dataset.kind = kind; b.dataset.value = value || '';
    b.addEventListener('click', () => apply(b));
    return b;
  };
  const apply = btn => {
    nav.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === btn ? 'true' : 'false'));
    const kind = btn.dataset.kind, value = btn.dataset.value || '';
    cards.forEach(card => {
      const show = kind === 'all'
        || (kind === 'series' && (card.dataset.series || '') === value)
        || (kind === 'theme' && (card.dataset.themes || '').split(';').includes(value));
      card.hidden = !show;
    });
  };

  nav.append(mk(t('filter.all', {}, lang), 'all'));
  if (series.length) {
    const s1 = document.createElement('span'); s1.className = 'sep'; s1.textContent = '//'; s1.setAttribute('aria-hidden', 'true');
    nav.append(s1);
    series.forEach(s => nav.append(mk(s, 'series', s)));
    if (all.some(b => !b.series)) nav.append(mk(t('book.standalone', {}, lang), 'series', ''));
  }
  if (themes.length) {
    const s2 = document.createElement('span'); s2.className = 'sep'; s2.textContent = '//'; s2.setAttribute('aria-hidden', 'true');
    nav.append(s2);
    themes.forEach(th => nav.append(mk(t(themeKey(th), {}, lang), 'theme', th)));
  }
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
      document.querySelectorAll('.cover-box[data-fx]').forEach(box => {
        gl.registerCover(box, box.dataset.accent || cssAccent(), box.dataset.book);
      });
      document.querySelectorAll('.cover-reflect').forEach(r => {
        const box = r.parentElement && r.parentElement.querySelector('.cover-box');
        if (box) gl.registerMirror(r, box);
      });
    }
  } catch (err) {
    console.warn('fx disabled:', err);
    document.documentElement.classList.add('no-fx');
  }
  try {
    const hero = document.querySelector('.hero');
    if (hero && hero.querySelector('.hero-word[data-words]')) {
      const lattice = await import('./fx/lattice.js');
      fx.lattice = lattice.init(hero);
    }
  } catch (err) {
    console.warn('lattice disabled:', err);
  }
  try {
    const reveal = await import('./fx/reveal.js');
    reveal.init(fx);
  } catch (err) {
    console.warn('reveal disabled:', err);
    document.documentElement.classList.remove('fx-ready');
  }
  try {
    const boxes = document.querySelectorAll('.cover-box[data-fx]');
    if (boxes.length) {
      const ct = await import('./fx/covertitle.js');
      boxes.forEach(box => ct.init(box));
    }
  } catch (err) {
    console.warn('cover titles disabled:', err);
  }
  try {
    const rainSecs = document.querySelectorAll('[data-rain]');
    if (rainSecs.length) {
      const rain = await import('./fx/rain.js');
      rainSecs.forEach(s => rain.init(s));
    }
  } catch (err) {
    console.warn('rain disabled:', err);
  }
}

const cssAccent = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#D9A05B';

devFontShim();
initLangMenu();
initTransitions();
initFilters();
initFx();
