// sky.js — the sky of The Breathing Dark.
// A hand-written WebGL1 sky with one rule: it can only lose its light.
//
//   · A deep field: one starless plate of gas and dust (assets/scenes/deep-*.jpg) that the
//     shader grades, layers and bends. Over it, ~4,400 procedural stars in six hashed-cell
//     layers at six depths, a few faint galaxies behind them, a slow veil of near dust in
//     front, and twenty placed bright stars that carry a four-point diffraction cross.
//     Nothing twinkles.
//   · The door: a small round darkness at the focus. It emits nothing. The sky behind it is
//     drawn where the lens equation says its light arrives, so stars and dust lanes bend
//     into arcs round it, and it grows as the view draws in.
//   · The order stars die in is the arrival time of a front that travels along a grown vein
//     tree from that focus: a Dijkstra pass over a cost grid, computed once on the CPU and
//     handed to the shader as a small lookup. The gas goes dark a little after the stars
//     that lit it.
//   · A 512-step lookup turns "the front has passed" into a 1.5 s real-time fade per star,
//     whatever the scroll speed. Progress is monotonic: the sky never comes back.
//   · About 12% of the stars are "weighed". They are a touch warmer, they do not breathe
//     with the Murmur, and they never go out.
//
// No libraries, no flash, no particle. plate.js draws the scenes further down the page
// with this same shader.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const sstep = (t) => t * t * (3 - 2 * t);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── the extinction map ────────────────────────────────────────────────────────
   Grows a branching vein tree from the focus, then solves how long a front takes
   to reach every cell when it runs fast along a vein and seeps slowly across open
   sky. Pure function (no DOM): the static fallback art is generated from it too. */
export function buildField(W, H, fx, fy, seed) {
  const R = rng(seed || 7), N = W * H, K = 3, VW = W * K, VH = H * K;
  const vein = new Float32Array(N), fine = new Float32Array(VW * VH);
  const stamp = (g, gw, gh, x, y, r, a) => {
    const x0 = Math.max(0, Math.floor(x - r - 1)), x1 = Math.min(gw - 1, Math.ceil(x + r + 1));
    const y0 = Math.max(0, Math.floor(y - r - 1)), y1 = Math.min(gh - 1, Math.ceil(y + r + 1));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const v = a * clamp(1 - (Math.hypot(xx - x, yy - y) - r * 0.35) / (r * 0.65 + 0.6), 0, 1);
      const i = yy * gw + xx;
      if (v > g[i]) g[i] = v;
    }
  };
  const ox = fx * W, oy = fy * H;
  const reach = Math.hypot(Math.max(ox, W - ox), Math.max(oy, H - oy));
  const w0 = Math.max(1.05, W / 210);
  const grow = (x, y, ang, len, w, depth) => {
    let drift = 0;
    const n = Math.round(len);
    for (let i = 0; i < n; i++) {
      drift = drift * 0.82 + (R() - 0.5) * 0.2;
      // wander, but lean back toward "away from the focus": veins radiate, they do not coil
      let out = Math.atan2(y - oy, x - ox) - ang;
      out = Math.atan2(Math.sin(out), Math.cos(out));
      ang += drift * 0.5 + (i > 6 ? out * 0.035 : 0);
      x += Math.cos(ang); y += Math.sin(ang);
      if (x < -8 || y < -8 || x > W + 8 || y > H + 8) break;
      const taper = 1 - 0.6 * i / n;
      stamp(vein, W, H, x, y, w * taper, 1 - depth * 0.1);
      stamp(fine, VW, VH, x * K, y * K, Math.max(0.55, w * taper * 0.8), 1 - depth * 0.17);
      if (depth < 4 && i > 5 && R() < (depth === 0 ? 0.07 : 0.055)) {
        const side = R() < 0.5 ? -1 : 1;
        grow(x, y, ang + side * (0.38 + R() * 0.62), (n - i) * (0.4 + R() * 0.45), w * taper * 0.68, depth + 1);
      }
    }
  };
  const trunks = 7, a0 = R() * TAU;
  for (let t = 0; t < trunks; t++) grow(ox, oy, a0 + ((t + (R() - 0.5) * 0.7) / trunks) * TAU, reach * (0.85 + R() * 0.35), w0, 0);

  // cost: cheap on a vein, dear across open sky, with a slow unevenness so the seep is not a clean halo
  const lat = new Float32Array(33 * 33); for (let i = 0; i < lat.length; i++) lat[i] = R();
  const vnoise = (u, v) => { const x = clamp(u, 0, 0.9999) * 32, y = clamp(v, 0, 0.9999) * 32, xi = x | 0, yi = y | 0, tx = sstep(x - xi), ty = sstep(y - yi);
    const a = lat[yi * 33 + xi], b = lat[yi * 33 + xi + 1], c = lat[(yi + 1) * 33 + xi], d = lat[(yi + 1) * 33 + xi + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty; };
  const cost = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let s = vein[i] * 2, k = 2;
    if (x > 0) { s += vein[i - 1]; k++; } if (x < W - 1) { s += vein[i + 1]; k++; }
    if (y > 0) { s += vein[i - W]; k++; } if (y < H - 1) { s += vein[i + W]; k++; }
    cost[i] = (1 - 0.955 * Math.pow(s / k, 0.7)) * (0.8 + 0.5 * vnoise(x / W, y / H));
  }

  // Dijkstra from the focus (typed binary heap, lazy deletion)
  const T = new Float32Array(N).fill(Infinity);
  const cap = N * 9, hk = new Float32Array(cap), hi = new Int32Array(cap);
  let hn = 0;
  const push = (key, id) => { let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= key) break; hk[i] = hk[p]; hi[i] = hi[p]; i = p; } hk[i] = key; hi[i] = id; };
  const pop = () => { const id = hi[0]; const key = hk[--hn], kid = hi[hn]; let i = 0;
    for (;;) { let c = i * 2 + 1; if (c >= hn) break; if (c + 1 < hn && hk[c + 1] < hk[c]) c++; if (hk[c] >= key) break; hk[i] = hk[c]; hi[i] = hi[c]; i = c; }
    hk[i] = key; hi[i] = kid; return id; };
  const start = clamp(Math.round(oy), 0, H - 1) * W + clamp(Math.round(ox), 0, W - 1);
  T[start] = 0; push(0, start);
  while (hn > 0) {
    const key = hk[0], id = pop();
    if (key > T[id]) continue;
    const x = id % W, y = (id / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      const t = key + (cost[id] + cost[j]) * (dx && dy ? 0.7071 : 0.5);
      if (t < T[j] && hn < cap) { T[j] = t; push(t, j); }
    }
  }
  // equalise: order = rank of arrival, so equal steps of progress darken equal areas of sky
  const idx = new Uint32Array(N); for (let i = 0; i < N; i++) idx[i] = i;
  idx.sort((a, b) => T[a] - T[b]);
  const order = new Float32Array(N);
  for (let r = 0; r < N; r++) order[idx[r]] = r / (N - 1);
  return { W, H, order, VW, VH, fine };
}

