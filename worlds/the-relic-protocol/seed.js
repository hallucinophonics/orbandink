// seed.js — everything The Relic Protocol draws with a shader, in one WebGL context.
// One law: the object never changes. Everything round it does.
//
// THE SEED. A single fragment shader on a single quad: a sphere-traced signed-distance
// dodecahedron (max over the six face-normal axis pairs, chamfered by a smooth max),
// matte absolute, read almost entirely by its edges; a dish of dim light under it and
// a shadow darker than shadows are; sparse ember-stars behind, whose light bends near it.
//
// THE LIVING PLATES. Each world is a poster plate painted in the covers' own rendering
// (a far layer, and a near layer of figures cut out to stand in front of it). Here it is
// laid on paper, the near plane moves against the far one, and the law that book spends
// acts on the print: weight (the sheet is laid in courses, hoisted into place, and then
// keeps rising), light (the inks are lit on a budget, and the Dim comes in while you
// watch), law (a sighted star grows error bars and the plates drift out of register).
// The hero and the closing plain are the same paper with weather on it: haze on the
// floor of the plain, a slow shadow crossing, dust that rises instead of falling.
//
// The canvas is transparent and fixed: the page's own void shows through, and what is
// drawn here sits BETWEEN a band's backdrop and its text.
// This module is a renderer only. relic.js owns the loop, the easing, the pause, and
// every decision about where things are and what has been spent.

const VERT = 'attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0.0, 1.0); }';

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform vec3 uPose;   // centre x, y (device px, GL origin), circumradius (device px)
uniform mat3 uRot;    // world -> object
uniform vec3 uTint;   // haze + dish tint (the territory's air)
uniform vec3 uRim;    // edge + rim tint
uniform vec2 uG[6];   // gloss, one bit per face: x = +normal, y = -normal
uniform vec4 uFx;     // cloud, lit, haze, alpha
uniform vec4 uEnv;    // time, star drift (px), dpr, chamfer K
uniform vec4 uAux;    // bruise, pointer x, pointer y (device px), stars
uniform vec4 uShelf;  // the long dish under the books: centre x, y, half-width (device px), amount
uniform vec4 uPl;     // x = 1: the object hangs over a stand the page draws itself, so no dish of light, no ring, no shadow here

const float RIN = 0.79465447;               // inradius for circumradius 1
const vec3 N0 = vec3(0.0, 0.52573111, 0.85065081);
const vec3 N1 = vec3(0.0, -0.52573111, 0.85065081);
const vec3 N2 = vec3(0.52573111, 0.85065081, 0.0);
const vec3 N3 = vec3(-0.52573111, 0.85065081, 0.0);
const vec3 N4 = vec3(0.85065081, 0.0, 0.52573111);
const vec3 N5 = vec3(0.85065081, 0.0, -0.52573111);
const float CLOUD_ID = 8.0;                  // the twelfth face

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float map(vec3 p){
  float K = uEnv.w;
  float a0 = abs(dot(p, N0)), a1 = abs(dot(p, N1)), a2 = abs(dot(p, N2));
  float a3 = abs(dot(p, N3)), a4 = abs(dot(p, N4)), a5 = abs(dot(p, N5));
  float m = max(max(max(a0, a1), max(a2, a3)), max(a4, a5));
  float s = exp((a0 - m) / K) + exp((a1 - m) / K) + exp((a2 - m) / K)
          + exp((a3 - m) / K) + exp((a4 - m) / K) + exp((a5 - m) / K);
  return m + K * log(s) - RIN;
}

#define FACE(N, i) d = dot(p, N); a = abs(d); w = exp((a - m) / K); sg = d < 0.0 ? -1.0 : 1.0; n += w * sg * N; ws += w; g += w * (d < 0.0 ? uG[i].y : uG[i].x); if (a >= m - 1e-6) { fN = sg * N; fid = float(i) * 2.0 + (d < 0.0 ? 1.0 : 0.0); fg = d < 0.0 ? uG[i].y : uG[i].x; }

