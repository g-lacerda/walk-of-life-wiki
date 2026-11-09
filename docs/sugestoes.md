# Canal de sugestões da WOL Wiki

Situação: **pronto e desligado**. Nada disso está no site publicado, e nada foi criado na Cloudflare.

## O que existe

**No site** (só entra no build com a constante ligada):

| Arquivo | Papel |
| --- | --- |
| `tools/sugestoes.js` | A constante `SUGGESTIONS_ENABLED`, hoje `false`. |
| `tools/sugestoes-ui.js` | Monta o botão do rodapé, o botão do índice de guias e o modal. Desligado, cada função devolve texto vazio e nada é copiado. |
| `tools/sugestoes-assets/` | `sugestoes.css` e `sugestoes.js` do modal. Ficam fora de `tools/assets/` de propósito, porque o `tools/serve.js` copia para `dist/` tudo o que muda naquela pasta. |
| `tools/hub-text.js` | Textos nos 9 idiomas, chaves `sug_*`. |
| `tools/build-site.js` | Seis ganchos de uma linha (`SUG.*`). |

**No Worker** (pasta `worker/`, que não vai para `dist/`):

| Arquivo | Papel |
| --- | --- |
| `index.mjs` | Atende `POST /api/sugestoes` e passa todo o resto para os arquivos estáticos. |
| `schema.sql` | Tabela `sugestoes` no D1. |
| `wrangler.example.toml` | Exemplo com marcadores. Não é usado por nenhum deploy. |
| `teste-local.mjs` | Teste com D1 e ambiente falsos, sem rede: `node worker/teste-local.mjs`. |

### Respostas do Worker

Sucesso: `201 { "ok": true, "id": "..." }`. Erro: `{ "ok": false, "erro": "<código>" }`.

| Status | Código | Quando |
| --- | --- | --- |
| 400 | `json_invalido` | Corpo não é JSON. |
| 403 | `turnstile_ausente`, `turnstile_invalido` | Token faltando, longo demais ou reprovado. |
| 413 | `corpo_grande` | Corpo acima de 16 KB. |
| 415 | `formato_invalido` | `Content-Type` não é JSON. |
| 422 | `corpo_invalido`, `tipo_invalido`, `mensagem_obrigatoria`, `mensagem_longa`, `contato_longo`, `url_invalida`, `idioma_invalido` | Campo inválido. |
| 429 | `muitos_envios` | Limite por IP. Vem com `Retry-After: 60`. |
| 500 | `erro_interno` | Falha inesperada, inclusive no banco. |
| 503 | `banco_nao_configurado`, `protecao_nao_configurada`, `turnstile_indisponivel` | Falta configuração, ou o Turnstile não respondeu. |

Limites: mensagem 4000 caracteres, contato 200, URL 500. Os dois primeiros também estão em `tools/sugestoes-ui.js`; se mudar um lado, mude o outro.

## O que falta para ligar

Faça nesta ordem. O Worker tem que estar no ar antes da constante, senão o botão aparece e todo envio dá erro.

### 1. Achar a configuração do Worker atual

O site é publicado no Worker `wol-wiki`, em `wolwiki.kooda.dev`, pela sessão que cuida da publicação. **Este projeto não tem `wrangler.toml` nem `wrangler.jsonc`**, então não deu para ler a configuração em uso. Ela precisa ser localizada antes do passo 5, e esse Worker hoje parece servir só arquivos estáticos.

### 2. Criar o banco e aplicar a tabela

```
wrangler d1 create wol-wiki-sugestoes
wrangler d1 execute wol-wiki-sugestoes --remote --file worker/schema.sql
```

Guarde o `database_id` que o primeiro comando mostra.

### 3. Criar o widget do Turnstile

No painel da Cloudflare, em Turnstile, crie um widget para `wolwiki.kooda.dev`. Ele gera duas chaves:

- **Chave do site** (pública): vai no ambiente do build, passo 6.
- **Chave secreta**: vai nos segredos do Worker, passo 4.

### 4. Criar os segredos

```
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put SUGESTOES_IP_SECRET
```

`SUGESTOES_IP_SECRET` é um texto aleatório longo, por exemplo o resultado de `openssl rand -hex 32`. Se ele for trocado, os hashes antigos deixam de corresponder aos novos.

### 5. Juntar o Worker à publicação atual

Na configuração real do `wol-wiki`, acrescente o que está em `worker/wrangler.example.toml`, sem trocar o nome nem o que já existe:

- `main` apontando para `worker/index.mjs`. Os caminhos são relativos ao arquivo de configuração.
- Em `[assets]`: `binding = "ASSETS"` e `run_worker_first = ["/api/*"]`. Mantenha `directory` e qualquer `not_found_handling` que já estejam lá.
- O bloco `[[d1_databases]]` com o `database_id` do passo 2. O binding tem que se chamar `SUGESTOES_DB`.
- O bloco `[[ratelimits]]`. O binding tem que se chamar `SUGESTOES_LIMITE`, e `namespace_id` é um número que não se repita na conta.

