// menu-gl.js — hand-written WebGL (no libraries) for The Universal Menu.
// One kitchen's worth of materials: linen, bone china, gilt, polished chrome, crystal, the
// warming lamp, and outside the dining room's windows the three skies of the three books.
//
//   dishGL     the place setting. A small analytic ray tracer: linen with a weave and pressed
//              creases, window light lying across it, a plate with a gilt band (nothing on it,
//              ever, except Earth in the hero), a chrome cloche that reflects its room or its
//              book's sky, the standing menu card's shadow, steam, a petrol film.
//              Used by the hero (SP-1), the amuse-bouche, each course, the pass and the
//              book pages.
//   banquetGL  the table laid to the horizon under the cloche fleet: ray-traced cloches that
//              come down in sequence, crystal, plates, a pleated cloth, the ships and a beam.
//   dinerGL    SP-4  Loomis at 9:14 p.m.: the lake the colour of a traffic cone, and the lid.
//   spoilGL    SP-5  the petrol film over the third book's page.
//
// ONE WebGL context serves every scene on a page. It is made once, kept, and drawn into only
// for the scenes that are on screen; each scene's own <canvas> is a plain 2D canvas that the
// frame is copied into (so the picture scrolls with the page, and Safari is asked for a single
// context however many scenes there are). Programs compile when their scene first comes near
// the viewport. Pixel ratio is capped; everything pauses off-screen and in a hidden tab; under
// reduced motion each scene draws one settled frame. Every canvas sits over markup that
// already shows the same composition as a still.

const DPR_CAP = 1.5;
const PX_BUDGET = 2.3e6;      // device pixels per scene, at most

const NOISE = `
float sq(float x){return x*x;}
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(19.7,7.3);a*=.5;}return v;}
`;

const NOISE3 = `
float hash3(vec3 p){p=fract(p*.3183099+vec3(.1,.17,.23));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
return mix(mix(mix(hash3(i),hash3(i+vec3(1.,0.,0.)),f.x),mix(hash3(i+vec3(0.,1.,0.)),hash3(i+vec3(1.,1.,0.)),f.x),f.y),
mix(mix(hash3(i+vec3(0.,0.,1.)),hash3(i+vec3(1.,0.,1.)),f.x),mix(hash3(i+vec3(0.,1.,1.)),hash3(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}
float fbm3(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise3(p);p=p*2.02+vec3(3.1,1.7,2.3);a*=.5;}return v;}
`;

/* ─────────────────────────────── the one context ─────────────────────────────── */
let R = null;
function core() {
  if (R) return R.gl ? R : null;
  const glc = document.createElement('canvas');
  const opts = { antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false };
  let gl = null;
  try { gl = glc.getContext('webgl2', opts) || glc.getContext('webgl', opts) || glc.getContext('experimental-webgl', opts); } catch (e) { /* no webgl */ }
  R = { gl, glc, scenes: [], raf: 0, lost: false, progs: {}, tex: {}, buf: null, cur: null };
  if (!gl) return null;
  R.v2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  R.par = gl.getExtension('KHR_parallel_shader_compile');
  const setup = () => {
    R.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, R.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.disable(gl.BLEND); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  };
  setup();
  glc.addEventListener('webglcontextlost', e => { e.preventDefault(); R.lost = true; });
  glc.addEventListener('webglcontextrestored', () => {
    R.lost = false; R.progs = {}; R.cur = null;
    Object.keys(R.tex).forEach(k => { R.tex[k].t = null; });
    setup(); R.scenes.forEach(s => { s.dirty = true; }); kick();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  window.addEventListener('resize', () => { R.scenes.forEach(s => { s.dirty = true; }); kick(); });
  return R;
}

// A program is compiled the first time a scene that needs it comes near the screen; where the
// browser can compile in the background the scene simply waits (its still is showing).
function program(def) {
  const gl = R.gl;
  let P = R.progs[def.name];
  if (!P) {
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}');
    const fs = sh(gl.FRAGMENT_SHADER, def.frag);
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs);
    gl.bindAttribLocation(pr, 0, 'a'); gl.linkProgram(pr);
    P = R.progs[def.name] = { pr, vs, fs, ok: null, U: {} };
  }
  if (P.ok === null) {
    if (R.par && !gl.getProgramParameter(P.pr, R.par.COMPLETION_STATUS_KHR)) return null;
    if (!gl.getProgramParameter(P.pr, gl.LINK_STATUS)) {
      console.warn('[menu-gl] ' + def.name, gl.getShaderInfoLog(P.fs) || gl.getProgramInfoLog(P.pr));
      P.ok = false;
    } else {
      P.ok = true;
      def.uniforms.forEach(n => { P.U[n] = gl.getUniformLocation(P.pr, n); });
    }
  }
  return P.ok ? P : false;
}

// Textures are shared by URL. Each holds a one-texel stand-in until its image has arrived.
function texture(url, onload) {
  const gl = R.gl;
  let T = R.tex[url];
  if (!T) {
    T = R.tex[url] = { t: null, img: null, ready: false, waiters: [], ar: 1 };
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { T.img = img; T.ready = true; T.t = null; T.ar = img.naturalWidth / img.naturalHeight; T.waiters.forEach(f => f()); T.waiters = []; };
    img.src = url;
  }
  if (onload) { if (T.ready) onload(); else T.waiters.push(onload); }
  return T;
}
function bind(T, unit) {
  const gl = R.gl;
  gl.activeTexture(gl.TEXTURE0 + unit);
  if (!T.t) {
    T.t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, T.t);
    if (T.img) {
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, T.img); }
      catch (e) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([245, 240, 230])); }
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array(T.blank || [245, 240, 230]));
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (R.v2 && T.img) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  } else gl.bindTexture(gl.TEXTURE_2D, T.t);
}
const BLANK = { t: null, img: null, ready: true, waiters: [], ar: 1 };

function kick() { if (R && R.gl && !R.raf && !R.lost) R.raf = requestAnimationFrame(frame); }

