// shade.js — the shaders of The Calculus of Fortune site. Hand-written WebGL, no libraries.
//
//   field     the page itself: laid paper under one gas mantle, with ruled rain printed on it. On the west side
//             of every screen the rain falls in step; on the east it scatters; downriver the scatter spreads
//             and the mantle, absolutely steady at the top of the page, begins to gutter.
//   plates    the scene engravings (assets/scenes/*.jpg), printed straight onto the page in ink and alive:
//             desk       the actuary's desk. Its lamp is lit; the needle of its meter is pinned dead still until
//                        the visitor comes near or the page starts downriver, and then it will not settle.
//             gantries   the scaffolded street. One tenement subsides, on rota, and is propped back up; with the
//                        visitor standing over it, it can neither fall nor stand.
//             occupation the checkpoint of filing cabinets. The plate posts its own mirror image back across the
//                        desk; under the pointer the visitor aims it.
//             unpinned   the lottery country. Every weathervane turns to its own time and the plate prints out
//                        of register, in the stamp's red and the carbon's violet.
//             registry   the wall of index drawers. Light travels along the brass; the one open drawer is the
//                        only thing on it that will not sit square.
//             plain      any other picture: printed in ink, steady in the west, losing its place in the east.
//   wax       the red seal on each cover is lit as wax; the light is the pointer, or the scroll.
//   crossing  the Curram at night, built here: a mezzotint sky, one engraved Meridian façade repeated without
//             deviation behind a ruled row of gas mantles, real water in which the reflections hold near the
//             west quay and break up as they run east, one mantle guttering, a barge taking the allocation
//             downriver, and the scaffolded Gantries standing in the water on their piles, lit by three lanterns.
//
// Every moment has its still already in the markup (the picture itself, or an SVG); a canvas is made the first
// time its element comes near the viewport and rests whenever it leaves. With WebGL absent, or in a hidden
// tab, nothing here runs. Under prefers-reduced-motion each moment paints one settled frame and stops.

const VERT = 'attribute vec2 aP;varying vec2 vUv;void main(){vUv=aP*.5+.5;gl_Position=vec4(aP,0.,1.);}';
const NOISE = `
float h1(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1.,0.)),f.x),mix(h1(i+vec2(0.,1.)),h1(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<3;i++){s+=a*vn(p);p=p*2.03+17.1;a*=.5;}return s/.875;}`;

// ---- the page: paper, light, ruled rain -----------------------------------------------------------
const FIELD = `precision highp float;
uniform vec2 uRes,uPtr;uniform float uScroll,uT,uPk,uEdge,uFade,uDpr,uDark,uPr;uniform vec3 uPaper,uInk,uGlow;
${NOISE}
void main(){
  vec2 px=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uDpr;      // css px, y down
  vec2 vp=uRes/uDpr;
  vec2 doc=px+vec2(0.,uScroll);                                  // the sheet scrolls; the lamp does not
  // the stock: pulp mottle, a little relief, fine grain
  float mott=fbm(doc*.0055);
  float g1=vn(doc*.52),g2=vn((doc+vec2(1.3,1.3))*.52);
  float relief=(g1-g2);
  float laid=.5+.5*sin(doc.y*1.9+vn(doc*.02)*4.);                // laid lines, barely there
  // one gas mantle, above and to the left; it leans a little toward the visitor. Light falls off as light does:
  // a bright pool under the mantle, a long penumbra, and the far corner of the sheet in shade.
  vec2 L=vec2(vp.x*.2,-vp.y*.22)+(uPtr-vp*.5)*.12*uPk;
  float d=length((px-L)/vec2(max(vp.x,vp.y*.9),vp.y*1.2));
  float gut=1.-uPr*(.05*vn(vec2(uT*2.3,3.))+.07*smoothstep(.62,.9,vn(vec2(uT*.7,9.))));   // steady in the Zone; downriver it gutters
  float pool=gut/(1.+d*d*1.7);
  float core=exp(-d*d*4.5)*gut;
  vec3 col=uPaper*mix(.845,1.04,pool)*(1.-(mott-.5)*mix(.07,.2,uDark));
  col=mix(col,col*vec3(.975,.97,.99),(1.-pool)*(1.-uDark));      // the shade is cool; the light is not
  col+=uGlow*(pool*mix(.045,.06,uDark)+core*mix(.05,.06,uDark));
  col+=relief*mix(.06,.03,uDark)*(.35+.65*pool);                 // the tooth of the paper shows where the light rakes it
  col-=(laid-.5)*.009*(1.-uDark);
  col-=(h1(doc)-.5)*.022;
  // ruled rain: steadiness in the west, scatter in the east
  float S=34.,Hc=44.;
  float sink=uPk*smoothstep(160.,20.,distance(px,uPtr));
  float fall=uT*9.;
  float a=0.;
  vec2 c0=floor(vec2(doc.x/S,(doc.y-fall)/Hc));
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 c=c0+vec2(float(i),float(j));
    float xc=(c.x+.5)*S;
    float e=clamp(smoothstep(uEdge-.2,uEdge+.3,xc/vp.x)+sink,0.,1.);
    float f=mix(floor(fall/4.)*4.,fall,e);                       // the west falls in step
    float r1=h1(c),r2=h1(c+7.3),r3=h1(c+3.7);
    if(r3<e*.38)continue;                                        // east of the frontier, some never arrive
    vec2 ctr=vec2(xc+e*(r1-.5)*40.+e*6.*sin(doc.y*.03+r2*6.28),(c.y+.5)*Hc+f+e*(r2-.5)*Hc*.9);
    vec2 away=px-uPtr;ctr+=normalize(away+.001)*sink*22.;
    vec2 dp=vec2(doc.x,doc.y)-ctr;
    a=max(a,smoothstep(1.9,.8,length(dp))*(.7+.3*r2));
  }
  a*=smoothstep(uFade-20.,uFade+160.,px.y)*mix(.2,.26,uDark);
  col=mix(col,uInk,a);
  gl_FragColor=vec4(col,1.);
}`;

