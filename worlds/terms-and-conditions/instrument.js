// instrument.js — the shared engine for the Terms & Conditions site.
// The pages are complete without it: every picture is printed in the markup, every button
// is a plain link, the response period reads NINETY (90) DAYS. This file adds the clock,
// the buy slip, the appeal box, the light on the covers, and (after first paint) the press
// that inks the plates (press.js).

/* ── RETAIL ───────────────────────────────────────────────────────────────────
   The one place retail links live. Every value is empty today, so every book shows its
   coming state: the button reads "See the book at Orb & Ink" and goes to that book's page
   in the imprint catalogue, and each edition carries a quiet "Coming" chip.

   Paste a URL into a slot and, for that book, everywhere it is offered:
   - that edition's chip becomes a solid button ("Buy the e-book", "Listen to the audiobook" …);
   - the book's main button takes the plain words for the best edition available, in the
     order below (e-book first), and points at it;
   - the buy slip at the foot of the screen does the same. Never invent a link. */
export const RETAIL = {
  'proof-of-purchase': { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
  'the-class-action': { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '', graphic: '' },
  'as-is-no-returns': { ebook: '', paperback: '', hardcover: '', audiobook: '', drama: '', graphic: '' },
};
const ORDER = ['ebook', 'paperback', 'hardcover', 'audiobook', 'immersive', 'drama', 'graphic'];
const PRIMARY = {
  ebook: 'Buy the e-book', paperback: 'Buy the book', hardcover: 'Buy the book', audiobook: 'Listen to the audiobook',
  immersive: 'Listen to the audiobook', drama: 'Listen to the audio drama', graphic: 'Buy the graphic novel',
};
const TILE = {
  ebook: 'Buy the e-book', paperback: 'Buy the paperback', hardcover: 'Buy the hardcover', audiobook: 'Listen to the audiobook',
  immersive: 'Listen to the immersive edition', drama: 'Listen to the audio drama', graphic: 'Buy the graphic novel',
};

const q = (s, r) => (r || document).querySelector(s);
const qa = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const pad2 = n => (n < 10 ? '0' : '') + n;

export function boot() {
  const root = document.documentElement;
  const S = { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, press: null };
  applyRetail();
  const served = initServed();
  initClock(served);
  initDock();
  initArrival(S);
  initLight(S);
  initAppeal(S);
  initPress(S, root);
  return S;
}

/* Turn a book's coming state into live buttons, edition by edition. With every slot in
   RETAIL empty this changes nothing. */
export function applyRetail(map = RETAIL) {
  Object.keys(map).forEach(slug => {
    const live = ORDER.filter(k => map[slug] && map[slug][k]);
    if (!live.length) return;
    const best = live[0];
    qa('[data-primary="' + slug + '"]').forEach(a => {
      a.href = map[slug][best];
      a.rel = 'noopener';
      a.classList.add('is-live');
      qa('[data-verb]', a).forEach(v => { v.textContent = PRIMARY[best]; });
      qa('[data-verb-short]', a).forEach(v => { v.textContent = PRIMARY[best]; });
    });
    qa('[data-coming="' + slug + '"]').forEach(el => { if (el.dataset.live) el.textContent = el.dataset.live; else el.remove(); });
    qa('[data-editions="' + slug + '"] [data-edition]').forEach(li => {
      const k = li.dataset.edition, url = map[slug][k], chip = q('[data-chip]', li);
      if (!url || !chip) return;
      const a = document.createElement('a');
      a.className = 'ed-btn'; a.href = url; a.rel = 'noopener'; a.textContent = TILE[k];
      chip.replaceWith(a);
      li.classList.add('is-live');
    });
  });
}

/* The ninety-day clock starts when the notice first reaches this screen. It is kept in
   localStorage and nowhere else. When it runs out, an extension is granted. */
function initServed() {
  const KEY = 'tc.served', SPAN = 90 * 864e5, now = Date.now();
  let t = 0, extended = false;
  try { t = +localStorage.getItem(KEY) || 0; } catch (e) { t = 0; }
  if (!t || t > now || now - t >= SPAN) {
    extended = !!t && t <= now;
    t = now;
    try { localStorage.setItem(KEY, String(t)); } catch (e) { /* private mode: the clock still runs for this visit */ }
  }
  return { at: t, deadline: t + SPAN, extended };
}

function initClock(served) {
  const outs = qa('[data-countdown]'), long = qa('[data-countdown-long]');
  const remaining = () => {
    const s = Math.max(0, Math.floor((served.deadline - Date.now()) / 1000));
    return Math.floor(s / 86400) + 'd ' + pad2(Math.floor(s % 86400 / 3600)) + ':' + pad2(Math.floor(s % 3600 / 60)) + ':' + pad2(s % 60);
  };
  const tick = () => {
    const txt = remaining();
    outs.forEach(el => { el.textContent = txt; });
    long.forEach(el => { el.textContent = txt + ' remaining' + (served.extended ? ' (extension granted without prejudice)' : ''); });
  };
  if (outs.length || long.length) { tick(); setInterval(tick, 1000); }
  const el = q('[data-served]');
  if (el) {
    const d = new Date(served.at);
    const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
    el.textContent = pad2(d.getDate()) + ' ' + mon + ' ' + d.getFullYear() + ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
}

/* The buy slip. It waits while the first screen's own button is in view, and steps back
   again when the page's closing buy section arrives, so it never doubles a button or sits
   on the colophon. */
function initDock() {
  const dock = q('[data-dock]');
  if (!dock) return;
  const lead = q('[data-dock-after]'), rest = q('[data-dock-rest]');
  let tick = 0;
  const update = () => {
    tick = 0;
    const past = !lead || lead.getBoundingClientRect().bottom < 0;
    const done = rest && rest.getBoundingClientRect().top < innerHeight * 0.62;
    dock.classList.toggle('is-waiting', !past || !!done);
  };
  const on = () => { if (!tick) tick = requestAnimationFrame(update); };
  addEventListener('scroll', on, { passive: true });
  addEventListener('resize', on);
  update();
}

/* Text is set once as it arrives. Plates are never moved or faded here: the press inks them. */
function initArrival(S) {
  const items = qa('[data-in]');
  if (S.reduced || !('IntersectionObserver' in window)) { items.forEach(el => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    e.target.classList.add('is-in');
  }), { threshold: 0.15, rootMargin: '0px 0px -7% 0px' });
  items.forEach(el => io.observe(el));
}

/* Light that moves with the reader: a sheen that crosses each cover as it crosses the
   screen, and the grass in front of the street coming forward. (The street's own depth is
   the press's work.) */
function initLight(S) {
  if (S.reduced) return;
  const tomes = qa('.tome'), hero = q('[data-hero]'), grass = hero && q('.grass', hero);
  let tick = 0;
  const update = () => {
    tick = 0;
    const vh = innerHeight;
    tomes.forEach(t => {
      const r = t.getBoundingClientRect();
      if (r.bottom < -80 || r.top > vh + 80) return;
      const p = clamp((r.top + r.height / 2) / vh, -0.2, 1.2);
      t.style.setProperty('--sx', (118 - p * 126).toFixed(1) + '%');
    });
    if (hero) {
      const y = clamp(scrollY, 0, hero.offsetHeight);
      if (grass) grass.style.setProperty('--gy', (-y * 0.07).toFixed(1) + 'px');
    }
  };
  const on = () => { if (!tick) tick = requestAnimationFrame(update); };
  addEventListener('scroll', on, { passive: true });
  addEventListener('resize', on);
  update();
}

/* The appeal box in clause 882(c): the one thing on the Notice that can be done. Ticking
   it is received, in red. */
function initAppeal(S) {
  const box = q('[data-appeal]');
  if (!box) return;
  const wrap = box.closest('[data-notice]'), stamp = wrap && q('[data-stamp-gl]', wrap);
  // Without script the box is a plain link to Book One. With it, the first press ticks the
  // box (and is stamped); a second press follows the link.
  box.addEventListener('click', e => {
    if (wrap.classList.contains('is-ticked')) return;
    e.preventDefault();
    wrap.classList.add('is-ticked');
    box.setAttribute('aria-pressed', 'true');
    box.setAttribute('aria-label', 'The appeal box, ticked. Go to Book One');
    setTimeout(() => { if (S.press && stamp) S.press.stamp(stamp); }, S.reduced ? 0 : 330);
  });
  box.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); box.click(); } });
}

/* The press (press.js): imported after first paint. Until it has drawn a plate, or if it
   cannot, the print in the markup is what is shown. */
function initPress(S, root) {
  const need = q('[data-plate],[data-stamp-gl]');
  const giveUp = () => root.classList.remove('wait-gl');
  if (!need) { giveUp(); return; }
  const start = () => import('./press.js').then(m => {
    S.press = m.mountPress({ reduced: S.reduced, onLost: giveUp });
    if (!S.press) giveUp();
  }).catch(e => { console.warn('press: not loaded; the prints stay as printed', e); giveUp(); });
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 500 });
  else setTimeout(start, 120);
}