function frame(ms) {
  R.raf = 0;
  if (R.lost || document.hidden) return;
  const gl = R.gl, glc = R.glc;
  let again = false;
  for (let k = 0; k < R.scenes.length; k++) {
    const s = R.scenes[k];
    if (s.dead || !s.vis) continue;
    if (s.still && !s.dirty) continue;
    const P = program(s.def);
    if (P === false) { s.dead = true; continue; }
    if (P === null) { again = true; continue; }          // still compiling: the still is showing
    const cw = s.canvas.clientWidth, ch = s.canvas.clientHeight;
    if (cw < 2 || ch < 2) continue;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP, Math.sqrt(PX_BUDGET / (cw * ch)));
    const w = Math.max(2, Math.round(cw * dpr)), h = Math.max(2, Math.round(ch * dpr));
    if (s.canvas.width !== w || s.canvas.height !== h) { s.canvas.width = w; s.canvas.height = h; }
    if (glc.width < w || glc.height < h) { glc.width = Math.max(glc.width, w); glc.height = Math.max(glc.height, h); }
    gl.viewport(0, 0, w, h);
    if (R.cur !== P) {
      gl.useProgram(P.pr); R.cur = P;
      gl.bindBuffer(gl.ARRAY_BUFFER, R.buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }
    s.draw(gl, P.U, ms / 1000, w, h, dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    s.ctx.globalCompositeOperation = 'copy';
    s.ctx.drawImage(glc, 0, glc.height - h, w, h, 0, 0, w, h);
    s.dirty = false;
    if (!s.drawn && (!s.ready || s.ready())) { s.drawn = true; if (s.onFirst) s.onFirst(); }
    if (!s.still || !s.drawn) again = true;
  }
  if (again) R.raf = requestAnimationFrame(frame);
}

/* Register a scene. def: { name, frag, uniforms }; o: { draw(gl,U,t,w,h,dpr), still, ready(), onFirst() }.
   Returns { kick, stop } or null when there is no WebGL (the still in the markup stays). */
function scene(canvas, def, o) {
  if (!core()) return null;
  let ctx = null;
  try { ctx = canvas.getContext('2d'); } catch (e) { /* taken */ }
  if (!ctx) return null;
  const s = { canvas, ctx, def, draw: o.draw, still: !!o.still, ready: o.ready, onFirst: o.onFirst, vis: false, dirty: true, drawn: false, dead: false };
  s.io = new IntersectionObserver(en => { s.vis = en[0].isIntersecting; if (s.vis) { s.dirty = true; kick(); } }, { rootMargin: o.margin || '220px' });
  s.io.observe(canvas);
  R.scenes.push(s);
  return {
    kick() { s.dirty = true; kick(); },
    stop() { s.dead = true; s.io.disconnect(); },
  };
}

/* ───────────────────────── THE TABLE LAID TO THE HORIZON ─────────────────────────
   A ray tracer for one long table. The camera rides beside it, a little above the cloth, and
   looks down its length into the sun. Every place is the same: an empty plate with a gilt
   rim, a napkin, a crystal glass, and a covered dish whose chrome lid hangs in the air until
   the service reaches it, then comes down (never up). Above the far end the fleet waits:
   ships that are the same lid, the size of a hotel. The sky is a painted plate (uSky) that
   the chrome really reflects. */
const BANQ_FRAG = `precision highp float;
uniform vec2 uRes;uniform float uTime;uniform sampler2D uSky;
uniform vec4 uCam;uniform vec4 uLook;uniform vec4 uOpt;
uniform vec3 uSunC;uniform vec3 uHazeC;uniform vec3 uGndC;uniform vec2 uPar;uniform vec4 uSkyK;
${NOISE}
const float W=.62;
const float LC=1.22;
const float GY=-.74;
const vec3 CR=vec3(.235,.285,.235);
const float XC=.26;
const float XP=-.29;
const float RP=.225;
const vec3 PORC=vec3(.961,.941,.902);
const vec3 GILT=vec3(.722,.537,.169);
vec3 S;float gPx;

// the painted sky, by direction; mirrored where the plate runs out
vec3 sky(vec3 d){
float az=atan(d.x,d.z),e=asin(clamp(d.y,0.,1.));
if(uLook.y>.5){
// the Concourse: a deep blue hall, gallery on gallery of small lit kitchens going up into it
vec3 c=mix(vec3(.125,.380,.520),vec3(.030,.105,.185),smoothstep(0.,.75,e));
c+=vec3(.16,.26,.30)*exp(-e*7.);
float a2=az+uPar.x*.6;
for(int i=0;i<9;i++){
float fi=float(i);
float te=.030+fi*.052+fi*fi*.0035;
float n=150.-fi*11.;
float x=a2*n/6.2832+fi*.37;
float id=floor(x);float fx=fract(x)-.5;
float on=step(.42,hash(vec2(id,fi*7.+1.)));
float dy=(e-te)/(.0028+fi*.0004);
float lamp=exp(-fx*fx*150.-dy*dy)*on;
c+=mix(vec3(1.,.72,.34),vec3(1.,.86,.60),hash(vec2(id,fi)))*(lamp*(1.5-fi*.10)+exp(-fx*fx*14.-dy*dy*.05)*on*.10);
c+=vec3(.30,.20,.09)*exp(-sq((e-te)/.012))*.16;
c*=1.-.10*exp(-sq((e-te+.014)/.006));
}
c*=.92+.16*noise(vec2(az*3.,e*9.));
return c;
}
float u=uLook.z+(az-uSkyK.x)/uLook.w+uPar.x;u=abs(mod(u+1.,2.)-1.);
float ev=1.-exp(-e/uSkyK.y);ev=ev/(1.-exp(-1.5708/uSkyK.y));
vec3 c=texture2D(uSky,vec2(u,uSkyK.z-(uSkyK.z-.012)*ev)).rgb;
// straight overhead the plate has run out: one quiet colour from its top edge
if(e>.55)c=mix(c,texture2D(uSky,vec2(.5,.03)).rgb,smoothstep(.55,1.25,e));
return mix(c,uHazeC*1.06,exp(-e*26.)*.55);
}
// the same sky as a mirror sees it: laid over the whole dome with no pole, so a lid shows
// clouds and not a star of streaks
vec3 skyR(vec3 d){
if(uLook.y>.5)return sky(d);
float ca=cos(uSkyK.x),sa=sin(uSkyK.x);
vec3 e=vec3(ca*d.x-sa*d.z,max(d.y,0.),sa*d.x+ca*d.z);
vec2 q=e.xy/(abs(e.z)+.5);
float u=uLook.z+q.x*.46;u=abs(mod(u+1.,2.)-1.);
float v=1.-exp(-q.y*1.25);
vec3 c=texture2D(uSky,vec2(u,uSkyK.z-(uSkyK.z-.012)*v)).rgb;
return mix(c,uHazeC*1.06,exp(-d.y*22.)*.5);
}
vec3 land(vec3 d){return mix(uHazeC*.62,uGndC*.9,smoothstep(0.,-.16,d.y));}
vec3 env(vec3 d){return d.y>0.?skyR(d):land(d);}

// where the lid of place i hangs: down for the places the service has reached
float lidY(float i){
float d=(i+.5)*LC-uCam.x;
float s=smoothstep(uOpt.x+2.6,uOpt.x-.2,d);
s=s*s*(3.-2.*s);
return mix(.46,.012,s);
}

// how much of the sun the lid of place i hides from p
float shLid(vec3 p,float i){
vec3 c=vec3(XC,lidY(i),(i+.5)*LC);
vec3 o=(p-c)/CR,d=S/CR;
float a=dot(d,d),b=dot(o,d),hh=b*b-a*(dot(o,o)-1.);
float dist=sqrt(max(dot(o,o)-b*b/a,0.));
float t1=-b/a;
float pen=.06+.05*max(t1,0.);
float cov=1.-smoothstep(1.-pen,1.+pen,dist);
float t2=(-b+sqrt(max(hh,0.)))/a;
return cov*smoothstep(c.y-.04,c.y+.05,p.y+S.y*t2)*step(0.,t2);
}

// the cloth and everything that lies flat on it. q: 0 full detail, 1 seen in a reflection
vec3 top(vec3 h,vec3 vd,float px,float q){
float i=floor(h.z/LC);float zl=h.z-(i+.5)*LC;
float aa=px*1.2;
float graze=clamp(-vd.y,0.02,1.);
float az_=aa/graze;
// linen in low sun
float wv=0.;
if(q<.5){
float vis=smoothstep(.022,.004,px);
vec2 u=h.xz*vec2(118.,118.);
wv=(sin(u.x)*sin(u.y)*.5+(noise(h.xz*vec2(7.,160.))-.5)+(noise(h.xz*vec2(160.,7.))-.5))*vis;
}
vec3 col=PORC*vec3(1.04,.925,.76)*(1.+.035*wv);
col*=.94+.10*fbm(h.xz*1.3);
// pressed creases, one down the middle and one across each place
float cx=h.x-.012;col*=1.+.07*(cx/.03)*exp(-sq(cx/.03));
float czz=mod(h.z+.31,LC*2.)-LC;col*=1.-.06*(czz/.05)*exp(-sq(czz/.05));
// the fall of the cloth at the table's edges
col*=1.-.20*smoothstep(W-.07,W,abs(h.x));
float sh=0.;
if(q<.5){sh=max(shLid(h,i),max(shLid(h,i+1.),shLid(h,i+2.)));}
// the under-plate of the covered dish
{
vec2 d=vec2(h.x-XC,zl);float r=length(d)/.30;
float inP=1.-smoothstep(1.-az_/.30,1.+az_/.30,r);
if(inP>0.){
vec3 pl=vec3(.985,.955,.90)*vec3(1.,.93,.80);
float rim=smoothstep(.70,.80,r);
pl*=1.+.10*rim*(d.y/.30);
float band=smoothstep(.88,.90,r)*(1.-smoothstep(.945,.965,r));
pl=mix(pl,GILT*(1.1+.9*max(d.y/.30,0.))+uSunC*.25,band*.9);
pl*=1.-.10*exp(-sq((r-.76)/.05));
col=mix(col,pl,inP);
}
col*=1.-.28*(1.-smoothstep(.95,1.30,length(d-vec2(.03,-.10))/.30))*(1.-inP);
}
// the empty plate, and what its glaze holds of the sky
{
vec2 d=vec2(h.x-XP,zl+.10);float r=length(d)/RP;
float inP=1.-smoothstep(1.-az_/RP,1.+az_/RP,r);
col*=1.-.30*(1.-smoothstep(.92,1.28,length(d-vec2(.02,-.09))/RP))*(1.-inP);
if(inP>0.){
vec3 pl=vec3(.985,.955,.90)*vec3(1.,.93,.80);
float rim=smoothstep(.66,.76,r);
float side=d.y/RP;
pl*=1.+.13*rim*side;
float lip=exp(-sq((r-.70)/.035));
pl*=1.-.16*lip*smoothstep(-.2,1.,side);
pl+=vec3(.10,.08,.05)*lip*smoothstep(-.2,1.,-side);
float band=smoothstep(.885,.905,r)*(1.-smoothstep(.945,.965,r));
pl=mix(pl,GILT*(1.0+1.0*max(side,0.))+uSunC*.3*pow(max(side,0.),3.),band*.92);
float hair=smoothstep(.635,.65,r)*(1.-smoothstep(.66,.675,r));
pl=mix(pl,GILT*1.1,hair*.5*smoothstep(.012,.003,px));
if(q<.5){
vec3 m=vec3(vd.x,-vd.y,vd.z);
float fr=.05+.95*pow(1.-graze,4.);
pl=mix(pl,sky(m)*1.05,fr*(.55+.45*rim)*.8);
// the petrol film, on the third book's table
if(uOpt.z>0.){
float film=fbm(d*14.+i*3.1+vec2(uTime*.02,0.));
float creep=smoothstep(1.02-uOpt.z*1.1,1.25-uOpt.z*1.1,r+(film-.5)*.5);
vec3 ir=.62+.16*cos(6.2832*(film*2.4+vec3(0.,.33,.67)));
pl=mix(pl,pl*.60+ir*.42,creep*smoothstep(.3,.7,film)*.7);
}
}
col=mix(col,pl,inP);
}
}
// napkin, folded in three
{
vec2 d=vec2(h.x-XP-.01,zl-.40);
vec2 b=abs(d)-vec2(.150,.085);
float sd=length(max(b,0.))+min(max(b.x,b.y),0.)-.012;
float inN=1.-smoothstep(-az_,az_,sd);
col*=1.-.30*(1.-smoothstep(0.,.07,length(max(abs(d-vec2(.012,-.05))-vec2(.150,.085),0.))))*(1.-inN);
if(inN>0.){
vec3 nk=PORC*vec3(1.,.915,.79)*1.04;
nk*=1.+.10*(d.y/.085);
nk*=1.-.10*exp(-sq((d.x+.05)/.012))-.08*exp(-sq((d.x-.055)/.012));
nk*=1.-.16*smoothstep(-.03,0.,sd);
nk+=uSunC*.10*smoothstep(.05,.085,d.y);
col=mix(col,nk,inN);
}
}
// silver: a fork and a knife laid across, catching the sun as lines
if(q<.5){
float fz=zl+.10;
float k1=exp(-sq((h.x-XP-RP-.045)/(.007+az_*.5)))*smoothstep(.17,.14,abs(fz));
float k2=exp(-sq((h.x-XP+RP+.045)/(.006+az_*.5)))*smoothstep(.15,.12,abs(fz-.01));
vec3 m=vec3(vd.x,-vd.y,vd.z);
vec3 sv=sky(m)*1.25+uSunC*.5;
col=mix(col,sv,clamp(k1+k2,0.,1.)*.85);
col*=1.-.20*exp(-sq((h.x-XP-RP-.058)/.012))*smoothstep(.17,.14,abs(fz))*(1.-k1);
// the foot of the glass
vec2 gd=vec2(h.x+.01,zl-.36);float gr=length(gd)/.055;
float ring=exp(-sq((gr-.9)/.14));
col+=sv*ring*.22*(.4+.6*smoothstep(-1.,1.,gd.y/.055));
col*=1.-.12*(1.-smoothstep(.2,1.2,gr));
}
col*=mix(vec3(1.),vec3(.50,.52,.63),sh);
return col;
}

// chrome, as the table's lids wear it: the sky above, the cloth below
vec3 chrome(vec3 pos,vec3 n,vec3 rd,float px){
vec3 rr=reflect(rd,n);
vec3 c;
if(rr.y>.0){c=skyR(rr);}
else{
vec3 g=pos+rr*(pos.y/max(-rr.y,.004));
float on=smoothstep(W+.04,W-.04,abs(g.x));
c=mix(land(rr),top(g,rr,.03,1.)*.90,on);
}
// polished metal is darker and harder than what it mirrors
c=mix(c,c*c*(1.5-.5*c),.55);
c*=vec3(.93,.94,.96);
float fr=pow(clamp(1.-dot(n,-rd),0.,1.),3.);
c=mix(c,uHazeC*.8,fr*.30);
c+=uSunC*(pow(max(dot(rr,S),0.),260.)*3.+pow(max(dot(rr,S),0.),24.)*.22);
return c;
}

// one of the fleet. s: centre of the rim (xyz) and the dome's radius (w)
vec4 ship(vec3 ro,vec3 rd,vec4 s,float lit,float seed){
vec3 c=vec3(0.);float cov=0.;
float a=s.w;vec3 rad=vec3(a,a*.60,a);
float dist=length(s.xyz-ro);
float px=dist*gPx;
// the dome
vec3 o=(ro-s.xyz)/rad,d=rd/rad;
float A=dot(d,d),B=dot(o,d),C=dot(o,o)-1.,H=B*B-A*C;
float dC=sqrt(max(dot(o,o)-B*B/A,0.));
float cd=clamp((1.-dC)*a*.6/px+.5,0.,1.);
if(cd>0.){
vec3 pos=ro+rd*((-B-sqrt(max(H,0.)))/A);
float up=clamp((pos.y-s.y)/px+.5,0.,1.);
if(up>0.){
vec3 n=normalize((pos-s.xyz)/(rad*rad));
vec3 rr=reflect(rd,n);
vec3 e=env(rr);e=mix(e,e*e*(1.5-.5*e),.5);e*=vec3(.93,.94,.96);
float fr=pow(clamp(1.-dot(n,-rd),0.,1.),2.5);
e=mix(e,uHazeC*.85,fr*.35);
e+=uSunC*(pow(max(dot(rr,S),0.),180.)*2.5+pow(max(dot(rr,S),0.),14.)*.25);
// seams and a band of ports, as on the first cover
float lat=(pos.y-s.y)/rad.y;float lon=atan(pos.x-s.x,pos.z-s.z);
e*=1.-.10*exp(-sq((lat-.30)/.012))-.08*exp(-sq((lat-.62)/.010));
float port=exp(-sq((lat-.16)/.022))*pow(.5+.5*cos(lon*60.),6.)*step(.35,hash(vec2(floor(lon*60./6.2832+.5),seed)));
e+=vec3(1.,.93,.78)*port*.9*smoothstep(9.,2.,px/a*400.);
e*=.72+.28*smoothstep(0.,.25,lat);
c=e;cov=cd*up;
}
}
// handle
{
vec3 kc=s.xyz+vec3(0.,rad.y+a*.085,0.);float kr=a*.085;
vec3 ko=ro-kc;float kb=dot(ko,rd);float kD=sqrt(max(dot(ko,ko)-kb*kb,0.));
float ck=clamp((kr-kD)/px+.5,0.,1.);
if(ck>0.){
vec3 pos=ro+rd*(-kb-sqrt(max(kb*kb-dot(ko,ko)+kr*kr,0.)));
vec3 n=(pos-kc)/kr;vec3 rr=reflect(rd,n);
vec3 e=env(rr)*vec3(1.,.86,.60)+uSunC*pow(max(dot(rr,S),0.),60.)*1.5;
c=mix(c,e,ck);cov=max(cov,ck);
}
vec3 cc=s.xyz+vec3(0.,rad.y+a*.01,0.);
vec3 co=(ro-cc)/vec3(a*.10,a*.03,a*.10),cdd=rd/vec3(a*.10,a*.03,a*.10);
float cA=dot(cdd,cdd),cB=dot(co,cdd);float cD=sqrt(max(dot(co,co)-cB*cB/cA,0.));
float cc2=clamp((1.-cD)*a*.03/px+.5,0.,1.);
if(cc2>0.){c=mix(c,env(reflect(rd,vec3(0.,1.,0.)))*.8+uSunC*.1,cc2*(1.-ck));cov=max(cov,cc2);}
}
// the rim, a plate the lid sits on: seen from beneath
float ty=(s.y-ro.y)/rd.y;
if(ty>0.){
vec3 pr=ro+rd*ty;vec2 dd=pr.xz-s.xz;float r=length(dd)/(a*1.46);
float pr_px=px/(a*1.46)/max(abs(rd.y),.03);
float in_=1.-smoothstep(1.-pr_px,1.+pr_px,r);
if(in_>0.){
float ang=atan(dd.x,dd.y);
vec3 u=mix(vec3(.035,.045,.06),uGndC*1.25+uHazeC*.10,smoothstep(.15,1.,r));
u+=vec3(.9,.9,.85)*exp(-sq((r-.985)/.02))*.5;
float bulbs=pow(.5+.5*cos(ang*40.),8.)*exp(-sq((r-.80)/.035));
u+=vec3(1.,.92,.74)*bulbs*(.8+.3*sin(uTime*.7+ang*5.));
u+=vec3(1.,.9,.7)*exp(-sq((r-.52)/.012))*.35;
u+=vec3(1.,.96,.86)*lit*(1.7*exp(-sq(r/.15))+.35*exp(-sq(r/.34)));
c=mix(c,u,in_);cov=max(cov,in_);
}
}
return vec4(c,cov);
}

void main(){
vec2 p=(gl_FragCoord.xy-.5*uRes)/uRes.y;
float yaw=uCam.w,pit=uCam.z;
vec3 f=vec3(sin(yaw)*cos(pit),sin(pit),cos(yaw)*cos(pit));
vec3 r=normalize(vec3(f.z,0.,-f.x));vec3 u=cross(f,r);
vec3 ro=vec3(uSkyK.w,uCam.y,uCam.x);
vec3 rd=normalize(f*uLook.x+r*p.x+u*p.y);
gPx=1./(uRes.y*uLook.x);
S=normalize(vec3(sin(uSkyK.x)*.995,.105,cos(uSkyK.x)*.995));
vec3 col;
// ── far things: the sky, the plain, the fleet, the beam
float tg=1e5;
if(rd.y>0.){col=sky(rd);}
else{
tg=(GY-ro.y)/rd.y;vec3 g=ro+rd*tg;
col=uGndC*(.70+.55*fbm(g.xz*vec2(.30,1.1))+.10*noise(g.xz*9.)*smoothstep(30.,4.,tg));
// the plain is hard and a little wet: at a low angle it holds the sky
vec3 gm=vec3(rd.x,-rd.y,rd.z);
col=mix(col,sky(gm)*.8,(.03+.60*pow(1.+rd.y,22.))*(.75+.5*noise(g.xz*vec2(.6,3.))));
// the table's shadow lies on the plain beside it
col*=1.-.55*smoothstep(-W-.9,-W-.05,g.x)*smoothstep(W+2.4,W+.3,g.x);
col*=1.-.35*smoothstep(-W-.28,-W,g.x)*step(g.x,-W+.2);
col+=uSunC*.16*exp(-sq((atan(rd.x,rd.z)-uSkyK.x)/.10))*exp(rd.y*9.)*step(uLook.y,.5);
col=mix(col,uHazeC,1.-exp(-tg*.011));
}
float nS=uOpt.y;
for(int k=0;k<9;k++){
float fk=float(k);if(fk>=nS)break;
vec4 s;
if(k==0)s=vec4(.2,10.4,64.,8.6);
else if(k==1)s=vec4(31.,11.8,96.,8.2);
else if(k==2)s=vec4(-33.,12.6,118.,8.8);
else if(k==3)s=vec4(-9.,17.,190.,9.);
else if(k==4)s=vec4(58.,16.,210.,9.5);
else if(k==5)s=vec4(-70.,15.,230.,9.);
else if(k==6)s=vec4(18.,22.,300.,10.);
else if(k==7)s=vec4(-40.,24.,340.,10.);
else s=vec4(95.,21.,360.,10.);
s.z+=uCam.x;
s.y+=.25*sin(uTime*.23+fk*2.1);
s.x+=uPar.y*(40.-fk*3.);
float far_=length(s.xyz-ro);
vec4 sc=ship(ro,rd,s,k==0?uOpt.w:0.,fk);
sc.rgb=mix(sc.rgb,uHazeC*1.02,1.-exp(-far_*.0052));
col=mix(col,sc.rgb,sc.a);
}
// the beam from the nearest ship onto the far end of the table
if(uOpt.w>0.){
vec3 s=vec3(.2,10.4,64.+uCam.x);
s.x+=uPar.y*40.;s.y+=.25*sin(uTime*.23);
vec2 dxz=rd.xz;float tt=dot(s.xz-ro.xz,dxz)/dot(dxz,dxz);
float yy=ro.y+rd.y*tt;float dp=length(ro.xz+dxz*tt-s.xz);
float dn=clamp((s.y-yy)/(s.y-GY),0.,1.);
float rb=mix(.75,1.5,dn);
float beam=exp(-sq(dp/rb))*step(yy,s.y)*step(0.,yy)*step(0.,tt);
float glit=step(.80,hash(floor(vec2(dp*5.+17.,yy*7.-uTime*2.2))))*step(.5,hash(floor(vec2(gl_FragCoord.x*.5,yy*7.-uTime*2.2))));
col+=vec3(1.,.94,.80)*beam*(.26+.20*(1.-dn)+glit*.5)*uOpt.w;
col+=vec3(1.,.88,.66)*exp(-sq(dp/(rb*2.6)))*exp(-sq(yy/1.4))*.30*uOpt.w*step(0.,tt);
}
// ── the table
float tt0=1e5;
if(rd.y<0.){
float A=1.;vec3 acc=vec3(0.);
// the pleated fall of the cloth along this side
float tx=(-W-ro.x)/rd.x;
vec3 hs=ro+rd*tx;
bool onSide=false;
if(rd.x>0.&&tx>0.&&hs.y<0.){
float ph=hs.z*8.2+3.4*noise(vec2(hs.z*.7,3.))+1.5*noise(vec2(hs.z*2.3,9.));
float px=tx*gPx;
float lodp=smoothstep(.30,.04,px*8.2);
float dpth=smoothstep(0.,-.22,hs.y);
float hem=GY+.035+.018*sin(ph)+.012*sin(ph*.5+1.)*lodp;
float inS=smoothstep(hem-px,hem+px,hs.y);
if(inS>0.){
float sn=sin(ph),cs=cos(ph);
float nz=cs*dpth*lodp;
vec3 c=PORC*vec3(1.,.90,.765);
float litf=.56+.36*smoothstep(-1.,1.,nz)+.10*sn*dpth*lodp;
c*=litf;
c+=uSunC*.22*pow(max(nz,0.),2.)*dpth;
c*=1.-.22*dpth*(.5-.5*sn)*lodp;
c*=mix(1.,.80,smoothstep(-.35,GY,hs.y));
c+=PORC*vec3(1.,.92,.78)*.35*smoothstep(-.035,0.,hs.y);
c*=.96+.08*noise(vec2(hs.z*40.,hs.y*40.))*lodp;
c=mix(c,uHazeC,(1.-exp(-tx*.011))*.9);
acc=c*inS;A=1.-inS;onSide=true;tt0=tx;
}
}
if(A>.001){
float tT=-ro.y/rd.y;vec3 h=ro+rd*tT;
// what stands on the cloth, nearest first
float tA=max((.80-ro.y)/rd.y,0.);
if(rd.x>1e-4)tA=max(tA,(-.09-ro.x)/rd.x);
float tB=tT;
if(rd.x>1e-4)tB=min(tB,(.52-ro.x)/rd.x);
float zA=ro.z+rd.z*tA,zB=ro.z+rd.z*tB;
float i0=floor((zA-.42)/LC);
if(!onSide&&tB>tA)for(int k=0;k<7;k++){
float i=i0+float(k);
if(i*LC>zB+.3||A<.01)break;
float zc=(i+.5)*LC;
float yc=lidY(i);
vec3 cc=vec3(XC,yc,zc);
float dist=length(cc-ro);float px=dist*gPx;
float hz=1.-exp(-dist*.011);
// lid
vec3 o=(ro-cc)/CR,d=rd/CR;
float a2=dot(d,d),b2=dot(o,d),c2=dot(o,o)-1.,h2=b2*b2-a2*c2;
float dC=sqrt(max(dot(o,o)-b2*b2/a2,0.));
float cv=clamp((1.-dC)*CR.x/px+.5,0.,1.);
if(cv>0.){
vec3 pos=ro+rd*((-b2-sqrt(max(h2,0.)))/a2);
float hg=pos.y-yc;
float cy=clamp(hg/px+.5,0.,1.);
if(cy>0.){
vec3 n=normalize((pos-cc)/(CR*CR));
float lip=smoothstep(.030,0.,hg);
n=normalize(n+vec3(0.,1.,0.)*(.5*sin(lip*3.1416)-.2*lip));
vec3 ch=chrome(pos,n,rd,px);
ch*=1.-.25*smoothstep(.026,.018,hg)*smoothstep(.010,.017,hg);
ch=mix(ch,uHazeC,hz*.9);
float w=cv*cy*A;acc+=ch*w;A-=w;
}
}
// handle
vec3 kc=cc+vec3(0.,CR.y+.030,0.);float kr=.034;
vec3 ko=ro-kc;float kb=dot(ko,rd);float kD=sqrt(max(dot(ko,ko)-kb*kb,0.));
float ck=clamp((kr-kD)/px+.5,0.,1.);
if(ck>0.){
vec3 pos=ro+rd*(-kb-sqrt(max(kb*kb-dot(ko,ko)+kr*kr,0.)));
vec3 n=(pos-kc)/kr;vec3 rr=reflect(rd,n);
vec3 e=env(rr)*vec3(1.,.82,.50)+uSunC*pow(max(dot(rr,S),0.),40.)*1.6;
e=mix(e,uHazeC,hz*.9);
float w=ck*A;acc+=e*w;A-=w;
}
// crystal: a bowl on a stem. Mostly what is behind it, plus the light it steals
vec3 gc=vec3(-.01,.215,zc+.36);vec3 gr=vec3(.052,.078,.052);
vec3 go=(ro-gc)/gr,gd=rd/gr;
float ga=dot(gd,gd),gb=dot(go,gd),gq=dot(go,go)-1.,gh=gb*gb-ga*gq;
float gD=sqrt(max(dot(go,go)-gb*gb/ga,0.));
float cg=clamp((1.-gD)*gr.x/px+.5,0.,1.);
if(cg>0.&&px<.02){
vec3 pos=ro+rd*((-gb-sqrt(max(gh,0.)))/ga);
vec3 pos2=ro+rd*((-gb+sqrt(max(gh,0.)))/ga);
float open=smoothstep(gc.y+.052+px,gc.y+.052-px,pos.y);
float open2=smoothstep(gc.y+.052+px,gc.y+.052-px,pos2.y);
vec3 n=normalize((pos-gc)/(gr*gr));
float fr=pow(clamp(1.-abs(dot(n,rd)),0.,1.),2.2);
vec3 rr=reflect(rd,n);
vec3 gls=env(vec3(rr.x,abs(rr.y),rr.z))*(.25+.9*fr)*open;
gls+=uSunC*(pow(max(dot(rr,S),0.),90.)*2.2)*open;
// the far wall of the bowl turns the sunset upside down
gls+=sky(vec3(-rd.x,.05+abs(n.y)*.5,rd.z))*.20*open2;
gls+=vec3(1.,.95,.85)*exp(-sq((pos.y-gc.y-.062)/(px*1.5+.004)))*.55;
gls+=vec3(1.,.95,.85)*exp(-sq((pos2.y-gc.y-.062)/(px*1.5+.004)))*.35;
float w=cg*A*clamp(.22+.6*fr,0.,1.)*max(open,open2*.6);
acc+=gls*cg*A*.9;A-=w*.5;
}
// stem
{
vec2 sxz=gc.xz;vec2 dxz=rd.xz;float ts=dot(sxz-ro.xz,dxz)/dot(dxz,dxz);
float ys=ro.y+rd.y*ts;float ds=length(ro.xz+dxz*ts-sxz);
float st=(1.-smoothstep(.006,.006+px*1.5,ds))*step(0.012,ys)*step(ys,gc.y-.072)*step(px,.012);
acc+=(env(vec3(-.4,.5,.7))*.9+uSunC*.35)*st*A*.8;A-=st*A*.5;
}
}
if(A>.001){
if(abs(h.x)<=W){
vec3 c=top(h,rd,tT*gPx,0.);
// the cloth's own near edge, where it turns down
float e1=smoothstep(W-tT*gPx*1.5,W,-h.x);
c=mix(c,c*1.12,e1);
c=mix(c,uHazeC,(1.-exp(-tT*.011))*.9);
acc+=c*A;A=0.;tt0=tT;
}
}
}
col=acc+col*A;
}
// ── air: the sun in the lens, a little grain, the corners
float sd=max(dot(rd,S),0.);
col+=uSunC*(pow(sd,900.)*.55+pow(sd,90.)*.26+pow(sd,7.)*.11)*step(uLook.y,.5);
vec2 q=gl_FragCoord.xy/uRes;
col*=.86+.14*smoothstep(0.,.30,q.x*(1.-q.x)*4.)*smoothstep(0.,.22,q.y*(1.-q.y)*4.);
col+=(hash(gl_FragCoord.xy+fract(uTime)*7.)-.5)*.022;
gl_FragColor=vec4(clamp(col,0.,1.),1.);
}`;

const BANQ_DEF = { name: 'banquet', frag: BANQ_FRAG, uniforms: ['uRes', 'uTime', 'uSky', 'uCam', 'uLook', 'uOpt', 'uSunC', 'uHazeC', 'uGndC', 'uPar', 'uSkyK'] };

// The three skies. sun: where the sun sits across the plate (0..1); span: radians of azimuth the
// plate covers; top: radians of elevation it covers; az: where the sun stands, off the table's line.
const WORLDS = {
  sunset: { sky: 'assets/scenes/sky-sunset', mode: 0, sun: .28, span: 1.35, top: .62, az: -.15, hor: .972,
    sunC: [1, .62, .30], haze: [.93, .56, .34], gnd: [.20, .155, .125] },
  court: { sky: null, mode: 1, sun: .5, span: 1.4, top: .7, az: -.25, hor: .972,
    sunC: [.95, .70, .38], haze: [.12, .33, .46], gnd: [.045, .11, .17] },
  amber: { sky: 'assets/scenes/sky-amber', mode: 0, sun: .52, span: 1.5, top: .66, az: -.04, hor: .93,
    sunC: [1, .72, .26], haze: [.90, .56, .20], gnd: [.26, .17, .085] },
};
const skyUrl = (w, canvas) => w.sky ? w.sky + ((canvas.clientWidth || 800) * Math.min(window.devicePixelRatio || 1, DPR_CAP) < 900 ? '-1024.jpg' : '.jpg') : null;

/* The laid table. opts:
     world     'sunset' | 'court' | 'amber'
     ships     how many of the fleet are in the sky (0..9); beam: 0..1, the nearest one's light
     getP      ()=>0..1  how far the scene has come up the screen (drives the service and the crane)
     film      0..1      petrol on the plates
     reduced   bool
   Returns { kick, stop } or null. */
export function banquetGL(canvas, opts) {
  const world = WORLDS[opts.world || 'sunset'];
  let ptr = 0, ptrT = 0, born = 0, front = -1;
  const s = scene(canvas, BANQ_DEF, {
    still: !!opts.reduced,
    ready: () => !sky || sky.ready,
    onFirst: opts.onReady,
    draw(gl, U, t, w, h) {
      if (!born) born = t;
      const reduced = !!opts.reduced;
      const p = opts.getP ? opts.getP() : .5;
      const time = reduced ? 20 : t - born;
      ptr += (ptrT - ptr) * .05;
      // the service runs ahead of you down the table, and keeps a steady distance once it is out
      const want = reduced ? 6.5 : Math.min(1.2 + Math.max(p - .12, 0) * 26, 9.5);
      front = front < 0 ? (reduced ? want : Math.min(want, 2.5)) : front + (want - front) * .035;
      const ar = w / h;
      const F = ar > 1.3 ? 1.32 : 1.15;
      gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uTime, time);
      if (sky) { bind(sky, 0); gl.uniform1i(U.uSky, 0); } else { bind(BLANK, 0); gl.uniform1i(U.uSky, 0); }
      // travel, height, pitch, yaw
      gl.uniform4f(U.uCam, time * .10, .86 - (p - .5) * .16, .045 - (p - .5) * .06, (ar > 1.3 ? .26 : .19) + ptr * .012);
      gl.uniform4f(U.uLook, F, world.mode, world.sun, world.span);
      gl.uniform4f(U.uOpt, front, opts.ships == null ? 3 : opts.ships, opts.film || 0, opts.beam == null ? 1 : opts.beam);
      gl.uniform3fv(U.uSunC, world.sunC); gl.uniform3fv(U.uHazeC, world.haze); gl.uniform3fv(U.uGndC, world.gnd);
      gl.uniform2f(U.uPar, (p - .5) * -.03 + ptr * -.006, ptr * -.02 + (p - .5) * .05);
      gl.uniform4f(U.uSkyK, world.az, world.top, world.hor, ar > 1.3 ? -.98 : -.94);
    },
  });
  if (!s) return null;
  const url = skyUrl(world, canvas);
  const sky = url ? texture(url, () => s.kick()) : null;
  const host = opts.host || canvas;
  const mv = e => { const r = canvas.getBoundingClientRect(); ptrT = Math.max(-1, Math.min(1, ((e.clientX - r.left) / (r.width || 1) - .5) * 2)); };
  if (!opts.reduced) host.addEventListener('pointermove', mv, { passive: true });
  return { kick: s.kick, stop() { s.stop(); host.removeEventListener('pointermove', mv); } };
}

