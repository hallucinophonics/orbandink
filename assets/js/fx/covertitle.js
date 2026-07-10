/* covertitle.js — the printed title falls into place.
   Placeholder covers ship title-less; when a cover scrolls into view,
   the letters of the book's title rain down inside the cover —
   scrambling as they fall — and settle into the title block, where
   they stay, static, like ink that found its page. Reduced motion
   renders the settled state immediately. */

import * as sched from './scheduler.js';

function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < (s || '').length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function resolveTitle(box) {
  const card = box.closest('.card');
  if (card) { const h = card.querySelector('h3'); return h && (h.dataset.orig || h.textContent); }
  const featured = box.closest('.featured');
  if (featured) { const h = featured.querySelector('.featured-title'); return h && h.textContent; }
  if (document.body.classList.contains('page-book') && box.closest('.cover-col')) {
    const h = document.querySelector('.book-title'); return h && h.textContent;
  }
  return null;
}

export function init(box) {
  const title = (resolveTitle(box) || '').trim();
  if (!title) return;
  const reduced = sched.reduced.matches;
  const accent = box.dataset.accent || '#D9A05B';
  const seed = hashSeed(box.dataset.book || title);

  const canvas = document.createElement('canvas');
  canvas.className = 'cover-title';
  canvas.setAttribute('aria-hidden', 'true');
  box.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-title').trim() || 'serif';
  let W = 0, H = 0, DPR = 1, chars = [], formed = false, running = false, stop = null;

  function layout() {
    DPR = Math.min(sched.dpr(), 2);
    const r = box.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width)); H = Math.max(2, Math.round(r.height));
    canvas.width = W * DPR; canvas.height = H * DPR;
    // wrap the title like a printed cover block: left margin, lower third
    const maxW = W * 0.84;
    let size = W * 0.125;
    const fontFor = s => `700 ${s}px ${family}`;
    const words = title.split(/\s+/);
    let lines = [];
    for (; size > W * 0.055; size -= W * 0.008) {
      ctx.font = fontFor(size);
      lines = []; let line = ''; let ok = true;
      for (const wd of words) {
        if (ctx.measureText(wd).width > maxW) { ok = false; break; }
        const test = line ? line + ' ' + wd : wd;
        if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = wd; }
        else line = test;
      }
      if (line) lines.push(line);
      if (ok && lines.length <= 4) break;
    }
    const lh = size * 1.08;
    const baseY = H * 0.86 - (lines.length - 1) * lh;
    const accLine = seed % lines.length;
    chars = [];
    ctx.font = fontFor(size);
    lines.forEach((ln, li) => {
      let x = W * 0.08;
      const y = baseY + li * lh;
      for (const ch of ln) {
        const wpx = ctx.measureText(ch).width;
        if (ch !== ' ') {
          chars.push({
            ch, tx: x, ty: y,
            x: x + (Math.random() - 0.5) * 14,
            y: y - H * (0.45 + Math.random() * 0.5),
            delay: chars.length * 34 + Math.random() * 120,
            color: li === accLine ? accent : '#EDE6DC',
          });
        }
        x += wpx;
      }
    });
    return size;
  }

  let size = 0;
  const pool = [...new Set(title.replace(/\s/g, '').split(''))];

  function drawFinal() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `700 ${size}px ${family}`;
    ctx.textBaseline = 'alphabetic';
    // a settled title casts a whisper of shadow on the cover
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
    for (const c of chars) { ctx.fillStyle = c.color; ctx.fillText(c.ch, c.tx, c.ty); }
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    formed = true;
  }

  function start() {
    if (running || formed) return;
    running = true;
    const t0 = performance.now();
    stop = sched.add(() => {
      const el = performance.now() - t0;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.font = `700 ${size}px ${family}`;
      ctx.textBaseline = 'alphabetic';
      let settled = 0;
      for (const c of chars) {
        if (el < c.delay) continue;
        const d = c.ty - c.y;
        c.y += d * 0.11;
        c.x += (c.tx - c.x) * 0.11;
        const near = Math.abs(d) < 1.2;
        if (near) { c.y = c.ty; c.x = c.tx; settled++; }
        ctx.globalAlpha = near ? 1 : 0.55 + 0.45 * Math.max(0, 1 - Math.abs(d) / (H * 0.5));
        ctx.fillStyle = near ? c.color : 'rgba(237,230,220,0.9)';
        ctx.fillText(near || Math.abs(d) < 26 ? c.ch : pool[(Math.random() * pool.length) | 0], c.x, c.y);
      }
      ctx.globalAlpha = 1;
      if (settled === chars.length && el > 900) {  // formed — freeze forever
        stop(); running = false;
        drawFinal();
      }
    }, box);
  }

  const boot = () => {
    size = layout();
    if (!chars.length) return;
    if (reduced) { drawFinal(); return; }
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { io.disconnect(); start(); }
      }), { threshold: 0.45 });
      io.observe(box);
    } else start();
  };

  const fontSpec = `700 32px ${family.split(',')[0]}`;
  (document.fonts ? document.fonts.load(fontSpec, title) : Promise.resolve())
    .catch(() => {}).finally(boot);

  let rs;
  addEventListener('resize', () => {
    clearTimeout(rs);
    rs = setTimeout(() => {
      if (!chars.length) return;
      const wasFormed = formed;
      size = layout();
      if (wasFormed) drawFinal();
    }, 200);
  }, { passive: true });

  // late webfonts (dev shim / fetch_fonts.py subsets): re-set the block
  document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => {
    clearTimeout(rs);
    rs = setTimeout(() => {
      if (!chars.length) return;
      const wasFormed = formed;
      size = layout();
      if (wasFormed) drawFinal();
    }, 220);
  });
}
