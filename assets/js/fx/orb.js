/* orb.js — the Orb, and the ink the letters are made of.
   The house's name made visible: a glass sphere standing in the middle of
   the headline, full of living ink, in which the worlds can be glimpsed —
   and out of which the headline's letters stream (fx/lattice.js).

   Drawn as a layer of the shared WebGL context (fx/gl.js), over the
   rectangle of the hero, in two passes:
     1. the headline: the gathering glyphs as sprites, over the solid
        letterform that comes up once a name has gathered, into a texture
        the size of the stage
     2. one fragment shader for the scene: that texture as it is outside
        the glass, and bent through the sphere inside it (analytic
        refraction, three wavelengths, so letters fringe at the rim); a
        short march through a warped noise volume for the two inks (gold
        that takes the light, black that blocks it); a still of one of the
        worlds held in the middle of the glass; studio reflections on the
        surface; a pool of light under it
   Pointer (or tilt, or a slow drift when there is neither) turns the ink,
   moves the lights and scatters the letters. Nothing here is content: the
   real <h1> stays in the DOM underneath and is only ghosted once a frame
   has been drawn; with no WebGL or no script the CSS orb and the plain
   headline stay; reduced motion gets one composed, settled frame. */

import * as sched from './scheduler.js';
import * as lattice from './lattice.js';

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes, uPtr;
uniform vec3 uOrb, uTintA, uTintB;
uniform vec4 uTextRect;
uniform sampler2D uText, uNoise, uStillA, uStillB;
uniform float uTime, uMix, uVis, uSteps, uIntro, uVeil;

/* two independent 3-D value noises from one fetch: the texture's G is its R
   shifted by (37,17), and A is B shifted the same way, so a slice and the
   slice above it arrive together */
vec2 n3(vec3 x){
  vec3 p = floor(x), f = fract(x);
  f = f*f*(3.0-2.0*f);
  vec2 uv = (p.xy + vec2(37.0,17.0)*p.z) + f.xy;
  vec4 s = texture2D(uNoise, (uv + 0.5)/256.0);
  return vec2(mix(s.r, s.g, f.z), mix(s.b, s.a, f.z));
}
vec4 textAt(vec2 px){
  vec2 uv = (px - uTextRect.xy)/uTextRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(uText, uv);
}
/* a rectangular studio light seen in a reflection */
float softbox(vec3 r, vec3 dir, vec3 up, vec2 half_, float soft){
  vec3 d = normalize(dir);
  vec3 u = normalize(cross(up, d));
  vec3 v = cross(d, u);
  float z = dot(r, d);
  if (z <= 0.0) return 0.0;
  vec2 q = vec2(dot(r, u), dot(r, v))/z;
  vec2 e = smoothstep(half_ + soft, half_ - soft, abs(q));
  return e.x*e.y;
}
/* where a ray of the given index leaves the sphere and lands on the plane
   of the wordmark behind it (unit-sphere coordinates) */
vec2 through(vec3 n, float ior, float zb){
  vec3 r1 = refract(vec3(0.0,0.0,-1.0), n, 1.0/ior);
  float ch = -2.0*dot(r1, n);
  vec3 p2 = n + r1*ch;
  vec3 r2 = refract(r1, -normalize(p2), ior);
  if (dot(r2, r2) < 0.5) r2 = reflect(r1, -normalize(p2));
  float tb = (-zb - p2.z)/min(r2.z, -0.05);
  return p2.xy + r2.xy*tb;
}