/* ── the bright stars ──────────────────────────────────────────────────────────
   Offsets are degrees on the real sky (east to the left, north up) from the group
   anchor. Stars with a measured mass are `weighed`: they hold. A star with an
   `entry` is written into the catalogue as it goes: a caption beside it, and an
   amber grease-pencil ring left round the empty place. */
const CROSS = [
  { id: 'deneb', name: 'DENEB · α CYGNI', entry: 'No. 1401', cap: 'LAST LIGHT 2104 · 36 h FADE · CAUSE: UNKNOWN', o: [-3.66, 5.02], mag: 1.25, t: 0.74, pin: 0.3 },
  { id: 'sadr', name: 'SADR · γ CYGNI', entry: '', cap: 'NO EXPLOSION · NO REMNANT · CAUSE: UNKNOWN', o: [0, 0], mag: 2.23, t: 0.42, pin: 0.44 },
  { id: 'gienah', o: [-4.58, -6.29], mag: 2.48, t: 0.28, pin: 0.53 },
  { id: 'fawaris', name: 'FAWARIS · δ CYGNI', o: [7.1, 4.87], mag: 2.87, t: 0.7, weighed: true },
  { id: 'albireo', name: 'ALBIREO · β CYGNI', o: [9.84, -12.3], mag: 3.05, t: 0.22, weighed: true },
  { id: 'eta', o: [4.92, -5.18], mag: 3.6, t: 0.4, pin: 0.6 }
];
const BELT = [
  { id: 'alnitak', name: 'ALNITAK · ζ ORIONIS', o: [-1.125, -0.74], mag: 1.77, t: 0.86, weighed: true },
  { id: 'alnilam', name: 'ALNILAM · ε ORIONIS', entry: '', cap: "THE BELT'S MIDDLE STAR · CAUSE: UNKNOWN", o: [0, 0], mag: 1.69, t: 0.84, pin: 0.68 },
  { id: 'mintaka', name: 'MINTAKA · δ ORIONIS', o: [1.065, 0.9], mag: 2.23, t: 0.88, weighed: true }
];
const SIRIUS = { id: 'sirius', name: 'SIRIUS · α CANIS MAJORIS', cap: 'MASS: 2.06 M☉ · MEASURED · PRESENT', o: [0, 0], mag: -0.6, t: 0.8, weighed: true };
const WEZEN = { id: 'wezen', name: 'WEZEN · δ CANIS MAJORIS', entry: '', cap: '36 h FADE · WITNESSES: EVERYONE', o: [0, 0], mag: 1.83, t: 0.3, pin: 0.82 };
// the first entry: a faint star in Cepheus, the one nobody else missed
const FIRST = { id: 'mds', name: 'MDS 4211‑77 · CEPHEUS', entry: 'No. 0001', cap: 'PRESENT TUESDAY. GONE THURSDAY.', o: [0, 0], mag: 2.75, t: 0.62, pin: 0.006, dur: 5.5 };
const TRIANGLE = [
  { id: 'vega', name: 'VEGA · α LYRAE', o: [13.95, 7.78], mag: 0.4, t: 0.8, weighed: true },
  { id: 'deneb', name: 'DENEB · α CYGNI', cap: 'LAST LIGHT 2104 · 36 h FADE · CAUSE: UNKNOWN', o: [-12.73, 14.28], mag: 1.25, t: 0.74, pin: 2 },
  { id: 'altair', name: 'ALTAIR · α AQUILAE', o: [-1.88, -22.13], mag: 0.77, t: 0.66, weighed: true }
];
// loose bright stars: [u, v, magnitude, temperature 0 warm..1 cool, weighed, pin (optional: it goes when the front reaches this)]
// door: [radius at rest, as a fraction of the shorter side]. The focus of the dying sky is where the door is.
export const SKIES = {
  vanish: {
    field: true, seed: 11, vein: [0.01, 0.04], door: 0.03, flip: true,
    wide: { focus: [0.735, 0.205], deep: [1.42, 0.03, -0.15], groups: [
      { stars: CROSS, at: [0.9, 0.63], k: 0.0125 }, { stars: BELT, at: [0.3, 0.135], k: 0.026 },
      { stars: [SIRIUS], at: [0.118, 0.27], k: 0 }, { stars: [WEZEN], at: [0.045, 0.43], k: 0 }, { stars: [FIRST], at: [0.5, 0.2], k: 0 } ],
      loose: [[0.6, 0.085, 2.9, 0.6, 0, 0.045], [0.46, 0.33, 2.6, 0.15, 1], [0.69, 0.66, 3.1, 0.7, 0], [0.61, 0.9, 2.8, 0.1, 1], [0.955, 0.1, 3.0, 0.9, 0, 0.085], [0.76, 0.84, 3.3, 0.5, 0], [0.4, 0.07, 3.1, 0.8, 0, 0.125]] },
    tall: { focus: [0.7, 0.2], groups: [
      { stars: CROSS, at: [0.72, 0.7], k: 0.0155 }, { stars: BELT, at: [0.25, 0.115], k: 0.03 },
      { stars: [SIRIUS], at: [0.13, 0.255], k: 0 }, { stars: [WEZEN], at: [0.085, 0.365], k: 0 }, { stars: [FIRST], at: [0.24, 0.185], k: 0 } ],
      loose: [[0.5, 0.06, 2.9, 0.6, 0, 0.045], [0.38, 0.44, 2.7, 0.15, 1], [0.9, 0.08, 3.0, 0.9, 0, 0.085], [0.9, 0.9, 2.9, 0.1, 1], [0.2, 0.93, 3.2, 0.6, 0], [0.5, 0.3, 3.2, 0.5, 0, 0.125]] }
  },
  vigil: {
    field: true, seed: 23, vein: [0.012, 0.012], door: 0,
    wide: { focus: [0.76, 0.2], groups: [{ stars: TRIANGLE, at: [0.8, 0.335], k: 0.0098 }],
      loose: [[0.1, 0.12, 2.8, 0.8, 0], [0.3, 0.07, 3.0, 0.2, 1], [0.93, 0.3, 3.1, 0.6, 0], [0.42, 0.42, 3.3, 0.5, 0], [0.2, 0.36, 3.2, 0.3, 1], [0.97, 0.06, 3.0, 0.9, 0]] },
    tall: { focus: [0.72, 0.13], groups: [{ stars: TRIANGLE, at: [0.5, 0.2], k: 0.008 }],
      loose: [[0.1, 0.05, 3.0, 0.8, 0], [0.9, 0.4, 3.1, 0.2, 1], [0.14, 0.4, 3.2, 0.5, 0], [0.92, 0.04, 3.2, 0.9, 0]] }
  },
  blueshift: {
    field: false, door: 0,
    wide: { focus: [0.5, 0.5], groups: [], loose: [[0.16, 0.2, 2.6, 0.9, 0], [0.82, 0.14, 3.0, 0.8, 0], [0.9, 0.72, 2.8, 0.9, 0], [0.1, 0.78, 3.1, 0.7, 0], [0.34, 0.9, 3.2, 0.9, 0], [0.66, 0.06, 3.2, 0.8, 0]] },
    tall: { focus: [0.5, 0.4], groups: [], loose: [[0.14, 0.1, 2.8, 0.9, 0], [0.86, 0.2, 3.0, 0.8, 0], [0.88, 0.7, 3.0, 0.9, 0], [0.1, 0.62, 3.1, 0.7, 0]] }
  },
  negative: {
    field: false, door: 0, plain: true,
    wide: { focus: [0.5, 0.5], groups: [], loose: [[0.66, 0.2, 1.4, 0.5, 0], [0.86, 0.46, 2.6, 0.5, 0], [0.74, 0.7, 2.0, 0.5, 0], [0.93, 0.14, 3.0, 0.5, 0], [0.56, 0.52, 3.1, 0.5, 0], [0.97, 0.8, 2.4, 0.5, 0], [0.47, 0.12, 2.8, 0.5, 0]] },
    tall: { focus: [0.5, 0.4], groups: [], loose: [[0.7, 0.13, 1.4, 0.5, 0], [0.24, 0.24, 2.6, 0.5, 0], [0.86, 0.36, 2.2, 0.5, 0], [0.46, 0.06, 3.0, 0.5, 0], [0.12, 0.43, 3.0, 0.5, 0]] }
  },
  // the plates further down the page use the same sky with no placed stars
  plain: { field: false, door: 0, wide: { focus: [0.5, 0.5], groups: [], loose: [] }, tall: { focus: [0.5, 0.5], groups: [], loose: [] } }
};

