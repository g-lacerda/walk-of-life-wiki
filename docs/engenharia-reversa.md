# Engenharia reversa do Walk of Life

Como ler regras direto do código do jogo, e o que já foi descoberto. Build analisada: 26456250.

Ao atualizar o jogo, os endereços mudam: refaça o passo 2 antes de confiar neles.

## Ferramentas

| Ferramenta | Para quê | Onde ficou nesta sessão |
|---|---|---|
| Cpp2IL 2022.1.0-pre-release.21 | Nomes de classes, constantes e ISIL de cada método | Pasta temporária da sessão |
| AssetRipper 2.0.0 | Abre cenas e prefabs sem árvore de tipos | Pasta temporária da sessão |
| Ghidra 12.2 + Java 25 | Decompila métodos para C, seguindo tabelas de `switch` | `%TEMP%\gh12`, configurações em `C:\gh12s` |

As cópias locais são temporárias. Os scripts ficam em `docs/re/`.

## Como decompilar um método

1. **Gere o ISIL:** rode o Cpp2IL com saída `isil` e `diffable-cs`.
2. **Ache o endereço:** `node docs/re/findaddr2.js <GameAssembly.dll> <IsilDump/Assembly-CSharp> "Gameplay/Roles/Hacker::PerformHackOfType"`. O script usa o flag de inicialização que cada método testa no começo. Métodos sem esse flag aparecem como `SEMFLAG`.
3. **Decompile:** rode o Ghidra headless com `-noanalysis` e o script `docs/re/DecompAt.java`, passando os endereços. Veja `docs/re/ghidra-batch.ps1`. Cada método sai em `C:/gh12s/out-<endereço>.c`.

**Não rode a análise completa.** Ela passou de 1h20 sem acabar. O modo direto termina em cerca de 1 minuto. `analyzeChanges` também dispara a análise completa: não use.

**Valores numéricos:** o endereço `_DAT_1839...` é uma constante em `.rdata`. `docs/re/rd.js` resolve esses valores. O endereço virtual da seção fica no byte +12 do cabeçalho, não no +8.

**Dados fora das tabelas:** prefabs e cenas têm valores que o extrator não lê, como `PrestigeRankScoring` e `WinRewards`. Procure no projeto exportado pelo AssetRipper, por campo ou pelo guid do `.meta`.

## O que já foi descoberto

### Roupas
| Regra | Valor | Fonte |
|---|---|---|
| Nível exigido | O nível pedido ou maior | `JobHandler.CanApplyForJob` |
| Consertar: quando | Só com exatamente 1 de durabilidade | `PerformNormalAction` `0x1808376B0`, case 8 |
| Consertar: devolve | 65% da durabilidade total, para cima | Constante `0x1839E1010` |
| Consertar: custo | 60% do `BuyValue` + 100 de Tempo | Constante `0x1839E1018` |

### Atributos
| Regra | Valor | Fonte |
|---|---|---|
| Atributo travado | Felicidade, Saúde, Higiene em 0 bloqueiam ações que os gastam | `PlayerState.CanAffordModifier`, `AttributeData.ZeroLocked` |
| Infeliz, Doente, Sujo | Sem efeito: texto sem uso | Sem trait, sem referência nos assets |

### Pontuação
| Categoria | Regra | Fonte |
|---|---|---|
| Fim | Só por rodadas: 10, 20, 30, 40 ou 50 | `RoundManager.IsFinalRoundEnding`, `CustomizeGameMenu.SetDefaultOptions` |
| Vencedor | Maior total; empate vence junto | `ScoreScreenPanel.AssignWinner` |
| Pets | 5, 30 ou 45 por pet × rodadas | `ScoreHandler.CreatePlayerScoreInfo` |
| Recorde do Fliperama | 15 × rodadas | Idem |
| Pesca | `ScoreBonus` × rodadas × 0,02 | `GetFishingScore` |
| Bolsa | Lucro × 0,25 | `HandleInsideChamberState`, `CoreData` |
| Prestígio | 400, 250, 150 aos 3 primeiros | `PrestigeRankScoring` em `Level.prefab` |

### Bolsa
Perfis em `StockBehavior.CreateDefaults`, ligados por `Tier` em `StocksManager.Initialize`. Teto em `base × RoofPercentage`, piso em `base × 0,2` (`ProgressStock`, constante `0x1839E0D40`), mínimo 1.

### Casa de Penhores
Paga `SellValue` (`GetPawnRewardsForItem`); revende por `BuyValue` (`SetDataForBuyingPawnedItems`).

### Papéis
| Papel | Regra | Fonte |
|---|---|---|
| Cultista | Prazo 3 rodadas; Bênção automática a cada 3; nível a cada 9; velas = EXP mod 3 | `Cultist.OnQuestCompleted`, `RefreshRoleWidget` |
| Hacker | Bônus = invasões × 0,2 / 0,1 / 0,01 / 0,02 conforme o tipo | `GetContextValueByType` `0x1807E8A00` |
| Hacker | Chance = `HeatCurve` em suspeita/100, sorteada no fim do turno | `ResolveCatchChance`, `OnTurnEndedBegin` `0x1807EA660` |
| Consumista | Contador de 0; desconto na 4ª e 8ª compra; recomeça | `ActionDiscountTraitEffectForLocation` `0x18079D7B0` |
| Artista | Recarga: 8% + 2% × estudo por turno; avanço 8/15/25% | `Artist.OnTurnStarted` `0x1807DA460`, `GetProgressForState` |
| Workaholic | Combo a cada 3 trabalhos; bônus sorteado de 0 a 99 em faixas 5/15/25/25/30. `WhiteList` (ficha do personagem, `GiveReward`, `QuestFinished`) NÃO zera; qualquer outra ação zera | `ActionComboTraitEffect` `0x18079BD50` |
| Aventureiro | Quest na rodada `% 3 == 1`; EXP para subir = nível + 3; para no nível 9 | `Adventurer.OnTurnStarted` `0x1807D6420`, `get__expForCurrentLevel`, `GiveExp` `0x1807D4F70` |
| Artista | Onde pintar e roupa mínima por local; estado por inspiração 0,1 / 0,33 / 0,8 | `Artist.PaintingActions`, `GetInspirationState` |
| Catador | Chance, garantia e artefatos para liberar | `Scavenger.Locations`, `TryFindArtifact` `0x18080A5B0` |
| Casa de Penhores | Prateleira sorteia 3 móveis especiais e 1 comum | `PawnShopManager.UpdatePlayerPawnStore`, `SpecialFurnitureSold`, `NormalFurnitureSold` |

### Pets
| Regra | Valor | Fonte |
|---|---|---|
| Limite | 1 pet | `PetHandler.MaxPets` |
| Humor | Algum atributo abaixo de 40% = negligenciado; todos em 80% ou mais = mimado; senão contente | `PetHandler.OnTurnStarted` `0x180880C30` |
| Fome | Sem comida, cada atributo perde 5% do máximo por turno; morre depois de 4 turnos | `HandlePetHunger` `0x18087FB80` |
| Eventos | Mimado sorteia evento bom a cada turno; negligenciado, ruim; contente, nada | `PetHandler.OnTurnStarted`, `PositiveReports`, `NegativeReports` |

### Eventos e móveis

| Regra | Valor | Fonte |
|---|---|---|
| Evento do turno | Sorteio por peso entre os elegíveis; evita os 40 últimos; fora os que não dá para pagar | `StoryTagHandler.TrySelectWeightedEvent` `0x1808B4950`, `DrawWeightOf`, `CanPayForEveryChoice` |
| Dormir | Só a melhor cama conta | `RelaxationHandler.GetSleepRewards` `0x1808A8F40` |
| Relaxar | Soma todos os móveis colocados, menos Dinheiro e Estresse | `GetRelaxRewards` `0x1808A8DC0`, `GetRelaxRewardsForPlacedFurniture` `0x180853A40` |
| Combo do Workaholic | 5% tudo, 15% comida, 25% Dinheiro × 2, 25% EXP, 30% +15 Felicidade | `ActionComboTraitEffect` `0x18079BD50`, ordem dos ramos conferida |

### Onde as quests começam

| Origem | Como | Fonte |
|---|---|---|
| Vexcorp | Ações `Get Easy/Medium/Hard Vexcorp Quest` na sala `Vexcorp Lobby` sorteiam a quest; custam 100 de Tempo | `WeightedRewards`, `tut_vex` |
| Aventureiro | Ações `Adventurer Quest Easy/Medium/Hard` | `AdventurerGiveQuestPeriodicallyTraitEffect` |
| Desafios | Quests ligadas só a `ChallengeStorage` | Dados |

As salas `Easy/Medium/Hard/Garden Quests` e as ações `Get Quest - X` não estão em nenhum local: são restos de uma versão anterior. A quest continua existindo pelo sorteio da Vexcorp. Por isso a sala `Garden Quests` não serve de prova de que uma quest começa no Parque.

Quests `Quest-GottaCatchEm 3/5/9`: fora da wiki, com prova de caminho fechado. Missão só é obtida por `Database.TryGetQuestData(id ou key)`, que não enumera a lista (`AvailableQuestsList.AllQuests` não é lida por sorteio algum), e o `Id` delas não aparece em dado, prefab ou cena (só em `slug-map.json`). São versões antigas de `Chain-Gotta-Catch-Easy/Medium/Hard`, que estão na wiki com os mesmos títulos; os títulos delas estão até trocados (a de 3 usa o título de 9).

"Vale a pena" das quests: Dinheiro da recompensa menos o gasto, dividido pelo Tempo de aceitar e cumprir (sem caminho), comparado à mediana de `JobData.Rewards` (Dinheiro por 100 de Tempo). Escolhas de evento: comparação atributo a atributo, sem supor quanto um atributo vale em outro.

