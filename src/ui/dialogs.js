// "Hakkında" ve "Yardım" iletişim kutuları (yerel <dialog>: Esc ile kapanma, odak tuzağı ve odak geri yükleme tarayıcıdan gelir).
import { h, icon, ICONS } from './dom.js';
import { S } from './strings.js';
import pkg from '../../package.json';

function makeDialog(id, title, ...content) {
  const titleId = `${id}-title`;
  const closeBtn = h('button.icon-btn.dlg-close', { type: 'button', 'aria-label': S.app.close, title: S.app.close }, icon(...ICONS.close));
  const dlg = h(
    `dialog#${id}.dlg`,
    { 'aria-labelledby': titleId, 'data-no-camera-keys': '' },
    h('div.dlg-card', null,
      h('header.dlg-head', null, h('h2', { id: titleId }, title), closeBtn),
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

export function createDialogs({ install } = {}) {
  // ---- yardım
  const helpBody = [
    ...S.help.groups.map((g) =>
      h('section.help-group', null,
        h('h3', null, g.title),
        h('dl.keys', null, ...g.rows.flatMap(([k, v]) => [h('dt', null, h('kbd', null, k)), h('dd', null, v)])))),
    h('p.note', null, S.help.badges),
  ];
  const help = makeDialog('dlg-help', S.help.title, ...helpBody);

  // ---- hakkında
  const installRow = h('div.dlg-install', null,
    h('h3', null, S.about.installTitle),
    h('p.note', null, S.about.installText));
  if (install) installRow.append(install);
  const about = makeDialog('dlg-about', S.about.title,
    h('p.about-lead', null, S.about.intro),
    h('h3', null, S.about.layersTitle),
    h('ul.layers', null, ...S.about.layers.map(([k, b, t]) => h('li', null, badge(k, b), h('span', null, t)))),
    h('h3', null, S.about.refsTitle),
    h('ul.refs', null, ...S.about.refs.map((r) => h('li', null, r))),
    h('p.note.small', null, S.about.note),
    installRow,
    h('p.note.small', null, S.about.privacy),
    h('footer.dlg-foot', null,
      h('span', { 'data-version': pkg.version }, `${S.app.version} ${pkg.version}`),
      h('span', null, S.app.copyright)));

  document.body.append(help, about);
  const open = (d) => { if (!d.open) { d.showModal(); d.querySelector('.dlg-body')?.scrollTo(0, 0); } };
  return {
    help, about,
    openHelp: () => open(help),
    openAbout: () => open(about),
    isOpen: () => help.open || about.open,
    closeAll: () => { help.close(); about.close(); },
    destroy: () => { help.remove(); about.remove(); },
  };
}