// ---- the scene engravings: ink only, the paper drops out -----------------------------------------
// Texture space is the picture (0..1, y down); host space is the element it is printed in. uA, uB, uC and uD are
// the scene's own landmarks, in texture space, given in the markup as data-fx.
const PLATE_HEAD = `precision highp float;
uniform sampler2D uTex;uniform vec2 uRes,uPtr,uPtT,uLamp;uniform vec4 uCrop,uA,uB,uC,uD,uE,uFeather;
uniform float uT,uPk,uAsp,uTexAsp,uEast,uGo,uStill,uInkIn;uniform vec3 uInk;varying vec2 vUv;
${NOISE}
float lum(vec2 p){return dot(texture2D(uTex,p).rgb,vec3(.299,.587,.114));}
float inside(vec2 p){return step(0.,p.x)*step(p.x,1.)*step(0.,p.y)*step(p.y,1.);}
float inkAt(vec2 p){return smoothstep(.93,.12,lum(p))*inside(p);}
float nearT(vec2 c,float r0,float r1){return uPk*smoothstep(r0,r1,distance(uPtT*vec2(uTexAsp,1.),c*vec2(uTexAsp,1.)));}
`;
const PLAIN = `vec2 warp(vec2 p){return p;}
float press(vec2 p,float ink){return ink;}
vec4 glow(vec2 p){return vec4(0.);}
float thrash(){return 0.;}`;
const WARP = {
  plain: PLAIN,
  // THE DESK — uA: the meter's pivot (x, y), the needle's length, its engraved angle; uB: the lamp's globe (x, y, radius).
  // The engraved needle is lifted off the plate and drawn again here, so that it can move: pinned dead still at
  // its engraved reading until the visitor comes near or the page starts downriver, and then it will not settle.
  desk: `vec2 warp(vec2 p){return p;}
float globe(vec2 p){return length((p-uB.xy)*vec2(uTexAsp,1.))/uB.z;}
float along(vec2 d,float a,out float ac){vec2 dir=vec2(sin(a),-cos(a));ac=abs(dot(d,vec2(dir.y,-dir.x)));return dot(d,dir);}
float press(vec2 p,float ink){
  vec2 d=(p-uA.xy)*vec2(uTexAsp,1.);
  float ac,al=along(d,uA.w,ac);
  float old=smoothstep(.0075,.004,ac)*smoothstep(.016,.021,al)*(1.-smoothstep(uA.z+.003,uA.z+.007,al));
  vec2 side=vec2(cos(uA.w),sin(uA.w))*.011/vec2(uTexAsp,1.);
  ink=mix(ink,min(inkAt(p+side),inkAt(p-side)),old);                        // the dial's own face, where the needle was
  float k=max(nearT(uA.xy,.42,.12),uGo*.8)*(1.-uStill);
  float a=uA.w+k*(.42*sin(uT*1.3)*sin(uT*.47+1.)+.16*sin(uT*3.1)+.06*(vn(vec2(uT*9.,2.))-.5));
  al=along(d,a,ac);
  float u=al/uA.z;
  float hw=u<.66?.0013:mix(.0034,.0002,(u-.66)/.34);
  float nd=smoothstep(hw+.001,hw,ac)*smoothstep(.012,.016,al)*step(u,1.);
  ink=max(ink,nd*.94);
  return ink*(1.-.5*(1.-smoothstep(.8,1.03,globe(p))));}
vec4 glow(vec2 p){
  float r=globe(p);
  float a=(1.-smoothstep(.82,1.03,r))*.2+smoothstep(.9,1.05,r)*exp(-max(r-1.,0.)*1.25)*.13;
  return vec4(vec3(.89,.663,.235)*a,a);}
float thrash(){return 0.;}`,
  // THE GANTRIES — uA: one tenement (x0, x1, its roof, the ground). Every eleven seconds it goes, at once, and
  // is propped back up slowly. With the visitor over it, the schedule cannot complete: it neither falls nor stands.
  gantries: `vec2 warp(vec2 p){
  float c=mod(uT,11.);
  float s=smoothstep(3.,3.35,c)*(1.-smoothstep(6.5,10.,c));
  float near=nearT(vec2((uA.x+uA.y)*.5,(uA.z+uA.w)*.5),.34,.08);
  s=mix(s,.3+.4*vn(vec2(uT*6.,1.)),near)*(1.-uStill);
  float band=smoothstep(uA.x-.003,uA.x+.003,p.x)*(1.-smoothstep(uA.y-.003,uA.y+.003,p.x))*step(p.y,uA.w);
  float k=.035*s;
  vec2 w=p;
  w.y=mix(p.y,uA.w-(uA.w-p.y)/(1.-k),band);                                  // the floors telescope toward the street
  float hgt=clamp((uA.w-p.y)/(uA.w-uA.z),0.,1.3);
  w.x-=band*hgt*hgt*.007*s;                                                 // and it leans a little further
  return w;}
float press(vec2 p,float ink){return ink;}
vec4 glow(vec2 p){return vec4(0.);}
float thrash(){return 0.;}`,
  // THE OCCUPATION — uA.x: the hinge. The plate's mirror image is posted back across it, faint, and swings from
  // one side to the other; the visitor aims it: stand left of the hinge and it posts left.
  occupation: `vec2 warp(vec2 p){return p;}
float press(vec2 p,float ink){
  float s=.5+.5*sin(uT*.42-1.2);
  s=mix(s,smoothstep(uA.x+.08,uA.x-.08,uPtT.x),uPk)*(1.-uStill)+uStill*.5;
  vec2 m=vec2(2.*uA.x-p.x,p.y)+vec2(.0016*sin(p.y*52.+uT*1.3),0.);
  float side=mix(smoothstep(uA.x-.02,uA.x+.02,p.x),1.-smoothstep(uA.x-.02,uA.x+.02,p.x),s);   // which bank receives it
  return max(ink,inkAt(m)*.3*side*smoothstep(uA.z,uA.z+.04,p.y));}
vec4 glow(vec2 p){return vec4(0.);}
float thrash(){return 0.;}`,
  // THE UNPINNED COUNTRY — uA, uB, uC, uD: weathervanes (the pole's x, the vane's top, its half-width, its foot).
  // Each turns to its own time: skill is decoupled from result.
  unpinned: `float vane(vec2 p,vec4 v,float ph,out float x){
  float m=(1.-smoothstep(v.z*.86,v.z,abs(p.x-v.x)))*smoothstep(v.y-.012,v.y,p.y)*(1.-smoothstep(v.w-.012,v.w,p.y))*step(.0001,v.z);
  float f=cos(uT*(.5+.37*ph)+ph*5.+1.6*sin(uT*.21+ph*3.));
  f=mix(f,cos(uT*3.+ph*2.),nearT(vec2(v.x,(v.y+v.w)*.5),.2,.04));
  f=mix(f,.86,uStill);
  float q=(p.x-v.x)/(sign(f)*max(abs(f),.06));
  x=abs(q)>v.z?-2.:v.x+q;
  return m;}
vec2 warp(vec2 p){
  vec2 w=p;float x,m;
  m=vane(p,uA,.13,x);w.x=mix(w.x,x,step(.5,m));
  m=vane(p,uB,.71,x);w.x=mix(w.x,x,step(.5,m));
  m=vane(p,uC,.38,x);w.x=mix(w.x,x,step(.5,m));
  m=vane(p,uD,.92,x);w.x=mix(w.x,x,step(.5,m));
  m=vane(p,uE,.55,x);w.x=mix(w.x,x,step(.5,m));
  // and the fine lines in the sky have come unpinned: they wander
  float sky=(1.-smoothstep(.36,.46,p.y))*(1.-uStill);
  w+=sky*.006*vec2(vn(vec2(p.y*16.+uT*.4,p.x*8.))-.5,vn(vec2(p.x*14.-uT*.35,p.y*10.+5.))-.5);
  return w;}
float press(vec2 p,float ink){return ink;}
vec4 glow(vec2 p){return vec4(0.);}
float thrash(){return 1.;}`,
  // THE REGISTRY — uA: the open drawer (x, y, half-width, half-height). Everything else on the wall is square.
  registry: `vec2 warp(vec2 p){
  vec2 d=(p-uA.xy)/uA.zw;
  float m=(1.-smoothstep(.8,1.,abs(d.x)))*(1.-smoothstep(.8,1.,abs(d.y)));
  float k=(.4+.6*nearT(uA.xy,.3,.05))*(1.-uStill);
  return p+m*k*vec2(.0016*sin(uT*.9)+.001*sin(uT*2.3),.0012*sin(uT*.7+1.));}
float press(vec2 p,float ink){return ink;}
vec4 glow(vec2 p){return vec4(0.);}
float thrash(){return 0.;}`
};
const PLATE_MAIN = `
void main(){
  vec2 h=vec2(vUv.x,1.-vUv.y);
  vec2 uv=uCrop.xy+h*uCrop.zw;
  vec2 w=warp(uv);
  vec2 asp=vec2(uAsp,1.);
  // toward the east of every plate, and more the further downriver it hangs, fine lines lose their place
  float east=uEast*smoothstep(.3,1.,h.x)*(1.-uStill);
  w+=east*.0018*(vec2(vn(uv*vec2(70.,46.)+uT*.6),vn(uv*vec2(70.,46.)+9.-uT*.5))-.5);
  // ...and so do they near the visitor
  float k=uPk*smoothstep(.2,0.,distance(h*asp,uPtr*asp));
  w+=k*.0045*(vec2(vn(uv*110.+uT*2.),vn(uv*110.+9.-uT*2.))-.5);
  float ink=press(uv,inkAt(w));
  // letterpress: the lip of each impression catches the gaslight, from wherever the lamp stands
  vec2 e=1.3/uRes*uCrop.zw;
  vec2 ld=normalize((h-uLamp)*asp+vec2(.0001));
  float gx=lum(w+vec2(e.x,0.))-lum(w-vec2(e.x,0.)),gy=lum(w+vec2(0.,e.y))-lum(w-vec2(0.,e.y));
  float rim=clamp((gx*ld.x+gy*ld.y)*3.4,-1.,1.);
  float hi=max(rim,0.)*(1.-ink)*.42,sh=max(-rim,0.)*(1.-ink)*.2;
  float a=clamp(ink+sh,0.,1.);
  vec3 col=uInk*a+vec3(1.,.98,.94)*hi*(1.-a);
  float A=a+hi*(1.-a);
  // the Thrash: two more plates, out of register and never still
  float th=thrash();
  if(th>.5){
    vec2 o=vec2(.0021+.0011*sin(uT*.61)*(1.-uStill),.0006*sin(uT*.43+1.)*(1.-uStill))*uCrop.zw*2.;
    float r=inkAt(w+o)*(1.-a)*.4,v=inkAt(w-o*.85)*(1.-a)*.46;
    col+=vec3(.639,.118,.133)*r+vec3(.329,.29,.42)*v*(1.-r);
    A=clamp(A+r+v*(1.-r),0.,1.);
  }
  vec4 g=glow(uv);
  col=col*(1.-g.a)+g.rgb;A=A*(1.-g.a)+g.a;
  vec4 F=max(uFeather,vec4(.0001));
  float fe=smoothstep(0.,F.x,h.x)*smoothstep(0.,F.y,h.y)*smoothstep(0.,F.z,1.-h.x)*smoothstep(0.,F.w,1.-h.y);
  // the impression is taken west to east: behind the roller the ink is whole, at its edge it is still wet and broken
  float edge=uInkIn*1.35-.15+(fbm(uv*vec2(6.,40.))-.5)*.16;
  float laid=smoothstep(edge,edge-.14,h.x);
  laid*=mix(1.,smoothstep(.2,.7,vn(uv*vec2(260.,180.))+laid),smoothstep(edge-.2,edge,h.x));
  gl_FragColor=vec4(col,A)*fe*laid;
}`;