### Conteúdo sem uso

Fora da wiki (`DEV_ONLY` em `tools/build-site.js`), só com prova positiva: Construction Yard (`Chambers`, `Jobs` e `Homes` vazios; só está em `MapLevel SchnitzelLand-v1`, que nenhum `MapLayoutData.MapReference` usa), Laundromat (o prédio só existe por `MapSlots`, lido em `EnvironmentManager.LoadMap` via `MapBuildingSlot.SetBuilding`, e nenhum dos 6 `MapLevel` tem esse local) e as Missões acima. Os demais voltaram à wiki: ver "Ausência não é prova".

### Texto do jogo contra código

Quando discordam, a wiki segue o código.

| Assunto | Texto do jogo | Código |
|---|---|---|
| Quest do Aventureiro | "a cada 2 rodadas" (`Role-Adventurer-Level-01`) | Rodada `% 3 == 1`, constante `Interval = 3` |
| Infeliz, Doente, Sujo | Textos de penalidade | Sem trait nem referência |

## Empregos e locais (Bloco 4)

| Regra | Valor | Fonte |
|---|---|---|
| Abas da Agência | Lista só empregos com `JobLevel` igual ao da aba (0 a 6, nos dados `SubType` 1 a 6 e 99 para nível 0) | `LocationPanel.SetChamberDataForJobs` `0x1808FB510`: `job+0x30 == param_3`; `SetChamberDataForType` |
| Cargos fora das abas | 17 cargos têm `JobLevel` 11 a 16, então não aparecem em aba nenhuma. Falta ver em partida se existe outro caminho | Dados `JobData`, mesmo método |
| Sem roupa | Traço `Become-Naked-Benefits` troca as abas 1 a 6 pela de Empregos Sem Futuro | `Naked-Alter-Work-Chambers` |
| Colapso Econômico | Tira as abas 3 a 6, quebra a Bolsa e demite com bloqueio de 2 rodadas | `Economic-Crash-Remove-Work-Chambers`, `GlobalEventEconomicCrash.OnEventStarted` |
| Candidatura | Não gasta Tempo; pede XP acumulado, cursos e roupa | `JobHandler.CanApplyForJob` `0x18085AA10`, `TryApplyForJob` |
| Salário | Não depende do nível de XP; muda só por emprego e modificadores | `JobHandler.GetWorkRewards` `0x18085C390` |
| Dívida de aluguel | Desconta `min(devido, salário × 0,25)` | `RentHandler.SubtractRentDebtFromSalary` |
| Demissão por falta | 3 rodadas sem trabalhar; no início da seguinte, −200 Felicidade e prédio bloqueado por 4 rodadas. Não vale para `JobLevel` 0 nem `IsSafe` | `LostYourJobGameSystem.OnTurnStarted`, `GetFired` `0x18085B8A0` |
| XP | Total acumulado, não zera ao trocar de emprego; sobe 1 nível por ganho | `CheckForJobExperience` `0x18085B000` |
| Andar | Cobrado por quadra: 20 de Tempo a pé, 18/17/16 com ×0,9/0,8/0,7 nos transportes da Vexcorp (arredondamento não lido) | `MovePlayerOnPath` `0x180860DF0`, `Vexbus/Vexway/Vexmobile-Modifier` |
| Metrô | Só Chailand: 10 de Tempo e 1 bilhete por viagem | `MapLayoutData.SlotPortalingCost` |
| Passe de metrô usado | Dá 1 a 5 bilhetes, peso igual | `ChamberActionData/Used Metro Pass.WeightedRewards` |
| Prédios próximos | Ordem por distância em linha reta; o caminho real segue as ruas | `MapEditor.MapLevel.MapSlots.IsoPosition` |

Sem uso: `UseMovementCost`, `DefaultWorkExpForJobIfNotFound`, `ProficiencyAmountPerWork/Level`, `JobProficiencies`, `FirePlayerFromJobIfNotWorked`.

## Eventos Globais, Prefeito e bots (Bloco 5)

| Regra | Valor | Fonte |
|---|---|---|
| Agenda | Sorteada no início; rodadas por tamanho e frequência; 1 evento por rodada marcada | `GlobalEventManager.Initialize` `0x1809E5720`, `Level.prefab` `GlobalEventFrequencies` |
| Raridade | Comum 100%, Incomum 75%, Rara 33% | `GetGlobalEventRarityPercentage` `0x180B61A30`, prefabs |
| Onda de Crimes | Marco de Dinheiro ganho × jogadores; 1ª rodada poupada; 3 crimes a 50%; segurança filtra | `CrimeManager`, `GlobalEventCrimeWave.OnTurnStartedForPlayer`, `TryBreakThroughSecurity` |
| Onda de Calor | Medidor 0,165 × Tempo andado; acima de 100 encerra o turno | `GetWalkHeat`, `EndTurnForPlayer` `0x18090A790` |
| Oferta Relâmpago | Dinheiro ×0,8 em móveis, roupas, eletrodomésticos, 2 rodadas | `Flash-Sale-Effect` |
| Corrida do Lago | +5 peixes de peso 20 em `Go Fishing`, 3 rodadas | `Pond-Rush-Effect` |
| Pane Y2K | Juros do cofre 0,04 → 0,36, 1 rodada | `Y2K-System-Failure-Effect` |
| Turistas | 1 prédio por rodada, fechado 2 rodadas | `GlobalEventTouristInvasion.OnRoundStarted` |
| Colapso | Demite quem não é `IsSafe`, preços ×1,1, abas 3 a 6 somem | `GlobalEventEconomicCrash.OnEventStarted` `0x180909EF0` |
| Kaiju | Barra 40; pôster +3, missão +5; empate para Clucker's | `GlobalEventKaijuBattle` `0x18090E200` |
| Grande Jogo | Chance = pontos ÷ (80 + 10 × jogadores) | `GlobalEventBigGame` `0x180906230` |
| Remessa Suspeita | Fora da wiki, com prova: não está em `MapLayoutData.GlobalEvents` (`IsEventInRealmPool`), nem nos 13 de `GlobalEventStorage`, nem em `PermanentGlobalEventId`/`LoopingGlobalEventId`; o guid do prefab não é citado por nenhum asset; `Term` vazio e texto "(Nota mental: escrever algo engraçado aqui)". Se saísse: 3 móveis com `CanBeDrawnForSale` e `FurnitureSlot` fora de 0/300/310/320 entrariam na Casa de Penhores | `GlobalEventSuspiciousShipment.OnEventStarted` `0x18092F130`, `GlobalEventStorage.asset` |
| Prefeitos | Barry −50 Felicidade por rodada; Boris divide Dinheiro; Edgar corvos grátis, esquecer −200 Higiene; Bell Academia ×0,5, Clucker's ×2 | `GlobalReduceAttributeStartOfRound`, `MayorDivideCashEqually` `0x1807BAEF0`, `Mayor-*` |
| Renúncia | `votos × 2 > jogadores ativos` | `MayorVoteOutOfOfficeTracker` `0x1807BB8D0` |
| Bots | Diferem só em refeições/aluguéis esquecidos, escolha de cartas e Prestígio | Assets `Bot Personality`, `HandlePrestige` |

Não publicado por falta de leitura: força de `CrashMarket/RushMarket`, placar inicial do Kaiju, Bola Autografada, vínculo Armadura/Robô com proteção (em pesquisa).

## Fome, dívida, banco e loteria (Bloco 5)

| Regra | Valor | Fonte |
|---|---|---|
| Fome | Da rodada 2 em diante, sem `HasEatenInTurn`: −600 Tempo, −50 Felicidade, −50 Saúde. O número da Satisfação não é lido | `PlayerState.StartTurnForPlayer`, `ReportData/Forgot to eat` |
| Geladeira | Come 1 unidade no fim do turno; vale só a maior (2/4/6/6) | `HomeHandler.OnTurnEnded` `0x180856640`, `GetFoodStorageSize` |
| Aluguel | Rodadas múltiplas de 4; vira dívida no fim do turno com 5% sobre tudo | `HandleRentForTurnStart` `0x1808AB700`, `HandleRentForTurnEnd` `0x1808AB300` |
| Penhora | Todo início de turno com dívida: menor `SellValue` que cobre, senão o maior | `TryFindPawnableFurnitureForRentDebt` `0x1808ADB50` |
| Despejo | Dois turnos com dívida; `IsAnyRentOwed` bloqueia novo aluguel | `ChamberActionAvailability.Evaluate` |
| Empréstimo | Não existe: `Debt` sem chamador | Varredura no ISIL |
| Cofre | 4% no fim do turno, soma bônus (`CheckForInterestRateChange` soma) | `CheckForVaultInterest` `0x18088A170` |
| Loteria | Sorteio por rodada desde a 2, 3% por bilhete, 950 a 1.100 | `NetworkedLottery.OnRoundStarted` `0x180817990` |
| Onda de Crimes, ordem | `GlobalEventManager.OnRoundStarted` `0x1809E7A50` chama `TryStartEvent` antes do laço que soma o contador: rodada do início = 1, seguinte = 2, e os crimes exigem ≥ 2 | `GlobalEventCrimeWave.OnTurnStartedForPlayer` `0x180908DE0` |


## Empregos e locais: fechamento (Bloco 6)

