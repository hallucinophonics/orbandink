/* worlds.js — every series has its own light.
   Hovering a world washes the page in that series' colour and fans its
   covers out beside the cursor; a series' own page keeps its colour on.
   One fixed layer (.aura) does the wash, so it works with or without the
   WebGL field underneath. Nothing here carries content: the rows are
   plain links and read the same with this file missing. */

export function init() {
  const aura = document.createElement('div');
  aura.className = 'aura';
  aura.setAttribute('aria-hidden', 'true');
  document.body.prepend(aura);
  const light = hex => { aura.style.setProperty('--aura', hex); aura.classList.add('on'); };

  const page = document.querySelector('[data-tint-page]');
  const home = page ? page.dataset.tintPage : null;
  if (home) light(home);
  const rest = () => { home ? light(home) : aura.classList.remove('on'); };

  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // the display turns a few degrees toward whoever is looking at it
  if (fine && !reduced) document.querySelectorAll('[data-xdr]').forEach(xdr => {
    xdr.addEventListener('pointermove', ev => {
      const r = xdr.getBoundingClientRect();
      const nx = Math.max(-0.5, Math.min(0.5, (ev.clientX - r.left) / r.width - 0.5));
      const ny = Math.max(-0.5, Math.min(0.5, (ev.clientY - r.top) / r.height - 0.5));
      xdr.style.setProperty('--ty', (nx * 9).toFixed(2) + 'deg');
      xdr.style.setProperty('--tx', (ny * -5).toFixed(2) + 'deg');
    }, { passive: true });
    xdr.addEventListener('pointerleave', () => {
      xdr.style.removeProperty('--ty');
      xdr.style.removeProperty('--tx');
    });
  });
  document.querySelectorAll('[data-tint]').forEach(row => {
    row.addEventListener('pointerenter', () => light(row.dataset.tint));
    row.addEventListener('pointerleave', rest);
    row.addEventListener('focusin', () => light(row.dataset.tint));
    row.addEventListener('focusout', rest);
  });
}