// ---- the covers: the seal is wax, and wax takes light ---------------------------------------------
const COVER = `precision highp float;
uniform sampler2D uTex;uniform vec2 uRes,uPtr;uniform float uT,uPk,uGo;varying vec2 vUv;
void main(){
  vec2 uv=vec2(vUv.x,1.-vUv.y);
  vec3 c=texture2D(uTex,uv).rgb;
  float wax=smoothstep(.15,.33,c.r-max(c.g,c.b));
  float asp=491./760.;
  vec2 sc=vec2(.888,.168);
  vec2 q=(uv-sc)*vec2(1.,1./asp)/.074;                                    // the seal, in radii
  vec2 e=1.2/uRes;
  float hx=texture2D(uTex,uv+vec2(e.x,0.)).r-texture2D(uTex,uv-vec2(e.x,0.)).r;
  float hy=texture2D(uTex,uv+vec2(0.,e.y)).r-texture2D(uTex,uv-vec2(0.,e.y)).r;
  vec3 N=normalize(vec3(q*.6-vec2(hx,hy)*3.2,1.));                        // a shallow dome with the wax's own grain
  vec2 lp=mix(vec2(-.7+.25*sin(uT*.23),-1.+uGo*1.6),(uPtr-sc)*vec2(1.,1./asp)/.074*.5,uPk);
  vec3 L=normalize(vec3(lp,1.15));
  vec3 H=normalize(L+vec3(0.,0.,1.));
  float spec=pow(max(dot(N,H),0.),42.),diff=max(dot(N,L),0.);
  vec3 col=mix(c,c*(.66+.55*diff)+vec3(1.,.86,.78)*spec*.9,wax);
  // the stock under the same light
  vec2 lpos=mix(vec2(.15,.05+uGo*.5),uPtr,uPk);
  float sheen=1.-smoothstep(0.,.9,distance(uv*vec2(asp,1.),lpos*vec2(asp,1.)));
  col*=1.-(1.-wax)*.06*(1.-sheen);
  col+=(1.-wax)*vec3(.04,.032,.018)*sheen;
  gl_FragColor=vec4(col,1.);
}`;

