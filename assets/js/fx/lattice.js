/* lattice.js — letters that gather.
   The house's headline is built from hundreds of small characters (taken
   from the authors' names and the books' titles, in every script the house
   prints in). They live in the orb as loose ink; they stream out of it and
   gather into the house's name; when the headline changes — the house, then
   each of its four authors in turn, the house between each — the letters
   are drawn back into the glass and stream out again as the next name,
   forming from the orb outward. They scatter under the pointer and heal.

   This file is the letters themselves: the glyph atlas, where each name
   sits on the stage, the points a name is made of, and the motion. It
   draws nothing. fx/orb.js renders the sprites it returns into the same
   picture as the orb, so letters passing behind the glass bend through it.
   When a name has gathered, the solid letterform comes up underneath the
   glyphs (fill()), so the settled headline is crisp at any size. */

const CELL = 22;            // one glyph cell, CSS px
const COLS = 32;            // atlas columns
const CAP = 0.708;          // cap height of the display face, em

export function create({ pool, mono, family, weight, frames, still }) {
  const glyphs = [...new Set((pool + '0123456789:/·—').split(''))].filter(g => g.trim());
  const styles = [
    { size: 10, color: 'rgba(250,245,236,0.98)' },
    { size: 12, color: 'rgba(237,230,220,0.80)' },
    { size: 9, color: 'rgba(196,184,166,0.70)' },
    { size: 12, color: 'rgba(240,190,92,1)' },       // gold — sparse
  ];
  const rowsPer = Math.ceil(glyphs.length / COLS);
  const atlas = document.createElement('canvas');
  atlas.width = COLS * CELL * 2;
  atlas.height = rowsPer * styles.length * CELL * 2;
  function buildAtlas() {
    const a = atlas.getContext('2d');
    a.setTransform(2, 0, 0, 2, 0, 0);
    a.clearRect(0, 0, atlas.width, atlas.height);
    a.textAlign = 'center'; a.textBaseline = 'middle';
    styles.forEach((s, si) => {
      a.font = `400 ${s.size}px ${mono}`;
      a.fillStyle = s.color;
      glyphs.forEach((g, gi) => a.fillText(g,
        (gi % COLS) * CELL + CELL / 2, (si * rowsPer + Math.floor(gi / COLS)) * CELL + CELL / 2));
    });
  }
  buildAtlas();

  const font = px => `${weight} ${px}px ${family}`;
  const meas = document.createElement('canvas').getContext('2d');

  /* where the two words of a frame stand: either side of the orb on a wide
     stage, above and below it on a tall one; a long name is set smaller so
     it always fits */
  function place(frame, g) {
    const [a, b] = frame;
    /* the house's two short words tuck a little behind the glass; an
       author's name stands clear of it, so no letter is lost */
    const house = frame === frames[0];
    let size = g.font;
    meas.font = font(size);
    const wa = meas.measureText(a).width, wb = meas.measureText(b).width;
    if (g.vertical) {
      const f = Math.min(1, (g.W - g.margin * 2) / Math.max(wa, wb, 1));
      size *= f;
      const cap = size * CAP, gap = g.orb.r * (house ? 0.93 : 1.0) + (house ? 0 : size * 0.10);
      return { size, words: [
        { str: a, x: g.orb.x, y: g.orb.y - gap, align: 'center' },
        { str: b, x: g.orb.x, y: g.orb.y + gap + cap, align: 'center' }] };
    }
    const gap = g.orb.r * (house ? 0.86 : 1.0) + (house ? 0 : g.font * 0.045);
    const f = Math.min(1, (g.orb.x - gap - g.margin) / Math.max(wa, 1), (g.W - g.orb.x - gap - g.margin) / Math.max(wb, 1));
    size *= f;
    const y = g.orb.y + size * CAP / 2;
    return { size, words: [
      { str: a, x: g.orb.x - gap, y, align: 'right' },
      { str: b, x: g.orb.x + gap, y, align: 'left' }] };
  }

  /** the solid letterforms of the current frame, drawn at scale k */
  function fill(c2, k) {
    if (!geo) return;
    const L = place(frames[frameIx], geo);
    c2.setTransform(k, 0, 0, k, 0, 0);
    c2.clearRect(0, 0, geo.W, geo.H);
    c2.font = font(L.size);
    c2.textBaseline = 'alphabetic';
    for (const w of L.words) {
      const gr = c2.createLinearGradient(0, w.y - L.size * CAP, 0, w.y);
      gr.addColorStop(0, '#FBF6EC'); gr.addColorStop(0.62, '#EDE6DC'); gr.addColorStop(1, '#C5B9A4');
      c2.fillStyle = gr;
      c2.textAlign = w.align;
      c2.fillText(w.str, w.x, w.y);
    }
  }

  /* the points a frame is made of, nearest the orb first */
  function points(frame, g, budget) {
    const scale = 0.5;
    const m = document.createElement('canvas');
    m.width = Math.max(2, Math.round(g.W * scale)); m.height = Math.max(2, Math.round(g.H * scale));
    const mc = m.getContext('2d', { willReadFrequently: true });
    const L = place(frame, g);
    mc.setTransform(scale, 0, 0, scale, 0, 0);
    mc.font = font(L.size);
    mc.textBaseline = 'alphabetic';
    mc.fillStyle = '#fff';
    for (const w of L.words) { mc.textAlign = w.align; mc.fillText(w.str, w.x, w.y); }
    const data = mc.getImageData(0, 0, m.width, m.height).data;
    /* a glyph sits inside the stroke, not on its edge: the point and its
       four neighbours must all be ink (hairlines keep the solid form only) */
    const e = Math.max(1, Math.round(Math.min(2.4, L.size * 0.016)));
    const ink = (x, y) => x >= 0 && y >= 0 && x < m.width && y < m.height && data[(y * m.width + x) * 4 + 3] > 110;
    const pts = [];
    for (let y = 1; y < m.height; y += 2)
      for (let x = 1; x < m.width; x += 2)
        if (ink(x, y) && ink(x - e, y) && ink(x + e, y) && ink(x, y - e) && ink(x, y + e)) pts.push([x / scale, y / scale]);
    const keep = Math.min(pts.length, budget);
    const out = [];
    const stride = pts.length / Math.max(1, keep);
    const jit = Math.max(1, L.size * 0.008);
    for (let i = 0; i < keep; i++) {
      const p = pts[Math.floor(i * stride)];
      out.push([p[0] + (Math.random() - 0.5) * jit, p[1] + (Math.random() - 0.5) * jit]);
    }
    const d = p => Math.hypot(p[0] - g.orb.x, p[1] - g.orb.y);
    out.sort((p, q) => d(p) - d(q));
    return { pts: out, size: L.size };
  }

  const parts = [];
  let geo = null, frameIx = 0, seqIx = 0, nextAt = 0, lastRelease = 0, changedAt = -1, glyphScale = 1;
  /* the house's name returns between each author */
  const seq = [];
  for (let i = 1; i < frames.length; i++) seq.push(0, i);
  if (!seq.length) seq.push(0);
  let onFrame = null;

  function spawn() {
    return {
      x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, has: false, hold: 0, a: 0, born: false,
      g: (Math.random() * glyphs.length) | 0,
      s: Math.random() < 0.09 ? 3 : (Math.random() * 3) | 0,
      ph: Math.random() * 6.283, sp: 0.5 + Math.random(),
      oa: Math.random() * 6.283, or: Math.sqrt(Math.random()), ow: (0.25 + Math.random() * 0.55) * (Math.random() < 0.5 ? -1 : 1),
    };
  }

  /* mode: 'flow' — into the orb, then out as the new name;
           'soft' — the stage moved: glide to the new places, keeping any
                    release times still to come; 'instant' — be there */
  function retarget(now, mode) {
    const instant = mode === 'instant', soft = mode === 'soft';
    if (!soft || changedAt < 0) changedAt = now;
    const base = changedAt;
    const budget = parts.length;
    const { pts, size } = points(frames[frameIx], geo, Math.floor(budget * 0.9));
    glyphScale = Math.max(0.56, Math.min(1.1, size / 170));
    /* which letters go where: free ones first, so ink in the orb is used
       before a letter is torn from one name to make another */
    const order = parts.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
    const n = pts.length;
    order.forEach((pi, i) => {
      const p = parts[pi];
      if (i < n) {
        p.tx = pts[i][0]; p.ty = pts[i][1]; p.has = true;
        p.hold = instant ? 0 : base + 0.30 + (i / Math.max(1, n)) * 1.25 + Math.random() * 0.14;
        if (instant) { p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; p.a = 1; p.born = true; }
      } else {
        p.has = false; p.hold = 0;
      }
    });
    lastRelease = instant ? -10 : base + 1.7;
  }

  function resize(g, budget, now) {
    const first = !geo;
    geo = g;
    while (parts.length < budget) parts.push(spawn());
    parts.length = budget;
    if (first) {
      for (const p of parts) {
        const rr = p.or * g.orb.r * 0.6;
        p.x = g.orb.x + Math.cos(p.oa) * rr; p.y = g.orb.y + Math.sin(p.oa) * rr * 0.86;
      }
    }
    retarget(now, still ? 'instant' : first ? 'flow' : 'soft');
    if (first) nextAt = now + 8.2;
  }

  /** advance; writes sprites into `out` (x, y, half, u0, v0, u1, v1, alpha per glyph) */
  function step(now, dt, ptr, out) {
    if (!geo) return 0;
    if (!still && frames.length > 1 && now > nextAt) {
      seqIx = (seqIx + 1) % seq.length;
      frameIx = seq[seqIx];
      nextAt = now + (frameIx === 0 ? 6.4 : 4.8);
      retarget(now, 'flow');
      onFrame && onFrame(frameIx);
    }
    const f = Math.min(2.5, dt * 60);
    const damp = Math.pow(0.86, f);
    const o = geo.orb;
    const R = Math.min(190, geo.W * 0.14), R2 = R * R;
    const mspd = Math.min(30, Math.hypot(ptr.vx, ptr.vy));
    const half = CELL / 2 * glyphScale;
    const aw = atlas.width / 2, ah = atlas.height / 2;
    let n = 0;
    for (const p of parts) {
      const free = !p.has || now < p.hold;
      let gx, gy, k;
      if (free) {
        const ang = p.oa + p.ow * now, rr = p.or * o.r * 0.60;
        gx = o.x + Math.cos(ang) * rr; gy = o.y + Math.sin(ang) * rr * 0.86; k = 0.013;
      } else { gx = p.tx; gy = p.ty; k = 0.021; }
      p.vx += (gx - p.x) * k * f; p.vy += (gy - p.y) * k * f;
      const dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy;
      if (d2 < R2 && mspd > 0.4) {
        const d = Math.sqrt(d2) || 1, fo = (1 - d / R) * mspd * 0.045 * f;
        p.vx += (dx / d) * fo + (-dy / d) * fo * 1.6;
        p.vy += (dy / d) * fo + (dx / d) * fo * 1.6;
      }
      p.vx *= damp; p.vy *= damp;
      p.x += (p.vx + Math.sin(now * p.sp + p.ph) * 0.13) * f;
      p.y += (p.vy + Math.cos(now * p.sp * 0.9 + p.ph) * 0.11) * f;
      p.a += ((free ? 0.86 : 1) - p.a) * Math.min(1, 0.05 * f);
      if (p.a < 0.02) continue;
      const u0 = (p.g % COLS) * CELL / aw, v0 = (p.s * rowsPer + Math.floor(p.g / COLS)) * CELL / ah;
      const i = n * 8;
      out[i] = p.x; out[i + 1] = p.y; out[i + 2] = half;
      out[i + 3] = u0; out[i + 4] = v0; out[i + 5] = u0 + CELL / aw; out[i + 6] = v0 + CELL / ah;
      out[i + 7] = p.a;
      n++;
    }
    return n;
  }

  return {
    atlas, buildAtlas, fill, resize, step,
    get count() { return parts.length; },
    get frame() { return frameIx; },
    get changedAt() { return changedAt; },
    /** 0 while the letters are in flight, 1 when the name has gathered */
    settle(now) { return still ? 1 : Math.max(0, Math.min(1, (now - lastRelease - 0.25) / 0.9)); },
    /** 1 → 0 just after a change: how much of the old name is still up */
    leaving(now) { return still ? 0 : Math.max(0, 1 - (now - changedAt) / 0.38); },
    set onFrame(fn) { onFrame = fn; },
  };
}
