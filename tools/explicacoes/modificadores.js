'use strict';
// Modificadores da criação de partida: hub, página por modificador, busca e sitemap.
// Fontes: Gameplay.Modifiers.ModifierData (Category, ChallengeOnly, ForcedRole, DisabledRole, DisablesRoleSelection, SpecialOperation,
// GameStartModifiers, ClosedLocations, DifficultyIndex, PermanentGlobalEventId, LoopingGlobalEventId, ConflictGroup, Traits),
// ModifierStorage (EasyModifiers, HardModifiers), ChallengeData.Modifiers e o código citado em docs/engenharia-reversa.md.
// O número de cada efeito vem do dado (traço e efeito), não de texto do jogo; o que não deu para confirmar sai rotulado como texto do jogo.

module.exports = function (h) {
  const { RAW, byRef, byId, tx, spanLang, title, titleText, link, esc, plain, number, ui, hubText, say, page, crumbs, callout, howBlock, chipBar, goCell, GO_TH, articleLayout, ficha, fact, langDir, flavor, effects, simpleTable, roles, items, locations, assignSlugs, hasText } = h;
  const PAGE = 'modifiers';
  const deref = v => (v && v.id ? byRef.get(v.id) : null);
  const modifiers = assignSlugs([...RAW['Gameplay.Modifiers.ModifierData']].filter(hasText));
  for (const m of modifiers) m._kind = 'modifiers';
  const storage = RAW['Gameplay.Modifiers.ModifierStorage'][0];
  const presetIds = list => new Set((list || []).map(r => r.id));
  const EASY = presetIds(storage.EasyModifiers), HARD = presetIds(storage.HardModifiers);
  const challenges = RAW['Gameplay.Challenges.ChallengeData'] || [];

  // Gameplay.Modifiers: o menu de criação só oferece o que ModifierStorage.IsOfferedInPicker aceita: ChallengeOnly falso e Category diferente de 4.
  const CAT = { 0: 'ui_modifier_type_other', 1: 'ui_modifier_type_role', 2: 'ui_modifier_type_economy', 3: 'ui_modifier_type_world' };
  const offeredInMenu = m => !m.ChallengeOnly && m.Category !== 4;
  const catOf = m => (offeredInMenu(m) ? CAT[m.Category] : 'challenge');
  const catLabel = (lang, c) => { if (c === 'challenge') return hubText(lang, 'modifiers_challenges'); const t = tx(lang, c); return t ? spanLang(lang, t) : ''; };
  const whereLabel = (lang, m) => hubText(lang, offeredInMenu(m) ? 'modifiers_menu' : 'modifiers_challenges');
  // Gameplay.Modifiers.ModifierPanel: positivo verde (mais fácil), negativo vermelho (mais difícil); ModifierStorage mostra isso nas predefinições.
  const signed = (lang, v) => (v > 0 ? `+${number(lang, v)}` : number(lang, v));
  const namedChallenges = m => challenges.filter(c => (c.Modifiers || []).some(r => r.id === m._id));

  const roleOf = type => roles.find(r => r.Type === type);
  const ROLE_NAME = (lang, type) => { const r = roleOf(type); return r ? link(lang, r, title(lang, r)) : ''; };
  const attrOf = effectEntry => deref(effectEntry.Attribute);
  const actionName = (lang, a) => { const t = tx(lang, a.TitleTerm); return t ? spanLang(lang, t) : esc(a.m_Name); };
  const pct = (lang, f) => `${number(lang, Math.round(Math.abs(f - 1) * 100))}%`;
  const scale = (e, f) => Math.round(e.Value * f);

  // Texto: s(id, pt, en); o id cita a fonte.
  const speak = lang => (id, pt, en) => say(lang, PAGE, id, { 'pt-BR': pt, en });
  const guide = (lang, slug, pt, en) => `<a href="/${langDir(lang)}/guides/${slug}/">${lang === 'pt-BR' ? pt : en}</a>`;
  const placeOf = (lang, name) => { const l = locations.find(x => x.m_Name === name); return l ? link(lang, l, title(lang, l)) : esc(name); };

  // Compara o custo de uma ação com e sem o modificador.
  function actionRows(lang, actions, factor, attrName) {
    const cash = byRef;
    return actions.map(a => {
      const entries = (a.Rewards.RewardEntries || []).filter(e => e.Type === 10);
      const next = entries.map(e => (byId.get(e.Id) && byId.get(e.Id).m_Name === attrName ? { ...e, Value: scale(e, factor) } : e));
      return [actionName(lang, a), effects(lang, entries), effects(lang, next)];
    });
  }
  const rowsHead = (lang, s, name) => [name, s('head normal', 'Normal', 'Normal'), s('head with modifier', 'Com o modificador', 'With the modifier')];

  // Cada função devolve { html, pick, tier }: tier 'numbers' (efeito com número lido do dado ou código), 'setup' (regra confirmada sem número) ou 'text' (só o texto do jogo).
  function describe(lang, m) {
    const s = speak(lang);
    const trait = deref((m.Traits || [])[0]);
    const effect = trait ? deref((trait.Effects || [])[0]) : null;
    const pick = (id, pt, en) => s(`pick ${m.m_Name}: ${id}`, pt, en);

    if (m.ForcedRole) return { tier: 'setup',
      html: `<p>${s('ForcedRole', `Todos os jogadores começam com o papel ${ROLE_NAME(lang, m.ForcedRole)}. A tela de escolha de papel não aparece, porque o modificador já escolheu.`, `Every player starts as ${ROLE_NAME(lang, m.ForcedRole)}. The role selection screen is skipped, because the modifier has already chosen.`)}</p>`,
      pick: s('pick ForcedRole', 'Escolha para uma partida em que todos têm exatamente as mesmas vantagens do papel.', 'Pick it for a match where everyone has exactly the same role perks.') };
    if (m.DisablesRoleSelection) return { tier: 'setup',
      html: `<p>${s('DisablesRoleSelection without role', 'A tela de escolha de papel não aparece e ninguém joga com um papel: todos começam só com as regras básicas.', 'The role selection screen is skipped and nobody plays with a role: everyone starts with only the basic rules.')}</p>`,
      pick: s('pick Average Jones', 'Escolha para jogar sem nenhuma vantagem de papel.', 'Pick it to play without any role perks.') };
    if (m.DisabledRole) return { tier: 'setup',
      html: `<p>${s('DisabledRole', `O papel ${ROLE_NAME(lang, m.DisabledRole)} sai da tela de escolha. Os outros papéis continuam disponíveis.`, `${ROLE_NAME(lang, m.DisabledRole)} is taken off the role selection screen. The other roles stay available.`)}</p>`,
      pick: s('pick DisabledRole', 'Escolha quando não quiser esse papel na partida.', 'Pick it when you do not want this role in the match.') };

    if (m.PermanentGlobalEventId) return permanent(lang, m, s);
    if (m.LoopingGlobalEventId) return { tier: 'setup',
      html: `<p>${s('LoopingGlobalEventId (GlobalEventManager.SeedLoopingGlobalEvents, ScheduleNextLoops, CanLoop)', 'O Grande Jogo, evento global, se repete ao longo da partida: quando termina, o jogo agenda a próxima rodada dele.', 'The Big Game Global Event repeats through the match: when one ends, the game schedules the next run.')}</p><p>${guide(lang, 'global-events', 'Veja os Eventos Globais', 'See Global Events')}.</p>`,
      pick: '' };

    const name = m.m_Name;
    if (name === 'Landscaping' || name === "School's Out") {
      const loc = deref(m.ClosedLocations[0]);
      return { tier: 'setup', html: `<p>${s('ClosedLocations (BuildingManager.AddModifierClosedLocations)', `Este local fica fechado a partida inteira: ${link(lang, loc, title(lang, loc))}.`, `This location stays closed for the whole match: ${link(lang, loc, title(lang, loc))}.`)}</p>`,
        pick: s('pick closed location', 'Escolha para jogar sem esse lugar e forçar outros caminhos.', 'Pick it to play without this place and force other routes.') };
    }
    if (name === 'Silver Spoon' || name === 'Street Rat') {
      const v = m.GameStartModifiers.RewardEntries[0].Value;
      return { tier: 'numbers', html: `<p>${v > 0 ? s('GameStartModifiers Cash gain (ModifierManager.ApplyGameStartRewards, ApplyAttributeReward)', `Cada jogador começa com ${number(lang, v)} a mais de Dinheiro.`, `Each player starts with ${number(lang, v)} more Cash.`) : s('GameStartModifiers Cash loss (ModifierManager.ApplyGameStartRewards, ApplyAttributeReward)', `Cada jogador começa com ${number(lang, -v)} a menos de Dinheiro.`, `Each player starts with ${number(lang, -v)} less Cash.`)}</p>`,
        pick: v > 0 ? pick('gain', 'Um início mais folgado, sem mudar mais nada.', 'A more comfortable start, with nothing else changed.') : pick('loss', 'Um início mais apertado, sem mudar mais nada.', 'A tighter start, with nothing else changed.') };
    }
    if (name === 'Vagrant') {
      const park = placeOf(lang, 'Garden City');
      return { tier: 'setup', html: `<p>${s('GameStartModifiers home Outside (ModifierManager.ApplyGameStartRewards)', `Você começa a partida morando na rua, em ${park}: sem apartamento e sem aluguel a pagar até alugar um lugar.`, `You start the match living Outside, at ${park}: no apartment, and no rent to pay until you rent a place.`)}</p>`,
        pick: pick('vagrant', 'Escolha para começar mais pobre, sem casa e tendo que arrumar uma.', 'Pick it to start poorer, without a home and needing to find one.') };
    }
    if (name === 'Dad Owns a Dealership') {
      const it = byId.get(m.GameStartModifiers.RewardEntries[0].Id);
      return { tier: 'numbers', html: `<p>${s('GameStartModifiers item Vexmobile (ModifierManager.ApplyItemReward, Vexmobile-Modifier)', `Cada jogador começa com um ${link(lang, it, title(lang, it))}: andar custa 16 de Tempo por quadra, em vez de 20 a pé.`, `Each player starts with a ${link(lang, it, title(lang, it))}: moving costs 16 Time per block instead of 20 on foot.`)}</p>`,
        pick: pick('car', 'Escolha para se locomover mais rápido desde a primeira rodada.', 'Pick it to get around faster from the first round.') };
    }

    if (effect) {
      const cls = effect._cls || '';
      if (name === 'Brutal Landlady' || name === 'Chill Landlady') {
        const f = effect.Modifier, homes = RAW['DataTables.Airtable.Data.HomeData'].filter(x => x.Rent > 0).sort((a, b) => a.Rent - b.Rent);
        const homeName = x => { const t = tx(lang, x.Term + '_title') || tx(lang, x.Term); return t ? spanLang(lang, t) : esc(x.m_Name); };
        return { tier: 'numbers', html: `<p>${f > 1 ? s('ModifyRentByPercentageTraitEffect up', `O aluguel de cada casa fica ${pct(lang, f)} mais caro, em toda cobrança.`, `The rent of every home is ${pct(lang, f)} higher, on every bill.`) : s('ModifyRentByPercentageTraitEffect down', `O aluguel de cada casa fica ${pct(lang, f)} mais barato, em toda cobrança.`, `The rent of every home is ${pct(lang, f)} lower, on every bill.`)}</p>${simpleTable([s('head home', 'Casa', 'Home'), s('head normal', 'Normal', 'Normal'), s('head with modifier', 'Com o modificador', 'With the modifier')], homes.map(x => [homeName(x), number(lang, x.Rent), number(lang, Math.round(x.Rent * f))]))}<p>${guide(lang, 'housing', 'Veja o guia de moradia', 'See the housing guide')}.</p>`,
          pick: f > 1 ? pick('rent up', 'Escolha para uma partida mais dura com a casa.', 'Pick it for a tougher match on the housing side.') : pick('rent down', 'Escolha para gastar menos com moradia em toda a partida.', 'Pick it to spend less on housing for the whole match.') };
      }
      if (name === "Buyer's Market" || name === "Seller's Market") {
        const f = effect.AttributeModifications[0].Percentage, acts = effect.ChamberActionData.map(deref).filter(Boolean);
        return { tier: 'numbers', html: `<p>${f < 1 ? s('ModifyChamberActionRewardsByPercentage down', `O valor em Dinheiro para alugar um apartamento fica ${pct(lang, f)} menor. Vale só para essas ações de aluguel, não para a mensalidade.`, `The Cash you pay to move into an apartment is ${pct(lang, f)} lower. This only changes these rent actions, not the rent bill.`) : s('ModifyChamberActionRewardsByPercentage up', `O valor em Dinheiro para alugar um apartamento fica ${pct(lang, f)} maior. Vale só para essas ações de aluguel, não para a mensalidade.`, `The Cash you pay to move into an apartment is ${pct(lang, f)} higher. This only changes these rent actions, not the rent bill.`)}</p>${simpleTable(rowsHead(lang, s, s('head apartment action', 'Ação', 'Action')), actionRows(lang, acts, f, 'Cash'))}`,
          pick: f < 1 ? pick('cheap', 'Escolha quando quiser mudar de casa logo no começo.', 'Pick it when you want to move into a home early.') : pick('expensive', 'Escolha para tornar a primeira casa um gasto maior.', 'Pick it to make that first home a bigger expense.') };
      }
      if (name === 'Cushy Jobs' || name === 'Dirty Jobs') {
        const f = effect.Modifier[0].Percentage, names = effect.Modifier.map(x => { const a = attrOf(x); return a ? title(lang, a) : ''; }).join(', ');
        return { tier: 'numbers', html: `<p>${f < 1 ? s('ModifyWorkRewardsByPercentageTraitEffects down', `O ganho ou perda de ${names} em cada turno de trabalho é multiplicado por ${number(lang, f)}: os empregos desgastam ${pct(lang, f)} menos.`, `Any change to ${names} from a work shift is multiplied by ${number(lang, f)}: jobs wear you down ${pct(lang, f)} less.`) : s('ModifyWorkRewardsByPercentageTraitEffects up', `O ganho ou perda de ${names} em cada turno de trabalho é multiplicado por ${number(lang, f)}: os empregos desgastam ${pct(lang, f)} mais.`, `Any change to ${names} from a work shift is multiplied by ${number(lang, f)}: jobs wear you down ${pct(lang, f)} more.`)}</p><p>${s('work salary unaffected (ModifyWorkRewardsByPercentageTraitEffects only lists these attributes)', 'O Dinheiro do salário e o Tempo gasto não mudam.', 'Your Cash pay and the Time spent do not change.')}</p>`,
          pick: f < 1 ? pick('work easy', 'Escolha para trabalhar mais turnos sem precisar se recuperar tanto.', 'Pick it to work more shifts without needing to recover as much.') : pick('work hard', 'Escolha para punir quem só trabalha.', 'Pick it to punish players who only work.') };
      }
      if (name === 'Iron Fortitude' || name === 'Weak Stomach') {
        const effs = trait.Effects.map(deref).filter(Boolean), f = effs[0].Modifiers[0].Percentage;
        const rows = effs.map(e => {
          const report = deref(e.TargetReport), attrIds = e.Modifiers.map(x => attrOf(x).Id);
          const base = report.Rewards.RewardEntries.filter(r => r.Type === 10);
          const next = base.map(r => (attrIds.includes(r.Id) ? { ...r, Value: scale(r, f) } : r));
          const t = tx(lang, report.TitleTerm);
          return [t ? spanLang(lang, t) : esc(report.m_Name), effects(lang, base), effects(lang, next)];
        });
        return { tier: 'numbers', html: `<p>${f < 1 ? s('ModifyReportRewardsByPercentageTraitEffect down', `As punições de esquecer de comer e de estar estressado ficam ${pct(lang, f)} menores.`, `The penalties for forgetting to eat and for being stressed are ${pct(lang, f)} smaller.`) : s('ModifyReportRewardsByPercentageTraitEffect up', `As punições de esquecer de comer e de estar estressado ficam ${pct(lang, f)} maiores.`, `The penalties for forgetting to eat and for being stressed are ${pct(lang, f)} bigger.`)}</p>${simpleTable(rowsHead(lang, s, s('head penalty', 'Punição', 'Penalty')), rows)}`,
          pick: f < 1 ? pick('forgive', 'Escolha para errar sem pagar tão caro.', 'Pick it to make mistakes hurt less.') : pick('punish', 'Escolha para punir mais quem descuida da Fome e do Estresse.', 'Pick it to punish neglecting Hunger and Stress.') };
      }
      if (name === 'Public School' || name === 'Private School') {
        const f = effect.Modifier.Percentage;
        return { tier: 'numbers', html: `<p>${f < 1 ? s('ModifyEnrollmentCostTraitEffect down (action InsideChamberEducationEnroll)', `O Dinheiro da matrícula de cada curso fica ${pct(lang, f)} menor. O Tempo da matrícula e o de cada estudo não mudam.`, `The Cash enrollment fee of every course is ${pct(lang, f)} lower. The Time to enroll and to study does not change.`) : s('ModifyEnrollmentCostTraitEffect up (action InsideChamberEducationEnroll)', `O Dinheiro da matrícula de cada curso fica ${pct(lang, f)} maior. O Tempo da matrícula e o de cada estudo não mudam.`, `The Cash enrollment fee of every course is ${pct(lang, f)} higher. The Time to enroll and to study does not change.`)}</p><p>${guide(lang, 'education', 'Veja o guia de educação', 'See the education guide')}.</p>`,
          pick: f < 1 ? pick('school cheap', 'Escolha para facilitar quem quer estudar.', 'Pick it to help players who want to study.') : pick('school dear', 'Escolha para deixar o diploma mais caro.', 'Pick it to make diplomas more expensive.') };
      }
      if (name === 'Golden Age' || name === 'Tough Economy') {
        const f = effect.PercentageModifier.Percentage;
        return { tier: 'numbers', html: `<p>${f < 1 ? s('ModifyAllActionsByPercentagePositiveNegative down (Positive false)', `Toda ação que custa Dinheiro fica ${pct(lang, f)} mais barata: comida, compras, matrícula e o que mais cobrar Dinheiro em uma sala.`, `Every action that costs Cash is ${pct(lang, f)} cheaper: food, shopping, enrollment and anything else charged in a room.`) : s('ModifyAllActionsByPercentagePositiveNegative up (Positive false)', `Toda ação que custa Dinheiro fica ${pct(lang, f)} mais cara: comida, compras, matrícula e o que mais cobrar Dinheiro em uma sala.`, `Every action that costs Cash is ${pct(lang, f)} more expensive: food, shopping, enrollment and anything else charged in a room.`)}</p><p>${s('Cash costs only (ModifyAllActionsByPercentagePositiveNegative: only negative Cash entries, CheckForChamberAction only)', 'Só muda o preço das ações: o salário e o Dinheiro que você recebe ficam iguais, e o aluguel não entra, porque é cobrado à parte.', 'Only the price of actions changes: your pay and Cash you receive stay the same, and rent is not included because it is charged separately.')}</p>`,
          pick: f < 1 ? pick('prices low', 'Escolha para uma partida mais folgada em dinheiro.', 'Pick it for a match with more Cash to spare.') : pick('prices high', 'Escolha para deixar o dinheiro curto do começo ao fim.', 'Pick it to keep Cash tight from start to finish.') };
      }
      if (name === 'Infernal Contract') {
        const p = effect.RentIncreasePercent;
        return { tier: 'numbers', html: `<p>${s('IncreaseRentEveryPeriodTraitEffect (CheckForRentChange: rent += rent x pct/100 x (floor(round/4) - 1))', `O aluguel sobe ${number(lang, p)}% do valor original a cada cobrança a partir da segunda: o primeiro aluguel não muda, o da rodada 8 sobe ${number(lang, p)}%, o da rodada 12 sobe ${number(lang, p * 2)}%, o da rodada 16 sobe ${number(lang, p * 3)}% e assim por diante.`, `Rent goes up by ${number(lang, p)}% of its original value on every bill after the first: the first rent is unchanged, the one on round 8 is ${number(lang, p)}% higher, round 12 is ${number(lang, p * 2)}% higher, round 16 is ${number(lang, p * 3)}% higher, and so on.`)}</p><p>${s('additive not compound (same method)', 'A soma é sempre sobre o aluguel normal, não sobre o aluguel já aumentado.', 'The increase is always added on top of the normal rent, not on top of the already raised rent.')}</p><p>${guide(lang, 'housing', 'Veja o guia de moradia', 'See the housing guide')}.</p>`,
          pick: pick('infernal', 'Escolha para jogos longos em que morar de aluguel vira uma armadilha.', 'Pick it for long matches where renting turns into a trap.') };
      }
      if (name === 'Tarot Troubles') return tarot(lang, effect, s, pick);
      if (name === 'Limited Employment') return { tier: 'numbers', html: `<p>${s('BlockJobsHeldByOthersTraitEffect (MaxHoldersPerJob 1, OnlyTheseJobs empty)', `Cada vaga de emprego só pode ser ocupada por ${number(lang, effect.MaxHoldersPerJob)} jogador de cada vez. A vaga que outra pessoa já ocupa aparece como indisponível.`, `Each job opening can be held by only ${number(lang, effect.MaxHoldersPerJob)} player at a time. A job someone else already holds shows as unavailable.`)}</p><p>${guide(lang, 'jobs', 'Veja o guia de empregos', 'See the jobs guide')}.</p>`, pick: pick('limited', 'Escolha para que os jogadores disputem os melhores empregos.', 'Pick it to make players compete for the best jobs.') };
      if (name === 'Pawn Emporium') return { tier: 'numbers', html: `<p>${s('IncreasePawnShopCapacityTraitEffect (AdditionalSpecialSlots, SpecialFurnitureSlots)', `A Casa de Penhores ganha ${number(lang, effect.AdditionalSpecialSlots)} espaços especiais a mais e ${number(lang, effect.SpecialFurnitureSlots)} espaços de móveis especiais a mais na prateleira.`, `The Pawn Shop gets ${number(lang, effect.AdditionalSpecialSlots)} more special slots and ${number(lang, effect.SpecialFurnitureSlots)} more special furniture slots on its shelf.`)}</p><p>${guide(lang, 'pawn-shop', 'Veja o guia da Casa de Penhores', 'See the Pawn Shop guide')}.</p>`, pick: pick('pawn', 'Escolha para ter mais opção de móvel à venda.', 'Pick it to have more furniture on offer.') };
      if (name === 'Pet Emporium') return { tier: 'setup', html: `<p>${s('AllPetsAvailableTraitEffect (PetHandler CheckForAllPetsAvailable)', 'Todos os pets ficam à venda o tempo todo.', 'All pets stay for sale at all times.')}</p><p>${guide(lang, 'pets', 'Veja o guia de pets', 'See the pets guide')}.</p>`, pick: pick('pet', 'Escolha para poder comprar qualquer pet na hora que quiser.', 'Pick it to buy any pet whenever you want.') };
      if (name === 'Jackpot') {
        const lottery = RAW['DataTables.Airtable.Data.LotteryData'][0];
        const base = lottery.WinChance, plus = effect.LotteryWinChanceModifier, ramp = 250;
        return { tier: 'numbers', html: `<p>${s('ModifyLotteryWinChanceTraitEffect and LotteryManager.OnRoundStarted (AnySelectedModifierRampsJackpot, 250)', `A chance de ganhar na loteria sobe ${number(lang, Math.round(plus * 100))} pontos, de ${number(lang, Math.round(base * 100))}% para ${number(lang, Math.round((base + plus) * 100))}% por bilhete. Em cada sorteio sem vencedor, o prêmio mínimo e o máximo sobem ${number(lang, ramp)}. Quando alguém ganha, os dois voltam ao normal (${number(lang, lottery.MinPrize)} a ${number(lang, lottery.MaxPrize)}).`, `The lottery win chance goes up by ${number(lang, Math.round(plus * 100))} points, from ${number(lang, Math.round(base * 100))}% to ${number(lang, Math.round((base + plus) * 100))}% per ticket. Every draw with no winner raises the minimum and maximum prize by ${number(lang, ramp)}. When someone wins, both go back to normal (${number(lang, lottery.MinPrize)} to ${number(lang, lottery.MaxPrize)}).`)}</p><p>${guide(lang, 'bank', 'Veja o guia de banco e loteria', 'See the bank and lottery guide')}.</p>`, pick: pick('jackpot', 'Escolha se a loteria faz parte do seu plano.', 'Pick it if the lottery is part of your plan.') };
      }
      if (name === 'Crooked Organization') {
        const supportNames = (effect.SupportActions || []).map(deref).filter(Boolean).map(a => actionName(lang, a)).join(', ');
        const row = (x) => { const a = attrOf(x); const n = a ? title(lang, a) : ''; return `${n} +${number(lang, Math.round((x.Percentage - 1) * 100))}%`; };
        return { tier: 'numbers', html: `<p>${s('MultAttributeCostEveryXRoundsTraitEffect (Interval, Modifiers: value += value x (pct - 1) x floor(round / Interval))', `A cada ${number(lang, effect.Interval)} rodadas os custos destas ações do Grande Jogo sobem de novo: ${effect.Modifiers.map(row).join(', ')} em cima do valor original, por período. Ações: ${supportNames}.`, `Every ${number(lang, effect.Interval)} rounds the costs of these Big Game actions go up again: ${effect.Modifiers.map(row).join(', ')} on top of the original value, per period. Actions: ${supportNames}.`)}</p>`, pick: '' };
      }
      if (name === 'Police State') {
        return { tier: 'numbers', html: `<p>${s('PvpCurfewSleepTraitEffect, PvpManager.RequestAlwaysOnCurfewPunish_RPC, CurfewPenalty 200', 'Toque de recolher o tempo todo: quem termina o turno sem usar a ação Dormir paga uma multa de 200 de Dinheiro.', 'A permanent curfew: if you end your turn without using the Sleep action you pay a 200 Cash fine.')}</p>`, pick: pick('police', 'Escolha para obrigar todos a voltar para casa no fim de cada turno.', 'Pick it to force everyone home at the end of each turn.') };
      }
      if (name === 'Futurism') {
        const act = deref(effect.ChamberActions[0]);
        return { tier: 'numbers', html: `<p>${s('AddChamberActionTraitEffect (Vexcorp - Teleport Rewards)', 'Acrescenta a ação', 'Adds the action')} ${actionName(lang, act)}. ${s('teleport cost', 'Cada uso custa:', 'Each use costs:')}</p>${effects(lang, act.Rewards.RewardEntries.filter(e => e.Type === 10))}${gameTextCallout(lang, m, s)}`, pick: pick('futurism', 'Escolha para encurtar os deslocamentos da partida.', 'Pick it to cut travel across the match.') };
      }
      if (name === 'Community Service') {
        const act = deref(effect.ChamberActions[0]);
        return { tier: 'numbers', html: `<p>${s('AddChamberActionTraitEffect (Clean Up Trash Rewards)', 'Acrescenta a ação', 'Adds the action')} ${actionName(lang, act)}. ${s('cleanup cost', 'Cada uso custa:', 'Each use costs:')}</p>${effects(lang, act.Rewards.RewardEntries.filter(e => e.Type === 10))}${gameTextCallout(lang, m, s)}`, pick: '' };
      }
      if (name === 'School Fundraiser') {
        const act = deref(effect.ChamberActions[0]), academy = placeOf(lang, 'Academy');
        return { tier: 'numbers', html: `<p>${s('AddChamberActionTraitEffect (Donate to the School, Academy Old 1 chamber)', `Acrescenta em ${academy} a ação`, `Adds at ${academy} the action`)} ${actionName(lang, act)}. ${s('donate effect', 'Cada doação muda assim:', 'Each donation changes:')}</p>${effects(lang, act.Rewards.RewardEntries.filter(e => e.Type === 10))}`, pick: '' };
      }
      if (name === 'Friendship Crates') {
        const buy = deref(effect.ChamberActions[0]);
        const park = placeOf(lang, 'Garden City');
        return { tier: 'numbers', html: `<p>${s('AddChamberActionTraitEffect (Buy Friendship Crate, Garden Pond chamber)', `Acrescenta em ${park} a ação`, `Adds at ${park} the action`)} ${actionName(lang, buy)}. ${s('crate cost', 'Cada compra custa:', 'Each purchase costs:')}</p>${effects(lang, buy.Rewards.RewardEntries.filter(e => e.Type === 10))}<p>${s('FriendshipCrateGiveReportTraitEffect (OnRoundStarted, PickRecipient)', 'Na rodada seguinte, outro jogador recebe uma recompensa sorteada dessa caixa.', 'On the next round, another player receives a random reward from the crate.')}</p>`, pick: '' };
      }
    }

    if (m.SpecialOperation === 'Stock Market Chaos') return { tier: 'numbers', html: `<p>${s('StockBehavior.ApplyChaosProfile (ChaosVolatility 0.4, TrendBias 0, Roof 3, CenterPull 0.4) vs CreateDefaults (0.10 to 0.18, CenterPull 0.05)', 'Todas as ações passam a oscilar 40% por rodada, em vez dos 10% a 18% normais, e o preço é puxado com força de volta para o valor-base. Não há tendência de alta ou queda, e o teto é 3 vezes o valor-base.', 'Every stock swings 40% per round instead of the usual 10% to 18%, and the price is pulled hard back toward its base value. There is no upward or downward trend, and the ceiling is 3 times the base value.')}</p><p>${guide(lang, 'stocks', 'Veja o guia da Bolsa de Valores', 'See the stock market guide')}.</p>`, pick: pick('chaos', 'Escolha se quiser uma Bolsa de Valores imprevisível.', 'Pick it if you want an unpredictable stock market.') };
    if (m.SpecialOperation === 'Forget Me Not') return { tier: 'setup', html: `<p>${s('PlayerCard.SetFoodIcon with Forget Me Not', 'A carteira mostra um indicador de Fome, então fica fácil ver se você já comeu nesta rodada.', 'Your wallet shows a Hunger indicator, so it is easy to see whether you have eaten this round.')}</p><p>${guide(lang, 'hunger', 'Veja o guia de fome', 'See the hunger guide')}.</p>`, pick: pick('forget', 'Escolha para ter o lembrete na tela e não esquecer de comer.', 'Pick it to keep a reminder on screen and not forget to eat.') };
    if (m.SpecialOperation === 'Shuffle City') return { tier: 'setup', html: `<p>${s('BuildingManager.PrepareShuffleSeed (Shuffle City)', 'O mapa é embaralhado uma vez, no início da partida. Os prédios mudam de lugar e o traçado pode ficar estranho.', 'The map is shuffled once, at the start of the match. Buildings move and the layout can look odd.')}</p>`, pick: pick('shuffle', 'Escolha para mudar a cidade que você já conhece.', 'Pick it to change a city you already know.') };
    if (m.SpecialOperation === 'Land of Confusion') return { tier: 'setup', html: `<p>${s('BuildingManager.ReshuffleMapForRoundEnd (Land of Confusion)', 'O mapa é embaralhado de novo ao fim de cada rodada: os prédios não ficam no mesmo lugar por muito tempo.', 'The map is reshuffled at the end of every round: buildings do not stay in one place for long.')}</p>`, pick: pick('land of confusion', 'Escolha para uma partida em que o caminho muda toda rodada.', 'Pick it for a match where the route changes every round.') };
    return { tier: 'text', html: gameTextCallout(lang, m, s), pick: '' };
  }

  function gameTextCallout(lang, m, s) {
    return callout(s('label game text', 'Texto do jogo', "Game's text"), `<p>${flavorPlain(lang, m)}</p><p>${s('not confirmed note', 'Não confirmamos os detalhes no código nem nos dados: a linha acima é a descrição oficial do jogo.', 'We could not confirm the details in the game code or data: the line above is the official game description.')}</p>`);
  }
  const flavorPlain = (lang, m) => { const t = tx(lang, m.FlavorTerm); return t ? spanLang(lang, t) : ''; };

  // Eventos globais permanentes: SeedAlwaysOnGlobalEvents agenda 60 rodadas, com CanBeAlwaysOn nos cinco prefabs.
  function permanent(lang, m, s) {
    const EVENT = {
      recRAaxuQ5ApWXfZq: { name: s('name heat', 'Onda de Calor', 'Heat Wave'), what: s('GlobalEventHeatwave', 'Andar enche um medidor de calor por jogador. Passou de 100, você tem insolação e seu turno termina na hora.', 'Walking fills a heat meter for each player. Above 100 you get heat stroke and your turn ends at once.'), pick: s('pick Scorcher', 'Escolha para punir quem anda muito.', 'Pick it to punish walking too much.') },
      recIIRzAFpk7hTZet: { name: s('name crime', 'Onda de Crimes', 'Crime Wave'), what: s('GlobalEventCrimeWave', 'Assaltos, móveis furtados e itens perdidos podem acontecer com qualquer jogador durante toda a partida, em vez de só depois de um marco de Dinheiro ganho.', 'Muggings, stolen furniture and lost items can happen to any player for the whole match, instead of only after a Cash earned milestone.'), pick: s('pick City of Crime', 'Escolha para deixar o Dinheiro na mão um risco constante.', 'Pick it to make carrying Cash a constant risk.') },
      recI4kN74eTJsVHp8: { name: s('name flash', 'Oferta Relâmpago', 'Flash Sale'), what: s('Flash-Sale-Effect', 'Móveis, roupas e eletrodomésticos ficam 20% mais baratos o tempo todo.', 'Furniture, clothes and appliances are 20% cheaper at all times.'), pick: s('pick Flash Sale', 'Escolha para ter desconto permanente em móveis e roupas.', 'Pick it for a permanent discount on furniture and clothes.') },
      recWS5iplbgngIQ9v: { name: s('name pond', 'Pesca Maluca', 'Fishing Frenzy'), what: s('Pond-Rush-Effect', 'Pescar com a vara simples rende peixe especial em cerca de 36% das vezes, e isso dura a partida toda.', 'Fishing with the basic rod gives a special fish about 36% of the time, for the whole match.'), pick: s('pick Gone Fishin', 'Escolha para deixar a pesca mais lucrativa.', 'Pick it to make fishing more profitable.') },
      recE8V6b98TPy30i1: { name: s('name y2k', 'Pane no Banco', 'System Failure at the Bank'), what: s('Y2K-System-Failure-Effect, ModifyInterestRateOfVaultTraitEffect', 'O banco paga 40% de juros em vez de 4%, a cada fim de turno, durante toda a partida.', 'The bank pays 40% interest instead of 4%, at the end of every turn, for the whole match.'), pick: s('pick Y2K', 'Escolha para deixar quem guarda dinheiro no banco muito à frente.', 'Pick it to put players who save at the bank far ahead.') },
    }[m.PermanentGlobalEventId];
    const name = EVENT.name;
    const intro = s('PermanentGlobalEventId (GlobalEventManager.SeedAlwaysOnGlobalEvents, CanBeAlwaysOn, 60 rounds)', `O Evento Global ${name} fica ligado desde o início da partida, em vez de aparecer só por algumas rodadas.`, `The ${name} Global Event stays on from the start of the match, instead of appearing for a few rounds.`);
    return { tier: 'numbers', html: `<p>${intro}</p><p>${EVENT.what}</p><p>${guide(lang, 'global-events', 'Veja os Eventos Globais', 'See Global Events')}.</p>`, pick: EVENT.pick };
  }

  // Tarot Troubles: GiveAnyRewardOnTurnStartTraitEffect (Triggers, EveryNRounds 1, PickOneAtRandom 1); cartas = relatórios com o mesmo nome.
  function tarot(lang, effect, s, pick) {
    const reports = RAW['DataTables.Airtable.Data.ReportData'];
    const cards = effect.Triggers.map(deref).filter(Boolean).map(t => reports.find(r => r.Id === t.TargetId)).filter(Boolean);
    const rows = cards.map(r => { const t = tx(lang, r.TitleTerm); return [t ? spanLang(lang, t) : esc(r.m_Name), effects(lang, r.Rewards.RewardEntries)]; });
    return { tier: 'numbers', html: `<p>${s('GiveAnyRewardOnTurnStartTraitEffect (EveryNRounds, PickOneAtRandom, Triggers)', `A cada rodada, no início do seu turno, o jogo sorteia uma carta de tarô entre ${number(lang, cards.length)}:`, `Every round, at the start of your turn, the game draws one tarot card out of ${number(lang, cards.length)}:`)}</p>${simpleTable([s('head card', 'Carta', 'Card'), s('head effect', 'Efeito', 'Effect')], rows)}<p>${s('tarot cards come from Trigger Reports', 'Os valores acima são os da carta no jogo.', 'The values above are the card data from the game.')}</p>`, pick: pick('tarot', 'Escolha para ter sorte e azar a cada rodada.', 'Pick it for luck and bad luck every round.') };
  }

  function conflictPeers(m) {
    if (!m.ConflictGroup || !m.ConflictGroup.trim()) return [];
    return modifiers.filter(x => x !== m && x.ConflictGroup && x.ConflictGroup.trim() === m.ConflictGroup.trim());
  }

  function hub(lang) {
    const sorted = [...modifiers].sort((a, b) => titleText(lang, a).localeCompare(titleText(lang, b), lang));
    const cats = ['ui_modifier_type_role', 'ui_modifier_type_economy', 'ui_modifier_type_world', 'ui_modifier_type_other', 'challenge'];
    const chips = chipBar(lang, cats.map(v => ({ v, label: plain(catLabel(lang, v)) })));
    const rows = sorted.map(m => `<tr data-c="${esc(catOf(m))}"><td>${link(lang, m, title(lang, m))}</td><td class="cat">${catLabel(lang, catOf(m))}</td><td class="n" data-label="${esc(hubText(lang, 'modifiers_index'))}">${signed(lang, m.DifficultyIndex)}</td><td class="cat">${esc(whereLabel(lang, m))}</td><td class="wide">${flavorPlain(lang, m)}</td>${goCell(lang, m)}</tr>`).join('');
    const body = `${h.hubHead(lang, 'modifiers', modifiers.length)}<div data-list><div class="bar"><input data-filter type="search" placeholder="${esc(ui(lang, 'filter'))}" aria-label="${esc(ui(lang, 'filter'))}">${chips}</div><div class="tablecard"><table class="list-table"><thead><tr><th data-sort="t">${ui(lang, 'name')}</th><th data-sort="t">${ui(lang, 'category')}</th><th class="n" data-sort="n">${esc(hubText(lang, 'modifiers_index'))}</th><th>${esc(hubText(lang, 'modifiers_where'))}</th><th>${esc(hubText(lang, 'modifiers_desc'))}</th>${GO_TH}</tr></thead><tbody>${rows}</tbody></table></div></div>${say(lang, PAGE, 'hub notes', { 'pt-BR': `<p class="note">Você escolhe os modificadores ao criar a partida, até ${number(lang, 24)} ao mesmo tempo. Alguns não podem ser combinados: quem pertence ao mesmo grupo se exclui. O índice de dificuldade soma: positivo deixa a partida mais fácil, negativo mais difícil.</p>`, en: `<p class="note">You pick modifiers when you create a match, up to ${number(lang, 24)} at once. Some cannot be combined: modifiers in the same group exclude each other. The difficulty index adds up: positive makes the match easier, negative harder.</p>` })}`;
    page(lang, 'modifiers/', { title: ui(lang, 'modifiers'), body, section: 'modifiers' });
  }

  function detail(lang, m) {
    const s = speak(lang);
    const d = describe(lang, m);
    const facts = [
      ...(offeredInMenu(m) ? [fact(plain(ui(lang, 'category')), catLabel(lang, catOf(m)))] : []),
      fact(hubText(lang, 'modifiers_where'), esc(whereLabel(lang, m))),
      fact(hubText(lang, 'modifiers_index'), signed(lang, m.DifficultyIndex)),
    ];
    if (EASY.has(m._id)) facts.push(fact(s('fact preset', 'Predefinição', 'Preset'), s('preset easy', 'Faz parte da dificuldade Fácil', 'Part of the Easy difficulty')));
    if (HARD.has(m._id)) facts.push(fact(s('fact preset', 'Predefinição', 'Preset'), s('preset hard', 'Faz parte da dificuldade Difícil', 'Part of the Hard difficulty')));
    const peers = conflictPeers(m);
    const challengeList = namedChallenges(m).map(c => { const t = tx(lang, c.NameTerm); return t ? spanLang(lang, t) : esc(c.m_Name); });
    const calls = [];
    if (peers.length) calls.push(callout(s('label conflicts (ConflictGroup, ModifierData.ConflictsWith)', 'Não combina com', 'Cannot be combined with'), `<p>${peers.map(p => link(lang, p, title(lang, p))).join(', ')}</p>`));
    if (challengeList.length) calls.push(callout(s('label challenges (ChallengeData.Modifiers)', 'Usado nos desafios', 'Used in challenges'), `<p>${challengeList.join(', ')}</p>`));
    if (d.pick) calls.push(callout(s('label pick', 'Quando escolher', 'When to pick it'), `<p>${d.pick}</p>`));
    const head = `${crumbs(lang, 'modifiers', title(lang, m))}<h1>${title(lang, m)}</h1>${flavor(lang, m)}${howBlock(lang, '', calls)}`;
    const body = `<section class="art-section"><h2>${s('h what it does', 'O que muda', 'What it changes')}</h2>${d.html}</section>`;
    page(lang, `modifiers/${m._slug}/`, { title: titleText(lang, m), body: articleLayout(head, ficha(facts), body), section: 'modifiers', description: plain(flavorPlain(lang, m)) });
    return d.tier;
  }

  // Contagem por confirmação, usada no fechamento da frente.
  const tiers = lang => { const out = { numbers: 0, setup: 0, text: 0 }; for (const m of modifiers) out[describe(lang, m).tier]++; return out; };
  const searchEntries = lang => modifiers.map(m => ({ t: titleText(lang, m), u: `modifiers/${m._slug}/`, s: ui(lang, 'modifiers') }));
  const urls = () => ['modifiers/', ...modifiers.map(m => `modifiers/${m._slug}/`)];
  const render = lang => { hub(lang); modifiers.forEach(m => detail(lang, m)); };
  return { modifiers, render, searchEntries, urls, tiers };
};
