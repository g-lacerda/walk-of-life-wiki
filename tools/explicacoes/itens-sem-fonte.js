'use strict';
// Itens cuja origem não foi encontrada. Cada frase cita o dado ou o método conferido (docs/engenharia-reversa.md, "Ausência não é prova").
// Regra: nunca dizer que o item não existe; dizer o que os dados mostram e que a fonte é desconhecida.
const PORCENTO_MINERIO = { Kernite: 8, Omber: 18, Scordite: 32, Veldspar: 42 }; // ChamberActionData "Go Mining".WeightedRewards, soma dos pesos 100

function premios(K) {
  const a = K.c.table('ChamberActionData').find(x => x.m_Name === 'Get Friendship Crate Rewards');
  const lista = (a.WeightedRewards || []).flatMap(w => w.Reward.RewardEntries).map(e => { const i = K.c.byId.get(e.Id); return `${K.n(e.Value)} ${K.item(i.m_Name)}`; });
  return lista.join(', ');
}

module.exports = function notas(K, it) {
  const s = (id, pt, en) => K.s(id, pt, en);
  const nome = it.m_Name;
  if (nome === 'Mining Laser') return [
    s('source unknown: Buy Mining Laser has no room', 'Não encontramos de onde ele vem. Os dados têm uma ação de compra (Comprar Laser de Mineração: 50 de Tempo e 100 de Dinheiro), mas não achamos sala, traço, modificador, evento ou desafio que a coloque no jogo.', 'We have not found where it comes from. The data have a purchase action (Buy Mining Laser: 50 Time and 100 Cash), but we found no room, trait, modifier, event or challenge that puts it in the game.'),
  ];
  if (PORCENTO_MINERIO[nome]) return [
    s(`source: Go Mining WeightedRewards (${nome})`, `Sai da ação Minerar, na sala Áreas Comuns (100 de Tempo, ${PORCENTO_MINERIO[nome]}% de chance). Essa ação só é acrescentada por quem tem o Laser de Mineração, e não encontramos de onde o laser vem nem em que lugar do mapa essa sala fica.`, `It comes from the Go Mining action in the Commons room (100 Time, ${PORCENTO_MINERIO[nome]}% chance). Only owning the Mining Laser adds that action, and we have not found where the laser comes from or where on the map that room is.`),
  ];
  if (nome === 'One Week Healthy Food') return [
    s('source unknown: Cleansing Food has no room', 'Não encontramos de onde ela vem. Os dados têm uma ação de compra (Comida Detox: 25 de Tempo e 120 de Dinheiro), mas não achamos sala, traço, modificador, evento ou desafio que a coloque no jogo.', 'We have not found where it comes from. The data have a purchase action (Cleansing Food: 25 Time and 120 Cash), but we found no room, trait, modifier, event or challenge that puts it in the game.'),
  ];
  if (nome === 'Dirty Money') return [
    s('source unknown: no reward gives Dirty Money', 'Não encontramos nada que entregue este item.', 'We have not found anything that gives this item.'),
    s('use: Wash Dirty Money (RequiredItems, Can-Wash-Dirty-Cash in Scavenge-Level-01)', 'A ação Lavar Dinheiro Sujo exige 1 dele e dá 50 de Dinheiro por 50 de Tempo, na sala Áreas Comuns, que não encontramos em nenhum lugar do mapa. Quem acrescenta essa ação é um traço que também não encontramos sendo concedido.', 'The Wash Dirty Money action needs 1 of it and gives 50 Cash for 50 Time, in the Commons room, which we have not found anywhere on the map. That action is added by a trait we also have not found being granted.'),
  ];
  if (nome === 'Lost Homework') return [
    s('source unknown: no reward gives Lost Homework', 'Não encontramos nada que entregue este item.', 'We have not found anything that gives this item.'),
    s('use: Hand in Lost Homework (RequiredItems, Return-Lost-Homework-Trait)', 'Quem o tem recebe um traço ligado à ação Devolver dever de casa perdido, que exige o item e custa 100 de Tempo. O que a devolução rende ainda não foi conferido.', 'Owning it gives a trait tied to the Return lost homework action, which needs the item and costs 100 Time. What returning it pays has not been checked yet.'),
  ];
  if (nome === 'Box of Plagues') return [
    s('source unknown: Cultist - Pick up box of plagues gives only Time', 'Não encontramos nada que coloque este item na mochila. Um ritual do Cultista tem a ação Pegar Caixa de Pragas, na sala Comprar Penhores da Casa de Penhores, mas nos dados essa ação só gasta 25 de Tempo.', 'We have not found anything that puts this item in your inventory. A Cultist ritual has the Pick up Box of Plagues action, in the Purchase Pawned Items room of the Pawn Shop, but in the data that action only spends 25 Time.'),
  ];
  if (nome === 'Friendship Crate') return Object.assign([
    s('source: Friendship Crates modifier, Add-Friendship-Crate-In-Park (Garden Pond)', 'A compra só aparece com o modificador Caixa da Amizade, usado no desafio Hora da Aventura: a ação Comprar uma caixa da amizade fica no Lago do Parque e custa 280 de Dinheiro e 50 de Tempo.', 'The purchase only appears with the Friendship Crate modifier, used by the Adventure Season challenge: the Buy a friendship crate action is at the Park pond and costs 280 Cash and 50 Time.'),
    s('FriendshipCrateGiveReportTraitEffect.OnRoundStarted, PickRecipient', 'Essa ação não coloca este item na mochila. Na rodada seguinte, o jogo escolhe outro jogador, sorteia um dos prêmios abaixo (todos com a mesma chance) e avisa quem recebeu por um relatório.', 'That action does not put this item in your inventory. On the next round the game picks another player, draws one of the prizes below (all equally likely) and tells them through a report.'),
    premios(K),
  ], { confirmado: true });
  if (/^Pet (Conservative Sheep|Introverted Armadillo)$/.test(nome)) return [
    s('source unknown: no Buy Pet action (PetHandler.CalculateRandomPetsAvailableToBuy reads chamber actions)', 'Não encontramos de onde este pet vem. Ele não tem ação de compra nos dados, e a lista de pets à venda é montada a partir das ações das salas.', 'We have not found where this pet comes from. It has no purchase action in the data, and the list of pets for sale is built from room actions.'),
  ];
  if (nome === 'Dinosaur Bone 2') return [
    s('source unknown, twin of Dinosaur Bone 1', `Não encontramos nada que entregue este registro. O osso que o Catador acha é outro registro com o mesmo nome: ${K.item('Dinosaur Bone 1')}.`, `We have not found anything that gives this record. The bone the Scavenger finds is another record with the same name: ${K.item('Dinosaur Bone 1')}.`),
  ];
  if (nome === 'Piece of Diploma') return [
    s('source unknown, flavor says collect 3 (item_diploma_piece_flavor)', 'Não encontramos nada que entregue este item nem a ação de juntar 3 peças que o texto do jogo menciona.', 'We have not found anything that gives this item, nor the action to combine 3 pieces that the game text mentions.'),
  ];
  return null;
};
