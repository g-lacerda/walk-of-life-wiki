'use strict';
// Guia "Metrô e mapas". Regras: MapLayoutData.LocationData (lugares de cada mapa, comparados pelo título), MapLayoutData.SlotPortalingCost (viagem de metrô: -10 Tempo e -1 bilhete, só em Chailand),
// AttributeData Ticket Currency (AccumulativeValue -1: o bilhete cai 1 por rodada, por isso "acesso por N rodadas"), ChamberActionData Metro Ticket/Pass, Used Metro Pass (1 a 5 bilhetes, peso igual).
module.exports = getH => ({
  slug: 'maps',
  title: { 'pt-BR': 'Metrô e mapas', en: 'Metro and maps' },
  sections: (lang, s) => {
    const H = getH();
    const n = v => H.number(lang, v);
    const d = H.langDir(lang);
    const mapName = m => (m.m_Name === 'schnitzelland-v3' ? 'Schnitzelland' : m.m_Name);
    const layouts = H.table('MapLayoutData').map(m => ({ m, list: (m.LocationData || []).map(H.deref).filter(l => l && l._slug) }));
    // Several map-specific buildings share one name ("Metrô 1" and "Metrô 2", "Apartamentos Baratos" on three maps), so places are compared by title.
    const titleOf = l => H.titleText(lang, l).replace(/\s+\d+$/, '');
    const byTitle = new Map();
    for (const { list } of layouts) for (const l of list) { const k = titleOf(l); if (!byTitle.has(k)) byTitle.set(k, l); }
    const onMap = (k, entry) => entry.list.some(l => titleOf(l) === k);
    const rows = [...byTitle.entries()].map(([k, l]) => ({ k, l, on: layouts.map(e => onMap(k, e)) })).sort((a, b) => a.on.filter(Boolean).length - b.on.filter(Boolean).length || a.k.localeCompare(b.k, lang));
    const exclusive = i => rows.filter(r => r.on.filter(Boolean).length === 1 && r.on[i]).map(r => H.link(lang, r.l, H.esc(r.k))).join(', ') || s('no exclusive', { 'pt-BR': 'Nenhum', en: 'None' });
    const mark = v => (v ? '✓' : '-');
    const metroMaps = layouts.filter(x => x.list.some(l => /Metro/.test(l.m_Name))).map(x => H.esc(mapName(x.m))).join(', ');
    const cost = layouts.map(x => x.m.SlotPortalingCost).find(c => c && (c.RewardEntries || []).length);
    const fares = H.table('ChamberActionData').filter(a => /Metro Ticket$|Metro Pass$|Metroburger and Ticket$/.test(a.m_Name) && H.sumAttr(a.Rewards, 'Ticket Currency') > 0 && H.hasText(a)).sort((a, b) => H.sumAttr(a.Rewards, 'Ticket Currency') - H.sumAttr(b.Rewards, 'Ticket Currency') || H.sumAttr(b.Rewards, 'Cash') - H.sumAttr(a.Rewards, 'Cash'));
    const used = H.table('ChamberActionData').find(a => a.m_Name === 'Used Metro Pass');
    const guide = (slug, pt, en) => `<a href="/${d}/guides/${slug}/">${s(`link ${slug}`, { 'pt-BR': pt, en })}</a>`;
    return [
      ['', `<p>${s('intro (MapLayoutData)', { 'pt-BR': `O jogo tem ${layouts.length} mapas: ${layouts.map(x => H.esc(mapName(x.m))).join(', ')}. Muitos lugares existem em todos, mas cada mapa tem os seus próprios, e isso muda o que dá para fazer na partida. O mapa é escolhido ao criar a partida.`, en: `The game has ${layouts.length} maps: ${layouts.map(x => H.esc(mapName(x.m))).join(', ')}. Many places exist on all of them, but each map has some of its own, and that changes what you can do in the game. The map is chosen when the game is set up.` })}</p>`],
      [H.ui(lang, 'maps'), `${H.simpleTable([s('col place', { 'pt-BR': 'Lugar', en: 'Place' }), ...layouts.map(e => H.esc(mapName(e.m)))], rows.map(r => [H.link(lang, r.l, H.esc(r.k)), ...r.on.map(mark)]))}<p><strong>${s('exclusive title', { 'pt-BR': 'Só em um mapa:', en: 'On one map only:' })}</strong></p><ul class="plain">${layouts.map((e, i) => `<li><strong>${H.esc(mapName(e.m))}</strong>: ${exclusive(i)}</li>`).join('')}</ul><p>${s('homes note', { 'pt-BR': 'Os nomes das moradias mudam de mapa para mapa (por exemplo, a Quitinete é a Casa Adequada em Chailand, e a moradia Chique é o Castelo Von Chucrut em Schnitzelland).', en: 'Home names change from map to map (for example, the Studio is the Adequate Home on Chailand, and the Fancy home is Castle Von Schnitzel on Schnitzelland).' })} ${guide('housing', 'Moradia e aluguel', 'Housing and rent')}</p>`],
      [s('metro', { 'pt-BR': 'Metrô', en: 'Metro' }), `<p>${s('metro (MapLayoutData.SlotPortalingCost, Ticket Currency)', { 'pt-BR': `O Metrô liga uma estação a outra, do lado oposto do mapa, e existe só em ${metroMaps}. Cada viagem custa ${cost ? n(-H.sumAttr(cost, 'Time')) : ''} de Tempo e exige ter pelo menos 1 bilhete, mas a viagem não gasta o bilhete. O bilhete é um saldo que cai 1 por rodada, e é por isso que o jogo descreve cada compra como "acesso por N rodadas": N bilhetes duram N rodadas, por mais viagens que você faça.`, en: `The Metro links one station to the other, across the map, and exists only on ${metroMaps}. Each ride costs ${cost ? n(-H.sumAttr(cost, 'Time')) : ''} Time and requires at least 1 ticket, but the ride does not spend the ticket. The ticket is a balance that drops by 1 per round, which is why the game describes each purchase as "access for N rounds": N tickets last N rounds, however many rides you take.` })}</p>${H.simpleTable([s('col fare', { 'pt-BR': 'Opção', en: 'Option' }), s('col cash', { 'pt-BR': 'Dinheiro', en: 'Cash' }), s('col time', { 'pt-BR': 'Tempo', en: 'Time' }), s('col tickets', { 'pt-BR': 'Bilhetes (= rodadas de acesso)', en: 'Tickets (= rounds of access)' }), s('col perticket', { 'pt-BR': 'Dinheiro por bilhete', en: 'Cash per ticket' }), H.ui(lang, 'location')], [...fares.map(a => { const t = H.sumAttr(a.Rewards, 'Ticket Currency'), c = -H.sumAttr(a.Rewards, 'Cash'); return [H.title(lang, a), n(c), n(-H.sumAttr(a.Rewards, 'Time')), n(t), /Metroburger/.test(a.m_Name) ? s('burger (food included)', { 'pt-BR': 'inclui comida', en: 'food included' }) : n(Math.round(c / t * 10) / 10), H.placesOf(lang, H.actionWhere(a)) || (a.m_Name === 'Student Metro Pass' ? s('student pass place (Chai-Metro-Add-Tickets-Academy aponta para Academy Registration, sala fora de LocationData.Chambers)', { 'pt-BR': 'Não confirmado', en: 'Not confirmed' }) : '-')]; }), ...(used ? [[H.title(lang, used), n(-H.sumAttr(used.Rewards, 'Cash')), n(-H.sumAttr(used.Rewards, 'Time')), s('used pass (Used Metro Pass.WeightedRewards)', { 'pt-BR': '1 a 5, sorteados na compra', en: '1 to 5, drawn at purchase' }), n(Math.round(-H.sumAttr(used.Rewards, 'Cash') / 3 * 10) / 10) + ' ' + s('on average', { 'pt-BR': '(em média)', en: '(on average)' }), H.placesOf(lang, H.actionWhere(used))]] : [])])}`],
    ];
  },
});
