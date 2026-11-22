// creed.js — shared behaviours for The Barycentric Creed site.
// One law: everything moves like ground — slow, one-directional, permanent.
// Every behaviour here enhances markup that already reads on its own: with this file
// missing, or under prefers-reduced-motion, the folio is a complete, settled, printed page.

/* ── RETAIL ───────────────────────────────────────────────────────────────────────────
   The one edit that turns "See the book at Orb & Ink" into live buttons.
   Paste a store URL (https://…) into any slot. While a slot is empty that edition shows
   a quiet "Coming" chip. As soon as a slot holds a URL:
     · that edition's tile, in the book page's editions block, becomes a solid button
       ("Get the e-book", "Buy the paperback", "Listen to the audiobook" …);
     · every primary button for that book — landing hero, its panel, the closing shelf, the
       header pill, the phone bar, the book page — reads "Buy the book" (or "Listen to the
       audiobook" when only audio is live) and carries the live mark. With one live edition
       it goes straight to the store; with several it goes to the editions block, where the
       reader picks a format.
   Nothing else needs touching. Add "offers" to the page's JSON-LD when an edition goes live.
   ───────────────────────────────────────────────────────────────────────────────────── */
export const RETAIL = {
  'the-weight-of-malice': { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '' },
  'the-event-horizon':    { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '' },
  'the-unforgivable':     { ebook: '', paperback: '', hardcover: '', audiobook: '', immersive: '', drama: '' },
};

export const BOOKS = {
  'the-weight-of-malice': { n: 'One', title: 'The Weight of Malice', ink: 'i' },
  'the-event-horizon':    { n: 'Two', title: 'The Event Horizon', ink: 'ii' },
  'the-unforgivable':     { n: 'Three', title: 'The Unforgivable', ink: 'iii' },
};
const ORDER = ['ebook', 'paperback', 'hardcover', 'audiobook', 'immersive', 'drama'];
const EDITION = {
  ebook:     { verb: 'Get the e-book', name: 'E-book', read: true },
  paperback: { verb: 'Buy the paperback', name: 'Paperback', read: true },
  hardcover: { verb: 'Buy the hardcover', name: 'Hardcover', read: true },
  audiobook: { verb: 'Listen to the audiobook', name: 'Audiobook' },
  immersive: { verb: 'Listen to the immersive audiobook', name: 'Immersive audiobook' },
  drama:     { verb: 'Listen to the audio drama', name: 'Audio drama' },
};

