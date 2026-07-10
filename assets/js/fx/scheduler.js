/* scheduler.js — one rAF loop for every effect on the page.
   Pauses on tab hide; measures early frames and settles on a quality
   tier so older devices degrade in density, never in concept. */

const subs = new Set();
let rafId = 0, last = 0, running = false;
let frames = 0, acc = 0;
let quality = 1; // 1 → 0.6 → 0.35
const qListeners = new Set();

export const reduced = matchMedia('(prefers-reduced-motion: reduce)');

export function dpr() {
  return Math.min(window.devicePixelRatio || 1, 2) * (quality < 0.5 ? 0.75 : 1);
}
export function getQuality() { return quality; }
export function onQuality(fn) { qListeners.add(fn); }

function frame(now) {
  rafId = requestAnimationFrame(frame);
  const dt = Math.min(50, now - last) || 16;
  last = now;
  // adaptive: judge the first ~70 frames, then commit
  if (frames < 70) {
    frames++; acc += dt;
    if (frames === 70) {
      const avg = acc / 70;
      const q = avg > 42 ? 0.35 : avg > 26 ? 0.6 : 1;
      if (q !== quality) { quality = q; qListeners.forEach(f => f(q)); }
    }
  }
  subs.forEach(s => { if (s.active !== false) s.cb(now / 1000, dt / 1000); });
}

function ensure() {
  if (!running && subs.size && !document.hidden) {
    running = true; last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
}

export function add(cb, watchEl) {
  const sub = { cb, active: true };
  if (watchEl && 'IntersectionObserver' in window) {
    sub.io = new IntersectionObserver(es => {
      es.forEach(e => { sub.active = e.isIntersecting; });
    }, { rootMargin: '80px' });
    sub.io.observe(watchEl);
  }
  subs.add(sub); ensure();
  return () => { sub.io && sub.io.disconnect(); subs.delete(sub); if (!subs.size) stop(); };
}

function stop() { running = false; cancelAnimationFrame(rafId); }

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop(); else ensure();
});
