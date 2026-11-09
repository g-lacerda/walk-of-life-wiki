'use strict';
// Eventos: cadeias de história (tag chev_), comparação das escolhas e o texto de quando o evento sai.
// Fontes do jogo: StoryTagHelper.UpdateTag soma Count ao valor da tag e prende em 0 (Count -32768 apaga);
// StoryTagDrawRules.Compare e StoryTagHandler.TryGetEventEligibilityWeight avaliam Operator contra esse valor, e tag ausente vale 0.
// As fábricas recebem funções que só existem mais abaixo no build-site.js, por isso tudo é chamado de forma preguiçosa.

module.exports = function (h) {
  const { say } = h;
  const P = 'events';
  const CHEV = /^chev_/;
  const OPS = { 1: (v, c) => v === c, 2: (v, c) => v !== c, 3: (v, c) => v > c, 4: (v, c) => v >= c, 5: (v, c) => v < c, 6: (v, c) => v <= c };
  const accepts = (t, v) => (OPS[t.Operator] || (() => false))(v, t.Count);
  const chevReqs = e => (e.TagRequirements || []).filter(t => CHEV.test(t.Name));
  const chevWrites = c => ((c.Rewards || {}).StoryTags || []).filter(t => CHEV.test(t.Name));
  // Só conta como história a tag que outro evento lê com Equal/GreaterThan/GreaterThanOrEqual; chev_moral_dilemma é escrita e nunca lida.
  const READS = [1, 3, 4];
  const storyTags = () => {
    if (!storyTags.cache) storyTags.cache = new Set(h.events().flatMap(e => chevReqs(e).filter(t => READS.includes(t.Operator)).map(t => t.Name)));
    return storyTags.cache;
  };
  const midStory = e => chevReqs(e).some(t => READS.includes(t.Operator));
  const opensStory = e => chevReqs(e).some(t => t.Operator === 5);
  const startValue = (e, name) => { const r = chevReqs(e).find(t => t.Name === name); return !r || r.Operator === 5 ? 0 : r.Count; };

  // Valor de cada tag de história logo depois da escolha; null quando a escolha não mexe em nenhuma.
  function valuesAfter(e, c) {
    const writes = chevWrites(c).filter(t => storyTags().has(t.Name));
    if (!writes.length) return null;
    const out = new Map();
    for (const t of writes) out.set(t.Name, Math.max(0, startValue(e, t.Name) + t.Count));
    return out;
  }
  // Etapas que a escolha libera: o leitor precisa aceitar o valor novo em toda tag que a escolha escreveu, e nunca é o próprio evento.
  function nextEvents(e, c) {
    const after = valuesAfter(e, c);
    if (!after) return [];
    return h.events().filter(x => {
      if (x === e) return false;
      const reads = chevReqs(x).filter(t => after.has(t.Name) && READS.includes(t.Operator));
      return reads.length && reads.every(t => accepts(t, after.get(t.Name)));
    });
  }
  // kind: 'next' continua, 'ends' apaga a tag, 'stays' etapa do meio sem mexer na tag, 'unopened' primeira etapa sem abrir a história, '' fora de história.
  function chainOf(e, c) {
    const writes = chevWrites(c).filter(t => storyTags().has(t.Name));
    if (writes.some(t => t.Count < 0)) return { kind: 'ends', next: [] };
    const next = writes.length ? nextEvents(e, c) : [];
    if (next.length) return { kind: 'next', next };
    if (!writes.length && midStory(e)) return { kind: 'stays', next: [] };
    if (!writes.length && opensStory(e)) return { kind: 'unopened', next: [] };
    return { kind: writes.length ? 'later' : '', next: [] };
  }
  const chainKey = info => `${info.kind}:${info.next.map(x => x._slug).join(',')}`;
  // Sorteada: mais de uma etapa possível e toda escolha nelas apaga a tag, então só a primeira que sair acontece.
  const isOneOf = next => next.length > 1 && next.every(x => (x.Choices || []).every(c => chevWrites(c).some(t => t.Count < 0)));

  const choiceName = (lang, c) => { const t = h.tx(lang, c.ChoiceTerm); return t ? h.spanLang(lang, t) : ''; };
  const evLink = (lang, x) => h.link(lang, x, h.title(lang, x));
  const inQuotes = html => `“${html}”`;
  const lowerFirst = s => s.replace(/^(<[^>]+>)?(\p{Lu})/u, (m, tag, ch) => `${tag || ''}${ch.toLowerCase()}`);
  const orWord = lang => (lang === 'pt-BR' ? 'ou' : 'or');
  const joinWith = (list, word) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} ${word} ${list[list.length - 1]}` : list[0] || '');

  // ---------------------------------------------------------------- De onde vem e para onde vai
  function chainWriters(e) {
    const groups = [];
    for (const x of h.events()) {
      if (x === e) continue;
      const hits = (x.Choices || []).filter(c => nextEvents(x, c).includes(e));
      if (hits.length) groups.push({ x, hits, all: hits.length === (x.Choices || []).length });
    }
    return groups;
  }
  function chainFromText(lang, e) {
    const groups = chainWriters(e);
    if (!groups.length) return '';
    const pieces = groups.map(g => {
      const where = inQuotes(evLink(lang, g.x));
      if (g.all) return { 'pt-BR': `qualquer escolha em ${where}`, en: `any choice in ${where}` };
      const names = joinWith(g.hits.map(c => choiceName(lang, c)), orWord(lang));
      return { 'pt-BR': `escolher ${names} em ${where}`, en: `choosing ${names} in ${where}` };
    });
    const list = lang2 => joinWith(pieces.map(p => p[lang2]), lang2 === 'pt-BR' ? 'ou' : 'or');
    const lead = say(lang, P, 'follows earlier choice (StoryTags value vs TagRequirements)', {
      'pt-BR': `Vem depois de ${list('pt-BR')}. A partir daí entra no sorteio dos próximos turnos: não precisa sair no turno seguinte.`,
      en: `Follows ${list('en')}. From then on it joins the draw on later turns, so it may not appear on the very next one.`,
    });
    const siblings = groups.some(g => g.hits.some(c => { const n = nextEvents(g.x, c); return isOneOf(n) && n.includes(e); }));
    return siblings ? `${lead} ${say(lang, P, 'one of several endings (all choices erase the tag)', {
      'pt-BR': 'É uma das continuações possíveis, e só uma sai por história: qualquer escolha nela apaga a marca de que as outras precisam.',
      en: 'It is one of the possible continuations, and only one appears per story: any choice in it erases the mark the others need.',
    })}` : lead;
  }

  const DRAW = lang => say(lang, P, 'draw sentence (StoryTagHandler.TrySelectWeightedEvent, CanPayForEveryChoice)', {
    'pt-BR': 'A cada turno o jogo sorteia um evento entre os disponíveis, sem repetir os que você viu há pouco, e deixa de fora os que você não consegue pagar.',
    en: 'Each turn the game picks one event from those available, skipping any you have seen recently or cannot afford.',
  });
  const stripOwn = s => s.replace(/^(Você tem|You own) /, '');
  // Devolve o texto do bloco e se o bloco "Não acontece quando" ainda precisa aparecer.
  function when(lang, e, tags, blockers) {
    const chain = chainFromText(lang, e);
    const lockedInProgress = chevReqs(e).some(t => t.Operator === 5);
    const lock = lockedInProgress ? say(lang, P, 'story in progress lock (chev_ tag, Operator 5)', { 'pt-BR': 'Não sai enquanto esta história estiver em andamento.', en: 'It does not appear while this story is in progress.' }) : '';
    if (chain) {
      const needs = tags.length ? ` ${say(lang, P, 'chain plus held requirement (NonNegotiable TagRequirements)', { 'pt-BR': `Além disso, só sai enquanto ${tags.map(lowerFirst).join(' e ')}.`, en: `Also, it only appears while ${tags.map(lowerFirst).join(' and ')}.` })}` : '';
      return { text: `${chain}${needs}`, keepBlockers: true };
    }
    if (tags.length) return { text: [`${tags.join('. ')}.`, lock].filter(Boolean).join(' '), keepBlockers: true };
    if (blockers.length) {
      const names = blockers.map(stripOwn);
      return { text: `${say(lang, P, 'anyone without the repellant (Operator 5)', { 'pt-BR': `Qualquer jogador que não tenha ${joinWith(names, 'nem')}.`, en: `Any player who does not own ${joinWith(names, 'or')}.` })}`, keepBlockers: false };
    }
    if (lock) return { text: `${say(lang, P, 'anyone unless story in progress (chev_ tag, Operator 5)', { 'pt-BR': 'Qualquer jogador, menos enquanto esta história estiver em andamento.', en: 'Any player, except while this story is in progress.' })}`, keepBlockers: false };
    return { text: `${say(lang, P, 'no condition', { 'pt-BR': 'Sem condição: vale para qualquer jogador.', en: 'No condition: any player.' })}`, keepBlockers: false };
  }

  function chainNote(lang, e, c) {
    const info = chainOf(e, c);
    const para = html => `<p class="muted">${html}</p>`;
    if (info.kind === 'ends') return para(say(lang, P, 'chain ends (StoryTags Count -32768)', { 'pt-BR': 'Encerra esta história.', en: 'Ends this story.' }));
    if (info.kind === 'stays') return para(say(lang, P, 'chain stays put (empty StoryTags, TryToChooseEventForPlayer avoids the last 40 unless nothing else is left)', { 'pt-BR': 'A história fica parada: este evento pode sair de novo em outro sorteio. O jogo evita repetir os 40 últimos que você viu, a não ser que não sobre outro.', en: 'The story stays put: this event can appear again in another draw. The game avoids repeating the last 40 you saw, unless nothing else is left.' }));
    if (info.kind === 'unopened') return para(say(lang, P, 'chain not opened (empty StoryTags on first step)', { 'pt-BR': 'Não abre a história: nada vem depois desta escolha, a menos que este evento volte a sair.', en: 'It does not open the story: nothing follows this choice unless this event appears again.' }));
    if (info.kind === 'later') return para(say(lang, P, 'chain continues (StoryTags, no reader yet)', { 'pt-BR': 'Continua esta história em um evento futuro.', en: 'Continues this story in a later event.' }));
    if (info.kind !== 'next') return '';
    if (isOneOf(info.next)) {
      const list = info.next.map(x => {
        const blocks = h.conditions(lang, x, [5]).map(lowerFirst);
        return `${evLink(lang, x)}${blocks.length ? say(lang, P, 'continuation blocked (Operator 5)', { 'pt-BR': ` (não vem se ${blocks.join(' e ')})`, en: ` (does not come if ${blocks.join(' and ')})` }) : ''}`;
      });
      return para(say(lang, P, 'chain continues in one drawn (all next steps erase the tag)', { 'pt-BR': `A história continua em uma destas, sorteada: ${list.join(', ')}.`, en: `The story continues in one of these, drawn at random: ${list.join(', ')}.` }));
    }
    const list = info.next.map(x => evLink(lang, x));
    return para(say(lang, P, 'chain continues (StoryTags value vs TagRequirements)', { 'pt-BR': `A história continua em: ${list.join(', ')}.`, en: `The story continues in: ${list.join(', ')}.` }));
  }

  // ---------------------------------------------------------------- Somar o caminho até o fim
  // Soma só valores do mesmo atributo ou item; nunca converte um em outro.
  function addEntries(sum, c) {
    for (const r of h.visibleEntries((c.Rewards || {}).RewardEntries)) {
      const cur = sum.get(r.Id) || { entry: r, value: 0 };
      sum.set(r.Id, { entry: r, value: cur.value + r.Value });
    }
  }
  function walkPaths(e, c, base, seen, out, group) {
    const sum = new Map(base);
    addEntries(sum, c);
    const info = chainOf(e, c);
    if (info.kind !== 'next' || seen.has(e)) { out.push({ sum, group }); return; }
    const now = new Set(seen).add(e);
    const oneOf = isOneOf(info.next);
    for (const x of info.next) for (const d of x.Choices || []) walkPaths(x, d, sum, now, out, group || (oneOf ? x : null));
  }
  const sumText = (lang, sum) => {
    const rows = [...sum.values()].filter(x => x.value !== 0);
    if (!rows.length) return say(lang, P, 'path totals zero', { 'pt-BR': 'sem ganho nem perda', en: 'no gain or loss' });
    return joinWith(rows.map(x => (x.entry.Type === h.ITEM ? `${h.number(lang, x.value)} ${h.effectLabel(lang, x.entry)}` : `${h.formatValue(lang, x.value)} ${h.effectLabel(lang, x.entry)}`)), lang === 'pt-BR' ? 'e' : 'and');
  };
  function pathNote(lang, e, c) {
    const info = chainOf(e, c);
    if (info.kind !== 'next') return '';
    const paths = [];
    walkPaths(e, c, new Map(), new Set(), paths, null);
    if (!paths.length || paths.length > 8) return '';
    const groups = [...new Set(paths.map(p => p.group))];
    const lines = groups.map(g => {
      const texts = [...new Set(paths.filter(p => p.group === g).map(p => sumText(lang, p.sum)))];
      const body = g ? joinWith(texts, orWord(lang)) : texts.join(`; ${orWord(lang)} `);
      return g ? `${evLink(lang, g)}: ${body}` : body;
    });
    const needs = h.conditions(lang, info.next[0], [4]).filter(Boolean);
    const cond = needs.length && !isOneOf(info.next) ? ` ${say(lang, P, 'path needs item at next step (NonNegotiable TagRequirements)', { 'pt-BR': `Só chega lá se você ${lowerFirst(needs[0]).replace(/^você tem /, 'ainda tiver ')} quando a próxima etapa sair.`, en: `You only get there if you ${lowerFirst(needs[0]).replace(/^you own /, 'still own ')} when the next step appears.` })}` : '';
    return `<p class="verdict">${say(lang, P, 'path totals to the end (sum of RewardEntries per path)', { 'pt-BR': `Até o fim da história, somando esta escolha: ${lines.join('; ')}.`, en: `By the end of the story, counting this choice: ${lines.join('; ')}.` })}${cond}</p>`;
  }

  // ---------------------------------------------------------------- Valor do item ganho
  function itemWorth(lang, entry) {
    const it = h.byId.get(entry.Id);
    if (!it) return '';
    const qty = entry.Value || 1;
    // Comida (Purpose 6, Groceries) vai para a moradia; a Casa de Penhores só lista a mochila (PlayerState.GetAllSellableInventoryItemsFromInventory).
    const sell = it.Purpose === 6 ? 0 : (it.SellValue || 0) * qty;
    const points = it.ItemGroup === 1 && it.ScoreBonus > 0 ? it.ScoreBonus : 0;
    if (!sell && !points) return '';
    const sellPt = sell ? `Vale ${h.number(lang, sell)}${qty > 1 ? ' no total' : ''} na Casa de Penhores` : '';
    const sellEn = sell ? `Worth ${h.number(lang, sell)}${qty > 1 ? ' in total' : ''} at the Pawn Shop` : '';
    const ptsPt = points ? `${sell ? ' e dá ' : 'Dá '}${h.formatValue(lang, points)} pontos no fim da partida enquanto o móvel estiver colocado` : '';
    const ptsEn = points ? `${sell ? ' and gives ' : 'Gives '}${h.formatValue(lang, points)} points at the end of the game while the furniture is placed` : '';
    return say(lang, P, 'prize item worth (ItemData.SellValue, ScoreBonus)', { 'pt-BR': `${sellPt}${ptsPt}.`, en: `${sellEn}${ptsEn}.` });
  }

  // ---------------------------------------------------------------- Eventos com a mesma tela e resultado diferente
  const screenKey = e => [e.Title, e.Body, ...(e.Choices || []).map(c => c.ChoiceTerm)].map(t => { const x = h.tx('pt-BR', t); return x ? h.plain(x.html) : ''; }).join('|');
  const resultKey = e => JSON.stringify((e.Choices || []).map(c => h.visibleEntries((c.Rewards || {}).RewardEntries).map(r => [r.Id, r.Value, r.Type])));
  const screens = () => {
    if (!screens.cache) { screens.cache = new Map(); for (const e of h.events()) { const k = screenKey(e); screens.cache.set(k, [...(screens.cache.get(k) || []), e]); } }
    return screens.cache;
  };
  const sameScreen = e => screens().get(screenKey(e)) || [e];
  const twinFamily = e => { const all = sameScreen(e); return all.length > 1 && new Set(all.map(resultKey)).size > 1 ? all : null; };

  const SHOW_OUTCOMES = lang => say(lang, P, 'show outcomes option (ChoiceEventButtonContainer.SetData, GameRoomInfo.ChoiceEvents ShowResults)', {
    'pt-BR': 'Só dá para saber antes se a partida usar a opção Mostrar Consequências, em Eventos de Escolha, na personalização da partida: aí cada botão já mostra os números e os itens.',
    en: 'You can only tell beforehand if the game uses the Show Outcomes option, under Choice Events in the game customization: then each button already shows the numbers and items.',
  });

  function twinNote(lang, e, family) {
    const n = h.number(lang, family.length);
    const lead = say(lang, P, 'same screen different outcome (Title, Body, ChoiceTerm equal)', {
      'pt-BR': `O jogo tem ${n} eventos com esta mesma tela (título, texto e botões iguais), e só o resultado muda. Numa partida comum, os botões mostram apenas o texto, então não dá para saber qual deles saiu antes de escolher.`,
      en: `The game has ${n} events with this very screen (same title, text and buttons), and only the result differs. In a normal game the buttons show only their text, so you cannot tell which one you got before choosing.`,
    });
    const isCash = r => (h.byId.get(r.Id) || {}).m_Name === 'Cash';
    const paying = e.Choices.find(c => h.visibleEntries((c.Rewards || {}).RewardEntries).some(r => isCash(r) && r.Value < 0));
    const itemsOf = c => h.visibleEntries((c.Rewards || {}).RewardEntries).filter(r => r.Type === h.ITEM);
    let detail;
    if (paying && itemsOf(paying).length) {
      const idx = e.Choices.indexOf(paying);
      const cost = -h.visibleEntries((paying.Rewards || {}).RewardEntries).find(isCash).Value;
      const prizes = family.map(x => itemsOf(x.Choices[idx])[0]).filter(Boolean);
      const sold = r => (h.byId.get(r.Id).SellValue || 0) * r.Value;
      const named = r => `${h.effectLabel(lang, r)}${r.Value > 1 ? ` ×${h.number(lang, r.Value)}` : ''}`;
      const list = prizes.map(r => `${named(r)} (${say(lang, P, 'prize sell value in family', { 'pt-BR': `vale ${h.number(lang, sold(r))}`, en: `worth ${h.number(lang, sold(r))}` })})`).join(', ');
      const above = prizes.filter(r => sold(r) > cost).map(named), even = prizes.filter(r => sold(r) === cost).map(named);
      const verdictPt = [above.length ? `só ${joinWith(above, 'e')} ${above.length > 1 ? 'dão' : 'dá'} lucro sobre os ${h.number(lang, cost)} pagos` : '', even.length ? `${joinWith(even, 'e')} ${even.length > 1 ? 'empatam' : 'empata'}` : ''].filter(Boolean).join(', e ');
      const verdictEn = [above.length ? `only ${joinWith(above, 'and')} ${above.length > 1 ? 'turn' : 'turns'} a profit over the ${h.number(lang, cost)} paid` : '', even.length ? `${joinWith(even, 'and')} ${even.length > 1 ? 'break' : 'breaks'} even` : ''].filter(Boolean).join(', and ');
      detail = say(lang, P, 'storage auction family list (ItemData.SellValue vs price)', {
        'pt-BR': `Você paga ${h.number(lang, cost)} e só depois descobre o prêmio. Os ${n} possíveis, com a venda na Casa de Penhores: ${list}. Pela venda, ${verdictPt}. Alguns são móveis e também valem pontos: veja a página de cada um.`,
        en: `You pay ${h.number(lang, cost)} and only then find out the prize. The ${n} possible ones, with their Pawn Shop value: ${list}. By sale value, ${verdictEn}. Some are furniture and also give points: see each one's page.`,
      });
      const mine = itemsOf(paying)[0];
      const thisOne = say(lang, P, 'this page prize (ItemData)', { 'pt-BR': `Esta página é a variação que dá ${named(mine)}.`, en: `This page is the version that gives ${named(mine)}.` });
      const worth = itemWorth(lang, mine);
      detail = `${detail} ${thisOne}${worth ? ` ${worth}` : ''}`;
    } else {
      // Mesmo botão, sinais trocados: os dois lados do mesmo atributo.
      const values = [...new Set(family.flatMap(x => x.Choices.flatMap(c => h.visibleEntries((c.Rewards || {}).RewardEntries).map(r => h.formatValue(lang, r.Value)))))];
      const sample = h.visibleEntries((family[0].Choices[0].Rewards || {}).RewardEntries)[0];
      detail = say(lang, P, 'coin flip family (RewardEntries swap sides)', {
        'pt-BR': `Em um deles um botão ganha, no outro o mesmo botão perde: ao escolher, você leva ${joinWith(values, 'ou')} ${h.effectLabel(lang, sample)} sem saber qual.`,
        en: `In one of them a button wins, in the other that same button loses: when you choose, you get ${joinWith(values, 'or')} ${h.effectLabel(lang, sample)} without knowing which.`,
      });
    }
    return `${lead} ${detail} ${SHOW_OUTCOMES(lang)}`;
  }

  // ---------------------------------------------------------------- Comparar as escolhas
  // Compara atributo por atributo, sem supor quanto um vale no outro; Estresse conta ao contrário.
  function verdicts(lang, e) {
    const cs = e.Choices || [];
    const notes = cs.map(() => '');
    const differs = new Set(cs.map(c => chainKey(chainOf(e, c)))).size > 1;
    const paths = cs.map(c => (differs ? pathNote(lang, e, c) : ''));
    const finish = (summary, same) => ({ summary, same: !!same, notes: notes.map((n, i) => `${n ? `<p class="verdict">${n}</p>` : ''}${paths[i]}`) });
    if (cs.length < 2) return finish('');
    const family = twinFamily(e);
    if (family) return finish(twinNote(lang, e, family));
    const infos = cs.map(c => chainOf(e, c));
    const chainDiffers = new Set(infos.map(chainKey)).size > 1;
    const vecs = cs.map(c => { const v = new Map(); for (const r of h.visibleEntries((c.Rewards || {}).RewardEntries)) v.set(r.Id, { entry: r, value: ((v.get(r.Id) || {}).value || 0) + r.Value }); return v; });
    const keys = [...new Set(vecs.flatMap(v => [...v.keys()]))];
    const isStress = id => (h.byId.get(id) || {}).m_Name === 'Stress';
    const isFull = id => (h.byId.get(id) || {}).m_Name === 'Fullness';
    const worth = (v, id) => { const x = v.get(id); if (!x) return 0; return isStress(id) ? -x.value : x.value; };
    const sample = id => vecs.map(v => v.get(id)).find(Boolean).entry;
    const same = vecs.every(v => keys.every(id => worth(v, id) === worth(vecs[0], id)));
    if (same) return finish(chainDiffers
      ? say(lang, P, 'same numbers, chain differs (choice comparison)', { 'pt-BR': 'Os números são iguais em todas as opções. A diferença é como a história continua.', en: 'The numbers are the same for every choice. What differs is how the story goes on.' })
      : say(lang, P, 'same numbers (choice comparison)', { 'pt-BR': 'Todas as opções têm o mesmo resultado nos números. Só muda o texto, então escolha a que preferir.', en: 'All the choices have the same numbers. Only the text changes, so pick whichever you like.' }), true);
    const beats = (a, b) => keys.every(id => worth(a, id) >= worth(b, id)) && keys.some(id => worth(a, id) > worth(b, id));
    const best = chainDiffers ? -1 : vecs.findIndex((v, i) => vecs.every((o, j) => i === j || beats(v, o)));
    if (best >= 0) {
      notes[best] = say(lang, P, 'best choice (better or equal on every attribute, same story continuation)', { 'pt-BR': 'Melhor opção: dá o mesmo ou mais que as outras em tudo.', en: 'Best choice: it matches or beats the others across the board.' });
      return finish(tieSummary(lang, cs, vecs, keys, worth));
    }
    const label = (l, id) => h.effectLabel(l, sample(id));
    const andWord = l => (l === 'pt-BR' ? 'e' : 'and');
    const agora = (l, s) => (chainDiffers ? (l === 'pt-BR' ? `Agora, ${lowerFirst(s)}` : `For now, ${lowerFirst(s)}`) : s);
    vecs.forEach((v, i) => {
      const top = keys.filter(id => vecs.every((o, j) => i === j || worth(v, id) > worth(o, id)));
      const gains = top.filter(id => worth(v, id) > 0 && !isFull(id));
      const full = top.filter(id => worth(v, id) > 0 && isFull(id));
      const sav = top.filter(id => worth(v, id) <= 0 && !isStress(id));
      const noLoss = sav.filter(id => worth(v, id) === 0), lessLoss = sav.filter(id => worth(v, id) < 0);
      const stressTop = top.filter(id => isStress(id) && worth(v, id) <= 0);
      const want = (l, more, less) => gains.map(id => (sample(id).Type === h.ATTRIBUTE ? `${isStress(id) ? less : more} ${label(l, id)}` : `${l === 'pt-BR' ? 'ganhar' : 'getting'} ${label(l, id)}`));
      const parts = [];
      if (gains.length) parts.push(say(lang, P, 'choice wins on (choice comparison)', { 'pt-BR': `Escolha esta se o que você quer agora é ${joinWith(want('pt-BR', 'mais', 'menos'), 'e')}.`, en: `Pick this if you want ${joinWith(want('en', 'more', 'less'), 'and')}.` }));
      for (const id of gains.filter(g => sample(g).Type === h.ITEM)) { const worthText = itemWorth(lang, v.get(id).entry); if (worthText) parts.push(worthText); }
      if (full.length) parts.push(say(lang, P, 'fullness counts as a meal (AuthActionHandlerForPlayerState.ExecuteActionSuccess, HasEatenInTurn)', { 'pt-BR': `Se você ainda não comeu nesta rodada, esta opção conta como a refeição: o ${h.formatValue(lang, v.get(full[0]).value)} de ${label('pt-BR', full[0])} livra você da penalidade de fome no próximo início de rodada (veja o ${h.guideLink(lang, 'hunger', 'guia de Fome')}).`, en: `If you have not eaten this round yet, this choice counts as your meal: the ${h.formatValue(lang, v.get(full[0]).value)} ${label('en', full[0])} spares you the hunger penalty at the start of the next round (see the ${h.guideLink(lang, 'hunger', 'Hunger guide')}).` }));
      if (noLoss.length) parts.push(say(lang, P, 'choice does not lose (worth 0 against others that lose)', { 'pt-BR': agora('pt-BR', `Não perde ${joinWith(noLoss.map(id => label('pt-BR', id)), 'nem')}.`), en: agora('en', `You lose no ${joinWith(noLoss.map(id => label('en', id)), 'or')}.`) }));
      if (lessLoss.length) parts.push(say(lang, P, 'choice loses least (choice comparison)', { 'pt-BR': agora('pt-BR', `É a que perde menos ${joinWith(lessLoss.map(id => label('pt-BR', id)), 'e')}.`), en: agora('en', `It loses the least ${joinWith(lessLoss.map(id => label('en', id)), andWord('en'))}.`) }));
      if (stressTop.length) parts.push(say(lang, P, worth(v, stressTop[0]) === 0 ? 'choice avoids stress (Stress 0 against others that add)' : 'choice adds least stress', worth(v, stressTop[0]) === 0
        ? { 'pt-BR': agora('pt-BR', 'É a que não aumenta Estresse.'), en: agora('en', 'It is the one that does not raise Stress.') }
        : { 'pt-BR': agora('pt-BR', 'É a que menos aumenta Estresse.'), en: agora('en', 'It raises Stress the least.') }));
      notes[i] = parts.join(' ');
    });
    return finish(tieSummary(lang, cs, vecs, keys, worth));
  }
  // Empates entre escolhas de resultado idêntico, ou cada escolha tirando um atributo diferente.
  function tieSummary(lang, cs, vecs, keys, worth) {
    const nonzero = v => [...v.values()].filter(x => x.value !== 0);
    if (vecs.every(v => nonzero(v).length === 1 && nonzero(v)[0].value < 0) && new Set(vecs.map(v => nonzero(v)[0].entry.Id)).size === vecs.length) {
      return say(lang, P, 'each choice takes a different attribute (RewardEntries)', { 'pt-BR': 'Cada opção tira um atributo diferente: escolha o que você tem de sobra.', en: 'Each choice costs a different attribute, so pick the one you can spare.' });
    }
    const groups = new Map();
    vecs.forEach((v, i) => { const k = keys.map(id => worth(v, id)).join(','); groups.set(k, [...(groups.get(k) || []), i]); });
    const tied = [...groups.values()].filter(g => g.length > 1);
    if (!tied.length) return '';
    return tied.map(g => { const names = g.map(i => choiceName(lang, cs[i])); return say(lang, P, 'tied choices (equal RewardEntries)', { 'pt-BR': `${joinWith(names, 'e')} têm o mesmo resultado.`, en: `${joinWith(names, 'and')} have the same result.` }); }).join(' ');
  }

  // Nome igual, resultado igual: as duas páginas descrevem a mesma coisa.
  function sameName(lang, e, rest) {
    const family = twinFamily(e);
    if (family) return ''; // o texto da família, em "Qual escolher", já explica.
    const twins = h.events().filter(x => h.titleText(lang, x) === h.titleText(lang, e));
    if (twins.length === 2 && resultKey(twins[0]) === resultKey(twins[1]) && screenKey(twins[0]) === screenKey(twins[1])) {
      const other = twins.find(x => x !== e);
      return `<p class="muted">${say(lang, P, 'identical twin event (Title, Body, Choices, RewardEntries equal)', { 'pt-BR': `Existe ${h.link(lang, other, 'outro evento')} com este nome, e ele é idêntico a este: mesmo texto, mesmas escolhas e mesmos efeitos.`, en: `There is ${h.link(lang, other, 'another event')} with this name, and it is identical to this one: same text, same choices and same effects.` })}</p>`;
    }
    return rest();
  }

  // Avisos pontuais sobre o próprio texto do jogo.
  const BINARY = /^[01 ]+$/;
  const decode = s => s.split(/\s+/).map(b => String.fromCharCode(parseInt(b, 2))).join('');
  function textNote(lang, e) {
    const out = [];
    if (e.m_Name === 'Roleplay - High Stakes Adventure') out.push(say(lang, P, 'body says four doors (ChoiceEvent.Choices has two)', { 'pt-BR': 'O texto fala em quatro portas, mas este evento só tem duas escolhas: Norte e Sul.', en: 'The text mentions four doors, but this event only has two choices: North and South.' }));
    const raw = t => { const x = h.tx(lang, t); return x ? h.plain(x.html) : ''; };
    if (BINARY.test(raw(e.Title)) && BINARY.test(raw(e.Body))) {
      const ask = decode(raw(e.Body));
      const replies = (e.Choices || []).map(c => `<span lang="en">${h.esc(raw(c.ChoiceTerm))}</span> é a letra ${h.esc(decode(raw(c.ChoiceTerm)))} e a resposta é <span lang="en">${h.esc(decode(raw(c.OutcomeTerm)))}</span>`);
      out.push(say(lang, P, 'binary text decoded (ev_hacker_ terms)', { 'pt-BR': `O texto do evento está em binário. O título quer dizer <span lang="en">${h.esc(decode(raw(e.Title)))}</span> e a pergunta é <span lang="en">${h.esc(ask)}</span> (você é um otário?). ${replies.join('; ')}.`, en: `The event text is in binary. The title means ${h.esc(decode(raw(e.Title)))} and the question is ${h.esc(ask)}. ${replies.join('; ')}.` }));
    }
    return out.map(t => `<p class="muted">${t}</p>`).join('');
  }

  return { when, chainNote, verdicts, sameName, textNote, drawNote: DRAW };
};
