// Bilgilendirici etiket katmanı: gölge, foton halkası, merceklenmiş disk (arka yay), Doppler ile parlayan taraf.
// GÖSTERİM katmanı: sahnenin üzerine yazı yerleştirir, görüntüyü değiştirmez.
//
// Konum hesabı (uzak gözlemci yaklaşımı): gölge sınırı src/physics/kerr.js → shadowBoundary(1, a, θ_o, n) ile (α, β) ekranında
// verilir (M cinsinden; α sağ, β yukarı — docs/physics/kerr.md §2.11). Ekran pikseline eşleme: küçük açı b ≈ r·tanψ,
//   x = cx + (α / r_cam) / tan(fovY/2) · H/2,   y = cy − (β / r_cam) / tan(fovY/2) · H/2.
// YAKLAŞIKTIR: sonlu r_cam'de (ışın eğriliği, statik gözlemci aberasyonu) gerçek gölge bundan sapar; r = 50 M'de fark ≈ %1–2,
// r = 15 M'de ≈ %1,3'ten büyüktür ve yakınlaştıkça artar. Bu yüzden r_cam < R_MIN_LABELS (15 M) iken etiketler gizlenir.
// Doppler tarafı: prograd diskte gözlemcinin solu (α < 0) bize yaklaşır (kerr.md §2.11: λ = −α sinθ_o). Kamera azimutu
// (phiCam) eksenel simetri nedeniyle tarafı değiştirmez. Retrograd diskte taraf sağa geçer.
import { shadowBoundary, iscoRadius } from '../physics/kerr.js';
import { h } from './dom.js';
import { S } from './strings.js';

export const R_MIN_LABELS = 15; // M
const N_BOUNDARY = 96;
const MARGIN = 8;

const cache = { key: '', value: null };
/** Gölge sınırı (M cinsinden) + özet: yalnız (a, θ) değişince yeniden hesaplanır. */
export function shadowGeometry(a, thetaCam) {
  const key = `${a}|${thetaCam}`;
  if (cache.key === key) return cache.value;
  const pts = shadowBoundary(1, a, thetaCam, N_BOUNDARY);
  let aMin = Infinity, aMax = -Infinity, bMax = 0;
  for (const p of pts) {
    if (p.alpha < aMin) aMin = p.alpha;
    if (p.alpha > aMax) aMax = p.alpha;
    if (Math.abs(p.beta) > bMax) bMax = Math.abs(p.beta);
  }
  const value = { pts, aMin, aMax, bMax, center: 0.5 * (aMin + aMax) };
  cache.key = key;
  cache.value = value;
  return value;
}

/** Saf yerleşim hesabı (DOM yok): hangi etiket nerede. Piksel koordinatları tuvalin sol-üstüne göredir. */
export function computeLayout(p, w, h2) {
  if (!(p.rCam >= R_MIN_LABELS)) return { hidden: 'near' };
  const sg = shadowGeometry(p.a, p.thetaCam);
  const tanHalf = Math.tan((p.fovY * Math.PI) / 360);
  const k = h2 / 2 / (tanHalf * p.rCam); // piksel / M
  const cx = w / 2, cy = h2 / 2;
  const X = (al) => cx + al * k;
  const Y = (be) => cy - be * k;
  const side = p.thetaCam < Math.PI / 2 ? 1 : -1; // +1: disk düzleminin üstünden bakış (merceklenmiş yay üstte)
  const sinT = Math.sin(p.thetaCam);

  const out = { hidden: false, k, side, outline: sg.pts.map((q) => [X(q.alpha), Y(q.beta)]) };
  out.shadow = { x: X(sg.center), y: Y(0) };
  // foton halkası: gölge sınırında, "diskin arka yayı" tarafının tersindeki alt/üst-sağ noktası (−35° / +35° civarı)
  const target = (-side * 35 * Math.PI) / 180;
  let best = null, bestD = Infinity;
  for (const q of sg.pts) {
    const ang = Math.atan2(q.beta, q.alpha - sg.center);
    const d = Math.abs(Math.atan2(Math.sin(ang - target), Math.cos(ang - target)));
    if (d < bestD) { bestD = d; best = q; }
  }
  out.ring = { x: X(best.alpha), y: Y(best.beta) };
  if (p.disk) {
    // merceklenmiş arka yay: gölgenin tepesi (üstten bakışta üst, alttan bakışta alt) — yüz yüze bakışta (θ < 30°) yay yoktur
    if (sinT > 0.5) out.lens = { x: X(sg.center), y: Y(side * sg.bMax * 1.1) };
    // Doppler: diskin bize yaklaşan yanı (prograd → sol, retrograd → sağ). Yüz yüze bakışta (sinθ < 0,25) fark küçülür → gizli.
    if (sinT >= 0.25) {
      const rIsco = iscoRadius(1, p.a, p.prograde);
      const rA = Math.min(Math.max(rIsco + 3, 1.6 * sg.bMax), 0.85 * p.diskOut);
      const dir = p.prograde ? -1 : 1;
      out.doppler = { x: X(sg.center + dir * rA), y: Y(0), dir };
    }
  }
  return out;
}

