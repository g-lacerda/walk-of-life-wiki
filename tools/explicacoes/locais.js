'use strict';
// Explicações das páginas de locais que não cabem no build-site.js.
// Fonte de cada regra: o id passado a say() e docs/engenharia-reversa.md.

const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A ação de comprar o sapo "Sedento por Poder" reaproveita o título do sapo "Preguiçoso" (action_buy_pet_frog1_title),
// e a lista do Pet Shop mostra o mesmo nome duas vezes. O nome certo está no item que ela entrega.
function titleFix(lang, rec, extraNames, langs) {
  if (rec && rec.m_Name === 'Buy Pet Power Hungry Frog') {
    const names = extraNames['Pet Powerhungry Frog'];
    const i = langs.findIndex(l => l.code === lang);
    if (names && i >= 0) return { html: escape(names[i]), lang };
  }
  return null;
}

module.exports = function (h) {
  const say = (lang, page, id, texts) => h.say(lang, page, id, texts);
  const n = (lang, v) => h.number(lang, v);
  const dir = lang => h.langDir(lang);

  // Os cartazes da Batalha de Kaijus aparecem como duas ações em 15 prédios; viram uma linha com link para o guia.
  const isPoster = a => /^Hang .* Poster$/.test(a.m_Name);
  function posters(lang, list) {
    const found = list.filter(isPoster);
    if (!found.length) return { rest: list, note: '' };
    const g = `<a href="/${dir(lang)}/guides/global-events/">${esc2(lang, 'global-events')}</a>`;
    const note = `<p class="ledger-note">${say(lang, 'locations', 'kaiju posters short (Hang Cluckers Poster, Hang Stock Market Poster, GlobalEventKaijuBattle)', {
      'pt-BR': `Durante a Batalha de Kaijus, dá para pendurar um pôster neste prédio. Veja ${g}.`,
      en: `During the Kaiju Battle, you can hang a poster in this building. See ${g}.`,
    })}</p>`;
    return { rest: list.filter(a => !isPoster(a)), note };
  }
  const esc2 = (lang, slug) => escape(h.guideTitle(lang, slug));

  // De onde vem uma ação condicional. Caminho: ação -> efeito de traço (ChamberActions, naquela sala) -> Trait.Effects -> dono do traço.
  // Donos lidos direto de cada campo (TryUpdatePlayerOwnedItemState só aplica traço de item com Purpose 1, 3, 4 ou 7).
  // Eventos Globais guardam o traço no prefab, que o extrator não lê: campos BigGameActionsTrait, ActionTrackerTrait, DepressionTrait e KaijuBattleTrackerTrait.
  const EVENT_TRAITS = {
    'Global-Event-Big-Game-Cali-Trait': 'big', 'Global-Event-Big-Game-Chai-Trait': 'big', 'Global-Event-Heatwave-Trait': 'heat',
    'Global-Event-Economic-Crash-Trait': 'crash', 'Global-Event-Kaiju-Battle-Trait': 'kaiju',
  };
  const EVENT_NAMES = {
    big: { 'pt-BR': 'Grande Jogo', en: 'Big Game' }, heat: { 'pt-BR': 'Onda de Calor', en: 'Heatwave' },
    crash: { 'pt-BR': 'Colapso Econômico', en: 'Economic Crash' }, kaiju: { 'pt-BR': 'Batalha de Kaijus', en: 'Kaiju Battle' },
  };
  const ORIGIN_ORDER = ['roles', 'quests', 'items', 'jobs', 'courses', 'other', 'unknown'];
  let originIndex = null;
  function buildOriginIndex() {
    const RAW = h.RAW;
    const effects = new Map(), traits = new Map(), owners = new Map();
    const push = (map, key, v) => { if (key) { if (!map.has(key)) map.set(key, []); map.get(key).push(v); } };
    for (const [cls, recs] of Object.entries(RAW)) {
      if (!/TraitEffect/.test(cls)) continue;
      for (const e of recs) for (const x of Array.isArray(e.ChamberActions) ? e.ChamberActions : []) if (x) push(effects, x.id, e);
    }
    const traitList = RAW['Gameplay.Traits.Trait'] || [];
    for (const t of traitList) for (const x of t.Effects || []) if (x) push(traits, x.id, t);
    const entries = r => ((r && r.RewardEntries) || []).filter(e => e.Type === 110);
    const add = (traitId, o) => push(owners, traitId, o);
    for (const it of h.table('ItemData')) if ([1, 3, 4, 7].includes(it.Purpose)) for (const e of entries(it.Rewards)) add(e.Id, { kind: 'items', r: it });
    for (const q of RAW['Gameplay.Quests.Quest'] || []) for (const e of entries(q.QuestStartedRewards)) add(e.Id, { kind: 'quests', r: h.stepChain.get(q._id) || q });
    for (const j of h.jobs) for (const e of entries(j.RewardsWhileJobHeld)) add(e.Id, { kind: 'jobs', r: j });
    for (const c of h.table('EducationData')) for (const e of entries(c.CompletionReward)) add(e.Id, { kind: 'courses', r: c });
    const byRecId = new Map(traitList.map(t => [t._id, t.Id]));
    for (const m of RAW['Gameplay.Modifiers.ModifierData'] || []) for (const x of m.Traits || []) if (x) add(byRecId.get(x.id), { kind: 'other', mod: m });
    for (const m of h.table('MapLayoutData')) for (const x of m.GlobalTraits || []) if (x) add(byRecId.get(x.id), { kind: 'other', map: m });
    for (const t of traitList) if (EVENT_TRAITS[t.m_Name]) add(t.Id, { kind: 'other', event: EVENT_TRAITS[t.m_Name] });
    for (const role of h.roles) {
      const seen = new Set();
      const walk = (v, key) => {
        if (key === 'RemoveTraits' || !v || typeof v !== 'object') return;
        if (Array.isArray(v)) { v.forEach(x => walk(x, key)); return; }
        for (const id of [v.id, v.Id]) if (typeof id === 'string') { const tid = byRecId.get(id) || id; if (!seen.has(tid)) { seen.add(tid); add(tid, { kind: 'roles', r: role }); } }
        for (const k of Object.keys(v)) walk(v[k], k);
      };
      for (const k of Object.keys(role)) if (k !== 'Id' && k !== '_id') walk(role[k], k);
    }
    return { effects, traits, owners };
  }
  function actionOrigin(a, ch) {
    if (!originIndex) originIndex = buildOriginIndex();
    const found = (originIndex.effects.get(a._id) || []).filter(e => !ch || (e.Chambers || []).some(x => x && x.id === ch._id))
      .flatMap(e => originIndex.traits.get(e._id) || []).flatMap(t => originIndex.owners.get(t.Id) || []);
    const kind = ORIGIN_ORDER.find(k => found.some(o => o.kind === k)) || 'unknown';
    return { kind, list: found.filter(o => o.kind === kind) };
  }
  function mergeOrigin(x, y) {
    if (ORIGIN_ORDER.indexOf(y.kind) < ORIGIN_ORDER.indexOf(x.kind)) return y;
    return y.kind === x.kind ? { kind: x.kind, list: [...x.list, ...y.list] } : x;
  }
  function originHtml(lang, origin) {
    if (origin.kind === 'jobs') return jobsOrigin(lang, origin.list.map(o => o.r));
    const seen = new Set();
    const labels = [];
    for (const o of origin.list) {
      let key, html;
      if (o.r) {
        if (!h.hasText(o.r)) continue;
        key = h.titleText(lang, o.r); html = h.link(lang, o.r, h.title(lang, o.r));
      } else if (o.event) {
        key = `e${o.event}`;
        const name = say(lang, 'locations', `origin event name ${o.event} (Global-Event prefab trait fields)`, EVENT_NAMES[o.event]);
        html = say(lang, 'locations', 'origin global event', { 'pt-BR': `Evento Global ${name}`, en: `Global Event ${name}` });
        html = `<a href="/${dir(lang)}/guides/global-events/">${html}</a>`;
      } else if (o.map) {
        key = `m${o.map.m_Name}`;
        html = say(lang, 'locations', 'origin map (MapLayoutData.GlobalTraits)', { 'pt-BR': `partidas no mapa ${escape(o.map.m_Name)}`, en: `games on the ${escape(o.map.m_Name)} map` });
      } else if (o.mod) {
        if (!h.hasText(o.mod)) continue;
        key = `x${o.mod.m_Name}`;
        html = say(lang, 'locations', 'origin modifier (ModifierData.Traits)', { 'pt-BR': `regra opcional de partida ${h.title(lang, o.mod)}`, en: `optional match rule ${h.title(lang, o.mod)}` });
      }
      if (key && !seen.has(key)) { seen.add(key); labels.push(html); }
    }
    const shown = labels.slice(0, 3).join(', ');
    const more = labels.length - 3;
    return more > 0 ? `${shown} ${say(lang, 'locations', 'origin more', { 'pt-BR': `e mais ${n(lang, more)}`, en: `and ${n(lang, more)} more` })}` : shown;
  }
  const unknownOriginNote = lang => say(lang, 'locations', 'origin unknown (no owner found for the trait in extracted data)', {
    'pt-BR': 'Os dados extraídos do jogo não mostram o que libera estas ações. A origem é desconhecida.',
    en: 'The game data does not show what unlocks these actions.',
  });

  // Sorteio de Missões da Vexcorp por mapa. ResourceUtils.FilterWeightedRewardsForCurrentMap tira da lista, antes do sorteio,
  // a Missão com o tema do mapa em ExcludedOnMaps ou fora de AvailableOnMaps (lista vazia vale em todos). QuestComponent.IsAvailableOnMap.
  function vexOdds(lang, action, chevron) {
    const maps = h.table('MapLayoutData');
    const rows = (action.WeightedRewards || []).map(w => {
      const e = ((w.Reward || {}).RewardEntries || []).find(x => x.Type === 70);
      return e ? { w: w.Weight, q: h.byId.get(e.Id) } : null;
    }).filter(x => x && x.q);
    if (!rows.length) return '';
    const onMap = (q, m) => !(q.ExcludedOnMaps || []).includes(m.Theme) && (!(q.AvailableOnMaps || []).length || q.AvailableOnMaps.includes(m.Theme));
    const totals = maps.map(m => rows.filter(r => onMap(r.q, m)).reduce((s, r) => s + r.w, 0));
    const pct = v => `${n(lang, Math.round(v * 1000) / 10)}%`;
    const none = say(lang, 'locations', 'vex odds not on map', { 'pt-BR': 'não sai', en: 'not drawn' });
    const name = q => (h.hasText(q) ? h.link(lang, q, h.title(lang, q)) : escape(q.m_Name));
    const body = rows.slice().sort((x, y) => y.w - x.w).map(r => [name(r.q), ...maps.map((m, i) => (onMap(r.q, m) ? pct(r.w / totals[i]) : none))]);
    const head = say(lang, 'locations', 'vex odds head (WeightedRewards, FilterWeightedRewardsForCurrentMap)', { 'pt-BR': 'Missões que podem sair, com a chance em cada mapa', en: 'Quests that can come up, with the chance on each map' });
    const table = h.simpleTable([h.ui(lang, 'name'), ...maps.map(m => escape(m.m_Name))], body);
    return `<div class="odds"><button class="odds-head" type="button" data-toggle aria-expanded="false">${chevron}${head}</button><div class="collapse"><div class="collapse-clip">${table}</div></div></div>`;
  }

  // Transporte da Vexcorp: custo por quadra = Rewards.Time do item x Percentage do ModifyMovementSpeedAndCostTraitEffect.
  function transportTable(lang) {
    const walk = h.items.find(i => i.m_Name === 'Transport-Walking-Shoes');
    const rows = ['Vex Bus', 'Vexway', 'Vexmobile'].map(name => {
      const it = h.items.find(i => i.m_Name === name);
      if (!it) return null;
      const trait = ((it.Rewards || {}).RewardEntries || []).filter(e => e.Type === 110).map(e => h.byId.get(e.Id)).find(Boolean);
      let pct = 1;
      for (const ref of (trait && trait.Effects) || []) {
        const e = h.deref(ref);
        const c = e && (e.AdditionalMoveCostList || []).find(x => h.deref(x.Attribute) && h.deref(x.Attribute).m_Name === 'Time');
        if (c) pct = c.Percentage;
      }
      const base = -h.sumAttr(it.Rewards, 'Time');
      return { it, base, pct, cost: Math.round(base * pct) };
    }).filter(Boolean);
    return { walk: walk ? -h.sumAttr(walk.Rewards, 'Time') : 20, rows };
  }
  function roomNote(lang, loc, ch) {
    if (ch.m_Name !== 'Vexcorp Transport') return '';
    const { walk, rows } = transportTable(lang);
    if (!rows.length) return '';
    const head = say(lang, 'locations', 'transport note (ItemData.Rewards, ModifyMovementSpeedAndCostTraitEffect)', {
      'pt-BR': `Cada transporte reduz o Tempo que você gasta a cada quadra andada (a pé são ${n(lang, walk)}). O custo do item vezes o fator do transporte dá, aproximadamente, o valor da tabela. A compra vale para o resto da partida: o item não se gasta e não pode ser vendido.`,
      en: `Each ride lowers the Time you spend per block walked (on foot it is ${n(lang, walk)}). The item's cost times the transport's factor gives roughly the value in the table. The purchase lasts the rest of the game: the item does not wear out and cannot be sold.`,
    });
    const table = h.simpleTable(
      [h.ui(lang, 'name'), say(lang, 'locations', 'col block base', { 'pt-BR': 'Custo do item por quadra', en: 'Item cost per block' }), say(lang, 'locations', 'col block factor', { 'pt-BR': 'Fator do transporte', en: 'Transport factor' }), say(lang, 'locations', 'col block final', { 'pt-BR': 'Tempo por quadra', en: 'Time per block' })],
      rows.map(r => [h.link(lang, r.it, h.title(lang, r.it)), n(lang, r.base), `×${n(lang, r.pct)}`, `≈ ${n(lang, r.cost)}`]));
    return `<p class="ledger-note">${head}</p>${table}`;
  }

  // Títulos de cômodo que confundem: a mesma loja com dois nomes, ou a escola com nome de academia de ginástica.
  function roomTitle(lang, loc, ch, plainTitle, forToc) {
    if (ch.m_Name === 'Clothes Counter' && loc.m_Name === 'Chailand-Clothing Store') return say(lang, 'locations', 'room title clothes counter (LocationChamberData Clothes Counter)', { 'pt-BR': 'Roupas à venda', en: 'Clothes for sale' });
    if (ch.m_Name === 'Academy Old 1' && !forToc) return `${plainTitle} <span class="muted">· ${say(lang, 'locations', 'room hint school (LocationChamberData Academy Old 1)', { 'pt-BR': 'a escola, não a academia de ginástica', en: 'the school, not the gym' })}</span>`;
    return plainTitle;
  }

  // Locais com o mesmo nome em mapas diferentes: o cartão do índice diz qual mapa.
  const sameName = new Map();
  function mapsOf(lang, loc) {
    const names = h.table('MapLayoutData').filter(m => h.mapHas(m, loc)).map(m => m.m_Name);
    return names.length ? names : [h.mapOf(loc) || ''].filter(Boolean);
  }
  function dupCount(lang, loc) {
    const key = `${lang}|${h.titleText(lang, loc)}`;
    if (!sameName.has(key)) sameName.set(key, h.locations.filter(l => h.titleText(lang, l) === h.titleText(lang, loc)).length);
    return sameName.get(key);
  }
  function indexNote(lang, loc, flavor) {
    if (dupCount(lang, loc) < 2) return flavor;
    const maps = mapsOf(lang, loc);
    return maps.length ? `<span class="muted">${maps.map(escape).join(', ')}</span>${flavor ? ` · ${flavor}` : ''}` : flavor;
  }
  // Busca: dois resultados com o mesmo nome ganham o mapa (local) ou o local (emprego).
  function searchLabel(lang, rec, section) {
    if (section === 'locations' && dupCount(lang, rec) > 1) {
      const maps = mapsOf(lang, rec);
      return maps.length ? ` (${maps.join(', ')})` : '';
    }
    if (section === 'jobs') {
      const key = `job|${lang}|${h.titleText(lang, rec)}`;
      if (!sameName.has(key)) sameName.set(key, h.jobs.filter(j => h.titleText(lang, j) === h.titleText(lang, rec)).length);
      if (sameName.get(key) > 1) { const loc = h.deref(rec.Location); return loc && h.hasText(loc) ? ` (${h.titleText(lang, loc)})` : ''; }
    }
    return '';
  }

  // Moradias: as seis têm as mesmas ações de casa. O que as separa é a tabela de moradias.
  function homeNote(lang, loc) {
    const start = h.table('MapLayoutData').map(m => h.deref(m.StartingHome)).find(Boolean);
    return h.callout(say(lang, 'locations', 'label homes alike', { 'pt-BR': 'Moradias parecidas', en: 'Similar homes' }),
      `<p>${say(lang, 'locations', 'homes alike (LocationData.Chambers, HomeData, MapLayoutData.StartingHome)', {
        'pt-BR': `Todas as moradias oferecem as mesmas ações de casa (descansar, dormir, pets), então as páginas se parecem. O que muda de uma para outra está na tabela de moradias: aluguel, valor para se mudar, nível de móveis que cabe e segurança. ${start ? `Você começa a partida no ${h.titleText(lang, start)}.` : ''}`,
        en: `Every home offers the same home actions (rest, sleep, pets), so the pages look alike. What changes between them is in the homes table: rent, cost to move, the furniture tier that fits and security. ${start ? `You start the game in the ${h.titleText(lang, start)}.` : ''}`,
      })}</p>`);
  }

  // Ação liberada por cargo: o traço vale para todos os empregos do mesmo local (JobHandler.ProcessRewardsWhileJobHeld).
  function jobsOrigin(lang, jobs) {
    const places = [...new Map(jobs.map(j => h.deref(j.Location)).filter(p => p && h.hasText(p)).map(p => [p._id, p])).values()];
    const where = h.placesOf(lang, places);
    return say(lang, 'locations', 'jobs origin (JobHandler.ProcessRewardsWhileJobHeld)', { 'pt-BR': `qualquer emprego de ${where}`, en: `any ${String(where).replace(/(^|>)The /, '$1')} job` });
  }


  // "Vale a pena?" dos locais: o que decide a partida são os pontos. Dinheiro sozinho não vale pontos (guia Pontuação e vitória).
  const P = (id, pt, en) => say(lang0, 'locations', id, { 'pt-BR': pt, en });
  let lang0 = 'pt-BR';
  const guideLink = (lang, slug) => '<a href="/' + dir(lang) + '/guides/' + slug + '/">' + escape(h.guideTitle(lang, slug)) + '</a>';

  // Moradias: pontos por aluguel pago em relação ao aluguel (HomeData.RentScore, HomeData.Rent, MaxFurnitureTier)
  function homeWorth(lang, loc) {
    lang0 = lang;
    const homes = (loc.Homes || []).map(h.deref).filter(x => x && x.Rent > 0 && x.RentScore > 0);
    if (!homes.length) return '';
    const lines = homes.map(x => {
      const ratio = Math.round(x.RentScore / x.Rent * 100) / 100;
      return P('home worth line (HomeData.RentScore, HomeData.Rent) ' + x.m_Name,
        '<strong>' + h.title(lang, x) + ':</strong> cada aluguel pago em dia rende ' + n(lang, x.RentScore) + ' pontos (' + n(lang, ratio) + ' ponto por Dinheiro de aluguel de ' + n(lang, x.Rent) + ') e a casa aceita móveis até o nível ' + n(lang, x.MaxFurnitureTier) + '.',
        '<strong>' + h.title(lang, x) + ':</strong> every rent paid on time gives ' + n(lang, x.RentScore) + ' points (' + n(lang, ratio) + ' point per Cash of the ' + n(lang, x.Rent) + ' rent) and the home takes furniture up to tier ' + n(lang, x.MaxFurnitureTier) + '.');
    });
    const tail = P('home worth tail (guides/scoring, guides/debt)',
      'O aluguel vence a cada 4 rodadas e pagar em dia é o que dá os pontos; Dinheiro sozinho não vale nada na contagem. Atrasar só custa: ' + guideLink(lang, 'debt') + '.',
      'Rent comes due every 4 rounds and paying on time is what gives the points; Cash by itself counts for nothing. Paying late only costs you: ' + guideLink(lang, 'debt') + '.');
    return lines.map(l => '<p>' + l + '</p>').join('') + '<p>' + tail + '</p>';
  }

  // Resort de Esqui: o que rende Prestígio por Tempo e por Dinheiro (ChamberActionData.Rewards, Prestige)
  function prestigeWorth(lang, acts) {
    lang0 = lang;
    const list = acts.map(a => ({ a, gain: h.sumAttr(a.Rewards, 'Prestige'), time: -Math.min(0, h.sumAttr(a.Rewards, 'Time')), cash: -Math.min(0, h.sumAttr(a.Rewards, 'Cash')) })).filter(x => x.gain > 0 && x.time > 0);
    if (list.length < 2) return '';
    const byTime = list.slice().sort((x, y) => y.gain / y.time - x.gain / x.time)[0];
    const free = list.filter(x => !x.cash).sort((x, y) => y.gain / y.time - x.gain / x.time)[0];
    const show = x => h.title(lang, x.a) + ' (+' + n(lang, x.gain) + ' por ' + n(lang, x.time) + ' de Tempo' + (x.cash ? ' e ' + n(lang, x.cash) + ' de Dinheiro' : '') + ')';
    const showEn = x => h.title(lang, x.a) + ' (+' + n(lang, x.gain) + ' for ' + n(lang, x.time) + ' Time' + (x.cash ? ' and ' + n(lang, x.cash) + ' Cash' : '') + ')';
    const best = P('prestige worth (ChamberActionData.Rewards, PrestigeRankScoring)',
      '<strong>Prestígio, que vira pontos:</strong> só os três primeiros do ranking pontuam (400, 250 e 150). O que rende mais Prestígio por Tempo é ' + show(byTime) + (free && free !== byTime ? '; sem gastar Dinheiro, o melhor é ' + show(free) : '') + '. Algumas ações só liberam com um mínimo de Prestígio (veja ' + guideLink(lang, 'scoring') + ').',
      '<strong>Prestige, which turns into points:</strong> only the top three in the ranking score (400, 250 and 150). The most Prestige per Time comes from ' + showEn(byTime) + (free && free !== byTime ? '; without spending Cash, the best is ' + showEn(free) : '') + '. Some actions only unlock past a minimum Prestige (see ' + guideLink(lang, 'scoring') + ').');
    return '<p>' + best + '</p>';
  }

  // Faculdade: pontos por 100 de Tempo dos cursos regulares, contra Missão mediana e subir de nível trabalhando
  function coursesWorth(lang) {
    lang0 = lang;
    const inDept = new Set(h.table('EducationDepartmentData').flatMap(x => (x.Courses || []).map(r => r.id)));
    const score = c => (c.CompletionReward.RewardEntries.find(x => x.Type === 95) || {}).Value || 0;
    const regular = h.table('EducationData').filter(c => h.hasText(c) && inDept.has(c._id) && c.StudyThreshold > 0 && /^Degree/.test(c.m_Name) && score(c) > 0);
    if (!regular.length) return '';
    const rate = c => score(c) / (-h.sumAttr(c.EnrollmentCost, 'Time') + c.StudyThreshold * -h.sumAttr(c.StudyCost, 'Time')) * 100;
    const rates = regular.map(rate).filter(Number.isFinite);
    const cash = regular.map(c => -h.sumAttr(c.EnrollmentCost, 'Cash'));
    const r1 = v => n(lang, Math.round(v * 10) / 10);
    return '<p>' + P('courses worth (EducationData.CompletionReward, EnrollmentCost, StudyCost, StudyThreshold)',
      '<strong>Pontos:</strong> os ' + regular.length + ' cursos regulares rendem de ' + r1(Math.min(...rates)) + ' a ' + r1(Math.max(...rates)) + ' pontos a cada 100 de Tempo (contando a matrícula e todos os estudos), contra ' + n(lang, h.missionRate()) + ' de uma Missão mediana e cerca de ' + n(lang, h.workPoints()) + ' de subir de nível trabalhando. A matrícula custa de ' + n(lang, Math.min(...cash)) + ' a ' + n(lang, Math.max(...cash)) + ' de Dinheiro e cada estudo gasta Felicidade. Cada curso também dá 1 nível de Ensino básico, que os empregos melhores exigem: ' + guideLink(lang, 'education') + '.',
      '<strong>Points:</strong> the ' + regular.length + ' regular courses give ' + r1(Math.min(...rates)) + ' to ' + r1(Math.max(...rates)) + ' points per 100 Time (counting enrollment and every study), against ' + n(lang, h.missionRate()) + ' for a median Quest and about ' + n(lang, h.workPoints()) + ' from leveling up at work. Enrollment costs ' + n(lang, Math.min(...cash)) + ' to ' + n(lang, Math.max(...cash)) + ' Cash and every study costs Happiness. Each course also gives 1 Basic Education level, which the better jobs ask for: ' + guideLink(lang, 'education') + '.') + '</p>';
  }

  // Comida: comer uma vez por rodada evita a punição da Fome (PlayerState.StartTurnForPlayer)
  function foodWorth(lang, acts) {
    lang0 = lang;
    const list = acts.map(a => ({ a, time: -Math.min(0, h.sumAttr(a.Rewards, 'Time')), cash: -Math.min(0, h.sumAttr(a.Rewards, 'Cash')), food: h.sumAttr(a.Rewards, 'Fullness') })).filter(x => x.food > 0);
    if (!list.length) return '';
    const cheap = list.slice().sort((x, y) => x.time - y.time || x.cash - y.cash)[0];
    return '<p>' + P('food worth (HasEatenInTurn, Fullness)',
      '<strong>Comida:</strong> comer uma vez por rodada evita a punição da Fome (veja ' + guideLink(lang, 'hunger') + '). A refeição mais barata em Tempo aqui é ' + h.title(lang, cheap.a) + ' (' + n(lang, cheap.time) + ' de Tempo' + (cheap.cash ? ' e ' + n(lang, cheap.cash) + ' de Dinheiro' : '') + ').',
      '<strong>Food:</strong> eating once per round avoids the Hunger penalty (see ' + guideLink(lang, 'hunger') + '). The cheapest meal in Time here is ' + h.title(lang, cheap.a) + ' (' + n(lang, cheap.time) + ' Time' + (cheap.cash ? ' and ' + n(lang, cheap.cash) + ' Cash' : '') + ').') + '</p>';
  }

  // Ações de uma sala que entregam um item (Type 50), com o custo de loja.
  function shopRows(loc, room) {
    const ch = (loc.Chambers || []).map(h.deref).find(c => c && c.m_Name === room);
    if (!ch) return [];
    return (ch.Actions || []).map(h.deref).filter(Boolean).map(a => {
      const e = ((a.Rewards || {}).RewardEntries || []).find(x => x.Type === 50);
      const it = e && h.byId.get(e.Id);
      return it ? { a, it, cash: -Math.min(0, h.sumAttr(a.Rewards, 'Cash')), time: -Math.min(0, h.sumAttr(a.Rewards, 'Time')) } : null;
    }).filter(Boolean);
  }
  const nameList = (lang, list) => list.slice(0, 3).map(x => h.link(lang, x.it, h.title(lang, x.it))).join(', ');

  // Móveis e eletrodomésticos: ItemData.ScoreBonus conta na contagem final para móvel colocado (ScoreHandler.GetFurnitureScore).
  function furnitureWorth(lang, loc) {
    lang0 = lang;
    const list = [...shopRows(loc, 'Furniture Counter 1'), ...shopRows(loc, 'Appliances Counter')].filter(x => x.it.Purpose === 4 && x.it.ScoreBonus > 0 && x.cash > 0);
    if (!list.length) return '';
    const ratio = x => x.it.ScoreBonus / x.cash;
    const bestR = Math.max(...list.map(ratio)), top = Math.max(...list.map(x => x.it.ScoreBonus));
    const eff = list.filter(x => ratio(x) === bestR), big = list.filter(x => x.it.ScoreBonus === top);
    const bigCash = Math.min(...big.map(x => x.cash));
    return '<p>' + P('furniture worth (ItemData.ScoreBonus, ScoreHandler.GetFurnitureScore, HomeData.MaxFurnitureTier)',
      '<strong>Pontos:</strong> cada móvel colocado em casa quando a partida acaba soma os pontos dele. Por Dinheiro, os que mais rendem são ' + nameList(lang, eff) + ' (' + n(lang, eff[0].it.ScoreBonus) + ' pontos por ' + n(lang, eff[0].cash) + ' de Dinheiro). No total, o máximo aqui é ' + n(lang, top) + ' pontos, com ' + nameList(lang, big) + ' (' + n(lang, bigCash) + ' de Dinheiro). Cada compra gasta ' + n(lang, list[0].time) + ' de Tempo, e cada moradia só aceita móveis até certo nível: ' + guideLink(lang, 'housing') + '.',
      '<strong>Points:</strong> every piece of furniture placed at home when the game ends adds its points. Per Cash, the best are ' + nameList(lang, eff) + ' (' + n(lang, eff[0].it.ScoreBonus) + ' points for ' + n(lang, eff[0].cash) + ' Cash). In total, the most here is ' + n(lang, top) + ' points, with ' + nameList(lang, big) + ' (' + n(lang, bigCash) + ' Cash). Each purchase costs ' + n(lang, list[0].time) + ' Time, and each home only takes furniture up to a certain tier: ' + guideLink(lang, 'housing') + '.') + '</p>';
  }

  // Roupas: não pontuam; ItemData.Durability conta rodadas (HandleEquipmentDurability) e o nível exigido vem de JobHandler.CanApplyForJob.
  function clothesWorth(lang, loc) {
    lang0 = lang;
    const list = shopRows(loc, 'Clothes Counter').filter(x => x.it.Durability > 0 && x.cash > 0);
    if (!list.length) return '';
    const line = list.map(x => h.link(lang, x.it, h.title(lang, x.it)) + ': ' + n(lang, x.cash) + ' / ' + n(lang, x.it.Durability) + ' = ' + n(lang, Math.round(x.cash / x.it.Durability * 10) / 10)).join('; ');
    return '<p>' + P('clothes worth (ItemData.Durability, JobHandler.CanApplyForJob, ExperiencePointData.Score)',
      '<strong>Roupas:</strong> não dão pontos. Elas servem para poder trabalhar: cada emprego pede roupa de um nível ou maior, e subir de nível de EXP trabalhando rende cerca de ' + n(lang, h.workPoints()) + ' pontos a cada 100 de Tempo.',
      '<strong>Points:</strong> clothes give no points. They let you work: each job asks for clothes of a given tier or higher, and leveling up Work XP gives about ' + n(lang, h.workPoints()) + ' points per 100 Time.') + '</p><p>' + P('clothes cost per round (ChamberActionData.Rewards, ItemData.Durability)',
      '<strong>Custo por rodada</strong> (preço dividido pelas rodadas que dura): ' + line + '. ' + guideLink(lang, 'clothes') + '.',
      '<strong>Cost per round</strong> (price divided by the rounds it lasts): ' + line + '. ' + guideLink(lang, 'clothes') + '.') + '</p>';
  }

  // Pets: ScoreHandler.CreatePlayerScoreInfo, rodadas x 5, 30 ou 45 conforme o humor.
  function petsWorth(lang, loc) {
    lang0 = lang;
    const list = shopRows(loc, 'Pet Store').filter(x => x.it.Purpose === 7);
    if (!list.length) return '';
    const cash = Math.min(...list.map(x => x.cash)), time = Math.min(...list.map(x => x.time));
    return '<p>' + P('pets worth (ScoreHandler.CreatePlayerScoreInfo, PetHandler.MaxPets)',
      '<strong>Pontos com pet:</strong> no fim da partida, o pet vale o número de rodadas da partida vezes 5 (negligenciado), 30 (contente) ou 45 (mimado), então vale mais em partidas longas e bem cuidado. Comprar custa ' + n(lang, cash) + ' de Dinheiro e ' + n(lang, time) + ' de Tempo, e você só pode ter 1: ' + guideLink(lang, 'pets') + '.',
      '<strong>Points:</strong> at the end of the game, the pet is worth the number of rounds in the game times 5 (neglected), 30 (content) or 45 (pampered), so it is worth more in long games and well cared for. Buying costs ' + n(lang, cash) + ' Cash and ' + n(lang, time) + ' Time, and you can only have 1: ' + guideLink(lang, 'pets') + '.') + '</p>';
  }

  // Banco: CoreData Stock Score e PlayerState.CheckForVaultInterest (juros = RoundToInt(depósito x taxa), fim do turno).
  function bankWorth(lang) {
    lang0 = lang;
    const mult = h.table('CoreData').find(c => c.m_Name === 'Stock Score').ScoringMultiplier;
    const vault = h.table('VaultData').find(v => v.m_Name === 'Regular Bank Vault');
    const rate = Math.round(vault.InterestRate * 100);
    return '<p>' + P('bank worth points (HandleInsideChamberState, CoreData Stock Score)',
      '<strong>Pontos:</strong> na Bolsa, cada ' + n(lang, 100) + ' de lucro numa venda viram ' + n(lang, 100 * mult) + ' pontos. O cofre não dá pontos: ' + guideLink(lang, 'stocks') + '.',
      '<strong>Points:</strong> at the Stock Exchange, every ' + n(lang, 100) + ' of profit on a sale becomes ' + n(lang, 100 * mult) + ' points. The vault gives no points: ' + guideLink(lang, 'stocks') + '.') + '</p><p>' + P('bank worth vault (CheckForVaultInterest, VaultData.InterestRate)',
      '<strong>Cofre:</strong> rende ' + n(lang, rate) + '% do que está guardado no fim de cada turno seu, então ' + n(lang, 1000) + ' guardados dão ' + n(lang, 1000 * rate / 100) + ' por turno. Dinheiro sozinho não conta na pontuação: o cofre vale pelo que esse Dinheiro vai pagar depois.',
      '<strong>Vault:</strong> pays ' + n(lang, rate) + '% of what is stored at the end of each of your turns, so ' + n(lang, 1000) + ' stored gives ' + n(lang, 1000 * rate / 100) + ' per turn. Cash alone does not count for points: the vault is worth what that Cash pays for later.') + '</p>';
  }

  // Loteria: NetworkedLottery.OnRoundStarted (LotteryData.WinChance, MinPrize, MaxPrize), bilhetes usados no sorteio (SendLottoInfo_RPC).
  function groceryWorth(lang, loc) {
    lang0 = lang;
    const ticket = shopRows(loc, 'Grocery Store Store').find(x => x.it.m_Name === 'Lottery Ticket');
    const lot = h.table('LotteryData')[0];
    if (!ticket || !lot) return '';
    const mid = (lot.MinPrize + lot.MaxPrize) / 2;
    const back = Math.round(lot.WinChance * mid);
    const pole = shopRows(loc, 'Grocery Store Store').find(x => x.it.m_Name === 'Fishing Pole');
    return '<p>' + P('grocery worth points (Fishing Pole, ScoreHandler.GetFishingScore)',
      '<strong>Pontos:</strong> os produtos à venda aqui não dão pontos na hora. A ' + (pole ? h.link(lang, pole.it, h.title(lang, pole.it)) : '') + ' libera a pesca, e cada espécie pescada soma pontos na contagem final (' + guideLink(lang, 'scoring') + ').',
      '<strong>Points:</strong> the goods sold here give no points right away. The ' + (pole ? h.link(lang, pole.it, h.title(lang, pole.it)) : '') + ' unlocks fishing, and each species caught adds points in the final count (' + guideLink(lang, 'scoring') + ').') + '</p><p>' + P('grocery worth lottery (LotteryData, NetworkedLottery.OnRoundStarted)',
      '<strong>Loteria:</strong> o bilhete custa ' + n(lang, ticket.cash) + ' de Dinheiro e ' + n(lang, ticket.time) + ' de Tempo, tem ' + n(lang, Math.round(lot.WinChance * 100)) + '% de chance num prêmio de ' + n(lang, lot.MinPrize) + ' a ' + n(lang, lot.MaxPrize) + ' e é usado no sorteio. Em média, devolve cerca de ' + n(lang, back) + ', menos do que custa; se houver mais premiados na rodada, o prêmio é dividido.',
      '<strong>Lottery:</strong> the ticket costs ' + n(lang, ticket.cash) + ' Cash and ' + n(lang, ticket.time) + ' Time, has a ' + n(lang, Math.round(lot.WinChance * 100)) + '% chance at a prize of ' + n(lang, lot.MinPrize) + ' to ' + n(lang, lot.MaxPrize) + ' and is used up in the draw. On average it returns about ' + n(lang, back) + ', less than it costs; if there are more winners that round, the prize is split.') + '</p>';
  }

  // Casa de Penhores: GetPawnRewardsForItem, SetDataForBuyingPawnedItems; móveis especiais pelos mesmos critérios de itens.js.
  function pawnWorth(lang) {
    lang0 = lang;
    const specials = h.items.filter(i => i.Purpose === 4 && [300, 310, 320].includes(i.FurnitureSlot) && !(i.SubTypes || []).includes(120) && i.BuyValue > 0 && i.ScoreBonus > 0);
    if (!specials.length) return '';
    const best = specials.slice().sort((a, b) => b.ScoreBonus / b.BuyValue - a.ScoreBonus / a.BuyValue)[0];
    return '<p>' + P('pawn worth (ItemData.ScoreBonus, BuyValue, ScoreHandler.GetFurnitureScore, UpdatePlayerPawnStore)',
      '<strong>Pontos:</strong> penhorar não dá pontos, e móvel vendido deixa de contar na pontuação final. A prateleira de compra sorteia móveis especiais: entre todos eles, o que mais rende por Dinheiro é ' + h.link(lang, best, h.title(lang, best)) + ' (' + n(lang, best.ScoreBonus) + ' pontos por ' + n(lang, best.BuyValue) + '), quando aparece. Veja ' + guideLink(lang, 'pawn-shop') + '.',
      '<strong>Points:</strong> pawning gives no points, and furniture you sell stops counting in the final score. The buy shelf draws special furniture: among all of them, the best per Cash is ' + h.link(lang, best, h.title(lang, best)) + ' (' + n(lang, best.ScoreBonus) + ' points for ' + n(lang, best.BuyValue) + '), when it shows up. See ' + guideLink(lang, 'pawn-shop') + '.') + '</p>';
  }

  // Agência: JobHandler.CanApplyForJob (candidatura sem Tempo), ExperiencePointData.Score, mediana de JobData.Rewards.
  function townHallWorth(lang) {
    lang0 = lang;
    return '<p>' + P('town hall worth (JobHandler.CanApplyForJob, ExperiencePointData.Score, JobData.Rewards)',
      '<strong>Pontos:</strong> candidatar-se não dá pontos, mas também não gasta Tempo. O que pontua é trabalhar depois: subir de nível de EXP rende cerca de ' + n(lang, h.workPoints()) + ' pontos a cada 100 de Tempo, e o emprego mediano paga ' + n(lang, h.jobRate()) + ' de Dinheiro pelos mesmos 100. Uma Missão mediana rende ' + n(lang, h.missionRate()) + ' pontos a cada 100 de Tempo.',
      '<strong>Points:</strong> applying gives no points, but costs no Time either. What scores is working afterwards: leveling up Work XP gives about ' + n(lang, h.workPoints()) + ' points per 100 Time, and the median job pays ' + n(lang, h.jobRate()) + ' Cash for the same 100. A median Quest gives ' + n(lang, h.missionRate()) + ' points per 100 Time.') + '</p>';
  }

  // Vexcorp: custo do sorteio em ChamberActionData.Rewards; transporte em transportTable.
  function vexWorth(lang, loc) {
    lang0 = lang;
    const lobby = (loc.Chambers || []).map(h.deref).find(c => c && c.m_Name === 'Vexcorp Lobby');
    const draw = lobby && (lobby.Actions || []).map(h.deref).find(a => a && /Get Easy Vexcorp Quest/.test(a.m_Name));
    let html = draw ? '<p>' + P('vex worth quests (Get * Vexcorp Quest.Rewards, median of quests)',
      '<strong>Pontos:</strong> o sorteio de Missões custa ' + n(lang, -h.sumAttr(draw.Rewards, 'Time')) + ' de Tempo e entrega uma Missão, que é o que pontua: a Missão mediana rende ' + n(lang, h.missionRate()) + ' pontos a cada 100 de Tempo, contra cerca de ' + n(lang, h.workPoints()) + ' de subir de nível trabalhando.',
      '<strong>Points:</strong> the Quest draw costs ' + n(lang, -h.sumAttr(draw.Rewards, 'Time')) + ' Time and gives you a Quest, which is what scores: the median Quest gives ' + n(lang, h.missionRate()) + ' points per 100 Time, against about ' + n(lang, h.workPoints()) + ' from leveling up at work.') + '</p>' : '';
    const { walk, rows } = transportTable(lang);
    const shop = shopRows(loc, 'Vexcorp Transport');
    const parts = rows.map(r => {
      const buy = shop.find(s => s.it === r.it);
      const saved = walk - r.cost;
      if (!buy || saved <= 0) return '';
      return h.link(lang, r.it, h.title(lang, r.it)) + ' (' + n(lang, buy.cash) + ' de Dinheiro): ' + n(lang, Math.ceil(buy.time / saved));
    }).filter(Boolean);
    if (parts.length) html += '<p>' + P('vex worth transport (ItemData.Rewards, ModifyMovementSpeedAndCostTraitEffect, Buy * Rewards)',
      '<strong>Transporte:</strong> não dá pontos, só poupa Tempo a cada quadra (a tabela abaixo mostra quanto). Quadras andadas, em média, até recuperar o Tempo da compra: ' + parts.join('; ') + '.',
      '<strong>Transport:</strong> gives no points, it only saves Time on each block (the table below shows how much). Blocks walked to win back the Time of the purchase: ' + parts.join('; ') + '.') + '</p>';
    return html;
  }

  // Metrô: MapLayoutData.SlotPortalingCost (AuthActionHandlerForPlayerState.TryGetNextPortalConnection) e preços em ChamberActionData.
  function metroWorth(lang) {
    lang0 = lang;
    const map = h.table('MapLayoutData').find(m => m.SlotPortalingCost && (m.SlotPortalingCost.RewardEntries || []).length);
    if (!map) return '';
    const ride = -h.sumAttr(map.SlotPortalingCost, 'Time');
    const acts = h.table('ChamberActionData');
    const offer = name => {
      const a = acts.find(x => x.m_Name === name);
      if (!a) return null;
      const q = h.sumAttr(a.Rewards, 'Ticket Currency'), time = -h.sumAttr(a.Rewards, 'Time'), cash = -h.sumAttr(a.Rewards, 'Cash');
      return { a, q, time, cash, perTime: time / q, perCash: cash / q };
    };
    const single = offer('Metro Ticket'), mundo = offer('Mundo Metro Pass');
    const walk = h.items.find(i => i.m_Name === 'Transport-Walking-Shoes');
    if (!single || !mundo || !walk) return '';
    const walkTime = -h.sumAttr(walk.Rewards, 'Time');
    const fmt = v => n(lang, Math.round(v * 10) / 10);
    return '<p>' + P('metro worth (MapLayoutData.SlotPortalingCost, Metro Ticket, Mundo Metro Pass, Transport-Walking-Shoes)',
      '<strong>Pontos:</strong> o metrô não dá pontos, só pode poupar Tempo. Uma viagem gasta ' + n(lang, ride) + ' de Tempo e 1 bilhete. Somando a compra do bilhete, com ' + h.title(lang, single.a) + ' a viagem sai por ' + fmt(ride + single.perTime) + ' de Tempo e ' + fmt(single.perCash) + ' de Dinheiro; com ' + h.title(lang, mundo.a) + ', por ' + fmt(ride + mundo.perTime) + ' de Tempo e ' + fmt(mundo.perCash) + ' de Dinheiro. A pé, cada quadra custa ' + n(lang, walkTime) + ' de Tempo: compare com as quadras do seu caminho.',
      '<strong>Points:</strong> the metro gives no points, it can only save Time. A ride costs ' + n(lang, ride) + ' Time and 1 ticket. Counting the ticket purchase, ' + h.title(lang, single.a) + ' brings a ride to ' + fmt(ride + single.perTime) + ' Time and ' + fmt(single.perCash) + ' Cash; ' + h.title(lang, mundo.a) + ', to ' + fmt(ride + mundo.perTime) + ' Time and ' + fmt(mundo.perCash) + ' Cash. On foot, each block costs ' + n(lang, walkTime) + ' Time: compare with the blocks on your route.') + '</p>';
  }

  // Fliperama: ScoreHandler.CreatePlayerScoreInfo (15 x rodadas por recorde), ArcadeGameSystem.OnActionPerformed (GamerSkillScore 25).
  function arcadeWorth(lang, loc) {
    lang0 = lang;
    const ch = (loc.Chambers || []).map(h.deref).find(c => c && c.m_Name === 'Arcade Counter');
    const games = ch ? (ch.Actions || []).map(h.deref).filter(a => a && a.Purpose === 24) : [];
    if (!games.length) return '';
    const g = games[0];
    const vals = (g.WeightedRewards || []).flatMap(w => ((w.Reward || {}).RewardEntries || []).filter(e => e.Type === 95).map(e => e.Value));
    const tok = shopRows(loc, 'Arcade Counter').find(x => x.it.m_Name === 'Arcade Token');
    if (!vals.length || !tok) return '';
    return '<p>' + P('arcade worth (ScoreHandler.CreatePlayerScoreInfo, ArcadeManager.GetAllTopScoresByChamberActions, ArcadeGameSystem GamerSkillScore)',
      '<strong>Pontos:</strong> o Fliperama tem ' + n(lang, games.length) + ' máquinas, e quem termina a partida com o recorde de uma delas leva 15 pontos vezes o número de rodadas, por máquina. Cada jogo gasta ' + n(lang, -h.sumAttr(g.Rewards, 'Time')) + ' de Tempo e 1 ' + h.link(lang, tok.it, h.title(lang, tok.it)) + ' (' + n(lang, tok.cash) + ' de Dinheiro e ' + n(lang, tok.time) + ' de Tempo). A pontuação do jogo sorteia de ' + n(lang, Math.min(...vals)) + ' a ' + n(lang, Math.max(...vals)) + ' e soma 25 por ponto de habilidade; jogar e treinar dão 1 de habilidade cada.',
      '<strong>Points:</strong> the Arcade has ' + n(lang, games.length) + ' machines, and whoever ends the game holding one record takes 15 points times the number of rounds, per machine. Each game costs ' + n(lang, -h.sumAttr(g.Rewards, 'Time')) + ' Time and 1 ' + h.link(lang, tok.it, h.title(lang, tok.it)) + ' (' + n(lang, tok.cash) + ' Cash and ' + n(lang, tok.time) + ' Time). The game score is drawn from ' + n(lang, Math.min(...vals)) + ' to ' + n(lang, Math.max(...vals)) + ' and adds 25 per skill point; playing and practicing each give 1 skill.') + '</p>';
  }

  // Vem antes de tudo no "Vale a pena?": os pontos decidem a partida.
  function worthPoints(lang, loc) {
    const name = loc.m_Name;
    if (/Home/.test(name)) return '';
    let html = '';
    if (/Resort/.test(name)) html += prestigeWorth(lang, h.freeActions(loc));
    if (name === 'Academy') html += coursesWorth(lang);
    if (/^Bank/.test(name)) html += bankWorth(lang);
    if (/Grocery/.test(name)) html += groceryWorth(lang, loc);
    if (/Pawn/.test(name)) html += pawnWorth(lang);
    if (/Town Hall/.test(name)) html += townHallWorth(lang);
    if (/Vex Corp/.test(name)) html += vexWorth(lang, loc);
    if (/Metro/.test(name)) html += metroWorth(lang);
    if (/Arcade/.test(name)) html += arcadeWorth(lang, loc);
    html += furnitureWorth(lang, loc) + petsWorth(lang, loc) + clothesWorth(lang, loc);
    return html;
  }

  function worthExtra(lang, loc) {
    if (/Home/.test(loc.m_Name)) return homeWorth(lang, loc);
    return foodWorth(lang, h.freeActions(loc));
  }

  return { posters, roomNote, roomTitle, indexNote, searchLabel, homeNote, jobsOrigin, worthExtra, worthPoints, actionOrigin, mergeOrigin, originHtml, unknownOriginNote, vexOdds };
};
module.exports.titleFix = titleFix;
