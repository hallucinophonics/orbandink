/* rain.js — glyph fall for the books sections.
   Sparse columns of characters (sampled from the shelf's own titles)
   drift slowly down behind the catalog — warm, faint, far from
   arcade-green. Pauses offscreen; reduced motion gets one designed
   still frame; sits at z:-1 so it never competes with content. */

import * as sched from './scheduler.js';

export function init(section) {
  const reduced = sched.reduced.matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'rain';
  canvas.setAttribute('aria-hidden', 'true');
  section.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let pool = section.dataset.glyphs
    || [...new Set([...section.querySelectorAll('.card h3')]
         .flatMap(h => h.textContent.split('')))].filter(c => c.trim()).join('');
  pool += '01·:/—';
  const mono = getComputedStyle(document.body).getPropertyValue('--font-mono');
  const accent = (getComputedStyle(section).getPropertyValue('--accent-book')
    || getComputedStyle(document.documentElement).getPropertyValue('--accent')).trim() || '#D9A05B';

  let W = 0, H = 0, DPR = 1, cols = [];

  const makeCol = () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    sp: 13 + Math.random() * 24,           // px/s — slow drift, not arcade
    step: 16 + Math.random() * 7,
    k: 5 + (Math.random() * 6 | 0),
    size: 10 + (Math.random() * 3 | 0),
    a: 0.05 + Math.random() * 0.05,
    accent: Math.random() < 0.07,
    chars: Array.from({ length: 12 }, () => pool[Math.random() * pool.length | 0]),
  });

  function resize() {
    DPR = Math.min(sched.dpr(), 1.5);
    const r = section.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width));
    H = Math.max(2, Math.round(r.height));
    canvas.width = W * DPR; canvas.height = H * DPR;
    const q = sched.getQuality();
    const dens = parseFloat(section.dataset.rainDensity || '1') || 1;
    const count = Math.max(4, Math.round((W / 66) * dens * (q >= 1 ? 1 : q >= 0.6 ? 0.7 : 0.45)));
    cols = Array.from({ length: Math.min(28, count) }, makeCol);
    if (reduced) draw(0, 0);
  }

  function draw(t, dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const c of cols) {
      if (!reduced) c.y += c.sp * dt;
      if (c.y - c.k * c.step > H + 40) Object.assign(c, makeCol(), { y: -Math.random() * 160 });
      ctx.font = `400 ${c.size}px ${mono}`;
      for (let i = 0; i < c.k; i++) {
        const gy = c.y - i * c.step;
        if (gy < -20 || gy > H + 20) continue;
        const head = i === 0;
        ctx.fillStyle = head && c.accent ? accent : '#EDE6DC';
        ctx.globalAlpha = Math.min(0.16, c.a * (1 - i / c.k) * (head ? 1.7 : 1));
        const ch = c.chars[(i + (head ? (t * 2 | 0) % 3 : 0)) % c.chars.length];
        ctx.fillText(ch, c.x, gy);
      }
    }
    ctx.globalAlpha = 1;
  }

  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(section);
  else addEventListener('resize', resize, { passive: true });
  if (!reduced) sched.add(draw, section);
}