Com `run_worker_first = ["/api/*"]`, só as chamadas a `/api/*` executam o Worker. As páginas continuam saindo direto dos arquivos estáticos, como hoje, sem custo de execução e com o `_headers` atual valendo. Confira depois do deploy que as páginas continuam com os mesmos cabeçalhos.

Publique e teste o envio antes de seguir. Sem os segredos e bindings, o Worker responde 503 e não grava nada.

### 6. Ligar o site

1. Em `tools/sugestoes.js`, troque para `SUGGESTIONS_ENABLED = true`.
2. Rode o build com a chave pública no ambiente: `SUGESTOES_TURNSTILE_SITE_KEY=<chave do site> node tools/build-site.js`. Sem ela, o build para com erro, de propósito.
3. Publique.

Se o `_headers` ganhar uma Content Security Policy no futuro, libere `https://challenges.cloudflare.com` para script e frame. Hoje não há CSP.

Para desligar, volte a constante para `false` e publique. O Worker pode continuar no ar.

## Variáveis e bindings

| Nome | Onde | Para quê |
| --- | --- | --- |
| `ASSETS` | binding do Worker | Arquivos estáticos. |
| `SUGESTOES_DB` | binding D1 | Tabela de sugestões. |
| `SUGESTOES_LIMITE` | binding de rate limit | Limite por IP. |
| `TURNSTILE_SECRET_KEY` | segredo do Worker | Verificação antispam. |
| `SUGESTOES_IP_SECRET` | segredo do Worker | Hash do IP. |
| `SUGESTOES_TURNSTILE_SITE_KEY` | ambiente do build | Chave pública do widget. |
| `SUGESTOES_DEV_SEM_PROTECAO` | só desenvolvimento | Veja abaixo. |

### A flag de desenvolvimento

`SUGESTOES_DEV_SEM_PROTECAO=1` é a única forma de rodar sem Turnstile, sem limite ou sem segredo de IP. Sem ela, faltar qualquer um dos três faz o Worker responder 503 sem gravar. Com ela, só é pulado o que estiver ausente; o que estiver configurado continua valendo. No build, ela permite gerar o site sem a chave pública.

Use só em `worker/.dev.vars`, no `wrangler dev`. **Nunca defina em produção.**

## Como ler as sugestões

Não há tela de administração. A leitura é por comando:

```
wrangler d1 execute wol-wiki-sugestoes --remote --command "SELECT id, data, tipo, idioma, url, mensagem, contato FROM sugestoes WHERE status = 'nova' ORDER BY data DESC LIMIT 50"
```

Mudar o status (`nova`, `lida`, `resolvida`, `descartada`):

```
wrangler d1 execute wol-wiki-sugestoes --remote --command "UPDATE sugestoes SET status = 'resolvida' WHERE id = '<id>'"
```

Ver quem mais envia, sem revelar o IP:

```
wrangler d1 execute wol-wiki-sugestoes --remote --command "SELECT ip_hash, COUNT(*) AS total FROM sugestoes GROUP BY ip_hash ORDER BY total DESC LIMIT 20"
```

O texto vem de visitantes: trate como não confiável. Se um dia for exibido em uma página, tem que ser escapado. E o que uma sugestão afirma sobre o jogo é hipótese, a confirmar no código ou nos dados como qualquer outra.

## Dados pessoais

- **Contato**: é dado pessoal (LGPD), opcional, e o formulário diz ao visitante que serve só para responder àquela sugestão. Essa promessa tem que ser cumprida: não use para outra finalidade e não repasse. Apague assim que a conversa terminar, e atenda pedidos de exclusão.
- **Prazo**: sugiro limpar o contato depois de 90 dias. O prazo é decisão do Lacerda, e nada apaga sozinho:

```
wrangler d1 execute wol-wiki-sugestoes --remote --command "UPDATE sugestoes SET contato = NULL WHERE contato IS NOT NULL AND data < datetime('now', '-90 days')"
```

- **IP**: o IP puro não é gravado nem usado como chave do limite. Só fica o HMAC-SHA256 com `SUGESTOES_IP_SECRET`, e o IP também não vai para a verificação do Turnstile. O hash ainda é dado pseudonimizado enquanto o segredo existir.
- **Turnstile**: é serviço de terceiro (Cloudflare). O script só é carregado quando alguém abre o formulário, não em toda página.
- **Aviso de privacidade**: o site não tem página de privacidade hoje. Vale avaliar criar uma antes de ligar o canal, porque ele passa a coletar contato.
- **Log**: o Worker registra só o tipo do erro, nunca o conteúdo da sugestão.
