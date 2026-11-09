'use strict';
// Explicações das páginas de empregos que não cabem no build-site.js.
// Fonte de cada regra: o id passado a say() e a tabela "Empregos e Locais" de docs/engenharia-reversa.md.

const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// O texto em pt-BR do jogo repete frases entre empregos diferentes (cópia do tradutor). A versão em inglês é diferente.
const TITLE_FIX = {
  job_clothing_store_tier_2_title: { 'pt-BR': 'Atendente de Provador' }, // en: Changing room attendant; pt-BR do jogo igual ao Atendente de Vestiário da Academia
};
const FLAVOR_FIX = {
  job_mall_salesperson_flavor: { 'pt-BR': 'Conheça formas de vida novas e emocionantes.' }, // en: Meet new and exciting lifeforms.; pt-BR do jogo repete a frase do Atendente de Vestiário
};
function titleFix(lang, rec) {
  const f = rec && TITLE_FIX[rec.TitleTerm];
  return f && f[lang] ? { html: escape(f[lang]), lang } : null;
}
function flavorFix(lang, rec, term) {
  const key = rec && rec.FlavorTerm;
  const f = key && (term === undefined || term === key) && FLAVOR_FIX[key];
  return f && f[lang] ? escape(f[lang]) : null;
}

module.exports = function (h) {
  const say = (lang, page, id, texts) => h.say(lang, page, id, texts);
  const n = (lang, v) => h.number(lang, v);
  const dir = lang => h.langDir(lang);

  // Roupa: a durabilidade cai 1 por rodada (LostYourClothesGameSystem.OnTurnStarted, ISIL: pula a rodada 1,
  // subtrai 1 de InventoryItem.Duration da roupa vestida, avisa com 1 e tira a roupa em 0).
  function wearNote(lang, outfit) {
    if (!outfit || !(outfit.Durability > 0)) return '';
    const g = `<a href="/${dir(lang)}/guides/clothes/">${escape(h.guideTitle(lang, 'clothes') || h.ui(lang, 'learnMore'))}</a>`;
    return ' ' + say(lang, 'jobs', 'clothes wear (LostYourClothesGameSystem.OnTurnStarted, ItemData.Durability)', {
      'pt-BR': `A roupa se gasta: perde 1 de durabilidade a cada rodada e esta dura ${n(lang, outfit.Durability)}. Quando acaba, você fica sem roupa. Mais em ${g}.`,
      en: `Clothes wear out: they lose 1 durability every round and this one lasts ${n(lang, outfit.Durability)}. When it runs out you are left without clothes. More in ${g}.`,
    });
  }

  const sameWeights = list => list.length > 1 && list.every(w => w.Weight === list[0].Weight);

  // Notas extras sob a ação que um cargo libera. Cada nota sai de código ou dado confirmado.
  function actionExtra(lang, a) {
    if (!a) return '';
    const note = (id, texts) => `<p class="ledger-note">${say(lang, 'jobs', id, texts)}</p>`;
    let html = '';
    const prizes = (a.WeightedRewards || []).filter(w => w.Reward && h.collectEntries([w.Reward]).length);
    if (prizes.length > 1) {
      const duplos = prizes.filter(w => h.collectEntries([w.Reward]).filter(e => e.Type !== 110).length > 1).length;
      if (sameWeights(prizes)) html += note('equal prizes (ChamberActionData.WeightedRewards)', { 'pt-BR': `Sorteio entre ${n(lang, prizes.length)} prêmios, todos com a mesma chance (1 em ${n(lang, prizes.length)}).${duplos ? ` ${duplos === 1 ? 'Um deles traz' : `${n(lang, duplos)} deles trazem`} duas coisas juntas, por isso a lista tem mais linhas.` : ''}`, en: `A draw among ${n(lang, prizes.length)} prizes, all equally likely (1 in ${n(lang, prizes.length)}).${duplos ? ` ${duplos === 1 ? 'One of them gives' : `${n(lang, duplos)} of them give`} two things together, so the list has more lines.` : ''}` });
      html += h.actionOutcomes(lang, a);
    }
    switch (a.m_Name) {
      case 'Raid Tip Jar': // JobPerkTipJarTraitEffect: ctor (_mults), OnExecuteActionSuccess, OnTurnStarted
        html += note('tip jar (JobPerkTipJarTraitEffect._mults, OnExecuteActionSuccess, OnTurnStarted)', {
          'pt-BR': `Além do Prestígio, a caixinha paga Dinheiro: cada turno de trabalho que você faz neste resort soma o salário dele a um acumulado, e ao saquear você recebe esse acumulado vezes um multiplicador sorteado entre 0,1, 0,25, 0,5, 0,75 e 1 (média de 0,52). O acumulado volta a zero no começo de cada turno seu, por isso só conta o que você trabalhou na mesma rodada.`,
          en: `On top of Prestige, the tip jar pays Cash: every shift you do at this resort adds its salary to a running total, and when you raid it you get that total times a random multiplier drawn from 0.1, 0.25, 0.5, 0.75 and 1 (average 0.52). The total resets to zero at the start of each of your turns, so only the shifts you worked in the same round count.`,
        });
        break;
      case 'Practice Gaming Skills': // ArcadeGameSystem.OnActionPerformed (Purpose 26 e 24), GamerSkillScore = 25
        html += note('gamer skill (ArcadeGameSystem.OnActionPerformed, GamerSkillScore)', {
          'pt-BR': `Cada uso soma 1 à sua habilidade de gamer, e cada partida nos jogos do Fliperama também soma 1. A pontuação de uma partida é o sorteio da máquina (25 a 200) mais 25 por nível de habilidade, então treinar rende pontos em todas as partidas seguintes.`,
          en: `Each use adds 1 to your gamer skill, and every game you play at the arcade adds 1 too. A game's score is the machine's draw (25 to 200) plus 25 per skill level, so practicing pays off in every later game.`,
        });
        break;
      case 'Use Dry Cleaning': // GiveClothesDurabilityOnActionTraitEffect.OnExecuteActionSuccess: Duration = ItemData.Durability x Durability (1)
        html += note('dry cleaning (GiveClothesDurabilityOnActionTraitEffect, Durability 1)', {
          'pt-BR': 'Além de limpar, devolve a roupa que você está vestindo à durabilidade total, o que adia a hora de comprar outra.',
          en: 'Besides cleaning, it restores the clothes you are wearing to full durability, which delays buying another outfit.',
        });
        break;
      case 'Vexcorp - Teleport': // ChamberActionData (Cooldown 0, só Higiene), TriggerData Vex Teleport (TeleportToBuilding)
        html += note('teleport (ChamberActionData Cooldown 0, TriggerType.TeleportToBuilding)', {
          'pt-BR': 'Você escolhe o prédio de destino. A ação em si não gasta Tempo e não tem espera entre um uso e outro.',
          en: 'You pick the destination building. The action itself spends no Time and has no wait between uses.',
        });
        break;
      default:
    }
    return html;
  }

  // Artista, "Vale a pena?". Fontes: Artist.GetProgressForState (0,25 / 0,15 / 0,08), Artist.GetAttributeCostMultiplier (1,3 / 0,8 / 0,5),
  // Artist.ProgressPainting (ao chegar a 1 o progresso volta a 0 e PaintingCompletedCount soma 1), RoleArtistCompletePaintings (Count contra PaintingCompletedCount),
  // ação Sell Pawn Item (P), JobHandler.GetWorkRewards e RoleArtistActionTrackerTraitEffect.CheckForWorkAction (EXP multiplicada).
  const ART_STATES = [{ progress: 0.25, mult: 1.3 }, { progress: 0.15, mult: 0.8 }, { progress: 0.08, mult: 0.5 }];
  function artistWorth(lang, j) {
    const page = j.m_Name;
    const time = -h.sumAttr(j.Rewards, 'Time');
    const exp = h.sumAttr(j.Rewards, 'Experience');
    const wear = ['Happy', 'Health', 'Hygiene'].reduce((sum, a) => sum - Math.min(0, h.sumAttr(j.Rewards, a)), 0);
    const pool = (h.artistJobs.get(j._id).WeightedRewards || []).filter(w => w.Reward && w.Reward.RewardEntries.length);
    const weight = pool.reduce((sum, w) => sum + w.Weight, 0);
    const avgSale = Math.round(pool.reduce((sum, w) => sum + w.Weight * h.byId.get(w.Reward.RewardEntries[0].Id).SellValue, 0) / weight);
    const sellAction = h.table('ChamberActionData').find(a => a.m_Name === 'Sell Pawn Item (P)');
    const sellTime = -h.sumAttr(sellAction.Rewards, 'Time');
    const chain = (h.deref(h.artistRole.RoleQuestChain).Quests || []).map(h.deref);
    const goals = chain.map(q => Object.values(q.references || {})[0].Count);
    const prizes = chain.map(q => q.Rewards.RewardEntries.filter(e => e.Type === 95).reduce((sum, e) => sum + e.Value, 0));
    const lastGoal = goals[goals.length - 1];
    const chainPoints = prizes.reduce((sum, p) => sum + p, 0);
    const perPiece = chainPoints / lastGoal;
    const list = (values, and) => values.slice(0, -1).map(v => n(lang, v)).join(', ') + ` ${and} ${n(lang, values[values.length - 1])}`;
    const levels = h.table('ExperiencePointData');
    const here = levels.find(x => x.Level === j.JobLevel), up = levels.find(x => x.Level === j.JobLevel + 1);
    const states = ART_STATES.map(st => {
      const shifts = Math.ceil(1 / st.progress);
      const levelPoints = up && exp > 0 ? up.Score / (Math.ceil((up.Xp - here.Xp) / (exp * st.mult)) * time) * 100 : 0;
      return {
        shifts,
        points: Math.round(perPiece / (shifts * time) * 100 + levelPoints),
        cash: avgSale / (shifts * time + sellTime) * 100,
        wear: Math.round(wear * st.mult * shifts),
      };
    });
    const [ins, neu, low] = states;
    const pawn = h.place(lang, 'Pawn Shop');
    const roleLink = h.link(lang, h.artistRole, h.title(lang, h.artistRole));
    const missionMedian = h.missionRate(), jobMedian = h.jobRate(), wearMedian = h.jobWear();
    const parts = [];
    parts.push(say(lang, page, 'artist points (RoleArtistCompletePaintings.Count, Quest.Rewards Type 95, ExperiencePointData.Score, Artist.PaintingCompletedCount)', {
      'pt-BR': `<strong>Pontos, que decidem a partida:</strong> as Missões do papel ${roleLink} dão ${list(prizes, 'e')} pontos ao chegar a ${list(goals, 'e')} quadros terminados no total, ${n(lang, chainPoints)} pontos somados, cerca de ${n(lang, Math.round(perPiece))} por quadro. A contagem não zera quando o cargo muda.${up ? ` Cada turno de trabalho também dá EXP de Trabalho, e o próximo nível vale ${n(lang, up.Score)} pontos.` : ''} Somando Missões e EXP, pintar rende cerca de ${n(lang, ins.points)} pontos a cada 100 de Tempo em lugar inspirado, ${n(lang, neu.points)} em lugar neutro e ${n(lang, low.points)} em lugar sem inspiração, até o ${n(lang, lastGoal)}º quadro. Uma Missão mediana rende ${n(lang, missionMedian)}${ins.points < missionMedian ? ', e nem o melhor caso daqui chega a isso' : ''}.`,
      en: `<strong>Points, which decide the game:</strong> the ${roleLink} role quests give ${list(prizes, 'and')} points on reaching ${list(goals, 'and')} finished pieces in total, ${n(lang, chainPoints)} points combined, about ${n(lang, Math.round(perPiece))} per piece. The count does not reset when the rank changes.${up ? ` Each shift also gives Work XP, and the next level is worth ${n(lang, up.Score)} points.` : ''} Adding quests and XP, painting gives about ${n(lang, ins.points)} points per 100 Time in an inspired place, ${n(lang, neu.points)} in a neutral place and ${n(lang, low.points)} in an uninspired place, up to piece number ${n(lang, lastGoal)}. A median quest gives ${n(lang, missionMedian)}${ins.points < missionMedian ? ', and even the best case here does not reach that' : ''}.`,
    }));
    const beats = neu.cash > jobMedian ? 'neutral' : ins.cash > jobMedian ? 'inspired' : 'none';
    const moneyVerdict = {
      neutral: { 'pt-BR': 'O quadro passa disso em lugar inspirado ou neutro, nunca sem inspiração.', en: 'A piece beats that in an inspired or neutral place, never in an uninspired one.' },
      inspired: { 'pt-BR': 'O quadro só passa disso em lugar inspirado.', en: 'A piece only beats that in an inspired place.' },
      none: { 'pt-BR': 'O quadro não passa disso em nenhum lugar.', en: 'A piece does not beat that anywhere.' },
    }[beats];
    parts.push(say(lang, page, 'artist cash per piece (Make Art Reward WeightedRewards, ItemData.SellValue, GetPawnRewardsForItem, Sell Pawn Item, GetProgressForState)', {
      'pt-BR': `<strong>Dinheiro, que sozinho não vale pontos:</strong> com o sorteio deste cargo, um quadro vende em média por ${n(lang, avgSale)} na ${pawn}. Ele pede ${n(lang, ins.shifts)} turnos de trabalho se todos forem em lugar inspirado, ${n(lang, neu.shifts)} em neutro e ${n(lang, low.shifts)} sem inspiração, mais ${n(lang, sellTime)} de Tempo para vender. Isso dá ${n(lang, Math.round(ins.cash))}, ${n(lang, Math.round(neu.cash))} e ${n(lang, Math.round(low.cash))} de Dinheiro a cada 100 de Tempo, sem contar o caminho até a loja. O emprego mediano do jogo paga ${n(lang, jobMedian)} a cada 100 de Tempo. ${moneyVerdict['pt-BR']}`,
      en: `<strong>Cash, which is worth no points by itself:</strong> with this rank's draw, a piece sells for ${n(lang, avgSale)} on average at the ${pawn}. It takes ${n(lang, ins.shifts)} shifts if they are all in inspired places, ${n(lang, neu.shifts)} in neutral ones and ${n(lang, low.shifts)} in uninspired ones, plus ${n(lang, sellTime)} Time to sell. That is ${n(lang, Math.round(ins.cash))}, ${n(lang, Math.round(neu.cash))} and ${n(lang, Math.round(low.cash))} Cash per 100 Time, not counting the walk to the shop. The game's median job pays ${n(lang, jobMedian)} per 100 Time. ${moneyVerdict.en}`,
    }));
    parts.push(say(lang, page, 'artist attributes per piece (JobData.Rewards, GetAttributeCostMultiplier, ProgressPainting -0.1, GetInspirationState 0.8)', {
      'pt-BR': `<strong>Atributos:</strong> cada turno de trabalho tira ${n(lang, wear)} somando Felicidade, Saúde e Higiene no valor-base, ou ${n(lang, Math.round(wear / time * 100))} a cada 100 de Tempo; um emprego mediano tira ${n(lang, wearMedian)}. O lugar multiplica esse valor, mas por quadro pronto o inspirado é o que menos gasta: cerca de ${n(lang, ins.wear)}, contra ${n(lang, neu.wear)} em neutro e ${n(lang, low.wear)} sem inspiração. Cada turno de trabalho gasta 10% da inspiração do lugar e inspirado exige mais de 80%, então fazer os ${n(lang, ins.shifts)} turnos inspirados pede trocar de lugar ou esperar a recarga.`,
      en: `<strong>Attributes:</strong> each shift takes ${n(lang, wear)} across Happiness, Health and Hygiene at the base value, or ${n(lang, Math.round(wear / time * 100))} per 100 Time; a median job takes ${n(lang, wearMedian)}. The place multiplies that value, but per finished piece an inspired place costs the least: about ${n(lang, ins.wear)}, against ${n(lang, neu.wear)} in a neutral one and ${n(lang, low.wear)} in an uninspired one. Each shift uses 10% of the place's inspiration and inspired needs more than 80%, so doing all ${n(lang, ins.shifts)} shifts inspired means changing places or waiting for the recharge.`,
    }));
    return h.callout(say(lang, page, 'label worth it', { 'pt-BR': 'Vale a pena?', en: 'Is it worth it?' }), parts.map(p => `<p>${p}</p>`).join(''));
  }

  // Cargo que ninguém assume: JobHandler.CanApplyForJob compara GetClothesTier com RequiredEquippedItemTier, nenhuma roupa passa do nível 4,
  // e SetChamberDataForType só monta as abas 1 a 6. O salário da ficha não entra no texto de propósito.
  function impossibleWorth(lang, j) {
    const page = j.m_Name;
    const top = Math.max(...h.items.filter(i => i.ItemSubGroup === 5).map(i => i.Tier));
    const office = h.place(lang, 'Town Hall');
    return h.callout(say(lang, page, 'label worth it', { 'pt-BR': 'Vale a pena?', en: 'Is it worth it?' }),
      `<p>${say(lang, page, 'job cannot be taken, pay does not matter (CanApplyForJob, ItemData.Tier, SetChamberDataForType)', {
        'pt-BR': `Este cargo não pode ser assumido nesta versão do jogo: ele pede roupa de nível ${n(lang, j.RequiredEquippedItemTier)}, as roupas só vão até o nível ${n(lang, top)}, e ele não aparece em nenhuma aba da ${office}. Como ninguém chega a ele, o que a ficha mostra não muda nada na sua partida.`,
        en: `This job cannot be taken in this version of the game: it needs tier ${n(lang, j.RequiredEquippedItemTier)} clothes, outfits only go up to tier ${n(lang, top)}, and it appears in no tab at the ${office}. Since nobody can reach it, what its sheet shows changes nothing in your game.`,
      })}</p>`);
  }

  // Cargos do Artista: Artist.CheckForJobChange (rank = nível de EXP de Trabalho, no máximo 6),
  // RoleArtistActionTrackerTraitEffect.CheckForWorkAction (tudo, menos Tempo, vezes a inspiração do lugar).
  function artistBlock(lang, j) {
    const page = j.m_Name;
    const role = h.artistRole;
    const ladder = new Map(h.table('ExperiencePointData').map(x => [x.Level, x.Xp]));
    const ranks = h.jobs.filter(x => h.artistJobs.has(x._id)).sort((a, b) => a.JobLevel - b.JobLevel);
    const lvl = j.JobLevel;
    const next = ranks.find(x => x.JobLevel === lvl + 1);
    const exp = h.sumAttr(j.Rewards, 'Experience');
    const time = -h.sumAttr(j.Rewards, 'Time');
    const office = h.place(lang, 'Town Hall');
    const pawn = h.place(lang, 'Pawn Shop');
    const roleLink = h.link(lang, role, h.title(lang, role));
    const sheet = h.tx(lang, `${role.Term}_sheet`);
    const lead = sheet ? h.spanLang(lang, sheet) : '';

    const income = h.callout(say(lang, page, 'label income', { 'pt-BR': 'De onde vem o dinheiro', en: 'Where the money comes from' }),
      `<p>${say(lang, page, 'artist income (JobData.Rewards has no Cash, Make Art Reward)', {
        'pt-BR': `Este cargo não paga salário. Sua renda vem de vender as obras que você termina, na ${pawn}: veja a lista de obras abaixo, com o preço de Venda de cada uma. Quem é ${h.link(lang, role, h.title(lang, role))} também não é demitido por faltar ao trabalho.`,
        en: `This job pays no salary. Your income comes from selling the pieces you finish, at the ${pawn}: see the list of pieces below, with each one's Sell price. ${roleLink} players are also never fired for missing work.`,
      })}</p>`);

    const missing = (ladder.get(lvl + 1) || 0) - (ladder.get(lvl) || 0);
    const turns = exp > 0 ? Math.ceil(missing / exp) : 0;
    const rise = next
      ? say(lang, page, 'artist rank by work xp (Artist.CheckForJobChange, GetCurrentRewardIndex)', {
        'pt-BR': `O cargo de Artista acompanha o seu nível de EXP de Trabalho e muda sozinho, sem passar pela ${office}. Este é o nível ${lvl}, que começa em ${n(lang, ladder.get(lvl) || 0)} de EXP. Para virar ${h.link(lang, next, h.title(lang, next))} faltam ${n(lang, missing)} de EXP, ou cerca de ${n(lang, turns)} turnos de trabalho com a EXP-base de ${n(lang, exp)} por turno.`,
        en: `The Artist rank follows your Work XP level and changes by itself, without going through the ${office}. This is level ${lvl}, which starts at ${n(lang, ladder.get(lvl) || 0)} XP. To become ${h.link(lang, next, h.title(lang, next))} you need ${n(lang, missing)} more XP, or about ${n(lang, turns)} shifts at the base ${n(lang, exp)} XP per shift.`,
      })
      : say(lang, page, 'artist top rank (Artist.GetCurrentRewardIndex)', {
        'pt-BR': `O cargo de Artista acompanha o seu nível de EXP de Trabalho e muda sozinho, sem passar pela ${office}. Este é o último: o nível de EXP ainda sobe depois de ${n(lang, ladder.get(lvl) || 0)}, mas o cargo e a lista de obras continuam estes.`,
        en: `The Artist rank follows your Work XP level and changes by itself, without going through the ${office}. This is the last one: the XP level keeps rising past ${n(lang, ladder.get(lvl) || 0)}, but the job and the list of pieces stay the same.`,
      });
    const rank = h.callout(say(lang, page, 'label rank', { 'pt-BR': 'Como subir de nível', en: 'How to rank up' }), `<p>${rise}</p>`);

    const outfits = new Map(h.items.filter(i => i.ItemSubGroup === 5 && i.Tier > 0).map(i => [i.Tier, i]));
    const where = (role.PaintingActions || []).map(p => {
      const out = outfits.get(p.RequiredClothingTier);
      const places = h.placesOf(lang, (p.Locations || []).map(h.deref).filter(l => l && l._slug));
      return `<li><strong>${say(lang, page, 'paint tier (Artist.PaintingActions)', { 'pt-BR': `Roupa de nível ${p.RequiredClothingTier}${out ? ` (${h.titleText(lang, out)})` : ''}`, en: `Tier ${p.RequiredClothingTier} clothes${out ? ` (${h.titleText(lang, out)})` : ''}` })}:</strong> ${places}</li>`;
    }).join('');
    const paint = h.callout(say(lang, page, 'label paint where', { 'pt-BR': 'Onde pintar', en: 'Where to paint' }), `<ul class="plain">${where}</ul>`);

    const cost = h.callout(say(lang, page, 'label shift cost', { 'pt-BR': 'O que cada turno custa', en: 'What each shift costs' }),
      `<p>${say(lang, page, 'artist shift cost (JobData.Rewards, CheckForWorkAction, GetAttributeCostMultiplier, GetProgressForState)', {
        'pt-BR': `Cada turno de trabalho gasta ${n(lang, time)} de Tempo, sempre. Felicidade, Saúde e Higiene da ficha abaixo são o valor-base: o jogo os multiplica pela inspiração do lugar onde você pinta, por 0,5 sem inspiração, 0,8 se neutro e 1,3 se inspirado. Lugar vazio não deixa pintar. A obra em andamento avança 8%, 15% ou 25% por turno, nessa mesma ordem. Detalhes em ${roleLink}.`,
        en: `Each shift costs ${n(lang, time)} Time, always. Happiness, Health and Hygiene on the sheet below are the base value: the game multiplies them by the inspiration of the place where you paint, by 0.5 when uninspired, 0.8 when neutral and 1.3 when inspired. An empty place does not let you paint. The piece in progress advances 8%, 15% or 25% per shift, in that same order. Details in ${roleLink}.`,
      })}</p>`);

    return h.howBlock(lang, lead, [income, artistWorth(lang, j), rank, paint, cost], 'jobs');
  }

  return { wearNote, actionExtra, artistBlock, impossibleWorth };
};
module.exports.titleFix = titleFix;
module.exports.flavorFix = flavorFix;
