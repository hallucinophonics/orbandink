// press.js — the printing press. Every shader on the Terms & Conditions site, hand-written
// WebGL1, no libraries. ONE context for the whole page: each plate is drawn in it and
// handed to that plate's own 2D canvas, so plates scroll with the page and nothing has to
// keep a second context alive.
//
// What it prints:
//   · a plate (data-plate): a two-ink print. Its source is a separation (a hard key line
//     block and one flat spot tint, see scenes/…/flatten.py), never a picture shown as it
//     came. The burin draws the key in when the plate first comes into view (contours
//     first, hatching after, the ink still wet at the front); the paper's tooth starves
//     the line here and there; then the spot ink is laid, a hair out of register. After
//     that it is a printed object under a raking light: tooth, emboss and plate mark turn
//     as the light moves (the pointer, or the scroll position on a phone).
//   · data-key="screens": the Notice. A map beside the print (<scene>-screens.png) gives
//     every screen in the street its own page coordinates, and the press typesets the same
//     page of the Notice into all of them at the same moment, line by line, page after
//     page. The street itself slides in perspective (near things further than far ones).
//   · data-light: a light inside a picture (the lamp over the kitchen table, the blade of
//     light from the third door, the far end of the hall).
//   · data-mark: the plate mark, the blind rectangle an intaglio plate presses into the
//     sheet, lit from wherever the raking light is.
//   · data-key="night": the fleet. The same world after the ninety days have run down,
//     engraved white on dark; the lamps under the hulls burn in berthing order, their light
//     falls on the town, and the fleet and the rooftops slide against each other.
//   · a stamp (data-stamp-gl): red ink pressed into the Office's white stationery: uneven
//     pressure, a starved edge, ink that spreads into the fibres for a moment and stops.
//
// instrument.js imports this after first paint. With no WebGL it returns null and the
// prints already in the markup stay as they are.

const VERT = 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';

const NOISE = `
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+1.),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+17.1;a*=.5;}return s;}
`;

