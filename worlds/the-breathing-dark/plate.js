// plate.js — the scenes of The Breathing Dark below the hero, and the door.
// Hand-written WebGL1, no libraries. Every scene on a page shares ONE context, made
// once and kept: each is drawn into the shared buffer and copied to its own small 2D
// canvas, so a page never holds more than two GL contexts (this one and the hero sky).
// The sky scenes are drawn with the hero's own shader (sky.js) and the same deep field.
//
// Scenes (the value of data-plate on the element):
//   vanish   the deep field round the door. Its stars go out while you look, along
//            the vein front, and the gas goes dark after them. They do not come back.
//   exhale   the same sky pressed inward round the door and shifted blue: distances
//            that took light-years to open begin to close. It follows the scroll and
//            breathes on the Murmur.
//   scale    The Outside. The sky as a survey negative on bone paper: ink stars, and
//            a ruled frame round everything catalogued. The view pulls back and does
//            not stop; the frame becomes a stamp, then a speck, then one warm point.
//   door     the deep field lensed round the door's true-black disc at the foot of a page.
//   ref / tonight   the comparator: two plates of one patch of sky. The reference
//            stays whole; tonight's loses its stars as you scroll.
// Each element keeps a designed still in the markup underneath, in place from the first
// paint; with no WebGL it simply stays, and reduced motion gets one settled frame.
import { VERT, FRAG, NB, NL, FADE, buildProgram, setupField, loadDeep, deepUrl, buildField } from './sky.js';

