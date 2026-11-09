#!/usr/bin/env node
// Generates the static multi-language wiki from data/ into dist/.
// Usage: node tools/build-site.js [gameBuildId]
const fs = require('fs');
const path = require('path');
const { LANGS, ui, EXTRA_NAMES } = require('./i18n');
const { hubText, guideTitles } = require('./hub-text');
const SUG = require('./sugestoes-ui');
const EMP_STATIC = require('./explicacoes/empregos.js');
const LOC_STATIC = require('./explicacoes/locais.js');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
// Pages are written aside and swapped in at the end, so a failed build never leaves a half site.
const FINAL_DIST = path.join(ROOT, 'dist');
const DIST = path.join(ROOT, 'dist.next');
const SITE = 'https://wolwiki.kooda.dev';
const BUILD_FILE = path.join(ROOT, 'build', 'game-build.txt');
const BUILD = process.argv[2] || (fs.existsSync(BUILD_FILE) ? fs.readFileSync(BUILD_FILE, 'utf8').trim() : '');

// ---------------------------------------------------------------- Load
const RAW = {};
for (const f of fs.readdirSync(path.join(DATA, 'raw'))) {
  RAW[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(DATA, 'raw', f), 'utf8'));
}
const table = n => RAW[`DataTables.Airtable.Data.${n}`] || [];

const TEXT = {};
for (const l of LANGS) {
  const m = new Map();
  for (const e of Object.values(JSON.parse(fs.readFileSync(path.join(DATA, 'localization', l.code + '.json'), 'utf8')))) {
    if (e.key && e.text && e.text.trim()) m.set(e.key, e.text);
  }
  TEXT[l.code] = m;
}

// Corrections for mistakes in the game's own localization tables.
const OVERRIDES = { 'pt-BR': { action_buy_pet_turtle1_flavor: 'Dê quitutes ou perca os dedos.', quest_clean_environment_title: 'Limpe o Ambiente', action_buy_used_metro_pass_flavor: 'Concede acesso ao metrô por 1 a 5 rodadas, sorteado na compra.', action_cultist_cosmic_treasure_flavor: 'O "X" marca o ponto sem volta!', action_food_for_one_week_title: 'Comida para a semana', item_friendship_crate_title: 'Caixa da Amizade', item_friendship_crate_flavor: 'Dê um presentinho a um amigo no início do próximo turno.', location_garden_town: 'O Parque', ev_beam_me_up_ot1: 'Você volta a jogar videogame. Sol babaca.', 'ev_movies_-_immersive_tasting_ch1': 'Balde de Pipoca Permanente', 'ev_moo_moo_mart_-_retail_wisdom_body': 'A caixa do Mercado Mu-Mu não para de contar histórias sobre o Mercado Mu-Mu.', 'ev_teens_-_youth_of_the_nation_ot0': '"Que nem a sua cara."', 'ev_kern-el,_no!_body': 'Você tem uma casca de grão de pipoca presa na gengiva. Que horror!', "ev_mother_nature's_masterpiece_02_ot0": 'Você estava de saco cheio dela mesmo.', action_hack_moo_moo_mart_title: 'Hackear o Mercado Mu-Mu', quest_clean_environment_obj_1: 'Recolha lixo no Parque', quest_clean_environment_obj_2: 'Compre uma Vara de Pesca', quest_clean_environment_obj_3: 'Pesque uma Garrafa de Gosma', quest_clean_environment_obj_4: 'Venda a Garrafa de Gosma na Casa de Penhores' } };
for (const [code, entries] of Object.entries(OVERRIDES)) {
  for (const [key, text] of Object.entries(entries)) TEXT[code].set(key, text);
}

const byRef = new Map();
const byId = new Map();
for (const recs of Object.values(RAW)) {
  for (const r of recs) {
    byRef.set(r._id, r);
    if (typeof r.Id === 'string') byId.set(r.Id, r);
  }
}
const deref = v => (v && v.id ? byRef.get(v.id) : null);

// ---------------------------------------------------------------- Term resolution
// Assets sometimes cite a key the table spells differently (action_make_art_title vs makeart_title).
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const normalized = new Map();
for (const k of TEXT.en.keys()) if (!normalized.has(norm(k))) normalized.set(norm(k), k);
const PLACEHOLDER = /^(_|_title|_flavor|string_empty.*|empty_.*)?$/;
const PREFIX = /^(action|item|quest|attr|trait|job|education|report)_/;
const report = { aliased: {}, unresolved: {}, placeholders: 0 };

// Official text that lives under a different key than the asset cites.
const ALIASES = {
  action_wash_dirty_money_title: 'action_wash_dirty_money',
  attr_ticket: 'attr_metro_ticket',
  item_pet_food_basic_title: 'action_buy_basic_pet_food_title',
  item_pet_food_basic_flavor: 'action_buy_basic_pet_food_flavor',
  item_pet_food_ultra_title: 'action_buy_ultra_pet_food_title',
  item_pet_food_ultra_flavor: 'action_buy_ultra_pet_food_flavor',
  item_quest_fish_bait_title: 'item_fish_bait_title',
  item_quest_fish_bait_flavor: 'item_fish_bait_flavor',
};
const termCache = new Map();
function resolveTerm(term) {
  if (typeof term !== 'string' || PLACEHOLDER.test(term)) { report.placeholders++; return null; }
  if (termCache.has(term)) return termCache.get(term);
  let found = null;
  if (TEXT.en.has(term)) found = term;
  else if (ALIASES[term] && TEXT.en.has(ALIASES[term])) found = ALIASES[term];
  else {
    const suffixes = [term, term.replace(/_flavor$/, '_description'), term.replace(/_description$/, '_flavor'), term + '_title'];
    for (const s of suffixes) {
      for (const candidate of [s, s.replace(PREFIX, '')]) {
        if (normalized.has(norm(candidate))) { found = normalized.get(norm(candidate)); break; }
      }
      if (found) break;
    }
    if (found) report.aliased[term] = found; else report.unresolved[term] = true;
  }
  termCache.set(term, found);
  return found;
}

function rich(text) {
  const clean = text
    .replace(/<sprite[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(color|size|font|style|link|mark|u|s|sup|sub|align|voffset|nobr|cspace|line-height|indent|pos|margin|gradient|alpha|smallcaps|uppercase|lowercase)(=[^>]*)?>/gi, '')
    .trim();
  return esc(clean).replace(/&lt;(\/?)(i|b)&gt;/gi, '<$1$2>').replace(/\n/g, '<br>');
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// Returns { html, lang } in the requested language, falling back to English.
function tx(lang, term) {
  const key = resolveTerm(term);
  if (!key) return null;
  const own = TEXT[lang].get(key);
  if (own) return { html: rich(own), lang };
  return { html: rich(TEXT.en.get(key)), lang: 'en' };
}
const humanize = s => String(s).replace(/^(Quest Item|Artifact|Fish|Pet|Special Furniture|Special|Fishing - Special) - /, '').trim();

// Pet and pet-food items cite keys that are missing or shared between pets; their real
// name is on the shop action that hands them over.
function petTrait(rec) {
  if (rec.ItemSubGroup !== 3 && rec.ItemSubGroup !== 11) return null;
  const sources = [...(obtain.get(rec._id) || [])].filter(a => resolveTerm(a.TitleTerm));
  // Some actions reuse another pet's text, so the English title must match the asset name.
  const asset = rec.m_Name.toLowerCase();
  const matches = a => TEXT.en.get(resolveTerm(a.TitleTerm)).toLowerCase().split(/\s+/)
    .filter(w => w.length >= 3).every(w => asset.includes(w.slice(0, 4)));
  return sources.find(a => /^action_buy_pet/.test(a.TitleTerm) && matches(a)) || null;
}
const hasText = rec => !!(resolveTerm(rec.TitleTerm) || resolveTerm(rec.NameTerm) || resolveTerm(rec.Term) || resolveTerm(rec.Title));

function titleOf(lang, rec) {
  const fixedTitle = EMP_STATIC.titleFix(lang, rec) || LOC_STATIC.titleFix(lang, rec, EXTRA_NAMES, LANGS);
  if (fixedTitle) return fixedTitle;
  const pet = petTrait(rec);
  if (pet) return tx(lang, pet.TitleTerm);
  const t = tx(lang, rec.TitleTerm) || tx(lang, rec.NameTerm) || tx(lang, rec.Term) || tx(lang, rec.Title);
  if (t) {
    { const ren = itensTitle(lang, rec, t); if (ren) return ren; }
    // Both metro stations share one translated name; the asset carries the line number.
    const metro = /Metro-(\d+)$/.exec(rec.m_Name);
    return metro ? { ...t, html: `${t.html} ${metro[1]}` } : t;
  }
  const extra = EXTRA_NAMES[rec.m_Name];
  if (extra) {
    report.unofficial = report.unofficial || {};
    report.unofficial[rec.m_Name] = true;
    return { html: esc(extra[LANGS.findIndex(l => l.code === lang)]), lang };
  }
  if (rec.ItemSubGroup === 3) return { html: esc(rec.m_Name.replace(/^Pet /, '')), lang: 'en' };
  report.fallbackTitles = report.fallbackTitles || {};
  report.fallbackTitles[rec.m_Name] = true;
  return { html: esc(humanize(rec.m_Name)), lang: 'en' };
}
const spanLang = (lang, t) => (t.lang !== lang ? `<span lang="en">${t.html}</span>` : t.html);
const title = (lang, rec) => spanLang(lang, titleOf(lang, rec));
const titleText = (lang, rec) => plain(titleOf(lang, rec).html);
function flavor(lang, rec, term) {
  const fixedFlavor = EMP_STATIC.flavorFix(lang, rec, term);
  if (fixedFlavor) return `<p class="flavor">${fixedFlavor}</p>`;
  const pet = term === undefined ? petTrait(rec) : null;
  const t = (pet && tx(lang, pet.FlavorTerm)) || tx(lang, term !== undefined ? term : rec.FlavorTerm);
  return t ? `<p class="flavor">${spanLang(lang, t)}</p>` : '';
}

// ---------------------------------------------------------------- Selection and slugs
const slugify = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
function assignSlugs(recs) {
  const seen = new Set();
  for (const r of recs) {
    let s = slugify(r.m_Name) || 'x', n = 2;
    while (seen.has(s)) s = `${slugify(r.m_Name)}-${n++}`;
    seen.add(s);
    r._slug = s;
  }
  return recs;
}
const DEV_ONLY = /debug|\btest\b|deprecated|placeholder|^Construction Yard$|^Laundromat$|^Quest-GottaCatchEm \d+$/i;
const items = assignSlugs(table('ItemData').filter(r => !DEV_ONLY.test(r.m_Name)));
const jobs = assignSlugs(table('JobData').filter(r => !DEV_ONLY.test(r.m_Name) && r.Location));
// Locations without player-facing text are internal helpers, such as "Artist Job Location".
const locations = assignSlugs(table('LocationData').filter(r => !DEV_ONLY.test(r.m_Name) && hasText(r)));
const allQuests = RAW['Gameplay.Quests.Quest'] || [];
const allChains = RAW['Gameplay.Quests.QuestChain'] || [];
const inChain = new Set(allChains.flatMap(c => (c.Quests || []).map(q => q.id)));
const showable = q => !q.HideFromPlayer && hasText(q) && !DEV_ONLY.test(q.m_Name);
const quests = assignSlugs([...allChains.filter(showable), ...allQuests.filter(q => !inChain.has(q._id) && showable(q))]);
const HIDDEN_TAG = /^(blocked|only_bots_get_me)$/;
const events = assignSlugs((RAW['DataTables.Internal.ChoiceEvent'] || []).filter(e => hasText(e) && !DEV_ONLY.test(e.m_Name) && !(e.TagRequirements || []).some(t => HIDDEN_TAG.test(t.Name))));
const roles = Object.entries(RAW).filter(([k]) => /^Gameplay\.Roles\.(?!Core)/.test(k)).flatMap(([, r]) => r).filter(r => r.SystemStateType === 30);
for (const r of roles) r.m_Name = r.Name.charAt(0).toUpperCase() + r.Name.slice(1);
assignSlugs(roles);
const pets = items.filter(i => i.ItemSubGroup === 3);
for (const r of items) r._kind = 'items';
for (const r of jobs) r._kind = 'jobs';
for (const r of locations) r._kind = 'locations';
for (const r of quests) r._kind = 'quests';
for (const r of events) r._kind = 'events';
for (const r of roles) r._kind = 'roles';

const ICONS = fs.existsSync(path.join(DATA, 'icons.json')) ? JSON.parse(fs.readFileSync(path.join(DATA, 'icons.json'), 'utf8')) : {};
const usedIcons = new Set();
function icon(ref, size = 28, extra = '') {
  const hit = ref && ref.id ? ICONS[ref.id] : null;
  if (!hit || /^fallback/.test(hit.file)) return '';
  usedIcons.add(hit.file);
  const h = Math.round(size * hit.h / hit.w);
  return `<img class="ic${extra}" src="/icons/${hit.file}" width="${size}" height="${h}" alt="" loading="lazy">`;
}
function bigImage(ref) {
  const hit = ref && ref.id ? ICONS[ref.id] : null;
  if (!hit || /^fallback/.test(hit.file)) return '';
  usedIcons.add(hit.file);
  return `<img class="lead" src="/icons/${hit.file}" width="${hit.w}" height="${hit.h}" alt="" loading="lazy">`;
}
const iconSlot = (ref, size) => icon(ref, size) || `<span class="ic ic-none" style="width:${size}px;height:${size}px" aria-hidden="true"></span>`;

// ---------------------------------------------------------------- Art for every entry
// "real" is the entry's own art, "related" comes from something linked to it, "reserve" is a stand-in by type.
const SPRITE_KEYS = new Map();
for (const s of JSON.parse(fs.readFileSync(path.join(DATA, 'gfx-index.json'), 'utf8'))) {
  if (s.kind === 'spr' && ICONS[s.k] && !SPRITE_KEYS.has(s.name)) SPRITE_KEYS.set(s.name, s.k);
}
const spriteRef = name => (SPRITE_KEYS.has(name) ? { id: SPRITE_KEYS.get(name) } : null);
const SHORTCUT_ART = { guides: 'Icon-Item-Edu-Starting-Book-Big', items: 'Icon-Bag-Gems', jobs: 'Icon-Job-Tier-3', locations: 'Icon-Location-Bank', quests: 'Icon-Quest-Medium', events: 'Event-Bank', roles: 'Icon-Role-Adventurer', pets: 'Icon-Trait-Cat', modifiers: 'Icon-Quest-Hard' };
const sectionArt = (key, size) => icon(spriteRef(SHORTCUT_ART[key]), size);
const hubCard = (href, art, name, text, extra = '') => `<a class="hub-card" href="${href}"><span class="hub-art">${art}</span><span class="hub-text"><strong>${name}</strong>${extra}${text ? `<small>${text}</small>` : ''}</span>${GO_ARROW}</a>`;
const hubHead = (lang, key, count, guide) => `<header class="hub-head"><div><h1>${ui(lang, key)} <span class="tag">${count}</span></h1><p>${hubText(lang, `intro_${key}`)}</p>${guide ? `<a class="btn btn-main" href="/${langDir(lang)}/guides/${guide}/">${hubText(lang, 'howBtn')}</a>` : ''}</div>${icon(spriteRef(SHORTCUT_ART[key]), 96, ' hub-section-art')}</header>`;
const flavorText = (lang, term) => { const t = tx(lang, term); return t ? spanLang(lang, t) : ''; };
const isReal = ref => !!(ref && ref.id && ICONS[ref.id] && !/^fallback/.test(ICONS[ref.id].file));
const ITEM_SPRITES = { 'Bed Cardboard': 'Furniture_Bed_CardboardBox', 'Relax Chair Plastic': 'Furniture_Relax_Chair_Plastic' };
const imageAudit = {};
function noteArt(kind, rec, tier, ref) {
  const k = imageAudit[kind] = imageAudit[kind] || { real: 0, related: 0, reserve: 0, none: 0, relatedNames: [], reserveNames: [], noneNames: [], seen: new Set() };
  const tally = ref ? tier : 'none';
  if (!k.seen.has(rec._id)) {
    k.seen.add(rec._id);
    k[tally]++;
    if (tally !== 'real') k[`${tally}Names`].push(rec.m_Name);
  }
  return ref;
}
function artRef(kind, rec) {
  const real = ref => noteArt(kind, rec, 'real', ref);
  const related = ref => noteArt(kind, rec, 'related', ref);
  const reserve = name => noteArt(kind, rec, 'reserve', spriteRef(name));
  if (kind === 'item') {
    if (isReal(rec.Sprite)) return real(rec.Sprite);
    if (ITEM_SPRITES[rec.m_Name]) return real(spriteRef(ITEM_SPRITES[rec.m_Name]));
    const junk = /^Junk (\d+)/.exec(rec.m_Name);
    if (junk) return reserve(`Icon-Item-Scrap-${(Number(junk[1]) % 3) + 1}`);
    return reserve(/Hamilton/.test(rec.m_Name) ? 'Icon-Attribute-Cash' : 'Icon-Quest-Easy');
  }
  if (kind === 'action') {
    if (isReal(rec.Sprite)) return real(rec.Sprite);
    const tier = /Quest (Easy|Medium|Hard)/.exec(rec.m_Name);
    if (tier) return related(spriteRef(`Icon-Quest-${tier[1]}`));
    if (/^Artist - /.test(rec.m_Name)) return related(spriteRef('Icon-Job-Artist'));
    for (const e of [...collectEntries([rec.Rewards, rec.WeightedRewards]), ...(rec.RequiredItems || [])]) {
      const item = e.Type === ITEM ? byId.get(e.Id) : null;
      if (item && isReal(item.Sprite)) return related(item.Sprite);
    }
    const home = (actionHome.get(rec._id) || [])[0];
    return home ? related(home.Icon) : reserve('Icon-Quest-Easy');
  }
  if (kind === 'job') {
    if (artistJobs.has(rec._id)) return related(spriteRef('Icon-Job-Artist'));
    return related(spriteRef(`Icon-Job-Tier-${Math.min(8, Math.max(1, rec.JobLevel))}`));
  }
  if (kind === 'room') {
    if (isReal(rec.Icon)) return real(rec.Icon);
    const home = (chamberLocations.get(rec._id) || [])[0];
    return home ? related(home.Icon) : reserve('Icon-Location-Bank');
  }
  if (kind === 'quest') {
    for (const s of stepsOf(rec)) {
      for (const o of Object.values(s.references || {})) {
        const action = o.ActionData ? deref(o.ActionData) : null;
        if (action && isReal(action.Sprite)) return related(action.Sprite);
      }
    }
    return reserve(`Icon-Quest-${rec.Tier >= 3 ? 'Hard' : rec.Tier === 2 ? 'Medium' : 'Easy'}`);
  }
  const own = kind === 'event' ? rec.Image : kind === 'role' ? rec.RoleImageIcon : rec.Icon;
  return isReal(own) ? real(own) : reserve('Icon-Quest-Easy');
}
const artIcon = (kind, rec, size) => { const ref = artRef(kind, rec); return ref ? icon(ref, size) : iconSlot(null, size); };
const itemIcon = (it, size) => artIcon('item', it, size);
const GO_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const goLink = (lang, rec) => (rec && rec._slug ? `<a class="go" href="/${langDir(lang)}/${rec._kind}/${rec._slug}/" aria-hidden="true" tabindex="-1">${GO_ARROW}</a>` : '');
const goCell = (lang, rec) => `<td class="go">${goLink(lang, rec)}</td>`;
const GO_TH = '<th class="go" aria-hidden="true"></th>';

const mapOf = loc => (/^Chailand/.test(loc.m_Name) ? 'Chailand' : /^Schnitzel/.test(loc.m_Name) ? 'Schnitzelland' : '');
const link = (lang, rec, inner) => (rec._slug ? `<a href="/${langDir(lang)}/${rec._kind}/${rec._slug}/">${inner}</a>` : inner);
const langDir = code => LANGS.find(l => l.code === code).dir;

// ---------------------------------------------------------------- Cross references
const ATTRIBUTE = 10, ITEM = 50;
const actionHome = new Map(); // action id -> [location]
for (const loc of locations) {
  for (const ch of (loc.Chambers || []).map(deref).filter(Boolean)) {
    for (const a of (ch.Actions || []).map(deref).filter(Boolean)) {
      if (!actionHome.has(a._id)) actionHome.set(a._id, []);
      const list = actionHome.get(a._id);
      if (!list.includes(loc)) list.push(loc);
    }
  }
}

// Trait effects add further actions to chambers once a quest, role or perk applies.
const chamberExtras = new Map(); // chamber id -> Set(action)
const chamberLocations = new Map();
for (const loc of locations) {
  for (const ch of (loc.Chambers || []).map(deref).filter(Boolean)) {
    if (!chamberLocations.has(ch._id)) chamberLocations.set(ch._id, []);
    chamberLocations.get(ch._id).push(loc);
  }
}
for (const [cls, recs] of Object.entries(RAW)) {
  if (!/TraitEffect/.test(cls)) continue;
  for (const r of recs) {
    if (!Array.isArray(r.Chambers) || !Array.isArray(r.ChamberActions)) continue;
    const actions = r.ChamberActions.map(deref).filter(Boolean);
    for (const ch of r.Chambers.map(deref).filter(Boolean)) {
      if (!chamberExtras.has(ch._id)) chamberExtras.set(ch._id, new Set());
      for (const a of actions) {
        chamberExtras.get(ch._id).add(a);
        if (!actionHome.has(a._id)) actionHome.set(a._id, []);
        const list = actionHome.get(a._id);
        for (const loc of chamberLocations.get(ch._id) || []) if (!list.includes(loc)) list.push(loc);
      }
    }
  }
}

function collectEntries(v, out = []) {
  if (Array.isArray(v)) v.forEach(x => collectEntries(x, out));
  else if (v && typeof v === 'object') {
    if (Array.isArray(v.RewardEntries)) out.push(...v.RewardEntries);
    else Object.values(v).forEach(x => collectEntries(x, out));
  }
  return out;
}
const obtain = new Map(), consume = new Map();
const addTo = (m, k, a) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(a); };
for (const a of table('ChamberActionData')) {
  for (const e of collectEntries([a.Rewards, a.WeightedRewards])) {
    if (e.Type !== ITEM) continue;
    const item = byId.get(e.Id);
    if (item) addTo(e.Value > 0 ? obtain : consume, item._id, a);
  }
  for (const e of a.RequiredItems || []) {
    const item = byId.get(e.Id);
    if (item) addTo(consume, item._id, a);
  }
}

// Items also come from quest and event rewards.
const otherSources = new Map();
{
  const chainOf = new Map();
  for (const c of allChains) for (const q of c.Quests || []) chainOf.set(q.id, c);
  const addSource = (holder, rewards) => {
    if (!holder || !holder._slug) return;
    for (const e of collectEntries(rewards)) {
      const item = e.Type === ITEM && e.Value > 0 ? byId.get(e.Id) : null;
      if (item) addTo(otherSources, item._id, holder);
    }
  };
  for (const q of allQuests) addSource(q._slug ? q : chainOf.get(q._id), [q.Rewards, q.QuestStartedRewards]);
  for (const e of events) addSource(e, (e.Choices || []).map(c => c.Rewards));
}

// ---------------------------------------------------------------- Rendering helpers
const FORMATTERS = {};
const number = (lang, v) => {
  FORMATTERS[lang] = FORMATTERS[lang] || new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  return FORMATTERS[lang].format(v);
};
function formatValue(lang, v) {
  const n = number(lang, Math.abs(v));
  return v > 0 ? `+${n}` : v < 0 ? `−${n}` : n;
}
function effectLabel(lang, e) {
  const target = byId.get(e.Id);
  if (!target) return `<span lang="en">${esc(e.Id)}</span>`;
  const label = title(lang, target);
  if (e.Type === ATTRIBUTE && /^Pet /.test(target.m_Name)) return `${ui(lang, 'pet')}: ${label}`;
  return target._slug ? link(lang, target, label) : label;
}
const GLYPH = {
  Time: 'time', Cash: 'cash', Happy: 'happy', Health: 'health', Hygiene: 'hygiene', Fullness: 'food', Stress: 'stress',
  Experience: 'xp', Score: 'score', Prestige: 'prestige', Safety: 'shield', Security: 'shield',
  'Pet Happiness': 'happy', 'Pet Health': 'health', 'Pet Hygiene': 'hygiene', 'Pvp Currency': 'ticket', 'Ticket Currency': 'ticket',
};
// Traits and quest links without player-facing text are internal plumbing, not effects.
const visibleEntries = entries => (entries || []).filter(e => {
  const t = byId.get(e.Id);
  return t && (e.Type === ATTRIBUTE || e.Type === ITEM || hasText(t));
});
// Raising Stress is a loss even though its value is positive.
const isCost = e => {
  const t = byId.get(e.Id);
  return t && t.m_Name === 'Stress' ? e.Value > 0 : e.Value < 0;
};
function chip(lang, e) {
  const t = byId.get(e.Id);
  const name = e.Type === ATTRIBUTE ? GLYPH[t.m_Name] : null;
  const art = name
    ? `<span class="glyph"><svg aria-hidden="true"><use href="/assets/attrs.svg#${name}"></use></svg></span>`
    : (e.Type === ITEM ? itemIcon(t, 20) : '');
  const value = e.Value ? `<b class="v ${isCost(e) ? 'm' : 'p'}">${formatValue(lang, e.Value)}</b> ` : '';
  return `<span class="chip">${art}<span class="chip-text">${value}${effectLabel(lang, e)}</span></span>`;
}
function effects(lang, entries) {
  const visible = visibleEntries(entries);
  return visible.length ? `<ul class="fx">${visible.map(e => `<li>${chip(lang, e)}</li>`).join('')}</ul>` : '';
}
// One glass card with a row per action or job; "Costs" and "Gives" columns only appear when used.
function ledger(lang, label, rows) {
  const list = items => (items.length ? `<ul class="fx">${items.map(e => `<li>${chip(lang, e)}</li>`).join('')}</ul>` : '');
  const parts = rows.map(r => {
    const visible = visibleEntries(r.entries);
    return { ...r, costs: visible.filter(isCost), gains: visible.filter(e => !isCost(e)) };
  });
  const showCost = parts.some(p => p.costs.length);
  const showGain = parts.some(p => p.gains.length || p.extra);
  // A null label drops the name column, for a table about a single subject.
  const bare = label === null;
  const cols = (bare ? 0 : 1) + Number(showCost) + Number(showGain);
  const hasGo = parts.some(p => p.go);
  const costs = esc(ui(lang, 'costs')), gives = esc(ui(lang, 'gives'));
  const head = `<div class="ledger-head">${bare ? '' : `<span>${esc(label)}</span>`}${showCost ? `<span>${costs}</span>` : ''}${showGain ? `<span>${gives}</span>` : ''}${hasGo ? '<span></span>' : ''}</div>`;
  const body = parts.map(p => {
    const cost = showCost ? `<div class="ledger-cell ledger-cost" data-label="${costs}">${list(p.costs)}</div>` : '';
    const gainHtml = list(p.gains) + (p.extra || '');
    const gain = showGain ? `<div class="ledger-cell" data-label="${gives}">${gainHtml}</div>` : '';
    return `<div class="ledger-row">${bare ? '' : `<div class="ledger-main">${p.head}</div>`}${cost}${gain}${hasGo ? `<div class="ledger-go">${p.go || ''}</div>` : ''}</div>`;
  }).join('');
  return `<div class="ledger cols-${cols}${bare ? ' bare' : ''}${hasGo ? ' has-go' : ''}">${head}${body}</div>`;
}
const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
function actionOutcomes(lang, action) {
  if (/^Get (Easy|Medium|Hard) Vexcorp Quest$/.test(action.m_Name)) return LOC.vexOdds(lang, action, CHEVRON);
  const groups = (action.WeightedRewards || []).map(w => collectEntries(w)).filter(g => g.length);
  if (!groups.length) return '';
  const outcome = g => { const pts = g.filter(e => e.Type === 95); return effects(lang, g) || (pts.length ? `<ul class="fx">${pts.map(e => `<li><span class="chip"><span class="chip-text"><b class="v p">${formatValue(lang, e.Value)}</b> ${esc(ui(lang, 'score'))}</span></span></li>`).join('')}</ul>` : ''); };
  const shown = groups.map(outcome).filter(Boolean);
  if (!shown.length) return '';
  return `<div class="odds"><button class="odds-head" type="button" data-toggle aria-expanded="false">${CHEVRON}${ui(lang, 'random')} (${shown.length})</button><div class="collapse"><div class="collapse-clip">${shown.join('')}</div></div></div>`;
}
const fact = (label, value) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
const facts = list => `<dl class="facts">${list.join('')}</dl>`;
const sumAttr = (rewards, name) => {
  const e = ((rewards && rewards.RewardEntries) || []).find(x => { const t = byId.get(x.Id); return t && t.m_Name === name; });
  return e ? e.Value : 0;
};
function actionLedger(lang, actions, originOf) {
  return ledger(lang, ui(lang, 'action'), actions.map(a => {
    const origin = originOf ? originOf(a) : '';
    const needs = visibleEntries(a.RequiredItems);
    const req = needs.length ? `<p class="req"><span>${ui(lang, 'requires')}:</span>${needs.map(e => chip(lang, e)).join('')}</p>` : '';
    return { head: `<div class="withicon">${artIcon('action', a, 24)}<div><strong>${title(lang, a)}</strong>${flavor(lang, a)}${req}${origin ? `<p class="req"><span>${esc(say(lang, 'locations', 'label unlocked by', { 'pt-BR': 'Liberada por', en: 'Unlocked by' }))}:</span>${origin}</p>` : ''}</div></div>`, entries: (a.Rewards || {}).RewardEntries, extra: actionOutcomes(lang, a) };
  }));
}
const articleLayout = (head, side, body) => `<div class="article"><header class="art-head">${head}</header><aside class="art-side">${side}</aside><div class="art-body">${body}</div></div>`;
const ficha = list => `<div class="ficha"><dl>${list.join('')}</dl></div>`;
const toc = (lang, links) => (links.length > 1 ? `<nav class="toc" aria-label="${esc(ui(lang, 'onThisPage'))}"><p>${ui(lang, 'onThisPage')}</p>${links.map(l => `<a href="#${l.id}">${l.label}</a>`).join('')}</nav>` : '');
function actionPlaces(lang, actionSet) {
  const li = [...actionSet].filter(hasText).map(a => {
    const places = (actionHome.get(a._id) || []).map(l => link(lang, l, title(lang, l))).join(', ');
    return `<li>${title(lang, a)}${places ? ` <span class="muted">· ${places}</span>` : ''}</li>`;
  });
  return `<ul class="plain">${li.join('')}</ul>`;
}

const traitCard = (lang, t) => `<div class="box perk">${icon(t.Icon, 40)}<div><strong>${title(lang, t)}</strong>${flavor(lang, t)}${traitDetails(lang, t)}</div></div>`;
function perks(lang, entries) {
  const traits = (entries || []).filter(e => e.Type === 110).map(e => byId.get(e.Id)).filter(t => t && hasText(t));
  return traits.length ? `<div class="stack">${traits.map(t => traitCard(lang, t)).join('')}</div>` : '';
}

// ---------------------------------------------------------------- Site tree
const treeCache = {};
function siteTree(lang) {
  if (treeCache[lang]) return treeCache[lang];
  const d = langDir(lang);
  const leaf = (href, label, n) => `<a href="${href}"><span>${label}</span>${n === undefined ? '' : `<small>${n}</small>`}</a>`;
  const group = (key, label, n, kids) => `<div class="tree-group" data-group="${key}"><button type="button" class="tree-head" data-toggle aria-expanded="false"><span class="tree-name">${CHEVRON}${sectionArt(key, 22)}${ui(lang, label)}</span><small>${n}</small></button><div class="collapse"><div class="collapse-clip"><div class="tree-kids">${kids}</div></div></div></div>`;
  const byName = (a, b) => titleText(lang, a).localeCompare(titleText(lang, b), lang);
  const catCount = {};
  for (const i of items) if (i.ItemSubGroup >= 1 && i.ItemSubGroup <= 13) catCount[i.ItemSubGroup] = (catCount[i.ItemSubGroup] || 0) + 1;
  const cats = Object.keys(catCount).sort((a, b) => ui(lang, `cat${a}`).localeCompare(ui(lang, `cat${b}`), lang));
  const itemKids = leaf(`/${d}/items/`, ui(lang, 'viewAll')) + cats.map(c => leaf(`/${d}/items/?cat=${c}`, ui(lang, `cat${c}`), catCount[c])).join('');
  const jobPlaces = locations.map(l => ({ l, n: jobs.filter(j => { const x = deref(j.Location); return x && x._id === l._id; }).length })).filter(x => x.n).sort((a, b) => byName(a.l, b.l));
  const jobKids = leaf(`/${d}/jobs/`, ui(lang, 'viewAll')) + jobPlaces.map(x => leaf(`/${d}/locations/${x.l._slug}/#jobs`, titleText(lang, x.l), x.n)).join('');
  const mapKids = ['', 'Chailand', 'Schnitzelland'].map(m => {
    const list = locations.filter(l => mapOf(l) === m).sort(byName);
    return (m ? `<p class="tree-sub">${m}</p>` : '') + list.map(l => leaf(`/${d}/locations/${l._slug}/`, titleText(lang, l))).join('');
  }).join('');
  // Sections without children are plain links; the empty slot keeps names aligned with the chevrons.
  const simple = (key, n) => `<a class="tree-top" href="/${d}/${key}/" data-section="${key}"><span class="tree-name"><span class="chev-slot"></span>${sectionArt(key, 22)}${ui(lang, key)}</span><small>${n}</small></a>`;
  const guideKids = leaf(`/${d}/guides/`, ui(lang, 'viewAll')) + GUIDES.map(g => leaf(`/${d}/guides/${g.slug}/`, plain(g.title[lang] || g.title.en))).join('');
  treeCache[lang] = group('guides', 'guides', GUIDES.length, guideKids) + group('items', 'items', items.length, itemKids) + group('jobs', 'jobs', jobs.length, jobKids)
    + group('locations', 'locations', locations.length, leaf(`/${d}/locations/`, ui(lang, 'viewAll')) + mapKids)
    + simple('quests', quests.length) + simple('events', events.length) + simple('roles', roles.length) + simple('pets', pets.length) + simple('modifiers', MOD.modifiers.length);
  return treeCache[lang];
}

// ---------------------------------------------------------------- Page shell
const CREDITS = require('./creditos.js')({ esc, langDir });
let pageCount = 0;
function writePage(rel, html) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}
function page(lang, sub, { title: pageTitle, body, description, section }) {
  const dir = langDir(lang);
  const alternates = LANGS.map(l => `<link rel="alternate" hreflang="${l.code}" href="${SITE}/${l.dir}/${sub}">`).join('');
  const here = `/${dir}/${sub}`;
  // Flat sections stay marked on their detail pages too; grouped ones open and mark the exact leaf.
  const marked = siteTree(lang).replace(`data-section="${section}"`, 'aria-current="page"');
  const treeHtml = (marked.includes('tree-top" href') && marked !== siteTree(lang) ? marked : marked.replace(`href="${here}"`, `href="${here}" aria-current="page"`))
    .replace(`data-group="${section}"><button type="button" class="tree-head" data-toggle aria-expanded="false"`, `data-group="${section}"><button type="button" class="tree-head" data-toggle aria-expanded="true"`);
  const langLinks = LANGS.map(l => `<a role="menuitem" lang="${l.code}" href="/${l.dir}/${sub}"${l.code === lang ? ' aria-current="true"' : ''}>${l.name}</a>`).join('');
  const dockIcon = id => `<svg aria-hidden="true"><use href="/assets/attrs.svg#s-${id}"></use></svg>`;
  const dock = ['items', 'jobs', 'locations'].map(k => `<a href="/${dir}/${k}/"${section === k ? ' aria-current="page"' : ''}>${dockIcon(k)}<span>${ui(lang, k)}</span></a>`).join('');
  const SVG = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  };
  const html = `<!doctype html>
<html lang="${lang}" data-base="/${dir}/" data-none="${esc(ui(lang, 'noResults'))}">
<head>
<meta charset="utf-8">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}if(!('CSSViewTransitionRule' in window))document.documentElement.classList.add('no-vt')</script>
<noscript><style>.collapse{grid-template-rows:1fr}.collapse-clip{opacity:1;visibility:visible}</style></noscript>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)} · WOL Wiki</title>
${description ? `<meta name="description" content="${esc(description.slice(0, 180))}">` : ''}
<link rel="canonical" href="${SITE}/${dir}/${sub}">
${alternates}<link rel="alternate" hreflang="x-default" href="${SITE}/en/${sub}">
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48 64x64 128x128">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&display=swap">
<link rel="stylesheet" href="/assets/style.css">${SUG.head()}
</head>
<body>
<a class="skip" href="#main">${esc(ui(lang, 'skip'))}</a>
<header class="topbar">
<button id="treeBtn" class="iconbtn only-m" type="button" aria-label="${esc(ui(lang, 'menu'))}" aria-expanded="false">${SVG.menu}</button>
<a class="brand" href="/${dir}/"><img src="/assets/logo.png" width="32" height="32" alt=""><img class="wordmark" src="/assets/wordmark.svg" width="115" height="30" alt="WOL Wiki"></a>
<div class="searchbox"><input id="q" type="search" autocomplete="off" placeholder="${esc(ui(lang, 'search'))}" aria-label="${esc(ui(lang, 'search'))}"><kbd>Ctrl K</kbd><button id="searchClose" class="iconbtn only-m" type="button" aria-label="${esc(ui(lang, 'close'))}">${SVG.close}</button><div id="results" class="results" hidden></div></div>
<div class="tools">
<button id="theme" class="iconbtn" type="button" aria-label="${esc(ui(lang, 'theme'))}" title="${esc(ui(lang, 'theme'))}">${SVG.theme}</button>
<div class="menuwrap"><button id="langBtn" class="langbtn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(ui(lang, 'language'))}">${SVG.globe}<span>${lang.split('-')[0].toUpperCase()}</span></button><div id="langMenu" class="menu" role="menu" hidden>${langLinks}</div></div>
</div>
</header>
<div class="shell">
<aside id="tree" class="tree">${treeHtml}</aside>
<div id="scrim" class="scrim"></div>
<div class="content">
<main id="main">${body}</main>
<footer>${CREDITS.footer(lang)}${BUILD ? `<p>${esc(ui(lang, 'gameBuild'))} ${esc(BUILD)}</p>` : ''}${SUG.footerAction(lang)}</footer>
</div>
</div>
<nav class="dock">${dock}<button id="dockSearch" type="button">${dockIcon('search')}<span>${esc(ui(lang, 'searchShort'))}</span></button></nav>
<script src="/assets/app.js"></script>${SUG.endOfBody(lang)}
</body></html>`;
  writePage(path.join(dir, sub, 'index.html'), html);
  pageCount++;
}
const chipBar = (lang, list) => `<div class="chips" data-cat role="group" aria-label="${esc(ui(lang, 'category'))}"><button class="pill" type="button" data-v="" aria-pressed="true">${ui(lang, 'all')}</button>${list.map(c => `<button class="pill" type="button" data-v="${esc(c.v)}" aria-pressed="false">${esc(c.label)}</button>`).join('')}</div>`;
const crumbs = (lang, section, current) => `<div class="crumbs"><a href="/${langDir(lang)}/${section}/">${ui(lang, section)}</a>${current ? ` / ${current}` : ''}</div>`;

