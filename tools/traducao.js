// Translations of the sentences written for the site (the say() texts), keyed by the English sentence
// with dynamic parts masked. Used by say() in build-site.js when a language has no text of its own.
//
// Masking: every HTML tag that carries attributes is replaced, together with its content, by {0}, {1}...
// (links, icons, chips, <b class="v ...">); every number too. Tags without attributes (<em>, <p>) stay.
// Look up tools/traducoes/<lang>.json[maskedEnglish]; the value uses the same placeholders in any order.
// Missing keys are counted and written to build/faltando-<lang>.json when the build process exits.
const fs = require('fs');
const path = require('path');

const LANGS = ['es', 'fr', 'de', 'ru', 'ja', 'zh-Hans', 'th'];
const DIR = path.join(__dirname, 'traducoes');
const OUT = path.join(__dirname, '..', 'build');
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr']);

const tables = new Map();   // lang -> { key: translation }
const missing = new Map();  // lang -> Map(key -> count)
const masked = new Map();   // english -> { key, vals } | null

function load(lang) {
  if (tables.has(lang)) return tables.get(lang);
  const table = Object.create(null);
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${lang}.json`), 'utf8'));
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== 'string' || !v) continue;
      if (placeholders(k) !== placeholders(v)) { console.warn(`traducoes/${lang}.json: placeholders differ, ignored: ${k.slice(0, 80)}`); continue; }
      table[k] = v;
    }
  } catch (err) { if (err.code !== 'ENOENT') console.warn(`traducoes/${lang}.json: ${err.message}`); }
  tables.set(lang, table);
  return table;
}
const placeholders = s => (s.match(/\{\d+\}/g) || []).sort().join('');

// End of the element opened at `from` (an opening tag ending at `openEnd`), counting same-name nesting.
function closeOf(html, name, openEnd) {
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
  re.lastIndex = openEnd;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return re.lastIndex;
  }
  return -1;
}

function mask(en) {
  const vals = [];
  const ph = text => { vals.push(text); return `{${vals.length - 1}}`; };
  let out = '', i = 0;
  const num = /(?<![\p{L}\d])\d+(?:[.,]\d+)*/gu;
  const plain = s => s.replace(num, ph);
  while (i < en.length) {
    const lt = en.indexOf('<', i);
    if (lt < 0) { out += plain(en.slice(i)); break; }
    out += plain(en.slice(i, lt));
    const tag = /^<(\/?)([a-zA-Z][\w-]*)([^>]*)>/.exec(en.slice(lt, lt + 600));
    if (!tag) { out += '<'; i = lt + 1; continue; }
    const [whole, closing, name, attrs] = tag;
    const hasAttrs = attrs.replace(/\/$/, '').trim() !== '';
    if (closing || !hasAttrs) { out += whole; i = lt + whole.length; continue; }
    const openEnd = lt + whole.length;
    let end = openEnd;
    if (!VOID.has(name.toLowerCase()) && !whole.endsWith('/>')) {
      const c = closeOf(en, name, openEnd);
      if (c > 0) end = c;
    }
    out += ph(en.slice(lt, end));
    i = end;
  }
  return /[A-Za-z]{2}/.test(out.replace(/\{\d+\}/g, '')) ? { key: out, vals } : null;
}

function traduzir(lang, en) {
  if (!LANGS.includes(lang) || typeof en !== 'string') return null;
  let m = masked.get(en);
  if (m === undefined) { m = mask(en); masked.set(en, m); }
  if (!m) return null;
  const hit = load(lang)[m.key];
  if (hit !== undefined) return hit.replace(/\{(\d+)\}/g, (all, n) => (m.vals[n] !== undefined ? m.vals[n] : all));
  let counts = missing.get(lang);
  if (!counts) missing.set(lang, counts = new Map());
  counts.set(m.key, (counts.get(m.key) || 0) + 1);
  return null;
}

process.on('exit', () => {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    for (const lang of LANGS) {
      const counts = missing.get(lang) || new Map();
      const sorted = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      fs.writeFileSync(path.join(OUT, `faltando-${lang}.json`), JSON.stringify(Object.fromEntries(sorted), null, 1));
    }
  } catch { /* the report is optional */ }
});

module.exports = { traduzir, mask, LANGS };
