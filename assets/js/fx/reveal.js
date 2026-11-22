/* reveal.js — the editorial motion layer.
   Scroll-reveal choreography (staggered), text decode-in for mono
   labels, hover decode for card titles, slow parallax on the giant
   section numerals, and a single-frame phase glitch when an erosion
   title locks into view. Everything degrades: no JS → all visible,
   reduced motion → designed stillness. */

import * as sched from './scheduler.js';

const POOL = '01:/·—×+';

export function decode(el, dur = 420) {
  if (el.dataset.decoding) return;
  el.dataset.decoding = '1';
  const orig = el.dataset.orig || (el.dataset.orig = el.textContent);
  /* The scramble glyphs have different advance widths than the real letters,
     so a wrapping title can flicker between line counts mid-animation and
     shove every section below it. Lock the box to its settled size for the
     duration: the text ends where it began, so the lock releases invisibly. */
  const lock = el.getBoundingClientRect();
  el.style.height = lock.height + 'px';
  el.style.overflow = 'hidden';
  const start = performance.now();
  const n = orig.length;
  const frame = now => {
    const p = Math.min(1, (now - start) / dur);
    const solid = Math.floor(p * n);
    let out = orig.slice(0, solid);
    for (let i = solid; i < n; i++) out += orig[i] === ' ' ? ' ' : POOL[(Math.random() * POOL.length) | 0];
    el.textContent = out;
    if (p < 1) requestAnimationFrame(frame);
    else {
      el.textContent = orig;
      el.style.height = '';
      el.style.overflow = '';
      delete el.dataset.decoding;
    }
  };
  requestAnimationFrame(frame);
}

/* Letters that gather, for titles set in the page (the hero's are drawn
   by fx/lattice.js): each letter starts loose — displaced, turned, unseen —
   and settles into the line, first letters first. The words are put back
   as plain text when it is done, so kerning and wrapping are the page's
   own. Reduced motion never splits anything. */
export function gather(el, fast) {
  if (sched.reduced.matches || el.dataset.gathering) return;
  const text = el.textContent;
  if (!text.trim() || el.children.length) return;
  el.dataset.gathering = '1';
  el.setAttribute('aria-label', text.trim());
  const frag = document.createDocumentFragment();
  let i = 0;
  /* the whole line is in place within about a second, however long it is */
  const step = Math.min(fast ? 12 : 20, (fast ? 220 : 420) / Math.max(1, text.length));
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) { frag.append(' '); continue; }
    const w = document.createElement('span');
    w.className = 'gw'; w.setAttribute('aria-hidden', 'true');
    for (const ch of part) {
      const l = document.createElement('span');
      l.className = 'gl'; l.textContent = ch;
      l.style.cssText = `--x:${((Math.random() - 0.5) * 1.7).toFixed(2)}em;--y:${((Math.random() - 0.62) * 1.5).toFixed(2)}em;`
        + `--r:${((Math.random() - 0.5) * 64).toFixed(0)}deg;--d:${Math.round(i * step + Math.random() * (fast ? 60 : 110))}ms`;
      w.append(l); i++;
    }
    frag.append(w);
  }
  el.textContent = '';
  el.append(frag);
  el.classList.add('gather');
  el.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('gathered')));
  setTimeout(() => {
    el.textContent = text;
    el.classList.remove('gather', 'gathered');
    el.removeAttribute('aria-label');
    delete el.dataset.gathering;
  }, 1250 + i * step);
}

export function init(fx) {
  const reduced = sched.reduced.matches;
  document.documentElement.classList.add('fx-ready');
  const els = [...document.querySelectorAll('[data-reveal]')];

  if (reduced) {
    els.forEach(el => el.classList.add('in'));
  } else {
    let seq = 0, wave = 0;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        io.unobserve(el);
        clearTimeout(wave);
        wave = setTimeout(() => { seq = 0; }, 700);
        setTimeout(() => {
          el.classList.add('in');
          el.querySelectorAll('[data-decode]').forEach(d => decode(d));
          if (el.matches('[data-decode]')) decode(el);
        }, Math.min(seq++ * 75, 450));
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    els.forEach(el => io.observe(el));
  }

  // titles gather from loose letters as they arrive
  if (!reduced) {
    const tio = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      tio.unobserve(e.target);
      gather(e.target);
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.2 });
    document.querySelectorAll('[data-gather]').forEach(el => tio.observe(el));
  }

  // erosion titles phase-lock with one glitch frame as they arrive
  if (fx && fx.gl && fx.gl.pulse && !reduced) {
    const gio = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { fx.gl.pulse(); gio.unobserve(e.target); }
    }), { threshold: 0.5 });
    document.querySelectorAll('.fx-erode').forEach(el => gio.observe(el));
  }

  // card titles decode under the cursor
  if (!reduced) {
    document.querySelectorAll('[data-decode-hover]').forEach(el => {
      let last = 0;
      (el.closest('a') || el).addEventListener('pointerenter', () => {
        const n = performance.now();
        if (n - last > 900) { last = n; decode(el, 360); }
      });
    });
  }

  // giant section numerals drift slower than the page (depth)
  const plx = [...document.querySelectorAll('[data-plx]')];
  if (plx.length && !reduced) {
    sched.add(() => {
      const vh = innerHeight;
      for (const el of plx) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) continue;
        const off = (r.top + r.height / 2 - vh / 2) * -0.09;
        el.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0)`;
      }
    });
  }
}
