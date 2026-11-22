// light.js — the six rooms of The Seventh Watch, and the light in them. Hand-written WebGL, no libraries.
// Each realm is a painted plate (oil, in the manner of its book's cover) standing in a bay of the
// hull. Nothing shows a plate as it is: the page hangs a lamp over it, rakes that lamp's light across
// real paint ridges, parts the picture into depths that move against each other, and lets the
// realm's own weather act on it.
//   I   Karsk          the day fails early: the sky goes down to plum as the room passes, dust rides the last light
//   II  the Sound      the sea draws down: a sheet of water withdraws up the silt toward the horizon and leaves it shining
//   III the Kiln       the wall of dawn walks in: its front advances, the air before it shakes, every lamp in the city gutters
//   IV  the Still      time gone thick: strings of drops that take a minute to fall, and a picture that answers the hand late
//   V   the Ingathering  two lights that never shared an hour come into step, and lanterns cross the one bridge from both sides
//   VI  the Far Shore  the sky is made of cells, and it fails along a seam; the sun lays its road on the water
// One WebGL context for the whole page. It draws off screen and each room's own <canvas> is filled
// from it, so the rooms scroll with the page and nothing swims.

// Where things are in each plate (fractions of the picture, y downward): hz the horizon, fx the
// subject. The page puts hz on the room's seam line and fx on its focal point.
// m is the strip of the plate that the phone version of the file holds (left, right).
export const PLATES = {
  hero:     { hz: 0.625, fx: 0.52, m: [0.20, 0.84] },
  // the hero's near ridge: crest is the height of its skyline, gap the clear space between two walkers
  // through which the far gate is seen
  herofg:   { crest: 0.70, gap: 0.441, m: [0.18, 0.72] },
  karsk:    { hz: 0.655, fx: 0.69, sx: 0.73, m: [0.39, 0.99], sun: [0.13, 0.565] },
  sound:    { hz: 0.513, fx: 0.52, sx: 0.47, m: [0.21, 0.83] },
  kiln:     { hz: 0.664, fx: 0.66, sx: 0.77, m: [0.36, 0.96], wall: 0.76, lean: 0.165 },
  still:    { hz: 0.61, fx: 0.628, m: [0.33, 0.93] },
  ingather: { hz: 0.59, fx: 0.502, m: [0.19, 0.81], by: 0.565, bx0: 0.02, bx1: 0.93 },
  shore:    { hz: 0.656, fx: 0.50, m: [0.19, 0.81], ox0: 0.212, ox1: 0.798, oy0: -0.05, seam: 0.30, sun: 0.50 },
};
// (sx, where given, is the part of the plate its bay in the seam shows)
export const ORDER = ['karsk', 'sound', 'kiln', 'still', 'ingather', 'shore'];
const g = (n) => (Math.round(n * 10000) / 10000).toFixed(4);

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

const COMMON = `
precision highp float;
uniform vec2 uRes,uPtr,uPtrL,uLampP;
uniform vec4 uFit;
uniform float uT,uS,uDpr,uTexOn,uFlip,uAsp;
uniform vec2 uCrop;                       // the phone's plate is a strip cut from the whole one: (left edge, 1/width)
uniform sampler2D uPaint,uA;
vec2 P;
float h11(float n){return fract(sin(n*127.1)*43758.5453);}
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+17.;a*=.5;}return s;}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 T(vec2 a){return texture2D(uA,clamp(vec2((a.x-uCrop.x)*uCrop.y,a.y),.002,.998)).rgb;}
// motes: sparse points adrift, each with its own slow pulse
float motes(vec2 a,float s,vec2 drift){
  vec2 q=a*s+drift;vec2 i=floor(q),f=fract(q)-.5;float r=h21(i);
  vec2 o=(vec2(h21(i+3.1),h21(i+7.7))-.5)*.7;
  float tw=.5+.5*sin(uT*(.5+r*1.3)+r*40.);
  return step(.82,r)*tw*smoothstep(.09,0.,length(f-o));}
// a point of light in a hashed cell: round, never a block
float spark(vec2 p,float n,float cut){vec2 i=floor(p*n),f=fract(p*n)-.5;float r=h21(i);
  vec2 o=(vec2(h21(i+1.7),h21(i+5.3))-.5)*.6;return step(cut,r)*smoothstep(.16,0.,length(f-o));}
// depth of a ground plane below the horizon: 0 at the horizon and in the sky, 1 at our feet
float ground(vec2 a,float hz){return pow(smoothstep(hz-.01,1.,a.y),1.25);}
// the plate as a made thing: real paint ridges catch the light of the room's lamp (l = toward it), then grain
vec3 surface(vec3 c,vec2 frag,vec2 l){
  if(uTexOn>.5){
    vec2 uv=frag/(uDpr*620.);
    float a=texture2D(uPaint,uv).r,b=texture2D(uPaint,uv+l*.0022).r;
    c*=1.+clamp((a-b)*6.5,-.4,.5)*.17;
    c*=.95+.10*a;
  }
  c+=(h21(frag+fract(uT)*71.)-.5)*.02;
  return c;}
// the room's lamp: a pool of light, falling off into the hull's dark
float lampI(vec2 frag,float base,float gain,float k){
  vec2 d=(frag-uLampP)/uRes.y;return base+gain/(1.+dot(d,d)*k);}
`;

