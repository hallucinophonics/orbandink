// scene.js — the hand-written WebGL for The Drowned Houses. No libraries.
//
// Two contexts, made once and kept:
//
//  1. THE STAIR — one fixed canvas behind every page. A shaft of twelve arcaded terraces, traced
//     analytically (cylinders and planes, no marching), bound in the covers' teal cloth and stamped
//     in copper foil. Its walls are one engraved storey (assets/scenes/el-wall.jpg) wrapped round
//     every terrace and re-lit here: the open arches are given real depth, lamps stand on every
//     parapet and pool their light on the stone, the surface's light falls down the shaft as a beam,
//     and below the last landing the steps go on, ever finer, to the Well. The Well is an absence:
//     every ray that passes it is bent (so the Stair, its lamps and the light of the surface wrap
//     round it), and what is left at its edge is the pale-gold rim. The station hangs over it on a
//     thread of light.
//
//     Depth is time. Each terrace keeps its own clock: a light goes round each ring, and the lamps
//     brighten as it passes, at 1/γ of the rate of the ring at the surface. The top ring turns in
//     half a minute; the floor of the Stair takes most of an hour. Nothing in that is eased.
//
//  2. THE PLATES — one shared context for every framed picture on the page. A cover is re-lit as
//     the object it is (cloth with a weave, foil that takes a moving light); a "view" is another
//     camera in the same Stair, drawn into a plate.
//
// All of it degrades to what is already in the markup: a still of the Stair, and the pictures.

export const N = 12, H = 0.17, R0 = 1.0, RN = 0.36;
const PW = 1.3;
export const ZN = N * H;                       // the last landing
export const ZW = ZN + 0.25, BC = 0.17;        // the Well: its centre on the axis, and the radius of its shadow
const SL = 0.20, ZE = ZN + 1.5;                // the deep stair below the last landing: a cone of ever finer steps
const HL = 0.105, HL0 = 0.20;                  // a lamp's height on a terrace, and round the mouth
const LAMPS = [12, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];   // lamps on ring 0 (the mouth) … ring 11: they thin out with depth
const WALL_ASPECT = 1672 / 941;                // the engraved storey, as drawn
const SUN = [0.46, 0.34, 1.0];                 // the way the surface's light travels: down the shaft, a little aslant
export const rOf = (k) => RN + (R0 - RN) * Math.pow(Math.max(0, 1 - k / N), PW);
const baysOf = (i) => 4 * Math.max(1, Math.round((2 * Math.PI * rOf(i)) / (H * WALL_ASPECT) / 4));
const f3 = (v) => v.toFixed(4);

const HEAD = (gl2, lod) => gl2
  ? '#version 300 es\nprecision highp float;\n#define varying in\n#define texture2D texture\n#define TEX(s,uv,l) textureLod(s,uv,l)\nout vec4 fragColor;\n#define gl_FragColor fragColor\n'
  : (lod ? '#extension GL_EXT_shader_texture_lod : enable\nprecision highp float;\n#define TEX(s,uv,l) texture2DLodEXT(s,uv,l)\n' : 'precision highp float;\n#define TEX(s,uv,l) texture2D(s,uv)\n');
const VERT = (gl2) => (gl2 ? '#version 300 es\n#define attribute in\n#define varying out\n' : '') + 'attribute vec2 aP;varying vec2 vUv;void main(){vUv=aP*0.5+0.5;gl_Position=vec4(aP,0.0,1.0);}';