// ---- the Curram --------------------------------------------------------------------------------------
// A built scene, not a picture: sky, quay, lamps, water and light are all computed here. Three engraved elements
// from one sheet (assets/scenes/crossing-kit.jpg) are its only pictures: a single Meridian façade, repeated without
// deviation along the west quay; a row of scaffolded tenements on piles for the east bank; a barge.
// The survey is 1600 x 700, fitted to the band; uW, uE, uBr are the elements' places on the sheet.
const WATER = `precision highp float;
uniform sampler2D uTex;uniform vec2 uRes,uOff,uPtr;uniform vec4 uW,uE,uBr,uBarge;uniform vec2 uWd,uEd;
uniform float uK,uDpr,uT,uPk,uFlick,uFlickB,uShift,uStill;uniform vec3 uL0,uL1,uL2;
${NOISE}
const vec3 gas=vec3(.89,.663,.235);
const float Q=236.;
float lumAt(vec4 r,vec2 q){return texture2D(uTex,r.xy+clamp(q,.003,.997)*r.zw).r;}
float inkAt(vec4 r,vec2 q){return (1.-lumAt(r,q))*step(0.,q.x)*step(q.x,1.)*step(0.,q.y)*step(q.y,1.);}
float wave(vec2 p,float t){return fbm(vec2(p.x*.021+t*.045,p.y*.08-t*.1));}
// an engraved element as a body in the dark: where its ink is dense it blocks what lies behind
float body(vec4 r,vec2 q,vec2 px){
  float a=inkAt(r,q);
  a+=inkAt(r,q+vec2(px.x,0.))+inkAt(r,q-vec2(px.x,0.))+inkAt(r,q+vec2(0.,px.y))+inkAt(r,q-vec2(0.,px.y));
  a+=inkAt(r,q+px*.7)+inkAt(r,q-px*.7)+inkAt(r,q+vec2(px.x,-px.y)*.7)+inkAt(r,q-vec2(px.x,-px.y)*.7);
  return smoothstep(.05,.2,a/9.);}
vec2 eastQ(vec2 p,float top){
  float u=p.x/uEd.x,i=floor(u),f=u-i;
  if(mod(i,2.)>.5)f=1.-f;                                                  // the row runs on, turned about, never twice the same way round
  return vec2(f,(p.y-top)/uEd.y);}
float lampE(vec2 p,vec3 L,float chop,float t){
  float ly=L.y+uShift-10.;if(L.z<.5||p.y>ly)return 0.;
  float d=ly-p.y;
  float wob=(vn(vec2(p.y*.11+t*.8,L.x))-.5)*(12.+d*.3)*chop;               // east-bank light does not keep its line
  float w=2.6+d*.03;
  float dash=smoothstep(.4,.62,vn(vec2(p.x*.05+L.x,p.y*.4+t*1.5)));
  return exp(-pow((p.x-L.x+wob)/w,2.))*exp(-d/95.)*dash;}
void main(){
  vec2 css=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uDpr;
  vec2 p=(css-uOff)/uK;                                                    // the 1600 x 700 survey
  float t=uT*(1.-uStill)+3.*uStill;
  float li=floor(p.x/40.),lx=li*40.+20.;
  float b=abs(li-uFlick)<.5?uFlickB:1.;
  vec3 col;
  float top=Q-uWd.y;
  if(p.y<Q+7.){
    // the sky, laid like a mezzotint ground
    col=mix(vec3(.052,.074,.104),vec3(.066,.094,.132),smoothstep(0.,Q,p.y));
    col+=(vn(vec2(p.x*.9,p.y*.33))-.5)*.012;
    if(p.y>top&&p.y<Q){
      // Meridian: one module, repeated without deviation, lit from the quay
      vec2 q=vec2(fract(p.x/uWd.x),(p.y-top)/uWd.y);
      float s=lumAt(uW,q);
      float up=Q-p.y;
      float pool=exp(-pow((p.x-lx)/26.,2.))*exp(-up/46.)*b;                  // each mantle's light on the stone
      vec3 stone=mix(vec3(.105,.132,.172),vec3(.2,.235,.285),exp(-up/120.))*s*1.25;
      stone+=gas*s*(.11*exp(-up/60.)+.36*pool);
      col=stone;
    }
    if(p.y>=Q)col=mix(vec3(.03,.042,.058),vec3(.2,.22,.25),smoothstep(1.4,0.,p.y-Q));     // the quay's lip
    // the row of mantles: posts, flames, haloes
    float post=smoothstep(1.3,.6,abs(p.x-lx))*step(Q-15.,p.y)*step(p.y,Q);
    col=mix(col,vec3(.02,.028,.04),post);
    float r=distance(p,vec2(lx,Q-18.));
    float core=smoothstep(3.,1.2,r);
    float halo=exp(-r*r/46.)*.5+exp(-r/22.)*.2;
    col+=gas*(core+halo)*b+vec3(1.,.95,.8)*core*b*.4;
  } else {
    float e=clamp((p.y-(Q+7.))/(700.-Q-7.),0.,1.);                         // 0 at the west bank, 1 at the east
    float chop=mix(.07,1.,smoothstep(.16,.7,e));                             // the west half holds; the east wanders
    float h0=wave(p,t),hx=wave(p+vec2(6.,0.),t)-h0,hy=wave(p+vec2(0.,3.),t)-h0;
    vec2 dq=(p-uPtr)*vec2(1.,2.4);float rr=length(dq);
    float rip=uPk*sin(rr*.2-t*6.)*exp(-rr/130.);                             // the visitor's ripple
    float sx=(hx*9.+rip*.5*dq.x/max(rr,1.))*chop;
    col=mix(vec3(.04,.058,.086),vec3(.074,.106,.15),e);
    col+=(hy*1.7+rip*.05)*chop*vec3(.1,.14,.19);
    float dist=p.y-Q;
    // Meridian, upside down in the water: whole near the quay, then gone
    vec2 qr=vec2(fract((p.x+sx*14.)/uWd.x),1.-dist*1.05/uWd.y);
    float sr=lumAt(uW,qr)*step(0.,qr.y);
    col+=vec3(.16,.19,.235)*sr*exp(-dist/52.)*.5*(1.-.5*chop);
    // the row: each mantle's light lies on the water as one unwavering line near the quay,
    // and breaks into moving dashes as it runs out toward the east bank
    float wob=(vn(vec2(p.y*.085-t*.55,li*3.1))-.5)*15.*chop+sx*2.2;
    float w=1.+5.5*e*chop;
    float dash=mix(1.,smoothstep(.36,.6,vn(vec2(p.x*.045+li,p.y*.42-t*1.3))),smoothstep(.04,.42,e));
    float streak=exp(-pow((p.x-lx+wob)/w,2.))*exp(-dist/250.)*dash;
    col+=gas*streak*b*.95;
    col+=gas*exp(-dist/22.)*.1*b;                                            // light spilled at the foot of the quay
    col+=vec3(.5,.6,.72)*pow(max(0.,hy*chop*9.),2.)*.05;                     // the sky's little light on each facet
    col+=gas*(lampE(p,uL0,chop,t)+lampE(p,uL1,chop,t)+lampE(p,uL2,chop,t))*.8;
    // the barge, taking the allocation downriver, and its one lantern
    vec2 qb=(p-uBarge.xy)/uBarge.zw;
    vec2 lan=uBarge.xy+uBarge.zw*vec2(.93,.1);
    float d3=p.y-(uBarge.y+uBarge.w);
    if(d3>0.){float wb=(vn(vec2(p.y*.12-t*.7,9.))-.5)*(4.+d3*.25)*chop;col+=gas*exp(-pow((p.x-lan.x+wb)/(1.5+d3*.05),2.))*exp(-d3/110.)*.8*smoothstep(.3,.6,vn(vec2(p.x*.05,p.y*.45-t*1.4)));
      col*=1.-.5*exp(-d3/7.)*step(uBarge.x,p.x)*step(p.x,uBarge.x+uBarge.z);}
    if(qb.x>0.&&qb.x<1.&&qb.y>-.3&&qb.y<1.){
      float mb=body(uBr,qb,vec2(.012,.05));
      float lb=lumAt(uBr,qb);
      float gl=exp(-pow(distance(p,lan)/26.,2.));
      col=mix(col,vec3(.022,.03,.042)+vec3(.2,.22,.25)*lb*.7+gas*lb*gl*.8,mb);
    }
    float rl=distance(p,lan);
    col+=gas*(smoothstep(2.6,1.,rl)+exp(-rl*rl/38.)*.45+exp(-rl/15.)*.14);
    col=mix(col,vec3(.085,.115,.155),smoothstep(Q+100.,Q,p.y)*.14);          // a little mist under the quay
    // the Gantries: the near bank, standing in the water on its piles
    float topE=700.-uEd.y+uShift;
    if(p.y>topE-4.){
      vec2 qe=eastQ(p,topE);
      float me=body(uE,qe,vec2(4.2/uEd.x,4.2/uEd.y));
      float le=lumAt(uE,qe);
      float lit=exp(-pow(distance(p,uL0.xy+vec2(0.,uShift))/70.,2.))*uL0.z+exp(-pow(distance(p,uL1.xy+vec2(0.,uShift))/70.,2.))*uL1.z+exp(-pow(distance(p,uL2.xy+vec2(0.,uShift))/70.,2.))*uL2.z;
      vec3 bank=vec3(.024,.031,.042)+vec3(.43,.4,.35)*le*le*(.27+.13*smoothstep(1.,.2,qe.y))+gas*le*lit*.66;
      col=mix(col,bank,me);
    }
    // the dice-shrine lanterns
    for(int i=0;i<3;i++){
      vec3 L=i==0?uL0:i==1?uL1:uL2;
      float r=distance(p,L.xy+vec2(0.,uShift));
      col+=gas*L.z*(smoothstep(2.8,1.1,r)+exp(-r*r/50.)*.5+exp(-r/20.)*.16);
    }
  }
  col+=(h1(p*3.1)-.5)*.014;                                                  // the tooth of the night plate
  gl_FragColor=vec4(col,1.);
}`;