// ── I · Karsk ───────────────────────────────────────────────────────────────────────────────
const KARSK = (K) => `
vec3 karsk(vec2 a,float s){
  float hz=${g(K.hz)};
  float dusk=smoothstep(-.8,.95,s);
  float dep=ground(a,hz);
  float band=exp(-pow((a.y-hz)/.05,2.));
  vec2 q=a-P*vec2(.016,.008)*(dep+.12)+vec2(sin(a.y*260.+uT*1.7)*.0007*band,-s*.012*dep);
  vec3 c=T(q);
  float sky=1.-smoothstep(hz-.07,hz+.01,a.y);
  // the day fails: the sky goes down to plum, the ground keeps a little ember
  c*=mix(vec3(1.),mix(vec3(.78,.60,.50),vec3(.50,.42,.58),sky),dusk*.78);
  c+=vec3(1.,.40,.13)*exp(-pow((a.y-hz)/.11,2.))*.13*(1.-.6*dusk);
  ${K.sun ? `c+=vec3(1.,.55,.2)*exp(-length((a-vec2(${g(K.sun[0])},${g(K.sun[1])}))*vec2(uAsp,1.))*5.)*.30*(1.-.75*dusk)*(.94+.06*sin(uT*.7));` : ''}
  c+=vec3(1.,.9,.8)*spark(a*vec2(uAsp,1.),60.,.84)*sky*smoothstep(.45,.1,a.y)*dusk*(.5+.5*sin(uT*1.3+a.x*90.))*.8;
  // dust in the last light, and motes
  float dust=pow(fbm(vec2(a.x*4.2-uT*.03,a.y*11.+uT*.006)),2.3);
  c+=vec3(1.,.56,.28)*dust*.30*smoothstep(hz-.22,hz+.12,a.y)*smoothstep(1.,hz+.1,a.y)*(1.-.5*dusk);
  c+=vec3(1.,.8,.55)*motes(a*vec2(uAsp,1.),38.,vec2(-uT*.07,uT*.013))*.5*(1.-.4*dusk);
  return c;}
`;

// ── II · the Sound ──────────────────────────────────────────────────────────────────────────
const SOUND = (K) => `
vec3 sound(vec2 a,float s){
  float hz=${g(K.hz)};
  float ebb=smoothstep(-.85,.85,s);
  float dep=ground(a,hz);
  vec2 q=a-P*vec2(.016,.008)*(dep+.1)+vec2(0.,-s*.012*dep);
  // where the sea stands now: it lies down the far silt from the horizon to this line, and it is going
  float L=mix(hz+.062,hz+.006,ebb)+.0025*sin(a.x*23.+uT*.5)+.0015*sin(a.x*57.-uT*.8);
  float dp=a.y-hz;
  float under=smoothstep(.003,-.003,a.y-L)*step(0.,dp);
  vec2 rip=vec2(sin(a.y*420.+uT*1.3+a.x*20.),cos(a.y*260.-uT))*.0012;
  vec3 c=T(q+rip*under);
  float l0=lum(c);
  // standing things rise out of the water: only what is pale and level takes the sea
  float flat_=smoothstep(.42,.58,l0)*smoothstep(.09,.02,abs(l0-lum(T(q+vec2(0.,.010)))))*smoothstep(.09,.02,abs(l0-lum(T(q+vec2(.008,0.)))));
  float w=under*flat_*.85;
  vec3 wat=mix(c*vec3(.60,.80,.86),vec3(.30,.56,.62),.35*smoothstep(0.,.08,L-a.y));
  float sp=sin(a.x*uAsp*230.+sin(a.y*560.+uT*1.2)*2.+uT*.7)*sin(a.y*980.-uT*1.7+a.x*40.);
  float gl=smoothstep(.72,1.,sp);
  wat+=vec3(.86,.94,.98)*gl*.5;
  c=mix(c,wat,w);
  c=mix(c,vec3(.96,.98,.97),smoothstep(.003,0.,abs(a.y-L))*.7*step(0.,dp)*(.3+.7*flat_));
  // the pools it has left on the floor still hold the sky, and give it back in points; they dry as the sea goes
  float pool=smoothstep(.56,.74,l0)*smoothstep(hz+.02,hz+.10,a.y);
  float sp2=sin(a.x*uAsp*150./(.4+dp*3.)+sin(dp*300.+uT*.9)*2.)*sin(dp*520.-uT*1.2+a.x*17.);
  c+=vec3(.90,.96,1.)*smoothstep(.80,1.,sp2)*pool*.42*(1.-.55*ebb);
  c=mix(c,c*vec3(.90,.92,.94),pool*ebb*.25);
  // sea mist along the line of the world
  float mist=fbm(vec2(a.x*3.2+uT*.02,a.y*16.-uT*.004));
  c=mix(c,vec3(.90,.93,.93),smoothstep(.35,.8,mist)*exp(-abs(a.y-hz)*24.)*.36);
  return c;}
`;

