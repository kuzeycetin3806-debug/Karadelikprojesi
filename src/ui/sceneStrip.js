// Alt kenarda yatay kaydırılabilir sahne kartı şeridi (iOS tarzı). Her kartta uygulamanın kendi renderer'ından üretilmiş
// gerçek küçük resim bulunur (public/scenes/*.webp → tests/ui/make-scenes.mjs). Şerit sahne kamerasının DIŞINDADIR
// (ayrı bir öğe, touch-action: pan-x): yatay kaydırma kamerayı tetiklemez.
import { h } from './dom.js';
import { S } from './strings.js';
import { SCENES, thumbFile, THUMB_SIZE } from './scenes.js';

const BASE = import.meta.env?.BASE_URL || './';

export function createSceneStrip({ onSelect }) {
  const cards = new Map();
  const list = h('div.scene-list', { role: 'group', 'aria-label': S.sceneStrip.label });
  for (const sc of SCENES) {
    const t = S.scenes[sc.id];
    const img = h('img', { src: `${BASE}${thumbFile(sc.id)}`, alt: '', width: THUMB_SIZE.width, height: THUMB_SIZE.height, decoding: 'async', draggable: 'false' });
    img.addEventListener('error', () => img.remove());
    const btn = h('button.scene-card', {
      type: 'button', 'data-scene': sc.id, 'aria-pressed': 'false', 'aria-label': `${S.sceneStrip.hint}: ${t.title}`,
      onClick: () => onSelect(sc.id),
    }, h('span.scene-thumb', null, img), h('span.scene-name', null, t.short));
    cards.set(sc.id, btn);
    list.append(btn);
  }
  const el = h('nav#scene-strip.scene-strip', { 'aria-label': S.sceneStrip.label }, list);

  function select(id) {
    for (const [k, b] of cards) {
      const on = k === id;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('selected', on);
    }
    const b = cards.get(id);
    if (b && el.offsetParent !== null) {
      const target = b.offsetLeft - (list.clientWidth - b.offsetWidth) / 2;
      list.scrollTo({ left: Math.max(0, target), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }
  return { el, list, select, cards };
}