const STAIR = `
varying vec2 vUv;
uniform vec2 uRes;uniform vec3 uCam;uniform vec3 uF;uniform vec3 uR;uniform vec3 uU;uniform float uTan;uniform vec2 uShift;
uniform float uTau;uniform float uGlint;uniform float uPix;uniform float uWallK;uniform float uSeed;
uniform vec4 uRing[${N + 1}];      // x radius · y lamps · z the first lamp's angle · w bays of the wall below
uniform vec4 uHand[${N}];          // x the angle of the ring's light · y the ring's own level · z the height of its lamps
uniform sampler2D uWall;uniform sampler2D uWallM;uniform sampler2D uSt;uniform sampler2D uLamp;
uniform vec4 uStAB;uniform vec4 uStP;uniform vec3 uStTint;   // the station: its two ends on screen · half-width, depth, presence, swing
const int NR=${N};const float H=${f3(H)};const float R0=${f3(R0)};const float RN=${f3(RN)};const float ZN=${f3(ZN)};
const float SL=${f3(SL)};const float ZE=${f3(ZE)};const float BC=${f3(BC)};
const vec3 WELL=vec3(0.0,0.0,${f3(ZW)});
const vec3 SUN=vec3(${SUN.join(',')});
const float TAU=6.2831853;
const vec3 CLOTH=vec3(0.050,0.118,0.142);
const vec3 COPPER=vec3(0.80,0.50,0.24);
const vec3 RIM=vec3(0.86,0.72,0.42);          // the pale gold: the horizon only
const vec3 LAMP=vec3(1.0,0.62,0.26);
const vec3 SKY=vec3(0.80,0.84,0.80);
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}
float lum(vec3 c){return dot(c,vec3(0.3333));}
float angd(float a,float b){return abs(mod(a-b+3.14159265,TAU)-3.14159265);}

// Book-cloth: a plain weave seen under a raking light, and the slow mottle of dyed cloth. fp is the size of a pixel on it.
vec3 cloth(vec2 p,float fp,out vec2 slope){
  const float F=420.0;
  float vis=clamp(1.0-fp*F*0.9,0.0,1.0);
  vec2 q=p*F;vec2 c=cos(q*3.14159265);vec2 s=sin(q*3.14159265);
  float par=step(0.0,s.x*s.y);                       // which thread lies on top in this cell
  float hgt=mix(c.x*c.x,c.y*c.y,par);
  slope=vis*vec2(-c.x*s.x*(1.0-par),-c.y*s.y*par)*1.6;
  float mot=vnoise(p*7.0)*0.6+vnoise(p*23.0+7.0)*0.4;
  return CLOTH*(0.74+0.5*mot)*(0.9+0.22*vis*(hgt-0.5));
}

// The shaft. Walls are the inner faces of cylinders, landings are rings of plane, the deep stair is a cone.
void geom(vec3 o,vec3 d,out float tH,out float kind,out float kk,out vec3 rr){
  tH=1e9;kind=0.0;kk=0.0;rr=vec3(R0,R0,1.0);
  float a=dot(d.xy,d.xy),b=dot(o.xy,d.xy),oo=dot(o.xy,o.xy);
  if(o.z<0.0&&d.z>1e-5){float t=-o.z/d.z;vec2 q=o.xy+t*d.xy;if(dot(q,q)>=R0*R0){tH=t;kind=4.0;}}
  for(int i=0;i<NR;i++){
    float r=uRing[i].x;float r1=uRing[i+1].x;float z0=float(i)*H;float z1=z0+H;
    float disc=b*b-a*(oo-r*r);
    if(disc>0.0&&a>1e-7){float t=(-b+sqrt(disc))/a;if(t>1e-4&&t<tH){float z=o.z+t*d.z;if(z>z0&&z<=z1){tH=t;kind=1.0;kk=float(i);rr=vec3(r,r1,uRing[i].w);}}}
    if(d.z>1e-5){float t=(z1-o.z)/d.z;if(t>1e-4&&t<tH){vec2 q=o.xy+t*d.xy;float q2=dot(q,q);if(q2<r*r&&q2>=r1*r1){tH=t;kind=2.0;kk=float(i);rr=vec3(r,r1,uRing[i].w);}}}
  }
  // below the last landing the steps go on, finer and finer
  float e0=RN+ZN*SL;float e=e0-SL*o.z;
  float A=a-SL*SL*d.z*d.z;float B=b+SL*d.z*e;float C=oo-e*e;float disc=B*B-A*C;
  if(disc>0.0&&abs(A)>1e-7){
    float sq=sqrt(disc);float t1=(-B-sq)/A;float t2=(-B+sq)/A;float ta=min(t1,t2);float tb=max(t1,t2);
    float z=o.z+ta*d.z;
    if(ta>1e-4&&ta<tH&&z>ZN&&z<ZE){tH=ta;kind=3.0;}
    else{z=o.z+tb*d.z;if(tb>1e-4&&tb<tH&&z>ZN&&z<ZE){tH=tb;kind=3.0;}}
  }
}

void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y+uShift;
  vec3 o=uCam;vec3 d=normalize(uF+uTan*(uv.x*uR+uv.y*uU));
  vec3 d0=d;
  float tH;float kind;float kk;vec3 rr;
  geom(o,d,tH,kind,kk,rr);

  // THE WELL. A ray that reaches its closest approach is bent toward it there (a thin lens: one turn, at the
  // nearest point). Inside the shadow nothing comes back. Just outside it the turn grows without limit.
  float tOff=0.0;float rim=0.0;float bent=0.0;
  vec3 oc=WELL-o;float tc=dot(oc,d);
  if(tc>0.0&&tH>tc){
    vec3 pc=o+tc*d;vec3 toC=WELL-pc;float bb=length(toC);float x=BC/bb;
    vec3 nn=toC/max(bb,1e-5);
    float ang=atan(dot(nn,uR),dot(nn,uU));
    float sh=0.80+0.20*sin(ang*3.0+uTau*0.50)*sin(ang*7.0-uTau*0.31+1.3);
    rim=(exp(-pow((1.0/x-1.0)/0.030,2.0))*1.5+0.22*exp(-pow((1.0/x-1.085)/0.014,2.0)))*sh+0.10/(1.0+pow((1.0/x-1.0)/0.22,2.0));
    if(x>=1.0){kind=5.0;rim*=smoothstep(0.9,1.0,1.0/x);}
    else if(x>0.14){
      float al=min(-1.15*log(1.0-x*x),5.6)*smoothstep(0.14,0.30,x);
      d=normalize(d*cos(al)+nn*sin(al));o=pc;tOff=tc;bent=al;
      geom(o,d,tH,kind,kk,rr);
    }
  }

  vec3 col=vec3(0.0);
  vec3 P=o+tH*d;float dist=tOff+tH;float fp=dist*uPix*(1.0+7.0*bent);
  vec3 sun=normalize(SUN);vec2 sl=sun.xy/sun.z;
  vec3 n=vec3(0.0,0.0,-1.0);vec3 alb=vec3(0.0);float foil=0.0;float rec=0.0;float tier=-9.0;float occl=1.0;
  vec3 emis=vec3(0.0);
  float th=atan(P.x,P.y);float rho=length(P.xy);vec2 er=P.xy/max(rho,1e-4);vec3 T=vec3(er.y,-er.x,0.0);
  bool surf=kind>0.5&&kind<4.5;
  if(kind>0.5&&kind<1.5){
    // a wall: the engraved storey, wrapped round the ring and mirrored bay to bay
    float M=rr.z;float z0=kk*H;float tileW=TAU*rr.x/M;
    vec2 wuv=vec2(th/TAU*M,(P.z-z0)/H);
    float cosi=max(dot(-d,-vec3(er,0.0)),0.12);
    float lod=log2(max(dist*uWallK*(1.0+7.0*bent)/sqrt(cosi),1.0));
    // the open arches have depth: look through the opening at the back of the recess, or at its reveal
    const float DEPTH=0.034;
    vec2 off=vec2(dot(d,T)/tileW,d.z/H)*(DEPTH/cosi);
    float m0=TEX(uWallM,wuv,max(lod-1.0,0.0)).r;
    float m1=TEX(uWallM,wuv+off,max(lod-1.0,0.0)).r;
    float open=smoothstep(0.35,0.65,m0);float back=open*smoothstep(0.35,0.65,m1);float reveal=open-back;
    vec2 suv=mix(wuv,wuv+off,reveal);
    vec3 c=TEX(uWall,suv,lod).rgb;
    float e=exp2(lod)/1024.0;
    float hx=lum(TEX(uWall,suv+vec2(e*0.5,0.0),lod).rgb)-lum(c);
    float hy=lum(TEX(uWall,suv+vec2(0.0,e),lod).rgb)-lum(c);
    float bump=0.0052/(e*H);
    n=normalize(-vec3(er,0.0)-bump*(hx*T*1.0+hy*vec3(0.0,0.0,1.0)));
    // the reveal faces sideways: it takes the light the back of the arch never sees
    n=normalize(mix(n,normalize(-vec3(er,0.0)*0.35-sign(off.x)*T),reveal*0.6));
    foil=smoothstep(0.03,0.24,c.r-c.b)*(1.0-back);
    alb=pow(c,vec3(0.92))*1.25;
    alb=mix(alb,alb*vec3(0.20,0.24,0.26),back);alb*=1.0-0.4*reveal;
    rec=back;tier=kk;
    // a house is kept in a few of the arches: a low amber within, on the ring's own clock
    float bay=floor(wuv.x*2.5)+kk*13.0;
    float kept=step(0.80,hash(vec2(bay,kk+uSeed)))*step(kk,8.5);
    emis=LAMP*back*kept*(0.035+0.02*sin(uHand[0].y*0.0+hash(vec2(bay,3.0))*6.0))*smoothstep(0.95,0.4,wuv.y);
  }else if(kind>1.5&&kind<2.5){
    // a landing: paved cloth, a copper nosing on its edge, a line of foil at the foot of the wall behind it
    vec2 g;alb=cloth(P.xy,fp,g)*1.15;
    n=normalize(vec3(g*0.5,-1.0));
    float M=rr.z;float w=rr.x-rr.y;float x=(rho-rr.y)/w;
    float aa=fp/w;
    float ju=abs(fract(th/TAU*M*2.5+0.5*floor(x*2.0))-0.5)*TAU*rho/(M*2.5);
    float joint=(1.0-smoothstep(0.0,fp*1.3+0.0012,ju))+(1.0-smoothstep(0.0,aa*1.3+0.02,abs(x-0.5)));
    alb*=1.0-0.45*clamp(joint,0.0,1.0)*clamp(1.6-fp*260.0,0.0,1.0);
    float nose=1.0-smoothstep(0.012,0.012+fp*1.5,rho-rr.y);
    float kerb=(1.0-smoothstep(0.0,fp*1.4+0.002,abs(rho-rr.y-0.019)))*0.6;
    float foot=(1.0-smoothstep(0.0,fp*1.4+0.002,abs(rr.x-rho-0.008)))*0.45;
    foil=clamp(nose+kerb+foot,0.0,1.0);
    float dash=0.78+0.22*step(0.5,fract(th/TAU*M*10.0))*clamp(1.5-fp*400.0,0.0,1.0);
    alb=mix(alb,COPPER*0.62*dash,foil);n=normalize(mix(n,vec3(0.0,0.0,-1.0),foil));
    occl=0.55+0.45*smoothstep(0.0,0.03,rr.x-rho);     // the foot of the wall keeps its shadow
    tier=kk;
  }else if(kind>2.5&&kind<3.5){
    // the deep stair: every step a year, and they crowd toward the horizon
    float w=P.z-ZN;float g=(exp(w*2.1)-1.0)*7.0;float dg=14.7*exp(w*2.1)*fp/max(abs(dot(d,normalize(vec3(-er,-SL)))),0.15);
    float fz=fract(g);
    float line=smoothstep(0.0,dg+0.01,fz)*(1.0-smoothstep(0.10,0.10+dg+0.01,fz));
    float tread=smoothstep(0.10,0.95,fz);
    float fine=clamp(dg*2.2-0.25,0.0,1.0);                 // steps finer than the eye: they run together
    line=mix(line,0.11,fine);tread=mix(tread,0.5,fine);
    vec2 gg;alb=cloth(vec2(th*rho,P.z),fp,gg)*(0.55+0.5*tread);
    n=normalize(vec3(-er,-0.55));
    foil=line*0.9*exp(-w*0.9);alb=mix(alb,COPPER*0.6,foil);
    occl=exp(-w*1.6);
    tier=40.0;
  }else if(kind>3.5&&kind<4.5){
    // the surface round the mouth: cloth, and the mouth's own worked rim
    vec2 g;alb=mix(cloth(P.xy,fp,g),CLOTH,0.6)*1.15;n=normalize(vec3(g*0.5,-1.0));
    float x=rho-R0;float w1=fp*1.4;
    float band=1.0-smoothstep(0.016,0.016+w1,x);
    float inl=smoothstep(0.022,0.022+w1,x)*(1.0-smoothstep(0.050,0.050+w1,x));
    float l2=1.0-smoothstep(0.0,w1+0.0014,abs(x-0.058));
    float l3=(1.0-smoothstep(0.0,w1+0.0010,abs(x-0.084)))*0.55;
    // the ground round the mouth is engraved like a dial: rings going out, and sixty marks for the minutes
    float lr=log(max(x,0.0)+0.09)*3.4;float wl=(w1+0.0013)*3.4/(max(x,0.0)+0.09);
    float rings=(1.0-smoothstep(0.0,wl,abs(fract(lr)-0.5)))*step(0.10,x)*smoothstep(5.0,0.4,x)*clamp(1.4-wl*3.5,0.0,1.0)*0.55;
    float mk=abs(fract(th/TAU*60.0)-0.5)*TAU*rho/60.0;float five=step(abs(fract(th/TAU*12.0)-0.5),0.0834);
    float marks=(1.0-smoothstep(0.0,w1+0.0016+0.002*five,mk))*step(0.115,x)*step(x,0.165+0.06*five)*clamp(1.5-fp*120.0,0.0,1.0)*0.8;
    foil=clamp(band+inl*0.16+l2+l3+rings+marks,0.0,1.0);alb=mix(alb,COPPER*0.50,foil);n=normalize(mix(n,vec3(0.0,0.0,-1.0),foil));
    occl=0.7+0.3*smoothstep(0.0,0.09,x);
    tier=-1.0;
  }

  // the lamps: their light on what was hit, then the lamps themselves and the light that goes round each ring
  vec3 E=vec3(0.0);vec3 Sp=vec3(0.0);vec4 spr=vec4(0.0);vec3 halo=vec3(0.0);
  vec3 v=-d;
  {
    float a=dot(d.xy,d.xy),b=dot(o.xy,d.xy),oo=dot(o.xy,o.xy);
    for(int i=NR-1;i>=0;i--){
      float cnt=uRing[i].y;float r=uRing[i].x;float zi=float(i)*H;float dth=TAU/cnt;float ph=uRing[i].z;
      float hand=uHand[i].x;float lvl=uHand[i].y;float HL=uHand[i].z;
      float fi=float(i);
      if(surf&&(fi==tier||fi==tier+1.0)){
        float q=(th-ph)/dth;float j0=floor(q+0.5);float j1=j0+(q>j0?1.0:-1.0);
        for(int s=0;s<3;s++){
          float aj=s==0?ph+j0*dth:(s==1?ph+j1*dth:hand);
          float up=s==2?0.36:0.78;
          vec3 Lp=vec3(r*sin(aj),r*cos(aj),zi-HL*up);
          vec3 lv=Lp-P;float d2=dot(lv,lv);vec3 l=lv*inversesqrt(d2);
          float pw=s==2?2.0:lvl*(1.0+1.8*exp(-pow(angd(aj,hand)/0.34,2.0)));
          float att=pw*0.017/(d2+0.0030);
          E+=LAMP*att*max(dot(n,l),0.0);
          Sp+=LAMP*att*pow(max(dot(n,normalize(l+v)),0.0),22.0)*2.2;
        }
      }
      // the lamp posts and their glow, wherever this ray crosses the parapet they stand on
      float disc=b*b-a*(oo-r*r);
      if(disc>0.0&&a>1e-7){
        float sq=sqrt(disc);
        for(int s=0;s<2;s++){
          float t=(s==0?(-b+sq):(-b-sq))/a;
          if(t<1e-3||t>tH+0.004)continue;
          vec3 Q=o+t*d;float hh=(zi-Q.z)/HL;
          if(hh<-0.5||hh>1.6)continue;
          float qa=atan(Q.x,Q.y);
          float j=floor((qa-ph)/dth+0.5);float aj=ph+j*dth;
          vec2 Tj=vec2(cos(aj),-sin(aj));vec2 Bj=r*vec2(sin(aj),cos(aj));
          float xl=dot(Q.xy-Bj,Tj);
          float fogk=exp(-(tOff+t)*0.16);
          float pw=lvl*(1.0+1.8*exp(-pow(angd(aj,hand)/0.34,2.0)));
          vec2 luv=vec2(0.5+xl/(HL*0.25),1.0-hh);
          if(luv.x>0.0&&luv.x<1.0&&luv.y>0.0&&luv.y<1.0){
            float ll=log2(max((tOff+t)*uPix*512.0/HL,1.0))-0.3;
            vec4 s4=TEX(uLamp,luv,ll)*smoothstep(0.93,0.70,abs(d.z));   // seen from straight above, a lamp is only its light
            float glass=smoothstep(0.42,0.75,s4.g/max(s4.a,0.05))*step(luv.y,0.36);
            vec3 sc=s4.rgb*(0.30+0.5*exp(-zi*0.5)+glass*(1.2+1.8*pw));
            sc*=fogk;
            spr=vec4(spr.rgb*(1.0-s4.a)+sc,spr.a*(1.0-s4.a)+s4.a);
          }
          float ey=HL*(hh-0.80);float e2=xl*xl+ey*ey;
          float hs=HL*HL;halo+=LAMP*pw*fogk*(0.75*exp(-e2/(0.016*hs))+0.24*exp(-e2/(0.20*hs))+0.05/(1.0+e2/(0.10*hs)));
          // the light that goes round the ring
          float xh=r*angd(qa,hand);float eh=HL*(hh-0.36);float h2=xh*xh+eh*eh;
          halo+=vec3(1.0,0.80,0.52)*fogk*(1.3*exp(-h2/0.00004)+0.22*exp(-h2/0.0009)+0.03/(1.0+h2/0.002));
        }
      }
    }
  }

  if(surf){
    float depth=max(P.z,0.0);
    // the surface's light: a beam down the shaft, cut by the mouth and by the edge of the terrace above
    vec2 pm=P.xy-sl*P.z;
    float inb=smoothstep(R0,R0-0.05-0.06*depth,length(pm));
    if(tier>-0.5&&tier<30.0){vec2 pe=P.xy-sl*(P.z-tier*H);inb*=smoothstep(rr.x+0.004,rr.x-0.012,length(pe));}
    if(kind>3.5)inb=1.0;
    float ndl=max(dot(n,-sun),0.0);
    vec3 key=SKY*2.6*inb*ndl*exp(-depth*0.50);
    vec3 amb=SKY*(0.26+0.2*max(-n.z,0.0))*exp(-depth*1.15)*(kind>3.5?1.6:1.0)+CLOTH*0.55;
    // the Well's own light, from below
    vec3 wv=WELL-P;float w2=dot(wv,wv);
    vec3 wl=RIM*0.075/(w2+0.05)*(0.3+0.7*max(dot(n,wv*inversesqrt(w2)),0.0));
    vec3 light=(amb+key)*occl+E+wl;
    col=alb*light*(1.0-0.55*rec)+emis;
    // foil: it flashes where a light, the eye and the engraved face agree. One light goes round with the page.
    vec3 gl=normalize(vec3(sin(uGlint)*0.75,cos(uGlint)*0.75,-0.62));
    float sg=pow(max(dot(n,normalize(gl+v)),0.0),34.0)+0.5*pow(max(dot(n,normalize(-sun+v)),0.0),26.0)*inb;
    float ring=pow(max(cos(th-uGlint),0.0),20.0)+0.4*pow(max(cos(th-uGlint-2.3),0.0),44.0);
    vec3 fl=vec3(1.0,0.82,0.58)*(sg*1.35+ring*(kind>2.5?0.0:(kind>1.5?0.9:0.22)))*exp(-depth*0.5)+Sp+RIM*wl*3.0;
    col+=fl*foil;
    col=mix(col,vec3(0.010,0.024,0.030)+SKY*0.02*exp(-depth*1.2),1.0-exp(-dist*0.16));
  }else if(kind<0.5){
    // open air: the surface's light above, nothing below
    col=d.z<0.0?vec3(0.95,0.91,0.82)*(0.55+1.1*smoothstep(0.0,-0.9,d.z))+vec3(0.05,0.06,0.06):vec3(0.0);
    if(bent>0.0)col*=RIM*1.25;
  }
  col=col*(1.0-spr.a)+spr.rgb+halo*(kind>4.5?0.0:1.0);
  if(bent>0.0)col*=1.0+0.35*smoothstep(0.3,2.5,bent);

  // the beam itself: the dust in the shaft takes the surface's light (the length of this ray that lies inside it)
  if(kind<4.5){
    vec2 w0=o.xy-sl*o.z;vec2 wd=d.xy-sl*d.z;
    float A=dot(wd,wd),B=dot(w0,wd),C=dot(w0,w0)-R0*R0*0.88;float disc=B*B-A*C;
    if(disc>0.0&&A>1e-6){
      float sq=sqrt(disc);float ta=max((-B-sq)/A,0.0);float tb=min((-B+sq)/A,tH);
      if(d.z>1e-4)ta=max(ta,-o.z/d.z);else if(d.z<-1e-4)tb=min(tb,-o.z/d.z);else if(o.z<0.0)tb=ta;
      float seg=max(tb-ta,0.0);float zm=max(o.z+0.5*(ta+tb)*d.z,0.0);
      vec2 wm=w0+wd*0.5*(ta+tb);float lane=0.72+0.28*vnoise(vec2(atan(wm.x,wm.y)*5.0,length(wm)*7.0));
      col+=SKY*seg*0.085*exp(-zm*1.15)*lane;
    }
  }
  // the dust: motes drawn toward the Well on the viewer's own clock. None of it is seen inside.
  if(kind<4.5){
    float pr=length(uv-uShift)+0.03;vec2 lp=vec2(atan(uv.x-uShift.x,uv.y-uShift.y)*1.9,log(pr)*2.4);
    for(int j=0;j<2;j++){
      float fj=float(j);float sc=5.0+fj*4.0;
      vec2 q=lp*sc+vec2(fj*3.7+uTau*0.05,uTau*(0.20+0.08*fj));
      vec2 id=floor(q);vec2 f=fract(q)-0.5;float h=hash(id+fj*17.0);
      vec2 off=(vec2(hash(id+1.3),hash(id+7.9))-0.5)*0.7;
      float m=smoothstep(0.05,0.0,length(f-off))*step(0.74,h);
      col+=vec3(0.95,0.88,0.74)*m*(0.04+0.08*h);
    }
  }
  // the rim: the last light, bent round the edge. The one place the pale gold is allowed.
  col+=RIM*rim+vec3(1.0,0.93,0.76)*pow(min(rim,1.5),3.0)*0.22;

  // the station on its thread of light
  if(uStP.z>0.001){
    vec2 A=uStAB.xy,B=uStAB.zw;vec2 ax=B-A;float len=length(ax);vec2 dir=ax/len;vec2 nor=vec2(dir.y,-dir.x);
    vec2 q=uv-A;float al=dot(q,dir)/len;float ac=dot(q,nor)/(len*uStP.x)+0.5;
    float px=1.0/uRes.y;float dl=abs(dot(q,nor));
    float thr=(smoothstep(px*1.1,0.0,dl)*0.9+0.16*exp(-dl*dl/(px*px*30.0)))*step(al,0.03)*uStP.z;
    col+=vec3(1.0,0.90,0.70)*thr*(0.55+0.45*smoothstep(-6.0,0.0,al));
    if(al>0.0&&al<1.0&&ac>0.0&&ac<1.0){
      vec2 st=vec2(ac,al);float sll=log2(max(1024.0*px/len,1.0));
      vec4 tx=TEX(uSt,st,sll);
      if(tx.a>0.003){
        vec3 base=tx.rgb/max(tx.a,0.02);
        vec2 e=vec2(1.5/256.0,1.5/1024.0)*exp2(sll);
        float lx=lum(TEX(uSt,st+vec2(e.x,0.0),sll).rgb)-lum(TEX(uSt,st-vec2(e.x,0.0),sll).rgb);
        float ly=lum(TEX(uSt,st+vec2(0.0,e.y),sll).rgb)-lum(TEX(uSt,st-vec2(0.0,e.y),sll).rgb);
        // a body of revolution: its width at this height gives the round of it; the engraving gives the rest
        float hw=max(0.5-0.5*smoothstep(0.30,1.0,al)*0.96,0.02)*0.94;
        float cx=clamp((ac-0.5)/hw,-1.0,1.0);
        vec3 nb=normalize(vec3(cx*1.05-lx*3.4,-ly*3.4+0.12,sqrt(max(1.0-cx*cx,0.0))+0.25));
        float dz=uStP.y;
        vec3 l1=normalize(vec3(-0.45+0.5*sin(uGlint)+uStP.w*5.0,0.75,0.55));    // the surface, far above; it shifts as the page moves
        vec3 l2=normalize(vec3(0.5-uStP.w*4.0,-0.85,0.35));                       // the Well, below
        float topL=exp(-dz*0.42);float botL=0.08+0.9*exp(-(${f3(ZW)}-dz)*2.2);
        float dif=max(dot(nb,l1),0.0)*topL*1.5+max(dot(nb,l2),0.0)*botL*0.9+0.16;
        vec3 hv=normalize(l1+vec3(0.0,0.0,1.0));vec3 hw2=normalize(l2+vec3(0.0,0.0,1.0));
        float sp=pow(max(dot(nb,hv),0.0),38.0)*topL*1.6+pow(max(dot(nb,hw2),0.0),30.0)*botL*1.2;
        float edge=pow(1.0-nb.z*0.8,3.0);
        vec3 sc=base*uStTint*(dif*1.25+edge*0.25*topL)+vec3(1.0,0.86,0.62)*sp*(0.35+0.9*lum(base))+RIM*botL*edge*0.5;
        col=mix(col,sc,tx.a*uStP.z);
      }
    }
  }
  col=1.0-exp(-col*1.12);
  col=pow(col,vec3(0.94));
  vec2 vg=uv-uShift;col*=1.0-0.30*dot(vg,vg);
  col+=(hash(gl_FragCoord.xy+fract(uTau))-0.5)/150.0;
  gl_FragColor=vec4(col,1.0);
}`;