const PLATE = `precision highp float;
varying vec2 v;
uniform sampler2D T;   // the print: neutral key block over one flat spot tint, on white
uniform sampler2D M;   // hero only: per-screen page coordinates (r,g) and size (b)
uniform vec2 R;        // canvas, px
uniform vec4 F;        // cover fit: image uv = v*F.xy + F.zw
uniform vec4 E;        // edge fades: left, top, right, bottom (fraction of the plate)
uniform vec3 P;        // the sheet behind the canvas
uniform vec3 C2;       // the spot ink
uniform vec4 G;        // a light inside the picture: kind, x, y (image uv), strength
uniform vec2 L;        // the raking light, in plate uv
uniform float t, ink, spot, key, dir, drift, par, dpr, mark, ia;
${NOISE}
float mx3(vec3 c){return max(c.r,max(c.g,c.b));}
float sat(vec3 c){float m=mx3(c);return (m-min(c.r,min(c.g,c.b)))/max(m,1e-3);}
float keyOf(vec3 c){return clamp((1.-mx3(c))/.92,0.,1.);}
// One page of the Notice, typeset by the press. The same page on every screen, typed top
// to bottom at the same moment everywhere, then the next page.
float notice(vec2 p,float size,float tt){
  float pg=floor(tt/7.5),sec=fract(tt/7.5)*7.5;
  float typed=clamp(sec/2.8,0.,1.);
  float n=size<.3?5.:(size<.55?8.:13.);
  float a=step(.3,p.x)*step(p.x,.7)*step(.09,p.y)*step(p.y,.165)*step(.04,typed);
  float ly=(p.y-.25)/.56*n,i=floor(ly),f=fract(ly);
  if(ly>=0.&&i<n){
    float len=.5+.38*h21(vec2(i,pg+1.));
    float blank=step(.84,h21(vec2(i+3.,pg*1.7+2.)));
    float done=clamp(typed*(n+1.)-i,0.,1.);
    float x1=.12+(len-.0)*.76*done;
    a=max(a,step(.12,p.x)*step(p.x,x1)*step(.26,f)*step(f,.6)*(1.-blank));
    a=max(a,step(x1,p.x)*step(p.x,x1+.035)*step(.16,f)*step(f,.7)*step(.001,done)*step(done,.999)*(1.-blank)*.8);
  }
  if(size>.3){
    vec2 b=abs(p-vec2(.5,.9))-vec2(.03,.042);
    float bx=max(b.x,b.y);
    a=max(a,step(-.012,bx)*step(bx,0.)*step(.98,typed));
  }
  return a;
}
void main(){
  vec2 asp=vec2(R.x/R.y,1.);
  vec2 q=v;
  // night: the fleet (upper field) and the town (lower) are on different planes
  if(key>1.5) q.y+=drift*mix(.055,-.02,smoothstep(.52,.8,v.y));
  else q.y+=drift*.025;
  // the street: what is near the eye (the edges) slides further than the far end of the road
  if(key>.5&&key<1.5) q.x-=par*.022*pow(abs(q.x-.5)*2.,1.4);
  vec2 iu=q*F.xy+F.zw;
  vec3 c=texture2D(T,iu).rgb;
  vec3 cb=texture2D(T,iu,2.6).rgb;
  float K=keyOf(c),Kb=keyOf(cb);
  // edges: the lighting fades to the bare sheet at the canvas edge; the ink stops at the plate mark
  float mo=smoothstep(0.,E.x+1e-4,v.x)*smoothstep(0.,E.z+1e-4,1.-v.x)*smoothstep(0.,E.y+1e-4,v.y)*smoothstep(0.,E.w+1e-4,1.-v.y);
  float m=mo,inside=0.,bevel=0.;
  vec2 ldm=vec2(0.);
  if(mark>.5){
    vec2 px=v*R,hf=R*.5-vec2(min(R.x,R.y)*.045);
    vec2 dd=abs(px-R*.5)-hf;
    float sd=max(dd.x,dd.y);                         // <0 inside the plate mark
    inside=smoothstep(1.*dpr,-1.*dpr,sd);
    bevel=exp(-pow(sd/(1.7*dpr),2.));
    ldm=dd.x>dd.y?vec2(sign(px.x-R.x*.5),0.):vec2(0.,sign(px.y-R.y*.5));
    m=inside*smoothstep(0.,-min(R.x,R.y)*.05,sd);
  }

  // the burin: where it has been. Contours and dark masses first, light hatching last.
  float sweep=dir<.5?v.x:(dir<1.5?1.-v.x:clamp(length((v-vec2(.5,.62))*asp)/(.62*asp.x),0.,1.));
  float ord=.5*sweep+.2*vn(v*asp*3.2+7.3)+.12*vn(v*R/(13.*dpr))+.18*(1.-smoothstep(.02,.5,Kb));
  float vis=smoothstep(0.,.11,ink*1.14-ord);
  float wet=vis*(1.-vis)*4.;
  K=mix(K,max(K,Kb*1.5),wet*.8);                      // at the front the ink is still wet and wide

  // the raking light
  vec2 dl=(v-L)*asp;
  float dist=length(dl);
  vec2 ld=dl/(dist+1e-4);
  float pool=exp(-dist*dist*1.9);
  vec2 gp=v*R/(2.*dpr);
  float tooth=fbm(gp);
  float relief=tooth-fbm(gp+ld*1.2);
  vec2 off=ld*F.xy*(2.2*dpr)/R;
  float emb=keyOf(texture2D(T,iu-off,1.6).rgb)-keyOf(texture2D(T,iu+off,1.6).rgb);

  // the second ink is laid a hair out of register, as second inks are
  vec3 cs=texture2D(T,iu+F.xy*vec2(1.6,-1.1)*dpr/R).rgb;
  float S=smoothstep(.05,.2,sat(cs))*step(key,.5);
  float cool=clamp((c.b-c.r)*5.5,0.,1.)*step(.5,key);

  vec3 col=P;
  if(key<1.5){
    // day: two inks on the warm sheet
    col*=1.+(relief*(.2-.09*inside)+(pool-.42)*.12)*mo+.03*inside;
    col*=1.+bevel*dot(ldm,-ld)*.2*mo;                 // the plate mark, lit from wherever the light is
    // a light inside the picture
    float lit=0.;
    if(G.x>.5){
      vec2 d=(iu-G.yz)*vec2(ia,1.);
      float breath=.88+.12*sin(t*.7);
      if(G.x<1.5){                                     // a lamp: a cone falling on the table
        float cone=smoothstep(1.05,.5,abs(d.x)/(d.y+.03))*smoothstep(-.012,.03,d.y);
        lit=cone/(1.+4.5*dot(d,d))*breath;
        col*=1.-.13*(1.-lit)*m;
        col=mix(col,col*1.12+vec3(.07,.055,.02),lit*G.w*m);
      }else if(G.x<2.5){                               // a door ajar: a blade of light across the floor
        vec2 dv=normalize(vec2(.7,.36));
        float al=dot(d,dv),ac=dot(d,vec2(-dv.y,dv.x));
        float open=.6+.4*breath;
        float blade=smoothstep(.004+al*.2*open,0.,abs(ac))*smoothstep(-.004,.012,al)*exp(-al*4.2);
        float slit=exp(-pow(d.x/.0035,2.))*step(d.y,.004)*smoothstep(-.215,-.19,d.y);
        float halo=exp(-dot(d,d)/.004)*.35;
        lit=clamp(max(blade,slit)+halo,0.,1.);
        col=mix(col,vec3(1.,.975,.9),lit*G.w*m*vis);
      }else{                                           // the far end of the hall
        lit=exp(-dot(d,d)/.03)*breath;
        col=mix(col,col*1.1+vec3(.06,.05,.03),lit*G.w*m);
      }
    }
    float vs=smoothstep(.55,1.,ink)*spot;
    col=mix(col,C2*(.9+.2*tooth),S*vs*m*.9*(1.-.5*lit*step(1.5,G.x)));
    if(key>.5){
      // every screen: the same page, the same moment
      vec3 mm=texture2D(M,iu).rgb;
      float on=smoothstep(.5,.95,ink)*mo;
      float scr=step(.1,mm.b);
      float scan=exp(-pow((fract(t*.09)*1.5-.25-v.y)*6.,2.));
      vec3 face=vec3(.935,.975,1.)*(.95+.05*sin(t*5.3+v.y*30.))*(1.+.1*scan);
      float txt=notice(mm.rg,(mm.b-.2)/.8,t)*scr;
      vec3 scol=mix(face,vec3(.2,.26,.34),txt*.86);
      float lam=max(scr,cool*(1.-scr)*.8);
      col=mix(col,mix(face,scol,scr),lam*on);
      float kb=clamp(sat(texture2D(T,iu,5.2).rgb)*7.,0.,1.);
      col+=vec3(.6,.82,1.)*kb*(1.-lam)*on*(.26+.1*scan);
    }
    float bite=smoothstep(.06,.92,K*(.84+.34*tooth));   // the paper's tooth takes the line unevenly
    col=mix(col,vec3(.15,.115,.08),bite*vis*m);
    col*=1.+emb*.5*vis*m;
  }else{
    // night: the same plate, printed white on the dark sheet
    float d=smoothstep(.06,.7,K*(.86+.3*tooth));
    float mist=fbm(vec2(v.x*3.+t*.012,v.y*7.))*smoothstep(.34,.6,v.y)*smoothstep(.92,.66,v.y);
    col=P*(1.+relief*.5*m+pool*.5*m);
    col+=vec3(.3,.19,.08)*smoothstep(.5,1.,v.y)*m*.5;               // the town's own glow, low on the sheet
    col=mix(col,vec3(.93,.86,.7)*(.74+.4*pool),d*vis*m*(1.-cool));
    col+=vec3(.42,.34,.22)*mist*.085*m;
    // the lamps, in berthing order
    float on=smoothstep(.5,1.,ink)*m;
    float wave=.72+.28*sin(t*.9-v.x*7.+v.y*3.);
    vec3 c5=texture2D(T,iu,4.6).rgb;
    float kb=clamp((c5.b-c5.r)*5.5,0.,1.);
    float beam=0.;
    for(int i=1;i<7;i++){float fi=float(i);vec3 cc=texture2D(T,iu-vec2(0.,fi*.021*F.y),4.).rgb;beam+=clamp((cc.b-cc.r)*5.5,0.,1.)*(1.-fi/7.5);}
    col=mix(col,vec3(1.,.9,.62)*(.8+.3*wave),clamp(cool*1.6,0.,1.)*on);
    col+=vec3(1.,.58,.2)*clamp(kb*5.,0.,1.)*(1.-cool)*on*.5*wave;
    col+=vec3(1.,.72,.36)*clamp(beam*1.3,0.,1.)*on*(.2+.25*mist)*wave;
    col+=vec3(1.,.7,.4)*max(emb,0.)*.2*vis*m;
  }
  // over-composite onto the real sheet: the smallest alpha that reproduces col on P
  vec3 dk=(P-col)/max(P,vec3(1e-3)),lt=(col-P)/max(1.-P,vec3(1e-3));
  float a=clamp(max(max(max(dk.r,dk.g),dk.b),max(max(lt.r,lt.g),lt.b)),0.,1.);
  vec3 C=a>1e-4?clamp((col-P*(1.-a))/a,0.,1.):vec3(0.);
  gl_FragColor=vec4(C*a,a);
}`;

