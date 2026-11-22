// rain.js — the Pinned Rain (set-piece A) for The Calculus of Fortune.
// Thousands of falling points; every trajectory jitters; every one lands in the same slot.
// The hero is hand-rolled WebGL: each point's path is computed in the vertex shader from
// its id + time (a random walk through twelve pin rows, pinned at both ends). A 2D-canvas
// renderer runs the same law where WebGL is absent, and drives the compact strips on the
// book pages. One rule is never broken: the histogram is normalised every frame. Mass is
// moved by the visitor; it is never made.

const ROWS = 12, NORM = 1 / Math.sqrt(ROWS);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const FUN = v => Math.pow(Math.max(0, 1 - v * v), 1.5); // funnel: wide at the top, a stem at the floor

const VERT = `
precision highp float;
attribute vec4 aA;            // entry x (0..1), phase, speed, size
attribute vec2 aB;            // id, alpha
uniform vec2 uRes;            // stage, css px
uniform vec3 uP;              // the visitor: x, y, presence
uniform float uT, uSig, uDpr, uTop, uFloor, uSlot, uAJ, uR, uFall;
varying float vA;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float path(float v, float a0, float land, float walk, float tot){
  float f = pow(max(0.0, 1.0 - v * v), 1.5);
  return land + (a0 - land) * f + uAJ * (walk - tot * v);
}
void main(){
  float cyc = aA.y + uT / (uFall * aA.z);
  float c = floor(cyc), p = cyc - c;
  float v = p * (0.72 + 0.28 * p);
  float id = aB.x + mod(c, 61.0) * 0.618;
  float vp = clamp((uP.y - uTop) / (uFloor - uTop), 0.0, 1.0);
  float walk = 0.0, walkP = 0.0, tot = 0.0;
  for (int k = 0; k < 12; k++) {
    float fk = float(k);
    float b = h(vec2(id, fk * 1.37 + 0.11)) < 0.5 ? -1.0 : 1.0;
    float e = fk / 12.0;
    walk  += b * smoothstep(e, e + 0.06, v);
    walkP += b * smoothstep(e, e + 0.06, vp);
    tot   += b;
  }
  walk *= 0.288675; walkP *= 0.288675; tot *= 0.288675;
  float n = tot + (h(vec2(id, 5.5)) - 0.5) * 0.58;      // the unpinned landing, in sigmas
  float a0 = (aA.x * 1.1 - 0.05) * uRes.x;
  float land = uSlot + uSig * uRes.x * n;
  float x = path(v, a0, land, walk, tot);
  // the visitor is the sink: whatever passes within reach of the pointer leaves its schedule
  float xp = path(vp, a0, land, walkP, tot);
  float d = (xp - uP.x) / uR;
  float w = (1.0 - smoothstep(0.35, 1.0, abs(d))) * uP.z;
  float dir = d >= 0.0 ? 1.0 : -1.0;
  float r1 = h(vec2(id, 91.7)), r2 = h(vec2(id, 47.3));
  float near = smoothstep(vp - 0.09, vp + 0.015, v);
  float after = clamp((v - vp) / max(1.0 - vp, 0.001), 0.0, 1.0);
  float gone = smoothstep(vp, vp + 0.05, v);
  x = mix(x, xp + (r2 - 0.5) * 1.4 * uR * after, w * gone) + w * near * dir * uR * (0.35 + 0.55 * r1);
  float y = uTop + v * (uFloor - uTop);
  vA = aB.y * smoothstep(0.0, 0.06, v) * (1.0 - smoothstep(0.988, 1.0, v));
  gl_Position = vec4(x / uRes.x * 2.0 - 1.0, 1.0 - y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = aA.w * uDpr;
}`;
const FRAG = `
precision mediump float;
uniform vec3 uInk;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.2, d) * vA;
  gl_FragColor = vec4(uInk * a, a);
}`;

const hex3 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