/* ───────────────────────────── THE PLACE SETTING (SP-1 and after) ─────────────────────────────
   A small analytic ray tracer. Camera sits low at the pass, seventeen degrees above the
   cloth. World: linen plane y=0, a plate of radius 1 on it, and a half-ellipsoid chrome
   cloche whose rim height is set per dish (scroll lowers it; nothing ever lifts it). In the
   hero Earth (r .40) rests in the well; everywhere else the plate is empty. The key light is
   the warming lamp, above and a little behind. The chrome reflects its world: the dining room
   (0), or the sky of one of the books (1 sunset, 2 the blue court, 3 amber smog).
   The menu card that stands at the plate is the real cover, as an <img> in the page under
   this canvas: the shader leaves a window for it, lights it, lays its shadow on the cloth and
   shows it again in the chrome and in the plate's glaze. */
const DISH_FRAG = `precision highp float;
uniform vec2 uRes;uniform float uTime;uniform vec4 uDish[3];uniform vec4 uOpt[3];uniform vec4 uSet[3];
uniform vec4 uCard[3];uniform vec4 uCardR[3];uniform vec4 uLook[3];
uniform vec2 uPtr;uniform float uPtrT;uniform vec4 uFade;uniform float uTurn;uniform vec4 uCr;uniform vec4 uWin;
uniform sampler2D uSky;uniform vec4 uSkyK;uniform sampler2D uT0;uniform sampler2D uT1;uniform sampler2D uT2;uniform vec3 uTint;
float gEarth;float gDraw;float gTurn;float gWorld;float gPlate;float gCloche;float gFilm;float gSteam;
float gGlow;float gKey;float gTex;float gSheen;vec2 gOff;vec4 gCard;vec4 gCardR;vec2 gC;float gU;
${NOISE}${NOISE3}
const float CD=9.;
const vec3 TA=vec3(0.,.80,0.);
const vec3 FW=vec3(0.,-.29552,-.95534);
const vec3 UP=vec3(0.,.95534,-.29552);
const vec3 L=vec3(-.602,.5015,.622);
const vec3 L2=vec3(.451,.551,-.702);
const vec3 LC=vec3(1.,.925,.80);
const vec3 EC=vec3(0.,.435,0.);
const float ER=.40;
const vec3 CS=vec3(.60,.82,.60);
const vec3 PORC=vec3(.961,.941,.902);
const vec3 GILT=vec3(.722,.537,.169);

float weave(vec2 q,float ax,float az){
vec2 u=q*34.;
u+=.4*vec2(noise(q*2.7),noise(q*2.7+7.));
vec2 i=floor(u),f=fract(u)-.5;
float chk=mod(i.x+i.y,2.);
float tx=cos(f.x*6.2832)*ax,ty=cos(f.y*6.2832)*az;
return mix(tx,ty,chk)*.6+(noise(u*vec2(.09,1.1))-.5)*ax+(noise(u*vec2(1.1,.09)+5.)-.5)*az;
}
vec3 iri(float t){t=fract(t);vec3 c1=vec3(.498,.710,.690),c2=vec3(.690,.561,.710),c3=vec3(.663,.690,.498);
return t<.3333?mix(c1,c2,t*3.):(t<.6666?mix(c2,c3,(t-.3333)*3.):mix(c3,c1,(t-.6666)*3.));}

// How much of the lamp the cloche hides from point p (0 none .. 1 all).
float shCloche(vec3 p,float yc){
vec3 o=(p-vec3(0.,yc,0.))/CS,d=L/CS;
float a=dot(d,d),b=dot(o,d),c=dot(o,o)-1.,h=b*b-a*c;
float dist=sqrt(max(dot(o,o)-b*b/a,0.));
float pen=.05+.30*max(yc-p.y,0.);
float cov=1.-smoothstep(1.-pen,1.+pen,dist);
float t2=(-b+sqrt(max(h,0.)))/a;
return cov*smoothstep(yc-.05,yc+.07,p.y+L.y*t2)*step(0.,t2)*gCloche;
}
// ... and how much the standing menu card hides.
float shCard(vec3 p){
if(gCard.w<=0.)return 0.;
float t=(gCard.y-p.z)/L.z;
if(t<=0.)return 0.;
vec3 q=p+L*t;
float pen=.014+.085*t;
return smoothstep(gCard.z+pen,gCard.z-pen,abs(q.x-gCard.x))*smoothstep(gCard.w+pen,gCard.w-pen*2.,q.y);
}
// What a ray sees of the card: the cover from the front, plain stock from behind.
vec4 cardSee(vec3 o,vec3 d){
if(gCard.w<=0.||abs(d.z)<1e-4)return vec4(0.);
float t=(gCard.y-o.z)/d.z;
if(t<=0.)return vec4(0.);
vec3 q=o+d*t;
vec2 uv=vec2((q.x-gCard.x)/(2.*gCard.z)+.5,1.-q.y/gCard.w);
if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.)return vec4(0.);
vec3 c=(gTex<.5)?texture2D(uT0,uv).rgb:((gTex<1.5)?texture2D(uT1,uv).rgb:texture2D(uT2,uv).rgb);
if(d.z>0.)c=vec3(.90,.87,.80);
return vec4(c,1.);
}

// What the chrome sees above the cloth. World 0 is the dining room: dim, tall windows to the
// left, the lamp overhead, a row of small warm lights along the far wall. The others are the
// rooms the three books open onto.
vec3 room(vec3 d){
float y=d.y,az=atan(d.x,d.z)+gTurn;az=mod(az+3.14159,6.28318)-3.14159;
vec3 c;
if(gWorld<.5){
c=mix(vec3(.78,.76,.72),vec3(.36,.36,.37),smoothstep(.0,.8,y));
c=mix(c,vec3(.17,.17,.18),smoothstep(.02,.09,y)*(1.-smoothstep(.11,.30,y))*.62);
float wy=smoothstep(.10,.16,y)*(1.-smoothstep(.62,.70,y));
float w1=smoothstep(.10,.04,abs(az+1.86)-.17),w2=smoothstep(.10,.04,abs(az+1.22)-.17),w3=smoothstep(.10,.04,abs(az+2.50)-.17);
float win=max(max(w1,w2),w3)*wy;
// the panes have glazing bars
win*=1.-.5*smoothstep(.012,.004,abs(y-.40))-.35*smoothstep(.012,.004,abs(y-.27));
c=mix(c,vec3(1.28,1.34,1.42),win);
float bz=fract((az-.3)*2.2)-.5;
float lights=smoothstep(.10,.03,length(vec2(bz*.45,y-.34)))*step(.2,az)*step(az,2.6);
c+=vec3(1.5,1.1,.62)*lights;
}else if(gWorld>1.5&&gWorld<2.5){
// the court: deep blue, brass lamps in tiers, a fall of oxblood cloth
c=mix(vec3(.105,.330,.470),vec3(.030,.095,.170),smoothstep(0.,.85,y));
c+=vec3(.08,.17,.22)*exp(-y*6.);
for(int i=0;i<4;i++){
float fi=float(i);float ty=.10+fi*.13;
float bz=fract(az*(3.4-fi*.4)+fi*.37)-.5;
c+=vec3(1.5,1.02,.46)*smoothstep(.07,.012,length(vec2(bz*.30,y-ty)))*(1.-fi*.18);
}
float dr=smoothstep(.34,.20,abs(az-1.25))*smoothstep(.04,.12,y);
c=mix(c,vec3(.43,.078,.137)*(.55+.45*sin(az*46.))*(1.1-.5*y),dr*.85);
}else{
float cs=cos(gTurn-.9),sn=sin(gTurn-.9);
vec3 e=vec3(cs*d.x-sn*d.z,max(d.y,0.),sn*d.x+cs*d.z);
vec2 q=e.xy/(abs(e.z)+.5);
float u=uSkyK.x+q.x*.46;u=abs(mod(u+1.,2.)-1.);
float v=1.-exp(-q.y*1.25);
c=texture2D(uSky,vec2(u,uSkyK.y-(uSkyK.y-.012)*v)).rgb;
c=mix(c,c*c*(1.5-.5*c),.45)*1.06;
}
c=mix(c,vec3(1.5,1.38,1.16),smoothstep(.930,.975,dot(d,L)));
c+=vec3(1.,.82,.52)*.30*smoothstep(.72,.95,dot(d,L));
return c;
}

// the brass key that runs round the second book's plate (and the hem of a certain robe)
float keyBand(float a,float v){
float u=fract(a*3.5014);
float k=step(.12,u)*step(u,.88)*step(.16,v)*step(v,.30);
k+=step(.12,u)*step(u,.24)*step(.16,v)*step(v,.84);
k+=step(.12,u)*step(u,.66)*step(.70,v)*step(v,.84);
k+=step(.54,u)*step(u,.66)*step(.42,v)*step(v,.84);
k+=step(.36,u)*step(u,.66)*step(.42,v)*step(v,.56);
return clamp(k,0.,1.);
}

// Everything lying on the cloth: linen, plate, gilt band, sauce, the shadows and the glaze.
vec3 ground(vec3 h,vec3 vd,float yc,float s,vec2 pt,float age,float px,float lod){
float r=length(h.xz);
vec2 dir=h.xz/max(r,1e-4);
float a=atan(h.x,h.z);
float aa=px*sqrt(dir.x*dir.x+dir.y*dir.y*11.45)+lod;
vec2 ld=vec2(-.6955,.7186);
float side=dot(dir,ld);
// linen
float vis=1.-smoothstep(0.,.02,lod);
float ax=smoothstep(.55,.20,px*34.),az=smoothstep(.55,.20,px*34.*3.38);
vec3 col=PORC*uTint*(1.+.030*weave(h.xz+gOff,ax,az)*vis);
col*=1.+.022*(fbm((h.xz+gOff)*.8+3.)-.5);
// where the cloth was pressed: one crease down, one across
vec2 sp=vec2(h.x*gU+gC.x,gC.y-(h.z*.2955+.764)*gU);
float cx=(mod(sp.x-uCr.x+uCr.z*.5,uCr.z)-uCr.z*.5)/gU;
float cz=(mod(sp.y-uCr.y+uCr.w*.5,uCr.w)-uCr.w*.5)/(gU*.2955);
col*=1.-.075*(cx/.045)*exp(-sq(cx/.045))*vis;
col*=1.-.060*(cz/.16)*exp(-sq(cz/.16))*vis;
// light from the tall windows lies across it: three panes and their bars
if(uWin.z>0.){
vec2 g=vec2((sp.x-uWin.x)/gU,-(sp.y-uWin.y)/(gU*.2955));
float wu=g.x*.50+g.y*.866,wv=g.x*.866-g.y*.50+uWin.w;
float soft=.10+.045*max(wv+2.,0.);
float uu=mod(wu+1.5,3.)-1.5;
float pane=smoothstep(.92+soft,.92-soft,abs(uu))*step(abs(wu),4.5);
float bar=1.-.65*smoothstep(.10+soft*.4,.03,abs(uu))-.5*smoothstep(.10+soft*.4,.03,abs(mod(wv+1.7,3.4)-1.7));
float len=smoothstep(-3.2,-2.,wv)*smoothstep(9.,4.,wv);
float pat=pane*max(bar,0.)*len;
col*=1.+uWin.z*(pat*1.25-.30)*vec3(1.,.985,.94);
}
float pool=exp(-dot(h.xz-vec2(-.1,.1),h.xz-vec2(-.1,.1))/4.2);
col*=mix(vec3(1.),vec3(1.034,1.020,.990),pool*(1.+gGlow));
float shC=shCloche(h,yc);
float shK=shCard(h);
// the plate's shadow and its foot on the cloth
vec2 so=h.xz-vec2(.055,-.057);
col*=1.-.30*(1.-smoothstep(.93,1.10,length(so)))*gPlate;
col*=1.-.13*exp(-max(r-1.,0.)*7.)*gPlate;
col*=1.-shC*(.045+.13*s*s);
col*=mix(vec3(1.),vec3(.70,.71,.76),shK*.62);
// the card stands on the cloth: a line of dark at its foot
if(gCard.w>0.){
float dz=h.z-gCard.y;
col*=1.-.42*exp(-abs(dz)*11.)*smoothstep(gCard.z+.10,gCard.z-.04,abs(h.x-gCard.x));
}
float wall=smoothstep(1.,1.+aa,r)*(1.-smoothstep(1.035-aa,1.035+aa,r-.012*dir.y))*smoothstep(-.25,.5,dir.y);
col=mix(col,PORC*mix(.80,.94,.5-.5*dir.x)*vec3(1.,.985,.96),wall*.9*gPlate);
if(gPlate>.5&&r<1.+aa*2.){
float inP=1.-smoothstep(1.-aa,1.+aa,r);
vec3 pl=vec3(.978,.964,.938);
float rim=smoothstep(.72,.78,r);
vec3 nr=normalize(vec3(-dir.x*.42*rim,1.,-dir.y*.42*rim));
pl*=.74+.26*dot(nr,L)/.5015;
// the step down into the well
float lip=exp(-sq((r-.745)/.020));
pl-=vec3(.10,.10,.105)*lip*smoothstep(-.3,.9,side);
pl+=vec3(.05)*lip*smoothstep(-.1,.9,-side);
pl*=1.-.05*smoothstep(.10,.74,r)*(1.-rim);
// lamp on the glaze
vec3 m=reflect(vd,nr);
float sp2=pow(max(dot(m,L2),0.),38.);
pl+=vec3(.92,.96,1.)*sp2*(.60*rim+.06);
pl+=max(room(m)-.85,0.)*.16*rim;
// gilt band, or the brass key
vec3 g=GILT*(.62+.55*dot(nr,L))+vec3(1.,.86,.55)*pow(max(dot(m,L2),0.),14.)*1.5+vec3(.9,.78,.5)*.16*pow(.5+.5*sin(a*2.+.6),4.);
if(gKey>.5){
float b0=.842,b1=.958;
float inB=smoothstep(b0-aa,b0+aa,r)*(1.-smoothstep(b1-aa,b1+aa,r));
float kv=(r-b0)/(b1-b0);
float edge=max(smoothstep(.10,.04,kv),smoothstep(.90,.96,kv));
float k=max(keyBand(a,kv),edge)*vis;
vec3 brass=vec3(.604,.482,.176)*(.72+.6*dot(nr,L))+vec3(1.,.86,.55)*pow(max(dot(m,L2),0.),14.)*1.2;
pl=mix(pl,brass,inB*mix(.5,1.,vis)*mix(.55,1.,k)*k);
}else{
float band=smoothstep(.918-aa,.918+aa,r)*(1.-smoothstep(.950-aa,.950+aa,r));
pl=mix(pl,g,band*.94);
}
float hair=smoothstep(.700-aa,.700+aa,r)*(1.-smoothstep(.707-aa,.707+aa,r));
pl=mix(pl,GILT*.95,hair*.55*vis);
pl+=vec3(.05)*smoothstep(.972,.996,r);
if(gEarth>.5){
// the sauce: one spoonful drawn round the dish, then three beads of jus
float A0=-2.72,A1=-.18;
float aE=mix(A0,A1,gDraw);
float u=clamp((a-A0)/(A1-A0),0.,1.);
float r0=.560+.022*sin(a*1.7+.4);
float w=mix(.082,.010,pow(u,.85))*(1.+.30*(noise(vec2(a*6.,2.))-.5));
float dR=abs(r-r0);
float msk=(1.-smoothstep(w-aa*1.4,w+aa*1.4,dR))*smoothstep(A0-.03,A0+.03,a)*(1.-smoothstep(aE-.10,aE+.01,a));
vec2 hd=r0*vec2(sin(A0),cos(A0));
float blob=1.-smoothstep(.090-aa,.090+aa,distance(h.xz,hd+vec2(.01,.0)));
blob*=step(.001,gDraw);
float hgt=clamp(max(1.-dR/max(w,1e-3),0.)*msk,0.,1.);
hgt=max(hgt,blob*clamp(1.-distance(h.xz,hd)/.09,0.,1.));
msk=max(msk,blob);
if(msk>0.){
float rp=sin(distance(h.xz,pt)*34.-age*5.)*exp(-distance(h.xz,pt)*4.5)*exp(-age*1.15);
float f=fbm(vec2(a*6.5-uTime*.035,r*24.)+rp*.6);
vec3 sc=mix(vec3(.972,.918,.735),vec3(.86,.66,.26),smoothstep(.42,.72,f)*.80);
sc=mix(sc,vec3(.66,.44,.13),smoothstep(.70,.80,f)*.55);
sc*=.80+.26*sqrt(hgt);
sc-=vec3(.14,.13,.09)*smoothstep(.40,0.,hgt);
sc+=LC*(.30*smoothstep(.50,.95,hgt)*(.45+.55*sin(a*11.+f*7.))+rp*.10);
pl=mix(pl,sc,msk);
}
for(int i=0;i<3;i++){
float fi=float(i);
float ai=1.95+fi*.34,ri=(.050-fi*.013)*smoothstep(.70+fi*.08,.82+fi*.08,gDraw);
vec2 ci=.560*vec2(sin(ai),cos(ai));
float dd=distance(h.xz,ci);
float md=1.-smoothstep(ri-aa,ri+aa,dd);
vec3 jc=vec3(.60,.36,.09)*(.75+.5*(1.-dd/max(ri,1e-3)));
jc+=LC*exp(-sq(distance(h.xz,ci+vec2(-.25,-.38)*ri)/(ri*.30+1e-3)))*.9;
pl=mix(pl,jc,md*step(.002,ri));
pl*=1.-.16*(1.-md)*(1.-smoothstep(ri,ri*1.9+.004,distance(h.xz,ci-vec2(-.012,-.018))))*step(.002,ri);
}
}
// the petrol film that comes in from the rim of the third book's plate
if(gFilm>0.){
float film=fbm(h.xz*3.1-vec2(uTime*.02,0.)+7.);
float w2=fbm(h.xz*2.1+vec2(uTime*.03,uTime*.012));
float front=1.04-gFilm*1.05;
float creep=smoothstep(front,front+.30,r+(film-.5)*.55);
float edge=smoothstep(.30,.66,film)*(1.-smoothstep(.72,.96,film));
pl=mix(pl,pl*.50+iri(film*2.7+w2*.8+uTime*.015)*.80,pow(edge,1.25)*creep*mix(.36,.70,smoothstep(.66,.80,r)));
float gh=hash(floor(h.xz*90.));
pl+=vec3(.95,.9,.65)*step(.992,gh)*pow(max(sin(uTime*1.2+gh*80.),0.),12.)*creep*.8*vis;
}
// palm ripple in the glaze
float dp=distance(h.xz,pt);
pl+=vec3(.030,.026,.018)*sin(dp*30.-age*5.)*exp(-dp*4.)*exp(-age*1.1)*vis;
// Earth's shadow, contact, and the cloche's
vec3 oc=EC-h;float tca=dot(oc,L);
float d2=length(oc-L*tca);
float shE=(1.-smoothstep(ER*.70,ER*1.16,d2))*step(0.,tca)*gEarth;
float ao=exp(-sq(r/.27))*gEarth;
float sh=1.-(1.-shE*.42)*(1.-shC*(.30+.14*s))*(1.-ao*.45)*(1.-shK*.30);
pl=mix(pl,pl*vec3(.56,.57,.62),sh);
// what the glaze mirrors: the dish, the lid as it comes down, and the card behind
if(lod<.001){
vec3 mr=vec3(vd.x,-vd.y,vd.z);
float fres=.045+.95*pow(clamp(1.-mr.y,0.,1.),5.);
vec4 ks=cardSee(h,mr);
pl=mix(pl,ks.rgb,ks.a*clamp(fres*1.9,0.,.5)*(1.-.5*rim));
vec3 o2=h-EC;float b2=dot(o2,mr);
float dE=sqrt(max(dot(o2,o2)-b2*b2,0.));
float cE=(1.-smoothstep(ER-.07,ER+.03,dE))*step(b2,0.)*gEarth;
pl=mix(pl,vec3(.10,.24,.36),cE*fres*.85*(1.-shC*.6));
vec3 o3=(h-vec3(0.,yc,0.))/CS,d3=mr/CS;
float a3=dot(d3,d3),b3=dot(o3,d3),c3=dot(o3,o3)-1.,h3=b3*b3-a3*c3;
if(h3>0.&&gCloche>.5){
float t3=(-b3-sqrt(h3))/a3;
float y3=h.y+mr.y*t3;
float cC=smoothstep(yc-.02,yc+.03,y3)*smoothstep(0.,.06,sqrt(h3)/a3)*step(0.,t3);
pl=mix(pl,mix(vec3(.80,.81,.82),room(vec3(mr.x,.55,mr.z))*.8,step(.5,gWorld)),cC*fres*.70);
}
}
col=mix(col,pl,inP);
}
return col;
}

vec3 earth(vec3 pos,vec3 rd,float yc){
vec3 n=(pos-EC)/ER;
float spin=uTime*.030+2.2;
vec3 q=vec3(.9205*n.x+.3907*n.y,-.3907*n.x+.9205*n.y,n.z);
float cs=cos(spin),sn=sin(spin);
q=vec3(cs*q.x+sn*q.z,q.y,-sn*q.x+cs*q.z);
float f=fbm3(q*1.75+7.3);
float f2=fbm3(q*5.2+2.1);
float lv=f+(f2-.5)*.17;
float land=smoothstep(.505,.535,lv);
vec3 ocean=mix(vec3(.030,.150,.330),vec3(.095,.400,.540),smoothstep(.38,.515,lv));
vec3 terra=mix(vec3(.25,.33,.15),vec3(.74,.58,.33),smoothstep(.36,.66,f2+(1.-abs(q.y))*.14));
terra=mix(terra,vec3(.50,.39,.25),smoothstep(.57,.66,lv)*.6);
vec3 c=mix(ocean,terra,land);
c=mix(c,vec3(.94,.96,.97),smoothstep(.80,.90,abs(q.y)+(f2-.5)*.22));
float cl=fbm3(q*3.0+vec3(uTime*.012,0.,uTime*.008)+31.);
float cloud=smoothstep(.53,.72,cl);
c=mix(c,vec3(.985,.98,.97),cloud*.90);
float shC=shCloche(pos,yc);
float diff=max(dot(n,L),0.);
float lit=diff*(1.-shC*.82);
vec3 col=c*LC*(1.25*lit);
col+=c*vec3(.78,.86,1.)*(.30+.20*max(n.z,0.));
col+=c*vec3(1.,.93,.80)*.34*max(-n.y,0.)*(1.-shC*.5);
vec3 hv=normalize(L-rd);
col+=LC*pow(max(dot(n,hv),0.),70.)*.75*(1.-land*.85)*(1.-cloud)*(1.-shC);
float fr=pow(clamp(1.-dot(n,-rd),0.,1.),2.4);
col+=vec3(.40,.60,.92)*fr*(.20+.70*lit);
return col;
}

vec3 chrome(vec3 pos,vec3 n,vec3 rd,float yc,float s,vec2 pt,float age,vec3 tint){
vec3 rr=reflect(rd,n);
vec3 c=room(vec3(rr.x,max(rr.y,0.),rr.z));
if(rr.y<.04){
vec3 g=pos+rr*(-pos.y/min(rr.y,-.002));
vec3 gc=ground(g,rr,yc,s,pt,age,.012,.022);
gc=mix(gc,vec3(.78,.74,.68),smoothstep(3.,11.,length(g.xz)));
c=mix(c,gc,smoothstep(.04,-.03,rr.y));
}
vec4 ks=cardSee(pos,rr);
c=mix(c,ks.rgb*.80,ks.a);
float fr=pow(clamp(1.-dot(n,-rd),0.,1.),3.);
c=mix(c*tint,vec3(.42,.44,.47)*tint,fr*.55);
if(gFilm>0.){
// the film climbs the silver too
float hg=(pos.y-yc)/CS.y;
float fm=fbm(vec2(atan(n.x,n.z)*2.4,hg*4.2)+vec2(uTime*.015,-uTime*.02));
float creep=smoothstep(gFilm*1.15,gFilm*1.15-.40,hg+(fm-.5)*.6);
c=mix(c,c*.62+iri(fm*2.6+dot(n,-rd)*1.3+uTime*.012)*.52,creep*smoothstep(.28,.62,fm)*.80);
}
return c;
}

void main(){
vec4 D=uDish[0];vec4 O=uOpt[0];vec4 T=uSet[0];vec4 K=uLook[0];gCard=uCard[0];gCardR=uCardR[0];float best=1e9;
for(int i=0;i<3;i++){
vec4 d=uDish[i];
if(d.z>0.){float m=length((gl_FragCoord.xy-d.xy)/d.z*vec2(1.,1.25));if(m<best){best=m;D=d;O=uOpt[i];T=uSet[i];K=uLook[i];gCard=uCard[i];gCardR=uCardR[i];}}
}
vec2 uC=D.xy;float uU=D.z;gC=uC;gU=uU;
gEarth=O.x;gDraw=O.y;gTurn=O.z+uTurn;gWorld=O.w;
gPlate=T.x;gCloche=T.y;gFilm=T.z;gSteam=T.w;
gGlow=K.x;gKey=K.y;gTex=K.z;gSheen=K.w;
gOff=vec2(uC.x/uU,-uC.y/(uU*.2955));
vec2 p=(gl_FragCoord.xy-uC)/uU;
vec3 ro=TA-FW*CD;
vec3 rd=normalize(FW*CD+vec3(p.x,0.,0.)+UP*p.y);
float px=1./uU;
float s=D.w*D.w*(3.-2.*D.w);
float yc=mix(1.10,.046,s);
vec2 pp=(uPtr-uC)/uU;
vec3 prd=normalize(FW*CD+vec3(pp.x,0.,0.)+UP*pp.y);
vec2 pt=(ro-prd*(ro.y/prd.y)).xz;
float age=(uPtrT<-5.)?60.:max(uTime-uPtrT,0.);
float t0=-ro.y/rd.y;
vec3 h=ro+rd*t0;
vec3 col=ground(h,rd,yc,s,pt,age,px*(t0/CD),0.);
// the menu card is the page's own image, underneath: a window is left for it and lit
float hole=0.;vec3 add=vec3(0.);
if(gCardR.z>0.){
vec2 e=gl_FragCoord.xy-gCardR.xy;
vec2 dq=abs(e)-gCardR.zw;
hole=clamp(.5-max(dq.x,dq.y),0.,1.);
vec2 l=e/gCardR.w;
float sv=dot(l,vec2(.62,.78))-gSheen;
add=LC*(.11*exp(-sv*sv*5.)+.05*exp(-sv*sv*60.))+vec3(.055,.04,.01)*gGlow;
// a card has an edge: lit on the lamp's side, dark on the other
float th=max(uU*.0075,1.2);
float inY=step(abs(e.y),gCardR.w+th*.5);
float eL=step(-gCardR.z-th,e.x)*step(e.x,-gCardR.z)*inY;
float eR=step(gCardR.z,e.x)*step(e.x,gCardR.z+th)*inY;
float eT=step(gCardR.w,e.y)*step(e.y,gCardR.w+th*.8)*step(abs(e.x),gCardR.z+th);
col=mix(col,vec3(1.,.985,.94),max(eL,eT));
col=mix(col,vec3(.47,.43,.38),eR*(1.-eT));
// and a little silver stand at its foot
vec2 hb=vec2(gCardR.z*.52,uU*.036);
vec2 he=e-vec2(0.,-gCardR.w+hb.y*.15);
float hd=length(max(abs(he)-hb+hb.y,0.))-hb.y;
float hin=clamp(.5-hd,0.,1.);
if(hin>0.){
float v=clamp(he.y/hb.y,-1.,1.);
vec3 hn=normalize(vec3(he.x/hb.x*.25,.55+.6*v,.75-.5*v));
vec3 hc=room(vec3(hn.x,max(hn.y,0.),hn.z))*vec3(.93,.945,.96);
hc*=.55+.45*smoothstep(-1.,-.2,v);
col=mix(col,hc,hin);hole*=1.-hin;
}
}
// Earth
if(gEarth>.5){
vec3 oc=ro-EC;float b=dot(oc,rd);float c=dot(oc,oc)-ER*ER;
float dE=sqrt(max(dot(oc,oc)-b*b,0.));
float covE=clamp((ER-dE)/px+.5,0.,1.);
if(covE>0.){
vec3 pos=ro+rd*(-b-sqrt(max(b*b-c,0.)));
col=mix(col,earth(pos,rd,yc),covE);hole*=1.-covE;
}
}
if(gCloche>.5){
// cloche
vec3 cc=vec3(0.,yc,0.);
vec3 o=(ro-cc)/CS,dd=rd/CS;
float a2=dot(dd,dd),b2=dot(o,dd),c2=dot(o,o)-1.,h2=b2*b2-a2*c2;
float dC=sqrt(max(dot(o,o)-b2*b2/a2,0.));
float covC=clamp((1.-dC)*CS.x/px+.5,0.,1.);
if(covC>0.){
vec3 pos=ro+rd*((-b2-sqrt(max(h2,0.)))/a2);
float hg=pos.y-yc;
float covY=clamp(hg/(px*1.15)+.5,0.,1.);
if(covY>0.){
vec3 n=normalize((pos-cc)/(CS*CS));
float lipz=smoothstep(.070,.0,hg);
n=normalize(n+vec3(0.,1.,0.)*(.55*sin(lipz*3.1416)-.25*lipz));
vec3 ch=chrome(pos,n,rd,yc,s,pt,age,vec3(.93,.945,.96));
ch*=1.-.30*smoothstep(.060,.045,hg)*smoothstep(.030,.043,hg);
col=mix(col,ch,covC*covY);hole*=1.-covC*covY;
}
}
// handle: collar, then a gilt ball
vec3 kc=cc+vec3(0.,CS.y+.008,0.);
vec3 ks=vec3(.082,.040,.082);
vec3 ko=(ro-kc)/ks,kd=rd/ks;
float ka=dot(kd,kd),kb=dot(ko,kd),kq=dot(ko,ko)-1.;
float kD=sqrt(max(dot(ko,ko)-kb*kb/ka,0.));
float covK=clamp((1.-kD)*ks.y/px+.5,0.,1.);
if(covK>0.){
vec3 pos=ro+rd*((-kb-sqrt(max(kb*kb-ka*kq,0.)))/ka);
vec3 n=normalize((pos-kc)/(ks*ks));
col=mix(col,chrome(pos,n,rd,yc,s,pt,age,vec3(.93,.945,.96)),covK);hole*=1.-covK;
}
vec3 bc=cc+vec3(0.,CS.y+.098,0.);
float br=.070;
vec3 bo=ro-bc;float bb=dot(bo,rd);float bq=dot(bo,bo)-br*br;
float bD=sqrt(max(dot(bo,bo)-bb*bb,0.));
float covB=clamp((br-bD)/px+.5,0.,1.);
if(covB>0.){
vec3 pos=ro+rd*(-bb-sqrt(max(bb*bb-bq,0.)));
vec3 n=(pos-bc)/br;
col=mix(col,chrome(pos,n,rd,yc,s,pt,age,vec3(1.,.80,.44)),covB);hole*=1.-covB;
}
}
// a thread of steam finds its way out from under the rim
if(gSteam>0.){
vec2 e=vec2(p.x,p.y+.70);
float st=fbm(vec2(e.x*2.1+sin(e.y*2.2+uTime*.25)*.22,e.y*1.25-uTime*.13)+fbm(e*2.6-uTime*.04)*1.2);
float mk=smoothstep(-.02,.30,e.y)*exp(-e.y*.62)*exp(-sq(e.x/(.50+.34*e.y)));
st=smoothstep(.46,.88,st)*mk*gSteam;
col+=vec3(1.,.985,.96)*st*.16;add+=vec3(1.,.985,.96)*st*.16;
}
col+=(hash(gl_FragCoord.xy+fract(uTime)*7.)-.5)*.012;
vec2 fc=gl_FragCoord.xy;
float al=smoothstep(0.,uFade.x,fc.x)*smoothstep(0.,uFade.y,fc.y)*smoothstep(0.,uFade.z,uRes.x-fc.x)*smoothstep(0.,uFade.w,uRes.y-fc.y);
// premultiplied, and strictly so (Safari's 2D canvas corrupts colour brighter than its alpha):
// over the card the lamp's sheen is a thin wash of warm white, not added light
float wash=clamp(max(add.r,max(add.g,add.b)),0.,.5)*hole;
float oa=(1.-hole)+wash;
vec3 oc=clamp(col,0.,1.)*(1.-hole)+vec3(1.,.975,.92)*wash;
gl_FragColor=vec4(min(oc,vec3(oa)),oa)*al;
}`;

