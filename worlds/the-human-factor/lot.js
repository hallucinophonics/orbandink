// lot.js — the lot's light. Every shader on the site: hand-written WebGL, no libraries. The only
// textures are the books' own whole covers and the printing plates in assets/scenes/ (a key line
// block, two spot plates and a silhouette each), which the PRINT and FOIL stages print themselves.
// One law: on this lot everything is shown in the flattering light. Velvet hangs where the sky was
// and takes the lamps along its folds; the asphalt is wet and gives every lamp back as a streak;
// paint, laminate and brass throw a highlight that slides as you walk past; and something
// overhead that is not a lamp keeps a beam on the forecourt and brings it round to you.
// Each stage is drawn over a composition that is already in the markup. It gets a canvas only when
// it is about to be seen, runs only while it is on screen in a visible tab, caps its pixel ratio,
// and under reduced motion draws one settled frame. If WebGL is missing or lost, the canvas goes
// and the markup underneath is the page.
const q = (s, r) => (r || document).querySelector(s);
const qa = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

const VERT = 'attribute vec2 aP; varying vec2 vUv; void main(){ vUv = aP*0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }';
const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i = 0; i < 4; i++){ s += a*noise(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }`;
// Heavy velvet in long folds. x runs along the cloth, y is 0 at the hem and 1 overhead; "low" is how much
// of the lot's light reaches this point, and "warmth" is how much of that light is still ours.
const VELVET = `
vec3 velvet(float x, float y, float t, float low, float warmth){
  float loose = 1.0 - 0.7*smoothstep(0.0, 1.0, y);
  float sway = (0.020*sin(t*0.19 + x*1.6) + 0.011*sin(t*0.13 + x*3.7 + 2.0) + 0.004*sin(t*0.29 + x*8.1 + y*2.0)) * loose;
  float lay = fbm(vec2(x*0.7 + 3.0, y*0.32));
  float u = x + sway;
  float ph = u*14.5 + 6.0*lay + 0.45*sin(y*1.9 + x*0.6);
  float h  = 0.58*sin(ph) + 0.26*sin(ph*2.17 + 1.3) + 0.20*sin(ph*0.41 + 0.7) + 0.07*sin(ph*4.9 + 0.3);
  float dh = 0.58*cos(ph) + 0.26*2.17*cos(ph*2.17 + 1.3) + 0.20*0.41*cos(ph*0.41 + 0.7) + 0.07*4.9*cos(ph*4.9 + 0.3);
  vec3 N = normalize(vec3(-dh, 0.0, 1.05));
  float key  = max(dot(N, normalize(vec3(0.74, 0.0, 0.67))), 0.0);
  float fill = max(dot(N, normalize(vec3(-0.80, 0.0, 0.60))), 0.0);
  float rim  = pow(1.0 - N.z, 1.5);
  float pit  = smoothstep(-1.05, 0.55, h);
  vec3 vel = vec3(0.290, 0.184, 0.235), vio = vec3(0.357, 0.290, 0.478), warm = vec3(1.000, 0.800, 0.560);
  vec3 col = vel * (0.05 + 1.45*pow(key, 1.4)) * mix(vec3(1.0), warm*1.2, (0.08 + 0.34*low)*warmth);
  col += vio * (0.40*pow(fill, 1.6) + 0.34*rim) * (0.80 - 0.30*low*warmth) * (1.0 + 0.9*(1.0 - warmth));
  col += warm * vel * 0.7 * rim * low * warmth;
  col *= 0.18 + 0.82*pit;
  col *= 0.36 + 0.74*low;
  col *= 1.0 + 0.07*sin(gl_FragCoord.y*2.2 + h*3.0)*sin(u*uRes.y*2.2);
  return col;
}`;

/* 1. THE FORECOURT — the hero. Velvet sky, wet asphalt, six lamps and their streaks, the billboard's
   glow lying on the ground, and the beam. */
const FORECOURT = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uHor;
uniform vec3 uLamp[6]; uniform vec4 uBoard; uniform vec3 uBeam; uniform vec4 uString;
${NOISE}
${VELVET}
// The string of bulbs between the poles (the bulbs themselves are in the markup): x of the first
// span, the span's length, the height of the wire at a pole, and how far it sags. Returns the
// nearest bulb's position, and whether it is one of the ones that still works.
vec3 bulb(float x){
  float bs = uString.y/13.0, k = floor((x - uString.x)/bs);
  float bx = uString.x + (k + 0.5)*bs, tt = fract((bx - uString.x)/uString.y);
  return vec3(bx, uString.z - 4.0*uString.w*tt*(1.0 - tt), step(0.5, mod(k*7.0 + 3.0, 23.0)));
}
vec3 skyAt(vec2 uv, float asp){
  float ys = (uv.y - uHor)/(1.0 - uHor);
  float xs = (uv.x - 0.5)*asp/(1.0 - uHor);
  vec3 c = velvet(xs, ys, uTime, exp(-ys*2.3), 1.0);
  return c * (1.0 - 0.72*smoothstep(0.40, 1.0, ys));
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes; float asp = uRes.x/uRes.y; float t = uTime;
  // the beam: a cone from something above the top edge to a place on the ground
  vec2 A = vec2(uBeam.x + 0.16, 1.5), T = vec2(uBeam.x, uHor*(1.0 - uBeam.y));
  vec2 ax = vec2((T.x - A.x)*asp, T.y - A.y); float len = length(ax); vec2 n = ax/len;
  vec2 p = vec2((uv.x - A.x)*asp, uv.y - A.y);
  float s = dot(p, n)/len, dist = abs(p.x*n.y - p.y*n.x);
  float rad = mix(0.03, 0.15, clamp(s, 0.0, 1.0));
  float cone = (0.55*smoothstep(rad, 0.0, dist) + 0.45*smoothstep(rad*0.5, 0.0, dist)) * step(0.0, s) * smoothstep(1.03, 0.97, s);
  float dust = 0.6 + 0.4*fbm(vec2(dist*26.0 + 3.0, s*5.0 - t*0.04));
  float vol = cone * dust * (0.45 + 0.55*s) * uBeam.z;
  vec2 pp = vec2((uv.x - T.x)*asp, uv.y - T.y);
  float pool = exp(-(pp.x*pp.x/0.0225 + pp.y*pp.y/0.0009)*1.5) * uBeam.z;
  vec3 beamCol = vec3(0.88, 0.98, 0.93);
  vec3 col;
  if(uv.y >= uHor){
    col = skyAt(uv, asp);
    vec3 B = bulb(uv.x); vec2 bd = vec2((uv.x - B.x)*asp, uv.y - B.y);
    col += vec3(1.0, 0.86, 0.60) * B.z * exp(-dot(bd, bd)/0.00020) * 0.16;     // what each bulb puts on the cloth behind it
  } else {
    float d = 1.0 - uv.y/uHor;                                   // 0 at the horizon, 1 at the near edge
    float z = 1.0/(d*1.3 + 0.07);
    vec2 w = vec2((uv.x - 0.65)*asp*z*0.5, z);
    col = vec3(0.150, 0.128, 0.112) * mix(1.0, 0.7 + 0.6*noise(w*vec2(46.0, 18.0)), smoothstep(0.02, 0.45, d)) * mix(1.25, 0.62, d);
    float pud = smoothstep(0.46, 0.64, fbm(w*vec2(0.9, 0.5) + 3.7));        // where the water stands
    float rough = mix(1.0, 0.28, pud);
    float rip = noise(w*vec2(9.0, 3.2) + vec2(0.0, t*0.22)) - 0.5;
    // bay lines, in perspective, worn
    float tt = (d + 0.1)/1.1, sx = (uv.x - 0.65)/tt + 0.65;
    float f = abs(fract((sx + 0.2625)/0.25 + 0.5) - 0.5)*0.25*tt;
    float line = smoothstep(0.0030, 0.0012, f/(0.35 + 0.65*tt)) * (0.30 + 0.5*noise(w*vec2(5.0, 9.0)));
    col = mix(col, vec3(0.62, 0.59, 0.53), line*0.42);
    // the drape, mirrored
    vec2 m = vec2(uv.x + rip*0.02*rough, min(uHor + (uHor - uv.y)*1.5 + 0.002, 0.999));
    vec3 refl = skyAt(m, asp) * (0.05 + 0.55*pow(1.0 - d, 2.2)) * (0.45 + 0.75*pud);
    // the lamps, each a streak in the wet
    float along = uHor - uv.y;
    for(int i = 0; i < 6; i++){
      vec3 L = uLamp[i]; float hgt = max(L.y - uHor, 0.01);
      float dx = (uv.x - L.x)*asp + rip*0.035*rough*(0.3 + along*6.0);
      float sig = mix(0.006, 0.020, rough) * (1.0 + along*7.0);
      float prof = smoothstep(0.0, hgt*0.8, along) * exp(-max(along - hgt, 0.0)/(0.05 + 0.20*rough));
      refl += vec3(1.0, 0.975, 0.90) * L.z * exp(-dx*dx/(sig*sig)) * prof * (0.20 + 0.55*pud);
    }
    // too many bulbs: each one a hair of light in the wet
    float xb = uv.x + rip*0.010*rough*(0.3 + along*6.0);
    vec3 B = bulb(xb); float hb = max(B.y - uHor, 0.01);
    float bdx = (xb - B.x)*asp, bsg = mix(0.0030, 0.0075, rough)*(1.0 + along*6.0);
    refl += vec3(1.0, 0.90, 0.68) * B.z * exp(-bdx*bdx/(bsg*bsg)) * smoothstep(0.0, hb*0.9, along) * exp(-max(along - hb, 0.0)/(0.03 + 0.10*rough)) * (0.07 + 0.30*pud);
    // the billboard's glow, lying on the ground in front of it
    float bc = (uBoard.x + uBoard.y)*0.5, bw = max((uBoard.y - uBoard.x)*0.5, 0.001);
    float bx = smoothstep(bw*1.5, bw*0.2, abs(uv.x - bc + rip*0.02*rough));
    refl += vec3(0.86, 0.79, 0.73) * bx * exp(-along/0.10) * 0.22 * (0.5 + 0.6*pud) * uBoard.w;
    // the beam's pool, and its streak toward the viewer
    float tdx = (uv.x - T.x)*asp + rip*0.03*rough;
    float streak = exp(-tdx*tdx/(0.012*(1.0 + along*5.0))) * smoothstep(T.y + 0.01, T.y - 0.05, uv.y) * exp(-max(T.y - uv.y, 0.0)/0.16);
    col += col * beamCol * pool * 5.0;
    refl += beamCol * (pool*0.35 + streak*0.4*uBeam.z) * (0.5 + 0.6*pud);
    // aggregate, catching whatever light there is
    col += refl * (1.0 + 1.6*step(0.9984, hash(floor(gl_FragCoord.xy*0.8))));
    col *= 1.0 - 0.35*smoothstep(0.5, 1.0, d);
    vol *= smoothstep(T.y - 0.02, T.y + 0.02, uv.y);
  }
  col += beamCol * vol;
  col += (hash(gl_FragCoord.xy + fract(t)*61.0) - 0.5) * 0.010;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

/* 2. THE ROOM — velvet behind the appraisal, and behind each book's exhibit. uAp is how far the
   appraisal has gone: the showroom's warm light leaves the folds, the violet stays, and what
   light there is draws in around the sheet. */
const ROOM = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uAp; uniform vec2 uSpot; uniform float uGain;
${NOISE}
${VELVET}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes; float asp = uRes.x/uRes.y;
  vec2 sp = vec2((uv.x - uSpot.x)*asp, (uv.y - uSpot.y)*1.25);
  float pool = smoothstep(mix(1.15, 0.70, uAp), 0.05, length(sp));
  vec3 c = velvet((uv.x - 0.5)*asp*1.15, uv.y*0.9, uTime*0.7, pool*mix(0.85, 0.60, uAp), 1.0 - uAp) * uGain;
  c += (hash(gl_FragCoord.xy + fract(uTime)*61.0) - 0.5) * 0.010;
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}`;

/* 3. A PLATE — a cover, or a piece of one, under the lamp. The relief is the paint itself; inside the
   pool of light the print is flattered (deeper, warmer), the laminate takes a soft sheen, and
   anything painted or brass throws a hard glint. Outside the pool it is exactly the picture. */
const PLATE = `
precision highp float;
uniform sampler2D uTex; uniform vec2 uRes; uniform vec2 uTexel; uniform vec3 uLight; uniform float uMask; uniform float uGain;
varying vec2 vUv;
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec3 c = texture2D(uTex, vUv).rgb;
  float hx = lum(texture2D(uTex, vUv + vec2(uTexel.x, 0.0)).rgb) - lum(texture2D(uTex, vUv - vec2(uTexel.x, 0.0)).rgb);
  float hy = lum(texture2D(uTex, vUv + vec2(0.0, uTexel.y)).rgb) - lum(texture2D(uTex, vUv - vec2(0.0, uTexel.y)).rgb);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float paint = smoothstep(0.14, 0.46, sat);          // paint and brass take the light; bare paper barely does
  float k = mix(0.45, 1.7, paint);
  vec3 N = normalize(vec3(-hx*k, -hy*k, 1.0));
  float asp = uRes.x/uRes.y;
  vec3 P = vec3(vUv.x*asp, vUv.y, 0.0), Lp = vec3(uLight.x*asp, uLight.y, uLight.z);
  vec3 H = normalize(normalize(Lp - P) + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(N, H), 0.0);
  float pool = smoothstep(0.95, 0.0, distance(P.xy, Lp.xy));
  vec3 col = mix(vec3(lum(c)), c, 1.0 + 0.30*pool*paint);
  col *= mix(vec3(1.0), vec3(1.05, 1.03, 0.99), pool*paint);
  col += vec3(1.0, 0.96, 0.86) * (pow(nh, 30.0)*0.035 + pow(nh, 150.0)*(0.03 + 0.95*paint)) * uGain;
  float a = 1.0;
  if(uMask > 0.5){ vec2 e = clamp(vUv/0.08, 0.0, 1.0) * clamp((1.0 - vUv)/0.08, 0.0, 1.0); a = e.x*e.y; }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0)*a, a);
}`;

/* 4. THE MAKER'S PLATE — brushed brass. The brushing runs along the plate, so each lamp on the lot
   comes back as a soft upright bar, and the bars slide as the page and the pointer move. */
const BRASS = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uShift;
${NOISE}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes; float asp = uRes.x/uRes.y;
  float brush = 0.6*noise(vec2(uv.x*asp*2.2, uv.y*460.0)) + 0.4*noise(vec2(uv.x*asp*9.0, uv.y*1200.0));
  vec3 base = mix(vec3(0.43, 0.31, 0.11), vec3(0.80, 0.65, 0.30), 0.42 + 0.34*brush);
  float bars = 0.0;
  for(int i = 0; i < 4; i++){
    float x = fract(0.11 + 0.27*float(i) + uShift*(0.55 + 0.12*float(i)));
    float dx = (uv.x - x + (brush - 0.5)*0.045) / (0.045 + 0.02*float(i));
    bars += exp(-dx*dx) * (0.85 - 0.14*float(i));
  }
  vec3 col = base * (0.62 + 0.26*uv.y) + vec3(1.0, 0.93, 0.72) * bars * (0.22 + 0.34*brush);
  float e = min(min(uv.x, 1.0 - uv.x)*asp, min(uv.y, 1.0 - uv.y));
  col *= 0.72 + 0.28*smoothstep(0.0, 0.035, e);
  col += vec3(1.0, 0.95, 0.80) * 0.22 * smoothstep(0.03, 0.0, 1.0 - uv.y) + (hash(gl_FragCoord.xy) - 0.5)*0.012;
  gl_FragColor = vec4(col, 1.0);
}`;

/* 5. THE PRINT — a three-plate job: a key line block, a yellow plate and a teal plate, laid one
   after another and a hair out of register, the way the lot's handbills are. uMode 1 is the
   poster pasted on the billboard, on its own paper, with a beam that had to be printed because on
   paper light has to be; uMode 0 is a plate printed on the page itself (the canvas is clear
   wherever there is no ink). The plates are in the texture: R key, G yellow, B teal, A silhouette. */
const PRINT = `
precision highp float;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uTime; uniform float uMode;
uniform vec4 uObj; uniform float uAsp; uniform vec3 uPass; uniform vec3 uLight;
${NOISE}
const vec3 YEL = vec3(0.949, 0.663, 0.110), TEA = vec3(0.090, 0.455, 0.502), KEY = vec3(0.078, 0.141, 0.290);
vec2 objUv(vec2 uv, float fa){
  vec2 p = vec2((uv.x - uObj.x)*fa, uv.y - uObj.y);
  float c = cos(uObj.w), s = sin(uObj.w); p = vec2(c*p.x - s*p.y, s*p.x + c*p.y);
  float w = uObj.z*fa;
  return vec2(p.x/w + 0.5, p.y*uAsp/w + 0.5);
}
vec4 plates(vec2 t){ return texture2D(uTex, clamp(t, 0.0, 1.0)) * step(0.0, t.x)*step(t.x, 1.0)*step(0.0, t.y)*step(t.y, 1.0); }
// a halftone screen: how much of this pixel a dot covers, for an amount of ink between 0 and 1
float screen(vec2 px, float cell, float ang, float amt){
  float c = cos(ang), s = sin(ang); vec2 g = vec2(c*px.x + s*px.y, -s*px.x + c*px.y)/cell;
  float r = 0.74*sqrt(clamp(amt, 0.0, 1.0));
  return smoothstep(r, r - 1.3/cell, length(fract(g) - 0.5)) * step(0.004, amt);
}
void over(inout vec4 a, vec3 c, float k){ a.rgb = a.rgb*(1.0 - k) + c*k; a.a = a.a*(1.0 - k) + k; }
void main(){
  vec2 px = gl_FragCoord.xy, uv = px/uRes; float fa = uRes.x/uRes.y, t = uTime;
  float cell = max(uRes.y/mix(150.0, 92.0, uMode), 3.2);
  vec2 ot = objUv(uv, fa);
  vec4 m = plates(ot), ms = plates(ot + vec2(0.0034, -0.0046));
  float tooth = 0.78 + 0.22*noise(px*0.9);                       // the paper's tooth starves the ink
  vec3 go = smoothstep(vec3(0.0), vec3(0.10), uPass*1.1 - ot.x);  // each roller travels along the plate
  float Y = smoothstep(0.34, 0.62, ms.g)*go.x, T = smoothstep(0.34, 0.62, ms.b)*go.y, K = smoothstep(0.20, 0.50, m.r)*go.z;
  vec4 acc = vec4(0.0);
  if(uMode > 0.5){
    vec2 q = vec2(uv.x*fa, uv.y);
    vec3 paper = vec3(0.872, 0.800, 0.742) * (0.94 + 0.10*fbm(q*4.0 + 2.0));
    paper += (noise(px*vec2(0.7, 0.22)) - 0.5)*0.035;
    float sx = uv.x*3.0;                                          // pasted up in three sheets
    paper *= 1.0 - 0.13*smoothstep(0.0045, 0.0, abs(fract(sx + 0.5) - 0.5)/3.0);
    paper *= 0.975 + 0.05*hash(vec2(floor(sx), 3.0));
    acc = vec4(paper, 1.0);
    vec2 A = vec2(0.5, 1.24), G = vec2(0.5, 0.155);
    float s = clamp((A.y - uv.y)/(A.y - G.y), 0.0, 1.3), hw = mix(0.035, 0.405, s), dx = abs(uv.x - 0.5)*fa;
    float er = length(vec2(dx/0.405, (uv.y - G.y)/0.046));
    float cone = uv.y >= G.y ? smoothstep(hw, hw - 0.010, dx) : smoothstep(1.0, 0.94, er);
    float edge = clamp(dx/max(hw, 0.001), 0.0, 1.0), breathe = 0.5 + 0.5*sin(t*0.45);
    float knock = 1.0 - m.a;                                      // nothing prints under the car
    over(acc, YEL, screen(px, cell, 1.31, cone*(1.0 - edge)*(0.13 + 0.07*breathe))*0.92*knock);
    over(acc, TEA, screen(px, cell, 0.52, cone*(0.05 + 0.40*edge*edge)*(0.80 + 0.20*breathe)*(0.50 + 0.50*s))*0.92*knock);
    float line = smoothstep(1.7/uRes.y, 0.5/uRes.y, abs(dx - hw))*step(G.y, uv.y) + smoothstep(0.035, 0.012, abs(er - 0.985))*step(uv.y, G.y)
               + 0.6*smoothstep(0.03, 0.01, abs(er - 0.70))*step(uv.y, G.y + 0.012);
    over(acc, TEA, clamp(line, 0.0, 1.0)*0.85*knock*tooth);
    float under = smoothstep(1.0, 0.15, length(vec2(dx/0.30, (uv.y - G.y)/0.026)));   // the shadow it left on the ground
    over(acc, KEY, screen(px, cell, 0.26, under*0.46)*0.9*knock);
    for(int i = 0; i < 6; i++){                                   // grit, going up with it
      float fi = float(i), gx = 0.5 + (hash(vec2(fi, 7.0)) - 0.5)*0.62/fa, gy = G.y + 0.03 + fract(t*0.021*(0.6 + hash(vec2(fi, 2.0))) + hash(vec2(fi, 5.0)))*0.20;
      float tick = smoothstep(1.4/uRes.x, 0.4/uRes.x, abs(uv.x - gx))*smoothstep(0.016, 0.010, abs(uv.y - gy));
      over(acc, KEY, tick*0.8*knock*smoothstep(0.23, 0.16, gy - G.y));
    }
  } else {
    float sh = plates(ot + vec2(0.012, 0.024*uAsp)).a * (1.0 - m.a) * go.z;   // its shadow, in the key's screen
    over(acc, KEY, screen(px, cell, 0.5, sh*0.40)*0.62);
  }
  over(acc, YEL*(0.965 + 0.07*noise(px*0.05)), Y*0.95*mix(1.0, tooth, 0.45));
  over(acc, TEA*(0.95 + 0.10*noise(px*0.05 + 9.0)), T*0.95*mix(1.0, tooth, 0.45));
  over(acc, KEY, K*(0.84 + 0.16*tooth));
  float bar = exp(-pow((uv.x - uLight.x)*fa/0.26, 2.0));          // the lamp, going over ink that is still wet
  if(uMode > 0.5){
    vec3 c = acc.rgb * (0.70 + 0.40*smoothstep(-0.1, 1.0, uv.y)) * vec3(1.03, 1.0, 0.95);
    c += vec3(1.0, 0.97, 0.88) * bar * smoothstep(0.1, 1.0, uv.y) * 0.055 * uLight.z;
    float e = min(min(uv.x, 1.0 - uv.x)*fa, min(uv.y, 1.0 - uv.y));
    c *= 0.80 + 0.20*smoothstep(0.0, 0.07, e);
    acc = vec4(clamp(c + (hash(px + fract(t)*37.0) - 0.5)*0.012, 0.0, 1.0), 1.0);
  } else {
    // laid over, never added: a premultiplied pixel brighter than its own alpha comes out green in Safari
    over(acc, vec3(1.0, 0.97, 0.90), clamp(bar * uLight.z * (0.16*K + 0.07*Y + 0.10*T), 0.0, 1.0));
  }
  gl_FragColor = vec4(min(acc.rgb, vec3(acc.a)), acc.a);
}`;

/* 6. THE FOIL — the empire's side of the paperwork: an engraving stamped in gilt into velvet.
   The pile lies this way and that and takes the lamp accordingly; the stamped line is crushed
   flat and bright, and it flashes only where the lamp finds it: as the page goes by, or where
   the pointer is. The texture's R is the line block, A the motif's silhouette. */
const FOIL = `
precision highp float;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uTime; uniform vec4 uObj; uniform float uAsp; uniform vec3 uLight; uniform vec2 uTexel;
${NOISE}
vec2 objUv(vec2 uv, float fa){ float w = uObj.z*fa; return vec2((uv.x - uObj.x)*fa/w + 0.5, (uv.y - uObj.y)*uAsp/w + 0.5); }
vec4 plates(vec2 t){ return texture2D(uTex, clamp(t, 0.0, 1.0)) * step(0.0, t.x)*step(t.x, 1.0)*step(0.0, t.y)*step(t.y, 1.0); }
void main(){
  vec2 px = gl_FragCoord.xy, uv = px/uRes; float fa = uRes.x/uRes.y, t = uTime;
  vec2 q = vec2(uv.x*fa, uv.y), L = vec2(uLight.x*fa, uLight.y);
  float ang = fbm(q*1.7 + 3.0)*9.0 + 0.6*sin(q.y*2.1);            // which way the pile was last brushed
  vec2 toL = normalize(L - q + 0.0001);
  float nap = 0.5 + 0.5*dot(vec2(cos(ang), sin(ang)), toL);
  float fine = 0.55*noise(px*vec2(1.3, 0.9)) + 0.45*noise(px*vec2(0.45, 2.6) + 4.0);
  float pool = smoothstep(1.25, 0.0, distance(q, L));
  vec3 vel = vec3(0.290, 0.184, 0.235), vio = vec3(0.357, 0.290, 0.478);
  vec3 col = vel * (0.16 + 1.05*pool*pool) * (0.42 + 0.95*nap) * (0.80 + 0.40*fine);
  col += vio * 0.16 * (1.0 - nap) * pool + vec3(1.0, 0.80, 0.56) * vel * 0.30 * pool * pool * nap;
  vec2 ot = objUv(uv, fa);
  vec4 m = plates(ot);
  float kx = plates(ot + vec2(uTexel.x, 0.0)).r - plates(ot - vec2(uTexel.x, 0.0)).r;
  float ky = plates(ot + vec2(0.0, uTexel.y)).r - plates(ot - vec2(0.0, uTexel.y)).r;
  float K = smoothstep(0.22, 0.50, m.r);
  // the die went in from above: the cloth beside each line, on the side away from the lamp, is in its shadow
  float lee = plates(ot + toL*vec2(1.0, uAsp)*uTexel.x*2.2).r;
  col *= 1.0 - 0.55*clamp(lee - m.r, 0.0, 1.0) - 0.16*m.a*(1.0 - K);
  float wr = noise(px*0.11 + 20.0) - 0.5;                          // foil is never flat
  vec3 N = normalize(vec3(-kx*1.6 + wr*0.5, -ky*1.6 + (noise(px*0.09 + 3.0) - 0.5)*0.5, 1.0));
  vec3 H = normalize(normalize(vec3(L - q, uLight.z)) + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(N, H), 0.0);
  float sweep = exp(-pow(((q.x - L.x) + (q.y - L.y)*0.35)/0.30, 2.0));
  vec3 gilt = mix(vec3(0.30, 0.225, 0.085), vec3(0.79, 0.635, 0.295), 0.25 + 0.75*pool);
  vec3 foil = gilt*(0.50 + 0.75*sweep) + vec3(1.0, 0.94, 0.74)*(pow(nh, 22.0)*0.75 + pow(nh, 90.0)*0.6)*(0.25 + 0.75*sweep);
  col = mix(col, foil, K*(0.90 + 0.10*fine));
  float e = min(uv.y, 1.0 - uv.y);
  col *= 0.55 + 0.45*smoothstep(0.0, 0.14, e);
  col += (hash(px + fract(t)*61.0) - 0.5)*0.012;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

// The pointer, as fractions of the window. Shared by every stage.
const env = { x: 0.62, y: 0.3, at: 0 };
addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; env.x = e.clientX/innerWidth; env.y = e.clientY/innerHeight; env.at = performance.now(); }, { passive: true });

