// plates.js — the living plates of The Barycentric Creed.
// Hand-written WebGL1, no dependencies. The law is the series' own: morality has
// gravitational mass, so everything here is ink on bone paper being acted on by weight.
//
//   wells   Plate II   a surveyed ground, in perspective, that dimples under three weights
//   survey  Plate VI   the same ground in plan: a contour sheet whose lines tighten with depth
//   shelf   the buy area: the three books standing on that ground, each in its own well
//   cover   the three engraved covers, alive: the plumb settling along a line that no longer
//           hangs true, the dark mass lensing its own title, the storm turning on the sphere
//
// Every plate enhances a static composition that is already in the markup. A plate builds
// its context only when it comes near the viewport and gives it back when it is far away,
// draws only while visible and only when something changed, and under
// prefers-reduced-motion renders one settled frame and stops.

const VERT = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const seg = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const DPR_CAP = 2, MAX_PX = 1.7e6;

/* ---------------------------------------------------------------- shared GLSL ---- */

// The ground. Up to six wells; each is (x, z, radius, depth) + (elongation, cos, sin, kind).
// kind 0: a grave — a dimple with a long shallow skirt
// kind 1: a canyon — flat-floored, stepped walls
// kind 2: a horizon — no floor
export const GLSL_GROUND = `
uniform vec4 uW[6];
uniform vec4 uV[6];
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+7.1;a*=.5;}return s;}
float wellH(vec4 w,vec4 v,vec2 q){
  vec2 d=q-w.xy;d=vec2(v.y*d.x+v.z*d.y,-v.z*d.x+v.y*d.y);d.x/=v.x;
  float r2=dot(d,d)/(w.z*w.z);float f;
  if(v.w<.5){f=.74*exp(-r2*1.15)+.26/(1.+r2);}
  else if(v.w<1.5){float r6=r2*r2*r2;float rw=r2*.36;f=.62/(1.+r6)+.38/(1.+rw*rw*rw);}
  else{float r=sqrt(r2);f=.5/(r+.12);}
  return -w.w*f;
}
float H(vec2 q){float h=0.;for(int i=0;i<6;i++){if(uW[i].w>0.)h+=wellH(uW[i],uV[i],q);}return h;}
`;

const GROUND_FRAG = `#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uFoc,uGrid,uFar,uCity,uPx,uCut,uPull,uSheen;
uniform vec4 uCam;
uniform vec3 uPaper,uInk,uRub;
uniform vec4 uMark;
uniform vec3 uHole;
${GLSL_GROUND}
float lineAA(float d,float fw,float hw){
  float m=1.-smoothstep(hw-.6,hw+.6,d/fw);
  return mix(m,clamp(2.*hw*fw,0.,1.),smoothstep(.2,.48,fw));
}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  float cp=cos(uCam.w),sp=sin(uCam.w);
  vec3 ro=uCam.xyz;
  vec3 rd=normalize(vec3(uv.x,uv.y*cp-uFoc*sp,uv.y*sp+uFoc*cp));
  float gn=h21(gl_FragCoord.xy*.37+3.1);
  vec3 paper=uPaper*(1.+(gn-.5)*.03);
  // a soft band of lamplight that travels over the sheet as the page is scrolled
  float sh=exp(-pow((vUv.x*.5+vUv.y-uSheen)/.3,2.));
  paper*=.972+.028*sh;
  vec3 col=paper;
  if(rd.y<-.01){
    float t=-ro.y/rd.y;vec3 P=ro+rd*t;float black=0.;
    for(int i=0;i<64;i++){
      P=ro+rd*t;
      if(P.y<-uCut&&length(P.xz-uHole.xy)<uHole.z){black=1.;break;}
      float dd=P.y-H(P.xz);
      if(abs(dd)<.0015*t)break;
      t+=clamp(dd*.42,-.05,.1);
    }
    vec2 q=P.xz;float hh=H(q);
    float e=.004+.003*t;
    vec2 gr=vec2(H(q+vec2(e,0.))-H(q-vec2(e,0.)),H(q+vec2(0.,e))-H(q-vec2(0.,e)))/(2.*e);
    vec3 n=normalize(vec3(-gr.x,1.,-gr.y));
    float lit=clamp(dot(n,normalize(vec3(-.55,.62,-.56))),0.,1.);
    float tone=clamp((.62-lit)*1.55,0.,1.);
    tone=max(tone,clamp(-hh*.42,0.,1.)*.62);
    // the survey grid, drawn toward whatever weighs
    vec2 g=(q+gr*uPull/(1.+dot(gr,gr)))/uGrid;vec2 fw=fwidth(g)+1e-5;
    vec2 dl=abs(fract(g-.5)-.5);
    float hw=(.24+1.05*tone)*uPx;
    float ink=max(lineAA(dl.x,fw.x,hw),lineAA(dl.y,fw.y,hw));
    vec2 d4=abs(fract(g*.25-.5)-.5);
    ink=max(ink,max(lineAA(d4.x,fw.x*.25,hw+.34*uPx),lineAA(d4.y,fw.y*.25,hw+.34*uPx)));
    // shade as an engraver would: more lines, then crossed lines
    vec2 dh=abs(fract(g*4.-.5)-.5);vec2 fh=fw*4.;
    float ta=clamp((tone-.14)*2.4,0.,1.),tb=clamp((tone-.46)*2.6,0.,1.);
    ink=max(ink,lineAA(dh.x,fh.x,(.2+.75*ta)*uPx)*ta);
    ink=max(ink,lineAA(dh.y,fh.y,(.2+.7*tb)*uPx)*tb);
    // parcels and built blocks: this is a surveyed place, not a diagram
    vec2 id=floor(g);vec2 lc=fract(g);float rn=h21(id+11.);
    vec2 il=smoothstep(vec2(.13),vec2(.13)+fw*1.2,lc)*(1.-smoothstep(vec2(.87)-fw*1.2,vec2(.87),lc));
    float inset=il.x*il.y;
    float fdg=(fw.x+fw.y)*6.;
    float hat=lineAA(abs(fract((lc.x+lc.y)*6.-.5)-.5),fdg,.26*uPx);
    float hat2=lineAA(abs(fract((lc.x-lc.y)*6.-.5)-.5),fdg,.26*uPx);
    vec2 eb=min(lc-.13,.87-lc);float edge=max(lineAA(abs(eb.x),fw.x,.3*uPx),lineAA(abs(eb.y),fw.y,.3*uPx))*step(-.01,min(eb.x,eb.y));
    float par=step(.915,rn)*max(max(hat,hat2)*.85,edge);
    ink=max(ink,par*inset*uCity*(1.-smoothstep(.1,.3,max(fw.x,fw.y))));
    // the lip of a well, where near ground hides far ground
    float lip=smoothstep(.03,.085,fwidth(t)/t);
    ink=max(ink,lip*.85);
    float fade=exp(-t/uFar);
    ink*=fade;
    // plate tone: the well holds a little ink even between the lines
    vec3 bed=paper*(1.-fade*(.2*tone+.22*clamp(-hh*.5,0.,1.)));
    col=mix(bed,uInk,clamp(ink,0.,1.)*(.9+.08*gn));
    if(black>.5)col=mix(paper,vec3(.04,.045,.055),.97); // an absence is dark in either light
    // the visitor's own reading: a vermilion survey ring that the ground answers to
    if(uMark.w>0.){
      float dr=abs(length(q-uMark.xy)-uMark.z);float fr=fwidth(dr)+1e-5;
      float rm=1.-smoothstep(.9*uPx,.9*uPx+1.2,dr/fr);
      float dc=length(q-uMark.xy);float cm=1.-smoothstep(uMark.z*.16,uMark.z*.16+fr*1.5,dc);
      col=mix(col,uRub,max(rm,cm)*uMark.w*fade);
    }
  }
  gl_FragColor=vec4(col,1.);
}`;