// ---------------------------------------------------------------- Pages
const categoryKey = item => `cat${item.ItemSubGroup}`;
const hasCategory = item => item.ItemSubGroup >= 1 && item.ItemSubGroup <= 13;
const categoryLabel = (lang, item) => (hasCategory(item) ? ui(lang, categoryKey(item)) : '');
const num = (lang, v) => (v > 0 ? number(lang, v) : '');
// The shop action is what a player actually pays. BuyValue differs from it on every item that has both
// (Basic Clothes: 42 on the item, 50 at the store), and 0 means "no price on the item", not "free".
// A job's real rank is its Work XP level: JobLevel holds odd values such as 14 on the Credit Analyst (XP level 4).
const jobRank = j => { const xp = deref(j.ExperiencePointRequirement); return xp ? xp.Level : j.JobLevel; };
// Stock prices move during the game, so the item's fixed fields are not what a player pays.
const isStock = it => it.ItemSubGroup === 12;
const sellPrice = it => (isStock(it) ? 0 : it.SellValue);
const buyPrice = it => {
  if (isStock(it)) return 0;
  const costs = [...(obtain.get(it._id) || [])].filter(a => !/^Quest ?Action|^QuestAction|^Buy Bed Cardboard$|^Buy Mining Laser$|^Cleansing Food$|^Food for [24] Weeks$/.test(a.m_Name)).map(a => -sumAttr(a.Rewards, 'Cash')).filter(c => c > 0);
  return costs.length ? Math.min(...costs) : 0;
};
// Shops that really sell the clothes on each map, instead of one fixed place name.
const mapHas = (m, place) => (m.LocationData || []).some(x => x && x.id === place._id);
const clothesShops = (lang, outfit, maps) => {
  const homes = [...new Set([...(obtain.get(outfit._id) || [])].filter(a => sumAttr(a.Rewards, 'Cash') < 0).flatMap(a => actionHome.get(a._id) || []))];
  if (!maps) return placesOf(lang, homes);
  const groups = new Map();
  for (const h of homes) { const on = maps.filter(m => mapHas(m, h)).map(m => m.m_Name); if (!on.length) continue; const k = titleText(lang, h); if (!groups.has(k)) groups.set(k, { h, on: new Set() }); on.forEach(x => groups.get(k).on.add(x)); }
  const list = [...groups.values()];
  if (list.length < 2) return list.length ? link(lang, list[0].h, title(lang, list[0].h)) : placesOf(lang, homes);
  return list.map(g => `${[...g.on].map(esc).join(', ')}: ${link(lang, g.h, title(lang, g.h))}`).join('; ');
};
// In-game hints stretch words for comedy ("Cooompre"), which reads as a typo on a web page.
const plainHint = (lang, key) => gameText(lang, key).replace(/(\p{L})\1{2,}/gu, '$1');

// ---------------------------------------------------------------- "How it works" blocks
// Sentences written for the site are logged in build/report.json; game text comes through tx().
const writtenForSite = new Set();
const { traduzir } = require('./traducao');
function say(lang, page, id, texts) {
  writtenForSite.add(`${page}: ${id}`);
  if (texts[lang]) return texts[lang];
  const translated = traduzir(lang, texts.en);
  return translated !== null ? translated : `<span lang="en">${texts.en}</span>`;
}
// "Learn more" links say where they go.
function moreLabel(lang, slug) { try { const t = (guideTitles(slug) || {})[lang]; return t ? `: ${t}` : ''; } catch (err) { return ''; } }
const callout = (label, html) => `<div class="callout"><strong>${esc(label)}</strong><div>${html}</div></div>`;
const howBlock = (lang, lead, calls, guide) => `<section class="howto" aria-label="${esc(ui(lang, 'howItWorks'))}"><h2>${ui(lang, 'howItWorks')}</h2>${lead ? `<p>${lead}</p>` : ''}${calls.length ? `<div class="callouts">${calls.join('')}</div>` : ''}${guide ? `<p class="howto-more"><a href="/${langDir(lang)}/guides/${guide}/">${ui(lang, 'learnMore')}${esc(moreLabel(lang, guide))}</a></p>` : ''}</section>`;
const placesOf = (lang, list) => { const seen = new Set(); return [...new Set(list)].filter(l => { const k = titleText(lang, l); if (seen.has(k)) return false; seen.add(k); return true; }).map(l => link(lang, l, title(lang, l))).join(', '); };
const gameText = (lang, key) => { const t = tx(lang, key); return t ? spanLang(lang, t) : ''; };
const place = (lang, name) => { const l = locations.find(x => x.m_Name === name); return l ? link(lang, l, title(lang, l)) : ''; };

function explainNaked(lang, it) {
  const page = it.m_Name;
  const others = jobs.filter(j => !artistJobs.has(j._id));
  const allowed = others.filter(j => j.RequiredEquippedItemTier === 0);
  const jobLinks = allowed.map(j => link(lang, j, title(lang, j))).join(', ');
  const office = place(lang, 'Town Hall');
  const tier0 = gameText(lang, 'chamber_jobs_tier_0');
  const lead = say(lang, page, 'lead (Lacerda)', {
    'pt-BR': 'Você fica Ao Natural quando passa rodadas demais sem renovar a roupa. O jogo coloca esta roupa em você até você comprar outra.',
    en: 'You end up Naked when you go too many rounds without replacing your clothes. The game puts this on you until you buy a new outfit.',
  });
  const clothes = items.filter(i => i.ItemSubGroup === 5 && i.Tier > 0).sort((a, b) => a.Tier - b.Tier)
    .map(i => `<li>${itemIcon(i, 22)}${link(lang, i, title(lang, i))} <span class="muted">· ${number(lang, buyPrice(i))}</span></li>`).join('');
  return howBlock(lang, lead, [
    callout(ui(lang, 'happensWhen'), `<p>${say(lang, page, 'durability in rounds (ItemData.Durability, LostYourClothesGameSystem, Lacerda)', {
      'pt-BR': `A durabilidade da sua roupa chega a zero. ${items.filter(i => i.ItemSubGroup === 5 && i.Tier > 0).sort((a, b) => a.Tier - b.Tier).map(i => `${title(lang, i)}: ${i.Durability} rodadas`).join(', ')}.`,
      en: `Your clothes run out of durability. ${items.filter(i => i.ItemSubGroup === 5 && i.Tier > 0).sort((a, b) => a.Tier - b.Tier).map(i => `${title(lang, i)}: ${i.Durability} rounds`).join(', ')}.`,
    })}</p>`),
    callout(ui(lang, 'gameWarns'), `<p>${gameText(lang, 'report_you_need_new_clothes_body')}</p>`),
    callout(ui(lang, 'blocks'), `<p>${say(lang, page, 'blocks job office (ModifyChambersInLocationTraitEffect)', {
      'pt-BR': `Na ${office}, as abas de empregos comuns somem. Só sobra <em>${tier0}</em>.`,
      en: `At the ${office}, the regular job tabs disappear. Only <em>${tier0}</em> is left.`,
    })}</p>`),
    callout(ui(lang, 'unlocks'), `<p>${say(lang, page, 'job count (RequiredEquippedItemTier)', {
      'pt-BR': `Com esta roupa você pode trabalhar em ${allowed.length} de ${others.length} empregos: ${jobLinks}. Os ${jobs.length - others.length} cargos de Artista não entram nessa conta, porque são do papel Artista.`,
      en: `In this outfit you can work ${allowed.length} of ${others.length} jobs: ${jobLinks}. The ${jobs.length - others.length} Artist ranks are not counted, as they belong to the Artist role.`,
    })}</p>`),
    callout(ui(lang, 'howToLeave'), `<p>${say(lang, page, 'buy clothes (shop actions)', {
      'pt-BR': `Compre uma roupa nova. Onde comprar: ${clothesShops(lang, items.find(i => i.m_Name === 'Tier 1 Clothes'))}.`,
      en: `Buy a new outfit. Where to buy: ${clothesShops(lang, items.find(i => i.m_Name === 'Tier 1 Clothes'))}.`,
    })}</p><ul class="fx">${clothes}</ul>`),
    ...(() => { try { return [ITENS.worthNaked(lang, it)]; } catch (err) { return []; } })(),
  ], 'clothes');
}

// Reverse index: every record in the game data that points at an item or action.
const pointers = new Map();
for (const [cls, recs] of Object.entries(RAW)) {
  if (/^UnityEngine|ItemData$/.test(cls)) continue;
  const short = cls.split('.').pop();
  for (const r of recs) {
    const walk = (v, field) => {
      if (Array.isArray(v)) { v.forEach(x => walk(x, field)); return; }
      if (!v || typeof v !== 'object') return;
      const key = v.id || v.Id;
      if (typeof key === 'string' && key) addTo(pointers, key, { cls: short, r, field, value: v.Value });
      for (const k of Object.keys(v)) if (k !== 'id' && k !== 'Id') walk(v[k], Number.isNaN(Number(k)) ? k : field);
    };
    walk(r, '');
  }
}
const pointersTo = rec => [...(pointers.get(rec._id) || []), ...(pointers.get(rec.Id) || [])];
// Actions a trait adds live on chambers instead of the location tables.
const traitActionHome = new Map();
for (const e of RAW['Gameplay.Traits.TraitEffectScripts.AddChamberActionTraitEffect'] || []) {
  const where = (e.Chambers || []).map(deref).filter(Boolean).flatMap(ch => locations.filter(l => (l.Chambers || []).some(x => x && x.id === ch._id)));
  for (const a of (e.ChamberActions || []).map(deref).filter(Boolean)) traitActionHome.set(a._id, [...new Set([...(traitActionHome.get(a._id) || []), ...where])]);
}
for (const e of RAW['Gameplay.Traits.TraitEffectScripts.AddOneTimeChamberActionTraitEffect'] || []) {
  const ch = deref(e.Chamber), a = deref(e.ChamberAction);
  if (ch && a) traitActionHome.set(a._id, [...new Set([...(traitActionHome.get(a._id) || []), ...locations.filter(l => (l.Chambers || []).some(x => x && x.id === ch._id))])]);
}
const actionWhere = a => [...new Set([...(actionHome.get(a._id) || []), ...(traitActionHome.get(a._id) || [])])];
const stepChain = new Map();
for (const c of allChains) for (const q of c.Quests || []) stepChain.set(q.id, c);
function questsOfAction(a) {
  return [...new Set(pointersTo(a).filter(p => p.cls === 'Quest').map(p => stepChain.get(p.r._id) || p.r))].filter(q => q && q._slug && hasText(q));
}
// Chance of an item in an action's random table, in percent; 0 when it is a fixed reward.
function dropChance(a, it) {
  const rows = a.WeightedRewards || [];
  const total = rows.reduce((s, w) => s + w.Weight, 0);
  const hit = rows.filter(w => collectEntries([w.Reward]).some(e => e.Id === it.Id)).reduce((s, w) => s + w.Weight, 0);
  return total ? Math.round(hit / total * 100) : 0;
}
const SCAVENGE_PLACES = { Cluckers: /Cluckers/, Gym: /Gym/, 'Moo Moo Mart': /Grocery/, Academy: /Academy/, Mall: /Department Store/, Bank: /^Bank/, Park: /Garden City/, 'Vex Corp': /Vex Corp/ };
const roleOfRaw = r => roles.find(x => x._id === r._id);
function pawnPlace(lang) {
  const l = locations.find(x => /Pawn/.test(x.m_Name));
  return l ? link(lang, l, title(lang, l)) : '';
}
// HomeHandler.HomeCanHold, DoesFurnitureNeedBetterHome, GetFurnitureRewardsForHighestSlot; RelaxationHandler.GetSleepRewards, GetRelaxRewards.
function explainFurniture(lang, it) {
  const page = it.m_Name;
  const calls = [];
  const n = v => number(lang, v);
  const homes = table('HomeData').filter(h => h.Rent > 0).sort((a, b) => a.Rent - b.Rent);
  const special = { 300: 'SmallSpecialFurnitureCount', 320: 'MediumSpecialFurnitureCount', 310: 'LargeSpecialFurnitureCount' }[it.FurnitureSlot];
  const fits = homes.filter(h => (special ? h[special] > 0 : true) && it.Tier <= h.MaxFurnitureTier);
  const fx = (it.Rewards.RewardEntries || []).filter(e => e.Type === ATTRIBUTE && byId.get(e.Id) && byId.get(e.Id).m_Name !== 'Cash');
  const when = it.FurnitureSlot === 10
    ? { 'pt-BR': 'Vale toda vez que você dorme em casa. Se tiver mais de uma cama, só a melhor conta. Ao relaxar, ela também soma o que não for Estresse.', en: 'It counts every time you sleep at home. If you own more than one bed, only the best one counts. On relax it also adds anything that is not Stress.' }
    : true
      ? { 'pt-BR': 'Vale toda vez que você relaxa em casa, somando com os outros móveis colocados. Dinheiro e Estresse não contam ao relaxar.', en: 'It counts every time you relax at home, adding up with your other placed furniture. Cash and Stress do not count on relax.' }
      : null;
  if (when && fx.length) calls.push(callout(say(lang, page, 'furniture effect label', { 'pt-BR': 'Quando faz efeito', en: 'When it works' }), `<p>${say(lang, page, `furniture when slot ${it.FurnitureSlot} (RelaxationHandler)`, when)}</p>${effects(lang, fx)}`));
  const limit = special
    ? { 'pt-BR': `Móvel especial: cada moradia tem poucas vagas deste tamanho. ${homes.map(h => `${titleText(lang, h)}: ${h[special]}`).join(', ')}.`, en: `Special furniture: each home has few slots of this size. ${homes.map(h => `${titleText(lang, h)}: ${h[special]}`).join(', ')}.` }
    : null;
  if (it.Tier > 0 || limit) calls.push(callout(say(lang, page, 'furniture limit label', { 'pt-BR': 'Onde cabe', en: 'Where it fits' }), `<p>${it.Tier === 0 ? '' : say(lang, page, 'furniture tier (ItemData.Tier, HomeData.MaxFurnitureTier)', fits.length
    ? { 'pt-BR': `Móvel de nível ${it.Tier}: só entra em moradia que aceite esse nível. Serve em: ${fits.map(h => titleText(lang, h)).join(', ')}.`, en: `Tier ${it.Tier} furniture: it only goes in a home that accepts that tier. Fits in: ${fits.map(h => titleText(lang, h)).join(', ')}.` }
    : { 'pt-BR': `Móvel de nível ${it.Tier}: nenhuma moradia para alugar aceita esse nível.`, en: `Tier ${it.Tier} furniture: no rentable home accepts that tier.` })}${limit ? ` ${say(lang, page, 'furniture special slots (HomeData)', limit)}` : ''}</p>`));
  return calls;
}

function explainUses(lang, it, shops, firstLines = []) {
  const page = it.m_Name;
  const calls = [];
  const lines = [], uses = [];
  const pts = pointersTo(it);
  const label = (a, extra) => `<li><strong>${title(lang, a)}</strong>${extra || ''}${actionWhere(a).length ? ` · ${placesOf(lang, actionWhere(a))}` : ''}</li>`;
  const pct = a => { const c = dropChance(a, it); return c ? ` <span class="muted">${say(lang, page, 'chance (WeightedRewards)', { 'pt-BR': `${c}% de chance`, en: `${c}% chance` })}</span>` : ''; };
  const sold = new Set([...(obtain.get(it._id) || [])].filter(a => sumAttr(a.Rewards, 'Cash') < 0 && actionHome.has(a._id)));
  const scavenge = [];
  const gotBy = new Map();
  let artistPaints = false;
  for (const a of obtain.get(it._id) || []) {
    if (sold.has(a)) continue;
    const m = /^Scavenge Pool - (.+)$/.exec(a.m_Name);
    if (m && SCAVENGE_PLACES[m[1]]) { const l = locations.find(x => SCAVENGE_PLACES[m[1]].test(x.m_Name)); if (l) scavenge.push(`${link(lang, l, title(lang, l))}${pct(a)}`); continue; }
    if (/^Artist - Make Art Reward/.test(a.m_Name)) { artistPaints = true; continue; }
    const box = /^Get (.+) Rewards$/.exec(a.m_Name) && items.find(i => i.m_Name === /^Get (.+) Rewards$/.exec(a.m_Name)[1]);
    if (box) { lines.push('<li>' + say(lang, page, 'prize of a box item (Get X Rewards action)', { 'pt-BR': 'Pode sair de', en: 'Can come out of' }) + ' ' + link(lang, box, title(lang, box)) + pct(a) + '</li>'); continue; }
    if (hasText(a)) {
      const name = title(lang, a);
      if (!gotBy.has(name)) gotBy.set(name, []);
      gotBy.get(name).push(`${placesOf(lang, actionWhere(a))}${pct(a)}`.trim());
    }
  }
  if (artistPaints) { const art = roles.find(x => /artist/i.test(`${x.m_Name} ${x.Term || ''}`)); if (art) lines.push(`<li>${say(lang, page, 'artist painting (Artist.ProgressPainting, Make Art Reward)', { 'pt-BR': `O papel ${link(lang, art, title(lang, art))} recebe ao terminar um quadro.`, en: `The ${link(lang, art, title(lang, art))} role gets it when finishing a painting.` })}</li>`); }
  for (const [name, spots] of gotBy) { const clean = [...new Set(spots.filter(Boolean))]; lines.push(`<li><strong>${name}</strong>${clean.length ? ` · ${clean.join(', ')}` : ''}</li>`); }
  const roleBy = re => roles.find(r => re.test(`${r.m_Name} ${r.Term || ''}`));
  const scav = roleBy(/scavenger/i);
  if (scavenge.length && scav) lines.push(`<li>${say(lang, page, 'scavenge (Scavenge Pool actions)', { 'pt-BR': `O papel ${link(lang, scav, title(lang, scav))} encontra vasculhando em:`, en: `The ${link(lang, scav, title(lang, scav))} role finds it scavenging at:` })} ${scavenge.join(', ')}</li>`);
  for (const p of pts) {
    const role = /^(Cultist|Scavenger|Adventurer)$/.test(p.cls) ? (roleOfRaw(p.r) || roleBy(new RegExp(p.cls, 'i'))) : null;
    const roleLink = role ? link(lang, role, title(lang, role)) : '';
    if (role && p.field === 'BoonItems') {
      const tier = ((p.r.CultistBoons || []).find(b => (b.BoonItems || []).some(x => x.id === it._id)) || {}).Tier;
      lines.push(`<li>${say(lang, page, 'cultist boon (Cultist.CultistBoons, role_cultist_sheet)', { 'pt-BR': `O papel ${roleLink} pode receber como recompensa${tier ? ` de nível ${tier}` : ''}, depois de cumprir 3 vontades do terror cósmico.`, en: `The ${roleLink} role can get it as a${tier ? ` tier ${tier}` : ''} reward, after completing 3 tasks for the cosmic horror.` })}</li>`);
    }
    if (role && p.field === 'Artifact') lines.push(`<li>${say(lang, page, 'artifact (Scavenger.Artifact, role_scavenger_sheet)', { 'pt-BR': `É um artefato do papel ${roleLink}. Descobrir artefatos libera vasculhar em mais lugares.`, en: `It is an artifact of the ${roleLink} role. Discovering artifacts unlocks scavenging in more places.` })}</li>`);
    if (role && p.field === 'Artifact') uses.push(`<li>${say(lang, page, 'artifact use (Scavenger.Locations.ArtifactsRequired)', { 'pt-BR': 'Cada artefato encontrado conta para liberar novos locais de busca.', en: 'Each artifact found counts toward unlocking new places to search.' })}</li>`);
    if (role && p.field === 'ItemRewards') lines.push(`<li>${say(lang, page, 'adventurer (Adventurer.ItemRewards)', { 'pt-BR': `Recompensa do papel ${roleLink}.`, en: `Reward of the ${roleLink} role.` })}</li>`);
    if (p.cls === 'AdventurerGiveItemForQuestOnLevelTraitEffect') { const r = roleBy(/adventurer/i); if (r) lines.push(`<li>${say(lang, page, 'adventurer quests (AdventurerGiveItemForQuestOnLevelTraitEffect, role_adventurer_sheet)', { 'pt-BR': `O papel ${link(lang, r, title(lang, r))} recebe ao completar Missões.`, en: `The ${link(lang, r, title(lang, r))} role gets it for completing quests.` })}</li>`); }
    if (p.cls === 'GiveAnyRewardOnTurnStartTraitEffect') {
      for (const g of items.filter(i => ((i.Rewards || {}).RewardEntries || []).some(e => e.Type === 110 && ((byId.get(e.Id) || {}).Effects || []).some(x => x.id === p.r._id)))) {
        lines.push(`<li>${say(lang, page, 'effigy gives (GiveAnyRewardOnTurnStartTraitEffect)', { 'pt-BR': `${link(lang, g, title(lang, g))} dá este item no início dos turnos.`, en: `${link(lang, g, title(lang, g))} gives this item at the start of turns.` })}</li>`);
      }
    }
    if (p.cls === 'EducationData' && p.field === 'RewardEntries' && hasText(p.r)) {
      lines.push(`<li>${say(lang, page, 'course reward (EducationData.CompletionReward)', { 'pt-BR': `Você recebe ao concluir o curso <strong>${title(lang, p.r)}</strong>.`, en: `You get it on finishing the course <strong>${title(lang, p.r)}</strong>.` })}</li>`);
      const know = p.r.CompletionReward.RewardEntries.find(e => e.Type === 55);
      const before = know ? ((p.r.KnowledgeRequirements || []).find(k => k.Id === know.Id) || { Value: 0 }).Value : 0;
      const opened = know ? jobs.filter(j => (j.KnowledgeRequirements || []).some(k => k.Id === know.Id && k.Value === before + know.Value)) : [];
      const points = (p.r.CompletionReward.RewardEntries.find(e => e.Type === 95) || {}).Value;
      if (opened.length) uses.push(`<li>${say(lang, page, 'diploma unlocks (JobData.KnowledgeRequirements)', { 'pt-BR': `Comprova o curso que libera estes empregos: ${opened.map(j => link(lang, j, title(lang, j))).join(', ')}.`, en: `Proves the course that unlocks these jobs: ${opened.map(j => link(lang, j, title(lang, j))).join(', ')}.` })}</li>`);
      if (points) uses.push(`<li>${say(lang, page, 'diploma points (EducationData.CompletionReward)', { 'pt-BR': `Concluir esse curso vale ${number(lang, points)} pontos.`, en: `Finishing that course is worth ${number(lang, points)} points.` })}</li>`);
    }
    if (p.cls === 'RealmData' && p.field === 'StartingEquipment') lines.push(`<li>${say(lang, page, 'starting gear (RealmData.StartingEquipment)', { 'pt-BR': 'Todo jogador começa a partida com este item.', en: 'Every player starts the game with this item.' })}</li>`);
    if (p.cls === 'LotteryData') uses.push(`<li>${say(lang, page, 'lottery (LotteryData.Tickets)', { 'pt-BR': 'Vale como bilhete de loteria.', en: 'Counts as a lottery ticket.' })}</li>`);
    if (p.cls === 'EducationData' && p.field === 'RequiredItems' && hasText(p.r)) uses.push(`<li>${say(lang, page, 'course needs item (EducationData.RequiredItems)', { 'pt-BR': `Você precisa dele para o curso <strong>${title(lang, p.r)}</strong>.`, en: `You need it for the course <strong>${title(lang, p.r)}</strong>.` })}</li>`);
    if (p.cls === 'Quest' && /Item/.test(p.field)) { const q = stepChain.get(p.r._id) || p.r; if (q._slug && hasText(q)) uses.push(`<li>${say(lang, page, 'quest objective (Quest objective item)', { 'pt-BR': `Pedido na Missão ${link(lang, q, title(lang, q))}.`, en: `Asked for in the quest ${link(lang, q, title(lang, q))}.` })}</li>`); }
  }
  const usedBy = new Map();
  for (const a of consume.get(it._id) || []) {
    if (!hasText(a)) continue;
    const need = (a.RequiredItems || []).find(e => byId.get(e.Id) === it);
    const fx = effects(lang, a.Rewards.RewardEntries.filter(e => e.Type !== 70));
    const key = `${title(lang, a)}|${fx}|${need ? need.Value : 0}`;
    if (!usedBy.has(key)) usedBy.set(key, { a, fx, need, where: [] });
    usedBy.get(key).where.push(...actionWhere(a));
  }
  for (const { a, fx, need, where } of usedBy.values()) uses.push(`<li>${need && need.Value > 1 ? `${need.Value}× ` : ''}${say(lang, page, 'used by action (RequiredItems)', { 'pt-BR': `Usado em <strong>${title(lang, a)}</strong>`, en: `Used in <strong>${title(lang, a)}</strong>` })}${where.length ? ` · ${placesOf(lang, where)}` : ''}${fx}</li>`);
  // Prizes held by the Big Game prefabs (GlobalEventBigGameCali/Chai: WinnerReward, WinRewards), which the extractor does not read.
  if (/^Big Game - .*Jersey/.test(it.m_Name)) lines.push(`<li>${say(lang, page, 'big game jersey (GlobalEventBigGame.WinRewards, ScoreThreshold 20)', { 'pt-BR': 'Prêmio do Evento Global Big Game: quem fez 20 pontos de apoio ao time e viu o time vencer recebe este item, com 500 de Dinheiro.', en: 'A prize from the Big Game Global Event: whoever made 20 support points for the team and saw it win gets this item, plus 500 Cash.' })}</li>`);
  if (/^Big Game - Signed Ball/.test(it.m_Name)) lines.push(`<li>${say(lang, page, 'big game ball (GlobalEventBigGame.WinnerReward)', { 'pt-BR': 'Prêmio especial do Evento Global Big Game, dado quando o seu time vence.', en: 'Special prize of the Big Game Global Event, given when your team wins.' })}</li>`);
  // PawnShopManager.TryGetPurchaseCoupon looks for ItemSubType.PawnShopCoupon (260) in the inventory.
  if ((it.SubTypes || []).includes(260)) uses.push(`<li>${say(lang, page, 'pawn coupon (TryGetPurchaseCoupon, SubType 260)', { 'pt-BR': `Vale um item de graça na prateleira da ${pawnPlace(lang)}.`, en: `Worth one free item from the ${pawnPlace(lang)} shelf.` })}</li>`);
  // Cultist ritual step (quest_cultist_plagues_pickup / _deliver).
  if (it.m_Name === 'Box of Plagues') uses.push(`<li>${gameText(lang, 'quest_cultist_plagues_pickup')}. ${gameText(lang, 'quest_cultist_plagues_deliver')}.</li>`);
  // The crate has no pointer; its action is named after it (ChamberActionData "Get Friendship Crate Rewards").
  const opener = table('ChamberActionData').find(a => a.m_Name === `Get ${it.m_Name} Rewards`);
  if (opener) {
    const total = opener.WeightedRewards.reduce((s, w) => s + w.Weight, 0);
    const prizes = opener.WeightedRewards.map(w => { const e = collectEntries([w.Reward]).find(x => x.Type === ITEM); const prize = e && byId.get(e.Id); return prize ? `<li>${e.Value}× ${itemIcon(prize, 20)}${link(lang, prize, title(lang, prize))} <span class="muted">${Math.round(w.Weight / total * 100)}%</span></li>` : ''; }).join('');
    uses.push(`<li>${say(lang, page, 'crate (Get Friendship Crate Rewards)', { 'pt-BR': 'Dá um destes prêmios:', en: 'Gives one of these prizes:' })}<ul class="fx">${prizes}</ul></li>`);
  }
  const quests = [...new Set([...(obtain.get(it._id) || []), ...(consume.get(it._id) || [])].flatMap(questsOfAction))];
  if (quests.length) uses.push(`<li>${say(lang, page, 'quest item (Quest objectives, QuestAction)', { 'pt-BR': `Faz parte da Missão ${quests.map(q => link(lang, q, title(lang, q))).join(', ')}.`, en: `Part of the quest ${quests.map(q => link(lang, q, title(lang, q))).join(', ')}.` })}</li>`);
  // Purpose 4 is furniture; boon furniture (SubType 270) never reaches the shelf.
  if (it.Purpose === 4 && it.BuyValue > 0 && !(it.SubTypes || []).includes(270)) {
    const special = [300, 310, 320].includes(it.FurnitureSlot);
    lines.push(`<li>${say(lang, page, special ? 'pawn shelf special (SpecialFurnitureSold 3)' : 'pawn shelf normal (NormalFurnitureSold 1)', special
      ? { 'pt-BR': `Pode aparecer à venda na ${pawnPlace(lang)}, por ${number(lang, it.BuyValue)}. A cada rodada a loja sorteia 3 móveis especiais.`, en: `Can show up for sale at the ${pawnPlace(lang)}, for ${number(lang, it.BuyValue)}. Each round the shop draws 3 special pieces.` }
      : { 'pt-BR': `Também pode aparecer à venda na ${pawnPlace(lang)}, por ${number(lang, it.BuyValue)}. A cada rodada a loja sorteia 1 móvel comum.`, en: `Can also show up for sale at the ${pawnPlace(lang)}, for ${number(lang, it.BuyValue)}. Each round the shop draws 1 regular piece.` })}</li>`);
  }
  const unique = list => [...new Set(list)];
  const hasOther = otherSources.has(it._id) || shops.length || /^Big Game/.test(it.m_Name) || it.ItemGroup === 1;
  const orphan = !lines.length && !hasOther && !uses.length;
  lines.unshift(...firstLines);
  if (lines.length) calls.push(callout(ui(lang, 'obtain'), `<ul class="plain">${unique(lines).slice(0, 14).join('')}</ul>`));
  else if (orphan) calls.push(callout(ui(lang, 'obtain'), `<p>${say(lang, page, 'unused content (no pointer in data, prefabs or scenes)', { 'pt-BR': 'Nada na partida entrega este item hoje: ele está nos arquivos do jogo, mas nenhuma ação, Missão, evento ou papel o usa.', en: 'Nothing in the game gives this item today: it is in the game files, but no action, quest, event or role uses it.' })}</p>`));
  const useLabel = say(lang, page, 'label uses', { 'pt-BR': 'Para que serve', en: 'What it is for' });
  if (uses.length) calls.push(callout(useLabel, `<ul class="plain">${unique(uses).slice(0, 14).join('')}</ul>`));
  const hasTrait = ((it.Rewards || {}).RewardEntries || []).some(e => e.Type === 110);
  // Furniture, pets, clothes, transport, stocks and anything with its own effects are used by being owned.
  const passive = [1, 3].includes(it.ItemGroup) || [5, 7, 12].includes(it.ItemSubGroup) || it.ScoreBonus > 0 || (it.SubTypes || []).includes(30) || ((it.Rewards || {}).RewardEntries || []).some(e => e.Type === ATTRIBUTE && byId.get(e.Id) && byId.get(e.Id).m_Name !== 'Cash');
  const pawn = pawnPlace(lang);
  if (it.SellValue > 0 && !orphan) {
    const used = uses.length || hasTrait || passive;
    calls.push(callout(ui(lang, 'sell'), `<p>${say(lang, page, used ? 'sell value (GetPawnRewardsForItem)' : 'only sell (no pointer in game data, GetPawnRewardsForItem)', used
      ? { 'pt-BR': `Na ${pawn}, rende ${number(lang, it.SellValue)}.`, en: `At the ${pawn}, it fetches ${number(lang, it.SellValue)}.` }
      : { 'pt-BR': `Serve só para vender: rende ${number(lang, it.SellValue)} na ${pawn}.`, en: `It is only good for selling: it fetches ${number(lang, it.SellValue)} at the ${pawn}.` })}</p>`));
  } else if (!uses.length && !hasTrait && !passive) {
    calls.push(callout(useLabel, `<p>${say(lang, page, 'no use and no sale (no pointer in game data, SellValue 0)', { 'pt-BR': 'Não tem função na partida e não pode ser vendido.', en: 'It has no use in-game and cannot be sold.' })}</p>`));
  }
  return calls;
}

