// light.js — the light in the flat. Hand-written WebGL, no libraries, loaded by latch.js after first paint.
// One law: there is one flat, and one seam through it. Left of the seam the day side holds the room and it is
// amber; right of the seam the night side holds it and it is blue. Every room on the site is one base plate in
// the day's warm light (design/plates.py). This module regrades each one for the night side of the seam from the
// same blue ramp the page's #nt-night filter uses, pixel for pixel, and adds what only moves: dust in the day's
// window light, the sodium street lamp that strikes room by room once the night side holds (moths crossing its pane), steam off the day
// side's mug, a passing car's headlights, film grain, a little depth as the page scrolls, and the seam itself when the Latch sends it across.
// ONE WebGL context serves every room: each room has a plain 2D canvas, and the frame drawn for it is copied
// across (Safari refuses pages that hold many contexts). Each room keeps the two pictures it was given: if WebGL
// is missing, lost, or never loads, they stand. prefers-reduced-motion gets a settled frame and no loop.

const VERT = 'attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}';

const FRAG = `precision highp float;
uniform sampler2D uTex,uLut;
uniform vec2 uRes,uImg,uPos;
uniform float uSeam,uNight,uTime,uDrain,uBand,uKind,uCar,uZoom,uPar,uHush;
uniform vec3 uPull,uSteam;
uniform vec4 uSunA,uLamp;uniform vec3 uSunB;uniform vec2 uCarY;
varying vec2 v;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec2 fit(vec2 uv){float ra=uRes.x/uRes.y,ia=uImg.x/uImg.y;vec2 f=ra>ia?vec2(1.,ia/ra):vec2(ra/ia,1.);return uPos*(1.-f)+uv*f;}
float pane(vec2 d,vec2 h,float s){vec2 e=abs(d)-h;float b=1.-smoothstep(0.,s,max(e.x,e.y));
  float bars=max(1.-smoothstep(0.,.012,abs(d.x)),1.-smoothstep(0.,.008,abs(abs(d.y)-h.y*.5)));return b*(1.-bars*.7);}
float motes(vec2 q,float sc,float sp,float seed){
  vec2 gq=q*sc+vec2(uTime*sp*.6,-uTime*sp)+seed;vec2 c=floor(gq),f=fract(gq);
  float r=hash(c+seed);vec2 o=vec2(hash(c+1.7),hash(c+9.2))*.7+.15+.08*vec2(sin(uTime*.5+r*40.),cos(uTime*.4+r*30.));
  float d=length(f-o);return smoothstep(.07,.0,d)*step(.55,r)*(.5+.5*sin(uTime*(.6+r)+r*50.));}
void main(){
  vec2 p=(fit(v)-.5)*uZoom+.5;p.y+=uPar;
  vec3 day=texture2D(uTex,clamp(p,.001,.999)).rgb;
  float L=dot(day,vec3(.299,.587,.114));
  vec3 ngt=texture2D(uLut,vec2(L*.8889+.0556,.5)).rgb;
  vec2 q=vec2(p.x*uImg.x/uImg.y,p.y);
  // the day: the last of the sun, and the dust standing in it
  day*=mix(vec3(1.),vec3(1.,.88,.74),uDrain*.55)*(1.-.08*uDrain);
  if(uSteam.z>0.){                                   // the day side's mug is still warm
    vec2 d=vec2((p.x-uSteam.x)*uImg.x/uImg.y,uSteam.y-p.y);
    float sway=sin(d.y*26.-uTime*1.1)*.012*smoothstep(0.,.1,d.y)+sin(d.y*61.-uTime*1.9+1.7)*.004;
    float wisp=exp(-pow((d.x-sway)/(.009+d.y*.16),2.))*smoothstep(0.,.015,d.y)*smoothstep(.17,.03,d.y);
    day+=vec3(1.,.9,.72)*wisp*(.55+.45*sin(d.y*44.-uTime*2.3+sin(d.x*120.)))*.16*uSteam.z*(1.-uDrain*.5);
  }
  if(uSunA.z>0.){
    vec2 A=vec2(uSunA.x*uImg.x/uImg.y,uSunA.y),B=vec2(uSunB.x*uImg.x/uImg.y,uSunB.y);
    vec2 ab=B-A;float t=clamp(dot(q-A,ab)/dot(ab,ab),0.,1.);float d=length(q-A-ab*t);
    float beam=smoothstep(uSunA.z*(1.+t),uSunA.z*.25,d)*(1.-t*.7)*(1.-uDrain*.6);
    float m=motes(q,26.,.02,3.)+motes(q,41.,.014,11.)*.8+motes(q,63.,.01,23.)*.6;
    day+=vec3(1.,.86,.56)*beam*(.05+.04*sin(uTime*.23)+m*.5);
  }
  // the night: the street lamp through the window, warming from red to amber, and a car going by
  if(uLamp.z>0.){
    vec2 d=p-uLamp.xy;
    if(uKind>.5){float r=length(vec2(d.x*uImg.x/uImg.y,d.y));float face=1.-smoothstep(uLamp.z*.93,uLamp.z,r);
      vec3 lit=vec3(1.,.9,.66)*(.82+.1*L);ngt=mix(ngt,lit,face*uNight*.92);
      ngt+=vec3(1.,.62,.22)*exp(-r*r/(uLamp.z*uLamp.z*5.))*uNight*.3*(1.-face);
    }else{
      d.x-=d.y*uSunB.z*uImg.y/uImg.x;
      float w=pane(d,uLamp.zw,.03);
      for(int i=0;i<2;i++){                              // moths at the lamp outside: their shadows cross the pane
        float fi=float(i),tt=uTime*(1.3+fi*.5)+fi*2.4;
        vec2 m=vec2(sin(tt*1.7)+.4*sin(tt*4.3),cos(tt*2.1+fi)+.3*sin(tt*5.1))*uLamp.zw*vec2(.62,.6);
        vec2 q2=(d-m)*vec2(uImg.x/uImg.y,1.);
        w*=1.-.75*smoothstep(.012,.003,length(q2))*step(.85,uNight);
      }
      vec3 sod=mix(vec3(.95,.34,.12),vec3(1.,.55,.14),smoothstep(.25,.95,uNight));
      ngt=mix(ngt,sod*(.3+L*1.25),w*uNight*uNight*.86);
      ngt+=sod*exp(-dot(d,d)/.09)*uNight*.05;
    }
  }
  if(uCar>0.&&uCarY.y>0.){
    vec2 d=p-vec2(1.05-uCar*.75,uCarY.x);d.x+=d.y*.35;
    ngt+=vec3(.62,.74,1.)*pane(d,vec2(.09,uCarY.y),.05)*sin(uCar*3.1416)*(.06+L*.9);
  }
  // the seam: a hard edge with a thread of light on it. Near a finger it gives, like a curtain, and springs back.
  float e=1./uRes.x;
  float sx=uSeam+uPull.x*exp(-pow((v.y-uPull.y)/.26,2.));
  float k=smoothstep(sx-e,sx+e,v.x);
  vec3 col=mix(day,ngt,k);
  col*=1.-.4*uHush;
  float on=step(.002,sx)*step(sx,.998);
  col+=vec3(1.,.86,.6)*on*(exp(-pow((v.x-sx)*uRes.x/1.5,2.))*.2+exp(-pow((v.x-sx)/.016,2.))*min(abs(uPull.x)*7.,.5)*exp(-pow((v.y-uPull.y)/.26,2.)));
  col+=vec3(1.,.82,.5)*exp(-pow((v.x-uSeam)/.028,2.))*uBand*.5;
  col+=(hash(gl_FragCoord.xy+fract(uTime)*61.)-.5)*.045;
  gl_FragColor=vec4(col,1.);
}`;