function stage(host, frag, o) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fx' + (o.snap ? ' snap' : ''); canvas.setAttribute('aria-hidden', 'true');
  if (o.first) host.insertBefore(canvas, host.firstChild); else host.appendChild(canvas);
  const fail = () => { canvas.remove(); return null; };
  let gl = null;
  try { gl = canvas.getContext('webgl', { alpha: !!o.alpha, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }); } catch (e) {}
  if (!gl) return fail();
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('lot: a shader failed; the static composition holds', e); return fail(); }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aP'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = {}; (o.uniforms || []).concat(['uRes', 'uTime']).forEach(n => { u[n] = gl.getUniformLocation(prog, n); });
  if (o.setup && o.setup(gl, u) === false) return fail();
  const st = { visible: false, dead: false, raf: 0, painted: false, t0: performance.now() };
  const size = () => {
    const d = Math.min(o.maxDpr || 1.5, window.devicePixelRatio || 1);
    let w = canvas.clientWidth*d, h = canvas.clientHeight*d;
    const max = o.maxPx || 2.2e6; if (w*h > max) { const k = Math.sqrt(max/(w*h)); w *= k; h *= k; }
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  const draw = (t) => {
    size();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    if (u.uTime) gl.uniform1f(u.uTime, t);
    o.frame(gl, u, t, canvas);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!st.painted) { st.painted = true; canvas.classList.add('on'); if (o.shown) o.shown(); }
  };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); st.dead = true; cancelAnimationFrame(st.raf); canvas.classList.remove('on'); if (o.lost) o.lost(); });
  if (o.reduced) {                                    // one settled frame, redrawn only if the window changes
    draw(14);
    let rt = 0; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!st.dead) draw(14); }, 200); });
    return st;
  }
  const loop = (now) => {
    st.raf = 0;
    if (st.dead || !st.visible || document.hidden) return;
    draw(14 + (now - st.t0)/1000);
    st.raf = requestAnimationFrame(loop);
  };
  const wake = () => { if (!st.raf && !st.dead && st.visible && !document.hidden) st.raf = requestAnimationFrame(loop); };
  new IntersectionObserver(es => { st.visible = es[0].isIntersecting; wake(); }, { rootMargin: '60px' }).observe(canvas);
  document.addEventListener('visibilitychange', wake);
  return st;
}