export const NB = 20, NL = 512, FADE = 1.5, FRONT_MAX = 0.965, WEIGHED = 0.12;

/* ── the shader ────────────────────────────────────────────────────────────────
   One fragment shader draws every sky on the site. Back to front:
     the deep field   a starless plate of gas and dust, graded, its light failing
                      a little after the stars that lit it;
     galaxies         a few faint smudges, further than anything else;
     six star layers  hashed cells, each at its own depth: they part as the view
                      draws in and slide against each other with the pointer;
     near dust        a slow dark unevenness in front of it all;
     the bright stars placed by hand, with their diffraction crosses;
     the door         a round darkness that emits nothing. Everything behind it is
                      drawn where the lens equation says its light arrives. */
export const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
export const FRAG = `precision highp float;
uniform vec2 uRes,uPar,uRing,uThin,uRest,uDeepOff;
uniform float uPx,uDpr,uZoom,uMur,uGain,uNeg,uBlue,uUse,uVein,uEnd,uRingR,uDeepOn,uTall,uSeed,uGlow,uPress,uFront;
uniform vec3 uBg,uDeep;
uniform vec4 uDoor;
uniform sampler2D tField,tVein,tAlive,tDeep;
uniform vec4 uB[${NB}];
uniform vec4 uC[${NB}];
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
vec2 rt(vec2 v,float c,float s){return vec2(c*v.x-s*v.y,s*v.x+c*v.y);}
vec2 ir(vec2 v,float c,float s){return vec2(c*v.x+s*v.y,-s*v.x+c*v.y);}
// where a point of the sky at rest (device px from the centre of the frame) falls on the plate
vec2 puv(vec2 X){
  vec2 s=uTall>.5?vec2(X.y,-X.x):X;
  vec2 dim=uTall>.5?uRes.yx:uRes;
  float h=max(dim.y,dim.x/1.7778)*uDeep.y;
  vec2 uv=s/vec2(h*1.7778,h)+.5+uDeepOff;
  uv.y=1.-uv.y;
  if(uDeep.z>.5)uv.x=1.-uv.x;
  return 1.-abs(1.-mod(uv,2.));
}
float alive(vec2 X,float jit,float lag){
  float o=texture2D(tField,vec2(X.x/uRes.x+.5,.5-X.y/uRes.y)).r;
  return texture2D(tAlive,vec2(clamp(o+jit+lag,0.,1.)*.996+.002,.5)).r;
}
// density of stars, how much dust lies in front, and the plate's own light, at a point of the sky
vec3 skyAt(vec2 X){
  if(uDeepOn<.5){
    vec2 p=X/uPx;float n=vn(p*3.4+11.3);
    float band=exp(-pow((p.y*.92+p.x*.40-.04)/.17,2.));
    return vec3(.52+.5*n+band*(.3+1.2*n),0.,0.);
  }
  vec3 t=texture2D(tDeep,puv(X)).rgb;
  float l=dot(t,vec3(.3,.45,.25));
  return vec3(.34+2.5*smoothstep(.03,.5,l)+.5*vn(X/uPx*3.4+11.3),clamp((t.r-t.b)*4.5,0.,1.),l);
}
void layer(vec2 cz,float n,float d0,float seed,float ang,float rcss,float bmul,float par,inout vec3 light,inout float hole){
  float cs=cos(ang),sn=sin(ang);
  float z=1.+(uZoom-1.)*par;
  vec2 rest=cz*z+uRest+uPar*par;
  vec2 g=rt(rest/uPx,cs,sn)*n;
  vec2 id=floor(g),f=fract(g),k=id+seed+uSeed;
  float pick=h21(k);
  if(pick>d0*3.2)return;
  vec2 sp=.1+.8*vec2(h21(k+13.7),h21(k+27.2));
  vec2 off=ir((sp-f)/n,cs,sn)*uPx/z;
  float m=pow(h21(k+5.9),5.);
  float d=length(off);
  float r=rcss*uDpr*(.82+.7*m);
  float R=rcss*uDpr*(.85+3.3*m);
  if(d>max(r*4.2,R+2.))return;
  vec2 sr=ir((id+sp)/n,cs,sn)*uPx;
  vec3 sk=skyAt(sr);
  if(pick>d0*sk.x)return;
  if(uThin.y>0.&&h21(k+47.7)>smoothstep(uThin.x,uThin.y,sr.y/uRes.y+.5))return;
  float wgt=step(h21(k+3.3),${WEIGHED.toFixed(2)});
  float al=1.;
  if(uUse>.5)al=mix(alive(sr,(h21(k+71.3)-.5)*.02,0.),1.,wgt);
  float b=bmul*(.34+.66*m)*(1.-.62*sk.y);
  if(uBlue>0.){
    float e=exp(-pow((length(sr+.5*uRes-uRing)-uRingR)/(uRingR*.5),2.));
    b*=mix(1.,.3+2.2*e,uBlue);
  }
  float t=h21(k+91.1);
  // colour temperature: most stars near white, the brighter ones plainly amber or blue-white, as on a real plate
  vec3 col=mix(vec3(1.),mix(vec3(1.,.70,.45),vec3(.62,.78,1.),smoothstep(.25,.75,t)),.42+.4*m);
  col=mix(col,vec3(1.,.74,.5),sk.y*.7);
  col=mix(col,vec3(1.,.84,.64),wgt*.7);
  col=mix(col,vec3(.58,.85,1.),uBlue*.7);
  float core=exp(-d*d/(r*r))+.07*m*exp(-d/(r*1.7));
  light+=col*(core*b*al*mix(1.+uMur*.04,1.,wgt));
  hole=max(hole,smoothstep(R+.75,R-.75,d)*al);
}
// a few galaxies, very far and very faint: an ellipse of old light with a brighter heart
void galaxies(vec2 cz,inout vec3 light){
  float z=1.+(uZoom-1.)*.12;
  vec2 rest=cz*z+uRest+uPar*.12;
  vec2 g=rest/uPx*6.3+uSeed,id=floor(g),f=fract(g);
  if(h21(id+3.9)>.42)return;
  vec2 sp=.2+.6*vec2(h21(id+1.7),h21(id+8.3));
  vec2 v=(f-sp)/6.3*uPx/uDpr;
  float a=h21(id+5.1)*3.1416,q=.26+.6*h21(id+6.6),s=3.+9.*pow(h21(id+2.2),2.);
  vec2 w=rt(v,cos(a),sin(a));w.y/=q;
  float dd=length(w)/s;
  if(dd>4.)return;
  vec2 sr=(id+sp-uSeed)/6.3*uPx;
  float al=1.;
  if(uUse>.5)al=alive(sr,0.,.03);
  float I=.055*exp(-dd*1.5)+.11*exp(-dd*dd*9.);
  light+=mix(vec3(1.,.86,.7),vec3(.8,.88,1.),h21(id+9.9))*I*al*(1.-.7*skyAt(sr).y);
}
void main(){
  vec2 fc=gl_FragCoord.xy,uv=fc/uRes;
  vec2 dv=fc-uDoor.xy,cz=dv;
  float r=length(dv),a=uDoor.z,E=uDoor.w*(1.+.03*uMur),mag=1.;
  if(a>0.){
    // the lens equation: light seen at dv left the sky at dv·(1 − E²/r²). Near r = E the sky is drawn out into arcs.
    // Nothing lies exactly behind the door, so no star is ever drawn out into a full bright ring: the door has no rim
    cz=dv*(1.-E*E/max(r*r,a*a*.3));
    mag=(1.+.3*exp(-pow((r-E)/(E*.3),2.)))*smoothstep(E*.1,E*.75,length(cz));
  }
  if(uPress>0.){
    // the sky pressed inward round the ring: distances that took light-years to open begin to close
    vec2 rv=fc-uRing;float rr=length(rv);
    cz+=rv*uPress*(.16+.5*exp(-pow(rr/(uRingR*2.6),2.)));
  }
  vec3 light=vec3(0.);float hole=0.;
  layer(cz,118.,.10,17.31,.31,.60,.60,.2,light,hole);
  layer(cz,97.,.10,29.63,1.93,.62,.66,.3,light,hole);
  layer(cz,64.,.21,41.07,1.13,.68,.92,.45,light,hole);
  layer(cz,53.,.19,57.29,2.61,.70,.98,.55,light,hole);
  layer(cz,36.,.33,73.57,2.02,.82,1.2,.7,light,hole);
  layer(cz,19.,.36,97.91,.74,1.0,1.7,1.,light,hole);
  vec3 col=uBg;
  if(uDeepOn>.5){
    galaxies(cz,light);
    float zd=1.+(uZoom-1.)*.3;
    vec2 Xd=cz*zd+uRest+uPar*.3;
    vec3 dp=texture2D(tDeep,puv(Xd)).rgb;
    dp=max(dp-.035,0.);
    float lum=dot(dp,vec3(.3,.45,.25));
    dp=mix(vec3(lum),dp,1.18)*uDeep.x;
    if(uBlue>0.)dp=mix(dp,lum*vec3(.42,.72,1.1)*1.35*uDeep.x,uBlue*.85);
    float ga=1.;
    if(uUse>.5){
      // the gas goes dark a little after the stars that lit it, and softly: no edge, only a failing
      vec2 fu=vec2(Xd.x/uRes.x+.5,.5-Xd.y/uRes.y),e=vec2(.03,0.),g=vec2(.021,.034);
      float o=.125*(texture2D(tField,fu+e.xy).r+texture2D(tField,fu-e.xy).r+texture2D(tField,fu+e.yx*1.6).r+texture2D(tField,fu-e.yx*1.6).r
        +texture2D(tField,fu+g).r+texture2D(tField,fu-g).r+texture2D(tField,fu+vec2(g.x,-g.y)).r+texture2D(tField,fu-vec2(g.x,-g.y)).r);
      ga=smoothstep(uFront*1.36-.36,uFront*1.36-.02,o);
    }
    col+=dp*mix(uGlow,1.,ga)*(1.+.03*uMur);
    // near dust: a slow dark unevenness in front of everything, the closest thing in the frame
    vec2 nd=(cz*(1.+(uZoom-1.)*1.7)+uRest+uPar*1.7)/uPx;
    float fg=.5*vn(nd*2.1+3.7)+.3*vn(nd*4.7+9.1)+.2*vn(nd*10.3+1.3);
    float veil=smoothstep(.5,.78,fg)*.5;
    light*=1.-veil;col*=1.-veil*.6;
  }
  for(int i=0;i<${NB};i++){
    vec4 s=uB[i];
    if(s.z<=0.)continue;
    vec2 d=fc-s.xy;
    float d2=dot(d,d),lim=uDpr*(16.+52.*s.z);
    if(d2>lim*lim)continue;
    float dd=sqrt(d2),rr=uDpr*(.95+1.35*s.z);
    float I=exp(-d2/(rr*rr))*1.5+exp(-dd/(rr*2.1))*.17;
    vec2 ab=abs(d);
    float len=uDpr*(4.+13.*s.z),th=uDpr*.5;
    I+=(exp(-ab.x/len-ab.y*ab.y/(th*th))+exp(-ab.y/len-ab.x*ab.x/(th*th)))*.4*s.z;
    float wg=step(.5,uC[i].a)*step(uC[i].a,1.5);
    light+=uC[i].rgb*I*s.w*(.5+.8*s.z)*mix(1.+uMur*.04,1.,wg);
    float R=uDpr*(2.4+5.6*s.z);
    hole=max(hole,smoothstep(R+.75,R-.75,dd)*step(.01,s.w));
    if(uC[i].a>1.5){
      // an entry in the catalogue: where the star was, a grease-pencil ring, not quite closed
      float RR=uDpr*(10.+5.*s.z);
      float arc=step(.11,fract(atan(d.y,d.x)/6.2832+.37+.31*float(i)));
      col+=vec3(.851,.627,.357)*exp(-pow((dd-RR)/(.8*uDpr),2.))*arc*smoothstep(.55,1.,1.-s.w)*.8;
    }
  }
  col+=vec3(.50,.62,.82)*texture2D(tVein,vec2(uv.x,1.-uv.y)).r*uVein;
  col+=light*uGain*mag;
  col+=vec3(.541,.357,.157)*uEnd*.075*smoothstep(.34,0.,uv.y);
  if(a>0.)col*=smoothstep(a*.93,a*1.05,r);
  col+=(h21(fc+uSeed)-.5)*.006;
  vec3 neg=mix(uBg,vec3(.047,.043,.039),clamp(hole,0.,1.));
  gl_FragColor=vec4(mix(col,neg,uNeg),1.);
}`;
export const UNIFORMS = ['uRes', 'uPar', 'uRing', 'uThin', 'uRest', 'uDeepOff', 'uPx', 'uDpr', 'uZoom', 'uMur', 'uGain', 'uNeg', 'uBlue', 'uUse', 'uVein', 'uEnd', 'uRingR', 'uDeepOn', 'uTall', 'uSeed', 'uGlow', 'uPress', 'uFront', 'uBg', 'uDeep', 'uDoor', 'tField', 'tVein', 'tAlive', 'tDeep', 'uB', 'uC'];

