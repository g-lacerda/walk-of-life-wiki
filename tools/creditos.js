// Credits for the footer of every page and for the About page at /<lang>/about/. Text lives in hub-text.js.
const { hubText } = require('./hub-text');

const STEAM_URL = 'https://store.steampowered.com/app/1910150/';
const COMMUNITY_WIKI_URL = 'https://walkoflife.wiki.gg/';
// Stays in English on every language, next to the translated sentence.
const LEAD_EN = 'WOL Wiki is an unofficial fan project.';

module.exports = ({ esc, langDir }) => {
  const t = (lang, key) => esc(hubText(lang, key));
  const lead = `<strong lang="en">${LEAD_EN}</strong>`;
  const external = (url, label, cls) => `<a${cls ? ` class="${cls}"` : ''} href="${url}" rel="noopener">${label}</a>`;
  const sentences = (lang, keys) => keys.map(k => t(lang, k)).join(/^(ja|zh)/.test(lang) ? '' : ' ');

  const footer = lang => `<p>${lead} ${sentences(lang, ['credit_not_affiliated', 'credit_owner', 'credit_game_text'])}</p>`
    + `<p class="foot-links"><a href="/${langDir(lang)}/about/">${t(lang, 'credit_about')}</a>${external(STEAM_URL, t(lang, 'credit_steam'))}${external(COMMUNITY_WIKI_URL, t(lang, 'credit_wiki'))}</p>`;

  const aboutPage = lang => {
    const title = hubText(lang, 'credit_about');
    const body = `<div class="hub"><header class="hub-head"><div><h1>${esc(title)}</h1><p>${lead} ${t(lang, 'credit_not_affiliated')}</p></div></header>`
      + `<div class="body-text"><section class="hub-group"><h2>${t(lang, 'credit_h_credits')}</h2><p>${t(lang, 'credit_owner')}</p><p>${t(lang, 'credit_game_text')}</p><p>${t(lang, 'credit_game_text_more')}</p></section>`
      + `<section class="hub-group"><h2>${t(lang, 'credit_h_how')}</h2><p>${t(lang, 'credit_how')}</p></section>`
      + `<section class="hub-group"><h2>${t(lang, 'credit_h_links')}</h2><p>${t(lang, 'credit_steam_text')}</p><p>${t(lang, 'credit_wiki_text')}</p>`
      + `<div class="about-links">${external(STEAM_URL, t(lang, 'credit_steam'), 'btn btn-main')}${external(COMMUNITY_WIKI_URL, t(lang, 'credit_wiki'), 'btn')}</div></section></div></div>`;
    return { title, description: `${LEAD_EN} ${hubText(lang, 'credit_not_affiliated')}`, body, section: 'about' };
  };

  return { footer, aboutPage };
};
