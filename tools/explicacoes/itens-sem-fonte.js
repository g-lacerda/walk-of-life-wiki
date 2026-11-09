'use strict';
// Itens que nenhuma ação, Missão, evento, papel ou loja entrega. Cada frase cita o dado ou o método conferido (docs/engenharia-reversa.md, "Ausência não é prova").
// Regra: dizer o que as tabelas mostram e o que isso muda para quem joga. Só afirmar "fora de uso" com ItemGroup e ItemSubGroup NotInUse (5 e 10).
const PORCENTO_MINERIO = { Kernite: 8, Omber: 18, Scordite: 32, Veldspar: 42 }; // ChamberActionData "Go Mining".WeightedRewards, soma dos pesos 100

function premios(K) {
  const a = K.c.table('ChamberActionData').find(x => x.m_Name === 'Get Friendship Crate Rewards');
  const lista = (a.WeightedRewards || []).flatMap(w => w.Reward.RewardEntries).map(e => { const i = K.c.byId.get(e.Id); return `${K.n(e.Value)} ${K.item(i.m_Name)}`; });
  return lista.join(', ');
}

module.exports = function notas(K, it, { emLugar }) {
  const s = (id, pt, en) => K.s(id, pt, en);
  const nome = it.m_Name;
  const foraDeUso = () => s('not in use: ItemGroup and ItemSubGroup NotInUse, no reward in any table', 'Este item está fora de uso na versão atual. Os dados do jogo o marcam como fora de uso, e nenhuma ação, Missão, evento, papel ou loja das tabelas do jogo o entrega. Não conte com ele numa partida normal.', 'This item is out of use in the current version. The game data mark it as not in use, and no action, quest, event, role or shop in the game tables gives it. Do not count on it in a normal game.');
  const semEntrega = () => s('no table gives it (raw references checked across all tables)', 'Nenhuma ação, Missão, evento, papel ou loja das tabelas do jogo entrega este item. Por isso, não conte com ele ao planejar a partida.', 'No action, quest, event, role or shop in the game tables gives this item, so do not count on it when planning your game.');
  if (/^Junk \d+$/.test(nome)) return [
    foraDeUso(),
    s('junk: no RequiredItems reference, ScoreBonus 0', 'É uma tralha sem uso: nenhuma ação a consome e ela não dá pontos no fim da partida.', 'It is junk with no use: no action consumes it and it gives no points at the end of the game.'),
  ];
  if (nome === 'Mining Laser') return [
    s('not in use: Mining Laser and Buy Mining Laser (ChamberGroup NotInUse)', 'Este item está fora de uso na versão atual. Os dados do jogo marcam como fora de uso tanto ele quanto a ação Comprar Laser de Mineração (50 de Tempo e 100 de Dinheiro), a única que o entrega. Não conte com ele numa partida normal.', 'This item is out of use in the current version. The game data mark both it and the Buy Mining Laser action (50 Time and 100 Cash), the only one that gives it, as not in use. Do not count on it in a normal game.'),
  ];
  if (PORCENTO_MINERIO[nome]) return [
    s(`not in use: ${nome}, Go Mining WeightedRewards (ChamberGroup NotInUse)`, `Só sai da ação Minerar (100 de Tempo, ${PORCENTO_MINERIO[nome]}% de chance). Os dados do jogo marcam como fora de uso este minério, a ação e o Laser de Mineração que a libera. Não conte com ele numa partida normal.`, `It only comes from the Go Mining action (100 Time, ${PORCENTO_MINERIO[nome]}% chance). The game data mark this ore, the action and the Mining Laser that unlocks it as not in use. Do not count on it in a normal game.`),
  ];
  if (nome === 'One Week Healthy Food') return [
    s('not in use: One Week Healthy Food and Cleansing Food (ChamberGroup NotInUse)', 'Este item está fora de uso na versão atual. Os dados do jogo marcam como fora de uso tanto ele quanto a ação Comida Detox (25 de Tempo e 120 de Dinheiro), a única que o entrega. Não conte com ele numa partida normal.', 'This item is out of use in the current version. The game data mark both it and the Cleansing Food action (25 Time and 120 Cash), the only one that gives it, as not in use. Do not count on it in a normal game.'),
  ];
  if (nome === 'Dirty Money') return [
    foraDeUso(),
    s('use: Wash Dirty Money needs the item (RequiredItems), no table gives it', 'A ação Lavar Dinheiro Sujo continua nos dados: exige 1 dele e dá 50 de Dinheiro por 50 de Tempo. Sem o item, não há como usá-la.', 'The Wash Dirty Money action is still in the data: it needs 1 of it and gives 50 Cash for 50 Time. Without the item, there is no way to use it.'),
  ];
  if (nome === 'Lost Homework') return [
    foraDeUso(),
    s('use: HomeworkConditionalAddActionTraitEffect.EnteringChamber, EducationManager.ReturnHomework (2x EducationActionPerformed)', 'Com ele na mochila, a ação Devolver dever de casa perdido aparece nas salas de curso em que você tem um curso em andamento. Ela exige o item, custa 100 de Tempo e conta como 2 estudos no primeiro curso em andamento daquela sala, parando antes se o curso terminar.', 'While you carry it, the Return lost homework action appears in course rooms where you have a course in progress. It needs the item, costs 100 Time and counts as 2 study sessions in the first course in progress in that room, stopping early if the course finishes.'),
  ];
  if (nome === 'Box of Plagues') {
    const lugar = n => K.c.locations.find(l => l.m_Name === n);
    const pawn = emLugar(K, lugar('Pawn Shop'));
    const mart = emLugar(K, lugar('Grocery Store'));
    return [
      semEntrega(),
      s('Cultist ritual steps: Quest-Cultist-Ritual-t*-31/32 (Pick up / Return box of plagues, -25 Time each), neither references the item', `Um ritual do Cultista tem duas etapas com o nome dele: pegar a Caixa de Pragas ${pawn} e entregá-la ${mart}, por 25 de Tempo cada. Essas etapas não exigem nem dão o item.`, `A Cultist ritual has two steps with its name: pick up the Box of Plagues at the ${pawn} and deliver it to ${mart}, for 25 Time each. Those steps neither need nor give the item.`),
    ];
  }
  if (nome === 'Friendship Crate') return Object.assign([
    s('source: Friendship Crates modifier, Add-Friendship-Crate-In-Park (Garden Pond)', 'A compra só aparece com o modificador Caixa da Amizade, usado no desafio Hora da Aventura: a ação Comprar uma caixa da amizade fica no Lago do Parque e custa 280 de Dinheiro e 50 de Tempo.', 'The purchase only appears with the Friendship Crate modifier, used by the Adventure Season challenge: the Buy a friendship crate action is at the Park pond and costs 280 Cash and 50 Time.'),
    s('FriendshipCrateGiveReportTraitEffect.OnRoundStarted, PickRecipient', 'Essa ação não coloca este item na mochila. Na rodada seguinte, o jogo escolhe outro jogador, sorteia um dos prêmios abaixo (todos com a mesma chance) e avisa quem recebeu por um relatório.', 'That action does not put this item in your inventory. On the next round the game picks another player, draws one of the prizes below (all equally likely) and tells them through a report.'),
    premios(K),
  ], { confirmado: true });
  if (/^Pet (Conservative Sheep|Introverted Armadillo)$/.test(nome)) return [
    s('no table sells this pet (PetHandler.CalculateRandomPetsAvailableToBuy reads chamber actions)', 'Nenhuma ação, Missão, evento, papel ou loja das tabelas do jogo entrega este pet. Por isso, não conte com ele ao planejar a partida.', 'No action, quest, event, role or shop in the game tables gives this pet, so do not count on it when planning your game.'),
  ];
  if (nome === 'Dinosaur Bone 2') return [
    semEntrega(),
    s('twin of Dinosaur Bone 1', `O osso que o Catador acha é outro item com o mesmo nome: ${K.item('Dinosaur Bone 1')}.`, `The bone the Scavenger finds is another item with the same name: ${K.item('Dinosaur Bone 1')}.`),
  ];
  if (nome === 'Piece of Diploma') return [
    semEntrega(),
    s('flavor says collect 3 (item_diploma_piece_flavor), no RequiredItems reference', 'O texto do jogo fala em juntar 3 pedaços para criar um Diploma, mas as tabelas não têm essa receita.', 'The game text talks about putting 3 pieces together to make a Diploma, but the tables have no such recipe.'),
  ];
  return [semEntrega()];
};
