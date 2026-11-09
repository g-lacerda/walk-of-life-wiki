// Teste local do Worker, sem rede e sem Cloudflare: node worker/teste-local.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from './index.mjs';

const IP = '203.0.113.77';
const URL_API = 'https://wiki.exemplo/api/sugestoes';

function fakeD1({ falha = false } = {}) {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      const colunas = /\(([^)]+)\) VALUES/.exec(sql)[1].split(',').map(c => c.trim());
      return {
        bind: (...valores) => ({
          run: async () => {
            if (falha) throw new Error('D1 fora do ar: segredo-do-erro');
            rows.push(Object.fromEntries(colunas.map((c, i) => [c, valores[i]])));
          },
        }),
      };
    },
  };
}

function fakeEnv(extras = {}) {
  const limite = { keys: [], permitir: true, limit({ key }) { this.keys.push(key); return Promise.resolve({ success: this.permitir }); } };
  return {
    ASSETS: { fetch: async req => new Response('estatico:' + new URL(req.url).pathname, { status: 200 }) },
    SUGESTOES_DB: fakeD1(),
    SUGESTOES_LIMITE: limite,
    TURNSTILE_SECRET_KEY: 'segredo-turnstile',
    SUGESTOES_IP_SECRET: 'segredo-ip',
    ...extras,
  };
}

// Toda saída de rede passa por aqui; qualquer outro destino reprova o teste.
let chamadasTurnstile = [];
let respostaTurnstile = () => new Response(JSON.stringify({ success: true }));
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://challenges.cloudflare.com/turnstile/v0/siteverify', 'chamada de rede inesperada');
  chamadasTurnstile.push(Object.fromEntries(init.body));
  return respostaTurnstile();
};

const valido = extras => ({ tipo: 'correcao', mensagem: 'Texto errado na página.', contato: 'eu@exemplo.test', url: 'https://wiki.exemplo/pt-br/items/x/', idioma: 'pt-BR', turnstile: 'tok', ...extras });
const post = (corpo, headers = {}) => new Request(URL_API, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'cf-connecting-ip': IP, ...headers },
  body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
});
async function chamar(req, env) {
  const res = await worker.fetch(req, env);
  const texto = await res.text();
  let corpo = null;
  try { corpo = JSON.parse(texto); } catch { /* resposta estática */ }
  return { status: res.status, corpo, texto, headers: res.headers };
}

const testes = [];
const teste = (nome, fn) => testes.push([nome, fn]);
async function esperaErro(req, env, status, codigo) {
  const r = await chamar(req, env);
  assert.equal(r.status, status);
  assert.deepEqual(r.corpo, { ok: false, erro: codigo });
  assert.match(r.headers.get('content-type'), /application\/json/);
  assert.equal(env.SUGESTOES_DB?.rows?.length ?? 0, 0, 'não deveria gravar');
  return r;
}

teste('o resto vai para os arquivos estáticos', async () => {
  const env = fakeEnv();
  for (const req of [new Request('https://wiki.exemplo/pt-br/'), new Request(URL_API), new Request('https://wiki.exemplo/api/outra', { method: 'POST', body: 'x' })]) {
    const r = await chamar(req, env);
    assert.equal(r.status, 200);
    assert.ok(r.texto.startsWith('estatico:'));
  }
  assert.equal(env.SUGESTOES_DB.rows.length, 0);
  assert.equal(env.SUGESTOES_LIMITE.keys.length, 0);
});

teste('envio válido grava todos os campos', async () => {
  const env = fakeEnv();
  const r = await chamar(post(valido({ mensagem: '  com espaços  ' })), env);
  assert.equal(r.status, 201);
  assert.equal(r.corpo.ok, true);
  const [row] = env.SUGESTOES_DB.rows;
  assert.equal(row.id, r.corpo.id);
  assert.equal(row.tipo, 'correcao');
  assert.equal(row.mensagem, 'com espaços');
  assert.equal(row.contato, 'eu@exemplo.test');
  assert.equal(row.url, 'https://wiki.exemplo/pt-br/items/x/');
  assert.equal(row.idioma, 'pt-BR');
  assert.equal(row.status, 'nova');
  assert.ok(!Number.isNaN(Date.parse(row.data)));
  assert.equal(row.turnstile, undefined);
});