export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const q = (s, r) => (r || document).querySelector(s);
const qa = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const debounce = (fn, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
const liveOf = (slug) => { const r = RETAIL[slug] || {}; return ORDER.filter((k) => typeof r[k] === 'string' && /^https?:\/\//i.test(r[k].trim())); };

export function boot(cfg){
  cfg = cfg || {};
  const S = { cfg, cleanups: [], destroyed: false, sky: null, plates: [] };
  S.destroy = () => { S.destroyed = true; S.cleanups.forEach((f) => { try { f(); } catch (e) {} }); S.cleanups = []; };
  run(cfg, S);
  return S;
}

async function run(cfg, S){
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || cfg.motion === 'static';
  S.reduced = reduced;
  applyRetail(document);
  initBuyBar(S, cfg);
  initSettles(S, reduced);
  initSeams(S, reduced);
  qa('[data-loom]').forEach((el) => initLoom(S, el, reduced));
  // the living plates
  if (q('[data-plate]')){
    import('./plates.js').then((m) => { if (!S.destroyed){ S.plates = m.mountPlates(document, { reduced }); S.cleanups.push(() => S.plates.forEach((p) => p.destroy())); } })
      .catch((e) => console.warn('plates static:', e));
  }
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
  if (S.destroyed) return;
  initWeights(S, reduced);
  // the hero sky: landing only, full motion only. The static sky in the markup stays otherwise.
  if (cfg.page === 'landing' && !reduced && q('[data-hero]')){
    try {
      const m = await import('./occultation.js');
      if (!S.destroyed){
        S.sky = await m.initOccultation({ stage: q('[data-hero]'), staticSky: q('[data-static-sky]'), lens: cfg.lens || 1 });
        if (S.sky) S.cleanups.push(() => S.sky.destroy());
      }
    } catch (e) { console.warn('sky static:', e); }
  }
  initRail(S, cfg, reduced); // after the sky, so the rail can report stars lost
}

/* ── retail: one map in, every button out ─────────────────────────────────────────── */
export function applyRetail(root){
  qa('[data-edition]', root).forEach((li) => {
    const parts = (li.getAttribute('data-edition') || '').split(':'), slug = parts[0], key = parts[1];
    const url = ((RETAIL[slug] || {})[key] || '').trim(), ed = EDITION[key];
    const slot = q('.ed-do', li);
    if (!ed || !slot || !/^https?:\/\//i.test(url)) return;
    li.classList.add('is-live');
    slot.innerHTML = '';
    const a = document.createElement('a');
    a.className = 'btn btn--sm is-live'; a.href = url; a.rel = 'noopener';
    a.innerHTML = '<b></b>'; a.firstChild.textContent = ed.verb;
    slot.appendChild(a);
  });
  qa('[data-buy]', root).forEach(setBuy);
}
function setBuy(a){
  const slug = a.getAttribute('data-buy'), live = liveOf(slug);
  const b = q('b', a), sm = q('small', a);
  if (!b) return;
  if (!a.hasAttribute('data-coming')) a.setAttribute('data-coming', b.textContent);
  if (sm && !a.hasAttribute('data-coming-s')) a.setAttribute('data-coming-s', sm.textContent);
  if (!a.hasAttribute('data-catalogue')) a.setAttribute('data-catalogue', 'https://orbandink.co.uk/en/books/' + slug + '/');
  if (!live.length){
    a.classList.remove('is-live');
    a.href = a.getAttribute('data-catalogue');
    b.textContent = a.getAttribute('data-coming');
    if (sm) sm.textContent = a.getAttribute('data-coming-s');
    return;
  }
  const read = live.some((k) => EDITION[k].read);
  a.classList.add('is-live');
  a.rel = 'noopener';
  a.href = live.length === 1 ? RETAIL[slug][live[0]].trim() : (a.getAttribute('data-editions') || RETAIL[slug][live[0]].trim());
  b.textContent = read ? (a.getAttribute('data-live') || 'Buy the book') : EDITION[live[0]].verb;
  if (sm) sm.textContent = live.map((k) => EDITION[k].name).join(' · ') + ' — on sale';
}

/* ── B. Everything on this page weighs: variable-font load ────────────────────────── */
function initWeights(S, reduced){
  const hs = qa('[data-w]');
  if (!hs.length) return;
  const compute = () => {
    const dh = Math.max(document.documentElement.scrollHeight, innerHeight + 1);
    hs.forEach((h) => {
      const y = h.getBoundingClientRect().top + scrollY;
      h._load = clamp(y / dh, 0, 1);
      h._tw = Math.round(390 + 230 * h._load);
    });
  };
  // ink weight and letterpress bite are the same fact told twice
  const apply = (h, w2, load) => {
    h.style.fontVariationSettings = '"wght" ' + w2;
    h.style.setProperty('--load', (load == null ? h._load : load).toFixed(3));
  };
  compute();
  if (reduced) { hs.forEach((h) => apply(h, h._tw)); return; }
  hs.forEach((h) => {
    const r = h.getBoundingClientRect();
    if (r.top >= innerHeight * 0.85){
      apply(h, Math.max(330, h._tw - 100), h._load * 0.3);
      h.style.transition = 'font-variation-settings 1400ms ' + EASE + ', text-shadow 1400ms ' + EASE;
      h._pre = true;
    } else apply(h, h._tw);
  });
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting){ const el = e.target; io.unobserve(el); if (el._pre) apply(el, el._tw); }
  }), { threshold: 0.35 });
  hs.forEach((h) => io.observe(h));
  const onR = debounce(compute, 220);
  addEventListener('resize', onR);
  S.cleanups.push(() => { io.disconnect(); removeEventListener('resize', onR); });
}

