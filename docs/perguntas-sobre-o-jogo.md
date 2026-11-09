# Perguntas sobre o jogo

Só o que continua em aberto depois de ler dados, textos, código (Cpp2IL) e o projeto exportado pelo AssetRipper.

## O que ainda falta

A fórmula de EXP do Aventureiro e os valores exatos do Workaholic ainda precisam ser lidos.

De onde vêm estes itens, se é que vêm? Nada foi achado nos dados, prefabs ou código, mas isso não prova que faltem no jogo:

- Enfeites e tralhas (`Junk 1` a `10`), segundo Osso de Dinossauro, Hamilton Dourado, Pedaço de Diploma (o texto fala em juntar 3), Maleta Misteriosa e Isca de Missão.
- Ovelha Conservadora e Tatu Introvertido: aparecem à venda em alguma partida?
- Laser de Mineração e minérios; Comida Detox; Dinheiro Sujo; Dever de Casa Perdido (e o que a devolução rende); Caixa de Pragas (entra na mochila no ritual do Cultista?).
- Cadeira de Plástico, Segurança Tosca, Torradeira Dentada.
- Os 8 cursos sem departamento aparecem em algum lugar para jogadores?
- A Comida para 2 e 4 semanas: em que tela o jogador compra?

### Eventos (não publicado por falta de confirmação)

- Quanto o `Weight` da tag `chev_` aumenta a chance de a próxima etapa sair? O peso entra na soma em `TryGetEventEligibilityWeight`, mas não medi o efeito no sorteio. A wiki diz só que a etapa entra no sorteio.
- Bilhete de loteria "vale uns 31 por sorteio" (auditoria, `gym-locker-room-dilemma`): não conferi a conta. Fora da página.
- Comida para a semana estraga sem geladeira no fim do turno (auditoria, `moo-moo-mart-expired-goods`): não conferi. Fora da página.
- O seletor de Eventos de Escolha aparece para todo jogador, em qualquer modo de partida? O código liga a opção à configuração, mas a tela só se confirma jogando.

### Locais (a página diz "origem desconhecida" ou ficou como estava)

Nada abaixo prova que a coisa não exista no jogo. Só não achamos a ligação nos dados, nos prefabs ou no código.

- **Pescar em casa:** o efeito `AddFishingToHomesTraitEffect` põe a ação nas moradias, mas nenhum traço, prefab ou cena aponta para ele. O móvel Peixe no Barril tem o traço `Add-Fishing-To-Home-Trait`, só que esse traço só traz o aumento de preço na penhora (`BarrelIncreaseFishPawnPriceTraitEffect`). O barril libera a pesca em casa? Confirmar jogando.
- **Começar Ritual na Faculdade, na Agência, no Mercado e na Vexcorp:** os efeitos `RitualStartAcademy`, `RitualStartJobOffice`, `RitualStartMart` e `RitualStartVexCorp` não estão em nenhum traço. A ação aparece nesses lugares?
- **Ver Missões Secretas:** o traço só é citado em `MissionGameSystem.TraitsWithMissionObjectives`. Em que situação a ação aparece?
- **Pedir Dinheiro de Volta (Banco):** `Quest-Help-Bank-Request-Trait` só está em `TraitStorage`. O que concede esse traço?
- **Loja de Móveis de Chailand:** `MapLayoutData` lista `Chailand-Furniture Store` só em Chailand e `Schnitzel-Furniture Store` em Schnitzelland, mas as posições de `MapEditor.MapLevel` de Schnitzelland apontam para o registro de Chailand. Qual registro o jogador encontra em Schnitzelland? Enquanto isso, a página continua mostrando os dois mapas em "Como chegar".

### Missões (abertas na revisão da auditoria)

