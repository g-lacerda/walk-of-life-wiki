// Suggestions modal. Only published when tools/sugestoes.js is switched on.
(function () {
  var tpl = document.getElementById('sug-tpl');
  if (!tpl) return;
  var API = '/api/sugestoes';
  var TIMEOUT_MS = 15000;
  var TURNSTILE_JS = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var modal, panel, form, sendBtn, errorBox, doneBox, checkBox, text, key;
  var opener = null, sending = false, widget = null, loadingCheck = false;

  function showError(message) {
    errorBox.hidden = false;
    errorBox.textContent = message;
  }
  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  function resetCheck() {
    if (widget !== null && window.turnstile) window.turnstile.reset(widget);
  }
  function renderCheck() {
    widget = window.turnstile.render(checkBox, { sitekey: key, theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark' });
    checkBox.hidden = false;
  }
  // The anti-spam script is only requested once somebody opens the form.
  function prepareCheck() {
    if (!key || widget !== null || loadingCheck) return;
    if (window.turnstile) { renderCheck(); return; }
    loadingCheck = true;
    var script = document.createElement('script');
    script.src = TURNSTILE_JS;
    script.onload = function () { loadingCheck = false; renderCheck(); };
    script.onerror = function () { loadingCheck = false; script.remove(); showError(text.tCheck); };
    document.head.appendChild(script);
  }

  function setSending(on) {
    sending = on;
    sendBtn.disabled = on;
    sendBtn.textContent = on ? text.tSending : text.tSend;
    form.setAttribute('aria-busy', String(on));
  }
  function messageFor(code) {
    if (code === 'mensagem_obrigatoria') return text.tEmpty;
    if (code === 'muitos_envios') return text.tRate;
    if (code && code.indexOf('turnstile') === 0) return text.tCheck;
    return text.tGeneric;
  }
  function showForm() {
    form.hidden = false;
    doneBox.hidden = true;
  }
  function showDone() {
    form.reset();
    form.hidden = true;
    doneBox.hidden = false;
    doneBox.querySelector('[data-sug-close]').focus();
  }

  function send(ev) {
    ev.preventDefault();
    if (sending) return;
    clearError();
    var mensagem = form.elements.mensagem.value.trim();
    if (!mensagem) {
      showError(text.tEmpty);
      form.elements.mensagem.focus();
      return;
    }
    var token = '';
    if (key) {
      token = widget !== null && window.turnstile ? window.turnstile.getResponse(widget) : '';
      if (!token) { showError(text.tCheck); prepareCheck(); return; }
    }
    setSending(true);
    var abort = new AbortController();
    var timer = setTimeout(function () { abort.abort(); }, TIMEOUT_MS);
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abort.signal,
      body: JSON.stringify({
        tipo: form.elements.tipo.value,
        mensagem: mensagem,
        contato: form.elements.contato.value.trim(),
        url: location.origin + location.pathname,
        idioma: document.documentElement.lang,
        turnstile: token,
      }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.ok && data.ok) { showDone(); return; }
        showError(messageFor(data.erro));
      });
    }).catch(function () {
      showError(text.tGeneric);
    }).then(function () {
      clearTimeout(timer);
      setSending(false);
      resetCheck();
    });
  }

  function build() {
    modal = document.importNode(tpl.content, true).firstElementChild;
    text = modal.dataset;
    key = modal.getAttribute('data-sitekey');
    panel = modal.querySelector('.sug-panel');
    form = modal.querySelector('.sug-form');
    sendBtn = form.querySelector('[type="submit"]');
    errorBox = modal.querySelector('.sug-error');
    doneBox = modal.querySelector('.sug-done');
    checkBox = modal.querySelector('.sug-check');
    form.addEventListener('submit', send);
    modal.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-sug-close]')) { close(); return; }
      if (ev.target.closest('[data-sug-again]')) { showForm(); form.elements.mensagem.focus(); }
    });
    // Stops the site's own shortcuts (search on "/" and Ctrl K) while the form is open.
    modal.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Escape') close();
    });
    document.body.appendChild(modal);
  }

  function setPageInert(on) {
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el !== modal && el.tagName !== 'SCRIPT') el.inert = on;
    });
    document.documentElement.classList.toggle('sug-lock', on);
  }

  function open(btn) {
    if (!modal) build();
    opener = btn;
    if (!doneBox.hidden) showForm();
    clearError();
    var radio = form.querySelector('input[name="tipo"][value="' + btn.getAttribute('data-sug-tipo') + '"]');
    if (radio) radio.checked = true;
    modal.querySelector('[data-sug-url]').textContent = location.pathname;
    modal.hidden = false;
    setPageInert(true);
    prepareCheck();
    // On phones, focusing the text box would open the keyboard over the form.
    if (matchMedia('(pointer: fine)').matches) form.elements.mensagem.focus();
    else panel.focus();
  }

  function close() {
    if (sending) return;
    modal.hidden = true;
    setPageInert(false);
    if (opener) opener.focus();
  }

  var buttons = document.querySelectorAll('[data-sug-tipo]');
  Array.prototype.forEach.call(buttons, function (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function () { open(btn); });
  });
})();
