/* passage.js — the worlds as a passage.
   The markup is a plain list of worlds, and stays one: without this file
   (or on a phone, or with reduced motion) it is a row of tall cards to
   swipe, and this only keeps the counter and the two buttons in step.
   On a wide screen the list is pinned and scroll drives it: each world
   holds the whole screen, the next one waits in a small glass lens in the
   corner, and the lens opens over the screen as the reader moves on. */

import * as sched from './scheduler.js';
import { gather } from './reveal.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = x => x * x * x * (x * (x * 6 - 15) + 10);

export function init() {
  const sec = document.querySelector('[data-passage]');
  if (!sec) return;
  const track = sec.querySelector('.pass-track');
  const sticky = sec.querySelector('.pass-sticky');
  const list = sec.querySelector('.pass-list');
  const lens = sec.querySelector('.pass-lens');
  const rail = sec.querySelector('.pass-rail');
  const prev = sec.querySelector('.pass-prev'), next = sec.querySelector('.pass-next');
  const items = [...list.children];
  const n = items.length;
  if (!n) return;

  const ticks = items.map(() => rail.appendChild(document.createElement('i')));
  const wide = matchMedia('(min-width: 900px) and (min-height: 560px)');
  let live = false, cur = -1, top = 0, travel = 0, pos = 0, shown = [-1, -1], named = -1;
  const names = items.map(el => el.querySelector('.pw-name a'));
  /* a world's name gathers from loose letters as the world arrives */
  const name = i => { if (i !== named && names[i]) { named = i; gather(names[i], true); } };

  function mark(i) {
    if (i === cur) return;
    cur = i;
    ticks.forEach((t, k) => t.classList.toggle('on', k === i));
    prev.disabled = i <= 0;
    next.disabled = i >= n - 1;
  }

  function measure() {
    if (!live) return;
    top = track.getBoundingClientRect().top + scrollY;
    travel = track.offsetHeight - innerHeight;
  }

  function setMode() {
    const want = wide.matches && !sched.reduced.matches;
    if (want !== live) {
      live = want;
      sec.classList.toggle('is-live', live);
      items.forEach(el => { el.classList.remove('is-on', 'is-next'); el.style.cssText = el.style.cssText.replace(/--(r|k|o):[^;]+;?/g, ''); });
      shown = [-1, -1];
      cur = -1;
    }
    measure();
    live ? frame(0, 1) : onSwipe();
  }

  /* ---- swipe mode */
  const cardStep = () => (items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft : list.clientWidth) || 1;
  function onSwipe() {
    if (live) return;
    const was = cur;
    mark(clamp(Math.round(list.scrollLeft / cardStep()), 0, n - 1));
    if (was >= 0 && cur !== was) name(cur);
  }
  list.addEventListener('scroll', onSwipe, { passive: true });

  function go(i) {
    i = clamp(i, 0, n - 1);
    const behavior = sched.reduced.matches ? 'auto' : 'smooth';
    if (live) scrollTo({ top: top + (travel * i) / Math.max(1, n - 1) + 2, behavior });
    else list.scrollTo({ left: i * cardStep(), behavior });
  }
  prev.addEventListener('click', () => go(cur - 1));
  next.addEventListener('click', () => go(cur + 1));
  ticks.forEach((t, i) => t.addEventListener('click', () => go(i)));

  /* ---- pinned mode */
  function frame(_t, dt) {
    if (!live) return;
    const target = travel > 0 ? clamp((scrollY - top) / travel, 0, 1) * (n - 1) : 0;
    const e = 1 - Math.exp(-(dt || 0.016) * 10);
    pos += (target - pos) * (dt >= 1 ? 1 : e);
    if (Math.abs(target - pos) < 0.0004) pos = target;

    const i = Math.min(n - 1, Math.floor(pos + 1e-6));
    const f = pos - i;
    const p = smooth(clamp((f - 0.52) / 0.48, 0, 1));
    const j = i + 1 < n ? i + 1 : -1;
    if (shown[0] !== i || shown[1] !== j) {
      items.forEach((el, k) => { el.classList.toggle('is-on', k === i); el.classList.toggle('is-next', k === j); });
      shown = [i, j];
    }
    const a = items[i].style;
    a.setProperty('--r', '200vmax');
    a.setProperty('--k', (p * 0.3).toFixed(4));
    a.setProperty('--o', clamp(1 - p * 3.2, 0, 1).toFixed(3));

    const W = sticky.clientWidth, H = sticky.clientHeight;
    const lx = W * 0.86, ly = H * 0.23;
    const r0 = clamp(W * 0.052, 48, 84);
    const rMax = Math.hypot(Math.max(lx, W - lx), Math.max(ly, H - ly)) + 24;
    const r = r0 + (rMax - r0) * p * p;
    if (j >= 0) {
      const b = items[j].style;
      b.setProperty('--r', r.toFixed(1) + 'px');
      b.setProperty('--k', (1 - p).toFixed(4));
      b.setProperty('--o', clamp((p - 0.42) / 0.4, 0, 1).toFixed(3));
      if (p > 0.42) name(j);
    }
    lens.style.setProperty('--r', r.toFixed(1) + 'px');
    lens.style.setProperty('--lo', j < 0 ? '0' : clamp((0.94 - p) / 0.2, 0, 1).toFixed(3));
    mark(clamp(Math.round(pos + 0.14), 0, n - 1));
  }
  sched.add(frame, sec);

  const relayout = () => { measure(); };
  addEventListener('resize', setMode, { passive: true });
  addEventListener('load', relayout);
  addEventListener('pageshow', relayout);
  document.fonts && document.fonts.ready.then(relayout);
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(document.body);
  wide.addEventListener ? wide.addEventListener('change', setMode) : wide.addListener(setMode);
  setMode();
  if (!live) mark(0);
}