/* ── things settle once, and stay settled ─────────────────────────────────────────── */
function initSettles(S, reduced){
  const els = qa('.settle, .cover.pre');
  if (!els.length) return;
  if (reduced){ els.forEach((el) => { el.classList.add('in'); el.classList.remove('pre'); }); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target); e.target.classList.add('in'); e.target.classList.remove('pre');
  }), { threshold: 0.3 });
  els.forEach((el) => io.observe(el));
  S.cleanups.push(() => io.disconnect());
}

/* ── the seams between leaves bow under what is above them ────────────────────────── */
function initSeams(S, reduced){
  const seams = qa('svg.seam');
  if (!seams.length) return;
  const draw = (svg, s) => {
    const c = (2 * s + 1).toFixed(1);
    qa('path', svg).forEach((p) => {
      if (p.classList.contains('seam-fill')) p.setAttribute('d', 'M0 0H1000V1Q500 ' + c + ' 0 1Z');
      else if (p.classList.contains('seam-2')) p.setAttribute('d', 'M0 5Q500 ' + (2 * s * 0.82 + 5).toFixed(1) + ' 1000 5');
      else p.setAttribute('d', 'M0 1Q500 ' + c + ' 1000 1');
    });
    const o = svg.parentNode && q('[data-seam-orn]', svg.parentNode);
    if (o) o.style.transform = 'translate(-50%,' + (s - 4).toFixed(1) + 'px) rotate(45deg)';
  };
  seams.forEach((svg) => { svg._sag = parseFloat(svg.getAttribute('data-sag')) || 14; });
  if (reduced){ seams.forEach((svg) => draw(svg, svg._sag)); return; }
  seams.forEach((svg) => { if (svg.getBoundingClientRect().top > innerHeight * 0.9){ svg._pre = true; draw(svg, 0); } });
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const svg = e.target; io.unobserve(svg);
    if (!svg._pre) return;
    const t0 = performance.now(), D = 2600;
    const step = (now) => {
      const f = clamp((now - t0) / D, 0, 1), k = 1 - Math.pow(1 - f, 4);
      draw(svg, svg._sag * k);
      if (f < 1 && !S.destroyed) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), { rootMargin: '0px 0px -12% 0px' });
  seams.forEach((svg) => io.observe(svg));
  S.cleanups.push(() => io.disconnect());
}

/* ── C. The fathom rail: a plumb line surveys the page ────────────────────────────── */
function initRail(S, cfg, reduced){
  const stations = qa('[data-station]');
  const rail = q('[data-rail]'), bar = q('[data-progress]'), hread = q('[data-head-read]'), head = q('.head');
  if (!stations.length) return;
  const st = { cur: -1, pos: [], dh: 1, rh: 1 };
  const bob = rail && q('[data-rail-bob]', rail), num = rail && q('[data-rail-num]', rail), sky = rail && q('[data-rail-sky]', rail);
  const ticks = rail && q('[data-rail-ticks]', rail);
  const measure = () => {
    st.dh = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
    st.rh = rail ? rail.clientHeight : 1;
    st.pos = stations.map((s) => ({ el: s, y: s.getBoundingClientRect().top + scrollY, heavy: s.hasAttribute('data-heavy'), read: s.getAttribute('data-reading') || '', book: s.getAttribute('data-book') || '' }));
    if (ticks){
      ticks.innerHTML = '';
      st.pos.forEach((p, i) => {
        if (!p.el.id) return;
        const a = document.createElement('a');
        a.href = '#' + p.el.id; a.title = p.read; a.setAttribute('aria-label', p.el.getAttribute('data-name') || p.read || p.el.id);
        a.style.top = (clamp((p.y - innerHeight * 0.3) / st.dh, 0, 1) * (st.rh - 150) + 22).toFixed(1) + 'px';
        a._i = i; ticks.appendChild(a);
      });
    }
  };
  measure();
  let ticking = false;
  const update = () => {
    ticking = false;
    const p = clamp(scrollY / st.dh, 0, 1);
    if (bar) bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    const ref = scrollY + innerHeight * 0.42;
    let cur = 0;
    st.pos.forEach((s, i) => { if (ref >= s.y) cur = i; });
    if (cur !== st.cur){
      st.cur = cur;
      const s = st.pos[cur];
      if (hread) hread.textContent = s.read;
      if (ticks) qa('a', ticks).forEach((a) => a.classList.toggle('is-cur', a._i === cur));
      if (sky){ const n = S.sky && S.sky.getStarsLost ? S.sky.getStarsLost() : 0; sky.textContent = n > 0 ? 'stars lost: ' + n : ''; }
      if (S.setBarBook) S.setBarBook(s.book || cfg.book || 'the-weight-of-malice');
    }
    if (head) head.classList.toggle('is-deep', scrollY > innerHeight * 0.6);
    if (rail){
      const y = p * (st.rh - 150) + 6;
      rail.style.setProperty('--y', y.toFixed(1) + 'px');
      rail.style.setProperty('--f', (y / Math.max(st.rh, 1)).toFixed(4));
      if (num) num.textContent = (scrollY / 100).toFixed(1);
      if (bob && !reduced){
        let inf = 0;
        st.pos.forEach((s) => { if (!s.heavy) return; const d = (s.y - innerHeight * 0.42) - scrollY; inf = Math.max(inf, Math.exp(-(d * d) / (2 * Math.pow(innerHeight * 0.55, 2)))); });
        const g = q('svg', bob); if (g) g.style.transform = 'rotate(' + (0.7 * inf).toFixed(3) + 'deg)';
      }
    }
  };
  const onScroll = () => { if (!ticking){ ticking = true; requestAnimationFrame(update); } };
  const onR = debounce(() => { measure(); st.cur = -1; update(); }, 250);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onR);
  const late = setTimeout(() => { measure(); st.cur = -1; update(); }, 1800); // images and plates have taken their height
  S.cleanups.push(() => { removeEventListener('scroll', onScroll); removeEventListener('resize', onR); clearTimeout(late); });
  update();
}