// ---- plumbing ------------------------------------------------------------------------------------------
const ptr = { x: -9999, y: -9999, on: false, end: 0, k: 0 };
let ptrBound = false;
function bindPointer() {
  if (ptrBound) return; ptrBound = true;
  addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; ptr.end = 0; }, { passive: true });
  const touch = e => { const t = e.touches[0]; if (!t) return; ptr.x = t.clientX; ptr.y = t.clientY; ptr.on = true; ptr.end = 0; };
  addEventListener('touchstart', touch, { passive: true }); addEventListener('touchmove', touch, { passive: true });
  addEventListener('touchend', () => { ptr.end = performance.now(); }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { ptr.on = false; });
}
function tickPointer(now, dt) {
  if (ptr.end && now - ptr.end > 900) { ptr.on = false; ptr.end = 0; }
  ptr.k += ((ptr.on ? 1 : 0) - ptr.k) * (1 - Math.exp(-dt / (ptr.on ? 0.2 : 0.6)));
}

function program(canvas, frag, alpha) {
  let gl = null;
  try { gl = canvas.getContext('webgl', { alpha, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'low-power' }); } catch (e) {}
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let p;
  try {
    p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  } catch (e) { console.warn('shade: a shader failed; its still holds', e); const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); return null; }
  gl.useProgram(p);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(p, 'aP'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  if (alpha) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0); }
  const U = {};
  return {
    gl, u: n => (n in U ? U[n] : (U[n] = gl.getUniformLocation(p, n))),
    size(w, h, cap) { const d = Math.min(cap, devicePixelRatio || 1), W = Math.max(2, Math.round(w * d)), H = Math.max(2, Math.round(h * d)); if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; } gl.viewport(0, 0, W, H); return d; },
    draw() { if (alpha) gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); },
    texture(img) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; },
    lose() { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
  };
}

