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
