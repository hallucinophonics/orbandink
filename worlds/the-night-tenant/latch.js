// latch.js — shared turnover engine for The Night Tenant site.
// One law: the page is let to two tenants and is never held by both at once.
// The markup is the day tenant's site, complete, with the night tenant's notes
// already written into it and switched off. This module keeps the site clock,
// sounds the Latch at 20:00 and 08:00, hands the whole page state over as the seam
// crossing the page, turns "coming" into "on sale" from the RETAIL map, and keeps
// the buy control within reach. The light itself (the rooms either side of the seam,
// dust, the street lamp) is light.js, loaded after first paint.
// Nothing essential lives here: with JS off the day side stands as written and
// the night side is one real link away (#night-side, a CSS :target).

/* RETAIL — the one edit that takes an edition from "coming" to "on sale".
   Paste a shop URL against an edition and, on every page that book appears on:
     · that edition's quiet "Coming" chip becomes a solid live button, and
     · the book's main button changes from "See the book at Orb & Ink" to "Buy the e-book",
       "Buy the book" or "Listen to the audiobook", pointing at the best edition on sale
       (first filled of: ebook, paperback, hardcover, audiobook, immersive, drama, graphic).
       This series is produced in five editions (e-book, paperback, hardcover, audiobook,
       drama); immersive and graphic are kept so every series site in the imprint shares
       one map shape.
   While a value is empty nothing dead is shown: the main button goes to the book's page
   in the imprint catalogue instead. */