// ── III · the Kiln ──────────────────────────────────────────────────────────────────────────
const KILN = (K) => `
vec3 kiln(vec2 a,float s){
  float hz=${g(K.hz)};
  float adv=smoothstep(-.85,.95,s);
  float dep=ground(a,hz);
  // the front of the dawn: it starts where the painted wall stands and walks toward the city
  float front=${g(K.wall)}+.01-.12*adv+(a.y-hz)*${g(K.lean)}+.005*sin(a.y*34.+uT*.7)+.012*(vn(vec2(a.y*5.,uT*.2))-.5);
  float d=a.x-front;
  float heat=smoothstep(-.16,.02,d);
  vec2 q=a-P*vec2(.014,.007)*(dep+.1)+vec2((vn(vec2(a.x*70.,a.y*90.-uT*2.2))-.5)*.0022*heat,-s*.01*dep);
  vec3 c=T(q);
  float l=lum(c);
  // every lamp in the city, guttering as the morning comes on
  float warm=smoothstep(.02,.2,c.r-c.b);
  float lamps=smoothstep(.34,.66,l)*warm*(1.-smoothstep(-.45,-.05,d));
  c+=c*lamps*(.30+.45*sin(uT*(1.6+2.*h21(floor(a*vec2(140.,90.))))+a.x*90.+a.y*70.));
  c+=vec3(1.,.46,.13)*exp(min(d,0.)*5.)*.22*(.84+.16*sin(uT*.8));
  // no edge is drawn: the morning comes on as a swell of light, and what it reaches burns brighter
  float burn=smoothstep(-.07,.14,d);
  c=mix(c,c*vec3(1.42,1.12,.84)+vec3(.9,.42,.08)*.16,burn*.8*adv);
  c+=vec3(1.,.6,.2)*motes(a*vec2(uAsp,1.),54.,vec2(uT*.02,uT*.11))*heat*1.2;
  return c;}
`;

// ── IV · the Still ──────────────────────────────────────────────────────────────────────────
const STILL = (K) => `
float stillStr(vec2 p,float n,float sz,float sp,float seed){
  float E=1.3/uRes.y;
  float col=floor(p.x*n);float r=h11(col+seed);
  float x0=(col+.5+(r-.5)*.5)/n;float dx=p.x-x0;
  float bot=.86-1.0*h11(col+seed+2.);                           // how far down this string hangs
  float yy=-p.y+uT*sp*(.6+.8*h11(col+seed+5.))+r*3.;
  float cell=sz*7.5;float k=floor(yy/cell);float fy=(fract(yy/cell)-.5)*cell;
  float rr=h11(k*1.7+col*3.1+seed);
  float rad=sz*(.5+.7*rr);
  float d=fy<0.?length(vec2(dx,fy))-rad:abs(dx)-rad*(1.-fy/(2.4*rad));
  float bead=smoothstep(E,-E,d)*step(.25,rr);
  float rim=bead*smoothstep(-rad*.5,0.,d)*.5;                     // glass: bright at its edge, clear within
  float hi=smoothstep(rad*.4,0.,length(vec2(dx+rad*.32,fy-rad*.15)))*bead;
  float thr=smoothstep(E*1.1,0.,abs(dx))*.06;
  return (bead*.22+rim+hi*.9+thr)*step(.3,r)*smoothstep(bot,bot-.03,p.y);}
vec3 still(vec2 a,float s){
  float hz=${g(K.hz)};
  float dep=ground(a,hz);
  // time, thick: the picture answers the hand late, and wavers like something seen through deep water
  vec2 w=vec2(vn(vec2(a.y*2.6,uT*.035)),vn(vec2(a.x*2.6+5.,uT*.03)))-.5;
  vec2 q=a-uPtrL*vec2(.022,.012)*(dep+.25)+w*.006+vec2(0.,-s*.01*dep);
  vec3 c=T(q);
  // what falls leaves its fall behind it
  vec3 sm=c;float ws=1.;
  for(int i=1;i<4;i++){float f=float(i);float wt=1.-f*.25;sm+=T(q-vec2(0.,f*.012)).rgb*wt;ws+=wt;}
  sm/=ws;
  float up=1.-smoothstep(hz-.25,hz+.1,a.y);
  c=mix(c,max(c,sm*1.08),up*.6);
  float shaft=exp(-pow((a.x-${g(K.fx)}+(a.y-.5)*.03)/.16,2.));
  c*=.92+.16*shaft*(.6+.4*sin(uT*.13));
  // strings of drops that take a minute to fall
  vec2 p=vec2(a.x*uAsp,a.y)+vec2(uPtrL.x*.02,0.);
  float dr=stillStr(p,34.,.0030,.0022,1.)*.6;
  dr+=stillStr(p+vec2(.013,0.),19.,.0046,.0030,7.)*.85;
  dr+=stillStr(p*.82+vec2(.031,0.),10.,.0066,.0040,13.);
  dr*=.35+.65*smoothstep(.02,.07,abs(a.x-${g(K.fx)}));                 // the way to the door is left clear
  c+=vec3(.74,.87,1.)*dr*(.5+.5*shaft);
  return c;}
`;

