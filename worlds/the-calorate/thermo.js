// thermo.js — shared engine for the Calorate pages.
//   1. RETAIL      the one map of retail links; it drives every buy control on the site
//   2. mountThermo the conserved-heat WebGL field (pages supply their own GLSL)
//   3. mountPlate  a scene plate (assets/scenes/) with the heat law acting on it
//   4. mountHearth the buy area as the one warm thing on a cold page
// One law runs through all of it: heat is never created, only moved.
// WebGL contexts: a page opens at most two, once, and keeps them — the hero's own (own: true) and
// one shared by every plate, the sea and the hearth. Nothing is ever released and re-made.

// ── 1. RETAIL ──────────────────────────────────────────────────────────────────────────
// The one place a retail link is added. Put an edition's URL between its quotes and every
// page follows on its next load: that edition's tile turns from a dashed "Coming" chip into
// a solid button, and the book's main buttons (hero, landing card, closing shelf, the bar)
// switch from "See the book at Orb & Ink" to the plain-verb label below. Leave an edition
// empty and it stays "Coming". `imprint` is the book's page in the Orb & Ink catalogue.
// (The markup carries today's state as the no-script fallback, and each book page's JSON-LD
// lists its live offer by hand — worth a second edit when a book's first edition goes live.)
export const RETAIL = {
  'linewalker': {
    imprint: 'https://orbandink.co.uk/en/books/linewalker/',
    ebook: 'https://www.amazon.com/dp/B0HF13VNMR',
    paperback: 'https://www.amazon.com/dp/1919140018',
    hardcover: 'https://www.amazon.com/dp/1919140026',
    audiobook: '',
    immersive: '',
    drama: '',
    graphic: '',
  },
  'the-golden-shore': {
    imprint: 'https://orbandink.co.uk/en/books/the-golden-shore/',
    ebook: '',
    paperback: '',
    hardcover: '',
    audiobook: '',
    immersive: '',
    drama: '',
    graphic: '',
  },
  'the-even-cold': {
    imprint: 'https://orbandink.co.uk/en/books/the-even-cold/',
    ebook: '',
    paperback: '',
    hardcover: '',
    audiobook: '',
    immersive: '',
    drama: '',
    graphic: '',
  },
};
// what a live button says — a verb a stranger understands; the survey voice rides underneath
const VERB = {
  ebook: 'Buy the e-book',
  paperback: 'Buy the paperback',
  hardcover: 'Buy the hardcover',
  audiobook: 'Listen to the audiobook',
  immersive: 'Listen to the immersive audiobook',
  drama: 'Listen to the audio drama',
  graphic: 'Buy the graphic novel',
};
const ORDER = ['ebook', 'paperback', 'hardcover', 'audiobook', 'immersive', 'drama', 'graphic']; // a book's main button offers its first live edition, in this order
const SEE = 'See the book at Orb & Ink';
// labels are our own constants; a hyphenated word (e-book) is kept whole so it never breaks at the hyphen
const whole = (s) => s.replace(/&/g, '&amp;').replace(/(\S+-\S+)/g, '<span class="nb">$1</span>');

// Markup contract (see any page):
//   <a class="buy" data-buy="<book>">             a book's main button; holds [data-buy-main] and, optionally,
//                                                 [data-buy-sub] with data-sub-live / data-sub-soon lines
//   <a class="buy" data-buy-imprint="<book>">     "See the book at Orb & Ink" beside a live button; shown only
//                                                 while some of the book's editions are live and others are not
//   <a class="ed" data-edition="<book> <key>">    one edition tile; holds [data-edition-state]
// .is-live is the solid, lit state; .is-soon the quiet dashed one. The CSS is in each page.
export function wireRetail(root) {
  root = root || document;
  const out = (a, url) => { a.setAttribute('href', url); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); };
  const mark = (el, live) => { el.classList.toggle('is-live', live); el.classList.toggle('is-soon', !live); };
  root.querySelectorAll('[data-buy]').forEach((a) => {
    const book = RETAIL[a.getAttribute('data-buy')];
    if (!book) return;
    const key = ORDER.find((k) => book[k]);
    const main = a.querySelector('[data-buy-main]'), sub = a.querySelector('[data-buy-sub]');
    out(a, key ? book[key] : book.imprint);
    mark(a, !!key);
    if (main) main.innerHTML = whole(key ? (a.getAttribute('data-live-label') || VERB[key]) : SEE);
    const line = sub && a.getAttribute(key ? 'data-sub-live' : 'data-sub-soon');
    if (line) sub.textContent = line;
  });
  root.querySelectorAll('[data-buy-imprint]').forEach((a) => {
    const book = RETAIL[a.getAttribute('data-buy-imprint')];
    if (!book) return;
    const live = ORDER.filter((k) => book[k]).length;
    out(a, book.imprint);
    a.hidden = !(live > 0 && live < ORDER.length);
  });
  root.querySelectorAll('[data-edition]').forEach((a) => {
    const [slug, key] = a.getAttribute('data-edition').split(' ');
    const url = RETAIL[slug] && RETAIL[slug][key];
    const label = a.querySelector('[data-edition-state]');
    if (url) out(a, url); else ['href', 'target', 'rel'].forEach((n) => a.removeAttribute(n));
    mark(a, !!url);
    if (label) label.innerHTML = whole(url ? VERB[key] : 'Coming');
  });
}