export function mountRain(stage, cfg) {
  const glC = stage.querySelector('[data-rain-gl]'), hiC = stage.querySelector('[data-rain-hist]');
  if (!glC || !hiC) return null;
  const rnd = cfg.rnd || Math.random;
  const mode = cfg.mode || 'pinned';
  const ink = cfg.ink || '#1B1712';
  const S = { W: 0, H: 0, dpr: 1, top: 0, floor: 0, slot: 0, R: 140, AJ: 12, sig: cfg.sigma || 0, t: 0, last: 0,
    px: -9999, py: -9999, pk: 0, pOn: false, vis: true, dead: false, raf: 0, nb: 0, bw: 6, hist: null, tgt: null, defl: null,
    progress: 0, lastEmit: 0 };

  // --- WebGL (hero only) -------------------------------------------------------------
  let gl = null, prog = null, U = {}, N = 0, buf = null;
  const wantGL = cfg.renderer !== '2d';
  const initGL = () => {
    try { gl = glC.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true }); } catch (e) { gl = null; }
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { console.warn('rain: shader failed — the 2D rain takes the desk', e); gl = null; return false; }
    gl.useProgram(prog);
    ['uRes', 'uP', 'uT', 'uSig', 'uDpr', 'uTop', 'uFloor', 'uSlot', 'uAJ', 'uR', 'uFall', 'uInk'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
    N = cfg.count || 4200;
    const data = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const o = i * 6;
      data[o] = rnd(); data[o + 1] = rnd(); data[o + 2] = 0.82 + rnd() * 0.36; data[o + 3] = 1.9 + rnd() * 1.3 + (rnd() < 0.06 ? 1.1 : 0);
      data[o + 4] = i * 0.731 + rnd() * 0.2; data[o + 5] = 0.66 + rnd() * 0.26;
    }
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'aA'), b = gl.getAttribLocation(prog, 'aB');
    gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(b); gl.vertexAttribPointer(b, 2, gl.FLOAT, false, 24, 16);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    const c = hex3(ink); gl.uniform3f(U.uInk, c[0], c[1], c[2]);
    return true;
  };

  // --- the 2D rain: the same law, on the CPU -------------------------------------------
  let ctx2 = null, P = [];
  const init2D = () => {
    ctx2 = glC.getContext('2d'); if (!ctx2) return false;
    const n = cfg.count2d || 600;
    for (let i = 0; i < n; i++) P.push({ a: rnd(), ph: rnd(), sp: 0.82 + rnd() * 0.36, sz: (cfg.big ? 2.1 : 1.5) + rnd() * (cfg.big ? 1.5 : 1), al: 0.6 + rnd() * 0.25, s: rnd() < 0.5 ? -1 : 1, r1: rnd(), r2: rnd(), u: rnd() - 0.5, c: -1, b: new Int8Array(ROWS), tot: 0 });
    return true;
  };

  // --- the landing law, by mode ----------------------------------------------------------
  // 'ledger' is the doctrine in one picture: the west bank's rain is pinned to a single slot; the east bank's keeps the whole distribution
  const LW = 0.27, LE = 0.73, LS = 0.085;
  const centre = (s, t) => mode === 'ledger' ? S.W * (s < 0 ? LW : LE) : mode === 'mirror' ? S.slot + s * (cfg.split || 0.2) * S.W : mode === 'wash' ? S.slot + S.W * 0.09 * Math.sin(t * 0.21) : S.slot;
  const sigma = (t, s) => (mode === 'ledger' ? (s < 0 ? 0 : LS) : mode === 'wash' ? 0.13 + 0.05 * Math.sin(t * 0.63 + 1) : S.sig) * S.W;
  const entry = (a, s, land) => mode === 'pinned' ? (a * 1.1 - 0.05) * S.W
    : mode === 'ledger' ? (s < 0 ? 0.02 + a * 0.46 : 0.52 + a * 0.46) * S.W
    : mode === 'mirror' ? S.slot - s * (cfg.split || 0.2) * S.W * 1.15 + (a - 0.5) * 0.3 * S.W   // enters on the far side: the streams cross
    : land + (a - 0.5) * 0.5 * S.W;

  // a fixed panel of sample trajectories, for the books
  const M = 420, smp = [];
  for (let i = 0; i < M; i++) {
    let tot = 0; for (let k = 0; k < ROWS; k++) tot += rnd() < 0.5 ? -1 : 1;
    smp.push({ a: (i + rnd()) / M, n: tot * NORM + (rnd() - 0.5) * 0.58, s: i % 2 ? 1 : -1, r1: rnd(), r2: rnd() });
  }

  const measure = () => {
    S.W = stage.clientWidth; S.H = stage.clientHeight; S.dpr = Math.min(2, window.devicePixelRatio || 1);
    S.top = -0.03 * S.H; S.floor = S.H * (cfg.floor || 0.78);
    S.slot = S.W * (cfg.slot == null ? 0.5 : cfg.slot);
    if (cfg.slotEl) { const a = cfg.slotEl.getBoundingClientRect(), b = stage.getBoundingClientRect(); if (a.width) S.slot = a.left + a.width / 2 - b.left; }
    S.R = Math.min(cfg.radius || 140, S.W * 0.34); S.AJ = clamp(S.W * 0.014, 7, 15) * (cfg.jitter || 1);
    [glC, hiC].forEach(c => { const w = Math.max(2, Math.round(S.W * S.dpr)), h = Math.max(2, Math.round(S.H * S.dpr)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } });
    const nb = 2 * Math.floor(S.W / (cfg.bin || 12)) + 1;
    if (nb !== S.nb) { S.nb = nb; S.hist = new Float32Array(nb); S.tgt = new Float32Array(nb); S.defl = new Float32Array(nb); S.fresh = true; }
    S.bw = S.W / S.nb;
    if (gl) gl.viewport(0, 0, glC.width, glC.height);
  };

  // --- conservation: where the mass lands this instant ----------------------------------
  const settle = (t, dt) => {
    const { tgt, defl, nb, bw } = S;
    tgt.fill(0); defl.fill(0);
    const vp = clamp((S.py - S.top) / (S.floor - S.top), 0, 1);
    let free = 0;
    for (let i = 0; i < M; i++) {
      const q = smp[i];
      let w = 0, xp = 0, d = 0;
      if (S.pk > 0.01) {
        const land = centre(q.s, t) + sigma(t, q.s) * q.n, a0 = entry(q.a, q.s, land);
        xp = land + (a0 - land) * FUN(vp); d = (xp - S.px) / S.R;
        w = (1 - sstep(0.35, 1, Math.abs(d))) * S.pk;
      }
      free += 1 - w;
      if (w > 0) {
        const x = xp + (q.r2 - 0.5) * 1.4 * S.R + (d >= 0 ? 1 : -1) * S.R * (0.35 + 0.55 * q.r1);
        const fb = clamp(x / bw - 0.5, 0, nb - 1.001), b0 = Math.floor(fb), fr = fb - b0;
        defl[b0] += w * (1 - fr); defl[b0 + 1] += w * fr;
      }
    }
    for (let pass = 0; pass < 2; pass++) { let prev = 0; for (let b = 0; b < nb; b++) { const cur = defl[b], nx = b + 1 < nb ? defl[b + 1] : 0; defl[b] = (prev + 2 * cur + nx) / 4; prev = cur; } }
    // the scheduled share, analytically
    const modes = mode === 'mirror' || mode === 'ledger' ? [-1, 1] : [0];
    for (const s of modes) {
      const c = centre(s, t), share = free / M / modes.length, sg = sigma(t, s);
      if (sg < bw * 0.45) { tgt[clamp(Math.floor(c / bw), 0, nb - 1)] += share; continue; }
      let sum = 0; const lo = Math.max(0, Math.floor((c - 4 * sg) / bw)), hi = Math.min(nb - 1, Math.ceil((c + 4 * sg) / bw));
      for (let b = lo; b <= hi; b++) { const z = ((b + 0.5) * bw - c) / sg; sum += Math.exp(-0.5 * z * z); }
      for (let b = lo; b <= hi; b++) { const z = ((b + 0.5) * bw - c) / sg; tgt[b] += share * Math.exp(-0.5 * z * z) / sum; }
    }
    const k = S.fresh ? 1 : 1 - Math.exp(-dt / 0.45); S.fresh = false;
    let total = 0;
    for (let b = 0; b < nb; b++) { S.hist[b] += (tgt[b] + defl[b] / M - S.hist[b]) * k; total += S.hist[b]; }
    if (total > 0) for (let b = 0; b < nb; b++) S.hist[b] /= total;    // the ledger always balances
    return 1 - free / M;
  };

  const hctx = hiC.getContext('2d');
  const drawHist = () => {
    const { W, H, dpr, nb, bw, floor } = S, c = hctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const maxH = (H - floor) * (cfg.depth || 0.74);
    // the hero is read on an absolute (root) scale so the spike can visibly thin; the strips are read against their own undisturbed peak
    const ref = mode === 'pinned' ? 0 : (mode === 'mirror' || mode === 'ledger' ? 0.5 : 1) / (2.5066 * Math.max(0.4, (mode === 'ledger' ? LS : mode === 'wash' ? 0.13 : S.sig) * W / bw));
    const pin = mode === 'ledger' ? clamp(Math.floor(W * LW / bw), 0, nb - 1) : mode === 'pinned' ? clamp(Math.floor(S.slot / bw), 0, nb - 1) : -1;
    c.fillStyle = ink;
    c.globalAlpha = 0.72; c.fillRect(0, Math.round(floor), W, 1);
    c.globalAlpha = 0.5;
    const mid = (nb - 1) / 2;
    for (let b = 0; b < nb; b++) { const x = Math.round((b + 0.5) * bw), t = (b - mid) % 5 === 0 ? 7 : 3; c.fillRect(x, Math.round(floor) - t, 1, t); }
    for (let b = 0; b < nb; b++) {
      const m = S.hist[b]; if (m < 2e-4) continue;
      const h = maxH * (mode === 'ledger' ? (b === pin ? Math.pow(Math.min(1, m / 0.5), 0.42) : 0.62 * Math.min(1.12, m / ref)) : ref ? Math.min(1.12, m / ref) : Math.pow(m, 0.42));
      const x = b === pin ? (mode === 'ledger' ? W * LW : S.slot) : (b + 0.5) * bw, wide = b === pin ? 1.7 : 1;
      c.globalAlpha = 0.9; c.fillRect(x - wide / 2, Math.round(floor) + 1, wide, h);
      if (cfg.reflect) { c.globalAlpha = 0.2; c.fillRect(x - 0.5, Math.round(floor) - 7 - h * 0.6, 1, h * 0.6); }
    }
    c.globalAlpha = 1;
  };

  const draw2D = t => {
    const c = ctx2, { W, H, dpr } = S;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); c.fillStyle = ink;
    const vp = clamp((S.py - S.top) / (S.floor - S.top), 0, 1), fall = cfg.fall || 6;
    for (const q of P) {
      const cyc = q.ph + t / (fall * q.sp), cy = Math.floor(cyc), p = cyc - cy;
      if (cy !== q.c) { q.c = cy; q.tot = 0; for (let k = 0; k < ROWS; k++) { q.b[k] = rnd() < 0.5 ? -1 : 1; q.tot += q.b[k]; } q.tot *= NORM; q.u = rnd() - 0.5; q.r1 = rnd(); q.r2 = rnd(); if (mode === 'mirror') q.s = rnd() < 0.5 ? -1 : 1; }
      const v = p * (0.72 + 0.28 * p);
      let walk = 0, walkP = 0;
      for (let k = 0; k < ROWS; k++) { const e = k / ROWS; walk += q.b[k] * sstep(e, e + 0.06, v); walkP += q.b[k] * sstep(e, e + 0.06, vp); }
      walk *= NORM; walkP *= NORM;
      const land = centre(q.s, t) + sigma(t, q.s) * (q.tot + q.u * 0.58), a0 = entry(q.a, q.s, land);
      let x = land + (a0 - land) * FUN(v) + S.AJ * (walk - q.tot * v);
      if (S.pk > 0.01) {
        const xp = land + (a0 - land) * FUN(vp) + S.AJ * (walkP - q.tot * vp), d = (xp - S.px) / S.R;
        const w = (1 - sstep(0.35, 1, Math.abs(d))) * S.pk;
        if (w > 0) {
          const after = clamp((v - vp) / Math.max(1 - vp, 0.001), 0, 1);
          x = x + (xp + (q.r2 - 0.5) * 1.4 * S.R * after - x) * w * sstep(vp, vp + 0.05, v) + w * sstep(vp - 0.09, vp + 0.015, v) * (d >= 0 ? 1 : -1) * S.R * (0.35 + 0.55 * q.r1);
        }
      }
      const y = S.top + v * (S.floor - S.top);
      c.globalAlpha = q.al * sstep(0, 0.06, v) * (1 - sstep(0.988, 1, v));
      c.beginPath(); c.arc(x, y, q.sz * 0.5, 0, 6.2832); c.fill();
    }
    c.globalAlpha = 1;
    if (mode === 'ledger') drawChild(c, t);
  };

  // the exception: one drop, sent east to a marked slot, that never lands where it is sent
  const CH = { c: -1, off: 0 };
  const drawChild = (c, t) => {
    const per = 6.5, cyc = t / per, cy = Math.floor(cyc), p = cyc - cy, v = p * (0.72 + 0.28 * p);
    if (cy !== CH.c) { CH.c = cy; CH.off = (rnd() < 0.5 ? -1 : 1) * (0.05 + rnd() * 0.07) * S.W; }
    const xT = S.W * (LE - LS * 1.15), a0 = S.W * 0.66;
    const x = xT + (a0 - xT) * FUN(v) + CH.off * sstep(0.8, 1, v), y = S.top + v * (S.floor - S.top);
    c.fillStyle = cfg.child || '#3E7C6B'; c.strokeStyle = cfg.child || '#3E7C6B';
    c.globalAlpha = 0.9; c.fillRect(Math.round(xT) - 1, S.floor + 2, 2, 12);                      // where the schedule put her
    c.globalAlpha = sstep(0, 0.05, v) * (1 - sstep(0.985, 1, v)); c.beginPath(); c.arc(x, y, 3.6, 0, 6.2832); c.fill();
    c.globalAlpha *= 0.5; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 8.5 + 1.5 * Math.sin(t * 3), 0, 6.2832); c.stroke();
    if (v > 0.9) { const k = (v - 0.9) / 0.1; c.globalAlpha = 0.6 * (1 - k); c.beginPath(); c.arc(xT + CH.off, S.floor, 4 + k * 26, 3.1416, 6.2832); c.stroke(); }
    // the allocation: what the west bank's certainty costs, going east along the floor, on schedule
    c.fillStyle = ink;
    const x0 = S.W * LW + 8, x1 = S.W * (LE - LS * 2.4), span = x1 - x0, nD = Math.max(5, Math.round(span / 46));
    for (let i = 0; i < nD; i++) { const u = ((t * 0.045 + i / nD) % 1), x = x0 + u * span; c.globalAlpha = 0.6 * sstep(0, 0.1, u) * (1 - sstep(0.88, 1, u)); c.fillRect(x, S.floor + 6, 9, 1.6); }
    c.globalAlpha = 1;
  };

  const drawGL = t => {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uRes, S.W, S.H); gl.uniform3f(U.uP, S.px, S.py, S.pk);
    gl.uniform1f(U.uT, t); gl.uniform1f(U.uSig, S.sig); gl.uniform1f(U.uDpr, S.dpr);
    gl.uniform1f(U.uTop, S.top); gl.uniform1f(U.uFloor, S.floor); gl.uniform1f(U.uSlot, S.slot);
    gl.uniform1f(U.uAJ, S.AJ); gl.uniform1f(U.uR, S.R); gl.uniform1f(U.uFall, cfg.fall || 6);
    gl.drawArrays(gl.POINTS, 0, N);
  };

  if (!(wantGL && initGL()) && !init2D()) return null;
  measure();

  // --- what drives it: time, the pointer, the scroll --------------------------------------
  const local = (cx, cy) => { const r = stage.getBoundingClientRect(); return [cx - r.left, cy - r.top, cx >= r.left && cx <= r.right && cy >= r.top - 40 && cy <= r.bottom]; };
  const onMove = e => { const [x, y, inn] = local(e.clientX, e.clientY); S.px = x; S.py = y; S.pOn = inn; };
  const onTouch = e => { const t = e.touches[0]; if (!t) return; const [x, y, inn] = local(t.clientX, t.clientY); S.px = x; S.py = y; S.pOn = inn; S.tEnd = 0; };
  const onTouchEnd = () => { S.tEnd = performance.now(); };
  const onLeave = () => { S.pOn = false; };
  const onScroll = () => {
    if (!cfg.scroll) return;
    const r = stage.getBoundingClientRect(); S.progress = clamp(-r.top / (r.height * 0.55), 0, 1);
    S.sig = (cfg.sigma || 0) + (cfg.sigmaMax || 0.11) * sstep(0.04, 1, S.progress);
  };
  const onResize = () => { measure(); onScroll(); };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('touchstart', onTouch, { passive: true });
  window.addEventListener('touchmove', onTouch, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { S.vis = es[0].isIntersecting; }, { rootMargin: '80px' }) : null;
  if (io) io.observe(stage);
  const onLost = e => { e.preventDefault(); S.dead = true; stage.classList.remove('live'); };
  glC.addEventListener('webglcontextlost', onLost);
  onScroll();

  const t0 = performance.now();
  const frame = now => {
    S.raf = requestAnimationFrame(frame);
    if (S.dead || document.hidden || !S.vis) { S.last = now; return; }
    const t = (now - t0) / 1000, dt = Math.min(0.1, (now - (S.last || now)) / 1000); S.last = now;
    if (S.tEnd && now - S.tEnd > 900) { S.pOn = false; S.tEnd = 0; }
    S.pk += ((S.pOn ? 1 : 0) - S.pk) * (1 - Math.exp(-dt / (S.pOn ? 0.18 : 0.5)));
    if (gl) drawGL(t); else draw2D(t);
    const D = settle(t, dt);
    drawHist();
    if (!S.painted) { S.painted = true; stage.classList.add('live'); }
    if (cfg.onState && now - S.lastEmit > 90) {
      S.lastEmit = now;
      cfg.onState({ progress: S.progress, displaced: D, slotMass: S.hist[mode === 'pinned' || mode === 'ledger' ? clamp(Math.floor((mode === 'ledger' ? S.W * LW : S.slot) / S.bw), 0, S.nb - 1) : (S.nb - 1) / 2], present: S.pk > 0.05, sigma: sigma(t) / S.W, centre: (centre(0, t) - S.slot) / S.W });
    }
  };
  S.raf = requestAnimationFrame(frame);

  return {
    webgl: !!gl,
    poke(x, y, on) { S.px = x; S.py = y; S.pOn = on; if (on) S.pk = 1; },   // test hook: place the visitor
    destroy() {
      cancelAnimationFrame(S.raf); if (io) io.disconnect();
      window.removeEventListener('pointermove', onMove); window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('touchmove', onTouch); window.removeEventListener('touchend', onTouchEnd);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize);
      glC.removeEventListener('webglcontextlost', onLost);
    }
  };
}