export const RETAIL = {
  'the-night-tenant':  { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
  'vacant-possession': { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
  'the-third-shift':   { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
};
const ORDER = ['ebook', 'paperback', 'hardcover', 'audiobook', 'immersive', 'drama', 'graphic'];   // best edition first
const EDITION = {
  ebook:     { get: 'Buy the e-book',            main: 'Buy the e-book',            name: 'e-book' },
  paperback: { get: 'Buy the paperback',         main: 'Buy the book',              name: 'paperback' },
  hardcover: { get: 'Buy the hardcover',         main: 'Buy the book',              name: 'hardcover' },
  audiobook: { get: 'Listen to the audiobook',   main: 'Listen to the audiobook',   name: 'audiobook' },
  immersive: { get: 'Listen to the immersive audiobook', main: 'Listen to the audiobook', name: 'immersive audiobook' },
  drama:     { get: 'Listen to the audio drama', main: 'Listen to the audio drama', name: 'audio drama' },
  graphic:   { get: 'Buy the graphic novel',     main: 'Buy the graphic novel',     name: 'graphic novel' },
};

const DAYLEN = 86400, SHIFT = 43200;
const BASE = { day: 8 * 3600, night: 20 * 3600 };        // each tenant's shift starts here
const FIRST = SHIFT - 120;                               // a first visit opens at 19:58:00
const PAPER = { day: '#1B1007', night: '#060B12' };   // the bar's own ground, for the browser chrome
const TURN_MS = 1700;
const HUSH_MS = 520;                                     // the held breath before the seam moves                                    // the seam's crossing; the same figure as the CSS keyframes
// The faces each tenant sets the page in — fetched ahead of the handover so the dissolve never shows a fallback.
const FACES = {
  day: ['400 1em "Source Serif 4"', 'italic 400 1em "Source Serif 4"', '600 1em "Source Serif 4"', '300 1em "IBM Plex Sans"', '400 1em "IBM Plex Sans"', '500 1em "IBM Plex Sans"', '600 1em "IBM Plex Sans"'],
  night: ['300 1em Newsreader', '400 1em Newsreader', 'italic 300 1em Newsreader', 'italic 400 1em Newsreader', '300 1em "IBM Plex Mono"', '400 1em "IBM Plex Mono"', '500 1em "IBM Plex Mono"'],
};

const q = (s, r) => (r || document).querySelector(s);
const qa = (s, r) => Array.from((r || document).querySelectorAll(s));
const pad = n => String(n).padStart(2, '0');
const other = t => (t === 'day' ? 'night' : 'day');
const box = store => ({
  get(k) { try { return store().getItem(k); } catch (e) { return null; } },
  set(k, v) { try { store().setItem(k, v); } catch (e) { /* private mode: the tenancy simply is not remembered */ } },
  del(k) { try { store().removeItem(k); } catch (e) { /* nothing held */ } },
});
const kept = box(() => localStorage);      // which tenant the visitor favours; whether the first handover has happened
const tonight = box(() => sessionStorage); // the clock, carried from page to page

// cfg: { page: 'landing'|'book'|'lost', threshold: css selector of the handover section (landing only) }
export function boot(cfg) {
  cfg = cfg || {};
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const threshold = cfg.threshold ? q(cfg.threshold) : null;
  const theme = q('meta[name="theme-color"]');
  const site = q('.site');
  const S = { tenant: root.dataset.tenant === 'night' ? 'night' : 'day', e: 0, busy: false, sec: -1, saved: 0 };
  let light = null;                                        // light.js, once it has loaded

  // A shared (or no-JS) #night-side / #day-side link was honoured by the head script. Keep it, drop the hash.
  if (/^#(night|day)-side$/.test(location.hash)) {
    kept.set('nt.tenant', S.tenant);
    if (S.tenant === 'night') kept.set('nt.turned', '1');
    history.replaceState(null, '', location.pathname + location.search);
  }
  const startClock = () => {
    const e = parseFloat(tonight.get('nt.e'));
    if (tonight.get('nt.t') === S.tenant && e >= 0 && e < SHIFT) S.e = e;
    else S.e = (S.tenant === 'day' && kept.get('nt.turned') !== '1') ? FIRST : 0;
  };
  startClock();

  /* The clock — one per visit, carried between pages; it stops while nobody is looking. */
  const out = {
    hm: qa('[data-clock="hm"]'), s: qa('[data-clock="s"]'), hms: qa('[data-clock="hms"]'),
    until: qa('[data-until]'),
  };
  const put = (list, text) => list.forEach(el => { if (el.textContent !== text) el.textContent = text; });
  const render = force => {
    const sec = Math.min(Math.floor(S.e), SHIFT - 1);
    if (!force && sec === S.sec) return;
    S.sec = sec;
    const t = (BASE[S.tenant] + sec) % DAYLEN;
    const hm = pad(Math.floor(t / 3600)) + ':' + pad(Math.floor(t % 3600 / 60)), ss = pad(t % 60);
    put(out.hm, hm); put(out.s, ss); put(out.hms, hm + ':' + ss);
    const left = SHIFT - sec;
    put(out.until, left >= 3600
      ? Math.floor(left / 3600) + ':' + pad(Math.floor(left % 3600 / 60)) + ':' + pad(left % 60)
      : pad(Math.floor(left / 60)) + ':' + pad(left % 60));
    // the municipal clock in the street: its hands are this clock
    if (site) {
      site.style.setProperty('--hh', ((t / 3600 % 12) * 30).toFixed(2) + 'deg');
      site.style.setProperty('--mh', ((t % 3600) / 10).toFixed(1) + 'deg');
    }
  };
  const armed = () => !!threshold && S.tenant === 'day' && S.e >= FIRST;   // the last two minutes of the day shift, on the landing page
  const dress = () => { // everything that follows the tenant but is not text
    root.toggleAttribute('data-armed', armed());
    if (theme) theme.content = PAPER[S.tenant];
  };
  const save = () => { tonight.set('nt.e', S.e.toFixed(1)); tonight.set('nt.t', S.tenant); };

  /* On the landing page, reading spends the shift: scrolling toward the handover pulls the
     last two minutes forward, so the clock strikes 20:00:00 as the section arrives. Arriving
     by a jump (it was never in view) stops ten seconds short and lets the clock do the rest. */
  const pull = () => {
    const r = threshold.getBoundingClientRect(), vh = window.innerHeight;
    const trigger = window.scrollY + r.top - vh * 0.42;
    const p = trigger <= 0 ? 1 : Math.min(window.scrollY / trigger, 1);
    const inView = r.top < vh && r.bottom > 0;
    return inView ? p * 120 : Math.min(p * 120, 110);
  };

  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    if (document.hidden || S.busy) { last = now; return; }
    S.e += Math.min((now - last) / 1000, 1.25);
    last = now;
    if (armed()) S.e = Math.max(S.e, FIRST + pull());
    if (S.e >= SHIFT) { handover(other(S.tenant)); return; }
    render();
    if (now - S.saved > 2000) { S.saved = now; save(); }
  };

  /* The turnover log — a line for every time the Latch has sounded this visit. */
  const logEl = q('[data-turnlog]');
  const readLog = () => { try { return JSON.parse(tonight.get('nt.log')) || []; } catch (e) { return []; } };
  const drawLog = () => {
    if (!logEl) return;
    logEl.textContent = '';
    readLog().slice(-4).forEach(to => {
      const li = document.createElement('li'), b = document.createElement('b');
      b.textContent = to === 'night' ? '20:00:00' : '08:00:00';
      li.append(b, to === 'night' ? ' Latch. Day side under. Night side holds.' : ' Latch. Night side under. Day side holds.');
      logEl.appendChild(li);
    });
  };
  const say = q('[data-announce]');

  /* Changing typeface re-flows every paragraph above the reader. Hold their place. */
  const holdPlace = () => {
    let el = null;
    if (threshold) {
      const r = threshold.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.8 && r.bottom > window.innerHeight * 0.2) el = q('[data-hold]', threshold) || threshold;
    }
    if (!el && window.scrollY > 4) {
      [0.5, 0.3, 0.7].forEach(x => {
        let hit = document.elementFromPoint(window.innerWidth * x, window.innerHeight * 0.4);
        const swap = hit && hit.closest('.by-day,.by-night');
        if (swap) hit = swap.parentElement;
        if (hit && hit !== root && hit !== document.body && (!el || hit.offsetHeight < el.offsetHeight)) el = hit;
      });
    }
    if (!el) return () => {};
    const y = el.getBoundingClientRect().top;
    return () => { const d = el.getBoundingClientRect().top - y; if (Math.abs(d) > 0.5) window.scrollBy(0, d); };
  };

  const fontsReady = t => (!document.fonts || !document.fonts.load) ? Promise.resolve() : Promise.race([
    Promise.all(FACES[t].map(f => document.fonts.load(f))).catch(() => {}),
    new Promise(res => setTimeout(res, 700)),
  ]);

  /* What the other tenant wrote appears as ink does. A section is "seen" once it is on screen; a handover
     unsees everything, so the incoming hand writes itself over whatever is in view. */
  const seenOn = qa('[data-seen-on]'), inView = new Set();
  if (seenOn.length && 'IntersectionObserver' in window) {
    root.classList.add('inks');
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) { inView.add(en.target); en.target.classList.add('is-seen'); } else inView.delete(en.target);
    }), { threshold: 0.25 });
    seenOn.forEach(el => io.observe(el));
  }
  const reink = () => {
    seenOn.forEach(el => el.classList.remove('is-seen'));
    requestAnimationFrame(() => inView.forEach(el => el.classList.add('is-seen')));
  };

  /* THE HANDOVER. One state change, applied in one go; the seam crossing the page is only how it is shown. */
  const setTenant = to => {
    const pair = document.activeElement && document.activeElement.closest('[data-latchpair]');
    const keep = holdPlace();
    S.tenant = to; S.e = 0;
    root.dataset.tenant = to;
    dress(); drawLog(); render(true); reink();
    keep();
    if (pair) { const next = q('[data-latch="' + other(to) + '"]', pair); if (next) next.focus({ preventScroll: true }); }
  };
  const handover = to => {
    if (S.busy || to === S.tenant) return;
    S.busy = true;
    kept.set('nt.tenant', to); kept.set('nt.turned', '1');
    tonight.set('nt.log', JSON.stringify(readLog().concat(to).slice(-8)));
    tonight.set('nt.e', '0'); tonight.set('nt.t', to);
    const done = () => {
      delete root.dataset.turning;
      S.busy = false; last = performance.now();
      if (say) say.textContent = to === 'night'
        ? '20:00. The Latch has sounded. The night side now holds this site.'
        : '08:00. The Latch has sounded. The day side now holds this site.';
    };
    if (reduced.matches) { setTenant(to); if (light) light.snap(); done(); return; }   // still happens, instantly, nothing sweeps
    // A held breath: the light in every room on screen sinks for half a second. Then the seam goes.
    root.dataset.hush = to;
    if (light) light.hush(true);
    fontsReady(to);
    setTimeout(() => {
      delete root.dataset.hush;
      if (document.startViewTransition) {
        // The browser holds the old page still and reveals the new one behind the travelling seam (site.css).
        const apply = () => { root.dataset.turning = to; setTenant(to); if (light) light.snap(); };
        let vt = null;
        try { vt = document.startViewTransition(() => fontsReady(to).then(apply)); } catch (e) { vt = null; }
        if (vt) {
          vt.ready.catch(() => {}); vt.updateCallbackDone.catch(() => { if (S.tenant !== to) setTenant(to); });
          vt.finished.then(done, done);
          return;
        }
      }
      // No view transitions: the canvases carry the seam across themselves, the band of light rides it,
      // and the words change hands as it passes the middle of the day's half.
      root.dataset.turning = to;
      if (light) light.sweep(to, TURN_MS);
      setTimeout(() => setTenant(to), TURN_MS * (to === 'night' ? .62 : .42));
      setTimeout(done, TURN_MS + 40);
    }, HUSH_MS);
  };

  /* The persistent control. In the markup these are real links to #night-side / #day-side. */
  qa('[data-latch]').forEach(a => {
    a.setAttribute('role', 'button');
    a.addEventListener('click', ev => { ev.preventDefault(); handover(a.dataset.latch); });
    a.addEventListener('keydown', ev => { if (ev.key === ' ') { ev.preventDefault(); handover(a.dataset.latch); } });
  });
  /* Colophon: put the clock back to 19:58 and forget which tenant was favoured. */
  qa('[data-reset]').forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault();
    ['nt.tenant', 'nt.turned'].forEach(k => kept.del(k));
    ['nt.e', 'nt.t', 'nt.log'].forEach(k => tonight.del(k));
    try { history.scrollRestoration = 'manual'; } catch (e) { /* older browsers restore the scroll; harmless */ }
    S.busy = true;                                             // nothing is saved on the way out
    location.href = a.getAttribute('href').split('#')[0];
  }));

  /* The persistent buy control: on screen only once the first screen has gone and no buy button is in sight. */
  const dock = q('[data-dock]');
  if (dock && 'IntersectionObserver' in window) {
    const seen = new Set(), zones = new Set();
    const show = () => root.toggleAttribute('data-dock', seen.size === 0 && zones.size === 0);
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) seen.add(en.target); else seen.delete(en.target); });
      show();
    }, { rootMargin: '-52px 0px 0px 0px' });
    qa('.buy, .foot').forEach(b => { if (!dock.contains(b)) io.observe(b); });
    // the sections that are about the books carry their own buttons: the dock stays out of their reading text
    const zo = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) zones.add(en.target); else zones.delete(en.target); });
      show();
    }, { rootMargin: '-45% 0px -8% 0px' });
    qa('[data-nodock]').forEach(z => zo.observe(z));
  }

  /* A cover leans a little toward the pointer, about its own seam, so its split stays on the room's. */
  if (!reduced.matches && matchMedia('(hover:hover)').matches) qa('.bk').forEach(panel => {
    const bk = q('.bk-book', panel); if (!bk) return;
    panel.addEventListener('pointermove', ev => { const r = bk.getBoundingClientRect();
      bk.style.setProperty('--ry', (Math.max(-1, Math.min(1, (ev.clientX - r.left - r.width / 2) / (window.innerWidth * .35))) * 9).toFixed(2) + 'deg');
      bk.style.setProperty('--rx', (Math.max(-1, Math.min(1, (ev.clientY - r.top - r.height / 2) / r.height)) * -4).toFixed(2) + 'deg'); }, { passive: true });
    panel.addEventListener('pointerleave', () => { bk.style.setProperty('--ry', '0deg'); bk.style.setProperty('--rx', '0deg'); });
  });

  dress(); drawLog(); render(true);
  setInterval(tick, 200);
  if (threshold) {
    let raf = 0;
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; tick(); }); };
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  window.addEventListener('pagehide', () => { if (!S.busy) save(); });
  window.addEventListener('pageshow', ev => {                  // back/forward cache: another page may have turned over since
    if (!ev.persisted) return;
    const t = kept.get('nt.tenant') === 'night' ? 'night' : 'day';
    if (t !== S.tenant) { S.tenant = t; root.dataset.tenant = t; }
    startClock(); dress(); drawLog(); render(true); last = performance.now();
  });
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 400));
  idle(() => fontsReady(other(S.tenant)));
  /* The light comes up after first paint, over pictures that are already there. */
  if (q('[data-pic]')) idle(() => import('./light.js')
    .then(m => { light = m.mountLight(() => ({ tenant: S.tenant, e: S.e, shift: SHIFT })); })
    .catch(err => console.warn('light: not loaded, the pictures in the markup stand', err)));

  applyRetail(RETAIL);
  return S;
}

