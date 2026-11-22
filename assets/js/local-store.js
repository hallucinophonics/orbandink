/* local-store.js — a buy button opens the reader's own Amazon store.

   The pages are built with amazon.com links: they work for everyone, and for
   a reader without JavaScript. Here every plain https://www.amazon.com/dp/<ID>
   link is pointed at the store of the country the reader is in: amazon.co.uk
   in Britain, amazon.de in Germany, and so on. It stays a direct Amazon link,
   so a phone still opens it in the Amazon app.

   No request is made and nothing is stored. The country is read from the
   device's own time zone.

   STORES lists only stores where every edition on sale was opened and checked
   by hand (2026-11-22: Linewalker and The Aperitif, e-book, paperback and
   hardcover, same ID on all of them). Check a new edition on each store
   before it goes on sale here. Anywhere else, the amazon.com link is left as
   it is. To keep one link on amazon.com for everybody, give it a query string
   (…/dp/<ID>?th=1): only plain /dp/<ID> links are touched.

   The series sites carry the same table and rule (calorate-site/thermo.js,
   universal-menu-site/menu.js). Change all three together. */

// store → the time zones of the countries that shop there.
// A name ending in "/" stands for every zone that starts with it.
const STORES = {
  'co.uk': 'Europe/London Europe/Belfast Europe/Jersey Europe/Guernsey Europe/Isle_of_Man Europe/Dublin GB Eire',
  'de': 'Europe/Berlin Europe/Busingen Europe/Vienna Europe/Zurich Europe/Vaduz',
  'fr': 'Europe/Paris Europe/Monaco',
  'it': 'Europe/Rome Europe/San_Marino Europe/Vatican',
  'es': 'Europe/Madrid Africa/Ceuta Atlantic/Canary',
  'nl': 'Europe/Amsterdam',
  'co.jp': 'Asia/Tokyo Japan',
  'com.au': 'Australia/ Pacific/Auckland Pacific/Chatham NZ',
  'ca': 'Canada/ America/Toronto America/Montreal America/Vancouver America/Edmonton America/Winnipeg '
    + 'America/Regina America/Halifax America/Moncton America/St_Johns America/Whitehorse '
    + 'America/Yellowknife America/Iqaluit',
};

let here; // undefined: not worked out yet · '': stay on amazon.com

/** The Amazon store for where the reader is ('co.uk', 'de' …), or '' for amazon.com. */
export function storeHere() {
  if (here !== undefined) return here;
  here = '';
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    for (const store of Object.keys(STORES)) {
      if (STORES[store].split(' ').some(z => (z.endsWith('/') ? zone.startsWith(z) : zone === z))) {
        here = store;
        break;
      }
    }
  } catch { /* an old browser: amazon.com */ }
  return here;
}

const PLAIN = /^https:\/\/www\.amazon\.com\/dp\/([A-Z0-9]{10})\/?$/;

/** A plain amazon.com product link, moved to the reader's store; any other link, unchanged. */
export function localAmazon(url) {
  const m = PLAIN.exec(url || '');
  const store = m && storeHere();
  return store ? `https://www.amazon.${store}/dp/${m[1]}` : url;
}

/** Point every plain amazon.com link under `root` at the reader's store. */
export function wireLocalStores(root = document) {
  if (!storeHere()) return;
  root.querySelectorAll('a[href^="https://www.amazon.com/dp/"]').forEach(a => {
    a.setAttribute('href', localAmazon(a.getAttribute('href')));
  });
}