| Regra | Valor | Fonte |
|---|---|---|
| Desgaste da roupa | A cada início de turno do jogador, menos na rodada 1, a roupa vestida perde 1 de `InventoryItem.Duration`; com 1 sobra o aviso "precisa de roupa nova"; em 0 roda o gatilho "Lost Clothes" e o jogador volta à roupa padrão. A unidade é a rodada: uma roupa de durabilidade D dura D rodadas, contando a da compra | `LostYourClothesGameSystem.OnTurnStarted` (ISIL), `ItemData.Durability` 6/7/7/10 |
| Desgaste, só roupa | `PlayerState.ProgressCooldownAndDurability` percorre `Stashes` (mochilas e armários), não `Equipment`; só mexe em itens com `Duration` maior que 0 e roda `ItemData.DurabilityTriggers`. Só as 4 roupas têm `Durability` acima de 0 | `ProgressCooldownAndDurability` `0x180893670` (Ghidra) |
| Lavar a Seco | `Duration` da roupa vestida passa a `ItemData.Durability` × `Durability` do efeito (1), isto é, durabilidade total | `GiveClothesDurabilityOnActionTraitEffect.OnExecuteActionSuccess` `0x1807A7380` |
| Caixinha de Gorjeta | Cada trabalho (ação 440) de emprego que dá o traço soma o salário em Dinheiro ao acumulado; ao saquear, Dinheiro = acumulado × um multiplicador sorteado entre 0,1, 0,25, 0,5, 0,75 e 1 (lista `_mults`, montada no construtor); `OnTurnStarted` zera o acumulado | `JobPerkTipJarTraitEffect` `OnExecuteActionSuccess` `0x1807B9000`, `CheckForChamberAction` `0x1807B8AA0`, `.ctor`, `OnTurnStarted` (ISIL) |
| Habilidade de gamer | Treinar (`Purpose` 26) soma 1 à habilidade. Jogar (`Purpose` 24) soma 1 e a pontuação da partida = recompensas de pontuação (tipo 95) + habilidade × 25 (`GamerSkillScore`) | `ArcadeGameSystem.OnActionPerformed` `0x18093C0C0` |
| Teletransporte da Vexcorp | A recompensa tipo 120 aponta o gatilho "Vex Teleport" (`TriggerType.TeleportToBuilding`); a ação só custa 25 de Higiene e tem `Cooldown` 0. As regras de destino (`CanTeleportTo`, `IsTeleportDestination`) não foram publicadas | `ChamberActionData/Vexcorp - Teleport`, `TriggerData/Vex Teleport` |
| Achados e Perdidos | Sorteio de 11 prêmios com peso 1 cada | `ChamberActionData/Check Lost and Found.WeightedRewards` |
| Artista: cargo | O cargo é `Rewards[min(nível de EXP de Trabalho, 6) − 1]`; `OnJobLevelUp` chama `CheckForJobChange`, que troca o cargo sozinho. Só existem 6 listas de obras: a "Make Art Reward 7" não está em `Artist.Rewards` | `Artist.GetCurrentRewardIndex` `0x1807D8D00`, `CheckForJobChange` `0x1807D7900`, `RoleArtistActionTrackerTraitEffect.OnJobLevelUp` `0x1807C7910`, dados `Artist.Rewards` |
| Artista: custo | O turno de trabalho cobra `JobData.Rewards` (Tempo −125). `ChamberActionData/Artist - Make Art` (−150) é citada pelo traço `Role-Artist-Trait` (efeito `Artist-Add-Make-Art-Action`, lista de salas vazia) e dá o título ("Fazer Arte"). `GetPaintTimeCost` lê o Tempo do cargo | `Artist.GetPaintTimeCost` `0x1807D8F50`, `TryHandleWorkInput` `0x1807DC270` (ação de trabalho 440) |
| Artista: inspiração e custo | `CheckForWorkAction` multiplica cada entrada da lista de recompensas de trabalho cujo atributo não seja Tempo (`RealmData.ActionPointAttribute`) por 0,5 (sem inspiração ou vazio), 0,8 (neutro) ou 1,3 (inspirado). Felicidade, Saúde e Higiene entram; se a EXP de Trabalho está na mesma lista não foi confirmado, e a wiki só afirma os três atributos. Arredondamento não lido | `RoleArtistActionTrackerTraitEffect.CheckForWorkAction` `0x1807C6DC0`, `Artist.GetAttributeCostMultiplier` (ISIL) |
| Transporte da Vexcorp, por quadra | Custo do item × fator: 18 × 0,9, 17 × 0,8, 16 × 0,7, que dão cerca de 16, 14 e 11 | `ItemData.Rewards`, `ModifyMovementSpeedAndCostTraitEffect.AdditionalMoveCostList` |
| Textos do jogo em pt-BR repetidos | "Atendente de Vestiário" serve a `Clothing Store 2` (en: Changing room attendant) e a `Locker Room Attendant`; a frase "Desincruste novas e emocionantes formas de vida!" serve a `Locker Room Attendant` e a `Sales Person` (en: Meet new and exciting lifeforms). A wiki usa "Atendente de Provador" e "Conheça formas de vida novas e emocionantes." | `job_clothing_store_tier_2_title`, `job_mall_salesperson_flavor` |
| `Buy Pet Power Hungry Frog` | Usa o título `action_buy_pet_frog1_title` do sapo preguiçoso; a wiki mostra o nome do item que a ação entrega | `ChamberActionData` |

## Papéis (Bloco 7)

Regras lidas em `Gameplay/Roles/*` e nas características de papel. Onde o texto do jogo e o código discordam, a wiki segue o código.

| Regra | Valor | Fonte |
|---|---|---|
| Sênior: aposentadoria | 400 de Dinheiro mais `_pensionBonus`, paga no início do turno das rodadas pares (`round & 1 == 0`) | `Senior.OnTurnStarted` `0x18080BDE0`, constante `PensionAmount 400` |
| Sênior: Reclamar da aposentadoria | Soma 20 **fixo** (não 20%) em `_pensionBonus`; acumula e nunca zera | `Senior.IncreasePension` (`add dx,14h`), `PensionIncrease 20` |
| Sênior: Reclamar do aluguel | Soma 30 **fixo** em `_totalRentReduction`. No início do turno em que o aluguel vence (`IsRentPayable`), `RentToPayThisRound -= min(redução, aluguel)` e a redução zera; se o aluguel não venceu, fica guardada | `Senior.AddRentReduction` (`add dx,1Eh`), `SeniorComplainTraitEffect.OnTurnStarted` ISIL 034 a 073, `RentReduction 30` |
| Hacker: duração | `TurnsRemaining = 4` por **tipo** de invasão (todas do mesmo tipo de lugar compartilham o contador); cai 1 no fim de cada turno, inclusive o da invasão; expira em 0. Invadir de novo soma 1 em `CurrentHacks` (até `MaxHack`) e reinicia em 4. O texto `hack_duration` (3) discorda; o da ficha (4) concorda | `Hacker.PerformHackOfType` `0x1807EAE90` ISIL 082, `TickHackDurations` `0x1807EC600`, `HackDuration 4` |
| Hacker: suspeita | Cada invasão soma `HeatForHack` (teto 100). Se não for pego, cai `min(suspeita, 5)` por fim de turno | `PerformHackOfType`, `Hacker.OnTurnEndedBegin` `0x1807EA660`, `HeatLoss 5` |
| Hacker: ser pego | Relatório −200 Tempo e −100 Felicidade; suspeita vai a 0; `_HackQuestTracker` é limpo; `LockHackedBuildingsForBust` tranca os prédios com invasão ativa por 1 rodada; o carro baixado (tipo 8) é revogado. Os contadores dos outros tipos **continuam** (a frase "perde os bônus" não tem fonte; a ficha do jogo diz "perde o acesso aos locais por 1 rodada") | `OnTurnEndedBegin`, `LockHackedBuildingsForBust` `0x1807EA070`, `ReportData Hacker - Caught`, `BustLockoutTurns 1` |
| Hacker: Missão | `TrackQuestHack` `0x1807EC940`: a 2ª invasão de um mesmo tipo soma 1 a `QuestObjectiveCount` e remove o tipo do rastreador. Objetivo cumpre com `Count <= QuestObjectiveCount` (nunca zera). Logo 8 e 10 são alcançáveis: cada tipo pode fechar pares várias vezes | `RoleHackerHackComboQuestObjective.CheckObjectiveStatus` `0x180841B30`, `QuestHackAmount 2` |
| Cultista: Missão | Objetivo cumpre com `Count <= CompletedBiddingsCount`. `MarkBiddingCompleted` soma 1 por vontade e `ClearTierCompletions` não mexe no contador. `Count` = 3, 9, 15, 21, 27 (o texto escreve 3, 6, 9, 12, 15) | `RoleCultistCompleteBiddingQuestObjective.CheckObjectiveStatus` `0x18082C2B0`, `Cultist.MarkBiddingCompleted` |
| Workaholic: Dinheiro do combo | A faixa de Dinheiro monta uma lista de recompensas à parte com **2 × o Dinheiro** da recompensa de trabalho, somada ao pagamento normal (o turno rende 3×). Faixas: 0 a 4 tudo, 5 a 19 comida, 20 a 44 Dinheiro, 45 a 69 EXP, 70 a 99 Felicidade | `ActionComboTraitEffect` `0x18079BD50` (`iVar7 * 2`) |
| Artista: custo da pintura | Dados do `JobData` Artist Job N: −125 Tempo; `GetPaintTimeCost` lê o Tempo ali. `RoleArtistActionTrackerTraitEffect.CheckForWorkAction` multiplica os outros atributos da recompensa de trabalho por 0,5 (sem inspiração), 0,8 (neutro) ou 1,3 (inspirado). A ação `Artist - Make Art` (−150) entra pelo traço do papel, sem sala listada, e dá o título; vale o custo do emprego (−125), como a linha "Artista: custo" acima | `Artist.GetPaintTimeCost`, `GetAttributeCostMultiplier`, `CostMultiplier*` |
| Artista: inspiração inicial | `EnsureInspirationSeeded` embaralha (`Extensions.Shuffle`) os locais e distribui valores iniciais | `Artist.EnsureInspirationSeeded` |
| Aventureiro: EXP por Missão | `max(QuestComponent.Tier, 1)`, quando a Missão concluída dá Pontos. `Tier` 1, 2, 3 escolhe o saco (Moedas, Ouro, Joias) em `ConditionalQuestRewards.TargetValue`. INFERIDO: Tier = dificuldade da Missão sorteada | `AdventurerGiveExpOnQuestComplete.OnExecuteActionSuccess`, `Adventurer.GiveExp` `0x1807D4F70` |
| Aventureiro: aventuras | `Adventurer Quest Easy/Medium/Hard` sorteiam 2, 3 e 3 cadeias (peso 1 cada); todas terminam em `Complete Adventurer Quest` (−100 Tempo, no Parque): 50/100/150 de Dinheiro e 75/150/225 de pontos | `ChamberActionData.WeightedRewards`, `Quest Complete-Adventurer-Quest*` |
| Catador: espera | `Scavenge - <lugar>` tem `Cooldown 1` por ação e cada lugar tem a sua: 1 busca por rodada por lugar. Custo: −120 Tempo, −25 Felicidade, −25 Saúde, −50 Higiene | `ChamberActionData Scavenge - *` |
| Misticista: Virgem | Soma 0,09 à chance base de 0,03 da loteria (12% por bilhete) | `ModifyLotteryWinChanceTraitEffect`, `NetworkedLottery` |
| Misticista: Peixes | `AddItemToItemPoolTraitEffect` em `Go Fishing`: 5 peixes especiais, peso 10 cada, contra 180 de peso do sorteio base (cerca de 22%) | `Mystic-Pisces-Fishing-Normal` |
| Misticista: Escorpião | `TravelDistanceQuestObjective` soma 1 a cada evento de métrica 305 e cumpre em `Distance 25`. INFERIDO: o evento é de uma quadra andada | `TravelDistanceQuestObjective.CheckObjectiveStatus` |
| Misticista: Touro | `Quest-Mystic-Taurus` tem `Count 0`; o dado de Saúde traz dois efeitos de 75 em ioga, massagem e beiço (Med e High) | dados `Mystic-Taurus-Health-*` |
| Andarilho | `JobTraitDuration 3`: as vantagens do emprego concluído seguem por 3 rodadas | `Drifter.JobTraitDuration` |
| Espera (`Cooldown`) | Lida como rodadas: 1 = uma vez por rodada, N = uma vez a cada N rodadas (mesma leitura das páginas de característica) | `ChamberActionData.Cooldown` |

