// Küçük DOM yardımcıları (bağımlılıksız).

/** h('div.sinif#id', {attr}, ...çocuklar) */
export function h(tag, attrs, ...children) {
  const m = /^([a-z0-9]+)((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement(m ? m[1] : tag);
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.classList.add(...String(v).split(' ').filter(Boolean));
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'text') el.textContent = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 24×24 çizgi simgesi; path verisi d. */
export function icon(...paths) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

export const ICONS = {
  sliders: ['M4 6h10', 'M18 6h2', 'M4 12h4', 'M12 12h8', 'M4 18h12', 'M20 18h0', 'M16 4v4', 'M10 10v4', 'M18 16v4'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  reset: ['M4 12a8 8 0 1 0 3-6.2', 'M4 4v5h5'],
  chevron: ['M6 9l6 6 6-6'],
  fullscreen: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  exitFullscreen: ['M9 4v5H4', 'M15 4v5h5', 'M9 20v-5H4', 'M15 20v-5h5'],
  help: ['M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8', 'M12 17h0', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'],
  download: ['M12 4v11', 'M7 11l5 5 5-5', 'M5 20h14'],
  share: ['M12 15V4', 'M8 8l4-4 4 4', 'M6 12H5v8h14v-8h-1'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  book: ['M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z', 'M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5'],
  shield: ['M12 3l8 3v6c0 4.8-3.3 7.9-8 9-4.7-1.1-8-4.2-8-9V6z', 'M9 12l2 2 4-4'],
  orbit: ['M20 12a8 8 0 1 1-3-6.2', 'M20 4v5h-5'],
  pinch: ['M10 14l-6 6', 'M4 15v5h5', 'M14 10l6-6', 'M15 4h5v5'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  scenes: ['M3 7h7v10H3z', 'M14 7h7v10h-7z'],
  info: ['M12 17v-6', 'M12 7.5h0', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'],
};
