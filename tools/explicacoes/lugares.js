'use strict';
// Preposição certa antes do nome de um lugar, em português: "no Banco", "na Agência de Empregos", "nos Apartamentos Baratos".
// O nome do lugar vem do jogo ("O Parque", "Clucker's"), então o artigo é deduzido do próprio nome.
const FEMININO = new Set(['agência', 'academia', 'faculdade', 'casa', 'loja', 'butique', 'vexcorp', 'lavanderia']);
const PLURAL = new Set(['apartamentos']);
// kind: 'em' (no/na), 'de' (do/da), 'a' (ao/à)
const FORMAS = {
  em: { m: 'no', f: 'na', mp: 'nos', fp: 'nas' },
  de: { m: 'do', f: 'da', mp: 'dos', fp: 'das' },
  a: { m: 'ao', f: 'à', mp: 'aos', fp: 'às' },
};

function artigoDe(texto) {
  const dado = /^(O|A|Os|As)\s+(.+)$/.exec(texto);
  if (dado) return { gen: { O: 'm', A: 'f', Os: 'mp', As: 'fp' }[dado[1]], resto: dado[2] };
  const primeira = texto.split(/\s+/)[0].toLowerCase();
  const plural = PLURAL.has(primeira);
  const fem = FEMININO.has(primeira);
  return { gen: `${fem ? 'f' : 'm'}${plural ? 'p' : ''}`, resto: texto };
}

// texto: título puro do lugar. embrulhar: recebe o nome sem artigo e devolve o HTML (normalmente o link).
function comPreposicao(texto, kind, embrulhar) {
  const { gen, resto } = artigoDe(texto);
  const forma = (FORMAS[kind] || FORMAS.em)[gen];
  return `${forma} ${embrulhar ? embrulhar(resto) : resto}`;
}

module.exports = { comPreposicao, artigoDe };