Preposição antes do nome de lugar: `tools/explicacoes/lugares.js` deduz o artigo do próprio nome ("O Parque", "Agência de Empregos").

## Itens, móveis e pets (Bloco 8)

Texto em `tools/explicacoes/itens.js`. Pesquisa de origem: `research/items.md` (Ghidra, ISIL, dados). Endereços da build 26456250.

### Ausência não é prova

Regra: um jogador mostrou que uma afirmação "não existe", baseada só em ausência nos dados, estava errada. Não estar em sala, loja ou no JSON extraído não prova que falta no jogo: ações entram por traços, código, posse de item, modificadores, eventos e desafios. Só sai da wiki o que tem prova positiva (caminho de código fechado ou registro vazio). O resto fica com página dizendo que a fonte é desconhecida (`tools/explicacoes/itens-sem-fonte.js`).

Busca feita para cada item: `Id`, `_id` e nome em `data/raw`; guid e `Id` em todo `.asset`, `.prefab` e `.unity` do projeto exportado; nome e `Id` no ISIL. Resultado: nada entrega estes itens (só `slug-map.json` cita o `Id`).

| Item | Situação | O que os dados mostram |
|---|---|---|
| Junk 1 a 10, Dinosaur Bone 2, The Golden Hamilton, Piece of Diploma, Quest Item Mysterious Briefcase e Fish Bait | Voltou, fonte desconhecida | Sem referência. Rótulo `NotInUse` (`ItemGroup 5`) só em parte deles, e nenhum código de jogo que bloqueie por esse rótulo foi lido. Texto de Piece of Diploma fala em juntar 3; ação não encontrada |
| Pet Conservative Sheep, Pet Introverted Armadillo | Voltou, fonte desconhecida | Sem `Buy Pet`. `PetHandler.CalculateRandomPetsAvailableToBuy` lê `GetAllActionRewardsInChamberForPlayer`, ou seja, ações das salas |
| Mining Laser, Kernite, Omber, Scordite, Veldspar | Voltou, fonte desconhecida | `Buy Mining Laser` sem sala (nem guid citado); o item dá `Add-Mining-To-Commons`, que põe `Go Mining` em `Garden Commons`; pesos 8/18/32/42 |
| One Week Healthy Food | Voltou, fonte desconhecida | `Cleansing Food` sem sala (nem guid citado) |
| Dirty Money | Voltou, fonte desconhecida | `Wash Dirty Money` entra em `Garden Commons` por `Can-Wash-Dirty-Cash`, do traço `Scavenge-Level-01`, que nada concede |
| Lost Homework | Voltou, fonte desconhecida | Item dá `Return-Lost-Homework-Trait`; `Hand in Lost Homework` dispara o gatilho 17, `EducationManager.ReturnHomework` (efeito não lido) |
| Box of Plagues | Voltou, fonte desconhecida | `Cultist - Pick up box of plagues` (efeito `BiddingPlaguesPickup`, sala `Pawn Shop Buy Pawned`) só gasta 25 de Tempo nos dados |
| Friendship Crate | Voltou, compra confirmada | Modificador `Friendship Crates` (`ChallengeOnly`, desafio `Adventure Season`) põe `Buy Friendship Crate` em `Garden Pond`. `FriendshipCrateGiveReportTraitEffect.OnRoundStarted`/`PickRecipient`: outro jogador recebe o sorteio de `Get Friendship Crate Rewards` |
| 8 cursos sem departamento | Texto trocado para "não encontramos onde se matricular" | `Department` nulo, sem referência; só `BotHandler` chama `Database.GetAllEducation` |

Prateleira da Casa de Penhores: `TryGetRandomNormalFurniture` sorteia móveis das recompensas das ações em `PawnActionChambers`; `TryGetRandomSpecialFurniture` varre todos os itens com `FurnitureSlot` 300, 310 ou 320. `CanBeDrawnForSale`: `Purpose` 4, sem `SubTypes` 120 nem 270.

Ações descartadas na página (`DEAD`, `tools/explicacoes/itens.js`): não são listadas como compra porque não achamos quem as coloque no jogo, o que não prova que faltem: `Go Fishing Sturdy`, `Food for 2 Weeks`, `Food for 4 Weeks`, `Buy Bed Cardboard`, `Go Mining`, `Buy Mining Laser`, `Cleansing Food`, `Buy Friendship Crate` (esta existe por modificador e é explicada na página do item).

Sem fonte conhecida, com página: `relax-chair-plastic`, `security-crappy`, `toaster-teeth`. A Cama de Papelão vem de `RealmData.StartingEquipment`.

### Regras usadas nas páginas