const DISH_DEF = { name: 'dish', frag: DISH_FRAG, uniforms: ['uRes', 'uTime', 'uDish', 'uOpt', 'uSet', 'uCard', 'uCardR', 'uLook', 'uPtr', 'uPtrT', 'uFade', 'uTurn', 'uCr', 'uWin', 'uSky', 'uSkyK', 'uT0', 'uT1', 'uT2', 'uTint'] };
const WORLD_ID = { room: 0, sunset: 1, court: 2, amber: 3 };

// The dish camera, in script: where a point of the page lies on the cloth, and back.
const CAM = { CD: 9, TA: [0, .8, 0], FW: [0, -.29552, -.95534], UP: [0, .95534, -.29552] };
const camRo = [0, .8 + .29552 * 9, .95534 * 9];
function clothAt(px, py) {           // screen (in units, y up, from the dish centre) → point on the cloth
  const d = [px, CAM.FW[1] * 9 + CAM.UP[1] * py, CAM.FW[2] * 9 + CAM.UP[2] * py];
  const t = -camRo[1] / d[1];
  return [camRo[0] + d[0] * t, 0, camRo[2] + d[2] * t];
}
function screenOf(w) {               // world → screen units
  const v = [w[0] - camRo[0], w[1] - camRo[1], w[2] - camRo[2]];
  const dep = v[1] * CAM.FW[1] + v[2] * CAM.FW[2];
  return [v[0] * 9 / dep, (v[1] * CAM.UP[1] + v[2] * CAM.UP[2]) * 9 / dep];
}
const val = (v, d) => (typeof v === 'function' ? v() : (v == null ? d : v));