const REPAIR_FRACTION = 0.6; // ChamberActionAvailability.RepairClothesCostFraction
const repairAction = () => table('ChamberActionData').find(a => a.Purpose === 8); // ChamberActionPurposeType.RepairClothes
// StockBehavior.CreateDefaults; StocksManager.Initialize picks one with TryGetStockBehaviorByTier(item.Tier).
const STOCK_PROFILES = [
  { tier: 1, name: { 'pt-BR': 'Seguro', en: 'Safe' }, swing: 16, trend: 1, roof: 3 },
  { tier: 2, name: { 'pt-BR': 'Arriscado', en: 'Risky' }, swing: 18, trend: 0, roof: 3 },
  { tier: 3, name: { 'pt-BR': 'Subida lenta', en: 'Slow rise' }, swing: 10, trend: 3, roof: 3 },
  { tier: 5, name: { 'pt-BR': 'Queda lenta', en: 'Slow fall' }, swing: 10, trend: -1, roof: 2 },
];
const signedPercent = (lang, v) => `${v > 0 ? '+' : ''}${number(lang, v)}%`;

// "You spend X and Y to get Z", from an action's rewards. Lowering Stress counts as a gain.
function actionSentence(lang, a) {
  const name = e => plain(attrName(lang, byId.get(e.Id).m_Name));
  const entries = a.Rewards.RewardEntries.filter(e => e.Type === ATTRIBUTE && byId.get(e.Id) && e.Value);
  const isGain = e => (byId.get(e.Id).m_Name === 'Stress' ? e.Value < 0 : e.Value > 0);
  const piece = e => `${number(lang, Math.abs(e.Value))} ${name(e)}`;
  const isStressUp = e => byId.get(e.Id).m_Name === 'Stress' && e.Value > 0;
  const costs = entries.filter(e => !isGain(e) && !isStressUp(e)).map(piece), gains = entries.filter(isGain), stress = entries.filter(isStressUp);
  if (!gains.length) return '';
  const stressNote = stress.length ? say(lang, 'traits', 'action raises stress', { 'pt-BR': ` Sobe ${piece(stress[0])}.`, en: ` Raises ${piece(stress[0])}.` }) : '';
  const got = pt => gains.map(e => (byId.get(e.Id).m_Name === 'Stress' ? (pt ? `reduzir ${piece(e)}` : `lower ${piece(e)}`) : (pt ? `ganhar ${piece(e)}` : `gain ${piece(e)}`))).map((s, i) => (i ? s.replace(/^(ganhar|gain) /, '') : s)).join(', ').replace(/, ([^,]*)$/, pt ? ' e $1' : ' and $1');
  return say(lang, 'traits', 'action sentence (ChamberActionData.Rewards)', costs.length
    ? { 'pt-BR': `Você gasta ${costs.join(' e ')} para ${got(true)}.`, en: `You spend ${costs.join(' and ')} to ${got(false)}.` }
    : { 'pt-BR': `Serve para ${got(true)}.`, en: `It lets you ${got(false)}.` }) + stressNote;
}

// What a trait really does, read from its effect assets: actions it adds and what it pays each turn.
const cooldownNote = (lang, a) => (a.Cooldown === 1 ? say(lang, 'traits', 'cooldown 1 (ChamberActionData.Cooldown)', { 'pt-BR': ' Uma vez por rodada.', en: ' Once per round.' }) : a.Cooldown > 1 ? say(lang, 'traits', 'cooldown n (ChamberActionData.Cooldown)', { 'pt-BR': ` Uma vez a cada ${a.Cooldown} rodadas.`, en: ` Once every ${a.Cooldown} rounds.` }) : '');
// While a job page renders, perks list only buildings that exist on the maps where that job does.
let perkMaps = null;
const perkPlace = l => !perkMaps || !perkMaps.length || perkMaps.some(m => mapHas(m, l));
function traitDetails(lang, t) {
  const lines = [];
  const attrs = list => (list || []).map(a => { const at = deref(a.Attribute); return at ? `<span class="v ${a.Value < 0 ? 'n' : 'p'}">${formatValue(lang, a.Value)}</span> ${title(lang, at)}` : ''; }).filter(Boolean).join(', ');
  for (const ref of t.Effects || []) {
    const e = deref(ref);
    if (!e) continue;
    const kind = String(ref.$ref || '').split('/')[0].split('.').pop();
    if (kind === 'AddChamberActionTraitEffect') {
      const where = [...new Set((e.Chambers || []).map(deref).filter(Boolean).flatMap(ch => locations.filter(l => (l.Chambers || []).some(x => x && x.id === ch._id))))].filter(perkPlace);
      for (const a of (e.ChamberActions || []).map(deref).filter(x => x && hasText(x))) {
        const fx = effects(lang, a.Rewards.RewardEntries);
        const flavorText = tx(lang, a.FlavorTerm) ? `<em>${spanLang(lang, tx(lang, a.FlavorTerm))}</em> ` : '';
        lines.push(`<li>${say(lang, 'traits', 'adds action (AddChamberActionTraitEffect)', { 'pt-BR': 'Libera a ação', en: 'Adds the action' })} <strong>${title(lang, a)}</strong>${where.length ? ` · ${placesOf(lang, where)}` : ''}. ${actionSentence(lang, a)}${cooldownNote(lang, a)}${fx}${EMP.actionExtra(lang, a)}</li>`);
      }
    } else if (kind === 'AddChamberTraitEffect') {
      const room = deref(e.ChamberData);
      const where = (e.LocationFilter || []).map(deref).filter(Boolean);
      if (room) for (const a of (room.Actions || []).map(deref).filter(x => x && hasText(x))) lines.push(`<li>${say(lang, 'traits', 'adds room (AddChamberTraitEffect)', { 'pt-BR': `Abre a sala ${title(lang, room)}${where.length ? ` (${placesOf(lang, where)})` : ''}, com a ação`, en: `Opens the ${title(lang, room)} room${where.length ? ` (${placesOf(lang, where)})` : ''}, with the action` })} <strong>${title(lang, a)}</strong>. ${actionSentence(lang, a)}${cooldownNote(lang, a)}${effects(lang, a.Rewards.RewardEntries)}${EMP.actionExtra(lang, a)}</li>`);
    } else if (kind === 'ReplaceChamberActionsTraitEffect') {
      for (const p of e.ActionsToReplace || []) { const from = deref(p.ToCompareWith), to = deref(p.ToReplaceWith); if (from && to && hasText(from) && hasText(to)) lines.push(`<li>${say(lang, 'traits', 'replaces action (ReplaceChamberActionsTraitEffect)', { 'pt-BR': `Troca ${title(lang, from)} por`, en: `Replaces ${title(lang, from)} with` })} <strong>${title(lang, to)}</strong>. ${actionSentence(lang, to)}${cooldownNote(lang, to)}${effects(lang, to.Rewards.RewardEntries)}${EMP.actionExtra(lang, to)}</li>`); }
    } else if (kind === 'GiveWorkXpOnActionTraitEffect') {
      lines.push(`<li>${say(lang, 'traits', 'work xp on action (GiveWorkXpOnActionTraitEffect.Multiplier)', { 'pt-BR': `Essa ação soma à sua EXP de Trabalho o que um turno de trabalho do seu emprego daria, vezes ${number(lang, e.Multiplier)}.`, en: `That action adds to your Work XP what one shift of your job would give, times ${number(lang, e.Multiplier)}.` })}</li>`);
    } else if (kind === 'ModifyMovementSpeedAndCostTraitEffect') {
      for (const c of e.AdditionalMoveCostList || []) { const at = deref(c.Attribute); if (at) { const pct = Math.round((c.Percentage - 1) * 100); lines.push(`<li>${say(lang, 'traits', 'move cost (ModifyMovementSpeedAndCostTraitEffect)', pct < 0 ? { 'pt-BR': `Andar gasta ${-pct}% menos ${title(lang, at)}.`, en: `Walking costs ${-pct}% less ${title(lang, at)}.` } : { 'pt-BR': `Andar gasta ${pct}% mais ${title(lang, at)}.`, en: `Walking costs ${pct}% more ${title(lang, at)}.` })}</li>`); } }
    } else if (kind === 'ModifyWorkRewardsByPercentagesTraitEffect' || kind === 'ModifyWorkRewardsByPercentageTraitEffects') {
      for (const m of e.Modifier || []) { const at = deref(m.Attribute); if (at) lines.push(`<li>${say(lang, 'traits', 'work reward (ModifyWorkRewardsByPercentages)', { 'pt-BR': `Trabalhar dá ${Math.round((m.Percentage - 1) * 100)}% mais ${title(lang, at)}.`, en: `Working gives ${Math.round((m.Percentage - 1) * 100)}% more ${title(lang, at)}.` })}</li>`); }
    } else if (kind === 'ModifyEnrollmentCostTraitEffect' && e.Modifier) {
      lines.push(`<li>${say(lang, 'traits', 'enrollment (ModifyEnrollmentCost)', { 'pt-BR': `A matrícula custa ${Math.round((1 - e.Modifier.Percentage) * 100)}% menos.`, en: `Enrollment costs ${Math.round((1 - e.Modifier.Percentage) * 100)}% less.` })}</li>`);
    } else if (kind === 'ModifyRewardsOfActionsInChambersTraitEffect' && e.AttributeModifier) {
      const at = deref(e.AttributeModifier.Attribute), pct = Math.round((e.AttributeModifier.Percentage - 1) * 100);
      const where = [...new Set((e.LocationChamberData || []).map(deref).filter(Boolean).flatMap(ch => locations.filter(l => (l.Chambers || []).some(x => x && x.id === ch._id))))];
      if (at && where.length) lines.push(`<li>${say(lang, 'traits', 'chamber prices (ModifyRewardsOfActionsInChambers)', { 'pt-BR': `${title(lang, at)} ${pct < 0 ? `${-pct}% menor` : `${pct}% maior`} nas ações de: ${placesOf(lang, where)}.`, en: `${title(lang, at)} ${pct < 0 ? `${-pct}% lower` : `${pct}% higher`} on actions at: ${placesOf(lang, where)}.` })}</li>`);
    } else if (kind === 'ModifyChamberActionRewardsByPercentage' || kind === 'ModifyChamberActionRewardsByPercentageTraitEffect') {
      const acts = [].concat(e.ChamberActionData || []).map(deref).filter(x => x && hasText(x));
      for (const m of e.AttributeModifications || []) { const at = deref(m.Attribute); if (at && acts.length) lines.push(`<li>${say(lang, 'traits', 'action reward (ModifyChamberActionRewardsByPercentage)', { 'pt-BR': `${acts.map(a => title(lang, a)).join(', ')}: ${title(lang, at)} vezes ${number(lang, m.Percentage)}.`, en: `${acts.map(a => title(lang, a)).join(', ')}: ${title(lang, at)} times ${number(lang, m.Percentage)}.` })}</li>`); }
    } else if (kind === 'GiveAnyRewardOnTurnStartTraitEffect') {
      const given = [...(e.Items || []).map(x => { const i = deref(x.Item); return i ? `${x.Count}× ${itemIcon(i, 20)}${link(lang, i, title(lang, i))}` : ''; }).filter(Boolean), attrs(e.AttributeModifiers)].filter(Boolean).join(', ');
      if (given) lines.push(`<li>${say(lang, 'traits', 'turn reward (GiveAnyRewardOnTurnStartTraitEffect)', e.EveryNRounds > 1 ? { 'pt-BR': `A cada ${e.EveryNRounds} rodadas, no início do turno:`, en: `Every ${e.EveryNRounds} rounds, at turn start:` } : { 'pt-BR': 'No início de cada turno:', en: 'At the start of each turn:' })} ${given}</li>`);
    } else if (kind === 'PetGiveRewardOnTurnStartTraitEffect') {
      const tiers = [['Neglected', { 'pt-BR': 'Negligenciado', en: 'Neglected' }], ['Content', { 'pt-BR': 'Contente', en: 'Content' }], ['Pampered', { 'pt-BR': 'Mimado', en: 'Pampered' }]];
      const parts = tiers.map(([k, n]) => (attrs(e[k]) ? `${say(lang, 'traits', `pet mood ${k} (PetGiveRewardOnTurnStartTraitEffect)`, n)}: ${attrs(e[k])}` : '')).filter(Boolean);
      if (parts.length) lines.push(`<li>${say(lang, 'traits', 'pet turn reward', { 'pt-BR': 'No início do turno, conforme o humor do pet:', en: 'At turn start, by pet mood:' })} ${parts.join(' · ')}</li>`);
    }
  }
  return lines.length ? `<ul class="plain">${lines.join('')}</ul>` : '';
}

// Itens, móveis e pets: texto novo em tools/explicacoes/itens.js (cai para o texto antigo se der erro).
const ITENS = require('./explicacoes/itens')(() => ({
  RAW, table, byId, byRef, deref, items, jobs, locations, roles, quests, events, stepChain, allQuests, hasText, title, titleText, link, say, callout, howBlock, ui, number, formatValue,
  effects, itemIcon, gameText, place, pawnPlace, placesOf, pointersTo, obtain, consume, otherSources, startingGear, sumAttr, attrName, plain, esc, langDir, dropChance,
  SCAVENGE_PLACES, clothesShops, REPAIR_FRACTION, repairAction, artistJobs, actionHome, actionSentence, cooldownNote, tx, spanLang, collectEntries, ATTRIBUTE, ITEM,
  STOCK_PROFILES, signedPercent, isStock, fact, flavor,
}));
function itensTitle(lang, rec, t) {
  if (rec.ItemGroup === undefined) return null;
  try { return ITENS.renomear(lang, rec, t); } catch (err) { return null; }
}
const ITENS_DONE = new Set();
function itensErro(onde, it, lang, err) {
  const msg = `${onde} ${it.m_Name} ${lang}: ${String(err.stack).split('\n').slice(0, 4).join(' | ')}`;
  console.error('itens.js', msg);
  try { fs.appendFileSync(path.join(ROOT, 'build', 'itens-erros.log'), msg + '\n'); } catch (e) { /* ignora */ }
}
function itensExplain(lang, it) {
  try { const r = ITENS.explain(lang, it); ITENS_DONE.add(it._id); return r; } catch (err) { itensErro('explain', it, lang, err); return null; }
}
function itensFicha(lang, it) {
  try { return ITENS.ficha(lang, it); } catch (err) { itensErro('ficha', it, lang, err); return null; }
}
function explainItem(lang, it) {
  if (it.m_Name === 'Tier 0 Clothes') return explainNaked(lang, it);
  { const novo = itensExplain(lang, it); if (novo !== null) return novo; }
  if (isStock(it)) return explainStock(lang, it);
  const page = it.m_Name;
  const calls = [];
  if (it.ItemSubGroup === 5 && it.Tier > 0) {
    calls.push(callout(ui(lang, 'durability'), `<p>${say(lang, page, 'durability in rounds', {
      'pt-BR': `Dura ${it.Durability} rodadas. Depois disso, você fica ${link(lang, items.find(x => x.m_Name === 'Tier 0 Clothes'), title(lang, items.find(x => x.m_Name === 'Tier 0 Clothes')))}.`,
      en: `Lasts ${it.Durability} rounds. After that you end up ${link(lang, items.find(x => x.m_Name === 'Tier 0 Clothes'), title(lang, items.find(x => x.m_Name === 'Tier 0 Clothes')))}.`,
    })}</p>`));
    const need = jobs.filter(j => !artistJobs.has(j._id) && j.RequiredEquippedItemTier === it.Tier);
    const lower = jobs.filter(j => !artistJobs.has(j._id) && j.RequiredEquippedItemTier < it.Tier).length;
    if (need.length) calls.push(callout(ui(lang, 'unlocks'), `<p>${say(lang, page, 'jobs by tier (JobHandler.CanApplyForJob: refuses only when GetClothesTier is lower)', {
      'pt-BR': `${need.length} empregos pedem exatamente este nível: ${need.map(j => link(lang, j, title(lang, j))).join(', ')}. Ela também serve nos ${lower} empregos que pedem nível menor.`,
      en: `${need.length} jobs ask for exactly this tier: ${need.map(j => link(lang, j, title(lang, j))).join(', ')}. It also works for the ${lower} jobs that ask for a lower tier.`,
    })}</p>`));
    const fix = repairAction();
    calls.push(callout(title(lang, fix), `<p>${say(lang, page, 'repair cost (PerformNormalAction, ChamberActionAvailability.RepairClothesCostFraction 0.6, ItemData.BuyValue)', {
      'pt-BR': `Só quando falta 1 rodada de durabilidade. Custa ${number(lang, Math.round(it.BuyValue * REPAIR_FRACTION))} de Dinheiro e ${number(lang, -sumAttr(fix.Rewards, 'Time'))} de Tempo, e a roupa volta a durar ${Math.ceil(it.Durability * 0.65)} rodadas. Onde: ${placesOf(lang, actionHome.get(fix._id) || [])}.`,
      en: `Only with 1 round of durability left. Costs ${number(lang, Math.round(it.BuyValue * REPAIR_FRACTION))} Cash and ${number(lang, -sumAttr(fix.Rewards, 'Time'))} Time, and the outfit lasts ${Math.ceil(it.Durability * 0.65)} more rounds. Where: ${placesOf(lang, actionHome.get(fix._id) || [])}.`,
    })}</p>`));
  }
  if (it.ItemSubGroup !== 3) {
    const traits = ((it.Rewards || {}).RewardEntries || []).filter(e => e.Type === 110).map(e => byId.get(e.Id)).filter(t => t && (hasText(t) || traitDetails(lang, t)));
    if (traits.length) calls.push(callout(ui(lang, 'unlocks'), traits.map(t => {
      const f = tx(lang, t.FlavorTerm);
      return `${hasText(t) ? `<p><strong>${title(lang, t)}</strong>${f ? `: ${spanLang(lang, f)}` : ''}</p>` : ''}${traitDetails(lang, t)}`;
    }).join('')));
  }
  const sold = [...(obtain.get(it._id) || [])].filter(a => sumAttr(a.Rewards, 'Cash') < 0);
  const shops = sold.flatMap(a => actionHome.get(a._id) || []);
  const obtainFirst = [];
  if (shops.length) obtainFirst.push(`<li>${say(lang, page, 'where it is sold (shop actions)', {
    'pt-BR': `Custa ${number(lang, buyPrice(it))}. Onde comprar: ${placesOf(lang, shops)}.`,
    en: `Costs ${number(lang, buyPrice(it))}. Where to buy: ${placesOf(lang, shops)}.`,
  })}</li>`);
  if (otherSources.has(it._id)) {
    const n = otherSources.get(it._id).size;
    obtainFirst.push(`<li><a href="#obtain">${say(lang, page, 'quest and event sources', {
      'pt-BR': `${n === 1 ? 'Uma quest ou evento dá' : `${n} quests ou eventos dão`} este item.`,
      en: `${n === 1 ? 'One quest or event gives' : `${n} quests or events give`} this item.`,
    })}</a></li>`);
  }
  calls.push(...explainUses(lang, it, shops, obtainFirst));
  if (it.ItemGroup === 1) calls.push(...explainFurniture(lang, it));
  if (it.ItemGroup === 1 && it.ScoreBonus > 0) calls.push(callout(ui(lang, 'score'), `<p>${formatValue(lang, it.ScoreBonus)}. ${gameText(lang, 'sheet_scoring_furniture')}</p>`));
  return calls.length ? howBlock(lang, '', calls, it.ItemSubGroup === 5 ? 'clothes' : it.ItemSubGroup === 3 ? 'pets' : null) : '';
}

const lostJobSystem = () => (Object.entries(RAW).find(([k]) => /LostYourJobGameSystem$/.test(k)) || [null, []])[1][0];