// ── V · the Ingathering ─────────────────────────────────────────────────────────────────────
const INGATHER = (K) => `
vec3 ingather(vec2 a,float s){
  float hz=${g(K.hz)};
  float k=smoothstep(-.55,.4,s);
  float dep=ground(a,hz);
  vec2 q=a-P*vec2(.016,.008)*(dep+.1)+vec2(0.,-s*.012*dep);
  vec3 c=T(q);
  // two watches' lights, out of step, and then not
  float ph=uT*.5;
  float pw=.5+.5*sin(ph),pc=.5+.5*sin(ph+3.14159*(1.-k));
  float mx=${g(K.fx)};
  float lw=exp(-max(a.x-mx+.5,0.)*2.4)*(.25+.75*pw),lc=exp(-max(mx+.5-a.x,0.)*2.4)*(.25+.75*pc);
  vec3 lit=c*(vec3(.70)+vec3(1.25,.74,.42)*lw*.52+vec3(.52,.80,1.25)*lc*.52);
  float meet=min(pw,pc)*smoothstep(.30,0.,abs(a.x-mx))*k;
  lit+=c*vec3(1.,.9,.62)*meet*.26;
  // the lanterns on the one bridge: every painted flame breathes, each at its own rate
  float by=${g(K.by)};
  float warm=smoothstep(.06,.26,c.r-c.b)*smoothstep(.50,.80,lum(c));
  float onb=smoothstep(.055,.015,abs(a.y-by))*smoothstep(${g(K.bx0)},${g(K.bx0)}+.03,a.x)*smoothstep(${g(K.bx1)},${g(K.bx1)}-.03,a.x);
  float fl=.5+.5*sin(uT*(1.3+2.2*h21(floor(a*vec2(90.,40.))))+a.x*70.);
  lit+=c*warm*onb*(.25+.85*fl);
  // and where the two crowds meet, the light of both
  lit+=vec3(1.,.92,.66)*exp(-length((a-vec2(mx,by))*vec2(uAsp,1.6))*16.)*(.06+meet*.32);
  return lit;}
`;

