/* data.js — runtime CSV layer.
   Fetches data/*.csv relative to <base>, parses RFC-4180 CSV,
   exposes language-aware accessors. No UI strings live in JS. */

const cache = new Map();

/** Full CSV parser: quoted fields, escaped quotes, newlines in quotes, CRLF. */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0];
  return rows.slice(1).map(r => {
    const o = {};
    head.forEach((h, i) => { o[h.trim()] = (r[i] ?? '').trim(); });
    return o;
  });
}

/** Site root, derived from the build-stamped data-rel prefix on <html>.
    Works at the domain root and under any preview/subpath mount. */
const SITE_ROOT = new URL(document.documentElement.getAttribute('data-rel') || '.', location.href);

/** Load one CSV from data/. */
export async function rows(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch(new URL(`data/${name}.csv`, SITE_ROOT)).then(r => {
      if (!r.ok) throw new Error(`data/${name}.csv → ${r.status}`);
      return r.text();
    }).then(parseCSV));
  }
  return cache.get(name);
}

/** Active language: stamped on <html lang> by build.py; falls back to
    scanning the URL path for a known code. */
export function getLang() {
  const stamped = document.documentElement.getAttribute('lang');
  if (stamped) return stamped;
  const segs = location.pathname.split('/').filter(Boolean);
  const known = (document.documentElement.dataset.langs || 'en').split(',');
  return segs.find(s => known.includes(s)) || 'en';
}

export async function languages() { return rows('languages'); }

let _dict = null;
export async function i18nReady() {
  if (!_dict) {
    _dict = new Map();
    (await rows('i18n')).forEach(r => _dict.set(r.key, r));
  }
  return _dict;
}

/** t('key', {n: 2}) → localized string with {var} substitution, en fallback. */
export function t(key, vars = {}, lang = getLang()) {
  const r = _dict && _dict.get(key);
  let s = r ? (r[lang] || r.en || key) : key;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}

/** Books with language-neutral facts + localized fields (en fallback per row). */
export async function books(lang = getLang()) {
  const [base, loc] = await Promise.all([rows('books'), rows('books_i18n')]);
  return base.map(b => {
    const mine = loc.find(r => r.book_id === b.id && r.lang === lang);
    const en = loc.find(r => r.book_id === b.id && r.lang === 'en');
    const L = mine || en || {};
    return {
      ...b,
      series_order: b.series_order ? Number(b.series_order) : null,
      themes: b.themes ? b.themes.split(';').map(s => s.trim()).filter(Boolean) : [],
      title: L.title || b.id,
      tagline: L.tagline || '',
      synopsis: L.synopsis || '',
      excerpt_url: L.excerpt_url || '',
      localized: !!mine,
    };
  });
}

/** Store links: exact language rows, else the en rows. CSV order preserved. */
export async function storeLinks(bookId, lang = getLang()) {
  const all = (await rows('store_links')).filter(r => r.book_id === bookId);
  const mine = all.filter(r => r.lang === lang);
  return mine.length ? mine : all.filter(r => r.lang === 'en');
}

export async function site() {
  if (!cache.has('_site')) {
    cache.set('_site', rows('site').then(rs => {
      const o = {}; rs.forEach(r => { o[r.key] = r.value; }); return o;
    }));
  }
  return cache.get('_site');
}

/** theme token → i18n key ("time travel" → "theme.time_travel") */
export const themeKey = tok => 'theme.' + tok.replace(/[\s-]+/g, '_');