const STAMP = `precision highp float;
varying vec2 v;
uniform sampler2D T;   // the die: white where it prints
uniform vec2 R;
uniform float t,seed,dpr;
${NOISE}
void main(){
  float press=clamp(t/.12,0.,1.);
  float spread=1.-exp(-max(t-.06,0.)*3.2);           // ink creeping into the fibres, then stopping
  float sharp=texture2D(T,v).r;
  float soft=texture2D(T,v,2.4).r;
  float edge=mix(sharp,soft,.55);
  vec2 gp=v*R/dpr;
  float tooth=fbm(gp/1.7+seed);                      // the paper's tooth takes the ink unevenly
  float pres=.62+.5*vn(v*vec2(3.2,2.1)+seed*3.)+.28*(v.x-.5);  // the hand is never square to the sheet
  float th=mix(.62,.4,spread)+(tooth-.5)*.34-(pres-.8)*.22;
  float cov=smoothstep(th-.07,th+.07,edge)*press;
  cov*=mix(.62,1.,smoothstep(.3,.75,fbm(gp/6.+seed*2.)+pres*.45));   // starved patches
  float halo=smoothstep(.02,.4,soft)*(1.-cov)*.12*spread;            // the faint bleed round the letters
  vec3 red=mix(vec3(.74,.17,.13),vec3(.6,.1,.08),smoothstep(.55,1.,soft)*tooth);
  float a=clamp(cov*.93+halo,0.,1.);
  gl_FragColor=vec4(red*a,a);
}`;

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