const SURVEY_FRAG = `#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 vUv;
uniform vec2 uRes,uCtr;
uniform float uScale,uStep,uPx,uRough,uTone,uGrat,uSheen;
uniform vec3 uPaper,uInk,uVerd,uRub;
uniform vec4 uMark,uTown;
${GLSL_GROUND}
float lineAA(float d,float fw,float hw){
  float m=1.-smoothstep(hw-.6,hw+.6,d/fw);
  return mix(m,clamp(2.*hw*fw,0.,1.),smoothstep(.2,.48,fw));
}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  vec2 q=uv*uScale+uCtr;
  float gn=h21(gl_FragCoord.xy*.37+3.1);
  vec3 paper=uPaper*(1.+(gn-.5)*.03);
  float sh=exp(-pow((vUv.x*.5+vUv.y-uSheen)/.3,2.));
  paper*=.972+.028*sh;
  float rough=(fbm(q*.9+9.)-.5)*uRough+(fbm(q*3.1)-.5)*uRough*.3;
  float hh=H(q)*(1.+.3*(fbm(q*1.6+2.)-.5))+rough;
  float c=hh/uStep;float fc=fwidth(c)+1e-5;
  float ink=lineAA(abs(fract(c-.5)-.5),fc,.3*uPx)*.8;
  ink=max(ink,lineAA(abs(fract(c*.2-.5)-.5),fc*.2,.8*uPx));
  // depth is ruled in, the way an engraver lays water: closer lines, then crossed
  float tn=clamp(-hh*uTone,0.,1.);
  float ry=gl_FragCoord.y/(3.*uPx);float dr=abs(fract(ry)-.5)*2.;
  float w1=clamp((tn-.2)*.9,0.,.56);
  ink=max(ink,(1.-smoothstep(w1-.16,w1+.16,dr))*step(.02,w1)*.66);
  float rx=(gl_FragCoord.x*.82+gl_FragCoord.y*.57)/(3.*uPx);float dx=abs(fract(rx)-.5)*2.;
  float w2=clamp((tn-.62)*1.2,0.,.5);
  ink=max(ink,(1.-smoothstep(w2-.16,w2+.16,dx))*step(.02,w2)*.62);
  // the town: streets and built blocks, inside its own boundary
  vec2 tq=(q-uTown.xy)/uTown.z;float tr=length(tq*vec2(1.,1.25));
  float tm=1.-smoothstep(.72,1.,tr+(fbm(q*4.)-.5)*.6);
  vec2 g=q/(uTown.z*.15);vec2 fw=fwidth(g)+1e-5;vec2 lc=fract(g);vec2 id=floor(g);float rn=h21(id+3.);
  float st=max(lineAA(min(lc.x,1.-lc.x),fw.x,.3*uPx),lineAA(min(lc.y,1.-lc.y),fw.y,.3*uPx));
  vec2 eb=min(lc-.2,.8-lc);float inb=step(0.,min(eb.x,eb.y));
  float fd=(fw.x+fw.y)*4.;
  float hat=max(lineAA(abs(fract((lc.x+lc.y)*4.-.5)-.5),fd,.3*uPx),lineAA(abs(fract((lc.x-lc.y)*4.-.5)-.5),fd,.3*uPx));
  float ob=max(lineAA(abs(eb.x),fw.x,.34*uPx),lineAA(abs(eb.y),fw.y,.34*uPx))*step(-.02,min(eb.x,eb.y));
  float blk=step(.38,rn)*max(hat*inb*.8,ob);
  ink=mix(ink,max(st*.55,blk),tm*uTown.w);
  vec3 col=mix(paper,uInk,clamp(ink,0.,1.)*(.86+.1*gn));
  // graticule, in the marginal ink
  vec2 gg=q/uGrat;vec2 fg=fwidth(gg)+1e-5;vec2 dg=abs(fract(gg-.5)-.5);
  float mg=max(lineAA(dg.x,fg.x,.3*uPx),lineAA(dg.y,fg.y,.3*uPx));
  col=mix(col,uVerd,mg*.5);
  if(uMark.w>0.){
    float dm=abs(length(q-uMark.xy)-uMark.z);float fr=fwidth(dm)+1e-5;
    float rm=1.-smoothstep(.9*uPx,.9*uPx+1.2,dm/fr);
    float dc=length(q-uMark.xy);float cm=1.-smoothstep(uMark.z*.16,uMark.z*.16+fr*1.5,dc);
    col=mix(col,uRub,max(rm,cm)*uMark.w);
  }
  gl_FragColor=vec4(col,1.);
}`;