void main(){
  vec2 px = vec2(vUv.x, 1.0 - vUv.y)*uRes;         /* DOM pixels, y down */
  float R = uOrb.z;
  vec2 lp = vec2(px.x - uOrb.x, uOrb.y - px.y)/R;  /* sphere space, y up */
  float r = length(lp);
  vec3 gold = vec3(0.910, 0.675, 0.235);
  vec3 warm = vec3(1.0, 0.86, 0.62);

  /* ---- outside the glass: the wordmark, the halo, the pool of light */
  vec4 txt = textAt(px);
  float halo = exp(-max(r - 1.0, 0.0)*3.4)*0.20 + exp(-max(r - 1.0, 0.0)*14.0)*0.24;
  vec2 fl = vec2(lp.x, (lp.y + 1.16)*5.2);
  float pool = exp(-dot(fl, fl)*1.5)*0.34;
  vec3 outc = txt.rgb + (gold*halo + mix(gold, warm, 0.4)*pool)*uIntro;
  /* the letters take a little of the orb's light on the side that faces it */
  outc += txt.rgb*gold*exp(-max(r - 1.0, 0.0)*3.0)*0.22*uIntro;
  float outa = txt.a;

  if (r >= 1.0 + 2.5/R) { gl_FragColor = vec4(outc, outa); return; }

  /* ---- the sphere */
  float rr = min(r, 0.9995);
  vec3 n = vec3(lp/max(r, 1e-4)*rr, sqrt(1.0 - rr*rr));
  vec3 V = vec3(0.0, 0.0, 1.0);

  /* the wordmark, bent through the glass: three wavelengths */
  float zb = 1.05;
  vec2 hr = through(n, 1.445, zb), hg = through(n, 1.46, zb), hb = through(n, 1.475, zb);
  vec4 tr = textAt(uOrb.xy + vec2(hr.x, -hr.y)*R);
  vec4 tg = textAt(uOrb.xy + vec2(hg.x, -hg.y)*R);
  vec4 tb = textAt(uOrb.xy + vec2(hb.x, -hb.y)*R);
  vec3 back = vec3(tr.r, tg.g, tb.b)*0.92;

  /* the march through the ink */
  vec3 r1 = refract(-V, n, 1.0/1.46);
  float ch = -2.0*dot(r1, n);
  /* film grain, not a screen: one random texel per pixel, moving every frame */
  float jit = texture2D(uNoise, (floor(px) + 0.5)/256.0 + vec2(fract(uTime*3.7), fract(uTime*5.3))).b;
  float dt = ch/uSteps;
  vec3 pos = n + r1*dt*(0.15 + jit);
  float ang = uTime*0.045 + uPtr.x*0.55;
  float ca = cos(ang), sa = sin(ang);
  float tilt = uPtr.y*0.35;
  float ct = cos(tilt), st = sin(tilt);
  vec3 L = normalize(vec3(-0.45 + uPtr.x*0.5, 0.62 + uPtr.y*0.35, 0.64));
  vec3 acc = vec3(0.0);
  float T = 1.0;
  float bloom = smoothstep(0.0, 1.0, uIntro);
  for (int i = 0; i < 26; i++) {
    if (float(i) >= uSteps) break;
    vec3 q = vec3(ca*pos.x + sa*pos.z, pos.y, -sa*pos.x + ca*pos.z);
    q = vec3(q.x, ct*q.y - st*q.z, st*q.y + ct*q.z);
    vec3 w = q*1.25 + vec3(0.0, -uTime*0.022, 0.0);
    vec2 a = n3(w*1.15 + vec3(3.1, uTime*0.05, 7.7));
    vec2 b = n3(w*1.15 + vec3(-11.3, 5.2, -uTime*0.04));
    w += (vec3(a.x, a.y, b.x) - 0.5)*2.1;
    vec2 f1 = n3(w*1.2);
    vec2 f2 = n3(w*2.5 + 13.1);
    float g = f1.x*0.70 + f2.x*0.30;
    float k = f1.y*0.6 + f2.y*0.4;
    /* gold ink: folded sheets where the field crosses its middle */
    float sheet = max(0.0, 1.0 - abs(g - 0.5)*4.0);
    sheet = sheet*sheet*(3.0 - 2.0*sheet)*smoothstep(0.26, 0.60, b.y);
    /* black ink: slow heavy clouds */
    float dark = smoothstep(0.50, 0.74, k)*(0.55 + uVeil);
    float rad = length(pos);
    float body = smoothstep(1.0, 0.80, rad)*smoothstep(0.0, 0.6, bloom*1.35 - rad*0.35);
    /* the ink keeps a clearing in the middle, where the world shows */
    body *= mix(1.0, mix(0.36, 1.0, smoothstep(0.10, 0.72, length(pos.xy))), uVis*(1.0 - 0.6*uVeil));
    sheet *= body; dark *= body;
    float lit = 0.30 + 0.70*smoothstep(-0.9, 0.9, dot(pos, L));
    vec3 ink = mix(vec3(0.62, 0.36, 0.09), vec3(1.0, 0.80, 0.42), sheet)*lit;
    acc += T*ink*sheet*dt*3.0;
    T *= exp(-(sheet*1.9 + dark*3.4)*dt);
    pos += r1*dt;
  }

  /* a world, held in the middle of the glass */
  float sv = (-0.10 - n.z)/r1.z;
  vec2 hv = (n + r1*sv).xy + uPtr*0.05;
  float vr = length(hv);
  vec2 suv = vec2(0.5 + hv.x*0.5*0.5625*1.16, 0.5 - hv.y*0.5*1.16);
  vec3 sa3 = texture2D(uStillA, suv).rgb, sb3 = texture2D(uStillB, suv).rgb;
  vec3 vis = mix(sa3, sb3, uMix);
  vec3 tint = mix(uTintA, uTintB, uMix);
  float lum = dot(vis, vec3(0.30, 0.59, 0.11));
  /* held in the dark: a pale scene is brought down to candle light */
  vis = mix(vis, lum*mix(warm, tint, 0.35)*1.15, 0.22);
  vis *= mix(0.86, 0.40, smoothstep(0.30, 0.80, lum));
  float vmask = smoothstep(0.86, 0.30, vr)*uVis*bloom;
  vec3 lamp = (vec3(0.115, 0.078, 0.034) + tint*0.05)*(1.0 - rr*rr)*bloom;

  vec3 inside = acc + T*(back*(1.0 - vmask*0.55) + lamp + vis*vmask*0.80);
  /* glass thickens toward the rim */
  inside *= mix(1.0, 0.42, pow(rr, 5.0));

  /* the surface: studio lights, a horizon, the bright ring of the edge */
  float F = 0.035 + 0.965*pow(1.0 - n.z, 4.2);
  vec3 Rf = reflect(-V, n);
  float key = softbox(Rf, vec3(-0.62 + uPtr.x*0.22, 0.70 + uPtr.y*0.18, 0.50), vec3(0.0, 1.0, 0.0), vec2(0.20, 0.30), 0.06);
  float bars = 1.0;
  float strip = softbox(Rf, vec3(0.86, 0.10, 0.30), vec3(0.0, 1.0, 0.0), vec2(0.07, 0.62), 0.05);
  float under = softbox(Rf, vec3(0.10, -0.92, 0.20), vec3(0.0, 0.0, 1.0), vec2(0.55, 0.16), 0.14);
  /* the room in the glass: a pale ceiling, a dark middle, a gold floor */
  vec3 envc = vec3(0.012, 0.012, 0.016)
            + vec3(0.42, 0.44, 0.50)*smoothstep(0.25, 1.0, Rf.y)*0.55
            + gold*smoothstep(-0.15, -1.0, Rf.y)*0.60;
  envc += warm*key*bars*1.2 + vec3(0.75, 0.82, 1.0)*strip*0.9 + gold*under*1.1;
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), 260.0)*1.6;
  /* light gathered on the far wall of the glass, opposite the key */
  vec2 cq = lp - vec2(0.36 - uPtr.x*0.12, -0.50 - uPtr.y*0.08);
  float caust = exp(-dot(cq, cq)*7.5)*smoothstep(1.0, 0.72, rr)*0.34;
  float rim = smoothstep(0.90, 0.985, rr)*smoothstep(1.0, 0.985, rr);

  vec3 col = inside*(1.0 - F*0.85) + envc*F*1.25*bloom + warm*spec*bloom
           + warm*key*bars*0.30*bloom + vec3(0.75, 0.82, 1.0)*strip*0.10*bloom
           + gold*caust*bloom + mix(gold, warm, 0.5)*rim*0.42*(0.4 + 0.6*bloom);
  float edge = smoothstep(1.0 + 1.5/R, 1.0 - 1.5/R, r);
  gl_FragColor = vec4(mix(outc, col, edge), mix(outa, 1.0, edge));
}`;

const SPRITE_VERT = `
attribute vec2 aPos; attribute vec2 aUv; attribute float aA;
uniform vec2 uSize; varying vec2 vT; varying float vA;
void main(){ vT = aUv; vA = aA; gl_Position = vec4(aPos/uSize*2.0 - 1.0, 0.0, 1.0); }`;
const SPRITE_FRAG = `
precision mediump float; varying vec2 vT; varying float vA; uniform sampler2D uTex;
void main(){ gl_FragColor = texture2D(uTex, vT)*vA; }`;

const hex = c => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || '');
  const v = m ? parseInt(m[1], 16) : 0xD6AE5E;
  return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
};

export function init(glfx) {
  const hero = document.querySelector('[data-hero]');
  const stage = hero && hero.querySelector('[data-orb-stage]');
  const orbEl = hero && hero.querySelector('[data-orb-el]');
  const mark = hero && hero.querySelector('.hero-mark');
  if (!hero || !stage || !orbEl || !mark) return null;

  let stills = [], frames = [];
  try { stills = JSON.parse(hero.dataset.stills || '[]'); } catch { /* ink only */ }
  try { frames = JSON.parse(mark.dataset.words || '[]'); } catch { /* house only */ }
  if (!frames.length) frames = [[...mark.querySelectorAll('.hm-a, .hm-b')].map(e => e.textContent.trim().toUpperCase())];
  frames = frames.filter(f => f && f.length >= 2).map(f => [String(f[0]).toUpperCase(), String(f[1]).toUpperCase()]);
  const still = glfx.isStatic();
  const root = document.documentElement;
  const roster = [...hero.querySelectorAll('.hero-roster li')];
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  return glfx.addLayer(({ gl, compile }) => {
    const prog = compile(FRAG);
    const u = prog.u;

    /* the sprite program has its own vertex shader */
    const mk = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const sp = gl.createProgram();
    gl.attachShader(sp, mk(gl.VERTEX_SHADER, SPRITE_VERT));
    gl.attachShader(sp, mk(gl.FRAGMENT_SHADER, SPRITE_FRAG));
    gl.bindAttribLocation(sp, 0, 'aPos'); gl.bindAttribLocation(sp, 1, 'aUv'); gl.bindAttribLocation(sp, 2, 'aA');
    gl.linkProgram(sp);
    if (!gl.getProgramParameter(sp, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(sp));
    const spU = { size: gl.getUniformLocation(sp, 'uSize'), tex: gl.getUniformLocation(sp, 'uTex') };
    const vbo = gl.createBuffer();

    const mkTex = (wrap, filter) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      return t;
    };
    const upload = (tex, src, premult) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!premult);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    };

    /* noise: 256², R/G and B/A each a pair of slices 37,17 apart */
    const noise = mkTex(gl.REPEAT, gl.LINEAR);
    {
      const N = 256, a = new Uint8Array(N * N), b = new Uint8Array(N * N), d = new Uint8Array(N * N * 4);
      let s = 0x9E3779B9;
      const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 256); };
      for (let i = 0; i < N * N; i++) { a[i] = rnd(); b[i] = rnd(); }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x, j = ((y - 17 + N) % N) * N + ((x - 37 + N) % N);
        d[i * 4] = a[i]; d[i * 4 + 1] = a[j]; d[i * 4 + 2] = b[i]; d[i * 4 + 3] = b[j];
      }
      gl.bindTexture(gl.TEXTURE_2D, noise);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    }

    /* ---- the letters */
    const cs = getComputedStyle(mark);
    const body = getComputedStyle(document.body);
    const lat = lattice.create({
      pool: mark.dataset.glyphs || 'ORB&INK',
      mono: body.getPropertyValue('--font-mono') || 'monospace',
      family: cs.fontFamily + ', ' + (body.getPropertyValue('--font-title') || 'serif'),
      weight: cs.fontWeight || 700,
      frames, still,
    });
    lat.onFrame = ix => roster.forEach((li, i) => li.classList.toggle('is-on', i === ix - 1));
    const atlasTex = mkTex(gl.CLAMP_TO_EDGE, gl.LINEAR);
    upload(atlasTex, lat.atlas, true);
    const fillTex = mkTex(gl.CLAMP_TO_EDGE, gl.LINEAR);
    const fillCv = document.createElement('canvas');
    const fillC2 = fillCv.getContext('2d');
    /* the headline is composed here, then read by the scene shader */
    const fbTex = mkTex(gl.CLAMP_TO_EDGE, gl.LINEAR);
    const fbo = gl.createFramebuffer();
    let fbW = 0, fbH = 0, geoKey = '', fillFrame = -1, fillSeen = -2, sprites = new Float32Array(8), verts = new Float32Array(30);
    const ptr = { x: 0, y: 0, tx: 0, ty: 0, live: 0, sx: -1e4, sy: -1e4, vx: 0, vy: 0, px: null, py: null };

    function layout(DPR, now) {
      const sr = stage.getBoundingClientRect(), or = orbEl.getBoundingClientRect();
      if (sr.width < 2 || sr.height < 2 || or.width < 2) return null;
      const k = Math.min(DPR, 4096 / sr.width, 4096 / sr.height);
      const fontPx = parseFloat(getComputedStyle(mark).fontSize) || 120;
      const vertical = getComputedStyle(mark).gridTemplateColumns.trim().split(/\s+/).length < 3;
      const key = [Math.round(sr.width), Math.round(sr.height), Math.round(or.width), Math.round(or.left - sr.left), Math.round(or.top - sr.top), Math.round(fontPx), vertical, k].join('|');
      const g = {
        W: sr.width, H: sr.height, font: fontPx, vertical, k,
        margin: Math.max(16, sr.width * (vertical ? 0.05 : 0.045)),
        orb: { x: or.left + or.width / 2 - sr.left, y: or.top + or.height / 2 - sr.top, r: or.width / 2 },
      };
      if (key !== geoKey) {
        geoKey = key;
        const q = sched.getQuality();
        const budget = Math.round((q >= 1 ? 2400 : q >= 0.6 ? 1500 : 900) * (sr.width < 720 ? 0.6 : 1));
        lat.resize(g, budget, now);
        sprites = new Float32Array(budget * 8);
        verts = new Float32Array(budget * 30);
        fbW = Math.max(2, Math.round(sr.width * k)); fbH = Math.max(2, Math.round(sr.height * k));
        gl.bindTexture(gl.TEXTURE_2D, fbTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fbW, fbH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        fillCv.width = fbW; fillCv.height = fbH;
        fillFrame = -1;
      }
      return { g, sr, or };
    }

    /* pass 1: the headline into its texture */
    function headline(g, now, dt, qbuf) {
      /* the solid letterform: the old name's goes down as its letters leave,
         the new one's comes up once they have gathered */
      let fillA;
      if (fillFrame !== lat.frame || fillSeen !== lat.changedAt) {
        const leaving = fillFrame < 0 ? 0 : lat.leaving(now);
        if (leaving <= 0.001) {
          lat.fill(fillC2, g.k);
          upload(fillTex, fillCv, true);
          fillFrame = lat.frame; fillSeen = lat.changedAt;
          fillA = lat.settle(now);
        } else fillA = leaving;
      } else fillA = lat.settle(now);
      fillA = fillA * fillA * (3 - 2 * fillA) * 0.52;

      const n = lat.step(now, dt, { x: ptr.sx, y: ptr.sy, vx: ptr.vx, vy: ptr.vy }, sprites);
      const k = g.k;
      let o = 0;
      const quad = (x0, y0, x1, y1, u0, v0, u1, v1, a) => {
        verts[o++] = x0; verts[o++] = y0; verts[o++] = u0; verts[o++] = v0; verts[o++] = a;
        verts[o++] = x1; verts[o++] = y0; verts[o++] = u1; verts[o++] = v0; verts[o++] = a;
        verts[o++] = x0; verts[o++] = y1; verts[o++] = u0; verts[o++] = v1; verts[o++] = a;
        verts[o++] = x1; verts[o++] = y0; verts[o++] = u1; verts[o++] = v0; verts[o++] = a;
        verts[o++] = x1; verts[o++] = y1; verts[o++] = u1; verts[o++] = v1; verts[o++] = a;
        verts[o++] = x0; verts[o++] = y1; verts[o++] = u0; verts[o++] = v1; verts[o++] = a;
      };
      for (let i = 0; i < n; i++) {
        const j = i * 8, x = sprites[j] * k, y = sprites[j + 1] * k, h = sprites[j + 2] * k;
        quad(x - h, y - h, x + h, y + h, sprites[j + 3], sprites[j + 4], sprites[j + 5], sprites[j + 6], sprites[j + 7]);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbTex, 0);
      gl.viewport(0, 0, fbW, fbH);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(sp);
      gl.uniform2f(spU.size, fbW, fbH);
      gl.uniform1i(spU.tex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
      const ptrs = () => {
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 8);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
      };
      if (fillA > 0.003) {
        const fq = new Float32Array([
          0, 0, 0, 0, fillA, fbW, 0, 1, 0, fillA, 0, fbH, 0, 1, fillA,
          fbW, 0, 1, 0, fillA, fbW, fbH, 1, 1, fillA, 0, fbH, 0, 1, fillA]);
        gl.bufferData(gl.ARRAY_BUFFER, fq, gl.DYNAMIC_DRAW);
        ptrs();
        gl.bindTexture(gl.TEXTURE_2D, fillTex);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      if (n) {
        gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, n * 30), gl.DYNAMIC_DRAW);
        ptrs();
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.drawArrays(gl.TRIANGLES, 0, n * 6);
      }
      gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindBuffer(gl.ARRAY_BUFFER, qbuf);
    }

    /* the worlds: two texture slots, cross-faded; images load one at a time */
    const slots = [mkTex(gl.CLAMP_TO_EDGE, gl.LINEAR), mkTex(gl.CLAMP_TO_EDGE, gl.LINEAR)];
    const tints = [hex(''), hex('')];
    let cur = 0, have = false, mix = 0, mixing = false, nextAt = 0, idx = -1, loading = false, veil = 0;
    function load(i, slot, done) {
      if (!stills.length) return;
      loading = true;
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { loading = false; try { upload(slots[slot], im, false); tints[slot] = hex(stills[i].tint); done(); } catch { /* keep ink */ } glfx.requestStill(); };
      im.onerror = () => { loading = false; };
      im.src = stills[i].src;
    }
    if (stills.length) {
      /* start somewhere different each visit, then go round in order */
      idx = still ? 0 : Math.floor(Math.random() * stills.length);
      load(idx, 0, () => { have = true; cur = 0; });
    }

    /* pointer, tilt, drift */
    if (!still) {
      addEventListener('pointermove', e => {
        if (e.pointerType === 'touch' && !hero.contains(e.target)) return;
        ptr.tx = (e.clientX / innerWidth) * 2 - 1;
        ptr.ty = -((e.clientY / innerHeight) * 2 - 1);
        ptr.live = performance.now();
        const sr = stage.getBoundingClientRect();
        const nx = e.clientX - sr.left, ny = e.clientY - sr.top;
        ptr.vx = nx - (ptr.px == null ? nx : ptr.px); ptr.vy = ny - (ptr.py == null ? ny : ptr.py);
        ptr.px = ptr.sx = nx; ptr.py = ptr.sy = ny;
      }, { passive: true });
      hero.addEventListener('pointerleave', () => { ptr.sx = ptr.sy = -1e4; ptr.px = ptr.py = null; });
      if (!fine && 'DeviceOrientationEvent' in window && typeof DeviceOrientationEvent.requestPermission !== 'function') {
        addEventListener('deviceorientation', e => {
          if (e.gamma == null) return;
          ptr.tx = Math.max(-1, Math.min(1, e.gamma / 30));
          ptr.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
          ptr.live = performance.now();
        }, { passive: true });
      }
    }

    let t0 = 0, drawn = false;
    const gov = { acc: 0, n: 0, cut: 0, calm: 0 };
    const onLayout = () => { geoKey = ''; glfx.requestStill(); };
    addEventListener('resize', onLayout, { passive: true });
    addEventListener('load', onLayout);
    addEventListener('pageshow', onLayout);
    const fontsIn = () => { lat.buildAtlas(); upload(atlasTex, lat.atlas, true); onLayout(); };
    document.fonts && document.fonts.ready.then(fontsIn);
    document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', fontsIn);
    if ('ResizeObserver' in window) new ResizeObserver(() => glfx.requestStill()).observe(stage);
    sched.onQuality(() => { geoKey = ''; });

    return {
      draw({ t, dt, W, H, DPR, staticMode, quality, bindQuad, quad }) {
        const hr = hero.getBoundingClientRect();
        if (hr.bottom < -40 || hr.top > innerHeight + 40 || hr.width < 2) return;
        if (!t0) t0 = t;
        const L = layout(DPR, t);
        if (!L) return;
        const { g, sr, or } = L;

        /* pointer eases; with nobody there, the light drifts on its own */
        if (!staticMode) {
          const idle = performance.now() - ptr.live > 2600;
          const gx = idle ? Math.sin(t * 0.21) * 0.55 : ptr.tx, gy = idle ? Math.cos(t * 0.17) * 0.35 + 0.1 : ptr.ty;
          const e = 1 - Math.pow(0.001, dt * (idle ? 0.35 : 1.4));
          ptr.x += (gx - ptr.x) * e; ptr.y += (gy - ptr.y) * e;
        } else { ptr.x = -0.25; ptr.y = 0.3; }

        headline(g, t, staticMode ? 0.016 : dt, quad);
        ptr.vx *= 0.8; ptr.vy *= 0.8;

        /* worlds cross-fade; the black ink rises between them */
        if (have && !staticMode && stills.length > 1) {
          if (!nextAt) nextAt = t + 6.5;
          if (!mixing && !loading && t > nextAt) {
            const ni = (idx + 1) % stills.length, slot = 1 - cur;
            load(ni, slot, () => { idx = ni; mixing = true; });
            nextAt = t + 1e9;
          }
          if (mixing) {
            mix = Math.min(1, mix + dt / 2.2);
            if (mix >= 1) { mixing = false; mix = 0; cur = 1 - cur; nextAt = t + 6.5; }
          }
        }
        veil += ((mixing ? Math.sin(mix * Math.PI) * 1.5 : 0) - veil) * Math.min(1, dt * 4);

        const x = hr.left * DPR, w = hr.width * DPR, h = hr.height * DPR;
        const yGl = H - hr.top * DPR - h;
        gl.viewport(x, yGl, w, h);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(Math.max(0, x), Math.max(0, yGl), w, h);
        gl.useProgram(prog.p);
        bindQuad(prog.p);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        const bind = (unit, tex, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, unit); };
        bind(1, noise, u.uNoise);
        bind(2, slots[cur], u.uStillA);
        bind(3, slots[1 - cur], u.uStillB);
        bind(0, fbTex, u.uText);
        /* the orb hangs back a little as the page leaves: the letters slide
           behind the glass and bend through it */
        const lag = staticMode ? 0 : Math.max(0, Math.min(hr.height, -hr.top)) * 0.16;
        gl.uniform2f(u.uRes, w, h);
        gl.uniform3f(u.uOrb, (or.left + or.width / 2 - hr.left) * DPR, (or.top + or.height / 2 - hr.top + lag) * DPR, or.width / 2 * DPR);
        gl.uniform4f(u.uTextRect, (sr.left - hr.left) * DPR, (sr.top - hr.top) * DPR, sr.width * DPR, sr.height * DPR);
        gl.uniform2f(u.uPtr, ptr.x, ptr.y);
        gl.uniform3f(u.uTintA, ...tints[cur]);
        gl.uniform3f(u.uTintB, ...tints[1 - cur]);
        gl.uniform1f(u.uTime, staticMode ? 23.4 : t);
        gl.uniform1f(u.uMix, mix * mix * (3 - 2 * mix));
        gl.uniform1f(u.uVis, have ? 1 : 0);
        gl.uniform1f(u.uVeil, veil);
        /* its own governor: a second of long frames takes three steps off
           the march (down to 7), a few seconds of short ones give them back */
        if (!staticMode) {
          gov.acc += dt; gov.n++;
          if (gov.acc >= 1) {
            const avg = gov.acc / gov.n;
            if (avg > 0.024 && gov.cut < 12) gov.cut += 3;
            else if (avg < 0.0175 && gov.cut > 0 && ++gov.calm >= 4) { gov.cut -= 3; gov.calm = 0; }
            gov.acc = 0; gov.n = 0;
          }
        }
        const base = quality >= 1 ? (fine ? 22 : 12) : quality >= 0.6 ? (fine ? 13 : 10) : 8;
        gl.uniform1f(u.uSteps, Math.max(7, base - gov.cut));
        gl.uniform1f(u.uIntro, staticMode ? 1 : Math.min(1, (t - t0) / 2.4));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.activeTexture(gl.TEXTURE0);
        if (!drawn) { drawn = true; root.classList.add('orb-live'); }
      },
    };
  });
}