export function mountPress(opts = {}) {
  const reduced = !!opts.reduced;
  const glc = document.createElement('canvas');
  const ctxOpts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'default' };
  let gl = null;
  try { gl = glc.getContext('webgl', ctxOpts) || glc.getContext('experimental-webgl', ctxOpts); } catch (e) { gl = null; }
  if (!gl) return null;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('press: shader', gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const program = frag => {
    const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('press: link', gl.getProgramInfoLog(p)); return null; }
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  };
  const plateProg = program(PLATE), stampProg = program(STAMP);
  if (!plateProg || !stampProg) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);

  // an empty screen map for plates that have none
  const blank = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const MAXTEX = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048, 2048);
  // WebGL1 only mip-maps power-of-two textures, so each source is resampled onto one.
  const texture = src => {
    const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
    const pot = n => Math.min(MAXTEX, Math.pow(2, Math.round(Math.log2(clamp(n, 256, 2048)))));
    const c = document.createElement('canvas');
    c.width = pot(iw); c.height = pot(ih);
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(src, 0, 0, c.width, c.height);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { tex, aspect: iw / ih };
  };

  const phone = () => innerWidth < 720;
  const ratio = (w, h) => {
    let d = Math.min(devicePixelRatio || 1, phone() ? 2 : 1.5);
    const cap = phone() ? 1.5e6 : 2.6e6;                       // drawing-buffer budget per plate
    if (w * h * d * d > cap) d = Math.sqrt(cap / (w * h));
    return d;
  };
  const fit = (w, h) => {
    if (glc.width < w || glc.height < h) { glc.width = Math.max(glc.width, w); glc.height = Math.max(glc.height, h); }
  };
  // draw into the lower-left corner of the shared buffer, then hand that rectangle over
  const present = (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(glc, 0, glc.height - h, w, h, 0, 0, w, h);
  };

  const KEYS = { screens: 1, night: 2 }, DIRS = { right: 0, left: 1, out: 2 };
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, at: -1e9, fine: matchMedia('(hover: hover) and (pointer: fine)').matches };
  const plates = [], stamps = [];
  let raf = 0, lost = false, lastTick = 0, now0 = performance.now(), idle = 0;

  /* ── plates ── */
  [].slice.call(document.querySelectorAll('[data-plate]')).forEach(el => {
    const img = el.querySelector('img'), cv = el.querySelector('canvas');
    if (!img || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const focus = (el.dataset.focus || '0.5,0.5').split(',').map(Number);
    const edge = (el.dataset.edge || '0.05,0.06,0.05,0.06').split(',').map(Number);
    plates.push({
      el, img, cv, ctx, focus, edge, key: KEYS[el.dataset.key] || 0, dir: DIRS[el.dataset.dir] || 0,
      paper: (el.dataset.paper || '0.859,0.788,0.651').split(',').map(Number),
      spotc: (el.dataset.spot || '245,222,107').split(',').map(n => n / 255),
      lamp: (el.dataset.light || '0,0,0,0').split(',').map(Number),
      mark: el.hasAttribute('data-mark') ? 1 : 0, maps: el.dataset.screens || '', map: null, mapSrc: '', par: 0,
      tex: null, src: '', near: false, seen: false, t0: -1, ink: 0, spot: 0, w: 0, h: 0, d: 1, dirty: true, light: [0.3, 0.3], drift: 0, lit: false,
    });
  });

  const load = pl => {
    const go = () => {
      if (lost) return;
      const src = pl.img.currentSrc || pl.img.src;
      if (pl.src === src && pl.tex) return;
      if (!pl.img.naturalWidth) return;
      if (pl.tex) gl.deleteTexture(pl.tex.tex);
      try { pl.tex = texture(pl.img); } catch (e) { console.warn('press: plate not inked; the print stays', e); pl.tex = null; unveil(pl); return; }
      pl.src = src; pl.dirty = true; kick();
      if (pl.maps) loadMap(pl, src.replace(/\.jpg(\?.*)?$/, '-screens.png'));
    };
    if (pl.img.complete && pl.img.naturalWidth) go();
    pl.img.addEventListener('load', go);
    pl.img.addEventListener('error', () => unveil(pl));
    if (pl.img.loading === 'lazy') pl.img.loading = 'eager';
  };
  // the hero's screen map sits beside its print: <scene>.jpg -> <scene>-screens.png
  const loadMap = (pl, url) => {
    if (pl.mapSrc === url) return;
    pl.mapSrc = url;
    const im = new Image();
    im.onload = () => {
      if (lost || pl.mapSrc !== url) return;
      if (pl.map) gl.deleteTexture(pl.map);
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im); } catch (e) { gl.deleteTexture(tex); return; }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);
      pl.map = tex; pl.dirty = true; kick();
    };
    im.src = url;
  };
  // a plate that cannot be drawn shows its print instead
  const unveil = pl => { pl.el.classList.remove('is-lit'); pl.img.style.opacity = '1'; pl.lit = false; };

  const size = pl => {
    const r = pl.cv.getBoundingClientRect();
    const cw = Math.max(1, r.width), ch = Math.max(1, r.height);
    const d = ratio(cw, ch), w = Math.round(cw * d), h = Math.round(ch * d);
    if (w !== pl.w || h !== pl.h) { pl.w = w; pl.h = h; pl.d = d; pl.cv.width = w; pl.cv.height = h; pl.dirty = true; }
    return r;
  };

  const drawPlate = (pl, now) => {
    const r = size(pl);
    const vh = innerHeight;
    if (r.bottom < -40 || r.top > vh + 40) return false;
    // the light: the pointer when there is one, otherwise it crosses the plate as the plate crosses the screen
    const across = clamp((r.top + r.height * 0.5) / vh, -0.3, 1.3);
    let lx = 0.22 + 0.56 * (1 - across), ly = 0.2 + 0.25 * across;
    const fresh = pointer.fine && now - pointer.at < 6000;
    if (fresh) {
      const px = (pointer.x - r.left) / r.width, py = (pointer.y - r.top) / r.height;
      const wgt = clamp(1 - (now - pointer.at - 4000) / 2000, 0, 1);
      lx += (clamp(px, -0.4, 1.4) - lx) * wgt; ly += (clamp(py, -0.4, 1.4) - ly) * wgt;
    }
    if (reduced) { lx = 0.3; ly = 0.24; }
    const drift = reduced ? 0 : clamp(across - 0.5, -0.8, 0.8);
    // the street's parallax: the pointer when there is one, otherwise a slow walk
    let par = reduced ? 0 : (fresh ? clamp((pointer.x / innerWidth - 0.5) * 2, -1, 1) : Math.sin((now - now0) / 5200) * 0.55);
    if (Math.abs(lx - pl.light[0]) + Math.abs(ly - pl.light[1]) + Math.abs(drift - pl.drift) + Math.abs(par - pl.par) > 0.0015) { pl.light = [lx, ly]; pl.drift = drift; pl.par = par; pl.dirty = true; }

    // the ink
    let inking = false;
    if (reduced) { if (pl.ink !== 1) { pl.ink = 1; pl.spot = 1; pl.dirty = true; } }
    else if (pl.t0 >= 0) {
      const e = (now - pl.t0) / 1000;
      const ink = ease(e / (pl.key === 1 ? 3.4 : 2.9)), spot = ease((e - 1.5) / 1.6);
      if (ink !== pl.ink || spot !== pl.spot) { pl.ink = ink; pl.spot = spot; pl.dirty = true; }
      inking = ink < 1 || spot < 1;
    }
    const live = !reduced && (pl.key > 0 || pl.lamp[0] > 0) && pl.ink > 0.5;   // screens, lamps and lights keep time
    if (!pl.dirty && !live) return inking;
    pl.dirty = false;

    fit(pl.w, pl.h);
    gl.viewport(0, 0, pl.w, pl.h);
    gl.useProgram(plateProg.p);
    const u = plateProg.u, ca = pl.w / pl.h, ia = pl.tex.aspect;
    let fx = 1, fy = 1, ox = 0, oy = 0;
    if (ca > ia) { fy = ia / ca; oy = (1 - fy) * pl.focus[1]; } else { fx = ca / ia; ox = (1 - fx) * pl.focus[0]; }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pl.tex.tex);
    gl.uniform1i(u.T, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, pl.map || blank); gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u.M, 1);
    gl.uniform3f(u.C2, pl.spotc[0], pl.spotc[1], pl.spotc[2]);
    gl.uniform4f(u.G, pl.lamp[0], pl.lamp[1], pl.lamp[2], pl.lamp[3]);
    gl.uniform1f(u.mark, pl.mark);
    gl.uniform1f(u.par, pl.par);
    gl.uniform1f(u.ia, ia);
    gl.uniform2f(u.R, pl.w, pl.h);
    gl.uniform4f(u.F, fx, fy, ox, oy);
    gl.uniform4f(u.E, pl.edge[0], pl.edge[1], pl.edge[2], pl.edge[3]);
    gl.uniform3f(u.P, pl.paper[0], pl.paper[1], pl.paper[2]);
    gl.uniform2f(u.L, pl.light[0], pl.light[1]);
    gl.uniform1f(u.t, reduced ? 3.2 : (now - now0) / 1000);
    gl.uniform1f(u.ink, pl.ink);
    gl.uniform1f(u.spot, pl.spot);
    gl.uniform1f(u.key, pl.key);
    gl.uniform1f(u.dir, pl.dir);
    gl.uniform1f(u.drift, pl.drift);
    gl.uniform1f(u.dpr, pl.d);
    gl.scissor(0, 0, pl.w, pl.h); gl.enable(gl.SCISSOR_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
    present(pl.ctx, pl.w, pl.h);
    if (!pl.lit) { pl.lit = true; pl.el.classList.add('is-lit'); }
    return inking || live;
  };

  /* ── stamps ── */
  // The die is typed from the stamp's own text, so the canvas never says anything the page does not.
  const die = (text, w, h) => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 512, 256);
    const bw = 512 * (1 - 44 / w), bh = 256 * (1 - 44 / h), bx = (512 - bw) / 2, by = (256 - bh) / 2;
    x.strokeStyle = '#fff'; x.lineWidth = Math.max(8, bh * 0.085);
    const r = 10; x.beginPath();
    x.moveTo(bx + r, by); x.arcTo(bx + bw, by, bx + bw, by + bh, r); x.arcTo(bx + bw, by + bh, bx, by + bh, r); x.arcTo(bx, by + bh, bx, by, r); x.arcTo(bx, by, bx + bw, by, r); x.closePath(); x.stroke();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    let fs = bh * 0.56;
    const spaced = text.toUpperCase().split('').join(' ');
    x.font = '700 ' + fs + 'px "Courier Prime","Courier New",monospace';
    const tw = x.measureText(spaced).width;
    if (tw > bw * 0.84) { fs *= bw * 0.84 / tw; x.font = '700 ' + fs + 'px "Courier Prime","Courier New",monospace'; }
    x.fillText(spaced, 256, 128 + fs * 0.06);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  };
  [].slice.call(document.querySelectorAll('[data-stamp-gl]')).forEach((el, i) => {
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    el.appendChild(cv);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    stamps.push({ el, cv, ctx, tex: null, t0: -1, w: 0, h: 0, d: 1, seed: 3.7 + i * 11.3, done: false, near: false, waits: el.hasAttribute('data-stamp-wait') });
  });
  const drawStamp = (st, now) => {
    if (st.done || st.t0 < 0) return false;
    const r = st.cv.getBoundingClientRect();
    if (r.width < 2) return true;
    if (!st.tex) {
      st.d = Math.min(devicePixelRatio || 1, 2);
      st.w = Math.round(r.width * st.d); st.h = Math.round(r.height * st.d);
      st.cv.width = st.w; st.cv.height = st.h;
      st.tex = die(st.el.textContent.trim(), r.width, r.height);
    }
    const t = reduced ? 9 : (now - st.t0) / 1000;
    fit(st.w, st.h);
    gl.viewport(0, 0, st.w, st.h);
    gl.useProgram(stampProg.p);
    const u = stampProg.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, st.tex);
    gl.uniform1i(u.T, 0);
    gl.uniform2f(u.R, st.w, st.h);
    gl.uniform1f(u.t, t);
    gl.uniform1f(u.seed, st.seed);
    gl.uniform1f(u.dpr, st.d);
    gl.scissor(0, 0, st.w, st.h); gl.enable(gl.SCISSOR_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
    present(st.ctx, st.w, st.h);
    st.el.classList.add('is-inked');
    if (t > 2.2) st.done = true;                         // the ink has stopped; the canvas keeps the print
    return !st.done;
  };

  /* ── the loop: only while something on screen is changing ── */
  const frame = now => {
    raf = 0;
    if (lost || document.hidden) return;
    if (pointer.fine) { pointer.x += (pointer.tx - pointer.x) * 0.14; pointer.y += (pointer.ty - pointer.y) * 0.14; }
    let again = pointer.fine && Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y) > 0.4;
    // time-only motion (screens, lamps) is held to about 30 frames a second
    const slow = now - lastTick < 30;
    let needFast = again;
    plates.forEach(pl => { if (pl.near && pl.tex && (pl.dirty || pl.ink < 1 || pl.spot < 1)) needFast = true; });
    if (!slow || needFast) {
      lastTick = now;
      plates.forEach(pl => { if (pl.near && pl.tex) again = drawPlate(pl, now) || again; });
    } else again = true;
    stamps.forEach(st => { again = drawStamp(st, now) || again; });
    if (again) kick();
  };
  const kick = () => { if (!raf && !lost) raf = requestAnimationFrame(frame); };

  if ('IntersectionObserver' in window) {
    const nearIO = new IntersectionObserver(es => es.forEach(e => {
      const pl = plates.find(p => p.el === e.target);
      if (!pl) return;
      pl.near = e.isIntersecting;
      if (pl.near) { if (!pl.tex) load(pl); pl.dirty = true; kick(); }
    }), { rootMargin: '60% 0px 60% 0px' });
    const seenIO = new IntersectionObserver(es => es.forEach(e => {
      const pl = plates.find(p => p.el === e.target);
      if (!pl || !e.isIntersecting || pl.seen) return;
      pl.seen = true; seenIO.unobserve(pl.el);
      const begin = () => { if (pl.tex) { pl.t0 = performance.now(); kick(); } else setTimeout(begin, 80); };
      begin();
    }), { threshold: 0.22 });
    plates.forEach(pl => { nearIO.observe(pl.el); seenIO.observe(pl.el); });
    const stIO = new IntersectionObserver(es => es.forEach(e => {
      const st = stamps.find(s => s.el === e.target);
      if (!st || !e.isIntersecting || st.waits) return;
      stIO.unobserve(st.el);
      setTimeout(() => { st.t0 = performance.now(); kick(); }, reduced ? 0 : 420);
    }), { threshold: 0.9 });
    stamps.forEach(st => stIO.observe(st.el));
  } else {
    plates.forEach(pl => { pl.near = true; pl.seen = true; load(pl); pl.t0 = performance.now(); });
    stamps.forEach(st => { if (!st.waits) st.t0 = performance.now(); });
  }

  addEventListener('scroll', () => { plates.forEach(pl => { if (pl.near) pl.dirty = true; }); kick(); }, { passive: true });
  addEventListener('resize', () => { plates.forEach(pl => { pl.dirty = true; if (pl.near) load(pl); }); kick(); });
  if (pointer.fine) addEventListener('pointermove', e => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (pointer.at < 0) { pointer.x = e.clientX; pointer.y = e.clientY; }
    pointer.tx = e.clientX; pointer.ty = e.clientY; pointer.at = performance.now();
    plates.forEach(pl => { if (pl.near) pl.dirty = true; });
    kick();
    clearTimeout(idle); idle = setTimeout(function fade() { plates.forEach(pl => { if (pl.near) pl.dirty = true; }); kick(); if (performance.now() - pointer.at < 6200) idle = setTimeout(fade, 60); }, 4000);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { plates.forEach(pl => { pl.dirty = true; }); kick(); } });
  glc.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; plates.forEach(unveil); stamps.forEach(st => st.el.classList.remove('is-inked')); if (opts.onLost) opts.onLost(); });
  kick();

  return {
    plates: plates.length,
    // press a waiting stamp now (the appeal box)
    stamp(el) { const st = stamps.find(s => s.el === el); if (st && st.t0 < 0) { st.t0 = performance.now() + (reduced ? 0 : 60); kick(); } },
  };
}