let STILL = false;      // prefers-reduced-motion: one settled frame per moment, repainted only when the layout moves
// one shader moment: alive only while its host is near the viewport
function moment(host, o) {
  const st = { g: null, cv: null, raf: 0, last: 0, t0: performance.now(), ready: false, painted: false, failed: false, im: null, dirty: true };
  // Off-screen a moment simply rests: its loop stops and its context is kept. Contexts are made once and never
  // thrown away, because Safari counts a released context against its limit of sixteen until it is collected, and
  // then takes the oldest one away (the page itself). The landing page makes ten in all; a book page three.
  const stop = () => { cancelAnimationFrame(st.raf); st.raf = 0; };
  const frame = now => {
    st.raf = STILL ? 0 : requestAnimationFrame(frame);
    if (document.hidden || !st.g) return;
    if (!st.ready) { if (STILL) st.raf = requestAnimationFrame(frame); return; }
    if (!STILL && o.fps && now - st.last < 1000 / o.fps - 3) return;
    const dt = Math.min(0.1, (now - (st.last || now)) / 1000); st.last = now;
    if (!STILL) tickPointer(now, dt);
    const box = (o.box || st.cv).getBoundingClientRect(); if (box.width < 2) return;
    const d = st.g.size(st.cv.clientWidth, st.cv.clientHeight, o.dpr || 1.5);
    o.uniforms(st.g, STILL ? (o.settle || 0) : (now - st.t0) / 1000, box, d, st);
    st.g.draw();
    if (!st.painted) { st.painted = true; host.classList.add('shaded'); if (o.onPaint) o.onPaint(); }
  };
  const kick = () => { if (STILL && st.g && !st.raf) st.raf = requestAnimationFrame(frame); };
  const start = () => {
    if (st.failed) return;
    if (st.g) { if (!st.raf) st.raf = requestAnimationFrame(frame); return; }
    const cv = o.canvas || document.createElement('canvas');
    if (!o.canvas) { cv.className = 'shade'; cv.setAttribute('aria-hidden', 'true'); host.appendChild(cv); }
    st.cv = cv; st.g = program(cv, o.frag, !!o.alpha);
    if (!st.g) { st.failed = true; if (!o.canvas) cv.remove(); st.cv = null; if (o.onFail) o.onFail(); return; }
    const mine = st.g;
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); if (st.g === mine) { cancelAnimationFrame(st.raf); st.raf = 0; st.failed = true; st.g = null; host.classList.remove('shaded'); if (!o.canvas) cv.remove(); } }, { once: true });
    if (o.img) {
      const im = new Image(); im.decoding = 'async'; im.src = o.img();
      const up = () => { if (st.g !== mine) return; st.g.texture(im); st.im = im; st.ready = true; };
      (im.decode ? im.decode() : Promise.reject()).then(up, () => { im.onload = up; if (im.complete && im.naturalWidth) up(); });
    } else st.ready = true;
    st.raf = requestAnimationFrame(frame);
  };
  if (STILL) { addEventListener('resize', kick); if (o.scrolls) addEventListener('scroll', kick, { passive: true }); }
  if (o.always || !('IntersectionObserver' in window)) start();
  else new IntersectionObserver(es => { es[0].isIntersecting ? start() : stop(); }, { rootMargin: o.margin || '45% 0px' }).observe(host);       // plates fetch their picture well before they are reached
  return st;
}

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const nums = (s, n) => { const a = (s || '').split(/[\s,]+/).filter(Boolean).map(Number); while (a.length < n) a.push(0); return a; };
// how the picture is cut to its frame: the same sum the browser does for object-fit: cover
function crop(im, box, fx, fy) {
  const ta = im.naturalWidth / im.naturalHeight, ba = box.width / box.height;
  let sw = 1, sh = 1; if (ba > ta) sh = ta / ba; else sw = ba / ta;
  return [(1 - sw) * fx, (1 - sh) * fy, sw, sh, ta];
}