// compile and link without holding up a frame where the browser can do it in parallel
export function buildProgram(gl, vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs), p = gl.createProgram();
  gl.attachShader(p, v); gl.attachShader(p, f); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  const check = () => { if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || gl.getShaderInfoLog(f) || 'link failed'); return p; };
  if (!ext) return Promise.resolve().then(check);
  return new Promise((res, rej) => { let n = 0; const poll = () => { if (gl.isContextLost()) { rej(new Error('context lost')); return; }
    if (gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR) || ++n > 600) { try { res(check()); } catch (e) { rej(e); } } else setTimeout(poll, 8); }; poll(); });
}
// the deep field: one small picture, fetched once per page and shared by every sky on it
const deepCache = {};
export function loadDeep(url) {
  if (!url) return Promise.resolve(null);
  if (!deepCache[url]) deepCache[url] = new Promise((res) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; setTimeout(() => res(null), 9000); });
  return deepCache[url];
}
export const deepUrl = (base) => (base || 'assets/scenes/') + (Math.min(innerWidth, screen.width || innerWidth) > 700 ? 'deep-1600.webp' : 'deep-1024.webp');

export function setupField(gl, prog) {
  gl.useProgram(prog);
  const U = {}; UNIFORMS.forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  const T = { field: tex(0), vein: tex(1), alive: tex(2), deep: tex(3) };
  const put = (unit, t, w, h, data) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data); };
  put(0, T.field, 1, 1, new Uint8Array([255])); put(1, T.vein, 1, 1, new Uint8Array([0])); put(2, T.alive, 1, 1, new Uint8Array([255]));
  gl.activeTexture(gl.TEXTURE3); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
  gl.uniform1i(U.tField, 0); gl.uniform1i(U.tVein, 1); gl.uniform1i(U.tAlive, 2); gl.uniform1i(U.tDeep, 3);
  let hasDeep = false;
  const setDeep = (img) => { if (!img) return; gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.deep); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img); hasDeep = true; } catch (e) { hasDeep = false; } };
  return { U, T, put, setDeep, deep: () => hasDeep };
}
// where a point of the sky lands on the screen once the door has bent its light (the brighter image)
export function lensed(bx, by, E) {
  const b = Math.hypot(bx, by);
  if (!E || b < 1e-3) return [bx, by];
  const k = (b + Math.sqrt(b * b + 4 * E * E)) / (2 * b);
  return [bx * k, by * k];
}