| Dúvida | O que já se sabe | Como fechar |
|---|---|---|
| Como começam 8 Missões: Doação de Sangue Média, Experimento de Tédio Maior, Serviço Comunitário Médio, Limpe o Ambiente, Guerra dos Tronos (2 registros), Comilança, A História Sem Fim (registro solto) | As ações `Get Quest ...` existem, mas não estão em sala de local; `QuestPoolData/Current` lista parte delas, e não achei quem leia essa lista para sortear. Ausência nos dados não prova que não apareçam | Procurar a Missão jogando; ver quem lê `QuestPoolData.QuestList` |
| Cada partida no Fliperama gasta 1 Ficha? | `RequiredItems` pede 1 e `Purpose` é 24 (`ArcadeGameAction`); não achei o trecho que tira o item. A conta usa 1 Ficha, o mínimo | Jogar 2 partidas e olhar a mochila |
| Vale-presente deixa a ação de graça? | `Giftcard - Free - *` traz o mesmo custo em `Rewards` da ação paga, e `Purpose` 2 | Usar um vale e ver o Dinheiro |
| Pode ter mais de uma Missão ativa da Vexcorp? | `ActiveQuests` tem `Capacity(6)` e `StartQuest` chama `HasQuestOfType`; não li a regra inteira, então a página não diz "uma por vez" | Ler `StartQuest` no Ghidra ou tentar aceitar duas |
| `Duration` da Missão é prazo em rodadas? | Só o `BiddingMaxDuration` do Cultista está confirmado. A ficha continua dizendo "Duração" | Ler quem usa `QuestComponent.Duration` |
| `Tier` é a dificuldade? | Nas Missões da Vexcorp, `Tier` coincide com a lista fácil, média ou difícil; não confirmei o uso no código. A ficha continua dizendo "Nível" | Ler quem usa `QuestComponent.Tier` |
| Quantas quadras o Anel anda em cada mapa? | O custo por quadra está confirmado; a distância entre Mercado e Vexcorp depende do mapa, que não extraímos | Medir no jogo |
| Etapa "Terminar Ritual" em casa conta para as Missões de Ritual? | `Quest-Cultist-Complete` não está em nenhuma cadeia; a ligação é inferência | Fazer um Ritual até o fim |
| Quanto cada signo soma para a Missão do Misticista? | O objetivo lê `Mystic.CompletedDestinies`, mas não achei onde o contador sobe. As páginas de signo ficam sem "Vale a pena?" | Ler `Mystic` no Ghidra |

## Resolvidas