vec3 shade(vec3 p, vec3 rd, float px){
  float K = uEnv.w;
  float m = max(max(max(abs(dot(p, N0)), abs(dot(p, N1))), max(abs(dot(p, N2)), abs(dot(p, N3)))), max(abs(dot(p, N4)), abs(dot(p, N5))));
  vec3 n = vec3(0.0), fN = N0; float ws = 0.0, g = 0.0, fg = 0.0, fid = 0.0, d, a, w, sg;
  FACE(N0, 0) FACE(N1, 1) FACE(N2, 2) FACE(N3, 3) FACE(N4, 4) FACE(N5, 5)
  n = normalize(n); g /= ws;
  float edge = 1.0 - 1.0 / ws;               // 0 on a face, 0.5 on an edge, 0.67 at a vertex
  vec3 V = -rd;
  float ndv = max(dot(fN, V), 0.0);
  vec3 Lk = normalize(uRot * vec3(-0.55, 0.75, 0.60));   // key: high, left, in front
  vec3 Lr = normalize(uRot * vec3(0.85, 0.20, -0.50));   // rim: behind, right
  vec3 Lb = normalize(uRot * vec3(-0.70, -0.45, -0.55)); // low, behind, left

  // matte absolute: darker than the page's own darks
  vec3 c = vec3(0.00006) + vec3(0.00030) * max(dot(n, Lk), 0.0);

  // edges too exact: the chamfer is the only part of the object that answers light
  float line = smoothstep(0.13, 0.44, edge);
  float rim = pow(max(dot(n, Lr), 0.0), 1.4) + 0.55 * pow(max(dot(n, Lk), 0.0), 2.6) + 0.30 * pow(max(dot(n, Lb), 0.0), 2.0);
  c += uRim * line * (0.013 + 1.05 * rim * rim + 0.06 * rim);

  // the glossing: an oblique sheen, never face-on
  float fr = pow(1.0 - ndv, 2.6);
  vec3 R = reflect(rd, fN) * uRot;            // reflection, back in world space
  float band = exp(-pow((R.y - 0.30) / 0.22, 2.0)) + 0.40 * exp(-pow((R.y + 0.55) / 0.26, 2.0));
  band *= 0.62 + 0.38 * sin(R.x * 2.6 + 1.3);
  vec3 T = normalize(cross(fN, vec3(0.31, 0.87, 0.38))); vec3 B = cross(fN, T);
  vec3 H = normalize(Lk + V);
  float hx = dot(H, T) / 0.07, hy = dot(H, B) / 0.40, hn = dot(H, fN);
  float D = 1.0 / (3.14159 * 0.07 * 0.40 * pow(hx * hx + hy * hy + hn * hn, 2.0));
  float streak = D * max(dot(fN, Lk), 0.0) * (0.04 + 0.96 * pow(1.0 - max(dot(V, H), 0.0), 5.0));

  // the figure: visible only inside the sheen, only at an angle
  vec2 uv = vec2(dot(p, T), dot(p, B));
  float ha = hash(vec2(fid, 4.1)) * 6.2832; float cs = cos(ha), sn = sin(ha);
  uv = mat2(cs, -sn, sn, cs) * uv;
  float lw = 0.0025 + 0.8 * px;
  vec2 fo = uv - vec2(-0.86, -0.22);           // the figure's origin lies off the face
  float fa = atan(fo.y, fo.x), fl = length(fo);
  float fan = abs(fract(fa * 5.0 + 0.5) - 0.5) / 5.0 * fl;      // three rays, a few degrees apart
  float fig = (1.0 - smoothstep(lw, lw * 2.2, fan)) * step(abs(fa - 0.20), 0.29);
  fig = max(fig, 1.0 - smoothstep(lw, lw * 2.2, abs(fl - 0.92)));  // one arc across them
  fig *= 1.0 - smoothstep(0.36, 0.47, length(uv));

  float face = 1.0 - line;
  c += vec3(0.72, 0.77, 0.86) * fg * face * (fr * band * (0.085 + 0.10 * fig) + fr * 0.006 + streak * 0.014 * (1.0 + 1.0 * fig));

  // the twelfth face clouds; then all twelve are faintly lit
  float isC = step(abs(fid - CLOUD_ID), 0.5);
  float mott = 0.72 + 0.28 * sin(uv.x * 9.0 + 1.0) * sin(uv.y * 7.0 + 2.0);
  c += uFx.x * isC * face * vec3(0.42, 0.37, 0.50) * (0.012 + 0.07 * pow(1.0 - ndv, 1.4)) * mott;
  c += uFx.y * (vec3(0.86, 0.89, 0.95) * face * (0.0010 + 0.0034 * ndv) + uRim * line * 0.10);
  return c;
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 q = (fc - uPose.xy) / uPose.z;
  float r2 = dot(q, q);
  float px = 1.0 / uPose.z;
  float haze = uFx.z, sa = uFx.w;

  // the air round it: a halo, so the object reads as an absence
  vec3 col = uTint * haze * (0.020 * exp(-r2 / 1.35) + 0.0005 * exp(-r2 / 6.0));

  // the dish of light beneath, and its rim
  float bare = 1.0 - uPl.x;
  vec2 e = vec2(q.x / 1.02, (q.y + 1.44) / 0.165); float er = length(e);
  col += uTint * haze * 0.050 * exp(-er * er * 1.3) * bare;
  float es = length(vec2(e.x / 1.02, e.y / 0.165)) / max(er, 1e-4);
  float ring = 1.0 - smoothstep(0.7 * px, 1.9 * px, abs(er - 1.0) / es);
  col += uRim * ring * 0.075 * haze * (0.22 + 0.78 * smoothstep(-0.3, 1.0, -e.y)) * bare;
  col *= sa;

  // a shadow very slightly darker than shadows are
  vec2 sv = vec2(q.x / 0.64, (q.y + 1.44) / 0.078);
  float occ = 0.96 * exp(-dot(sv, sv) * 1.05) * sa * bare;
  col *= 1.0 - occ;

  // the shelf: the same dish, drawn long, for the books to stand in
  if (uShelf.w > 0.001) {
    vec2 s = vec2((fc.x - uShelf.x) / uShelf.z, (fc.y - uShelf.y) / (uShelf.z * 0.070));
    float sr = length(s), spx = 1.0 / uShelf.z;
    float sg = length(vec2(s.x, s.y / 0.070)) / max(sr, 1e-4);
    float sring = 1.0 - smoothstep(0.7 * spx, 1.9 * spx, abs(sr - 1.0) / sg);
    col += (vec3(0.42, 0.38, 0.52) * 0.060 * exp(-sr * sr * 1.5) + vec3(0.86, 0.74, 0.50) * sring * 0.060 * (0.25 + 0.75 * smoothstep(-0.3, 1.0, -s.y))) * uShelf.w;
  }

  // the light near your hand goes the wrong colour, the longer you stay
  if (uAux.x > 0.001) {
    vec2 pd = (fc - uAux.yz) / (300.0 * uEnv.z);
    float pn = hash(floor(fc / (3.0 * uEnv.z)));
    vec3 bru = mix(vec3(0.36, 0.44, 0.38), vec3(0.40, 0.35, 0.45), 0.5 + 0.5 * sin(uEnv.x * 0.11 + pd.x));
    col += bru * uAux.x * exp(-dot(pd, pd)) * (0.16 + 0.04 * pn);
  }

  // ember-stars: sparse, dim, slow. Near the object their light bends: physics is negotiable there.
  vec2 lf = fc - uPose.xy;
  vec2 fcs = fc - lf * (0.30 * sa / (r2 + 0.85));
  float cell = 104.0 * uEnv.z;
  vec2 sp = (fcs + vec2(0.0, uEnv.y)) / cell; vec2 ci = floor(sp), cf = fract(sp);
  float hs = hash(ci);
  if (hs > 0.58) {
    vec2 sc = vec2(hash(ci + 1.3), hash(ci + 7.1)) * 0.8 + 0.1;
    float sd = length((cf - sc) * cell);
    float sz = (0.55 + 1.05 * hash(ci + 3.7)) * uEnv.z;
    float tw = 0.72 + 0.28 * sin(uEnv.x * (0.3 + 0.8 * hash(ci + 5.5)) + hs * 40.0);
    float sb = smoothstep(sz, 0.0, sd) * (0.18 + 0.82 * hash(ci + 9.2)) * tw;
    vec3 scol = mix(vec3(0.61, 0.27, 0.19), vec3(0.86, 0.89, 0.94), step(0.80, hash(ci + 2.9)));
    col += scol * sb * 0.50 * (1.0 - occ) * uAux.w;
  }

  if (r2 < 1.05 && sa > 0.004) {
    const float CD = 7.0;
    vec3 ro = uRot * vec3(0.0, 0.0, CD);
    vec3 rd = uRot * normalize(vec3(q * 0.14433757, -1.0));
    float b = dot(ro, rd), cc = dot(ro, ro) - 1.0, h = b * b - cc;
    if (h > 0.0) {
      float sq = sqrt(h), t = -b - sq, t1 = -b + sq, md = 1e9, tm = t; bool hit = false;
      for (int i = 0; i < 40; i++) {
        float d = map(ro + rd * t);
        if (d < md) { md = d; tm = t; }
        if (d < 0.0003) { hit = true; break; }
        t += d; if (t > t1) break;
      }
      float cov = (hit ? 1.0 : 1.0 - smoothstep(0.0, 1.5 * px, md)) * sa;
      if (cov > 0.0) {
        vec3 oc = shade(ro + rd * (hit ? t : tm), rd, px);
        col = mix(col, oc, cov); occ = mix(occ, 1.0, cov);
      }
    }
  }
  col = pow(max(col, 0.0), vec3(0.4545));
  col += (fract(52.9829189 * fract(dot(fc, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0 * step(0.002, col.g + occ);   // dither the low gradients
  gl_FragColor = vec4(max(col, 0.0), occ);
}`;

/* ── LIVING PLATES ───────────────────────────────────────────────────────────
   Each world as a flat poster in two layers, and the law that book spends acting
   on the print. Fragment shaders over one shared header. A plate is drawn into the
   same canvas as the Seed, inside its own rectangle. */
const PLATE_HEAD = `
precision highp float;
uniform sampler2D uTex;   // the far plane: sky, hills, the column, what hangs in the sky
uniform sampler2D uTex2;  // the near plane: floor, brass, people (premultiplied alpha)
uniform vec4 uBox;    // origin.xy and size.xy of the plate, device px, GL space
uniform vec4 uCrop;   // u0, v0, du, dv: the part of the art this box shows (object-fit: cover)
uniform vec4 uEdge;   // which side fades (+1 left edge, -1 right edge, 0 neither), side width, top width, bottom width
uniform vec4 uP;      // time, spend (0 → 1, one way), entrance (0 → 1), alpha
uniform vec4 uQ;      // pointer.xy in plate space (-9 if away), dpr, 1 if there is a near plane
uniform vec4 uPar;    // the near plane's shift (uv), how far the far plane moves the other way, unused
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ return 0.55 * vnoise(p) + 0.28 * vnoise(p * 2.03 + 7.1) + 0.17 * vnoise(p * 4.1 + 3.3); }
vec2 uvOf(vec2 p){ return uCrop.xy + p * uCrop.zw; }
vec2 farUV(vec2 uv){ return uv - uPar.xy * uPar.z; }
vec2 nearUV(vec2 uv){ return uv + uPar.xy; }
// above the sheet the sky runs on: the colour of the sheet's own top edge, taken wide so nothing is
// stretched or repeated, with the tooth of painted paper put back into it
vec3 skyAbove(vec2 uv){
  vec3 c = vec3(0.0);
  for (int i = -3; i <= 3; i++) {
    float dx = float(i) * 0.012;
    c += texture2D(uTex, vec2(uv.x + dx, 0.990)).rgb + texture2D(uTex, vec2(uv.x + dx + 0.006, 0.981)).rgb;
  }
  c /= 14.0;
  vec2 g = (gl_FragCoord.xy - uBox.xy) / uQ.z;
  float n = 0.5 * (fbm(g * 0.42) - 0.5) + 0.55 * (hash(floor(g * 0.9)) - 0.5) + 0.3 * (vnoise(g * 0.16) - 0.5);
  return c * (1.0 + 0.11 * n);
}
vec3 artUV(vec2 uv){
  vec2 fu = farUV(uv);
  vec3 a = texture2D(uTex, fu).rgb;
  if (fu.y > 0.972) a = mix(a, skyAbove(fu), smoothstep(0.972, 1.0, fu.y));
  vec2 nu = nearUV(uv);
  vec4 b = texture2D(uTex2, nu) * uQ.w * step(nu.y, 1.0);
  return a * (1.0 - b.a) + b.rgb;
}
vec3 art(vec2 p){ return artUV(uvOf(p)); }
// the sheet it is printed on: tooth, an uneven lay of ink, a little fibre
vec3 paper(vec3 c){
  vec2 g = (gl_FragCoord.xy - uBox.xy) / uQ.z;
  float tooth = hash(floor(g * 1.3)) - 0.5;
  float sheet = fbm(g * 0.011) - 0.5;
  float fibre = vnoise(g * vec2(0.42, 0.06) + 9.0) - 0.5;
  return c * (1.0 + 0.055 * tooth + 0.09 * sheet + 0.02 * fibre);
}
float edgeFade(vec2 p){
  float a = smoothstep(0.0, max(uEdge.z, 1e-4), 1.0 - p.y) * smoothstep(0.0, max(uEdge.w, 1e-4), p.y);
  if (uEdge.x > 0.5) a *= smoothstep(0.0, uEdge.y, p.x);
  else if (uEdge.x < -0.5) a *= smoothstep(0.0, uEdge.y, 1.0 - p.x);
  return a;
}
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
const float ASPECT = 1.7768332;   // every plate is 1672 × 941
`;

// THE PLAIN. The hero's ground and the closing ground. Paper; a slow shadow of something
// large crossing; haze lying on the floor of the plain and drifting; dust that rises
// instead of falling; and the bruise coming into the sky with use.
const PLATE_HERO = PLATE_HEAD + `
void main(){
  vec2 p = (gl_FragCoord.xy - uBox.xy) / uBox.zw;
  vec2 uv = uvOf(p);
  float t = uP.x, H = uPar.w;                                   // H: where the far edge of the floor is on the sheet
  vec3 col = artUV(uv);
  vec2 g = uv * vec2(ASPECT, 1.0);
  float cloud = fbm(g * 1.5 + vec2(t * 0.012, t * 0.004));
  col *= (0.90 + 0.20 * cloud) * mix(0.50, 1.0, uP.z);          // something large, passing slowly; uP.z < 1 is dusk
  // haze: it lies on the plain, thickest at the far edge of the floor, and moves
  float up = uv.y - H;
  float lie = exp(-max(up, 0.0) * 9.5) * smoothstep(-0.05, 0.02, up);
  float drift = fbm(vec2(g.x * 2.2 - t * 0.018, uv.y * 7.0 + t * 0.006));
  vec3 mist = mix(vec3(0.58, 0.52, 0.62), vec3(0.62, 0.60, 0.50), smoothstep(0.3, 0.8, uv.x)) * mix(0.42, 1.0, uP.z);
  col = mix(col, mist, lie * (0.10 + 0.34 * drift));
  // dust that rises: physics is negotiable near it
  vec2 gp = (gl_FragCoord.xy - uBox.xy) / uQ.z;                 // css px
  vec2 cell = vec2(58.0, 84.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 q = gp / cell + vec2(fi * 17.3, 0.0);
    float ci = floor(q.x);
    q.y -= t * (0.10 + 0.22 * hash(vec2(ci, 3.1 + fi))) + hash(vec2(ci, 9.7)) * 40.0;
    vec2 id = floor(q), f = fract(q);
    float h = hash(id + fi * 31.0);
    vec2 c = vec2(0.2 + 0.6 * hash(id + 1.7) + 0.08 * sin(t * 0.5 + h * 20.0), 0.5);
    float d = length((f - c) * cell);
    float near = exp(-pow((uv.x - 0.5) / 0.20, 2.0)) * smoothstep(-0.06, 0.06, up) * (1.0 - smoothstep(0.26, 0.60, up));
    col += vec3(0.95, 0.78, 0.42) * step(0.80, h) * near * (1.0 - smoothstep(0.4, 1.5, d)) * 0.42 * mix(0.6, 1.0, uP.z);
  }
  vec2 v = (p - vec2(0.5, 0.48)) * vec2(1.0, 0.8);
  col *= 1.0 - 0.30 * dot(v, v);
  vec3 bru = mix(vec3(0.36, 0.44, 0.38), vec3(0.40, 0.35, 0.45), 0.5 + 0.5 * sin(t * 0.07 + p.x * 2.4));
  float where = smoothstep(0.25, 0.95, uv.y * 0.8 + 0.5 * fbm(g * 2.6 + 4.0));
  col = mix(col, col * 0.55 + bru * 0.42, uP.y * 0.55 * where);   // the wrong colour, from the top of the sky down
  col = paper(col);
  gl_FragColor = vec4(col, 1.0) * edgeFade(p) * uP.w;
}`;

// 01 · WEIGHT. The picture is laid in slabs, hoisted into place from below (the Lift).
// Then the hoisting does not stop: slab by slab the world lets go and rises, casting
// shadow on what is still down, leaving the sky where the ground was.
const PLATE_BARROW = PLATE_HEAD + `
void main(){
  vec2 p = (gl_FragCoord.xy - uBox.xy) / uBox.zw;
  float t = uP.x, spend = uP.y, tin = uP.z;
  vec2 cs = vec2(124.0, 44.0) * uQ.z / uBox.zw;
  float r0 = floor(p.y / cs.y);
  // three layers: the bare rock the picture was laid on; the slab still in its place; the nearest slab that has left the ground
  vec3 inCol = vec3(0.0), topCol = vec3(0.0);
  float inA = 0.0, topA = 0.0, topZ = 0.0, shadow = 0.0;
  for (int i = -2; i <= 12; i++) {
    float r = r0 - float(i);
    float sw = cs.x * (0.70 + 0.75 * hash(vec2(r, 9.1)));                      // each course is cut to its own length
    float c = floor(p.x / sw + hash(vec2(r, 3.7)));
    vec2 id = vec2(c, r);
    float h = hash(id), h2 = hash(id + 19.3);
    float ry = (r + 0.5) * cs.y;
    float thr = clamp(0.04 + 0.30 * (1.0 - ry) + 0.62 * h, 0.03, 0.97);       // the heights let go first
    float o = max(0.0, spend - thr);
    float lift = o * o * 1.5 + o * 0.10;
    lift += step(0.0005, o) * 0.0045 * sin(t * (0.45 + 0.8 * h2) + h * 6.28);   // weightless: it bobs
    float e = clamp(tin * 1.7 - h2 * 0.7, 0.0, 1.0); e = 1.0 - pow(1.0 - e, 4.0);
    float off = lift - (1.0 - e) * (0.04 + 0.09 * h);                          // the Lift: hoisted into place from below
    float a = e * (1.0 - smoothstep(0.34, 0.66, lift));
    float up = smoothstep(0.0, 0.05, lift);
    // the shadow it throws on whatever is still down: displaced, and softer the higher it goes
    float ds = (p.y - off + lift * 0.42 + 0.004) / cs.y - r;
    float soft = 0.10 + 2.2 * lift;
    shadow = max(shadow, a * up * smoothstep(0.0, soft, ds) * smoothstep(1.0, 1.0 - soft, ds) * step(0.0, ds) * step(ds, 1.0));
    float d = (p.y - off) / cs.y - r;                                          // 0..1 inside this slab
    if (d < 0.0 || d >= 1.0 || a < 0.004) continue;
    vec3 k = art(vec2(p.x, p.y - off));
    k *= 1.0 + 0.12 * up;                                                      // nearer the lamps
    k += vec3(0.79, 0.57, 0.18) * 0.45 * up * (1.0 - smoothstep(0.0, 2.6 * uQ.z, d * cs.y * uBox.w));   // lamplight from below, on the edge that has left the ground
    if (lift < 0.0015) { inCol = k; inA = a; }
    else if (lift > topZ) { topCol = k; topA = a; topZ = lift; }
  }
  // what the sheet lies on: at first the print itself, a little unlit, so nothing is ever missing while the
  // courses are hoisted in; once weight is being spent it is bare, and the gaps go dark
  vec3 full = art(p);
  vec3 rock = mix(vec3(dot(full, vec3(0.3, 0.6, 0.1))), full, 0.45) * vec3(0.30, 0.26, 0.27);
  rock = mix(mix(vec3(dot(full, vec3(0.3, 0.6, 0.1))), full, 0.8) * 0.84, rock, smoothstep(0.0, 0.10, spend));
  float laid = 1.0;
  vec3 col = mix(rock * laid, inCol, inA) * (1.0 - 0.52 * shadow);
  col = mix(col, topCol, topA);
  col += vec3(0.79, 0.57, 0.18) * 0.03 * smoothstep(0.2, 1.0, p.x * 0.6 + p.y * 0.6) * max(inA, topA);
  col = paper(col);
  gl_FragColor = vec4(col, max(laid, max(inA, topA))) * edgeFade(p) * uP.w;
}`;

// 02 · LIGHT. The picture is lit by light somebody paid for. While you look at it the
// budget runs down: the Dim comes in as volumes, not as a wipe; the beam is the last thing to go.
const PLATE_VESPER = PLATE_HEAD + `
const vec2 STAR = vec2(0.1579, 0.8640);   // the dying star: 264, 128 of the 1672 × 941 plate
const vec2 LENS = vec2(0.7673, 0.4772);   // the great lens at the end of the bench: 1283, 492
void main(){
  vec2 p = (gl_FragCoord.xy - uBox.xy) / uBox.zw;
  vec2 uv = uvOf(p);
  float t = uP.x, spend = uP.y, ign = uP.z;
  vec3 tex = artUV(uv);
  float lum = dot(tex, vec3(0.299, 0.587, 0.114));
  vec3 dim = mix(vec3(lum), tex, 0.22) * vec3(0.30, 0.25, 0.24);
  dim = mix(dim, vec3(0.227, 0.165, 0.133) * 0.8, smoothstep(0.45, 0.8, lum));     // a lit window, dead: ember
  vec2 A = LENS + uPar.xy * uPar.z, B = STAR + uPar.xy * uPar.z;      // both are on the far plane
  vec2 as = vec2(ASPECT, 1.0);
  float db = seg(uv * as, A * as, B * as);
  float ds = length((uv - B) * as);
  float keep = exp(-db * 9.0);
  float f = 0.62 * fbm(uv * vec2(5.2, 3.1) + vec2(0.0, t * 0.010)) + 0.38 * keep;
  float x = f - spend * 1.10 + 0.06;
  float hold = smoothstep(-0.05, 0.07, x) * ign;
  vec3 lit = tex * 1.06;
  // paid-for light spills: every lit window and lantern blooms a little
  vec3 bl = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float fi = float(i), an = fi * 2.39996, rr = 0.0016 + 0.00062 * fi;      // a small spiral of taps: a soft halo, no ghosts
    bl += artUV(uv + vec2(cos(an) / ASPECT, sin(an)) * rr) * (1.0 - fi / 15.0);
  }
  bl /= 7.6;
  lit += bl * 1.5 * smoothstep(0.22, 0.56, bl.b) * (0.86 + 0.14 * sin(t * 0.9 + uv.x * 40.0));     // cold light only: brass does not glow
  lit += vec3(0.27, 0.89, 0.82) * 0.07 * smoothstep(0.9, 0.0, length(uv - vec2(0.08, 0.20)));
  lit += vec3(0.85, 0.31, 0.64) * 0.06 * smoothstep(0.9, 0.0, length(uv - vec2(0.95, 0.30)));
  vec3 col = mix(dim, lit, hold);
  col = paper(col);
  // decoherence: a thin cold fringe where light is failing
  col += vec3(0.27, 0.89, 0.82) * 0.22 * (1.0 - smoothstep(0.0, 0.035, abs(x))) * step(0.01, spend) * (1.0 - spend) * ign;
  // coherent light: the long throw from the lens to the dying star. The last thing to go.
  float life = (1.0 - smoothstep(0.80, 1.0, spend)) * ign;
  float h = clamp(dot((uv - A) * as, (B - A) * as) / dot((B - A) * as, (B - A) * as), 0.0, 1.0);
  float pk = 0.70 + 0.30 * sin(h * 60.0 - t * 2.4);
  vec3 gold = vec3(1.0, 0.82, 0.46);
  col += gold * life * pk * (0.95 * exp(-db * db * 420000.0) + 0.16 * exp(-db * 150.0));
  col += vec3(1.0, 0.92, 0.70) * life * 0.9 * exp(-dot((uv - A) * as, (uv - A) * as) * 9000.0);
  col += vec3(0.98, 0.30, 0.24) * life * (0.8 * exp(-ds * ds * 2600.0) + 0.16 * exp(-ds * 16.0)) * (0.85 + 0.15 * sin(t * 1.1));
  gl_FragColor = vec4(col, 1.0) * edgeFade(p) * uP.w;
}`;

// 03 · LAW. A banked star, sighted. The measurement is exact; then it is exact with
// error bars; then the picture itself goes out of register, first at the margins.
const PLATE_CONSTANT = PLATE_HEAD + `
const vec2 STAR = vec2(0.5736, 0.6440);    // the banked star: 959, 335 of the 1672 × 941 plate
const vec2 GLASS = vec2(0.2679, 0.4208);   // the mouth of the observer's glass: 448, 545
void main(){
  vec2 p = (gl_FragCoord.xy - uBox.xy) / uBox.zw;
  vec2 uv = uvOf(p);
  float t = uP.x, D = uP.y;
  float px = 1.3 * uCrop.w / uBox.w;
  vec2 as = vec2(ASPECT, 1.0);
  // out of register: the three inks no longer land in the same place, first at the margins
  float marg = smoothstep(0.10, 0.60, length((uv - 0.5) * vec2(1.2, 1.0)));
  vec2 off = D * (0.30 + 0.70 * marg) * vec2(0.0050, -0.0052);
  vec3 a = artUV(uv), b = artUV(uv + off), c = artUV(uv - off * 0.6);
  vec3 col = mix(a, vec3(b.r, a.g, c.b), 0.92 * clamp(D * 1.5, 0.0, 1.0));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum) * vec3(0.90, 0.94, 1.0), 0.22) * (0.92 + 0.08 * uP.z);
  col = paper(col);
  // graticule: measurement is devotion
  vec2 g = abs(fract(uv * vec2(12.0 * ASPECT, 12.0)) - 0.5);
  col += vec3(0.86, 0.90, 0.96) * (0.022 + 0.03 * D) * (1.0 - smoothstep(0.0, px * 12.0, min(g.x / ASPECT, g.y)));
  // the star, banked: low, steady, with the smallest wander
  vec2 S = STAR + uPar.xy * uPar.z + D * 0.0030 * vec2(sin(t * 0.21), cos(t * 0.17));
  vec2 q = (uv - S) * as;
  float ds = length(q);
  vec3 pale = vec3(0.86, 0.90, 0.96);
  float breathe = 0.86 + 0.14 * sin(t * 0.7);
  col += pale * breathe * (1.2 * exp(-ds * ds * 60000.0) + 0.26 * exp(-ds * 30.0) + 0.42 * exp(-abs(q.x) * 600.0) * exp(-abs(q.y) * 22.0) + 0.28 * exp(-abs(q.y) * 600.0) * exp(-abs(q.x) * 22.0));
  // error bars: they only widen
  vec3 err = vec3(0.92, 0.48, 0.34);
  float R = 0.020 + 0.115 * D, L = R * 1.55, cap = 0.008 + 0.005 * D;
  float ringE = (1.0 - smoothstep(0.0, px, abs(ds - R))) * 0.75;
  ringE += (1.0 - smoothstep(0.0, px, abs(ds - R * (1.0 + 0.55 * D)))) * 0.28 * D;
  float bars = (1.0 - smoothstep(0.0, px, abs(q.y))) * step(abs(q.x), L) + (1.0 - smoothstep(0.0, px, abs(q.x))) * step(abs(q.y), L);
  bars += (1.0 - smoothstep(0.0, px, abs(abs(q.x) - L))) * step(abs(q.y), cap) + (1.0 - smoothstep(0.0, px, abs(abs(q.y) - L))) * step(abs(q.x), cap);
  col += err * (ringE + 0.8 * min(bars, 1.0)) * (0.35 + 0.65 * smoothstep(0.0, 0.08, D));
  // the line of sight opens into a cone of doubt
  vec2 A = (GLASS + uPar.xy * uPar.z) * as, AS = S * as - A; float la = length(AS); vec2 dir = AS / la;
  vec2 w = uv * as - A;
  float along = dot(w, dir), perp = abs(dot(w, vec2(-dir.y, dir.x)));
  float wd = 0.0010 + D * 0.070 * clamp(along / la, 0.0, 1.2);
  float inside = step(0.04, along) * step(along, la * 1.10);
  col += pale * inside * (0.20 * (1.0 - smoothstep(0.0, px * 1.2, perp)) + 0.06 * D * (1.0 - smoothstep(wd * 0.5, wd, perp)) + 0.30 * D * (1.0 - smoothstep(0.0, px, abs(perp - wd))));
  gl_FragColor = vec4(col, 1.0) * edgeFade(p) * uP.w;
}`;

const PLATE_FRAG = { hero: PLATE_HERO, barrow: PLATE_BARROW, vesper: PLATE_VESPER, constant: PLATE_CONSTANT };

export function mountSeed(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  } catch (e) { return null; }
  if (!gl) return null;
  const compile = (type, src) => {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  };
  const link = (frag, names) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, 'aP');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; names.forEach((n) => { u[n] = gl.getUniformLocation(p, n); });
    return { p, u };
  };
  let seedProg = null; const plateProg = {};
  try {
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  } catch (e) { console.warn('seed: no quad, the stills hold', e); return null; }
  gl.disable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);      // premultiplied: light adds, shadow covers

  const st = { dead: false, dpr: 1, cap: 2, w: 0, h: 0, slow: 0, frames: 0 };
  // Pixel budget rather than a flat DPR cap: a phone keeps its edges exact, a 4K
  // desktop does not pay for four times the pixels. Steps down if frames run long.
  const BUDGET = 2.3e6;
  const size = () => {
    const cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
    const dpr = Math.max(0.75, Math.min(window.devicePixelRatio || 1, st.cap, Math.sqrt(BUDGET / Math.max(1, cw * ch))));
    const w = Math.max(2, Math.round(cw * dpr)), h = Math.max(2, Math.round(ch * dpr));
    if (w !== st.w || h !== st.h) { canvas.width = st.w = w; canvas.height = st.h = h; }
    st.dpr = st.w / cw; st.cw = cw; st.ch = ch;
  };
  size();
  window.addEventListener('resize', size);
  const onLost = (e) => { e.preventDefault(); st.dead = true; canvas.style.opacity = '0'; document.documentElement.classList.remove('seed-on'); document.querySelectorAll('[data-gl].live').forEach((el) => el.classList.remove('live')); };
  canvas.addEventListener('webglcontextlost', onLost);

  const rot = new Float32Array(9), gbuf = new Float32Array(12);
  const orient = (t, turn, tx, ty) => {
    // Ry(a) · Rx(b) · Rz(c), then the pointer's small tilt on top
    const a = 0.085 * t + turn, b = 0.46 + 0.20 * Math.sin(0.043 * t), c = 0.31 + 0.031 * t;
    const mul = (A, B) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return o; };
    const rx = (v) => [1, 0, 0, 0, Math.cos(v), -Math.sin(v), 0, Math.sin(v), Math.cos(v)];
    const ry = (v) => [Math.cos(v), 0, Math.sin(v), 0, 1, 0, -Math.sin(v), 0, Math.cos(v)];
    const rz = (v) => [Math.cos(v), -Math.sin(v), 0, Math.sin(v), Math.cos(v), 0, 0, 0, 1];
    const M = mul(mul(rx(ty), ry(tx)), mul(mul(ry(a), rx(b)), rz(c)));   // object -> world, row-major
    // world -> object is Mᵀ; GL reads column-major, so Mᵀ's columns are M's rows: a straight copy
    for (let i = 0; i < 9; i++) rot[i] = M[i];
    return rot;
  };

  const begin = () => { if (st.dead) return false; gl.viewport(0, 0, st.w, st.h); gl.clear(gl.COLOR_BUFFER_BIT); return true; };

  // s: { x, y, r (css px, y from top), tint[3], rim[3], gloss[12], cloud, lit, haze, alpha, t, turn, tiltX, tiltY, star,
  //      stars (0..1), bruise, ptr [x, y] css px, shelf { x, y, w, a } css px, plinth (true: it hangs over a stand the page draws) }
  const render = (s) => {
    if (st.dead) return;
    if (!seedProg) {
      try { seedProg = link(FRAG, ['uPose', 'uRot', 'uTint', 'uRim', 'uG', 'uFx', 'uEnv', 'uAux', 'uShelf', 'uPl']); }
      catch (e) { console.warn('seed: shader unavailable, the poster holds', e); st.dead = true; return; }
    }
    const U = seedProg.u, d = st.dpr, R = Math.max(4, s.r * d);
    gl.useProgram(seedProg.p);
    gl.viewport(0, 0, st.w, st.h);
    gl.uniform3f(U.uPose, s.x * d, st.h - s.y * d, R);
    gl.uniformMatrix3fv(U.uRot, false, orient(s.t, s.turn || 0, s.tiltX || 0, s.tiltY || 0));
    gl.uniform3f(U.uTint, s.tint[0], s.tint[1], s.tint[2]);
    gl.uniform3f(U.uRim, s.rim[0], s.rim[1], s.rim[2]);
    for (let i = 0; i < 12; i++) gbuf[i] = s.gloss[i];
    gl.uniform2fv(U.uG, gbuf);
    gl.uniform4f(U.uFx, s.cloud || 0, s.lit || 0, s.haze, s.alpha);
    gl.uniform4f(U.uEnv, s.t, (s.star || 0) * d, d, Math.max(0.0042, 0.95 / R));
    const ptr = s.ptr || [-9999, -9999];
    gl.uniform4f(U.uAux, s.bruise || 0, ptr[0] * d, st.h - ptr[1] * d, s.stars == null ? 1 : s.stars);
    const sh = s.shelf;
    if (sh && sh.a > 0.001) gl.uniform4f(U.uShelf, sh.x * d, st.h - sh.y * d, Math.max(4, sh.w * d), sh.a); else gl.uniform4f(U.uShelf, 0, 0, 1, 0);
    gl.uniform4f(U.uPl, s.plinth ? 1 : 0, 0, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  /* plates */
  const textures = new Map();
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
  let blank = null;
  const blankTex = () => {
    if (blank) return blank;
    blank = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return blank;
  };
  // url -> { tex, ready, aspect }. w, h: the size wanted, in px (a picture is never enlarged past its own size).
  // alpha: a near plane, with a transparent ground (stored premultiplied).
  const loadTexture = (url, w, h, alpha, onReady) => {
    if (textures.has(url)) return textures.get(url);
    const rec = { tex: null, ready: false, aspect: w / h };
    textures.set(url, rec);
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      if (st.dead) return;
      try {
        const nw = im.naturalWidth || w, nh = im.naturalHeight || h;
        const k = Math.min(1, maxTex / w, maxTex / h, nw / w, nh / h); w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k));
        rec.aspect = nw / nh;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!alpha);
        gl.texImage2D(gl.TEXTURE_2D, 0, alpha ? gl.RGBA : gl.RGB, alpha ? gl.RGBA : gl.RGB, gl.UNSIGNED_BYTE, c);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        c.width = c.height = 1;
        rec.tex = tex; rec.ready = true;
        if (onReady) onReady(rec);
      } catch (e) { console.warn('plate: texture failed, the still holds', e); }
    };
    im.src = url;
    return rec;
  };

  // pl: { kind, far, near (records; near may be null), x, y, w, h (css px, y from top), posX, posY (0..1),
  //       sk (0, or the scene's height as a part of the box's), side (1 fades on its left, -1 on its right, 0 neither), edge [side, top, bottom], t, spend, enter, alpha,
  //       ptr [x, y] css px or null, par [x, y] (uv): how far the near plane has moved against the far one,
  //       hz (the plain: where the far edge of the floor is, 0..1 up the sheet), clip [x, y, w, h] css px or null }
  const plate = (pl) => {
    if (st.dead || !pl.far || !pl.far.ready || (pl.near && !pl.near.ready)) return false;
    let P = plateProg[pl.kind];
    if (P === undefined) {
      try { P = plateProg[pl.kind] = link(PLATE_FRAG[pl.kind], ['uTex', 'uTex2', 'uBox', 'uCrop', 'uEdge', 'uP', 'uQ', 'uPar']); }
      catch (e) { console.warn('plate: shader unavailable, the still holds', e); P = plateProg[pl.kind] = null; }
    }
    if (!P) return false;
    const d = st.dpr, bx = pl.x * d, bw = pl.w * d, bh = pl.h * d, by = st.h - (pl.y + pl.h) * d;
    gl.useProgram(P.p);
    gl.viewport(Math.round(bx), Math.round(by), Math.round(bw), Math.round(bh));
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, pl.near ? pl.near.tex : blankTex());
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pl.far.tex);
    gl.uniform1i(P.u.uTex, 0); gl.uniform1i(P.u.uTex2, 1);
    gl.uniform4f(P.u.uBox, Math.round(bx), Math.round(by), Math.round(bw), Math.round(bh));
    // object-fit: cover, object-position: posX posY
    const ab = pl.w / pl.h, at = pl.far.aspect;
    let u0 = 0, v0 = 0, du = 1, dv = 1;
    const posX = pl.posX == null ? 0.5 : pl.posX;
    if (pl.sk > 0 && ab < at * pl.sk) { dv = 1 / pl.sk; du = ab / (at * pl.sk); u0 = (1 - du) * posX; }      // set smaller, standing on the foot of the box: the sky runs on above (clamped)
    else if (ab > at) { dv = at / ab; v0 = (1 - dv) * (1 - pl.posY); } else { du = ab / at; u0 = (1 - du) * posX; }
    gl.uniform4f(P.u.uCrop, u0, v0, du, dv);
    gl.uniform4f(P.u.uEdge, pl.side, pl.edge[0], pl.edge[1], pl.edge[2]);
    gl.uniform4f(P.u.uP, pl.t, pl.spend, pl.enter, pl.alpha == null ? 1 : pl.alpha);
    const ptr = pl.ptr, par = pl.par || [0, 0];
    gl.uniform4f(P.u.uQ, ptr ? (ptr[0] - pl.x) / pl.w : -9, ptr ? 1 - (ptr[1] - pl.y) / pl.h : -9, d, pl.near ? 1 : 0);
    gl.uniform4f(P.u.uPar, par[0], par[1], 0.45, pl.hz || 0);
    if (pl.clip) {      // a plate that is larger than the band it belongs to is cut at the band's edge
      const cx = Math.round(pl.clip[0] * d), cy = Math.round(st.h - (pl.clip[1] + pl.clip[3]) * d);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(cx, cy, Math.round(pl.clip[2] * d), Math.round(pl.clip[3] * d));
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (pl.clip) gl.disable(gl.SCISSOR_TEST);
    return true;
  };

  // frame-time probe: called by the loop with each frame's dt (ms)
  const probe = (dt) => {
    st.frames++;
    if (st.frames < 20) return;
    if (dt > 26) st.slow++; else st.slow = Math.max(0, st.slow - 0.25);
    if (st.slow > 24 && st.cap > 1) { st.cap = Math.max(1, st.cap - 0.25); st.slow = 0; size(); }
  };

  return {
    begin, render, plate, loadTexture, probe, resize: size,
    get dead() { return st.dead; },
    get dpr() { return st.dpr; },
    // one frame at a chosen size, returned as a PNG data URL (used to make the static posters)
    snapshot(w, h, s) {
      const keep = [st.w, st.h, st.dpr];
      canvas.width = st.w = w; canvas.height = st.h = h; st.dpr = 1;
      begin(); render(s);
      const url = canvas.toDataURL('image/png');
      canvas.width = st.w = keep[0]; canvas.height = st.h = keep[1]; st.dpr = keep[2];
      return url;
    },
    destroy() { window.removeEventListener('resize', size); canvas.removeEventListener('webglcontextlost', onLost); }
  };
}