| Regra | Valor | Fonte |
|---|---|---|
| Efeito do item (traço em `ItemData.Rewards`, Type 110) | Vale na mochila (Purpose 1), equipado (3), colocado em casa (4) ou como pet (7). Ração, comida e ingrediente (Purpose 2, 5, 6, 8) ignoram traços | `TryUpdatePlayerOwnedItemState` `0x18083BD80` |
| Missão que "usa" o item | Só conta quando um objetivo cita o item (`ItemData`, `TargetItem`) ou quando toda ação aceita pelo objetivo o exige em `RequiredItems`; se só uma alternativa exige, é opcional; sorteio de uma ação (pesca, reclamar) não conta | `Quest.references`, `ChamberActionData.RequiredItems` |
| Pesca | Só existe no lago de O Parque. `AddFishingToHomesTraitEffect` não tem dono (nenhum traço o lista) e `Go Fishing Sturdy` não tem sala | `AddChamberActionTraitEffect`, `Trait.Effects` |
| Peixe na pontuação | `ScoreBonus` × rodadas × 0,02, uma vez por espécie (`CaughtFishKeys`); Koi e Estrela-do-Mar são peixes (`SubTypes 110`) mesmo com `ItemGroup 1` | `GetFishingScore`, `RegisterCaughtFish` `0x1808B0FD0` |
| Segurança | Ladrão entra com chance 1 menos a Segurança; móvel comum de nível 2, 4 e 6 tira 0,02, 0,04 e 0,08; Armadura zera só o furto de Dinheiro e o Robô Aspirador só o de móvel | `TryBreakThroughSecurity` `0x180858630`, `GetHomeSecurity` `0x180853240` |
| Geladeira | `ContainerSize` 2, 4, 6 e 6 (Dimensional); vale a maior, não a soma; sem geladeira a comida estraga no fim do turno | `GetFoodStorageSize` `0x1808525A0`, `HomeHandler.OnTurnEnded` |
| Loteria | 3% por bilhete, prêmio de 950 a 1.100 dividido entre os premiados; Gato da Sorte +3 pontos percentuais, gato de estimação +1,5/3/4,5, Bilhete Infernal +100 | `LotteryData`, `NetworkedLottery.OnRoundStarted` `0x180817990` |
| Anel | Cada deslocamento custa −20 Felicidade, −20 Saúde, −20 Higiene; `Encumbered-New` (velocidade ×1,5, Tempo ×1,2) vale para os itens de missão pesados | `ModifyMovementAttributeRewardsTraitEffect`, `ModifyMovementSpeedAndCostTraitEffect` |
| Vantagens de pet | Três valores por humor (negligenciado, contente, mimado): salário +5/10/15%, loteria +1,5/3/4,5 pontos, penhora ×1,1/1,2/1,3, EXP de Trabalho ×1,15/1,30/1,45, compras nas lojas ×0,95/0,90/0,85, juros 1/2/3%, missões ×1,1/1,2/1,3, Desquitado +20/40/60 por turno, Porco Tempo ×0,75/0,5/0,25 e Felicidade ×1,2/1,4/1,6, Panda Tempo e Felicidade ×0,85/0,70/0,55. Multiplicadores de ação não dependem do humor | `Pet*TraitEffect` (`0x1807C3CA0`, `0x1807C2880`, `0x1807C26D0`, `0x1807C16E0`, `0x1807C1D60`, `0x1807C3FB0`) |
| Cachorro: Caminhada | `Pet-Dog-Modify-Walk-Action` soma +50 Felicidade, +150 Saúde, +50 Higiene. A leitura "soma" é inferida: trocar o valor pioraria a Felicidade (100 para 50) | `ModifyChamberActionRewardsTraitEffect` |
| Casa de Penhores | Banjo soma 1 vaga especial (3 para 4); Barril ×1,2 na penhora dos peixes; Gato da Sorte +0,03 | `IncreasePawnShopCapacityTraitEffect`, `ModifyItemPawnPriceByPurposeTraitEffect` `0x1807BE1D0` |
| Torradeira de Bagel | 5% de chance do relatório "Religious Toast", que dá 400 de Dinheiro; a frequência do sorteio não consta nos dados | `ReligiousToastReportTraitEffect`, `ReportData` |
| Artefatos do Catador | Chance, tentativas e artefatos para liberar por local, na ordem de `Scavenger.Locations`; "garantido" em N tentativas é leitura inferida do deslocamento | `TryFindArtifact` `0x18080A5B0` |
| Compra | O "Compra" da ficha é o custo da ação de loja (Dinheiro e Tempo) e a quantidade que a ação entrega (Isca e Sabonete vêm de 3 em 3). `BuyValue` e `SellValue` do item são valores da Casa de Penhores | `ChamberActionData.Rewards` |
| `ItemData.MaxStack` | Nenhum código de inventário o lê (só `Trait.MaxStack`); fora da ficha por falta de uso confirmado | busca em `Assembly-CSharp` |
| Transporte | O `Time` de `Rewards` é o custo por quadra (20 a pé; 18, 17, 16 nos Vex); só um transporte equipado por vez | `RealmData.EquipmentTypes`, `Vexbus/Vexway/Vexmobile-Modifier` |
| Bolsa | O preço-base é o `BuyValue` do item; teto de 3× (2× no perfil de queda), piso de 20% | `StockBehavior.CreateDefaults`, `ProgressStock` |

"Vale a pena?" de cada item usa só números dos dados: preço de loja e Tempo da ação, venda na Casa de Penhores, pontos por moeda, taxa por 100 de Tempo, venda média de uma pescaria (média ponderada de `WeightedRewards` pelo `SellValue`). Nenhuma taxa de câmbio entre atributos.
| Artista: tabela de quadros | `GetCurrentRewardIndex` = `min(nível de EXP, Rewards.Count) - 1`; `Artist.Rewards` tem 6 entradas, então `Artist - Make Art Reward 7` nunca é usada e o nível 6 em diante usa a tabela 6 | `Artist.GetCurrentRewardIndex` (ISIL 048 a 060) |


Misticista, Escorpião: `TravelDistanceQuestObjective.CheckObjectiveStatus` soma 1 a cada ação 305 (`OutsideOnMapMoveBetweenTiles`), a mesma cobrada a cada quadra em `MovePlayerOnPath`. Portanto "25 de distância" são 25 quadras.

"Vale a pena?" das missões: os pontos (`Type` 95, categoria `Quest` 70) vêm primeiro, porque só a pontuação decide a partida. Compara pontos por 100 de Tempo com a mediana das missões e com o que subir um nível de EXP rende trabalhando (`ExperiencePointData.Score` ÷ Tempo dos turnos). Dinheiro entra como informação à parte.

## Varredura final: empregos, locais, papéis e guias

| Regra | Valor | Fonte |
|---|---|---|
| Loteria: bônus de sorte | Soma pontos percentuais à chance base de 3%: Gato da Sorte +3 (`LotteryWinChanceModifier` 0,03), gato de estimação +1,5 / +3 / +4,5 (`NeglectedWinChanceIncrease` 0,015, `ContentWinChanceIncrease` 0,03, `PamperedWinChanceIncrease` 0,045). Com +3 a chance vai a 6% e o bilhete devolve 0,06 × 1.025 ≈ 61 | `LuckyCatInceaseLotteryChanceTraitEffect`, `Pet-Cat-Modify-Lottery-Win-Chance` |
| Pane Y2K | O juro do cofre fica em 36% (0,04 → 0,36) por 1 rodada. A wiki diz "de 4% para 36%", não "+36 pontos" | `Y2K-System-Failure-Effect` (linha da tabela de Eventos Globais) |
| Dinheiro e pontos | O Dinheiro não vale pontos por si só (`Pontuação`); "Vale a pena?" de empregos e locais lista os pontos primeiro | Tabela de Pontuação acima |
| Cursos: pontos por Tempo | Pontos do curso (`CompletionReward`, tipo 95) ÷ (Tempo da matrícula + `StudyThreshold` × Tempo do estudo) × 100: Introdução ao Bom Senso 150 ÷ 750 = 20, Introdução à Má Gestão 300 ÷ 1.050 = 28,6 | `EducationData.EnrollmentCost`, `StudyCost`, `StudyThreshold` |
| Cursos: móvel exigido | `EducationData.RequiredItems` são referências (`$ref`), não entradas com `Id`: Computador Superaquecido a partir do 4º curso, Biblioteca Doméstica a partir do 7º. É requisito para cursar, não para o emprego | `EducationData` Degree IV a IX |
| Moradia: pontos por Dinheiro | `RentScore` ÷ `Rent`: Porão 150 ÷ 150 = 1, Quitinete 200 ÷ 250 = 0,8, Chique 250 ÷ 400 = 0,63 | `HomeData` |
| Cargos com `JobLevel` 11 a 16 | A afirmação "não aparece em nenhuma aba" vem só da leitura de `SetChamberDataForJobs`; as páginas dizem "pelo código não deveria aparecer" e que não foi conferido jogando. O Vale a pena desses cargos aparece sem posição no ranking | Linha "Cargos fora das abas", Bloco 4 |
| Registro irmão no mapa | `Schnitzel-Furniture Store` está em `MapLayoutData` de Schnitzelland, mas as posições de `MapEditor.MapLevel` apontam para o registro `Chailand-Furniture Store`; "Como chegar" usa a posição do irmão de mesmo nome. `Chailand-Metro-2` não tem posição nos dados | `MapLevel.MapSlots.LocationId` |
| Passe de Metrô (Estudante) | Vendido na sala de matrícula da Faculdade, em Chailand: o traço `Chailand-Metro-Trait` inclui `Chai-Metro-Add-Tickets-Academy`, que acrescenta a ação à sala `Academy Registration` | `AddChamberActionTraitEffect`, `ChamberActionData/Student Metro Pass` |

## Varredura final: itens e pets

| Regra | Valor e fonte | Onde |
|---|---|---|
| Preposição antes de lugar | O artigo vem do próprio nome (`tools/explicacoes/lugares.js`); em `itens.js`, "Pet Shop" é tratado como feminino. Nas frases de `itens.js`, as listas de lugar saem "na Loja de Eletrônicos e no Shopping" (dois lugares, não "Loja de Eletrônicos, Shopping") | `itens.js` (`emLugar`, `emLugares`, `textoOnde`) |
| Cupom Infernal: pontos do móvel trocado | Maior `ScoreBonus` entre os móveis de prateleira (`BuyValue` > 0, sem móvel de Cultista nem Esqueleto de Dinossauro): conta feita em `worth()` a partir de `ItemData`; a prateleira em si vem de `TryGetPurchaseCoupon` | `ItemData` |
| Currículo Abissal | A ação `Cultista - Hand in Abyssal CV` (`Purpose` 28) só tem `-50 Tempo` em `Rewards`. Que a entrega avance o nível de EXP vem só do texto do jogo (`action_cultist_abyssal_cv_flavor`); a página diz que o ganho exato não está nos dados | `ChamberActionData` |
| Móveis exigidos por curso | `EducationData.RequiredItems` aponta o móvel (Computador Superaquecido 6 cursos, Biblioteca Doméstica 3); a página de "Vale a pena?" agora diz isso | `EducationData` |
| Pesca: lixo e peixes pedidos por curso | Sapato, Garrafa de Gosma e Saco de Lixo (curso Pesca com Vara Magnética) e peixes do curso Mestre da Pesca: "Vale a pena?" avisa para não vender todos antes do curso | `EducationData.RequiredItems` |
| Signo de Peixes | O efeito `Mystic-Pisces-Fishing-Normal` é do signo de Peixes do papel Misticista, não uma missão | `Gameplay.Roles.Mystic` |

## Varredura final: Missões e Eventos