// ── 2. THE FIELD ───────────────────────────────────────────────────────────────────────
// Brush injections are balanced by a uniform subtraction across the whole field in the same
// frame. Pages supply their own GLSL (init / sim / display); this owns the plumbing: context,
// ping-pong targets, loop, pause off-screen and on hidden tabs, DPR cap, context loss.
// Optional: cfg.art (a loaded <img>, bound as sampler uArt for all three programs),
// cfg.alpha (a see-through canvas; the display shader writes premultiplied colour),
// cfg.uniforms(gl, program) for a scene's own uniforms, cfg.onFrame() once per drawn frame.
// Optional: cfg.own (this canvas gets its own context and is drawn to directly: heroes only).
const GL_OPTS = { premultipliedAlpha: true, antialias: false, depth: false, stencil: false };
// a context that can render to half-float targets, or null. A canvas keeps the first context type it
// is given, so the WebGL1 attempt needs a canvas of its own (make() supplies a fresh one when asked).
function acquire(make, alpha) {
  const opts = Object.assign({ alpha: !!alpha }, GL_OPTS);
  try {
    let canvas = make(), gl = canvas.getContext('webgl2', opts);
    if (gl && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) return { canvas, gl, isGL2: true, halfType: gl.HALF_FLOAT };
    if (gl) { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); canvas = make(true); } // webgl2 without float targets: give it back and start again on another canvas
    if (!canvas) return null;
    gl = canvas.getContext('webgl', opts);
    if (!gl) return null;
    const hf = gl.getExtension('OES_texture_half_float'); gl.getExtension('OES_texture_half_float_linear');
    if (!hf) return null;
    return { canvas, gl, isGL2: false, halfType: hf.HALF_FLOAT_OES };
  } catch (e) { return null; }
}
// The shared context: made on first need, never released. Each scene keeps its own programs and
// ping-pong targets in it, draws its frame into the context's off-page canvas and copies that to
// its own 2D canvas — so six living things on a page cost one context, which is what Safari on an
// iPhone wants.
let shared = null;
function sharedContext() {
  if (shared) return shared.gl ? shared : null;
  const got = acquire(() => { const c = document.createElement('canvas'); c.width = 16; c.height = 16; return c; }, true);
  shared = got ? Object.assign(got, { users: [] }) : { gl: null, users: [] };
  if (shared.gl) shared.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); shared.gl = null; shared.users.forEach((lose) => lose()); });
  return shared.gl ? shared : null;
}

