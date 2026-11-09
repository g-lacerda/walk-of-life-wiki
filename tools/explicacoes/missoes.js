'use strict';
// Missões e Eventos: peças de texto e de conta usadas por explainQuest, questPage e eventPage em build-site.js.
// A fábrica recebe funções que só existem mais abaixo no build-site.js, por isso tudo é chamado de forma preguiçosa.
const { comPreposicao } = require('./lugares');

module.exports = function (h) {
  const { say } = h;
  const join = (lang, list) => {
    const word = lang === 'pt-BR' ? 'ou' : 'or';
    return list.length > 1 ? `${list.slice(0, -1).join(', ')} ${word} ${list[list.length - 1]}` : list[0] || '';
  };

  // ---------------------------------------------------------------- Missões: o que a conta de Tempo não cobre
  // QuestObjective sem ActionData não diz qual ação (ou quantas) o jogador faz, então o Tempo dela não entra em questEffort.
  const GAP_GROUPS = {
    travel: ['VisitLocationQuestObjective', 'VisitAnyLocationsInSameRoundObjective', 'EnterChamberQuestObjective', 'TravelDistanceQuestObjective'],
    work: ['PerformWorkActionQuestObjective', 'DrifterWorkComboQuestObjective'],
    study: ['PerformStudyActionQuestObjective'],
    wait: ['WaitUntilNextTurnQuestObjective', 'DoNotPerformActionForDurationQuestObjective'],
    other: ['GainAttributeQuestObjective', 'CountItemOfTypeInInventoryQuestObjective', 'CountItemOfTypeAtHomeQuestObjective', 'SellPawnItemQuestObjective', 'PerformStockBuyActionQuestObjective', 'PerformActionBuyAnyFurnitureQuestObjective', 'ReachJobLevelQuestObjective'],
  };
  const GAP_TEXT = {
    travel: { 'pt-BR': 'o deslocamento até os lugares pedidos', en: 'getting to the places it asks for' },
    work: { 'pt-BR': 'os turnos de trabalho', en: 'the shifts' },
    study: { 'pt-BR': 'as aulas', en: 'the classes' },
    wait: { 'pt-BR': 'a espera', en: 'the waiting' },
    other: { 'pt-BR': 'o que for preciso para ganhar atributos, comprar ou ter itens', en: 'whatever it takes to gain attributes, buy or hold items' },
  };
  const objectivesOf = steps => steps.flatMap(s => Object.values(s.references || {}));
  const isCashSpend = o => o.$type === 'SpendAttributeAtLocationQuestObjective' && (h.deref(o.TargetAttribute) || {}).m_Name === 'Cash';
  // Dinheiro que a Missão manda gastar em um lugar (SpendAttributeAtLocationQuestObjective.TargetValue).
  const spentCash = steps => objectivesOf(steps).filter(isCashSpend).reduce((sum, o) => sum + (o.TargetValue || 0), 0);
  // Grupos de objetivos que ficam fora da conta de Tempo, na ordem do GAP_TEXT.
  const gaps = (steps, known) => {
    const types = new Set(objectivesOf(steps).filter(o => !(known && known(o))).map(o => o.$type));
    return Object.keys(GAP_GROUPS).filter(g => GAP_GROUPS[g].some(t => types.has(t)));
  };
  const gapSentence = (lang, groups) => {
    if (!groups.length) return '';
    const list = groups.map(g => GAP_TEXT[g][lang === 'pt-BR' ? 'pt-BR' : 'en']);
    const and = lang === 'pt-BR' ? 'e' : 'and';
    const text = list.length > 1 ? `${list.slice(0, -1).join(', ')} ${and} ${list[list.length - 1]}` : list[0];
    return say(lang, 'quests', 'quest time gaps (QuestObjective without ActionData is not summed in questEffort)', {
      'pt-BR': `Fora dessa conta: ${text}. O custo real é maior.`,
      en: `Not counted: ${text}. The real cost is higher.`,
    });
  };

  // Ajusta o veredito do "Vale a pena?" quando a conta de Tempo ficou incompleta ou quando a Missão não tem recompensa nenhuma.
  function verdictFor(lang, verdict, o) {
    const base = verdictBase(lang, verdict, o);
    return o.loss ? { 'pt-BR': `${base['pt-BR']}${o.loss['pt-BR']}`, en: `${base.en}${o.loss.en}` } : base;
  }
  function verdictBase(lang, verdict, o) {
    const { reason, heavy, gapGroups, bare, roleLink, heavyNote, special } = o;
    if (special) return special;
    if (bare && reason === 'none') {
      const tail = { 'pt-BR': roleLink ? ` Ela faz parte do ritual do papel ${roleLink}: veja a página do papel.` : '', en: roleLink ? ` It is part of the ${roleLink} role's ritual: see the role page.` : '' };
      return heavy
        ? { 'pt-BR': `Não dá pontos, Dinheiro nem outra recompensa, e o custo em atributos é pesado.${tail['pt-BR']} ${heavyNote['pt-BR']}`, en: `It gives no points, Cash or other reward, and the attribute cost is heavy.${tail.en} ${heavyNote.en}` }
        : { 'pt-BR': `Não dá pontos, Dinheiro nem outra recompensa.${tail['pt-BR']}`, en: `It gives no points, Cash or other reward.${tail.en}` };
    }
    if (gapGroups.length && !heavy && reason === 'points-good') {
      return { 'pt-BR': 'Os pontos por Tempo estão acima da média, mas só no Tempo contado: some o que ficou de fora antes de aceitar.', en: 'Its points per Time are above average, but only for the Time counted: add up what was left out before accepting.' };
    }
    if (gapGroups.length && !heavy && reason === 'good') {
      return { 'pt-BR': 'Não dá pontos e rende mais Dinheiro que esse emprego só no Tempo contado: some o que ficou de fora antes de aceitar.', en: 'It gives no points and pays more Cash than that job only for the Time counted: add up what was left out before accepting.' };
    }
    return verdict;
  }

  // ---------------------------------------------------------------- Missões: textos pequenos
    // O texto do jogo já abre com "Seu signo é Libra!"; o prefixo em inglês só serve para quem lê em outro idioma.
  const signLead = (lang, key) => (lang === 'pt-BR' ? '' : `<strong>${h.esc(key)}.</strong> `);
  const cashLoss = (lang, spent, paid, n) => say(lang, 'quests', 'quest asks more Cash than it pays (SpendAttributeAtLocationQuestObjective vs Cash reward)', {
    'pt-BR': `Em Dinheiro, ela pede ${n(lang, spent)} e paga ${n(lang, paid)}.`,
    en: `In Cash, it asks for ${n(lang, spent)} and pays ${n(lang, paid)}.`,
  });

  // "Aceite a Missão no Banco." em vez de "em: Banco".
  function placesIn(lang, list) {
    const seen = new Set();
    const uniq = [...new Set(list)].filter(l => { const k = h.titleText(lang, l); if (seen.has(k)) return false; seen.add(k); return true; });
    if (lang !== 'pt-BR') return join(lang, uniq.map(l => h.link(lang, l, h.title(lang, l))));
    return join(lang, uniq.map(l => comPreposicao(h.titleText(lang, l), 'em', label => h.link(lang, l, h.esc(label)))));
  }

  // Texto de objetivo: o que sobra de "{ACTION}", "1 dias" e o "×N" que repete o número que o próprio texto já traz.
  const NUMBER_WORDS_PT = /\b(dois|duas|três|quatro|cinco|seis|sete|oito|nove|dez)\b/i;
  function objectiveText(lang, html, action) {
    let out = html.replace(/\{action\}/gi, action || '…');
    if (lang === 'pt-BR') out = out.replace(/\b1 dias\b/g, '1 dia');
    return out;
  }
  function repeatsCount(lang, html) {
    const text = h.plain(html);
    return /\d/.test(text) || (lang === 'pt-BR' && NUMBER_WORDS_PT.test(text));
  }

  // Etapa cujo título repete o da Missão, ou o único objetivo: "Etapa 2: Conclua a missão na Vexcorp" + o mesmo objetivo.
  function redundantHeading(lang, q, step, objectiveHtmls) {
    const t = h.titleText(lang, step);
    return t === h.titleText(lang, q) || objectiveHtmls.some(o => h.plain(o).replace(/\s*×\s*\d+$/, '') === t);
  }

  // Dois ou mais registros do jogo com o mesmo nome: a página deixa claro que são coisas separadas.
  function sameName(lang, rec, all, kind) {
    const name = h.titleText(lang, rec);
    const n = all.filter(x => h.titleText(lang, x) === name).length;
    if (n < 2) return '';
    const text = kind === 'events'
      ? { 'pt-BR': `O jogo tem ${n} eventos com o nome “${name}”. Cada um é um evento separado do jogo; esta página mostra só um deles.`, en: `The game has ${n} events named “${name}”. Each one is a separate event in the game; this page shows only one of them.` }
      : { 'pt-BR': `O jogo tem ${n} Missões com o nome “${name}”. Cada uma é uma Missão separada; esta página mostra só uma delas.`, en: `The game has ${n} quests named “${name}”. Each one is a separate quest; this page shows only one of them.` };
    const twin = kind === 'quests' && n === 2 && h.stepsOf(rec).some(s => (s.Objectives || []).length) ? all.find(x => x !== rec && h.titleText(lang, x) === name) : null;
    const other = twin ? ` ${say(lang, kind, 'same name: link to the other record', { 'pt-BR': `A outra é ${h.link(lang, twin, h.title(lang, twin))}.`, en: `The other one is ${h.link(lang, twin, h.title(lang, twin))}.` })}` : '';
    return `<p class="muted">${say(lang, kind, `same name (${kind} with equal titles)`, text)}${other}</p>`;
  }

  // Missão sem objetivo nenhum nos dados, mas com uma de mesmo nome que os tem.
  function emptyNote(lang, q, steps, all) {
    if (steps.length !== 1 || (steps[0].Objectives || []).length) return '';
    const twin = all.find(x => x !== q && h.titleText(lang, x) === h.titleText(lang, q) && h.stepsOf(x).some(s => (s.Objectives || []).length));
    if (!twin) return '';
    return `<p class="muted">${say(lang, 'quests', 'empty quest entry with a twin of the same name', {
      'pt-BR': `Esta versão da Missão não tem objetivos nem recompensas. A Missão de mesmo nome que traz os objetivos é ${h.link(lang, twin, h.title(lang, twin))}.`,
      en: `This version of the quest has no objectives or rewards. The quest of the same name that has the objectives is ${h.link(lang, twin, h.title(lang, twin))}.`,
    })}</p>`;
  }

  // ---------------------------------------------------------------- Eventos
  // TagRequirements com o mesmo tag e várias origens (TV Boa, TV Jurássica, TV Chique) valem por qualquer uma delas.
  // Sem NonNegotiable, requisitos do mesmo tipo (duas moradias) são alternativas: o evento pesa mais para quem cumpre qualquer uma.
  const KIND_PHRASE = {
    roles: (lang, n) => ({ 'pt-BR': `Você tem o papel ${join(lang, n)}`, en: `You have the ${join(lang, n)} role` }),
    jobs: (lang, n) => ({ 'pt-BR': `Você trabalha como ${join(lang, n)}`, en: `You work as ${join(lang, n)}` }),
    items: (lang, n) => ({ 'pt-BR': `Você tem ${join(lang, n)}`, en: `You own ${join(lang, n)}` }),
    undefined: (lang, n) => ({ 'pt-BR': `Sua moradia é ${join(lang, n)}`, en: `Your home is ${join(lang, n)}` }),
  };
  function conditions(lang, e, operators) {
    const reqs = (e.TagRequirements || []).filter(t => !t.Negate && operators.includes(t.Operator));
    const groups = [];
    for (const t of reqs) {
      const recs = (h.tagSources().get(t.Name) || []).slice(0, 8).filter((r, i, all) => h.hasText(r) && all.indexOf(r) === i);
      if (!recs.length) continue;
      const kind = recs[0]._kind;
      const hit = !t.NonNegotiable && groups.find(g => !g.must && g.kind === kind);
      if (hit) { for (const r of recs) if (!hit.recs.includes(r)) hit.recs.push(r); } else groups.push({ kind, must: !!t.NonNegotiable, recs: [...recs] });
    }
    return groups.map(g => {
      const names = g.recs.map(r => h.link(lang, r, h.title(lang, r)));
      return say(lang, 'events', `condition phrase ${g.kind} (TagRequirements, any source of the tag)`, (KIND_PHRASE[g.kind] || KIND_PHRASE.items)(lang, names));
    });
  }

  const CATEGORY_PT = { Neighbour: 'Vizinhos', Brokers: 'Corretores', Roleplay: 'RPG', Socialize: 'Vida social', 'At the Door': 'Na porta', 'Lost Roles': 'Papéis perdidos', Bookstore: 'Livraria', Movies: 'Cinema', Grannies: 'Vovós', Goose: 'Gansa', Vampires: 'Vampiros', Teens: 'Adolescentes', Pigeons: 'Pombas', Concert: 'Show', TV: 'TV', PC: 'Computador', PKMN: 'Batalha selvagem' };
  const categoryPt = (lang, c) => (lang === 'pt-BR' ? CATEGORY_PT[c] || '' : '');

  return { spentCash, gaps, gapSentence, verdictFor, signLead, cashLoss, placesIn, objectiveText, repeatsCount, redundantHeading, sameName, emptyNote, conditions, categoryPt };
};