const COMMON = `precision highp float;
uniform vec2 uRes;uniform float uMur,uProg;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
`;
// the comparator's plates: a plain procedural field, with the observer's grease-pencil rings
const STARS = COMMON + `uniform vec2 uC;uniform float uPx,uSeed,uDpr,uMark;uniform vec3 uBg;
vec3 layer(vec2 q,float n,float d0,float seed,float rpx,float bmul,float spike){
  vec2 g=q*n,id=floor(g),f=fract(g),k=id+seed+uSeed;
  if(h21(k)>d0)return vec3(0.);
  vec2 sp=mix(vec2(.1),vec2(.24),spike)+mix(.8,.52,spike)*vec2(h21(k+13.7),h21(k+27.2));
  vec2 v=(sp-f)/n*uPx,o=abs(v);
  float d=length(o);
  float m=pow(h21(k+5.9),5.),r=rpx*uDpr*(.8+.9*m);
  float wgt=step(h21(k+3.3),.12),order=h21(k+71.3);
  float alive=mix(1.-smoothstep(order-.035,order+.035,uProg*1.07),1.,wgt);
  vec3 col=mix(vec3(1.),mix(vec3(1.,.74,.5),vec3(.66,.8,1.),h21(k+91.1)),.55);
  col=mix(col,vec3(1.,.84,.64),wgt*.7);
  float core=exp(-d*d/(r*r));
  vec3 mark=vec3(0.);
  if(spike>.5){
    float big=smoothstep(.22,.6,m),len=min(uDpr*(4.+13.*m),.2*uPx/n),th=uDpr*.5;
    core+=big*.42*(exp(-o.x/len-o.y*o.y/(th*th))+exp(-o.y/len-o.x*o.x/(th*th)));
    if(uMark>.5){
      float R=uDpr*(7.+5.*h21(k+2.7)),gone=(1.-alive)*(1.-wgt);
      float arc=step(.13,fract(atan(v.y,v.x)/6.2832+h21(k+5.1)));
      mark=vec3(.851,.627,.357)*exp(-pow((d-R)/(.75*uDpr),2.))*arc*gone*.85;
    }
  }
  return col*core*bmul*(.34+.66*m)*alive*mix(1.+uMur*.04,1.,wgt)+mark;
}
void main(){
  vec2 q=(gl_FragCoord.xy-uC)/uPx;
  vec3 L=layer(q,58.,.22,3.1,.62,.8,0.)+layer(q,30.,.34,9.7,.8,1.1,0.)+layer(q,13.,.36,21.3,1.,1.6,0.)+layer(q,5.5,.3,47.9,1.25,2.2,1.);
  float haze=.5*vn(q*3.1+4.)+.5*vn(q*7.3+1.7);
  vec3 col=uBg+vec3(.09,.12,.17)*smoothstep(.42,.9,haze)*.5+L;
  vec2 v=gl_FragCoord.xy/uRes-.5;
  col*=1.-.55*dot(v,v);
  gl_FragColor=vec4(col,1.);
}`;
// The Outside: a survey negative on bone paper, pulling back without end
const NEG = COMMON + `uniform vec2 uC;uniform float uPx,uDpr,uT,uDeepOn,uWarm;uniform sampler2D tDeep;
float ink(vec2 p,float i,float t){
  float e=i-t;                       // how large this octave's cells stand in the frame (log2)
  vec2 g=p*exp2(-e)*1.7,id=floor(g),f=fract(g),k=id+mod(i,41.)*17.3;
  if(h21(k)>.8)return 0.;
  vec2 sp=.14+.72*vec2(h21(k+13.7),h21(k+27.2));
  float m=pow(h21(k+5.9),3.);
  float d=length(sp-f)*exp2(e)/1.7*uPx;  // px
  float rad=uDpr*(.5+3.4*m)*exp2(e*.62+1.15);
  float vis=smoothstep(-6.2,-4.6,e)*smoothstep(1.6,.2,e);
  float core=smoothstep(rad+.8,rad-.8,d);
  return (core*.92+.22*exp(-d/(rad*2.2+.5)))*vis*(.45+.55*m);
}
void main(){
  vec2 fc=gl_FragCoord.xy,p=(fc-uC)/uPx;
  float z=exp2(uT);
  // paper: bone stock, a little uneven, darker toward the corners
  vec2 v=fc/uRes-.5;
  vec3 paper=vec3(.910,.886,.839)*(1.-.07*vn(fc/uDpr*.012+3.)-.035*vn(fc/uDpr*.07)-.12*dot(v,v));
  float a=0.;
  float i0=floor(uT);
  for(int j=-6;j<=1;j++)a=max(a,ink(p,i0+float(j),uT));
  // everything catalogued, in its ruled frame: at the start it is the whole plate; then a stamp; then a speck
  float h0=.43/z;
  vec2 ab=abs(p);
  float inside=step(ab.x,h0)*step(ab.y,h0);
  float neb=0.;
  if(uDeepOn>.5&&h0>.004){
    vec2 uv=p/(2.*h0)+.5;uv.y=1.-uv.y;uv=vec2(.5+(uv.x-.5)*.5625,uv.y);
    vec3 dp=texture2D(tDeep,uv).rgb;
    neb=smoothstep(.02,.6,dot(dp,vec3(.3,.45,.25)))*.42*inside*smoothstep(.004,.03,h0);
  }
  for(int j=0;j<4;j++){
    float h=h0*pow(10.,float(j));
    if(h<.0025||h>1.2)continue;
    float dr=abs(max(ab.x,ab.y)-h)*uPx;
    float corner=smoothstep(.72,.9,min(ab.x,ab.y)/h);
    float line=smoothstep(1.1*uDpr,.2*uDpr,dr)*(.3+.7*corner)*smoothstep(.0025,.02,h)*smoothstep(1.2,.7,h);
    a=max(a,line*(j==0?.85:.5));
  }
  vec3 col=mix(paper,vec3(.078,.071,.063),clamp(a,0.,1.));
  col=mix(col,col*vec3(.50,.47,.44),neb);
  // when the frame is too small to rule, what is left of it is one warm point
  float wd=length(fc-uC)/uDpr;
  col=mix(col,vec3(.886,.651,.239),uWarm*(smoothstep(3.6,2.4,wd)+.3*exp(-wd/9.))*(.85+.15*uMur));
  gl_FragColor=vec4(col,1.);
}`;

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const sstep = (t) => t * t * (3 - 2 * t);
// sky scenes. door: radius as a fraction of the shorter side; at: where it sits; deep: [scale, x, y] of the plate
const SCENES = {
  vanish: { door: 0.13, at: [0.6, 0.48], tall: [0.5, 0.36], deep: [1.3, -0.06, 0.02], seed: 3.7, field: true, flip: false },
  exhale: { door: 0.115, at: [0.8, 0.5], tall: [0.5, 0.34], deep: [1.25, -0.1, 0.05], seed: 8.1, blue: true, flip: true },
  door: { door: 0, at: [0.5, 0.3], tall: [0.5, 0.3], deep: [1.2, 0, 0.1], seed: 5.3, flip: true, dom: true }
};

