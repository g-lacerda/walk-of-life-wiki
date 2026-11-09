'use strict';
// Missões: custo real, sorteio da Vexcorp, mapas e detalhes dos objetivos. Fontes registradas em docs/engenharia-reversa.md.
const { comPreposicao } = require('./lugares');

module.exports = function (h) {
  const { say, deref, byId, table, sumAttr, addAttrs, number } = h;
  const pt = lang => lang === 'pt-BR';
  const joinE = (lang, list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} ${pt(lang) ? 'e' : 'and'} ${list[list.length - 1]}` : list[0] || '');
  const objectivesOf = q => h.stepsOf(q).flatMap(s => Object.values(s.references || {}));
  const entries = r => (r || {}).RewardEntries || [];
  const costOf = a => ({ time: -Math.min(0, sumAttr(a.Rewards, 'Time')), cash: -Math.min(0, sumAttr(a.Rewards, 'Cash')) });
  // Só salas fixas (LocationData.Chambers -> Actions). actionHome também traz o que móvel, traço ou evento acrescentam.
  let fixedRooms = null;
  const inRoom = a => {
    if (!fixedRooms) { fixedRooms = new Set(); for (const l of h.locations()) for (const ch of (l.Chambers || []).map(deref).filter(Boolean)) for (const x of ch.Actions || []) if (x) fixedRooms.add(x.id); }
    return fixedRooms.has(a._id);
  };

  // PerformAnyActionQuestObjective: conta a opção mais barata que está em um prédio. Vale-presente pede item à parte.
  const usable = list => { const ok = list.filter(a => !/^Giftcard/.test(a.m_Name)); const fixed = ok.filter(inRoom); return fixed.length ? fixed : ok; };
  function pick(list) {
    const score = a => { const c = costOf(a); return c.time + c.cash; };
    return usable(list).reduce((best, a) => (!best || score(a) < score(best) || (score(a) === score(best) && costOf(a).cash < costOf(best).cash) ? a : best), null);
  }

  // Ação de compra do item (Rewards com Type 50 e Dinheiro negativo), a mais barata; ações de Missão não são loja.
  const buyMemo = new Map();
  function buyFor(item) {
    if (!item) return null;
    if (buyMemo.has(item._id)) return buyMemo.get(item._id);
    const list = table('ChamberActionData').filter(a => !/^Quest ?Action/.test(a.m_Name) && h.actionWhere(a).length && entries(a.Rewards).some(e => e.Type === 50 && e.Id === item.Id && e.Value > 0) && costOf(a).cash > 0);
    const best = list.reduce((b, a) => (!b || costOf(a).cash < costOf(b).cash ? a : b), null);
    const out = best ? { action: best, ...costOf(best) } : null;
    buyMemo.set(item._id, out);
    return out;
  }

  const knownObjective = o => o.$type === 'CountItemOfTypeInInventoryQuestObjective' && !!buyFor(deref(o.ItemData));
  const coursePoints = q => objectivesOf(q).filter(o => o.$type === 'GetEducationQuestObjective').reduce((sum, o) => sum + entries((deref(o.EducationData) || {}).CompletionReward).filter(e => e.Type === 95).reduce((n, e) => n + e.Value, 0), 0);

  function effort(q) {
    let time = 0, cash = 0, listed = false;
    const net = new Map(), bought = new Map(), granted = new Set();
    const steps = h.stepsOf(q);
    const give = r => entries(r).filter(e => e.Type === 50 && e.Value > 0).forEach(e => granted.add(e.Id));
    for (const s of steps) {
      give(s.Rewards); give(s.QuestStartedRewards);
      for (const o of Object.values(s.references || {})) for (const a of [deref(o.ActionData), ...(o.Actions || []).map(deref)].filter(Boolean)) give(a.Rewards);
    }
    const buy = (id, n) => {
      if (granted.has(id)) return;
      const item = byId.get(id), b = buyFor(item);
      if (!b) return;
      const seen = bought.get(id) || { item, n: 0, action: b.action };
      if (seen.n >= n) return;
      const more = n - seen.n;
      seen.n = n; bought.set(id, seen);
      time += more * b.time; cash += more * b.cash;
      addAttrs(net, entries(b.action.Rewards), more);
    };
    const run = (a, n) => {
      const c = costOf(a);
      time += c.time * n; cash += c.cash * n;
      addAttrs(net, entries(a.Rewards), n);
      for (const r of a.RequiredItems || []) if (r.Type === 50) buy(r.Id, r.Value || 1);
    };
    for (const s of steps) for (const o of Object.values(s.references || {})) {
      const n = o.Count || 1;
      if (o.ActionData) { const a = deref(o.ActionData); if (a) run(a, n); }
      else if (o.ActionDatas) { const list = o.ActionDatas.map(deref).filter(Boolean); const a = pick(list); if (a) { run(a, n); if (usable(list).length > 1) listed = true; } }
      else if (o.Actions) o.Actions.map(deref).filter(Boolean).forEach(a => run(a, 1));
      else if (o.$type === 'GetEducationQuestObjective') {
        const c = deref(o.EducationData);
        if (c) {
          const sessions = c.StudyThreshold || 0;
          time += -Math.min(0, sumAttr(c.EnrollmentCost, 'Time')) + -Math.min(0, sumAttr(c.StudyCost, 'Time')) * sessions;
          cash += -Math.min(0, sumAttr(c.EnrollmentCost, 'Cash')) + -Math.min(0, sumAttr(c.StudyCost, 'Cash')) * sessions;
          addAttrs(net, entries(c.EnrollmentCost)); addAttrs(net, entries(c.StudyCost), sessions);
        }
      } else if (o.$type === 'CountItemOfTypeInInventoryQuestObjective') { const it = deref(o.ItemData); if (it) buy(it.Id, n); }
    }
    for (const s of steps) { addAttrs(net, entries(s.Rewards)); addAttrs(net, entries(s.QuestStartedRewards)); }
    return { time, cash, net, bought: [...bought.values()], listed };
  }

  // ---------------------------------------------------------------- Mapas
  const themeName = n => (table('MapLayoutData').find(m => m.Theme === n) || {}).m_Name;
  const mapNames = q => (q.AvailableOnMaps || []).map(themeName).filter(Boolean);
  // QuestComponent.IsAvailableOnMap: excluído perde; lista vazia vale em todos.
  const onMap = (q, theme) => !(q.ExcludedOnMaps || []).includes(theme) && (!(q.AvailableOnMaps || []).length || q.AvailableOnMaps.includes(theme));
  const mapsLine = (lang, q) => {
    const names = mapNames(q);
    return names.length ? say(lang, 'quests', 'only on maps (QuestComponent.AvailableOnMaps, MapLayoutData.Theme)', { 'pt-BR': `Só em ${joinE('pt-BR', names)}.`, en: `Only on ${joinE('en', names)}.` }) : '';
  };
  function twinMaps(lang, q, all) {
    const name = h.titleText(lang, q);
    const twins = all.filter(x => x !== q && h.titleText(lang, x) === name && mapNames(x).length);
    if (!twins.length || !mapNames(q).length) return '';
    const here = joinE(lang, mapNames(q));
    const others = twins.map(x => `${joinE(lang, mapNames(x))}: ${h.link(lang, x, h.title(lang, x))}`).join('; ');
    return `<p class="muted">${say(lang, 'quests', 'map variants (AvailableOnMaps of quests with equal titles)', { 'pt-BR': `Esta página é a versão de ${here}. Outra versão, ${others}.`, en: `This page is the ${here} version. Other version, ${others}.` })}</p>`;
  }

  // ---------------------------------------------------------------- Sorteio (ChamberActionData.WeightedRewards, ResourceUtils.FilterWeightedRewardsForCurrentMap)
  function drawOdds(q, action) {
    const quest = e => (e.Type === 70 ? byId.get(e.Id) : null);
    const rows = (action.WeightedRewards || []).map(w => ({ w: w.Weight, q: entries(w.Reward).map(quest).find(Boolean) })).filter(r => r.q);
    const groups = [];
    for (const m of table('MapLayoutData')) {
      const here = rows.filter(r => onMap(r.q, m.Theme));
      const mine = here.find(r => r.q.Id === q.Id);
      if (!mine) continue;
      const total = here.reduce((s, r) => s + r.w, 0);
      const hit = groups.find(g => g.w === mine.w && g.total === total);
      if (hit) hit.maps.push(m.m_Name); else groups.push({ w: mine.w, total, maps: [m.m_Name] });
    }
    return groups;
  }
  function boardText(lang, q, b, placeIn) {
    const tier = { Easy: ['fáceis', 'easy'], Medium: ['médias', 'medium'], Hard: ['difíceis', 'hard'] }[b.key];
    const odds = drawOdds(q, b.action);
    const perc = g => Math.round(g.w / g.total * 100);
    const line = l => odds.map(g => (l === 'pt-BR' ? `${g.w} em ${g.total} (${perc(g)}%) em ${joinE(l, g.maps)}` : `${g.w} in ${g.total} (${perc(g)}%) on ${joinE(l, g.maps)}`)).join('; ');
    const noRepeat = b.action.WeightedRewardIsNeverSameInRow;
    return say(lang, 'quests', `board draw ${b.key} (WeightedRewards, FilterWeightedRewardsForCurrentMap, WeightedRewardIsNeverSameInRow)`, {
      'pt-BR': `Sai no sorteio de Missões ${tier[0]} ${placeIn(lang, 'Vex Corp')}: você paga e o jogo escolhe uma da lista do seu mapa, sem deixar você escolher.${noRepeat ? ' Depois que uma Missão sai, ela só volta quando as outras da lista também já tiverem saído.' : ''} Chance desta com a lista completa: ${line('pt-BR')}.`,
      en: `It comes from the ${tier[1]} quest draw at ${h.place(lang, 'Vex Corp')}: you pay and the game picks one from your map's list, and you do not get to choose.${noRepeat ? ' Once a quest comes up, it only returns after the others on the list have come up too.' : ''} Odds of this one with the full list: ${line('en')}.`,
    });
  }

  // ---------------------------------------------------------------- Como começar sem origem conhecida
  const unknownStart = lang => say(lang, 'quests', 'start source unknown (no room, draw or role found)', {
    'pt-BR': 'Não sabemos como esta Missão começa. Nenhuma ação em prédio, sorteio ou papel que conseguimos ler a entrega, o que não prova que ela não apareça no jogo.',
    en: 'We do not know how this quest starts. No building action, draw or role we could read hands it out, which does not prove it never appears in the game.',
  });
  const unknownFee = lang => say(lang, 'quests', 'start cost unknown (start source unknown)', { 'pt-BR': 'A conta não inclui o custo de começar, que não conhecemos.', en: 'The count leaves out the cost of starting it, which we do not know.' });
  const kaijuStart = lang => say(lang, 'quests', 'kaiju quest start (Global-Event-Kaiju-Battle-Trait, Kaiju-Battle-Add-Posters-*)', {
    'pt-BR': `A ação de aceitar é acrescentada pelo <a href="/${h.langDir(lang)}/guides/global-events/">Evento Global Batalha de Kaijus</a>: é durante ele que você a encontra.`,
    en: `The accept action is added by the <a href="/${h.langDir(lang)}/guides/global-events/">Kaiju Battle Global Event</a>: that is when you find it.`,
  });

  // ---------------------------------------------------------------- Peso e Anel
  const traitsOf = item => entries(item.Rewards).filter(e => e.Type === 110).map(e => byId.get(e.Id)).filter(Boolean);
  const hasEffect = (item, re) => traitsOf(item).some(t => (t.Effects || []).some(e => re.test(e.$ref || '')));
  function questItems(q) {
    const out = new Set();
    const add = r => entries(r).filter(e => e.Type === 50 && e.Value > 0).forEach(e => { const it = byId.get(e.Id); if (it) out.add(it); });
    for (const s of h.stepsOf(q)) {
      add(s.Rewards); add(s.QuestStartedRewards);
      for (const o of Object.values(s.references || {})) { const a = deref(o.ActionData); if (a) add(a.Rewards); }
    }
    return [...out];
  }
  // Encumbered-New: ModifyMovementSpeedAndCostTraitEffect multiplica o Tempo de cada quadra por 1,2.
  function heavyNote(lang, q) {
    const list = questItems(q).filter(i => hasEffect(i, /ModifyMovementSpeedAndCostTraitEffect\/Encumbered/));
    if (!list.length) return '';
    const names = joinE(lang, list.map(i => h.link(lang, i, h.title(lang, i))));
    return say(lang, 'quests', 'heavy quest item (Encumbered-New, AdditionalMoveCostList Time x1.2)', { 'pt-BR': `Enquanto carrega ${names}, cada quadra andada custa 20% mais Tempo.`, en: `While you carry ${names}, each block you walk costs 20% more Time.` });
  }
  // One-Ring-Movement-Cost: ModifyMovementAttributeRewardsTraitEffect, cobrado por quadra em MovePlayerOnPath.
  function ringOf(q) {
    for (const it of questItems(q)) for (const t of traitsOf(it)) for (const ref of t.Effects || []) {
      if (!/ModifyMovementAttributeRewardsTraitEffect\//.test(ref.$ref || '')) continue;
      const fx = deref(ref);
      const loss = ((fx || {}).Attributes || []).reduce((s, x) => s - Math.min(0, x.Value), 0);
      if (loss > 0) return { item: it, loss, each: -Math.min(...fx.Attributes.map(x => x.Value)) };
    }
    return null;
  }
  function ringVerdict(lang, ring, spent, wear, jobWear) {
    let blocks = 1;
    while ((wear + ring.loss * blocks) / spent * 100 <= jobWear && blocks < 50) blocks++;
    const name = h.link(lang, ring.item, h.title(lang, ring.item));
    return {
      'pt-BR': `Os pontos parecem bons, mas falta somar ${name}: enquanto ele está com você, cada quadra tira ${number(lang, ring.each)} de Felicidade, de Saúde e de Higiene (${number(lang, ring.loss)} no total). Não sabemos quantas quadras separam os dois lugares no seu mapa. Com ${number(lang, blocks)} ou mais, o desgaste por Tempo já passa o de um emprego mediano.`,
      en: `The points look good, but ${name} still has to be added: while you carry it, each block takes ${number(lang, ring.each)} Happiness, Health and Hygiene (${number(lang, ring.loss)} in total). We do not know how many blocks separate the two places on your map. With ${number(lang, blocks)} or more, the wear per Time already passes a median job's.`,
    };
  }

  // ---------------------------------------------------------------- Frases do "Vale a pena?"
  function billNotes(lang, q, e) {
    const out = [];
    if (e.bought.length) {
      const text = l => joinE(l, e.bought.map(b => {
        const cost = costOf(b.action);
        const label = b.n > 1 ? `${b.n}× ${h.titleText(l, b.item)}` : h.titleText(l, b.item);
        return `${h.esc(label)} (${number(l, cost.cash * b.n)}${l === 'pt-BR' ? ' de Dinheiro' : ' Cash'}${cost.time ? ` ${l === 'pt-BR' ? 'e' : 'and'} ${number(l, cost.time * b.n)}${l === 'pt-BR' ? ' de Tempo' : ' Time'}` : ''})`;
      }));
      out.push(say(lang, 'quests', 'bought item in the bill (RequiredItems, CountItemOfTypeInInventory, buy action)', { 'pt-BR': `Inclui comprar ${text('pt-BR')}, o mínimo para fazer a Missão. Se você já tiver, tire esse valor.`, en: `It includes buying ${text('en')}, the minimum to do the quest. If you already have it, take that off.` }));
    }
    if (e.listed) out.push(say(lang, 'quests', 'cheapest option counted (PerformAnyActionQuestObjective.ActionDatas)', { 'pt-BR': 'Quando a Missão aceita mais de uma ação, a conta usa a mais barata disponível em um prédio.', en: 'When the quest accepts more than one action, the count uses the cheapest one available in a building.' }));
    return out;
  }
  function gainNote(lang, net, wearAttrs, attrName) {
    const gains = wearAttrs.map(n => [n, Math.max(0, net.get(n) || 0)]).filter(([, v]) => v > 0);
    if (!gains.length) return '';
    const text = l => joinE(l, gains.map(([n, v]) => `${number(l, v)} ${l === 'en' ? '' : 'de '}${attrName(l, n)}`));
    return say(lang, 'quests', 'quest attribute gain (net of objective actions and step rewards)', { 'pt-BR': `No saldo, ganha ${text('pt-BR')}.`, en: `On balance, it gives ${text('en')}.` });
  }
  const lossTail = (paid) => ({ 'pt-BR': ` Em Dinheiro, você fecha no prejuízo: ${number('pt-BR', -paid)} a menos.`, en: ` In Cash, you end at a loss: ${number('en', -paid)} less.` });

  // Rituais e demais vontades do Cultista (Gameplay.Roles.Cultist.CultistsBiddings; OnQuestCompleted, ExpPerTier 9, BiddingMaxDuration 3).
  function isBidding(q) {
    const c = h.roles().find(r => /^cultist$/i.test(r.m_Name));
    return !!c && JSON.stringify(c.CultistsBiddings || []).includes(`/${q.m_Name}"`);
  }
  function biddingVerdict(link, heavy) {
    return {
      'pt-BR': `Não paga Dinheiro nem pontos diretos, mas é uma vontade do papel ${link}: a cada 3 cumpridas você recebe uma Bênção, e a cada 9 sobe de nível. Se o prazo de 3 rodadas acabar sem cumprir, você é punido.${heavy ? ' O custo em atributos é alto, então compare com a punição na página do papel.' : ''}`,
      en: `It pays no Cash or direct points, but it is a bidding of the ${link} role: every 3 completed give a Boon, and every 9 raise your tier. If the 3 rounds run out, you are punished.${heavy ? ' The attribute cost is high, so compare it with the punishment on the role page.' : ''}`,
    };
  }
  const kaijuVerdict = {
    'pt-BR': 'Não paga Dinheiro nem pontos na pontuação final. Ao terminar a última etapa, soma 5 na barra da Batalha de Kaijus.',
    en: 'It pays no Cash or final-score points. Finishing the last step adds 5 to the Kaiju Battle bar.',
  };
  function roleNote(lang, role, steps, points) {
    return say(lang, 'quests', 'role quest line worth (RoleQuestChain, Quest.Rewards Type 95)', {
      'pt-BR': `É a sequência do papel ${h.link(lang, role, h.title(lang, role))}: só faz sentido para quem joga com ele. As ${number(lang, steps)} etapas somam ${number(lang, points)} pontos na pontuação final, mostrados em cada etapa abaixo. O custo depende de como você cumpre cada objetivo, então não há conta fixa de Tempo aqui.`,
      en: `This is the ${h.link(lang, role, h.title(lang, role))} role's quest line: it only matters if you play that role. The ${number(lang, steps)} steps add ${number(lang, points)} points to the final score, shown on each step below. The cost depends on how you meet each objective, so there is no fixed Time count here.`,
    });
  }
  const stepPoints = (lang, s) => {
    const p = entries(s.Rewards).filter(e => e.Type === 95).reduce((n, e) => n + e.Value, 0);
    return p ? `<p>${say(lang, 'quests', 'step points (Quest.Rewards Type 95)', { 'pt-BR': `Pontos desta etapa: ${number(lang, p)}.`, en: `Points for this step: ${number(lang, p)}.` })}</p>` : '';
  };

  // ---------------------------------------------------------------- Objetivo: onde, o que exige, quantas rodadas
  function startedWhere(step, action) {
    const traits = entries(step.QuestStartedRewards).filter(e => e.Type === 110).map(e => byId.get(e.Id)).filter(Boolean);
    const out = [];
    for (const t of traits) for (const ref of t.Effects || []) {
      if (!/AddChamberActionTraitEffect\//.test(ref.$ref || '')) continue;
      const fx = deref(ref);
      if (!fx || !(fx.ChamberActions || []).some(a => a && a.id === action._id)) continue;
      for (const ch of (fx.Chambers || []).filter(Boolean)) for (const l of h.locations()) if ((l.Chambers || []).some(x => x && x.id === ch.id) && !out.includes(l)) out.push(l);
    }
    return out;
  }
  function placesFor(o, step) {
    if (o.Location) return [deref(o.Location)].filter(Boolean);
    if (o.Locations) return o.Locations.map(deref).filter(Boolean);
    if (o.ActionData) { const a = deref(o.ActionData); if (!a) return []; const s = startedWhere(step, a); return s.length ? s : h.actionWhere(a); }
    if (o.ActionDatas) return [...new Set(usable(o.ActionDatas.map(deref).filter(Boolean)).flatMap(a => { const s = startedWhere(step, a); return s.length ? s : h.actionWhere(a); }))];
    if (o.Actions) return [...new Set(o.Actions.map(deref).filter(Boolean).flatMap(h.actionWhere))];
    if (o.$type === 'EnterChamberQuestObjective') { const ids = [].concat(o.ChamberData || []).filter(Boolean).map(c => c.id); return h.locations().filter(l => (l.Chambers || []).some(x => x && ids.includes(x.id))); }
    if (o.$type === 'PerformStockBuyActionQuestObjective') return [...new Set(table('ChamberActionData').filter(a => a.Purpose === 18).flatMap(h.actionWhere))];
    return [];
  }
  const isHome = l => /Home/.test(l.m_Name);
  function whereText(lang, o, step, html) {
    const places = placesFor(o, step);
    if (!places.length) return '';
    const homes = places.filter(isHome), others = places.filter(l => !isHome(l));
    if (others.length > 8) return '';
    const text = h.plain(html).toLowerCase();
    if (!homes.length && others.every(l => text.includes(h.titleText(lang, l).toLowerCase()))) return '';
    const uniq = others.filter((l, i) => others.findIndex(x => h.titleText(lang, x) === h.titleText(lang, l)) === i);
    const names = uniq.map(l => (pt(lang) ? comPreposicao(h.titleText(lang, l), 'em', label => h.link(lang, l, h.esc(label))) : h.link(lang, l, h.title(lang, l))));
    if (homes.length) names.push(pt(lang) ? 'na sua moradia' : 'at your home');
    return say(lang, 'quests', 'objective place (Location, AddChamberActionTraitEffect, LocationData.Chambers)', { 'pt-BR': `Onde: ${joinE('pt-BR', names)}.`, en: `Where: ${joinE('en', names)}.` });
  }
  function requiredText(lang, o, step) {
    const list = o.ActionData ? [deref(o.ActionData)].filter(Boolean) : o.ActionDatas ? usable(o.ActionDatas.map(deref).filter(Boolean)) : [];
    if (!list.length) return '';
    const first = (list[0].RequiredItems || []).filter(r => r.Type === 50).map(r => r.Id);
    const shared = first.filter(id => list.every(a => (a.RequiredItems || []).some(r => r.Id === id)));
    const parts = shared.map(id => byId.get(id)).filter(Boolean).map(it => {
      const b = buyFor(it);
      if (!b) return null;
      const where = h.actionWhere(b.action).filter((l, i, all) => all.findIndex(x => h.titleText(lang, x) === h.titleText(lang, l)) === i);
      const at = where.length && where.length <= 3 ? (pt(lang) ? ` ${joinE(lang, where.map(l => comPreposicao(h.titleText(lang, l), 'em', label => h.link(lang, l, h.esc(label)))))}` : ` at: ${joinE(lang, where.map(l => h.link(lang, l, h.title(lang, l))))}`) : '';
      return `${h.link(lang, it, h.title(lang, it))} (${number(lang, b.cash)}${pt(lang) ? ' de Dinheiro' : ' Cash'}${at})`;
    }).filter(Boolean);
    return parts.length ? say(lang, 'quests', 'objective required item (ChamberActionData.RequiredItems, buy action)', { 'pt-BR': `Exige ter: ${joinE('pt-BR', parts)}.`, en: `Requires: ${joinE('en', parts)}.` }) : '';
  }
  // CooldownHandler.OnTurnStarted desconta 1 por turno e libera a ação ao zerar.
  function waitText(lang, o) {
    const a = deref(o.ActionData), n = o.Count || 1;
    if (!a || !(a.Cooldown >= 1) || n < 2) return '';
    const rounds = (n - 1) * a.Cooldown + 1;
    return say(lang, 'quests', 'minimum rounds (ChamberActionData.Cooldown, CooldownHandler.OnTurnStarted)', { 'pt-BR': `Só dá para fazer esta ação 1 vez a cada ${a.Cooldown === 1 ? 'rodada' : `${a.Cooldown} rodadas`}: leva no mínimo ${number('pt-BR', rounds)} rodadas.`, en: `This action can be done once every ${a.Cooldown === 1 ? 'round' : `${a.Cooldown} rounds`}: it takes at least ${number('en', rounds)} rounds.` });
  }
  function decorate(lang, o, step, html) {
    let out = html;
    if (o.$type === 'RoleCultistCompleteBiddingQuestObjective' && o.Count) out = `${out.replace(/\d+/, String(o.Count))} <span class="muted">${say(lang, 'quests', 'cultist quest total (CheckObjectiveStatus Count <= CompletedBiddingsCount)', { 'pt-BR': 'no total da partida', en: 'in total this game' })}</span>`;
    if (o.$type === 'GainAttributeQuestObjective' && o.TargetValue) out = `${out} <span class="muted">${say(lang, 'quests', 'gain attribute target (GainAttributeQuestObjective.TargetValue)', { 'pt-BR': `alvo: ${number('pt-BR', o.TargetValue)}`, en: `target: ${number('en', o.TargetValue)}` })}</span>`;
    const bits = [whereText(lang, o, step, html), requiredText(lang, o, step), waitText(lang, o)].filter(Boolean);
    return bits.length ? `${out}<br><span class="muted">${bits.join(' ')}</span>` : out;
  }

  return { effort, coursePoints, knownObjective, mapNames, mapsLine, twinMaps, boardText, unknownStart, unknownFee, kaijuStart, heavyNote, ringOf, ringVerdict, billNotes, gainNote, lossTail, isBidding, biddingVerdict, kaijuVerdict, roleNote, stepPoints, decorate };
};