export function mountThermo(canvas, cfg) {
  const VERT = 'attribute vec2 aP; varying vec2 vUv; void main(){ vUv=aP*0.5+0.5; gl_Position=vec4(aP,0.0,1.0); }';
  const own = !!cfg.own;
  let ctx = null, out2d = null;
  if (own) {
    let first = true;
    ctx = acquire((again) => { if (again || !first) return null; first = false; return canvas; }, cfg.alpha);
  } else {
    ctx = sharedContext();
    if (ctx) { try { out2d = canvas.getContext('2d'); } catch (e) { out2d = null; } if (!out2d) ctx = null; }
  }
  if (!ctx) return null;
  const gl = ctx.gl, isGL2 = ctx.isGL2, halfType = ctx.halfType, glCanvas = ctx.canvas;
  const SW = cfg.simW || 320, SH = cfg.simH || 180, aspect = SW / SH;
  const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const program = (fs) => { const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
  let pInit, pSim, pDisp, A, B, artTex = null;
  const mkTarget = () => {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, isGL2 ? gl.RGBA16F : gl.RGBA, SW, SH, 0, gl.RGBA, halfType, null);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete');
    return { tex, fbo };
  };
  // a scene's own inputs: the cover art on unit 1, then whatever the scene sets itself
  const extras = (p) => {
    if (artTex) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, artTex); gl.uniform1i(gl.getUniformLocation(p, 'uArt'), 1); gl.activeTexture(gl.TEXTURE0); }
    if (cfg.uniforms) cfg.uniforms(gl, p);
  };
  try {
    pInit = program(cfg.initFrag); pSim = program(cfg.simFrag); pDisp = program(cfg.dispFrag);
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    if (cfg.art) {
      artTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, artTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, cfg.art);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.activeTexture(gl.TEXTURE0);
    }
    A = mkTarget(); B = mkTarget();
    var drawQuad = (p, fbo, w, h, setup) => {
      gl.useProgram(p); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      const loc = gl.getAttribLocation(p, 'aP'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      if (setup) setup(p);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
  } catch (e) { console.warn('thermo: shader/fbo failed — static composition holds', e); return null; }
  const dpr = Math.min(1.5, window.devicePixelRatio || 1); // display DPR cap
  const resize = () => { const w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr)); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } };
  resize();
  window.addEventListener('resize', resize);
  drawQuad(pInit, A.fbo, SW, SH, extras);
  const st = { brush: { x: 0.5, y: 0.5, amp: 0 }, last: 0, cool: 0, coolTarget: 0, visible: true, dead: false, raf: 0, acc: 0, shown: 0 };
  const brushK = cfg.brushK || 700;
  const simStep = (amp) => {
    drawQuad(pSim, B.fbo, SW, SH, (p) => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.tex);
      gl.uniform1i(gl.getUniformLocation(p, 'uPrev'), 0);
      gl.uniform2f(gl.getUniformLocation(p, 'uTexel'), 1 / SW, 1 / SH);
      gl.uniform3f(gl.getUniformLocation(p, 'uBrush'), st.brush.x, st.brush.y, amp);
      gl.uniform1f(gl.getUniformLocation(p, 'uBrushMean'), amp * Math.PI / (brushK * aspect)); // conservation term
      gl.uniform1f(gl.getUniformLocation(p, 'uCool'), st.cool);
      gl.uniform1f(gl.getUniformLocation(p, 'uAspect'), aspect);
      extras(p);
    });
    const t = A; A = B; B = t;
  };
  const display = (time) => {
    const w = canvas.width, h = canvas.height;
    if (!own && (glCanvas.width < w || glCanvas.height < h)) { glCanvas.width = Math.max(glCanvas.width, w); glCanvas.height = Math.max(glCanvas.height, h); } // the shared canvas only ever grows
    drawQuad(pDisp, null, w, h, (p) => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.tex);
      gl.uniform1i(gl.getUniformLocation(p, 'uField'), 0);
      gl.uniform1f(gl.getUniformLocation(p, 'uTime'), time);
      gl.uniform1f(gl.getUniformLocation(p, 'uPulse'), (cfg.bpm || 58) / 360); // resting-heartbeat tempo
      gl.uniform1f(gl.getUniformLocation(p, 'uMotion'), cfg.reduced ? 0 : 1);
      gl.uniform1f(gl.getUniformLocation(p, 'uCool'), st.cool);
      gl.uniform1f(gl.getUniformLocation(p, 'uAspect'), aspect);
      extras(p);
    });
    if (!own) { // the frame sits in the lower-left corner of the shared canvas: copy it out
      if (cfg.alpha) out2d.clearRect(0, 0, w, h);
      out2d.drawImage(glCanvas, 0, glCanvas.height - h, w, h, 0, 0, w, h);
    }
  };
  const onLost = (e) => { if (e) e.preventDefault(); st.dead = true; if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; canvas.style.opacity = '0'; }; // the still picture under the canvas stands
  if (own) canvas.addEventListener('webglcontextlost', onLost); else ctx.users.push(onLost);
  const destroy = () => { if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; window.removeEventListener('resize', resize); canvas.removeEventListener('webglcontextlost', onLost); };
  if (cfg.reduced) { // one settled frame, no loop, no brush — redrawn only when the canvas is resized
    st.cool = cfg.settledCool || 0;
    for (let i = 0; i < 160; i++) simStep(0);
    const still = () => { if (st.dead) return; resize(); display(0); };
    still(); canvas.style.opacity = '1';
    window.addEventListener('resize', still);
    return { pointer() {}, setCoolTarget() {}, setVisible() {}, destroy, get dead() { return st.dead; } };
  }
  const t0 = performance.now(); let painted = false;
  const loop = (now) => {
    st.raf = requestAnimationFrame(loop);
    if (st.dead || document.hidden || !st.visible) return; // paused off-screen / hidden tab
    if (cfg.onFrame) cfg.onFrame();
    st.cool += (st.coolTarget - st.cool) * 0.02;
    const active = performance.now() - st.last < 160;
    const amp = active ? st.brush.amp : 0;
    simStep(amp * 0.5); simStep(amp * 0.5);
    if (amp !== 0) {
      st.acc += Math.abs(amp);
      const n = Math.round(st.acc * 60);
      if (n !== st.shown) { st.shown = n; if (cfg.onTherms) cfg.onTherms(n); }
    }
    display((now - t0) / 1000);
    if (!painted) { painted = true; canvas.style.opacity = '1'; }
  };
  st.raf = requestAnimationFrame(loop);
  return {
    pointer(x, y, amp) { st.brush.x = x; st.brush.y = y; st.brush.amp = amp; st.last = performance.now(); },
    setCoolTarget(v) { st.coolTarget = Math.max(st.coolTarget, v); }, // one-way: decisions are not refunds
    setVisible(b) { st.visible = b; },
    destroy,
    get dead() { return st.dead; }
  };
}