| Regra | Valor e fonte | Onde |
|---|---|---|
| Tempo da Missão só soma ações nomeadas | `questEffort` só soma objetivos com `ActionData`. Os objetivos `PerformAnyAction`, `PerformActionsInSameRound`, `PerformWorkAction`, `DrifterWorkCombo`, `PerformStudyAction`, `GetEducation`, `Visit*`, `EnterChamber`, `TravelDistance`, `WaitUntilNextTurn`, `DoNotPerformActionForDuration`, `GainAttribute`, `CountItem*`, `SellPawnItem`, `PerformStockBuy`, `PerformActionBuyAnyFurniture` e `ReachJobLevel` não trazem ação (ou trazem várias), então a página avisa que o custo real é maior e troca "Vale a pena" por um veredito cauteloso | `tools/explicacoes/missoes.js` (`GAP_GROUPS`) |
| Dinheiro que a Missão manda gastar | `SpendAttributeAtLocationQuestObjective` com `TargetAttribute` Cash soma `TargetValue` ao Dinheiro gasto (Pacote de Incentivo: 100, 300 e 2 x 200) | `questEffort` |
| Condição de evento com várias origens | Um `TagRequirement` cujo tag é dado por vários itens, empregos ou moradias vale por qualquer um deles ("ou"). Requisitos sem `NonNegotiable` do mesmo tipo (Banho de Sol: duas moradias) viram uma lista só; com `NonNegotiable` ficam separados | `ChoiceEvent.TagRequirements`, `tools/explicacoes/missoes.js` (`conditions`) |
| Passo "Começar Ritual" | O objetivo do primeiro passo de `Chain-Cultist-Ritual-*` tem `Term` vazio (`string_empty`) e `ActionData` `Cultist - Perform Ritual`; a página usa o nome da ação (`action_cultist_ritual_perform_title`) | `Gameplay.Quests.Quest` |
| "Dia Livre": `{ACTION}` | `quest_day_off_obj_2` é só `{ACTION}`; o objetivo é `PerformActionQuestObjective` com `Go For A Walk` | `Gameplay.Quests.Quest/Quest-Day-Off` |
| Objetivos em inglês | `quest_clean_environment_obj_1` a `_4` não existem em pt-BR; traduzidos em `OVERRIDES`. O item é `Fish - Trash - Bottle` (Garrafa de Gosma) | `ItemData` |
| Missão "Guerra dos Tronos" duplicada | Duas `Quest-GameOfThrones` estão em `QuestPoolData`; uma está na cadeia e tem objetivo, a outra vem sem objetivos nem recompensas | `QuestPoolData`, `Gameplay.Quests.Quest` |
| Contador de papel não bate com o texto | `Quest-Cultist-N` usa `Count` 3, 9, 15, 21, 27 com texto "Faça 3, 6, 9, 12, 15 vontades". Sem confirmar o que `RoleCultistCompleteBiddingQuestObjective.Value` soma, a página mostra só o texto do jogo e esconde o "×N" quando o texto já traz o número | `RoleCultistCompleteBiddingQuestObjective` |

Cargos com `JobLevel` 11 a 16 (17): fechado por análise estática. `SetChamberDataForType` `0x1808FCA50` só passa 1 a 6 (99 vira 0) e é o único chamador de `SetChamberDataForJobs`; `JobData.UpdateData` `0x180982C10` copia o valor sem conversão; os chamadores de `StartNewJob` `0x18085D5A0` usam só `StartingJobs`/`DefaultJobs`, a lista do Artista e o botão da Agência (ação 435). O desafio "D-Pad Drifting" (`MinJobTier 1`, `MaxJobTier 2`, `Count 17`) bate com 17 cargos em Chailand sem contar estes. Cliente modificado ou mod podem pegar o cargo. Não testado em partida.


### Eventos: cadeias, tela de escolha e refeição

| Regra | Valor | Fonte |
|---|---|---|
| Valor da tag | `Count` soma ao valor atual, preso entre 0 e 32767; `Count -32768` zera | `StoryTagHelper.UpdateTag` `0x1808B7020` |
| Tag sem duração | `Duration` 0 vira 255, e 255 é "sem duração": as tags `chev_` não expiram | `NetworkStoryTag..ctor`, `RewardInfo..ctor(StoryTag)`, `get_HasDuration` |
| Condição do evento | `StoryTagDrawRules.Compare(Operator, valor, Count)`; tag ausente conta como 0. `NonNegotiable` tem de passar; as demais valem se ao menos uma passar | `TryGetEventEligibilityWeight` `0x1808B4570`, `CompareRequirementAgainstPool` `0x1808B2820` |
| Repetição | Evita os 40 últimos; se não sobrar evento, limpa a lista e sorteia de novo | `TryToChooseEventForPlayer` `0x1808B4ED0`, `TrySelectWeightedEvent` |
| Mostrar Consequências | Índice 1 do seletor vira `ChoiceEvents = 1` (`ShowResults`). Botões usam visibilidade `Full` (10) nesse modo e `Hidden` (40) nos outros; `Hidden` limpa os prêmios e sai. Configs padrão têm `ChoiceEvents: 0` | `CustomizeGameMenu.OnChoiceEventsChanged`, `ChoiceEventButtonContainer.SetData` `0x1807F1F10`, `ReportCardRewards.SetData` `0x1807F9790`, `Default Gameplay Config.asset` |
| Satisfação de evento conta como refeição | A escolha chama `ExecuteActionSuccess(768, ..., rewards)` com as recompensas da opção; se `FullnessAttribute` vier com valor maior que 0, marca `HasEatenInTurn`. A marca é lida e zerada em `StartTurnForPlayer`. `HandleFullnessCheck` faz a mesma checagem e não tem chamada direta no ISIL | `ReportPanel.<OnChoiceButtonPressedClient>b__0`, `AuthActionHandlerForPlayerState.ExecuteActionSuccess` `0x1808334C0`, `PlayerState.HandleFullnessCheck` `0x180890A50`, `RealmData.FullnessAttribute` |


## Verificação da auditoria (rel3)

| Regra | Valor | Fonte |
|---|---|---|
| Juros: efeitos somam | Os dois efeitos fazem `taxa += valor` (apesar do nome `RateOverwrite`): Tartaruga +0,01/0,02/0,03 sobre 0,04; Contador (`BetterInterestRate`) +0,04 | `PetModifyInterestRateOfVaultTraitEffect.CheckForInterestRateChange` e `ModifyInterestRateOfVaultTraitEffect.CheckForInterestRateChange` (`addss`), `VaultData.InterestRate` |
| Pane no sistema do Banco | Soma 0,36 aos 0,04: 40%, e não 36% como consta nas linhas anteriores. O texto do jogo diz "dez vezes" | Mesmo método, `Y2K-System-Failure-Effect`, `gevent_y2k_system_failure_started_body` |
| Cultista: Alimentar | Ação com `Purpose` 2 (`ConsumeItem`) vira entrada de item com valor negativo; item `Purpose` 4 com quantidade negativa chama `TryRemoveFurniture`. O móvel some | `PerformNormalAction` `0x1808376B0`, `TryUpdatePlayerOwnedItemState` `0x18083BD80` case 4, `HomeHandler.TryRemoveFurniture` `0x180858C50` |
| Caixa da Amizade | O prêmio vai para outro jogador: a lista de destinatários exclui o comprador; sorteado e entregue em `OnRoundStarted` | `FriendshipCrateGiveReportTraitEffect.PickRecipient`, `OnRoundStarted` |
| Tempo a cada turno | `Attributes[ActionPointAttributeId] = MaxActionPointsForRound` no começo do turno, valor lido do atributo Time (2.400): não acumula | `PlayerState.StartTurnForPlayer` ISIL 180 a 244, `RoundManager.Initialize` |
| Acontecimento | Sorteado no começo do turno, salvo `ChoiceEventsType.NoEvents` | `StartTurnForPlayer` ISIL 364 a 369 |
| Comida: comprar | `Buy Food for a Week`, sala `Grocery Store Store`: −65 Dinheiro, −25 Tempo, +1 | `ChamberActionData`, `LocationChamberData` |
| Comida: usar | Automático em `OnTurnEnded`, sem custo de Tempo; 1 unidade por turno sem comer, logo cada unidade cobre 1 rodada | `HomeHandler.OnTurnEnded` `0x180856640` |
| Comida: guardar | `Purpose` 6 vai para `FoodItems`, fora da mochila; com geladeira e sem espaço a compra falha (retorno 9). Sem geladeira a comida estraga no fim do turno | `TryUpdatePlayerOwnedItemState` case 6, `OnTurnEnded` |
| Touro | `Mystic-Taurus-Health-Med` e `-High` estão no mesmo traço e miram as mesmas ações; cada um chama `AddToRewardInfoList`: +75 +75 = +150 de Saúde | `Role-Mystic-Taurus`, `ModifyChamberActionRewardsTraitEffect.CheckForChamberAction` |
| Bilhete Infernal | Está em `LotteryData.Tickets`, então sorteia como bilhete; a chance soma 1 | `NetworkedLottery.OnRoundStarted` `0x180817990`, `InfernalLotteryTrait` |
| Pôster do Kaiju | `_posterScore` 3, `_maxScore` 40 | `GlobalEventKaijuBattle` |
| Eventos com barra | `HasMeter` 1: Onda de Calor, Batalha de Kaiju, Grande Jogo | Prefabs em `Database-Internal/Global-Events` |
| Sobrevivência na Natureza | Tira os `RandomRewards` do Parque (`Park Living Report 1` a `5`) e dá 15 pontos por rodada em moradia de `Tier` 1 | `WildernessSurvivalReports`, `WildernessSurvivalScore`, `HomeData/Outside` |
| Comida do pet | Cai 1 por turno | `PetHandler.OnTurnStarted` ISIL 105 a 118 |
| Jacuzzi | A ação `Bathe in Jacuzzi` vem do traço do móvel | `AddBatheJacuzziToHomesTraitEffect`, `Special Furniture Jacuzzi` |
| Origem de ação condicional | Ação, efeito da sala (`ChamberActions` e `Chambers`), `Trait.Effects`, dono do traço: item com `Purpose` 1, 3, 4 ou 7 (`Rewards`), Missão (`QuestStartedRewards`), emprego (`RewardsWhileJobHeld`), curso (`CompletionReward`), papel, `ModifierData.Traits`, `MapLayoutData.GlobalTraits` | `locais.js` (`actionOrigin`), `TryUpdatePlayerOwnedItemState`, `JobHandler.ProcessRewardsWhileJobHeld` |
| Traço de Evento Global | No prefab: `BigGameActionsTrait` (Grande Jogo), `ActionTrackerTrait` (Onda de Calor), `DepressionTrait` (Colapso Econômico), `KaijuBattleTrackerTrait` (Batalha de Kaijus) | `Database-Internal/Global-Events/*.prefab` |
| Sorteio de Missões por mapa | Antes do sorteio saem as Missões com o tema em `ExcludedOnMaps` ou fora de `AvailableOnMaps` não vazia; tema 1 Calicornia, 2 Chailand, 3 Schnitzelland | `ResourceUtils.FilterWeightedRewardsForCurrentMap` `0x180B68F20`, `QuestComponent.IsAvailableOnMap` `0x18081D7B0`, `MapLayoutData.Theme` |
| Texto dos passes de metrô | "Concede acesso por N rodadas" não bate com os dados: a compra dá `Ticket Currency` (1, 5 ou 10) e cada viagem gasta 1. A wiki sobrescreve o texto em pt-BR | `ChamberActionData`, `MapLayoutData.SlotPortalingCost`, `TryGetNextPortalConnection` `0x18083B2B0` |