// ── VI · the Far Shore ──────────────────────────────────────────────────────────────────────
const SHORE = (K) => `
vec4 hexc(vec2 p){vec2 r=vec2(1.,1.7320508);vec2 h=r*.5;
  vec2 a=mod(p,r)-h,b=mod(p-h,r)-h;vec2 g=dot(a,a)<dot(b,b)?a:b;
  return vec4(g,p-g);}
vec3 shore(vec2 a,float s){
  float hz=${g(K.hz)};
  float fail=smoothstep(-.7,.9,s);
  float dep=ground(a,hz);
  vec2 q=a-P*vec2(.016,.008)*(dep+.1)+vec2(0.,-s*.012*dep);
  vec3 c=T(q);
  // the sky we see through the opening: only what is bright up there is sky
  float open=smoothstep(${g(K.ox0)}-.01,${g(K.ox0)}+.02,a.x)*smoothstep(${g(K.ox1)}+.01,${g(K.ox1)}-.02,a.x);
  float sky=open*smoothstep(hz+.005,hz-.02,a.y)*smoothstep(${g(K.oy0)}-.01,${g(K.oy0)}+.03,a.y)*smoothstep(.30,.46,lum(c));
  // it is made of cells, and it fails along the seam
  vec2 hp=vec2(a.x*uAsp,a.y)*44.;
  vec4 hx=hexc(hp);
  float hd=max(abs(hx.x),abs(hx.x)*.5+abs(hx.y)*.8660254);
  float edge=smoothstep(.44,.5,hd);
  float id=h21(floor(hx.zw*vec2(2.,1.1547005)+.5));
  float sy=${g(K.seam)};
  float taper=1.-.5*smoothstep(0.,.25,abs(hx.z/44./uAsp-${g(K.sun)}));
  float near=abs(hx.w/44.-sy);
  float reach=(.004+fail*.085)*taper;
  float gone=step(near+id*.10,reach)*sky;
  float dim=step(near+id*.13,reach+.045)*(1.-gone)*sky;
  float blink=step(.82,fract(id*17.+uT*(.05+id*.08)));
  c*=1.-edge*.07*sky;
  c=mix(c,c*vec3(.60,.62,.74),dim*(.4+.4*blink));
  // behind a dead cell there is no sky, only depth, and far lights
  vec3 voidc=mix(vec3(.10,.10,.22),vec3(.045,.05,.11),smoothstep(.0,.45,hd))+vec3(.9,.95,1.)*spark(vec2(a.x*uAsp,a.y),170.,.80)*(.6+.4*sin(uT+id*40.));
  c=mix(c,voidc,gone*smoothstep(.5,.43,hd)*.94);
  c=mix(c,vec3(.96,.88,.90),gone*edge*.5);
  c+=vec3(1.,.95,.85)*smoothstep(.003,0.,abs(a.y-sy))*.10*sky;
  // the road the sun lays on the water
  float wy=a.y-hz;
  float water=open*step(0.,wy)*smoothstep(.16,.02,wy)*smoothstep(.28,.5,lum(c));
  float sp=sin(a.x*uAsp*260./(1.+wy*14.)+sin(wy*900.+uT*1.1)*1.6)*sin(wy*1500.-uT*1.5);
  float road=exp(-pow((a.x-${g(K.sun)})/(.02+wy*.7),2.));
  c+=vec3(1.,.9,.62)*smoothstep(.5,1.,sp)*(road*.8+.1)*water;
  return c;}
`;

const FX = { karsk: KARSK, sound: SOUND, kiln: KILN, still: STILL, ingather: INGATHER, shore: SHORE };

// one room, full frame
const ROOM = (n) => `
uniform float uLamp;
void main(){
  vec2 f=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  vec2 st=f/uRes;P=uPtr;
  if(uFlip>.5)st.x=1.-st.x;
  vec2 a=uFit.xy+st*uFit.zw;
  vec3 c=${n}(a,uS);
  // lit by its own lamp, hung in the hull above it
  float I=lampI(f,.50,.78*uLamp+.5*(1.-uLamp),1.5);
  I*=.97+.03*sin(uT*2.1)*uLamp;
  c*=I;
  c=surface(c,f,normalize(uLampP-f+vec2(.001)));
  vec2 v=f/uRes-.5;c*=1.-dot(v,v)*.30;
  gl_FragColor=vec4(c,1.);}
`;