export function mountSky(host, opts) {
  opts = opts || {};
  const mode = SKIES[opts.mode] ? opts.mode : 'vanish';
  const def = SKIES[mode];
  const still = !!opts.reduced;
  const murmur = opts.murmur || (() => 0);
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let gl = null;
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false }); } catch (e) { gl = null; }
  if (!gl) return Promise.resolve(null);
  const useDeep = !def.plain && opts.deep !== false;
  return Promise.all([buildProgram(gl, VERT, FRAG), useDeep ? loadDeep(opts.deep || deepUrl()) : null]).then(([prog, deepImg]) => start(prog, deepImg)).catch((e) => { console.warn('sky: the still sky holds —', e.message); return null; });

  function start(prog, deepImg) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const F = setupField(gl, prog), U = F.U;
  F.setDeep(deepImg);
  // how crowded the plate makes the sky, for an honest head-count
  let crowd = 1;
  if (deepImg) { try { const c = document.createElement('canvas'); c.width = 48; c.height = 27; const x = c.getContext('2d'); x.drawImage(deepImg, 0, 0, 48, 27); const d = x.getImageData(0, 0, 48, 27).data; let acc = 0;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 0.3 + d[i + 1] * 0.45 + d[i + 2] * 0.25) / 255, t = clamp((l - 0.03) / 0.47, 0, 1); acc += 0.59 + 2.5 * t * t * (3 - 2 * t); } crowd = acc / (d.length / 4); } catch (e) { crowd = 1; } }

  // ── state ──
  const fade = new Float32Array(NL), lut = new Uint8Array(NL).fill(255);
  F.put(2, F.T.alive, NL, 1, lut);
  let cssW = 0, cssH = 0, dpr = 1, field = null, bright = [], total = 0, L = def.wide;
  let front = 0, target = 0, lutDirty = false, watched = 0;
  const P = { blue: 0, zoom: 1, gain: 1, end: 0, ring: [0.5, 0.5], ringR: 0.2, thin: [0, 0], door: def.door || 0, lens: 1.6, press: 0, lift: 0, deepGain: opts.deepGain == null ? 1 : opts.deepGain, glow: 0.07 };
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  let visible = true, dead = false, raf = 0, last = 0, tick = 0, dirty = true, shown = false, statT = 0;
  const bg = opts.bg || [5 / 255, 7 / 255, 8 / 255];
  const ub = new Float32Array(NB * 4), uc = new Float32Array(NB * 4);
  const creep = still ? null : opts.creep || null; // { rate, max }: the sky goes on dying while you only watch

  const prefill = (p) => {
    front = target = Math.max(front, p);
    for (let i = 0; i < NL; i++) if (i / NL < front) { fade[i] = 1; lut[i] = 0; }
    bright.forEach((b) => { if (!b.weighed && b.order < front) b.fade = 1; });
    lutDirty = true;
  };

  function layout() {
    const W = cssW, H = cssH, unit = Math.sqrt(W * H);
    L = W / H < 0.85 ? def.tall : def.wide;
    if (def.field) {
      const cells = 42000, gw = Math.max(40, Math.round(Math.sqrt(cells * W / H))), gh = Math.max(40, Math.round(cells / gw));
      field = buildField(gw, gh, L.focus[0], L.focus[1], def.seed);
      const o8 = new Uint8Array(gw * gh); for (let i = 0; i < o8.length; i++) o8[i] = Math.round(field.order[i] * 255);
      const v8 = new Uint8Array(field.VW * field.VH); for (let i = 0; i < v8.length; i++) v8[i] = Math.round(field.fine[i] * 255);
      F.put(0, F.T.field, gw, gh, o8); F.put(1, F.T.vein, field.VW, field.VH, v8);
    }
    const keep = {}; bright.forEach((b) => { keep[b.key] = b; });
    const list = [];
    const add = (s, x, y, key) => {
      if (list.length >= NB) return;
      const old = keep[key], u = clamp(x / W, 0, 0.999), v = clamp(y / H, 0, 0.999);
      const order = s.weighed ? 2 : (s.pin != null ? s.pin : (field ? field.order[((v * field.H) | 0) * field.W + ((u * field.W) | 0)] : 2));
      list.push({ key, id: s.id || '', name: s.name || '', cap: s.cap || '', entry: s.entry, weighed: !!s.weighed, rx: x, ry: y, x, y, order,
        size: clamp(0.2 + (3.9 - s.mag) * 0.155, 0.14, 1), t: s.t, fade: old ? old.fade : 0, dur: old ? old.dur : (s.dur || 3.4), forced: old ? old.forced : false, told: old ? old.told : false });
    };
    L.groups.forEach((g, gi) => g.stars.forEach((s, si) => add(s, g.at[0] * W + s.o[0] * g.k * unit, g.at[1] * H - s.o[1] * g.k * unit, gi + ':' + si)));
    L.loose.forEach((l, i) => add({ mag: l[2], t: l[3], weighed: !!l[4], pin: l[5], entry: l[4] ? undefined : '' }, l[0] * W, l[1] * H, 'l' + i));
    bright = list;
    // an honest head-count: expected stars in frame for these layer densities
    const cellsPer = 13924 * 0.1 + 9409 * 0.1 + 4096 * 0.21 + 2809 * 0.19 + 1296 * 0.33 + 361 * 0.36;
    if (F.deep()) total = Math.round(cellsPer * crowd * (W * H) / (unit * unit)) + bright.length;
    else { const R = rng(5); let acc = 0; const S = 1500; const lat = new Float32Array(64); for (let i = 0; i < 64; i++) lat[i] = R();
      for (let i = 0; i < S; i++) { const x = (R() - 0.5) * W / unit, y = (R() - 0.5) * H / unit, n = 0.25 + 0.5 * lat[i & 63]; const band = Math.exp(-Math.pow((y * 0.92 + x * 0.4 - 0.04) / 0.17, 2)); acc += cellsPer * (0.52 + 0.5 * n + band * (0.3 + 1.2 * n)); }
      total = Math.round(acc / S) + bright.length; }
    prefill(front);
  }

  function measure() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return false;
    const reflow = !cssW || Math.abs(w - cssW) > 1 || Math.abs(h - cssH) > cssH * 0.12;
    cssW = w; cssH = h;
    dpr = clamp(Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.4e6 / (w * h))), 0.75, 2);
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    if (reflow) layout();
    dirty = true;
    return true;
  }

  function step(dt, real) {
    let moving = false;
    if (creep && watched < 1e4) { watched += real; const t = Math.min(creep.max, watched * creep.rate) * FRONT_MAX; if (t > target) target = t; }
    if (front < target) { front = Math.min(target, front + Math.max(0.24, (target - front) * 1.4) * real * (target - front > 0.012 ? 1 : 0.06)); moving = true; }
    for (let i = 0; i < NL; i++) {
      if (fade[i] < 1 && i / NL < front) { fade[i] = Math.min(1, fade[i] + real / FADE); lut[i] = Math.round(255 * (1 - sstep(fade[i]))); lutDirty = true; moving = true; }
    }
    for (const b of bright) if (b.fade < 1 && !b.weighed && (b.forced || b.order < front)) {
      if (!b.told) { b.told = true; if (opts.onDeath && b.entry != null && b.name) opts.onDeath(b); }
      b.fade = Math.min(1, b.fade + real / b.dur); moving = true;
    }
    const ex = par.tx - par.x, ey = par.ty - par.y;
    if (Math.abs(ex) + Math.abs(ey) > 0.02) { par.x += ex * Math.min(1, dt * 3); par.y += ey * Math.min(1, dt * 3); moving = true; }
    return moving;
  }

  function stats() {
    let g = 0; for (let i = 0; i < NL; i++) g += sstep(fade[i]);
    const gone = Math.round(total * (1 - WEIGHED) * g / NL);
    return { total, gone, present: total - gone, front };
  }
  // the door, in CSS px: centre and radius as drawn this frame
  const doorNow = () => { const m = Math.min(cssW, cssH); return { x: L.focus[0] * cssW, y: L.focus[1] * cssH, r: P.door * m, E: P.door * m * P.lens }; };

  function draw() {
    if (dead || !cssW) return;
    const cw = canvas.width, ch = canvas.height, mur = still ? 0 : murmur();
    if (lutDirty) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, F.T.alive); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NL, 1, gl.LUMINANCE, gl.UNSIGNED_BYTE, lut); lutDirty = false; }
    const D = doorNow(), on = D.r > 0.5;
    const cx = on ? D.x : cssW / 2, cy = on ? D.y : cssH / 2;
    // the whole sky breathes: a hair nearer, a hair further, on the Murmur
    const zoom = P.zoom * (1 - 0.004 * mur), px = par.x, py = par.y + P.lift;
    ub.fill(0); uc.fill(0);
    bright.forEach((b, i) => {
      const warm = [1, 0.74, 0.5], cool = [0.66, 0.8, 1], k = b.weighed ? 0.3 : 0.6;
      // rest → the frame: parallax and the draw-in about the door, then the bend of the lens
      let vx = (b.rx - cx - px) / zoom, vy = (b.ry - cy - py) / zoom;
      if (on) { const q = lensed(vx, vy, D.E * (1 + 0.03 * mur)); vx = q[0]; vy = q[1]; }
      b.x = cx + vx; b.y = cy + vy;
      ub[i * 4] = b.x * dpr; ub[i * 4 + 1] = ch - b.y * dpr; ub[i * 4 + 2] = b.size; ub[i * 4 + 3] = 1 - sstep(b.fade);
      for (let c = 0; c < 3; c++) { let v = 1 + ((warm[c] + (cool[c] - warm[c]) * b.t) - 1) * k; if (b.weighed) v = v * 0.55 + [1, 0.86, 0.68][c] * 0.45; uc[i * 4 + c] = v + ([0.58, 0.85, 1][c] - v) * P.blue * 0.7; }
      uc[i * 4 + 3] = b.weighed ? 1 : (b.entry != null ? 2 : 0);
    });
    const f = clamp(front / FRONT_MAX, 0, 1), v = def.vein || [0, 0];
    gl.viewport(0, 0, cw, ch);
    gl.uniform2f(U.uRes, cw, ch);
    gl.uniform2f(U.uPar, px * dpr, -py * dpr);
    gl.uniform2f(U.uRest, (cx - cssW / 2) * dpr, -(cy - cssH / 2) * dpr);
    gl.uniform4f(U.uDoor, cx * dpr, ch - cy * dpr, on ? D.r * dpr : 0, on ? D.E * dpr : 0);
    gl.uniform2f(U.uRing, P.ring[0] * cw, (1 - P.ring[1]) * ch);
    gl.uniform1f(U.uRingR, P.ringR * Math.min(cw, ch));
    gl.uniform1f(U.uPress, P.press);
    gl.uniform1f(U.uPx, Math.sqrt(cw * ch));
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uZoom, zoom);
    gl.uniform1f(U.uMur, mur);
    gl.uniform1f(U.uGain, P.gain);
    gl.uniform1f(U.uNeg, mode === 'negative' ? 1 : 0);
    gl.uniform1f(U.uBlue, P.blue);
    gl.uniform2f(U.uThin, P.thin[0], P.thin[1]);
    gl.uniform1f(U.uUse, def.field ? 1 : 0);
    gl.uniform1f(U.uVein, def.field ? v[0] + (v[1] - v[0]) * f : 0);
    gl.uniform1f(U.uEnd, Math.max(P.end, mode === 'vanish' ? sstep(clamp((f - 0.55) / 0.45, 0, 1)) : 0));
    gl.uniform1f(U.uDeepOn, F.deep() ? 1 : 0);
    gl.uniform1f(U.uTall, cssW / cssH < 0.85 ? 1 : 0);
    gl.uniform1f(U.uSeed, 0);
    gl.uniform1f(U.uGlow, P.glow);
    gl.uniform1f(U.uFront, f);
    { const dd = L.deep || [1.16, 0, 0]; gl.uniform3f(U.uDeep, P.deepGain, dd[0], def.flip ? 1 : 0); gl.uniform2f(U.uDeepOff, dd[1], dd[2]); }
    gl.uniform3f(U.uBg, bg[0], bg[1], bg[2]);
    gl.uniform4fv(U.uB, ub); gl.uniform4fv(U.uC, uc);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!shown) { shown = true; host.classList.add('has-gl'); requestAnimationFrame(() => { canvas.style.opacity = '1'; }); }
    if (opts.onFrame) opts.onFrame(api);
  }

  function frame(now) {
    raf = 0;
    if (dead || !visible || document.hidden) return;
    const real = Math.max(0, (now - last) / 1000), dt = Math.min(0.05, real); last = now;
    // the front keeps wall-clock time even when frames are slow, so the sky is never behind the scroll
    const moving = step(dt, Math.min(0.25, real));
    // the Murmur alone is slow enough to draw at a third of the frame rate
    if (moving || dirty || ++tick % 3 === 0) { draw(); dirty = false; }
    if (moving && opts.onStats && now - statT > 110) { statT = now; opts.onStats(stats()); }
    raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (still) { draw(); return; } if (!raf && visible && !dead && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  // ── wiring ──
  host.appendChild(canvas);
  if (!measure()) { canvas.remove(); return null; }
  if (opts.start) prefill(opts.start);
  if (still) prefill(opts.stillAt != null ? opts.stillAt : 0.68);
  let rt = 0;
  const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (measure()) { if (opts.onLayout) opts.onLayout(api); wake(); } }, 140); });
  ro.observe(host);
  const onVis = () => wake();
  document.addEventListener('visibilitychange', onVis);
  const onLost = (e) => { e.preventDefault(); dead = true; if (raf) cancelAnimationFrame(raf); raf = 0; host.classList.remove('has-gl'); canvas.remove(); };
  canvas.addEventListener('webglcontextlost', onLost);

  const api = {
    mode, canvas,
    setProgress(p) { const t = clamp(p, 0, 1) * FRONT_MAX; if (t > target) { target = t; if (still) { prefill(target); } wake(); } },
    set(k) { let ch = false; for (const n in k) { const a = P[n], b = k[n]; if (Array.isArray(b) ? (a[0] !== b[0] || a[1] !== b[1]) : a !== b) { P[n] = b; ch = true; } } if (ch) { dirty = true; wake(); } },
    pointer(nx, ny) { if (still) return; par.tx = clamp(nx, -1, 1) * 16; par.ty = clamp(ny, -1, 1) * 16; wake(); },
    extinguish(id, seconds) { bright.forEach((b) => { if (b.id === id && !b.forced) { b.forced = true; b.dur = seconds || 3.4; if (still) b.fade = 1; } }); dirty = true; wake(); },
    hit(x, y, radius) { let best = null, bd = radius * radius; for (const b of bright) { const d = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y); if (d < bd) { bd = d; best = b; } } return best; },
    star(id) { return bright.find((b) => b.id === id) || null; },
    door: doorNow,
    stats,
    redraw() { dirty = true; if (still) draw(); else wake(); },
    setVisible(v) { visible = v; if (v) wake(); },
    destroy() { dead = true; if (raf) cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); canvas.removeEventListener('webglcontextlost', onLost); canvas.remove(); host.classList.remove('has-gl'); }
  };
  if (opts.onLayout) opts.onLayout(api);
  if (opts.onStats) opts.onStats(stats());
  if (still) draw(); else wake();
  return api;
  }
}