function build(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }); } catch (e) { gl = null; }
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('light: shader failed, the pictures in the markup stand', e); return null; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = {}; const U = n => (n in u ? u[n] : (u[n] = gl.getUniformLocation(prog, n)));
  const G = { gl, canvas, dead: false, f: (n, ...x) => gl['uniform' + x.length + 'f'](U(n), ...x), i: (n, x) => gl.uniform1i(U(n), x) };
  G.tex = (unit, src, w, h) => {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, w, h, 0, gl.RGB, gl.UNSIGNED_BYTE, src); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  };
  G.draw = () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return G;
}

/* The night's ramp, read back out of the page's own #nt-night filter so the canvas and the fallback agree. */
function nightLut() {
  const f = document.getElementById('nt-night');
  const ch = n => { const el = f && f.querySelector(n); return el ? el.getAttribute('tableValues').trim().split(/\s+/).map(Number) : null; };
  const r = ch('feFuncR'), g = ch('feFuncG'), b = ch('feFuncB');
  if (!r || !g || !b || r.length !== 9) return null;
  const px = new Uint8Array(27);
  for (let i = 0; i < 9; i++) { px[i * 3] = Math.round(r[i] * 255); px[i * 3 + 1] = Math.round(g[i] * 255); px[i * 3 + 2] = Math.round(b[i] * 255); }
  return px;
}
const bez = (x1, y1, x2, y2) => x => {                 // cubic-bezier(x1,y1,x2,y2), as CSS means it
  let t = x; for (let i = 0; i < 6; i++) { const cx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t; const dx = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2); if (Math.abs(dx) < 1e-5) break; t -= (cx - x) / dx; }
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
};
const EASE = bez(.55, 0, .2, 1);

