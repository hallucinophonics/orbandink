// crossing.js — the Curram where WebGL is absent. One 2D canvas over the still (a settled frame of the built scene).
// The still already holds the law: ruled reflections under the west quay, broken ones toward the east bank. This
// adds the two things a still cannot: the one west-bank mantle that gutters (seeded per visit, never centred, never
// explained), and a little broken light wandering on the east water. The west half is left exactly as printed.

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const VW = 1600, VH = 700, QUAY = 236;

export function mountCrossing(sec, cfg) {
  const far = sec.querySelector('.cx-far'); if (!far) return null;
  const cv = document.createElement('canvas'); cv.className = 'shade'; cv.setAttribute('aria-hidden', 'true');
  const ctx = cv.getContext('2d'); if (!ctx) return null;
  far.appendChild(cv);
  const rnd = cfg.rnd || Math.random;
  const S = { w: 0, h: 0, dpr: 1, k: 1, ox: 0, oy: 0, vis: false, raf: 0, flick: 0, painted: false };
  const tab = Array.from({ length: 64 }, () => rnd());
  const noise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return tab[i & 63] * (1 - u) + tab[(i + 1) & 63] * u; };
  const ff = (rnd() < 0.5 ? 0.14 : 0.64) + rnd() * 0.22;
  const water = [];
  for (let i = 0; i < 220; i++) { const e = 0.35 + 0.65 * Math.pow(rnd(), 0.8); water.push({ x: rnd() * VW, y: QUAY + 20 + e * (VH - QUAY - 230), e, len: (6 + rnd() * 20) * (0.3 + e), a: 0.04 + 0.12 * e * rnd(), f: 0.25 + rnd() * 0.6, p: rnd() * 6.28, q: rnd() * 6.28 }); }

  const measure = () => {
    S.w = far.clientWidth; S.h = far.clientHeight; S.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(S.w * S.dpr); cv.height = Math.round(S.h * S.dpr);
    S.k = Math.max(S.w / VW, S.h / VH); S.ox = (S.w - VW * S.k) / 2; S.oy = (S.h - VH * S.k) / 2;
    const x0 = -S.ox / S.k, x1 = x0 + S.w / S.k;
    S.flick = clamp(Math.round((x0 + (x1 - x0) * ff - 20) / 40), 0, 39);
  };
  measure();
  const onResize = () => measure();
  window.addEventListener('resize', onResize);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { S.vis = es[0].isIntersecting; }, { rootMargin: '60px' }) : null;
  if (io) io.observe(sec); else S.vis = true;

  const t0 = performance.now();
  const frame = now => {
    S.raf = requestAnimationFrame(frame);
    if (document.hidden || !S.vis || !S.w) return;
    const t = (now - t0) / 1000, { k, ox, oy, dpr } = S;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, S.w, S.h);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);     // draw in the 1600 x 700 survey
    ctx.lineCap = 'round';
    for (const s of water) {                                          // the east water wanders; the west is left as printed
      const amp = 6 * sstep(0.3, 0.75, s.e), dx = amp * (Math.sin(t * s.f + s.p) + 0.5 * Math.sin(t * s.f * 2.3 + s.q));
      ctx.strokeStyle = 'rgba(185,194,204,' + (s.a * (0.5 + 0.5 * Math.sin(t * s.f * 1.7 + s.q))).toFixed(3) + ')'; ctx.lineWidth = 0.7 + 0.7 * s.e;
      ctx.beginPath(); ctx.moveTo(s.x + dx, s.y); ctx.lineTo(s.x + dx + s.len, s.y); ctx.stroke();
    }
    // the one irregular light: slow, guttering, never quite out. A veil of night over its flame and over the line it lays on the water.
    let b = 0.5 + 0.42 * noise(t * 1.9); if (noise(t * 0.43 + 17) > 0.6) b *= 0.22 + 0.5 * noise(t * 8.3 + 5);
    const x = 20 + 40 * S.flick, y = QUAY - 18;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 20); g.addColorStop(0, 'rgba(13,19,27,1)'); g.addColorStop(0.5, 'rgba(13,19,27,.8)'); g.addColorStop(1, 'rgba(13,19,27,0)');
    ctx.globalAlpha = (1 - b) * 0.92; ctx.fillStyle = g; ctx.fillRect(x - 20, y - 20, 40, 40);
    const lg = ctx.createLinearGradient(x - 8, 0, x + 8, 0); lg.addColorStop(0, 'rgba(13,19,27,0)'); lg.addColorStop(0.5, 'rgba(13,19,27,1)'); lg.addColorStop(1, 'rgba(13,19,27,0)');
    ctx.fillStyle = lg; ctx.fillRect(x - 8, QUAY + 4, 16, 330);
    ctx.globalAlpha = 1;
    if (!S.painted) { S.painted = true; sec.classList.add('live'); }
  };
  S.raf = requestAnimationFrame(frame);
  return { get flick() { return S.flick; }, destroy() { cancelAnimationFrame(S.raf); if (io) io.disconnect(); window.removeEventListener('resize', onResize); cv.remove(); } };
}