// THE HERO — one lamp, and it is the light of its realm. Where its light falls there is a world,
// in three depths: the far land, the near ridge with the singers on it, and the lamps themselves.
// Where it does not fall there is bare hull plate, catching the same light.
const HERO = (K) => `
uniform sampler2D uB;
uniform vec4 uFitB;
uniform vec2 uCropB;
uniform float uFgOn;
void main(){
  vec2 f=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  vec2 st=f/uRes;P=uPtr;
  vec2 a=uFit.xy+st*uFit.zw;
  vec3 wld=karsk(a,uS);
  // the near ridge: its own plate, standing in front of the land and moving against it
  if(uFgOn>.5){
    vec2 gq=uFitB.xy+st*uFitB.zw-P*vec2(.030,.010)+vec2(0.,(uS+.8)*.05);
    vec3 fg=texture2D(uB,clamp(vec2((gq.x-uCropB.x)*uCropB.y,gq.y),.002,.998)).rgb;
    float al=smoothstep(.93,.74,min(fg.r,min(fg.g,fg.b)))*step(0.,gq.y);
    float dusk=smoothstep(-.8,.95,uS);
    // it stands against the light: its body in shadow, its skyline and the walkers catching the last of it
    float body=smoothstep(${g(PLATES.herofg.crest)}-.10,${g(PLATES.herofg.crest)}+.10,gq.y-(gq.x-.5)*-.11);
    fg*=mix(vec3(.86,.72,.66),vec3(.42,.27,.27),body);
    fg*=mix(vec3(1.),vec3(.72,.58,.60),dusk*.7);
    wld=mix(wld,fg,al);
  }
  vec2 lp=uLampP;
  float r=length((f-lp)*vec2(1.,1.15))/uRes.y;
  float fl=.95+.035*sin(uT*2.1)+.015*sin(uT*5.3+1.7);
  float I=fl/(1.+r*r*3.8);
  wld+=vec3(1.,.62,.26)*exp(-r*5.2)*.34;                       // the lamp's own glow, in the air
  vec2 dl=f-lp;float ang=atan(dl.x,dl.y);                       // and its light standing in the dust, in shafts
  float rays=pow(fbm(vec2(ang*16.,uT*.03+r*.5)),2.)*exp(-r*2.6)*smoothstep(.02,.3,r);
  wld+=vec3(1.,.70,.36)*rays*.20;
  wld=surface(wld,f,normalize(lp-f+vec2(.001)));
  // hull plate, brushed along its length
  float br=vn(vec2(f.x*.012/uDpr,f.y*1.3/uDpr))*.55+vn(vec2(f.x*.04/uDpr,f.y*2.9/uDpr))*.45;
  vec3 m=vec3(.098,.106,.120)*(.78+.44*br);
  float streak=exp(-pow((f.y-lp.y)/(.034*uRes.y),2.))*exp(-abs(f.x-lp.x)/(.52*uRes.y));
  vec3 ml=m*(.55+2.4*I)+vec3(1.,.9,.72)*streak*.10*br;
  float w=smoothstep(.13,.46,I);
  vec3 c=mix(ml,wld*(.36+.86*I)*vec3(1.04,.99,.93),w);
  gl_FragColor=vec4(c,1.);}
`;

// THE SEAM — six skies in six bays of one hull, one horizon through all of them
const SEAM = `
uniform sampler2D uP1,uP2,uP3,uP4,uP5;
uniform float uGut,uBay,uLit,uSeamY;
uniform vec3 uHzA,uHzB,uFxA,uFxB,uArA,uArB,uCxA,uCxB,uCwA,uCwB;
void main(){
  vec2 f=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  float bx=(f.x-uGut)/uBay;float b=floor(bx);
  vec3 c=vec3(.085,.092,.104);
  if(bx>=0.&&b<6.){
    float hz,fx,ar,cx,cw;
    if(b<.5){hz=uHzA.x;fx=uFxA.x;ar=uArA.x;cx=uCxA.x;cw=uCwA.x;}else if(b<1.5){hz=uHzA.y;fx=uFxA.y;ar=uArA.y;cx=uCxA.y;cw=uCwA.y;}else if(b<2.5){hz=uHzA.z;fx=uFxA.z;ar=uArA.z;cx=uCxA.z;cw=uCwA.z;}
    else if(b<3.5){hz=uHzB.x;fx=uFxB.x;ar=uArB.x;cx=uCxB.x;cw=uCwB.x;}else if(b<4.5){hz=uHzB.y;fx=uFxB.y;ar=uArB.y;cx=uCxB.y;cw=uCwB.y;}else{hz=uHzB.z;fx=uFxB.z;ar=uArB.z;cx=uCxB.z;cw=uCwB.z;}
    float vis=.84;
    vec2 a=vec2(fx+(fract(bx)-.5)*uBay/uRes.y*vis/ar+uPtr.x*.01,hz+(f.y-uSeamY)/uRes.y*vis);
    a=clamp(vec2((a.x-cx)*cw,a.y),.002,.998);
    if(b<.5)c=texture2D(uA,a).rgb;else if(b<1.5)c=texture2D(uP1,a).rgb;else if(b<2.5)c=texture2D(uP2,a).rgb;
    else if(b<3.5)c=texture2D(uP3,a).rgb;else if(b<4.5)c=texture2D(uP4,a).rgb;else c=texture2D(uP5,a).rgb;
    // each bay under its own lamp
    float on=clamp(uLit*7.-b,0.,1.);
    vec2 lp=vec2(uGut+(b+.5)*uBay,uRes.y*.22);
    vec2 q=(f-lp)/uRes.y;
    float I=.17+on*(.98+.04*sin(uT*2.1+b*1.7))/(1.+dot(q,q)*2.6);
    c*=I;
    c=surface(c,f,normalize(lp-f+vec2(.001)));
    float e=min(fract(bx),1.-fract(bx))*uBay/uDpr;
    c*=smoothstep(0.,2.,e)*(.72+.28*smoothstep(0.,26.,e));
  }
  gl_FragColor=vec4(c,1.);}
`;