const io = (el, cb, opts) => { const o = new IntersectionObserver(cb, opts); o.observe(el); return o; };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── 3. LIVING PLATES ───────────────────────────────────────────────────────────────────
// A plate is a scene made for this site (assets/scenes/, printed in the site's inks: see
// assets/README.md) with the heat law acting on it. The field starts as the picture's own
// warmth: its ambers are hot, its blues are cold. A hand cannot add anything — it can only carry
// warmth from where it was to where it is — so rime opens behind a touch and amber light gathers
// under it, and the sum never changes. Reading on is the other force: each plate answers the
// scroll in the way its book does. And each has its own weather, which is never decoration:
//   fever  Linewalker        the Gradient draws warmth up and away; rime comes down the plate
//                            and only the vein and the stone's heart stay open. The vein lights
//                            the ice beside it at a resting pulse, isotherms walk out from it,
//                            spindrift blows across the plain, the aurora will not hold still
//   noon   The Golden Shore  a touch draws frost (cold is couture) and the warmth it displaces
//                            lands behind it; reading on, the administered noon pours in. The
//                            air shimmers; the shadows never move; only the frost glints
//   even   The Even Cold     whatever is offered spreads until nothing is left of it; reading on,
//                            the one red light is argued down toward the temperature of
//                            everything. Nothing else moves: that is the point
// Markup: <figure data-plate="fever" data-heart="x,y" data-horizon="y"> <img …> <canvas aria-hidden="true"> </figure>
// (heart = where the picture's warmth lives, horizon = where its ground ends, both in image
// coordinates from the top-left; horizon is optional). The <img> is the designed fallback: no
// WebGL, no script, or a lost context, and the still plate stands.
const MOOD = {
  // front: what reading on does to the moved-heat field D (t), given the picture's own warmth S and the front coming down it
  // src:   what in the picture throws light (it feeds the glow field G); lit: how strongly, in the display
  fever: { sign: 1, k: '0.17', hold: '0.010', bpm: 57, haze: '0.0', glow: 'vec3(1.0, 0.62, 0.24)', front: 't = mix(t, -0.34 * (1.0 - 0.85 * S), front * 0.030);', // the tithe: the cold pays first, the vein is kept open
    src: 'smoothstep(0.50, 0.92, S)', lit: '0.62',
    ambient: ' float dH = uHorizon - uv.y;' +
      ' if (dH > 0.0) { float z = 1.0 / (dH + 0.03); vec2 g = vec2((uv.x - 0.5) * uAspect * z * 3.0 + uTime * 0.5, z * 3.0);' + // the plain, in its own perspective: spindrift runs along it
      '   float n = vn(g) * vn(g * vec2(0.37, 0.31) + vec2(-uTime * 0.07, 4.0));' +
      '   float streak = smoothstep(0.26, 0.60, n) * smoothstep(0.0, 0.10, dH) * smoothstep(0.02, 0.10, a.b - a.r) * 0.10;' +
      '   a = mix(a, vec3(0.78, 0.86, 0.94) * (0.55 + lum(a)), streak); }' +
      ' else { float au = clamp((a.g - 0.5 * (a.r + a.b)) * 14.0, 0.0, 1.0) * smoothstep(0.0, 0.05, -dH);' + // the aurora: only where the plate is already green
      '   a += a * au * 0.6 * (vn(vec2(uv.x * 9.0 + uTime * 0.05, uv.y * 1.5 - uTime * 0.08)) - 0.45) * uMotion; }' },
  noon: { sign: -1, k: '0.15', hold: '0.008', bpm: 57, haze: '0.16', glow: 'vec3(1.0, 0.80, 0.42)', front: 't = mix(t, 0.52 * (1.0 - S), front * 0.018);', // noon pours in over whatever is cold
    src: '0.0', lit: '0.0',
    ambient: ' float ice = smoothstep(0.52, 0.86, lum(a)) * (1.0 - smoothstep(0.10, 0.34, warmth(a)));' + // frost in a hot country: it glints, slowly, a crystal at a time
      ' vec2 cell = floor(gl_FragCoord.xy / 2.0);' +
      ' a += vec3(1.0, 0.98, 0.94) * pow(0.5 + 0.5 * sin(uTime * 1.7 + hash(cell) * 6.2832), 24.0) * step(0.90, hash(cell + 3.1)) * ice * 0.55 * uMotion;' },
  even: { sign: 1, k: '0.24', hold: '0.005', bpm: 38, haze: '0.0', glow: 'vec3(0.92, 0.36, 0.26)', front: 't = mix(t, 0.10 - S, uCool * 0.035);', // everything is argued toward one temperature
    src: 'smoothstep(0.34, 0.80, S)', lit: '0.55 * (1.0 - 0.78 * uCool)', ambient: '' },
};
const PLATE_HEAD = 'precision highp float; varying vec2 vUv; uniform sampler2D uArt; uniform vec4 uArtXf; uniform float uAspect; uniform float uCool;' +
  ' vec3 art(vec2 uv){ return texture2D(uArt, clamp(uv, 0.0, 1.0) * uArtXf.xy + uArtXf.zw).rgb; }' +
  ' float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }' +
  ' float warmth(vec3 c){ return clamp((c.r - c.b) * 1.7 + (lum(c) - 0.45) * 0.5, 0.0, 1.0); }' + // amber is hot, blue is cold
  ' float frontAt(vec2 uv){ float e = 1.18 - uCool * 1.25; return smoothstep(e, e + 0.42, uv.y); }'; // the weather comes down from the top as the reader goes on