// A cover, or a crop of one, as a texture. Everything is addressed in cover pixels
// (1650 x 2550, y down), so the same shader serves the whole cover and any detail of it.
const COVER_PRELUDE = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec4 uFit,uMap;
uniform float uT,uP,uSheen;
uniform vec3 uPtr;
vec2 toCover(vec2 uv){vec2 t=(uv-.5)*uFit.xy+uFit.zw;return vec2(t.x,1.-t.y)*uMap.xy+uMap.zw;}
vec3 smp(vec2 C){vec2 I=(C-uMap.zw)/uMap.xy;return texture2D(uTex,vec2(I.x,1.-I.y)).rgb;}
vec3 sheen(vec3 c){float g=exp(-pow((vUv.x*.55+vUv.y-uSheen)/.24,2.));return c*(1.+.085*g);}
`;

// Book I. The plumb does not hang true: its line leans toward the weight. Here it goes on
// settling along that line, and the ground around the point is drawn in toward it.
const COVER_I = COVER_PRELUDE + `
const vec2 T=vec2(722.,2122.);const vec2 K=vec2(912.,1140.);
void main(){
  vec2 C=toCover(vUv);
  vec2 ax=normalize(T-K);vec2 pr=vec2(-ax.y,ax.x);
  vec2 d=C-T;float s=-dot(d,ax);float l=dot(d,pr);float L=length(T-K);
  float wB=smoothstep(30.,300.,s)*(1.-smoothstep(L-10.,L+56.,s))*(1.-smoothstep(250.,400.,abs(l)));
  vec2 S=C-ax*(uP*38.)*wB;
  float r=length(d);
  float cone=clamp(smoothstep(.30,.42,abs(l)/max(s,1.))+step(s,0.),0.,1.);
  float gm=smoothstep(1640.,1900.,C.y)*(1.-smoothstep(2170.,2262.,C.y))*cone*(1.-wB);
  vec2 G=C+d*(.22*uP)*exp(-r*r/(520.*520.))*gm;
  vec2 dv=-d/max(r,1.);
  vec2 fl=(dv*.93+vec2(-dv.y,dv.x)*.36)*exp(-r/900.)*(1.-exp(-r/70.));
  float ph=fract(uT*.045),ph2=fract(uT*.045+.5);
  vec3 g0=smp(G-fl*120.*(ph-.5)),g1=smp(G-fl*120.*(ph2-.5));
  vec3 col=mix(smp(S),mix(g0,g1,abs(1.-2.*ph)),gm);
  col*=1.-.32*uP*exp(-r*r/(230.*230.))*smoothstep(1700.,1960.,C.y);
  gl_FragColor=vec4(sheen(col),1.);
}`;

// Book II. The mass is visible only by what it bends. As it comes on, the debris ring and
// the foot of its own title are drawn toward it.
const COVER_II = COVER_PRELUDE + `
const vec2 C0=vec2(846.,1454.);const float R=388.;
uniform float uG;
void main(){
  vec2 C=toCover(vUv);
  vec2 c0=C0+(uPtr.xy-C0)*.018*uPtr.z;
  vec2 d=C-c0;float r=length(d)/R;
  float k=uG*exp(-r*r*1.4);
  vec3 col=smp(c0+d*(1.-k));
  // the horizon keeps its edge
  float rim=exp(-pow((r-1.02-uG*.09)/.03,2.));
  col*=1.-.25*rim*uG;
  gl_FragColor=vec4(sheen(col),1.);
}`;

// Book III. The storm turns on the sphere, band against band, and the lamp in the one
// window stays lit. Nothing else moves: the requiem is the quietest plate.
const COVER_III = COVER_PRELUDE + `
const vec2 C0=vec2(825.,1264.);const float R=578.;const vec2 Vx=vec2(948.,1590.);
void main(){
  vec2 C=toCover(vUv);
  vec2 d=(C-C0)/R;float r=length(d);
  float w=(1.-smoothstep(.9,.985,r))*smoothstep(-.82,-.6,d.y);
  float cl=sqrt(max(1.-d.y*d.y,.02));
  float band=sin(d.y*9.+.6)*.6+sin(d.y*4.1-1.)*.4;
  vec2 dv=C-Vx;float rv=length(dv);float vm=exp(-rv*rv/(220.*220.));
  vec2 fl=vec2(1.,-.22*d.x)*(.5+.5*band)*cl*(1.-vm)+vec2(-dv.y,dv.x)/max(rv,1.)*vm*1.5;
  float ph=fract(uT*.04),ph2=fract(uT*.04+.5);
  vec3 c0=smp(C-fl*76.*(ph-.5)*w),c1=smp(C-fl*76.*(ph2-.5)*w);
  vec3 col=mix(c0,c1,abs(1.-2.*ph));
  vec2 dw=C-vec2(825.,1939.);float lw=exp(-dot(dw,dw)/(48.*48.));
  float warm=clamp((col.r-col.b)*3.2-.1,0.,1.);
  float fk=.55+.28*sin(uT*.83)+.17*sin(uT*1.9+1.3);
  col+=vec3(1.,.72,.36)*warm*lw*.4*fk;
  col+=vec3(.9,.6,.25)*exp(-dot(dw,dw)/(150.*150.))*.045*fk;
  gl_FragColor=vec4(sheen(col),1.);
}`;

// Scene coordinates are master-image pixels relative to the landmark in data-rect.
const SCENES = {
  // The doorstep settles into the surveyed paving. The plumb stays vertical.
  i: COVER_PRELUDE + `