// state: () => ({ tenant: 'day'|'night', e: seconds into the shift, shift: seconds in a shift })
export function mountLight(state) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(max-width:43.99em)');
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const lut = nightLut();
  if (!lut) return null;
  const rooms = [];
  document.querySelectorAll('[data-pic]').forEach(pic => {
    const img = pic.querySelector('img.pic-day');
    if (img) rooms.push({ pic, img, cv: null, ctx: null, tex: null, on: false, ready: false, failed: false, P: null,
      still: pic.hasAttribute('data-still'), night: null, car: -1, carNext: 5 + Math.random() * 9 });
  });
  if (!rooms.length) return null;
  const glc = document.createElement('canvas'); glc.width = 16; glc.height = 16;       // the one context; never in the page
  const G = build(glc);
  if (!G) return null;
  const gl = G.gl;
  G.tex(1, lut, 9, 1); G.i('uLut', 1); G.i('uTex', 0);
  glc.addEventListener('webglcontextlost', ev => { ev.preventDefault(); G.dead = true; rooms.forEach(R => R.pic.classList.remove('is-lit')); });

  const rest = t => (t === 'night' ? -0.02 : 0.5);                         // where the seam stands
  const L = { seam: rest(state().tenant), night: state().tenant === 'night' ? 1 : .3, band: 0, sweep: null, t0: performance.now(), last: performance.now(),
    pull: 0, pullV: 0, pullT: 0, pullY: 0, hush: 0, hushT: 0, turned: -1e9 };
  /* The seam gives to a pointer or a finger that comes near it, a little, and springs back: you have the body until eight. */
  const near = (x, y) => { const d = x / window.innerWidth - rest(state().tenant); L.pullT = Math.abs(d) < .13 ? d * .6 : 0; L.pullY = y; };
  if (!reduced) {
    window.addEventListener('pointermove', ev => near(ev.clientX, ev.clientY), { passive: true });
    window.addEventListener('pointerdown', ev => near(ev.clientX, ev.clientY), { passive: true });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => window.addEventListener(n, ev => { if (ev.pointerType !== 'mouse' || n === 'pointerleave') L.pullT = 0; }, { passive: true }));
    document.addEventListener('mouseleave', () => { L.pullT = 0; });
  }
  const nums = (R, k, n) => { const d = R.pic.dataset, s = (phone.matches && d[k + 'M']) || d[k]; const a = s ? s.split(' ').map(Number) : []; while (a.length < n) a.push(0); return a; };
  const params = R => {
    const pos = getComputedStyle(R.img).objectPosition.split(' ').map(x => parseFloat(x) / 100);
    R.P = { iw: R.img.naturalWidth, ih: R.img.naturalHeight, px: isNaN(pos[0]) ? .5 : pos[0], py: isNaN(pos[1]) ? .5 : pos[1],
      sun: nums(R, 'sun', 5), lamp: nums(R, 'lamp', 5), car: nums(R, 'car', 2), steam: nums(R, 'steam', 2), kind: R.pic.dataset.kind === 'street' ? 1 : 0 };
  };
  const upload = R => {
    try { if (R.tex) gl.deleteTexture(R.tex); R.tex = G.tex(0, R.img); params(R); R.ready = true; return true; } catch (e) { return false; }
  };
  const wake = R => {
    if (R.cv || R.failed || G.dead) return;
    const go = () => {
      if (R.cv || R.failed || G.dead) return;
      if (!upload(R)) { R.failed = true; return; }
      const cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true');
      const ctx = cv.getContext('2d');
      if (!ctx) { R.failed = true; return; }
      R.pic.appendChild(cv); R.cv = cv; R.ctx = ctx;
      R.img.addEventListener('load', () => { if (!G.dead) upload(R); });     // the phone picture swaps in on a resize
      if (paint(R, performance.now())) R.pic.classList.add('is-lit');
    };
    if (R.img.complete && R.img.naturalWidth) go(); else R.img.addEventListener('load', go, { once: true });
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(en => {
      const R = rooms.find(x => x.pic === en.target); if (!R) return;
      R.on = en.isIntersecting; if (R.on) wake(R);
    }), { rootMargin: '300px 0px' });
    rooms.forEach(R => io.observe(R.pic));
  } else rooms.forEach(R => { R.on = true; wake(R); });
  window.addEventListener('resize', () => rooms.forEach(R => { if (R.ready) params(R); }), { passive: true });

  /* One room: draw it in the shared context at the room's own size, then copy that frame into the room's canvas. */
  function paint(R, now) {
    if (!R.ready || !R.cv || G.dead) return false;
    const w = Math.max(2, Math.round(R.cv.clientWidth * dpr)), h = Math.max(2, Math.round(R.cv.clientHeight * dpr));
    if (R.cv.width !== w || R.cv.height !== h) { R.cv.width = w; R.cv.height = h; }
    if (glc.width < w || glc.height < h) { glc.width = Math.max(glc.width, w); glc.height = Math.max(glc.height, h); }
    const P = R.P, time = reduced ? 0 : (now - L.t0) / 1000, vh = window.innerHeight, r = R.pic.getBoundingClientRect();
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.tex);
    G.f('uRes', w, h); G.f('uImg', P.iw, P.ih); G.f('uPos', P.px, P.py);
    G.f('uSunA', P.sun[0], P.sun[1], P.sun[4], 0); G.f('uSunB', P.sun[2], P.sun[3], P.lamp[4]);
    G.f('uLamp', P.lamp[0], P.lamp[1], P.lamp[2], P.lamp[3]); G.f('uCarY', P.car[0], P.car[1]); G.f('uKind', P.kind);
    // a little depth: the room is held slightly larger than its frame and slips behind what stands in front of it
    G.f('uZoom', R.still ? 1 : .972);
    G.f('uPar', R.still || reduced ? 0 : Math.max(-.012, Math.min(.012, ((r.top + r.height / 2) - vh / 2) / vh * .016)));
    const py = (L.pullY - r.top) / Math.max(r.height, 1);
    G.f('uPull', reduced ? 0 : L.pull, py, 0); G.f('uSteam', P.steam[0], P.steam[1], P.steam[0] && !reduced ? 1 : 0); G.f('uHush', L.hush);
    G.f('uSeam', L.seam); G.f('uNight', R.night === null ? L.night : R.night); G.f('uTime', time); G.f('uDrain', L.drain || 0); G.f('uBand', L.band); G.f('uCar', Math.max(R.car, 0));
    G.draw();
    try { R.ctx.drawImage(glc, 0, glc.height - h, w, h, 0, 0, w, h); } catch (e) { return false; }
    return true;
  }
  function frame(now, all) {
    const s = state(), dt = Math.min((now - L.last) / 1000, .1); L.last = now;
    const nightT = s.tenant === 'night' ? 1 : .3;                          // by day the lamp outside is only just on
    if (L.sweep) {                                                         // no View Transitions: the canvases carry the seam themselves
      const x = Math.min((now - L.sweep.t0) / L.sweep.ms, 1), to = L.sweep.to;
      const y = to === 'night' ? (x < .2 ? 0 : EASE((x - .2) / .8)) : (x < .8 ? EASE(x / .8) : 1);
      L.seam = to === 'night' ? .5 - .52 * y : -0.02 + .52 * y;
      L.band = Math.sin(Math.min(x * 1.15, 1) * Math.PI);
      if (x >= 1) { L.sweep = null; L.band = 0; }
    } else L.seam = rest(s.tenant);
    L.night = reduced ? nightT : L.night + (nightT - L.night) * (1 - Math.exp(-dt * (nightT > L.night ? .55 : 3)));   // sodium warms up slowly
    L.pullV += ((L.sweep ? 0 : L.pullT) - L.pull) * 190 * dt - L.pullV * 13 * dt; L.pull += L.pullV * dt;            // a spring
    L.hush += (L.hushT - L.hush) * (1 - Math.exp(-dt * 7));
    // the lamps do not all strike at once: each room's comes on a beat after the one above it
    let order = 0;
    rooms.forEach(R => { if (!R.on) { R.night = null; return; } const since = (now - L.turned) / 1000 - order++ * .45;
      R.night = reduced || nightT < 1 || since > 6 ? null : .3 + .7 * (1 - Math.exp(-Math.max(since, 0) * .9)) * (since > 0 && since < .7 ? .55 + .45 * Math.sin(since * 60) : 1); });
    L.drain = s.tenant === 'day' ? Math.min(Math.max((s.e - (s.shift - 120)) / 120, 0), 1) : 0;
    rooms.forEach(R => {
      if (!R.ready || (!R.on && !all)) return;
      if (!reduced) {
        if (R.car < 0) { R.carNext -= dt; if (R.carNext <= 0 && L.night > .9) R.car = 0; }
        else { R.car += dt / 3.4; if (R.car >= 1) { R.car = -1; R.carNext = 14 + Math.random() * 16; } }
      }
      paint(R, now);
    });
  }
  const ctl = {
    hush(on) { L.hushT = on && !reduced ? 1 : 0; },                                     // the held breath before the Latch
    snap() { L.sweep = null; L.band = 0; L.hushT = 0; L.hush = 0; L.turned = performance.now(); frame(performance.now(), true); },             // a View Transition carries the seam: just be there
    sweep(to, ms) { if (reduced) return ctl.snap(); L.hushT = 0; L.turned = performance.now() + ms * .5; L.sweep = { to, ms, t0: performance.now() }; },
  };
  if (reduced) {
    let key = '';
    const settle = () => { const s = state(), k = s.tenant + Math.round(window.scrollY / 40) + Math.round(s.e / 10) + rooms.filter(R => R.ready).length; if (k !== key) { key = k; frame(performance.now(), true); } };
    setInterval(settle, 500); window.addEventListener('scroll', settle, { passive: true }); settle();
    return ctl;
  }
  const loop = now => { requestAnimationFrame(loop); if (!document.hidden) frame(now); };
  requestAnimationFrame(loop);
  return ctl;
}