function forecourt(host, cfg) {
  const m = { hor: 0.24, lamps: new Float32Array(18), board: [0.6, 0.9, 0, 0], beam: [0.66, 0.5], string: [-0.1, 0.2, 0.36, 0.02] };
  const measure = () => {
    const r = host.getBoundingClientRect(); if (!r.height) return;
    const g = q('.hero-ground', host); if (g) m.hor = g.getBoundingClientRect().height / r.height;
    m.lamps.fill(0);
    qa('[data-lamp]', host).map(c => { const b = c.getBoundingClientRect(); return [(b.left + b.width/2 - r.left)/r.width, 1 - (b.top + b.height/2 - r.top)/r.height]; })
      .filter(l => l[0] > -0.15 && l[0] < 1.15).slice(0, 6).forEach((l, i) => { m.lamps[i*3] = l[0]; m.lamps[i*3 + 1] = l[1]; m.lamps[i*3 + 2] = 1; });
    const b = q('.board-face', host);
    if (b) { const br = b.getBoundingClientRect(); m.board = [(br.left - r.left)/r.width, (br.right - r.left)/r.width, 0, b.querySelector('img') ? 1 : 0.5]; }
    const sv = q('.hero-horizon svg', host);
    if (sv) {                                         // the horizon drawing is 1800 x 170, sliced to fit, pinned to the ground
      const b2 = sv.getBoundingClientRect(), k = Math.max(b2.width/1800, b2.height/170);
      const left = b2.left + (b2.width - 1800*k)/2, topPx = b2.bottom - 170*k;
      m.string = [(left - 150*k - r.left)/r.width, 300*k/r.width, 1 - (topPx + 31.5*k - r.top)/r.height, 30*k/r.height];
    }
    m.wide = r.width > 820;
  };
  measure();
  let rt = 0; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(measure, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  return stage(host, FORECOURT, {
    first: true, reduced: cfg.reduced, uniforms: ['uHor', 'uLamp', 'uBoard', 'uBeam', 'uString'],
    frame(gl, u, t) {
      // The beam drifts over the lot on its own. Give it a pointer and it comes round to it, slowly.
      // On a wide lot it keeps to the open ground beside the signage, and passes behind the board.
      const lo = m.wide ? 0.44 : 0.14, hi = m.wide ? 0.94 : 0.86;
      const drift = (lo + hi)/2 + (hi - lo)*0.42*Math.sin(t*0.11);
      const hunting = !cfg.reduced && performance.now() - env.at < 6000;
      const want = hunting ? clamp(env.x, lo, hi) : drift;
      m.beam[0] += (want - m.beam[0]) * (cfg.reduced ? 1 : 0.018);
      m.beam[1] = 0.46 + 0.16*Math.sin(t*0.07);
      gl.uniform1f(u.uHor, m.hor);
      gl.uniform3fv(u.uLamp, m.lamps);
      gl.uniform4f(u.uBoard, m.board[0], m.board[1], m.board[2], m.board[3]);
      gl.uniform3f(u.uBeam, m.beam[0], m.beam[1], m.wide ? 0.50 : 0.34);
      gl.uniform4f(u.uString, m.string[0], m.string[1], m.string[2], m.string[3]);
    },
  });
}

function room(host, cfg) {
  const scope = host.closest('section') || host.parentNode;
  const target = q('[data-ap-sheet], .exhibit-cover', scope);
  const spot = [0.7, 0.5];
  return stage(host, ROOM, {
    reduced: cfg.reduced, uniforms: ['uAp', 'uSpot', 'uGain'],
    frame(gl, u, t, canvas) {
      const r = canvas.getBoundingClientRect();
      if (target && r.width) { const s = target.getBoundingClientRect(); spot[0] = (s.left + s.width/2 - r.left)/r.width; spot[1] = 1 - (s.top + s.height/2 - r.top)/r.height; }
      const ap = host.hasAttribute('data-fx-ap') ? cfg.ap() : 0;
      gl.uniform1f(u.uAp, ap);
      gl.uniform2f(u.uSpot, spot[0], spot[1]);
      gl.uniform1f(u.uGain, host.hasAttribute('data-fx-ap') ? 0.92 + 0.75*ap : 1.05);
    },
  });
}

function plate(host, cfg) {
  const img = q('img', host); if (!img) return null;
  const masked = host.hasAttribute('data-fx-mask');
  const go = () => stage(host, PLATE, {
    alpha: true, snap: true, reduced: cfg.reduced, maxDpr: 2.5, uniforms: ['uTex', 'uTexel', 'uLight', 'uMask', 'uGain'],
    setup(gl, u) {
      try {
        const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.uniform1i(u.uTex, 0);
        gl.uniform2f(u.uTexel, 1.4/img.naturalWidth, 1.4/img.naturalHeight);
      } catch (e) { console.warn('lot: the picture stays a picture', e); return false; }
    },
    frame(gl, u, t, canvas) {
      // The lamp is fixed over the window, so its reflection crosses the plate as the plate goes by.
      const r = canvas.getBoundingClientRect();
      const cy = (r.top + r.height/2) / innerHeight;
      const lx = 0.5 + (env.x - 0.5)*0.9 + 0.10*Math.sin(t*0.23);
      const ly = cfg.reduced ? 0.78 : clamp(-0.12 + 1.6*cy, -0.4, 1.4) + 0.04*Math.sin(t*0.31);
      gl.uniform3f(u.uLight, lx, ly, 0.42);
      gl.uniform1f(u.uMask, masked ? 1 : 0);
      gl.uniform1f(u.uGain, 1);
    },
    shown() { host.classList.add('lit'); },
    lost() { host.classList.remove('lit'); },
  });
  if (img.complete && img.naturalWidth) return go();
  img.addEventListener('load', go, { once: true });
  return null;
}

function brass(host, cfg) {
  return stage(host, BRASS, {
    first: true, reduced: cfg.reduced, maxDpr: 2, uniforms: ['uShift'],
    frame(gl, u, t, canvas) {
      const r = canvas.getBoundingClientRect();
      gl.uniform1f(u.uShift, cfg.reduced ? 0.2 : (r.top / innerHeight)*0.55 + (env.x - 0.5)*0.35 + 0.02*Math.sin(t*0.2));
    },
  });
}

// A printing plate set (assets/scenes/<id>.webp), as a texture. The picture in the markup is the same
// job printed flat; it names its plates in data-plates, and it is what stands if this never loads.
function plateTexture(gl, im) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}
function withPlates(host, then) {
  const img = q('img[data-plates]', host); if (!img) return null;
  const im = new Image(); im.decoding = 'async';
  im.onload = () => { try { then(img, im); } catch (e) { console.warn('lot: the flat print holds', e); } };
  im.src = img.dataset.plates;
  return null;
}
// Where the flat print sits in its frame (its layout box, before any tilt), as the shader wants it.
function placed(img, canvas) {
  const W = canvas.clientWidth || 1, Hh = canvas.clientHeight || 1;
  let x = img.offsetLeft, y = img.offsetTop, el = img.offsetParent;
  while (el && el !== canvas.parentNode) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
  x -= canvas.offsetLeft; y -= canvas.offsetTop;      // a canvas may overhang its frame, to give a shadow room
  return [(x + img.offsetWidth/2)/W, 1 - (y + img.offsetHeight/2)/Hh, img.offsetWidth/W];
}

