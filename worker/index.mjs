// Worker do canal de sugestões da WOL Wiki. Atende POST /api/sugestoes e entrega todo o resto
// aos arquivos estáticos. Bindings e segredos vêm do ambiente; a lista está em docs/sugestoes.md.

const ROTA = '/api/sugestoes';
const TIPOS = ['correcao', 'pagina_nova', 'outro'];
const IDIOMAS = ['en', 'pt-BR', 'es', 'fr', 'de', 'ru', 'ja', 'zh-Hans', 'th'];
// O corpo cabe a mensagem inteira em 3 bytes por caractere, os demais campos e o token.
const LIMITES = { corpo: 16 * 1024, mensagem: 4000, contato: 200, url: 500, token: 2048 };
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TIMEOUT_MS = 5000;

const json = (status, dados, extras) => new Response(JSON.stringify(dados), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extras },
});
const erro = (status, codigo, extras) => json(status, { ok: false, erro: codigo }, extras);

// Lê o corpo sem passar do limite, mesmo que Content-Length falte ou minta. Devolve null se passar.
async function lerCorpo(request, max) {
  if (Number(request.headers.get('content-length')) > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); return null; }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const parte of partes) { bytes.set(parte, pos); pos += parte.byteLength; }
  return new TextDecoder().decode(bytes);
}

function urlValida(texto) {
  try { return ['http:', 'https:'].includes(new URL(texto).protocol); } catch { return false; }
}

const textoOpcional = valor => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);

// Devolve { campos } ou { codigo } com o primeiro problema encontrado.
function validar(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return { codigo: 'corpo_invalido' };
  if (!TIPOS.includes(dados.tipo)) return { codigo: 'tipo_invalido' };
  const mensagem = textoOpcional(dados.mensagem);
  if (!mensagem) return { codigo: 'mensagem_obrigatoria' };
  if (mensagem.length > LIMITES.mensagem) return { codigo: 'mensagem_longa' };
  const contato = textoOpcional(dados.contato);
  if (contato && contato.length > LIMITES.contato) return { codigo: 'contato_longo' };
  const url = textoOpcional(dados.url);
  if (url && (url.length > LIMITES.url || !urlValida(url))) return { codigo: 'url_invalida' };
  if (!IDIOMAS.includes(dados.idioma)) return { codigo: 'idioma_invalido' };
  return { campos: { tipo: dados.tipo, mensagem, contato, url, idioma: dados.idioma } };
}

async function hashIp(ip, segredo) {
  const encoder = new TextEncoder();
  const chave = await crypto.subtle.importKey('raw', encoder.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('HMAC', chave, encoder.encode(ip));
  return [...new Uint8Array(assinatura)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// O IP do visitante não vai junto: o parâmetro remoteip é opcional.
async function verificarTurnstile(token, segredo) {
  const resposta = await fetch(TURNSTILE_URL, {
    method: 'POST',
    body: new URLSearchParams({ secret: segredo, response: token }),
    signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
  });
  const dados = await resposta.json();
  return dados.success === true;
}

async function receberSugestao(request, env) {
  if (!env.SUGESTOES_DB) return erro(503, 'banco_nao_configurado');

  const semProtecaoEmDev = env.SUGESTOES_DEV_SEM_PROTECAO === '1';
  const protecaoCompleta = env.TURNSTILE_SECRET_KEY && env.SUGESTOES_IP_SECRET && env.SUGESTOES_LIMITE;
  if (!protecaoCompleta && !semProtecaoEmDev) return erro(503, 'protecao_nao_configurada');

  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return erro(415, 'formato_invalido');

  const ipHash = env.SUGESTOES_IP_SECRET
    ? await hashIp(request.headers.get('cf-connecting-ip') || 'sem-ip', env.SUGESTOES_IP_SECRET)
    : null;

  if (env.SUGESTOES_LIMITE) {
    const { success } = await env.SUGESTOES_LIMITE.limit({ key: ipHash || 'sem-hash' });
    if (!success) return erro(429, 'muitos_envios', { 'Retry-After': '60' });
  }

  const corpo = await lerCorpo(request, LIMITES.corpo);
  if (corpo === null) return erro(413, 'corpo_grande');
  let dados;
  try { dados = JSON.parse(corpo); } catch { return erro(400, 'json_invalido'); }

  const { campos, codigo } = validar(dados);
  if (codigo) return erro(422, codigo);

  if (env.TURNSTILE_SECRET_KEY) {
    const token = dados.turnstile;
    if (typeof token !== 'string' || !token || token.length > LIMITES.token) return erro(403, 'turnstile_ausente');
    let aprovado;
    try { aprovado = await verificarTurnstile(token, env.TURNSTILE_SECRET_KEY); } catch { return erro(503, 'turnstile_indisponivel'); }
    if (!aprovado) return erro(403, 'turnstile_invalido');
  }

  const id = crypto.randomUUID();
  await env.SUGESTOES_DB
    .prepare('INSERT INTO sugestoes (id, tipo, mensagem, contato, url, idioma, data, status, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, campos.tipo, campos.mensagem, campos.contato, campos.url, campos.idioma, new Date().toISOString(), 'nova', ipHash)
    .run();
  return json(201, { ok: true, id });
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== ROTA) return env.ASSETS.fetch(request);
    try {
      return await receberSugestao(request, env);
    } catch (e) {
      // Só o tipo do erro vai para o log, para não vazar conteúdo da sugestão.
      console.error('sugestoes: falha', e && e.name);
      return erro(500, 'erro_interno');
    }
  },
};
