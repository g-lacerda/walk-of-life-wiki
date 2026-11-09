// Partes do canal de sugestões que entram no site. Com SUGGESTIONS_ENABLED falso, cada
// função devolve texto vazio e nada é copiado, então o build sai igual a um build sem o canal.
// O CSS e o JS ficam em tools/sugestoes-assets/, fora de tools/assets/, porque o tools/serve.js
// copia para dist/ tudo o que muda em tools/assets/.
const fs = require('fs');
const path = require('path');
const { SUGGESTIONS_ENABLED } = require('./sugestoes');
const { hubText } = require('./hub-text');

const ASSETS = ['sugestoes.css', 'sugestoes.js'];
// Mesmos limites de LIMITES em worker/index.mjs.
const MAX_MENSAGEM = 4000;
const MAX_CONTATO = 200;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const when = fn => (...args) => (SUGGESTIONS_ENABLED ? fn(...args) : '');

// A chave do site do Turnstile é pública, mas vem do ambiente do build para não ficar no código.
function siteKey() {
  const key = process.env.SUGESTOES_TURNSTILE_SITE_KEY || '';
  if (!key && process.env.SUGESTOES_DEV_SEM_PROTECAO !== '1') {
    throw new Error('Sugestões ligadas sem SUGESTOES_TURNSTILE_SITE_KEY. Veja docs/sugestoes.md.');
  }
  return key;
}

const chip = (lang, value, key, checked) => `<label class="sug-chip"><input type="radio" name="tipo" value="${value}"${checked ? ' checked' : ''}><span>${esc(hubText(lang, key))}</span></label>`;

const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function modal(lang) {
  const t = key => esc(hubText(lang, key));
  const key = siteKey();
  return `<template id="sug-tpl"><div class="sug-modal"${key ? ` data-sitekey="${esc(key)}"` : ''} data-t-send="${t('sug_send')}" data-t-sending="${t('sug_sending')}" data-t-empty="${t('sug_err_empty')}" data-t-rate="${t('sug_err_rate')}" data-t-check="${t('sug_err_check')}" data-t-generic="${t('sug_err_generic')}">
<div class="sug-scrim" data-sug-close></div>
<div class="sug-panel" role="dialog" aria-modal="true" aria-labelledby="sug-title" tabindex="-1">
<div class="sug-head"><h2 id="sug-title">${t('sug_title')}</h2><button type="button" class="iconbtn" data-sug-close aria-label="${t('sug_close')}">${CLOSE_ICON}</button></div>
<form class="sug-form" novalidate>
<fieldset class="sug-types"><legend>${t('sug_type_label')}</legend>${chip(lang, 'correcao', 'sug_type_fix', true)}${chip(lang, 'pagina_nova', 'sug_type_page')}${chip(lang, 'outro', 'sug_type_other')}</fieldset>
<label class="sug-field"><span>${t('sug_message_label')}</span><textarea name="mensagem" rows="5" maxlength="${MAX_MENSAGEM}" aria-required="true" placeholder="${t('sug_message_hint')}"></textarea></label>
<label class="sug-field"><span>${t('sug_contact_label')}</span><input name="contato" type="text" maxlength="${MAX_CONTATO}" autocomplete="off"><small>${t('sug_contact_hint')}</small></label>
<p class="sug-where"><span>${t('sug_page_label')}</span> <span class="sug-url" data-sug-url></span></p>
<div class="sug-check" hidden></div>
<p class="sug-error" role="alert" hidden></p>
<div class="sug-actions"><button type="submit" class="btn btn-main sug-btn">${t('sug_send')}</button></div>
</form>
<div class="sug-done" role="status" hidden><p>${t('sug_success')}</p><div class="sug-actions"><button type="button" class="btn sug-btn" data-sug-again>${t('sug_another')}</button><button type="button" class="btn btn-main sug-btn" data-sug-close>${t('sug_close')}</button></div></div>
</div>
</div></template>`;
}

module.exports = {
  head: when(() => '\n<link rel="stylesheet" href="/assets/sugestoes.css">'),
  footerAction: when(lang => `<p><button type="button" class="sug-foot" data-sug-tipo="correcao" hidden>${esc(hubText(lang, 'sug_fix_action'))}</button></p>`),
  guidesAction: when(lang => `<section class="hub-group"><button type="button" class="btn sug-btn" data-sug-tipo="pagina_nova" hidden>${esc(hubText(lang, 'sug_page_action'))}</button></section>`),
  endOfBody: when(lang => `\n${modal(lang)}\n<script src="/assets/sugestoes.js"></script>`),
  copyAssets: when(dist => { for (const f of ASSETS) fs.copyFileSync(path.join(__dirname, 'sugestoes-assets', f), path.join(dist, 'assets', f)); return ''; }),
};