// The field holds two things. R is only what has been MOVED (D, signed): the picture's own warmth
// S is read from the art every time, so the plate at rest is exactly the picture, and D sums to
// what it began as. G is the light the picture's hot places throw: held at its sources, spreading
// and fading across the cold, so the vein lights the ice beside it and isotherms can be read off it.
function plateShaders(m) {
  const init = PLATE_HEAD + ' void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }';
  const sim = PLATE_HEAD + ' uniform sampler2D uPrev; uniform vec2 uTexel; uniform vec3 uBrush; uniform vec2 uFrom;' +
    ' void main(){ vec2 uv = vUv;' +
    ' vec2 c = texture2D(uPrev, uv).rg;' +
    ' vec2 l = texture2D(uPrev, uv - vec2(uTexel.x, 0.0)).rg; vec2 r = texture2D(uPrev, uv + vec2(uTexel.x, 0.0)).rg;' +
    ' vec2 d = texture2D(uPrev, uv - vec2(0.0, uTexel.y)).rg; vec2 u = texture2D(uPrev, uv + vec2(0.0, uTexel.y)).rg;' +
    ' vec2 lap = l + r + u + d - 4.0 * c;' +
    ' float t = (c.x + ' + m.k + ' * lap.x) * (1.0 - ' + m.hold + ');' + // it spreads, and the picture slowly reasserts itself
    ' float S = warmth(art(uv)); float front = frontAt(uv); ' + m.front +
    ' vec2 a = vec2(uAspect, 1.0);' +
    ' float d1 = distance(uv * a, uBrush.xy * a); float d0 = distance(uv * a, uFrom * a);' +
    ' t += uBrush.z * (exp(-d1 * d1 * 300.0) - exp(-d0 * d0 * 300.0));' + // carried, never created: taken from where the hand was, given where it is
    ' float g = max((c.y + 0.24 * lap.y) * 0.9955, ' + m.src + ');' + // light: held where the picture is hot, thinning across the cold
    ' gl_FragColor = vec4(clamp(t, -1.0, 1.0), clamp(g, 0.0, 1.0), 0.0, 1.0); }';
  const disp = PLATE_HEAD + ' uniform sampler2D uField; uniform float uTime; uniform float uPulse; uniform float uMotion; uniform vec2 uHeart; uniform float uHorizon;' +
    ' float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }' +
    ' float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }' +
    ' float ridge(vec2 p){ float n = 1.0 - abs(2.0 * vn(p) - 1.0); return n * n; }' +
    ' float needles(vec2 p, vec2 dir){ return ridge(vec2(dot(p, dir) * 0.55, dot(p, vec2(-dir.y, dir.x)) * 5.0)); }' + // long thin crystals lying along dir
    ' float rime(vec2 p){ p += (vec2(vn(p * 0.35 + 7.3), vn(p * 0.35 - 3.1)) - 0.5) * 0.9;' + // three families of needles, each owning its own patches: hoar frost, not marble
    ' float a = needles(p, vec2(0.94, 0.34)) * smoothstep(0.30, 0.62, vn(p * 0.21 + 1.7));' +
    ' float b = needles(p + 4.1, vec2(0.50, -0.87)) * smoothstep(0.30, 0.62, vn(p * 0.21 + 9.2));' +
    ' float c = needles(p + 8.7, vec2(-0.26, 0.97)) * smoothstep(0.34, 0.66, vn(p * 0.21 + 5.4));' +
    ' return max(max(a, b), c) * 0.8 + ridge(p * 3.1) * 0.3; }' +
    ' void main(){ vec2 uv = vUv; vec2 asp = vec2(uAspect, 1.0);' +
    ' vec2 F = texture2D(uField, uv).rg; float D = F.x; float G = F.y;' + // D: what has been moved (+ brought here, - taken from here). G: the light the hot places throw
    ' float sh = smoothstep(0.30, 0.9, warmth(art(uv)) + D) * uMotion;' + // warm air bends the picture, only where it is warm
    ' vec3 a = art(uv + vec2(sin(uv.y * 74.0 + uTime * 2.1) + sin(uv.y * 31.0 - uTime * 1.6), 0.0) * 0.0011 * sh);' +
    m.ambient + // this plate's own weather
    ' float S = warmth(a); float t = clamp(S + D, 0.0, 1.0);' +
    ' vec2 q = uv * asp;' +
    ' float cold = smoothstep(0.03, 0.30, -D) * (0.72 + 0.56 * vn(q * 2.3));' + // the frost line is never ruled
    ' cold = clamp(cold, 0.0, 1.0);' +
    ' vec3 col = a;' +
    ' if (cold > 0.004) {' + // the crystals are only worked out where it is actually cold
    '   float r1 = rime(q * 15.0), r2 = rime(q * 44.0 + 11.0);' +
    '   float feather = smoothstep(0.86 - cold * 0.56, 1.10 - cold * 0.36, r1 + r2 * 0.30);' +
    '   col = mix(a, vec3(lum(a)) * vec3(0.82, 0.92, 1.04), cold * 0.55);' + // colour drains first
    '   col = mix(col, vec3(0.80, 0.89, 0.95), feather * cold * (0.26 + 0.34 * cold));' + // then the rime itself: a veil, not paint
    '   col += vec3(0.75, 0.86, 0.95) * smoothstep(0.55, 0.95, r2) * cold * 0.08;' +
    '   col += vec3(1.0) * pow(hash(floor(gl_FragCoord.xy / 1.5)), 42.0) * feather * cold * 0.45;' + // glints
    ' }' +
    ' float warm = smoothstep(0.02, 0.36, D);' + // brought: the light a hearth throws
    ' col += ' + m.glow + ' * (warm * (0.22 + 0.34 * lum(a)) + warm * warm * ' + m.haze + ');' +
    ' col = mix(col, col * vec3(1.14, 1.0, 0.84), warm * 0.5);' +
    ' float beat = pow(0.5 + 0.5 * sin(6.2832 * (uTime * uPulse * 6.0 - distance(uv * asp, uHeart * asp) * 1.5)), 3.0);' + // the fever, at a resting heartbeat, travelling out from the heart
    ' col += a * S * smoothstep(0.15, 0.6, t) * 0.42 * beat * uMotion;' +
    ' float lit = ' + m.lit + ';' +
    ' float halo = G * (1.0 - smoothstep(0.55, 0.95, G));' + // beside the hot places, not on them: they are already bright
    ' col += ' + m.glow + ' * halo * lit * (0.50 + 0.50 * beat * uMotion) * (0.22 + 0.78 * lum(a)) * (1.0 - cold);' + // lit from the vein
    ' float iso = abs(fract(log(max(G, 0.003)) * 1.7 - uTime * 0.045 * uMotion) - 0.5);' + // isotherms walking out from it, as on the survey
    ' col += vec3(1.0, 0.85, 0.63) * (1.0 - smoothstep(0.0, 0.07, iso)) * smoothstep(0.010, 0.08, G) * (1.0 - smoothstep(0.45, 0.85, G)) * 0.075 * lit;' +
    ' float f = abs(fract(D * 9.0) - 0.5); col *= 1.0 - (1.0 - smoothstep(0.02, 0.09, f)) * 0.05 * smoothstep(0.05, 0.2, abs(D));' + // survey contours, only where heat has moved
    ' col += (hash(gl_FragCoord.xy + fract(uTime * 3.7) * 61.0) - 0.5) * 0.010 * uMotion;' + // the plate's grain, alive
    ' vec2 fp = floor(gl_FragCoord.xy); col += ((mod(fp.x, 2.0) * 2.0 + mod(fp.y, 2.0)) * 0.25 - 0.375) / 255.0;' + // ordered dither
    ' gl_FragColor = vec4(col, 1.0); }';
  return { init, sim, disp };
}

