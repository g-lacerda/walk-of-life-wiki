'use strict';
// Itens cuja origem não foi encontrada. Cada frase cita o dado ou o método conferido (docs/engenharia-reversa.md, "Ausência não é prova").
// Regra: nunca dizer que o item não existe; dizer o que os dados mostram e que a fonte é desconhecida.
const PORCENTO_MINERIO = { Kernite: 8, Omber: 18, Scordite: 32, Veldspar: 42 }; // ChamberActionData "Go Mining".WeightedRewards, soma dos pesos 100

function premios(K) {
  const a = K.c.table('ChamberActionData').find(x => x.m_Name === 'Get Friendship Crate Rewards');
  const lista = (a.WeightedRewards || []).flatMap(w => w.Reward.RewardEntries).map(e => { const i = K.c.byId.get(e.Id); return `${K.n(e.Value)} ${K.item(i.m_Name)}`; });
  return lista.join(', ');
}

module.exports = function notas(K, it, { emLugar }) {
  const s = (id, pt, en) => K.s(id, pt, en);
  const nome = it.m_Name;
  const origem = () => s('origin unknown (no reward, action or code path gives it)', 'A origem deste item é desconhecida.', 'The origin of this item is unknown.');
  if (nome === 'Mining Laser') return [
    s('origin unknown: Buy Mining Laser has no room', 'A origem deste item é desconhecida. A ação Comprar Laser de Mineração custa 50 de Tempo e 100 de Dinheiro, mas o lugar em que ela aparece é desconhecido.', 'The origin of this item is unknown. The Buy Mining Laser action costs 50 Time and 100 Cash, but where it appears is unknown.'),
  ];
  if (PORCENTO_MINERIO[nome]) return [
    s(`source: Go Mining WeightedRewards (${nome})`, `Sai da ação Minerar, na sala Áreas Comuns (100 de Tempo, ${PORCENTO_MINERIO[nome]}% de chance). Essa ação só é acrescentada por quem tem o Laser de Mineração. A origem do laser e o lugar dessa sala no mapa são desconhecidos.`, `It comes from the Go Mining action in the Commons room (100 Time, ${PORCENTO_MINERIO[nome]}% chance). Only owning the Mining Laser adds that action. Where the laser comes from and where that room is on the map are unknown.`),
  ];
  if (nome === 'One Week Healthy Food') return [
    s('origin unknown: Cleansing Food has no room', 'A origem deste item é desconhecida. A ação Comida Detox custa 25 de Tempo e 120 de Dinheiro, mas o lugar em que ela aparece é desconhecido.', 'The origin of this item is unknown. The Cleansing Food action costs 25 Time and 120 Cash, but where it appears is unknown.'),
  ];
  if (nome === 'Dirty Money') return [
    origem(),
    s('use: Wash Dirty Money (RequiredItems, Can-Wash-Dirty-Cash in Scavenge-Level-01)', 'A ação Lavar Dinheiro Sujo exige 1 dele e dá 50 de Dinheiro por 50 de Tempo, na sala Áreas Comuns. O lugar dessa sala no mapa e o que libera a ação são desconhecidos.', 'The Wash Dirty Money action needs 1 of it and gives 50 Cash for 50 Time, in the Commons room. Where that room is on the map and what unlocks the action are unknown.'),
  ];
  if (nome === 'Lost Homework') return [
    origem(),
    s('use: HomeworkConditionalAddActionTraitEffect.EnteringChamber, EducationManager.ReturnHomework (2x EducationActionPerformed)', 'Com ele na mochila, a ação Devolver dever de casa perdido aparece nas salas de curso em que você tem um curso em andamento. Ela exige o item, custa 100 de Tempo e conta como 2 estudos no primeiro curso em andamento daquela sala, parando antes se o curso terminar.', 'While you carry it, the Return lost homework action appears in course rooms where you have a course in progress. It needs the item, costs 100 Time and counts as 2 study sessions in the first course in progress in that room, stopping early if the course finishes.'),
  ];
  if (nome === 'Box of Plagues') {
    const lugar = n => K.c.locations.find(l => l.m_Name === n);
    const pawn = emLugar(K, lugar('Pawn Shop'));
    const mart = emLugar(K, lugar('Grocery Store'));
    return [
      s('Cultist ritual steps: Quest-Cultist-Ritual-t*-31/32 (Pick up / Return box of plagues, -25 Time each)', `A origem deste item é desconhecida. Um ritual do Cultista tem duas etapas com o nome dele: pegar a Caixa de Pragas ${pawn} e entregá-la ${mart}, por 25 de Tempo cada.`, `The origin of this item is unknown. A Cultist ritual has two steps with its name: pick up the Box of Plagues at the ${pawn} and deliver it to ${mart}, for 25 Time each.`),
    ];
  }
  if (nome === 'Friendship Crate') return Object.assign([
    s('source: Friendship Crates modifier, Add-Friendship-Crate-In-Park (Garden Pond)', 'A compra só aparece com o modificador Caixa da Amizade, usado no desafio Hora da Aventura: a ação Comprar uma caixa da amizade fica no Lago do Parque e custa 280 de Dinheiro e 50 de Tempo.', 'The purchase only appears with the Friendship Crate modifier, used by the Adventure Season challenge: the Buy a friendship crate action is at the Park pond and costs 280 Cash and 50 Time.'),
    s('FriendshipCrateGiveReportTraitEffect.OnRoundStarted, PickRecipient', 'Essa ação não coloca este item na mochila. Na rodada seguinte, o jogo escolhe outro jogador, sorteia um dos prêmios abaixo (todos com a mesma chance) e avisa quem recebeu por um relatório.', 'That action does not put this item in your inventory. On the next round the game picks another player, draws one of the prizes below (all equally likely) and tells them through a report.'),
    premios(K),
  ], { confirmado: true });
  if (/^Pet (Conservative Sheep|Introverted Armadillo)$/.test(nome)) return [
    s('origin unknown: no Buy Pet action (PetHandler.CalculateRandomPetsAvailableToBuy reads chamber actions)', 'A origem deste pet é desconhecida.', 'The origin of this pet is unknown.'),
  ];
  if (nome === 'Dinosaur Bone 2') return [
    s('origin unknown, twin of Dinosaur Bone 1', `A origem deste osso é desconhecida. O osso que o Catador acha é outro item com o mesmo nome: ${K.item('Dinosaur Bone 1')}.`, `The origin of this bone is unknown. The bone the Scavenger finds is another item with the same name: ${K.item('Dinosaur Bone 1')}.`),
  ];
  if (nome === 'Piece of Diploma') return [
    s('origin unknown, flavor says collect 3 (item_diploma_piece_flavor)', 'A origem deste item é desconhecida. O texto do jogo fala em juntar 3 pedaços para criar um Diploma, e não há ação conhecida que faça isso.', 'The origin of this item is unknown. The game text talks about putting 3 pieces together to make a Diploma, and no known action does that.'),
  ];
  return null;
};