function explainStock(lang, it) {
  const page = it.m_Name;
  const exchange = gameText(lang, 'chamber_bank_stock_exchange');
  const bank = place(lang, 'Bank');
  const shock = (RAW['Gameplay.Traits.TraitEffectScripts.MarketShockEachRoundTraitEffect'] || [])[0];
  const chaos = (RAW['Gameplay.Modifiers.ModifierData'] || []).find(m => m.m_Name === 'Stock Market Chaos');
  const lead = say(lang, page, 'where traded (Stock Exchange chamber)', {
    'pt-BR': `É uma ação da bolsa. Você compra e vende em <em>${exchange}</em>. Onde: ${bank}.`,
    en: `This is a stock. You buy and sell it on the <em>${exchange}</em>. Where: ${bank}.`,
  });
  const siblings = items.filter(i => isStock(i) && i !== it).map(i => `${itemIcon(i, 22)}${link(lang, i, title(lang, i))}`).join(', ');
  const brokers = events.filter(e => /^Brokers - (Stock Peddlers|Cornered Market|The Earpiece Incident 3)/.test(e.m_Name)).map(e => link(lang, e, title(lang, e)));
  const kaiju = quests.find(q => q.m_Name === 'Chain-Kaiju-Chicken-Stock');
  const price = [`<strong>${say(lang, page, 'crash label (gevent_economic_crash)', { 'pt-BR': 'Evento Global de crise', en: 'Crisis Global Event' })}:</strong> ${gameText(lang, 'gevent_economic_crash_started_body')}`];
  if (chaos && shock) {
    price.push(`<strong>${title(lang, chaos)}:</strong> ${spanLang(lang, tx(lang, chaos.FlavorTerm))}. ${say(lang, page, 'chaos cadence (MarketShockEachRoundTraitEffect)', {
      'pt-BR': `A cada ${shock.EveryNRounds} rodadas, por ${shock.Duration} rodadas.`,
      en: `Every ${shock.EveryNRounds} rounds, for ${shock.Duration} rounds.`,
    })}`);
  }
  const scoreMult = table('CoreData').find(c => c.m_Name === 'Stock Score').ScoringMultiplier;
  const profile = STOCK_PROFILES.find(p => p.tier === it.Tier);
  const calls = [
    callout(ui(lang, 'price'), `<p>${say(lang, page, 'stock profile (StocksManager.Initialize, ProgressStock, StockBehavior.CreateDefaults)', {
      'pt-BR': `O preço muda a cada rodada, com sorteio. Perfil desta ação: <strong>${profile.name['pt-BR']}</strong>. Numa rodada comum, ele anda cerca de ${profile.swing}% para cima ou para baixo: numa ação a ${number(lang, 300)}, algo como ${number(lang, 3 * profile.swing)}. ${profile.trend > 0 ? `Tende a subir um pouco (${signedPercent(lang, profile.trend)} por rodada).` : profile.trend < 0 ? `Tende a cair um pouco (${signedPercent(lang, profile.trend)} por rodada).` : 'Não tende nem a subir nem a cair.'} Nunca passa de ${profile.roof} vezes o preço-base nem cai abaixo de 20% dele.`,
      en: `The price changes every round, at random. This stock's profile: <strong>${profile.name.en}</strong>. In a normal round it moves about ${profile.swing}% up or down: on a stock at ${number(lang, 300)}, something like ${number(lang, 3 * profile.swing)}. ${profile.trend > 0 ? `It tends to rise a little (${signedPercent(lang, profile.trend)} per round).` : profile.trend < 0 ? `It tends to fall a little (${signedPercent(lang, profile.trend)} per round).` : 'It tends neither up nor down.'} It never goes above ${profile.roof} times the base price or below 20% of it.`,
    })} <a href="/${langDir(lang)}/guides/stocks/">${say(lang, page, 'link to guide', { 'pt-BR': 'Como a bolsa funciona', en: 'How the stock market works' })}</a></p><ul class="plain">${price.map(p => `<li>${p}</li>`).join('')}</ul>`),
    callout(ui(lang, 'careful'), `<p>${say(lang, page, 'no selling on purchase round (StocksManager.StockOnCooldownForPlayer)', {
      'pt-BR': 'Você não pode vender uma ação na mesma rodada em que comprou.',
      en: 'You cannot sell a stock in the same round you bought it.',
    })}</p>`),
    callout(ui(lang, 'score'), `<p>${gameText(lang, 'score_type_stocks')}: ${say(lang, page, 'score multiplier (CoreData Stock Score)', {
      'pt-BR': `ao vender com lucro, cada ${number(lang, 100)} de lucro viram ${number(lang, 100 * scoreMult)} pontos.`,
      en: `when you sell at a profit, every ${number(lang, 100)} of profit becomes ${number(lang, 100 * scoreMult)} points.`,
    })}</p>`),
    callout(ui(lang, 'cat12'), `<p>${siblings}</p>`),
  ];
  const related = [...brokers, ...(kaiju ? [link(lang, kaiju, title(lang, kaiju))] : [])];
  if (related.length) calls.push(callout(ui(lang, 'events'), `<p>${related.join(', ')}</p>`));
  return howBlock(lang, lead, calls);
}

const LOCATION_HINTS = [[/Academy/, 'hint_academy'], [/^Bank/, 'hint_bank'], [/Cluckers/, 'hint_cluckers'], [/Department Store/, 'hint_mall'], [/Grocery/, 'hint_moo_moo_mart'], [/Gym/, 'hint_gym'], [/Garden City/, 'hint_park'], [/Pawn/, 'hint_pawn_shop'], [/Town Hall/, 'hint_town_hall'], [/Vex Corp/, 'hint_vexcorp'], [/Clothing/, 'hint_clothing_shop'], [/Arcade/, 'hint_arcade'], [/Metro/, 'hint_metro'], [/Furniture/, 'hint_furniture_shop'], [/Electronics/, 'hint_electronics_shop'], [/Pet Store/, 'hint_pet_shop'], [/Fancy/, 'hint_home_fancy'], [/Medium/, 'hint_home_medium'], [/Poor/, 'hint_home_poor']];
const LOCATION_PURPOSE = [
  [/Academy/, { 'pt-BR': 'Aqui você faz cursos, e os diplomas são requisito para os empregos melhores. Também tem empregos próprios.', en: 'Take courses here; better jobs require degrees. It has its own jobs too.' }],
  [/^Bank/, { 'pt-BR': 'Aqui você guarda dinheiro no cofre e compra e vende ações. Os empregos daqui estão entre os que mais pagam.', en: 'This is where you keep money in the vault and trade stocks. Its jobs are among the best paid.' }],
  [/Cluckers/, { 'pt-BR': 'Comida rápida para repor Felicidade e Satisfação, e empregos sem exigência de curso nos primeiros níveis.', en: 'Fast food to restore Happiness and Fullness, plus jobs with no course requirements at the lower tiers.' }],
  [/Department Store/, { 'pt-BR': 'Reúne roupas, móveis e eletrônicos no mesmo prédio, além de empregos.', en: 'Clothes, furniture and electronics in one building, plus jobs.' }],
  [/Grocery/, { 'pt-BR': 'Compre comida para guardar em casa, bilhetes de loteria e outros itens do dia a dia.', en: 'Buy food to keep at home, lottery tickets and other everyday items.' }],
  [/Gym/, { 'pt-BR': 'O lugar de repor Saúde e Higiene, malhando e tomando banho.', en: 'The place to restore Health and Hygiene, by working out and showering.' }],
  [/Garden City/, { 'pt-BR': 'Atividades baratas ou de graça. Também é para onde você vai quando fica sem casa: morar aqui não tem aluguel.', en: 'Cheap or free activities. It is also where you end up if you have no home: living here is rent-free.' }],
  [/Pawn/, { 'pt-BR': 'Venda móveis e objetos por dinheiro rápido, ou compre o que outros jogadores penhoraram.', en: 'Sell furniture and objects for quick cash, or buy what other players pawned.' }],
  [/Town Hall/, { 'pt-BR': 'É aqui que você pega ou troca de emprego. Candidatar-se não gasta Tempo.', en: 'This is where you take or change jobs. Applying costs no Time.' }],
  [/Vex Corp/, { 'pt-BR': 'Sorteia missões em troca de Tempo e vende transportes: a pé cada quadra custa 20 de Tempo, e com Vexônibus, Via Vex e Croquet Vexwagen cai para cerca de 16, 14 e 11.', en: 'Hands out random quests for Time and sells transport: on foot each block costs 20 Time, and with the Vexbus, Vexway and Vexwagen it drops to about 16, 14 and 11.' }],
  [/Clothing/, { 'pt-BR': 'Vende as roupas que os empregos exigem.', en: 'Sells the clothes that jobs require.' }],
  [/Arcade/, { 'pt-BR': 'Jogos para ganhar pontos e tentar o recorde, além de empregos.', en: 'Games to score points and chase the record, plus jobs.' }],
  [/Metro/, { 'pt-BR': 'Liga as duas pontas de Chailand: você entra em uma estação e sai na outra.', en: 'Links the two ends of Chailand: you enter one station and come out at the other.' }],
  [/Furniture/, { 'pt-BR': 'Vende móveis para a casa, que aumentam o que você recupera em casa e liberam ações.', en: 'Sells furniture for your home, which improves what you recover at home and unlocks actions.' }],
  [/Electronics/, { 'pt-BR': 'Vende eletrodomésticos e eletrônicos, como o Computador pedido nos cursos avançados.', en: 'Sells appliances and electronics, such as the Computer that advanced courses require.' }],
  [/Pet Store/, { 'pt-BR': 'Compra de pets e da comida deles.', en: 'Buy pets and their food.' }],
  [/Resort/, { 'pt-BR': 'Atividades que dão Prestígio. Em Schnitzelland, os três com mais Prestígio ganham 400, 250 e 150 pontos no fim.', en: 'Activities that give Prestige. In Schnitzelland, the top three in Prestige get 400, 250 and 150 points at the end.' }],
  [/Home|Fancy|Medium|Poor/, { 'pt-BR': 'Uma moradia: é onde você dorme para encerrar o turno e coloca seus móveis.', en: 'A home: where you sleep to end your turn and place your furniture.' }],
];
const mapLevels = (RAW['MapEditor.MapLevel'] || []).filter(m => ['Calicornia', 'Chailand', 'schnitzelland-v3'].includes(m.m_Name));
const levelMapName = m => (m.m_Name === 'schnitzelland-v3' ? 'Schnitzelland' : m.m_Name);
// Straight-line neighbours from MapEditor.MapLevel.MapSlots; the game walks along roads, so this is only an ordering.
function gettingThere(lang, loc) {
  const perMap = [];
  // MapSlotData.LocationId is only the editor default: the building in slot i is MapLayoutData.LocationData[i] (BuildingManager.ApplyShuffle, EnvironmentManager.GetBaseLayout).
  for (const m of mapLevels) {
    const layout = table('MapLayoutData').find(lm => lm.m_Name.toLowerCase() === levelMapName(m).toLowerCase());
    const slots = (m.MapSlots || []).map((s, i) => { const r = layout && (layout.LocationData || [])[i]; return { pos: s.IsoPosition, l: r ? deref(r) : null }; }).filter(s => s.l);
    const here = slots.find(s => s.l._id === loc._id);
    if (!here) continue;
    const seen = new Set();
    const near = slots.filter(s => s !== here).map(s => ({ l: s.l, d: Math.hypot(s.pos.x - here.pos.x, s.pos.y - here.pos.y) })).filter(x => hasText(x.l)).sort((a, b) => a.d - b.d).filter(x => { const k = titleText(lang, x.l); if (seen.has(k)) return false; seen.add(k); return true; });
    if (near.length) perMap.push({ name: levelMapName(m), near: near.slice(0, 3).map(x => link(lang, x.l, title(lang, x.l))).join(', ') });
  }
  if (!perMap.length) return '';
  const shoes = table('ItemData').find(i => i.m_Name === 'Transport-Walking-Shoes');
  const step = shoes ? -sumAttr(shoes.Rewards, 'Time') : 0;
  const list = perMap.length > 1 ? perMap.map(p => `<strong>${esc(p.name)}:</strong> ${p.near}.`).join(' ') : `${perMap[0].near}.`;
  return `${say(lang, 'locations', 'nearest buildings (MapEditor.MapLevel.MapSlots)', { 'pt-BR': 'Prédios mais próximos:', en: 'Nearest buildings:' })} ${list}${step ? ` ${say(lang, 'locations', 'walking cost (Transport-Walking-Shoes)', { 'pt-BR': `A pé, cada quadra custa ${number(lang, step)} de Tempo.`, en: `On foot, each block costs ${number(lang, step)} Time.` })}` : ''}`;
}
// One-line purpose for the hub cards; long purposes fall back to the game's own line.
function purposeShort(lang, loc) {
  const p = LOCATION_PURPOSE.find(([re]) => re.test(loc.m_Name));
  if (!p) return '';
  const t = say(lang, 'locations', `purpose ${p[0].source}`, p[1]);
  return t && t.length <= 150 ? t : '';
}
// Best action for each attribute, compared only inside this location.
function bestDeals(lang, loc) {
  const all = (loc.Chambers || []).map(deref).filter(Boolean).flatMap(ch => (ch.Actions || []).map(deref)).filter(a => a && hasText(a) && !visibleEntries(a.RequiredItems).length);
  const lines = [];
  for (const n of WEAR_ATTRS) {
    const list = all.map(a => ({ a, gain: sumAttr(a.Rewards, n), time: -Math.min(0, sumAttr(a.Rewards, 'Time')), cash: -Math.min(0, sumAttr(a.Rewards, 'Cash')) })).filter(x => x.gain > 0 && x.time > 0);
    if (list.length < 2) continue;
    const perTime = list.slice().sort((x, y) => y.gain / y.time - x.gain / x.time)[0];
    const paid = list.filter(x => x.cash > 0).sort((x, y) => y.gain / y.cash - x.gain / x.cash)[0];
    const free = list.filter(x => !x.cash).sort((x, y) => y.gain - x.gain)[0];
    const cheap = free || paid;
    const lose = x => WEAR_ATTRS.filter(w => w !== n && sumAttr(x.a.Rewards, w) < 0).map(w => ({ w, v: -sumAttr(x.a.Rewards, w) }));
    const show = x => `${title(lang, x.a)} (+${number(lang, x.gain)} por ${number(lang, x.time)} de Tempo${x.cash ? ` e ${number(lang, x.cash)} de Dinheiro` : ''}${lose(x).length ? `, e tira ${lose(x).map(l => `${number(lang, l.v)} de ${plain(attrName(lang, l.w))}`).join(' e ')}` : ''})`;
    const showEn = x => `${title(lang, x.a)} (+${number(lang, x.gain)} for ${number(lang, x.time)} Time${x.cash ? ` and ${number(lang, x.cash)} Cash` : ''}${lose(x).length ? `, and takes ${lose(x).map(l => `${number(lang, l.v)} ${plain(attrName(lang, l.w))}`).join(' and ')}` : ''})`;
    lines.push(cheap === perTime || !cheap
      ? say(lang, 'locations', 'best deal one (ChamberActionData.Rewards)', { 'pt-BR': `<strong>${attrName(lang, n)}:</strong> o melhor é ${show(perTime)}.`, en: `<strong>${attrName(lang, n)}:</strong> the best is ${showEn(perTime)}.` })
      : say(lang, 'locations', 'best deal two (ChamberActionData.Rewards)', { 'pt-BR': `<strong>${attrName(lang, n)}:</strong> o que rende mais por Tempo é ${show(perTime)}; o que pesa menos no bolso é ${show(cheap)}.`, en: `<strong>${attrName(lang, n)}:</strong> the most per Time is ${showEn(perTime)}; the easiest on the wallet is ${showEn(cheap)}.` }));
  }
  return lines.length ? lines.map(l => `<p>${l}</p>`).join('') : '';
}
function explainLocation(lang, loc) {
  const hint = LOCATION_HINTS.find(([re]) => re.test(loc.m_Name));
  const maps = table('MapLayoutData').filter(m => (m.LocationData || []).some(x => x && x.id === loc._id)).map(m => m.m_Name);
  const calls = maps.length ? [callout(ui(lang, 'maps'), `<p>${maps.map(esc).join(', ')}</p>`)] : [];
  if (/Pawn/.test(loc.m_Name)) calls.unshift(callout(ui(lang, 'price'), `<p>${say(lang, 'pawn shop', 'prices (GetPawnRewardsForItem, SetDataForBuyingPawnedItems)', {
    'pt-BR': `Você recebe o valor de Venda do item. Quem compra um item penhorado paga o valor-base dele, que costuma ser maior. <a href="/${langDir(lang)}/guides/pawn-shop/">${ui(lang, 'learnMore')}${esc(moreLabel(lang, 'pawn-shop'))}</a>`,
    en: `You get the item's Sell value. Anyone buying a pawned item pays its base value, which is usually higher. <a href="/${langDir(lang)}/guides/pawn-shop/">${ui(lang, 'learnMore')}${esc(moreLabel(lang, 'pawn-shop'))}</a>`,
  })}</p>`));
  if (!maps.length && !hint && !/Home/.test(loc.m_Name)) calls.push(callout(ui(lang, 'maps'), `<p>${say(lang, 'locations', 'on no map (MapLayoutData)', { 'pt-BR': 'Este local existe nos dados, mas não aparece em nenhum dos mapas do jogo.', en: 'This location exists in the data, but does not appear on any of the game maps.' })}</p>`));
  const purpose = LOCATION_PURPOSE.find(([re]) => re.test(loc.m_Name));
  const lead = purpose ? say(lang, 'locations', `purpose ${purpose[0].source}`, purpose[1]) : hint ? plainHint(lang, hint[1]) : '';
  const route = gettingThere(lang, loc);
  if (route) calls.push(callout(say(lang, 'locations', 'label getting there', { 'pt-BR': 'Como chegar', en: 'Getting there' }), `<p>${route}</p>`));
  const metroMap = /Metro/.test(loc.m_Name) ? table('MapLayoutData').find(m => mapHas(m, loc)) : null;
  if (metroMap && metroMap.SlotPortalingCost) {
    const ticket = table('AttributeData').find(x => x.m_Name === 'Ticket Currency');
    const sellers = [...new Set(table('ChamberActionData').filter(a => hasText(a) && sumAttr(a.Rewards, 'Ticket Currency') > 0 || (a.WeightedRewards || []).some(w => collectEntries([w.Reward]).some(e => e.Id === ticket.Id && e.Value > 0))).flatMap(a => actionHome.get(a._id) || []))];
    calls.push(callout(ui(lang, 'price'), `<p>${say(lang, 'locations', 'metro ride (SlotPortalingCost, Ticket Currency SubtractsValueOnActions 0, AccumulativeValue -1)', { 'pt-BR': `Cada viagem custa ${number(lang, -sumAttr(metroMap.SlotPortalingCost, 'Time'))} de Tempo e exige ter pelo menos 1 bilhete. A viagem não gasta o bilhete: cada bilhete vale 1 rodada de acesso, e o saldo cai 1 por rodada.`, en: `Each ride costs ${number(lang, -sumAttr(metroMap.SlotPortalingCost, 'Time'))} Time and needs at least 1 ticket. The ride does not use up the ticket: each ticket is 1 round of access, and your balance drops by 1 per round.` })} ${sellers.length ? say(lang, 'locations', 'tickets sold at (Ticket Currency rewards)', { 'pt-BR': `Bilhetes e passes: ${placesOf(lang, sellers)}.`, en: `Tickets and passes: ${placesOf(lang, sellers)}.` }) : ''}</p>`));
  }
  const isHome = /Home/.test(loc.m_Name);
  const deals = isHome ? '' : bestDeals(lang, loc);
  const dealsLead = deals ? `<p>${say(lang, 'locations', 'worth lead (ValueTriggerData Attribute Score)', { 'pt-BR': `Felicidade, Saúde e Higiene rendem pontos no fim de cada turno a partir de 500 (veja <a href="/${langDir(lang)}/guides/attributes/">${esc(moreLabel(lang, 'attributes').replace(/^: /, '') || 'Atributos')}</a>). Aqui, o que mais sobe cada uma por Tempo:`, en: `Happiness, Health and Hygiene earn points at the end of every turn at 500 or more (see <a href="/${langDir(lang)}/guides/attributes/">${esc(moreLabel(lang, 'attributes').replace(/^: /, '') || 'Attributes')}</a>). Here is what raises each one the most per Time:` })}</p>` : '';
  const worthHtml = LOC.worthPoints(lang, loc) + dealsLead + deals + LOC.worthExtra(lang, loc);
  if (worthHtml) calls.push(callout(say(lang, 'locations', 'label worth it', { 'pt-BR': 'Vale a pena?', en: 'Is it worth it?' }), worthHtml));
  if (isHome) calls.push(LOC.homeNote(lang, loc));
  return lead || calls.length ? howBlock(lang, lead, calls, isHome ? 'housing' : /Metro/.test(loc.m_Name) ? 'maps' : null) : '';
}

// Real objective of each Mystic sign quest (Quest.references $type and Count).
const MYSTIC_OBJECTIVES = {
  Aries: { 'pt-BR': 'Para cumprir: trabalhe 5 vezes.', en: 'To complete: work 5 times.' },
  Taurus: { 'pt-BR': 'Para cumprir: durma, faça ioga, use a massagem, a banheira ou faça beiço.', en: 'To complete: sleep, do yoga, use the massage chair or jacuzzi, or sulk.' },
  Gemini: { 'pt-BR': 'Para cumprir: faça uma atividade do Parque.', en: 'To complete: do a Park activity.' },
  Cancer: { 'pt-BR': 'Para cumprir: malhe ou faça ioga na Academia.', en: 'To complete: work out or do yoga at the Gym.' },
  Leo: { 'pt-BR': 'Para cumprir: estude 1 vez.', en: 'To complete: study once.' },
  Virgo: { 'pt-BR': 'Para cumprir: compre um bilhete de loteria.', en: 'To complete: buy a lottery ticket.' },
  Libra: { 'pt-BR': 'Para cumprir: compre qualquer móvel.', en: 'To complete: buy any piece of furniture.' },
  Scorpio: { 'pt-BR': 'Para cumprir: ande até somar 25 de distância.', en: 'To complete: walk 25 distance.' },
  Sagittarius: { 'pt-BR': 'Para cumprir: conclua uma Missão da Vexcorp.', en: 'To complete: finish a Vexcorp quest.' },
  Capricorn: { 'pt-BR': 'Para cumprir: durma ou relaxe.', en: 'To complete: sleep or relax.' },
  Aquarius: { 'pt-BR': 'Para cumprir: lave as mãos ou tome banho.', en: 'To complete: wash your hands or bathe.' },
  Pisces: { 'pt-BR': 'Para cumprir: pesque.', en: 'To complete: go fishing.' },
};
// Sign bonuses read from the Mystic-* trait effect assets.
const MYSTIC_BONUS = {
  Taurus: { 'pt-BR': 'Dormir rende o dobro. Ioga, massagem, banheira e beiço reduzem o dobro de Estresse.', en: 'Sleep gives double. Yoga, massage, jacuzzi and sulking lower double Stress.' },
  Gemini: { 'pt-BR': 'Atividades do Parque dão 50% mais Saúde, Felicidade e Higiene.', en: 'Park activities give 50% more Health, Happiness and Hygiene.' },
  Cancer: { 'pt-BR': 'Malhar e ioga dão 50% mais Saúde e Felicidade.', en: 'Working out and yoga give 50% more Health and Happiness.' },
  Virgo: { 'pt-BR': '+9% de chance na loteria.', en: '+9% lottery chance.' },
  Scorpio: { 'pt-BR': 'Andar gasta 30% menos Tempo.', en: 'Walking costs 30% less Time.' },
  Sagittarius: { 'pt-BR': 'As Missões pagam o dobro de Dinheiro.', en: 'Quests pay double Cash.' },
  Capricorn: { 'pt-BR': 'Relaxar e dormir rendem 50% mais.', en: 'Relax and sleep give 50% more.' },
  Aquarius: { 'pt-BR': 'Cada ponto de Higiene ganho também dá meio ponto de Felicidade.', en: 'Each Hygiene point gained also gives half a Happiness point.' },
};
// ResourceType 70 (Quest): an action whose reward starts the quest. ResourceType 95 (Score): points with no target id.
const questStarters = new Map();
for (const a of table('ChamberActionData')) for (const e of a.Rewards.RewardEntries) if (e.Type === 70) {
  if (!questStarters.has(e.Id)) questStarters.set(e.Id, []);
  questStarters.get(e.Id).push(a);
}
// Quest boards are rooms no location lists; the game text places them (tut_vex, chamber_vexcorp_quests, quest_complete_vex_obj).
const vexDraws = ['Easy', 'Medium', 'Hard'].map(key => ({ key, action: table('ChamberActionData').find(a => a.m_Name === `Get ${key} Vexcorp Quest`) })).filter(x => x.action);
function boardOf(q) {
  const direct = new Set((questStarters.get(q.Id) || []).map(a => a.Id));
  for (const { key, action } of vexDraws) for (const w of action.WeightedRewards || []) for (const e of collectEntries([w.Reward])) if ((e.Type === 70 && e.Id === q.Id) || (e.Type === 31 && direct.has(e.Id))) return { key, action };
  return null;
}
// Sum of the Time and Cash the quest's own actions cost, walking not included.
const WEAR_ATTRS = ['Happy', 'Health', 'Hygiene'];
function addAttrs(net, entries, times = 1) {
  for (const e of entries || []) { const n = (byId.get(e.Id) || {}).m_Name; if (e.Type === ATTRIBUTE && [...WEAR_ATTRS, 'Stress'].includes(n)) net.set(n, (net.get(n) || 0) + e.Value * times); }
}
const MISS = require('./explicacoes/missoes.js')({ say: (...a) => say(...a), deref: (...a) => deref(...a), link: (...a) => link(...a), title: (...a) => title(...a), titleText: (...a) => titleText(...a), hasText: (...a) => hasText(...a), plain: (...a) => plain(...a), esc: (...a) => esc(...a), stepsOf: (...a) => stepsOf(...a), tagSources: () => tagSources });
const MCUSTO = require('./explicacoes/missoes-custo.js')({ say: (...a) => say(...a), deref: (...a) => deref(...a), byId, table: (...a) => table(...a), sumAttr: (...a) => sumAttr(...a), addAttrs, number: (...a) => number(...a), stepsOf: (...a) => stepsOf(...a), actionHome: () => actionHome, actionWhere: (...a) => actionWhere(...a), link: (...a) => link(...a), title: (...a) => title(...a), titleText: (...a) => titleText(...a), plain: (...a) => plain(...a), esc: (...a) => esc(...a), place: (...a) => place(...a), langDir: (...a) => langDir(...a), roles: () => roles, locations: () => locations });
function questEffort(q) {
  const e = MCUSTO.effort(q);
  e.cash += MISS.spentCash(stepsOf(q));
  return e;
}
const JOB_RATE = (() => {
  const rates = jobs.map(j => { const c = sumAttr(j.Rewards, 'Cash'), time = -sumAttr(j.Rewards, 'Time'); return c > 0 && time > 0 ? c / time * 100 : null; }).filter(x => x !== null).sort((a, b) => a - b);
  return rates.length ? Math.round(rates[rates.length >> 1]) : 0;
})();
const JOB_WEAR = (() => {
  const rates = jobs.map(j => { const time = -sumAttr(j.Rewards, 'Time'); return time > 0 && sumAttr(j.Rewards, 'Cash') > 0 ? WEAR_ATTRS.reduce((sum, n) => sum - Math.min(0, sumAttr(j.Rewards, n)), 0) / time * 100 : null; }).filter(x => x !== null).sort((a, b) => a - b);
  return rates.length ? Math.round(rates[rates.length >> 1]) : 0;
})();
// Points per 100 Time: the median among quests, and what leveling up by working pays (ExperiencePointData.Score).
const questPoints = q => stepsOf(q).reduce((sum, s) => sum + collectEntries([s.Rewards]).filter(e => e.Type === 95).reduce((n, e) => n + e.Value, 0), 0) + MCUSTO.coursePoints(q);
function questTime(q) {
  const starts = (questStarters.get(q.Id) || []).filter(a => actionWhere(a).length);
  const fee = boardOf(q) ? -Math.min(0, sumAttr(boardOf(q).action.Rewards, 'Time')) : starts.length ? -Math.min(0, sumAttr(starts[0].Rewards, 'Time')) : 0;
  return questEffort(q).time + fee;
}
const medianOf = list => (list.length ? list.slice().sort((a, b) => a - b)[list.length >> 1] : 0);
let missionRateCache = null, workPointsCache = null;
function missionRate() {
  if (missionRateCache === null) missionRateCache = Math.round(medianOf(quests.map(q => ({ p: questPoints(q), t: questTime(q) })).filter(x => x.p > 0 && x.t > 0).map(x => x.p / x.t * 100)));
  return missionRateCache;
}
// Points per 100 Time from the next Work XP level, for a job at its own level; 0 at the top.
function jobLevelPoints(j) {
  const levels = table('ExperiencePointData');
  const here = levels.find(x => x.Level === jobRank(j)), up = levels.find(x => x.Level === jobRank(j) + 1);
  const gain = sumAttr(j.Rewards, 'Experience'), time = -sumAttr(j.Rewards, 'Time');
  if (!here || !up || gain <= 0 || time <= 0) return 0;
  return up.Score / (Math.ceil((up.Xp - here.Xp) / gain) * time) * 100;
}
function workPoints() {
  if (workPointsCache === null) workPointsCache = Math.round(medianOf(payingJobs().filter(j => !jobImpossible(j)).map(jobLevelPoints).filter(x => x > 0)));
  return workPointsCache;
}
function explainQuest(lang, q) {
  const total = new Map();
  let points = MCUSTO.coursePoints(q);
  for (const s of stepsOf(q)) for (const e of collectEntries([s.Rewards])) {
    if (e.Type === 95) { points += e.Value; continue; }
    const seen = total.get(e.Id);
    if (seen) seen.Value += e.Value; else total.set(e.Id, { ...e });
  }
  const page = 'quests';
  const calls = [];
  const starts = (questStarters.get(q.Id) || []).filter(a => actionWhere(a).length);
  const kaiju = starts.some(a => /^Get Event Quest/.test(a.m_Name));
  const advTier = [['Easy', { 'pt-BR': 'fáceis', en: 'easy' }], ['Medium', { 'pt-BR': 'médias', en: 'medium' }], ['Hard', { 'pt-BR': 'difíceis', en: 'hard' }]].find(([k]) => (table('ChamberActionData').find(a => a.m_Name === `Adventurer Quest ${k}`) || { WeightedRewards: [] }).WeightedRewards.some(w => collectEntries([w.Reward]).some(e => e.Type === 70 && e.Id === q.Id)));
  const role = roles.find(r => deref(r.RoleQuestChain) === q);
  const startLabel = say(lang, page, 'label start', { 'pt-BR': 'Como começar', en: 'How to start' });
  let unknownStart = false;
  if (starts.length) {
    const cost = effects(lang, starts[0].Rewards.RewardEntries.filter(e => e.Type !== 70));
    calls.push(callout(startLabel, `<p>${say(lang, page, 'started by an action (ResourceType.Quest)', { 'pt-BR': `Aceite a Missão ${MISS.placesIn(lang, starts.flatMap(a => actionWhere(a)))}.`, en: `Accept the quest at: ${placesOf(lang, starts.flatMap(a => actionWhere(a)))}.` })}${kaiju ? ` ${MCUSTO.kaijuStart(lang)}` : ''}</p>${cost}`));
  } else if (boardOf(q)) {
    const b = boardOf(q);
    const fee = effects(lang, b.action.Rewards.RewardEntries.filter(e => e.Type !== 70));
    calls.push(callout(startLabel, `<p>${MCUSTO.boardText(lang, q, b, placeIn)}</p>${fee}`));
  } else if (advTier) {
    const adv = roles.find(r => /adventurer/i.test(`${r.m_Name} ${r.Term || ''}`));
    calls.push(callout(startLabel, `<p>${say(lang, page, 'adventurer pool (Adventurer Quest actions, WeightedRewards)', { 'pt-BR': `É uma das Missões ${advTier[1]['pt-BR']} que o papel ${link(lang, adv, title(lang, adv))} recebe a cada 3 rodadas.`, en: `It is one of the ${advTier[1].en} quests the ${link(lang, adv, title(lang, adv))} role gets every 3 rounds.` })}</p>`));
  } else if (role) {
    calls.push(callout(startLabel, `<p>${say(lang, page, 'role chain (RoleQuestChain)', { 'pt-BR': `É a sequência de Missões do papel ${link(lang, role, title(lang, role))}.`, en: `This is the quest line of the ${link(lang, role, title(lang, role))} role.` })}</p>`));
  } else {
    const owner = pointersTo(q).map(p => /^(Cultist|Mystic|Adventurer|Hoarder|Hacker|Drifter|Scavenger|Senior|Workaholic|Artist|Angler)$/.test(p.cls) ? roles.find(r => r._id === p.r._id) : null).find(Boolean);
    unknownStart = !owner;
    if (owner) calls.push(callout(startLabel, `<p>${say(lang, page, 'role only (role asset points at this quest)', { 'pt-BR': `Só aparece para o papel ${link(lang, owner, title(lang, owner))}.`, en: `Only appears for the ${link(lang, owner, title(lang, owner))} role.` })}</p>`));
    else calls.push(callout(startLabel, `<p>${MCUSTO.unknownStart(lang)}</p>`));
  }
  const sign = /^Quest-Mystic-([A-Z][a-z]+)$/.exec(q.m_Name);
  if (sign) {
    const key = `trait_role_mystic_${sign[1].toLowerCase()}_flavor`;
    const asks = MYSTIC_OBJECTIVES[sign[1]];
    calls.unshift(callout(say(lang, page, 'label sign', { 'pt-BR': 'Signo', en: 'Sign' }), `<p>${MISS.signLead(lang, sign[1])}${TEXT.en.has(key) ? gameText(lang, key) : ''}${asks ? ` ${say(lang, page, `mystic asks ${sign[1]} (Quest objective type)`, asks)}` : ''} ${say(lang, page, 'mystic destiny gives no points (Quest-Mystic-<sign>.Rewards empty, RoleMysticFulfillDestinyQuestObjective)', { 'pt-BR': 'Cumprir um destino não dá pontos por si: só conta para as Missões do papel.', en: 'Fulfilling a destiny gives no points by itself: it only counts toward the role quests.' })}</p>`));
  }
  const fx = effects(lang, [...total.values()]);
  if (fx) calls.push(callout(stepsOf(q).length > 1 ? say(lang, page, 'label total rewards', { 'pt-BR': 'Recompensa somando as etapas', en: 'Rewards across all steps' }) : ui(lang, 'rewards'), fx));
  const onlyMaps = MCUSTO.mapsLine(lang, q);
  if (onlyMaps) calls.push(callout(ui(lang, 'maps'), `<p>${onlyMaps}</p>`));
  if (points) calls.push(callout(ui(lang, 'score'), `<p>${formatValue(lang, points)}</p>`));
  const effort = questEffort(q);
  const gapGroups = MISS.gaps(stepsOf(q), MCUSTO.knownObjective);
  const gp = gapGroups.length ? { 'pt-BR': ' contado', en: ' counted' } : { 'pt-BR': '', en: '' };
  const fee = boardOf(q) ? -Math.min(0, sumAttr(boardOf(q).action.Rewards, 'Time')) : starts.length ? -Math.min(0, sumAttr(starts[0].Rewards, 'Time')) : 0;
  const spent = effort.time + fee;
  const cashEntry = [...total.values()].find(e => (byId.get(e.Id) || {}).m_Name === 'Cash');
  const paid = (cashEntry ? cashEntry.Value : 0) - effort.cash;
  const entryAction = boardOf(q) ? boardOf(q).action : starts[0];
  if (entryAction) addAttrs(effort.net, (entryAction.Rewards || {}).RewardEntries);
  const lost = WEAR_ATTRS.map(n => [n, -Math.min(0, effort.net.get(n) || 0)]).filter(([, v]) => v > 0);
  const stressUp = Math.max(0, effort.net.get('Stress') || 0);
  const wear = lost.reduce((sum, [, v]) => sum + v, 0);
  const heavyItems = MCUSTO.heavyNote(lang, q);
  if (heavyItems) calls.push(callout(say(lang, page, 'label heavy item', { 'pt-BR': 'Item pesado', en: 'Heavy item' }), `<p>${heavyItems}</p>`));
  const noWorth = /^Quest-Mystic-/.test(q.m_Name) || (unknownStart && !fx && !points);
  if ((spent || wear || stressUp) && !noWorth) {
    const bits = l => [...lost.map(([n, v]) => `${number(l, v)} de ${attrName(l, n)}`), ...(stressUp ? [`${number(l, stressUp)} de ${attrName(l, 'Stress')}`] : [])];
    const billText = l => { const b = bits(l); return b.length > 1 ? `${b.slice(0, -1).join(', ')} ${l === 'en' ? 'and' : 'e'} ${b[b.length - 1]}` : b[0]; };
    const parts = [];
    if (spent) parts.push(say(lang, page, 'quest effort (accept action plus objective actions, without walking)', { 'pt-BR': `Aceitar e cumprir gasta ${number(lang, spent)} de Tempo${effort.cash ? ` e ${number(lang, effort.cash)} de Dinheiro` : ''}, sem contar o caminho.`, en: `Accepting and finishing it spends ${number(lang, spent)} Time${effort.cash ? ` and ${number(lang, effort.cash)} Cash` : ''}, not counting walking.` }));
    if (spent && gapGroups.length) parts.push(MISS.gapSentence(lang, gapGroups));
    parts.push(...MCUSTO.billNotes(lang, q, effort));
    if (spent && unknownStart) parts.push(MCUSTO.unknownFee(lang));
    if (wear || stressUp) parts.push(say(lang, page, 'quest attribute bill (net of objective actions, accept action and step rewards)', { 'pt-BR': `No total, ainda cobra ${billText('pt-BR')}.`, en: `In total it also costs ${billText('en')}.` }));
    const gained = MCUSTO.gainNote(lang, effort.net, WEAR_ATTRS, attrName);
    if (gained) parts.push(gained);
    const rate = spent ? Math.round(paid / spent * 100) : 0;
    const wearRate = spent ? Math.round(wear / spent * 100) : 0;
    const heavy = wear > 0 && (!spent || wearRate > JOB_WEAR);
    const median = { 'pt-BR': `O emprego mediano do jogo paga ${number(lang, JOB_RATE)} a cada 100 de Tempo no salário-base`, en: `The game's median job pays ${number(lang, JOB_RATE)} per 100 Time in base salary` };
    const wearCompare = { 'pt-BR': `A Missão tira ${number(lang, wearRate)} em Felicidade, Saúde e Higiene a cada 100 de Tempo; um emprego mediano tira ${number(lang, JOB_WEAR)}`, en: `The quest takes ${number(lang, wearRate)} of Happiness, Health and Hygiene per 100 Time; a median job takes ${number(lang, JOB_WEAR)}` };
    const ptsRate = spent && points ? Math.round(points / spent * 100) : 0;
    if (points) parts.push(spent
      ? say(lang, page, 'quest points per 100 Time (Type 95, median of quests, ExperiencePointData.Score)', { 'pt-BR': `Soma ${number(lang, points)} pontos na pontuação final, que é o que decide a partida: ${number(lang, ptsRate)} a cada 100 de Tempo${gp['pt-BR']}. A missão mediana dá ${number(lang, missionRate())}, e subir de nível trabalhando dá cerca de ${number(lang, workPoints())}.`, en: `It adds ${number(lang, points)} points to the final score, which is what decides the game: ${number(lang, ptsRate)} per 100 Time${gp.en}. The median quest gives ${number(lang, missionRate())}, and leveling up by working gives about ${number(lang, workPoints())}.` })
      : say(lang, page, 'quest points (Type 95 sum)', { 'pt-BR': `Soma ${number(lang, points)} pontos na pontuação final.`, en: `It adds ${number(lang, points)} points to the final score.` }));
    if (spent && paid > 0) parts.push(say(lang, page, 'quest cash per 100 Time', { 'pt-BR': `Rende ${number(lang, rate)} de Dinheiro a cada 100 de Tempo${gp['pt-BR']}. ${median['pt-BR']}.`, en: `It earns ${number(lang, rate)} Cash per 100 Time${gp.en}. ${median.en}.` }));
    if (cashEntry && effort.cash > 0 && paid <= 0) parts.push(MISS.cashLoss(lang, effort.cash, cashEntry.Value, number));
    if (spent && heavy) parts.push(say(lang, page, 'quest wear above median job (Happy, Health, Hygiene per 100 Time, JobData.Rewards median)', { 'pt-BR': `${wearCompare['pt-BR']}.`, en: `${wearCompare.en}.` }));
    const heavyNote = { 'pt-BR': 'Felicidade, Saúde e Higiene abaixo de 500 deixam de pontuar a cada turno, então só faça se conseguir repor o que perde.', en: 'Happiness, Health and Hygiene below 500 stop scoring each turn, so only do it if you can restore what you lose.' };
    const reason = points && spent ? (ptsRate > missionRate() ? 'points-good' : ptsRate === missionRate() ? 'points-avg' : ptsRate >= workPoints() ? 'points-mid' : 'points-low') : paid <= 0 ? 'none' : rate < JOB_RATE ? 'low' : heavy ? 'heavy' : 'good';
    const verdict = {
      'points-good': heavy ? { 'pt-BR': `Os pontos estão acima da média, mas o custo em atributos é pesado. ${heavyNote['pt-BR']}`, en: `Its points are above average, but the attribute cost is heavy. ${heavyNote.en}` } : { 'pt-BR': 'Vale a pena: rende pontos acima da média sem cobrar mais atributos que um emprego.', en: 'Worth it: above-average points without costing more attributes than a job.' },
      'points-avg': heavy ? { 'pt-BR': `Rende pontos na média das Missões, mas o custo em atributos é pesado. ${heavyNote['pt-BR']}`, en: `Its points are about average for a quest, but the attribute cost is heavy. ${heavyNote.en}` } : { 'pt-BR': 'Rende pontos na média das Missões, sem cobrar mais atributos que um emprego.', en: 'Its points are about average for a quest, without costing more attributes than a job.' },
      'points-mid': heavy ? { 'pt-BR': `Rende menos pontos que a missão mediana e o custo em atributos é pesado. ${heavyNote['pt-BR']}`, en: `It gives fewer points than the median quest and the attribute cost is heavy. ${heavyNote.en}` } : { 'pt-BR': 'Rende menos pontos que a missão mediana, mas pelo menos o mesmo que subir de nível trabalhando.', en: 'It gives fewer points than the median quest, but at least as many as leveling up by working.' },
      'points-low': heavy ? { 'pt-BR': `Rende poucos pontos pelo Tempo e o custo em atributos é pesado: deixe para quando não houver opção melhor. ${heavyNote['pt-BR']}`, en: `It gives few points for the Time and the attribute cost is heavy: leave it until there is nothing better. ${heavyNote.en}` } : { 'pt-BR': 'Rende poucos pontos pelo Tempo: só compensa se você precisar das outras recompensas.', en: 'It gives few points for the Time: only worth it if you need the other rewards.' },
      none: heavy ? { 'pt-BR': 'Não dá pontos nem lucro em Dinheiro e o custo em atributos é pesado: só faça pelas recompensas, e com os atributos altos.', en: 'It gives no points or Cash profit and the attribute cost is heavy: only do it for the rewards, and with high attributes.' } : { 'pt-BR': 'Não dá pontos nem lucro em Dinheiro: só compensa pelas recompensas.', en: 'It gives no points or Cash profit: it only pays off through its rewards.' },
      low: heavy ? { 'pt-BR': 'Não dá pontos, paga menos e cobra mais que esse emprego: só compensa pelas outras recompensas.', en: 'It gives no points, pays less and costs more than that job: it only pays off through its other rewards.' } : { 'pt-BR': 'Não dá pontos e paga menos que esse emprego: só compensa pelas outras recompensas.', en: 'It gives no points and pays less than that job: it only pays off through its other rewards.' },
      heavy: { 'pt-BR': 'Não dá pontos e, embora pague mais, o custo em atributos é pesado: só vale se você tiver como repor o que perde.', en: 'It gives no points and, although it pays more, the attribute cost is heavy: only worth it if you can restore what you lose.' },
      good: { 'pt-BR': 'Não dá pontos, mas é Dinheiro melhor que esse emprego sem cobrar mais atributos.', en: 'It gives no points, but it is better Cash than that job without costing more attributes.' },
    }[reason];
    if (spent || heavy) parts.push(say(lang, page, `quest verdict ${reason}${heavy ? ' heavy' : ''} (points first; attribute score bands)`, MISS.verdictFor(lang, verdict, { reason, heavy, gapGroups, heavyNote, bare: !fx && !points, loss: points && paid < 0 ? MCUSTO.lossTail(paid) : null, special: !fx && !points && MCUSTO.isBidding(q) && roles.find(r => /^cultist$/i.test(r.m_Name)) ? MCUSTO.biddingVerdict(link(lang, roles.find(r => /^cultist$/i.test(r.m_Name)), title(lang, roles.find(r => /^cultist$/i.test(r.m_Name)))), heavy) : !fx && !points && kaiju ? MCUSTO.kaijuVerdict : spent && reason === 'points-good' && MCUSTO.ringOf(q) ? MCUSTO.ringVerdict(lang, MCUSTO.ringOf(q), spent, wear, JOB_WEAR) : null, roleLink: /Cultist-Ritual/.test(q.m_Name) && roles.find(r => /^cultist$/i.test(r.m_Name)) ? link(lang, roles.find(r => /^cultist$/i.test(r.m_Name)), title(lang, roles.find(r => /^cultist$/i.test(r.m_Name)))) : '' })));
    calls.push(callout(say(lang, page, 'label worth it', { 'pt-BR': 'Vale a pena?', en: 'Is it worth it?' }), `<p>${parts.join(' ')}</p>`));
  } else if (role && points) calls.push(callout(say(lang, page, 'label worth it', { 'pt-BR': 'Vale a pena?', en: 'Is it worth it?' }), `<p>${MCUSTO.roleNote(lang, role, stepsOf(q).length, points)}</p>`));
  return calls.length ? howBlock(lang, '', calls) : '';
}

