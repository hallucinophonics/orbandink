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

function lean(book) {
  const host = book.closest('a, [data-stage]') || book;
  host.addEventListener('pointermove', ev => {
    const r = book.getBoundingClientRect();
    const nx = Math.max(-0.6, Math.min(0.6, (ev.clientX - r.left) / r.width - 0.5));
    const ny = Math.max(-0.6, Math.min(0.6, (ev.clientY - r.top) / r.height - 0.5));
    book.style.setProperty('--ty', (nx * 9).toFixed(2) + 'deg');
    book.style.setProperty('--tx', (ny * -7).toFixed(2) + 'deg');
  }, { passive: true });
  host.addEventListener('pointerleave', () => {
    book.style.removeProperty('--ty');
    book.style.removeProperty('--tx');
  });
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

export function init() {
  const books = [...document.querySelectorAll('[data-book3d]')];
  if (fine && !reduced) books.forEach(lean);
  /* no scroll-driven opening: on a phone the cover stays the cover (in
     Safari a self-opening book showed its blank leaf instead); a book opens
     only on hover, keyboard focus or its Open button */
  books.forEach(b => b.classList.remove('is-peek'));
  document.querySelectorAll('[data-open-book]').forEach(openButton);
}
