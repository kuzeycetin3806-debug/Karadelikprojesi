// Bilgi kartı (alt sheet): seçili sahnenin sade açıklaması, "Neye bakmalı?" maddeleri, canlı sayılar ve Etiketler anahtarı.
// Bilimsel sayılar src/ui/info.js → computeInfo (src/physics) üzerinden gelir; metinler strings.js'tedir.
import { h, icon, ICONS } from './dom.js';
import { S } from './strings.js';
import { sig, percent } from './format.js';
import { computeInfo } from './info.js';

export function createInfoCard({ onClose, onLabels, onWhatIs, getParams }) {
  const title = h('h2#info-title', null, '');
  const closeBtn = h('button.icon-btn.info-close', { type: 'button', 'aria-label': S.infoCard.close, title: S.infoCard.close, onClick: () => onClose() }, icon(...ICONS.close));
  const handle = h('div.sheet-handle', { 'aria-hidden': 'true' }, h('span'));
  const head = h('header.info-head', null, handle, title, closeBtn);

  const text = h('p#info-text.info-text');
  const lookList = h('ul#info-look.info-look');
  const chipEls = {};
  const chips = h('dl.info-chips', null, ...['rPlus', 'rIsco', 'eta', 'shadowW'].flatMap((k) => {
    const dd = h('dd', { 'data-chip': k }, '—');
    chipEls[k] = dd;
    return [h('div.chip-row', { title: S.infoCard.chipTips[k] }, h('dt', null, S.infoCard.chips[k]), dd)];
  }));

  const labelsInput = h('input', { type: 'checkbox', role: 'switch', id: 'info-labels', 'aria-describedby': 'info-labels-help' });
  labelsInput.addEventListener('change', () => onLabels(labelsInput.checked));
  const labelsRow = h('div.info-labels', null,
    h('label.switch', { for: 'info-labels' }, labelsInput, h('span.track', null, h('span.knob')), h('span.ctl-label', null, S.infoCard.labelsTitle)),
    h('p#info-labels-help.note', null, S.infoCard.labelsHelp));
  const whatIs = h('button.btn.info-whatis', { type: 'button', onClick: () => onWhatIs() }, icon(...ICONS.book), S.infoCard.whatIs);

  const body = h('div.info-body', { tabindex: '-1' },
    text,
    h('h3', null, S.infoCard.look), lookList,
    h('h3', null, S.infoCard.numbers), chips,
    labelsRow, whatIs);
  const el = h('section#scene-info.scene-info', { role: 'region', 'aria-labelledby': 'info-title', 'aria-label': S.infoCard.label, 'data-no-camera-keys': '', hidden: true }, head, body);

  /** Metni seçili sahneye (veya "özel görünüm"e) göre yazar; sayılar canlı parametrelerden hesaplanır. */
  function render(sceneId) {
    const t = S.scenes[sceneId] || S.sceneCustom;
    el.dataset.scene = sceneId || 'custom';
    title.textContent = t.title;
    text.textContent = t.text;
    lookList.replaceChildren(...t.look.map((x) => h('li', null, x)));
    refreshNumbers();
  }
  function refreshNumbers() {
    const p = getParams();
    let info;
    try { info = computeInfo(p); } catch { return; }
    chipEls.rPlus.textContent = `${sig(info.rPlus, 3)} M`;
    chipEls.rIsco.textContent = `${sig(info.rIsco, 3)} M`;
    chipEls.eta.textContent = percent(info.eta, 1);
    chipEls.shadowW.textContent = `${sig(info.shadowW, 3)} M`;
    for (const [k, v] of Object.entries({ rPlus: info.rPlus, rIsco: info.rIsco, eta: info.eta, shadowW: info.shadowW })) chipEls[k].dataset.value = String(v);
  }
  return { el, head, body, closeBtn, labelsInput, render, refreshNumbers, setLabels: (v) => { labelsInput.checked = !!v; } };
}