// Story tags tell which item, job, home or role makes an event possible.
const tagSources = new Map();
function addTags(rewards, rec) {
  for (const t of (rewards && rewards.StoryTags) || []) {
    if (!tagSources.has(t.Name)) tagSources.set(t.Name, []);
    tagSources.get(t.Name).push(rec);
  }
}
for (const i of items) addTags(i.Rewards, i);
for (const j of jobs) addTags(j.RewardsWhileJobHeld, j);
for (const h of table('HomeData')) addTags(h.RewardsWhileLivingHere, h);
for (const r of roles) addTags(r.StartingReward, r);
// Operator 4 means the tag is needed, 5 means having it keeps the event away (barry_repellant), 1 tracks story steps.
// Types.RelationalOperatorType in the game code: 1 Equal, 4 GreaterThanOrEqual, 5 LessThan.
const conditionPhrase = (lang, r) => {
  const name = link(lang, r, title(lang, r));
  const kinds = {
    roles: { 'pt-BR': `Você tem o papel ${name}`, en: `You have the ${name} role` },
    jobs: { 'pt-BR': `Você trabalha como ${name}`, en: `You work as ${name}` },
    items: { 'pt-BR': `Você tem ${name}`, en: `You own ${name}` },
    undefined: { 'pt-BR': `Você mora em ${name}`, en: `You live in ${name}` },
  };
  return say(lang, 'events', `condition phrase ${r._kind}`, kinds[r._kind]);
};
function eventTags(lang, e, operators) {
  return (e.TagRequirements || []).filter(t => !t.Negate && operators.includes(t.Operator)).flatMap(t => (tagSources.get(t.Name) || []).slice(0, 4))
    .filter((r, i, all) => hasText(r) && all.indexOf(r) === i).map(r => conditionPhrase(lang, r));
}
// Cadeias de história, comparação das escolhas e o bloco "quando sai": tools/explicacoes/eventos.js.
const EV = require('./explicacoes/eventos.js')({ say: (...a) => say(...a), events: () => events, tx: (...a) => tx(...a), spanLang: (...a) => spanLang(...a), plain: (...a) => plain(...a), link: (...a) => link(...a), title: (...a) => title(...a), titleText: (...a) => titleText(...a), esc: (...a) => esc(...a), number: (...a) => number(...a), formatValue: (...a) => formatValue(...a), effectLabel: (...a) => effectLabel(...a), visibleEntries: (...a) => visibleEntries(...a), byId, ITEM, ATTRIBUTE, conditions: (...a) => MISS.conditions(...a), guideLink: (lang, slug, label) => `<a href="/${langDir(lang)}/guides/${slug}/">${label}</a>` });
// A choice that drains an attribute locked at 0 can block later actions (AttributeData.ZeroLocked).
function zeroWarning(lang, e) {
  const ids = new Set();
  for (const c of e.Choices || []) for (const r of visibleEntries((c.Rewards || {}).RewardEntries)) if (r.Value < 0 && ['Happy', 'Health', 'Hygiene'].includes((byId.get(r.Id) || {}).m_Name)) ids.add(r.Id);
  if (!ids.size) return '';
  const names = l => [...ids].map(id => effectLabel(l, { Id: id, Type: ATTRIBUTE }));
  const list = (l, word) => { const n = names(l); return n.length > 1 ? `${n.slice(0, -1).join(', ')} ${word} ${n[n.length - 1]}` : n[0]; };
  return say(lang, 'events', 'zero locked attribute (AttributeData.ZeroLocked, PlayerState.CanAffordModifier)', ids.size > 1 ? { 'pt-BR': `Olhe sua ${list('pt-BR', 'e')} antes de decidir: quando um desses atributos chega a 0, as ações que gastam dele ficam bloqueadas.`, en: `Check your ${list('en', 'and')} before you choose: at 0, actions that spend that attribute are blocked.` } : { 'pt-BR': `Olhe sua ${list('pt-BR', 'e')} antes de decidir: quando esse atributo chega a 0, as ações que gastam dele ficam bloqueadas.`, en: `Check your ${list('en', 'and')} before you choose: at 0, actions that spend it are blocked.` });
}
const eventConditions = (lang, e) => MISS.conditions(lang, e, [4]);
const eventBlockers = (lang, e) => MISS.conditions(lang, e, [5]);

// A job can be listed by several locations (LocationData.Jobs); JobData.Location names only one of them.
const placesCache = new Map(), mapsCache = new Map();
const jobPlaces = j => { if (!placesCache.has(j)) placesCache.set(j, [...new Set([deref(j.Location), ...table('LocationData').filter(l => (l.Jobs || []).some(r => r.id === j._id))].filter(Boolean))]); return placesCache.get(j); };
const jobMapList = j => { if (!mapsCache.has(j)) mapsCache.set(j, table('MapLayoutData').filter(m => jobPlaces(j).some(p => mapHas(m, p)))); return mapsCache.get(j); };
const TOP_OUTFIT = Math.max(...items.filter(i => i.ItemSubGroup === 5).map(i => i.Tier));
// LocationPanel.SetChamberDataForJobs lists only jobs whose JobLevel equals the tab, and the tabs are 0 to 6.
const jobUnlisted = j => j.JobLevel > 6;
const jobImpossible = j => j.RequiredEquippedItemTier > TOP_OUTFIT || jobUnlisted(j);
const startingGear = new Set(((table('RealmData')[0] || {}).StartingEquipment || []).map(r => r.id));
const jobCourses = j => (j.KnowledgeRequirements || []).reduce((sum, k) => sum + k.Value, 0);
const jobExp = j => sumAttr(j.Rewards, 'Experience');
const payingJobs = () => jobs.filter(x => !artistJobs.has(x._id) && sumAttr(x.Rewards, 'Cash') > 0);
// Compares only Cash and Work XP among jobs; a perk can still change the choice, and the text says so.
function jobWorth(lang, j) {
  const page = j.m_Name;
  const cash = sumAttr(j.Rewards, 'Cash');
  if (j.RequiredEquippedItemTier > TOP_OUTFIT) return EMP.impossibleWorth(lang, j);
  if (cash <= 0 || !sumAttr(j.Rewards, 'Time')) return '';
  const wear = WEAR_ATTRS.reduce((sum, n) => sum - Math.min(0, sumAttr(j.Rewards, n)), 0);
  const peers = payingJobs().filter(x => jobRank(x) === jobRank(j) && !jobImpossible(x));
  const position = 1 + peers.filter(x => sumAttr(x.Rewards, 'Cash') > cash).length;
  const mine = jobMapList(j).map(m => m._id);
  const better = jobUnlisted(j) ? null : payingJobs().filter(x => x !== j && !jobImpossible(x)
    && jobRank(x) <= jobRank(j) && x.RequiredEquippedItemTier <= j.RequiredEquippedItemTier && jobCourses(x) <= jobCourses(j)
    && mine.every(id => jobMapList(x).some(m => m._id === id))
    && ((sumAttr(x.Rewards, 'Cash') > cash && jobExp(x) >= jobExp(j)) || (sumAttr(x.Rewards, 'Cash') >= cash && jobExp(x) > jobExp(j))))
    .sort((a, b) => sumAttr(b.Rewards, 'Cash') - sumAttr(a.Rewards, 'Cash'))[0];
  const lvlRaw = jobLevelPoints(j), lvlPts = lvlRaw >= 10 ? Math.round(lvlRaw) : Math.round(lvlRaw * 10) / 10;
  const parts = [];
  if (lvlPts > 0) parts.push(say(lang, page, 'job points per 100 Time (ExperiencePointData.Score)', { 'pt-BR': `<strong>Pontos, que decidem a partida:</strong> subir o próximo nível de EXP trabalhando aqui rende cerca de ${number(lang, lvlPts)} a cada 100 de Tempo. Uma Missão mediana rende ${number(lang, missionRate())}.`, en: `<strong>Points, which decide the game:</strong> reaching the next Work XP level by working here gives about ${number(lang, lvlPts)} per 100 Time. A median quest gives ${number(lang, missionRate())}.` }));
  parts.push(say(lang, page, 'job pay (JobData.Rewards)', { 'pt-BR': `<strong>Dinheiro, que sozinho não vale pontos:</strong> paga ${number(lang, cash)} por turno de trabalho, ou ${number(lang, cashPer100(j))} a cada 100 de Tempo. Cada turno de trabalho tira ${number(lang, wear)} somando Felicidade, Saúde e Higiene, que rendem pontos quando estão altos.`, en: `<strong>Cash, which is worth no points by itself:</strong> it pays ${number(lang, cash)} per shift, or ${number(lang, cashPer100(j))} per 100 Time. Each shift takes ${number(lang, wear)} across Happiness, Health and Hygiene, which earn points while they stay high.` }));
  if (jobUnlisted(j)) parts.push(say(lang, page, 'unlisted job worth (SetChamberDataForJobs)', { 'pt-BR': 'Este cargo pode não aparecer na Agência de Empregos (veja Como subir de cargo, mais abaixo): os números valem se o jogo o mostrar para você.', en: 'This job may not show up at the Job Office (see How to rank up, below): the numbers hold if the game shows it to you.' }));
  else if (peers.length > 1) parts.push(say(lang, page, 'job position among same level (JobData.Rewards)', { 'pt-BR': `Entre os ${peers.length} cargos de nível ${jobRank(j)}, ${position === 1 ? 'é o que mais paga' : `é o ${position}º que mais paga`}.`, en: `Among the ${peers.length} Tier ${jobRank(j)} jobs, ${position === 1 ? 'it pays the most' : `it is number ${position} in pay`}.` }));
  if (better) {
    const hasPerk = ((j.RewardsWhileJobHeld || {}).RewardEntries || []).length > 0;
    parts.push(say(lang, page, 'dominated job (requirements and JobData.Rewards)', { 'pt-BR': `Com requisitos iguais ou menores, ${link(lang, better, title(lang, better))} paga ${number(lang, sumAttr(better.Rewards, 'Cash'))} e ${jobExp(better) === jobExp(j) ? 'dá a mesma EXP' : `dá ${number(lang, jobExp(better))} de EXP, contra ${number(lang, jobExp(j))} daqui`}.${hasPerk ? ' Fique aqui só se a vantagem do cargo compensar.' : ''}`, en: `With equal or lower requirements, ${link(lang, better, title(lang, better))} pays ${number(lang, sumAttr(better.Rewards, 'Cash'))} and ${jobExp(better) === jobExp(j) ? 'gives the same XP' : `gives ${number(lang, jobExp(better))} XP, against ${number(lang, jobExp(j))} here`}.${hasPerk ? ' Stay only if the perk makes up for it.' : ''}` }));
  }
  return callout(say(lang, page, 'label worth it', { 'pt-BR': 'Vale a pena?', en: 'Is it worth it?' }), `<p>${parts.join(' ')}</p>`);
}
function explainJob(lang, j) {
  const page = j.m_Name;
  if (artistJobs.has(j._id)) {
    const sheet = TEXT.en.has(`${artistRole.Term}_sheet`) ? gameText(lang, `${artistRole.Term}_sheet`) : '';
    return EMP.artistBlock(lang, j);
  }
  const xp = deref(j.ExperiencePointRequirement);
  const loc = deref(j.Location);
  const outfit = items.find(i => i.ItemSubGroup === 5 && i.Tier === j.RequiredEquippedItemTier);
  const needs = [];
  const jobMaps = jobMapList(j);
  if (j.RequiredEquippedItemTier > 0 && outfit && startingGear.has(outfit._id)) {
    needs.push(say(lang, page, 'starting clothes (RealmData.StartingEquipment)', {
      'pt-BR': `<strong>Roupa de nível ${j.RequiredEquippedItemTier} ou superior:</strong> você já começa com ${itemIcon(outfit, 22)}${link(lang, outfit, title(lang, outfit))}. Se perder, compra por ${number(lang, buyPrice(outfit))}. Onde comprar: ${clothesShops(lang, outfit, jobMaps)}.`,
      en: `<strong>Tier ${j.RequiredEquippedItemTier} clothes or better:</strong> you start with ${itemIcon(outfit, 22)}${link(lang, outfit, title(lang, outfit))}. If you lose them, they cost ${number(lang, buyPrice(outfit))}. Where to buy: ${clothesShops(lang, outfit, jobMaps)}.`,
    }));
  } else if (j.RequiredEquippedItemTier > 0 && outfit) {
    needs.push(say(lang, page, 'clothes requirement (JobHandler.CanApplyForJob)', {
      'pt-BR': `<strong>Roupa de nível ${j.RequiredEquippedItemTier} ou superior:</strong> ${itemIcon(outfit, 22)}${link(lang, outfit, title(lang, outfit))}, por ${number(lang, buyPrice(outfit))}. Onde comprar: ${clothesShops(lang, outfit, jobMaps)}.`,
      en: `<strong>Tier ${j.RequiredEquippedItemTier} clothes or better:</strong> ${itemIcon(outfit, 22)}${link(lang, outfit, title(lang, outfit))}, for ${number(lang, buyPrice(outfit))}. Where to buy: ${clothesShops(lang, outfit, jobMaps)}.`,
    }));
  } else if (j.RequiredEquippedItemTier > 0) {
    const top = Math.max(...items.filter(i => i.ItemSubGroup === 5).map(i => i.Tier));
    needs.push(say(lang, page, 'clothes tier above any outfit (ItemData.Tier)', {
      'pt-BR': `<strong>Roupa de nível ${j.RequiredEquippedItemTier}:</strong> as roupas do jogo só vão até o nível ${top}, então este cargo não pode ser assumido.`,
      en: `<strong>Tier ${j.RequiredEquippedItemTier} clothes:</strong> the game's outfits only go up to tier ${top}, so this job cannot be taken.`,
    }));
  }
  if (j.RequiredEquippedItemTier > 0 && outfit) needs.push(EMP.wearNote(lang, outfit).trim());
  if (xp && xp.Xp) {
    needs.push(say(lang, page, 'XP requirement', {
      'pt-BR': `<strong>Nível ${xp.Level} de EXP de Trabalho:</strong> ${number(lang, xp.Xp)} de EXP acumulada no total (não são pontos de vitória).`,
      en: `<strong>Work XP level ${xp.Level}:</strong> ${number(lang, xp.Xp)} XP in total (these are not points).`,
    }));
  }
  for (const k of j.KnowledgeRequirements || []) {
    const rec = byId.get(k.Id);
    if (!rec) continue;
    const courses = table('EducationData').filter(e => ((e.CompletionReward || {}).RewardEntries || []).some(x => x.Id === k.Id));
    const first = courses.find(e => !(e.KnowledgeRequirements || []).length);
    const start = first ? gameText(lang, first.TitleTerm) : '';
    const oneEach = courses.length && courses.every(e => e.CompletionReward.RewardEntries.find(x => x.Id === k.Id).Value === 1);
    const ordered = courses.slice().sort((x, y) => ((x.KnowledgeRequirements || [])[0] || { Value: 0 }).Value - ((y.KnowledgeRequirements || [])[0] || { Value: 0 }).Value).slice(0, k.Value);
    const firstNeed = new Map();
    ordered.forEach((e, index) => { for (const r of e.RequiredItems || []) { const g = deref(r); if (g && !firstNeed.has(g)) firstNeed.set(g, index + 1); } });
    const gear = l => [...firstNeed].map(([g, n]) => (l === 'en' ? `To take course ${n} onward you must own ${link(l, g, title(l, g))} at home (${number(l, buyPrice(g))}).` : `Para cursar do ${n}º em diante, é preciso ter ${link(l, g, title(l, g))} em casa (${number(l, buyPrice(g))}).`)).join(' ');
    needs.push(say(lang, page, 'knowledge requirement (EducationData, RequiredItems)', {
      'pt-BR': `<strong>${k.Value} ${k.Value === 1 ? 'curso concluído' : 'cursos concluídos'} de ${title(lang, rec)}.</strong> ${oneEach ? `Na ${place(lang, 'Academy')}, cada curso concluído conta 1.` : ''} ${start ? `O primeiro é <em>${start}</em>.` : ''} ${gear('pt-BR')}`,
      en: `<strong>${k.Value} finished ${k.Value === 1 ? 'course' : 'courses'} of ${title(lang, rec)}.</strong> ${oneEach ? `At the ${place(lang, 'Academy')}, each degree counts as 1.` : ''} ${start ? `The first is <em>${start}</em>.` : ''} ${gear('en')}`,
    }));
  }
  const next = jobs.filter(x => !jobUnlisted(x) && !artistJobs.has(x._id) && jobRank(x) > jobRank(j) && jobPlaces(x).some(p => jobPlaces(j).includes(p))).sort((x, y) => jobRank(x) - jobRank(y))[0];
  const absence = lostJobSystem();
  const office = place(lang, 'Town Hall');
  const xpHere = (xp && xp.Xp) || 0;
  const nextXp = next ? (deref(next.ExperiencePointRequirement) || {}).Xp || 0 : 0;
  const gain = jobExp(j);
  const missing = Math.max(0, nextXp - xpHere);
  const shifts = gain > 0 ? Math.ceil(missing / gain) : 0;
  const extra = l => { if (!next) return ''; const list = []; if (next.RequiredEquippedItemTier > j.RequiredEquippedItemTier) list.push(l === 'en' ? `tier ${next.RequiredEquippedItemTier} clothes` : `roupa de nível ${next.RequiredEquippedItemTier}`); if (jobCourses(next) > jobCourses(j)) list.push(l === 'en' ? `${jobCourses(next)} finished ${jobCourses(next) === 1 ? 'course' : 'courses'}` : `${jobCourses(next)} ${jobCourses(next) === 1 ? 'curso concluído' : 'cursos concluídos'}`); return list.length ? (l === 'en' ? ` It also asks for ${list.join(' and ')}.` : ` Esse cargo também pede ${list.join(' e ')}.`) : ''; };
  const upper = !next ? payingJobs().filter(x => jobRank(x) === jobRank(j) + 1 && !jobImpossible(x) && jobMaps.some(m => jobMapList(x).some(o => o._id === m._id))).sort((x, y) => sumAttr(y.Rewards, 'Cash') - sumAttr(x.Rewards, 'Cash'))[0] : null;
  const promote = jobUnlisted(j) ? say(lang, page, 'job not listed (SetChamberDataForType 0x1808FCA50, SetChamberDataForJobs 0x1808FB510, StartNewJob callers)', { 'pt-BR': `Este cargo não aparece em nenhuma aba da ${office}, então não dá para pegá-lo nesta versão do jogo, mesmo com todos os requisitos. As abas vão do nível 1 ao 6, e este cargo tem o nível ${j.JobLevel}.`, en: `This job appears in no tab at the ${office}, so it cannot be taken in this version of the game, even with every requirement met. The tabs go from Tier 1 to Tier 6, and this job is level ${j.JobLevel}.` }) : j.RequiredEquippedItemTier > TOP_OUTFIT ? say(lang, page, 'job cannot be taken (ItemData.Tier)', { 'pt-BR': 'Como não existe roupa desse nível, ninguém chega a este cargo.', en: 'Since no outfit of that tier exists, nobody can reach this job.' })
    : next && next.RequiredEquippedItemTier > TOP_OUTFIT ? say(lang, page, 'next job cannot be taken (ItemData.Tier)', { 'pt-BR': `O próximo cargo daqui, ${link(lang, next, title(lang, next))}, pede roupa de nível ${next.RequiredEquippedItemTier}, que não existe no jogo. Na prática, este é o último degrau deste local.`, en: `The next job here, ${link(lang, next, title(lang, next))}, needs tier ${next.RequiredEquippedItemTier} clothes, which do not exist in the game. In practice this is the last step at this location.` })
      : next ? say(lang, page, 'shifts to next job (ExperiencePointData.Xp, JobData.Rewards)', { 'pt-BR': `Para virar ${link(lang, next, title(lang, next))}: faltam ${number(lang, missing)} de EXP de Trabalho, ou ${number(lang, shifts)} turnos de trabalho aqui.${extra('pt-BR')} Quando tiver tudo, volte à ${office} para pegar a vaga.`, en: `To become ${link(lang, next, title(lang, next))}: you need ${number(lang, missing)} more Work XP, or ${number(lang, shifts)} shifts here.${extra('en')} Once you have it all, go back to the ${office} to take the job.` })
        : upper ? say(lang, page, 'top of location, higher elsewhere (JobData)', { 'pt-BR': `Último cargo aqui. Para ganhar mais, o próximo degrau é de nível ${jobRank(j) + 1} em outro local, como ${link(lang, upper, title(lang, upper))}, que paga ${number(lang, sumAttr(upper.Rewards, 'Cash'))} por turno de trabalho.`, en: `Last job here. To earn more, the next step is a Tier ${jobRank(j) + 1} job elsewhere, such as ${link(lang, upper, title(lang, upper))}, which pays ${number(lang, sumAttr(upper.Rewards, 'Cash'))} per shift.` })
          : say(lang, page, 'top job level (JobData)', { 'pt-BR': 'Último cargo aqui, e não existe emprego de nível mais alto nos mapas em que ele aparece.', en: 'Last job here, and no higher-level job exists on the maps where it appears.' });
  const noClothes = j.RequiredEquippedItemTier === 0 && j.JobLevel === 0 ? say(lang, page, 'naked jobs tab (Naked-Alter-Work-Chambers, Become-Naked-Benefits)', { 'pt-BR': `Este cargo fica na aba Empregos Sem Futuro, que só aparece quando você está sem roupa: ela substitui todas as outras abas da ${office}. Paga pouco e cobra caro nos atributos. Para sair daqui, compre uma roupa.`, en: `This job is in the Dead end Jobs tab, which only appears when you have no clothes on: it replaces every other tab at the ${office}. It pays little and costs a lot of attributes. To leave, buy some clothes.` }) : '';
  return howBlock(lang, noClothes, [
    ...(needs.length ? [callout(ui(lang, 'requires'), `<ul class="plain">${needs.map(n => `<li>${n}</li>`).join('')}</ul>`)] : []),
    ...(jobWorth(lang, j) ? [jobWorth(lang, j)] : []),
    callout(ui(lang, 'promotion'), `<p>${promote}</p>`),
    ...(jobMaps.length ? [callout(ui(lang, 'maps'), `<p>${jobMaps.map(m => esc(m.m_Name)).join(', ')}</p>`)] : []),
    ...(absence && j.JobLevel > 0 && !j.IsSafe ? [callout(ui(lang, 'careful'), `<p>${say(lang, page, 'absence (LostYourJobGameSystem.OnTurnStarted, GetFired(4), You lost your job)', {
      'pt-BR': `Se passar ${absence.RoundsOfAbsenceAllowed} rodadas sem trabalhar, você é demitido no começo da seguinte: perde 200 de Felicidade e fica 4 rodadas sem poder pegar emprego neste prédio.`,
      en: `If you go ${absence.RoundsOfAbsenceAllowed} rounds without working, you are fired at the start of the next one: you lose 200 Happiness and cannot take a job in this building for 4 rounds.`,
    })}</p>`)] : []),
  ], 'jobs');
}
const valueCell = (lang, label, value, text, none) => `<td class="n${value ? '' : ' none'}" data-label="${label}" data-v="${value || 0}">${value ? text : esc(none)}</td>`;

