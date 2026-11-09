'use strict';
// Guia "Glossário": todo termo que um jogador novo encontra, em uma frase simples, com link para a página que explica.
// Cada frase repete só o que o guia ou a página ligada já confirmou; os números vêm de lá. O id de cada linha é a chave do termo.
// Formato de cada linha: [id, termo pt-BR, termo en, frase pt-BR, frase en, link] e o link é um guia ("guides:time") ou uma seção ("roles", "quests").
const { guideTitles } = require('../hub-text');
const GROUPS = [
  ['time and turns', 'Tempo e turnos', 'Time and turns', [
    ['round', 'Rodada', 'Round', 'Uma volta completa da partida, em que cada jogador joga uma vez. A partida dura 10, 20, 30, 40 ou 50 rodadas.', 'One full cycle in which every player takes a turn. A game lasts 10, 20, 30, 40 or 50 rounds.', 'guides:time'],
    ['turn', 'Turno', 'Turn', 'A sua vez dentro da rodada, do começo até você passar a vez.', 'Your part of the round, from when it starts until you end it.', 'guides:time'],
    ['shift', 'Turno de trabalho', 'Shift', 'Uma ida ao trabalho. Gasta Tempo e paga Dinheiro; vários cabem no mesmo turno seu.', 'One use of the Work action. It spends Time and pays Cash, and you can fit several into a single turn.', 'guides:jobs'],
    ['time', 'Tempo', 'Time', 'O que você gasta para andar, trabalhar, estudar e comer. Vai de 0 a 2.400 por turno.', 'What you spend to walk, work, study and eat. It goes from 0 to 2,400 per turn.', 'guides:time'],
    ['block', 'Quadra', 'Block', 'Cada trecho de rua que você percorre no mapa. A pé, cada quadra custa 20 de Tempo; os transportes da Vexcorp custam menos.', 'Each stretch of street you cross on the map. On foot each block costs 20 Time; Vexcorp transport costs less.', 'guides:time'],
    ['wait', 'Espera', 'Wait (cooldown)', 'O intervalo antes de repetir uma ação: "1 vez por rodada" significa que só dá para fazê-la de novo na rodada seguinte.', 'The gap before repeating an action: "once per round" means you can only do it again next round.', 'guides:time'],
    ['life event', 'Acontecimento', 'Life event', 'Um evento da vida que aparece só para você, com escolhas e consequências.', 'An event that comes up just for you, with choices and consequences.', 'events'],
    ['global event', 'Evento Global', 'Global Event', 'Um anúncio que muda a cidade inteira, para todos os jogadores, por algumas rodadas.', 'A town-wide event that affects every player for a few rounds.', 'guides:global-events'],
  ]],
  ['character', 'Seu personagem', 'Your character', [
    ['attribute', 'Atributo', 'Attribute', 'Um medidor do seu personagem, como Dinheiro, Tempo, Felicidade ou Estresse.', 'One of your character\'s stats, such as Cash, Time, Happiness or Stress.', 'guides:attributes'],
    ['happy health hygiene', 'Felicidade, Saúde e Higiene', 'Happiness, Health and Hygiene', 'Três atributos de 0 a 1.000 que rendem pontos quando estão altos e travam as ações que os gastam quando chegam a 0.', 'Three attributes from 0 to 1,000 that earn points when high and block the actions that spend them when they reach 0.', 'guides:attributes'],
    ['fullness', 'Satisfação', 'Fullness', 'O atributo que registra que você comeu. Comer dá +1; o que importa é comer pelo menos uma vez por rodada.', 'The attribute that tracks whether you have eaten. Eating gives +1; what matters is eating at least once per round.', 'guides:hunger'],
    ['stress', 'Estresse', 'Stress', 'Sobe 10 a cada turno, e quanto mais alto, pior: a partir de 50 você perde Tempo, Felicidade e Saúde. Dormir e outras ações reduzem.', 'Rises 10 every turn, and the higher the worse: from 50 you lose Time, Happiness and Health. Sleeping and other actions lower it.', 'guides:attributes'],
    ['cash', 'Dinheiro', 'Cash', 'O que você ganha trabalhando, vendendo e vencendo Missões, e gasta em compras, aluguel e matrículas. Sozinho, não vale pontos.', 'What you earn by working, selling and finishing quests, and spend on purchases, rent and enrollment. On its own it is worth no points.', 'guides:scoring'],
    ['work xp', 'EXP de Trabalho', 'Work XP', 'A experiência que você ganha trabalhando. Ao alcançar cada nível você recebe pontos e passa a poder se candidatar a cargos melhores.', 'The experience you earn by working. On reaching each level you get points and can apply for better positions.', 'guides:jobs'],
    ['points', 'Pontos', 'Points', 'A soma que decide quem vence a partida. Vêm de atributos altos, EXP, aluguel, cursos, Missões, ações da bolsa, móveis, pets e mais.', 'The total that decides who wins the game. They come from high attributes, XP, rent, courses, quests, stocks, furniture, pets and more.', 'guides:scoring'],
    ['prestige', 'Prestígio', 'Prestige', 'Um atributo que só existe no mapa Schnitzelland. No fim da partida, só os três primeiros do ranking de Prestígio ganham pontos.', 'An attribute that only exists on the Schnitzelland map. At the end of the game, only the top three in the Prestige ranking get points.', 'guides:scoring'],
    ['tier', 'Nível (de roupa, móvel ou moradia)', 'Tier (of clothes, furniture or home)', 'Um número que gradua roupas, móveis e moradias. Um emprego aceita a roupa do nível que pede ou de um maior, e cada moradia só aceita móveis até certo nível.', 'A number that grades clothes, furniture and homes. A job accepts clothes of the tier it asks or higher, and each home only takes furniture up to a certain tier.', 'guides:clothes'],
    ['backpack', 'Mochila', 'Inventory', 'Os 8 espaços em que você carrega itens. Móveis vão para a casa, e comida vai para a geladeira.', 'The 8 slots where you carry items. Furniture goes to your home, and food goes to the fridge.', 'guides:bank'],
    ['overweight', 'Sobrepeso', 'Encumbered', 'O que certos itens pesados de Missão causam enquanto você os carrega: você anda 1,5 vez mais devagar e cada deslocamento custa 20% mais Tempo.', 'What some heavy quest items cause while you carry them: you move 1.5 times slower and every trip costs 20% more Time.', 'quests'],
    ['durability', 'Durabilidade', 'Durability', 'Quantas rodadas uma roupa ainda dura. Quando acaba, você fica sem roupa.', 'How many rounds an outfit still lasts. When it runs out, you are left with no clothes.', 'guides:clothes'],
    ['trait', 'Característica', 'Trait', 'Uma vantagem ou regra especial que você ganha de um papel, de um item, de um pet ou de um curso, e que muda o que as ações fazem.', 'A perk or special rule you get from a role, an item, a pet or a course, which changes what actions do.', 'roles'],
    ['pet', 'Pet', 'Pet', 'Um bicho de estimação com atributos próprios. Cuidado, dá uma vantagem e vale pontos no fim; descuidado, traz problemas.', 'A companion animal with its own attributes. Well cared for, it gives a perk and is worth points at the end; neglected, it brings trouble.', 'guides:pets'],
  ]],
  ['money and home', 'Dinheiro e casa', 'Money and home', [
    ['rent', 'Aluguel', 'Rent', 'O que você paga pela moradia a cada 4 rodadas. Pagar em dia rende pontos.', 'What you pay for your home every 4 rounds. Paying on time earns points.', 'guides:housing'],
    ['debt', 'Dívida e despejo', 'Debt and eviction', 'Se você não paga o aluguel, a dívida cresce, parte do salário vai para ela e, se o atraso continuar, você é despejado e passa a morar no parque.', 'If you do not pay rent, the debt grows, part of your salary goes to it and, if you stay behind, you are evicted and move to the Park.', 'guides:debt'],
    ['pawn', 'Penhora', 'Pawn', 'Trocar um objeto por Dinheiro na Casa de Penhores. O Cobrador de Dívidas também penhora móveis seus quando você deve aluguel.', 'Trading an item for Cash at the Pawn Shop. The Debt Collector also pawns your furniture when you owe rent.', 'guides:pawn-shop'],
    ['relax', 'Relaxar', 'Relax', 'Uma ação feita em casa que soma os efeitos de todos os móveis colocados, menos Dinheiro e Estresse.', 'An action done at home that adds up the effects of all placed furniture, except Cash and Stress.', 'guides:housing'],
    ['shelf', 'Prateleira', 'Shelf', 'As ofertas da Casa de Penhores: a cada rodada a loja sorteia 3 móveis especiais e 1 comum.', 'The Pawn Shop\'s offers: each round it draws 3 special pieces and 1 regular one.', 'guides:pawn-shop'],
    ['base price', 'Preço-base', 'Base price', 'O valor de referência de uma ação da bolsa: o preço nunca cai abaixo de 20% dele.', 'The reference value of a stock: the price never falls below 20% of it.', 'guides:stocks'],
    ['vault', 'Cofre', 'Vault', 'A conta do banco, onde o Dinheiro guardado rende juros no fim de cada turno seu.', 'The bank account, where saved Cash earns interest at the end of each of your turns.', 'guides:bank'],
    ['lottery', 'Loteria', 'Lottery', 'Bilhetes comprados no Mercado Mu-Mu que concorrem a um prêmio no início de cada rodada.', 'Tickets bought at the Moo Moo Mart that compete for a prize at the start of each round.', 'guides:bank'],
    ['stock', 'Ação (da bolsa)', 'Stock', 'Um papel que você compra e vende na Bolsa de Valores. O lucro da venda vira pontos.', 'A share you buy and sell on the Stock Exchange. Profit on a sale turns into points.', 'guides:stocks'],
    ['security', 'Segurança', 'Security', 'Quão protegida é a sua moradia contra roubos numa Onda de Crimes.', 'How protected your home is against theft during a Crime Wave.', 'guides:housing'],
    ['hunger', 'Fome', 'Hunger', 'O que acontece se você passa uma rodada sem comer: perde Tempo, Felicidade e Saúde na rodada seguinte.', 'What happens if you go a round without eating: you lose Time, Happiness and Health the next round.', 'guides:hunger'],
  ]],
  ['work and study', 'Trabalho e estudo', 'Work and study', [
    ['job', 'Emprego', 'Job', 'Um cargo que paga Dinheiro e EXP de Trabalho a cada turno de trabalho. Cada um pede um nível de EXP, uma roupa mínima e, às vezes, cursos.', 'A position that pays Cash and Work XP each shift. Each asks for an XP level, a minimum outfit and, sometimes, courses.', 'jobs'],
    ['job level', 'Nível de cargo', 'Job tier', 'A aba da Agência de Empregos onde o cargo aparece (de 0 a 6). Cargos de nível mais alto pagam mais e pedem mais.', 'The Job Office tab where the job is listed (0 to 6). Higher-tier jobs pay more and ask for more.', 'guides:jobs'],
    ['course', 'Curso', 'Course', 'Algo que você estuda na Faculdade: paga matrícula uma vez, estuda várias vezes e, ao concluir, ganha pontos e conhecimento.', 'Something you study at the Academy: pay the enrollment fee once, study several times and, on finishing, get points and knowledge.', 'guides:education'],
    ['knowledge', 'Conhecimento', 'Knowledge', 'O que um curso concluído acrescenta ao seu personagem, como Ensino básico. Cursos seguintes e cargos podem exigir.', 'What a finished course adds to your character, such as Basic Education. Later courses and positions may require it.', 'guides:education'],
  ]],
  ['quests and roles', 'Missões e papéis', 'Quests and roles', [
    ['quest', 'Missão', 'Quest', 'Um objetivo com passos e recompensa, como visitar um lugar ou fazer certa ação. Algumas dão pontos.', 'A goal with steps and a reward, such as visiting a place or doing a certain action. Some give points.', 'quests'],
    ['role', 'Papel', 'Role', 'A forma de jogar que você escolhe no começo: cada papel muda as regras para você e traz Missões próprias.', 'The playstyle you pick at the start: each role changes the rules for you and brings its own quests.', 'roles'],
    ['bidding', 'Vontade e Bênção (Cultista)', 'Bidding and Boon (Cultist)', 'No papel Cultista, uma vontade é um pedido do terror cósmico; cumprir três dá uma Bênção, um item ou vantagem.', 'In the Cultist role, a bidding is a request from the cosmic horror; fulfilling three gives a Boon, an item or perk.', 'roles'],
    ['combo', 'Combo (Viciado em Trabalho)', 'Combo (Workaholic)', 'No papel Viciado em Trabalho, trabalhar 3 turnos de trabalho seguidos dispara um bônus sorteado.', 'In the Workaholic role, working 3 shifts in a row triggers a random bonus.', 'roles'],
    ['sign', 'Signo e destino (Misticista)', 'Sign and destiny (Mystic)', 'No papel Misticista, o signo da rodada dá um bônus e pede uma ação simples, o destino.', 'In the Mystic role, the round\'s sign gives a bonus and asks for a simple action, the destiny.', 'roles'],
    ['suspicion', 'Suspeita (Hacker)', 'Suspicion (Hacker)', 'No papel Hacker, a barra de 0 a 100 que sobe a cada invasão e define a chance de você ser pego.', 'In the Hacker role, the bar from 0 to 100 that rises with each hack and sets the chance of being caught.', 'roles'],
    ['inspiration', 'Inspiração (Artista)', 'Inspiration (Artist)', 'No papel Artista, a reserva criativa de cada lugar: quanto maior, mais rápido o quadro avança.', 'In the Artist role, each place\'s creative reserve: the higher it is, the faster the painting advances.', 'roles'],
    ['artifact', 'Artefato (Catador)', 'Artifact (Scavenger)', 'No papel Catador, um item raro de cada lugar; achar artefatos libera novos lugares para vasculhar.', 'In the Scavenger role, a rare item from each place; finding artifacts unlocks new places to scavenge.', 'roles'],
  ]],
  ['town', 'Cidade e mundo', 'Town and world', [
    ['modifier', 'Modificador de partida', 'Modifier', 'Uma regra opcional escolhida ao criar a partida, como Bolsa Oscilante ou Caixa da amizade.', 'An optional rule picked when setting up the game, such as Stock Market Chaos or Friendship Crates.', 'guides:time'],
    ['map', 'Mapa', 'Map', 'O cenário da partida: Calicornia, Chailand ou Schnitzelland. Cada um tem alguns lugares só seus.', 'The setting of the game: Calicornia, Chailand or Schnitzelland. Each has a few places of its own.', 'guides:maps'],
    ['place', 'Local', 'Location', 'Um prédio do mapa onde você faz ações, como o Banco ou a Academia.', 'A building on the map where you do actions, such as the Bank or the Gym.', 'locations'],
    ['ticket', 'Bilhete de metrô', 'Metro ticket', 'Cada viagem de Metrô gasta 1 bilhete. O saldo cai 1 por rodada.', 'Each Metro ride spends 1 ticket. The balance drops 1 per round.', 'guides:maps'],
    ['bot', 'Bot', 'Bot', 'Um jogador controlado pelo jogo, com as mesmas regras que você. A dificuldade muda só o quanto ele erra.', 'A player controlled by the game, with the same rules as you. Difficulty only changes how often it slips up.', 'guides:bots'],
    ['mayor', 'Prefeito', 'Mayor', 'Quem vence a Eleição, um Evento Global: muda uma regra da cidade para todos até renunciar.', 'The winner of the Mayor Election, a Global Event. The Mayor changes a town rule for everyone until they resign.', 'guides:mayor'],
    ['mood', 'Humor do pet', 'Pet mood', 'Negligenciado, contente ou mimado, conforme os atributos do pet. Define a vantagem e os pontos que ele dá.', 'Neglected, content or pampered, depending on the pet\'s attributes. It sets the perk and the points it gives.', 'guides:pets'],
  ]],
];

