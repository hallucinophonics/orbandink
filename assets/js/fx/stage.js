/* stage.js — weight and light.
   Small behaviours that make the page feel made of things: the header that
   leaves on the way down and returns on the way up, buttons that lean
   toward the hand, light that follows the pointer across covers, shelves
   and panels, the wall of covers turning in depth, and the passage into a
   world (its picture opening over the whole screen before the page turns).
   All of it is decoration over working links. */

const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function header() {
  const head = document.querySelector('[data-head]');
  if (!head) return;
  let last = scrollY, queued = false;
  const run = () => {
    queued = false;
    const y = scrollY;
    head.classList.toggle('is-stuck', y > 24);
    const busy = head.contains(document.activeElement) || head.querySelector('details[open]');
    if (y > last + 4 && y > 160 && !busy) head.classList.add('is-away');
    else if (y < last - 4 || y < 160) head.classList.remove('is-away');
    last = y;
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(run); } }, { passive: true });
  head.addEventListener('focusin', () => head.classList.remove('is-away'));
  run();
}

function magnetic() {
  if (!fine || reduced) return;
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('pointermove', ev => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty('--bx', ((ev.clientX - (r.left + r.width / 2)) * 0.2).toFixed(1) + 'px');
      btn.style.setProperty('--by', ((ev.clientY - (r.top + r.height / 2)) * 0.32).toFixed(1) + 'px');
    }, { passive: true });
    btn.addEventListener('pointerleave', () => { btn.style.removeProperty('--bx'); btn.style.removeProperty('--by'); });
  });
}

function lights() {
  if (!fine) return;
  document.querySelectorAll('.now, .ros, .way-tile').forEach(el => {
    el.addEventListener('pointermove', ev => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--lx', (((ev.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
      el.style.setProperty('--ly', (((ev.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
    }, { passive: true });
  });
  document.querySelectorAll('.shelf').forEach(el => {
    el.addEventListener('pointermove', ev => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (ev.clientX - r.left + 40).toFixed(0) + 'px');
      el.style.setProperty('--my', (ev.clientY - r.top + 40).toFixed(0) + 'px');
      el.style.setProperty('--lamp', '1');
    }, { passive: true });
    el.addEventListener('pointerleave', () => el.style.setProperty('--lamp', '0'));
  });
}

/* the wall of covers: the lamp follows the pointer and the whole plane
   leans a little toward it; with no pointer the lamp crosses the wall as
   the page scrolls */
function wall() {
  const stage = document.querySelector('[data-wall]');
  if (!stage) return;
  const plane = stage.querySelector('.wall-plane');
  let hover = false, queued = false;
  /* the covers drift into view from far along their rows, so lazy loading
     would show blanks: fetch the whole wall once it is two screens away */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting)) return;
      io.disconnect();
      stage.querySelectorAll('img[loading="lazy"]').forEach(im => { im.loading = 'eager'; });
    }, { rootMargin: '200% 0px' });
    io.observe(stage);
  }
  const onScroll = () => {
    queued = false;
    const r = stage.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const p = clamp((innerHeight - r.top) / (innerHeight + r.height), 0, 1);
    if (!reduced) plane.style.setProperty('--wx', ((0.5 - p) * 12).toFixed(2) + 'deg');
    if (!hover) {
      stage.style.setProperty('--mx', (50 + Math.sin(p * Math.PI * 1.6) * 24).toFixed(1) + '%');
      stage.style.setProperty('--my', (22 + p * 46).toFixed(1) + '%');
    }
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
  if (!fine) return;
  stage.addEventListener('pointermove', ev => {
    const r = stage.getBoundingClientRect();
    hover = true;
    const nx = (ev.clientX - r.left) / r.width, ny = (ev.clientY - r.top) / r.height;
    stage.style.setProperty('--mx', (nx * 100).toFixed(1) + '%');
    stage.style.setProperty('--my', (ny * 100).toFixed(1) + '%');
    if (!reduced) plane.style.setProperty('--wy', ((nx - 0.5) * 7).toFixed(2) + 'deg');
  }, { passive: true });
  stage.addEventListener('pointerleave', () => { hover = false; plane.style.removeProperty('--wy'); onScroll(); });
}

/** The passage into a world. Called by the page-transition handler for a
    link marked data-enter: the world's own picture (or its colour) opens
    from the point of the click over the whole screen; resolves when it has. */
export function enter(link, ev) {
  return new Promise(resolve => {
    const host = link.closest('.pw, .world, .wi, li') || link;
    const img = host.querySelector('.pw-pic img, .world-pic img, .wi-lens img');
    const accent = getComputedStyle(host).getPropertyValue('--accent-book').trim() || '#D6AE5E';
    const veil = document.createElement('div');
    veil.className = 'enter-veil';
    veil.setAttribute('aria-hidden', 'true');
    if (img && (img.currentSrc || img.src)) veil.style.backgroundImage = `url("${img.currentSrc || img.src}")`;
    else veil.style.backgroundImage = `radial-gradient(70% 80% at 76% 30%, ${accent}, #0A0908 72%)`;
    const r = link.getBoundingClientRect();
    const x = ev && ev.clientX ? ev.clientX : r.left + r.width / 2;
    const y = ev && ev.clientY ? ev.clientY : r.top + r.height / 2;
    veil.style.setProperty('--ex', x + 'px');
    veil.style.setProperty('--ey', y + 'px');
    document.body.appendChild(veil);
    veil.getBoundingClientRect();
    requestAnimationFrame(() => veil.classList.add('go'));
    setTimeout(resolve, 700);
  });
}
export function clearEnter() {
  document.querySelectorAll('.enter-veil').forEach(v => v.remove());
}

/* /series/: one lens, twelve worlds. The row under the pointer (or the
   keyboard) is shown in the glass; on a touch screen there is no lens, the
   rows carry their own small ones. */
function lensdex() {
  const box = document.querySelector('[data-lensdex]');
  if (!box) return;
  const rows = [...box.querySelectorAll('.ld-row')], pics = [...box.querySelectorAll('.ld-pic')];
  let cur = -1;
  const show = i => {
    if (i === cur) return;
    cur = i;
    rows.forEach((r, k) => r.classList.toggle('on', k === i));
    pics.forEach((p, k) => p.classList.toggle('on', k === i));
  };
  rows.forEach((r, i) => {
    r.addEventListener('pointerenter', () => show(i));
    r.addEventListener('focusin', () => show(i));
  });
  show(0);
}

export function init() {
  lensdex();
  header();
  magnetic();
  lights();
  wall();
}
