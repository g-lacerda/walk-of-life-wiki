'use strict';
// Guia "Educação". Regras: EducationData (EnrollmentCost, StudyCost, StudyThreshold, KnowledgeRequirements, RequiredItems, CompletionReward),
// EducationDepartmentData.Courses (quais cursos aparecem em alguma sala), RoleSchoolAndCoursesTraitEffect (Estudos Curiosos e escola de papel).
// Os 8 cursos sem Department (Types contém 5) são sorteados por EducationManager.PopulateLists: 2 por sala em Academy Old 1/2/3, com diploma exigido (TierOne/Two/ThreeRequirement em Level.prefab).
module.exports = getH => ({
  slug: 'education',
  title: { 'pt-BR': 'Educação', en: 'Education' },
  sections: (lang, s) => {
    const H = getH();
    const n = v => H.number(lang, v);
    const d = H.langDir(lang);
    const score = c => (c.CompletionReward.RewardEntries.find(x => x.Type === 95) || {}).Value || 0;
    const depts = H.table('EducationDepartmentData');
    const inDept = new Set(depts.flatMap(x => (x.Courses || []).map(r => r.id)));
    const all = H.table('EducationData').filter(H.hasText);
    const offered = all.filter(c => inDept.has(c._id));
    const orphan = all.filter(c => !inDept.has(c._id));
    const regular = offered.filter(c => c.StudyThreshold > 0 && /^Degree/.test(c.m_Name)).sort((a, b) => Math.abs(H.sumAttr(a.EnrollmentCost, 'Cash')) - Math.abs(H.sumAttr(b.EnrollmentCost, 'Cash')));
    const extra = offered.filter(c => !/^Degree/.test(c.m_Name));
    const needs = c => {
      const k = (c.KnowledgeRequirements || []).filter(e => e.Type === 55).map(e => { const kn = H.byId.get(e.Id); return kn ? `${H.titleText(lang, kn)}: ${n(e.Value)}` : ''; }).filter(Boolean);
      const items = (c.RequiredItems || []).map(e => H.deref(e)).filter(Boolean).map(it => `${H.itemIcon(it, 20)}${H.link(lang, it, H.title(lang, it))}`);
      return [...k, ...items].join('<br>') || s('needs none', { 'pt-BR': 'Nada', en: 'Nothing' });
    };
    const gives = c => {
      const pts = score(c);
      const things = c.CompletionReward.RewardEntries.filter(e => e.Type === 50).map(e => H.byId.get(e.Id)).filter(Boolean).map(it => `${H.itemIcon(it, 20)}${H.link(lang, it, H.title(lang, it))} <span class="muted">(${n(it.SellValue)})</span>`);
      const traits = c.CompletionReward.RewardEntries.filter(e => e.Type === 110).map(e => H.byId.get(e.Id)).filter(t => t && H.hasText(t)).map(t => `<strong>${H.title(lang, t)}</strong>${H.tx(lang, t.FlavorTerm) ? `: ${H.spanLang(lang, H.tx(lang, t.FlavorTerm))}` : ''}`);
      const know = c.CompletionReward.RewardEntries.filter(e => e.Type === 55).map(e => H.byId.get(e.Id)).filter(Boolean).map(kn => `+1 ${H.titleText(lang, kn)}`);
      const parque = c.m_Name === 'Wilderness Survival' ? [s('wilderness (WildernessSurvivalReports RemoveAllBaseRewards, WildernessSurvivalScore HomeTier 1 ScorePerRound 15, HomeData Outside RandomRewards)', { 'pt-BR': `Morando no Parque, os azares de lá deixam de acontecer (−200 de Felicidade, Saúde ou Higiene, +15 de Estresse ou −100 de Dinheiro) e você ganha ${n(15)} pontos por rodada.`, en: `While living at the Park, its mishaps stop happening (−200 Happiness, Health or Hygiene, +15 Stress or −100 Cash) and you earn ${n(15)} points per round.` })] : [];
      return [pts ? `+${n(pts)} ${s('points word', { 'pt-BR': 'pontos', en: 'points' })}` : '', ...know, ...things, ...traits, ...parque].filter(Boolean).join('<br>');
    };
    const head = [H.ui(lang, 'name'), s('enroll', { 'pt-BR': 'Matrícula (paga uma vez)', en: 'Enrollment (paid once)' }), s('study', { 'pt-BR': 'Cada estudo', en: 'Each study' }), s('times', { 'pt-BR': 'Estudos até concluir', en: 'Studies to finish' }), s('needs', { 'pt-BR': 'Exige', en: 'Requires' }), s('gives', { 'pt-BR': 'Ao concluir', en: 'On finishing' })];
    const rowOf = c => [H.title(lang, c), H.effects(lang, c.EnrollmentCost.RewardEntries) || s('no fee', { 'pt-BR': 'Sem taxa', en: 'No fee' }), H.effects(lang, (c.StudyCost || {}).RewardEntries), c.StudyThreshold, needs(c), gives(c)];
    const guide = (slug, pt, en) => `<a href="/${d}/guides/${slug}/">${s(`link ${slug}`, { 'pt-BR': pt, en })}</a>`;
    const diplomas = ['Diploma I', 'Diploma II', 'Diploma III'].map(x => H.items.find(i => i.m_Name === x)).filter(Boolean).map(it => H.link(lang, it, H.title(lang, it)));
    const out = [
      ['', `<p>${s('intro (EducationData)', { 'pt-BR': `Os cursos ficam ${H.placeIn(lang, 'Academy')}. Para fazer um, você paga a matrícula uma única vez (em Dinheiro e em Tempo) e depois volta para estudar quantas vezes o curso pedir, gastando Tempo e Felicidade a cada estudo. Ao concluir, ganha pontos e, nos cursos regulares, mais um nível de Ensino básico, que os cursos seguintes e os empregos melhores exigem.`, en: `Courses are at the ${H.place(lang, 'Academy')}. To take one, you pay the enrollment once (in Cash and Time) and then come back to study as many times as the course asks, spending Time and Happiness each study. On finishing you get points and, with the regular courses, one more level of Basic Education, which later courses and better jobs ask for.` })} ${guide('jobs', 'Empregos e promoção', 'Jobs and promotion')}</p>`],
      [s('regular', { 'pt-BR': 'Cursos regulares', en: 'Regular courses' }), `<p>${s('regular note (KnowledgeRequirements, RequiredItems)', { 'pt-BR': 'São nove, em três trilhas. Cada um pede um nível a mais de Ensino básico do que o anterior, e os de cima pedem móveis em casa: um computador e uma biblioteca. Os diplomas do 3º, 6º e 9º curso da tabela, que aparecem na última coluna, são itens que podem ser vendidos na Casa de Penhores.', en: 'There are nine, in three tracks. Each asks one more level of Basic Education than the last, and the higher ones ask for furniture at home: a computer and a library. The diplomas from the 3rd, 6th and 9th courses, shown in the last column, are items that can be sold at the Pawn Shop.' })}</p>${H.simpleTable(head, regular.map(rowOf))}`],
    ];
    if (extra.length) {
      out.push([s('extra', { 'pt-BR': 'Cursos extras (Estudos Curiosos)', en: 'Extra courses (Curious Studies)' }), `<p>${s('extra note (RoleSchoolAndCoursesTraitEffect, Add-Quest-Studies-*, Angler-Role-School)', { 'pt-BR': 'Estes ficam numa aba à parte da Faculdade, a de Estudos Curiosos. Não confirmamos se algum deles só aparece em certas condições. Os extras dão pontos e liberam uma ação nova: os de pesca, a compra da vara; os de aprender, a ação que o curso ensina. Sobrevivência na Natureza não dá pontos ao concluir: o efeito dele está na tabela. Os três de aprender cobram Saúde e Dinheiro na matrícula, sem Tempo.', en: 'These sit on a separate Academy tab, Curious Studies. We have not confirmed whether any of them only appears under certain conditions. The extras give points and unlock a new action: the fishing ones, buying the rod; the Learn ones, the action the course teaches. Wilderness Survival gives no points on finishing: its effect is in the table. The three Learn courses charge Health and Cash on enrollment, with no Time.' })}</p>${H.simpleTable(head, extra.map(rowOf))}`]);
    }
    if (orphan.length) {
      out.push([s('orphans', { 'pt-BR': 'Cursos sorteados a cada partida', en: 'Courses drawn each game' }), `<p>${s('orphans note (EducationManager.PopulateLists, GetActionsOfTier, CanEnroll, TierOne/Two/ThreeRequirement)', { 'pt-BR': `${orphan.length} cursos não têm sala fixa. No início de cada partida, o jogo sorteia 6 deles e põe 2 em cada uma das três salas dos cursos regulares. Para se matricular, você precisa ter o diploma ligado à sala: ${diplomas.join(', ')}, nessa ordem. São eles: ${orphan.map(c => H.titleText(lang, c)).join(', ')}.`, en: `${orphan.length} courses have no fixed room. At the start of each game, 6 of them are drawn and 2 go into each of the three regular course rooms. To enroll you need the diploma tied to the room: ${diplomas.join(', ')}, in that order. They are: ${orphan.map(c => H.titleText(lang, c)).join(', ')}.` })}</p>`]);
    }
    return out;
  },
});
