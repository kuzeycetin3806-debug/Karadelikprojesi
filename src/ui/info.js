// Bilimsel bilgi hesapları: TÜM değerler src/physics/ fonksiyonlarından gelir (burada formül yok).
import {
  horizonRadii,
  ergosphereRadius,
  photonOrbitRadius,
  iscoRadius,
  frameDraggingOmega,
  shadowBoundary,
} from '../physics/kerr.js';
import { radiativeEfficiency, diskTemperaturePeak } from '../physics/disk.js';
import { gravitationalRadiusKm, timeUnitSeconds } from '../physics/units.js';

const shadowCache = { key: '', value: null };

/** Gölge sınırının yatay/dikey genişliği (M). shadowBoundary(M=1, a, θ_o, n). */
export function shadowExtent(a, thetaCam) {
  const key = `${a}|${thetaCam}`;
  if (shadowCache.key === key) return shadowCache.value;
  let value = { width: NaN, height: NaN };
  try {
    const pts = shadowBoundary(1, a, thetaCam, 180);
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const p of pts) {
      if (p.alpha < aMin) aMin = p.alpha;
      if (p.alpha > aMax) aMax = p.alpha;
      if (p.beta < bMin) bMin = p.beta;
      if (p.beta > bMax) bMax = p.beta;
    }
    value = { width: aMax - aMin, height: bMax - bMin };
  } catch {
    /* tanımsız durumlar → NaN ("—" gösterilir) */
  }
  shadowCache.key = key;
  shadowCache.value = value;
  return value;
}

const safe = (fn) => {
  try {
    return fn();
  } catch {
    return NaN;
  }
};

/**
 * @param {{a:number, prograde:boolean, thetaCam:number, rCam:number}} p  renderer parametreleri
 * @returns {Record<string, number>} M birimli değerler (G = c = 1). Tanımsız → NaN.
 */
export function computeInfo(p) {
  const { a, prograde, thetaCam, rCam } = p;
  const hz = horizonRadii(1, a);
  const sh = shadowExtent(a, thetaCam);
  return {
    rPlus: hz.rPlus,
    rMinus: hz.rMinus,
    ergo: ergosphereRadius(1, a, Math.PI / 2),
    rPhPro: photonOrbitRadius(1, a, true),
    rPhRetro: photonOrbitRadius(1, a, false),
    rIsco: iscoRadius(1, a, prograde),
    eta: safe(() => radiativeEfficiency(a, prograde)),
    omegaH: frameDraggingOmega(1, a, hz.rPlus, Math.PI / 2),
    shadowW: sh.width,
    shadowH: sh.height,
    omegaCam: safe(() => frameDraggingOmega(1, a, rCam, thetaCam)),
    tPeak: safe(() => diskTemperaturePeak(1, a, prograde).r),
  };
}

/** Birim türü: 'L' uzunluk (M→km), 'W' açısal hız (M⁻¹ → rad/s), 'P' boyutsuz. */
export const INFO_ROWS = [
  { key: 'rPlus', kind: 'L' },
  { key: 'rMinus', kind: 'L' },
  { key: 'ergo', kind: 'L' },
  { key: 'rPhPro', kind: 'L' },
  { key: 'rPhRetro', kind: 'L' },
  { key: 'rIsco', kind: 'L' },
  { key: 'eta', kind: 'P' },
  { key: 'omegaH', kind: 'W' },
  { key: 'shadowW', kind: 'L' },
  { key: 'shadowH', kind: 'L' },
  { key: 'omegaCam', kind: 'W' },
  { key: 'tPeak', kind: 'L' },
];

/** Kütle (M☉) varsa fiziksel birimler. */
export function physicalUnits(solarMasses) {
  if (!Number.isFinite(solarMasses) || !(solarMasses > 0)) return null;
  return { lengthKm: gravitationalRadiusKm(solarMasses), timeS: timeUnitSeconds(solarMasses) };
}