/* The place setting. opts:
     dishes   [{ box, earth, turn, world, plate, cloche, lid, film, steam, key, card, glow }] up to three.
              box     element the plate and its lid are fitted to (or none: the card alone)
              world   'room' | 'sunset' | 'court' | 'amber'  what the chrome reflects
              lid     number or ()=>0..1: 0 in the air, 1 down on the plate
              card    element (holding an <img>): the standing menu card, drawn by the page
     getScroll ()=>0..1   lowers an Earth dish's cloche
     getTurn  ()=>radians the room slides across the silver as the page moves
     getSheen ()=>number  where the lamp's sheen lies across the cards
     fade     [l,b,r,t]   fraction of the canvas over which each edge dissolves into the page
     crease   [x,y,px,py] where the cloth's pressed creases run, as fractions of the canvas
     window   [x,y,k]     where the window light falls (fractions), and how strong
     reduced  bool        one settled frame
   Returns { kick, stop, glow(i,v) } or null (no WebGL). */
export function dishGL(canvas, opts) {
  const reduced = !!opts.reduced;
  const dishes = (opts.dishes || []).slice(0, 3);
  const fade = opts.fade || [0, 0, 0, 0];
  const crease = opts.crease || [.5, .5, 4, 4];
  const win = opts.window || [.3, .6, 0];
  // the cloth takes the page's own ground (each book's page is a different linen)
  const tint = (opts.ground || [.961, .941, .902]).map((v, i) => v / [.961, .941, .902][i]);
  const glowT = [0, 0, 0], glow = [0, 0, 0];
  let px = -9999, py = -9999, tx = px, ty = py, ptrT = -10, lastMove = 0, rest = true, born = 0, turn = 0;
  const host = opts.host || canvas.parentElement || canvas;
  const at = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, r.height - (e.clientY - r.top)]; };
  const dv = new Float32Array(12), ov = new Float32Array(12), sv = new Float32Array(12), cv = new Float32Array(12), rv = new Float32Array(12), lv = new Float32Array(12);
  const worldName = (dishes.filter(d => d.world && WORLDS[d.world] && WORLDS[d.world].sky)[0] || {}).world;
  let sky = null;
  const texs = [];
  const S = scene(canvas, DISH_DEF, {
    still: reduced,
    ready: () => (!sky || sky.ready) && texs.every(t => !t || t.ready),
    onFirst: opts.onReady,
    draw(gl, U, t, w, h, dpr) {
      if (!born) born = t;
      let time = t, scroll = opts.getScroll ? opts.getScroll() : 0, draw = Math.min((t - born - .4) / 5.5, 1);
      draw = draw <= 0 ? 0 : draw * draw * (3 - 2 * draw);
      if (reduced) { time = 8; scroll = opts.getScroll ? (opts.stillScroll == null ? .34 : opts.stillScroll) : 0; draw = 1; ptrT = -10; for (let i = 0; i < 3; i++) glow[i] = glowT[i]; }
      else {
        px += (tx - px) * .09; py += (ty - py) * .09;
        if (!rest && lastMove && performance.now() - lastMove > 240) { rest = true; ptrT = t; } // the ripple blooms where the palm rests
        // the room slides a little across the silver as the pointer and the page move
        const want = (px > -9000 ? (px / (canvas.clientWidth || 1) - .5) * .5 : 0) + (opts.getTurn ? opts.getTurn() : 0);
        turn += (want - turn) * .06;
        for (let i = 0; i < 3; i++) glow[i] += (glowT[i] - glow[i]) * .08;
      }
      const cr = canvas.getBoundingClientRect();
      const sheen = (opts.getSheen ? opts.getSheen() : 0) + (px > -9000 ? (px / (canvas.clientWidth || 1) - .5) * 1.1 : 0);
      dv.fill(0); cv.fill(0); rv.fill(0);
      dishes.forEach((d, i) => {
        const k = d.card ? d.card.getBoundingClientRect() : null;
        let cx, cy, unit;
        if (d.box) {
          const br = d.box.getBoundingClientRect();
          // an uncovered dish with its lid in the air is 2.62 units tall; a covered one, 1.58
          const tall = d.tall || (d.earth ? 2.62 : 1.58), lift = d.lift == null ? (d.earth ? -.01 : .48) : d.lift;
          unit = Math.min(br.width / 2.24, br.height / tall);
          cx = br.left - cr.left + br.width / 2;
          cy = cr.bottom - (br.top + br.height / 2) + unit * lift;
        } else if (k) {
          // the card alone: it stands on the cloth a little behind the middle of its own setting
          unit = k.height / 2.3;
          cx = k.left - cr.left + k.width / 2;
          cy = cr.bottom - k.bottom + unit * .70;
        } else return;
        dv[i * 4] = cx * dpr; dv[i * 4 + 1] = cy * dpr; dv[i * 4 + 2] = unit * dpr;
        dv[i * 4 + 3] = d.earth ? scroll : (reduced && d.lidStill != null ? d.lidStill : val(d.lid, 1));
        ov[i * 4] = d.earth ? 1 : 0; ov[i * 4 + 1] = d.earth ? draw : 0; ov[i * 4 + 2] = d.turn || 0; ov[i * 4 + 3] = WORLD_ID[d.world || 'room'] || 0;
        sv[i * 4] = d.box && d.plate !== false ? 1 : 0; sv[i * 4 + 1] = d.box && d.cloche !== false ? 1 : 0;
        sv[i * 4 + 2] = reduced && d.film ? .7 : val(d.film, 0); sv[i * 4 + 3] = (d.steam || 0) * (reduced ? .7 : 1);
        lv[i * 4] = glow[i]; lv[i * 4 + 1] = d.key ? 1 : 0; lv[i * 4 + 2] = i; lv[i * 4 + 3] = sheen;
        if (k) {
          const bx = (k.left - cr.left + k.width / 2 - cx) / unit, by = (cr.bottom - k.bottom - cy) / unit, ty2 = (cr.bottom - k.top - cy) / unit;
          const foot = clothAt(bx, by), f0 = screenOf(foot), f1 = screenOf([foot[0] + 1, 0, foot[2]]);
          const scale = f1[0] - f0[0];
          let H = (ty2 - by) / (scale * .955);
          for (let n = 0; n < 4; n++) { const top = screenOf([foot[0], H, foot[2]]); H *= (ty2 - by) / Math.max(top[1] - f0[1], 1e-3); }
          cv[i * 4] = foot[0]; cv[i * 4 + 1] = foot[2]; cv[i * 4 + 2] = (k.width / 2 / unit) / scale; cv[i * 4 + 3] = H;
          rv[i * 4] = (k.left - cr.left + k.width / 2) * dpr; rv[i * 4 + 1] = (cr.bottom - (k.top + k.height / 2)) * dpr;
          rv[i * 4 + 2] = k.width / 2 * dpr; rv[i * 4 + 3] = k.height / 2 * dpr;
        }
      });
      gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uTime, time);
      gl.uniform4fv(U.uDish, dv); gl.uniform4fv(U.uOpt, ov); gl.uniform4fv(U.uSet, sv);
      gl.uniform4fv(U.uCard, cv); gl.uniform4fv(U.uCardR, rv); gl.uniform4fv(U.uLook, lv);
      gl.uniform2f(U.uPtr, px * dpr, py * dpr); gl.uniform1f(U.uPtrT, ptrT);
      gl.uniform4f(U.uFade, Math.max(fade[0] * w, .001), Math.max(fade[1] * h, .001), Math.max(fade[2] * w, .001), Math.max(fade[3] * h, .001));
      gl.uniform1f(U.uTurn, turn);
      gl.uniform4f(U.uCr, crease[0] * w, crease[1] * h, crease[2] * w, crease[3] * h);
      gl.uniform4f(U.uWin, win[0] * w, win[1] * h, win[2], opts.getSlide ? opts.getSlide() : 0);
      bind(sky || BLANK, 0); gl.uniform1i(U.uSky, 0);
      const W0 = worldName ? WORLDS[worldName] : null;
      gl.uniform4f(U.uSkyK, W0 ? W0.sun : .5, W0 ? W0.hor : .97, 0, 0);
      for (let i = 0; i < 3; i++) { bind(texs[i] || BLANK, i + 1); }
      gl.uniform1i(U.uT0, 1); gl.uniform1i(U.uT1, 2); gl.uniform1i(U.uT2, 3);
      gl.uniform3f(U.uTint, tint[0], tint[1], tint[2]);
    },
  });
  if (!S) return null;
  if (worldName) sky = texture(skyUrl(WORLDS[worldName], canvas).replace('.jpg', '').replace('-1024', '') + '-1024.jpg', () => S.kick());
  dishes.forEach((d, i) => {
    const img = d.card && (d.card.tagName === 'IMG' ? d.card : d.card.querySelector('img'));
    if (img) texs[i] = texture(img.currentSrc || img.src, () => S.kick());
  });
  const mv = e => { const u = at(e); tx = u[0]; ty = u[1]; if (px < -9000) { px = tx; py = ty; } lastMove = performance.now(); rest = false; if (reduced) S.kick(); };
  const dn = e => { const u = at(e); tx = px = u[0]; ty = py = u[1]; ptrT = performance.now() / 1000; lastMove = performance.now(); };
  host.addEventListener('pointermove', mv, { passive: true });
  host.addEventListener('pointerdown', dn, { passive: true });
  return {
    kick: S.kick,
    glow(i, v) { glowT[i] = v; S.kick(); },
    stop() { S.stop(); host.removeEventListener('pointermove', mv); host.removeEventListener('pointerdown', dn); },
  };
}