| Pergunta | Resposta | Fonte |
|---|---|---|
| Infeliz, Doente, Sujo | Removidos da wiki: são restos sem uso. Os traits `Unhappy1/2`, `Unhealthy1/2` e `Dirty1/2` não existem, nada aponta para os triggers `Add Trait - ...`, e o Lacerda nunca viu isso no jogo | Busca no projeto exportado, `ValueTriggerData.Triggers: []`, fala do Lacerda |
| Atributo em 0 | Felicidade, Saúde e Higiene em exatamente 0 bloqueiam ações que gastam esse atributo, inclusive trabalhar | `PlayerState.CanAffordModifier`, `AttributeData.ZeroLocked`, fala do Lacerda |
| Nível da roupa | Serve o nível pedido ou maior | `JobHandler.CanApplyForJob`: só devolve `ClothingTierTooLow` quando `GetClothesTier` é menor |
| Roupa nível 5 | Só `Clothing Store 6` pede; as roupas vão até o nível 4 | `JobData.RequiredEquippedItemTier`, `ItemData.Tier` |
| Custo do conserto | 60% do `BuyValue` da roupa, mais 100 de Tempo | `PerformNormalAction`, `RepairClothesCostFraction = 0,6`, ação `Repair clothes` |
| Venda na Casa de Penhores | Paga o `SellValue`; traits podem mudar | `GetPawnRewardsForItem`, `TraitHandler.CheckForPawnPriceChange` |
| Compra de item penhorado | Custa o `BuyValue` | `ChamberActionWidget.SetDataForBuyingPawnedItems` |
| `Rewards` em Dinheiro nos itens | Não é preço: vale cerca de `BuyValue / 0,6`, com sinal variando. Fica fora da wiki | Comparação em `ItemData` |
| Proficiências | Sem efeito: o jogo carrega `JobProficiencies`, mas nenhum código lê | Busca no ISIL |
| Perfis da bolsa | Seguro (16%, +1%, teto 3×), Arriscado (18%, 0, 3×), Subida lenta (10%, +3%, 3×), Queda lenta (10%, −1%, 2×) | `StockBehavior.CreateDefaults` |
| Quanto o conserto devolve | 65% da durabilidade total, arredondado para cima (6 vira 4, 7 vira 5, 10 vira 7); só com exatamente 1 restante | Ghidra, `PerformNormalAction` (`0x1808376B0`), case 8 de `Purpose`: `Durability * 0.65` em `0x1839E1010`; `Duration != 1` falha |
| Bônus do Hacker | Por invasão: 20% (Clucker's, Academia), 10% (Móveis, Eletrônicos, Salário), 1% (Loteria), 2% (Juros) | Ghidra, `Hacker.GetContextValueByType` (`0x1807E8A00`) |
| Cartão do Consumista | Conta de 0; 4ª compra pela metade, 8ª de graça; depois recomeça | Ghidra, `ActionDiscountTraitEffectForLocation.OnExecuteActionSuccess` (`0x18079D7B0`) |
| Recarga do Artista | Todo turno: 8% + 2% por nível de estudo | Ghidra, `Artist.OnTurnStarted` (`0x1807DA460`) |
| Piso da bolsa | 20% do preço-base, e nunca menos que 1 | `StocksManager.ProgressStock`, constante 0,2 em `0x1839E0D40` |
| Qual ação usa qual perfil | Pelo `Tier` do item: Bytecoin e Pony 1, Porkbutts 2, Vexcorp 3 | `StocksManager.Initialize`, `TryGetStockBehaviorByTier` |
| Pagamento da ação | Nenhum enquanto você a tem | Não há dividendo no código |
| Tipos de recompensa | 70 Quest, 95 Pontos, 110 Trait, 120 Trigger, 130 Moradia | `Types.ResourceType` |
| Durabilidade | Em rodadas: 6, 7, 7 e 10; desconta no início do turno | `ItemData.Durability`, `HandleEquipmentDurability` |
| Aviso de roupa | Vem quando resta 1 de durabilidade | `HandleEquipmentDurability` |
| Quando acaba | Você recebe Ao Natural, a roupa padrão | `SetDefaultEquipmentItem`, `RealmData.DefaultEquipment` |
| Operador de condição | 1 igual, 4 maior ou igual, 5 menor que | `Types.RelationalOperatorType` |
| Analista de Crédito | Nível 4 de EXP | `JobData.ExperiencePointRequirement` |
| Tempo | Máximo de 2.400 | `AttributeData.Time` |
| Escala | 0 a 1.000 e 0 a 100 no Estresse | `AttributeData`, `ValueTriggerData` |
| Fome | −600 Tempo, −50 Felicidade, −50 Saúde | Relatório `Forgot to eat` |
| Faltar ao trabalho | Até 3 rodadas | `LostYourJobGameSystem.RoundsOfAbsenceAllowed` |
| Aluguel | Vence a cada 4 rodadas | `RentHandler.RoundsBetweenRentPayments` |
| Despejo | Aviso depois de 2 rodadas de dívida | `RentHandler.RoundsUntilEvictionNotice` |
| Dívida e salário | Parte do salário paga a dívida, até 25% | `HomeData.RentDebtWageDeduction` |


## Dúvidas abertas da verificação (rel3)

Não publicado, por falta de confirmação. Quem joga resolve a maioria abrindo a tela.

| Dúvida | O que se sabe | O que falta |
|---|---|---|
| Pacotes de comida para 2 e 4 | `Food for 2 Weeks` (120) e `Food for 4 Weeks` (300) existem em `ChamberActionData` com `ChamberGroup` 5 (`NotInUse`). Nenhuma sala, traço, prefab ou cena os cita; `SetChamberDataForNormalActions` só passa por `TraitHandler.EnteringChamber` e `ProcessNormalActions`; `SetGroceries` só muda o aviso visual | Ver no Mercado se aparecem. A wiki não afirma nem nega |
| Comprar comida sem geladeira | `TryUpdatePlayerOwnedItemState` case 6 aceita e `SetGroceries` marca o requisito na tela | Se o botão fica bloqueado sem geladeira |
| Papel Pescador | `Gameplay.Roles.Angler` tem `SystemStateType` 20 (`Blocked`) e está em `RoleStorage`; não achei o código que filtra por esse campo | Se dá para escolher o papel. As menções seguem na wiki |
| Rede de Captura | `Quest Action - Pickup Net` entra na Pet Shop pelo efeito `Add-Net-To-Petstore`, de traços dados por `Quest-GottaCatchEm 3/5/9`, que nenhuma cadeia usa | Quando a compra aparece |
| Queda da Bolsa no Colapso | O evento chama `StocksManager.CrashMarket(duration)`; a força não foi lida | Tamanho da queda. A página mantém o texto do jogo |
| Pontos "Outro" | `ScoreHandler.AddScore` com `ReportGiveReward` e `VoteReward`; nenhum relatório traz recompensa `Type` 95 | Quais avisos e votos dão pontos e quanto |
| Ração do pet | `FoodCount` cai 1 por turno; não li quanto cada compra acrescenta | Em quantos turnos a ração acaba e quando o pet come |
| Desafio | Existe `ChallengeData`, mas não li como o jogo apresenta | Definição para o glossário |
| Destino do Misticista | Não confirmei se precisa ser cumprido na mesma rodada | Prazo do destino |

### Revisão do inglês (não alterado, só anotado)

- A wiki cita um papel "Angler" (`itens.js`: "or being an Angler", "The Angler role"; guia de Educação: "a fishing role"). O jogo tem `trait_role_angler_title` e eventos com o Angler, mas nenhum `role_angler_title` na lista de papéis. Ele é selecionável? O texto em inglês ficou como estava.

## Dúvidas das lojas e Missões de papel

Não publicado na tabela de loja, por falta de confirmação.

| Dúvida | O que se sabe | O que falta |
|---|---|---|
| Passe de Metrô (Estudante) | `Chai-Metro-Add-Tickets-Academy` acrescenta a ação à sala `Academy Registration`, mas nenhuma `LocationData.Chambers` lista essa sala; no projeto exportado ela só aparece nas listas do banco de dados. O guia Mapas cita a Faculdade | Se a ação aparece na Faculdade em Chailand. A tabela de loja da Faculdade não a lista |
| Caixa da Amizade | `Buy Friendship Crate` só cobra (`Cash` −280, `Time` −50). `FriendshipCrateGiveReportTraitEffect` usa `PickRecipient` no início da rodada e `Get Friendship Crate Rewards` sorteia o prêmio; não li a quem o prêmio vai | Quem recebe a caixa. Fica no quadro de ações, não na tabela de loja |
| Ingresso e dedo de espuma do Grande Jogo | `Big Game - Buy Ticket` e `Buy Finger` cobram, mas a ação não entrega item; o efeito vem do rastreador do evento | O que a compra rende. Fica no quadro de ações |

## Modificadores (`/modifiers/`)

| Dúvida | O que se sabe | O que falta |
|---|---|---|
| Community Service: onde a limpeza aparece | Adiciona `Clean Up Trash` (`Chambers` vazio, `OncePerLocation` 1, `SkipEnteringPlayersHomeLocation` 1). O texto do jogo diz "Park cleanup action" e o traço chama "In-Park", mas o efeito não lista sala; `AddChamberActionTraitEffect.IsTargetChamber` compara o `out` de `ResolveLocation` com o `Skip...` e não fechei o sentido dele | Confirmar em jogo em quais locais a ação aparece. A página mostra o custo (dado) e o texto do jogo rotulado |
| Futurism: teletransporte "em todo local" | Mesmo efeito com `Chambers` vazio; a página mostra só o custo da ação e o texto do jogo rotulado, pelo mesmo motivo acima | Confirmar em jogo |
| Pawn Emporium: efeito na prateleira | `CheckForPawnShopSlots(tipo, ref n)` soma `AdditionalSpecialSlots` 2 e `SpecialFurnitureSlots` 6 ao tipo pedido. Sem ler o total exato de vagas de cada tipo. O texto do jogo diz que toda a mobília fica disponível | Confirmar em jogo quantos móveis aparecem |
| Dificuldade Difícil e aluguel | `game_difficulty_hard_flavor` diz que o aluguel sobe a cada ciclo, mas `HardModifiers` não inclui Contrato Infernal (`IncreaseRentEveryPeriod`). O efeito também tem asset `Modify-Rent-Every-Period-Hard` | Ver se o texto é de antes da troca de dificuldade para listas de modificadores (`LegacyDifficultyTraits`) |