void main(){
  vec2 C=toCover(vUv);
  vec2 span=C/vec2(355.,255.);
  float weight=exp(-dot(span,span));
  float depth=13.*uP+3.*(1.-exp(-uT*.07));
  vec2 source=C-vec2(-.026*C.x,depth)*weight;
  vec3 col=smp(source)*(1.-.065*uP*weight);
  gl_FragColor=vec4(sheen(col),1.);
}`,
  // The arc grows in the open sky, behind the cord, pier and parapet.
  ii: COVER_PRELUDE + `
uniform float uG;
void main(){
  vec2 C=toCover(vUv);
  float pier=1.-smoothstep(3.,9.,C.x);
  float parapet=1.-smoothstep(165.,172.,C.y+.08*C.x);
  float cord=smoothstep(3.,11.,abs(C.y-(136.+.062*C.x)));
  vec2 d=C-.012*uPtr.xy*uPtr.z;
  float lens=uG*.52*exp(-dot(d,d)/(245.*245.));
  gl_FragColor=vec4(sheen(smp(C-d*lens*pier*parapet*cord)),1.);
}`,
  // Raking light passes along the high windows. The road and travellers stay still.
  iii: COVER_PRELUDE + `
void main(){
  vec2 C=toCover(vUv);
  float row=C.y+.328*C.x;
  float height=56.+.08*C.x;
  float panes=smoothstep(0.,8.,C.x)*smoothstep(5.,12.,row)*(1.-smoothstep(height-9.,height,row));
  float sweep=(C.x+105.)/820.-uP*.62-(1.-exp(-uT*.045))*.35;
  vec3 col=smp(C);
  col*=1.+.17*panes*exp(-sweep*sweep/.024)*smoothstep(.17,.68,col.r);
  gl_FragColor=vec4(sheen(col),1.);
}`
};

/* ---------------------------------------------------------------- the frame ---- */

function parseColor(s){
  s = (s || '').trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m){ const n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  m = /rgba?\(([^)]+)\)/.exec(s);
  if (m){ const v = m[1].split(/[ ,/]+/).map(parseFloat); return [v[0] / 255, v[1] / 255, v[2] / 255]; }
  return [0.5, 0.5, 0.5];
}
function inks(host){
  const cs = getComputedStyle(host);
  const g = (n) => parseColor(cs.getPropertyValue(n));
  return { paper: g('--plate-paper'), ink: g('--plate-ink'), rub: g('--plate-rubric'), verd: g('--plate-verd') };
}

export function createPlate(host, spec, env){
  const P = { host, spec, gl: null, canvas: null, prog: null, loc: {}, tex: [], t: 0, last: 0, raf: 0,
    near: false, vis: false, ready: false, dead: false, tearing: false, dirty: true, first: true,
    p: 0, pmax: 0, w: 0, h: 0, dpr: 1, ptr: { x: .5, y: .5, on: 0 }, sm: { x: .5, y: .5, on: 0 }, ink: null, state: {} };
  const reduced = !!env.reduced;
  if (reduced) P.pmax = spec.settled == null ? 0.62 : spec.settled;

  const fail = () => {
    host.classList.remove('is-live');
    const src = host.getAttribute('data-fallback');
    if (src && !host.querySelector('.gl-fallback')){
      const im = new Image(); im.className = 'gl-fallback'; im.alt = ''; im.decoding = 'async';
      const m = host.getAttribute('data-fallback-m');
      im.src = (m && matchMedia('(max-width: 719px)').matches) ? m : src;
      host.insertBefore(im, host.firstChild);
    }
  };
  if (spec.needsImage && !spec.needsImage()) { P.dead = true; return P; }

  function build(){
    if (P.gl || P.dead) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'gl-canvas'; canvas.setAttribute('aria-hidden', 'true');
    let gl = null;
    try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power' }); } catch (e) {}
    if (!gl || (spec.derivatives && !gl.getExtension('OES_standard_derivatives'))){ P.dead = true; fail(); return; }
    try {
      const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const pr = gl.createProgram();
      gl.attachShader(pr, mk(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, spec.frag));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gl.useProgram(pr);
      P.prog = pr;
    } catch (e) { console.warn('plate static:', e); P.dead = true; fail(); return; }
    P.gl = gl; P.canvas = canvas; P.loc = {}; P.first = true; P.ready = !spec.image;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (canvas._given) return; P.dead = true; teardown(); fail(); });
    host.appendChild(canvas);
    P.ink = inks(host);
    size();
    if (spec.image){
      const img = spec.image();
      const up = () => {
        if (!P.gl || P.gl !== gl) return;
        try {
          const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          P.tex = [t]; P.iw = img.naturalWidth; P.ih = img.naturalHeight; P.ready = true; P.dirty = true; kick();
        } catch (e) { console.warn('plate static:', e); P.dead = true; teardown(); }
      };
      img.loading = 'eager';
      if (img.complete && img.naturalWidth) up(); else img.addEventListener('load', up, { once: true });
    }
    kick();
  }

  function teardown(){
    if (!P.gl) return;
    P.tearing = true;
    if (P.canvas) P.canvas._given = true;
    if (P.raf) cancelAnimationFrame(P.raf); P.raf = 0;
    try { const x = P.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) {}
    if (P.canvas) P.canvas.remove();
    P.gl = null; P.canvas = null; P.prog = null; P.ready = false; P.tearing = false;
    host.classList.remove('is-live');
  }

  function size(){
    if (!P.canvas) return;
    const r = host.getBoundingClientRect();
    let dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const px = r.width * r.height * dpr * dpr;
    if (px > MAX_PX) dpr *= Math.sqrt(MAX_PX / px);
    P.w = r.width; P.h = r.height; P.dpr = dpr;
    const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (P.canvas.width !== w || P.canvas.height !== h){ P.canvas.width = w; P.canvas.height = h; }
    P.dirty = true;
  }

  const U = (n) => (n in P.loc ? P.loc[n] : (P.loc[n] = P.gl.getUniformLocation(P.prog, n)));
  const set = (n, a, b, c, d) => { const gl = P.gl, l = U(n); if (!l) return;
    if (a && a.length !== undefined){ if (a.length === 2) gl.uniform2fv(l, a); else if (a.length === 3) gl.uniform3fv(l, a); else gl.uniform4fv(l, a); }
    else if (d !== undefined) gl.uniform4f(l, a, b, c, d); else if (c !== undefined) gl.uniform3f(l, a, b, c);
    else if (b !== undefined) gl.uniform2f(l, a, b); else gl.uniform1f(l, a); };

  function frame(now){
    P.raf = 0;
    if (!P.gl) return;
    const dt = P.last ? Math.min((now - P.last) / 1000, 0.05) : 0.016; P.last = now;
    if (!reduced){
      P.t += dt;
      const r = host.getBoundingClientRect(), vh = innerHeight;
      const p = clamp((vh - r.top) / (vh + r.height), 0, 1);
      P.p = p; if (p > P.pmax) P.pmax = p;
      // the pointer is followed the way ground follows anything: late
      const k = 1 - Math.exp(-dt * 2.6);
      const ox = P.sm.x, oy = P.sm.y, oo = P.sm.on;
      P.sm.x += (P.ptr.x - P.sm.x) * k; P.sm.y += (P.ptr.y - P.sm.y) * k; P.sm.on += (P.ptr.on - P.sm.on) * (1 - Math.exp(-dt * 1.6));
      if (Math.abs(P.sm.x - ox) + Math.abs(P.sm.y - oy) + Math.abs(P.sm.on - oo) > 2e-4) P.dirty = true;
    }
    if (P.ready){
      const moving = spec.step ? spec.step(P, dt, reduced) : false;
      if (P.dirty || moving || (spec.continuous && !reduced)) draw();
    }
    if (P.vis && !reduced && !document.hidden) P.raf = requestAnimationFrame(frame);
  }
  function draw(){
    const gl = P.gl;
    gl.viewport(0, 0, P.canvas.width, P.canvas.height);
    if (P.tex[0]){ gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, P.tex[0]); gl.uniform1i(U('uTex'), 0); }
    set('uRes', P.canvas.width, P.canvas.height);
    set('uPx', P.dpr);
    set('uT', P.t);
    set('uP', P.pmax);
    set('uSheen', reduced ? 0.8 : 1.75 - P.p * 2.1);
    if (P.ink){ set('uPaper', P.ink.paper); set('uInk', P.ink.ink); set('uRub', P.ink.rub); set('uVerd', P.ink.verd); }
    spec.uniforms(P, set);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    P.dirty = false;
    if (P.first){ P.first = false; requestAnimationFrame(() => host.classList.add('is-live')); }
  }
  function kick(){ if (!P.raf && P.gl && (P.vis || reduced || P.first)) { P.last = 0; P.raf = requestAnimationFrame(frame); } }

  const onMove = (e) => {
    if (!P.vis || !P.gl) return;
    const r = host.getBoundingClientRect();
    const x = (e.clientX - r.left) / Math.max(r.width, 1), y = (e.clientY - r.top) / Math.max(r.height, 1);
    const on = x > -0.05 && x < 1.05 && y > -0.05 && y < 1.05;
    if (on){ P.ptr.x = x; P.ptr.y = y; }
    P.ptr.on = on ? 1 : 0;
  };
  const onLeave = () => { P.ptr.on = 0; };
  if (!reduced){
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
  }
  const nearIO = new IntersectionObserver((es) => es.forEach((e) => {
    P.near = e.isIntersecting;
    if (P.near) build(); else if (!spec.keep) teardown();
  }), { rootMargin: '110% 0px' });
  const visIO = new IntersectionObserver((es) => es.forEach((e) => { P.vis = e.isIntersecting; if (P.vis) { P.dirty = true; kick(); } }));
  nearIO.observe(host); visIO.observe(host);
  let rt = 0;
  const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { size(); kick(); }, 140); });
  ro.observe(host);
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => { if (P.gl){ P.ink = inks(host); P.dirty = true; kick(); } };
  mq.addEventListener ? mq.addEventListener('change', onScheme) : mq.addListener(onScheme);

  P.destroy = () => {
    nearIO.disconnect(); visIO.disconnect(); ro.disconnect();
    removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onMove);
    document.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('visibilitychange', onVis);
    mq.removeEventListener ? mq.removeEventListener('change', onScheme) : mq.removeListener(onScheme);
    teardown();
  };
  return P;
}

/* ---------------------------------------------------------------- the plates ---- */

// camera + the same projection in JS, so marks on the page can stand on the drawn ground
function camera(P, cam){
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  return {
    project(x, y, z){
      const vx = x - cam.x, vy = y - cam.h, vz = z - cam.z;
      const yc = vy * cp + vz * sp, zc = -vy * sp + vz * cp;
      return [P.w / 2 + cam.foc * vx / zc * P.h, P.h / 2 - cam.foc * yc / zc * P.h, cam.foc / zc * P.h];
    },
    ground(px, py){
      const ux = (px - P.w / 2) / P.h, uy = (P.h / 2 - py) / P.h;
      const rx = ux, ry = uy * cp - cam.foc * sp, rz = uy * sp + cam.foc * cp;
      if (ry > -0.01) return null;
      const t = -cam.h / ry;
      return [cam.x + rx * t, cam.z + rz * t];
    }
  };
}
function packWells(list){
  const W = new Float32Array(24), V = new Float32Array(24);
  list.slice(0, 6).forEach((w, i) => {
    W.set([w.x, w.z, w.r, Math.max(w.d, 0)], i * 4);
    const a = w.a || 0; V.set([w.e || 1, Math.cos(a), Math.sin(a), w.k || 0], i * 4);
  });
  return { W, V };
}
function sendWells(P, list){
  const { W, V } = packWells(list);
  const gl = P.gl;
  const lw = gl.getUniformLocation(P.prog, 'uW[0]'), lv = gl.getUniformLocation(P.prog, 'uV[0]');
  if (lw) gl.uniform4fv(lw, W); if (lv) gl.uniform4fv(lv, V);
}
// depth follows its target the way ground follows a weight: it takes its time
function settle(st, key, target, dt, rate){
  const v = st[key] == null ? 0 : st[key];
  const nv = v + (target - v) * (1 - Math.exp(-dt * (rate || 1.1)));
  st[key] = Math.abs(target - nv) < 5e-4 ? target : nv;
  return st[key] !== v;
}

// Plate II — the ladder of weights
function specWells(host){
  const wide = () => host.clientWidth > host.clientHeight * 1.15;
  const layout = () => wide()
    ? { cam: { x: 0, h: 6.4, z: 0, pitch: 0.72, foc: 2.0 }, grid: 0.2, far: 30,
        wells: [ { x: -3.0, z: 6.3, r: 0.55, k: 0, D: 0.62 }, { x: 0.1, z: 8.6, r: 0.42, e: 4.2, a: -0.2, k: 1, D: 0.95 }, { x: 2.9, z: 6.0, r: 0.95, k: 2, D: 0.95 } ] }
    : { cam: { x: 0, h: 8.2, z: 0, pitch: 1.0, foc: 2.3 }, grid: 0.155, far: 34,
        wells: [ { x: -0.5, z: 7.25, r: 0.36, k: 0, D: 0.48 }, { x: 0.35, z: 5.75, r: 0.28, e: 4.6, a: -0.12, k: 1, D: 0.78 }, { x: -0.15, z: 4.3, r: 0.58, k: 2, D: 0.85 } ] };
  return {
    frag: GROUND_FRAG, derivatives: true, settled: 0.66,
    step(P, dt, reduced){
      const p = P.pmax, st = P.state; let mv = false;
      const tg = [ease(seg(p, 0.10, 0.36)), ease(seg(p, 0.20, 0.48)), ease(seg(p, 0.30, 0.6))];
      if (reduced){ st.d0 = tg[0]; st.d1 = tg[1]; st.d2 = tg[2]; return false; }
      mv = settle(st, 'd0', tg[0], dt, 0.9) || mv; mv = settle(st, 'd1', tg[1], dt, 0.8) || mv; mv = settle(st, 'd2', tg[2], dt, 0.7) || mv;
      return mv;
    },
    uniforms(P, set){
      const L = layout(), st = P.state, cam = L.cam, C = camera(P, cam);
      const ds = [st.d0 || 0, st.d1 || 0, st.d2 || 0];
      const list = L.wells.map((w, i) => ({ x: w.x, z: w.z, r: w.r, e: w.e, a: w.a, k: w.k, d: w.D * ds[i] + 1e-4 }));
      // the visitor's pointer is a small weight of its own
      const g = P.sm.on > 0.01 ? C.ground(P.sm.x * P.w, P.sm.y * P.h) : null;
      if (g) list.push({ x: g[0], z: g[1], r: 0.3, k: 0, d: 0.2 * P.sm.on });
      sendWells(P, list);
      set('uCam', cam.x, cam.h, cam.z, cam.pitch); set('uFoc', cam.foc);
      set('uGrid', L.grid); set('uFar', L.far); set('uCity', 1); set('uPull', 0.12);
      set('uCut', 1.02 * L.wells[2].D * ds[2] + 0.02); set('uHole', L.wells[2].x, L.wells[2].z, ds[2] > 0.03 ? L.wells[2].r * 0.6 : 0);
      set('uMark', g ? g[0] : 0, g ? g[1] : 0, 0.2, g ? P.sm.on * 0.9 : 0);
      // let the marks on the page stand on the drawn ground
      L.wells.forEach((w, i) => {
        const top = C.project(w.x, 0, w.z), bot = C.project(w.x, -w.D * ds[i], w.z);
        host.style.setProperty('--w' + i + 'x', top[0].toFixed(1) + 'px');
        host.style.setProperty('--w' + i + 'y', top[1].toFixed(1) + 'px');
        host.style.setProperty('--w' + i + 'd', (bot[1] - top[1]).toFixed(1) + 'px');
        host.style.setProperty('--w' + i + 's', (top[2] / 300).toFixed(3));
      });
      host.style.setProperty('--grave', (ds[0]).toFixed(2));
      const out = host.querySelector('[data-grave]'); if (out) out.textContent = (0.97 + 0.03 * ds[0]).toFixed(2);
    }
  };
}

// The buy area — three books standing on the ground, each in the well it makes
function specShelf(host){
  const cam = { x: 0, h: 2.6, z: 0, pitch: 0.5, foc: 1.55 };
  const D = [0.3, 0.5, 0.7];
  return {
    frag: GROUND_FRAG, derivatives: true, settled: 0.6,
    step(P, dt, reduced){
      const tg = ease(seg(P.pmax, 0.08, 0.5));
      if (reduced){ P.state.d = tg; return false; }
      return settle(P.state, 'd', tg, dt, 0.8);
    },
    uniforms(P, set){
      const C = camera(P, cam), d = P.state.d || 0;
      const hr = host.getBoundingClientRect();
      const list = [];
      Array.prototype.forEach.call(host.parentNode.querySelectorAll('[data-stand]'), (el, i) => {
        if (i > 2) return;
        // layout position, not transformed position: the stand moves, the well must not chase it
        let x = el.offsetWidth / 2, y = el.offsetHeight, n = el;
        while (n && n !== host.offsetParent){ x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
        x -= host.offsetLeft; y -= host.offsetTop;
        const g = C.ground(x, y - el.offsetHeight * 0.02);
        if (!g) return;
        const r = Math.max(0.3, el.offsetWidth / P.h * 1.5);
        const dd = parseFloat(el.getAttribute('data-depth')) || D[i];
        list.push({ x: g[0], z: g[1], r: r, k: 0, d: dd * d + 1e-4 });
        const top = C.project(g[0], 0, g[1]), bot = C.project(g[0], -dd * d, g[1]);
        el.style.setProperty('--dip', (bot[1] - top[1]).toFixed(1) + 'px');
      });
      const g = P.sm.on > 0.01 ? C.ground(P.sm.x * P.w, P.sm.y * P.h) : null;
      if (g) list.push({ x: g[0], z: g[1], r: 0.26, k: 0, d: 0.14 * P.sm.on });
      sendWells(P, list);
      set('uCam', cam.x, cam.h, cam.z, cam.pitch); set('uFoc', cam.foc);
      set('uGrid', 0.26); set('uFar', 9); set('uCity', 0); set('uCut', 9); set('uHole', 0, 0, 0); set('uPull', 0.14);
      set('uMark', 0, 0, 0, 0);
    }
  };
}

// Plate VI — the survey sheet
function specSurvey(host){
  const wide = () => host.clientWidth > host.clientHeight * 1.15;
  // the Long Grief is three canyons laid end to end; the Gravel a broad shallow field; then graves
  const wells = [
    { x: -1.75, z: -0.3, r: 0.17, e: 5.2, a: 0.3, k: 1, D: 0.9 },
    { x: -0.2, z: 0.32, r: 0.2, e: 4.6, a: 0.52, k: 1, D: 1.15 },
    { x: 1.3, z: 1.0, r: 0.15, e: 5.0, a: 0.28, k: 1, D: 0.8 },
    { x: 1.75, z: -0.7, r: 0.62, e: 1.35, a: -0.3, k: 0, D: 0.42 },
    { x: -2.3, z: 0.98, r: 0.16, k: 0, D: 0.4 }
  ];
  const sites = [[-0.2, 0.02], [1.75, -0.7], [-0.95, -0.78]];
  return {
    frag: SURVEY_FRAG, derivatives: true, settled: 0.7,
    step(P, dt, reduced){
      const tg = 0.45 + 0.55 * ease(seg(P.pmax, 0.1, 0.62));
      if (reduced){ P.state.d = tg; return false; }
      return settle(P.state, 'd', tg, dt, 0.7);
    },
    uniforms(P, set){
      const d = P.state.d || 0.45, w = wide();
      // on a phone the sheet is narrow: zoom out until the Long Grief, the Gravel and Clemency all fit
      const scale = w ? 2.9 : Math.max(3.3, 4.9 * P.h / Math.max(P.w, 1)), ctr = w ? [0.1, 0.1] : [-0.08, 0.12];
      const list = wells.map((q) => ({ x: q.x, z: q.z, r: q.r, e: q.e, a: q.a, k: q.k, d: q.D * d }));
      let mark = [0, 0, 0, 0];
      if (P.sm.on > 0.01){
        const gx = (P.sm.x * P.w - P.w / 2) / P.h * scale + ctr[0], gy = (P.h / 2 - P.sm.y * P.h) / P.h * scale + ctr[1];
        list.push({ x: gx, z: gy, r: 0.16, k: 0, d: 0.3 * P.sm.on });
        mark = [gx, gy, 0.07, P.sm.on * 0.9];
      }
      sendWells(P, list);
      set('uScale', scale); set('uCtr', ctr[0], ctr[1]);
      set('uStep', 0.07); set('uRough', 0.3); set('uTone', 0.9); set('uGrat', 1.0);
      set('uTown', sites[2][0], sites[2][1] - 0.02, 0.4, 1);
      sites.forEach((q, i) => {
        host.parentNode.style.setProperty('--s' + i + 'x', ((P.w / 2 + (q[0] - ctr[0]) / scale * P.h) / P.w * 100).toFixed(2) + '%');
        host.parentNode.style.setProperty('--s' + i + 'y', ((P.h / 2 - (q[1] - ctr[1]) / scale * P.h) / P.h * 100).toFixed(2) + '%');
      });
      set('uMark', mark);
    }
  };
}

// Covers and scenes share the same texture fitting, scroll, sheen and reduced-motion handling.
// data-rect maps the image to shader coordinates (top-left x, y, width, height).
const COVERS = { i: COVER_I, ii: COVER_II, iii: COVER_III };
function specCover(host){
  const shaders = host.dataset.plate === 'scene' ? SCENES : COVERS;
  const img = host.querySelector('img');
  const book = host.getAttribute('data-book') || 'i';
  const rect = (host.getAttribute('data-rect') || '0 0 1650 2550').split(/\s+/).map(parseFloat);
  return {
    frag: shaders[book] || COVER_I, image: () => img, needsImage: () => !!img,
    continuous: book !== 'ii', settled: 0.7,
    step(P, dt, reduced){
      if (book !== 'ii') return false;
      const tg = 0.05 + 0.27 * ease(seg(P.pmax, 0.12, 0.7));
      if (reduced){ P.state.g = tg; return false; }
      return settle(P.state, 'g', tg, dt, 0.7);
    },
    uniforms(P, set){
      // object-fit: cover, honouring the image's own object-position
      const ia = P.iw / P.ih, ca = P.w / Math.max(P.h, 1);
      let sx = 1, sy = 1;
      if (ca > ia) sy = ia / ca; else sx = ca / ia;
      const op = (getComputedStyle(img).objectPosition || '50% 50%').split(' ').map((v) => parseFloat(v) / 100);
      const ox = 0.5 + ((isNaN(op[0]) ? 0.5 : op[0]) - 0.5) * (1 - sx), oy = 0.5 - ((isNaN(op[1]) ? 0.5 : op[1]) - 0.5) * (1 - sy);
      set('uFit', sx, sy, ox, oy);
      set('uMap', rect[2], rect[3], rect[0], rect[1]);
      set('uG', P.state.g || 0.05);
      // pointer, in cover pixels
      const tx = (P.sm.x - 0.5) * sx + ox, ty = (0.5 - P.sm.y) * sy + oy;
      set('uPtr', tx * rect[2] + rect[0], (1 - ty) * rect[3] + rect[1], P.sm.on);
    }
  };
}

const KINDS = { wells: specWells, shelf: specShelf, survey: specSurvey, cover: specCover, scene: specCover };

export function mountPlates(root, env){
  const out = [];
  Array.prototype.forEach.call((root || document).querySelectorAll('[data-plate]'), (host) => {
    const mk = KINDS[host.getAttribute('data-plate')];
    if (!mk) return;
    try { out.push(createPlate(host, mk(host), env || {})); } catch (e) { console.warn('plate static:', e); }
  });
  return out;
}
