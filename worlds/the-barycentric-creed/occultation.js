// occultation.js — the frontispiece of The Barycentric Creed.
// A procedural starfield in a round night plate, and a mass that is never drawn: visible
// only as gravitational lensing and as permanent erasure — stars it has crossed stay out.
// Only stars are drawn here; the title is plain DOM type on the paper beside the plate.
// Hand-rolled WebGL1, no dependencies.
const VERT = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';

const FRAG = `precision highp float;varying vec2 vUv;
uniform float uT,uAspect,uK,uRin;
uniform vec2 uMass,uPar;
uniform sampler2D uOcc;
uniform vec3 uBg;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+7.1;a*=.5;}return s;}
float layer(vec2 sky,float n,float dens,float tw){
  vec2 g=sky*n;vec2 id=floor(g);vec2 f=fract(g);
  float rn=h21(id);
  vec2 sp=vec2(h21(id+13.7),h21(id+27.2))*.7+.15;
  float d=length(f-sp);
  float sz=(.05+.16*h21(id+31.9))*clamp(n/20.,.42,1.);
  float core=smoothstep(sz,sz*.2,d);
  float gate=step(rn,dens);
  float ph=h21(id+8.4);
  float twk=mix(1.,.55+.45*sin(uT*(.25+ph*.9)+ph*40.),step(.78,h21(id+3.3))*tw);
  vec2 occUv=((id+sp)/n)/vec2(uAspect,1.)+.5;
  float occ=texture2D(uOcc,occUv).r;
  float bright=.3+.7*h21(id+5.9);
  return core*gate*twk*bright*(1.-occ);
}
void main(){
  vec2 sky=(vUv-.5)*vec2(uAspect,1.);
  vec2 d=sky-uMass;float dist=max(length(d),1e-4);vec2 dir=d/dist;
  // light that reaches the eye at this point left its source nearer the mass
  vec2 ssky=sky-dir*(uK/max(dist,uRin*.6));
  float band=exp(-pow((ssky.y*.86+ssky.x*.5-.04)/.24,2.));
  float s=0.;
  s+=layer(ssky+uPar*1.6,8.,.11,1.)*1.1;
  s+=layer(ssky+uPar*.8,19.,.085+.05*band,1.)*.82;
  s+=layer(ssky+uPar*.3,41.,.06+.1*band,.7)*.52;
  s+=layer(ssky+uPar*.15,88.,.05+.16*band,0.)*.3;
  float ring=exp(-pow((dist-uRin*1.42)/(uRin*.5),2.));
  vec2 tang=vec2(-dir.y,dir.x);
  float sm=layer(ssky+tang*.014,19.,.1,0.)+layer(ssky-tang*.014,19.,.1,0.)+layer(ssky+tang*.03,41.,.1,0.);
  s+=sm*ring*.8;
  float hole=smoothstep(uRin*.9,uRin*1.05,dist);
  vec3 col=uBg;
  col+=vec3(.014,.018,.026)*(1.-smoothstep(.0,.6,length(sky)));
  float dust=fbm(ssky*3.1+4.)*fbm(ssky*7.3+1.7);
  col+=vec3(.085,.105,.14)*dust*band*1.5*hole;
  col+=mix(vec3(.94,.95,1.),vec3(.486,.561,.651),.42)*s*hole;
  gl_FragColor=vec4(col,1.);
}`;

const OFRAG = `precision mediump float;varying vec2 vUv;
uniform sampler2D uPrev;uniform vec2 uMass;uniform float uAspect,uRin;
void main(){
  vec2 sky=(vUv-.5)*vec2(uAspect,1.);
  float m=smoothstep(uRin,uRin*.62,length(sky-uMass));
  float p=texture2D(uPrev,vUv).r;
  gl_FragColor=vec4(max(p,m),0.,0.,1.);
}`;

function fract(x){ return x - Math.floor(x); }
function hashN(n){ return fract(Math.sin(n * 127.1) * 43758.5453); }
function clamp(v, a, b){ return Math.min(Math.max(v, a), b); }

