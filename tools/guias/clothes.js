'use strict';
// Guia "Roupas e desgaste". Regras: JobHandler.CanApplyForJob (nível pedido ou maior), ItemData.Durability, HandleEquipmentDurability,
// ChamberActionData Buy Basic/Casual/Fancy/Tier 4 Clothes (Dinheiro e -50 Tempo), PerformNormalAction case 8 (consertar: 1 de durabilidade, 65% de volta, 60% do BuyValue + 100 de Tempo).
module.exports = getH => ({
  slug: 'clothes',
  title: { 'pt-BR': 'Roupas e desgaste', en: 'Clothes and wear' },
  sections: (lang, s) => {
    const H = getH();
    const n = v => H.number(lang, v);
    const list = H.items.filter(i => i.ItemSubGroup === 5).sort((a, b) => a.Tier - b.Tier);
    const naked = list[0];
    const fits = i => H.jobs.filter(j => !H.artistJobs.has(j._id) && j.RequiredEquippedItemTier <= i.Tier).length;
    const fix = H.repairAction();
    const buyAct = i => H.table('ChamberActionData').find(a => a.Rewards.RewardEntries.some(e => e.Id === i.Id && e.Type === 50) && H.sumAttr(a.Rewards, 'Cash') < 0);
    const timeToBuy = i => { const a = buyAct(i); return a ? n(-H.sumAttr(a.Rewards, 'Time')) : '-'; };
    return [
      ['', `<p>${s('intro (JobHandler.CanApplyForJob, ItemData.Durability)', { 'pt-BR': `Todo emprego pede um nível mínimo de roupa. E roupa se gasta: cada uma dura um certo número de rodadas. Quando acaba, você fica ${H.link(lang, naked, H.title(lang, naked))}, que só serve para ${fits(naked)} empregos. Onde comprar: ${H.clothesShops(lang, list[1])}.`, en: `Every job asks for a minimum clothing tier. And clothes wear out: each outfit lasts a set number of rounds. When it runs out you end up ${H.link(lang, naked, H.title(lang, naked))}, which only works for ${fits(naked)} jobs. Where to buy: ${H.clothesShops(lang, list[1])}.` })}</p>`],
      [s('tiers', { 'pt-BR': 'As roupas', en: 'The outfits' }), H.simpleTable([H.ui(lang, 'name'), H.ui(lang, 'tier'), s('col price', { 'pt-BR': 'Preço na loja', en: 'Shop price' }), s('col time', { 'pt-BR': 'Tempo para comprar', en: 'Time to buy' }), s('col lasts', { 'pt-BR': 'Dura quantas rodadas', en: 'Lasts how many rounds' }), s('col fits', { 'pt-BR': 'Empregos que aceitam', en: 'Jobs that accept it' })], list.map(i => [`${H.itemIcon(i, 24)}${H.link(lang, i, H.title(lang, i))}`, i.Tier, H.buyPrice(i) ? n(H.buyPrice(i)) : H.esc(H.ui(lang, 'notForSale')), timeToBuy(i), i.Durability > 0 ? i.Durability : s('no wear', { 'pt-BR': 'Não se gasta', en: 'Does not wear out' }), fits(i)]))],
      [s('rule', { 'pt-BR': 'Qual roupa serve', en: 'Which outfit works' }), `<p>${s('tier rule (JobHandler.CanApplyForJob)', { 'pt-BR': 'Um emprego aceita o nível que ele pede ou qualquer nível maior. Roupa melhor nunca atrapalha.', en: 'A job accepts the tier it asks for or any higher tier. Better clothes never get in the way.' })} ${s('wear rule (HandleEquipmentDurability)', { 'pt-BR': 'A durabilidade cai no início do seu turno, e o jogo avisa quando falta só 1.', en: 'Durability drops at the start of your turn, and the game warns you when only 1 is left.' })}</p>`],
      [H.title(lang, fix), `<p>${s('repair (PerformNormalAction, RepairClothesCostFraction, ItemData.BuyValue)', { 'pt-BR': `Em vez de comprar outra, você pode consertar a roupa que está usando. Só dá para consertar quando falta exatamente 1 rodada de durabilidade. Custa ${n(-H.sumAttr(fix.Rewards, 'Time'))} de Tempo mais o Dinheiro da tabela, e a roupa volta com 65% da durabilidade total, arredondado para cima. Onde: ${H.placesOf(lang, H.actionHome.get(fix._id) || [])}.`, en: `Instead of buying another, you can repair the outfit you are wearing. You can only repair with exactly 1 round of durability left. It costs ${n(-H.sumAttr(fix.Rewards, 'Time'))} Time plus the Cash in the table, and the outfit comes back with 65% of its full durability, rounded up. Where: ${H.placesOf(lang, H.actionHome.get(fix._id) || [])}.` })}</p>${H.simpleTable([H.ui(lang, 'name'), s('col repair', { 'pt-BR': 'Custo do conserto', en: 'Repair cost' }), s('col back', { 'pt-BR': 'Volta com (rodadas)', en: 'Comes back with (rounds)' })], list.filter(i => i.BuyValue > 0).map(i => [`${H.itemIcon(i, 24)}${H.link(lang, i, H.title(lang, i))}`, n(Math.round(i.BuyValue * H.REPAIR_FRACTION)), Math.ceil(i.Durability * 0.65)]))}`],
    ];
  },
});
