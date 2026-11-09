'use strict';
// Tabelas de loja das páginas de Local: uma por balcão, com item, Dinheiro, Tempo e quantidade.
// O preço é a entrada Cash de ChamberActionData.Rewards: é o que PerformNormalAction cobra (ver docs/engenharia-reversa.md, "Preço de loja").
// BuyValue só vale na Casa de Penhores e no conserto de roupa; o Cash de ItemData.Rewards nunca é cobrado.

module.exports = function (h) {
  const say = (lang, id, texts) => h.say(lang, 'locations', id, texts);
  const num = (lang, v) => h.number(lang, v);
  const entriesOf = r => (r && r.RewardEntries) || [];
  const attrNameOf = e => (h.byId.get(e.Id) || {}).m_Name;
  const TICKET = 'Ticket Currency';

  // Passos de Missão (QuestAction) já aparecem em "Durante missões" e não são loja.
  function sale(a) {
    if (/^Quest ?Action/.test(a.m_Name) || !h.hasText(a)) return null;
    const cash = -h.sumAttr(a.Rewards, 'Cash');
    if (cash <= 0) return null;
    const entries = entriesOf(a.Rewards);
    const items = entries.filter(e => e.Type === 50 && e.Value > 0).map(e => ({ it: h.byId.get(e.Id), qty: e.Value })).filter(x => x.it);
    const tickets = entries.filter(e => e.Type === 10 && attrNameOf(e) === TICKET && e.Value > 0).reduce((s, e) => s + e.Value, 0);
    const drawn = (a.WeightedRewards || []).flatMap(w => entriesOf(w.Reward)).filter(e => e.Type === 10 && attrNameOf(e) === TICKET).map(e => e.Value);
    if (!items.length && !tickets && !drawn.length) return null;
    const others = entries.filter(e => e.Type === 10 && ![TICKET, 'Cash', 'Time'].includes(attrNameOf(e)));
    return { a, cash, time: Math.abs(h.sumAttr(a.Rewards, 'Time')), items, tickets, drawn, others };
  }

  // Donos de um traço que adiciona a ação ao balcão: mapa, curso, papel ou item. Todos, não só o primeiro tipo.
  let index = null;
  function buildIndex() {
    const effects = new Map(), traits = new Map(), owners = new Map();
    const push = (map, key, v) => { if (key) { if (!map.has(key)) map.set(key, []); map.get(key).push(v); } };
    for (const [cls, recs] of Object.entries(h.RAW)) {
      if (!/TraitEffect/.test(cls)) continue;
      for (const e of recs) for (const x of Array.isArray(e.ChamberActions) ? e.ChamberActions : []) if (x) push(effects, x.id, e);
    }
    const traitList = h.RAW['Gameplay.Traits.Trait'] || [];
    for (const t of traitList) for (const x of t.Effects || []) if (x) push(traits, x.id, t);
    const byRecId = new Map(traitList.map(t => [t._id, t.Id]));
    const traitEntries = r => entriesOf(r).filter(e => e.Type === 110);
    for (const m of h.table('MapLayoutData')) for (const x of m.GlobalTraits || []) if (x) push(owners, byRecId.get(x.id), { map: m });
    for (const c of h.table('EducationData')) for (const e of traitEntries(c.CompletionReward)) push(owners, e.Id, { course: c });
    for (const it of h.table('ItemData')) if ([1, 3, 4, 7].includes(it.Purpose)) for (const e of traitEntries(it.Rewards)) push(owners, e.Id, { item: it });
    for (const role of h.roles) {
      for (const e of traitEntries(role.StartingReward)) push(owners, e.Id, { role });
      for (const l of role.LevelUpRewards || []) for (const x of l.AddTraits || []) if (x) push(owners, byRecId.get(x.id), { role, level: l.Level });
    }
    return { effects, traits, owners };
  }

  // Condição de uma ação acrescentada por traço. Devolve '' se a ação está sempre no balcão.
  function condition(lang, s, ch, isExtra) {
    if (!isExtra) return '';
    if (!index) index = buildIndex();
    const found = (index.effects.get(s.a._id) || []).filter(e => (e.Chambers || []).some(x => x && x.id === ch._id))
      .flatMap(e => index.traits.get(e._id) || []).flatMap(t => index.owners.get(t.Id) || []);
    const seen = new Set();
    const parts = [];
    for (const o of found) {
      const key = o.map ? `m${o.map._id}` : o.course ? `c${o.course._id}` : o.role ? `r${o.role._id}` : `i${o.item._id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (o.map) parts.push(say(lang, 'shop condition map (MapLayoutData.GlobalTraits)', { 'pt-BR': `Só no mapa ${h.esc(o.map.m_Name)}`, en: `Only on the ${h.esc(o.map.m_Name)} map` }));
      else if (o.course) parts.push(say(lang, 'shop condition course (EducationData.CompletionReward)', { 'pt-BR': `Depois de concluir ${h.link(lang, o.course, h.title(lang, o.course))}`, en: `After finishing ${h.link(lang, o.course, h.title(lang, o.course))}` }));
      else if (o.role) parts.push(say(lang, 'shop condition role (Role.StartingReward, LevelUpRewards.AddTraits)', { 'pt-BR': `Com o papel ${h.link(lang, o.role, h.title(lang, o.role))}${o.level ? `, nível ${num(lang, o.level)}` : ''}`, en: `With the ${h.link(lang, o.role, h.title(lang, o.role))} role${o.level ? `, level ${num(lang, o.level)}` : ''}` }));
      else parts.push(say(lang, 'shop condition item (ItemData.Rewards)', { 'pt-BR': `Com ${h.link(lang, o.item, h.title(lang, o.item))}`, en: `With ${h.link(lang, o.item, h.title(lang, o.item))}` }));
    }
    if (parts.length) return parts.join('; ');
    const origin = h.LOC.actionOrigin(s.a, ch);
    return h.LOC.originHtml(lang, origin) || say(lang, 'shop condition unknown (no owner found for the trait)', { 'pt-BR': 'Condição desconhecida', en: 'Unknown condition' });
  }

  const ticketWord = (lang, v) => say(lang, 'shop tickets (Ticket Currency)', { 'pt-BR': `${v === '1' ? '1 bilhete' : `${v} bilhetes`} de Metrô`, en: `${v === '1' ? '1 Metro ticket' : `${v} Metro tickets`}` });
  // Chance igual entre as faixas de WeightedRewards (todas com peso 1 nas ações de bilhete).
  function received(lang, s) {
    const bits = [];
    for (const { qty } of s.items) bits.push(qty > 1 ? say(lang, 'shop stack (ChamberActionData.Rewards Type 50)', { 'pt-BR': `${num(lang, qty)} unidades (${num(lang, Math.round(s.cash / qty))} cada)`, en: `${num(lang, qty)} units (${num(lang, Math.round(s.cash / qty))} each)` }) : num(lang, qty));
    if (s.tickets) bits.push(ticketWord(lang, num(lang, s.tickets)) + (s.tickets > 1 ? ` <span class="muted">${say(lang, 'shop unit price', { 'pt-BR': `(${num(lang, Math.round(s.cash / s.tickets))} cada)`, en: `(${num(lang, Math.round(s.cash / s.tickets))} each)` })}</span>` : ''));
    if (s.drawn.length) {
      const min = Math.min(...s.drawn), max = Math.max(...s.drawn);
      bits.push(say(lang, 'shop drawn tickets (WeightedRewards)', { 'pt-BR': `De ${num(lang, min)} a ${num(lang, max)} bilhetes de Metrô, ao acaso`, en: `${num(lang, min)} to ${num(lang, max)} Metro tickets, at random` }));
    }
    const extra = s.others.length ? h.effects(lang, s.others) : '';
    const wait = s.a.Cooldown ? `<p class="muted">${s.a.Cooldown === 1 ? say(lang, 'shop limit 1 (ChamberActionData.Cooldown)', { 'pt-BR': '1 vez por rodada', en: 'Once per round' }) : say(lang, 'shop limit n (ChamberActionData.Cooldown)', { 'pt-BR': `1 vez a cada ${num(lang, s.a.Cooldown)} rodadas`, en: `Once every ${num(lang, s.a.Cooldown)} rounds` })}</p>` : '';
    return `${bits.join('<br>')}${extra}${wait}`;
  }

  const nameCell = (lang, s) => (s.items.length
    ? s.items.map(({ it }) => `${h.itemIcon(it, 24)}${h.link(lang, it, h.title(lang, it))}`).join('<br>')
    : `${h.artIcon('action', s.a, 24)}${h.title(lang, s.a)}`);

  const noted = new Set();
  // Separa o que é loja do resto da sala. O resto continua no quadro normal de ações.
  function room(lang, loc, ch, actions, extras) {
    const base = actions.map(a => sale(a)).filter(Boolean);
    const added = extras.map(a => sale(a)).filter(Boolean);
    const onSale = new Set([...base, ...added].map(s => s.a));
    const rest = { actions: actions.filter(a => !onSale.has(a)), extras: extras.filter(a => !onSale.has(a)) };
    if (!onSale.size) return { html: '', ...rest };
    const rows = [...base.map(s => ({ s, isExtra: false })), ...added.map(s => ({ s, isExtra: true }))];
    const withCondition = rows.map(r => ({ ...r, cond: condition(lang, r.s, ch, r.isExtra) }));
    const showCondition = withCondition.some(r => r.cond);
    const heads = [
      h.ui(lang, 'name'), h.attrName(lang, 'Cash'), h.attrName(lang, 'Time'),
      say(lang, 'shop col receive', { 'pt-BR': 'Você recebe', en: 'You get' }),
      ...(showCondition ? [say(lang, 'shop col condition', { 'pt-BR': 'Quando aparece', en: 'When it shows up' })] : []),
    ];
    const always = say(lang, 'shop always', { 'pt-BR': 'Sempre', en: 'Always' });
    const table = h.simpleTable(heads, withCondition.map(({ s, cond }) => [nameCell(lang, s), num(lang, s.cash), num(lang, s.time), received(lang, s), ...(showCondition ? [cond || always] : [])]));
    const key = `${lang}|${loc._id}`;
    const note = noted.has(key) ? '' : `<p class="ledger-note">${say(lang, 'shop price note (PerformNormalAction reads ChamberActionData.Rewards, TraitHandler.CheckForChamberAction)', {
      'pt-BR': 'Preço normal, sem descontos. Características de papéis, signos, empregos e eventos podem mudar o valor na hora da compra.',
      en: 'Normal price, with no discounts. Traits from roles, signs, jobs and events can change the amount at the moment you buy.',
    })}</p>`;
    noted.add(key);
    return { html: `<h3>${say(lang, 'shop head', { 'pt-BR': 'À venda', en: 'For sale' })}</h3>${table}${note}`, ...rest };
  }

  return { room };
};