export function createLabels({ canvas, getParams, getBounds }) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'lbl-svg');
  const outline = document.createElementNS(svgNS, 'path');
  outline.setAttribute('class', 'lbl-outline');
  svg.append(outline);
  const lines = {};
  const pill = (key, text) => h('div.lbl', { 'data-label': key, hidden: true }, text);
  const els = {
    shadow: pill('shadow', S.labels.shadow),
    ring: pill('ring', S.labels.ring),
    lens: pill('lens', S.labels.lens),
    doppler: pill('doppler', S.labels.dopplerPro),
  };
  for (const key of ['ring', 'lens', 'doppler']) {
    const ln = document.createElementNS(svgNS, 'line');
    ln.setAttribute('class', 'lbl-line');
    ln.setAttribute('data-line', key);
    svg.append(ln);
    lines[key] = ln;
  }
  const dots = {};
  for (const key of ['ring', 'lens', 'doppler']) {
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('class', 'lbl-dot');
    c.setAttribute('r', '3');
    svg.append(c);
    dots[key] = c;
  }
  const note = h('div.lbl-note', { hidden: true }, S.labels.near);
  const root = h('div#labels.labels', { 'aria-hidden': 'true', hidden: true }, svg, els.shadow, els.ring, els.lens, els.doppler, note);

  let enabled = false;
  let queued = 0;

  function setPill(key, anchor, dx, dy, rect, placed) {
    const el = els[key];
    if (!anchor) { el.hidden = true; if (lines[key]) lines[key].style.display = 'none'; if (dots[key]) dots[key].style.display = 'none'; return; }
    el.hidden = false;
    const wd = el.offsetWidth, ht = el.offsetHeight;
    let x = anchor.x + dx - wd / 2, y = anchor.y + dy - ht / 2;
    x = Math.min(Math.max(x, rect.left + MARGIN), rect.right - MARGIN - wd);
    y = Math.min(Math.max(y, rect.top + MARGIN), rect.bottom - MARGIN - ht);
    // çakışma: önceki kutularla kesişiyorsa aşağı/yukarı kaydır
    for (let pass = 0; pass < 3; pass++) {
      for (const q of placed) {
        if (x < q.x + q.w + 4 && x + wd + 4 > q.x && y < q.y + q.h + 4 && y + ht + 4 > q.y) {
          y = dy >= 0 ? q.y + q.h + 6 : q.y - ht - 6;
        }
      }
    }
    y = Math.min(Math.max(y, rect.top + MARGIN), rect.bottom - MARGIN - ht);
    placed.push({ x, y, w: wd, h: ht });
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (key === 'shadow') return;
    const ln = lines[key], dot = dots[key];
    const inside = anchor.x >= rect.left && anchor.x <= rect.right && anchor.y >= rect.top && anchor.y <= rect.bottom;
    dot.style.display = inside ? '' : 'none';
    ln.style.display = inside ? '' : 'none';
    dot.setAttribute('cx', String(anchor.x)); dot.setAttribute('cy', String(anchor.y));
    ln.setAttribute('x1', String(anchor.x)); ln.setAttribute('y1', String(anchor.y));
    ln.setAttribute('x2', String(x + wd / 2)); ln.setAttribute('y2', String(y + ht / 2));
  }

  function update() {
    queued = 0;
    if (!enabled) return;
    const cr = canvas.getBoundingClientRect();
    const b = getBounds(); // {top, bottom}: kullanılabilir dikey aralık (araç çubuğunun altı … sahne şeridinin üstü), tuval-göreli değil sayfa-göreli
    root.style.left = `${cr.left}px`; root.style.top = `${cr.top}px`; root.style.width = `${cr.width}px`; root.style.height = `${cr.height}px`;
    svg.setAttribute('viewBox', `0 0 ${cr.width} ${cr.height}`);
    const p = getParams();
    const L = computeLayout(p, cr.width, cr.height);
    root.dataset.state = L.hidden ? 'near' : 'on';
    note.hidden = !L.hidden;
    if (L.hidden) {
      for (const key of Object.keys(els)) els[key].hidden = true;
      for (const k of Object.keys(lines)) { lines[k].style.display = 'none'; dots[k].style.display = 'none'; }
      outline.setAttribute('d', '');
      note.style.transform = `translate(${Math.round(cr.width / 2 - note.offsetWidth / 2)}px, ${Math.round(Math.max(b.top - cr.top, 8))}px)`;
      return;
    }
    outline.setAttribute('d', `M${L.outline.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L')}Z`);
    const rect = { left: 0, right: cr.width, top: Math.max(0, b.top - cr.top), bottom: Math.min(cr.height, b.bottom - cr.top) };
    const placed = [];
    els.doppler.textContent = p.prograde ? S.labels.dopplerPro : S.labels.dopplerRetro;
    els.doppler.dataset.side = p.prograde ? 'left' : 'right';
    setPill('shadow', L.shadow, 0, 0, rect, placed);
    setPill('lens', L.lens, 0, -L.side * 46, rect, placed);
    setPill('ring', L.ring, 26, L.side * 40, rect, placed);
    setPill('doppler', L.doppler, 0, L.side * 62, rect, placed);
    root.dataset.side = String(L.side);
  }

  function schedule() {
    if (!enabled || queued) return;
    queued = requestAnimationFrame(update);
  }

  return {
    el: root,
    schedule,
    update,
    setEnabled(v) {
      enabled = !!v;
      root.hidden = !enabled;
      if (enabled) update();
    },
    isEnabled: () => enabled,
    dispose() { if (queued) cancelAnimationFrame(queued); root.remove(); },
  };
}