function itemPage(lang, it) {
  const list = [
    fact(ui(lang, 'buy'), isStock(it) ? `<span class="muted">${esc(ui(lang, 'varies'))}</span>` : buyPrice(it) ? number(lang, buyPrice(it)) : `<span class="muted">${esc(ui(lang, 'notForSale'))}</span>${otherSources.has(it._id) ? `<br><a href="#obtain">${esc(ui(lang, 'obtain'))}</a>` : ''}`),
    fact(ui(lang, 'sell'), isStock(it) ? `<span class="muted">${esc(ui(lang, 'varies'))}</span>` : it.SellValue > 0 ? number(lang, it.SellValue) : `<span class="muted">${esc(ui(lang, 'notSellable'))}</span>`),
  ];
  if (hasCategory(it)) list.unshift(fact(ui(lang, 'category'), esc(categoryLabel(lang, it))));
  if (it.Tier > 0) list.push(fact(ui(lang, 'tier'), it.Tier));
  if (it.Durability > 0) list.push(fact(ui(lang, 'durability'), it.Durability));
  if (it.MaxStack > 1) list.push(fact(ui(lang, 'maxStack'), it.MaxStack));
  if (it.ScoreBonus) list.push(fact(ui(lang, 'score'), formatValue(lang, it.ScoreBonus)));
  if (it.Security) list.push(fact(ui(lang, 'security'), formatValue(lang, it.Security)));
  { const nova = itensFicha(lang, it); if (nova) list.splice(0, list.length, ...nova); }
  const head = `${crumbs(lang, it.ItemSubGroup === 3 ? 'pets' : 'items', title(lang, it))}<h1>${itemIcon(it, 56)}${title(lang, it)}</h1>${flavor(lang, it)}${explainItem(lang, it)}`;
  let body = '';
  const sections = [];
  const add = (id, label, html) => { sections.push({ id, label }); body += `<section id="${id}"><h2>${label}</h2>${html}</section>`; };
  // Rewards.Cash on an item is neither a gain nor a price (it contradicts the sale value), so it stays out.
  const entries = ((it.Rewards || {}).RewardEntries || []).filter(e => !(byId.get(e.Id) && byId.get(e.Id).m_Name === 'Cash'));
  const fx = it.ItemSubGroup === 3 ? perks(lang, entries) : effects(lang, entries);
  if (fx && it.ItemGroup !== 1 && !ITENS_DONE.has(it._id)) add('effects', ui(lang, it.ItemSubGroup === 3 ? 'perks' : 'effects'), fx);
  const fromActions = '';
  const fromOthers = otherSources.has(it._id) ? `<ul class="plain">${[...otherSources.get(it._id)].map(h => `<li>${link(lang, h, title(lang, h))} <span class="muted">· ${ui(lang, h._kind)}</span></li>`).join('')}</ul>` : '';
  if ((fromActions || fromOthers) && !ITENS_DONE.has(it._id)) add('obtain', ui(lang, 'obtain'), fromActions + fromOthers);
  const f = tx(lang, it.FlavorTerm);
  page(lang, `items/${it._slug}/`, { title: titleText(lang, it), body: articleLayout(head, ficha(list) + toc(lang, sections), body), section: it.ItemSubGroup === 3 ? 'pets' : 'items', description: f ? plain(f.html) : '' });
}

function jobPage(lang, j) {
  const loc = deref(j.Location);
  const xp = deref(j.ExperiencePointRequirement);
  const list = [];
  if (loc && hasText(loc)) list.push(fact(ui(lang, 'location'), link(lang, loc, title(lang, loc))));
  if (xp) list.push(fact(plain(attrName(lang, 'Experience')), `${ui(lang, 'level')} ${xp.Level}${xp.Xp ? ` · ${number(lang, xp.Xp)}` : ''}`));
  if (j.RequiredEquippedItemTier > 0) list.push(fact(ui(lang, 'requiredGear'), j.RequiredEquippedItemTier));
  const head = `${crumbs(lang, 'jobs', title(lang, j))}<h1>${artIcon('job', j, 56)}${title(lang, j)}</h1>${flavor(lang, j)}${explainJob(lang, j)}`;
  let body = '';
  const sections = [];
  const add = (id, label, html) => { sections.push({ id, label }); body += `<section id="${id}"><h2>${label}</h2>${html}</section>`; };
  add('work', ui(lang, 'whileWorking'), ledger(lang, null, [{ entries: (j.Rewards || {}).RewardEntries }]));
  if (artistJobs.has(j._id)) {
    list.unshift(fact(ui(lang, 'role'), link(lang, artistRole, title(lang, artistRole))));
    add('art', ui(lang, 'possibleArt'), artPieces(lang, j));
  }
  const heldEntries = (j.RewardsWhileJobHeld || {}).RewardEntries;
  perkMaps = jobMapList(j);
  const held = perks(lang, heldEntries) || effects(lang, heldEntries);
  perkMaps = null;
  if (held) add('held', ui(lang, 'whileHeld'), held);
  const fixedFlavor = EMP_STATIC.flavorFix(lang, j);
  const f = fixedFlavor ? { html: fixedFlavor } : tx(lang, j.FlavorTerm);
  page(lang, `jobs/${j._slug}/`, { title: titleText(lang, j), body: articleLayout(head, ficha(list) + toc(lang, sections), body), section: 'jobs', description: f ? plain(f.html) : '' });
}

function jobRows(lang, list, withLocation) {
  return list.map(j => {
    const loc = deref(j.Location);
    const named = loc && hasText(loc);
    const place = withLocation ? `<td class="cat" data-v="${esc(named ? titleText(lang, loc) : '')}">${named ? link(lang, loc, title(lang, loc)) : ''}</td>` : '';
    const attr = n => sumAttr(j.Rewards, n);
    const label = n => esc(plain(attrName(lang, n)));
    const cell = n => `<td class="n" data-label="${label(n)}" data-v="${attr(n)}">${attr(n) ? formatValue(lang, attr(n)) : ''}</td>`;
    const rate = cashPer100(j);
    return `<tr><td>${artIcon('job', j, 28)}${link(lang, j, title(lang, j))}</td>${place}<td class="n" data-label="${esc(ui(lang, 'level'))}">${jobRank(j)}</td>${cell('Cash')}${cell('Time')}${cell('Experience')}<td class="n" data-label="${esc(rateLabel(lang))}" data-v="${rate}">${rate ? number(lang, rate) : ''}</td>${goCell(lang, j)}</tr>`;
  }).join('');
}
const attrName = (lang, n) => title(lang, table('AttributeData').find(a => a.m_Name === n));
// What a job pays for the same amount of time, the number players compare jobs by.
const cashPer100 = j => {
  const cash = sumAttr(j.Rewards, 'Cash'), time = Math.abs(sumAttr(j.Rewards, 'Time'));
  return cash > 0 && time ? Math.round(cash / time * 1000) / 10 : 0;
};
// Artist ranks pay no wage: each finished painting yields a random piece, weighted per rank.
const artistRole = roles.find(r => r.Name === 'Artist');
const artistJobs = new Map(((artistRole && artistRole.Rewards) || []).map(r => [r.ArtistJobData.id, deref(r.PaintingCompletedAction)]));
function artPieces(lang, j) {
  const pool = (artistJobs.get(j._id).WeightedRewards || []).filter(w => w.Reward && w.Reward.RewardEntries.length);
  const total = pool.reduce((sum, w) => sum + w.Weight, 0);
  const rows = pool.slice().sort((a, b) => b.Weight - a.Weight).map(w => {
    const piece = byId.get(w.Reward.RewardEntries[0].Id);
    const sell = piece.SellValue ? ` <span class="muted">· ${ui(lang, 'sell')} ${number(lang, piece.SellValue)}</span>` : '';
    return `<li><span class="pct">${number(lang, Math.round(w.Weight / total * 100))}%</span> ${link(lang, piece, title(lang, piece))}${sell}</li>`;
  });
  return `<ul class="art-list">${rows.join('')}</ul>`;
}
function artistSection(lang) {
  if (!artistRole) return '';
  const ranks = jobs.filter(j => artistJobs.has(j._id)).sort((a, b) => a.JobLevel - b.JobLevel);
  const sheet = TEXT.en.has(`${artistRole.Term}_sheet`) ? tx(lang, `${artistRole.Term}_sheet`) : null;
  const rows = ranks.map(j => {
    const attr = n => sumAttr(j.Rewards, n);
    const cell = n => `<td class="n" data-label="${esc(plain(attrName(lang, n)))}">${formatValue(lang, attr(n))}</td>`;
    return `<tr><td>${artIcon('job', j, 28)}${link(lang, j, title(lang, j))}</td><td class="n" data-label="${esc(ui(lang, 'level'))}">${j.JobLevel}</td>${cell('Time')}${cell('Experience')}<td class="wide">${artPieces(lang, j)}</td>${goCell(lang, j)}</tr>`;
  }).join('');
  return `<section id="artist"><h2>${icon(artistRole.RoleImageIcon, 32)}${link(lang, artistRole, title(lang, artistRole))}</h2>${sheet ? `<p class="art-note">${spanLang(lang, sheet)}</p>` : ''}<div class="tablecard"><table class="list-table"><thead><tr><th>${ui(lang, 'name')}</th><th class="n">${ui(lang, 'level')}</th><th class="n">${attrName(lang, 'Time')}</th><th class="n">${attrName(lang, 'Experience')}</th><th>${ui(lang, 'possibleArt')}</th>${GO_TH}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
const rateLabel = lang => `${plain(attrName(lang, 'Cash'))} / 100 ${plain(attrName(lang, 'Time'))}`;

// Rooms whose only actions are system entries: the content comes from the system, not from the action list.
function systemRoom(lang, ch) {
  const names = (ch.Actions || []).map(deref).filter(Boolean).map(a => a.m_Name);
  const has = re => names.some(n => re.test(n));
  const timeOf = re => { const a = (ch.Actions || []).map(deref).find(x => x && re.test(x.m_Name)); return a ? -sumAttr(a.Rewards, 'Time') : 0; };
  const dir = langDir(lang);
  const cost = v => (v ? say(lang, 'locations', 'room action time', { 'pt-BR': ` Cada operação gasta ${number(lang, v)} de Tempo.`, en: ` Each operation spends ${number(lang, v)} Time.` }) : '');
  if (has(/Course Enroll/)) {
    const dept = deref(ch.EducationDepartment);
    const list = dept ? (dept.Courses || []).map(deref).filter(c => c && hasText(c)) : [];
    if (!list.length) return '';
    return simpleTable([ui(lang, 'name'), say(lang, 'locations', 'col enroll', { 'pt-BR': 'Matrícula', en: 'Enrollment' }), say(lang, 'locations', 'col study', { 'pt-BR': 'Cada estudo', en: 'Each study' }), say(lang, 'locations', 'col studies', { 'pt-BR': 'Estudos até concluir', en: 'Studies to finish' })], list.map(c => [title(lang, c), effects(lang, (c.EnrollmentCost || {}).RewardEntries) || '', effects(lang, (c.StudyCost || {}).RewardEntries) || '', c.StudyThreshold ? number(lang, c.StudyThreshold) : ''])) + `<p class="ledger-note"><a href="/${dir}/guides/education/">${ui(lang, 'learnMore')}${esc(moreLabel(lang, 'education'))}</a></p>`;
  }
  if (has(/Vault Interaction/)) { const vault = table('VaultData').find(v => v.m_Name === 'Regular Bank Vault'); return `<p>${say(lang, 'locations', 'vault room (CheckForVaultInterest, VaultData)', { 'pt-BR': `Guarde Dinheiro aqui. Rende ${number(lang, Math.round(vault.InterestRate * 100))}% no fim de cada turno, até ${number(lang, vault.Max)}, e nenhum roubo toca nele. Depositar e sacar não têm taxa.`, en: `Keep Cash here. It earns ${number(lang, Math.round(vault.InterestRate * 100))}% at the end of every turn, up to ${number(lang, vault.Max)}, and no theft touches it. Depositing and withdrawing are free.` })} <a href="/${dir}/guides/bank/">${ui(lang, 'learnMore')}${esc(moreLabel(lang, 'bank'))}</a></p>`; }
  if (has(/Stock/)) return `<p>${say(lang, 'locations', 'stock room', { 'pt-BR': 'Compre e venda ações. O preço muda a cada rodada e o lucro vale pontos no fim.', en: 'Buy and sell stocks. Prices change every round and profit is worth points at the end.' })}${cost(timeOf(/Buy Stock/))} <a href="/${dir}/guides/stocks/">${ui(lang, 'learnMore')}${esc(moreLabel(lang, 'stocks'))}</a></p>`;
  if (has(/Buy Pawn/)) return `<p>${say(lang, 'locations', 'pawn buy room', { 'pt-BR': 'Compre o que foi penhorado, pelo valor-base do item.', en: 'Buy what was pawned, at the item\'s base value.' })}${cost(timeOf(/Buy Pawn/))} <a href="/${dir}/guides/pawn-shop/">${ui(lang, 'learnMore')}${esc(moreLabel(lang, 'pawn-shop'))}</a></p>`;
  if (has(/Sell Pawn/)) return `<p>${say(lang, 'locations', `pawn sell room ${ch.SubType}`, ch.SubType === 700 ? { 'pt-BR': 'Venda os móveis que você tem, pelo valor de Venda.', en: 'Sell the furniture you own, at its Sell value.' } : { 'pt-BR': 'Venda os objetos do seu inventário, pelo valor de Venda.', en: 'Sell the objects in your inventory, at their Sell value.' })}${cost(timeOf(/Sell Pawn/))} <a href="/${dir}/guides/pawn-shop/">${ui(lang, 'learnMore')}${esc(moreLabel(lang, 'pawn-shop'))}</a></p>`;
  if (has(/Job Application/)) {
    const list = jobs.filter(j => j.JobLevel === ch.SubType && !artistJobs.has(j._id)).sort((a, b) => sumAttr(b.Rewards, 'Cash') - sumAttr(a.Rewards, 'Cash'));
    return list.length ? ledger(lang, ui(lang, 'name'), list.map(j => ({ head: `<div class="withicon">${artIcon('job', j, 24)}<div><strong>${link(lang, j, title(lang, j))}</strong></div></div>`, entries: (j.Rewards || {}).RewardEntries, go: goLink(lang, j) }))) : '';
  }
  return '';
}
// What unlocks a conditional action: the owners of the trait that adds it.
const actionOrigin = (a, ch) => LOC.actionOrigin(a, ch);
function extrasHtml(lang, list, ch) {
  const poster = LOC.posters(lang, list);
  list = poster.rest;
  const merged = new Map();
  for (const a of list) { const k = `${titleText(lang, a)}|${JSON.stringify((a.Rewards || {}).RewardEntries)}`; if (merged.has(k)) { const m = merged.get(k); m.RequiredItems = [...(m.RequiredItems || []), ...(a.RequiredItems || [])]; m._origin = LOC.mergeOrigin(m._origin, actionOrigin(a, ch)); } else merged.set(k, { ...a, RequiredItems: [...(a.RequiredItems || [])], _origin: actionOrigin(a, ch) }); }
  const labels = { items: { 'pt-BR': 'Com móveis e itens', en: 'With furniture and items' }, quests: { 'pt-BR': 'Durante missões', en: 'During quests' }, roles: { 'pt-BR': 'De papéis', en: 'From roles' }, jobs: { 'pt-BR': 'Com o cargo certo', en: 'With the right job' }, courses: { 'pt-BR': 'Depois de concluir um curso', en: 'After finishing a course' }, other: { 'pt-BR': 'Por eventos, mapas e regras da partida', en: 'From events, maps and game rules' }, unknown: { 'pt-BR': 'Origem desconhecida', en: 'Unknown source' } };
  let html = '';
  for (const kind of ['items', 'quests', 'roles', 'jobs', 'courses', 'other', 'unknown']) {
    const group = [...merged.values()].filter(a => a._origin.kind === kind);
    if (group.length) html += `<p class="ledger-note">${say(lang, 'locations', `extras ${kind}`, labels[kind])}${kind === 'unknown' ? ` ${LOC.unknownOriginNote(lang)}` : ''}</p>${actionLedger(lang, group, a => LOC.originHtml(lang, a._origin))}`;
  }
  return html + poster.note;
}
function locationPage(lang, loc) {
  const map = mapOf(loc);
  const head = `${crumbs(lang, 'locations', title(lang, loc))}<h1>${artIcon('location', loc, 56)}${title(lang, loc)}</h1>${flavor(lang, loc, `${loc.Term}_flavor`)}${explainLocation(lang, loc)}`;
  let body = '';
  const sections = [];
  const here = jobs.filter(j => jobPlaces(j).some(p => p._id === loc._id)).sort((a, b) => jobRank(a) - jobRank(b));
  if (here.length) {
    sections.push({ id: 'jobs', label: ui(lang, 'jobs') });
    body += `<section id="jobs"><h2>${ui(lang, 'jobs')}</h2>${ledger(lang, ui(lang, 'name'), here.map(j => ({ head: `<div class="withicon">${artIcon('job', j, 24)}<div><strong>${link(lang, j, title(lang, j))}<span class="level">${ui(lang, 'level')} ${jobRank(j)}</span></strong>${jobUnlisted(j) ? `<p class="req">${say(lang, 'locations', 'job not listed note (SetChamberDataForJobs)', { 'pt-BR': 'Fora das abas da Agência: não dá para pegar.', en: 'Not in any Job Office tab: cannot be taken.' })}</p>` : ''}${flavor(lang, j)}</div></div>`, entries: (j.Rewards || {}).RewardEntries, go: goLink(lang, j) })))}</section>`;
  }
  const homes = (loc.Homes || []).map(deref).filter(Boolean);
  if (homes.length) {
    sections.push({ id: 'homes', label: ui(lang, 'homes') });
    const moveCost = h => table('ChamberActionData').find(x => /^Rent /.test(x.m_Name) && ((x.Rewards || {}).RewardEntries || []).some(e => e.Type === 130 && e.Id === h.Id));
    const sc = (id, texts) => say(lang, 'locations', id, texts);
    body += `<section id="homes"><h2>${ui(lang, 'homes')}</h2>${simpleTable([ui(lang, 'name'), sc('col rent every 4', { 'pt-BR': 'Aluguel a cada 4 rodadas', en: 'Rent every 4 rounds' }), sc('col move', { 'pt-BR': 'Para se mudar', en: 'To move in' }), sc('col score', { 'pt-BR': 'Pontos por pagar em dia', en: 'Points for paying on time' }), sc('col furn', { 'pt-BR': 'Móveis até o nível', en: 'Furniture up to tier' }), ui(lang, 'security')], homes.map(h => { const m = moveCost(h); const cash = m ? -sumAttr(m.Rewards, 'Cash') : 0, time = m ? -sumAttr(m.Rewards, 'Time') : 0; return [title(lang, h), number(lang, h.Rent), m ? sc(`move ${h.m_Name}`, { 'pt-BR': `${cash ? `${number(lang, cash)} de Dinheiro e ` : ''}${number(lang, time)} de Tempo`, en: `${cash ? `${number(lang, cash)} Cash and ` : ''}${number(lang, time)} Time` }) : '', h.RentScore ? number(lang, h.RentScore) : '', h.MaxFurnitureTier, `${Math.round(h.SecurityLevel * 100)}%`]; }))}<p class="ledger-note">${sc('home note (TryBreakThroughSecurity, RentHandler)', { 'pt-BR': `Segurança é a chance de um roubo falhar na Onda de Crimes. Mudar-se custa uma vez; o aluguel se repete. Atrasar cobra juros de 5%. <a href="/${langDir(lang)}/guides/debt/">O que acontece se atrasar</a>`, en: `Security is the chance a theft fails in a Crime Wave. Moving in is a one-off cost; rent repeats. Late rent charges 5% interest. <a href="/${langDir(lang)}/guides/debt/">What happens if you pay late</a>` })}</p></section>`;
  }
  let actionCount = 0, roomCount = 0;
  for (const ch of (loc.Chambers || []).map(deref).filter(Boolean)) {
    const actions = (ch.Actions || []).map(deref).filter(a => a && hasText(a));
    const extras = [...(chamberExtras.get(ch._id) || [])].filter(a => hasText(a) && !actions.includes(a));
    const special = !actions.length ? systemRoom(lang, ch) : '';
    if (!actions.length && !extras.length && !special) continue;
    const anchor = `room-${slugify(ch.m_Name)}`;
    roomCount++;
    actionCount += actions.length + extras.length;
    sections.push({ id: anchor, label: LOC.roomTitle(lang, loc, ch, title(lang, ch), true) });
    body += `<section id="${anchor}"><h2>${artIcon('room', ch, 32)}${LOC.roomTitle(lang, loc, ch, title(lang, ch))}</h2>`;
    if (special) body += special;
    const shop = LOJAS.room(lang, loc, ch, actions, extras);
    body += shop.html;
    if (shop.actions.length) body += actionLedger(lang, shop.actions);
    body += LOC.roomNote(lang, loc, ch);
    if (shop.extras.length) body += extrasHtml(lang, shop.extras, ch);
    body += '</section>';
  }
  const sheet = [];
  const mapsHere = table('MapLayoutData').filter(m => mapHas(m, loc)).map(m => m.m_Name);
  if (mapsHere.length || map) sheet.push(fact(ui(lang, 'map'), mapsHere.length ? mapsHere.map(esc).join(', ') : map));
  if (here.length) sheet.push(fact(ui(lang, 'jobs'), here.length));
  if (roomCount) sheet.push(fact(ui(lang, 'rooms'), roomCount));
  if (actionCount) sheet.push(fact(ui(lang, 'actions'), actionCount));
  const side = (sheet.length ? ficha(sheet) : '') + toc(lang, sections);
  page(lang, `locations/${loc._slug}/`, { title: titleText(lang, loc), body: articleLayout(head, side, body), section: 'locations' });
}

function itemsIndex(lang) {
  const sorted = [...items].sort((a, b) => titleText(lang, a).localeCompare(titleText(lang, b), lang));
  const cats = [...new Set(items.filter(hasCategory).map(i => i.ItemSubGroup))].sort((a, b) => ui(lang, `cat${a}`).localeCompare(ui(lang, `cat${b}`), lang));
  const buy = esc(ui(lang, 'buy')), sell = esc(ui(lang, 'sell')), tier = esc(ui(lang, 'tier'));
  const rows = sorted.map(i => `<tr data-c="${i.ItemSubGroup}"><td>${itemIcon(i, 28)}${link(lang, i, title(lang, i))}</td><td class="cat">${esc(categoryLabel(lang, i))}</td>${valueCell(lang, buy, buyPrice(i), num(lang, buyPrice(i)), ui(lang, isStock(i) ? 'varies' : 'noPrice'))}${valueCell(lang, sell, sellPrice(i), num(lang, sellPrice(i)), ui(lang, isStock(i) ? 'varies' : 'noPrice'))}${valueCell(lang, tier, i.Tier, i.Tier, ui(lang, 'noTier'))}${goCell(lang, i)}</tr>`).join('');
  const chips = chipBar(lang, cats.map(c => ({ v: String(c), label: ui(lang, `cat${c}`) })));
  const body = `${hubHead(lang, 'items', items.length)}
<div data-list><div class="bar"><input data-filter type="search" placeholder="${esc(ui(lang, 'filter'))}" aria-label="${esc(ui(lang, 'filter'))}">${chips}</div>
<div class="tablecard"><table class="list-table oneline"><thead><tr><th data-sort="t" data-key="name">${ui(lang, 'name')}</th><th data-sort="t" data-key="cat">${ui(lang, 'category')}</th><th class="n" data-sort="n" data-key="buy">${buy}</th><th class="n" data-sort="n" data-key="sell">${sell}</th><th class="n" data-sort="n" data-key="tier">${tier}</th>${GO_TH}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  page(lang, 'items/', { title: ui(lang, 'items'), body, section: 'items' });
}

function jobsIndex(lang) {
  const sorted = jobs.filter(j => !artistJobs.has(j._id)).sort((a, b) => titleText(lang, deref(a.Location)).localeCompare(titleText(lang, deref(b.Location)), lang) || jobRank(a) - jobRank(b));
  const body = `${hubHead(lang, 'jobs', jobs.length, 'jobs')}
<div data-list><div class="bar"><input data-filter type="search" placeholder="${esc(ui(lang, 'filter'))}" aria-label="${esc(ui(lang, 'filter'))}"></div>
<div class="tablecard"><table class="list-table jobs-table"><thead><tr><th data-sort="t">${ui(lang, 'name')}</th><th data-sort="t">${ui(lang, 'location')}</th><th class="n" data-sort="n">${ui(lang, 'level')}</th><th class="n" data-sort="n">${attrName(lang, 'Cash')}</th><th class="n" data-sort="n">${attrName(lang, 'Time')}</th><th class="n" data-sort="n">${attrName(lang, 'Experience')}</th><th class="n" data-sort="n">${esc(rateLabel(lang))}</th>${GO_TH}</tr></thead><tbody>${jobRows(lang, sorted, true)}</tbody></table></div></div>${artistSection(lang)}`;
  page(lang, 'jobs/', { title: ui(lang, 'jobs'), body, section: 'jobs' });
}

function locationsIndex(lang) {
  const groups = ['', 'Chailand', 'Schnitzelland'];
  let body = hubHead(lang, 'locations', locations.length, 'maps');
  for (const g of groups) {
    const list = locations.filter(l => mapOf(l) === g).sort((a, b) => titleText(lang, a).localeCompare(titleText(lang, b), lang));
    if (!list.length) continue;
    body += `<section class="hub-group"><h2>${g || ui(lang, 'general')}</h2><div class="hub-cards hub-flow">${list.map(l => hubCard(`/${langDir(lang)}/locations/${l._slug}/`, artIcon('location', l, 56), title(lang, l), LOC.indexNote(lang, l, purposeShort(lang, l) || flavorText(lang, `${l.Term}_flavor`)))).join('')}</div></section>`;
  }
  page(lang, 'locations/', { title: ui(lang, 'locations'), body, section: 'locations' });
}

function homePage(lang) {
  const shortcut = k => `<a href="/${langDir(lang)}/${k}/">${icon(spriteRef(SHORTCUT_ART[k]), 24) || `<span class="glyph"><svg aria-hidden="true"><use href="/assets/attrs.svg#s-${k}"></use></svg></span>`}${ui(lang, k)}</a>`;
  const seen = new Set();
  const best = [...jobs].filter(j => cashPer100(j) && !jobImpossible(j) && !artistJobs.has(j._id)).sort((a, b) => cashPer100(b) - cashPer100(a)).filter(j => {
    const key = `${titleText(lang, j)}|${cashPer100(j)}`;
    return seen.has(key) ? false : seen.add(key);
  }).slice(0, 8);
  const jobRow = j => {
    const loc = deref(j.Location);
    const place = loc && hasText(loc) ? link(lang, loc, title(lang, loc)) : '';
    return `<tr><td>${artIcon('job', j, 28)}${link(lang, j, title(lang, j))}</td><td class="cat">${place}</td><td class="n" data-label="${esc(rateLabel(lang))}">${number(lang, cashPer100(j))}</td>${goCell(lang, j)}</tr>`;
  };
  const bestTable = `<section class="tablecard home-best"><h2>${ui(lang, 'bestJobs')}</h2><p class="muted">${say(lang, 'home', 'best jobs caption (cashPer100, jobImpossible)', { 'pt-BR': 'Dinheiro por 100 de Tempo, só dos cargos que a Agência de Empregos mostra. Dinheiro sozinho não vale pontos: os pontos vêm de subir de nível, de Missões e dos outros itens de Pontuação e vitória.', en: 'Cash per 100 Time, counting only jobs listed at the Job Office. Cash is not worth any points by itself: points come from leveling up, Quests and the other categories in Scoring and winning.' })}</p><table class="list-table"><thead><tr><th>${ui(lang, 'name')}</th><th>${ui(lang, 'location')}</th><th class="n">${esc(rateLabel(lang))}</th>${GO_TH}</tr></thead><tbody>${best.map(jobRow).join('')}</tbody></table></section>`;
  // Each map's location list comes from the game's own layout table.
  const mapCards = (RAW['MapEditor.MapReference'] || []).filter(m => isReal(m.GameRoomIcon)).map(m => {
    const key = m.Name.toLowerCase().slice(0, 6);
    const layout = table('MapLayoutData').find(x => x.m_Name.toLowerCase().startsWith(key));
    const count = layout ? (layout.LocationData || []).map(deref).filter(l => l && l._slug).length : 0;
    const name = m.Name.split('-')[0].replace(/^./, c => c.toUpperCase());
    const hit = ICONS[m.GameRoomIcon.id];
    usedIcons.add(hit.file);
    return `<a class="mapcard" href="/${langDir(lang)}/locations/"><img src="/icons/${hit.file}" width="${hit.w}" height="${hit.h}" alt="" loading="lazy"><span class="mapcard-body"><strong>${esc(name)}</strong>${count ? `<small>${count} ${ui(lang, 'locations')}</small>` : ''}</span></a>`;
  }).join('');
  const external = '<svg aria-hidden="true"><use href="/assets/attrs.svg#s-external"></use></svg>';
  const hero = `<section class="hero-art"><div class="hero-frame"><img class="hero-img" src="/assets/hero.jpg" width="1920" height="620" alt="" fetchpriority="high"><img class="hero-logo" src="/assets/game-logo.png" width="640" height="360" alt="Walk of Life"></div>
<div class="hero-panel"><h1>WOL Wiki<span>${ui(lang, 'tagline')}</span></h1><button class="homesearch" type="button" data-open-search>${esc(ui(lang, 'search'))}<kbd>Ctrl K</kbd></button><div class="hero-actions"><a class="btn btn-main" href="https://store.steampowered.com/app/1910150/" target="_blank" rel="noopener">${esc(ui(lang, 'steam'))}${external}</a><a class="btn" href="/${langDir(lang)}/items/">${esc(ui(lang, 'explore'))}</a></div></div></section>`;
  const body = `<div class="home">${hero}
<nav class="shortcuts">${['items', 'jobs', 'locations', 'quests', 'events', 'roles', 'pets', 'modifiers'].map(shortcut).join('')}</nav>
<div class="home-grid">${bestTable}<div class="home-side"><section class="box about"><h2>${ui(lang, 'aboutTitle')}</h2><p>${esc(ui(lang, 'aboutText'))}</p></section><section class="box home-guides"><h2>${ui(lang, 'guides')}</h2><div class="guidelinks">${GUIDES.map(g => `<a href="/${langDir(lang)}/guides/${g.slug}/">${plain(g.title[lang] || g.title.en)}${GO_ARROW}</a>`).join('')}</div></section></div></div>
<section><h2 class="maps-title">${ui(lang, 'maps')}</h2><div class="mapcards">${mapCards}</div></section></div>`;
  page(lang, '', { title: ui(lang, 'tagline'), body });
}