/* ───────────────────────────── SP-4 · LOOMIS, 9:14 P.M. ─────────────────────────────
   The sky over the Terminal Diner, the far shore, the Superfund lake (the colour of a
   traffic cone) and the lid coming down, mirrored in the water; mist on the water and the
   sign's red hanging in it. The diner, the lot and the man with the trash bag are drawn in
   the markup, in front of this. */
const DINER_FRAG = `precision highp float;
uniform vec2 uRes;uniform float uTime;uniform float uDpr;
uniform float uHor;uniform float uLot;uniform vec4 uLid;uniform float uNeon;uniform vec4 uSign;
${NOISE}
vec3 skyAt(vec2 p){
float sy=clamp((p.y-uHor)/max(uRes.y-uHor,1.),0.,1.);
float x=p.x/uRes.x;
vec3 c=mix(vec3(.170,.305,.320),vec3(.028,.070,.086),pow(sy,.60));
c+=vec3(.62,.34,.12)*.30*exp(-sy*6.5)*(.55+.45*exp(-sq((x-.80)*2.4)));
float cl=fbm(vec2(x*3.2+uTime*.004,sy*10.-x*1.5));
c+=vec3(.085,.11,.115)*smoothstep(.48,.80,cl)*(1.-sy*.7);
c+=vec3(.22,.11,.04)*smoothstep(.55,.85,cl)*exp(-sy*4.)*.5;
return c;
}
vec4 lidAt(vec2 p){
vec2 d=p-uLid.xy;float R=uLid.z,H=uLid.w;
float aa=1.2*uDpr;
vec2 e=d/vec2(R,H);float k=length(e);
float dome=(1.-smoothstep(1.-aa/R,1.+aa/R,k))*step(0.,d.y);
float rr=R*.115;
vec2 e2=d/vec2(R,rr);float k2=length(e2);
float under=1.-smoothstep(1.-aa/rr,1.+aa/rr,k2);
vec3 c=vec3(0.);float cov=0.;
if(dome>0.){
vec3 n=vec3(e.x,e.y,sqrt(max(1.-k*k,0.)));
// a mirror the size of a hotel, at night: the sky it hides, the horizon bent round it,
// and along its foot whatever is lit behind us — the lot lamp, the windows, the sign
float ry=2.*n.z*n.y,rx=2.*n.z*n.x;
vec3 env=mix(vec3(.215,.360,.375),vec3(.040,.090,.112),smoothstep(.0,.95,ry));
env=mix(env,vec3(.050,.082,.088),smoothstep(.10,.02,ry)*.9);
env+=vec3(1.,.60,.26)*.62*exp(-sq((ry-.105)/.045))*(.55+.45*n.z);
env+=vec3(1.,.93,.78)*(1.5*exp(-(sq((rx+.46)/.040)+sq((ry-.055)/.030)))+.16*exp(-sq((rx+.46)/.022))*smoothstep(.75,.05,ry));
env+=vec3(1.,.74,.38)*.55*exp(-(sq((rx-.24)/.13)+sq((ry-.022)/.013)));
env+=vec3(1.,.15,.11)*uNeon*1.0*exp(-(sq((rx-.20)/.10)+sq((ry-.058)/.016)));
env+=vec3(.34,.48,.52)*.42*exp(-(sq((n.x+.40)/.20)+sq((n.y-.60)/.19)));
env+=vec3(.30,.42,.45)*.16*exp(-sq((n.x-.52)/.07))*smoothstep(.15,.5,n.y)*(1.-smoothstep(.6,.9,n.y));
float fr=pow(clamp(1.-n.z,0.,1.),2.2);
env=mix(env,vec3(.40,.57,.60),fr*.78);
env*=1.-.45*smoothstep(.045,.0,n.y);
c=env;cov=dome;
}
if(under>0.){
vec3 u=mix(vec3(.018,.036,.046),vec3(.09,.15,.16),smoothstep(1.,.15,k2));
u+=vec3(.9,.96,1.)*.55*exp(-k2*k2*10.);
float ang=atan(e2.y,e2.x);
float ring=exp(-sq((k2-.80)/.07));
float bulbs=pow(.5+.5*cos(ang*26.),10.)*(.65+.35*sin(uTime*1.3+ang*7.));
u+=vec3(1.,.93,.78)*ring*bulbs*1.4;
u+=vec3(.75,.80,.82)*.5*smoothstep(.90,1.,k2);
c=mix(c,u,under);cov=max(cov,under);
}
// the handle
vec2 kd=(d-vec2(0.,H+R*.055))/(R*.062);
float kn=1.-smoothstep(1.-aa/(R*.062),1.+aa/(R*.062),length(kd));
if(kn>0.){vec3 kc=mix(vec3(.55,.36,.14),vec3(.10,.17,.18),smoothstep(-.4,.6,kd.y));kc+=vec3(.9,.8,.6)*.5*exp(-dot(kd-vec2(-.35,.3),kd-vec2(-.35,.3))*6.);c=mix(c,kc,kn);cov=max(cov,kn);}
return vec4(c,cov);
}
vec3 above(vec2 p){
vec3 c=skyAt(p);
vec2 d=p-uLid.xy;
float fall=clamp(-d.y/max(uLid.y-uHor,1.),0.,1.);
float bw=uLid.z*(.11+.16*fall);
c+=vec3(.72,.86,.90)*exp(-sq(d.x/bw))*step(d.y,0.)*(.115-.06*fall);
c+=vec3(.55,.68,.70)*.12*exp(-length(d/vec2(uLid.z*1.3,uLid.z*.5))*2.4);
vec4 l=lidAt(p);
return mix(c,l.rgb,l.w);
}
void main(){
vec2 p=gl_FragCoord.xy;
vec3 col;
float xs=p.x/uDpr;
if(p.y>=uHor){
col=above(p);
float shore=uHor+uDpr*(2.+8.*noise(vec2(xs*.011,3.))+4.*noise(vec2(xs*.05,9.)));
col=mix(col,vec3(.026,.058,.066),1.-smoothstep(shore-1.,shore+1.,p.y));
float li=step(.93,hash(vec2(floor(xs/9.),4.)))*(1.-smoothstep(1.,2.6,distance(p,vec2((floor(xs/9.)+.5)*9.*uDpr,uHor+3.*uDpr))/uDpr));
col+=vec3(1.,.72,.38)*li*.8;
}else{
float dpt=clamp((uHor-p.y)/max(uHor-uLot,1.),0.,1.6);
float ys=(uHor-p.y)/uDpr;
float rip=noise(vec2(xs*.020+uTime*.05,ys*.33-uTime*.22))-.5;
rip+=.5*(noise(vec2(xs*.07-uTime*.08,ys*.9))-.5);
vec2 rp=vec2(p.x+rip*uDpr*(8.+42.*dpt),uHor+(uHor-p.y)*2.7+rip*uDpr*7.);
vec3 refl=above(rp);
vec3 cone=vec3(.95,.43,.10);
float film=fbm(vec2(xs*.006+uTime*.010,dpt*3.+rip));
col=mix(refl*.80,cone*(.20+.52*film),.46+.20*film);
col+=cone*.42*pow(max(rip+.5,0.),7.)*(.35+.65*dpt);
col+=vec3(.5,.7,.6)*.05*smoothstep(.55,.8,film);
col*=.78+.26*(1.-min(dpt,1.));
col=mix(col,vec3(.035,.07,.075),smoothstep(0.,-3.*uDpr,p.y-uHor+1.)*0.);
}
// night air: mist lying on the water, drawn toward the lid; the sign's red hanging in it
float my=(p.y-uHor)/uDpr;
float mist=fbm(vec2(xs*.0045-uTime*.012,my*.03+uTime*.004)+fbm(vec2(xs*.011+uTime*.02,my*.05))*.9);
float band=exp(-sq((my+6.)/34.))+.45*exp(-sq((my+50.)/70.));
col=mix(col,vec3(.36,.47,.47)+vec3(.30,.16,.05)*exp(-sq((xs/uRes.x*uDpr-.80)*2.2)),smoothstep(.34,.86,mist)*band*.42);
vec2 sd=(p-uSign.xy)/max(uSign.z,1.);
col+=vec3(1.,.16,.10)*uNeon*(.20*exp(-dot(sd,sd)*1.1)+.10*exp(-dot(sd*vec2(.45,1.),sd*vec2(.45,1.))*.5))*step(1.,uSign.z);
// the lid's own lamps, loose in the mist beneath it
vec2 ud=(p-uLid.xy)/vec2(uLid.z*1.25,uLid.z*.34);
col+=vec3(.70,.84,.86)*.11*exp(-dot(ud,ud))*step(p.y,uLid.y+uLid.z*.1);
col+=(hash(p+fract(uTime)*5.)-.5)*.014;
gl_FragColor=vec4(col,1.);
}`;