/* ── E. The loom line: a Session rendered entirely in typography ──────────────────── */
function initLoom(S, root, reduced){
  const A = root.getAttribute('data-a') || '', B = root.getAttribute('data-b') || '';
  const dir = root.getAttribute('data-dir') || 'dissolve'; // dissolve: 1.00→0.00 · weave: 0.00→1.00
  const stack = q('.loom-static', root), stage = q('.loom-stage', root);
  const numEl = q('[data-loom-n]', root), sufEl = q('[data-loom-s]', root);
  const sealed = qa('[data-loom-sealed]', root), weft = q('.weft path', root);
  if (reduced || !stage || !stack) return; // the stacked, struck-through state in the markup is complete
  const mkLine = (text, vis) => {
    const p = document.createElement('p');
    p.className = 'loom-line'; p.style.gridArea = '1 / 1';
    if (!vis) p.setAttribute('aria-hidden', 'true');
    text.split(' ').forEach((word, wi, arr) => {
      const ws = document.createElement('span');
      ws.style.cssText = 'display:inline-block;white-space:nowrap;';
      Array.prototype.forEach.call(word, (ch) => { const s = document.createElement('span'); s.textContent = ch; s.style.opacity = vis ? '1' : '0'; ws.appendChild(s); });
      p.appendChild(ws);
      if (wi < arr.length - 1) p.appendChild(document.createTextNode(' '));
    });
    stage.appendChild(p);
    return p;
  };
  stack.style.display = 'none';
  stage.style.display = 'grid'; stage.style.justifyItems = 'center'; stage.style.alignItems = 'center';
  const la = mkLine(A, true), lb = mkLine(B, false);
  const fmt = (v) => v.toFixed(2) + (v > 0.005 ? ' grave' : '');
  if (numEl) numEl.textContent = fmt(dir === 'dissolve' ? 1 : 0);
  if (sufEl) sufEl.textContent = dir === 'dissolve' ? ' — live' : ' — at rest';
  sealed.forEach((el) => { el.style.opacity = '0'; });
  if (weft){ weft.style.strokeDasharray = '1'; weft.style.strokeDashoffset = '1'; weft.setAttribute('pathLength', '1'); }
  let ran = false, raf = 0;
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting || ran) return;
    ran = true; io.disconnect();
    const D = 6000, F = 1150, span = D * 0.62;
    const ca = qa('span span', la), cb = qa('span span', lb);
    ca.forEach((s, i) => { s.style.transition = 'opacity ' + F + 'ms ' + EASE + ' ' + Math.round((i / Math.max(ca.length - 1, 1)) * span) + 'ms'; s.style.opacity = '0'; });
    cb.forEach((s, i) => { s.style.transition = 'opacity ' + F + 'ms ' + EASE + ' ' + Math.round(700 + (i / Math.max(cb.length - 1, 1)) * span) + 'ms'; s.style.opacity = '1'; });
    if (weft){ weft.style.transition = 'stroke-dashoffset ' + D + 'ms linear'; weft.style.strokeDashoffset = '0'; }
    la.setAttribute('aria-hidden', 'true'); lb.removeAttribute('aria-hidden');
    const t0 = performance.now();
    const step = (now) => {
      const f = clamp((now - t0) / D, 0, 1), v = dir === 'dissolve' ? 1 - f : f;
      if (numEl) numEl.textContent = fmt(v);
      if (f < 1) raf = requestAnimationFrame(step);
      else if (sufEl) sufEl.textContent = dir === 'dissolve' ? ' — dissolved' : ' — live';
    };
    raf = requestAnimationFrame(step);
    const t1 = setTimeout(() => sealed.forEach((el) => { el.style.transition = 'opacity 1400ms ease'; el.style.opacity = ''; }), D + 1600);
    S.cleanups.push(() => clearTimeout(t1));
  }), { threshold: 0.5 });
  io.observe(root);
  S.cleanups.push(() => { io.disconnect(); if (raf) cancelAnimationFrame(raf); });
}

