'use strict';
// Guia "Moradia e aluguel". Regras: HomeData (Rent, RentScore, MaxFurnitureTier, SecurityLevel, Locations), ChamberActionData Rent * Action (custo de se mudar),
// RentHandler.RoundsBetweenRentPayments (4), HandleApartmentSwitch (móveis que não cabem são penhorados). Dívida e despejo ficam no guia "debt".
module.exports = getH => ({
  slug: 'housing',
  title: { 'pt-BR': 'Moradia e aluguel', en: 'Housing and rent' },
  sections: (lang, s) => {
    const H = getH();
    const n = v => H.number(lang, v);
    const d = H.langDir(lang);
    const homes = H.table('HomeData').sort((a, b) => a.Rent - b.Rent);
    const paid = homes.filter(h => h.Rent > 0);
    const move = { 'Slum Apartment': 'Rent Basement Action', 'Mid Apartment': 'Rent Crappy Action', 'Fancy Apartment': 'Rent Fancy Action', Outside: 'Rent Park Action' };
    const mapName = m => (m.m_Name === 'schnitzelland-v3' ? 'Schnitzelland' : m.m_Name);
    const maps = H.table('MapLayoutData');
    const whereOn = h => {
      const parts = [];
      for (const m of maps) {
        const names = [...new Set((h.Locations || []).map(H.deref).filter(l => l && l._slug && (m.LocationData || []).some(x => x && x.id === l._id)).map(l => l))];
        if (!names.length) continue;
        const byTitle = new Map();
        for (const l of names) byTitle.set(H.titleText(lang, l), l);
        parts.push(`${mapName(m)}: ${[...byTitle.values()].map(l => H.link(lang, l, H.title(lang, l))).join(', ')}`);
      }
      return parts.join('<br>');
    };
    const costOf = h => {
      const a = H.table('ChamberActionData').find(x => x.m_Name === move[h.m_Name]);
      return a ? H.effects(lang, a.Rewards.RewardEntries.filter(e => e.Type === 10)) : '';
    };
    const guide = (slug, pt, en) => `<a href="/${d}/guides/${slug}/">${s(`link ${slug}`, { 'pt-BR': pt, en })}</a>`;
    return [
      ['', `<p>${s('intro (HomeData)', { 'pt-BR': 'Sua casa é onde você dorme, reduz o Estresse e coloca seus móveis. Moradia melhor custa mais, mas rende mais pontos a cada aluguel pago e aceita móveis melhores. Quem está sem casa dorme no parque. Porão e Quitinete ficam no mesmo prédio (Apartamentos Baratos, na maioria dos mapas): você escolhe qual alugar na hora.', en: 'Your home is where you sleep, lower Stress and place your furniture. A better home costs more, but earns more points per rent paid and takes better furniture. Anyone without a home sleeps in the Park. Basement and Studio sit in the same building (Cheap Apartments on most maps): you pick which to rent on the spot.' })}</p>`],
      [H.ui(lang, 'homes'), `${H.simpleTable([H.ui(lang, 'name'), H.ui(lang, 'rent'), s('col pts', { 'pt-BR': 'Pontos por aluguel pago', en: 'Points per rent paid' }), s('col furn', { 'pt-BR': 'Móveis até o nível', en: 'Furniture up to tier' }), s('col sec', { 'pt-BR': 'Segurança', en: 'Security' }), s('col move (Rent * Action)', { 'pt-BR': 'Custo de se mudar para lá', en: 'Cost to move in' }), s('col where', { 'pt-BR': 'Como aparece em cada mapa', en: 'Where on each map' })], homes.map(h => [H.title(lang, h), h.Rent ? n(h.Rent) : s('no rent', { 'pt-BR': 'Sem aluguel', en: 'No rent' }), h.RentScore ? n(h.RentScore) : '-', h.MaxFurnitureTier || s('no furniture', { 'pt-BR': 'Sem móveis', en: 'No furniture' }), `${Math.round(h.SecurityLevel * 100)}%`, costOf(h), whereOn(h)]))}<p>${s('park (HomeData Outside, Rent Park Action)', { 'pt-BR': 'A Campina do Parque é o que sobra quando você não tem casa, inclusive depois de um despejo. Não tem aluguel, mas também não tem móveis, pontos de aluguel nem segurança. Voltar a morar no parque custa só Tempo.', en: 'If you have no home, including after an eviction, you live in the Park. No rent, but also no furniture, rent points or security. Moving back to the Park costs only Time.' })}</p><p>${s('security (gevent_crime_wave_effect_description)', { 'pt-BR': 'Quanto maior a Segurança, menor a chance de ser roubado durante uma Onda de Crimes.', en: 'The higher the Security, the lower the chance of being robbed during a Crime Wave.' })} ${guide('global-events', 'Eventos Globais', 'Global Events')}</p>`],
      [s('moving', { 'pt-BR': 'Mudar de casa', en: 'Moving' }), `<p>${s('moving rule (Rent * Action, HandleApartmentSwitch)', { 'pt-BR': 'Mudar custa o Tempo e o Dinheiro da tabela, na hora. Os móveis que não cabem na casa nova (nível acima do aceito ou vagas especiais a menos) são vendidos na Casa de Penhores pelo valor de penhor, e você recebe o Dinheiro.', en: 'Moving costs the Time and Cash in the table, right away. Furniture that does not fit the new home (tier too high or fewer special slots) is sold at the Pawn Shop at the pawn value, and you get the Cash.' })} ${guide('pawn-shop', 'Casa de Penhores', 'Pawn Shop')}</p>`],
      [H.ui(lang, 'rent'), `<p>${s('rent cycle (RentHandler.RoundsBetweenRentPayments)', { 'pt-BR': `O aluguel vence a cada 4 rodadas, seja qual for a duração da partida. Partida mais longa significa mais aluguéis para pagar e mais pontos por pagá-los (de ${n(paid[0].RentScore)} a ${n(paid[paid.length - 1].RentScore)} por pagamento, conforme a casa). Para pagar, fale com a proprietária.`, en: `Rent comes due every 4 rounds, whatever the game length. A longer game means more rents to pay and more points for paying them (from ${n(paid[0].RentScore)} to ${n(paid[paid.length - 1].RentScore)} per payment, depending on the home). To pay, talk to the landlady.` })}</p>`],
      [s('debt', { 'pt-BR': 'Se você não pagar', en: 'If you do not pay' }), `<p>${s('debt pointer', { 'pt-BR': 'A dívida cresce com juros, parte do seu salário passa a pagá-la, móveis são penhorados e, se o atraso continuar, você é despejado. O passo a passo, com os números, está no guia de Dívida e despejo.', en: 'The debt grows with interest, part of your salary goes to it, furniture is pawned and, if you keep falling behind, you are evicted. The full breakdown, with numbers, is in the Debt and eviction guide.' })} ${guide('debt', 'Dívida e despejo', 'Debt and eviction')}</p>`],
    ];
  },
});
