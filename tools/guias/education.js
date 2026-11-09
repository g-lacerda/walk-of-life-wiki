'use strict';
// Guia "Educação". Regras: EducationData (EnrollmentCost, StudyCost, StudyThreshold, KnowledgeRequirements, RequiredItems, CompletionReward),
// EducationDepartmentData.Courses (quais cursos aparecem em alguma sala), RoleSchoolAndCoursesTraitEffect (Estudos Curiosos e escola de papel).
// Os 8 cursos sem Department e fora de toda lista de departamento e de escola de papel não têm como ser matriculados: ficam só como nota.
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
    const out = [
      ['', `<p>${s('intro (EducationData)', { 'pt-BR': `Os cursos ficam ${H.placeIn(lang, 'Academy')}. Para fazer um, você paga a matrícula uma única vez (em Dinheiro e em Tempo) e depois volta para estudar quantas vezes o curso pedir, gastando Tempo e Felicidade a cada estudo. Ao concluir, ganha pontos e, nos cursos regulares, mais um nível de Ensino básico, que os cursos seguintes e os empregos melhores exigem.`, en: `Courses are at the ${H.place(lang, 'Academy')}. To take one, you pay the enrollment once (in Cash and Time) and then come back to study as many times as the course asks, spending Time and Happiness each study. On finishing you get points and, with the regular courses, one more level of Basic Education, which later courses and better jobs ask for.` })} ${guide('jobs', 'Empregos e promoção', 'Jobs and promotion')}</p>`],
      [s('regular', { 'pt-BR': 'Cursos regulares', en: 'Regular courses' }), `<p>${s('regular note (KnowledgeRequirements, RequiredItems)', { 'pt-BR': 'São nove, em três trilhas. Cada um pede um nível a mais de Ensino básico do que o anterior, e os de cima pedem móveis em casa: um computador e uma biblioteca. Os diplomas do 3º, 6º e 9º curso da tabela, que aparecem na última coluna, são itens que podem ser vendidos na Casa de Penhores.', en: 'There are nine, in three tracks. Each asks one more level of Basic Education than the last, and the higher ones ask for furniture at home: a computer and a library. The diplomas from the 3rd, 6th and 9th courses, shown in the last column, are items that can be sold at the Pawn Shop.' })}</p>${H.simpleTable(head, regular.map(rowOf))}`],
    ];
    if (extra.length) {
      out.push([s('extra', { 'pt-BR': 'Cursos extras (Estudos Curiosos)', en: 'Extra courses (Curious Studies)' }), `<p>${s('extra note (RoleSchoolAndCoursesTraitEffect, Add-Quest-Studies-*, Angler-Role-School)', { 'pt-BR': 'Estes ficam numa aba à parte e nem sempre estão disponíveis. Aprender Coaxar, Telepatia e Falsete só aparecem quando uma Missão libera o curso. Os dois de pesca também entram pela escola de um papel de pesca. Os extras dão pontos e liberam uma ação nova: os de pesca, a compra da vara; os de aprender, a ação que o curso ensina. Sobrevivência na Natureza não dá pontos ao concluir: o efeito dele está na tabela. Os três de aprender cobram Saúde e Dinheiro na matrícula, sem Tempo.', en: 'These sit on a separate tab and are not always available. Learn Croaking, Telepathy and Yodeling only show up when a quest unlocks the course. The two fishing ones also come through the school of a fishing role. The extras give points and a special trait (see On finishing). The three Learn courses charge Health and Cash on enrollment, with no Time.' })}</p>${H.simpleTable(head, extra.map(rowOf))}`]);
    }
    if (orphan.length) {
      out.push([s('orphans', { 'pt-BR': 'Cursos sem matrícula conhecida', en: 'Courses with no known enrollment' }), `<p>${s('orphans note (EducationData.Department null, EducationDepartmentData.Courses)', { 'pt-BR': `${orphan.length} cursos constam nos dados do jogo, mas não encontramos onde se matricular neles: nenhuma sala da Faculdade, trilha ou escola de papel os lista. São eles: ${orphan.map(c => H.titleText(lang, c)).join(', ')}. Se você vir algum no jogo, vale o que o jogo mostra.`, en: `${orphan.length} courses are in the game data, but we have not found where to enroll: no Academy room, track or role school lists them. They are: ${orphan.map(c => H.titleText(lang, c)).join(', ')}. If you see one in the game, trust what the game shows.` })}</p>`]);
    }
    return out;
  },
});