export async function initOccultation(cfg){
  const stage = cfg.stage;
  if (!stage) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'opacity:0;transition:opacity 1400ms ease;pointer-events:none;z-index:2;';
    const gl = canvas.getContext('webgl', { antialias:false, alpha:false, depth:false, stencil:false, powerPreference:'low-power' });
    if (!gl) return null;
    const staticSky = cfg.staticSky;
    if (staticSky && staticSky.parentNode === stage) stage.insertBefore(canvas, staticSky.nextSibling);
    else stage.insertBefore(canvas, stage.firstChild);

    const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = (fs) => { const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
    const main = prog(FRAG), occ = prog(OFRAG);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const bindAttr = (p) => { const loc = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); };
    const locs = new Map();
    const U = (p, n) => { let m = locs.get(p); if (!m) locs.set(p, m = {}); return n in m ? m[n] : (m[n] = gl.getUniformLocation(p, n)); };

    // occlusion ping-pong (permanent star erasure), 256²
    const OSZ = 256;
    const mkTex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, OSZ, OSZ, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    const occTex = [mkTex(), mkTex()];
    const occFbo = [gl.createFramebuffer(), gl.createFramebuffer()];
    for (let i = 0; i < 2; i++) { gl.bindFramebuffer(gl.FRAMEBUFFER, occFbo[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, occTex[i], 0);
      gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let w = 0; // index of most recently written occ texture

    let pathY = 0.08;

    let aspect = 1, dpr = 1;
    function resize(){
      const r = stage.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      const px = r.width * r.height * dpr * dpr;
      if (px > 1.5e6) dpr *= Math.sqrt(1.5e6 / px);
      canvas.width = Math.max(2, Math.round(r.width * dpr));
      canvas.height = Math.max(2, Math.round(r.height * dpr));
      aspect = canvas.width / canvas.height;
    }

    // ------- state driven from the page -------
    let px = 0, py = 0.1;          // pointer, sky space
    let scrollBoost = 0;            // 0..1 as hero scrolls off
    let running = true, visible = true, started = performance.now();
    let pausedAt = 0, faded = false;

    const onMove = (e) => { const r = canvas.getBoundingClientRect(); if (!r.width) return;
      px = clamp(((e.clientX - r.left) / r.width - 0.5) * aspect, -1, 1);
      py = clamp(0.5 - (e.clientY - r.top) / r.height, -1, 1); };
    const onScroll = () => { const r = stage.getBoundingClientRect();
      scrollBoost = clamp((innerHeight * 0.5 - (r.top + r.height / 2)) / Math.max(r.height, 1), 0, 1); };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    const io = new IntersectionObserver((es) => { es.forEach(e => { visible = e.isIntersecting; sync(); }); });
    io.observe(stage);
    const onVis = () => sync();
    document.addEventListener('visibilitychange', onVis);
    function sync(){
      const should = visible && !document.hidden && running;
      if (should && pausedAt) { started += performance.now() - pausedAt; pausedAt = 0; raf = requestAnimationFrame(frame); }
      else if (!should && !pausedAt) { pausedAt = performance.now(); if (raf) cancelAnimationFrame(raf); raf = 0; }
    }

    // The mass crosses the plate from the right, and is already in it
    // when the page opens: nobody should have to wait to see the sky bend.
    function massAt(t){
      const T = 150, t1 = t + T * 0.36;
      const pass = Math.floor(t1 / T), f = (t1 % T) / T;
      const y0 = pathY + 0.12 * (hashN(pass * 7.31 + 1.7) - 0.5);
      const y1 = y0 + 0.08 * (hashN(pass * 3.13 + 9.2) - 0.5);
      const half = aspect * 0.5;
      let x = half + 0.24 - f * (aspect + 0.48);
      let y = y0 + (y1 - y0) * f + 0.014 * Math.sin(t * 0.21);
      // the absence is faintly interested in you (≤5%)
      x += (px - x) * 0.05; y += (py - y) * 0.05;
      return [x, y];
    }

    const RIN = 0.105;
    let fc = 0, raf = 0;
    function frame(now){
      raf = 0;
      if (pausedAt) return;
      const t = (now - started) / 1000;
      const m = massAt(t);
      // accumulate permanent occlusion (every other frame)
      if (fc++ % 2 === 0){
        gl.useProgram(occ); bindAttr(occ);
        gl.bindFramebuffer(gl.FRAMEBUFFER, occFbo[1 - w]);
        gl.viewport(0, 0, OSZ, OSZ);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, occTex[w]);
        gl.uniform1i(U(occ, 'uPrev'), 0);
        gl.uniform2f(U(occ, 'uMass'), m[0], m[1]);
        gl.uniform1f(U(occ, 'uAspect'), aspect);
        gl.uniform1f(U(occ, 'uRin'), RIN);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        w = 1 - w;
      }
      gl.useProgram(main); bindAttr(main);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, occTex[w]);
      gl.uniform1i(U(main, 'uOcc'), 0);
      gl.uniform1f(U(main, 'uT'), t);
      gl.uniform1f(U(main, 'uAspect'), aspect);
      gl.uniform1f(U(main, 'uK'), 0.0105 * (cfg.lens || 1) * (1 + scrollBoost));
      gl.uniform1f(U(main, 'uRin'), RIN);
      gl.uniform2f(U(main, 'uMass'), m[0], m[1]);
      gl.uniform2f(U(main, 'uPar'), px * 0.006, py * 0.006);
      gl.uniform3f(U(main, 'uBg'), 0.047, 0.055, 0.067);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!faded){
        faded = true;
        requestAnimationFrame(() => {
          canvas.style.opacity = '1';
          if (cfg.staticSky) { cfg.staticSky.style.transition = 'opacity 1600ms ease'; cfg.staticSky.style.opacity = '0'; }
        });
      }
      raf = requestAnimationFrame(frame);
    }

    let roT = 0;
    const ro = new ResizeObserver(() => { clearTimeout(roT); roT = setTimeout(resize, 160); });
    ro.observe(stage);

    await (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve());
    resize();
    raf = requestAnimationFrame(frame);

    const px4 = new Uint8Array(OSZ * OSZ * 4);
    function getStarsLost(){
      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, occFbo[w]);
        gl.readPixels(0, 0, OSZ, OSZ, gl.RGBA, gl.UNSIGNED_BYTE, px4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let hit = 0, n = 0;
        for (let i = 0; i < px4.length; i += 16) { n++; if (px4[i] > 140) hit++; }
        return Math.round((hit / Math.max(n, 1)) * 520);
      } catch (e) { return 0; }
    }

    function teardown(){
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect(); ro.disconnect();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
      canvas.remove();
      if (cfg.staticSky) cfg.staticSky.style.opacity = '';
    }

    // A lost context (GPU reset, driver timeout) freezes the canvas mid-frame, and the
    // first-frame handoff has already faded out the static sky. Tearing down puts the
    // designed no-WebGL plate back rather than leaving a dead canvas in the frontispiece.
    canvas.addEventListener('webglcontextlost', teardown);

    return { getStarsLost, destroy: teardown };
  } catch (e) { console.warn('occultation fallback:', e); return null; }
}