export function mountShaders(cfg) {
  cfg = cfg || {};
  STILL = !!cfg.still;
  if (!window.WebGLRenderingContext) return { crossing: null };
  if (!STILL) bindPointer();
  const rnd = cfg.rnd || Math.random, out = { crossing: null };
  const INK = hex('#1B1712');
  const lampAt = box => [(innerWidth * 0.2 - box.left) / box.width, (-innerHeight * 0.22 - box.top) / box.height];      // the page's mantle, as this element sees it

  // the page
  const field = document.querySelector('[data-field]');
  if (field) {
    const fadeEl = document.querySelector('[data-field-after]');
    const paper = hex(cfg.dark ? '#101720' : '#F2EDE2'), ink = hex(cfg.dark ? '#B9C2CC' : '#1B1712'), glow = hex(cfg.dark ? '#5E7FA0' : '#E3A93C');
    const fm = moment(field, { canvas: field, frag: FIELD, always: true, scrolls: true, fps: 30, dpr: 1.25, box: field, onPaint: () => field.classList.add('on'), uniforms: (g, t, box, d) => {
      const gl = g.gl, H = Math.max(1, document.documentElement.scrollHeight - innerHeight), pr = Math.min(1, scrollY / H);
      gl.uniform2f(g.u('uRes'), field.width, field.height); gl.uniform1f(g.u('uDpr'), d);
      gl.uniform1f(g.u('uScroll'), scrollY); gl.uniform1f(g.u('uT'), t);
      gl.uniform2f(g.u('uPtr'), ptr.x, ptr.y); gl.uniform1f(g.u('uPk'), ptr.k);
      gl.uniform1f(g.u('uEdge'), 0.88 - 0.72 * pr); gl.uniform1f(g.u('uPr'), STILL ? 0 : pr);
      gl.uniform1f(g.u('uFade'), fadeEl ? fadeEl.getBoundingClientRect().bottom : -400);
      gl.uniform1f(g.u('uDark'), cfg.dark ? 1 : 0);
      gl.uniform3f(g.u('uPaper'), paper[0], paper[1], paper[2]); gl.uniform3f(g.u('uInk'), ink[0], ink[1], ink[2]); gl.uniform3f(g.u('uGlow'), glow[0], glow[1], glow[2]);
    } });
    if (fm.failed) return { crossing: null };              // no WebGL after all: every still holds, and the 2D river takes over
  }

  // the living plates
  document.querySelectorAll('[data-plate]').forEach(host => {
    const kind = WARP[host.getAttribute('data-plate')] ? host.getAttribute('data-plate') : 'plain', img = host.querySelector('img'); if (!img) return;
    const fo = nums(host.getAttribute('data-focus') || '50 50', 2), fe = nums(host.getAttribute('data-feather'), 4);
    const east = parseFloat(host.getAttribute('data-east') || '0.3');
    let fx = null, fxOf = null;
    const born = performance.now();
    moment(host, { frag: PLATE_HEAD + WARP[kind] + PLATE_MAIN, alpha: true, dpr: 2, settle: 1.2, margin: '160% 0px', img: () => img.currentSrc || img.src, uniforms: (g, t, box, d, st) => {
      if (fxOf !== st.im) { fxOf = st.im; fx = nums((/-phone\./.test(st.im.src) && host.getAttribute('data-fx-phone')) || host.getAttribute('data-fx'), 20); st.t1 = performance.now(); }   // a narrow screen may be served another cut of the picture
      const gl = g.gl, c = crop(st.im, box, fo[0] / 100, fo[1] / 100), px = (ptr.x - box.left) / box.width, py = (ptr.y - box.top) / box.height, L = lampAt(box);
      gl.uniform2f(g.u('uRes'), gl.drawingBufferWidth, gl.drawingBufferHeight); gl.uniform1f(g.u('uT'), t + 1.7 * kind.length);
      gl.uniform4f(g.u('uCrop'), c[0], c[1], c[2], c[3]); gl.uniform1f(g.u('uTexAsp'), c[4]);
      gl.uniform2f(g.u('uPtr'), px, py); gl.uniform2f(g.u('uPtT'), c[0] + px * c[2], c[1] + py * c[3]); gl.uniform1f(g.u('uPk'), STILL ? 0 : ptr.k);
      gl.uniform2f(g.u('uLamp'), L[0], L[1]);
      gl.uniform1f(g.u('uAsp'), box.width / box.height); gl.uniform3f(g.u('uInk'), INK[0], INK[1], INK[2]);
      gl.uniform1f(g.u('uEast'), east); gl.uniform1f(g.u('uStill'), STILL ? 1 : 0);
      gl.uniform1f(g.u('uGo'), Math.min(1, Math.max(0, scrollY / (innerHeight * 0.7))));
      // the impression: the first time a plate comes into view the ink is laid down across it, west to east
      const seen = box.top < innerHeight * 0.92 && box.bottom > 0;
      if (seen && !st.inkAt) st.inkAt = performance.now();
      const laid = STILL ? 1 : st.inkAt ? Math.min(1, (performance.now() - st.inkAt) / 800) : 0;
      gl.uniform1f(g.u('uInkIn'), laid);
      if (laid < 1 !== st.inking) { st.inking = laid < 1; host.classList.toggle('inking', st.inking); }      // until the ink has crossed the plate, the still shows faintly beneath it
      gl.uniform4f(g.u('uFeather'), fe[0], fe[1], fe[2], fe[3]);
      ['uA', 'uB', 'uC', 'uD', 'uE'].forEach((n, i) => gl.uniform4f(g.u(n), fx[i * 4], fx[i * 4 + 1], fx[i * 4 + 2], fx[i * 4 + 3]));
    } });
  });

  // the wax
  document.querySelectorAll('[data-wax]').forEach(host => {
    const img = host.querySelector('img'); if (!img) return;
    moment(host, { frag: COVER, dpr: 2, fps: 40, scrolls: true, img: () => img.currentSrc || img.src, uniforms: (g, t, box) => {
      const gl = g.gl;
      gl.uniform2f(g.u('uRes'), gl.drawingBufferWidth, gl.drawingBufferHeight); gl.uniform1f(g.u('uT'), t);
      gl.uniform2f(g.u('uPtr'), (ptr.x - box.left) / box.width, (ptr.y - box.top) / box.height);
      gl.uniform1f(g.u('uPk'), STILL ? 0 : ptr.k * Math.max(0, 1 - Math.hypot(ptr.x - (box.left + box.width / 2), ptr.y - (box.top + box.height / 2)) / (box.width * 2.2)));
      gl.uniform1f(g.u('uGo'), Math.min(1, Math.max(0, (box.top + box.height / 2) / innerHeight)));    // where the cover is on the screen: the light slides as the page scrolls
    } });
  });

  // the river
  const sec = document.querySelector('[data-crossing]'), far = sec && sec.querySelector('.cx-far');
  if (sec && far && sec.getAttribute('data-kit')) {
    const A = k => nums(sec.getAttribute('data-' + k), 4);
    const sheet = A('sheet'), west = A('west'), east = A('east'), barge = A('barge');           // the sheet's size, then each element's box on it, in px
    const rect = r => [r[0] / sheet[0], r[1] / sheet[1], r[2] / sheet[0], r[3] / sheet[1]];
    const WH = 150, EH = 268, BW = 250;                                                         // survey heights of the two banks; the barge's length
    const WW = WH * west[2] / west[3], EW = EH * east[2] / east[3], BH = BW * barge[3] / barge[2];
    const lamps = (sec.getAttribute('data-lamps') || '').split(';').filter(Boolean).map(s => s.split(',').map(Number));     // east-bank lanterns: x along the row (0..1 of one length), y from its top (0..1)
    const tab = Array.from({ length: 64 }, () => rnd());
    const noise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return tab[i & 63] * (1 - u) + tab[(i + 1) & 63] * u; };
    const ff = (rnd() < 0.5 ? 0.14 : 0.64) + rnd() * 0.22;                   // the one irregular light: seeded, never centred
    const info = { flick: 0 };
    const m = moment(far, { frag: WATER, dpr: 1.5, settle: 3, box: far, img: () => sec.getAttribute('data-kit'), onFail: () => { out.crossing = null; }, uniforms: (g, t, box, d) => {
      const gl = g.gl, w = box.width, h = box.height, k = Math.max(w / 1600, h / 700), ox = (w - 1600 * k) / 2, oy = (h - 700 * k) / 2;
      const x0 = -ox / k, x1 = x0 + w / k;
      info.flick = Math.min(39, Math.max(0, Math.round((x0 + (x1 - x0) * ff - 20) / 40)));
      let b = 0.5 + 0.42 * noise(t * 1.9); if (noise(t * 0.43 + 17) > 0.6) b *= 0.22 + 0.5 * noise(t * 8.3 + 5);     // guttering: slow, irregular, never quite out
      if (STILL) b = 0.4;
      // depth: the near bank rides a little ahead of the far one as the band scrolls through
      const pr = Math.min(1, Math.max(0, (innerHeight - box.top) / (innerHeight + h))), shift = STILL ? 0 : (0.5 - pr) * 46 / k;
      // the barge: ninety seconds bank to bank, the allocation going downriver on schedule
      const bx = x0 + (((STILL ? 30 : t) * 0.011 + 0.38) % 1.25 - 0.14) * (x1 - x0), by = 236 + 62;
      // the lanterns that fall inside the visible stretch of the east row
      const all = [];
      for (let sgi = Math.floor(x0 / EW) - 1; sgi <= Math.floor(x1 / EW) + 1; sgi++) lamps.forEach(q => { const u = Math.abs(sgi) % 2 ? 1 - q[0] : q[0], x = (sgi + u) * EW; if (x > x0 + 24 && x < x1 - 24) all.push([x, 700 - EH + q[1] * EH]); });
      all.sort((a, c) => a[0] - c[0]);
      const L = all.length <= 3 ? all : [all[0], all[Math.floor(all.length / 2)], all[all.length - 1]];      // three lanterns for the whole bank, set wide apart
      gl.uniform2f(g.u('uRes'), gl.drawingBufferWidth, gl.drawingBufferHeight); gl.uniform1f(g.u('uDpr'), d); gl.uniform1f(g.u('uK'), k); gl.uniform2f(g.u('uOff'), ox, oy);
      gl.uniform1f(g.u('uT'), t); gl.uniform1f(g.u('uFlick'), info.flick); gl.uniform1f(g.u('uFlickB'), b); gl.uniform1f(g.u('uShift'), shift); gl.uniform1f(g.u('uStill'), STILL ? 1 : 0);
      gl.uniform2f(g.u('uPtr'), (ptr.x - box.left - ox) / k, (ptr.y - box.top - oy) / k); gl.uniform1f(g.u('uPk'), STILL ? 0 : ptr.k);
      [['uW', west], ['uE', east], ['uBr', barge]].forEach(([n, r]) => { const q = rect(r); gl.uniform4f(g.u(n), q[0], q[1], q[2], q[3]); });
      gl.uniform2f(g.u('uWd'), WW, WH); gl.uniform2f(g.u('uEd'), EW, EH);
      gl.uniform4f(g.u('uBarge'), bx, by, BW, BH);
      ['uL0', 'uL1', 'uL2'].forEach((n, i) => { const q = L[i]; gl.uniform3f(g.u(n), q ? q[0] : 0, q ? q[1] : 0, q ? 1 : 0); });
    } });
    if (!m.failed) out.crossing = { get flick() { return info.flick; }, webgl: true };
  }
  return out;
}