const UNI = ['uRes', 'uPtr', 'uPtrL', 'uLampP', 'uFit', 'uT', 'uS', 'uDpr', 'uTexOn', 'uFlip', 'uAsp', 'uPaint', 'uA', 'uB', 'uFitB', 'uFgOn', 'uLamp',
  'uP1', 'uP2', 'uP3', 'uP4', 'uP5', 'uCropB', 'uGut', 'uBay', 'uLit', 'uSeamY', 'uHzA', 'uHzB', 'uFxA', 'uFxB', 'uArA', 'uArB', 'uCrop', 'uCxA', 'uCxB', 'uCwA', 'uCwB'];

function source(name) {
  if (name === 'hero') return COMMON + KARSK(PLATES.hero) + HERO(PLATES.hero);
  if (name === 'seam') return COMMON + SEAM;
  return COMMON + FX[name](PLATES[name]) + ROOM(name);
}
// which pictures a scene needs before it can be drawn
export function needs(name) { return name === 'seam' ? ORDER : name === 'hero' ? ['hero'] : [name]; }

// How a plate sits in a room: its horizon on the room's seam line (fy), its subject on the focal
// point (fx), covering the room with a little to spare for the depths to move in.
// → (u0, v0, du, dv): the part of the plate the room shows.
// ar is the whole plate's width over its height; crop = [left, right] is the strip of it this screen holds.
export function fit(ar, K, W, H, fx, fy, zoom, crop) {
  const c0 = crop ? crop[0] : 0, c1 = crop ? crop[1] : 1;
  const s = Math.max(H, W / (ar * (c1 - c0))) * 1.07 * (zoom || 1), PW = s * ar, PH = s;
  let x0 = fx * W - K.fx * PW, y0 = fy * H - K.hz * PH;
  x0 = Math.min(-c0 * PW, Math.max(W - c1 * PW, x0)); y0 = Math.min(0, Math.max(H - PH, y0));
  return [-x0 / PW, -y0 / PH, W / PW, H / PH];
}