function printed(host, cfg, poster) {
  return withPlates(host, (img, im) => {
    const tilt = (parseFloat(img.dataset.tilt) || 0) * Math.PI/180;
    let seen = cfg.reduced || poster ? -1e9 : 0;
    stage(host, PRINT, {
      alpha: true, snap: true, reduced: cfg.reduced, maxDpr: 2.5, uniforms: ['uTex', 'uMode', 'uObj', 'uAsp', 'uPass', 'uLight'],
      setup(gl, u) { plateTexture(gl, im); gl.uniform1i(u.uTex, 0); gl.uniform1f(u.uAsp, im.naturalWidth/im.naturalHeight); gl.uniform1f(u.uMode, poster ? 1 : 0); },
      frame(gl, u, t, canvas) {
        const p = placed(img, canvas), r = canvas.getBoundingClientRect();
        // on the poster the car is still going up: a little, and it never arrives
        const bob = poster && !cfg.reduced ? 0.012*Math.sin(t*0.42) + 0.004*Math.sin(t*1.07) : 0;
        const lean = poster && !cfg.reduced ? 0.012*Math.sin(t*0.31 + 1.0) : 0;
        gl.uniform4f(u.uObj, p[0], p[1] + bob, p[2], tilt + lean);
        // three passes, once, when it is first properly in view: yellow, teal, then the key
        if (!seen && r.top < innerHeight*0.72 && r.bottom > innerHeight*0.2) seen = performance.now();
        const s = seen ? (performance.now() - seen)/1000 : 0;
        gl.uniform3f(u.uPass, clamp(s/0.8, 0, 1), clamp((s - 0.45)/0.8, 0, 1), clamp((s - 0.9)/0.9, 0, 1));
        const cy = (r.top + r.height/2)/innerHeight;
        gl.uniform3f(u.uLight, cfg.reduced ? 0.7 : clamp(1.25 - 1.5*cy, -0.4, 1.4) + (env.x - 0.5)*0.5, 0.8, 1);
      },
      shown() { host.classList.add('lit'); },
      lost() { host.classList.remove('lit'); },
    });
  });
}
const poster = (host, cfg) => printed(host, cfg, true);
const print = (host, cfg) => printed(host, cfg, false);