export function mountPlates(els, opts) {
  opts = opts || {};
  const murmur = opts.murmur || (() => 0), still = !!opts.reduced;
  const glc = document.createElement('canvas');
  let gl = null;
  try { gl = glc.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false }); } catch (e) { gl = null; }
  if (!gl) return Promise.resolve(null);
  const kinds = {}; els.forEach((el) => { kinds[el.getAttribute('data-plate')] = 1; });
  const needSky = Object.keys(kinds).some((k) => SCENES[k]), needNeg = !!kinds.scale, needStars = !!(kinds.ref || kinds.tonight);
  const withU = (p, names) => { const u = {}; names.forEach((n) => { u[n] = gl.getUniformLocation(p, n); }); return { p, u }; };
  return Promise.all([
    needSky ? buildProgram(gl, VERT, FRAG) : null,
    needNeg ? buildProgram(gl, VERT, NEG) : null,
    needStars ? buildProgram(gl, VERT, STARS) : null,
    needSky || needNeg ? loadDeep(opts.deep || deepUrl()) : null
  ]).then(([pSky, pNeg, pStars, deepImg]) => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const F = pSky ? setupField(gl, pSky) : null;
    if (F) F.setDeep(deepImg);
    const neg = pNeg ? withU(pNeg, ['uRes', 'uMur', 'uC', 'uPx', 'uDpr', 'uT', 'uDeepOn', 'uWarm', 'tDeep']) : null;
    const stars = pStars ? withU(pStars, ['uRes', 'uMur', 'uProg', 'uC', 'uPx', 'uSeed', 'uDpr', 'uBg', 'uMark']) : null;
    let negDeep = false;
    if (neg && deepImg && !F) { // a page with The Outside's scene but no sky scene still needs the plate
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, deepImg); negDeep = true; } catch (e) { negDeep = false; }
    } else if (neg && F) negDeep = F.deep();
    const zero = new Float32Array(NB * 4);

    let dead = false, raf = 0, tick = 0, lastT = 0;
    const plates = [];
    els.forEach((el) => {
      const mode = el.getAttribute('data-plate'), cv = document.createElement('canvas'), ctx = cv.getContext('2d');
      if (!ctx) return;
      const P = { el, mode, cv, ctx, w: 0, h: 0, dpr: 1, vis: false, held: 0, drawn: false, bg: [5 / 255, 7 / 255, 8 / 255], t: 0, seen: 0,
        fade: null, lut: null, front: 0, tField: null, tVein: null, fw: 0, out: el.querySelector('[data-scale-out]') };
      cv.setAttribute('aria-hidden', 'true');
      el.appendChild(cv);
      const scrim = getComputedStyle(el).getPropertyValue('--scrim').split(',').map((v) => parseFloat(v) / 255);
      if (scrim.length === 3 && scrim.every((v) => v >= 0)) P.bg = scrim;
      if (SCENES[mode] && SCENES[mode].field) { P.fade = new Float32Array(NL); P.lut = new Uint8Array(NL).fill(255); }
      const da = (el.getAttribute('data-at') || '').split(',').map(Number); if (da.length === 2 && da.every((v) => v >= 0 && v <= 1)) P.at = da;
      plates.push(P);
    });
    if (!plates.length) return null;

    const size = (P) => {
      const w = P.el.clientWidth, h = P.el.clientHeight;
      if (!w || !h) return;
      P.dpr = clamp(Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(1.25e6 / (w * h))), 0.6, 2);
      P.w = Math.round(w * P.dpr); P.h = Math.round(h * P.dpr); P.cw = w; P.ch = h;
      if (P.cv.width !== P.w || P.cv.height !== P.h) { P.cv.width = P.w; P.cv.height = P.h; }
      if (glc.width < P.w || glc.height < P.h) { glc.width = Math.max(glc.width, P.w); glc.height = Math.max(glc.height, P.h); }
      const S = SCENES[P.mode];
      if (S && S.field && F) {
        // the order the stars of this plate die in: the same vein front as the hero's, grown from this plate's door
        const at = w / h < 0.85 ? S.tall : S.at, gw = Math.max(24, Math.round(Math.sqrt(9000 * w / h))), gh = Math.max(24, Math.round(9000 / gw));
        const fld = buildField(gw, gh, at[0], at[1], 31);
        const o8 = new Uint8Array(gw * gh); for (let i = 0; i < o8.length; i++) o8[i] = Math.round(fld.order[i] * 255);
        if (!P.tField) P.tField = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, P.tField);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gw, gh, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, o8);
      }
      P.drawn = false;
    };
    // how far the element has travelled up the window: 0 as it enters, 1 as it leaves
    const travel = (P) => { const r = P.el.getBoundingClientRect(); return clamp((innerHeight - r.top) / (innerHeight + r.height), 0, 1); };

    function drawSky(P, t, m, dt) {
      const S = SCENES[P.mode], U = F.U, tall = P.cw / P.ch < 0.85;
      let at = tall ? S.tall : S.at, rad = S.door * Math.min(P.cw, P.ch), cx = at[0] * P.cw, cy = at[1] * P.ch;
      if (S.dom) {
        const disc = P.el.parentNode.querySelector('[data-door-disc] i') || P.el.parentNode.querySelector('[data-door-disc]');
        if (!disc) return false;
        const er = P.el.getBoundingClientRect(), dr = disc.getBoundingClientRect();
        cx = dr.left + dr.width / 2 - er.left; cy = dr.top + dr.height / 2 - er.top; rad = dr.width / 2;
      }
      let blue = 0, press = 0, zoom = 1, gain = 1, use = 0, deepGain = 1;
      if (S.field) {
        // one-way, and it does not wait for the scroll: while the plate is in view its stars keep going out
        const want = Math.max(sstep(clamp((t - 0.12) / 0.6, 0, 1)) * 0.9, still ? 0.55 : 0);
        P.held = Math.max(P.held, want, still ? 0 : Math.min(0.9, P.held + dt * 0.022));
        const tgt = P.held * 0.965;
        if (still) { P.front = tgt; for (let i = 0; i < NL; i++) if (i / NL < tgt) { P.fade[i] = 1; P.lut[i] = 0; } }
        else {
          if (P.front < tgt) P.front = Math.min(tgt, P.front + Math.max(0.2, (tgt - P.front)) * dt);
          for (let i = 0; i < NL; i++) if (P.fade[i] < 1 && i / NL < P.front) { P.fade[i] = Math.min(1, P.fade[i] + dt / FADE); P.lut[i] = Math.round(255 * (1 - sstep(P.fade[i]))); }
        }
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, F.T.alive); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, NL, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, P.lut);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, P.tField);
        use = 1; zoom = 1 - 0.1 * sstep(clamp(t / 0.8, 0, 1));
      }
      if (S.blue) {
        // slowed, stopped, and then the sky reverses: it presses in as the band comes up the window, and a little more on each breath
        const h = still ? 0.7 : sstep(clamp((t - 0.16) / 0.5, 0, 1));
        blue = 0.2 + 0.7 * h; press = 0.3 * h + 0.035 * h * m; zoom = 1 + 0.2 * h; gain = 1 + 0.4 * h; deepGain = 0.95 + 0.25 * h;
      }
      if (S.dom) { deepGain = 0.8; gain = 1.05; }
      gl.useProgram(pSky);
      gl.uniform2f(U.uRes, P.w, P.h);
      gl.uniform2f(U.uPar, 0, (t - 0.5) * 46 * P.dpr);
      gl.uniform2f(U.uRest, (cx - P.cw / 2) * P.dpr, -(cy - P.ch / 2) * P.dpr);
      gl.uniform4f(U.uDoor, cx * P.dpr, P.h - cy * P.dpr, rad * P.dpr, rad * 1.6 * P.dpr);
      gl.uniform2f(U.uRing, cx * P.dpr, P.h - cy * P.dpr);
      gl.uniform1f(U.uRingR, rad * 1.9 * P.dpr);
      gl.uniform1f(U.uPress, press);
      gl.uniform1f(U.uPx, Math.sqrt(P.w * P.h));
      gl.uniform1f(U.uDpr, P.dpr);
      gl.uniform1f(U.uZoom, zoom * (1 - 0.004 * m));
      gl.uniform1f(U.uMur, m);
      gl.uniform1f(U.uGain, gain);
      gl.uniform1f(U.uNeg, 0);
      gl.uniform1f(U.uBlue, blue);
      gl.uniform2f(U.uThin, 0, 0);
      gl.uniform1f(U.uUse, use);
      gl.uniform1f(U.uVein, 0);
      gl.uniform1f(U.uEnd, 0);
      gl.uniform1f(U.uDeepOn, F.deep() ? 1 : 0);
      gl.uniform1f(U.uTall, tall ? 1 : 0);
      gl.uniform1f(U.uSeed, S.seed);
      gl.uniform1f(U.uGlow, 0.07);
      gl.uniform1f(U.uFront, S.field ? P.front / 0.965 : 0);
      gl.uniform3f(U.uDeep, deepGain, S.deep[0], S.flip ? 1 : 0);
      gl.uniform2f(U.uDeepOff, S.deep[1], S.deep[2]);
      gl.uniform3f(U.uBg, P.bg[0], P.bg[1], P.bg[2]);
      gl.uniform4fv(U.uB, zero); gl.uniform4fv(U.uC, zero);
      return true;
    }
    const fmt = (n) => { const d = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1)); return String(Math.round(n / d) * d).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
    function drawNeg(P, t, m, dt) {
      // the view pulls back with the scroll, and goes on pulling back, slowly, for as long as you look
      if (!still) P.t += dt * 0.16;
      const T = still ? 7.2 : P.t + 12 * sstep(clamp((t - 0.1) / 0.75, 0, 1));
      const at = P.at || (matchMedia('(max-width:820px)').matches ? [0.64, 0.34] : [0.78, 0.47]);
      gl.useProgram(neg.p);
      gl.activeTexture(gl.TEXTURE3);
      gl.uniform1i(neg.u.tDeep, 3);
      gl.uniform2f(neg.u.uRes, P.w, P.h);
      gl.uniform2f(neg.u.uC, at[0] * P.w, (1 - at[1]) * P.h);
      gl.uniform1f(neg.u.uPx, Math.min(P.w, P.h));
      gl.uniform1f(neg.u.uDpr, P.dpr);
      gl.uniform1f(neg.u.uT, T);
      gl.uniform1f(neg.u.uMur, m);
      gl.uniform1f(neg.u.uDeepOn, negDeep ? 1 : 0);
      gl.uniform1f(neg.u.uWarm, sstep(clamp((T - 5.2) / 1.6, 0, 1)));
      if (P.out) { const s = '×' + fmt(Math.pow(2, T)); if (s !== P.outS) { P.outS = s; P.out.textContent = s; } }
      return true;
    }
    function drawStars(P, t, m) {
      const gone = P.mode === 'tonight' ? (still ? 0.62 : sstep(clamp((t - 0.2) / 0.5, 0, 1)) * 0.62) : 0;
      P.held = Math.max(P.held, gone);
      gl.useProgram(stars.p);
      gl.uniform2f(stars.u.uRes, P.w, P.h);
      gl.uniform2f(stars.u.uC, P.w / 2, P.h / 2);
      gl.uniform1f(stars.u.uPx, Math.max(P.w, P.h) * 1.15);
      gl.uniform1f(stars.u.uMark, P.mode === 'tonight' ? 1 : 0);
      gl.uniform1f(stars.u.uSeed, 31.7);
      gl.uniform1f(stars.u.uDpr, P.dpr);
      gl.uniform3f(stars.u.uBg, P.bg[0], P.bg[1], P.bg[2]);
      gl.uniform1f(stars.u.uMur, m);
      gl.uniform1f(stars.u.uProg, P.held);
      return true;
    }
    function draw(P, now) {
      if (!P.w) size(P);
      if (!P.w) return;
      const t = travel(P), m = still ? 0 : murmur();
      const dt = P.seen ? Math.min(0.1, (now - P.seen) / 1000) : 0; P.seen = now;
      gl.viewport(0, 0, P.w, P.h);
      let ok = false;
      if (SCENES[P.mode]) ok = F ? drawSky(P, still ? 0.6 : t, m, dt) : false;
      else if (P.mode === 'scale') ok = neg ? drawNeg(P, t, m, dt) : false;
      else ok = stars ? drawStars(P, t, m) : false;
      if (!ok) return;
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      P.ctx.drawImage(glc, 0, glc.height - P.h, P.w, P.h, 0, 0, P.w, P.h);
      if (!P.drawn) { P.drawn = true; P.cv.classList.add('is-on'); P.el.classList.add('is-live'); const d = P.el.parentNode.querySelector('[data-door-disc]'); if (P.mode === 'door' && d) d.classList.add('is-live'); }
    }

    function frame(now) {
      raf = 0;
      if (dead || document.hidden) return;
      let any = false;
      // the scenes breathe and follow the scroll; thirty frames a second is plenty
      const go = ++tick % 2 === 0;
      for (const P of plates) { if (P.vis) { any = true; if (go || !P.drawn) draw(P, now); } else P.seen = 0; }
      if (any) raf = requestAnimationFrame(frame);
    }
    const wake = () => { if (dead) return; if (still) { plates.forEach((P) => { if (P.vis && !P.drawn) draw(P, performance.now()); }); return; } if (!raf && !document.hidden) raf = requestAnimationFrame(frame); };

    // drawn a screen ahead, so a scene is already alive when it comes into view
    const io = new IntersectionObserver((es) => { es.forEach((e) => { const P = plates.find((x) => x.el === e.target); if (P) P.vis = e.isIntersecting; }); wake(); }, { rootMargin: '60% 0px 60% 0px' });
    let rt = 0;
    const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { plates.forEach(size); wake(); }, 150); });
    plates.forEach((P) => { io.observe(P.el); ro.observe(P.el); });
    document.addEventListener('visibilitychange', wake);
    glc.addEventListener('webglcontextlost', (e) => { e.preventDefault(); dead = true; if (raf) cancelAnimationFrame(raf); plates.forEach((P) => { P.cv.classList.remove('is-on'); P.el.classList.remove('is-live'); const d = P.el.parentNode.querySelector('[data-door-disc]'); if (d) d.classList.remove('is-live'); }); });
    return { plates };
  }).catch((e) => { console.warn('plates: the stills hold —', e.message); return null; });
}
