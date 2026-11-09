'use strict';
// Páginas de itens, móveis e pets: bloco "Como funciona" reescrito a partir dos dados.
// Chamado por tools/build-site.js (explainItem, itemPage). Cada frase passa por say(), com o id citando a fonte.
// Regras e números conferidos em docs/engenharia-reversa.md ("Itens, móveis e pets").
module.exports = function criar(getCtx) {
  let C = null;
  const ctx = () => C || (C = getCtx());
  let D = null;

  // Ações que nenhuma sala, traço ou papel põe no jogo (só aparecem no ChallengeStorage.RecordNames) ou que não têm dono.
  const DEAD = new Set(['Buy Mining Laser', 'Cleansing Food', 'Food for 2 Weeks', 'Food for 4 Weeks', 'Buy Bed Cardboard', 'Go Fishing Sturdy', 'Go Mining', 'Buy Friendship Crate']);
  // Pesca: cada ação, a vara que a dá e se gasta isca (Fishing-Bait-Replace-Actions, ChamberActionData.RequiredItems).
  const FISH_ACTS = [
    ['Go Fishing', 'Fishing Pole', false],
    ['Go Fishing (Bait)', 'Fishing Pole', true],
    ['Go Fishing Master', 'Fishing Pole - Master', false],
    ['Go Fishing - Master (Bait)', 'Fishing Pole - Master', true],
    ['Go Fishing Magnet', 'Fishing Pole - Magnet', false],
  ];

  function kit(lang, page) {
    const c = ctx();
    return {
      c, lang, page,
      s: (id, pt, en) => c.say(lang, page, id, { 'pt-BR': pt, en }),
      n: v => c.number(lang, v),
      t: rec => c.title(lang, rec),
      tt: rec => c.titleText(lang, rec),
      l: rec => c.link(lang, rec, c.title(lang, rec)),
      attr: name => c.plain(c.attrName(lang, name)),
      act: name => { const a = c.table('ChamberActionData').find(x => x.m_Name === name); return a ? c.title(lang, a) : name; },
      item: name => { const i = c.items.find(x => x.m_Name === name) || c.table('ItemData').find(x => x.m_Name === name); return i ? (i._slug ? c.link(lang, i, c.title(lang, i)) : c.title(lang, i)) : name; },
      pt: lang === 'pt-BR',
    };
  }

  // ------------------------------------------------------------------ nomes de lugar com a preposição certa
  // Em português: "na Pet Shop", "no Banco", "no Parque". Em inglês: só os links. O artigo vem do nome do lugar (lugares.js).
  const { comPreposicao } = require('./lugares');
  function emLugar(K, l, kind) {
    const c = K.c;
    if (!K.pt) return c.link(K.lang, l, c.title(K.lang, l));
    const t = c.titleText(K.lang, l);
    return comPreposicao(/^Pet Shop/.test(t) ? `A ${t}` : t, kind || 'em', label => c.link(K.lang, l, c.esc(label)));
  }
  const juntarOu = partes => (partes.length < 2 ? partes.join('') : `${partes.slice(0, -1).join(', ')} ou ${partes[partes.length - 1]}`);
  function juntar(K, partes) {
    if (partes.length < 2) return partes.join('');
    return `${partes.slice(0, -1).join(', ')}${K.pt ? ' e ' : ' and '}${partes[partes.length - 1]}`;
  }
  const unicos = (K, locs) => { const seen = new Set(); return locs.filter(l => { const k = K.c.titleText(K.lang, l); if (seen.has(k)) return false; seen.add(k); return true; }); };
  // Lista de lugares com preposição ("na Pet Shop e no Shopping"), para frases do tipo "Compre ...".
  const emLugares = (K, locs, extra) => juntar(K, [...unicos(K, locs).map(l => emLugar(K, l)), ...(extra ? [extra] : [])]);
  // Lista sem preposição ("Clucker's, Faculdade e Shopping"), para usar entre parênteses.
  const lista = (K, locs) => (K.pt ? juntar(K, unicos(K, locs).map(l => K.c.link(K.lang, l, K.c.title(K.lang, l)))) : K.c.placesOf(K.lang, locs));
  const parque = K => K.c.locations.find(l => /Garden City/.test(l.m_Name));
  const plural = (v, um, varios) => (v === 1 ? um : varios);

  // ------------------------------------------------------------------ índices (uma vez)
  function dados() {
    if (D) return D;
    const c = ctx();
    const { RAW, deref, byId, locations } = c;
    D = { placement: new Map(), ownersOf: new Map(), itemsOfTrait: new Map(), quest: new Map() };
    // traço -> itens que o dão
    for (const it of c.table('ItemData')) for (const e of ((it.Rewards || {}).RewardEntries || [])) if (e.Type === 110) { const t = byId.get(e.Id); if (t) { if (!D.itemsOfTrait.has(t._id)) D.itemsOfTrait.set(t._id, []); D.itemsOfTrait.get(t._id).push(it); } }
    // efeito -> traços que o possuem (efeito sem dono não vale nada)
    const traits = RAW['Gameplay.Traits.Trait'] || [];
    for (const t of traits) for (const e of t.Effects || []) { if (!D.ownersOf.has(e.id)) D.ownersOf.set(e.id, []); D.ownersOf.get(e.id).push(t); }
    const chamberLocs = new Map();
    for (const loc of locations) for (const ch of (loc.Chambers || []).map(deref).filter(Boolean)) { if (!chamberLocs.has(ch._id)) chamberLocs.set(ch._id, []); chamberLocs.get(ch._id).push({ loc, ch }); }
    const put = (a, loc, ch) => {
      if (!a || !loc) return;
      if (!D.placement.has(a._id)) D.placement.set(a._id, new Map());
      const m = D.placement.get(a._id);
      const home = /Living|Rent/.test(ch.m_Name);
      const old = m.get(loc._id);
      m.set(loc._id, { loc, home: old ? old.home && home : home });
    };
    for (const loc of locations) for (const ch of (loc.Chambers || []).map(deref).filter(Boolean)) for (const a of (ch.Actions || []).map(deref).filter(Boolean)) put(a, loc, ch);
    const owned = e => (D.ownersOf.get(e._id) || []).length > 0;
    for (const [cls, recs] of Object.entries(RAW)) {
      if (!/TraitEffect/.test(cls)) continue;
      for (const e of recs) {
        if (!owned(e)) continue;
        if (Array.isArray(e.Chambers) && Array.isArray(e.ChamberActions)) for (const ch of e.Chambers.map(deref).filter(Boolean)) for (const lc of chamberLocs.get(ch._id) || []) for (const a of e.ChamberActions.map(deref).filter(Boolean)) put(a, lc.loc, lc.ch);
        if (e.Chamber && e.ChamberAction) { const ch = deref(e.Chamber); for (const lc of chamberLocs.get(ch && ch._id) || []) put(deref(e.ChamberAction), lc.loc, lc.ch); }
      }
    }
    for (const e of RAW['Gameplay.Traits.TraitEffectScripts.ReplaceChamberActionsTraitEffect'] || []) {
      if (!owned(e)) continue;
      for (const p of e.ActionsToReplace || []) {
        const from = deref(p.ToCompareWith), to = deref(p.ToReplaceWith);
        if (from && to && D.placement.has(from._id)) for (const v of D.placement.get(from._id).values()) { if (!D.placement.has(to._id)) D.placement.set(to._id, new Map()); D.placement.get(to._id).set(v.loc._id, v); }
      }
    }
    // missão -> item (objetivo cita o item, ação do objetivo exige o item, ou produz)
    const rec = (item, kind, holder, acts, type) => {
      if (!D.quest.has(item._id)) D.quest.set(item._id, { needs: new Map(), alt: new Map(), makes: new Map(), kinds: new Map() });
      if (type) { const kk = D.quest.get(item._id).kinds; if (!kk.has(holder)) kk.set(holder, new Set()); kk.get(holder).add(type); }
      const m = D.quest.get(item._id)[kind];
      if (!m.has(holder)) m.set(holder, new Set());
      for (const a of acts || []) m.get(holder).add(a);
    };
    for (const q of c.allQuests) {
      const holder = c.stepChain.get(q._id) || q;
      if (!holder._slug || !c.hasText(holder) || q.HideFromPlayer) continue;
      for (const o of Object.values(q.references || {})) {
        const acts = [].concat(o.ActionData || [], o.ActionDatas || [], o.Actions || []).map(deref).filter(Boolean);
        for (const i of [].concat(o.ItemData || [], o.TargetItem || []).map(deref).filter(Boolean)) rec(i, 'needs', holder, [], o.$type);
        if (!acts.length) continue;
        const req = new Map();
        for (const a of acts) for (const r of a.RequiredItems || []) { const i = byId.get(r.Id); if (i) { if (!req.has(i)) req.set(i, []); req.get(i).push(a); } }
        for (const [i, list] of req) rec(i, list.length === acts.length ? 'needs' : 'alt', holder, list);
        for (const a of acts) for (const e of c.collectEntries([a.Rewards, a.WeightedRewards])) if (e.Type === c.ITEM && e.Value > 0) { const i = byId.get(e.Id); if (i) rec(i, 'makes', holder, [a]); }
        D.quest.get('_single') || D.quest.set('_single', new Map());
        D.quest.get('_single').set(o, acts.length);
      }
    }
    return D;
  }

  // ------------------------------------------------------------------ onde uma ação existe
  // Lugares entre parênteses, sem preposição: "Banco, Academia Suadeira e Vexcorp" (mais "em casa, onde você mora").
  function textoOnde(K, locs, home) {
    const c = K.c;
    const homeTxt = K.s('where: at home (Living Room chambers)', 'em casa, onde você mora', 'at home, wherever you live');
    if (!K.pt) return [locs.length ? c.placesOf(K.lang, locs) : '', home ? homeTxt : ''].filter(Boolean).join(' and ');
    return juntar(K, [...unicos(K, locs).map(l => c.link(K.lang, l, c.title(K.lang, l))), ...(home ? [homeTxt] : [])]);
  }
  function whereOf(K, a) {
    const c = K.c, d = dados();
    const m = d.placement.get(a._id);
    if (!m) return { locs: [], home: false, text: '' };
    const all = [...m.values()];
    const locs = all.filter(v => !v.home).map(v => v.loc);
    const home = all.some(v => v.home);
    return { locs, home, text: textoOnde(K, locs, home) };
  }
  function costOf(K, a) {
    const c = K.c;
    const cash = -c.sumAttr(a.Rewards, 'Cash'), time = -c.sumAttr(a.Rewards, 'Time');
    const parts = [];
    if (cash > 0) parts.push(`${K.n(cash)} ${K.pt ? 'de ' : ''}${K.attr('Cash')}`);
    if (time > 0) parts.push(`${K.n(time)} ${K.pt ? 'de ' : ''}${K.attr('Time')}`);
    return { cash: Math.max(0, cash), time: Math.max(0, time), text: parts.join(K.pt ? ' e ' : ' and ') };
  }
  const qtyOf = (c, a, it) => c.collectEntries([a.Rewards]).filter(e => e.Type === c.ITEM && e.Id === it.Id && e.Value > 0).reduce((s, e) => s + e.Value, 0);
  const shopActs = (c, it) => [...(c.obtain.get(it._id) || [])].filter(a => !DEAD.has(a.m_Name) && c.sumAttr(a.Rewards, 'Cash') < 0);

  const ACTION_EFFECT = /^(Add\w*Action\w*TraitEffect|SeniorComplainTraitEffect|CosmicTreasureMapDigTraitEffect)$/;
  // Condição para a ação aparecer (curso, papel, modificador, missão, item na mochila).
  function gateOf(K, a) {
    const c = K.c, d = dados();
    const bits = [];
    const seen = new Set();
    const add = (k, html, key) => { const kk = key || html; if (!seen.has(kk)) { seen.add(kk); bits.push({ k, html }); } };
    const effects = c.pointersTo(a).filter(p => ACTION_EFFECT.test(p.cls) && (d.ownersOf.get(p.r._id) || []).length);
    for (const p of effects) {
      for (const t of d.ownersOf.get(p.r._id)) {
        for (const q of c.pointersTo(t)) {
          if (q.cls === 'EducationData' && c.hasText(q.r)) add('curso', K.s('gate: course', `depois do curso <strong>${K.t(q.r)}</strong>`, `after the course <strong>${K.t(q.r)}</strong>`));
          if (q.cls === 'ModifierData' && c.hasText(q.r)) add('mod', K.s('gate: modifier', `quando o modificador de partida <strong>${K.t(q.r)}</strong> (regra opcional da partida) está ligado`, `when the game modifier <strong>${K.t(q.r)}</strong> is on`));
          if (q.cls === 'Quest') { const h = c.stepChain.get(q.r._id) || q.r; if (h._slug && c.hasText(h)) add('missao', K.s('gate: quest', `durante ${questRef(K, h)}`, `during ${questRef(K, h)}`), `missao:${K.tt(h)}`); }
        }
        for (const it of d.itemsOfTrait.get(t._id) || []) if (it._slug) add('item', K.s('gate: item in backpack', `com ${K.l(it)} na mochila`, `with ${K.l(it)} in your inventory`));
        const role = /^Angler-/.test(p.r.m_Name) ? /angler/i : /^Senior-/.test(p.r.m_Name) ? /senior/i : null;
        if (role) { const r = c.roles.find(x => role.test(`${x.m_Name} ${x.Term || ''}`)); if (r) add('papel', K.s('gate: role', `para o papel ${K.l(r)}`, `for the ${K.l(r)} role`)); else if (/^Angler-/.test(p.r.m_Name)) add('papel', K.s('gate: angler role (Angler-Purchase-Better-Fishing-Poles)', 'para o papel Pescador', 'for the Angler role')); }
      }
    }
    return bits;
  }
  const questRef = (K, h) => (K.pt ? (/^miss/i.test(K.tt(h)) ? `a ${K.l(h)}` : `a missão ${K.l(h)}`) : `the quest ${K.l(h)}`);
  // Vários itens na mochila viram uma condição só: "com um destes itens na mochila: A, B ou C".
  function fundirItens(K, htmls) {
    if (!K.pt) return htmls;
    const re = /^com (.+) na mochila$/;
    const itens = htmls.filter(h => re.test(h));
    if (itens.length < 2) return htmls;
    const nomes = itens.map(h => re.exec(h)[1]);
    const juntos = nomes.length > 2 ? nomes.slice(0, -1).join(', ') + ' ou ' + nomes[nomes.length - 1] : nomes.join(' ou ');
    const fundido = 'com um destes itens na mochila: ' + juntos;
    const out = [];
    let posto = false;
    for (const h of htmls) { if (re.test(h)) { if (!posto) { out.push(fundido); posto = true; } } else out.push(h); }
    return out;
  }
  const gateText = (K, bits) => fundirItens(K, bits.map(b => b.html)).join(K.pt ? ' ou ' : ' or ');

  // ------------------------------------------------------------------ "Como conseguir"
  function obtainLines(K, it) {
    const c = K.c, d = dados(), page = it.m_Name, lang = K.lang;
    const lines = [];
    const got = [...(c.obtain.get(it._id) || [])].filter(a => !DEAD.has(a.m_Name));
    if (c.startingGear.has(it._id)) lines.push(K.s('starting gear (RealmData.StartingEquipment)', 'Todo jogador começa a partida com este item.', 'Every player starts the game with this item.'));
    // lojas
    const shops = new Map();
    for (const a of shopActs(c, it)) {
      if (!c.hasText(a)) continue;
      const w = whereOf(K, a), cost = costOf(K, a), g = gateOf(K, a);
      const questy = g.some(b => b.k === 'missao') || /^Quest ?Action|^QuestAction/.test(a.m_Name);
      if (questy) continue;
      const qty = qtyOf(c, a, it);
      const key = `${cost.text}|${qty}|${gateText(K, g)}`;
      if (!shops.has(key)) shops.set(key, { a, cost, qty, g, where: [] });
      shops.get(key).where.push(w);
    }
    for (const { a, cost, qty, g, where } of shops.values()) {
      const locs = [...new Set(where.flatMap(w => w.locs))];
      const home = where.some(w => w.home);
      const homeTxt = K.s('where: at home (Living Room chambers)', 'em casa, onde você mora', 'at home, wherever you live');
      const text = K.pt ? emLugares(K, locs, home ? homeTxt : '') : [locs.length ? c.placesOf(lang, locs) : '', home ? homeTxt : ''].filter(Boolean).join(' and ');
      if (!text) continue;
      const each = qty > 1 && cost.cash ? ` ${K.s('pack each (ChamberActionData cash / quantity)', `(${K.n(cost.cash / qty)} de Dinheiro cada)`, `(${K.n(cost.cash / qty)} Cash each)`)}` : '';
      lines.push(`<li>${K.s('shop line (ChamberActionData.Rewards: cash, time, quantity)', `Compre ${text}: ${cost.text}${qty > 1 ? `. Cada compra traz ${qty} unidades${each.replace(/^ /, ' ')}` : ''}${g.length ? `. Só aparece ${gateText(K, g)}` : ''}.`, `Buy at: ${text}. Costs ${cost.text}${qty > 1 ? `. Each purchase brings ${qty} units${each}` : ''}${g.length ? `. It only appears ${gateText(K, g)}` : ''}.`)}</li>`);
    }
    // pesca
    const fish = FISH_ACTS.map(([an, pole, bait]) => ({ a: got.find(x => x.m_Name === an), pole, bait })).filter(x => x.a);
    if (fish.length) {
      const pond = c.locations.find(l => /Garden City/.test(l.m_Name));
      const rows = fish.map(({ a, pole, bait }) => {
        const pct = c.dropChance(a, it);
        return `<strong>${K.t(a)}</strong> (${K.s('needs the pole', 'exige ', 'needs ')}${K.item(pole)}${bait ? K.s('with bait', ` e ${K.item('Fishing Bait')}`, ` and ${K.item('Fishing Bait')}`) : ''}): ${pct}%`;
      });
      lines.push(`<li>${K.s('fishing at the pond (Add-Fishing-To-Pond*, only Garden Pond)', `Pescando no lago ${pond ? emLugar(K, pond, 'de') : 'do Parque'}. Chance em cada ação: ${rows.join('; ')}.`, `Fishing at the pond (${pond ? K.l(pond) : 'the Park'}); Chance per action: ${rows.join('; ')}.`)}</li>`);
      if (/^Fishing - Special/.test(it.m_Name)) lines.push(`<li>${K.s('extra special fish (Angler-Add-Rewards-To-Fishing, Mystic-Pisces-Fishing-Normal, Pond-Rush-Effect)', `O papel Pescador (quem concluiu cursos de pesca), o signo de Peixes do papel ${(() => { const r = c.roles.find(x => /mystic/i.test(`${x.m_Name} ${x.Term || ''}`)); return r ? K.l(r) : 'Misticista'; })()} e o Evento Global «Pesca Maluca» também colocam espécies especiais no sorteio de Pescar.`, 'The Angler role (with fishing courses done), the Pisces sign of the Mystic role and the «Fishing Frenzy» Global Event also add special species to the Fish draw.')}</li>`);
    }
    // artefato do Catador
    const scav = (c.RAW['Gameplay.Roles.Scavenger'] || [])[0];
    if (scav) {
      const idx = (scav.Locations || []).findIndex(x => x.Artifact && x.Artifact.id === it._id);
      if (idx >= 0) {
        const L = scav.Locations[idx], ch = c.deref(L.ChamberInfo), loc = ch && c.locations.find(l => (l.Chambers || []).some(x => x && x.id === ch._id));
        const role = c.roles.find(x => /scavenger/i.test(`${x.m_Name} ${x.Term || ''}`));
        const pct = Math.round(L.ArtifactChance * 100);
        lines.push(`<li>${K.s('artifact location (Scavenger.Locations, TryFindArtifact)', `O papel ${role ? K.l(role) : 'Catador'} acha vasculhando ${loc ? emLugar(K, loc) : 'aqui'}: ${pct}% de chance por tentativa, e depois de cerca de ${L.ArtifactGuarantee} tentativas sem achar ele sai garantido. Este é o ${idx + 1}º artefato na ordem de descoberta${L.ArtifactsRequired ? `: o local só abre depois de ${L.ArtifactsRequired} ${L.ArtifactsRequired === 1 ? 'artefato achado' : 'artefatos achados'}` : ': o local já está aberto desde o início'}.`, `The ${role ? K.l(role) : 'Scavenger'} role finds it scavenging ${loc ? `(${c.placesOf(lang, [loc])})` : 'here'}: ${pct}% chance per try, and after about ${L.ArtifactGuarantee} tries without finding it, it drops for sure. This is artifact number ${idx + 1} in discovery order${L.ArtifactsRequired ? `: the place only opens after ${L.ArtifactsRequired} ${L.ArtifactsRequired === 1 ? 'artifact' : 'artifacts'} found` : ': the place is open from the start'}.`)}</li>`);
      }
    }
    // demais ações
    const gotBy = new Map();
    const scavenge = [];
    let artist = false;
    for (const a of got) {
      if (c.sumAttr(a.Rewards, 'Cash') < 0 && c.hasText(a) && !(gateOf(K, a).some(b => b.k === 'missao') || /^Quest ?Action|^QuestAction/.test(a.m_Name))) continue; // já saiu como loja
      if (FISH_ACTS.some(f => f[0] === a.m_Name)) continue;
      const m = /^Scavenge Pool - (.+)$/.exec(a.m_Name);
      if (m && c.SCAVENGE_PLACES[m[1]]) { const l = c.locations.find(x => c.SCAVENGE_PLACES[m[1]].test(x.m_Name)); if (l) { const pct = c.dropChance(a, it); scavenge.push(`${c.link(lang, l, c.title(lang, l))}${pct ? ` <span class="muted">${pct}%</span>` : ''}`); } continue; }
      if (/^Artist - Make Art Reward/.test(a.m_Name)) { artist = true; continue; }
      if (a.m_Name === 'Get Friendship Crate Rewards') { lines.push(`<li>${K.s('friendship crate prize (Get Friendship Crate Rewards, FriendshipCrateGiveReportTraitEffect.PickRecipient)', `Pode sair (${c.dropChance(a, it)}% de chance) como prêmio da Caixa da Amizade, mas quem compra a caixa não fica com o prêmio: ele vai para outro jogador da partida. A caixa é vendida no lago ${parque(K) ? emLugar(K, parque(K), 'de') : 'do Parque'}, mas só existe quando o modificador «Caixa da amizade», usado no desafio «Hora da Aventura», está ligado.`, `It can drop (${c.dropChance(a, it)}% chance) as a prize in the Friendship Crate, but it goes to another player in the game, never to the buyer. The crate only exists with the «Friendship Crate» modifier, used by the «Adventure Season» challenge, and is sold at the Park pond.`)}</li>`); continue; }
      const box = /^Get (.+) Rewards$/.exec(a.m_Name) && c.items.find(i => i.m_Name === /^Get (.+) Rewards$/.exec(a.m_Name)[1]);
      if (box) { lines.push(`<li>${K.s('prize of a box item (Get X Rewards action)', 'Pode sair de', 'Can come out of')} ${K.l(box)} <span class="muted">${c.dropChance(a, it)}%</span></li>`); continue; }
      if (!c.hasText(a)) continue;
      const w = whereOf(K, a), g = gateOf(K, a);
      if (!w.text && !g.length && !c.pointersTo(a).some(p => !['ChamberActionData', 'ChallengeStorage'].includes(p.cls))) continue;
      const name = K.t(a);
      if (!gotBy.has(name)) gotBy.set(name, { a, as: [], spots: [], gates: [], locs: [], home: false });
      const e = gotBy.get(name);
      if (w.text) e.spots.push(w.text);
      e.locs.push(...w.locs);
      e.as.push(a);
      if (w.home) e.home = true;
      for (const b of g) if (!e.gates.includes(b.html)) e.gates.push(b.html);
      if (/Poster$/.test(it.m_Name)) { const h = K.s('gate: kaiju battle global event', `durante o Evento Global <a href="/${c.langDir(lang)}/guides/global-events/">Batalha de Kaijus</a>`, `during the Global Event <a href="/${c.langDir(lang)}/guides/global-events/">Kaiju Battle</a>`); if (!e.gates.includes(h)) e.gates.push(h); }
      e.pct = c.dropChance(a, it) || e.pct;
    }
    if (artist) {
      const art = c.roles.find(x => /artist/i.test(`${x.m_Name} ${x.Term || ''}`));
      const ranks = [...c.artistJobs].map(([jid, act]) => ({ j: c.jobs.find(x => x._id === jid), act })).filter(x => x.j && x.act).sort((x, y) => x.j.JobLevel - y.j.JobLevel).map(x => ({ ...x, pct: c.dropChance(x.act, it) })).filter(x => x.pct);
      if (art) lines.push(`<li>${K.s('artist painting (Artist.PaintingCompletedAction, Make Art Reward 1 to 7)', `O papel ${K.l(art)} recebe ao terminar um quadro. Chance por cargo de pintor: ${ranks.map(x => `${K.l(x.j)} ${x.pct}%`).join('; ')}.`, `The ${K.l(art)} role gets it when finishing a painting. Chance by painter rank: ${ranks.map(x => `${K.l(x.j)} ${x.pct}%`).join('; ')}.`)}</li>`);
    }
    const groups = new Map();
    for (const [name, e] of gotBy) {
      const jobs = jobGate(K, e.a);
      const conds = [...e.gates, ...(jobs ? [jobs] : [])];
      const key = conds.join('|');
      if (!groups.has(key)) groups.set(key, { conds, items: [] });
      const spots = K.pt ? textoOnde(K, e.locs, e.home) : [...new Set(e.spots)].join(' and ');
      const cost = costOf(K, e.a).text;
      const distintos = new Set(e.as.map(x => JSON.stringify((x.RequiredItems || []).map(r => r.Id + ':' + r.Value)))).size > 1;
      const need = distintos ? '' : (e.a.RequiredItems || []).map(r => { const i = c.byId.get(r.Id); return i ? `${r.Value > 1 ? r.Value + '× ' : ''}${i._slug ? K.l(i) : K.t(i)}` : ''; }).filter(Boolean).join(', ');
      const bits = [spots, cost ? K.s('action costs', `custa ${cost}`, `costs ${cost}`) : '', need ? K.s('action needs', `exige ${need}`, `needs ${need}`) : '', e.pct ? `${e.pct}%` : ''].filter(Boolean);
      groups.get(key).items.push(`<strong>${name}</strong>${bits.length ? ` (${bits.join('; ')})` : ''}`);
    }
    for (const { conds, items } of groups.values()) lines.push(`<li>${items.join(', ')}${conds.length ? `. ${K.s('only when (gate)', 'Só aparece', 'Only appears')} ${fundirItens(K, conds).join(K.pt ? ' ou ' : ' or ')}` : ''}.</li>`);
    const scavRole = c.roles.find(r => /scavenger/i.test(`${r.m_Name} ${r.Term || ''}`));
    if (scavenge.length && scavRole) lines.push(`<li>${K.s('scavenge (Scavenge Pool actions)', `O papel ${K.l(scavRole)} encontra vasculhando nestes lugares (com a chance de cada um):`, `The ${K.l(scavRole)} role finds it scavenging at:`)} ${scavenge.join(', ')}</li>`);
    // papéis, cursos, eventos globais (apontadores)
    for (const p of c.pointersTo(it)) {
      const role = /^(Cultist|Scavenger|Adventurer)$/.test(p.cls) ? (c.roles.find(x => x._id === p.r._id) || c.roles.find(x => new RegExp(p.cls, 'i').test(`${x.m_Name} ${x.Term || ''}`))) : null;
      const roleLink = role ? K.l(role) : '';
      if (role && p.field === 'BoonItems') {
        const tier = ((p.r.CultistBoons || []).find(b => (b.BoonItems || []).some(x => x.id === it._id)) || {}).Tier;
        lines.push(`<li>${K.s('cultist boon (Cultist.CultistBoons, role_cultist_sheet)', `O papel ${roleLink} pode receber como recompensa${tier ? ` de nível ${tier}` : ''}, depois de cumprir 3 vontades do terror cósmico.`, `The ${roleLink} role can get it as a${tier ? ` tier ${tier}` : ''} reward, after completing 3 tasks for the cosmic horror.`)}</li>`);
      }
      if (role && p.field === 'ItemRewards') { const niveis = (p.r.LevelUpRewards || []).filter(l => (l.ItemRewards || []).some(x => x.id === it._id)).map(l => l.Level); lines.push(`<li>${K.s('adventurer level up (Adventurer.LevelUpRewards.ItemRewards)', niveis.length ? `O papel ${roleLink} recebe ao chegar ${niveis.length > 1 ? 'aos níveis' : 'ao nível'} ${niveis.join(' e ')}.` : `Recompensa do papel ${roleLink}.`, niveis.length ? `The ${roleLink} role gets it on reaching level ${niveis.join(' and ')}.` : `Reward of the ${roleLink} role.`)}</li>`); }
      if (p.cls === 'AdventurerGiveItemForQuestOnLevelTraitEffect') { const r = c.roles.find(x => /adventurer/i.test(`${x.m_Name} ${x.Term || ''}`)); if (r) { const nivel = ((p.r.ConditionalQuestRewards || []).find(x => x.TargetItem && x.TargetItem.id === it._id) || {}).TargetValue; lines.push(`<li>${K.s('adventurer quests (AdventurerGiveItemForQuestOnLevelTraitEffect.ConditionalQuestRewards.TargetValue, QuestComponent.Tier)', nivel ? `O papel ${K.l(r)} recebe ao concluir uma Missão de nível ${nivel}.` : `O papel ${K.l(r)} recebe ao completar missões.`, nivel ? `The ${K.l(r)} role gets it for finishing a tier ${nivel} quest.` : `The ${K.l(r)} role gets it for completing quests.`)}</li>`); } }
      if (p.cls === 'GiveAnyRewardOnTurnStartTraitEffect') {
        for (const g of c.items.filter(i => ((i.Rewards || {}).RewardEntries || []).some(e => e.Type === 110 && ((c.byId.get(e.Id) || {}).Effects || []).some(x => x.id === p.r._id)))) {
          const cnt = ((p.r.Items || []).find(x => x.Item && x.Item.id === it._id) || {}).Count || 1;
          lines.push(`<li>${K.s('effigy gives (GiveAnyRewardOnTurnStartTraitEffect)', `${K.l(g)} dá ${cnt} deste item no início de cada turno.`, `${K.l(g)} gives ${cnt} of this item at the start of each turn.`)}</li>`);
        }
      }
      if (p.cls === 'EducationData' && p.field === 'RewardEntries' && c.hasText(p.r)) lines.push(`<li>${K.s('course reward (EducationData.CompletionReward)', `Você recebe ao concluir o curso <strong>${K.t(p.r)}</strong>.`, `You get it on finishing the course <strong>${K.t(p.r)}</strong>.`)}</li>`);
    }
    if (/^Big Game - .*Jersey/.test(it.m_Name)) lines.push(`<li>${K.s('big game jersey (GlobalEventBigGame.WinRewards, ScoreThreshold 15 and 20)', 'Prêmio do Evento Global Big Game: quem fez pelo menos 15 pontos de apoio ao time e viu o time vencer recebe este item, com 400 de Dinheiro (500 a partir de 20 pontos).', 'A prize from the Big Game Global Event: whoever made at least 15 support points for the team and saw it win gets this item, plus 400 Cash (500 from 20 points up).')}</li>`);
    if (/^Big Game - Signed Ball/.test(it.m_Name)) lines.push(`<li>${K.s('big game ball (GlobalEventBigGame.WinnerReward, OnEventEnded: player score equals the top score)', 'Prêmio especial do Evento Global Big Game: quando o time vence, vai para quem fez mais pontos de apoio (em caso de empate, para todos os empatados).', 'Special prize of the Big Game Global Event: when the team wins, it goes to whoever made the most support points (all of them, on a tie).')}</li>`);
    // Casa de Penhores
    if (it.Purpose === 4 && it.BuyValue > 0 && !(it.SubTypes || []).includes(270) && ([300, 310, 320].includes(it.FurnitureSlot) || shops.size)) {
      const special = [300, 310, 320].includes(it.FurnitureSlot);
      const pawn = c.pawnPlace(lang);
      lines.push(`<li>${K.s(special ? 'pawn shelf special (SpecialFurnitureSold 3)' : 'pawn shelf normal (NormalFurnitureSold 1)', special
        ? `${shops.size ? 'Também' : 'Só'} pode aparecer à venda na ${pawn}, por ${K.n(it.BuyValue)}. A cada rodada a loja sorteia 3 móveis especiais, então não dá para contar com ele.`
        : `Também pode aparecer à venda na ${pawn}, por ${K.n(it.BuyValue)}. A cada rodada a loja sorteia 1 móvel comum.`, special
        ? `It ${shops.size ? 'can also' : 'can'} show up for sale at the ${pawn}, for ${K.n(it.BuyValue)}. Each round the shop draws 3 special pieces, so you cannot count on it.`
        : `It can also show up for sale at the ${pawn}, for ${K.n(it.BuyValue)}. Each round the shop draws 1 regular piece.`)}</li>`);
    }
    // missões e eventos que dão o item de recompensa
    const from = c.otherSources.get(it._id);
    if (from && from.size) {
      const byKind = {};
      for (const h of from) (byKind[h._kind] = byKind[h._kind] || []).push(`${c.link(lang, h, c.title(lang, h))}`);
      for (const [kind, names] of Object.entries(byKind)) lines.push(`<li>${kind === 'events' ? K.s('reward of events (ChoiceEvent.Choices.Rewards)', `Pode ser o prêmio de uma escolha nos eventos: ${names.join(', ')}.`, `Reward for a choice in the events: ${names.join(', ')}.`) : K.s('reward of quests (Quest.Rewards)', `Recompensa ao concluir a missão: ${names.join(', ')}.`, `Reward for finishing the quest: ${names.join(', ')}.`)}</li>`);
    }
    return lines;
  }
  // Empregos que dão uma ação (Achados e Perdidos, Bilhete de Cortesia): vale só para quem trabalha lá.
  function jobGate(K, a) {
    const c = K.c, d = dados();
    const ownerTraits = c.pointersTo(a).filter(p => ACTION_EFFECT.test(p.cls)).flatMap(p => d.ownersOf.get(p.r._id) || []);
    const jobs = [...new Set(ownerTraits.flatMap(t => c.pointersTo(t).filter(q => q.cls === 'JobData').map(q => q.r)))];
    if (!jobs.length) return '';
    const locs = [...new Set(jobs.map(j => c.deref(j.Location)).filter(l => l && l._slug))];
    return K.s('only for workers (JobData.RewardsWhileJobHeld)', `para quem tem emprego ${locs.length ? juntarOu(unicos(K, locs).map(l => emLugar(K, l))) : 'no local'}`, `for anyone employed ${locs.length ? `at: ${c.placesOf(K.lang, locs)}` : 'there'}`);
  }

  // ------------------------------------------------------------------ "Para que serve"
  function questLines(K, it) {
    const c = K.c, d = dados(), out = [];
    const rel = d.quest.get(it._id);
    if (!rel) return out;
    const holders = new Map();
    const get = h => { const k = c.titleText(K.lang, h); if (!holders.has(k)) holders.set(k, { h, needs: [], alt: [], makes: [] }); return holders.get(k); };
    const questy = a => /^Quest ?Action|^QuestAction/.test(a.m_Name) || gateOf(K, a).some(b => b.k === 'missao') || (d.ownersOf && c.pointersTo(a).some(p => /TraitEffect$/.test(p.cls) && (d.ownersOf.get(p.r._id) || []).some(t => c.pointersTo(t).some(q => q.cls === 'Quest'))));
    for (const [h, acts] of rel.needs) get(h).needs.push(...acts);
    for (const [h, acts] of rel.alt) get(h).alt.push(...acts);
    for (const [h, acts] of rel.makes) { const q = [...acts].filter(a => questy(a)); const buy = [...acts].filter(a => !questy(a) && c.sumAttr(a.Rewards, 'Cash') < 0 && shopActs(c, it).includes(a)); get(h).makes.push(...q); if (buy.length) get(h).buy = buy; }
    const act = a => `<strong>${K.t(a)}</strong>${whereOf(K, a).text ? ` (${whereOf(K, a).text})` : ''}`;
    const grouped = new Map();
    for (const { h, needs, alt, makes, buy } of holders.values()) {
      const parts = [];
            if (needs.length) parts.push(K.s('quest item needed (RequiredItems of the objective action)', `precisa dele para fazer ${[...new Set(needs)].map(act).join(' ou ')}`, `you need it to do ${[...new Set(needs)].map(act).join(' or ')}`));
      else if (rel.needs.has(h) && !needs.length) {
        const kk = rel.kinds.get(h) || new Set();
        const inv = kk.has('CountItemOfTypeInInventoryQuestObjective'), sell = kk.has('SellPawnItemQuestObjective');
        parts.push(inv && sell ? K.s('quest objective holds and sells', 'um objetivo pede para ter este item na mochila e outro, para vendê-lo na Casa de Penhores', 'one objective asks you to hold this item in your inventory and another to sell it at the Pawn Shop') : sell ? K.s('quest objective sells', 'um objetivo pede para vender este item na Casa de Penhores', 'an objective asks you to sell this item at the Pawn Shop') : K.s('quest objective holds', 'um objetivo pede para ter este item na mochila', 'an objective asks you to hold this item in your inventory'));
      }
      if (!parts.length && alt.length) parts.push(K.s('quest optional (one of several actions)', `a missão aceita várias ações e só ${[...new Set(alt)].map(act).join(' e ')} pede este item; ele não é obrigatório`, `the quest accepts several actions and only ${[...new Set(alt)].map(act).join(' and ')} asks for this item; it is not required`));
      if (!parts.length && buy) parts.push(K.s('quest buy step (PerformActionQuestObjective on a shop action)', 'a missão pede para comprar este item', 'the quest asks you to buy this item'));
      if (!parts.length) continue;
      const key = parts.join('; ');
      if (!grouped.has(key)) grouped.set(key, { hs: [], parts });
      grouped.get(key).hs.push(K.l(h));
    }
    for (const { hs, parts } of grouped.values()) out.push(`<li>${K.s('quest line', `${hs.join(', ')} (${hs.length > 1 ? 'missões' : 'missão'}): ${parts.join('; ')}.`, `${hs.join(', ')} (${hs.length > 1 ? 'quests' : 'quest'}): ${parts.join('; ')}.`)}</li>`);
    return out;
  }

  // Ações que o item abre ou em que é gasto (sem repetir a mesma ação).
  function actionLines(K, it, skip) {
    const c = K.c, lines = [], seen = new Set(skip || []);
    // traços do item que dão ação
    const ent = [];
    for (const e of ((it.Rewards || {}).RewardEntries || [])) {
      if (e.Type !== 110) continue;
      const t = c.byId.get(e.Id);
      for (const ref of (t && t.Effects) || []) {
        const ef = c.deref(ref);
        const lista = ef ? [].concat(ef.ChamberActions || [], ef.ChamberAction || []) : [];
        for (const a of lista.map(c.deref).filter(x => x && c.hasText(x))) {
          if (seen.has(a._id)) continue;
          seen.add(a._id);
          ent.push({ a, w: whereOf(K, a), fx: c.effects(K.lang, a.Rewards.RewardEntries.filter(x => x.Type !== 70)) });
        }
      }
    }
    const byFx = new Map();
    for (const x of ent) { if (!byFx.has(x.fx)) byFx.set(x.fx, []); byFx.get(x.fx).push(x); }
    for (const [fx, grupo] of byFx) {
      if (grupo.length >= 3) {
        const nomes = grupo.map(x => `<strong>${K.t(x.a)}</strong>${x.w.text ? ` (${x.w.text})` : ''}`).join('; ');
        lines.push(`<li>${K.s('trait adds several actions (item trait)', `${itemWhen(K, it)} aparecem ${grupo.length} ações: ${nomes}. Todas têm o mesmo efeito:`, `${itemWhenEn(K, it)} ${grupo.length} actions appear: ${nomes}. All have the same effect:`)}${fx}</li>`);
        continue;
      }
      for (const { a, w } of grupo) {
        lines.push(`<li>${K.s('trait adds action (item trait AddChamberActionTraitEffect)', `${itemWhen(K, it)} aparece a ação <strong>${K.t(a)}</strong>${w.text ? ` (${w.text})` : ''}.`, `${itemWhenEn(K, it)} the action <strong>${K.t(a)}</strong> appears${w.text ? ` (${w.text})` : ''}.`)} ${(() => { const f = c.tx(K.lang, a.FlavorTerm); return f ? `<em>${c.spanLang(K.lang, f)}</em> ` : ''; })()}${c.actionSentence(K.lang, a)}${c.cooldownNote(K.lang, a)}${fx}</li>`);
      }
    }
    // ações que gastam o item
    const used = new Map();
    for (const a of c.consume.get(it._id) || []) {
      if (!c.hasText(a) || seen.has(a._id) || DEAD.has(a.m_Name)) continue;
      if (/^Cultist.*Feed furniture/.test(a.m_Name)) continue;
      if (/^Quest ?Action|^QuestAction/.test(a.m_Name) || gateOf(K, a).some(b => b.k === 'missao')) continue;
      const need = (a.RequiredItems || []).find(x => c.byId.get(x.Id) === it);
      if (!need) continue;
      const w = whereOf(K, a);
      if (!w.text && !c.pointersTo(a).some(p => !['ChamberActionData', 'ChallengeStorage', 'Quest'].includes(p.cls))) continue;
      const fx = c.effects(K.lang, a.Rewards.RewardEntries.filter(x => x.Type !== 70));
      const key = `${K.tt(a)}|${fx}|${need.Value}`;
      if (!used.has(key)) used.set(key, { a, fx, need, where: [] });
      if (w.text) used.get(key).where.push(w.text);
    }
    for (const { a, fx, need, where } of used.values()) {
      const gate = gateOf(K, a);
      if (/^Gift Card/.test(it.m_Name) && c.sumAttr(a.Rewards, 'Cash') < 0) {
        const rest = c.effects(K.lang, a.Rewards.RewardEntries.filter(x => x.Type !== 70 && (c.byId.get(x.Id) || {}).m_Name !== 'Cash'));
        lines.push(`<li>${K.s('gift card use (Giftcard-Replace / Giftcard-Discount: cash x0)', `Troque em <strong>${K.t(a)}</strong>${where.length ? ` (${[...new Set(where)].join(' / ')})` : ''}: você faz a ação sem pagar os ${K.n(-c.sumAttr(a.Rewards, 'Cash'))} de Dinheiro. O Tempo e os outros efeitos continuam:`, `Trade it at <strong>${K.t(a)}</strong>${where.length ? ` (${[...new Set(where)].join(' / ')})` : ''}: you do the action without paying the ${K.n(-c.sumAttr(a.Rewards, 'Cash'))} Cash. The Time and the other effects still apply:`)}${rest}</li>`);
        continue;
      }
      lines.push(`<li>${need.Value > 1 ? `${need.Value}× ` : ''}${K.s('used by action (RequiredItems)', `Usado em <strong>${K.t(a)}</strong>`, `Used in <strong>${K.t(a)}</strong>`)}${where.length ? ` (${[...new Set(where)].join(' / ')})` : ''}${gate.length ? ` (${gateText(K, gate)})` : ''}${fx}</li>`);
    }
    return lines;
  }
  const itemWhen = (K, it) => ({ 1: 'Com o item na mochila', 3: 'Com o item equipado', 4: 'Com o móvel colocado em casa', 7: 'Enquanto o pet for seu' }[it.Purpose] || 'Com o item');
  const itemWhenEn = (K, it) => ({ 1: 'With the item in your inventory', 3: 'With the item equipped', 4: 'With the furniture placed at home', 7: 'While the pet is yours' }[it.Purpose] || 'With the item');

  // ------------------------------------------------------------------ texto próprio por item (efeitos e "Vale a pena?")
  const SALARY = { 'Pet Clingy Dog': 1 };
  function petKind(it) {
    const n = it.m_Name;
    if (/Dog$/.test(n)) return 'dog';
    if (/Cat/i.test(n)) return 'cat';
    return { 'Pet Sassy Chicken': 'chicken', 'Pet Lazy Frog': 'frog', 'Pet Powerhungry Frog': 'frog', 'Pet Curious Parrot': 'bird', 'Pet Schemeing Bird': 'bird', 'Pet Nervous Snake': 'snake', 'Pet Irate Turtle': 'turtle', 'Pet Rock': 'rock', 'Pet Divorcee': 'divorcee', 'Pet Pompous Pig': 'pig', 'Pet Shy Red Panda': 'panda' }[n] || null;
  }
  // Valor de uma ação depois de um multiplicador percentual por atributo (ModifyChamberActionRewardsByPercentage: valor x percentual).
  function mudada(K, actName, mult, extra) {
    const c = K.c, a = c.table('ChamberActionData').find(x => x.m_Name === actName);
    if (!a) return '';
    const base = Object.fromEntries((a.Rewards.RewardEntries || []).filter(e => e.Type === c.ATTRIBUTE).map(e => [(c.byId.get(e.Id) || {}).m_Name, e.Value]));
    const names = ['Time', 'Happy', 'Health', 'Hygiene', 'Stress', 'Fullness'];
    const parts = [];
    for (const nm of names) {
      let v = base[nm] || 0;
      const before = v;
      if (mult && mult[nm] !== undefined) v *= mult[nm];
      if (extra && extra[nm]) v += extra[nm];
      if (v === before && !(extra && extra[nm])) continue;
      parts.push(`${c.formatValue(K.lang, Math.round(v * 100) / 100)} ${K.attr(nm)} <span class="muted">(${K.s('normal value', 'normal', 'normally')} ${c.formatValue(K.lang, before)})</span>`);
    }
    const onde = whereOf(K, a).text;
    return `<strong>${K.t(a)}</strong>${onde ? ` (${onde})` : ''}: ${parts.join(', ')}`;
  }
  const tier3 = (K, a, b, c3, f) => `${f(a)} / ${f(b)} / ${f(c3)}`;
  function petLines(K, it) {
    const kind = petKind(it), n = K.n, pct = v => `${K.n(Math.round(v * 100))}%`;
    const out = [];
    const P = (id, pt, en) => out.push(K.s(id, pt, en));
    const moodTxt = tier3;
    switch (kind) {
      case 'dog':
        P('pet dog salary (PetModifySalaryTraitEffect 0.05/0.10/0.15)', `O dinheiro que o trabalho rende sobe ${moodTxt(K, 0.05, 0.1, 0.15, pct)}.`, `The money your work pays rises ${moodTxt(K, 0.05, 0.1, 0.15, pct)}.`);
        P('pet dog walk (Pet-Dog-Modify-Walk-Action: +50/+150/+50)', `${K.act('Go For A Walk')}: soma ${K.c.formatValue(K.lang, 50)} ${K.attr('Happy')}, ${K.c.formatValue(K.lang, 150)} ${K.attr('Health')} e ${K.c.formatValue(K.lang, 50)} ${K.attr('Hygiene')} ao valor normal (fixo, não muda com o humor).`, `${K.act('Go For A Walk')}: adds ${K.c.formatValue(K.lang, 50)} ${K.attr('Happy')}, ${K.c.formatValue(K.lang, 150)} ${K.attr('Health')} and ${K.c.formatValue(K.lang, 50)} ${K.attr('Hygiene')} to the normal value (fixed, mood does not change it).`);
        break;
      case 'cat':
        P('pet cat lottery (PetModifyLotteryWinChanceTraitEffect 0.015/0.03/0.045)', `Loteria: soma ${moodTxt(K, 1.5, 3, 4.5, v => `${K.n(v)}`)} pontos percentuais à chance de cada bilhete (a base é 3%).`, `Lottery: adds ${moodTxt(K, 1.5, 3, 4.5, v => `${K.n(v)}`)} percentage points to each ticket's chance (the base is 3%).`);
        P('pet cat relax (Pet-Cat-Modify-Relax: time x0.5)', `Descansar em casa custa metade do Tempo.`, `Relaxing at home costs half the Time.`);
        break;
      case 'chicken':
        P('pet chicken move (Pet-Chicken-Modify-Movement 0.98/0.96/0.94)', `Movimento: a velocidade do seu deslocamento é multiplicada por ${moodTxt(K, 0.98, 0.96, 0.94, v => K.n(v))}. O jogo usa o mesmo tipo de multiplicador nos transportes (menor é mais rápido).`, `Movement: your travel speed is multiplied by ${moodTxt(K, 0.98, 0.96, 0.94, v => K.n(v))}. The game uses the same kind of multiplier on transport (lower is faster).`);
        break;
      case 'frog':
        P('pet frog croak (Pet-Frog-Improve-Croaking)', `${mudada(K, 'Croak with Frogs', { Time: 0.33, Happy: 6, Hygiene: -3 })}.`, `${mudada(K, 'Croak with Frogs', { Time: 0.33, Happy: 6, Hygiene: -3 })}.`);
        P('pet frog pawn (PetModifyItemPawnPriceByPurposeTraitEffect 1.1/1.2/1.3)', `Penhora: tudo que você vende na Casa de Penhores rende ${moodTxt(K, 10, 20, 30, v => `+${v}%`)}.`, `Pawn: everything you sell at the Pawn Shop pays ${moodTxt(K, 10, 20, 30, v => `+${v}%`)}.`);
        break;
      case 'bird':
        P('pet bird crows (Pet-Bird-Improve-Feed-Crows x1.5)', `${mudada(K, 'Feed The Crows', { Happy: 1.5 })}.`, `${mudada(K, 'Feed The Crows', { Happy: 1.5 })}.`);
        P('pet bird work xp (Pet-Bird work experience 1.15/1.30/1.45)', `A EXP de Trabalho que você ganha sobe ${moodTxt(K, 0.15, 0.3, 0.45, pct)}.`, `The Work XP you earn rises ${moodTxt(K, 0.15, 0.3, 0.45, pct)}.`);
        break;
      case 'snake':
        P('pet snake shops (PetModifyRewardsOfActionsInChambersTraitEffect 0.95/0.90/0.85)', `Compras na Loja de Eletrônicos e na Loja de Móveis: o preço cai ${moodTxt(K, 0.05, 0.1, 0.15, pct)}.`, `Purchases at the Electronics Store and the Furniture Store: the price drops ${moodTxt(K, 0.05, 0.1, 0.15, pct)}.`);
        P('pet snake grass (Pet-Snake-Improve-Touch-Grass)', `${mudada(K, 'Touch Grass', { Time: 0.5, Happy: 2 }, { Health: 100 })}.`, `${mudada(K, 'Touch Grass', { Time: 0.5, Happy: 2 }, { Health: 100 })}.`);
        break;
      case 'turtle':
        P('pet turtle interest (PetModifyInterestRateOfVaultTraitEffect.CheckForInterestRateChange: addss, VaultData.InterestRate 0.04)', `Soma ${moodTxt(K, 1, 2, 3, v => `${v}`)} pontos percentuais aos juros da conta regular do Banco. Como a taxa normal é 4%, ela vira ${moodTxt(K, 5, 6, 7, v => `${v}%`)}.`, `Adds ${moodTxt(K, 1, 2, 3, v => `${v}`)} percentage points to the regular Bank account interest. Since the normal rate is 4%, it becomes ${moodTxt(K, 5, 6, 7, v => `${v}%`)}.`);
        P('pet turtle fishing (Pet-Turtle-Improve-Fishing-Action x0.75)', `Pescar no lago leva 25% menos Tempo (vale para as ações de pesca que existem no lago).`, `Fishing at the pond takes 25% less Time (it applies to the fishing actions that exist at the pond).`);
        break;
      case 'rock':
        P('pet rock quests (Pet-Rock quest cash 1.1/1.2/1.3)', `O Dinheiro das recompensas de missões sobe ${moodTxt(K, 0.1, 0.2, 0.3, pct)}.`, `The Cash from quest rewards rises ${moodTxt(K, 0.1, 0.2, 0.3, pct)}.`);
        P('pet rock push (Pet-Rock-Improve-Move-Big-Rock)', `${mudada(K, 'Move Big Rock', { Time: 0.5, Health: 1.5, Hygiene: 0 }, { Happy: 50 })}.`, `${mudada(K, 'Move Big Rock', { Time: 0.5, Health: 1.5, Hygiene: 0 }, { Happy: 50 })}.`);
        break;
      case 'divorcee':
        P('pet divorcee cash (PetGiveRewardOnTurnStartTraitEffect 20/40/60)', `Dá ${moodTxt(K, 20, 40, 60, v => K.n(v))} de ${K.attr('Cash')} no início de cada turno.`, `Gives ${moodTxt(K, 20, 40, 60, v => K.n(v))} ${K.attr('Cash')} at the start of each turn.`);
        break;
      case 'pig':
        P('pet pig eating (PetModifyActionRewardsIncludingAttributeTypeByPercentage 0.75/0.5/0.25 and 1.2/1.4/1.6)', `Toda ação que dá ${K.attr('Fullness')}: gasta ${moodTxt(K, 25, 50, 75, v => `${v}%`)} menos Tempo e rende ${moodTxt(K, 20, 40, 60, v => `${v}%`)} mais ${K.attr('Happy')}.`, `Every action that gives ${K.attr('Fullness')}: costs ${moodTxt(K, 25, 50, 75, v => `${v}%`)} less Time and gives ${moodTxt(K, 20, 40, 60, v => `${v}%`)} more ${K.attr('Happy')}.`);
        P('pet pig sleep (Pet-Pig-Improve-Sleep)', `Dormir tira ${K.n(10)} ${K.attr('Stress')} a mais.`, `Sleeping removes ${K.n(10)} more ${K.attr('Stress')}.`);
        break;
      case 'panda':
        P('pet panda study (PetModifyStudyActionCostByPercentageTraitEffect 0.85/0.70/0.55)', `Ações de estudo: gastam ${moodTxt(K, 15, 30, 45, v => `${v}%`)} menos Tempo e Felicidade.`, `Study actions: cost ${moodTxt(K, 15, 30, 45, v => `${v}%`)} less Time and Happiness.`);
        P('pet panda yoga (Pet-Panda-Improve-Yoga)', `Ioga (inclusive a da missão): tira ${K.n(10)} ${K.attr('Stress')} a mais.`, `Yoga (including the quest one): removes ${K.n(10)} more ${K.attr('Stress')}.`);
        break;
      default:
    }
    return out;
  }

  // Frases por móvel especial e itens com efeito próprio (ItemData.Rewards, traços Purpose 1/3/4).
  function specialEffect(K, it) {
    const n = it.m_Name, c = K.c;
    const P = (id, pt, en) => K.s(id, pt, en);
    switch (n) {
      case 'Special Furniture Suitarmor': return [P('armor (ArmorMuggingSaferTraitEffect Modifier -1)', 'Impede o <strong>furto de Dinheiro</strong> na Onda de Crimes (o ladrão que tira o dinheiro da carteira). Não protege móveis nem itens da mochila.', 'Stops <strong>cash mugging</strong> during the Crime Wave (the thief who takes money from your wallet). It does not protect furniture or inventory items.')];
      case 'Special Roomba': return [P('roomba (RoombaBurglarySaferTraitEffect Modifier -1)', 'Impede que <strong>levem seus móveis</strong> na Onda de Crimes. Não protege Dinheiro nem itens da mochila.', 'Stops thieves from <strong>taking your furniture</strong> during the Crime Wave. It does not protect cash or inventory items.')];
      case 'Special Furniture Banjo': return [P('banjo (Banjo-Increase-Pawn-Slots-TraitEffect AdditionalSpecialSlots 1)', 'Soma <strong>+1 vaga de móvel especial</strong> na prateleira da Casa de Penhores: a loja passa a mostrar 4 móveis especiais por rodada em vez de 3.', 'Adds <strong>+1 special-furniture slot</strong> to the Pawn Shop shelf: the shop shows 4 special pieces per round instead of 3.')];
      case 'Special Furniture Fish in a Barrel': return [P('barrel (BarrelIncreaseFishPawnPriceTraitEffect TargetType 110 Modifier 1.2)', 'Peixes penhorados rendem <strong>20% a mais</strong>.', 'Pawned fish pay <strong>20% more</strong>.')];
      case 'Special Bagle Toaster': return [P('bagel toaster (ReligiousToastReportTraitEffect Chance 0.05, report Cash 400)', `Tem <strong>5% de chance</strong> de render o relatório «Figura Religiosa na Torrada», que dá <strong>${K.n(400)} de Dinheiro</strong>.`, `It has a <strong>5% chance</strong> of producing the «Religious Imagery on Toast» report, which gives <strong>${K.n(400)} Cash</strong>.`)];
      case 'Special Furniture Catcharm': return [P('lucky cat (LuckyCatInceaseLotteryChanceTraitEffect 0.03)', 'Soma <strong>3 pontos percentuais</strong> à chance de cada bilhete de loteria: de 3% para 6%, o dobro.', 'Adds <strong>3 percentage points</strong> to each lottery ticket chance: from 3% to 6%, double.')];
      case 'Special Furniture Easter Statue': return [P('easter statue (ModifyChamberActionRewardByPercentagePositiveNegative, OutcomeValue 2: positive values only, adds value x2)', `Nas ações ${parque(K) ? emLugar(K, parque(K), 'de') : 'do Parque'} (${['Go For A Walk', 'Touch Grass', 'Feed The Crows', 'Bathe in pond', 'Move Big Rock'].map(x => K.act(x)).join(', ')}), os ganhos de ${K.attr('Happy')}, ${K.attr('Health')} e ${K.attr('Hygiene')} valem <strong>3 vezes o normal</strong>: o jogo soma mais 2 vezes o valor. O que a ação gasta nesses atributos não muda.`, `On the Park actions (${['Go For A Walk', 'Touch Grass', 'Feed The Crows', 'Bathe in pond', 'Move Big Rock'].map(x => K.act(x)).join(', ')}), gains of ${K.attr('Happy')}, ${K.attr('Health')} and ${K.attr('Hygiene')} are worth <strong>3 times the normal value</strong>: the game adds 2 more times the value. What the action spends in those attributes does not change.`)];
      case 'Burglar Trap': case 'VexCorp Security System': return [P('security item (ItemData.Security, HomeHandler.GetHomeSecurity)', `Soma <strong>${K.n(it.Security)} de Segurança</strong> à casa. Na Onda de Crimes, o ladrão só entra se um sorteio de 0 a 1 passar da sua Segurança total (chance de entrar = 1 menos a Segurança). Com Segurança 1 ou mais, ninguém entra.`, `Adds <strong>${K.n(it.Security)} Security</strong> to your home. During a Crime Wave a thief only gets in if a 0-to-1 roll beats your total Security (chance to get in = 1 minus Security). At Security 1 or more, nobody gets in.`)];
      default: return [];
    }
  }

  // Segurança: todo móvel comum de nível 2, 4 ou 6 baixa a Segurança (GetHomeSecurity); móvel de Cultista e especial, não.
  function securityNote(K, it) {
    if (it.Purpose !== 4 || it.Security > 0 || (it.SubTypes || []).includes(270)) return '';
    const drop = { 2: 0.02, 4: 0.04, 6: 0.08 }[it.Tier];
    if (!drop) return '';
    const name = /Smoke|Extinguisher|Security/.test(it.m_Name);
    return K.s('security drop by tier (HomeHandler.GetHomeSecurity: tier 2/4/6 = -0.02/-0.04/-0.08)', `${name ? 'Apesar do nome, este móvel não soma Segurança. ' : ''}Colocado em casa, ele <strong>reduz a Segurança em ${K.n(drop)}</strong>: todo móvel comum de nível 2, 4 e 6 tira 0,02, 0,04 e 0,08. Quanto menor a Segurança, maior a chance de o ladrão entrar na Onda de Crimes (1 menos a Segurança). Móveis especiais, de Cultista e de nível 0, 1, 3, 5 e 7 não mexem nela.`, `${name ? 'Despite the name, this furniture adds no Security. ' : ''}Placed at home, it <strong>lowers Security by ${K.n(drop)}</strong>: every regular tier 2, 4 and 6 piece takes off 0.02, 0.04 and 0.08. The lower your Security, the higher the thief's chance to get in during a Crime Wave (1 minus Security). Special, Cultist and tier 0, 1, 3, 5 and 7 furniture do not change it.`);
  }

  // ------------------------------------------------------------------ móveis
  function fitsHomes(K, it) {
    const c = K.c;
    const homes = c.table('HomeData').filter(h => h.Rent > 0).sort((a, b) => a.Rent - b.Rent);
    const special = { 300: 'SmallSpecialFurnitureCount', 320: 'MediumSpecialFurnitureCount', 310: 'LargeSpecialFurnitureCount' }[it.FurnitureSlot];
    return { homes, special, fits: homes.filter(h => (special ? h[special] > 0 : true) && it.Tier <= h.MaxFurnitureTier) };
  }
  function furnitureCallouts(K, it) {
    const c = K.c, lang = K.lang, calls = [];
    const { homes, special, fits } = fitsHomes(K, it);
    const fx = (it.Rewards.RewardEntries || []).filter(e => e.Type === c.ATTRIBUTE && c.byId.get(e.Id) && c.byId.get(e.Id).m_Name !== 'Cash');
    const bed = it.FurnitureSlot === 10;
    const hasTrait = ((it.Rewards || {}).RewardEntries || []).some(e => e.Type === 110);
    const fridge = it.FurnitureSlot === 60;
    const lines = [];
    if (fx.length) lines.push(bed
      ? K.s('furniture when bed (RelaxationHandler.GetSleepRewards)', 'Ao <strong>dormir</strong> em casa. Com mais de uma cama, só a melhor conta. Ao relaxar, a cama também soma o que não for Estresse.', 'When you <strong>sleep</strong> at home. With more than one bed, only the best counts. When relaxing, the bed also adds anything that is not Stress.')
      : K.s('furniture when relax (RelaxationHandler.GetRelaxRewards)', 'Ao <strong>relaxar</strong> em casa, somando com os outros móveis colocados. Dinheiro e Estresse não entram nessa soma.', 'When you <strong>relax</strong> at home, stacking with your other placed furniture. Cash and Stress do not count toward the total.'));
    const ef = c.effects(lang, fx);
    const own = specialEffect(K, it);
    const traitsHtml = traitLinesForItem(K, it);
    const comidaItem = c.items.find(x => x.m_Name === 'One Week Food');
    const comidaCusto = comidaItem ? shopCost(K, comidaItem) : null;
    const mercado = c.locations.find(l => l.m_Name === 'Grocery Store');
    const fridgeTxt = it.Purpose === 4 && it.ContainerSize > 0 ? [K.s('fridge size (ItemData.ContainerSize, HomeHandler.GetFoodStorageSize, OnTurnEnded, Buy Food for a Week)', `Guarda até <strong>${it.ContainerSize} refeições</strong> de ${K.item('One Week Food')}. Apesar do nome, cada unidade cobre 1 rodada: ${it.ContainerSize} unidades são ${it.ContainerSize} rodadas sem comer fora. Comprar: ${mercado ? emLugar(K, mercado) : 'no Mercado'}${comidaCusto ? `, ${comidaCusto.text} a unidade` : ''}. Usar: automático e sem gastar Tempo, no fim do turno em que você não comeu; o jogo gasta 1 unidade e você escapa da punição por fome. Vale a maior geladeira colocada, não a soma. Sem geladeira, a comida estraga no fim do turno.`, `Stores up to <strong>${it.ContainerSize} meals</strong> of ${K.item('One Week Food')}. Despite the name, each unit covers 1 round: ${it.ContainerSize} units are ${it.ContainerSize} rounds without eating out. Buying: ${mercado ? `at ${K.l(mercado)}` : 'at the Grocery'}${comidaCusto ? `, ${comidaCusto.text} per unit` : ''}. Using: automatic and with no Time spent, at the end of a turn in which you did not eat; the game uses 1 unit and you escape the hunger penalty. The biggest fridge placed counts, not the sum. With no fridge, food spoils at the end of the turn.`)] : [];
    if (it.m_Name === 'Dimensional Fridge') fridgeTxt.push(K.s('dimensional fridge refills (SetFoodAmountMaxForPlayerTraitEffect, MaxFridgeTraitEffect)', 'Ela se enche sozinha de comida: ao ser colocada e no começo de cada turno, completa a geladeira até o limite.', 'It fills itself with food: when placed and at the start of each turn, it tops the fridge up to its limit.'));
    const when = [...fridgeTxt, ...own, ...traitsHtml];
    if (lines.length || when.length) calls.push(c.callout(K.s('furniture effect label', 'Quando faz efeito', 'When it works'), `${lines.length ? `<p>${lines.join(' ')}</p>${ef}` : ''}${when.length ? `<ul class="plain">${when.map(x => (/^<li>/.test(x) ? x : `<li>${x}</li>`)).join('')}</ul>` : ''}`));
    // onde cabe
    const where = [];
    if (it.Tier > 0) where.push(K.s('furniture tier (ItemData.Tier, HomeData.MaxFurnitureTier)', fits.length ? `Móvel de nível ${it.Tier}: cada moradia aceita até um nível. Serve em ${fits.map(h => `${K.tt(h)} (aluguel ${K.n(h.Rent)}, aceita até o nível ${h.MaxFurnitureTier})`).join('; ')}.` : `Móvel de nível ${it.Tier}: nenhuma moradia para alugar aceita esse nível.`, fits.length ? `Tier ${it.Tier} furniture: each home only takes furniture up to a certain tier. Fits in: ${fits.map(h => `${K.tt(h)} (rent ${K.n(h.Rent)}, up to tier ${h.MaxFurnitureTier})`).join('; ')}.` : `Tier ${it.Tier} furniture: no rentable home accepts that tier.`));
    if (special) where.push(K.s('furniture special slots (HomeData)', `Móvel especial de tamanho ${{ 300: 'pequeno', 320: 'médio', 310: 'grande' }[it.FurnitureSlot]}: cada moradia tem poucas vagas desse tamanho. ${homes.map(h => `${K.tt(h)}: ${h[special]}`).join(', ')}.`, `Special furniture of ${{ 300: 'small', 320: 'medium', 310: 'large' }[it.FurnitureSlot]} size: each home has only a few slots of that size. ${homes.map(h => `${K.tt(h)}: ${h[special]}`).join(', ')}.`));
    if (it.Tier > 0 || special) where.push(`<a href="/${c.langDir(lang)}/guides/housing/">${K.s('housing guide link', 'Como funcionam as moradias', 'How homes work')}</a>`);
    if (where.length) calls.push(c.callout(K.s('furniture limit label', 'Onde cabe', 'Where it fits'), `<p>${where.join(' ')}</p>`));
    const sec = securityNote(K, it);
    if (sec) calls.push(c.callout(K.s('security label', 'Segurança da casa', 'Home security'), `<p>${sec}</p>`));
    if (it.ScoreBonus > 0) calls.push(c.callout(c.ui(lang, 'score'), `<p>${K.s('furniture score (ItemData.ScoreBonus)', `${c.formatValue(lang, it.ScoreBonus)} pontos no fim da partida enquanto você tiver o móvel colocado${fx.length || when.length || hasTrait ? '' : '. Este móvel não faz mais nada: é só decoração'}.`, `${c.formatValue(lang, it.ScoreBonus)} points at the end of the game while the furniture is placed${fx.length || when.length || hasTrait ? '' : '. This piece does nothing else: it is only decoration'}.`)}</p>`));
    return calls;
  }
  // Traços do item que não são ação nem efeito já coberto: texto do próprio traço.
  function traitLinesForItem(K, it) {
    return [];
  }

  // ------------------------------------------------------------------ "Vale a pena?"
  function shopCost(K, it) {
    const c = K.c;
    const live = shopActs(c, it).filter(a => c.hasText(a) && !gateOf(K, a).some(b => b.k === 'missao') && !/^Quest ?Action|^QuestAction/.test(a.m_Name) && whereOf(K, a).text);
    const costs = live.map(a => ({ a, ...costOf(K, a), qty: qtyOf(c, a, it) })).sort((x, y) => x.cash - y.cash);
    return costs[0] || null;
  }
  const poolAvg = (K, poolName) => {
    const c = K.c, a = c.table('ChamberActionData').find(x => x.m_Name === poolName);
    if (!a) return 0;
    const rows = a.WeightedRewards || [], total = rows.reduce((s, w) => s + w.Weight, 0);
    let sum = 0;
    for (const w of rows) for (const e of c.collectEntries([w.Reward])) if (e.Type === c.ITEM) { const i = c.byId.get(e.Id); if (i) sum += w.Weight / total * i.SellValue * e.Value; }
    return sum;
  };
  const avgSell = (K, a) => {
    const c = K.c, rows = a.WeightedRewards || [], total = rows.reduce((s, w) => s + w.Weight, 0);
    let sum = 0;
    for (const w of rows) for (const e of c.collectEntries([w.Reward])) if (e.Type === c.ITEM) { const i = c.byId.get(e.Id); if (i) sum += w.Weight / total * i.SellValue * e.Value; }
    return sum;
  };

  // Tempo real de uma quadra: Rewards do transporte x AdditionalMoveCostList do traço dele (MovePlayerOnPath, ModifyMovementSpeedAndCostTraitEffect.OnAttemptingMoveAction).
  function tempoPorQuadra(K, it) {
    const c = K.c;
    const base = -c.sumAttr(it.Rewards, 'Time');
    let mult = 1;
    for (const e of (it.Rewards.RewardEntries || [])) {
      if (e.Type !== 110) continue;
      const t = c.byId.get(e.Id);
      for (const ref of (t && t.Effects) || []) {
        const ef = c.deref(ref);
        for (const m of (ef && ef.AdditionalMoveCostList) || []) { const at = c.deref(m.Attribute); if (at && at.m_Name === 'Time') mult *= m.Percentage; }
      }
    }
    return { base, mult: Math.round(mult * 100) / 100, final: Math.round(base * mult) };
  }

  function worth(K, it) {
    if (it.m_Name === 'Friendship Crate') return K.s('worth friendship crate (FriendshipCrateGiveReportTraitEffect.PickRecipient)', 'Você paga e o prêmio vai para outro jogador, então só compensa se a sua ideia for ajudar essa pessoa.', 'You pay and the prize goes to another player, so it only pays off if helping that person is the point.');
    const c = K.c, lang = K.lang, n = K.n, page = it.m_Name;
    const sc = shopCost(K, it);
    const sell = it.SellValue;
    const pawn = c.pawnPlace(lang);
    const P = (id, pt, en) => K.s(id, pt, en);
    const slug = nm => K.item(nm);
    if (!K.origin && it.ItemGroup === 5 && it.ItemSubGroup === 10) return P('worth not in use (ItemGroup NotInUse, GetPawnRewardsForItem)', `Não conte com ele: está fora de uso. Se aparecer na sua mochila, rende ${n(sell)} na ${pawn}.`, `Do not count on it: it is out of use. If it ever lands in your inventory, it fetches ${n(sell)} at the ${pawn}.`);
    // roupas
    if (it.ItemSubGroup === 5 && it.Tier > 0 && sc) {
      const outfits = c.items.filter(i => i.ItemSubGroup === 5 && i.Tier > 0).sort((a, b) => a.Tier - b.Tier);
      const per = i => { const s = shopCost(K, i); return s ? s.cash / i.Durability : 0; };
      const need = c.jobs.filter(j => !c.artistJobs.has(j._id) && j.RequiredEquippedItemTier === it.Tier).length;
      const prev = outfits.find(i => i.Tier === it.Tier - 1);
      return P('worth clothes (shop cost / Durability)', `Custa ${n(sc.cash)} e dura ${it.Durability} rodadas: cerca de ${n(Math.round(per(it) * 10) / 10)} de Dinheiro por rodada de uso (${outfits.map(i => `${K.tt(i)} ${n(Math.round(per(i) * 10) / 10)}`).join('; ')}). ${need ? `Vale a pena se você mira um dos ${need} empregos que pedem exatamente este nível` : 'Nenhum emprego pede exatamente este nível'}${prev ? `; para os empregos de nível menor, ${K.tt(prev)} já basta` : ''}.`, `It costs ${n(sc.cash)} and lasts ${it.Durability} rounds: about ${n(Math.round(per(it) * 10) / 10)} Cash per round of use (${outfits.map(i => `${K.tt(i)} ${n(Math.round(per(i) * 10) / 10)}`).join('; ')}). ${need ? `It is worth it if you aim at one of the ${need} jobs that ask for exactly this tier` : 'No job asks for exactly this tier'}${prev ? `; for lower-tier jobs, ${K.tt(prev)} is enough` : ''}.`);
    }
    // transportes
    if (it.ItemSubGroup === 7) {
      const t = tempoPorQuadra(K, it).final;
      const foot = 20;
      if (!sc) return P('worth transport default', `É o jeito padrão de andar: ${n(t)} de Tempo por quadra. Os transportes da Vexcorp gastam menos Tempo por quadra.`, `It is the default way to get around: ${n(t)} Time per block. The Vexcorp transports cost less Time per block.`);
      const save = foot - t;
      return P('worth transport (Rewards.Time vs walking, shop cost)', `Cada quadra custa ${n(t)} de Tempo, contra ${n(foot)} a pé: economiza ${n(save)} de Tempo por quadra. Além dos ${n(sc.cash)} de Dinheiro, a compra gasta ${n(sc.time)} de Tempo, que você recupera depois de ${n(Math.ceil(sc.time / save))} quadras. Vale a pena para quem anda muito entre prédios; se você fica em poucos lugares, o dinheiro rende mais em outra coisa.`, `Each block costs ${n(t)} Time, against ${n(foot)} on foot: it saves ${n(save)} Time per block. Besides ${n(sc.cash)} Cash, buying costs ${n(sc.time)} Time, which you earn back after ${n(Math.ceil(sc.time / save))} blocks. It is worth it if you travel a lot between buildings; if you stay in a few places, the money does more elsewhere.`);
    }
    // geladeiras
    if (it.Purpose === 4 && it.ContainerSize > 0 && sc) {
      const all = c.items.filter(i => i.Purpose === 4 && i.ContainerSize > 0 && shopCost(K, i));
      return `${worthFridge(K, it, sc, all)} ${worthFurniture(K, it, sc, true)}`;
    }
    // pets
    if (it.ItemSubGroup === 3) {
      const s = shopCost(K, it);
      const kind = petKind(it);
      const food = shopCost(K, c.items.find(i => i.m_Name === 'Pet Basic Food'));
      const extra = { dog: 'A vantagem é do trabalho: o salário maior se soma a cada turno de trabalho', divorcee: `Rende Dinheiro sozinho (20, 40 ou 60 por turno, conforme o humor): mimado, ele devolve o preço de compra em ${s ? `${Math.ceil(s.cash / 60)} ${plural(Math.ceil(s.cash / 60), 'turno', 'turnos')}` : ''}; contente, em ${s ? `${Math.ceil(s.cash / 40)} ${plural(Math.ceil(s.cash / 40), 'turno', 'turnos')}` : ''}`, rock: 'A vantagem só conta para quem faz missões com recompensa em Dinheiro', cat: 'A vantagem da loteria só conta com bilhete na mão', frog: 'A vantagem só conta para quem vende muita coisa na Casa de Penhores', turtle: 'A vantagem só conta para quem guarda dinheiro na conta regular do Banco', panda: 'A vantagem só conta para quem estuda', pig: 'A vantagem só conta para quem come em ações que dão Satisfação', bird: 'A vantagem só conta para quem trabalha', snake: 'A vantagem só conta para quem compra móveis e eletrônicos', chicken: 'O ganho em movimento é pequeno; o pet vale mais pelos ovos e pelos pontos', }[kind] || '';
      const extraEn = { dog: 'The advantage is about work: the higher pay adds to every shift', divorcee: `It earns Cash by itself: it pays 20, 40 or 60 per turn by mood: pampered, it returns the purchase price in ${s ? Math.ceil(s.cash / 60) : ''} ${s && Math.ceil(s.cash / 60) === 1 ? 'turn' : 'turns'}; content, in ${s ? Math.ceil(s.cash / 40) : ''} ${s && Math.ceil(s.cash / 40) === 1 ? 'turn' : 'turns'}`, rock: 'The advantage only counts if you do quests that pay Cash', cat: 'The lottery advantage only counts with a ticket in hand', frog: 'The advantage only counts if you pawn a lot of things', turtle: 'The advantage only counts if you keep money in the regular Bank account', panda: 'The advantage only counts if you study', pig: 'The advantage only counts if you eat with actions that give Fullness', bird: 'The advantage only counts if you work', snake: 'The advantage only counts if you buy furniture and electronics', chicken: 'The movement gain is small; the pet is worth more for the eggs and the points' }[kind] || '';
      return P('worth pet (Buy Pet cost, pet score 5/30/45 per round)', `Um pet de qualquer espécie vale pontos no fim da partida: 5 por rodada se estiver negligenciado, 30 se contente e 45 se mimado. ${s ? `Este custa ${s.text}. ` : ''}${extra ? `${extra}. ` : ''}Para mantê-lo bem, a ração básica custa ${food ? n(food.cash) : '?'} e dá ${n(150)} de Saúde ao pet.`, `A pet of any species is worth points at the end of the game: 5 per round if neglected, 30 if content and 45 if pampered. ${s ? `This one costs ${s.text}. ` : ''}${extraEn ? `${extraEn}. ` : ''}To keep it well, basic food costs ${food ? n(food.cash) : '?'} and gives ${n(150)} pet Health.`);
    }
    // peixes
    if ((it.SubTypes || []).includes(110)) {
      const pts10 = Math.round(it.ScoreBonus * 10 * 0.02 * 100) / 100;
      return P('worth fish (GetFishingScore ScoreBonus x rounds x 0.02, SellValue)', `Pescar uma espécie pela primeira vez já registra os pontos; a partir daí o peixe pode ser vendido sem perder nada. Em 10 rodadas, a espécie vale ${n(pts10)} pontos; em 50, ${n(Math.round(it.ScoreBonus * 50 * 0.02))}. O peixe rende ${n(sell)} na ${pawn}${it.m_Name === 'Fishing - Special - Octopus' ? ', o mais caro entre os peixes' : ''}. Então: pesque ao menos um de cada espécie e venda os repetidos.`, `Fishing a species for the first time already registers its points; after that the fish can be sold without losing anything. In 10 rounds the species is worth ${n(pts10)} points; in 50, ${n(Math.round(it.ScoreBonus * 50 * 0.02))}. The fish sells for ${n(sell)} at the ${pawn}${it.m_Name === 'Fishing - Special - Octopus' ? ', the priciest fish' : ''}. So: catch at least one of each species and sell the duplicates.`);
    }
    if (/^Fish - Trash/.test(it.m_Name)) return P('worth trash (SellValue)', `Vale ${n(sell)} na ${pawn} e não conta pontos de pesca.`, `Worth ${n(sell)} at the ${pawn} and does not count for fishing points.`);
    // vara e isca
    if (it.m_Name === 'Fishing Bait' || /^Fishing Pole/.test(it.m_Name)) {
      const base = c.table('ChamberActionData').find(x => x.m_Name === 'Go Fishing');
      const bait = c.table('ChamberActionData').find(x => x.m_Name === 'Go Fishing (Bait)');
      const master = c.table('ChamberActionData').find(x => x.m_Name === 'Go Fishing Master');
      const magnet = c.table('ChamberActionData').find(x => x.m_Name === 'Go Fishing Magnet');
      const e = a => Math.round(avgSell(K, a));
      if (it.m_Name === 'Fishing Bait') return P('worth bait (average sale value of Go Fishing vs Go Fishing (Bait))', `Cada isca vira uma pescaria sem lixo, e custa ${sc ? n(Math.round(sc.cash / sc.qty)) : '?'} (lote de 3 por ${sc ? n(sc.cash) : '?'}). Vendendo tudo na ${pawn}, uma pescaria rende em média ${n(e(base))} sem isca e ${n(e(bait))} com isca. Diferença: ${n(e(bait) - e(base))}, ${e(bait) - e(base) > (sc ? sc.cash / sc.qty : 0) ? 'mais que' : 'menos que'} o preço da isca. A isca também aumenta a chance de cada espécie, o que ajuda quem busca completar a pontuação de Pesca.`, `Each bait makes one junk-free fishing trip, and costs ${sc ? n(Math.round(sc.cash / sc.qty)) : '?'} (pack of 3 for ${sc ? n(sc.cash) : '?'}). Selling everything at the ${pawn}, a trip pays about ${n(e(base))} without bait and ${n(e(bait))} with bait. Difference: ${n(e(bait) - e(base))}, ${e(bait) - e(base) > (sc ? sc.cash / sc.qty : 0) ? 'more than' : 'less than'} the bait price. Bait also raises each species' chance, which helps anyone chasing the Fishing score.`);
      if (it.m_Name === 'Fishing Pole') return P('worth pole (Buy Fishing Pole cost, average sale value)', `Custa ${sc ? n(sc.cash) : '?'} uma vez só. Uma pescaria rende em média ${n(e(base))} se tudo for vendido na ${pawn} (e custa ${n(135)} de Tempo), então a vara se paga em ${sc ? n(Math.ceil(sc.cash / e(base))) : '?'} pescarias.`, `It costs ${sc ? n(sc.cash) : '?'} once. A fishing trip pays about ${n(e(base))} if everything is sold at the ${pawn} (and costs ${n(135)} Time), so the pole pays for itself in ${sc ? n(Math.ceil(sc.cash / e(base))) : '?'} trips.`);
      if (it.m_Name === 'Fishing Pole - Master') return P('worth master pole', `Pesca Perfeita rende em média ${n(e(master))} por pescaria vendida na ${pawn}, contra ${n(e(base))} da Pescar com vara comum. Custa ${sc ? `${n(sc.cash)} de Dinheiro e ${n(sc.time)} de Tempo` : '?'}, além do curso (ou ser Pescador). Paga-se em ${sc ? n(Math.ceil(sc.cash / Math.max(1, e(master) - e(base)))) : '?'} pescarias de diferença. Dá peixes especiais e não dá lixo nem Peixe Pequeno.`, `Perfect Fishing pays about ${n(e(master))} per trip sold at the ${pawn}, against ${n(e(base))} for regular Fish. It costs ${sc ? `${n(sc.cash)} Cash and ${n(sc.time)} Time` : '?'}, besides the course (or being an Angler). It pays for itself in ${sc ? n(Math.ceil(sc.cash / Math.max(1, e(master) - e(base)))) : '?'} trips of difference. It gives special fish and no junk or Small Fish.`);
      if (it.m_Name === 'Fishing Pole - Magnet') return P('worth magnet pole', `Não pesca peixe: pesca objetos. Uma pescaria rende em média ${n(e(magnet))} na ${pawn}, ${e(magnet) > e(base) ? 'mais' : 'menos'} que os ${n(e(base))} de Pescar. Custa ${sc ? `${n(sc.cash)} de Dinheiro e ${n(sc.time)} de Tempo` : '?'}, além do curso (ou ser Pescador), e não conta para a pontuação de Pesca. Só compensa se for pescar muitas vezes só por dinheiro.`, `It does not catch fish: it catches objects. A trip pays about ${n(e(magnet))} at the ${pawn}, ${e(magnet) > e(base) ? 'more' : 'less'} than the ${n(e(base))} of regular Fish. It costs ${sc ? `${n(sc.cash)} Cash and ${n(sc.time)} Time` : '?'}, besides the course (or being an Angler), and does not count for Fishing points. It only pays off if you fish many times just for money.`);
    }
    // artefatos
    if (/^Artifact - /.test(it.m_Name)) {
      const scav = (c.RAW['Gameplay.Roles.Scavenger'] || [])[0];
      const L = scav && (scav.Locations || []).find(x => x.Artifact && x.Artifact.id === it._id);
      const pool = L && c.deref(L.WeightedRewardAction);
      const avg = pool ? Math.round(avgSell(K, pool)) : 0;
      return P('worth artifact (SellValue vs average scavenge pool value)', `Rende ${n(sell)} na ${pawn}${avg ? `, cerca de ${n(Math.round(sell / Math.max(1, avg)))} vezes o valor médio de um achado comum nesse local (${n(avg)})` : ''}. Só o Catador acha. Achar artefatos também libera novos locais de busca (veja o papel).`, `It pays ${n(sell)} at the ${pawn}${avg ? `, about ${n(Math.round(sell / Math.max(1, avg)))} times the average value of an ordinary find at that place (${n(avg)})` : ''}. Only the Scavenger finds it. Finding artifacts also unlocks new places to scavenge (see the role).`);
    }
    // efígies e moedas
    if (/Effigy$/.test(it.m_Name)) {
      const coin = c.items.find(i => i.m_Name === it.m_Name.replace('Effigy', 'Coins'));
      if (coin) return P('worth effigy (2 coins per turn, SellValue)', `Dá ${n(2)} ${K.tt(coin)} por turno, que valem ${n(2 * coin.SellValue)} na ${pawn}. A efígie sozinha rende ${n(sell)} se for vendida: ela se paga em ${n(Math.ceil(sell / (2 * coin.SellValue)))} turnos e depois só dá lucro. Quanto mais cedo no jogo, melhor.`, `It gives ${n(2)} ${K.tt(coin)} per turn, worth ${n(2 * coin.SellValue)} at the ${pawn}. The effigy alone sells for ${n(sell)}: it pays for itself in ${n(Math.ceil(sell / (2 * coin.SellValue)))} turns and is pure profit afterwards. The earlier in the game, the better.`);
    }
    // vale-presente
    if (/^Gift Card/.test(it.m_Name)) {
      const used = [...(c.consume.get(it._id) || [])].filter(a => /Free/.test(a.m_Name));
      const a = used[0], paid = a && c.table('ChamberActionData').find(x => x.TitleTerm === a.TitleTerm && x !== a && c.sumAttr(x.Rewards, 'Cash') < 0 && !/Free/.test(x.m_Name));
      const saved = paid ? -c.sumAttr(paid.Rewards, 'Cash') : 0;
      if (saved) return P('worth gift card (paid sibling action cash vs SellValue)', `Poupa ${n(saved)} de Dinheiro (o preço da ação) e rende só ${n(sell)} se vendido na ${pawn}. Vale mais usar do que vender, desde que você faria a ação de qualquer jeito.`, `It saves ${n(saved)} Cash (the action's price) and only sells for ${n(sell)} at the ${pawn}. It is worth more used than sold, as long as you would do the action anyway.`);
    }
    // bilhetes
    if (it.m_Name === 'Lottery Ticket') return P('worth lottery (3% x average prize)', `A cada sorteio, o bilhete tem 3% de chance de um prêmio entre ${n(950)} e ${n(1100)} (dividido entre os bilhetes premiados). A conta de um sorteio: 3% de cerca de ${n(1025)} dá uns ${n(31)}, abaixo dos ${n(35)} do bilhete, fora os ${n(10)} de Tempo. O jogo não deixa claro se o bilhete é gasto no sorteio. Com o Gato da Sorte (6%) ou um gato de estimação a conta melhora; com o Bilhete Infernal, o prêmio é garantido.`, `At each draw the ticket has a 3% chance of a prize between ${n(950)} and ${n(1100)} (split among winning tickets). One draw works out to 3% of about ${n(1025)}, roughly ${n(31)}, below the ${n(35)} price, plus ${n(10)} Time. The game does not make clear whether the ticket is used up in the draw. With the Lucky Cat (6%) or a pet cat the math improves; with the Infernal Ticket the prize is guaranteed.`);
    // tokens, soap, food, pet food
    if (it.m_Name === 'Soap Basic') return P('worth soap', `Custa ${sc ? n(sc.cash) : '?'} por ${sc ? sc.qty : 3} sabonetes (${sc ? n(Math.round(sc.cash / sc.qty)) : '?'} cada). Só serve a quem tem pet e quer lavá-lo. A Higiene do pet entra no humor dele, e o humor decide quantos pontos ele dá no fim da partida (5, 30 ou 45 por rodada).`, `It costs ${sc ? n(sc.cash) : '?'} for ${sc ? sc.qty : 3} soaps (${sc ? n(Math.round(sc.cash / sc.qty)) : '?'} each). Only useful if you have a pet and want to bathe it. The pet's Hygiene is part of its mood, and its mood decides how many points it gives at the end of the game (5, 30 or 45 per round).`);
    if (it.m_Name === 'One Week Food') {
      const f = c.table('ReportData').find(r => r.m_Name === 'Forgot to eat');
      const perde = nm => n(-c.sumAttr(f.Rewards, nm));
      const gel = c.items.filter(i => i.Purpose === 4 && i.ContainerSize > 0).sort((a, b) => a.Tier - b.Tier)[0];
      return P('worth food (Buy Food for a Week Rewards, ReportData Forgot to eat, SellValue)', `Comprar custa ${sc ? `${n(sc.cash)} de Dinheiro e ${n(sc.time)} de Tempo` : '?'} por unidade; usar é automático e não gasta Tempo. Cada unidade evita a punição de uma rodada sem comer: perder ${perde('Time')} de Tempo, ${perde('Happy')} de Felicidade e ${perde('Health')} de Saúde. Uma refeição comprada fora também evita a punição, então o ganho da comida em casa é não precisar sair para comer naquele turno. Só funciona com geladeira (${K.l(gel)} é a menor). Vender rende só ${n(sell)}.`, `Buying costs ${sc ? `${n(sc.cash)} Cash and ${n(sc.time)} Time` : '?'} per unit; using it is automatic and costs no Time. Each unit avoids the penalty of a round without eating: losing ${perde('Time')} Time, ${perde('Happy')} Happiness and ${perde('Health')} Health. A meal bought elsewhere avoids it too, so the gain of food at home is not having to go out to eat that turn. It only works with a fridge (${K.l(gel)} is the smallest). Selling it pays only ${n(sell)}.`);
    }
    if (it.Purpose === 8) {
      const basic = c.items.find(i => i.m_Name === 'Pet Basic Food'), ultra = c.items.find(i => i.m_Name === 'Pet Ultra Food');
      const b = shopCost(K, basic), u = shopCost(K, ultra);
      const hp = -(-c.sumAttr(it.Rewards, 'Pet Health'));
      return P('worth pet food (Rewards Pet Health vs cost)', `${K.tt(basic)}: ${n(150)} de Saúde do pet por ${b ? n(b.cash) : '?'} (${b ? n(Math.round(b.cash / 150 * 100) / 100) : '?'} por ponto). ${K.tt(ultra)}: ${n(200)} por ${u ? n(u.cash) : '?'} (${u ? n(Math.round(u.cash / 200 * 100) / 100) : '?'} por ponto). A básica sai bem mais barata por ponto; a premium só ajuda se você quer subir mais Saúde numa única compra (cada ração só pode ser comprada uma vez por rodada). A Saúde do pet importa porque o humor dele decide os pontos que ele dá no fim da partida (5, 30 ou 45 por rodada).`, `${K.tt(basic)}: ${n(150)} pet Health for ${b ? n(b.cash) : '?'} (${b ? n(Math.round(b.cash / 150 * 100) / 100) : '?'} per point). ${K.tt(ultra)}: ${n(200)} for ${u ? n(u.cash) : '?'} (${u ? n(Math.round(u.cash / 200 * 100) / 100) : '?'} per point). Basic is much cheaper per point; premium only helps if you want more Health in a single purchase (each food can only be bought once per round). Pet Health matters because the pet's mood decides the points it gives at the end of the game (5, 30 or 45 per round).`);
    }
    if (it.m_Name === 'Arcade Token') return P('worth token', `Custa ${sc ? `${n(sc.cash)} e ${n(sc.time)} de Tempo` : '?'} e é gasto nos jogos do Fliperama. Vale a pena para quem quer o recorde do Fliperama, que dá pontos no fim da partida.`, `It costs ${sc ? `${n(sc.cash)} and ${n(sc.time)} Time` : '?'} and is spent on the Arcade games. Worth it for anyone chasing the Arcade record, which gives points at the end of the game.`);
    // móveis
    if (it.Purpose === 4) return worthFurniture(K, it, sc);
    // diplomas
    if (/^Diploma/.test(it.m_Name)) return P('worth diploma (SellValue)', `O que conta para os empregos é ter concluído o curso, não o item. Depois de concluir, o diploma só vale ${n(sell)} na ${pawn}.`, `What counts for jobs is having finished the course, not the item. Once done, the diploma is only worth ${n(sell)} at the ${pawn}.`);
    // quadros do artista
    if (it.SubTypes && it.SubTypes.includes(260)) {
      const top = Math.max(...c.items.filter(i => i.Purpose === 4 && !(i.SubTypes || []).some(t => t === 270 || t === 120)).map(i => i.BuyValue));
      const shelfPts = Math.max(...c.items.filter(i => i.Purpose === 4 && i.BuyValue > 0 && !(i.SubTypes || []).some(t => t === 270 || t === 120) && i.m_Name !== 'Special Furniture Dinosaur Skeleton').map(i => i.ScoreBonus || 0));
      return P('worth coupon (TryGetPurchaseCoupon, BuyValue of shelf furniture)', `Vender o cupom rende ${n(sell)} de Dinheiro. Trocá-lo por um móvel da prateleira da ${pawn} dá um móvel que custaria até ${n(top)} (e que só rende metade desse preço se você penhorá-lo depois). Como todo móvel colocado em casa soma pontos no fim da partida (até ${n(shelfPts)} entre os que aparecem na prateleira), o cupom compensa quando aparece um móvel caro que você quer e que cabe na sua casa; senão, venda.`, `Selling the coupon pays ${n(sell)} Cash. Trading it for a piece on the ${pawn} shelf gives furniture that would cost up to ${n(top)} (and that only pays half that price if you pawn it afterwards). Since every placed piece of furniture adds points at the end of the game (up to ${n(shelfPts)} among those the shelf can show), the coupon pays off when an expensive piece you want shows up and fits your home; otherwise sell it.`);
    }
    if (/CV$/.test(it.m_Name)) {
      const a = [...(c.consume.get(it._id) || [])].find(x => c.sumAttr(x.Rewards, 'Experience') > 0);
      if (a) return P('worth cv (SellValue vs Experience of Entregar Currículo)', `Duas saídas: vender por ${n(sell)} na ${pawn}, ou entregar na Agência (${n(-c.sumAttr(a.Rewards, 'Time'))} de Tempo) por ${n(c.sumAttr(a.Rewards, 'Experience'))} de EXP de Trabalho. A EXP serve para subir de cargo; se você já pode pegar o emprego que quer, venda.`, `Two options: sell for ${n(sell)} at the ${pawn}, or hand it in at the Job Office (${n(-c.sumAttr(a.Rewards, 'Time'))} Time) for ${n(c.sumAttr(a.Rewards, 'Experience'))} Work XP. XP is what gets you promoted; if you can already take the job you want, sell it.`);
    }
    if (it.m_Name === 'Abyssal CV') {
      const a = [...(c.consume.get(it._id) || [])][0];
      const tempo = a ? -c.sumAttr(a.Rewards, 'Time') : 0;
      return P('worth abyssal cv (SellValue, Cultist - Hand in Abyssal CV: only Time in Rewards)', `Duas saídas: vender por ${n(sell)} na ${pawn}, ou entregar na Agência${tempo ? ` (${n(tempo)} de Tempo)` : ''}. Segundo o texto do jogo, a entrega avança você para o próximo nível de EXP de Trabalho. O ganho exato é desconhecido. Entre os currículos, este é o que mais rende na venda (Currículo Ouro ${n(c.items.find(i => i.m_Name === 'Gold CV').SellValue)}).`, `Two options: sell for ${n(sell)} at the ${pawn}, or hand it in at the Job Office${tempo ? ` (${n(tempo)} Time)` : ''}. According to the game text, handing it in moves you to the next Work XP level. The exact gain is unknown. Among the CVs, this one sells for the most (Gold CV ${n(c.items.find(i => i.m_Name === 'Gold CV').SellValue)}).`);
    }
    const yw = yieldWorth(K, it);
    if (yw) return yw;
    const peers = PEERS.find(g => g.includes(it.m_Name));
    if (peers && sell > 0) {
      const list = peers.map(nm => c.items.find(i => i.m_Name === nm)).filter(Boolean).sort((x, y) => y.SellValue - x.SellValue);
      const pos = list.findIndex(i => i === it) + 1;
      const noUse = !(c.consume.get(it._id) || new Set()).size;
      const same = list.every(i => i.SellValue === sell);
      return P('worth peers (SellValue among similar items)', `Rende ${n(sell)} na ${pawn}. ${same ? `Os ${list.length} itens deste tipo valem o mesmo.` : `Entre os itens do mesmo tipo: ${list.map(i => `${K.tt(i)} ${n(i.SellValue)}`).join('; ')}. ${pos === 1 ? 'É o mais valioso do tipo.' : `É o ${pos}º mais valioso do tipo.`}`}${noUse ? ' Não tem outro uso, então só serve para vender.' : ''}`, `It pays ${n(sell)} at the ${pawn}. ${same ? `All ${list.length} items of this kind are worth the same.` : `Among similar items: ${list.map(i => `${K.tt(i)} ${n(i.SellValue)}`).join('; ')}. This is number ${pos} in value.`}${noUse ? ' It has no other use, so it is only for selling.' : ''}`);
    }
    if (it.m_Name === 'Infernal Lottery Ticket') return P('worth infernal ticket', `Garante o prêmio da loteria em todo sorteio enquanto você o tiver: ele mesmo conta como bilhete, então não precisa de bilhete comum (o prêmio é de ${n(950)} a ${n(1100)}, dividido com outros premiados).`, `It guarantees the lottery prize in every draw while you hold it: it counts as a ticket itself, so no regular ticket is needed (the prize is ${n(950)} to ${n(1100)}, split with other winners).`);
    if (/Poster$/.test(it.m_Name)) {
      const a = [...(c.consume.get(it._id) || [])].find(x => c.hasText(x));
      return P('worth poster (Colar Cartaz rewards, GlobalEventKaijuBattle._posterScore 3)', `A venda não rende nada. ${a ? `${K.t(a)} só gasta ${n(-c.sumAttr(a.Rewards, 'Time'))} de Tempo e não dá atributos` : 'A ação que o usa não dá atributos'}; cada pôster pendurado soma ${n(3)} pontos para o seu lado na <a href="/${c.langDir(lang)}/guides/global-events/">Batalha de Kaiju</a>.`, `Selling it pays nothing. ${a ? `${K.t(a)} only costs ${n(-c.sumAttr(a.Rewards, 'Time'))} Time and gives no attributes` : 'The action that uses it gives no attributes'}; each poster you hang adds ${n(3)} points for your side in the <a href="/${c.langDir(lang)}/guides/global-events/">Kaiju Battle</a>.`);
    }
    // item de missão
    if (it.ItemSubGroup !== 8 && sell === 0) return P('worth no sale value (SellValue 0)', `A venda na ${pawn} não rende nada.`, `Selling it at the ${pawn} pays nothing.`);
    if (it.ItemSubGroup === 8 && !K.origin && !(c.consume.get(it._id) || new Set()).size) return P('worth quest item nobody uses (no reference in Quest or action tables)', 'Não tem valor de venda. Está na categoria de itens de Missão, mas nenhuma Missão das tabelas do jogo o usa.', 'It has no sale value. It is in the quest item category, but no quest in the game tables uses it.');
    if (it.ItemSubGroup === 8) return P('worth quest item (no SellValue)', `Não vale nada fora da missão: a venda não rende nada e ele não serve em outro lugar. Só interessa a quem está na missão.`, `It is worth nothing outside the quest: selling it pays nothing and it has no other use. It only matters while you are on the quest.`);
    // genérico
    return P('worth generic (SellValue)', `Rende ${n(sell)} na ${pawn}${sc ? ` e custa ${n(sc.cash)} para comprar` : ''}.`, `It pays ${n(sell)} at the ${pawn}${sc ? ` and costs ${n(sc.cash)} to buy` : ''}.`);
  }

  const PEERS = [
    ['Bag of Coins', 'Bag of Gold', 'Bag of Gems'],
    ['Bronze Coins', 'Silver Coins', 'Gold Coins', 'Abyssal Coin'],
    ['Bronze CV', 'Silver CV', 'Gold CV', 'Abyssal CV'],
    ['Scrap 1', 'Scrap 2', 'Scrap 3'],
    ['Artist - Crappy Art', 'Artist - Average Art', 'Artist - Great Art', 'Artist - Masterpiece'],
    ['Big Game - Cali - Signed Jersey', 'Big Game - Chai - Signed Jersey', 'Big Game - Signed Ball'],
    ['Treasure Map - Bank', 'Treasure Map - Cluckers', 'Treasure Map - Gym', 'Treasure Map - Mall', 'Treasure Map - Mart', 'Treasure Map - Park', 'Treasure Map - Vex'],
  ];
  // Itens que viram outra coisa numa ação (mapas, ossos, peças de carro).
  function yieldWorth(K, it) {
    const c = K.c, n = K.n, pawn = c.pawnPlace(K.lang);
    const acts = [...(c.consume.get(it._id) || [])].filter(a => c.hasText(a) && !DEAD.has(a.m_Name) && c.collectEntries([a.Rewards]).some(e => e.Type === c.ITEM && e.Value > 0));
    if (!acts.length) return '';
    const a = acts[0];
    const need = (a.RequiredItems || []).find(x => c.byId.get(x.Id) === it);
    const N = need ? need.Value : 1;
    const prods = c.collectEntries([a.Rewards]).filter(e => e.Type === c.ITEM && e.Value > 0).map(e => ({ i: c.byId.get(e.Id), q: e.Value })).filter(x => x.i);
    const time = -c.sumAttr(a.Rewards, 'Time');
    const cash = prods.reduce((t, x) => t + x.i.SellValue * x.q, 0);
    const score = prods.reduce((t, x) => t + (x.i.ScoreBonus || 0) * x.q, 0);
    const shop = prods.map(x => ({ x, s: shopCost(K, x.i) })).filter(y => y.s);
    const list = prods.map(x => `${x.q > 1 ? x.q + '× ' : ''}${K.tt(x.i)}`).join(K.pt ? ' e ' : ' and ');
    const other = [];
    for (const nm of ['Happy', 'Health', 'Hygiene']) { const v = c.sumAttr(a.Rewards, nm); if (v < 0) other.push(`${n(-v)} ${K.attr(nm)}`); }
    const costs = [time > 0 ? `${n(time)} ${K.attr('Time')}` : '', ...other].filter(Boolean).join(K.pt ? ' e ' : ' and ');
    if (!cash && !score && !shop.length) return '';
    const mine = N * it.SellValue;
    const value = [
      cash ? K.s('yield sell', `${n(cash)} na ${pawn}`, `${n(cash)} at the ${pawn}`) : '',
      score ? K.s('yield score', `${n(score)} pontos no fim da partida`, `${n(score)} points at the end`) : '',
      shop.length ? K.s('yield shop', `${K.tt(shop[0].x.i)} custa ${n(shop[0].s.cash)} na loja`, `${K.tt(shop[0].x.i)} costs ${n(shop[0].s.cash)} in the shop`) : '',
    ].filter(Boolean).join('; ');
    const pt = `Usar ${N > 1 ? `${N} unidades` : 'o item'} em <strong>${K.t(a)}</strong> custa ${costs || 'nada'} e dá ${list}: ${value || 'sem valor de venda'}. Vender ${N > 1 ? `as ${N}` : 'o item'} rende só ${n(mine)}${cash > mine ? ', então usar vale mais' : ''}.`;
    const en = `Using ${N > 1 ? `${N} units` : 'the item'} in <strong>${K.t(a)}</strong> costs ${costs || 'nothing'} and gives ${list}: ${value || 'no sale value'}. Selling ${N > 1 ? `the ${N}` : 'it'} pays only ${n(mine)}${cash > mine ? ', so using it is worth more' : ''}.`;
    return K.s('worth yield (action RequiredItems and Rewards items)', pt, en);
  }

  // Móveis que fazem uma ação em casa: o que ela rende por 100 de Tempo.
  function homeAction(K, it) {
    const c = K.c;
    for (const e of ((it.Rewards || {}).RewardEntries || [])) {
      if (e.Type !== 110) continue;
      const t = c.byId.get(e.Id);
      for (const ref of (t && t.Effects) || []) {
        const ef = c.deref(ref);
        const lista = ef ? [].concat(ef.ChamberActions || [], ef.ChamberAction || []) : [];
        if (lista.length) { const a = lista.map(c.deref).find(x => x && c.hasText(x)); if (a) return a; }
      }
    }
    return null;
  }
  function specialWorth(K, it, sc) {
    const c = K.c, n = K.n;
    const P = (id, pt, en) => K.s(id, pt, en);
    const fishes = c.items.filter(i => (i.SubTypes || []).includes(110)).sort((a, b) => b.SellValue - a.SellValue);
    switch (it.m_Name) {
      case 'Special Furniture Suitarmor': return P('worth armor (crime chance 0.5 x (1 - Security))', 'Na Onda de Crimes, a chance de levarem seu Dinheiro por turno é 50% multiplicado por 1 menos a sua Segurança; com a Armadura colocada ela cai a zero. Vale a pena para quem anda com muito Dinheiro na carteira durante o evento. Móveis e itens da mochila continuam sem proteção.', 'During the Crime Wave, the chance of your cash being taken each turn is 50% times 1 minus your Security; with the Armor placed it drops to zero. Worth it for anyone carrying a lot of cash during the event. Furniture and inventory items stay unprotected.');
      case 'Special Roomba': return P('worth roomba (crime chance 0.5 x (1 - Security))', 'Na Onda de Crimes, a chance de levarem um móvel seu por turno é 50% multiplicado por 1 menos a sua Segurança; com o robô colocado ela cai a zero. Vale a pena para quem tem móveis caros colocados. Dinheiro e itens da mochila continuam sem proteção.', 'During the Crime Wave, the chance of a piece of your furniture being taken each turn is 50% times 1 minus your Security; with the robot placed it drops to zero. Worth it for anyone with expensive furniture placed. Cash and inventory items stay unprotected.');
      case 'Special Furniture Banjo': return P('worth banjo (3 to 4 special slots)', 'A prateleira passa de 3 para 4 móveis especiais por rodada (um terço a mais de chance de ver o que você procura). Só ajuda quem compra móveis especiais na Casa de Penhores.', 'The shelf goes from 3 to 4 special pieces per round (a third more chance of seeing what you want). It only helps anyone who buys special furniture at the Pawn Shop.');
      case 'Special Furniture Fish in a Barrel': {
        const top = fishes[0], low = fishes[fishes.length - 1];
        return P('worth barrel (x1.2 fish pawn price)', `Cada peixe rende 20% a mais na penhora: ${K.tt(top)} passa de ${n(top.SellValue)} para ${n(Math.round(top.SellValue * 1.2))}, e o peixe mais barato (${K.tt(low)}) de ${n(low.SellValue)} para ${n(Math.round(low.SellValue * 1.2))}. Vale a pena para quem pesca muito e vende o que pesca.`, `Each fish pays 20% more at the Pawn Shop: ${K.tt(top)} goes from ${n(top.SellValue)} to ${n(Math.round(top.SellValue * 1.2))}, and the cheapest fish (${K.tt(low)}) from ${n(low.SellValue)} to ${n(Math.round(low.SellValue * 1.2))}. Worth it for anyone who fishes a lot and sells the catch.`);
      }
      case 'Special Bagle Toaster': return P('worth bagel toaster (ChanceOfAddingReportTraitEffect.OnRoundStarted, 5% x 400)', `Valor esperado: 5% de ${n(400)} dá ${n(20)} de Dinheiro por rodada (o sorteio é feito no início de cada rodada). É um bônus pequeno; o móvel vale mais pelos pontos e pelo efeito de relaxar.`, `Expected value: 5% of ${n(400)} is ${n(20)} Cash per round (the draw happens at the start of each round). It is a small bonus; the piece is worth more for its points and its relax effect.`);
      case 'Special Furniture Catcharm': return P('worth lucky cat (3% to 6%)', `Dobra a chance de cada bilhete (de 3% para 6%): o retorno esperado de um bilhete em um sorteio passa de cerca de ${n(31)} para cerca de ${n(62)} (3% e 6% de 1.025). Só ajuda quem joga na loteria.`, `Doubles each ticket's chance (from 3% to 6%): the expected return of a ticket in one draw goes from about ${n(31)} to about ${n(62)} (3% and 6% of 1,025). It only helps anyone who plays the lottery.`);
      case 'Special Furniture Dinosaur Skeleton': {
        const bone = c.items.find(i => i.m_Name === 'Dinosaur Bone 1');
        const top = Math.max(...c.items.filter(i => i.Purpose === 4).map(i => i.ScoreBonus));
        return P('worth dinosaur skeleton (5 bones, ScoreBonus)', `Montar gasta 5 ossos (que valeriam ${n(5 * bone.SellValue)} na penhora) e 300 de Tempo, e dá ${it.ScoreBonus === top ? 'o maior bônus de pontos entre todos os móveis' : 'um bônus de pontos'}: ${n(it.ScoreBonus)}, além de ${n(100)} de Felicidade, Saúde e Higiene ao relaxar. A venda não rende nada. Vale a pena para quem junta os ossos como Catador e quer pontos no fim.`, `Assembling uses 5 bones (worth ${n(5 * bone.SellValue)} at the Pawn Shop) and 300 Time, and gives ${it.ScoreBonus === top ? 'the biggest points bonus of any furniture' : 'a points bonus'}: ${n(it.ScoreBonus)}, plus ${n(100)} Happiness, Health and Hygiene when relaxing. Selling it pays nothing. Worth it for anyone gathering bones as a Scavenger who wants points at the end.`);
      }
      case 'Burglar Trap': case 'VexCorp Security System': {
        const { fits } = fitsHomes(K, it);
        const per = fits.map(h => `${K.tt(h)} ${n(Math.round((1 - h.SecurityLevel) * 100))}% → ${n(Math.round((1 - Math.min(1, h.SecurityLevel + it.Security)) * 100))}%`).join('; ');
        const baixa = fits.some(h => h.SecurityLevel < 1);
        return P('worth security item (HomeData.SecurityLevel, MaxFurnitureTier, ItemData.Security, Tier)', `Chance de o ladrão entrar na Onda de Crimes, sem o item → com ele, nas moradias onde ele cabe (só moradia, sem contar o que os móveis comuns tiram): ${per}. ${baixa ? 'Vale a pena onde a Segurança da moradia ainda é baixa; onde ela já chega a 1, o item só compensa o que os móveis comuns tiram.' : 'A moradia onde ele cabe já tem Segurança 1: o item só compensa o que os móveis comuns tiram.'}`, `Chance of the thief getting in during a Crime Wave, without the item → with it, in the homes where it fits (home only, not counting what regular furniture takes off): ${per}. ${baixa ? "Worth it where the home's Security is still low; where it already reaches 1, the item only offsets what regular furniture takes off." : 'The home where it fits already has Security 1: the item only offsets what regular furniture takes off.'}`);
      }
      case 'Special Furniture Easter Statue': return P('worth easter statue (park actions: gains x3)', `Triplica o ganho das 5 ações ${parque(K) ? emLugar(K, parque(K), 'de') : 'do Parque'}. Vale a pena para quem usa essas ações o tempo todo; para quem passa pouco por lá, o efeito não muda nada e só restam os pontos.`, 'Triples the gain of the 5 Park actions. Worth it for anyone who uses those actions all the time; for someone who rarely goes there, it changes nothing.');
      default: {
        const a = homeAction(K, it);
        if (!a) return '';
        const time = -c.sumAttr(a.Rewards, 'Time');
        const cd = a.Cooldown === 1 ? K.s('once per round', ', no máximo uma vez por rodada', ', at most once per round') : '';
        const attrOf = e => c.byId.get(e.Id);
        const isAttr = e => e.Type === c.ATTRIBUTE && attrOf(e) && !['Time', 'Cash'].includes(attrOf(e).m_Name);
        const gains = a.Rewards.RewardEntries.filter(e => isAttr(e) && (attrOf(e).m_Name === 'Stress' ? e.Value < 0 : e.Value > 0));
        const sobeEstresse = e => attrOf(e).m_Name === 'Stress' && e.Value > 0;
        const spend = a.Rewards.RewardEntries.filter(e => isAttr(e) && e.Value && !gains.includes(e) && !sobeEstresse(e)).map(e => `${n(Math.abs(e.Value))} ${K.attr(attrOf(e).m_Name)}`);
        const sobe = a.Rewards.RewardEntries.filter(e => isAttr(e) && sobeEstresse(e)).map(e => `${n(e.Value)} ${K.attr('Stress')}`);
        if (time === 0 && !gains.length) return P('worth home action free of time (Vexcorp - Teleport)', `<strong>${K.t(a)}</strong> custa ${spend.join(' e ') || 'quase nada'} e nenhum Tempo, enquanto cada quadra a pé custa 20 de Tempo. Economiza o Tempo de qualquer viagem longa, mas gasta Higiene a cada uso.`, `<strong>${K.t(a)}</strong> costs ${spend.join(' and ') || 'almost nothing'} and no Time, while each block on foot costs 20 Time. It saves the Time of any long trip, but spends Hygiene on every use.`);
        if (!gains.length) return P('worth home action info only', `<strong>${K.t(a)}</strong> gasta ${n(time)} de Tempo${cd} e não dá atributos: serve só pela informação que mostra. O móvel vale pelos pontos, ${n(it.ScoreBonus)}.`, `<strong>${K.t(a)}</strong> costs ${n(time)} Time${cd} and gives no attributes: it is only for the information it shows. The piece is worth it for its points, ${n(it.ScoreBonus)}.`);
        const rate = gains.map(e => `${n(Math.round(Math.abs(e.Value) / time * 100))} ${K.attr(attrOf(e).m_Name)}`).join(K.pt ? ' e ' : ' and ');
        return P('worth home action (rate per 100 Time)', `<strong>${K.t(a)}</strong> rende ${rate} a cada 100 de Tempo gasto${cd}${spend.length ? `, e gasta ${spend.join(' e ')}` : ''}${sobe.length ? `, e aumenta o ${sobe.join(' e ').replace(/^(\S+) (.+)$/, '$2 em $1')}` : ''}. Vale a pena se for esse atributo que você precisa repor.`, `<strong>${K.t(a)}</strong> gives ${rate} per 100 Time spent${cd}${spend.length ? `, and spends ${spend.join(' and ')}` : ''}${sobe.length ? `, and raises ${sobe.join(' and ')}` : ''}. Worth it if that is the attribute you need to refill.`);
      }
    }
  }

  function worthFridge(K, it, sc, all) {
    const c = K.c, n = K.n;
    const P = (id, pt, en) => K.s(id, pt, en);
    return P('worth fridge (ContainerSize vs shop cost)', `${n(sc.cash)} por ${it.ContainerSize} refeições: ${n(Math.round(sc.cash / it.ContainerSize))} de Dinheiro por refeição guardada (${all.map(i => `${K.tt(i)} ${n(Math.round(shopCost(K, i).cash / i.ContainerSize))}`).join('; ')}). A primeira geladeira vale a pena para quem quer guardar refeições e não precisar sair para comer (sem ela a comida estraga); a segunda não soma, só vale a maior.`, `${n(sc.cash)} for ${it.ContainerSize} meals: ${n(Math.round(sc.cash / it.ContainerSize))} Cash per stored meal (${all.map(i => `${K.tt(i)} ${n(Math.round(shopCost(K, i).cash / i.ContainerSize))}`).join('; ')}). The first fridge is worth it if you buy food for home (without one the food spoils); a second does not add, only the biggest counts.`);
  }
  function worthFurniture(K, it, sc, skipGroup) {
    const c = K.c, n = K.n;
    const P = (id, pt, en) => K.s(id, pt, en);
    const spec = [300, 310, 320].includes(it.FurnitureSlot) && !(it.SubTypes || []).includes(120);
    const cult = (it.SubTypes || []).includes(270);
    const pawn = c.pawnPlace(K.lang);
    const furn = c.items.filter(i => i.Purpose === 4);
    const priced = furn.map(i => ({ i, s: shopCost(K, i) })).filter(x => x.s && x.i.ScoreBonus > 0);
    const parts = [];
    if (spec) {
      const specials = furn.filter(i => [300, 310, 320].includes(i.FurnitureSlot) && !(i.SubTypes || []).includes(120) && i.BuyValue > 0);
      const rk = specials.slice().sort((a, b) => b.ScoreBonus / b.BuyValue - a.ScoreBonus / a.BuyValue).findIndex(i => i === it) + 1;
      parts.push(P('worth special furniture shelf (BuyValue)', `À venda, só aparece na prateleira da ${pawn}${it.BuyValue ? `, por ${n(it.BuyValue)}` : ''}, e rende ${n(it.SellValue)} se for penhorado. Dá ${n(it.ScoreBonus)} pontos por ${n(it.BuyValue)} (${rk}º entre os ${specials.length} móveis especiais nessa conta).`, `For sale, it only shows up on the ${pawn} shelf${it.BuyValue ? `, for ${n(it.BuyValue)}` : ''}, and pays ${n(it.SellValue)} if pawned. It gives ${n(it.ScoreBonus)} points for ${n(it.BuyValue)} (${rk}th among the ${specials.length} special furniture pieces by that measure).`));
    }
    const own = specialWorth(K, it, sc);
    if (own) parts.push(own);
    if (cult) {
      const best = priced.slice().sort((a, b) => b.i.ScoreBonus - a.i.ScoreBonus)[0];
      parts.push(P('worth cultist furniture (ScoreBonus vs best shop furniture)', `Vem de graça como bênção do Cultista: só quem tem esse papel o recebe, e ele nunca está à venda. Rende ${n(it.ScoreBonus)} pontos no fim da partida, ${it.ScoreBonus >= best.i.ScoreBonus ? 'tanto quanto' : `contra ${n(best.i.ScoreBonus)} d`}${it.ScoreBonus >= best.i.ScoreBonus ? ' o' : 'o'} móvel de loja que mais pontua (${K.tt(best.i)}), sem gastar Dinheiro.`, `It comes free as a Cultist boon: only that role gets it, and it is never for sale. It gives ${n(it.ScoreBonus)} points at the end of the game, ${it.ScoreBonus >= best.i.ScoreBonus ? 'as many as' : `against ${n(best.i.ScoreBonus)} for`} the best-scoring shop piece (${K.tt(best.i)}), with no Cash spent.`));
    } else if (sc && it.ScoreBonus > 0) {
      const rank = priced.slice().sort((a, b) => b.i.ScoreBonus / b.s.cash - a.i.ScoreBonus / a.s.cash).findIndex(x => x.i === it) + 1;
      parts.push(P('worth furniture score per cash (ScoreBonus / shop cost)', `Rende ${n(it.ScoreBonus)} pontos por ${n(sc.cash)} de Dinheiro (${n(Math.round(it.ScoreBonus / sc.cash * 100) / 100)} ponto por Dinheiro), ${rank}º entre os ${priced.length} móveis à venda nessa conta.`, `It gives ${n(it.ScoreBonus)} points for ${n(sc.cash)} Cash (${n(Math.round(it.ScoreBonus / sc.cash * 100) / 100)} points per coin), ${rank}th among the ${priced.length} furniture pieces on sale by that measure.`));
    }
    if (!sc && !spec && !cult && (c.startingGear.has(it._id) || !K.origin)) parts.push(c.startingGear.has(it._id)
      ? P('worth furniture given at start', `Não se compra, já vem com você${it.ScoreBonus ? `: rende ${n(it.ScoreBonus)} pontos` : ': não pontua'}. Qualquer cama melhor que você compre passa a valer no lugar dela ao dormir.`, `It cannot be bought, you start with it${it.ScoreBonus ? `: it gives ${n(it.ScoreBonus)} points` : ': it scores nothing'}. Any better bed you buy counts instead of it when sleeping.`)
      : P('worth furniture no origin', `Como nada nas tabelas do jogo entrega este móvel, não dá para planejar em cima dele.${it.ScoreBonus ? ` Se um dia aparecer, ele dá ${n(it.ScoreBonus)} pontos no fim da partida, ou ${n(it.SellValue)} de Dinheiro se for vendido.` : ''}`, `Since nothing in the game tables gives this furniture, you cannot plan around it.${it.ScoreBonus ? ` If it ever shows up, it gives ${n(it.ScoreBonus)} points at the end of the game, or ${n(it.SellValue)} Cash if sold.` : ''}`));
    const cursos = [...new Set(c.pointersTo(it).filter(p => p.cls === 'EducationData' && p.field === 'RequiredItems' && c.hasText(p.r)).map(p => c.titleText(K.lang, p.r)))];
    if (cursos.length) parts.push(P('worth furniture course need (EducationData.RequiredItems)', `Também é exigido por ${cursos.length === 1 ? '1 curso' : `${cursos.length} cursos`} (veja Para que serve), então quem pretende fazer esses cursos precisa dele de qualquer jeito.`, `It is also required by ${cursos.length === 1 ? '1 course' : `${cursos.length} courses`} (see What it is for), so anyone planning those courses needs it anyway.`));
    const group = sc && it.FurnitureSlot && !spec && !skipGroup ? furn.filter(i => i.FurnitureSlot === it.FurnitureSlot && i !== it && shopCost(K, i)) : [];
    if (group.length) {
      const fx = i => (i.Rewards.RewardEntries || []).filter(e => e.Type === c.ATTRIBUTE && (c.byId.get(e.Id) || {}).m_Name !== 'Cash').map(e => `${c.formatValue(K.lang, e.Value)} ${K.attr(c.byId.get(e.Id).m_Name)}`).join(', ');
      const name = { 10: 'as camas', 40: 'as poltronas', 60: 'as geladeiras', 120: 'as TVs', 200: 'os aparelhos de som' }[it.FurnitureSlot];
      const nameEn = { 10: 'beds', 40: 'armchairs', 60: 'fridges', 120: 'TVs', 200: 'stereos' }[it.FurnitureSlot];
      const all = group.concat([it]).sort((a, b) => shopCost(K, a).cash - shopCost(K, b).cash);
      if (name) parts.push(P('worth furniture same slot (FurnitureSlot group)', `Entre ${name}: ${all.map(i => `${K.tt(i)} ${n(shopCost(K, i).cash)}${fx(i) ? ` (${fx(i)})` : ''}`).join('; ')}.${it.FurnitureSlot === 10 ? ' Só a melhor cama conta ao dormir.' : ''}`, `Among ${nameEn}: ${all.map(i => `${K.tt(i)} ${n(shopCost(K, i).cash)}${fx(i) ? ` (${fx(i)})` : ''}`).join('; ')}.${it.FurnitureSlot === 10 ? ' Only the best bed counts when you sleep.' : ''}`));
    }
    const drop = !cult && !(it.Security > 0) ? { 2: 0.02, 4: 0.04, 6: 0.08 }[it.Tier] : 0;
    if (drop) parts.push(P('worth furniture security cost', `Custo escondido: reduz a Segurança da casa em ${n(drop)} (veja Segurança da casa, acima).`, `Hidden cost: it lowers home Security by ${n(drop)} (see Home security, above).`));
    if (!parts.length) parts.push(P('worth furniture default', `Rende ${n(it.SellValue)} na ${pawn}.`, `It pays ${n(it.SellValue)} at the ${pawn}.`));
    return parts.join(' ');
  }

  // ------------------------------------------------------------------ roupas (cópia fiel das regras já conferidas)
  function clothesCallouts(K, it) {
    const c = K.c, lang = K.lang, calls = [];
    const naked = c.items.find(x => x.m_Name === 'Tier 0 Clothes');
    calls.push(c.callout(c.ui(lang, 'durability'), `<p>${K.s('durability in rounds', `Dura ${it.Durability} rodadas. Depois disso, você fica ${c.link(lang, naked, c.title(lang, naked))}.`, `Lasts ${it.Durability} rounds. After that you end up ${c.link(lang, naked, c.title(lang, naked))}.`)}</p>`));
    const need = c.jobs.filter(j => !c.artistJobs.has(j._id) && j.RequiredEquippedItemTier === it.Tier);
    const lower = c.jobs.filter(j => !c.artistJobs.has(j._id) && j.RequiredEquippedItemTier < it.Tier).length;
    if (need.length) calls.push(c.callout(c.ui(lang, 'unlocks'), `<p>${K.s('jobs by tier (JobHandler.CanApplyForJob: refuses only when GetClothesTier is lower)', `${need.length} empregos pedem exatamente este nível: ${need.map(j => c.link(lang, j, c.title(lang, j))).join(', ')}. Ela também serve nos ${lower} empregos que pedem nível menor.`, `${need.length} jobs ask for exactly this tier: ${need.map(j => c.link(lang, j, c.title(lang, j))).join(', ')}. It also works for the ${lower} jobs that ask for a lower tier.`)}</p>`));
    const fix = c.repairAction();
    calls.push(c.callout(c.title(lang, fix), `<p>${K.s('repair cost (PerformNormalAction, ChamberActionAvailability.RepairClothesCostFraction 0.6, ItemData.BuyValue)', `Só quando falta 1 rodada de durabilidade. Custa ${K.n(Math.round(it.BuyValue * c.REPAIR_FRACTION))} de Dinheiro e ${K.n(-c.sumAttr(fix.Rewards, 'Time'))} de Tempo, e a roupa volta a durar ${Math.ceil(it.Durability * 0.65)} rodadas. Onde: ${c.placesOf(lang, c.actionHome.get(fix._id) || [])}.`, `Only with 1 round of durability left. Costs ${K.n(Math.round(it.BuyValue * c.REPAIR_FRACTION))} Cash and ${K.n(-c.sumAttr(fix.Rewards, 'Time'))} Time, and the outfit lasts ${Math.ceil(it.Durability * 0.65)} more rounds. Where: ${c.placesOf(lang, c.actionHome.get(fix._id) || [])}.`)}</p>`));
    return calls;
  }

  // Itens sem frase própria no jogo ganham uma linha de abertura.
  function leadText(K, it) {
    const species = { dog: ['cachorro', 'dog'], cat: ['gato', 'cat'], chicken: ['galinha', 'chicken'], frog: ['sapo', 'frog'], bird: ['pássaro', 'bird'], snake: ['cobra', 'snake'], turtle: ['tartaruga', 'turtle'], rock: ['pedra', 'rock'], pig: ['porco', 'pig'], panda: ['panda-vermelho', 'red panda'] }[petKind(it)];
    if (it.Purpose === 7 && !shopActs(K.c, it).length) return '';
    if (it.Purpose === 7) return K.s('lead pet', `Um pet${species ? ` (${species[0]})` : ''} que você compra na Pet Shop.`, `A pet${species ? ` (${species[1]})` : ''} you buy at the Pet Shop.`);
    if (it.ItemSubGroup === 8 && !(it.SellValue > 0) && K.origin) return K.s('lead quest item', 'Item de missão: só serve dentro da missão.', 'Quest item: it only works inside the quest.');
    if (it.Purpose === 4) return K.s('lead furniture', `Móvel${it.Tier ? ` de nível ${it.Tier}` : ''} para a sua casa.`, `Furniture${it.Tier ? ` of tier ${it.Tier}` : ''} for your home.`);
    return '';
  }

  // ------------------------------------------------------------------ montagem de um item
  function explain(lang, it) {
    const c = ctx();
    const K = kit(lang, it.m_Name);
    if (c.isStock(it)) return stockBlock(K, it);
    const calls = [];
    const isClothes = it.ItemSubGroup === 5 && it.Tier > 0;
    if (isClothes) calls.push(...clothesCallouts(K, it));
    const pawn = c.pawnPlace(lang);

    // Como conseguir
    let obtainHtml = obtainLines(K, it);
    // roupas: lojas por mapa
    if (isClothes) {
      const sc = shopCost(K, it);
      obtainHtml = obtainHtml.filter(l => !/^<li>(Compre |Buy at)/.test(l));
      const lojas = [...new Set([...(c.obtain.get(it._id) || [])].filter(a => c.sumAttr(a.Rewards, 'Cash') < 0).flatMap(a => c.actionHome.get(a._id) || []))];
      if (sc) obtainHtml.unshift(`<li>${K.s('clothes shop (shop actions by map)', `Compre ${lojas.length ? emLugares(K, lojas) : c.clothesShops(lang, it)}: ${sc.text}.`, `Buy at: ${c.clothesShops(lang, it)}. Costs ${sc.text}.`)}</li>`);
    }
    K.origin = obtainHtml.length > 0 || c.startingGear.has(it._id);
    if (obtainHtml.length) calls.push(c.callout(c.ui(lang, 'obtain'), `<ul class="plain">${[...new Set(obtainHtml)].slice(0, 16).join('')}</ul>`));
    else {
      const notas = require('./itens-sem-fonte')(K, it, { emLugar });
      calls.push(c.callout(c.ui(lang, 'obtain'), notas.map(p => `<p>${p}</p>`).join('')));
    }

    // Para que serve
    const uses = [];
    const seen = new Set();
    // traços que dão ação (mapas, ossos, anel)
    const act = actionLines(K, it, []);
    uses.push(...act);
    uses.push(...questLines(K, it));
    const courses = [];
    for (const p of c.pointersTo(it)) {
      if (p.cls === 'EducationData' && p.field === 'RequiredItems' && c.hasText(p.r)) courses.push(`<strong>${K.t(p.r)}</strong>`);
      if (p.cls === 'LotteryData') uses.push(`<li>${K.s('lottery (LotteryData.Tickets)', 'Vale como bilhete da loteria: todo início de rodada cada bilhete tem 3% de chance de ganhar um prêmio entre 950 e 1.100, dividido entre os bilhetes premiados.', 'Counts as a lottery ticket: at the start of every round each ticket has a 3% chance of winning a prize between 950 and 1,100, split among the winning tickets.')}</li>`);
      if (p.cls === 'Artifact' || (p.field === 'Artifact' && /Scavenger/.test(p.cls))) uses.push(`<li>${K.s('artifact use (Scavenger.Locations.ArtifactsRequired)', 'Cada artefato achado conta para liberar novos locais de busca do Catador.', 'Each artifact found counts toward unlocking new places for the Scavenger to search.')}</li>`);
    }
    if (courses.length) uses.push(`<li>${K.s('course needs item (EducationData.RequiredItems)', `Você precisa dele para ${courses.length > 1 ? 'os cursos' : 'o curso'} ${[...new Set(courses)].join(', ')}.`, `You need it for ${courses.length > 1 ? 'the courses' : 'the course'} ${[...new Set(courses)].join(', ')}.`)}</li>`);
    if (it.m_Name === 'Infernal Lottery Ticket') uses.push(`<li>${K.s('infernal ticket (InfernalLotteryTicketTraitEffect Modifier 1)', 'Com ele na mochila, a chance de ganhar na loteria soma 100 pontos percentuais: ele mesmo conta como bilhete, então você ganha todo sorteio enquanto o tiver.', 'With it in your inventory, the lottery win chance adds 100 percentage points: it counts as a ticket itself, so you win every draw while you hold it.')}</li>`);
    if (it.m_Name === 'The One Ring') uses.push(`<li>${K.s('one ring (One-Ring-Movement-Cost, Encumbered-New)', `Enquanto estiver na mochila, <strong>cada deslocamento</strong> custa ${c.formatValue(lang, -20)} ${K.attr('Happy')}, ${c.formatValue(lang, -20)} ${K.attr('Health')} e ${c.formatValue(lang, -20)} ${K.attr('Hygiene')}, e você anda 1,5 vez mais devagar, com cada deslocamento custando 20% mais Tempo. Para se livrar dele, lance-o no ácido na Vexcorp.`, `While it sits in your inventory, <strong>every trip</strong> costs ${c.formatValue(lang, -20)} ${K.attr('Happy')}, ${c.formatValue(lang, -20)} ${K.attr('Health')} and ${c.formatValue(lang, -20)} ${K.attr('Hygiene')}, and you move 1.5 times slower, with every trip costing 20% more Time. To get rid of it, throw it into the acid at Vexcorp.`)}</li>`);
    if ((it.SubTypes || []).includes(260)) uses.push(`<li>${K.s('pawn coupon (TryGetPurchaseCoupon, SubType 260)', `Vale um item de graça na prateleira da ${pawn}.`, `Worth one free item from the ${pawn} shelf.`)}</li>`);
    // Alimentar o Terror
    for (const a of c.consume.get(it._id) || []) {
      if (/^Cultist.*Feed furniture/.test(a.m_Name) && c.hasText(a)) {
        const cl = c.roles.find(r => /cultist/i.test(`${r.m_Name} ${r.Term || ''}`));
        const cost = costOf(K, a);
        uses.push(`<li>${K.s('cultist feed furniture (Feed furniture Purpose 2 ConsumeItem, PerformNormalAction, TryUpdatePlayerOwnedItemState, TryRemoveFurniture)', `Para o papel ${cl ? K.l(cl) : 'Cultista'}: quando o terror cósmico pede este móvel, você faz a ação <strong>${K.t(a)}</strong> em casa, com ele colocado (${cost.text}). Isso cumpre o pedido, e o móvel é consumido: ele sai da sua casa.`, `For the ${cl ? K.l(cl) : 'Cultist'} role: when the cosmic horror asks for this piece, you do the action <strong>${K.t(a)}</strong> at home with it placed (${cost.text}). That fulfills the request and the piece is used up: it leaves your home.`)}</li>`);
        break;
      }
    }
    if (it.m_Name === 'Fishing Pole') uses.push(`<li>${K.s('fishing pole use (Go Fishing RequiredItems)', 'Exigida pela ação Pescar (não é gasta, só precisa estar na mochila). Quem tem a Vara Magnética ou a Sublime pesca com elas, sem precisar desta.', 'Required by the Fish action (it is not used up, it only has to be in your inventory). Whoever owns the Magnet or Master pole fishes with those, without needing this one.')}</li>`);
    if (it.m_Name === 'Fishing Bait') uses.push(`<li>${K.s('bait use (Fishing-Bait-Replace-Actions)', `Com isca na mochila, ${K.act('Go Fishing')} vira ${K.act('Go Fishing (Bait)')} e ${K.act('Go Fishing Master')} vira ${K.act('Go Fishing - Master (Bait)')}: a tabela perde o lixo e cada pescaria gasta 1 isca. A vara magnética não usa isca.`, `With bait in your inventory, ${K.act('Go Fishing')} becomes ${K.act('Go Fishing (Bait)')} and ${K.act('Go Fishing Master')} becomes ${K.act('Go Fishing - Master (Bait)')}: the table loses its junk and each trip uses 1 bait. The Magnet pole does not use bait.`)}</li>`);
    if (it.Purpose === 3 && it.ItemSubGroup === 7) uses.push(`<li>${K.s('transport equipped (Purpose 3, RealmData.EquipmentTypes)', 'Vale equipado. Só um transporte fica equipado por vez: equipar outro tira o anterior. Cada quadra que você anda gasta o Tempo mostrado abaixo.', 'Works when equipped. Only one transport is equipped at a time: equipping another removes the previous one. Each block you walk costs the Time shown below.')}${(() => { const q = tempoPorQuadra(K, it); return q.mult !== 1 ? ` ${K.s('transport real cost (MovePlayerOnPath, ModifyMovementSpeedAndCostTraitEffect.AdditionalMoveCostList)', `O próprio transporte ainda multiplica esse Tempo por ${K.n(q.mult)}: cada quadra sai por ${K.n(q.final)} de Tempo.`, `The transport itself also multiplies that Time by ${K.n(q.mult)}: each block ends up costing ${K.n(q.final)} Time.`)}` : ''; })()} ${c.effects(lang, (it.Rewards.RewardEntries || []).filter(e => e.Type === c.ATTRIBUTE))}</li>`);
    if (it.m_Name === 'Transport-Walking-Shoes') uses.push(`<li>${K.s('walking shoes default', 'É o jeito padrão de andar: todo jogador já começa com ele.', 'It is the default way of getting around: every player starts with it.')}</li>`);
    // peixe
    if ((it.SubTypes || []).includes(110)) uses.push(`<li>${K.s('fish score (GetFishingScore: ScoreBonus x rounds x 0.02, RegisterCaughtFish)', `Conta na pontuação de Pesca <strong>uma vez por espécie</strong>: ${K.n(it.ScoreBonus)} × rodadas × 2%. Em 10 rodadas, vale ${K.n(Math.round(it.ScoreBonus * 10 * 0.02 * 100) / 100)} pontos.`, `Counts toward the Fishing score <strong>once per species</strong>: ${K.n(it.ScoreBonus)} × rounds × 2%. In 10 rounds, it is worth ${K.n(Math.round(it.ScoreBonus * 10 * 0.02 * 100) / 100)} points.`)}</li>`);
    if (it.m_Name === 'Special Furniture Fish in a Barrel') { /* efeito em Quando faz efeito */ }
    // sobrepeso (itens de missão pesados): Encumbered
    const heavy = ((it.Rewards || {}).RewardEntries || []).some(e => e.Type === 110 && ((c.byId.get(e.Id) || {}).m_Name === 'Encumbered' || (c.byId.get(e.Id) || {}).m_Name === 'Encumbered-New'));
    // dedupe das linhas de uso
    const usesU = [...new Set(uses)];
    if (usesU.length) calls.push(c.callout(K.s('label uses', 'Para que serve', 'What it is for'), `<ul class="plain">${usesU.slice(0, 16).join('')}</ul>`));
    // pets: vantagens
    if (it.ItemSubGroup === 3) {
      const lines = petLines(K, it);
      const mood = K.s('pet mood rule (PetHandler.OnTurnStarted)', 'O humor do pet escolhe o valor: cada linha abaixo traz três, na ordem negligenciado / contente / mimado. Ele fica <strong>negligenciado</strong> se algum atributo dele está abaixo de 40%, <strong>mimado</strong> se todos estão em 80% ou mais, <strong>contente</strong> no meio. Como manter o pet bem (e o que acontece sem comida) está no guia Pets. Só dá para ter 1 pet, e os pets da mesma espécie têm as mesmas vantagens: muda só o nome e o desenho.', 'Mood changes the advantage, and the three values on each line below follow the order neglected / content / pampered. A pet is <strong>neglected</strong> if any pet attribute is below 40%, <strong>pampered</strong> if all are at 80% or more, <strong>content</strong> in between. With no food, each pet attribute loses 5% of its maximum per turn and it dies after 4 turns. You can only have 1 pet. All pets of the same species share the same advantages; only the name and the art change.');
      if (lines.length) calls.push(c.callout(K.s('pet perks label', 'Vantagens do pet (enquanto for seu)', 'Pet advantages (while it is yours)'), `<p>${mood}</p><ul class="plain">${lines.map(x => `<li>${x}</li>`).join('')}</ul>`));
    }
    // Quando faz efeito (não-móvel)
    if (it.Purpose !== 4 && it.ItemSubGroup !== 3) {
      const when = [];
      const own = specialEffect(K, it);
      when.push(...own);
      if (heavy) when.push(K.s('encumbered (Encumbered-New: speed x1.5, move Time x1.2)', 'Enquanto você carrega este item (<strong>sobrepeso</strong>), anda 1,5 vez mais devagar e cada deslocamento custa 20% mais Tempo. Entregue logo.', 'While you carry this item (<strong>encumbered</strong>), you move 1.5 times slower and every trip costs 20% more Time. Deliver it soon.'));
      if (it.Purpose === 6) {
        const geladeiras = c.items.filter(i => i.Purpose === 4 && i.ContainerSize > 0).sort((a, b) => a.Tier - b.Tier);
        const nome = K.tt(it);
        when.push(K.s('food covers one round (HomeHandler.OnTurnEnded: one unit per turn without eating)', `Apesar do nome «${nome}», cada unidade cobre <strong>1 rodada</strong>: é uma refeição guardada em casa. Uma geladeira com 4 unidades cobre 4 rodadas sem comer fora.`, `Despite the name «${nome}», each unit covers <strong>1 round</strong>: it is one meal stored at home. A fridge with 4 units covers 4 rounds without eating out.`));
        when.push(K.s('food eaten at end of turn (HomeHandler.OnTurnEnded, HasEatenInTurn)', '<strong>Usar</strong> é automático e não gasta Tempo: no fim do seu turno, se você não comeu nada nele, o jogo gasta 1 unidade e você escapa da punição por fome. Se você comeu, a unidade continua guardada.', '<strong>Using</strong> it is automatic and costs no Time: at the end of your turn, if you did not eat, the game uses 1 unit and you escape the hunger penalty. If you did eat, the unit stays stored.'));
        when.push(K.s('food goes to the fridge (TryUpdatePlayerOwnedItemState case 6, GetFoodStorageRemaining)', `A comida vai direto para a geladeira, sem ocupar a mochila. Quantas cabem: ${geladeiras.map(i => `${K.l(i)} ${i.ContainerSize}`).join(', ')}. Vale a maior geladeira colocada, não a soma, e a compra não passa se não couber.`, `Food goes straight to the fridge and takes no inventory slot. How many fit: ${geladeiras.map(i => `${K.l(i)} ${i.ContainerSize}`).join(', ')}. The biggest fridge placed counts, not the sum, and the purchase fails if it does not fit.`));
        when.push(K.s('food spoils without fridge (HomeHandler.OnTurnEnded, RealmData.SpoiledFoodReport)', 'Sem geladeira, a comida guardada estraga no fim do turno: o jogo avisa e ela some.', 'With no fridge, stored food spoils at the end of the turn: the game tells you and it is gone.'));
      } else if ([2, 5, 8].includes(it.Purpose)) when.push(K.s('no passive bonus (Purpose 2/5/6/8 ignore Rewards traits)', 'Não dá vantagem por ficar guardado: só vale quando é usado.', 'No bonus for keeping it: it only matters when used.'));
      if (when.length) calls.push(c.callout(K.s('furniture effect label', 'Quando faz efeito', 'When it works'), `<ul class="plain">${when.map(x => `<li>${x}</li>`).join('')}</ul>`));
    }
    // móveis
    if (it.Purpose === 4) calls.push(...furnitureCallouts(K, it));
    // Venda
    let w = worth(K, it);
    const abreComVenda = w && it.SellValue > 0 && w.startsWith(K.pt ? `Rende ${K.n(it.SellValue)} na ${pawn}` : `It pays ${K.n(it.SellValue)} at the ${pawn}`);
    const generico = abreComVenda && w === K.s('worth generic (SellValue)', `Rende ${K.n(it.SellValue)} na ${pawn}.`, `It pays ${K.n(it.SellValue)} at the ${pawn}.`);
    if (it.SellValue > 0 && it.m_Name !== 'Friendship Crate' && !(!K.origin && it.ItemGroup === 5 && it.ItemSubGroup === 10)) {
      const used = uses.length || it.Purpose === 6 || it.Purpose === 8 || it.Purpose === 4 || it.Purpose === 3 || it.Purpose === 7 || c.isStock(it) || it.ScoreBonus > 0 || [1].includes(it.Purpose) && ((it.Rewards || {}).RewardEntries || []).some(e => e.Type === 110);
      if (generico && !used) w = K.s('only sell (no pointer in game data, GetPawnRewardsForItem)', `Serve só para vender: rende ${K.n(it.SellValue)} na ${pawn}.`, `It is only good for selling: it fetches ${K.n(it.SellValue)} at the ${pawn}.`);
      if (!abreComVenda) calls.push(c.callout(c.ui(lang, 'sell'), `<p>${K.s(used ? 'sell value (GetPawnRewardsForItem)' : 'only sell (no pointer in game data, GetPawnRewardsForItem)', used ? `Na ${pawn}, rende ${K.n(it.SellValue)}.` : `Serve só para vender: rende ${K.n(it.SellValue)} na ${pawn}.`, used ? `At the ${pawn}, it fetches ${K.n(it.SellValue)}.` : `It is only good for selling: it fetches ${K.n(it.SellValue)} at the ${pawn}.`)}</p>`));
    }
    // Vale a pena?
    if (w && courses.length && it.Purpose !== 4) w += ' ' + K.s('worth course need (EducationData.RequiredItems)', `Ele é exigido ${courses.length > 1 ? 'pelos cursos' : 'pelo curso'} ${[...new Set(courses)].join(', ')}, então não venda todos antes de fazê-lo.`, `It is required by ${courses.length > 1 ? 'the courses' : 'the course'} ${[...new Set(courses)].join(', ')}, so do not sell them all before taking it.`);
    if (w) calls.push(c.callout(K.s('label worth it', 'Vale a pena?', 'Is it worth it?'), `<p>${w}</p>`));
    const lead = c.flavor(lang, it) ? '' : leadText(K, it);
    return calls.length ? c.howBlock(lang, lead, calls, isClothes ? 'clothes' : it.ItemSubGroup === 3 ? 'pets' : null) : '';
  }

  // ------------------------------------------------------------------ Bolsa
  function stockBlock(K, it) {
    const c = K.c, lang = K.lang, n = K.n;
    const page = it.m_Name;
    const exchange = c.gameText(lang, 'chamber_bank_stock_exchange');
    const bank = c.place(lang, 'Bank');
    const bankLoc = c.locations.find(l => l.m_Name === 'Bank');
    const shock = (c.RAW['Gameplay.Traits.TraitEffectScripts.MarketShockEachRoundTraitEffect'] || [])[0];
    const chaos = (c.RAW['Gameplay.Modifiers.ModifierData'] || []).find(m => m.m_Name === 'Stock Market Chaos');
    const lead = K.s('where traded (Stock Exchange chamber)', `É uma ação da bolsa de valores (uma parte de uma empresa, cujo preço sobe e desce). Você compra e vende na <em>${exchange}</em>, que fica ${bankLoc ? emLugar(K, bankLoc) : bank}.`, `This is a stock. You buy and sell it on the <em>${exchange}</em>. Where: ${bank}.`);
    const siblings = c.items.filter(i => c.isStock(i) && i !== it).map(i => `${c.itemIcon(i, 22)}${c.link(lang, i, c.title(lang, i))}`).join(', ');
    const brokers = c.events.filter(e => /^Brokers - (Stock Peddlers|Cornered Market|The Earpiece Incident 3)/.test(e.m_Name)).map(e => c.link(lang, e, c.title(lang, e)));
    const kaiju = c.quests.find(q => q.m_Name === 'Chain-Kaiju-Chicken-Stock');
    const price = [`<strong>${K.s('crash label (gevent_economic_crash)', 'Evento Global de crise', 'Crisis Global Event')}:</strong> ${c.gameText(lang, 'gevent_economic_crash_started_body')}`];
    if (chaos && shock) price.push(`<strong>${c.title(lang, chaos)}</strong> ${K.s('chaos modifier gloss', '(modificador de partida, regra opcional):', '(modifier, optional rule):')} ${c.spanLang(lang, c.tx(lang, chaos.FlavorTerm))}. ${K.s('chaos cadence (MarketShockEachRoundTraitEffect)', `A cada ${shock.EveryNRounds} rodadas, por ${shock.Duration} rodadas.`, `Every ${shock.EveryNRounds} rounds, for ${shock.Duration} rounds.`)}`);
    const mult = c.table('CoreData').find(x => x.m_Name === 'Stock Score').ScoringMultiplier;
    const prof = c.STOCK_PROFILES.find(p => p.tier === it.Tier);
    const base = it.BuyValue;
    const swing = Math.round(base * prof.swing / 100);
    const drift = Math.round(base * Math.abs(prof.trend) / 100 * 100) / 100;
    const calls = [
      c.callout(c.ui(lang, 'price'), `<p>${K.s('stock profile (StocksManager.Initialize, ProgressStock, StockBehavior.CreateDefaults)', `O preço muda a cada rodada, com sorteio. O <strong>preço-base</strong> desta ação é ${n(base)}. Perfil: <strong>${prof.name['pt-BR']}</strong>. Numa rodada comum ela anda cerca de ${prof.swing}% para cima ou para baixo, algo como ${n(swing)}. ${prof.trend > 0 ? `Tende a subir um pouco (${c.signedPercent(lang, prof.trend)} por rodada, uns ${n(drift)}).` : prof.trend < 0 ? `Tende a cair um pouco (${c.signedPercent(lang, prof.trend)} por rodada, uns ${n(drift)}).` : 'Não tende nem a subir nem a cair.'} Nunca passa de ${prof.roof} vezes o preço-base (${n(base * prof.roof)}) nem cai abaixo de 20% dele (${n(Math.round(base * 0.2))}).`, `The price changes every round, at random. This stock's <strong>base price</strong> is ${n(base)}. Profile: <strong>${prof.name.en}</strong>. In a normal round it moves about ${prof.swing}% up or down, something like ${n(swing)}. ${prof.trend > 0 ? `It tends to rise a little (${c.signedPercent(lang, prof.trend)} per round, about ${n(drift)}).` : prof.trend < 0 ? `It tends to fall a little (${c.signedPercent(lang, prof.trend)} per round, about ${n(drift)}).` : 'It tends neither up nor down.'} It never goes above ${prof.roof} times the base price (${n(base * prof.roof)}) or below 20% of it (${n(Math.round(base * 0.2))}).`)} <a href="/${c.langDir(lang)}/guides/stocks/">${K.s('link to guide', 'Como a bolsa funciona', 'How the stock market works')}</a></p><ul class="plain">${price.map(p => `<li>${p}</li>`).join('')}</ul>`),
      c.callout(c.ui(lang, 'careful'), `<p>${K.s('no selling on purchase round (StocksManager.StockOnCooldownForPlayer)', 'Você não pode vender uma ação na mesma rodada em que comprou.', 'You cannot sell a stock in the same round you bought it.')}</p>`),
      c.callout(c.ui(lang, 'score'), `<p>${c.gameText(lang, 'score_type_stocks')}: ${K.s('score multiplier (CoreData Stock Score)', `ao vender com lucro, cada ${n(100)} de lucro viram ${n(100 * mult)} pontos.`, `when you sell at a profit, every ${n(100)} of profit becomes ${n(100 * mult)} points.`)}</p>`),
      c.callout(K.s('label worth it', 'Vale a pena?', 'Is it worth it?'), `<p>${K.s('worth stock (profile swing and trend, score multiplier)', `Preço-base ${n(base)}: uma oscilação típica de ${prof.swing}% é ${n(swing)} por ação, e vira ${n(Math.round(swing * mult * 10) / 10)} pontos se for lucro vendido. ${prof.trend > 0 ? `A tendência de alta paga pouco por rodada (${n(drift)}); o ganho de verdade vem de comprar numa queda e vender depois de subir.` : prof.trend < 0 ? 'A tendência é de queda: só serve para quem aposta em comprar muito barato logo depois de uma queda e vender na primeira subida.' : 'Sem tendência: é pura aposta na oscilação, com risco igual para os dois lados.'} Quem tem pouco dinheiro parado pode preferir a conta regular do Banco, que rende juros sem risco.`, `Base price ${n(base)}: a typical ${prof.swing}% swing is ${n(swing)} per share, which becomes ${n(Math.round(swing * mult * 10) / 10)} points if it is profit you sell. ${prof.trend > 0 ? `The upward trend pays little per round (${n(drift)}); the real gain comes from buying on a dip and selling after it rises.` : prof.trend < 0 ? 'The trend is downward: it only suits anyone betting on buying very cheap right after a fall and selling on the first rise.' : 'No trend: it is a pure bet on the swings, with equal risk both ways.'} If you have little idle money, the regular Bank account pays interest with no risk.`)}</p>`),
      c.callout(c.ui(lang, 'cat12'), `<p>${siblings}</p>`),
    ];
    const related = [...brokers, ...(kaiju ? [c.link(lang, kaiju, c.title(lang, kaiju))] : [])];
    if (related.length) calls.push(c.callout(c.ui(lang, 'events'), `<p>${related.join(', ')}</p>`));
    return c.howBlock(lang, lead, calls);
  }

  // Itens com o mesmo nome no jogo ganham um complemento (Mapa do Tesouro, Tralha, Jornal).
  function renomear(lang, rec, t) {
    const c = ctx();
    const n = rec.m_Name;
    let m = /^Treasure Map - (.+)$/.exec(n);
    if (m) {
      const key = { Mart: 'Moo Moo Mart', Vex: 'Vex Corp' }[m[1]] || m[1];
      const loc = c.SCAVENGE_PLACES[key] && c.locations.find(l => c.SCAVENGE_PLACES[key].test(l.m_Name));
      if (loc) return { html: `${t.html} (${c.titleText(lang, loc)})`, lang: t.lang };
    }
    m = /^Scrap (\d)$/.exec(n);
    if (m) return { html: lang === 'pt-BR' ? `Tralha ${m[1]}` : lang === 'en' ? `Scrap ${m[1]}` : `${t.html} ${m[1]}`, lang };
    if (n === 'Quest Item - Spy Newspaper') return { html: lang === 'pt-BR' ? 'Jornal de Espião' : lang === 'en' ? 'Spy Newspaper' : `${t.html} (2)`, lang };
    return null;
  }

  // Ao Natural: "Vale a pena?" calculado com os empregos e o preço da Roupa Básica.
  function worthNaked(lang, it) {
    const c = ctx(), K = kit(lang, it.m_Name);
    const n = K.n;
    const others = c.jobs.filter(j => !c.artistJobs.has(j._id));
    const free = others.filter(j => j.RequiredEquippedItemTier === 0);
    const t1 = others.filter(j => j.RequiredEquippedItemTier === 1);
    const best = list => Math.max(...list.map(j => c.sumAttr(j.Rewards, 'Cash')));
    const basic = c.items.find(i => i.m_Name === 'Tier 1 Clothes');
    const sc = shopCost(K, basic);
    const pt = `Não vale a pena ficar assim: só ${free.length} dos ${others.length} empregos não pedem roupa, e o melhor deles paga ${n(best(free))} por turno de trabalho, contra ${n(best(t1))} dos empregos que pedem a Roupa Básica. A Roupa Básica custa ${sc ? sc.text : '?'} e dura ${basic.Durability} rodadas.`;
    const en = `It is not worth staying like this: only ${free.length} of the ${others.length} jobs ask for no clothes, and the best of them pays ${n(best(free))} per shift, against ${n(best(t1))} for the jobs that ask for Basic Clothes. Basic Clothes cost ${sc ? sc.text : '?'} and last ${basic.Durability} rounds.`;
    return c.callout(K.s('label worth it', 'Vale a pena?', 'Is it worth it?'), `<p>${K.s('worth naked (jobs without clothes vs Tier 1 jobs)', pt, en)}</p>`);
  }

  // ------------------------------------------------------------------ ficha lateral
  function ficha(lang, it) {
    const c = ctx(), K = kit(lang, it.m_Name);
    const list = [];
    const sub = (it.SubTypes || []).includes(110) ? 9 : it.ItemSubGroup;
    if (sub >= 1 && sub <= 13) list.push(c.fact(c.ui(lang, 'category'), c.esc(c.ui(lang, `cat${sub}`))));
    if (c.isStock(it)) list.push(c.fact(c.ui(lang, 'buy'), `<span class="muted">${c.esc(c.ui(lang, 'varies'))}</span>`), c.fact(c.ui(lang, 'sell'), `<span class="muted">${c.esc(c.ui(lang, 'varies'))}</span>`), c.fact(K.s('stock base price label', 'Preço-base', 'Base price'), K.n(it.BuyValue)));
    else {
      const sc = shopCost(K, it);
      const bits = [];
      if (sc && sc.cash) bits.push(`${K.n(sc.cash)}${sc.qty > 1 ? ` <span class="muted">${K.s('pack label', `(lote de ${sc.qty})`, `(pack of ${sc.qty})`)}</span>` : ''}`);
      const free = c.startingGear.has(it._id);
      list.push(c.fact(c.ui(lang, 'buy'), bits.length ? bits.join('') : `<span class="muted">${c.esc(free ? K.s('given at start', 'Já vem com você', 'You start with it') : c.ui(lang, 'notForSale'))}</span>`));
      list.push(c.fact(c.ui(lang, 'sell'), it.SellValue > 0 ? K.n(it.SellValue) : `<span class="muted">${c.esc(c.ui(lang, 'notSellable'))}</span>`));
    }
    if (it.Tier > 0 && !c.isStock(it) && (it.Purpose === 4 || it.ItemSubGroup === 5)) list.push(c.fact(it.Purpose === 4 ? K.s('furniture tier label', 'Nível do móvel', 'Furniture tier') : c.ui(lang, 'tier'), it.Tier));
    if (it.Durability > 0) list.push(c.fact(c.ui(lang, 'durability'), it.Durability));
    if (it.Purpose === 4 && it.ContainerSize > 0) list.push(c.fact(K.s('food capacity label (ui_food_capacity)', 'Refeições que guarda', 'Meals it stores'), it.ContainerSize));
    if (it.ScoreBonus) list.push(c.fact((it.SubTypes || []).includes(110) ? K.s('fish score value label', 'Valor de pontuação', 'Score value') : c.ui(lang, 'score'), c.formatValue(lang, it.ScoreBonus)));
    if (it.Security) list.push(c.fact(c.ui(lang, 'security'), c.formatValue(lang, it.Security)));
    return list;
  }

  // O corpo antigo "Efeitos"/"Vantagens" foi absorvido pelos blocos acima (cada efeito diz quando vale).
  function effectsSection() { return ''; }

  return { explain, ficha, effectsSection, renomear, worthNaked, inlineSources: true, DEAD };
};