teste('contato e url são opcionais', async () => {
  const env = fakeEnv();
  const r = await chamar(post(valido({ contato: '   ', url: undefined })), env);
  assert.equal(r.status, 201);
  assert.equal(env.SUGESTOES_DB.rows[0].contato, null);
  assert.equal(env.SUGESTOES_DB.rows[0].url, null);
});

teste('aceita todos os tipos e idiomas do site', async () => {
  for (const tipo of ['correcao', 'pagina_nova', 'outro']) assert.equal((await chamar(post(valido({ tipo })), fakeEnv())).status, 201);
  for (const idioma of ['en', 'pt-BR', 'es', 'fr', 'de', 'ru', 'ja', 'zh-Hans', 'th']) assert.equal((await chamar(post(valido({ idioma })), fakeEnv())).status, 201);
});

teste('o IP puro nunca é gravado nem usado como chave', async () => {
  const env = fakeEnv();
  await chamar(post(valido()), env);
  const [row] = env.SUGESTOES_DB.rows;
  assert.ok(!JSON.stringify(row).includes(IP));
  assert.match(row.ip_hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(env.SUGESTOES_LIMITE.keys, [row.ip_hash]);
});

teste('hash estável por IP e dependente do segredo', async () => {
  const hash = async (ip, segredo) => {
    const env = fakeEnv({ SUGESTOES_IP_SECRET: segredo });
    await chamar(post(valido(), { 'cf-connecting-ip': ip }), env);
    return env.SUGESTOES_DB.rows[0].ip_hash;
  };
  assert.equal(await hash('198.51.100.1', 'a'), await hash('198.51.100.1', 'a'));
  assert.notEqual(await hash('198.51.100.1', 'a'), await hash('198.51.100.2', 'a'));
  assert.notEqual(await hash('198.51.100.1', 'a'), await hash('198.51.100.1', 'b'));
});

for (const [nome, extras, codigo] of [
  ['tipo fora da lista', { tipo: 'spam' }, 'tipo_invalido'],
  ['tipo ausente', { tipo: undefined }, 'tipo_invalido'],
  ['mensagem ausente', { mensagem: undefined }, 'mensagem_obrigatoria'],
  ['mensagem só com espaços', { mensagem: ' \n ' }, 'mensagem_obrigatoria'],
  ['mensagem que não é texto', { mensagem: 123 }, 'mensagem_obrigatoria'],
  ['mensagem longa', { mensagem: 'x'.repeat(4001) }, 'mensagem_longa'],
  ['contato longo', { contato: 'x'.repeat(201) }, 'contato_longo'],
  ['url longa', { url: 'https://a.test/' + 'x'.repeat(500) }, 'url_invalida'],
  ['url sem http', { url: 'javascript:alert(1)' }, 'url_invalida'],
  ['idioma fora da lista', { idioma: 'xx' }, 'idioma_invalido'],
]) {
  teste(`recusa ${nome}`, () => esperaErro(post(valido(extras)), fakeEnv(), 422, codigo));
}

teste('recusa JSON quebrado', () => esperaErro(post('{nao'), fakeEnv(), 400, 'json_invalido'));
teste('recusa corpo que não é objeto', () => esperaErro(post('[1]'), fakeEnv(), 422, 'corpo_invalido'));
teste('recusa formato que não é JSON', () => esperaErro(post(valido(), { 'content-type': 'text/plain' }), fakeEnv(), 415, 'formato_invalido'));
teste('recusa corpo grande pelo Content-Length', () => esperaErro(post(valido(), { 'content-length': '99999' }), fakeEnv(), 413, 'corpo_grande'));
teste('recusa corpo grande sem Content-Length', () => {
  const pedaco = new Uint8Array(8 * 1024).fill(97);
  let n = 0;
  const body = new ReadableStream({ pull(c) { if (n++ < 4) c.enqueue(pedaco); else c.close(); } });
  const req = new Request(URL_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half' });
  return esperaErro(req, fakeEnv(), 413, 'corpo_grande');
});
teste('aceita mensagem no limite em escrita de 3 bytes', async () => {
  const r = await chamar(post(valido({ mensagem: 'ก'.repeat(4000), contato: 'ก'.repeat(200), turnstile: 't'.repeat(2048) })), fakeEnv());
  assert.equal(r.status, 201);
});

for (const falta of ['TURNSTILE_SECRET_KEY', 'SUGESTOES_IP_SECRET', 'SUGESTOES_LIMITE']) {
  teste(`sem ${falta} e sem a flag: 503 e nada gravado`, () => esperaErro(post(valido()), fakeEnv({ [falta]: undefined }), 503, 'protecao_nao_configurada'));
  teste(`flag diferente de 1 não libera a falta de ${falta}`, () => esperaErro(post(valido()), fakeEnv({ [falta]: undefined, SUGESTOES_DEV_SEM_PROTECAO: 'true' }), 503, 'protecao_nao_configurada'));
}

teste('com a flag de desenvolvimento, pula o que não está configurado', async () => {
  chamadasTurnstile = [];
  const env = fakeEnv({ TURNSTILE_SECRET_KEY: undefined, SUGESTOES_IP_SECRET: undefined, SUGESTOES_LIMITE: undefined, SUGESTOES_DEV_SEM_PROTECAO: '1' });
  const r = await chamar(post(valido({ turnstile: undefined })), env);
  assert.equal(r.status, 201);
  assert.equal(env.SUGESTOES_DB.rows[0].ip_hash, null);
  assert.equal(chamadasTurnstile.length, 0);
});

teste('com a flag, o que está configurado continua valendo', async () => {
  const env = fakeEnv({ SUGESTOES_DEV_SEM_PROTECAO: '1' });
  env.SUGESTOES_LIMITE.permitir = false;
  await esperaErro(post(valido()), env, 429, 'muitos_envios');
});

teste('sem banco: 503, mesmo com a flag', () => esperaErro(post(valido()), fakeEnv({ SUGESTOES_DB: undefined, SUGESTOES_DEV_SEM_PROTECAO: '1' }), 503, 'banco_nao_configurado'));

teste('limite por IP: 429 com Retry-After', async () => {
  const env = fakeEnv();
  env.SUGESTOES_LIMITE.permitir = false;
  chamadasTurnstile = [];
  const r = await esperaErro(post(valido()), env, 429, 'muitos_envios');
  assert.equal(r.headers.get('retry-after'), '60');
  assert.equal(chamadasTurnstile.length, 0);
});

teste('Turnstile aprovado manda segredo e token, sem o IP', async () => {
  chamadasTurnstile = [];
  await chamar(post(valido()), fakeEnv());
  assert.deepEqual(chamadasTurnstile, [{ secret: 'segredo-turnstile', response: 'tok' }]);
});
teste('Turnstile sem token: 403 sem chamar a rede', async () => {
  chamadasTurnstile = [];
  await esperaErro(post(valido({ turnstile: undefined })), fakeEnv(), 403, 'turnstile_ausente');
  assert.equal(chamadasTurnstile.length, 0);
});
teste('Turnstile com token longo: 403', () => esperaErro(post(valido({ turnstile: 't'.repeat(2049) })), fakeEnv(), 403, 'turnstile_ausente'));
teste('Turnstile reprovado: 403', async () => {
  respostaTurnstile = () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }));
  try { await esperaErro(post(valido()), fakeEnv(), 403, 'turnstile_invalido'); } finally { respostaTurnstile = () => new Response(JSON.stringify({ success: true })); }
});
teste('Turnstile fora do ar: 503', async () => {
  respostaTurnstile = () => { throw new TypeError('rede'); };
  try { await esperaErro(post(valido()), fakeEnv(), 503, 'turnstile_indisponivel'); } finally { respostaTurnstile = () => new Response(JSON.stringify({ success: true })); }
});

teste('falha no banco: 500 sem vazar detalhe', async () => {
  const original = console.error;
  const logs = [];
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const r = await chamar(post(valido()), fakeEnv({ SUGESTOES_DB: fakeD1({ falha: true }) }));
    assert.equal(r.status, 500);
    assert.deepEqual(r.corpo, { ok: false, erro: 'erro_interno' });
    assert.ok(!logs.join().includes('segredo-do-erro'));
  } finally { console.error = original; }
});

teste('as colunas do INSERT existem no schema.sql', async () => {
  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  const env = fakeEnv();
  await chamar(post(valido()), env);
  for (const coluna of Object.keys(env.SUGESTOES_DB.rows[0])) assert.match(schema, new RegExp(`^\\s+${coluna}\\s+TEXT`, 'm'), coluna);
});

let falhas = 0;
for (const [nome, fn] of testes) {
  try { await fn(); console.log('ok   ' + nome); }
  catch (e) { falhas++; console.log('FALHA ' + nome + '\n  ' + e.message); }
}
console.log(`\n${testes.length - falhas}/${testes.length} passaram`);
process.exitCode = falhas ? 1 : 0;