### Missões: custo, sorteio e mapas (revisão da auditoria)
| Regra | Valor | Fonte |
|---|---|---|
| Custo de objetivo com lista | `PerformAnyActionQuestObjective`: conta a opção mais barata em sala fixa (`LocationData.Chambers` -> `Actions`) vezes `Count`; sem sala fixa, a mais barata da lista. Vale-presente fica fora porque pede item à parte | `Quest.references[].ActionDatas`, `get_Value` = `Count`; `tools/explicacoes/missoes-custo.js` |
| Custo de "mesma rodada" | Soma todas as ações de `Actions`: o alvo do objetivo é o tamanho da lista | `PerformActionsInSameRoundObjective.get_Value` lê `Actions.Count` |
| Custo de curso | `EnrollmentCost` + `StudyCost` x `StudyThreshold`; os pontos vêm de `CompletionReward` Type 95 | `GetEducationQuestObjective.EducationData`, `EducationData` |
| Item comprado na conta | Item de `CountItemOfTypeInInventory` ou de `RequiredItems` entra pelo preço da ação de compra, uma vez, se nenhuma etapa o entregar. Ficha de Fliperama entra como 1, o mínimo que `RequiredItems` exige | `ChamberActionData.RequiredItems`, `Buy Fishing Pole`, `Arcade - Buy Tokens` |
| Sorteio da Vexcorp | `Get Easy/Medium/Hard Vexcorp Quest` sorteiam por `Weight` entre as Missões do mapa atual. A chance publicada é peso / soma dos pesos do mapa | `AuthActionHandlerForPlayerState` chama `ResourceUtils.FilterWeightedRewardsForCurrentMap`; `IsWeightedRewardAvailableOnMap` |
| Filtro de mapa | `ExcludedOnMaps` com o tema exclui; `AvailableOnMaps` vazia vale em todos; senão precisa conter o tema | `QuestComponent.IsAvailableOnMap`; `MapLayoutData.Theme` 1 Calicornia, 2 Chailand, 3 Schnitzelland |
| Sem repetir em seguida | `WeightedRewardIsNeverSameInRow` 1 nas três ações | `ChamberActionData`, `CooldownHandler.AddToWeightedRewardsTracking` |
| Ritual é vontade | `Chain-Cultist-Ritual-*` estão em `CultistsBiddings`; concluir passa por `TryGetBiddingForQuest` e `MarkBiddingCompleted`; `ExpPerTier` 9, `BiddingMaxDuration` 3 | `Gameplay.Roles.Cultist`, `Cultist.OnQuestCompleted` |
| Kaiju: Missão soma 5 | Ao concluir a última etapa (`HasNextQuestInChain`), `IncreaseMarketScore` ou `IncreaseCluckersScore` com 5 | `GlobalEventKaijuBattleActionTrackerTraitEffect.OnQuestCompleted` |
| Kaiju: como começa | `Get Event Quest - *` são acrescentadas por `Kaiju-Battle-Add-Posters-*`, efeitos do traço `Global-Event-Kaiju-Battle-Trait` | `AddChamberActionTraitEffect`, `Gameplay.Traits.Trait` |
| Anel | `One-Ring-Movement-Cost` tira 20 de Felicidade, Saúde e Higiene; o efeito roda em `OnAttemptingMoveAction`, chamado em `MovePlayerOnPath` | `ModifyMovementAttributeRewardsTraitEffect` |
| Item pesado | `Encumbered-New`: `AdditionalMoveCostList` Tempo, `Percentage` 1,2, multiplicado no custo da quadra | `ModifyMovementSpeedAndCostTraitEffect.OnAttemptingMoveAction` |
| Espera de ação | `OnTurnStarted` desconta 1 de cada espera e remove ao chegar em 1: `Cooldown` 1 libera no turno seguinte | `CooldownHandler.OnTurnStarted` |
| "Só nos Desafios" retirado | `ChallengeData` não cita essas Missões; o vínculo era só `ChallengeStorage.RecordNames`, tabela de nomes. A página agora diz que a origem é desconhecida, sem afirmar que a Missão não existe | `Gameplay.Challenges.*` |
| Cultista: contagem | Vale a linha de `CompletedBiddingsCount` acima (3, 9, 15, 21, 27): a página usa `Count` | `RoleCultistCompleteBiddingQuestObjective.CheckObjectiveStatus` |

## Complexidade do Papel (ícones)

| Regra | Valor | Origem |
|---|---|---|
| Rostos | `RoleComplexityIcons` em ordem: `GameDifficulty_Easy_0` (sprite de nome GameDifficulty_Easy), `GameDifficulty_Medium`, `GameDifficulty_Hard` | `RoleSelectionPanel`, `Scenes/New-Game-Scene.unity`, objetos `ComplexityIcon` |
| Nível aceso | `Image.color.a` = 1 se `ComplexityType` (0xE8) é 1, 2 ou 3 no ícone correspondente; os outros ficam com 0,3. Não há sprite cinza nem troca de cor | `RoleSelectionPanel.SelectRoleAtIndex`, constantes em 0x1839E0C44 (1,0) e 0x1839E0D48 (0,3) de GameAssembly.dll |
| Texto por nível | Não existe: só `ui_role_complexity` (título). A página usa o número | `data/localization/*.json` |

## Preço de loja e Missões de papel

| Tema | O que o código faz | Fonte |
|---|---|---|
| Preço cobrado na compra | É a entrada `Cash` de `ChamberActionData.Rewards` da ação de loja. `PerformNormalAction` lê `chamberAction + 0x60` (`Rewards`), chama `Reward.ToRewardInfoList` e passa a lista por `TraitHandler.CheckForChamberAction`, onde traços podem alterar o valor; depois aplica a lista | `AuthActionHandlerForPlayerState.PerformNormalAction` `0x1808376B0`, offset em `ChamberActionData.cs` |
| `BuyValue` | No mesmo método, `ItemData + 0x30` só é lido em dois casos: conserto de roupa (× `0x1839E1018`, 60%) e `BuyPawnItem` (Purpose 12, `-BuyValue`). Nunca na compra normal. Em 86 ações de loja, nenhuma tem preço igual ao `BuyValue` | `0x1808376B0` |
| `Cash` em `ItemData.Rewards` | Não é cobrado na compra: `TryUpdatePlayerOwnedItemState` percorre `Rewards` do item e só age em entradas `Type` 0x6E (traço) | `0x18083BD80` |
| Loja por balcão na página de Local | Ação com `Cash` negativo que entrega item (`Type` 50) ou `Ticket Currency`, direto ou em `WeightedRewards`. `QuestAction` fica em "Durante missões" | `tools/explicacoes/lojas.js` |
| Condição de loja acrescentada | Ação em `ChamberActions` de um efeito cujo traço vem de `MapLayoutData.GlobalTraits`, `EducationData.CompletionReward` ou papel | `AddChamberActionTraitEffect` |
| Missões de papel | Objetivo e pontos de `RoleQuestChain`: `references[].Term`, `.Count` (`TargetLevel` no Viciado em Trabalho) e `Rewards` `Type` 95. Texto e número só divergem no Cultista (`Count` 3, 9, 15, 21, 27 contra o texto 3, 6, 9, 12, 15) e no Hacker (pares, não locais) | `Gameplay.Quests.Quest`, `RoleCultistCompleteBiddingQuestObjective`, `RoleHackerHackComboQuestObjective` |
| Vontades do Cultista e destinos do Misticista | `Rewards` vazio em todas (`Quest-Cultist-Feed/Indoctrinate/Ritual*`, `Quest-Mystic-<signo>`): não dão pontos por si | `Gameplay.Quests.Quest` |
| Adventureiro: pontos | Só a última etapa de cada aventura dá pontos (`Complete-Adventurer-Quest`, 75/150/225) | `Gameplay.Quests.Quest`, `Adventurer Quest Easy/Medium/Hard` |

## Modificadores (`/modifiers/`, `tools/explicacoes/modificadores.js`)