const DINER_DEF = { name: 'diner', frag: DINER_FRAG, uniforms: ['uRes', 'uTime', 'uDpr', 'uHor', 'uLot', 'uLid', 'uNeon', 'uSign'] };

/* SP-4. opts: { lid: element whose box is the cloche, horizon: element whose top edge is the
   far shore, lot: element whose top edge is the near shore, sign: element (the neon),
   getNeon: ()=>0..1, reduced }. */
export function dinerGL(canvas, opts) {
  const reduced = !!opts.reduced;
  return scene(canvas, DINER_DEF, {
    still: reduced, onFirst: opts.onReady,
    draw(gl, U, t, w, h, dpr) {
      const cr = canvas.getBoundingClientRect();
      const lr = opts.lid.getBoundingClientRect();
      const hr = opts.horizon.getBoundingClientRect();
      const gr = opts.lot.getBoundingClientRect();
      const R2 = lr.width / 2;
      gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uTime, reduced ? 4 : t); gl.uniform1f(U.uDpr, dpr);
      gl.uniform1f(U.uHor, (cr.bottom - hr.top) * dpr);
      gl.uniform1f(U.uLot, (cr.bottom - gr.top) * dpr);
      // the box holds the dome and its handle; the rim sits 11.5% of the radius above the box's foot
      gl.uniform4f(U.uLid, (lr.left - cr.left + R2) * dpr, (cr.bottom - lr.bottom + R2 * .115) * dpr, R2 * dpr, (lr.height - R2 * .115 - R2 * .12) * dpr);
      gl.uniform1f(U.uNeon, opts.getNeon ? opts.getNeon() : 1);
      const sr = opts.sign ? opts.sign.getBoundingClientRect() : null;
      if (sr && sr.width) gl.uniform4f(U.uSign, (sr.left - cr.left + sr.width / 2) * dpr, (cr.bottom - (sr.top + sr.height / 2)) * dpr, sr.width * .5 * dpr, 0);
      else gl.uniform4f(U.uSign, 0, 0, 0, 0);
    },
  });
}