module.exports = getH => ({
  slug: 'glossary',
  title: { 'pt-BR': 'Glossário', en: 'Glossary' },
  sections: (lang, s) => {
    const H = getH();
    const d = H.langDir(lang);
    const href = spec => (spec.startsWith('guides:') ? `/${d}/guides/${spec.slice(7)}/` : `/${d}/${spec}/`);
    const label = spec => `${s('see', { 'pt-BR': 'Ver', en: 'See' })}: ${spec.startsWith('guides:') ? guideTitles(spec.slice(7))[lang] || guideTitles(spec.slice(7)).en : H.ui(lang, spec)}`;
    const out = [['', `<p>${s('intro', { 'pt-BR': 'Os termos que você encontra jogando, em uma frase simples cada um. Em cada linha há um link para o guia ou a página que explica o assunto com todos os números.', en: 'The terms you meet while playing, one plain sentence each. Each line links to the guide or page that explains the subject with all the numbers.' })}</p>`]];
    for (const [gid, ptTitle, enTitle, rows] of GROUPS) {
      out.push([s(`group ${gid}`, { 'pt-BR': ptTitle, en: enTitle }), `<ul class="plain">${rows.map(([id, ptTerm, enTerm, ptText, enText, link]) => `<li><strong>${s(`term ${id}`, { 'pt-BR': ptTerm, en: enTerm })}</strong>: ${s(`def ${id}`, { 'pt-BR': ptText, en: enText })} <a href="${href(link)}">${label(link)}</a></li>`).join('')}</ul>`]);
    }
    return out;
  },
});
