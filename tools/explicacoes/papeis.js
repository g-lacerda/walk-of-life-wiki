'use strict';
// Role pages (Papéis): "how to play", costs, waits, penalties, sale values and tips.
// Every number comes from game data or from decompiled code; the id of each sentence names the source.
// Rules read from code are also listed in docs/engenharia-reversa.md (section "Papéis (Bloco 7)").
// build-site.js calls this factory with a function that returns its helpers, so nothing here runs before they exist.

module.exports = function makeRoles(getH) {
  const H = () => getH();

  // ------------------------------------------------------------------ small shared pieces
  const ctx = (lang, r) => {
    const h = H();
    const t = (id, pt, en) => h.say(lang, `role ${r.Term}`, id, { 'pt-BR': pt, en });
    const n = v => h.number(lang, v);
    const art = (name, size = 40) => {
      const flat = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = [...h.SPRITE_KEYS.keys()].find(k => flat(k) === flat(name));
      return key ? h.icon(h.spriteRef(key), size) : '';
    };
    const act = name => h.table('ChamberActionData').find(a => a.m_Name === name);
    const itemOf = name => h.items.find(i => i.m_Name === name);
    const itemLink = (name, size = 22) => { const it = itemOf(name); return it ? `${h.itemIcon(it, size)}${h.link(lang, it, h.title(lang, it))}` : h.esc(name); };
    const cost = (a, attr) => -h.sumAttr(a.Rewards, attr);
    // Waits come from ChamberActionData.Cooldown: 1 = once per round, N = once every N rounds (same reading as the trait pages).
    const wait = a => (!a || !a.Cooldown ? '' : a.Cooldown === 1
      ? t('wait 1 (ChamberActionData.Cooldown)', '1 vez por rodada', 'Once per round')
      : t('wait n (ChamberActionData.Cooldown)', `1 vez a cada ${a.Cooldown} rodadas`, `Once every ${a.Cooldown} rounds`));
    const sell = it => (it && it.SellValue ? t('sells (ItemData.SellValue, GetPawnRewardsForItem)', `${n(it.SellValue)} na Casa de Penhores`, `${n(it.SellValue)} at the Pawn Shop`) : '');
    const list = arr => `<ul class="plain">${arr.map(x => `<li>${x}</li>`).join('')}</ul>`;
    return { h, lang, r, t, n, art, act, itemOf, itemLink, cost, wait, sell, list };
  };

  // Role-quest table. `rows` replaces the generic reading when a role needs both numbers (Cultist, Hacker).
  function questRows(c) {
    const { h, lang, r, n } = c;
    const chain = h.deref(r.RoleQuestChain);
    if (!chain) return [];
    return (chain.Quests || []).map(h.deref).filter(Boolean).map((q, i) => {
      const o = Object.values(q.references || {})[0] || {};
      const pts = (q.Rewards.RewardEntries.find(e => e.Type === 95) || {}).Value;
      if (!(o.Term && h.TEXT.en.has(o.Term) && pts)) return null;
      const goal = h.gameText(lang, o.Term).replace(/\{[^}]*\}/g, '');
      // The steps of a chain share one page (questPage), so every row links to the chain's page.
      const stepLink = h.link(lang, chain, `${h.ui(lang, 'step')} ${n(i + 1)}`);
      return { goal: o.Count && !/\d/.test(h.plain(goal)) ? `${goal}: ${n(o.Count)}` : goal, count: o.Count, pts, term: o.Term, stepLink };
    }).filter(Boolean);
  }

  // ------------------------------------------------------------------ Cultist
  // Rules: Cultist.BiddingMaxDuration 3, ExpPerBoon 3, ExpPerTier 9, StartNewBidding, OnTurnStarted, OnQuestCompleted (GiveBoon),
  // MarkBiddingCompleted (CompletedBiddingsCount +1, never reset), RoleCultistCompleteBiddingQuestObjective (done when count >= Count).
  function cultistGuide(lang, r) {
    const c = ctx(lang, r);
    const { h, n } = c;
    const s = (id, texts) => h.say(lang, 'role cultist', id, texts);
    const art = (name, size = 32) => h.icon(h.spriteRef(name), size);
    const objectives = q => Object.values(q.references || {});
    const chains = r.CultistsBiddings.map(b => ({ b, chain: h.deref(b.BiddingQuest) })).filter(x => x.chain);
    const feedRows = [];
    for (const { b, chain } of chains.filter(x => x.b.BiddingType === 2)) {
      for (const q of (chain.Quests || []).map(h.deref).filter(Boolean)) for (const o of objectives(q)) {
        const a = h.deref(o.ActionData);
        for (const need of (a && a.RequiredItems) || []) { const it = h.byId.get(need.Id); if (it) feedRows.push({ tier: b.Tier, it }); }
      }
    }
    const feed = t => [...new Set(feedRows.filter(x => x.tier === t).map(x => x.it))].map(it => `${h.itemIcon(it, 20)}${h.link(lang, it, h.title(lang, it))} <span class="muted">${n(h.buyPrice(it))}</span>`).join(', ');
    const boonLine = it => {
      const rewards = it.Rewards.RewardEntries || [];
      const fx = rewards.filter(e => e.Type === 10 && h.byId.get(e.Id) && h.byId.get(e.Id).m_Name !== 'Cash');
      const traits = rewards.filter(e => e.Type === 110).map(e => h.byId.get(e.Id)).filter(Boolean).map(x => h.traitDetails(lang, x)).join('');
      const flv = h.tx(lang, it.FlavorTerm) ? `<em>${h.spanLang(lang, h.tx(lang, it.FlavorTerm))}</em>` : '';
      const plainUse = !fx.length && !traits ? (it.SellValue > 0 ? s('boon only sells (GetPawnRewardsForItem)', { 'pt-BR': `Vale ${n(it.SellValue)} na Casa de Penhores.`, en: `Worth ${n(it.SellValue)} at the Pawn Shop.` }) : s('boon not sellable (ItemData.SellValue 0)', { 'pt-BR': 'Não pode ser vendido.', en: 'It cannot be sold.' })) : '';
      // Furniture bonuses count at home: beds when you sleep (best bed only), other pieces when you relax (RelaxationHandler.GetSleepRewards, GetRelaxRewards).
      const isBed = it.FurnitureSlot === 10;
      const when = fx.length && (it.FurnitureSlot || it.Purpose === 4) ? `<p class="muted">${isBed ? s('boon bed (RelaxationHandler.GetSleepRewards)', { 'pt-BR': 'Vale toda vez que você dorme em casa:', en: 'Counts every time you sleep at home:' }) : s('boon furniture (RelaxationHandler.GetRelaxRewards)', { 'pt-BR': 'Vale toda vez que você relaxa em casa, somado aos outros móveis:', en: 'Counts every time you relax at home, added to your other furniture:' })}</p>` : '';
      return `<li>${h.itemIcon(it, 20)}${h.link(lang, it, h.title(lang, it))}: ${flv} ${plainUse}${traits}${when}${h.effects(lang, fx)}</li>`;
    };
    const boons = t => `<ul class="plain">${r.CultistBoons.filter(b => b.Tier === t).flatMap(b => (b.BoonItems || []).map(h.deref)).filter(Boolean).map(boonLine).join('')}</ul>`;
    // Places reachable during a bidding: traits granted by the quests of the chains in CultistsBiddings (QuestStartedRewards type 110).
    const biddingWhere = a => { const out = new Set(); for (const { chain } of chains) for (const q of (chain.Quests || []).map(h.deref).filter(Boolean)) for (const e of ((q.QuestStartedRewards || {}).RewardEntries || []).filter(x => x.Type === 110)) { const tr = h.byId.get(e.Id); for (const fx of ((tr && tr.Effects) || []).map(h.deref).filter(Boolean)) { if (![...(fx.ChamberActions || []), fx.ChamberAction].filter(Boolean).map(h.deref).some(x => x && x._id === a._id)) continue; for (const ch of [...(fx.Chambers || []), fx.Chamber].filter(Boolean).map(h.deref).filter(Boolean)) for (const l of h.chamberLocations.get(ch._id) || []) out.add(l); } } return [...out]; };
    const actionRows = names => names.map(name => h.table('ChamberActionData').find(a => a.m_Name === name)).filter(a => a && h.hasText(a));
    const actionTable = (list, where = h.actionWhere) => h.simpleTable([h.ui(lang, 'action'), h.ui(lang, 'effects'), h.ui(lang, 'location')], list.map(a => [`${h.artIcon('action', a, 28)}${h.title(lang, a)}`, h.effects(lang, a.Rewards.RewardEntries) || '', h.placesOf(lang, where(a)) || s('at home or quest', { 'pt-BR': 'Indicado na Missão', en: 'Shown in the quest' })]));
    const duringBidding = actionRows(['Cultist - Indoctrinate', 'Cultist - Perform Ritual', 'Cultist - Preach', 'Cultist - Chant', 'Cultist - Cast Curse', 'Cultist - Study Spell Book', 'Cultist - Pick up box of plagues', 'Cultist - Return box of plagues']);
    const withBoon = actionRows(['Cultist - Get Cosmic Treasure', 'Cultist - Hand in Abyssal CV', 'Cultist - Admire Poster', 'Cultist - Eat Toast']);
    const pay = h.table('ReportData').find(x => x.m_Name === 'Cultist - Punished');
    const tiers = [1, 2, 3];
    const steps = h.table('ChamberActionData').find(a => a.m_Name === 'Cultist - Feed furniture - Scented Candle');
    const quests = questRows(c);
    // CultistsBiddings: BiddingType 1 Indoctrinate (PerformActionsAtLocationsQuestObjective.Locations), 3 Ritual. Feed (type 2) is the furniture column.
    const indoctrinate = t => chains.filter(x => x.b.BiddingType === 1 && x.b.Tier === t).flatMap(x => (x.chain.Quests || []).map(h.deref).filter(Boolean)).flatMap(objectives).map(o => (o.Locations || []).map(h.deref).filter(Boolean)).filter(l => l.length);
    const rituals = t => chains.filter(x => x.b.BiddingType === 3 && x.b.Tier === t).map(x => x.chain);
    const bulleted = list => `<ul class="plain">${list.map(x => `<li>${x}</li>`).join('')}</ul>`;
    return `<h2>${s('title', { 'pt-BR': 'Como jogar', en: 'How to play' })}</h2>
<p>${s('intro (role_cultist_sheet)', { 'pt-BR': 'Um terror cósmico mora na sua casa e vive pedindo coisas. Cada pedido é uma <strong>vontade</strong>. Cumpra para ganhar recompensas; ignore e você é punido.', en: 'A cosmic horror lives in your home and keeps asking for things. Each request is a <strong>bidding</strong>. Fulfill them for rewards; ignore them and you get punished.' })}</p>
<ol class="plain">
<li>${s('step ask (StartNewBidding, BiddingMaxDuration)', { 'pt-BR': 'No início do seu turno, o terror pede uma vontade: aparece um balão com ícones. Você tem <strong>3 rodadas</strong> para cumprir.', en: 'At the start of your turn the horror asks for a bidding: a balloon with icons appears. You have <strong>3 rounds</strong> to fulfill it.' })}</li>
<li>${s('step read (CultistBidding.SpeechIcons)', { 'pt-BR': 'O primeiro ícone do balão diz o tipo de vontade. Os outros dizem onde ou o quê (tabela abaixo).', en: 'The first icon in the balloon tells the kind of bidding. The others tell where or what (table below).' })}</li>
<li>${s('step boon (OnQuestCompleted -> GiveBoon, RefreshRoleWidget -> SetStatus(CultistExp % 3), IsBoonCandidate, _claimedBoons)', { 'pt-BR': 'As velas do castiçal na tela contam suas vontades cumpridas: cada uma acende uma vela. Ao cumprir a 3ª, você recebe uma <strong>Bênção</strong> na hora, sem precisar fazer mais nada, e as velas voltam a zero. A Bênção é sorteada entre as do seu nível que você ainda não recebeu.', en: 'The candles on screen count your fulfilled biddings: each one lights a candle. On the 3rd you get a <strong>Boon</strong> right away, with nothing else to do, and the candles reset. The Boon is drawn among those of your tier you have not received yet.' })}</li>
<li>${s('step tier (OnQuestCompleted, ExpPerTier)', { 'pt-BR': 'A cada 9 vontades, você sobe de nível. As vontades ficam mais caras e as Bênçãos, melhores.', en: 'Every 9 biddings you go up a tier. Biddings get more expensive and Boons better.' })}</li>
</ol>
<h3>${s('balloon', { 'pt-BR': 'Como ler o balão', en: 'How to read the balloon' })}</h3>
<p>${art('ICON_Speech_Balloon_Eye')} ${art('Icon-Location-Cluckers')} ${art('Icon-Location-CityHall')}<br>${s('balloon example (Chain-Cultist-Indoctrinate-t1-1 SpeechIcons)', { 'pt-BR': `Exemplo do que aparece na tela: Doutrinar no ${h.place(lang, 'Cluckers')} e na ${h.place(lang, 'Town Hall')}.`, en: `Example of what shows on screen: Indoctrinate at ${h.place(lang, 'Cluckers')} and the ${h.place(lang, 'Town Hall')}.` })}</p>
${h.simpleTable([s('col icon', { 'pt-BR': 'Primeiro ícone', en: 'First icon' }), s('col means', { 'pt-BR': 'O que pede', en: 'What it asks' }), s('col do', { 'pt-BR': 'O que fazer', en: 'What to do' }), s('col cost', { 'pt-BR': 'Custo', en: 'Cost' })], [
      [`${art('ICON_Speech_Balloon_Eye')} ${s('eye', { 'pt-BR': 'Olho em espiral', en: 'Spiral eye' })}`, s('indoctrinate name', { 'pt-BR': 'Doutrinar', en: 'Indoctrinate' }), s('indoctrinate do (PerformActionsAtLocationsQuestObjective)', { 'pt-BR': 'Os outros ícones são locais. Vá a cada um e use a ação Doutrinar.', en: 'The other icons are locations. Go to each one and use the Indoctrinate action.' }), s('indoctrinate cost', { 'pt-BR': `${n(-h.sumAttr(duringBidding[0].Rewards, 'Time'))} de Tempo em cada local`, en: `${n(-h.sumAttr(duringBidding[0].Rewards, 'Time'))} Time at each location` })],
      [`${art('ICON_Speech_Balloon_Mouth')} ${s('mouth', { 'pt-BR': 'Boca', en: 'Mouth' })}`, s('feed name', { 'pt-BR': 'Alimentar', en: 'Feed' }), s('feed do (Feed furniture actions, ChamberActionPurposeType.ConsumeItem)', { 'pt-BR': 'O outro ícone é um móvel. Você precisa ter esse móvel e usar Alimentar o Terror. <strong>O móvel é consumido</strong>: é por isso que seus móveis somem.', en: 'The other icon is a piece of furniture. You must own it and use Feed the Horror. <strong>The furniture is consumed</strong>: that is why your furniture disappears.' }), s('feed cost', { 'pt-BR': `${n(-h.sumAttr(steps.Rewards, 'Time'))} de Tempo, ${n(-h.sumAttr(steps.Rewards, 'Hygiene'))} de Higiene e o móvel`, en: `${n(-h.sumAttr(steps.Rewards, 'Time'))} Time, ${n(-h.sumAttr(steps.Rewards, 'Hygiene'))} Hygiene and the furniture` })],
      [`${art('ICON_Speech_Balloon_Ritual')} ${s('ritual icon', { 'pt-BR': 'Símbolo de ritual', en: 'Ritual symbol' })}`, s('ritual name', { 'pt-BR': 'Ritual', en: 'Ritual' }), s('ritual do (Chain-Cultist-Ritual)', { 'pt-BR': 'O outro ícone é o local. Use Começar Ritual lá e siga os passos da Missão (Pregar, Entoar Cântico e outros, em locais indicados).', en: 'The other icon is the location. Use Start Ritual there and follow the quest steps (Preach, Chant and others, at the listed places).' }), s('ritual cost', { 'pt-BR': `${n(-h.sumAttr(duringBidding[0].Rewards, 'Time'))} de Tempo por passo do ritual; passos que usam ações comuns cobram o custo delas`, en: `${n(-h.sumAttr(duringBidding[0].Rewards, 'Time'))} Time per ritual step; steps that use regular actions charge their own cost` })],
    ])}
<h3>${s('actions title', { 'pt-BR': 'Ações que só existem durante uma vontade', en: 'Actions that only exist during a bidding' })}</h3>
<p>${s('actions note bidding', { 'pt-BR': 'Estas ações aparecem só enquanto a vontade em andamento pede por elas.', en: 'These actions show up only while the current bidding asks for them.' })}</p>
${actionTable(duringBidding, biddingWhere)}
<h3>${s('actions title boon', { 'pt-BR': 'Ações liberadas por uma Bênção', en: 'Actions unlocked by a Boon' })}</h3>
<p>${s('actions note boon', { 'pt-BR': 'Estas aparecem só depois que você recebe a Bênção correspondente (ver tabela de níveis abaixo).', en: 'These show up only after you receive the matching Boon (see the tier table below).' })}</p>
${actionTable(withBoon)}
<h3>${s('punish title', { 'pt-BR': 'Se você não cumprir', en: 'If you do not fulfill it' })}</h3>
<p>${s('punish (OnTurnStarted, WarningReport, PunishedReport)', { 'pt-BR': 'Quando falta 1 rodada, o jogo avisa. Se o prazo acabar, no início do seu turno seguinte você é punido e já recebe outra vontade:', en: 'With 1 round left, the game warns you. If time runs out, at the start of your next turn you are punished and already get another bidding:' })}</p>${h.effects(lang, pay.Rewards.RewardEntries)}
<h3>${s('tiers title', { 'pt-BR': 'O que cada nível pede e dá', en: 'What each tier asks and gives' })}</h3>
${h.simpleTable([h.ui(lang, 'level'), s('col furn', { 'pt-BR': 'Móveis que o terror pode pedir (preço)', en: 'Furniture the horror can ask for (price)' }), s('col indoctrinate (PerformActionsAtLocationsQuestObjective.Locations)', { 'pt-BR': 'Doutrinar: locais de cada pedido', en: 'Indoctrinate: places of each request' }), s('col rituals (CultistBidding BiddingType 3)', { 'pt-BR': 'Rituais', en: 'Rituals' }), s('col boon', { 'pt-BR': 'Bênçãos possíveis', en: 'Possible Boons' })], tiers.map(t => [t, feed(t), bulleted(indoctrinate(t).map(l => h.placesOf(lang, l))), bulleted(rituals(t).map((ch, i) => h.link(lang, ch, `${s('ritual label', { 'pt-BR': 'Ritual', en: 'Ritual' })} ${n(i + 1)}`))), boons(t)]))}
<p>${s('biddings no points (Quest-Cultist-Feed, Indoctrinate and Ritual have empty Rewards)', { 'pt-BR': 'Cada vontade é uma Missão à parte, e nenhuma delas dá pontos por si: o que rende é a Bênção da 3ª vontade e as Missões do papel, logo abaixo.', en: 'Each bidding is a separate quest, and none of them gives points by itself: what pays is the Boon on the 3rd bidding and the role quests, right below.' })}</p>
<p>${s('plan tip (Feed quests, ItemData)', { 'pt-BR': 'Dica: os móveis da tabela são os que podem ser pedidos. Comprar um só para alimentar custa o preço indicado. Compare com a punição acima por deixar o prazo vencer: 100 de Dinheiro, 100 de Saúde e 100 de Higiene.', en: 'Tip: the furniture in the table is what can be asked for. Buying one just to feed it costs the listed price. Compare it with the punishment above for letting the deadline pass: 100 Cash, 100 Health and 100 Hygiene.' })}</p>
<h3>${s('quest title', { 'pt-BR': 'Missões do papel', en: 'Role quests' })}</h3>
<p>${s('quest points (Quest-Cultist-1..5, CompletedBiddingsCount)', { 'pt-BR': 'O texto do jogo fala em 3, 6, 9, 12 e 15 vontades, mas o código só dá a Missão quando o contador de vontades cumpridas chega a 3, 9, 15, 21 e 27. Esse contador soma 1 por vontade cumprida e nunca volta a zero. A tabela mostra os dois números.', en: 'The game text says 3, 6, 9, 12 and 15 biddings, but the code only completes the quest when the counter of fulfilled biddings reaches 3, 9, 15, 21 and 27. That counter adds 1 per bidding and never resets. The table shows both numbers.' })}</p>
${h.simpleTable([h.ui(lang, 'quests'), s('col shown', { 'pt-BR': 'O que o jogo escreve', en: 'What the game says' }), s('col real', { 'pt-BR': 'Vontades que o código exige', en: 'Biddings the code requires' }), s('col pts', { 'pt-BR': 'Pontos', en: 'Points' })], quests.map(q => [q.stepLink, h.gameText(lang, q.term).replace(/\{[^}]*\}/g, ''), n(q.count), n(q.pts)]))}
<p>${s('quest total', { 'pt-BR': `No total, as cinco Missões dão ${n(quests.reduce((a, q) => a + q.pts, 0))} pontos.`, en: `In total, the five quests give ${n(quests.reduce((a, q) => a + q.pts, 0))} points.` })}</p>`;
  }

  // ------------------------------------------------------------------ the other roles
  // Each entry returns { summary, steps, screen, blocks, actions, notes, where, own, penalties, tips, chain }.
  const ROLE_PLAY = {
    // Artist.ProgressPainting (0.08/0.15/0.25 progress, 0.1 inspiration per painting), GetInspirationState (0.1/0.33/0.8), OnTurnStarted (0.08 + 0.02 per Basic course),
    // EnsureInspirationSeeded (shuffles the locations), GetCurrentRewardIndex (work XP level), GetAttributeCostMultiplier (0.5/0.8/1.3), GetPaintTimeCost (Time of the Artist Job).
    role_artist: c => {
      const { h, lang, t, n, art, act } = c;
      const rewards = (c.r.Rewards || []).map((x, i) => act(`Artist - Make Art Reward ${i + 1}`)).filter(Boolean); // Artist.GetCurrentRewardIndex = min(XP level, Rewards.Count) - 1: a 7th table never applies
      const paintings = [...new Map(rewards.flatMap(a => a.WeightedRewards.map(w => h.byId.get(w.Reward.RewardEntries[0].Id))).filter(Boolean).map(it => [it.m_Name, it])).values()].sort((a, b) => a.SellValue - b.SellValue);
      const rows = rewards.map((a, i) => { const total = a.WeightedRewards.reduce((s, w) => s + w.Weight, 0); return [i + 1 === rewards.length ? `${i + 1}+` : i + 1, a.WeightedRewards.map(w => { const it = h.byId.get(w.Reward.RewardEntries[0].Id); return `${h.itemIcon(it, 22)}${h.link(lang, it, h.title(lang, it))} ${Math.round(w.Weight / total * 100)}%`; }).join('<br>')]; });
      const make = act('Artist - Make Art');
      const jobs = h.table('JobData').filter(j => /^Artist Job \d/.test(j.m_Name)).sort((a, b) => a.JobLevel - b.JobLevel);
      const basic = h.deref(c.r.TargetEducation);
      const best = paintings[paintings.length - 1], mid = paintings.find(p => p.SellValue === 400) || best;
      return {
        summary: t('summary', 'Você não tem emprego: faz arte pela cidade e vive de vender as obras.', 'You have no job: you make art around town and live off selling it.'),
        steps: [
          t('s1', 'Vá a um dos locais da tabela "Onde dá para pintar", vista roupa do nível pedido e use Fazer Arte. Cada vez, o quadro em andamento avança conforme a inspiração do lugar.', 'Go to a place in the "Where you can paint" table, wear clothes of the required tier and use Make Art. Each time, the current piece advances based on the place\'s inspiration.'),
          t('s2', `Inspiração é a reserva criativa do lugar, de 0 a 100%. O jogo sorteia a de cada local no começo da partida. Cada pintura gasta 10% da inspiração do local. No início de cada turno seu, todo local recupera 8%, mais 2% para cada nível concluído de ${basic ? h.titleText(lang, basic) : 'Ensino básico'}.`, 'Inspiration is a place\'s creative reserve, from 0 to 100%. The game draws each place\'s starting value at the start of the game. Each painting uses 10% of the place\'s inspiration. At the start of each of your turns every place recovers 8%, plus 2% for each finished level of Basic Education.'),
          t('s3', 'Quando a obra chega a 100%, você recebe um quadro, sorteado conforme seu nível de EXP de Trabalho (tabela abaixo), e começa outro.', 'When the piece reaches 100%, you get a painting, drawn by your Work XP level (table below), and start another.'),
          t('s4', 'Venda os quadros na Casa de Penhores. É daí que vem todo o seu dinheiro: sem emprego, não há salário.', 'Sell the paintings at the Pawn Shop. All your money comes from there: with no job there is no salary.'),
        ],
        screen: [[art('Icon-Job-Artist'), t('sc1', 'O painel do papel mostra o quanto o quadro atual já avançou e o estado do local onde você está.', 'The role panel shows how far the current painting has gone and the state of the place you are in.')]],
        blocks: [
          '<h3>' + t('where', 'Onde dá para pintar', 'Where you can paint') + '</h3>' + h.simpleTable([t('col tier', 'Roupa mínima', 'Minimum clothes'), h.ui(lang, 'location')], (c.r.PaintingActions || []).map(p => [p.RequiredClothingTier, h.placesOf(lang, (p.Locations || []).map(h.deref).filter(l => l && l._slug))])),
          '<h3>' + t('states', 'Estados de inspiração', 'Inspiration states') + '</h3>' + h.simpleTable([t('col state', 'Estado', 'State'), t('col value', 'Inspiração do local', 'Place inspiration'), t('col adv', 'Avanço do quadro por pintura', 'Piece progress per painting'), t('col drain', 'Multiplicador de Felicidade, Saúde, Higiene e EXP de Trabalho', 'Multiplier on Happiness, Health, Hygiene and Work XP')], [[t('st0', 'Vazio', 'Empty'), t('v0', 'Abaixo de 10%', 'Below 10%'), t('a0', 'Não dá para pintar', 'Cannot paint'), '-'], [t('st1', 'Sem inspiração', 'Uninspired'), t('v1', 'Até 33%', 'Up to 33%'), '8%', '×0,5'], [t('st2', 'Neutro', 'Neutral'), t('v2', 'Até 80%', 'Up to 80%'), '15%', '×0,8'], [t('st3', 'Inspirado', 'Inspired'), t('v3', 'Acima de 80%', 'Above 80%'), '25%', '×1,3']]),
          '<h3>' + t('cost', 'O que custa cada pintura', 'What each painting costs') + '</h3><p>' + t('cost intro (Artist - Make Art, JobData Artist Job 1..6, Artist.GetPaintTimeCost)', `Cada pintura funciona como um turno de trabalho do emprego de artista do seu nível (um por nível de EXP de Trabalho), e a tabela abaixo mostra o que ele cobra. O Tempo é sempre o mesmo, −${n(-h.sumAttr(jobs[0].Rewards, 'Time'))}. Felicidade, Saúde, Higiene e EXP de Trabalho da tabela são multiplicadas pelo estado do local, como mostra a tabela anterior. (A ação Fazer Arte tem −${n(c.cost(make, 'Time'))} na ficha do jogo, mas não está em sala nenhuma: vale o custo do emprego.)`, `Each painting works like a shift of the artist job for your level (one per Work XP level), and the table below shows what it charges. Time is always the same, −${n(-h.sumAttr(jobs[0].Rewards, 'Time'))}. Happiness, Health, Hygiene and Work XP in the table are multiplied by the place\'s state, as the previous table shows. (The Make Art action shows −${n(c.cost(make, 'Time'))} on the game sheet, but it is in no room: the job\'s cost applies.)`) + '</p>' + h.simpleTable([h.ui(lang, 'level'), h.ui(lang, 'name'), c.h.attrName(lang, 'Time'), c.h.attrName(lang, 'Happy'), c.h.attrName(lang, 'Health'), c.h.attrName(lang, 'Hygiene'), c.h.attrName(lang, 'Experience')], jobs.map(j => [j.JobLevel, h.hasText(j) ? h.title(lang, j) : '', '−' + n(-h.sumAttr(j.Rewards, 'Time')), '−' + n(-h.sumAttr(j.Rewards, 'Happy')), '−' + n(-h.sumAttr(j.Rewards, 'Health')), '−' + n(-h.sumAttr(j.Rewards, 'Hygiene')), '+' + n(h.sumAttr(j.Rewards, 'Experience'))])),
          '<h3>' + t('rewards', 'Qual quadro sai', 'Which painting you get') + '</h3>' + h.simpleTable([t('col lv', 'Nível de EXP de Trabalho', 'Work XP level'), t('col paint', 'Chance de cada quadro', 'Chance of each painting')], rows),
          '<h3>' + t('worth', 'Quanto vale cada quadro', 'What each painting is worth') + '</h3>' + h.simpleTable([h.ui(lang, 'name'), t('col sell', 'Vende por', 'Sells for')], paintings.map(p => [`${h.itemIcon(p, 22)}${h.link(lang, p, h.title(lang, p))}`, c.sell(p)])),
        ],
        own: [],
        tips: [
          t('tip1', `Pinte nos lugares inspirados: 4 pinturas a 25% terminam um quadro; a 8% são 13. Um quadro ${h.titleText(lang, mid)} vale ${n(mid.SellValue)}, ou seja, cerca de ${n(Math.round(mid.SellValue / 4))} por pintura em lugar inspirado e ${n(Math.round(mid.SellValue / 13))} em lugar sem inspiração.`, `Paint in inspired places: 4 paintings at 25% finish a piece; at 8% it takes 13. A ${h.titleText(lang, mid)} piece is worth ${n(mid.SellValue)}, about ${n(Math.round(mid.SellValue / 4))} per painting in an inspired place and ${n(Math.round(mid.SellValue / 13))} in an uninspired one.`),
          t('tip2', 'Cada pintura tira 10% do local, então um local de 100% cai a 80% em duas pinturas e passa de inspirado a neutro. Troque de lugar em vez de insistir no mesmo.', 'Each painting takes 10% from the place, so a 100% place drops to 80% after two paintings and goes from inspired to neutral. Move around instead of staying put.'),
        ],
      };
    },

    // Drifter.CheckWorkCombo (WorkComboTarget 4), _completedJobsDict, JobTraitDuration 3 counted in OnTurnStarted, Drifter-Job-Tracker 1.4.
    role_drifter: c => {
      const { t, n, art } = c;
      return {
        summary: t('summary', 'Você muda de emprego o tempo todo: as primeiras vezes em cada um pagam mais, e as vantagens ficam com você por um tempo.', 'You keep changing jobs: the first shifts at each one pay more, and its perks stay with you for a while.'),
        steps: [
          t('s1', 'Consiga um emprego que você ainda não concluiu.', 'Get a job you have not completed yet.'),
          t('s2', 'Nos 4 primeiros turnos de trabalho nele, você ganha 40% a mais de Dinheiro e de EXP de Trabalho.', 'In the first 4 shifts there, you get 40% more Cash and Work XP.'),
          t('s3', 'No 4º, o emprego entra na lista de concluídos. Depois disso, trabalhar nele paga o normal.', 'On the 4th, the job goes on the completed list. After that it pays the normal rate.'),
          t('s4', 'Saia e procure outro. As vantagens do emprego concluído valem até 3 rodadas depois da conclusão e então acabam: o contador cai 1 no início de cada turno seu, mesmo se você continuar no emprego. Você pode ter vantagens de vários empregos ao mesmo tempo.', 'Leave and find another. The completed job\'s perks last up to 3 rounds after you complete it and then end: the counter drops 1 at the start of each of your turns, even if you stay in the job. You can hold perks from several jobs at once.'),
        ],
        screen: [[art('Icon-Role-Drifter'), t('sc1', 'Na Agência de Empregos, aparece uma lista com um visto nos empregos que você já concluiu.', 'At the Job Office, a list shows a check mark on the jobs you have completed.')]],
        penalties: [t('p', 'Se sair antes do 4º turno de trabalho, o emprego não entra na lista e as vantagens dele não continuam.', 'If you leave before the 4th shift, the job does not go on the list and its perks do not carry over.')],
        tips: [t('tip1', `Conta rápida: num emprego que paga 100 por turno de trabalho, os 4 primeiros rendem 140 cada, ou ${n(160)} a mais no total. Em geral, são 4 × 40% = 1,6 turno de pagamento extra por emprego novo.`, 'Quick math: at a job paying 100 per shift, the first 4 pay 140 each, or 160 more in total. In general that is 4 × 40% = 1.6 extra shifts of pay per new job.'), t('tip2', 'Escolha empregos com vantagem útil para as próximas 3 rodadas e saia logo depois de concluir, porque o tempo da vantagem já conta desde a conclusão.', 'Pick jobs whose perk helps over the next 3 rounds and leave right after completing them, since the perk\'s time already counts from completion.')],
      };
    },

    // ActionComboTraitEffect 0x18079BD50: counter % 3, WhiteList resets, roll 0..99 into 5/15/25/25/30; roll 20..44 adds 2 x the work XP (iVar7 * 2, RealmData.WorkExperienceAttribute), roll 45..69 adds 1 x the work Cash.
    role_workaholic: c => {
      const { t, n, art, h, lang } = c;
      return {
        summary: t('summary', 'Trabalhar várias vezes seguidas rende bônus extras.', 'Working several times in a row earns extra bonuses.'),
        steps: [
          t('s1', 'Trabalhe sem parar: a cada 3 turnos de trabalho seguidos (o 3º, o 6º, o 9º...), dispara um combo.', 'Keep working: every 3 shifts in a row (3rd, 6th, 9th...), a combo triggers.'),
          t('s2', 'O combo sorteia um bônus (tabela abaixo).', 'The combo draws a bonus (table below).'),
          t('s3', 'Qualquer outra ação zera a contagem. As únicas que não atrapalham são olhar a ficha do personagem, receber uma recompensa e terminar uma Missão.', 'Any other action resets the count. The only ones that do not interfere are looking at the character sheet, receiving a reward and finishing a quest.'),
        ],
        screen: [[art('Icon-Role-Workaholic'), t('sc1', 'O turno de trabalho que dispara o combo mostra o bônus junto do pagamento.', 'The shift that triggers the combo shows the bonus along with the pay.')]],
        blocks: [h.simpleTable([t('col chance', 'Chance', 'Chance'), t('col bonus', 'Bônus', 'Bonus')], [['30%', t('b1', `+${n(15)} de Felicidade`, `+${n(15)} Happiness`)], ['25%', t('b2', 'Dinheiro extra igual ao pagamento daquele turno de trabalho, somado ao pagamento normal (o turno rende 2 vezes)', 'Extra Cash equal to that shift\'s pay, on top of the normal pay (the shift pays 2 times)')], ['25%', t('b3', 'EXP de Trabalho extra igual ao dobro da que o emprego dá, somada à normal (o turno rende 3 vezes)', 'Extra Work XP equal to twice what the job gives, on top of the normal XP (the shift gives 3 times)')], ['15%', t('b4', 'Pausa para o cafezinho: conta como ter comido na rodada', 'Coffee break: counts as having eaten that round')], ['5%', t('b5', 'Todos os bônus acima juntos', 'All of the above together')]])],
        tips: [t('tip1', 'Conta rápida: o Dinheiro extra sai em 30% dos combos (25% sozinho mais 5% de "tudo junto") e vale 1 pagamento. Média de 0,3 pagamento por combo, ou cerca de 0,1 pagamento a mais por turno de trabalho: uns 10% de renda extra num emprego que paga bem.', 'Quick math: extra Cash comes in 30% of combos (25% alone plus 5% for "all together") and is worth 1 pay. That averages 0.3 pay per combo, or about 0.1 extra pay per shift: roughly 10% more income at a well-paying job.'), t('tip2', 'O cafezinho poupa a refeição da rodada, então trabalhe antes de gastar Tempo comendo.', 'The coffee break saves that round\'s meal, so work before spending Time eating.')],
        chainNote: t('chain note', 'Aqui "nível" é o nível de cargo do emprego (as abas da Agência de Empregos), e não o nível de EXP.', 'Here "level" is the job\'s rank level (the Job Office tabs), not the XP level.'),
      };
    },

    // Senior.OnTurnStarted (even rounds: 400 + _pensionBonus), IncreasePension (+20, flat, kept), AddRentReduction (+30, flat),
    // SeniorComplainTraitEffect.OnTurnStarted (rent due: RentToPayThisRound -= min(reduction, rent); ClearRentReduction); Senior-Walk-Slower Time x2; Senior-Work-Attributes 1.3.
    role_senior: c => {
      const { t, n, art, h, lang, act } = c;
      const complain = names => names.map(x => act(x)).filter(Boolean);
      return {
        summary: t('summary', 'Você anda e trabalha pior que os outros, mas recebe aposentadoria e ganha coisas reclamando pela cidade.', 'You walk and work worse than the others, but get a pension and earn things by complaining around town.'),
        steps: [
          t('s1', `Nas rodadas pares (2, 4, 6...) você recebe a aposentadoria no início do turno: ${n(400)} de Dinheiro, mais ${n(20)} por cada vez que você reclamou da aposentadoria. Não precisa fazer nada.`, `On even rounds (2, 4, 6...) you get your pension at the start of your turn: ${n(400)} Cash, plus ${n(20)} for each time you complained about the pension. Nothing to do.`),
          t('s2', `Use a ação Reclamar nos lugares da tabela. Cada lugar dá uma coisa diferente; toda reclamação custa ${n(c.cost(act('Senior Complain - Pension'), 'Time'))} de Tempo e só pode ser repetida a cada ${n(act('Senior Complain - Pension').Cooldown)} rodadas.`, `Use the Complain action at the places in the table. Each place gives something different; every complaint costs ${n(c.cost(act('Senior Complain - Pension'), 'Time'))} Time and can only be repeated every ${n(act('Senior Complain - Pension').Cooldown)} rounds.`),
          t('s3', `Reclamar da aposentadoria soma ${n(20)} de Dinheiro em todas as aposentadorias seguintes, para sempre, e cada reclamação acumula. (O texto do jogo escreve 20%, mas o código soma um valor fixo de 20.)`, `Complaining about the pension adds ${n(20)} Cash to every later pension, for good, and each complaint stacks.`),
          t('s4', `Reclamar do aluguel guarda ${n(30)} de desconto por reclamação, também valor fixo (o texto escreve 30%). No início do turno da rodada em que o aluguel vence, o desconto guardado é abatido do aluguel, até o limite do valor devido, e zera. Se o aluguel ainda não venceu, o desconto fica guardado. Vale para o próximo aluguel apenas.`, `Complaining about rent stores ${n(30)} of discount per complaint, also a flat value. At the start of your turn in the round rent is due, the stored discount is taken off the rent, up to the amount owed, and resets. If rent is not due yet, the discount stays stored. It applies to the next rent only.`),
        ],
        screen: [[art('Icon-Role-Senior-Complain'), t('sc1', 'Este é o ícone da ação Reclamar nos locais em que ela aparece.', 'This is the Complain action icon, at the places where it shows up.')], [art('Event-Pension'), t('sc2', 'Aviso de que a aposentadoria chegou.', 'Notice that your pension arrived.')]],
        notes: { 'Senior Complain - Pension': t('n1', `Soma ${n(20)} de Dinheiro em cada aposentadoria seguinte.`, `Adds ${n(20)} Cash to each later pension.`), 'Senior Complain - Rent': t('n2', `Guarda ${n(30)} de desconto para o próximo aluguel.`, `Stores ${n(30)} of discount for the next rent.`) },
        actions: ['Senior Complain - Pension', 'Senior Complain - Rent', 'Senior Complain - Food', 'Senior Complain - Health', 'Senior Complain - Happy', 'Senior Complain - Transport', 'Senior Complain - Gaming'],
        showWait: true,
        penalties: [t('p1', 'Andar custa o dobro de Tempo.', 'Walking costs double Time.'), t('p2', 'Trabalhar gasta 30% mais Felicidade, Saúde e Higiene.', 'Working costs 30% more Happiness, Health and Hygiene.')],
        tips: [
          t('tip1', 'Reclame da aposentadoria cedo. Reclamar na rodada r de uma partida de R rodadas rende 20 × (⌊R÷2⌋ − ⌊r÷2⌋) de Dinheiro, pagos aos poucos. Exemplo: em 30 rodadas, reclamar na rodada 2 rende 20 × 14 = 280, por 100 de Tempo.', 'Complain about the pension early. Complaining in round r of a game of R rounds earns 20 × (⌊R÷2⌋ − ⌊r÷2⌋) Cash, paid over time. Example: in 30 rounds, complaining in round 2 earns 20 × 14 = 280, for 100 Time.'),
          t('tip2', 'Como andar custa o dobro, agrupe o que for fazer no mesmo bairro. Reclamar do aluguel mais de uma vez antes do vencimento acumula: cada reclamação tira 30 do próximo aluguel, até o limite do valor devido.', 'Since walking costs double, group what you do in the same area. Complaining about rent more than once before it is due stacks: each complaint takes 30 off the next rent, up to the amount owed.'),
        ],
      };
    },

    // Hacker: PerformHackOfType (heat + HeatForHack capped at 100; TurnsRemaining = HackDuration 4), TickHackDurations (-1 at each turn end),
    // OnTurnEndedBegin (ResolveCatchChance on heat/100; caught: heat 0, HackQuestTracker cleared, LockHackedBuildingsForBust 1 round, hacked car removed; not caught: heat -5, HeatLoss),
    // TrackQuestHack (2nd hack of a type adds 1 to QuestObjectiveCount), RoleHackerHackComboQuestObjective (done when count >= Count).
    role_hacker: c => {
      const { t, n, h, lang, art, act, r } = c;
      const seen = new Set();
      const perHack = { 1: t('b1', '20% de desconto por invasão', '20% off per hack'), 2: t('b2', '20% de desconto por invasão', '20% off per hack'), 3: t('b3', '10% de desconto por invasão', '10% off per hack'), 4: t('b4', '10% de desconto por invasão', '10% off per hack'), 5: t('b5', '+1% na chance da loteria por invasão', '+1% lottery chance per hack'), 6: t('b6', '+10% de salário por invasão', '+10% salary per hack'), 7: t('b7', '+2% de juros no banco por invasão', '+2% bank interest per hack'), 8: `${t('b8', 'Baixa um carro:', 'Downloads a car:')} ${c.itemLink('Vexmobile')}` };
      const hacks = (r.HackableLocations || []).filter(x => { const a = h.deref(x.HackActionData); if (!a || !h.hasText(a) || seen.has(a._id)) return false; seen.add(a._id); return true; });
      const keys = r.HeatCurve.m_Curve;
      const chance = heat => { const u = Math.min(1, Math.max(0, (heat / 100 - keys[0].time) / (keys[1].time - keys[0].time))); return Math.round((3 * u * u - 2 * u * u * u) * 100); };
      const caught = h.table('ReportData').find(x => x.m_Name === 'Hacker - Caught');
      const hackCost = c.cost(act('Hack - Cluckers'), 'Time');
      return {
        summary: t('summary', 'Você invade sistemas pela cidade para ganhar bônus, arriscando ser pego.', 'You break into systems around town for bonuses, at the risk of being caught.'),
        steps: [
          t('s1', `Vá a um local da tabela e use a ação Hackear daquele lugar. Cada invasão custa ${n(hackCost)} de Tempo e cada ação só pode ser usada 1 vez por rodada.`, `Go to a place in the table and use its Hack action. Each hack costs ${n(hackCost)} Time and each action can be used once per round.`),
          t('s2', 'O bônus dura 4 rodadas: o contador começa em 4 e cai 1 no fim de cada turno seu, inclusive o da invasão. O contador é do tipo de invasão (todas as do mesmo tipo de lugar): invadir de novo soma 1 invasão ativa, até o máximo da tabela, e reinicia o contador em 4.', 'The bonus lasts 4 rounds: the counter starts at 4 and drops 1 at the end of each of your turns, including the hack turn. The counter belongs to the hack type (all hacks of the same kind of place): hacking again adds 1 active hack, up to the maximum in the table, and resets the counter to 4.'),
          t('s3', 'Cada invasão sobe a barra de suspeita, que vai de 0 a 100. Lugares diferentes sobem mais ou menos (tabela).', 'Each hack raises the suspicion bar, from 0 to 100. Different places raise it more or less (table).'),
          t('s4', `No fim do seu turno, o jogo sorteia se você foi pego, com a chance da tabela de acordo com a barra. Se você escapou, a barra cai ${n(5)} (ou zera, se estiver abaixo de 5).`, `At the end of your turn, the game rolls whether you were caught, with the chance in the table for the bar. If you got away, the bar drops ${n(5)} (or resets, if it is below 5).`),
        ],
        screen: [[art('Event-Role-Hacker-Evaded'), t('sc1', 'Não pegaram você: aviso de que escapou.', 'You got away: a notice that you escaped.')], [art('Event-Role-Hacker-Busted'), t('sc2', 'Pegaram você: aviso de flagrante.', 'You were caught: a busted notice.')]],
        blocks: [
          h.simpleTable([h.ui(lang, 'action'), h.ui(lang, 'location'), t('col bonus', 'O que dá', 'What it gives'), t('col heat', 'Sobe a suspeita em', 'Raises suspicion by'), t('col max', 'Invasões ativas ao mesmo tempo', 'Active hacks at once')], hacks.map(x => { const a = h.deref(x.HackActionData); return [h.title(lang, a), h.placesOf(lang, (x.Locations || []).map(h.deref).filter(l => l && l._slug)), perHack[x.Type] || '', x.HeatForHack, x.MaxHack]; })),
          '<h3>' + t('catch', 'Chance de ser pego', 'Chance of being caught') + '</h3>' + h.simpleTable([t('col bar', 'Barra de suspeita', 'Suspicion bar'), t('col chance', 'Chance no fim do turno', 'Chance at the end of the turn')], [10, 25, 50, 75, 100].map(x => [n(x), `${chance(x)}%`])),
        ],
        penalties: [
          t('p1', `Ao ser pego, o jogo cobra ${n(-h.sumAttr(caught.Rewards, 'Time'))} de Tempo e ${n(-h.sumAttr(caught.Rewards, 'Happy'))} de Felicidade.`, `When caught, the game charges ${n(-h.sumAttr(caught.Rewards, 'Time'))} Time and ${n(-h.sumAttr(caught.Rewards, 'Happy'))} Happiness.`),
          t('p2', 'Também ao ser pego: a barra de suspeita volta a 0, os lugares com invasão ativa ficam interditados para você por um tempo, o carro baixado é retirado de você e as invasões pela metade (uma só do tipo) são esquecidas. As outras invasões continuam contando seus 4 turnos, mas você só aproveita o bônus nos lugares que não estiverem interditados.', 'Also when caught: the suspicion bar goes back to 0, places with an active hack are locked for you for a while, the downloaded car is taken from you and half-done pairs (a single hack of a kind) are forgotten. The other hacks keep counting their 4 turns, but you can only use a bonus at places that are not locked.'),
        ],
        tips: [
          t('stack', 'O bônus é multiplicado pelas invasões ativas naquele tipo de lugar: 4 invasões no Clucker\'s dão 80% de desconto.', 'The bonus is multiplied by the active hacks of that kind of place: 4 hacks at Clucker\'s give 80% off.'),
          t('tip', `Hackeie pouco por vez: com a barra em 25, a chance é de ${chance(25)}% por turno; em 75, sobe para ${chance(75)}%. Se escapar, a barra só cai 5 por turno.`, `Hack a little at a time: with the bar at 25 the chance is ${chance(25)}% per turn; at 75 it rises to ${chance(75)}%. If you get away, the bar only drops 5 per turn.`),
        ],
        chainNote: t('chain note (TrackQuestHack, QuestObjectiveCount)', 'A Missão conta pares: cada vez que você faz a 2ª invasão de um mesmo tipo de lugar (os 8 tipos da tabela), soma 1. O jogo escreve "locais", mas é o tipo que conta, e o total é acumulado ao longo da partida: 2, 4, 6, 8 e 10 pares. Qualquer tipo pode ser repetido, inclusive depois que o bônus anterior acabou. Se você for pego, perde só os pares incompletos.', 'The quest counts pairs: each time you make the 2nd hack of the same kind of place (the 8 kinds in the table), it adds 1. The game says "places", but the kind is what counts, and the total builds up over the game: 2, 4, 6, 8 and 10 pairs. Any kind can be repeated, even after the earlier bonus ended. If you get caught you only lose incomplete pairs.'),
      };
    },

    // ActionDiscountTraitEffectForLocation: DiscountList ActionCount 3 -> x0.5, ActionCount 7 -> x0 on the Cash cost; the card restarts after the 8th (docs/engenharia-reversa.md);
    // ShopaholicRelaxRewardsOnFurniturePurchaseTraitEffect (Multiplier 3 on the furniture's own non-Cash Rewards, beds excluded); RoleHoarderPawnOncePerTurnTraitEffect.
    role_shopaholic: c => {
      const { t, n, h, lang, art, r } = c;
      const coupons = h.RAW['Gameplay.Traits.TraitEffectScripts.ActionDiscountTraitEffectForLocation'] || [];
      const places = [...new Set(coupons.flatMap(e => (e.LocationChambers || []).map(h.deref).filter(Boolean).flatMap(ch => h.locations.filter(l => (l.Chambers || []).some(x => x && x.id === ch._id)))))];
      return {
        summary: t('summary', 'Comprar sempre nos mesmos lugares rende descontos, e cada móvel novo dá os bônus dele na hora.', 'Buying at the same places earns discounts, and each new piece of furniture gives its bonuses right away.'),
        steps: [
          t('s1', `Cada lugar com desconto tem seu próprio cartão de compras, que aparece quando você entra para comprar. Lugares: ${h.placesOf(lang, places)}.`, `Each place with a discount has its own shopping card, shown when you go in to buy. Places: ${h.placesOf(lang, places)}.`),
          t('s2', 'Cada compra com Dinheiro naquele lugar avança o cartão dele.', 'Each purchase with Cash at that place advances its card.'),
          t('s3', 'No cartão: as compras 1 a 3 saem pelo preço normal, a 4ª sai pela metade do preço, as compras 5 a 7 voltam ao normal e a 8ª sai de graça. Só depois da 8ª o cartão recomeça do zero. O desconto vale apenas na compra em que é aplicado.', 'On the card: purchases 1 to 3 cost the normal price, the 4th is half price, purchases 5 to 7 go back to normal and the 8th is free. Only after the 8th does the card start over. A discount applies only to the purchase where it is used.'),
          t('s4', 'Ao comprar um móvel que não seja cama, você recebe na hora os bônus dele multiplicados por 3 (o preço não entra na conta).', 'When you buy furniture other than a bed, you instantly get its bonuses multiplied by 3 (the price does not count).'),
        ],
        screen: [[art('Icon-Role-Hoarder'), t('sc1', 'Ao entrar numa loja com desconto, aparece um cartão com o progresso das suas compras naquele lugar.', 'On entering a shop with a discount, a card shows your purchase progress at that place.')]],
        penalties: [t('p', 'Você só pode penhorar um móvel por rodada.', 'You can only pawn one piece of furniture per round.')],
        tips: [t('tip', 'Concentre as compras num lugar só. Em cada ciclo de 8 compras de mesmo preço, o cartão poupa 1,5 compra: 18,75% do gasto do ciclo. A 4ª e a 8ª valem mais em itens caros, como móveis.', 'Concentrate purchases in one place. In each cycle of 8 purchases at the same price, the card saves 1.5 purchases: 18.75% of the cycle\'s spending. The 4th and 8th are worth more on expensive things, like furniture.')],
      };
    },

    // Mystic.OnTurnStarted, BuildShuffledDestinies; Role-Mystic-* trait effects; Quest-Mystic-<sign> objectives. See `mystic()` below.
    role_mystic: c => mystic(c),

    // Scavenger.Locations (ArtifactChance, ArtifactGuarantee, ArtifactsRequired, WeightedRewardAction), TryFindArtifact, Scavenge actions.
    role_scavenger: c => {
      const { t, n, h, lang, art, r, act } = c;
      const scav = act('Scavenge - Park');
      const car = act('Scavenger - Assemble Car'), dino = act('Scavenger - Assemble Dinosaur');
      const first = r.Locations[0];
      const sure = first.ArtifactGuarantee + 1; // TryFindArtifact: certain once ScavengeCount (starts at 0, +1 per miss) reaches ArtifactGuarantee
      // Expected searches until the artifact drops: chance p each search, guaranteed on search g.
      const expected = (p, g) => { let e = 0; for (let k = 1; k < g; k++) e += k * p * Math.pow(1 - p, k - 1); return e + g * Math.pow(1 - p, g - 1); };
      const placeOf = loc => { const room = h.deref(loc.ChamberInfo); return room ? [...new Set((h.chamberLocations.get(room._id) || []).map(p => h.titleText(lang, p)))].join(', ') : ''; };
      const poolRows = r.Locations.map(loc => {
        const pool = h.deref(loc.WeightedRewardAction);
        const total = (pool ? pool.WeightedRewards : []).reduce((s, w) => s + w.Weight, 0);
        const grouped = new Map();
        for (const w of (pool ? pool.WeightedRewards : [])) { const it = h.byId.get(w.Reward.RewardEntries[0].Id); if (!it) continue; const k = h.titleText(lang, it); const g = grouped.get(k) || { it, pct: 0 }; g.pct += w.Weight / total * 100; grouped.set(k, g); }
        const things = [...grouped.values()].sort((a, b) => b.pct - a.pct);
        const art_ = h.deref(loc.Artifact), room = h.deref(loc.ChamberInfo);
        const spots = room ? (h.chamberLocations.get(room._id) || []) : [];
        return [h.placesOf(lang, spots), things.map(x => `${h.itemIcon(x.it, 20)}${h.link(lang, x.it, h.title(lang, x.it))} ${n(Math.round(x.pct))}%${x.it.SellValue ? ` <span class="muted">(${n(x.it.SellValue)})</span>` : ''}`).join(', '), art_ ? `${h.itemIcon(art_, 20)}${h.link(lang, art_, h.title(lang, art_))}` : ''];
      });
      const car_ = c.itemOf('Vexmobile'), bone = c.itemOf('Dinosaur Bone 1'), piece = c.itemOf('Piece of Car'), skel = c.itemOf('Special Furniture Dinosaur Skeleton');
      const needCar = ((car.RequiredItems || [])[0] || {}).Value, needBone = ((dino.RequiredItems || [])[0] || {}).Value;
      return {
        summary: t('summary', 'Você vasculha a cidade atrás de itens e artefatos, que liberam novos lugares.', 'You scavenge the town for items and artifacts, which unlock new places.'),
        steps: [
          t('s1', `Vá a um local liberado e use Vasculhar. Cada busca custa ${n(c.cost(scav, 'Time'))} de Tempo, ${n(c.cost(scav, 'Happy'))} de Felicidade, ${n(c.cost(scav, 'Health'))} de Saúde e ${n(c.cost(scav, 'Hygiene'))} de Higiene, e só pode ser feita 1 vez por rodada em cada local. Dá um item sorteado daquele lugar (tabela "O que cada lugar sorteia").`, `Go to an unlocked place and use Scavenge. Each search costs ${n(c.cost(scav, 'Time'))} Time, ${n(c.cost(scav, 'Happy'))} Happiness, ${n(c.cost(scav, 'Health'))} Health and ${n(c.cost(scav, 'Hygiene'))} Hygiene, and can only be done once per round at each place. It gives a random item from that place (table "What each place draws").`),
          t('s2', 'Em cada busca, o jogo também tenta o artefato do local; se sair, ele vem no lugar do item. A chance e a busca em que ele sai de qualquer jeito estão na tabela de artefatos.', 'On each search the game also tries for that place\'s artifact; if it drops, you get it instead of the item. The chance and the search on which it drops for sure are in the artifacts table.'),
          t('s3', 'Cada artefato encontrado conta para liberar novos locais. A tabela de artefatos mostra quantos cada um pede: os dois primeiros lugares da lista (sem artefato exigido) já estão liberados no início.', 'Each artifact found counts toward unlocking new places. The artifacts table shows how many each one needs: the first two places (no artifact required) are open from the start.'),
          t('s4', `Com ${h.titleText(lang, piece)} ×${n(needCar)}, use ${h.titleText(lang, car)} (${n(c.cost(car, 'Time'))} de Tempo) e receba ${car_ ? h.titleText(lang, car_) : ''}, um carro que reduz o Tempo de andar. Com ${h.titleText(lang, bone)} ×${n(needBone)}, use ${h.titleText(lang, dino)} (${n(c.cost(dino, 'Time'))} de Tempo) e receba ${skel ? h.titleText(lang, skel) : ''}, um móvel especial.`, `With ${h.titleText(lang, piece)} ×${n(needCar)}, use ${h.titleText(lang, car)} (${n(c.cost(car, 'Time'))} Time) and get ${car_ ? h.titleText(lang, car_) : ''}, a car that cuts walking Time. With ${h.titleText(lang, bone)} ×${n(needBone)}, use ${h.titleText(lang, dino)} (${n(c.cost(dino, 'Time'))} Time) and get ${skel ? h.titleText(lang, skel) : ''}, a special piece of furniture.`),
        ],
        screen: [[art('Icon-Role-Scavenger-Scavenge'), t('sc1', 'Ícone da ação Vasculhar nos locais liberados.', 'Scavenge action icon at unlocked places.')]],
        blocks: [
          '<h3>' + t('pools', 'O que cada lugar sorteia', 'What each place draws') + '</h3><p>' + t('pools note (Scavenge Pool - X, WeightedRewards)', 'Chance de cada item em uma busca; o número entre parênteses é quanto o item vale na Casa de Penhores.', 'Chance of each item on one search; the number in parentheses is what the item sells for at the Pawn Shop.') + '</p>' + h.simpleTable([h.ui(lang, 'location'), t('col items', 'Itens', 'Items'), t('col artifact', 'Artefato do lugar', 'Place artifact')], poolRows),
        ],
        actions: ['Scavenger - Assemble Car', 'Scavenger - Assemble Dinosaur'],
        showWait: true,
        own: ['Piece of Car', 'Vexmobile', 'Dinosaur Bone 1', 'Scrap 1'],
        tips: [t('tip', `No primeiro local, a chance é de ${Math.round(first.ArtifactChance * 100)}% por busca, mas o artefato sai com certeza na busca ${n(sure)}. Como cada local deixa vasculhar 1 vez por rodada, garantir o artefato dali leva ${n(sure)} rodadas e ${n(sure * c.cost(scav, 'Time'))} de Tempo. Comece por aí para liberar os outros.`, `At the first place the chance is ${Math.round(first.ArtifactChance * 100)}% per search, but the artifact is guaranteed by search ${n(sure)}. Since each place allows one search per round, guaranteeing its artifact takes ${n(sure)} rounds and ${n(sure * c.cost(scav, 'Time'))} Time. Start there to unlock the others.`)],
        artifactsTable: true,
      };
    },

    // Adventurer.OnTurnStarted (round % 3 == 1, Interval 3), BaseLevelExp 4, MaxLevel 9, GiveExp (AdventurerGiveExpOnQuestComplete: max(QuestComponent.Tier, 1)),
    // AdventurerGiveItemForQuestOnLevelTraitEffect (Tier 1/2/3 -> Coins/Gold/Gems), LevelUpRewards.
    role_adventurer: c => {
      const { t, n, h, lang, art, r, act } = c;
      const done = act('Complete Adventurer Quest');
      const bag = name => c.itemLink(name, 20);
      const total = [1, 2, 3, 4, 5, 6, 7, 8].reduce((s, l) => s + l + 3, 0);
      const levels = [['Easy', 'Bag of Coins', 'Complete-Adventurer-Quest'], ['Medium', 'Bag of Gold', 'Complete-Adventurer-Quest Medium'], ['Hard', 'Bag of Gems', 'Complete-Adventurer-Quest Hard']];
      const lvlName = { Easy: t('easy', 'Fácil', 'Easy'), Medium: t('med', 'Média', 'Medium'), Hard: t('hard', 'Difícil', 'Hard') };
      const pays = levels.map(([k, bagName, qn], i) => { const q = h.RAW['Gameplay.Quests.Quest'].find(x => x.m_Name === qn); const cash = h.sumAttr(q.Rewards, 'Cash'); return [lvlName[k], n(cash), bag(bagName), c.sell(c.itemOf(bagName)), String(i + 1)]; });
      const chainRows = levels.flatMap(([k]) => {
        const a = act(`Adventurer Quest ${k}`);
        return (a.WeightedRewards || []).map(w => h.byId.get(w.Reward.RewardEntries[0].Id)).filter(Boolean).map(ch => {
          const list = (ch.Quests || []).map(h.deref).filter(Boolean);
          const steps = list.map(q => Object.values(q.references || {}).map(o => (o.Term && h.TEXT.en.has(o.Term) ? h.gameText(lang, o.Term).replace(/\{[^}]*\}/g, '') : '')).filter(Boolean).join('; ')).filter(Boolean).join(' → ');
          const pts = list.reduce((s, q) => s + (q.Rewards.RewardEntries.find(e => e.Type === 95) || { Value: 0 }).Value, 0); // Complete-Adventurer-Quest, last step of every adventure
          return [lvlName[k], ch._slug ? h.link(lang, ch, h.title(lang, ch)) : h.title(lang, ch), steps, n(pts)];
        });
      });
      const gain = new Map(r.LevelUpRewards.map(l => [l.Level, l]));
      const wander = lvl => { const tr = (gain.get(lvl).AddTraits || []).map(h.deref)[0]; return tr; };
      const perform = act('Perform for Animals');
      const levelRows = [[1, t('l1', 'Começa aqui', 'You start here'), '-']];
      for (let lvl = 2; lvl <= 9; lvl++) {
        const g = gain.get(lvl);
        const bits = [];
        for (const tr of (g.AddTraits || []).map(h.deref).filter(Boolean)) {
          if (/Wanderlust/.test(tr.m_Name)) bits.push(`<strong>${h.title(lang, tr)}</strong>: ${tr.m_Name.endsWith('II') ? t('w2', 'andar gasta 6% menos Tempo (no lugar do bônus anterior)', 'walking costs 6% less Time (replaces the previous bonus)') : t('w1', 'andar gasta 3% menos Tempo', 'walking costs 3% less Time')}`);
          else if (/Bard-I$/.test(tr.m_Name)) bits.push(`<strong>${h.title(lang, tr)}</strong>: ${t('b1', `libera a ação ${h.titleText(lang, perform)} (${h.placesOf(lang, h.actionWhere(perform))}): ${n(c.cost(perform, 'Time'))} de Tempo para ganhar ${n(h.sumAttr(perform.Rewards, 'Cash'))} de Dinheiro e ${n(h.sumAttr(perform.Rewards, 'Happy'))} de Felicidade, ${c.wait(perform).toLowerCase()}`, `unlocks the action ${h.titleText(lang, perform)} (${h.placesOf(lang, h.actionWhere(perform))}): ${n(c.cost(perform, 'Time'))} Time for ${n(h.sumAttr(perform.Rewards, 'Cash'))} Cash and ${n(h.sumAttr(perform.Rewards, 'Happy'))} Happiness, ${c.wait(perform).toLowerCase()}`)}`);
          else if (/Bard-II$/.test(tr.m_Name)) bits.push(`<strong>${h.title(lang, tr)}</strong>: ${t('b2', `a Felicidade de ${h.titleText(lang, perform)} dobra (${n(h.sumAttr(perform.Rewards, 'Happy') * 2)})`, `the Happiness from ${h.titleText(lang, perform)} doubles (${n(h.sumAttr(perform.Rewards, 'Happy') * 2)})`)}`);
          else bits.push(`<strong>${h.title(lang, tr)}</strong>`);
        }
        for (const a of (g.AttributeRewards || [])) { const at = h.deref(a.Attribute); if (at) bits.push(`+${n(a.Value)} ${h.titleText(lang, at)}`); }
        for (const it of (g.ItemRewards || []).map(h.deref).filter(Boolean)) bits.push(`${h.itemIcon(it, 20)}${h.link(lang, it, h.title(lang, it))} <span class="muted">(${c.sell(it)})</span>`);
        levelRows.push([lvl, n(lvl - 1 + 3), bits.join('<br>')]);
      }
      return {
        summary: t('summary', 'Você recebe Missões próprias de aventura, ganha sacos de tesouro e sobe de nível, liberando características.', 'You get your own adventure quests, earn treasure bags and level up, unlocking traits.'),
        steps: [
          t('s1', 'Na rodada 1 e depois a cada 3 rodadas (4, 7, 10...), você recebe uma Missão de aventura nova. A dificuldade (fácil, média ou difícil) acompanha o seu nível de aventureiro.', 'On round 1 and then every 3 rounds (4, 7, 10...), you get a new adventure quest. Its difficulty (easy, medium or hard) follows your adventurer level.'),
          t('s2', `Cumpra os passos da Missão (tabela de aventuras) e, no fim, use ${h.titleText(lang, done)} (${h.placesOf(lang, h.actionWhere(done))}), que custa ${n(c.cost(done, 'Time'))} de Tempo. É aí que sai a recompensa.`, `Do the quest steps (adventures table) and, at the end, use ${h.titleText(lang, done)} (${h.placesOf(lang, h.actionWhere(done))}), which costs ${n(c.cost(done, 'Time'))} Time. That is where the reward comes out.`),
          t('s3', 'A recompensa depende da dificuldade: Dinheiro, pontos e um saco de tesouro (tabela "O que cada Missão paga").', 'The reward depends on difficulty: Cash, points and a treasure bag (table "What each quest pays").'),
          t('s4', `Cada Missão concluída dá EXP de aventureiro igual ao nível dela (1 fácil, 2 média, 3 difícil, nunca menos que 1). Para subir de nível você precisa do nível atual + 3 de EXP: 4 no nível 1, 5 no 2, e assim por diante, até o nível ${n(9)}.`, `Each quest finished gives adventurer XP equal to its level (1 easy, 2 medium, 3 hard, never less than 1). To level up you need your current level + 3 XP: 4 at level 1, 5 at 2, and so on, up to level ${n(9)}.`),
        ],
        screen: [[art('Icon-Trait-Compass-Tier-2'), t('sc1', 'A bússola e a barra de experiência mostram sua EXP e a dificuldade das Missões.', 'The compass and experience bar show your XP and quest difficulty.')]],
        blocks: [
          '<h3>' + t('pays', 'O que cada Missão paga', 'What each quest pays') + '</h3>' + h.simpleTable([t('col diff', 'Dificuldade', 'Difficulty'), h.attrName(lang, 'Cash'), t('col bag', 'Saco de tesouro', 'Treasure bag'), t('col sell', 'Vende por', 'Sells for'), t('col exp', 'EXP de aventureiro', 'Adventurer XP')], pays),
          '<h3>' + t('chains', 'As aventuras', 'The adventures') + '</h3><p>' + t('chains note (Adventurer Quest Easy/Medium/Hard, WeightedRewards)', 'Cada vez, o jogo sorteia uma aventura da dificuldade atual (chance igual entre as da mesma dificuldade). Os passos são os do jogo; a Missão sempre termina com Concluir Missão no Parque, e é essa etapa final que dá os pontos.', 'Each time, the game draws one adventure of the current difficulty (equal odds among those of the same difficulty). The steps are the game\'s; the quest always ends with Complete Quest at the Park, and that final step is what gives the points.') + '</p>' + h.simpleTable([t('col diff', 'Dificuldade', 'Difficulty'), t('col adv', 'Aventura', 'Adventure'), t('col steps', 'Passos', 'Steps'), t('col pts', 'Pontos', 'Points')], chainRows),
        ],
        levels: { head: [h.ui(lang, 'level'), t('col need', 'EXP para chegar a este nível', 'XP to reach this level'), t('col got', 'O que você ganha', 'What you get')], rows: levelRows },
        actions: ['Perform for Animals'],
        whereNote: { 'Perform for Animals': t('animals where', 'a partir do nível 4', 'from level 4') },
        own: ['Bag of Coins', 'Bag of Gold', 'Bag of Gems'],
        tips: [t('tip', `Do nível 1 ao ${n(9)} são ${n(total)} de EXP no total. Numa partida de R rodadas você recebe ⌊(R − 1) ÷ 3⌋ + 1 Missões (30 rodadas: 10 Missões), então não ignore nenhuma: a EXP só vem de Missões que dão pontos. As difíceis rendem 3 de EXP e o saco mais caro (${c.sell(c.itemOf('Bag of Gems'))}).`, `From level 1 to ${n(9)} it takes ${n(total)} XP in total. In a game of R rounds you get ⌊(R − 1) ÷ 3⌋ + 1 quests (30 rounds: 10 quests), so do not skip any: XP only comes from quests that give points. Hard ones give 3 XP and the priciest bag (${c.sell(c.itemOf('Bag of Gems'))}).`)],
      };
    },
  };

  // Mystic: sign bonus and destiny (what to do to follow it), both read from the Role-Mystic-<sign> traits and Quest-Mystic-<sign> objectives.
  function mystic(c) {
    const { t, n, h, lang, art, act } = c;
    const names = list => list.map(x => act(x)).filter(a => a && h.hasText(a)).map(a => h.titleText(lang, a));
    const list_ = list => list.join(', ');
    const join = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')} ${lang === 'pt-BR' ? 'e' : 'and'} ${list[list.length - 1]}` : list.join(''));
    const fishing = act('Go Fishing');
    const fishTotal = fishing.WeightedRewards.reduce((s, w) => s + w.Weight, 0);
    const fishRare = 5 * 10;
    const libraPlaces = h.placesOf(lang, [...new Set(['Furniture Counter 1', 'Appliances Counter'].flatMap(cn => { const ch = h.table('LocationChamberData').find(x => x.m_Name === cn); return ch ? (h.chamberLocations.get(ch._id) || []) : []; }))]);
    const rows = {
      Aries: [t('a-b', 'Trabalhar dá 50% mais Dinheiro e 50% mais EXP de Trabalho.', 'Working gives 50% more Cash and 50% more Work XP.'), t('a-d', 'Trabalhe 5 vezes (5 turnos de trabalho).', 'Work 5 times (5 shifts).')],
      Taurus: [t('t-b', `Dormir rende o dobro, e ioga, massagem, banheira de hidromassagem e beiço reduzem o dobro de Estresse. Dormir dá ainda +150 de Saúde; ioga, massagem e beiço também dão +150 de Saúde.`, 'Sleeping gives double, and yoga, massage, jacuzzi and sulking lower double Stress. Sleeping also gives +150 Health; yoga, massage and sulking also give +150 Health.'), t('t-d', `Faça uma destas: ${list_(names(['Sleep (Ends Turn)', 'Yoga', 'Use Massage Chair', 'Bathe in Jacuzzi', 'Sulk']))}.`, `Do one of these: ${list_(names(['Sleep (Ends Turn)', 'Yoga', 'Use Massage Chair', 'Bathe in Jacuzzi', 'Sulk']))}.`)],
      Gemini: [t('g-b', `As 5 atividades do Parque dão 50% mais Saúde, Felicidade e Higiene: ${join(names(['Touch Grass', 'Go For A Walk', 'Feed The Crows', 'Bathe in pond', 'Move Big Rock']))}.`, `The 5 Park activities give 50% more Health, Happiness and Hygiene: ${join(names(['Touch Grass', 'Go For A Walk', 'Feed The Crows', 'Bathe in pond', 'Move Big Rock']))}.`), t('g-d', 'Faça qualquer uma dessas 5 atividades do Parque.', 'Do any of those 5 Park activities.')],
      Cancer: [t('c-b', `${join(names(['Work Out', 'Yoga', 'Let it Burn']))} dão 50% mais Saúde e Felicidade.`, `${join(names(['Work Out', 'Yoga', 'Let it Burn']))} give 50% more Health and Happiness.`), t('c-d', `Faça uma destas: ${list_(names(['Work Out', 'Yoga', 'Let it Burn']))}.`, `Do one of these: ${list_(names(['Work Out', 'Yoga', 'Let it Burn']))}.`)],
      Leo: [t('l-b', 'A matrícula nos cursos custa 50% menos.', 'Course enrollment costs 50% less.'), t('l-d', 'Estude 1 vez (qualquer curso).', 'Study once (any course).')],
      Virgo: [t('v-b', '+9 pontos percentuais na chance de cada bilhete da loteria (a base é 3%, então vai a 12%).', '+9 percentage points on each lottery ticket\'s chance (the base is 3%, so it goes to 12%).'), t('v-d', 'Compre um bilhete de loteria.', 'Buy a lottery ticket.')],
      Libra: [t('li-b', `30% de desconto nos móveis e eletrodomésticos. Vale em: ${libraPlaces}.`, `30% off furniture and appliances. Applies at: ${libraPlaces}.`), t('li-d', 'Compre qualquer móvel.', 'Buy any piece of furniture.')],
      Scorpio: [t('s-b', 'Andar gasta 30% menos Tempo.', 'Walking costs 30% less Time.'), t('s-d', 'Ande 25 quadras (cada quadra andada conta 1).', 'Walk 25 blocks (each block walked counts 1).')],
      Sagittarius: [t('sa-b', 'As Missões pagam o dobro de Dinheiro.', 'Quests pay double Cash.'), t('sa-d', 'Conclua uma Missão (Concluir Missão fácil, média ou difícil).', 'Finish a quest (Finish Quest easy, medium or hard).')],
      Capricorn: [t('cp-b', 'Descansar em casa e dormir rendem 50% mais.', 'Relaxing at home and sleeping give 50% more.'), t('cp-d', 'Durma ou descanse em casa.', 'Sleep or relax at home.')],
      Aquarius: [t('aq-b', 'Cada ponto de Higiene ganho ao se lavar também dá meio ponto de Felicidade.', 'Each Hygiene point gained while washing also gives half a Happiness point.'), t('aq-d', 'Lave as mãos, tome banho ou use o chuveiro (7 ações de higiene contam).', 'Wash your hands, bathe or use the shower (7 hygiene actions count).')],
      Pisces: [t('p-b', `Em Pescar (vara básica), 5 peixes raros entram no sorteio com peso 10 cada: cerca de ${n(Math.round(fishRare / (fishTotal + fishRare) * 100))}% das pescarias (${n(fishRare)} de ${n(fishTotal + fishRare)}) dão um peixe raro.`, `On Go Fishing (basic rod), 5 rare fish join the draw with weight 10 each: about ${n(Math.round(fishRare / (fishTotal + fishRare) * 100))}% of catches (${n(fishRare)} of ${n(fishTotal + fishRare)}) are a rare fish.`), t('p-d', 'Pesque (qualquer vara).', 'Go fishing (any rod).')],
    };
    const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    const traits = h.RAW['Gameplay.Traits.Trait'] || [];
    const destinyQuest = sign => (h.RAW['Gameplay.Quests.Quest'] || []).find(q => q.m_Name === `Quest-Mystic-${sign}`);
    const seeQuest = t('see quest', 'Ver Missão', 'See quest');
    const table = signs.map(sign => { const tr = traits.find(x => x.m_Name === `Role-Mystic-${sign}`), q = destinyQuest(sign); return [`${art(`MysticWidget-${sign}`, 32)} ${tr && h.hasText(tr) ? h.title(lang, tr) : h.esc(sign)}`, rows[sign][0], `${rows[sign][1]}${q && q._slug ? ` ${h.link(lang, q, seeQuest)}` : ''}`]; });
    return {
      summary: t('summary', 'A cada rodada você tem um signo, que age como uma característica e dá um bônus, e pede um destino. Cumprir destinos rende pontos.', 'Each round you have a sign, which acts as a trait and gives a bonus, and asks for a destiny. Fulfilling destinies earns points.'),
      steps: [
        t('s1', 'No início da rodada, a roda do zodíaco mostra seu signo. A ordem dos signos é embaralhada, e a característica do signo troca a cada rodada.', 'At the start of the round, the zodiac wheel shows your sign. The order of the signs is shuffled, and the sign\'s trait changes each round.'),
        t('s2', 'Aproveite o bônus do signo durante aquela rodada (tabela abaixo).', 'Use the sign\'s bonus during that round (table below).'),
        t('s3', 'Cumpra o destino do signo, que é uma ação simples descrita na tabela. Cada destino cumprido conta para as Missões do papel.', 'Fulfill the sign\'s destiny, which is a simple action described in the table. Each destiny fulfilled counts toward the role quests.'),
      ],
      screen: [[art('Report-Role-Zodiac-Aries'), t('sc1', 'Aviso que mostra o signo da rodada.', 'Notice showing the sign of the round.')], [art('MysticWidget-Aries'), t('sc2', 'Ícone do signo na roda.', 'Sign icon on the wheel.')]],
      blocks: [h.simpleTable([t('col sign', 'Signo', 'Sign'), t('col fx', 'Bônus na rodada', 'Bonus for the round'), t('col dest', 'Destino (o que fazer)', 'Destiny (what to do)')], table), '<p>' + t('destiny no points (Quest-Mystic-<sign>.Rewards empty, RoleMysticFulfillDestinyQuestObjective)', 'Cumprir um destino não dá pontos por si: ele só conta para as Missões do papel, logo abaixo.', 'Fulfilling a destiny gives no points by itself: it only counts toward the role quests, right below.') + '</p>'],
      tips: [t('tip', 'Planeje a rodada pelo signo: em Áries, trabalhe (5 turnos de trabalho com 50% a mais); em Libra, compre um móvel com 30% de desconto; em Leão, matricule-se pela metade do preço. Para a Missão de 15 destinos, conte com cerca de 1 destino por rodada: são 15 rodadas só nisso.', 'Plan the round around the sign: on Aries, work (5 shifts with 50% more); on Libra, buy a piece of furniture at 30% off; on Leo, enroll at half price. For the 15-destiny quest, count on about 1 destiny per round: that is 15 rounds just for it.')],
    };
  }

  // ------------------------------------------------------------------ renderer
  function roleGuide(lang, r) {
    const spec = ROLE_PLAY[r.Term];
    if (!spec) return '';
    const c = ctx(lang, r);
    const { h, t } = c;
    const g = spec(c);
    let out = `<h2>${t('title', 'Como jogar', 'How to play')}</h2><p>${g.summary}</p><ol class="plain">${g.steps.map(x => `<li>${x}</li>`).join('')}</ol>`;
    if (g.screen) out += `<h3>${t('screen', 'O que aparece na tela', 'What shows on screen')}</h3><ul class="plain">${g.screen.map(([a, x]) => `<li>${a} ${x}</li>`).join('')}</ul>`;
    for (const b of g.blocks || []) out += b;
    const acts = (g.actions || []).map(x => h.table('ChamberActionData').find(a => a.m_Name === x)).filter(a => a && h.hasText(a));
    if (acts.length) {
      const heads = [h.ui(lang, 'action'), h.ui(lang, 'effects'), ...(g.showWait ? [t('col wait', 'Espera', 'Wait')] : []), h.ui(lang, 'location')];
      out += `<h3>${t('actions', 'Ações exclusivas', 'Exclusive actions')}</h3>${h.simpleTable(heads, acts.map(a => {
        const base = h.placesOf(lang, h.actionWhere(a).length ? h.actionWhere(a) : h.complaintPlaces(a));
        const where = base ? (g.whereNote && g.whereNote[a.m_Name] ? `${base} (${g.whereNote[a.m_Name]})` : base) : (g.where && g.where[a.m_Name]) || t('anywhere', 'Em qualquer lugar', 'Anywhere');
        return [`${h.artIcon('action', a, 28)}${h.title(lang, a)}`, `${h.effects(lang, a.Rewards.RewardEntries) || ''}${g.notes && g.notes[a.m_Name] ? `<p>${g.notes[a.m_Name]}</p>` : ''}`, ...(g.showWait ? [c.wait(a) || t('no wait', 'Sem espera', 'No wait')] : []), where];
      }))}`;
    }
    if (g.levels) out += `<h3>${t('levels', 'Níveis do aventureiro', 'Adventurer levels')}</h3>${h.simpleTable(g.levels.head, g.levels.rows)}`;
    if (g.artifactsTable) out += artifactsTable(c);
    const qs = questRows(c);
    if (qs.length && r.Term !== 'role_hacker') out += `<h3>${t('chain', 'Missões do papel', 'Role quests')}</h3>${g.chainNote ? `<p>${g.chainNote}</p>` : ''}${h.simpleTable([h.ui(lang, 'quests'), t('col goal', 'Objetivo', 'Goal'), t('col pts', 'Pontos', 'Points')], qs.map(q => [q.stepLink, q.goal, c.n(q.pts)]))}`;
    if (qs.length && r.Term === 'role_hacker') out += `<h3>${t('chain', 'Missões do papel', 'Role quests')}</h3><p>${g.chainNote}</p>${h.simpleTable([h.ui(lang, 'quests'), t('col goal', 'O que o jogo escreve', 'What the game says'), t('col pairs', 'Pares de invasões', 'Pairs of hacks'), t('col pts', 'Pontos', 'Points')], qs.map(q => [q.stepLink, q.goal, c.n(q.count), c.n(q.pts)]))}`;
    if (g.penalties) out += `<h3>${t('penalties', 'Limites e punições', 'Limits and penalties')}</h3>${c.list(g.penalties)}`;
    const own = (g.own || []).map(x => c.itemOf(x)).filter(Boolean);
    if (own.length) out += `<h3>${t('own', 'Itens do papel', 'Role items')}</h3><p>${own.map(i => `${h.itemIcon(i, 24)}${h.link(lang, i, h.title(lang, i))}${i.SellValue ? ` <span class="muted">(${c.sell(i)})</span>` : ''}`).join(', ')}</p>`;
    if (g.tips) out += `<h3>${t('tips', 'Dicas', 'Tips')}</h3>${c.list(g.tips)}`;
    return out;
  }

  // Scavenger: where each artifact comes from and what it sells for.
  function artifactsTable(c) {
    const { h, lang, r, t, n } = c;
    const rows = r.Locations.filter(l => h.deref(l.Artifact)).map(l => {
      const a = h.deref(l.Artifact), room = h.deref(l.ChamberInfo);
      const seen = new Set();
      const places = (room ? h.chamberLocations.get(room._id) || [] : []).filter(p => { const name = h.titleText(lang, p); return seen.has(name) ? false : seen.add(name); }).map(p => h.link(lang, p, h.title(lang, p))).join(', ');
      const sell = a.SellValue ? n(a.SellValue) : '';
      const p = l.ArtifactChance, g = l.ArtifactGuarantee + 1; // certain on search Guarantee + 1 (TryFindArtifact)
      let e = 0; for (let k = 1; k < g; k++) e += k * p * Math.pow(1 - p, k - 1); e += g * Math.pow(1 - p, g - 1);
      const scavTime = -h.sumAttr(h.table('ChamberActionData').find(x => x.m_Name === 'Scavenge - Park').Rewards, 'Time');
      return `<tr><td>${h.itemIcon(a, 28)}${h.link(lang, a, h.title(lang, a))}</td><td>${places}</td><td class="n">${Math.round(l.ArtifactChance * 100)}%</td><td class="n">${g}</td><td class="n">${l.ArtifactsRequired}</td><td class="n">${sell}</td><td class="n">${n(Math.round(e * 10) / 10)}</td><td class="n">${n(Math.round(e * scavTime))}</td></tr>`;
    }).join('');
    return `<h3>${h.ui(lang, 'artifacts')}</h3><div class="scroll"><table><thead><tr><th>${h.ui(lang, 'name')}</th><th>${h.ui(lang, 'location')}</th><th class="n">${h.ui(lang, 'chance')}</th><th class="n">${t('col guarantee (ArtifactGuarantee)', 'Certo na busca', 'Sure by search')}</th><th class="n">${t('col required (ArtifactsRequired)', 'Artefatos para liberar', 'Artifacts to unlock')}</th><th class="n">${t('col sell (ItemData.SellValue)', 'Vende por', 'Sells for')}</th><th class="n">${t('col avg (expected searches)', 'Buscas em média', 'Searches on average')}</th><th class="n">${t('col avgtime (expected searches x Scavenge Time)', 'Tempo em média', 'Time on average')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  return {
    cultistGuide,
    roleGuide: (lang, r) => (r.Term === 'role_cultist' ? cultistGuide(lang, r) : roleGuide(lang, r)),
    hasGuide: r => r.Term === 'role_cultist' || Boolean(ROLE_PLAY[r.Term]),
    // Pages that draw level rewards and artifacts themselves.
    ownsSections: r => Boolean(ROLE_PLAY[r.Term]) || r.Term === 'role_cultist',
  };
};