// create() → null when WebGL is not to be had; otherwise the one engine for the page.
export function create() {
  const canvas = document.createElement('canvas');
  let gl = null;
  try {
    const o = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' };
    gl = canvas.getContext('webgl', o) || canvas.getContext('experimental-webgl', o);
  } catch (e) { gl = null; }
  if (!gl) return null;
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const fix = (s) => (hp && hp.precision > 0 ? s : s.replace('precision highp float;', 'precision mediump float;'));
  const st = { lost: false };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); st.lost = true; });
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, VERT); gl.compileShader(vs);
  const tex = {}, ar = {}, crop = {};
  const progs = {};
  const program = (name) => {
    if (name in progs) return progs[name];
    let P = null;
    try {
      const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, fix(source(name))); gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error(name + ': ' + gl.getShaderInfoLog(fs));
      const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ': ' + gl.getProgramInfoLog(p));
      const U = {}; UNI.forEach((n) => { U[n] = gl.getUniformLocation(p, n); });
      P = { p, U };
    } catch (e) { console.warn('light: a room could not be built; its still picture holds', e); P = null; }
    progs[name] = P; return P;
  };
  const bind = (unit, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex[name] || null); };
  return {
    canvas,
    get lost() { return st.lost; },
    program,
    has(name) { return !!tex[name]; },
    ready(name) { return needs(name).every((n) => !!tex[n]); },
    aspect(name) { return ar[name] || 16 / 9; },
    // a picture becomes a texture. 'paint' is the square of real impasto (mirrored at its edges so
    // it never shows a join); every other name is a plate.
    setTex(name, img, strip) {
      if (st.lost || !img.naturalWidth) return false;
      try {
        const t = tex[name] || gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + 7); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        const paint = name === 'paint', fmt = paint ? gl.LUMINANCE : gl.RGB;
        gl.texImage2D(gl.TEXTURE_2D, 0, fmt, fmt, gl.UNSIGNED_BYTE, img);
        const wrap = paint ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        crop[name] = strip || [0, 1];
        tex[name] = t; ar[name] = img.naturalWidth / img.naturalHeight / (crop[name][1] - crop[name][0]);
        return true;
      } catch (e) { return false; }
    },
    // draw one scene into the hidden canvas; w, h in device pixels, lengths in u in CSS pixels.
    draw(name, w, h, u) {
      if (st.lost) return false;
      const P = program(name); if (!P) return false;
      if (canvas.width < w || canvas.height < h) { canvas.width = Math.max(canvas.width, w); canvas.height = Math.max(canvas.height, h); }
      gl.viewport(0, 0, w, h); gl.useProgram(P.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const U = P.U, d = u.dpr || 1, cw = w / d, ch = h / d;
      gl.uniform2f(U.uRes, w, h);
      gl.uniform2f(U.uPtr, u.ptr ? u.ptr[0] : 0, u.ptr ? u.ptr[1] : 0);
      gl.uniform2f(U.uPtrL, u.ptrL ? u.ptrL[0] : 0, u.ptrL ? u.ptrL[1] : 0);
      const L = u.lamp || [cw * 0.5, 0, 1];
      gl.uniform2f(U.uLampP, L[0] * d, L[1] * d);
      if (U.uLamp) gl.uniform1f(U.uLamp, L[2] === undefined ? 1 : L[2]);
      gl.uniform1f(U.uT, u.t || 0); gl.uniform1f(U.uS, u.s || 0); gl.uniform1f(U.uDpr, d);
      gl.uniform1f(U.uTexOn, tex.paint ? 1 : 0); gl.uniform1f(U.uFlip, u.flip ? 1 : 0);
      bind(0, 'paint'); gl.uniform1i(U.uPaint, 0);
      if (name === 'seam') {
        ORDER.forEach((n, i) => { bind(1 + i, n); });
        gl.uniform1i(U.uA, 1); for (let i = 1; i < 6; i++) gl.uniform1i(U['uP' + i], 1 + i);
        const K = ORDER.map((n) => PLATES[n]), A = ORDER.map((n) => ar[n] || 16 / 9);
        gl.uniform3f(U.uHzA, K[0].hz, K[1].hz, K[2].hz); gl.uniform3f(U.uHzB, K[3].hz, K[4].hz, K[5].hz);
        gl.uniform3f(U.uFxA, K[0].sx || K[0].fx, K[1].sx || K[1].fx, K[2].sx || K[2].fx); gl.uniform3f(U.uFxB, K[3].sx || K[3].fx, K[4].sx || K[4].fx, K[5].sx || K[5].fx);
        gl.uniform3f(U.uArA, A[0], A[1], A[2]); gl.uniform3f(U.uArB, A[3], A[4], A[5]);
        const C = ORDER.map((n) => crop[n] || [0, 1]), iw = (c) => 1 / (c[1] - c[0]);
        gl.uniform3f(U.uCxA, C[0][0], C[1][0], C[2][0]); gl.uniform3f(U.uCxB, C[3][0], C[4][0], C[5][0]);
        gl.uniform3f(U.uCwA, iw(C[0]), iw(C[1]), iw(C[2])); gl.uniform3f(U.uCwB, iw(C[3]), iw(C[4]), iw(C[5]));
        gl.uniform1f(U.uGut, (u.gut || 0) * d); gl.uniform1f(U.uBay, (u.bay || 1) * d);
        gl.uniform1f(U.uLit, u.lit === undefined ? 1 : u.lit); gl.uniform1f(U.uSeamY, (u.fy === undefined ? 0.7 : u.fy) * h);
      } else {
        const key = name === 'hero' ? 'hero' : name, K = PLATES[key], A = ar[key] || 16 / 9;
        bind(1, key); gl.uniform1i(U.uA, 1); gl.uniform1f(U.uAsp, A);
        const cr = crop[key] || [0, 1];
        gl.uniform2f(U.uCrop, cr[0], 1 / (cr[1] - cr[0]));
        const F = fit(A, K, cw, ch, u.fx === undefined ? 0.5 : u.fx, u.fy === undefined ? 0.6 : u.fy, u.zoom, cr);
        gl.uniform4f(U.uFit, F[0], F[1], F[2], F[3]);
        if (name === 'hero') {
          const on = !!tex.herofg; gl.uniform1f(U.uFgOn, on ? 1 : 0); bind(2, 'herofg'); gl.uniform1i(U.uB, 2);
          // the near ridge: at the scale of the land behind it, its skyline just above the seam line,
          // the gap between two of its walkers in front of the far gate
          const G = PLATES.herofg, fa = ar.herofg || 16 / 9, fc = crop.herofg || [0, 1];
          const PH = Math.max(ch, cw / (A * (cr[1] - cr[0]))) * 1.07 * (u.zoom || 1), PW = PH * fa;
          const fxp = (u.fx === undefined ? 0.5 : u.fx) * cw, fyp = (u.fy === undefined ? 0.6 : u.fy) * ch;
          gl.uniform4f(U.uFitB, G.gap - fxp / PW, G.crest - (fyp - 0.012 * ch) / PH, cw / PW, ch / PH);
          gl.uniform2f(U.uCropB, fc[0], 1 / (fc[1] - fc[0]));
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    },
    // copy what was just drawn into a visible 2D canvas
    blit(ctx, w, h) { ctx.drawImage(canvas, 0, canvas.height - h, w, h, 0, 0, w, h); },
  };
}