function foil(host, cfg) {
  const lamp = [0.3, 0.6];
  return withPlates(host, (img, im) => {
    stage(host, FOIL, {
      first: true, reduced: cfg.reduced, maxDpr: 2, maxPx: 2.6e6, uniforms: ['uTex', 'uObj', 'uAsp', 'uLight', 'uTexel'],
      setup(gl, u) { plateTexture(gl, im); gl.uniform1i(u.uTex, 0); gl.uniform1f(u.uAsp, im.naturalWidth/im.naturalHeight); gl.uniform2f(u.uTexel, 1.3/im.naturalWidth, 1.3/im.naturalHeight); },
      frame(gl, u, t, canvas) {
        const p = placed(img, canvas), r = canvas.getBoundingClientRect();
        gl.uniform4f(u.uObj, p[0], p[1], p[2], 0);
        // The lamp is over the window: it crosses the stamping as the page goes by. A pointer brings it over.
        const cy = (r.top + r.height/2)/innerHeight;
        const hunting = !cfg.reduced && performance.now() - env.at < 5000 && r.height;
        const wx = hunting ? (env.x*innerWidth - r.left)/r.width : p[0] + clamp(0.5 - cy, -0.7, 0.7)*p[2]*1.1 + 0.04*Math.sin(t*0.23);
        const wy = hunting ? 1 - (env.y*innerHeight - r.top)/r.height : p[1] + 0.12 + 0.03*Math.sin(t*0.17);
        const k = cfg.reduced ? 1 : 0.07;
        lamp[0] += (wx - lamp[0])*k; lamp[1] += (wy - lamp[1])*k;
        gl.uniform3f(u.uLight, cfg.reduced ? p[0] : lamp[0], cfg.reduced ? p[1] + 0.1 : lamp[1], 0.32);
      },
      shown() { host.classList.add('lit'); },
      lost() { host.classList.remove('lit'); },
    });
  });
}

const KINDS = { forecourt, room, plate, brass, poster, print, foil };

// Each stage is built when it comes within a screen of the window, not before.
export function light(cfg) {
  cfg = cfg || {}; cfg.ap = cfg.ap || (() => 0);
  const hosts = qa('[data-fx]');
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const make = KINDS[e.target.dataset.fx];
    if (make) try { make(e.target, cfg); } catch (err) { console.warn('lot: a stage would not build; the static composition holds', err); }
  }), { rootMargin: '100% 0px 100% 0px' });
  hosts.forEach(h => io.observe(h));
}
