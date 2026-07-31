/* gl.js — single shared WebGL context for every shader effect.
   Layers, all drawn into one fixed full-viewport canvas (#glfx, z:0):
     1. field   — the "world-lines" background, whole viewport, <5% weight
     2. erode   — temporal-erosion titles (DOM text stays real underneath)
     3. cover   — per-book signature treatment over cover <img>s
   Real DOM text/images are only ghosted AFTER a frame has rendered. */

import * as sched from './scheduler.js';

const VERT = `
attribute vec2 p; varying vec2 vUv;
void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

const NOISE = `
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<3;i++){ v+=a*vnoise(p); p*=2.03; a*=.5; } return v; }`;

const FIELD_FRAG = `
precision mediump float; varying vec2 vUv;
uniform float uTime,uScroll,uQ; uniform vec2 uRes; uniform vec3 uAccent;
${NOISE}
void main(){
  vec2 p = vUv * vec2(uRes.x/uRes.y, 1.0);
  float t = uTime*0.03 + uScroll*0.25;
  // nebula: two slow cloud layers — warm gold dust and a cold indigo
  // vein — drifting against each other; dark, but never flat
  float nb1 = fbm(p*1.15 + vec2(t*0.16, -t*0.11));
  float nb2 = fbm(p*2.35 - vec2(t*0.10, t*0.06) + nb1*1.1);
  vec3 nebula = uAccent * pow(nb1, 2.4) * 0.11
              + vec3(0.16,0.22,0.36) * pow(nb2, 2.8) * 0.12;
  // world-lines: slow horizontal filaments, dragged by scroll
  float warp = fbm(p*vec2(0.7,2.2) + vec2(t*0.55, 0.0));
  float n = fbm(p*vec2(1.6,7.0) + vec2(-t*0.35, warp*1.4));
  float lines = smoothstep(0.62, 0.98, n);
  // sparse slow "instants" (star points)
  vec2 g = floor(p*140.0);
  float h = hash(g);
  float star = step(0.998, h) * (0.35 + 0.65*(0.5+0.5*sin(uTime*1.4+h*70.0)));
  vec3 col = nebula
           + uAccent * lines * (0.05 + uScroll*0.06)
           + vec3(0.93,0.87,0.78) * star * 0.14;
  float vig = smoothstep(1.25, 0.35, length(vUv-0.5));
  col *= vig;
  gl_FragColor = vec4(col, 1.0); // additive blend
}`;

const ERODE_FRAG = `
precision mediump float; varying vec2 vUv;
uniform sampler2D uTex; uniform float uTime,uStress,uGlitch,uSeed,uStatic;
uniform vec2 uRes; uniform vec3 uColor,uAccent;
${NOISE}
void main(){
  vec2 uv = vUv;
  if(uGlitch > 0.5){
    float band = step(0.5, fract(uv.y*6.0 + uSeed*3.1));
    uv.x += (band - 0.5) * 0.014;
  }
  float asp = uRes.x/max(uRes.y,1.0);
  float t = uTime*0.06*(1.0-uStatic);
  float n = fbm(uv*vec2(asp,1.0)*7.0 + uSeed*17.0 + vec2(t, -t*0.6));
  float ca = 0.0008 + uStress*0.0035 + uGlitch*0.0028;
  float ar = texture2D(uTex, uv + vec2(ca, 0.0)).a;
  float ag = texture2D(uTex, uv).a;
  float ab = texture2D(uTex, uv - vec2(ca, 0.0)).a;
  // noise erodes EDGES only — glyph cores stay solid, titles stay readable
  float bite = 0.07 + uStress*0.30 + uGlitch*0.16;
  float e0 = n*bite, e1 = e0 + 0.34;
  float tr = smoothstep(e0, e1, ar);
  float tg = smoothstep(e0, e1, ag);
  float tb = smoothstep(e0, e1, ab);
  float a = max(tr, max(tg, tb));
  float shimmer = 0.97 + 0.03*vnoise(uv*40.0 + uTime*0.5);
  vec3 col = uColor*tg + uAccent*abs(tr-tb)*0.5;
  gl_FragColor = vec4(col*shimmer, a*shimmer);
}`;

const COVER_FRAG = `
precision mediump float; varying vec2 vUv;
uniform sampler2D uTex; uniform float uTime,uHover,uSeed,uMirror,uMirrorK;
uniform vec2 uRes,uFit,uMouse; uniform vec3 uAccent;
${NOISE}
void main(){
  // mirror: sample the source cover reflected about its bottom edge
  vec2 base = uMirror > 0.5 ? vec2(vUv.x, (1.0 - vUv.y) * uMirrorK) : vUv;
  vec2 uv = (base - 0.5) * uFit * (1.0 - 0.045*uHover) + 0.5;
  uv += uMouse * 0.02 * (0.3 + 0.7*uHover);
  // RGB split peaks mid-reveal, settles clean at both ends
  float tr2 = uHover * (1.0 - uHover) * 4.0;
  float ang = uSeed*6.2831;
  vec2 off = vec2(cos(ang), sin(ang)) * (0.0018 + 0.010*tr2);
  vec3 col;
  col.r = texture2D(uTex, uv + off).r;
  col.g = texture2D(uTex, uv).g;
  col.b = texture2D(uTex, uv - off).b;
  // at rest: a deep duotone plate — highlights crushed so the art (and
  // its own typeset title) sinks to texture and the rained-in canvas
  // title carries the name; hover clears the plate to the original art
  float luma = dot(col, vec3(0.299,0.587,0.114));
  float shaped = smoothstep(0.04, 1.55, luma);
  vec3 duo = mix(vec3(0.05,0.045,0.04), uAccent*0.85, shaped);
  float g = (0.78 + 0.08*fract(uSeed*5.7)) * (1.0 - 0.97*uHover);
  col = mix(col, duo, g);
  col *= 0.72 + 0.28*uHover;
  float grain = (hash(vUv*uRes + fract(uTime)*7.0) - 0.5) * (0.05*(1.0-0.6*uHover) + 0.04*fract(uSeed*3.3));
  col += grain;
  col *= smoothstep(1.5, 0.42, length(vUv-0.5));
  float a = uMirror > 0.5 ? pow(clamp(vUv.y, 0.0, 1.0), 1.5) * 0.30 : 1.0;
  gl_FragColor = vec4(col * a, a);
}`;

let gl = null, canvas = null, W = 0, H = 0, DPR = 1;
const progs = {};
const effects = [];
let scrollS = 0, lastY = 0, burstV = 0;
let nextGlitch = 4;
let staticMode = false;
let removeLoop = null;

function compile(fsrc) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

function hex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || '');
  if (!m) return [0.84, 0.68, 0.37];
  const v = parseInt(m[1], 16);
  return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
}

function resize() {
  DPR = sched.dpr();
  W = Math.round(innerWidth * DPR); H = Math.round(innerHeight * DPR);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W; canvas.height = H;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  }
}

/* ---- init ---- */
export function init({ statics = false } = {}) {
  if (gl) return true;
  staticMode = statics;
  canvas = document.createElement('canvas');
  canvas.id = 'glfx'; canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true })
    || canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) { canvas.remove(); document.documentElement.classList.add('no-webgl'); return false; }

  try {
    progs.field = compile(FIELD_FRAG);
    progs.erode = compile(ERODE_FRAG);
    progs.cover = compile(COVER_FRAG);
  } catch (e) {
    console.warn('shader compile failed', e);
    canvas.remove(); document.documentElement.classList.add('no-webgl'); gl = null; return false;
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  canvas.addEventListener('webglcontextlost', ev => {
    ev.preventDefault(); teardown();
  });

  resize();
  addEventListener('resize', () => { resize(); queueReraster(); }, { passive: true });
  addEventListener('scroll', () => {}, { passive: true });

  if (staticMode) {
    // designed stillness: one composed frame, no loop
    requestAnimationFrame(() => renderFrame(11.7, 0));
    document.fonts?.ready.then(() => { rerasterAll(); });
  } else {
    removeLoop = sched.add((t, dt) => renderFrame(t, dt));
    sched.onQuality(() => { resize(); });
  }
  // late-arriving fonts (fetch_fonts.py subsets or the dev shim) re-raster titles
  document.fonts?.addEventListener?.('loadingdone', queueReraster);
  return true;
}

function teardown() {
  removeLoop && removeLoop();
  document.querySelectorAll('.fx-ghost').forEach(el => el.classList.remove('fx-ghost'));
  document.querySelectorAll('.fx-cover-live').forEach(el => el.classList.remove('fx-cover-live'));
  canvas && canvas.remove();
  document.documentElement.classList.add('no-webgl');
  gl = null;
}

/* ---- shared frame ---- */
function renderFrame(t, dt) {
  if (!gl) return;
  resizeCheck();
  // scroll stress: velocity-normalized, eased, plus transition bursts
  const y = scrollY;
  const v = Math.min(0.6, Math.abs(y - lastY) / (innerHeight * 1.6));
  lastY = y;
  scrollS += (v - scrollS) * (v > scrollS ? 0.16 : 0.045);
  burstV = Math.max(0, burstV - dt * 2.2);
  const stress = Math.min(1, scrollS + burstV);

  let glitch = 0;
  if (!staticMode && t > nextGlitch) { glitch = 1; nextGlitch = t + 4 + Math.random() * 6; }

  gl.viewport(0, 0, W, H);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);

  // 1 — field (additive, whole viewport)
  const f = progs.field;
  gl.useProgram(f.p);
  bindQuad(f.p);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.uniform1f(f.u.uTime, t);
  gl.uniform1f(f.u.uScroll, staticMode ? 0 : stress);
  gl.uniform1f(f.u.uQ, sched.getQuality());
  gl.uniform2f(f.u.uRes, W, H);
  const acc = hex(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  gl.uniform3f(f.u.uAccent, acc[0], acc[1], acc[2]);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // proximity typography on erosion titles: ease the warp amplitude and
  // re-raster while it changes (one title warps at a time — cheap)
  for (const e of effects) {
    if (e.type !== 'erode' || e.warpAmp === undefined) continue;
    const prev = e.warpAmp;
    e.warpAmp += ((e.warpOn ? 1 : 0) - e.warpAmp) * 0.22;
    if (Math.abs(e.warpAmp - prev) > 0.004 || (e.warpOn && e.warpDirty)) {
      e.warpDirty = false;
      e.raster();
    }
  }

  // 2+3 — element-scoped effects
  gl.enable(gl.SCISSOR_TEST);
  for (const e of effects) {
    if (!(e.src ? e.src.ready : e.ready)) continue;
    if (e.released && !e.src) continue;      // handed back to the DOM <img>
    const r = e.el.getBoundingClientRect();
    if (r.bottom < -60 || r.top > innerHeight + 60 || r.width === 0) continue;
    const pad = e.type === 'erode' ? e.pad : 0;
    const x = (r.left - pad) * DPR, w = (r.width + pad * 2) * DPR;
    const yTop = (r.top - pad) * DPR, h = (r.height + pad * 2) * DPR;
    const yGl = H - yTop - h;
    gl.viewport(x, yGl, w, h);
    gl.scissor(Math.max(0, x), Math.max(0, yGl), w, h);
    if (e.type === 'erode') drawErode(e, t, stress, glitch, w, h);
    else drawCover(e, t, dt, w, h);
    if (!e.ghosted) { e.ghosted = true; e.ghost(); }
  }
}

function resizeCheck() {
  if (Math.round(innerWidth * DPR) !== W || Math.round(innerHeight * DPR) !== H) resize();
}

function bindQuad(p) {
  const loc = gl.getAttribLocation(p, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

function drawErode(e, t, stress, glitch, w, h) {
  const pr = progs.erode;
  gl.useProgram(pr.p); bindQuad(pr.p);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, e.tex);
  gl.uniform1i(pr.u.uTex, 0);
  gl.uniform1f(pr.u.uTime, t);
  gl.uniform1f(pr.u.uStress, staticMode ? 0.12 : stress);
  gl.uniform1f(pr.u.uGlitch, glitch);
  gl.uniform1f(pr.u.uSeed, e.seed);
  gl.uniform1f(pr.u.uStatic, staticMode ? 1 : 0);
  gl.uniform2f(pr.u.uRes, w, h);
  gl.uniform3f(pr.u.uColor, e.color[0], e.color[1], e.color[2]);
  gl.uniform3f(pr.u.uAccent, e.accent[0], e.accent[1], e.accent[2]);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawCover(e, t, dt, w, h) {
  const pr = progs.cover;
  const S = e.src || e;
  if (!e.src) S.hoverS += ((S.hover ? 1 : 0) - S.hoverS) * Math.min(1, (dt || 0.06) * (S.rate || 7));
  let mk = 0;
  if (e.src) {
    const mr = e.el.getBoundingClientRect(), sr = S.el.getBoundingClientRect();
    mk = sr.height ? mr.height / sr.height : 0.3;
  }
  gl.useProgram(pr.p); bindQuad(pr.p);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, S.tex);
  gl.uniform1i(pr.u.uTex, 0);
  gl.uniform1f(pr.u.uTime, staticMode ? 3.3 : t);
  // designed stillness shows the true art — a plate nobody can lift is a wall
  gl.uniform1f(pr.u.uHover, staticMode ? 1 : S.hoverS);
  gl.uniform1f(pr.u.uSeed, S.seed);
  gl.uniform1f(pr.u.uMirror, e.src ? 1 : 0);
  gl.uniform1f(pr.u.uMirrorK, mk);
  gl.uniform2f(pr.u.uRes, w, h);
  gl.uniform2f(pr.u.uFit, S.fit[0], S.fit[1]);
  gl.uniform2f(pr.u.uMouse, S.mouse[0], S.mouse[1]);
  gl.uniform3f(pr.u.uAccent, S.accent[0], S.accent[1], S.accent[2]);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // once a pinned reveal has fully cleared, hand the box back to the real
  // <img> (identical pixels) so CSS can tilt it in 3D — and stop drawing
  if (!e.src && S.pinned && !S.released && S.hoverS > 0.985) {
    S.released = true;
    S.el.classList.remove('fx-cover-live');
  }
}

/* ---- erosion titles ---- */
export function registerErosion(el, accentHex) {
  if (!gl) return;
  const e = {
    type: 'erode', el, pad: 0, seed: seedOf(el.textContent),
    color: hex('#EDE6DC'), accent: hex(accentHex),
    tex: gl.createTexture(), ready: false, ghosted: false,
    ghost: () => el.classList.add('fx-ghost'),
  };
  setupTex(e.tex);
  e.raster = () => rasterizeText(e);
  document.fonts?.ready.then(e.raster);
  e.raster();
  // proximity typography: letters swell toward the cursor (fine pointers)
  if (!staticMode && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    e.warpAmp = 0; e.warpOn = false; e.warpX = 0; e.warpDirty = false;
    el.addEventListener('pointermove', ev => {
      const r = el.getBoundingClientRect();
      e.warpOn = true;
      e.warpX = (ev.clientX - r.left + e.pad) * DPR;
      e.warpDirty = true;
    }, { passive: true });
    el.addEventListener('pointerleave', () => { e.warpOn = false; });
  }
  effects.push(e);
}

function rasterizeText(e) {
  const el = e.el, cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  e.pad = Math.min(48, Math.max(16, r.height * 0.18));
  const dpr = DPR;
  const cw = Math.round((r.width + e.pad * 2) * dpr), ch = Math.round((r.height + e.pad * 2) * dpr);
  const c = document.createElement('canvas');
  c.width = Math.min(4096, cw); c.height = Math.min(4096, ch);
  const x = c.getContext('2d');
  const size = parseFloat(cs.fontSize);
  x.font = `${cs.fontWeight} ${size * dpr}px ${cs.fontFamily}`;
  if ('letterSpacing' in x) x.letterSpacing = (parseFloat(cs.letterSpacing) || 0) * dpr + 'px';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#fff';
  // replicate wrapping: same font, same box width
  const words = (el.textContent || '').trim().split(/\s+/);
  const maxW = r.width * dpr;
  const lines = [];
  let line = '';
  for (const wd of words) {
    const test = line ? line + ' ' + wd : wd;
    if (line && x.measureText(test).width > maxW) { lines.push(line); line = wd; }
    else line = test;
  }
  if (line) lines.push(line);
  const lh = (parseFloat(cs.lineHeight) || size * 1.1) * dpr;
  const alignC = cs.textAlign === 'center';
  const warp = e.warpAmp && e.warpAmp > 0.02 ? e.warpAmp : 0;
  const sigma = size * dpr * 2.1;
  lines.forEach((ln, i) => {
    const wpx = x.measureText(ln).width;
    const lx = e.pad * dpr + (alignC ? (maxW - wpx) / 2 : 0);
    const ly = e.pad * dpr + i * lh + size * dpr * 0.8;
    if (!warp) { x.fillText(ln, lx, ly); return; }
    // per-glyph pass: letters near the cursor widen, the rest tighten
    let cx = 0;
    for (const ch of ln) {
      const w = x.measureText(ch).width;
      const d = (lx + cx + w / 2) - e.warpX;
      const sx = 1 + warp * (0.46 * Math.exp(-(d * d) / (sigma * sigma)) - 0.045);
      x.save();
      x.translate(lx + cx, ly);
      x.scale(sx, 1);
      x.fillText(ch, 0, 0);
      x.restore();
      cx += w * sx;
    }
  });
  gl.bindTexture(gl.TEXTURE_2D, e.tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  e.ready = true;
}

let rerTimer = 0;
function queueReraster() {
  clearTimeout(rerTimer);
  rerTimer = setTimeout(rerasterAll, 160);
}
function rerasterAll() {
  effects.forEach(e => { if (e.type === 'erode') { e.ghosted = false; e.el.classList.remove('fx-ghost'); e.raster(); } });
  if (staticMode) requestAnimationFrame(() => renderFrame(11.7, 0));
}

/* ---- per-book cover treatment ---- */
export function registerCover(box, accentHex, seedStr) {
  if (!gl) return;
  const img = box.querySelector('img');
  if (!img) return;
  const e = {
    type: 'cover', el: box, seed: seedOf(seedStr || box.dataset.book || 'x'),
    accent: hex(accentHex), tex: gl.createTexture(),
    ready: false, ghosted: false, hover: false, hoverS: 0,
    rate: 7, pinned: false,
    mouse: [0, 0], fit: [1, 1],
    ghost: () => box.classList.add('fx-cover-live'),
  };
  setupTex(e.tex);
  const upload = () => {
    if (!img.naturalWidth) return;
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    const br = box.getBoundingClientRect();
    const ia = img.naturalWidth / img.naturalHeight, ba = br.width / Math.max(1, br.height);
    e.fit = ia > ba ? [ba / ia, 1] : [1, ia / ba]; // object-fit: cover
    e.ready = true;
  };
  if (img.complete && img.naturalWidth) upload();
  else img.addEventListener('load', upload, { once: true });
  if (!staticMode) {
    // interim plates (data-plate) hold their veil — hover never lifts it
    if (box.dataset.plate !== '1') {
      box.addEventListener('pointerenter', () => { e.hover = true; });
    }
    box.addEventListener('pointerleave', () => {
      if (!e.pinned) e.hover = false;        // a pinned reveal never re-veils
      e.mouse = [0, 0];
    });
    box.addEventListener('pointermove', ev => {
      const r = box.getBoundingClientRect();
      e.mouse = [(ev.clientX - r.left) / r.width - 0.5, (ev.clientY - r.top) / r.height - 0.5];
    }, { passive: true });
  }
  effects.push(e);
}

/** external reveal control for a registered cover — covertitle.js drives
    the permanent reveal: opts.pin makes it one-way, opts.rate sets how
    fast the veil clears (slow scroll-reveal vs quick hover) */
export function setCoverHover(box, on, opts) {
  if (!gl) return;
  const e = effects.find(x => x.el === box && x.type === 'cover' && !x.src);
  if (!e) return;
  e.hover = !!on;
  if (opts && opts.rate) e.rate = opts.rate;
  if (opts && opts.pin) e.pinned = true;
}

/** reflection strip below a registered cover: same texture, mirrored,
    fading out — shares the source's hover state */
export function registerMirror(el, forBox) {
  if (!gl) return;
  const src = effects.find(x => x.el === forBox && x.type === 'cover' && !x.src);
  if (!src) return;
  effects.push({ type: 'cover', el, src, ghosted: true, ghost: () => {} });
}

function setupTex(tex) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
}

function seedOf(s) {
  let h = 2166136261;
  for (let i = 0; i < (s || '').length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

/** transition hook: spike temporal stress (dissolve), decays on its own */
export function burst() { burstV = 1; }
/** one-frame phase glitch on the next rendered frame */
export function pulse() { nextGlitch = 0; }
export function active() { return !!gl; }