export function mountPlate(fig) {
  const img = fig.querySelector('img'), canvas = fig.querySelector('canvas');
  const m = MOOD[fig.getAttribute('data-plate')] || MOOD.fever;
  if (!img || !canvas) return;
  const heart = (fig.getAttribute('data-heart') || '0.5,0.5').split(',').map(Number);
  const horizon = fig.hasAttribute('data-horizon') ? Number(fig.getAttribute('data-horizon')) : 2; // 2: no ground in this picture
  const hand = { x: 0.5, y: 0.5, fx: 0.5, fy: 0.5 };
  let h = null, tried = false, visible = false, cool = 0, xf = [1, 1, 0, 0];
  // the canvas shows the same crop the <img> beneath it does (object-fit: cover + object-position)
  const fit = () => {
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1, iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
    const s = Math.max(cw / iw, ch / ih), fx = Math.min(1, cw / (iw * s)), fy = Math.min(1, ch / (ih * s));
    const pos = (getComputedStyle(img).objectPosition || '50% 50%').split(' ').map((v) => parseFloat(v) / 100);
    const px = isFinite(pos[0]) ? pos[0] : 0.5, py = isFinite(pos[1]) ? pos[1] : 0.5;
    xf = [fx, fy, (1 - fx) * px, (1 - fy) * (1 - py)];
  };
  const mount = () => {
    if (tried) return;
    tried = true;
    const go = () => {
      try {
        fit();
        const asp = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
        const simH = asp >= 1 ? 128 : 176, simW = Math.max(96, Math.min(256, Math.round(simH * asp)));
        const sh = plateShaders(m);
        h = mountThermo(canvas, {
          initFrag: sh.init, simFrag: sh.sim, dispFrag: sh.disp, simW, simH, bpm: m.bpm, art: img,
          reduced: reducedMotion(), settledCool: 0.45,
          onFrame: () => { hand.fx += (hand.x - hand.fx) * 0.07; hand.fy += (hand.y - hand.fy) * 0.07; }, // where the hand was, a moment ago
          uniforms: (gl, p) => {
            gl.uniform4f(gl.getUniformLocation(p, 'uArtXf'), xf[0], xf[1], xf[2], xf[3]);
            gl.uniform2f(gl.getUniformLocation(p, 'uFrom'), hand.fx, hand.fy);
            gl.uniform2f(gl.getUniformLocation(p, 'uHeart'), (heart[0] - xf[2]) / xf[0], ((1 - heart[1]) - xf[3]) / xf[1]);
            gl.uniform1f(gl.getUniformLocation(p, 'uHorizon'), ((1 - horizon) - xf[3]) / xf[1]);
          },
        });
        if (h) { h.setVisible(visible); h.setCoolTarget(cool); }
      } catch (err) { console.warn('plate shader unavailable — the still plate holds', err); }
    };
    if (img.complete && img.naturalWidth) go(); else img.addEventListener('load', go, { once: true });
  };
  io(fig, (es) => { visible = es[0].isIntersecting; if (visible) mount(); if (h) h.setVisible(visible); }, { rootMargin: '200px 0px', threshold: 0 });
  window.addEventListener('resize', fit);
  // reading on: how far the plate has travelled up the window decides how far its weather has come
  let ticking = false;
  const onScroll = () => {
    if (ticking || !visible) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const r = fig.getBoundingClientRect(), vh = window.innerHeight || 1;
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      cool = Math.max(cool, Math.min(0.9, Math.max(0, p - 0.22) * 1.5));
      if (h) h.setCoolTarget(cool);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  const onPointer = (e) => {
    if (!h) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
    if (e.type === 'pointerenter' || e.type === 'pointerdown' && e.pointerType === 'touch') { hand.fx = x; hand.fy = y; } // a new touch carries nothing yet
    hand.x = x; hand.y = y;
    h.pointer(x, y, m.sign * ((e.buttons & 1) || e.pointerType === 'touch' ? 0.14 : 0.085));
  };
  ['pointerenter', 'pointermove', 'pointerdown'].forEach((n) => fig.addEventListener(n, onPointer));
}

// ── 4. THE HEARTH ──────────────────────────────────────────────────────────────────────
// The buy area is the one warm thing on a cold page: every live buy control inside the root
// is a hearth, and the canvas behind it shows the warmth leaving it — isotherms walking out
// into the cold at the pace of a resting pulse. A control that is only "coming" throws none.
// Markup: a positioned root holding <canvas data-hearth aria-hidden="true"> (see-through, behind
// the content). Without WebGL the lit button's own glow (CSS) is the whole effect.
const HEARTH_HEAD = 'precision highp float; varying vec2 vUv; uniform vec4 uSrc[4];';
const HEARTH_INIT = HEARTH_HEAD + ' void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }';
const HEARTH_SIM = HEARTH_HEAD + ' uniform sampler2D uPrev; uniform vec2 uTexel; uniform float uBeat;' +
  ' void main(){ vec2 uv = vUv;' +
  ' float c = texture2D(uPrev, uv).r;' +
  ' float l = texture2D(uPrev, uv - vec2(uTexel.x, 0.0)).r; float r = texture2D(uPrev, uv + vec2(uTexel.x, 0.0)).r;' +
  ' float d = texture2D(uPrev, uv - vec2(0.0, uTexel.y)).r; float u = texture2D(uPrev, uv + vec2(0.0, uTexel.y)).r;' +
  ' float t = (c + 0.24 * (l + r + u + d - 4.0 * c)) * 0.9982;' + // the cold takes a little of everything
  ' float m = 0.0; for (int i = 0; i < 4; i++){ vec2 q = abs(uv - uSrc[i].xy) - uSrc[i].zw; m = max(m, step(length(max(q, 0.0)), uTexel.x) * step(0.0001, uSrc[i].z)); }' +
  ' t = max(t, m * (0.82 + 0.18 * uBeat));' + // a hearth holds its heat
  ' gl_FragColor = vec4(clamp(t, 0.0, 1.0), 0.0, 0.0, 1.0); }';
const HEARTH_DISP = 'precision highp float; varying vec2 vUv; uniform sampler2D uField; uniform float uTime; uniform float uMotion;' +
  ' void main(){ float t = texture2D(uField, vUv).r;' +
  ' float body = pow(smoothstep(0.0, 1.0, t), 1.5) * 0.40;' +
  ' float f = abs(fract(log(max(t, 0.0015)) * 1.9 + uTime * 0.07 * uMotion) - 0.5);' + // isotherms, evenly spaced in log-heat, walking outward
  ' float ring = (1.0 - smoothstep(0.0, 0.045, f)) * smoothstep(0.010, 0.09, t) * (0.10 + 0.22 * t);' +
  ' vec2 e = smoothstep(vec2(0.0), vec2(0.10, 0.08), vUv) * smoothstep(vec2(0.0), vec2(0.10, 0.08), 1.0 - vUv); float edge = e.x * e.y;' + // fade to nothing before the canvas ends
  ' body *= edge; ring *= edge;' +
  ' vec3 col = vec3(1.0, 0.62, 0.24) * body + vec3(1.0, 0.85, 0.63) * ring;' +
  ' vec2 fp = floor(gl_FragCoord.xy); col += ((mod(fp.x, 2.0) * 2.0 + mod(fp.y, 2.0)) * 0.25 - 0.375) / 255.0 * step(0.004, t);' +
  ' gl_FragColor = vec4(col, clamp(body + ring, 0.0, 1.0)); }'; // premultiplied

export function mountHearth(root) {
  const canvas = root.querySelector('canvas[data-hearth]');
  if (!canvas) return;
  const src = new Float32Array(16);
  let h = null, tried = false, visible = false;
  const measure = () => {
    src.fill(0);
    const c = canvas.getBoundingClientRect();
    if (!c.width || !c.height) return;
    Array.prototype.slice.call(root.querySelectorAll('.buy.is-live, .ed.is-live'), 0, 4).forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      src[i * 4] = (r.left + r.width / 2 - c.left) / c.width;
      src[i * 4 + 1] = 1 - (r.top + r.height / 2 - c.top) / c.height;
      src[i * 4 + 2] = r.width / 2 / c.width;
      src[i * 4 + 3] = r.height / 2 / c.height;
    });
  };
  const mount = () => {
    if (tried) return;
    tried = true;
    try {
      measure();
      const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
      const simW = Math.max(64, Math.min(224, Math.round(cw / 7))), simH = Math.max(64, Math.min(256, Math.round(ch / 7)));
      const t0 = performance.now();
      h = mountThermo(canvas, {
        initFrag: HEARTH_INIT, simFrag: HEARTH_SIM, dispFrag: HEARTH_DISP, simW, simH, alpha: true, reduced: reducedMotion(),
        uniforms: (gl, p) => {
          gl.uniform4fv(gl.getUniformLocation(p, 'uSrc'), src);
          gl.uniform1f(gl.getUniformLocation(p, 'uBeat'), 0.5 + 0.5 * Math.sin((performance.now() - t0) / 1000 * 6.2832 * 57 / 60));
        },
      });
      if (h) h.setVisible(visible);
    } catch (err) { console.warn('hearth shader unavailable — the lit button holds', err); }
  };
  io(root, (es) => { visible = es[0].isIntersecting; if (visible) { mount(); measure(); } if (h) h.setVisible(visible); }, { rootMargin: '120px 0px', threshold: 0 });
  window.addEventListener('resize', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(root);
}
