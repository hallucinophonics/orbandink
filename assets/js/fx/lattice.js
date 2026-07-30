/* lattice.js — glyph-lattice hero.
   The house's bylines rendered as hundreds of small characters (sampled
   from the names and book titles across scripts, timestamps, binary)
   that drift, scatter under the cursor, heal, and periodically migrate
   to re-form the next name in the rotation — the real name and the pen
   names, each cycling EN → RU → JA. 2D canvas; the real <h1> stays in
   the DOM underneath. */

import * as sched from './scheduler.js';

export function init(hero) {
  const h1 = hero.querySelector('.hero-word');
  const wrap = hero.querySelector('.hero-word-wrap');
  if (!h1 || !wrap || !('getContext' in document.createElement('canvas'))) return null;

  let words;
  try { words = JSON.parse(h1.dataset.words || '{}'); } catch { return null; }
  const activeLang = document.documentElement.lang || 'en';
  // data-words is a frame LIST (the house's bylines rotating through scripts);
  // the legacy {lang: word} dict form still works for older built pages.
  const cycle = Array.isArray(words)
    ? [...new Set(words.filter(Boolean))]
    : [...new Set([words[activeLang], words.en, words.ru, words.ja].filter(Boolean))];
  if (!cycle.length) return null;
  const pool = (h1.dataset.glyphs || '01') + '0101··:/—';

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-lattice';
  canvas.setAttribute('aria-hidden', 'true');
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const state = {
    parts: [], wordIx: 0, morphAt: 9,
    mouse: { x: -1e4, y: -1e4, vx: 0, vy: 0, px: 0, py: 0 },
    burst: 0, built: false, stopped: false,
  };
  const reduced = sched.reduced.matches;

  /* ---- glyph atlas: pre-render every (glyph × style) once ---- */
  const CELL = 22;
  let atlas, cols, styles;
  function buildAtlas() {
    const glyphs = [...new Set(pool.split(''))].filter(g => g.trim());
    styles = [
      { size: 10, color: 'rgba(237,230,220,0.88)' },
      { size: 12, color: 'rgba(237,230,220,0.62)' },
      { size: 9,  color: 'rgba(167,157,143,0.55)' },
      { size: 12, color: 'rgba(217,160,91,0.95)' }, // accent — sparse
    ];
    cols = glyphs.length;
    atlas = document.createElement('canvas');
    atlas.width = cols * CELL * 2; atlas.height = styles.length * CELL * 2;
    const a = atlas.getContext('2d');
    a.scale(2, 2);
    a.textAlign = 'center'; a.textBaseline = 'middle';
    styles.forEach((s, r) => {
      a.font = `400 ${s.size}px ${getComputedStyle(document.body).getPropertyValue('--font-mono')}`;
      a.fillStyle = s.color;
      glyphs.forEach((g, c) => a.fillText(g, c * CELL + CELL / 2, r * CELL + CELL / 2));
    });
    return glyphs;
  }
  const glyphs = buildAtlas();

  /* ---- word mask → target points ---- */
  let W = 0, H = 0, DPR = 1;
  function measure() {
    DPR = Math.min(sched.dpr(), 1.5);
    const r = canvas.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width)); H = Math.max(2, Math.round(r.height));
    canvas.width = W * DPR; canvas.height = H * DPR;
  }

  function targetsFor(word) {
    const cs = getComputedStyle(h1);
    const m = document.createElement('canvas');
    const scale = 0.5; // sample at half res, plenty for a mask
    m.width = Math.round(W * scale); m.height = Math.round(H * scale);
    const mc = m.getContext('2d', { willReadFrequently: true });
    let size = parseFloat(cs.fontSize) * scale;
    mc.textAlign = 'center'; mc.textBaseline = 'middle';
    const fontFor = s => `${cs.fontWeight} ${s}px ${cs.fontFamily}`;
    mc.font = fontFor(size);
    // multi-line hero words ("ALEXEY\nBELENKIY") stack centered;
    // the canvas is 124% of the word wrap — keep lines inside the
    // visible wrap width so glyphs never clip at the viewport edge
    const lines = word.split('\n');
    const maxWordW = m.width * 0.76;
    const widest = Math.max(...lines.map(ln => mc.measureText(ln).width));
    if (widest > maxWordW) { size *= maxWordW / widest; mc.font = fontFor(size); }
    mc.fillStyle = '#fff';
    const llh = size * 1.04;
    const y0 = m.height / 2 - ((lines.length - 1) / 2) * llh;
    lines.forEach((ln, i) => mc.fillText(ln, m.width / 2, y0 + i * llh));
    const data = mc.getImageData(0, 0, m.width, m.height).data;
    // particle budget by quality tier + viewport
    const budget = Math.round(
      (sched.getQuality() >= 1 ? 2200 : sched.getQuality() >= 0.6 ? 1400 : 850)
      * (innerWidth < 720 ? 0.55 : 1));
    // find filled pixels at a coarse grid, then thin to budget
    const pts = [];
    const step = 2;
    for (let y = 0; y < m.height; y += step)
      for (let x = 0; x < m.width; x += step)
        if (data[(y * m.width + x) * 4 + 3] > 120) pts.push([x / scale, y / scale]);
    const keep = Math.min(pts.length, budget);
    const out = [];
    const stride = pts.length / keep;
    for (let i = 0; i < keep; i++) {
      const p = pts[Math.floor(i * stride)];
      out.push([p[0] + (Math.random() - 0.5) * 3, p[1] + (Math.random() - 0.5) * 3]);
    }
    return out;
  }

  function retarget(pts) {
    // sort both by x-then-y so migration sweeps instead of teleporting
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const P = state.parts;
    P.sort((a, b) => a.tx - b.tx || a.ty - b.ty);
    const n = Math.max(P.length, pts.length);
    for (let i = 0; i < n; i++) {
      if (i < P.length && i < pts.length) {
        P[i].tx = pts[i][0]; P[i].ty = pts[i][1]; P[i].dead = false;
      } else if (i < P.length) {
        P[i].dead = true; // excess: fade out in place
      } else {
        P.push(spawn(pts[i][0], pts[i][1], true));
      }
    }
  }

  function spawn(tx, ty, fromEdge) {
    const edge = Math.random() * 4 | 0;
    const x = fromEdge ? (edge < 2 ? (edge ? W + 30 : -30) : Math.random() * W) : Math.random() * W;
    const y = fromEdge ? (edge < 2 ? Math.random() * H : (edge === 2 ? -30 : H + 30)) : Math.random() * H;
    return {
      x, y, tx, ty, vx: 0, vy: 0,
      g: Math.random() * cols | 0,
      s: Math.random() < 0.08 ? 3 : Math.random() * 3 | 0,
      ph: Math.random() * Math.PI * 2,
      sp: 0.5 + Math.random(),
      a: 0, dead: false,
    };
  }

  function build() {
    measure();
    const pts = targetsFor(cycle[state.wordIx]);
    if (!pts.length) return false;
    if (!state.parts.length) pts.forEach(p => state.parts.push(spawn(p[0], p[1], !reduced)));
    else retarget(pts);
    state.built = true;
    return true;
  }

  function drawStatic() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const p of state.parts) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(atlas, p.g * CELL * 2, p.s * CELL * 2, CELL * 2, CELL * 2,
        p.tx - CELL / 2, p.ty - CELL / 2, CELL, CELL);
    }
    ctx.globalAlpha = 1;
    h1.classList.add('fx-ghost');
  }

  function tick(t, dt) {
    if (!state.built || state.stopped) return;
    const M = state.mouse;
    const mspd = Math.min(30, Math.hypot(M.vx, M.vy));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const R = Math.min(180, W * 0.14), R2 = R * R;
    for (const p of state.parts) {
      // heal toward target
      p.vx += (p.tx - p.x) * 0.016;
      p.vy += (p.ty - p.y) * 0.016;
      // cursor flow-field: swirl + push, healed back from
      const dx = p.x - M.x, dy = p.y - M.y, d2 = dx * dx + dy * dy;
      if (d2 < R2 && mspd > 0.4) {
        const d = Math.sqrt(d2) || 1, f = (1 - d / R) * mspd * 0.045;
        p.vx += (dx / d) * f + (-dy / d) * f * 1.6;
        p.vy += (dy / d) * f + (dx / d) * f * 1.6;
      }
      if (state.burst > 0) {
        const cx = p.x - W / 2, cy = p.y - H / 2, cd = Math.hypot(cx, cy) || 1;
        p.vx += (cx / cd) * state.burst * 2.4;
        p.vy += (cy / cd) * state.burst * 2.4;
      }
      p.vx *= 0.86; p.vy *= 0.86;
      p.x += p.vx + Math.sin(t * p.sp + p.ph) * 0.16;
      p.y += p.vy + Math.cos(t * p.sp * 0.9 + p.ph) * 0.14;
      p.a += ((p.dead || state.burst > 0.5 ? 0 : 1) - p.a) * 0.05;
      if (p.a < 0.02) continue;
      ctx.globalAlpha = p.a;
      ctx.drawImage(atlas, p.g * CELL * 2, p.s * CELL * 2, CELL * 2, CELL * 2,
        p.x - CELL / 2, p.y - CELL / 2, CELL, CELL);
    }
    ctx.globalAlpha = 1;
    state.burst = Math.max(0, state.burst - dt * 1.8);
    M.vx *= 0.8; M.vy *= 0.8;
    // periodic migration to the next script — the money shot
    if (t > state.morphAt && cycle.length > 1) {
      state.morphAt = t + 8.5;
      state.wordIx = (state.wordIx + 1) % cycle.length;
      retarget(targetsFor(cycle[state.wordIx]));
    }
    if (!state.ghosted) { state.ghosted = true; h1.classList.add('fx-ghost'); }
  }

  /* ---- boot ---- */
  const cs = getComputedStyle(h1);
  const fontSpec = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily.split(',')[0]}`;
  const ready = document.fonts ? document.fonts.load(fontSpec, cycle.join('').replace(/\n/g, '')) : Promise.resolve();
  ready.catch(() => {}).finally(() => {
    if (!build()) return;
    if (reduced) { drawStatic(); return; }
    sched.add(tick, hero);
    hero.addEventListener('pointermove', ev => {
      const r = canvas.getBoundingClientRect();
      const M = state.mouse;
      const nx = ev.clientX - r.left, ny = ev.clientY - r.top;
      M.vx = nx - (M.px || nx); M.vy = ny - (M.py || ny);
      M.px = M.x = nx; M.py = M.y = ny;
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { state.mouse.x = -1e4; state.mouse.y = -1e4; });
  });

  let rs;
  addEventListener('resize', () => {
    clearTimeout(rs);
    rs = setTimeout(() => {
      if (!state.built) return;
      measure();
      retarget(targetsFor(cycle[state.wordIx]));
      if (reduced) drawStatic();
    }, 180);
  }, { passive: true });

  // late-arriving webfonts (fetch_fonts.py subsets or the dev shim):
  // rebuild the glyph atlas + word mask with the real faces
  let fl;
  document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => {
    clearTimeout(fl);
    fl = setTimeout(() => {
      if (!state.built) return;
      buildAtlas();
      measure();
      retarget(targetsFor(cycle[state.wordIx]));
      if (reduced) drawStatic();
    }, 140);
  });

  return {
    burst() { state.burst = 1; },
  };
}