// ---------------------------------------------------------------- Quests
const stepsOf = q => (Array.isArray(q.Quests) ? q.Quests.map(deref).filter(Boolean) : [q]);
const flavorTerm = term => {
  const key = typeof term === 'string' ? term.replace(/_title$/, '_flavor') : '';
  return TEXT.en.has(key) ? key : '';
};
function objectiveHtml(lang, o, step) {
  // Objetivo sem texto próprio (string_empty) ou com {ACTION}: o nome vem da ação.
  const action = o.ActionData ? deref(o.ActionData) : null;
  const actionName = action && hasText(action) ? titleOf(lang, action) : null;
  const t = tx(lang, o.Term) || actionName;
  if (!t) return null;
  const count = o.Count;
  let html = MISS.objectiveText(lang, spanLang(lang, t), actionName ? plain(actionName.html) : '');
  const hadCount = /\{count\}/i.test(html);
  html = html.replace(/\{count\}/gi, count === undefined ? '' : String(count)).replace(/\{[^}]*\}/g, '…');
  html = MISS.objectiveText(lang, html, '');
  return MCUSTO.decorate(lang, o, step, !hadCount && count > 1 && !MISS.repeatsCount(lang, html) ? `${html} <span class="muted">×${count}</span>` : html);
}
function questPage(lang, q) {
  const steps = stepsOf(q);
  const list = [];
  if (q.Tier > 0) list.push(fact(ui(lang, 'tier'), q.Tier));
  if (steps.length > 1) list.push(fact(ui(lang, 'steps'), steps.length));
  if (q.Duration > 0) list.push(fact(ui(lang, 'duration'), q.Duration));
  const head = `${crumbs(lang, 'quests', title(lang, q))}<h1>${artIcon('quest', q, 56)}${title(lang, q)}</h1>${(fl => (plain(fl) === titleText(lang, q) ? '' : fl))(flavor(lang, q, flavorTerm(q.TitleTerm)))}${explainQuest(lang, q)}`;
  let body = MISS.sameName(lang, q, quests, 'quests') + MCUSTO.twinMaps(lang, q, quests) + MISS.emptyNote(lang, q, steps, quests) + '<div class="stack">';
  steps.forEach((s, i) => {
    const objectives = (s.Objectives || []).map(o => (s.references || {})[o.rid]).filter(Boolean).map(o => objectiveHtml(lang, o, s)).filter(Boolean);
    const rewards = effects(lang, (s.Rewards || {}).RewardEntries);
    const started = effects(lang, (s.QuestStartedRewards || {}).RewardEntries);
    const heading = hasText(s) && steps.length > 1 && !MISS.redundantHeading(lang, q, s, objectives) ? `: ${title(lang, s)}` : '';
    body += `<section class="box">${steps.length > 1 ? `<h3>${ui(lang, 'step')} ${i + 1}${heading}</h3>` : ''}`;
    if (objectives.length) body += `<strong>${ui(lang, 'objectives')}</strong><ul class="plain">${objectives.map(o => `<li>${o}</li>`).join('')}</ul>`;
    if (started) body += `<strong>${ui(lang, 'onStart')}</strong>${started}`;
    if (rewards && steps.length > 1) body += `<strong>${ui(lang, 'rewards')}</strong>${rewards}`;
    if (steps.length > 1) body += MCUSTO.stepPoints(lang, s);
    body += '</section>';
  });
  page(lang, `quests/${q._slug}/`, { title: titleText(lang, q), body: articleLayout(head, list.length ? ficha(list) : '', body + '</div>'), section: 'quests' });
}
function questsIndex(lang) {
  const sorted = [...quests].sort((a, b) => titleText(lang, a).localeCompare(titleText(lang, b), lang));
  const rows = sorted.map(q => `<tr><td>${artIcon('quest', q, 28)}${link(lang, q, title(lang, q))}</td>${valueCell(lang, esc(ui(lang, 'tier')), q.Tier, q.Tier, ui(lang, 'noTier'))}<td class="n" data-label="${esc(ui(lang, 'steps'))}">${stepsOf(q).length}</td>${valueCell(lang, esc(ui(lang, 'duration')), q.Duration, q.Duration, ui(lang, 'noDuration'))}${goCell(lang, q)}</tr>`).join('');
  const body = `${hubHead(lang, 'quests', quests.length)}<div data-list><div class="bar"><input data-filter type="search" placeholder="${esc(ui(lang, 'filter'))}" aria-label="${esc(ui(lang, 'filter'))}"></div><div class="tablecard"><table class="list-table"><thead><tr><th data-sort="t">${ui(lang, 'name')}</th><th class="n" data-sort="n">${ui(lang, 'tier')}</th><th class="n" data-sort="n">${ui(lang, 'steps')}</th><th class="n" data-sort="n">${ui(lang, 'duration')}</th>${GO_TH}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  page(lang, 'quests/', { title: ui(lang, 'quests'), body, section: 'quests' });
}

// ---------------------------------------------------------------- Events
const eventCategory = e => (e.m_Name.includes(' - ') ? e.m_Name.split(' - ')[0] : '');
// Categories named after a role or place use that official translation.
const CATEGORY_PLACES = { Bank: 'Bank', Gym: 'Gym', Mall: 'Department Store', 'Moo Moo Mart': 'Grocery Store', Park: 'Garden City' };
const categoryRec = c => roles.find(r => r.m_Name.toLowerCase() === String(c).toLowerCase() || r.Term === `role_${String(c).toLowerCase()}`) || locations.find(l => l.m_Name === CATEGORY_PLACES[c]);
const categoryText = (lang, c) => { const rec = categoryRec(c); return rec ? titleText(lang, rec) : MISS.categoryPt(lang, c) || c; };
const categoryName = (lang, c) => { if (!c) return ui(lang, 'general'); const rec = categoryRec(c); if (rec) return esc(titleText(lang, rec)); const pt = MISS.categoryPt(lang, c); return pt ? esc(pt) : `<span lang="en">${esc(c)}</span>`; };
function eventPage(lang, e) {
  const tags = eventConditions(lang, e);
  const blockers = eventBlockers(lang, e);
  const whenInfo = EV.when(lang, e, tags, blockers);
  const eventCalls = [callout(say(lang, 'events', 'label can appear when', { 'pt-BR': 'Pode aparecer quando', en: 'Can appear when' }), `<p>${whenInfo.text}</p>`), ...(blockers.length && whenInfo.keepBlockers ? [callout(say(lang, 'events', 'label blocked when', { 'pt-BR': 'Não acontece quando', en: 'Does not happen when' }), `<p>${say(lang, 'events', 'blocked by (Operator 5, LessThan)', { 'pt-BR': `${blockers.join('. ')}.`, en: `${blockers.join('. ')}.` })}</p>`)] : [])];
  const verdicts = EV.verdicts(lang, e);
  const pick = [verdicts.summary, verdicts.same ? '' : zeroWarning(lang, e)].filter(Boolean).join(' ');
  if (pick) eventCalls.push(callout(say(lang, 'events', 'label which choice', { 'pt-BR': 'Qual escolher', en: 'Which to pick' }), `<p>${pick}</p>`));
  const text = tx(lang, e.Body);
  const head = `${crumbs(lang, 'events', title(lang, e))}<h1>${title(lang, e)}</h1>${eventCalls.length ? howBlock(lang, '', eventCalls) : ''}`;
  let body = bigImage(e.Image) + EV.sameName(lang, e, () => MISS.sameName(lang, e, events, 'events')) + EV.textNote(lang, e);
  if (text) body += `<p class="body-text">${spanLang(lang, text).replace(/\{[^}]*\}/g, '…')}</p>`;
  body += `<h2>${ui(lang, 'choices')}</h2><div class="stack">`;
  (e.Choices || []).forEach((c, index) => {
    const choice = tx(lang, c.ChoiceTerm);
    const outcome = tx(lang, c.OutcomeTerm);
    const fx = effects(lang, (c.Rewards || {}).RewardEntries);
    body += `<section class="box">${choice ? `<strong>${spanLang(lang, choice)}</strong>` : ''}${outcome ? `<p class="flavor">${spanLang(lang, outcome).replace(/\{[^}]*\}/g, '…')}</p>` : ''}${fx || (EV.chainNote(lang, e, c) ? '' : `<p class="muted">${esc(ui(lang, 'noEffect'))}</p>`)}${verdicts.notes[index]}${EV.chainNote(lang, e, c)}</section>`;
  });
  const sheet = ficha([fact(ui(lang, 'category'), categoryName(lang, eventCategory(e))), fact(ui(lang, 'choices'), (e.Choices || []).length)]);
  page(lang, `events/${e._slug}/`, { title: titleText(lang, e), body: articleLayout(head, sheet, body + '</div>'), section: 'events', description: text ? plain(text.html) : '' });
}
function eventsIndex(lang) {
  const sorted = [...events].sort((a, b) => titleText(lang, a).localeCompare(titleText(lang, b), lang));
  const cats = [...new Set(events.map(eventCategory))].sort();
  const rows = sorted.map(e => `<tr data-c="${esc(eventCategory(e))}"><td>${artIcon('event', e, 28)}${link(lang, e, title(lang, e))}</td><td class="cat">${categoryName(lang, eventCategory(e))}</td><td class="n" data-label="${esc(ui(lang, 'choices'))}">${(e.Choices || []).length}</td>${goCell(lang, e)}</tr>`).join('');
  const chips = chipBar(lang, cats.filter(Boolean).map(c => ({ v: c, label: categoryText(lang, c) })));
  const body = `${hubHead(lang, 'events', events.length)}<p class="muted">${EV.drawNote(lang)}</p><div data-list><div class="bar"><input data-filter type="search" placeholder="${esc(ui(lang, 'filter'))}" aria-label="${esc(ui(lang, 'filter'))}">${chips}</div><div class="tablecard"><table class="list-table"><thead><tr><th data-sort="t">${ui(lang, 'name')}</th><th data-sort="t">${ui(lang, 'category')}</th><th class="n" data-sort="n">${ui(lang, 'choices')}</th>${GO_TH}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  page(lang, 'events/', { title: ui(lang, 'events'), body, section: 'events' });
}

// ---------------------------------------------------------------- Roles and pets
const allTraits = RAW['Gameplay.Traits.Trait'] || [];
function roleTraits(role) {
  const names = [role.Name, role.Term.replace(/^role_/, '')].map(s => s.toLowerCase());
  return allTraits.filter(t => {
    const m = t.m_Name.match(/^Role-([^-]+)-/);
    return m && names.includes(m[1].toLowerCase()) && hasText(t);
  });
}
// Role guides live in tools/explicacoes/papeis.js; the factory gets its helpers lazily because most are defined further down.
const PAPEIS = require('./explicacoes/papeis')(() => ({
  say, icon, spriteRef, SPRITE_KEYS, number, deref, byId, table, RAW, TEXT, items, locations, itemIcon, artIcon, link, title, titleText, tx, spanLang, buyPrice,
  traitDetails, effects, hasText, placesOf, simpleTable, ui, gameText, place, actionWhere, complaintPlaces, sumAttr, esc, plain, chamberLocations, attrName,
}));
// SeniorComplainTraitEffect pairs each complaint action with the rooms where it works.
function complaintPlaces(a) {
  const e = (RAW['Gameplay.Traits.TraitEffectScripts.SeniorComplainTraitEffect'] || [])[0];
  if (!e) return [];
  const pairs = [['PensionChambers', 'IncreasePensionAction'], ['RentChambers', 'DecreaseRentAction'], ['FullnessChambers', 'IncreaseFullnessAction'], ['HealthChambers', 'IncreaseHealthAction'], ['HappinessChambers', 'IncreaseHappinessAction'], ['TransportChambers', 'GiveTransportItem'], ['ArcadeChambers', 'GiveArcadeItems']];
  const hit = pairs.find(([, k]) => deref(e[k]) === a);
  return hit ? (e[hit[0]] || []).map(deref).filter(Boolean).flatMap(ch => locations.filter(l => (l.Chambers || []).some(x => x && x.id === ch._id))) : [];
}
const cultistGuide = (lang, r) => PAPEIS.cultistGuide(lang, r);
const roleGuide = (lang, r) => PAPEIS.roleGuide(lang, r);

// Three faces, as in RoleSelectionPanel.RoleComplexityIcons: the role's level at full alpha, the others at 0.3.
const COMPLEXITY_FACES = ['gamedifficulty-easy', 'gamedifficulty-medium', 'gamedifficulty-hard'];
function roleComplexity(lang, r) {
  const level = r.ComplexityType;
  if (![1, 2, 3].includes(level)) return '';
  const label = esc(ui(lang, 'complexityLevel').replace('{n}', level));
  return `<span class="complexity" role="img" aria-label="${label}" title="${label}">${COMPLEXITY_FACES.map((f, i) => `<img${i + 1 === level ? ' class="on"' : ''} src="/assets/${f}.png" width="22" height="22" alt="" loading="lazy">`).join('')}</span>`;
}