| Regra | Valor | Fonte |
|---|---|---|
| O que é modificador | 61 regras em `ModifierData`; o menu de criação (`ModifierPanel`, picker) só oferece `ChallengeOnly` falso e `Category` diferente de 4 | `ModifierStorage.IsOfferedInPicker` (`[rbx+50h]`, `[rbx+54h] != 4`), `GetSelectableModifiers`, `CustomizeGameMenu.AddIfOffered` |
| Categorias | `Other` 0, `Role` 1, `Economy` 2, `World` 3, `HiddenInSelectionView` 4; títulos `ui_modifier_type_*` | `Types.ModifierCategory`, localização |
| Limite e conflito | Até 24 selecionados; mesmo `ConflictGroup` (com `Trim`) não combina | `ModifierPanel.MaxSelectedModifiers`, `ModifierData.ConflictsWith` |
| Índice de dificuldade | Soma de `DifficultyIndex`; positivo facilita, negativo dificulta (verde/vermelho no menu). `EasyModifiers` todos ≥ 0, `HardModifiers` todos ≤ 0 | `ModifierPanel` (Tooltip), `ModifierStorage` |
| Predefinições | Fácil e Difícil são listas de modificadores; Normal é o conjunto vazio | `ModifierStorage.EasyModifiers/HardModifiers` (Tooltip) |
| Papel forçado/removido | `ForcedRole` tira a escolha de papel; `DisabledRole` tira um papel da tela; `DisablesRoleSelection` sem papel forçado: ninguém tem papel | `ModifierData` (Tooltips) |
| Evento permanente | Cinco modificadores com `PermanentGlobalEventId`: `SeedAlwaysOnGlobalEvents` agenda o evento por 60 rodadas, só se `CanBeAlwaysOn` (Calor, Crimes, Oferta Relâmpago, Pesca Maluca, Pane Y2K) | `GlobalEventManager.CollectAlwaysOnGlobalEvents` `0x1809E4450`, `SeedAlwaysOnGlobalEvents` `0x1809E8E30`, `CanBeAlwaysOn` nos prefabs |
| Evento em loop | World Cup, só em desafio, repete o Grande Jogo (`CanLoop`) | `SeedLoopingGlobalEvents` `0x1809E90E0`, `LoopingGlobalEventId` |
| Aluguel (Brutal/Chill Land Lady) | `aluguel × 1,5 / × 0,5` em toda cobrança | `ModifyRentByPercentageTraitEffect.CheckForRentChange` |
| Contrato Infernal | `aluguel + aluguel × 50/100 × (rodada/4 − 1)`, soma sobre o valor normal; rodadas 8, 12, 16: +50%, +100%, +150% | `IncreaseRentEveryPeriodTraitEffect.CheckForRentChange` (ISIL), `RentIncreasePercent` 50 |
| Mercado de imóveis | Ações `Rent Basement/Crappy/Fancy Action`: `Cash × 0,5 / × 1,5` | `ModifyChamberActionRewardsByPercentage` (ISIL) |
| Preços gerais (Era de Ouro/Economia Difícil) | Toda ação em sala: entradas de `Cash` negativas × 0,75 / × 1,25; não mexe em ganhos nem no aluguel | `ModifyAllActionsByPercentagePositiveNegative.CheckForChamberAction` `0x1807BC110` (`Positive` 0), só esse método sobrescrito |
| Empregos | `Happy`, `Health`, `Hygiene` do turno de trabalho × 0,5 / × 1,5 | `ModifyWorkRewardsByPercentageTraitEffects.CheckForWorkAction` `0x1807C0830` |
| Fome e Estresse | Tempo, Felicidade e Saúde dos relatórios `Forgot to eat`, `You are stressed`, `You are very stressed` × 0,5 / × 1,5 | `ModifyReportRewardsByPercentageTraitEffect.OnReportsReady` (ISIL), `Modifiers` |
| Escola | Só `Cash` da matrícula (`InsideChamberEducationEnroll` 452) × 0,5 / × 1,5 | `ModifyEnrollmentCostTraitEffect.CheckForChamberAction` (ISIL `Compare rbp, 452`) |
| Dinheiro inicial, casa e item | `GameStartModifiers`: atributo (Silver Spoon/Street Rat ±200), casa `Outside` (Vagrant), item Vexmobile (Dad Owns a Dealership, sem número de custo por quadra: ver dúvida em `perguntas-sobre-o-jogo.md`) | `ModifierManager.ApplyGameStartRewards` `0x1809F5830`, `ApplyAttributeReward`, `ApplyItemReward` |
| Bolsa em caos | Todas as ações: `Volatility` 0,4 (normais 0,10 a 0,18), `TrendBias` 0, teto 3×, `CenterPullStrength` 0,4 (normal 0,05) | `StockBehavior.ApplyChaosProfile`, `CreateDefaults`, `StocksManager.ApplyStockMarketChaosBehaviorOverride` `0x180A25190` |
| Jackpot | +5 pontos percentuais na chance (3% → 8%); sorteio sem vencedor soma 250 no prêmio mínimo e máximo; ao ganhar volta ao base | `ModifyLotteryWinChanceTraitEffect`, `LotteryManager.OnRoundStarted` `0x180815B50` (`-(ramp) & 0xFA`), `NetworkedLottery.OnRoundStarted` `0x180817990` |
| Cartas de tarô | Uma de 11 por rodada no início do turno (`PickOneAtRandom`, `EveryNRounds` 1); valor de cada carta em `ReportData` `Tarot - *`. A carta `The Fool` não entra na lista | `GiveAnyRewardOnTurnStartTraitEffect` `0x1807A63A0`, `Mod-Tarot-Troubles-Trait.Triggers` |
| Empregos limitados | `MaxHoldersPerJob` 1, `OnlyTheseJobs` vazio: todo emprego ocupado fica indisponível para os outros | `BlockJobsHeldByOthersTraitEffect.IsAvailable` `0x1807A2DA0` |
| Casa de Penhores | `AdditionalSpecialSlots` 2 e `SpecialFurnitureSlots` 6 somados ao tipo de vaga | `IncreasePawnShopCapacityTraitEffect.CheckForPawnShopSlots` (ISIL) |
| Mais animais | `AllPetsAvailable` liga a flag lida em `PetHandler` | `AllPetsAvailableTraitEffect`, `CheckForAllPetsAvailable` |
| Mapa embaralhado | Shuffle City embaralha ao preparar o mapa; Land of Confusion reembaralha ao fim de cada rodada | `BuildingManager.PrepareShuffleSeed`, `ReshuffleMapForRoundEnd` |
| Locais fechados | `ClosedLocations`: Academia (School's Out), Parque (Landscaping) | `BuildingManager.AddModifierClosedLocations` |
| Fome na carteira | `Forget Me Not`: ícone de Fome mostrado | `PlayerCard.SetFoodIcon` |
| Toque de recolher (Police State) | Sem usar Dormir no turno: multa de `min(200, Dinheiro)` | `PvpCurfewSleepTraitEffect`, `PvpManager.RequestAlwaysOnCurfewPunish_RPC`, `PunishForBrokenCurfew`, `CurfewPenalty` 200 |
| Grande Jogo mais caro | Cada ação de `SupportActions`: `valor + valor × (Percentage − 1) × piso(rodada / 4)` | `MultAttributeCostEveryXRoundsTraitEffect.CheckForChamberAction` `0x1807C0AD0`, `Mod-Mult-Big-Game-Prices` |


Metrô: `Ticket Currency` tem `SubtractsValueOnActions` 0 e `AccumulativeValue` -1. A viagem exige saldo (`CanAffordModifiers`), mas não o consome (`ExecuteActionSuccess`); o saldo cai 1 por rodada. Bate com o texto do jogo, "Grants N round Metro Access".

### Origem desconhecida: revisão dos usos (lote de reescrita)

- Lost Homework: enquanto o item está na mochila, o traço `Return-Lost-Homework-Trait` (`HomeworkConditionalAddActionTraitEffect.EnteringChamber`) acrescenta `Hand in Lost Homework` na sala com `EducationDepartment` (offset `0x40` de `LocationChamberData`), se algum curso de `Courses` (offset `0x38`) estiver `Enrolled` (3). A ação custa 100 de Tempo; o gatilho `LostHomework` (17) chama `EducationManager.ReturnHomework` (`TriggerManager` chamada na linha 1523 do ISIL), que pega o primeiro curso `Enrolled` da sala e chama `PlayerEducationHandler.EducationActionPerformed` até 2 vezes, parando se o retorno for `Completed` (4). `EducationActionPerformed` é a mesma função do estudo normal (`AuthActionHandlerForPlayerState`).
- Box of Plagues: as ações `Cultist - Pick up box of plagues` (`Pawn Shop Buy Pawned`, `BiddingPlaguesPickup`) e `Cultist - Return box of plagues` (`Grocery Store Store`, `BiddingPlaguesDeliver`) são etapas de `Chain-Cultist-Ritual-t1-3`, `t2-3` e `t3-3` (`Quest-Cultist-Ritual-t*-31` e `-32`); cada uma tem `Rewards` -25 de Tempo e `RequiredItems` vazio. O item `Box of Plagues` não é citado por nenhum registro: a ligação com as ações é só o nome e o ícone. Página diz que a origem é desconhecida e lista as duas etapas.
- Pets `Conservative Sheep` e `Introverted Armadillo`: `CalculateRandomPetsAvailableToBuy` monta as listas com `BuildingManager.GetAllActionRewardsInChamberForPlayer`, e `AddAllPetsToBuyable` (Pet Emporium) só soma essas listas; nenhuma ação tem estes pets como recompensa. Página diz só que a origem é desconhecida.
- `Scavenge-Level-01` (traço que dá `Can-Wash-Dirty-Cash`) só é citado por `TraitStorage`, e `Garden Commons` (Áreas Comuns) segue fora de `Chambers` de qualquer `LocationData`; o traço e a sala continuam sem origem conhecida.