const PLATE = `
varying vec2 vUv;
uniform sampler2D uTex;uniform vec2 uPx;uniform vec2 uLight;uniform float uWarm;uniform vec2 uSize;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec2 uv=vec2(vUv.x,1.0-vUv.y);
  vec3 c=texture2D(uTex,uv).rgb;
  vec2 e=uPx*1.6;
  float lx=dot(texture2D(uTex,uv+vec2(e.x,0.0)).rgb-texture2D(uTex,uv-vec2(e.x,0.0)).rgb,vec3(0.3333));
  float ly=dot(texture2D(uTex,uv+vec2(0.0,e.y)).rgb-texture2D(uTex,uv-vec2(0.0,e.y)).rgb,vec3(0.3333));
  float foil=smoothstep(0.03,0.16,(c.r-c.b)*uWarm);
  // the weave of the cloth, under the same raking light: two sets of threads, each lit along its own run
  vec2 q=uv*uSize*0.5;vec2 cs=cos(q*3.14159265);vec2 sn=sin(q*3.14159265);float par=step(0.0,sn.x*sn.y);
  vec2 wv=vec2(-cs.x*sn.x*(1.0-par),-cs.y*sn.y*par)*(1.0-foil)*0.55;
  vec3 n=normalize(vec3(-lx*4.4+wv.x,-ly*4.4+wv.y,1.0));
  vec3 lp=normalize(vec3(uLight-uv,0.30));
  float diff=dot(n,lp);
  float spec=pow(max(dot(n,normalize(lp+vec3(0.0,0.0,1.0))),0.0),40.0);
  float sweep=exp(-pow((uv.x*0.6+uv.y-uLight.y*1.6-uLight.x*0.3+0.2)/0.16,2.0));   // a band of light that crosses the foil as the book passes
  float fall=1.0-0.46*smoothstep(0.1,1.1,length(uLight-uv));
  vec3 outc=c*(0.72+0.5*diff)*fall*1.15+vec3(1.0,0.86,0.62)*(spec*(0.05+0.6*foil)+sweep*foil*0.20);
  gl_FragColor=vec4(outc,1.0);
}`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix3 = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];