function rolePage(lang, r) {
  const faces = roleComplexity(lang, r);
  const list = faces ? [fact(ui(lang, 'complexity'), faces)] : [];
  const head = `${crumbs(lang, 'roles', title(lang, r))}<h1>${artIcon('role', r, 56)}${title(lang, r)}</h1>${flavor(lang, r, `${r.Term}_flavor`)}`;
  let body = '';
  const sheet = TEXT.en.has(`${r.Term}_sheet`) ? tx(lang, `${r.Term}_sheet`) : null;
  const picks = [1, 2, 3].map(n => `${r.Term}_selection_${n}`).filter(k => TEXT.en.has(k)).map(k => gameText(lang, k));
  const how = sheet || picks.length ? howBlock(lang, sheet ? spanLang(lang, sheet).replace(/\{[^}]*\}/g, '…') : '', picks.length ? [callout(ui(lang, 'perks'), `<ul class="plain">${picks.map(p => `<li>${p}</li>`).join('')}</ul>`)] : []) : '';
  const guided = PAPEIS.hasGuide(r);
  if (r.Term === 'role_cultist') body += cultistGuide(lang, r);
  else body += roleGuide(lang, r);
  const traits = roleTraits(r);
  const starting = ((r.StartingReward || {}).RewardEntries || []).map(e => byId.get(e.Id)).filter(t => t && hasText(t));
  const allPerks = [...new Set([...starting, ...traits])];
  if (allPerks.length && !guided) body += `<h2>${ui(lang, 'perks')}</h2><div class="stack">${allPerks.map(t => traitCard(lang, t)).join('')}</div>`;
  if (r.LevelUpRewards && r.LevelUpRewards.length && !PAPEIS.ownsSections(r)) {
    const rows = r.LevelUpRewards.map(l => {
      const got = [
        ...(l.AddTraits || []).map(deref).filter(t => t && hasText(t)).map(t => `<strong>${title(lang, t)}</strong>${traitDetails(lang, t)}`),
        ...(l.AttributeRewards || []).map(a => { const at = deref(a.Attribute); return at ? `<span class="v p">${formatValue(lang, a.Value)}</span> ${title(lang, at)}` : ''; }).filter(Boolean),
      ];
      return got.length ? `<tr><td class="n">${l.Level}</td><td>${got.join('<br>')}</td></tr>` : '';
    }).join('');
    if (rows) body += `<h2>${ui(lang, 'levelRewards')}</h2><div class="scroll"><table><thead><tr><th class="n">${ui(lang, 'level')}</th><th>${ui(lang, 'rewards')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  if (Array.isArray(r.Locations) && r.Locations.some(l => l.Artifact) && !PAPEIS.ownsSections(r)) {
    const rows = r.Locations.filter(l => deref(l.Artifact)).map(l => {
      const art = deref(l.Artifact), room = deref(l.ChamberInfo);
      // Players know the building, not the room inside it; map variants share one name.
      const seen = new Set();
      const places = (room ? chamberLocations.get(room._id) || [] : []).filter(p => {
        const name = titleText(lang, p);
        return seen.has(name) ? false : seen.add(name);
      }).map(p => link(lang, p, title(lang, p))).join(', ');
      return `<tr><td>${itemIcon(art, 28)}${link(lang, art, title(lang, art))}</td><td>${places}</td><td class="n">${Math.round(l.ArtifactChance * 100)}%</td><td class="n">${l.ArtifactGuarantee}</td><td class="n">${l.ArtifactsRequired}</td>${goCell(lang, art)}</tr>`;
    }).join('');
    body += `<h2>${ui(lang, 'artifacts')}</h2><div class="scroll"><table><thead><tr><th>${ui(lang, 'name')}</th><th>${ui(lang, 'location')}</th><th class="n">${ui(lang, 'chance')}</th><th class="n">${say(lang, 'role scavenger', 'col guarantee (ArtifactGuarantee)', { 'pt-BR': 'Certo na busca', en: 'Sure by search' })}</th><th class="n">${say(lang, 'role scavenger', 'col required (ArtifactsRequired)', { 'pt-BR': 'Artefatos para liberar', en: 'Artifacts to unlock' })}</th>${GO_TH}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const chain = deref(r.RoleQuestChain);
  if (chain && chain._slug && !guided) body += `<h2>${ui(lang, 'quests')}</h2><p>${link(lang, chain, title(lang, chain))}</p>`;
  page(lang, `roles/${r._slug}/`, { title: titleText(lang, r), body: articleLayout(guided ? head : head + how, ficha(list), body), section: 'roles' });
}
function roleSummary(lang, r) {
  if (!PAPEIS.hasGuide(r)) return '';
  const m = String(PAPEIS.roleGuide(lang, r) || '').match(/<\/h2>\s*<p>([\s\S]*?)<\/p>/);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
}
function rolesIndex(lang) {
  const sorted = [...roles].sort((a, b) => titleText(lang, a).localeCompare(titleText(lang, b), lang));
  const body = `${hubHead(lang, 'roles', roles.length)}<section class="hub-group"><div class="hub-cards hub-flow">${sorted.map(r => hubCard(`/${langDir(lang)}/roles/${r._slug}/`, artIcon('role', r, 56), title(lang, r), roleSummary(lang, r) || flavorText(lang, `${r.Term}_flavor`), roleComplexity(lang, r))).join('')}</div></section>`;
  page(lang, 'roles/', { title: ui(lang, 'roles'), body, section: 'roles' });
}
function petsIndex(lang) {
  const sorted = [...pets].sort((a, b) => titleText(lang, a).localeCompare(titleText(lang, b), lang));
  const rows = sorted.map(p => {
    const buy = [...(obtain.get(p._id) || [])].find(a => /^action_buy_pet/.test(a.TitleTerm || ''));
    const cost = buy ? Math.abs(sumAttr(buy.Rewards, 'Cash')) : 0;
    const trait = ((p.Rewards || {}).RewardEntries || []).filter(e => e.Type === 110).map(e => byId.get(e.Id)).find(t => t && hasText(t));
    return `<tr><td>${itemIcon(p, 40)}${link(lang, p, title(lang, p))}</td>${valueCell(lang, esc(ui(lang, 'cost')), cost, cost ? number(lang, cost) : '', ui(lang, 'noPrice'))}<td class="wide">${trait ? `<strong>${title(lang, trait)}</strong>${flavor(lang, trait)}` : `<span class="none">${esc(ui(lang, 'noDescription'))}</span>`}</td>${goCell(lang, p)}</tr>`;
  }).join('');
  const body = `${hubHead(lang, 'pets', pets.length, 'pets')}<div data-list><div class="bar"><input data-filter type="search" placeholder="${esc(ui(lang, 'filter'))}" aria-label="${esc(ui(lang, 'filter'))}"></div><div class="tablecard"><table class="list-table"><thead><tr><th data-sort="t">${ui(lang, 'name')}</th><th class="n" data-sort="n">${ui(lang, 'cost')}</th><th>${ui(lang, 'perks')}</th>${GO_TH}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  page(lang, 'pets/', { title: ui(lang, 'pets'), body, section: 'pets' });
}

// Which pages still say nothing beyond their fact sheet.
function withoutHow() {
  const lang = 'en';
  const check = (recs, fn) => { const names = recs.filter(r => !fn(r)).map(r => r.m_Name).sort(); return { total: recs.length, count: names.length, names }; };
  return {
    items: check(items, r => explainItem(lang, r)),
    jobs: check(jobs, r => explainJob(lang, r)),
    locations: check(locations, r => explainLocation(lang, r)),
    quests: check(quests, r => explainQuest(lang, r)),
    events: check(events, () => true),
    roles: check(roles, r => TEXT.en.has(`${r.Term}_sheet`)),
  };
}

// ---------------------------------------------------------------- "How it works" guides
// Only facts confirmed by game data or game text; open questions live in docs/perguntas-sobre-o-jogo.md.
const gameByText = (lang, re) => {
  for (const [k, v] of TEXT.en) if (re.test(v)) return gameText(lang, k);
  return '';
};
const gameList = (lang, keys) => `<ul class="plain">${keys.filter(k => TEXT.en.has(k)).map(k => `<li>${gameText(lang, k)}</li>`).join('')}</ul>`;
const simpleTable = (heads, rows) => `<div class="scroll"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const reportBody = (lang, name) => { const r = table('ReportData').find(x => x.m_Name === name); return r ? gameText(lang, r.BodyTerm) : ''; };
const explHelpers = {
  say: (...a) => say(...a), number: (...a) => number(...a), langDir: (...a) => langDir(...a), ui: (...a) => ui(...a), link: (...a) => link(...a), title: (...a) => title(...a), titleText: (...a) => titleText(...a),
  tx: (...a) => tx(...a), spanLang: (...a) => spanLang(...a), callout: (...a) => callout(...a), howBlock: (...a) => howBlock(...a), place: (...a) => place(...a), placesOf: (...a) => placesOf(...a),
  deref: (...a) => deref(...a), table: (...a) => table(...a), sumAttr: (...a) => sumAttr(...a), collectEntries: (...a) => collectEntries(...a), actionOutcomes: (...a) => actionOutcomes(...a),
  simpleTable: (...a) => simpleTable(...a), mapHas: (...a) => mapHas(...a), mapOf: (...a) => mapOf(...a), hasText: (...a) => hasText(...a), guideTitle: (lang, slug) => moreLabel(lang, slug).replace(/^: /, ''),
  get items() { return items; }, get jobs() { return jobs; }, get locations() { return locations; }, get byId() { return byId; }, get artistRole() { return artistRole; }, get artistJobs() { return artistJobs; },
  missionRate: () => missionRate(), workPoints: () => workPoints(), jobRate: () => JOB_RATE, jobWear: () => JOB_WEAR,
  get RAW() { return RAW; }, get roles() { return roles; }, get stepChain() { return stepChain; },
  freeActions: loc => (loc.Chambers || []).map(deref).filter(Boolean).flatMap(ch => (ch.Actions || []).map(deref)).filter(a => a && hasText(a) && !visibleEntries(a.RequiredItems).length),
};
const EMP = require('./explicacoes/empregos.js')(explHelpers);
const LOC = require('./explicacoes/locais.js')(explHelpers);
const LOJAS = require('./explicacoes/lojas.js')(Object.assign(Object.create(explHelpers), { LOC, itemIcon: (...a) => itemIcon(...a), artIcon: (...a) => artIcon(...a), attrName: (...a) => attrName(...a), effects: (...a) => effects(...a), esc: (...a) => esc(...a) }));
const placeIn = (lang, name, kind = 'em', capital = false) => {
  const l = locations.find(x => x.m_Name === name);
  if (!l) return '';
  const out = require('./explicacoes/lugares').comPreposicao(titleText(lang, l), kind, label => link(lang, l, esc(label)));
  return capital ? out.charAt(0).toUpperCase() + out.slice(1) : out;
};
const worldGuides = require('./guides-world.js')({ gameText, place, placeIn, number, simpleTable, ui, dir: langDir, itemName: (lang, name) => { const it = items.find(i => i.m_Name === name); return it ? link(lang, it, title(lang, it)) : esc(name); } });
const guideHelpers = () => ({
  RAW, table, jobs, items, roles, locations, pets, byId, deref, TEXT, number, plain, esc, ui, langDir, link, title, titleText, itemIcon, effects, sumAttr, simpleTable,
  gameText, place, placeIn, placesOf, hasText, tx, spanLang, attrName, actionWhere, actionHome, buyPrice, artistJobs, clothesShops, repairAction, REPAIR_FRACTION,
  isStock, STOCK_PROFILES, signedPercent, ROUND_CHOICES, PAWN_LIFESPAN,
});
const GUIDES = [
  require('./guias/time.js')(guideHelpers),
  require('./guias/attributes.js')(guideHelpers),
  require('./guias/clothes.js')(guideHelpers),
  { slug: 'jobs', title: { 'pt-BR': 'Empregos e promoção', en: 'Jobs and promotion' }, sections: (lang, s) => {
    const n = v => number(lang, v);
    const absent = lostJobSystem().RoundsOfAbsenceAllowed;
    return [
      ['', `<p>${s('intro (JobData)', { 'pt-BR': `Emprego é de onde vem seu Dinheiro e sua EXP de Trabalho. Para conseguir um, vá à ${place(lang, 'Town Hall')}. A página de cada emprego mostra quanto ele paga, quanto Tempo gasta e o que ele pede.`, en: `A job is where your Cash and Work XP come from. To get one, go to the ${place(lang, 'Town Hall')}. Each job's page shows what it pays, how much Time it costs and what it requires.` })} <a href="/${langDir(lang)}/jobs/">${ui(lang, 'jobs')}</a></p>`],
      [ui(lang, 'promotion'), `<p>${s('promotion (JobData, CanApplyForJob)', { 'pt-BR': 'Um emprego pode pedir três coisas: nível de EXP de Trabalho, roupa de um nível mínimo e cursos concluídos. Quando você atende aos três, pode se candidatar. As vagas melhores ficam nas abas de nível mais alto.', en: 'A job can ask for three things: a Work XP level, clothes of a minimum tier and finished courses. Once you meet all three, you can apply. Better jobs are in the higher-tier tabs.' })}</p><p>${s('promotion pay (JobHandler.GetWorkRewards, CheckForJobExperience)', { 'pt-BR': 'O salário depende só do emprego, não do seu nível de EXP: o nível serve para abrir cargos melhores e dá pontos ao ser alcançado. A EXP é sua e não zera quando você troca de emprego.', en: 'Pay depends only on the job, not on your Work XP level: the level unlocks better jobs and gives points when you reach it. Your XP stays with you when you change jobs.' })}</p><p>${s('promotion unlisted (SetChamberDataForJobs, JobLevel above 6)', { 'pt-BR': 'Alguns cargos (17 no total) trazem um nível interno de 11 a 16, fora das abas de 1 a 6. Pela regra das abas, eles ficam de fora de todas. A página de cada um avisa.', en: 'Some jobs (17 in all) carry an internal level from 11 to 16, outside tabs 1 to 6, so no tab lists them. Each of those job pages says so.' })}</p>`],
      [plain(attrName(lang, 'Experience')), `<p>${s('xp (ExperiencePointData, CheckForJobExperience)', { 'pt-BR': 'Você ganha EXP trabalhando. Ao alcançar cada nível, recebe os pontos da última coluna, que contam para vencer.', en: 'You earn XP by working. On reaching each level you get the points in the last column, which count toward winning.' })}</p>${simpleTable([ui(lang, 'level'), s('col xp', { 'pt-BR': 'EXP total necessária', en: 'Total XP needed' }), s('col pts', { 'pt-BR': 'Pontos ao chegar', en: 'Points on reaching it' })], table('ExperiencePointData').sort((a, b) => a.Level - b.Level).filter(x => x.Xp > 0).map(x => [x.Level, n(x.Xp), n(x.Score)]))}`],
      [ui(lang, 'careful'), `<p>${s('absence (LostYourJobGameSystem.RoundsOfAbsenceAllowed)', { 'pt-BR': `Se você ficar mais de ${absent} rodadas sem aparecer no trabalho, perde o emprego: no começo da rodada seguinte você perde 200 de Felicidade e fica 4 rodadas sem poder pegar emprego naquele prédio. Os empregos da aba Sem Futuro e o Artista não são demitidos por faltar.`, en: `If you go more than ${absent} rounds without showing up for work, you lose the job: at the start of the next round you lose 200 Happiness and cannot take a job in that building for 4 rounds. You are never fired for missing work at jobs in the Dead end Jobs tab, or as the Artist.` })}</p>`],
    ];
  } },
  require('./guias/education.js')(guideHelpers),
  require('./guias/housing.js')(guideHelpers),
  require('./guias/pets.js')(guideHelpers),
  require('./guias/maps.js')(guideHelpers),
  { slug: 'scoring', title: { 'pt-BR': 'Pontuação e vitória', en: 'Scoring and winning' }, sections: (lang, s) => {
    const vt = ['Attribute Low Score Value Trigger', 'Attribute Mid Score Value Trigger', 'Attribute High Score Value Trigger'].map(n => table('ValueTriggerData').find(v => v.m_Name === n));
    const d = langDir(lang);
    const n = v => number(lang, v);
    const pt = lang === 'pt-BR';
    const rounds = RAW['Core.Config.GameplayConfig'].find(c => /^Default/.test(c.m_Name)).NumberOfRounds;
    const homes = table('HomeData').filter(h => h.Rent > 0).sort((a, b) => a.RentScore - b.RentScore);
    const xp = table('ExperiencePointData').filter(x => x.Score > 0).sort((a, b) => a.Level - b.Level);
    const edu = table('EducationData').map(e => (e.CompletionReward.RewardEntries.find(x => x.Type === 95) || {}).Value || 0).filter(Boolean);
    const quest = RAW['Gameplay.Quests.Quest'].flatMap(q => q.Rewards.RewardEntries.filter(e => e.Type === 95).map(e => e.Value));
    const furn = items.filter(i => i.ItemGroup === 1 && i.ScoreBonus > 0).map(i => i.ScoreBonus);
    const fishPts = items.filter(i => i.ItemSubGroup === 9 && i.ScoreBonus > 0).map(i => i.ScoreBonus);
    const span = list => (pt ? `${n(Math.min(...list))} a ${n(Math.max(...list))}` : `${n(Math.min(...list))} to ${n(Math.max(...list))}`);
    const stockMult = table('CoreData').find(c => c.m_Name === 'Stock Score').ScoringMultiplier;
    const roundList = ROUND_CHOICES.join(", ");
    const when = {
      turn: s('when turn', { 'pt-BR': 'No fim de cada turno seu', en: 'At the end of each of your turns' }),
      now: s('when now', { 'pt-BR': 'Assim que você consegue', en: 'As soon as you do it' }),
      end: s('when end', { 'pt-BR': 'Só na contagem final', en: 'Only in the final count' }),
    };
    const roleSteps = [150, 200, 250, 300, 350];
    const resort = locations.find(l => /Resort/.test(l.m_Name));
    const p = table('AttributeData').find(a => a.m_Name === 'Prestige');
    const prestigeActs = table('ChamberActionData').filter(a => hasText(a) && actionHome.has(a._id) && a.Rewards.RewardEntries.some(e => e.Id === p.Id)).sort((a, b) => ((a.GatingAttributes.RewardEntries[0] || {}).Value || 0) - ((b.GatingAttributes.RewardEntries[0] || {}).Value || 0));
    const stockProfit = 400;
    const example = [
      [s('ex attrs', { 'pt-BR': `Felicidade, Saúde e Higiene entre ${n(vt[1].MinValue)} e ${n(vt[1].MaxValue)} nos ${rounds} turnos (3 × ${vt[1].Score} × ${rounds})`, en: `Happiness, Health and Hygiene between ${n(vt[1].MinValue)} and ${n(vt[1].MaxValue)} on all ${rounds} turns (3 × ${vt[1].Score} × ${rounds})` }), 3 * vt[1].Score * rounds],
      [s('ex xp', { 'pt-BR': `Chegou ao nível ${xp[1].Level} de EXP de Trabalho (${xp[0].Score} + ${xp[1].Score})`, en: `Reached Work XP level ${xp[1].Level} (${xp[0].Score} + ${xp[1].Score})` }), xp[0].Score + xp[1].Score],
      [s('ex rent', { 'pt-BR': `Pagou dois aluguéis em dia em ${title(lang, homes[0])} (2 × ${homes[0].RentScore})`, en: `Paid rent on time twice in the ${title(lang, homes[0])} (2 × ${homes[0].RentScore})` }), 2 * homes[0].RentScore],
      [s('ex course', { 'pt-BR': 'Concluiu um curso de 150 pontos', en: 'Finished a course worth 150 points' }), 150],
      [s('ex pet', { 'pt-BR': `Terminou com um pet contente (30 × ${rounds})`, en: `Ended with one content pet (30 × ${rounds})` }), 30 * rounds],
      [s('ex stock', { 'pt-BR': `Vendeu ações com ${n(stockProfit)} de lucro`, en: `Sold stocks at a ${n(stockProfit)} profit` }), stockProfit * stockMult],
    ];
    const total = example.reduce((a, r) => a + r[1], 0);
    const guide = (slug, texts) => `<a href="/${d}/guides/${slug}/">${s(`link ${slug}`, texts)}</a>`;
    return [
      ['', `<p>${s('intro (ScoreScreenPanel.AssignWinner, RoundManager.IsFinalRoundEnding)', { 'pt-BR': `Walk of Life não termina quando alguém fica rico: termina depois do número de rodadas escolhido ao criar a partida: ${roundList}. Durante a partida, quase tudo o que você faz bem rende pontos: trabalhar, estudar, pagar o aluguel e se manter feliz e saudável. Na última contagem entram ainda os móveis e os pets que você tem. Quem tiver mais pontos somados ganha.`, en: `Walk of Life does not end when someone gets rich. It ends after the number of rounds chosen at setup: ${ROUND_CHOICES.slice(0, -1).join(', ')} or ${ROUND_CHOICES[ROUND_CHOICES.length - 1]}. During the game, almost everything you do well earns points: working, studying, paying rent and staying happy and healthy. The final count also adds your furniture and pets. Whoever has the most points wins.` })}</p>`],
      [s('ending', { 'pt-BR': 'Quando a partida acaba', en: 'When the game ends' }), `<ul class="plain"><li>${s('rounds (RoundManager.IsFinalRoundEnding, GameplayConfig)', { 'pt-BR': `Quando a última rodada termina. Todos jogam essa rodada até o fim.`, en: `When the last round finishes. Everyone plays that round to the end.` })}</li><li>${s('no score ending (IsFinalRoundEnding reads only rounds; GameRoomInfo.EndScore has no reader)', { 'pt-BR': 'Chegar a uma certa pontuação não encerra o jogo antes da hora.', en: 'Reaching a certain score does not end the game early.' })}</li><li>${s('challenges (ChallengeManager.EndGameAtRound)', { 'pt-BR': 'A exceção são os Desafios, que podem acabar antes, assim que o desafio é resolvido.', en: 'The exception is Challenges, which can end earlier, as soon as the challenge is resolved.' })}</li></ul>`],
      [s('winner', { 'pt-BR': 'Quem ganha', en: 'Who wins' }), `<ul class="plain"><li>${s('highest total (AssignWinner, PlayerScoreInfo.TotalScore)', { 'pt-BR': 'Só a soma final importa. Dinheiro guardado não vale pontos por si só.', en: 'Only the final total matters. Money you saved is not worth points by itself.' })}</li><li>${s('tie (AssignWinner: equal totals are added to the winners)', { 'pt-BR': 'Se dois jogadores empatarem no topo, os dois ganham. Não existe critério de desempate.', en: 'If two players tie at the top, both win. There is no tiebreak.' })}</li><li>${s('no bankruptcy (no surrender or bankruptcy code in the game flow)', { 'pt-BR': 'Ficar sem dinheiro ou sem emprego não tira você do jogo. Você segue jogando e somando pontos até o fim.', en: 'Running out of money or losing your job does not knock you out of the game. You keep playing and scoring until the end.' })}</li></ul>`],
      [s('categories', { 'pt-BR': 'De onde vêm os pontos', en: 'Where points come from' }), simpleTable([ui(lang, 'category'), s('col how', { 'pt-BR': 'Como você ganha', en: 'How you earn it' }), s('col much', { 'pt-BR': 'Quanto vale', en: 'How much' }), s('col when', { 'pt-BR': 'Quando conta', en: 'When it counts' })], [
        [gameText(lang, 'score_type_attributes'), s('attr how (ValueTriggerData, TimingType.TurnEnd)', { 'pt-BR': 'Mantendo Felicidade, Saúde e Higiene altas. O jogo confere cada uma delas separadamente.', en: 'Keeping Happiness, Health and Hygiene high. The game checks each one separately.' }), s('attr much', { 'pt-BR': `Por atributo: ${vt.map(v => `de ${n(v.MinValue)} a ${n(v.MaxValue)}, ${n(v.Score)} pontos`).join('; ')}. Abaixo de ${n(vt[0].MinValue)}, nada. Conta em todo turno, então partida mais longa soma mais.`, en: `Per attribute: ${vt.map(v => `${n(v.MinValue)} to ${n(v.MaxValue)}, ${n(v.Score)} points`).join('; ')}. Below ${n(vt[0].MinValue)}, nothing. It counts every turn, so longer games add up to more.` }), when.turn],
        [gameText(lang, 'score_type_xp'), s('xp how (ExperiencePointData.Score, CheckForJobExperience)', { 'pt-BR': 'Trabalhando. Toda vez que sua EXP de Trabalho sobe de nível, você ganha pontos.', en: 'Working. Each time your Work XP levels up, you get points.' }), s('xp much', { 'pt-BR': xp.map(x => `Nível ${x.Level}: ${n(x.Score)}`).join(', '), en: xp.map(x => `Level ${x.Level}: ${n(x.Score)}`).join(', ') }), when.now],
        [gameText(lang, 'score_type_education'), s('edu how (EducationData.CompletionReward)', { 'pt-BR': `Concluindo cursos ${placeIn(lang, 'Academy')}.`, en: `Finishing courses at the ${place(lang, 'Academy')}.` }), s('edu much', { 'pt-BR': `${span(edu)} pontos por curso.`, en: `${span(edu)} points per course.` }), when.now],
        [gameText(lang, 'score_type_rent'), s('rent how (HomeData.RentScore)', { 'pt-BR': 'Pagando o aluguel em dia. Ele vence a cada 4 rodadas, e casa melhor rende mais.', en: 'Paying rent on time. It comes due every 4 rounds, and a better home pays more.' }), s('rent much', { 'pt-BR': `Por pagamento: ${homes.map(h => `${title(lang, h)}, ${n(h.RentScore)}`).join('; ')}.`, en: `Per payment: ${homes.map(h => `${title(lang, h)}, ${n(h.RentScore)}`).join('; ')}.` }), when.now],
        [gameText(lang, 'score_type_quests'), s('quest how (Quest.Rewards, ResourceType.Score)', { 'pt-BR': 'Completando Missões.', en: 'Completing quests.' }), s('quest much', { 'pt-BR': `${span(quest)} pontos, conforme a Missão.`, en: `${span(quest)} points, depending on the quest.` }), when.now],
        [gameText(lang, 'score_type_role'), s('role how (RoleQuestChain, Adventurer.LevelUpRewards)', { 'pt-BR': 'Completando a sequência de Missões do seu papel. O Aventureiro também ganha pontos ao subir de nível no papel.', en: 'Completing your role\'s quest line. The Adventurer also earns points when leveling up the role.' }), s('role much', { 'pt-BR': `Cinco etapas: ${roleSteps.map(n).join(', ')}. Completar todas dá ${n(roleSteps.reduce((a, b) => a + b, 0))}. Aventureiro: 50 e 100 em dois níveis.`, en: `Five steps: ${roleSteps.map(n).join(', ')}. All five total ${n(roleSteps.reduce((a, b) => a + b, 0))}. The Adventurer also earns 50 and 100 at two levels.` }), when.now],
        [gameText(lang, 'score_type_stocks'), s('stock how (HandleInsideChamberState: AddScore(Stocks, GetProfitOfStockSell), CoreData)', { 'pt-BR': 'Vendendo ações com lucro. Lucro é o que você recebe na venda menos o que pagou.', en: 'Selling stocks at a profit. Profit is what you get from the sale minus what you paid.' }), s('stock much', { 'pt-BR': `Um quarto do lucro: cada ${n(100)} de lucro viram ${n(100 * stockMult)} pontos.`, en: `A quarter of the profit: every ${n(100)} of profit becomes ${n(100 * stockMult)} points.` }), when.now],
        [gameText(lang, 'score_type_furniture'), s('furn how (ScoreHandler.GetFurnitureScore)', { 'pt-BR': 'Tendo móveis colocados em casa quando o jogo acaba. O valor de cada móvel está na página dele.', en: 'Having furniture placed at home when the game ends. Each piece\'s value is on its page.' }), s('furn much', { 'pt-BR': `${span(furn)} pontos por móvel.`, en: `${span(furn)} points per piece.` }), when.end],
        [gameText(lang, 'score_type_pets'), s('pet how (ScoreHandler.CreatePlayerScoreInfo, PetState.IsFeeling)', { 'pt-BR': 'Tendo pets bem cuidados quando o jogo acaba. Conta o humor de cada pet.', en: 'Having well-cared-for pets when the game ends. Each pet\'s mood counts.' }), s('pet much', { 'pt-BR': `Por pet, vezes o número de rodadas da partida: negligenciado 5, contente 30, mimado 45. Veja a tabela abaixo.`, en: `Per pet, times the number of rounds in the game: neglected 5, content 30, pampered 45. See the table below.` }), when.end],
        [s('arcade label', { 'pt-BR': 'Recordes do Fliperama', en: 'Arcade high scores' }), s('arcade how (ScoreHandler.CreatePlayerScoreInfo, ArcadeManager.GetAllTopScoresByChamberActions)', { 'pt-BR': 'O Fliperama tem 3 máquinas, cada uma com seu recorde. Quem termina a partida com o recorde de uma máquina leva os pontos dela.', en: 'The Arcade has 3 machines, each with its own high score. Whoever ends the game holding a machine\'s record takes its points.' }), s('arcade much', { 'pt-BR': `${ARCADE_POINTS_PER_ROUND} pontos por recorde, vezes o número de rodadas da partida. Veja a tabela abaixo.`, en: `${ARCADE_POINTS_PER_ROUND} points per record, times the number of rounds in the game. See the table below.` }), when.end],
        [plain(attrName(lang, 'Prestige')), s('prestige how', { 'pt-BR': 'Só existe no mapa Schnitzelland. Explicação logo abaixo.', en: 'Only exists on the Schnitzelland map. Explained just below.' }), s('prestige much (PrestigeManager.PrestigeRankScoring, Level.prefab)', { 'pt-BR': `1º lugar ${n(PRESTIGE_POINTS[0])}, 2º ${n(PRESTIGE_POINTS[1])}, 3º ${n(PRESTIGE_POINTS[2])}.`, en: `1st place ${n(PRESTIGE_POINTS[0])}, 2nd ${n(PRESTIGE_POINTS[1])}, 3rd ${n(PRESTIGE_POINTS[2])}.` }), when.end],
        ...(fishPts.length ? [[s('fishing label', { 'pt-BR': 'Pesca', en: 'Fishing' }), s('fishing how (ScoreHandler.GetFishingScore, RegisterCaughtFish)', { 'pt-BR': 'Pescando. O jogo registra os peixes que você pega e, no fim, soma o valor de cada um.', en: 'Fishing. The game records the fish you catch and, at the end, adds up each one\'s value.' }), s('fishing much (FishScoreMultiplierPerRound 0.02)', { 'pt-BR': `Cada peixe vale o valor dele (${span(fishPts)}) × R × 0,02, em que R é o número de rodadas da partida. Com 50 rodadas, R × 0,02 dá 1 e o peixe vale o valor inteiro; com menos, vale proporcionalmente menos.`, en: `Each fish is worth its value (${span(fishPts)}) × R × 0.02, where R is the number of rounds in the game. At 50 rounds, R × 0.02 is 1 and the fish is worth its full value; with fewer rounds, proportionally less.` }), when.end]] : []),
        [gameText(lang, 'score_type_other'), s('other how (ScoreHandler.AddScore: ReportGiveReward, VoteReward)', { 'pt-BR': 'Pontos que vêm de avisos do jogo e de votações.', en: 'Points that come from game reports and votes.' }), s('other much', { 'pt-BR': 'Muda em cada caso. Não existe um valor único.', en: 'It varies case by case. There is no single value.' }), when.now],
      ])],
      [s('length', { 'pt-BR': 'O que muda com a duração da partida', en: 'What changes with game length' }), `<p>${s('length rule (ScoreHandler.CreatePlayerScoreInfo: NumberOfRounds * 5/30/45 and * 15)', { 'pt-BR': 'Pets, recordes do Fliperama e peixes valem mais em partidas longas, porque o valor é multiplicado pelo número de rodadas. Nas categorias de valor fixo, como aluguel, cursos e níveis de EXP, cada conquista vale sempre o mesmo. O que muda é quantas vezes você consegue fazer: mais turnos, mais aluguéis pagos, mais níveis.', en: 'Pets, Arcade records and fish are worth more in long games, because the value is multiplied by the number of rounds. In the fixed-value categories, such as rent, courses and XP levels, each achievement is always worth the same. What changes is how many times you can do it: more turns, more rents paid, more levels.' })}</p>${simpleTable([s('length rounds', { 'pt-BR': 'Rodadas', en: 'Rounds' }), s('length neglected', { 'pt-BR': 'Pet negligenciado', en: 'Neglected pet' }), s('length content', { 'pt-BR': 'Pet contente', en: 'Content pet' }), s('length pampered', { 'pt-BR': 'Pet mimado', en: 'Pampered pet' }), s('length record', { 'pt-BR': 'Cada recorde', en: 'Each record' })], ROUND_CHOICES.map(r => [r, n(5 * r), n(30 * r), n(45 * r), n(ARCADE_POINTS_PER_ROUND * r)]))}`],
      [plain(attrName(lang, 'Prestige')), `<p>${s('prestige what (AttributeData.Prestige, MapLayoutData.UsesAttribute, PrestigeManager)', { 'pt-BR': `Prestígio mede o quanto você é visto como gente fina. Só aparece no mapa Schnitzelland. Você começa com ${n(p.DefaultValue)}, pode chegar a ${n(p.Max)} e ganha fazendo as ações de ${link(lang, resort, title(lang, resort))}. Nada no jogo tira Prestígio depois que você o ganha.`, en: `Prestige measures how classy people think you are. It only appears on the Schnitzelland map. You start at ${n(p.DefaultValue)}, can reach ${n(p.Max)} and earn it through the actions at the ${link(lang, resort, title(lang, resort))}. Nothing in the game takes Prestige away once you have it.` })}</p><p>${s('prestige ranking (GetPrestigeScoringForPlayers)', { 'pt-BR': 'No fim da partida, o jogo faz um ranking do Prestígio de todos, e só os três primeiros ganham pontos. Algumas ações só liberam depois que você tem um mínimo de Prestígio.', en: 'When the game ends, everyone\'s Prestige is ranked and only the top three get points. Some actions only unlock once you have a minimum of Prestige.' })}</p>${simpleTable([ui(lang, 'action'), s('prestige gate', { 'pt-BR': 'Prestígio mínimo', en: 'Minimum Prestige' }), s('prestige gives', { 'pt-BR': 'Custos e ganhos', en: 'Costs and gains' })], prestigeActs.map(a => [title(lang, a), n((a.GatingAttributes.RewardEntries[0] || {}).Value || 0), effects(lang, a.Rewards.RewardEntries)]))}`],
      [s('show', { 'pt-BR': 'A tela de resultado', en: 'The results screen' }), `<p>${s('score screen (ScoreScreenPanel, CoreData.Dialogs)', { 'pt-BR': 'Quando a última rodada acaba, um apresentador mostra uma categoria de cada vez e faz piada com o resultado. Ele pode dizer que alguém dominou uma categoria, mas isso é só fala: não dá nem tira pontos.', en: 'When the last round ends, a host shows one category at a time and jokes about the result. They may say someone dominated a category, but that is only talk: it neither gives nor takes points.' })}</p>`],
      [s('example', { 'pt-BR': 'Exemplo de conta', en: 'Worked example' }), `<p>${s('example intro', { 'pt-BR': `Um jogador imaginário numa partida de ${rounds} rodadas:`, en: `A hypothetical player in a ${rounds}-round game:` })}</p>${simpleTable([s('ex col', { 'pt-BR': 'O que fez', en: 'What they did' }), s('ex pts', { 'pt-BR': 'Pontos', en: 'Points' })], [...example.map(([a, b]) => [a, n(b)]), [`<strong>${s('ex total', { 'pt-BR': 'Total', en: 'Total' })}</strong>`, `<strong>${n(total)}</strong>`]])}`],
      [s('related', { 'pt-BR': 'Veja também', en: 'See also' }), `<p>${[guide('attributes', { 'pt-BR': 'Atributos', en: 'Attributes' }), guide('jobs', { 'pt-BR': 'Empregos e promoção', en: 'Jobs and promotion' }), guide('education', { 'pt-BR': 'Educação', en: 'Education' }), guide('housing', { 'pt-BR': 'Moradia e aluguel', en: 'Housing and rent' }), guide('pets', { 'pt-BR': 'Pets', en: 'Pets' }), guide('stocks', { 'pt-BR': 'Bolsa de valores', en: 'Stock market' })].join(' · ')}</p>`],
    ];
  } },
  require('./guias/stocks.js')(guideHelpers),
  require('./guias/pawn-shop.js')(guideHelpers),
  require('./guias/glossary.js')(guideHelpers),
  worldGuides.globalEvents,
  worldGuides.mayor,
  worldGuides.bots,
  worldGuides.hunger,
  worldGuides.debt,
  worldGuides.bank,
];
const ARCADE_POINTS_PER_ROUND = 15; // ScoreHandler.CreatePlayerScoreInfo: NumberOfRounds * 15 for each machine record
const ROUND_CHOICES = [10, 20, 30, 40, 50]; // CustomizeGameMenu.SetDefaultOptions, round count slider
const PAWN_LIFESPAN = 4; // PawnShopManager.PawnedItemLifespan
const PRESTIGE_POINTS = [400, 250, 150]; // PrestigeManager.PrestigeRankScoring in Level.prefab (read with AssetRipper)
function guidePage(lang, g) {
  const s = (id, texts) => say(lang, `guide ${g.slug}`, id, texts);
  const name = s('title', g.title);
  let body = '';
  const links = [];
  g.sections(lang, s).forEach(([h, html], i) => {
    const id = `s${i}`;
    if (h) links.push({ id, label: h });
    body += `<section id="${id}">${h ? `<h2>${h}</h2>` : ''}${html}</section>`;
  });
  page(lang, `guides/${g.slug}/`, { title: plain(name), body: articleLayout(`${crumbs(lang, 'guides', name)}<h1>${name}</h1>`, toc(lang, links), body), section: 'guides' });
}
// Grouped hub: the model for section landing pages. Card heights match row by row.
GUIDES.forEach(g => Object.assign(g.title, guideTitles(g.slug)));
const GUIDE_HUB = [
  [['glossary', 'Icon-Item-Edu-Starting-Book-Big'], ['time', 'Icon-Attribute-Time'], ['attributes', 'Icon-Attribute-Happiness'], ['scoring', 'Icon-Attribute-Score']],
  [['jobs', 'Icon-Job-Tier-3'], ['education', 'Icon-Item-Edu-Starting-Diploma'], ['clothes', 'Icon-Clothes-Tier3']],
  [['housing', 'Icon-Key-Fancy'], ['pets', 'Icon-Trait-Cat'], ['maps', 'Icon-Metro-Pass']],
  [['stocks', 'Icon-Location-Bank'], ['pawn-shop', 'Icon-Attribute-Cash'], ['global-events', 'Icon-Quest-Hard']],
  [['hunger', 'Icon-Attribute-Hunger'], ['debt', 'Icon-Attribute-Cash'], ['bank', 'Icon-Location-Bank'], ['mayor', 'Icon-Location-CityHall'], ['bots', 'Robot-Tutorial-Report']],
];
function guidesIndex(lang) {
  const d = langDir(lang);
  const sections = GUIDE_HUB.map((group, i) => `<section class="hub-group"><h2>${hubText(lang, `group_${i}`)}</h2><div class="hub-cards">${group.map(([slug, art]) => hubCard(`/${d}/guides/${slug}/`, icon(spriteRef(art), 56), plain(GUIDES.find(g => g.slug === slug).title[lang]), hubText(lang, `guide_${slug}`))).join('')}</div></section>`).join('');
  const robot = icon(spriteRef('Robot-Tutorial-Report'), 145, ' hub-robot');
  const body = `<div class="hub"><header class="hub-head"><div><h1>${ui(lang, 'guides')}</h1><p>${hubText(lang, 'intro_guides')}</p><a class="btn btn-main" href="/${d}/guides/time/">${hubText(lang, 'startBtn')}</a></div>${robot}</header>${sections}${SUG.guidesAction(lang)}</div>`;
  page(lang, 'guides/', { title: ui(lang, 'guides'), body, section: 'guides' });
}

// ---------------------------------------------------------------- Build
fs.rmSync(DIST, { recursive: true, force: true, maxRetries: 5 });
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
for (const f of ['style.css', 'app.js', 'attrs.svg', 'logo.png', 'wordmark.svg', 'hero.jpg', 'game-logo.png', 'gamedifficulty-easy.png', 'gamedifficulty-medium.png', 'gamedifficulty-hard.png']) fs.copyFileSync(path.join(__dirname, 'assets', f), path.join(DIST, 'assets', f));
fs.copyFileSync(path.join(__dirname, 'assets', 'favicon.ico'), path.join(DIST, 'favicon.ico'));
SUG.copyAssets(DIST);

// Modificadores: tools/explicacoes/modificadores.js.
const MOD = require('./explicacoes/modificadores.js')({ RAW, byRef, byId, tx, spanLang, title, titleText, link, esc, plain, number, ui, hubText, say, page, crumbs, callout, howBlock, chipBar, goCell, GO_TH, articleLayout, ficha, fact, langDir, flavor, effects, simpleTable, roles, items, locations, assignSlugs, hasText, hubHead, placeIn });
for (const { code: lang, dir } of LANGS) {
  homePage(lang);
  itemsIndex(lang);
  jobsIndex(lang);
  locationsIndex(lang);
  items.forEach(i => itemPage(lang, i));
  jobs.forEach(j => jobPage(lang, j));
  locations.forEach(l => locationPage(lang, l));
  guidesIndex(lang);
  GUIDES.forEach(g => guidePage(lang, g));
  questsIndex(lang);
  eventsIndex(lang);
  rolesIndex(lang);
  petsIndex(lang);
  MOD.render(lang);
  page(lang, 'about/', CREDITS.aboutPage(lang));
  quests.forEach(q => questPage(lang, q));
  events.forEach(e => eventPage(lang, e));
  roles.forEach(r => rolePage(lang, r));
  const entry = (rec, section) => ({ t: titleText(lang, rec) + LOC.searchLabel(lang, rec, section), u: `${section}/${rec._slug}/`, s: ui(lang, section) });
  const search = [...items.map(r => entry(r, 'items')), ...jobs.map(r => entry(r, 'jobs')), ...locations.map(r => entry(r, 'locations')), ...quests.map(r => entry(r, 'quests')), ...events.map(r => entry(r, 'events')), ...roles.map(r => entry(r, 'roles')), ...MOD.searchEntries(lang), ...GUIDES.map(g => ({ t: plain(say(lang, `guide ${g.slug}`, 'title', g.title)), u: `guides/${g.slug}/`, s: ui(lang, 'guides') }))];
  fs.writeFileSync(path.join(DIST, dir, 'search.json'), JSON.stringify(search));
}

// Root: send visitors to their browser language.
const prefer = JSON.stringify(LANGS.map(l => [l.code.toLowerCase(), l.dir]));
writePage('index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>WOL Wiki</title><link rel="stylesheet" href="/assets/style.css">
<script>(function(){var m=${prefer},l=(navigator.languages||[navigator.language||"en"]);for(var i=0;i<l.length;i++){var c=l[i].toLowerCase();for(var j=0;j<m.length;j++){if(c===m[j][0]||c.split("-")[0]===m[j][0].split("-")[0]){location.replace("/"+m[j][1]+"/");return}}}location.replace("/en/")})()</script></head>
<body><main><div class="wrap"><h1>WOL Wiki</h1><ul class="plain">${LANGS.map(l => `<li><a href="/${l.dir}/">${l.name}</a></li>`).join('')}</ul></div></main><footer>${CREDITS.footer('en')}</footer></body></html>`);

fs.mkdirSync(path.join(DIST, 'icons'), { recursive: true });
for (const f of usedIcons) fs.copyFileSync(path.join(DATA, 'icons', f), path.join(DIST, 'icons', f));

const urls = [''].concat(['items/', 'jobs/', 'locations/', 'quests/', 'events/', 'roles/', 'pets/', 'guides/', 'about/'], GUIDES.map(g => `guides/${g.slug}/`), items.map(r => `items/${r._slug}/`), jobs.map(r => `jobs/${r._slug}/`), locations.map(r => `locations/${r._slug}/`), quests.map(r => `quests/${r._slug}/`), events.map(r => `events/${r._slug}/`), roles.map(r => `roles/${r._slug}/`), MOD.urls());
writePage('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${LANGS.flatMap(l => urls.map(u => `<url><loc>${SITE}/${l.dir}/${u}</loc></url>`)).join('')}</urlset>\n`);
writePage('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

// Cloudflare Pages picks these two up from the output root.
writePage('_headers', `/assets/*\n  Cache-Control: public, max-age=86400\n\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`);
writePage('404.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>404 · WOL Wiki</title><link rel="stylesheet" href="/assets/style.css"></head>
<body><main><div class="wrap"><h1>404</h1><ul class="plain">${LANGS.map(l => `<li lang="${l.code}"><a href="/${l.dir}/">${ui(l.code, 'notFound')} · ${l.name}</a></li>`).join('')}</ul></div></main><footer>${CREDITS.footer('en')}</footer></body></html>`);

fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
const unresolved = Object.keys(report.unresolved).sort();
const fallbackTitles = Object.keys(report.fallbackTitles || {}).sort();
// Two renames, so dist/ is never half deleted; only the old copy is removed slowly.
const OLD_DIST = path.join(ROOT, 'dist.old');
fs.rmSync(OLD_DIST, { recursive: true, force: true, maxRetries: 5 });
// Windows refuses the rename while another process is reading a file inside dist; try again for up to 30 s.
function renameRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(from, to); return; } catch (err) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code) || attempt >= 60) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
}
if (fs.existsSync(FINAL_DIST)) renameRetry(FINAL_DIST, OLD_DIST);
renameRetry(DIST, FINAL_DIST);
fs.rmSync(OLD_DIST, { recursive: true, force: true, maxRetries: 5 });
if (BUILD) fs.writeFileSync(BUILD_FILE, BUILD);
fs.writeFileSync(path.join(ROOT, 'build', 'report.json'), JSON.stringify({ aliased: report.aliased, unresolved, fallbackTitles, pagesWithoutHowItWorks: withoutHow(), writtenForSite: { note: 'Sentences written for this site, not official game text. The label says where each fact came from.', sentences: [...writtenForSite].sort() }, images: Object.fromEntries(Object.entries(imageAudit).map(([k, v]) => { const { seen, ...rest } = v; return [k, rest]; })), unofficialNames: { note: 'Written for this site; the game has no text for these in any language (see EXTRA_NAMES in tools/i18n.js).', assets: Object.keys(report.unofficial || {}).sort() } }, null, 1));
console.log('without How it works:', JSON.stringify(Object.fromEntries(Object.entries(withoutHow()).map(([k, v]) => [k, `${v.count}/${v.total}`]))));
const imageTotals = { real: 0, related: 0, reserve: 0, none: 0 };
for (const v of Object.values(imageAudit)) for (const k of Object.keys(imageTotals)) imageTotals[k] += v[k];
for (const [kind, v] of Object.entries(imageAudit)) if (v.none) console.warn(`WARNING: ${v.none} ${kind} without an image: ${v.noneNames.slice(0, 8).join(', ')}`);
console.log(JSON.stringify({
  images: imageTotals,
  pages: pageCount, quests: quests.length, events: events.length, roles: roles.length, pets: pets.length, icons: usedIcons.size, items: items.length, jobs: jobs.length, locations: locations.length,
  aliased: Object.keys(report.aliased).length, unresolved: unresolved.length, fallbackTitles: fallbackTitles.length,
  actionsPlaced: actionHome.size, itemsWithSource: [...obtain.keys()].length,
  unresolvedSample: unresolved.slice(0, 15), fallbackSample: fallbackTitles.slice(0, 15),
}, null, 1));