/* Turn "coming" into "on sale" wherever a retail URL has been filled in.
   Markup contract:
     a[data-buy="slug"]          a book's button: [data-buy-verb] is the plain-words line,
                                 [data-buy-sub] the optional second line, data-sub its fixed prefix
     [data-editions="slug"]      an editions block; each tile is [data-format] holding a [data-state]
     [data-issued="text"][data-for="slug"]   a status line that changes once anything is on sale */
export function applyRetail(map) {
  map = map || {};
  const best = slug => ORDER.find(k => map[slug] && map[slug][k]);
  qa('a[data-buy]').forEach(a => {
    const k = best(a.dataset.buy);
    if (!k) return;
    const ed = EDITION[k], verb = q('[data-buy-verb]', a), sub = q('[data-buy-sub]', a);
    a.href = map[a.dataset.buy][k]; a.rel = 'noopener';
    a.classList.add('is-live');
    if (verb) verb.textContent = ed.main;
    if (sub && a.dataset.sub) sub.textContent = a.dataset.sub;
  });
  qa('[data-editions]').forEach(block => {
    const slug = block.dataset.editions;
    qa('[data-format]', block).forEach(tile => {
      const k = tile.dataset.format, url = map[slug] && map[slug][k], state = q('[data-state]', tile);
      if (!url || !state || !EDITION[k]) return;
      const a = document.createElement('a'), t = document.createElement('span'), v = document.createElement('span');
      a.className = 'buy is-live'; a.href = url; a.rel = 'noopener';
      t.className = 'buy-t'; v.className = 'buy-verb'; v.textContent = EDITION[k].get;
      t.appendChild(v); a.appendChild(t);
      state.textContent = ''; state.appendChild(a);
      tile.classList.add('is-live');
    });
  });
  qa('[data-issued][data-for]').forEach(el => { if (best(el.dataset.for)) el.textContent = el.dataset.issued; });
}