/* ───────────────────────────── SP-5 · THE SPOILAGE BLOOM ─────────────────────────────
   Behind the whole of the third book's page: a thin petrochemical film, interference colours
   creeping through the cream, and a sparse drift of glints. Transparent where the cloth is
   still clean. */
const SPOIL_FRAG = `precision highp float;
uniform vec2 uRes;uniform float uTime;uniform float uSpread;uniform float uDpr;uniform vec2 uMask;
${NOISE}
vec3 iri(float t){t=fract(t);vec3 c1=vec3(.498,.710,.690),c2=vec3(.690,.561,.710),c3=vec3(.663,.690,.498);
return t<.3333?mix(c1,c2,t*3.):(t<.6666?mix(c2,c3,(t-.3333)*3.):mix(c3,c1,(t-.6666)*3.));}
void main(){
vec2 p=gl_FragCoord.xy/uDpr/520.;
vec2 wp=p+.35*vec2(fbm(p*1.3+vec2(uTime*.010,0.)),fbm(p*1.3+vec2(5.2,uTime*.008)));
float region=smoothstep(.50,.66,fbm(wp*1.1+3.7));
float thick=fbm(wp*2.2-vec2(uTime*.012,0.));
vec3 c=mix(iri(thick*3.2+uTime*.01),vec3(1.),.18);
float a=region*uSpread*.28;
float gh=hash(floor(gl_FragCoord.xy/3.));
float gl=step(.9991,gh)*pow(max(sin(uTime*1.2+gh*80.),0.),12.)*uSpread*smoothstep(.5,.9,region);
vec2 uv=gl_FragCoord.xy/uRes;
float m=smoothstep(0.,uMask.x,uv.y)*smoothstep(0.,uMask.x,1.-uv.y)*smoothstep(0.,uMask.y,uv.x)*smoothstep(0.,uMask.y,1.-uv.x);
float oa=clamp(a+gl*.8,0.,1.)*m;gl_FragColor=vec4(min((c*a+vec3(.85,.80,.58)*gl*.8)*m,vec3(oa)),oa);
}`;

const SPOIL_DEF = { name: 'spoil', frag: SPOIL_FRAG, uniforms: ['uRes', 'uTime', 'uSpread', 'uDpr', 'uMask'] };

/* SP-5. opts: { getSpread: ()=>0..1, mask: [vertical, horizontal] edge fade as a fraction, reduced }. */
export function spoilGL(canvas, opts) {
  const reduced = !!opts.reduced;
  const mask = opts.mask || [.001, .001];
  return scene(canvas, SPOIL_DEF, {
    still: reduced, onFirst: opts.onReady, margin: '0px',
    draw(gl, U, t, w, h, dpr) {
      gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uTime, reduced ? 5 : t); gl.uniform1f(U.uDpr, dpr);
      gl.uniform1f(U.uSpread, reduced ? .8 : (opts.getSpread ? opts.getSpread() : .8));
      gl.uniform2f(U.uMask, Math.max(mask[0], .001), Math.max(mask[1], .001));
    },
  });
}
