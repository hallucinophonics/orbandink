/* book3d.js — the books behave like books.
   The opening itself is CSS (hover, focus, .is-open, .is-peek): this file
   only adds what CSS cannot.
     · fine pointers: the book leans toward the cursor while it is held open
     · touch screens: no hover exists, so a book peeks open as it crosses
       the middle of the screen and closes again as it leaves
     · the book page: a button that opens and closes the volume, for
       keyboards and for touch
   Reduced motion keeps the opening (it is information, not decoration)
   but drops the lean and the scroll-driven peek. */

const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The lean (--ty/--tx) goes straight into the book's transform with no CSS
   transition; the pose animates through its own registered properties (see
   main.css). Retargeting a transform transition on every pointer move made
   Safari's book shudder; here the tilt eases toward the pointer in
   time-based steps and goes quiet once it arrives. */
function lean(book) {
  const host = book.closest('a, [data-stage]') || book;
  let gx = 0, gy = 0, x = 0, y = 0, raf = 0, last = 0;
  const step = now => {
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
    last = now;
    const k = 1 - Math.pow(0.006, dt);          // ≈ 0.2 s to settle, any frame rate
    x += (gx - x) * k; y += (gy - y) * k;
    book.style.setProperty('--ty', y.toFixed(3) + 'deg');
    book.style.setProperty('--tx', x.toFixed(3) + 'deg');
    if (Math.abs(gx - x) + Math.abs(gy - y) > 0.02) raf = requestAnimationFrame(step);
    else {
      raf = 0;
      if (!gx && !gy) { book.style.removeProperty('--ty'); book.style.removeProperty('--tx'); }
    }
  };
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } };
  host.addEventListener('pointermove', ev => {
    const r = book.getBoundingClientRect();
    const nx = Math.max(-0.6, Math.min(0.6, (ev.clientX - r.left) / r.width - 0.5));
    const ny = Math.max(-0.6, Math.min(0.6, (ev.clientY - r.top) / r.height - 0.5));
    gy = nx * 6; gx = ny * -4.5;
    kick();
  }, { passive: true });
  host.addEventListener('pointerleave', () => { gx = gy = 0; kick(); });
}

/* The case: a printed hardcover's art wraps round the board edges, the
   spine and the turn-ins inside the cover. Those faces take the very image
   the cover already loaded (same URL, no extra request, still lazy). */
function paintCase(book) {
  const img = book.querySelector('.b3-front img');
  const faces = book.querySelectorAll('[data-art]');
  if (!img || !faces.length) return;
  const paint = () => {
    const src = img.currentSrc || img.src;
    if (!src) return;
    const v = `url("${src.replace(/"/g, '%22')}")`;
    faces.forEach(f => { f.style.backgroundImage = v; });
    book.classList.add('has-case');
    endpaper(book, img);
  };
  if (img.complete && img.naturalWidth) paint();
  else img.addEventListener('load', paint, { once: true });
}

function peekOnScroll(books) {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => e.target.classList.toggle('is-peek', e.isIntersecting));
  }, { rootMargin: '-36% 0px -36% 0px', threshold: 0 });
  books.forEach(b => io.observe(b));
}

function openButton(btn) {
  const col = btn.closest('.cover-col') || document;
  const book = col.querySelector('[data-book3d]');
  if (!book) return;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const open = book.classList.toggle('is-open');
    book.classList.remove('is-peek');
    btn.setAttribute('aria-pressed', String(open));
    btn.textContent = open ? btn.dataset.close : btn.dataset.open;
  });
}

/* The endpaper is chosen as a designer would: a deep tone already in the
   jacket. Averages the darker part of the cover and settles it into an
   inked depth, so a blue jacket opens onto navy, a sand one onto umber. */
function endpaper(book, img) {
  try {
    const c = document.createElement('canvas');
    c.width = 12; c.height = 18;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 12, 18);
    const d = x.getImageData(0, 0, 12, 18).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4)
      px.push([d[i], d[i + 1], d[i + 2], 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]]);
    px.sort((a, b) => a[3] - b[3]);
    const dark = px.slice(0, Math.ceil(px.length * 0.4));
    const m = [0, 1, 2].map(k => dark.reduce((s, p) => s + p[k], 0) / dark.length);
    const L = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2] || 1;
    const to = Math.min(66, Math.max(36, L));
    // settle to that depth, then give back a little of the colour the dark ate
    const rgb = m.map(v => Math.round(Math.max(0, Math.min(255, to + (v * to / L - to) * 1.45))));
    book.style.setProperty('--ep', `rgb(${rgb.join(' ')})`);
  } catch { /* the accent-tinted sheet stays */ }
}

export function init() {
  const books = [...document.querySelectorAll('[data-book3d]')];
  books.forEach(paintCase);
  if (fine && !reduced) books.forEach(lean);
  /* no scroll-driven opening: on a phone the cover stays the cover (in
     Safari a self-opening book showed its blank leaf instead); a book opens
     only on hover, keyboard focus or its Open button */
  books.forEach(b => b.classList.remove('is-peek'));
  document.querySelectorAll('[data-open-book]').forEach(openButton);
}