function context(canvas, attrs) {
  let gl = canvas.getContext('webgl2', attrs), gl2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', attrs);
  if (!gl) return null;
  const lod = gl2 || !!gl.getExtension('EXT_shader_texture_lod');
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  return { gl, gl2, lod, aniso };
}
function program(cx, fs) {
  const gl = cx.gl;
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT(cx.gl2))); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, HEAD(cx.gl2, cx.lod) + fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  if (!cx.buf) { cx.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cx.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); }
  const loc = gl.getAttribLocation(p, 'aP');
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
  return { p, u, loc };
}
function use(cx, prog) {
  const gl = cx.gl; gl.useProgram(prog.p); gl.bindBuffer(gl.ARRAY_BUFFER, cx.buf); gl.enableVertexAttribArray(prog.loc); gl.vertexAttribPointer(prog.loc, 2, gl.FLOAT, false, 0, 0);
}
// kind: 'tile' (mirrored round the ring, mipmapped) · 'cut' (an object with alpha, mipmapped) · 'flat' (a picture)
function texture(cx, img, kind) {
  const gl = cx.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, kind === 'cut' ? 1 : 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, kind === 'tile' ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (kind === 'flat') gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  else { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
  if (kind === 'tile' && cx.aniso) gl.texParameterf(gl.TEXTURE_2D, cx.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  return t;
}
const load = (src) => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
const BASE = new URL('./assets/scenes/', import.meta.url);

/* The camera for a depth s: 0 above the mouth of the Stair, looking down into it; 1 on the floor of the
   Stair, beside the Well; a little past 1 at the Threshold. From the mouth it goes down one straight line,
   so the depth on the gauge is the depth in the picture: linear in s, never eased.
   fit: { cx, cy, rx, ry } — the oval the mouth must fill on the first screen (centre and half-axes, in units of
   the viewport's height, y up). The first camera is solved so that the mouth's own ellipse is that oval, and the
   picture is then slid to wherever the oval is, so the mouth stays in the opening as the sheet is drawn away. */
const S_MOUTH = 0.12;
const P1 = [0, -1.20, -1.0], T1 = [0, 0.22, 1.25], P2 = [0, -0.345, 1.74], T2 = [0, 0.52, 2.24];
const basis = (pos, tgt) => { const f = norm(sub(tgt, pos)), r = norm(cross(f, [0, 0, -1])), u = cross(r, f); return { f, r, u }; };
const fits = new Map();
function fitCamera(fit, tan) {
  const key = [fit.rx, fit.ry, tan].map((v) => v.toFixed(4)).join();
  if (fits.has(key)) return fits.get(key);
  const G = [0, 0, 0.1];
  const box = (phi, D) => {
    const pos = [0, -Math.cos(phi) * D, G[2] - Math.sin(phi) * D], B = basis(pos, G);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * 2 * Math.PI, v = sub([Math.sin(a) * R0, Math.cos(a) * R0, 0], pos), z = dot(v, B.f);
      const x = dot(v, B.r) / (tan * z), y = dot(v, B.u) / (tan * z);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { pos, w: (x1 - x0) / 2, h: (y1 - y0) / 2, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  const want = clamp(fit.ry / fit.rx, 0.3, 0.98);
  let lo = 0.3, hi = 1.55, best = null;
  for (let i = 0; i < 22; i++) {
    const phi = (lo + hi) / 2;
    let dl = 1.3, dh = 30;
    for (let j = 0; j < 24; j++) { const D = (dl + dh) / 2; if (box(phi, D).w > fit.rx) dl = D; else dh = D; }
    best = box(phi, (dl + dh) / 2);
    if (best.h / best.w < want) lo = phi; else hi = phi;
  }
  const out = { pos: best.pos, tgt: G, c: [best.cx, best.cy] };
  if (fits.size > 24) fits.clear();
  fits.set(key, out); return out;
}
export function camera(s, fit, aspect) {
  const tan = 2 * Math.tan(((aspect < 0.8 ? 68 : 58) * Math.PI / 180) / 2);
  const a = clamp(s, 0, 1), over = clamp(s - 1, 0, 0.2) / 0.2;
  let pos, tgt, shift = [0, 0.02];
  if (a < S_MOUTH) {
    const k = a / S_MOUTH;
    if (fit && fit.rx) { const F = fitCamera(fit, tan); pos = mix3(F.pos, P1, k); tgt = mix3(F.tgt, T1, k); shift = [(F.c[0] - fit.cx) * (1 - k), (F.c[1] - fit.cy) * (1 - k) + 0.02 * k]; }
    else { pos = mix3([0, -1.42, -1.5], P1, k); tgt = mix3([0, 0.1, 0.7], T1, k); }
  } else { const t = (a - S_MOUTH) / (1 - S_MOUTH); pos = mix3(P1, P2, t); tgt = mix3(T1, T2, t); }
  if (over) { pos = mix3(pos, [0, -0.27, ZW - 0.40], over); tgt = mix3(tgt, [0, 0.35, ZW + 0.10], over); }
  return { pos, tgt, shift, tan, near: a < S_MOUTH ? a / S_MOUTH : 1 };
}
export const lagOfRing = (i) => Math.sqrt(1 + Math.pow(10, -3 + 7 * (i / N)));   // ring 0 is the surface, the last landing is ×100

function stairProgram(cx) {
  const prog = program(cx, STAIR);
  const rings = new Float32Array((N + 1) * 4);
  for (let i = 0; i <= N; i++) { rings[i * 4] = rOf(i); rings[i * 4 + 1] = LAMPS[i] || 1; rings[i * 4 + 2] = (i * 2.39996) % (2 * Math.PI) - Math.PI; rings[i * 4 + 3] = baysOf(i); }
  return { prog, rings, hands: new Float32Array(N * 4) };
}
async function stairTextures(cx, small) {
  const [wi, mi, si, li] = await Promise.all([load(new URL(small ? 'el-wall-1k.jpg' : 'el-wall.jpg', BASE).href), load(new URL('el-wall-m.jpg', BASE).href), load(new URL('el-station.png', BASE).href), load(new URL('el-lamp.png', BASE).href)]);
  return { wall: texture(cx, wi, 'tile'), wallM: texture(cx, mi, 'tile'), st: texture(cx, si, 'cut'), lamp: texture(cx, li, 'cut'), wallH: wi.height };
}
/* One frame of the Stair into the current viewport (w × h device pixels).
   st: { s | cam, fit, t (seconds, the surface's clock), tau (the viewer's), glint, station (0..1), tint, px, py (pointer, −1..1) } */
function drawStair(cx, S, tex, w, h, st) {
  const gl = cx.gl, U = S.prog.u;
  const cam = st.cam || camera(st.s, st.fit, w / h);
  const pos = cam.pos.slice();
  const f0 = norm(sub(cam.tgt, pos)), r0 = norm(cross(f0, [0, 0, -1])), u0 = cross(r0, f0);
  // the pointer moves the eye a little: near things pass far things
  const par = 0.05 * Math.min(1, Math.hypot(pos[1], pos[2] - ZW) / 1.5) * (cam.near == null ? 1 : cam.near);
  pos[0] += r0[0] * (st.px || 0) * par + u0[0] * (st.py || 0) * par * 0.6; pos[1] += r0[1] * (st.px || 0) * par + u0[1] * (st.py || 0) * par * 0.6; pos[2] += u0[2] * (st.py || 0) * par * 0.6;
  const f = norm(sub(cam.tgt, pos)), r = norm(cross(f, [0, 0, -1])), u = cross(r, f);
  use(cx, S.prog);
  gl.uniform2f(U.uRes, w, h);
  gl.uniform3fv(U.uCam, pos); gl.uniform3fv(U.uF, f); gl.uniform3fv(U.uR, r); gl.uniform3fv(U.uU, u);
  gl.uniform1f(U.uTan, cam.tan); gl.uniform2f(U.uShift, cam.shift[0], cam.shift[1]);
  gl.uniform1f(U.uTau, st.tau % 4096); gl.uniform1f(U.uGlint, st.glint); gl.uniform1f(U.uPix, cam.tan / h); gl.uniform1f(U.uSeed, 3);
  gl.uniform1f(U.uWallK, (cam.tan / h) * tex.wallH / H);
  // every ring's own clock: its light goes round at 1/γ of the surface's rate, and its lamps breathe on the same clock
  const hd = S.hands;
  for (let i = 0; i < N; i++) {
    const g = lagOfRing(i), ph = st.t / g;
    hd[i * 4] = ((ph * (2 * Math.PI / 28) + i * 1.9) % (2 * Math.PI)) - Math.PI;
    hd[i * 4 + 1] = (0.80 + 0.20 * Math.sin(ph * 1.7 + i)) * (1 - 0.25 * (i / N));
    hd[i * 4 + 2] = i ? HL : HL0;
  }
  gl.uniform4fv(U.uRing, S.rings); gl.uniform4fv(U.uHand, hd);
  // the station hangs on the axis, goes down ahead of the eye, and stops above the Well
  const on = st.station || 0;
  if (on > 0.001) {
    // it goes down more slowly than the eye: on the floor of the Stair only its point is still in view. Seen from above
    // the mouth it is drawn out long, point toward the Well, as on the covers.
    const k = st.cam ? (st.stationAt == null ? 0.5 : st.stationAt) : clamp(st.s, 0, 1.2), far = st.cam ? 0 : 1 - clamp(k / 0.3, 0, 1);
    const LEN = 0.70 + 0.55 * far, top = 0.25 + 0.95 * k - 0.16 * far, tip = top + LEN, PIV = -1.4;
    const sw = 0.032 * Math.sin(st.tau * 0.9) + 0.010 * Math.sin(st.tau * 2.1 + 1);     // it swings on the viewer's own clock
    const proj = (p) => { const v = sub(p, pos), z = dot(v, f); return [dot(v, r) / (cam.tan * z), dot(v, u) / (cam.tan * z), z]; };
    const a = proj([sw * (top - PIV) / (tip - PIV), 0, top]), b = proj([sw, 0, tip]);
    gl.uniform4f(U.uStAB, a[0], a[1], b[0], b[1]);
    gl.uniform4f(U.uStP, 0.25, top + 0.35, a[2] > 0.05 && b[2] > 0.05 ? on : 0, sw);
  } else gl.uniform4f(U.uStP, 0.25, 0, 0, 0);
  const tint = st.tint || [1.06, 0.95, 0.84]; gl.uniform3f(U.uStTint, tint[0], tint[1], tint[2]);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.wall); gl.uniform1i(U.uWall, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.wallM); gl.uniform1i(U.uWallM, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex.st); gl.uniform1i(U.uSt, 2);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tex.lamp); gl.uniform1i(U.uLamp, 3);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/* 1 · THE STAIR. host: the fixed .scene element. Returns { frame(state), resize(), dead }. */
export async function mountStair(host, opts) {
  opts = opts || {};
  const canvas = document.createElement('canvas');
  canvas.className = 'scene-gl';
  const cx = context(canvas, { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.keep });
  if (!cx) return null;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  let S, tex;
  try { S = stairProgram(cx); tex = await stairTextures(cx, small); }
  catch (e) { console.warn('stair: unavailable — the still holds', e); return null; }
  host.appendChild(canvas);
  const me = { dead: false, scale: 1, slowFrames: 0, painted: false, t0: performance.now(), canvas };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); me.dead = true; canvas.style.opacity = '0'; });
  const budget = opts.budget || (small ? 0.95e6 : 1.8e6);
  me.resize = () => {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, opts.dpr || 2);
    const k = Math.min(dpr, Math.sqrt(budget / (w * h))) * me.scale;
    const W = Math.max(2, Math.round(w * k)), Hh = Math.max(2, Math.round(h * k));
    if (canvas.width !== W || canvas.height !== Hh) { canvas.width = W; canvas.height = Hh; }
  };
  me.resize();
  me.frame = (st) => {
    if (me.dead) return;
    // sustained slow frames (not the page's own load) lower the resolution, never below half of the cap
    if (performance.now() - me.t0 > 2500) {
      if (st.ms > 23) { if (++me.slowFrames > 24 && me.scale > 0.5) { me.scale *= 0.85; me.slowFrames = 0; me.resize(); } } else if (me.slowFrames > 0) me.slowFrames--;
    }
    const gl = cx.gl, W = canvas.width, Hh = canvas.height;
    gl.viewport(0, 0, W, Hh);
    // only what can be seen is drawn: on the first screen that is the oval in the sheet
    if (st.clip) {
      const kx = W / host.clientWidth, ky = Hh / host.clientHeight, c = st.clip;
      const x0 = Math.max(0, Math.floor(c[0] * kx)), x1 = Math.min(W, Math.ceil(c[2] * kx)), y0 = Math.max(0, Math.floor(c[1] * ky)), y1 = Math.min(Hh, Math.ceil(c[3] * ky));
      if (x1 <= x0 || y1 <= y0) return;
      gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, Hh - y1, x1 - x0, y1 - y0);
    } else gl.disable(gl.SCISSOR_TEST);
    drawStair(cx, S, tex, W, Hh, st);
    if (!me.painted) { me.painted = true; canvas.style.opacity = '1'; }
  };
  return me;
}

