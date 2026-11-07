// "Kılavuz", "Gizlilik" ve "Hakkında" iletişim kutuları (yerel <dialog>: Esc ile kapanma, odak tuzağı ve odak geri yükleme tarayıcıdan gelir).
// Kılavuz ve gizlilik içeriği S.guide / S.privacy'den çizilir; bağımsız sayfalar (public/kilavuz.html, gizlilik.html) aynı veriden
// tests/ui/make-pages.mjs ile üretilir → içerik tek kaynaktır.
import { h, icon, ICONS } from './dom.js';
import { S } from './strings.js';
import pkg from '../../package.json';

const BASE = import.meta.env?.BASE_URL || './';
export const PAGE_URLS = { guide: `${BASE}kilavuz.html`, privacy: `${BASE}gizlilik.html` };

function makeDialog(id, title, headExtra, ...content) {
  const titleId = `${id}-title`;
  const closeBtn = h('button.icon-btn.dlg-close', { type: 'button', 'aria-label': S.app.close, title: S.app.close }, icon(...ICONS.close));
  const dlg = h(
    `dialog#${id}.dlg`,
    { 'aria-labelledby': titleId, 'data-no-camera-keys': '' },
    h('div.dlg-card', null,
      h('header.dlg-head', null, h('h2', { id: titleId }, title), h('div.dlg-head-actions', null, headExtra, closeBtn)),
      h('div.dlg-body', { tabindex: '0' }, ...content))
  );
  closeBtn.addEventListener('click', () => dlg.close());
  // arka plana (::backdrop) tıklama kapatır
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  return dlg;
}

function badge(kind, text) {
  return h(`span.badge.${kind}`, null, text);
}

/** İçerik bloklarını DOM'a çevirir (biçim: strings.js başındaki açıklama). */
function renderBlocks(blocks) {
  return blocks.map(([kind, data]) => {
    switch (kind) {
      case 'p': return h('p', null, data);
      case 'h': return h('h4', null, data);
      case 'note': return h('p.note', null, data);
      case 'ul': return h('ul.plain', null, ...data.map((t) => h('li', null, t)));
      case 'dl': return h('dl.terms', null, ...data.flatMap(([t, d]) => [h('dt', null, t), h('dd', null, d)]));
      case 'keys': return h('dl.keys', null, ...data.flatMap(([k, v]) => [h('dt', null, h('kbd', null, k)), h('dd', null, v)]));
      case 'links': return h('p.links', null, ...data.map(([label, href]) => h('a.ext', { href, target: '_blank', rel: 'noopener noreferrer' }, label, icon(...ICONS.external))));
      default: return null;
    }
  });
}

function renderSections(sections, idPrefix) {
  return sections.map((sec) =>
    h('section.doc-sec', { id: `${idPrefix}-${sec.id}`, 'data-doc': sec.id, lang: sec.lang || null },
      h('h3', null, sec.title), ...renderBlocks(sec.blocks)));
}

function fullPageLink(href, label) {
  return h('a.btn.dlg-full', { href, target: '_blank', rel: 'noopener', title: label }, icon(...ICONS.external), h('span', null, label));
}

export function createDialogs({ install } = {}) {
  // ---- kılavuz
  const gId = 'guide';
  const toc = h('nav.toc', { 'aria-label': S.guide.toc },
    ...S.guide.sections.map((sec) => h('button.chip', { type: 'button', 'data-goto': sec.id, onClick: () => goTo(sec.id) }, sec.title)));
  const guide = makeDialog('dlg-guide', S.guide.title, fullPageLink(PAGE_URLS.guide, S.guide.openFull),
    h('p.about-lead', null, S.guide.lead), toc, ...renderSections(S.guide.sections, gId));
  function goTo(secId) {
    const target = guide.querySelector(`#${gId}-${secId}`);
    const body = guide.querySelector('.dlg-body');
    if (target && body) body.scrollTo({ top: Math.max(0, target.offsetTop - body.offsetTop - 4), behavior: 'auto' });
  }

  // ---- gizlilik
  const pv = S.privacy;
  const privacy = makeDialog('dlg-privacy', pv.title, fullPageLink(PAGE_URLS.privacy, pv.openFull),
    h('p.note', null, `${pv.appName} · ${pv.effective}`),
    ...renderSections(pv.sections, 'privacy'),
    ...renderSections([{ ...pv.en }], 'privacy'));

  // ---- hakkında
  const installRow = h('div.dlg-install', null,
    h('h3', null, S.about.installTitle),
    h('p.note', null, S.about.installText));
  if (install) installRow.append(install);
  const linkBtn = (label, ic, fn, attr) => h('button.btn.dlg-link', { type: 'button', ...attr, onClick: fn }, icon(...ic), label);
  const about = makeDialog('dlg-about', S.about.title, null,
    h('p.about-lead', null, S.about.intro),
    h('h3', null, S.about.layersTitle),
    h('ul.layers', null, ...S.about.layers.map(([k, b, t]) => h('li', null, badge(k, b), h('span', null, t)))),
    h('h3', null, S.about.refsTitle),
    h('ul.refs', null, ...S.about.refs.map((r) => h('li', null, r))),
    h('p.note.small', null, S.about.note),
    installRow,
    h('h3', null, S.about.linksTitle),
    h('div.dlg-links', null,
      linkBtn(S.about.openGuide, ICONS.book, () => api.openGuide(), { 'data-open': 'guide' }),
      linkBtn(S.about.openPrivacy, ICONS.shield, () => api.openPrivacy(), { 'data-open': 'privacy' })),
    h('p.note.small', null, S.about.privacy),
    h('footer.dlg-foot', null,
      h('span', { 'data-version': pkg.version }, `${S.app.version} ${pkg.version}`),
      h('span', null, S.app.copyright),
      h('span.designer', null, S.app.designer)));

  const all = [guide, privacy, about];
  document.body.append(...all);
  const open = (d) => {
    for (const o of all) if (o !== d && o.open) o.close();
    if (!d.open) d.showModal();
  };
  const api = {
    guide, privacy, about,
    openGuide: (sec) => { open(guide); const body = guide.querySelector('.dlg-body'); body?.scrollTo(0, 0); if (sec) goTo(sec); },
    openPrivacy: () => { open(privacy); privacy.querySelector('.dlg-body')?.scrollTo(0, 0); },
    openAbout: () => { open(about); about.querySelector('.dlg-body')?.scrollTo(0, 0); },
    isOpen: () => all.some((d) => d.open),
    closeAll: () => all.forEach((d) => d.close()),
    isGuideOpen: () => guide.open,
    destroy: () => all.forEach((d) => d.remove()),
  };
  return api;
}