/* ── the persistent buy control: the current book, and a plain verb ───────────────── */
function initBuyBar(S, cfg){
  const bars = qa('[data-bar]');
  const hero = q('[data-buy-sentinel]'), end = q('[data-buy-end]');
  if (!bars.length || !hero) return;
  let book = '';
  S.setBarBook = (slug) => {
    if (slug === book || !BOOKS[slug]) return;
    book = slug;
    const B = BOOKS[slug];
    bars.forEach((bar) => {
      const a = bar.matches('[data-buy]') ? bar : q('[data-buy]', bar);
      qa('[data-bar-n]', bar).forEach((n) => { n.textContent = 'Book ' + B.n; });
      qa('[data-bar-title]', bar).forEach((n) => { n.textContent = B.title; });
      const th = q('[data-bar-thumb]', bar); if (th) th.src = 'assets/cover-' + slug + '-760.jpg';
      if (a){
        const short = a.hasAttribute('data-short');
        a.setAttribute('data-buy', slug);
        a.setAttribute('data-catalogue', 'https://orbandink.co.uk/en/books/' + slug + '/');
        a.setAttribute('data-coming', short ? 'See the book' : (cfg.page === 'book' ? 'See the book at Orb & Ink' : 'See Book ' + B.n + ' at Orb & Ink'));
        a.setAttribute('data-live', cfg.page === 'book' || short ? 'Buy the book' : 'Buy Book ' + B.n);
        a.setAttribute('data-editions', cfg.page === 'book' ? '#editions' : slug + '.html#editions');
        a.setAttribute('aria-label', (liveOf(slug).length ? 'Buy ' : 'See ') + B.title + (liveOf(slug).length ? '' : ' at Orb & Ink'));
        a.className = a.className.replace(/\bbtn--i+\b/g, '').trim() + ' btn--' + B.ink;
        setBuy(a);
      }
    });
  };
  S.setBarBook(cfg.book || 'the-weight-of-malice');
  let heroOut = false, endIn = false;
  const apply = () => bars.forEach((bar) => bar.classList.toggle('is-on', heroOut && !endIn));
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.target === hero) heroOut = !e.isIntersecting && e.boundingClientRect.top < 0;
    else endIn = e.isIntersecting;
    apply();
  }), { rootMargin: '-56px 0px 0px 0px' });
  io.observe(hero); if (end) io.observe(end);
  S.cleanups.push(() => io.disconnect());
}