/* 2 · THE PLATES. One shared context renders every framed picture; each is shown through its own 2D canvas laid
   exactly over its still image, so the plates scroll with the page like the pictures they are.
   <img data-gl="plate">  a cover, re-lit.        <img data-gl="view" data-cam="x,y,z, tx,ty,tz" data-station="1">  a view in the Stair. */
export async function mountPlates(imgs, opts) {
  if (!imgs.length) return null;
  const glc = document.createElement('canvas');
  const cx = context(glc, { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
  if (!cx) return null;
  const gl = cx.gl;
  let prog, S = null, tex = null;
  try {
    prog = program(cx, PLATE);
    if (imgs.some((i) => i.dataset.gl === 'view')) { S = stairProgram(cx); tex = await stairTextures(cx, true); }
  } catch (e) { console.warn('plates: unavailable — the pictures hold', e); return null; }
  const me = { dead: false, slots: [] };
  glc.addEventListener('webglcontextlost', (e) => { e.preventDefault(); me.dead = true; me.slots.forEach((s) => { s.cv.style.opacity = '0'; }); });
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { for (const e of es) { const s = me.slots.find((x) => x.img === e.target); if (s) s.vis = e.isIntersecting; } }, { rootMargin: '10% 0px' }) : null;
  imgs.forEach((img) => {
    const cv = document.createElement('canvas'); cv.className = 'plate-gl'; cv.setAttribute('aria-hidden', 'true');
    const par = img.parentElement; if (getComputedStyle(par).position === 'static') par.style.position = 'relative';
    img.after(cv);
    const view = img.dataset.gl === 'view';
    const slot = { img, cv, ctx: cv.getContext('2d'), view, warm: img.dataset.warm === '-1' ? -1 : 1, vis: !io, tex: null, on: false };
    if (view) {
      const c = (img.dataset.cam || '0,-1.2,-1,0,0.2,1.2').split(',').map(Number);
      slot.cam = { pos: c.slice(0, 3), tgt: c.slice(3, 6), fov: c[6] || 56 }; slot.station = +img.dataset.station || 0; slot.stationAt = img.dataset.stationAt == null ? 0.5 : +img.dataset.stationAt;
      slot.tint = img.dataset.tint ? img.dataset.tint.split(',').map(Number) : null; slot.tex = true;
    } else {
      const ready = () => { if (me.dead || !img.naturalWidth) return; try { slot.tex = texture(cx, img, 'flat'); slot.px = [1 / img.naturalWidth, 1 / img.naturalHeight]; } catch (e) { slot.tex = null; } };
      if (img.complete && img.naturalWidth) ready(); else img.addEventListener('load', ready, { once: true });
    }
    me.slots.push(slot); if (io) io.observe(img);
  });
  me.layout = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let mw = 2, mh = 2;
    me.slots.forEach((s) => {
      const w = s.img.offsetWidth, h = s.img.offsetHeight; if (!w || !h) return;
      s.cv.style.left = s.img.offsetLeft + 'px'; s.cv.style.top = s.img.offsetTop + 'px'; s.cv.style.width = w + 'px'; s.cv.style.height = h + 'px';
      const k = s.view ? Math.min(dpr, 1.5, Math.sqrt(0.5e6 / (w * h))) : dpr;
      const W = Math.round(w * k), Hh = Math.round(h * k);
      if (s.cv.width !== W || s.cv.height !== Hh) { s.cv.width = W; s.cv.height = Hh; s.dirty = true; }
      mw = Math.max(mw, W); mh = Math.max(mh, Hh);
    });
    if (glc.width < mw || glc.height < mh) { glc.width = mw; glc.height = mh; }
  };
  me.layout();
  const U = prog.u;
  // state: { vh, pointer:[x,y]|null, t, tau, glint, still }
  me.frame = (st) => {
    if (me.dead) return;
    for (const s of me.slots) {
      if (!s.vis || !s.tex || !s.cv.width) continue;
      if (st.still && s.on && !s.dirty) continue;
      const r = s.cv.getBoundingClientRect(); if (r.bottom < -40 || r.top > st.vh + 40 || !r.width) continue;
      const w = s.cv.width, h = s.cv.height;
      const pass = clamp((r.top + r.height * 0.5) / st.vh, -0.3, 1.3);          // 0 at the top of the screen, 1 at the foot
      const over = st.pointer && st.pointer[0] > r.left - 80 && st.pointer[0] < r.right + 80 && st.pointer[1] > r.top - 80 && st.pointer[1] < r.bottom + 80;
      gl.viewport(0, 0, w, h);
      if (s.view) {
        const tan = 2 * Math.tan((s.cam.fov * Math.PI / 180) / 2);
        // the view leans a little as the plate passes: the near terraces move against the far ones
        const pos = s.cam.pos.slice(); pos[2] += (pass - 0.5) * 0.10;
        drawStair(cx, S, tex, w, h, { cam: { pos, tgt: s.cam.tgt, shift: [0, 0], tan }, t: st.t, tau: st.tau, glint: st.glint + pass * 1.4, station: s.station, stationAt: s.stationAt, tint: s.tint,
          px: over ? ((st.pointer[0] - r.left) / r.width - 0.5) * 2 : 0, py: over ? -((st.pointer[1] - r.top) / r.height - 0.5) * 2 : 0 });
      } else {
        const now = performance.now(), key = Math.round(r.top) + ':' + (over ? st.pointer[0] + ',' + st.pointer[1] : '');
        if (s.on && !s.dirty && key === s.key && now - (s.t || 0) < 400) continue;   // nothing moved: the plate keeps its last frame
        s.key = key; s.t = now;
        let lx = 0.5 + 0.55 * Math.sin(pass * 3.1 - 1.2), ly = 0.05 + 0.75 * pass;
        if (over) { lx = (st.pointer[0] - r.left) / r.width; ly = (st.pointer[1] - r.top) / r.height; }
        use(cx, prog);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.uniform1i(U.uTex, 0);
        gl.uniform2f(U.uPx, s.px[0], s.px[1]); gl.uniform2f(U.uLight, lx, ly); gl.uniform1f(U.uWarm, s.warm); gl.uniform2f(U.uSize, w, h);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      s.ctx.drawImage(glc, 0, glc.height - h, w, h, 0, 0, w, h);
      s.dirty = false;
      if (!s.on) { s.on = true; s.cv.style.opacity = '1'; }
    }
  };
  return me;
}
