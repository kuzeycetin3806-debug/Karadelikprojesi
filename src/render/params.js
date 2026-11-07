/**
 * Render parametre sözleşmesi: doğrulama, varsayılanlar ve shader uniform değerlerinin türetilmesi.
 *
 * Fizik sabitleri (r₊, r₋, ISCO, ZAMO tetradı) CPU'da float64 ile `src/math` ve `src/physics`
 * modüllerinden alınır (kopyalanmaz) ve shader'a f32 uniform olarak geçirilir.
 * Bu dosya src/math'i YALNIZCA içe aktarır; değiştirmez.
 */
import { zamoFrame } from '../math/camera.js';
import { horizons } from '../math/geodesic.js';
import { recommendedGpuBudget } from '../math/raytracer.js';
import { iscoRadius, photonOrbitRadius } from '../physics/kerr.js';

export const A_MAX = 0.998; // a = 1'de ISCO/diskRedshift tanımsız (README §9)
export const THETA_MIN = 1e-3; // kutuptan en az 1e-3 rad (math/README §4.3, §9)
export const MAX_HITS = 4; // shader'daki MAX_HITS ile aynı olmalı

/** Kalite seviyeleri: κ (adım ölçeği) ve N (adım bütçesi). 'high' → recommendedGpuBudget(a, analytic). */
export const QUALITY_PRESETS = Object.freeze({
  high: { kappa: 0.05 }, // N = recommendedGpuBudget(a, analyticFate).maxSteps
  mobile: { kappa: 0.1, maxSteps: 256 }, // README §7: κ=0.10 / N=256 (≈47 adım ortalama)
});

export const DEFAULT_PARAMS = Object.freeze({
  a: 0.9,
  thetaCam: (75 * Math.PI) / 180,
  rCam: 50,
  phiCam: 0,
  fovY: 40,
  diskIn: 'isco',
  diskOut: 20,
  prograde: true,
  quality: 'high',
  maxDiskHits: 1,
  // --- ek (gelişmiş) alanlar
  disk: true, // false: disk yok (yalnız merceklenme)
  resolutionScale: 1, // 0.1–1; etkin piksel oranı = min(devicePixelRatio, maxPixelRatio)·resolutionScale
  maxPixelRatio: 2,
  analyticFate: true, // bütçesi biten ışın analitik sınıflanır (önerilen); false: "bütçe bitti → yakalandı"
  rEscape: 'auto', // 'auto' = max(300, 2·rCam) veya sayı
  kappa: null, // null: kaliteden; sayı: elle geçersiz kıl (test/ayar)
  maxSteps: null, // null: kaliteden/spine bağlı bütçeden; sayı: elle geçersiz kıl
  planeGuard: true, // YALNIZ TEST: false ⇒ θ_cam=π/2 bant koruması kapalı (negatif kontrol); üretimde hep true
});

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const num = (name, v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${name} sonlu bir sayı olmalı (verilen: ${v})`);
  return v;
};

/**
 * Ham parametreleri (kısmi olabilir) doğrulanmış/kıstırılmış tam parametre nesnesine çevirir.
 * Geçersiz tür → TypeError. Aralık dışı → kıstırılır (UI kaydırıcılarını kırmamak için).
 */
export function normalizeParams(p, base = DEFAULT_PARAMS) {
  const o = { ...base, ...p };
  o.a = clamp(num('a', o.a), 0, A_MAX);
  o.thetaCam = clamp(num('thetaCam', o.thetaCam), THETA_MIN, Math.PI - THETA_MIN);
  const { rp } = horizons(o.a);
  o.rCam = clamp(num('rCam', o.rCam), rp + 0.25, 1000);
  o.phiCam = num('phiCam', o.phiCam);
  o.fovY = clamp(num('fovY', o.fovY), 1, 120);
  if (o.diskIn !== 'isco') o.diskIn = Math.max(0, num('diskIn', o.diskIn));
  o.diskOut = Math.max(0, num('diskOut', o.diskOut));
  o.prograde = !!o.prograde;
  if (!(o.quality in QUALITY_PRESETS)) throw new RangeError(`quality 'high' | 'mobile' olmalı (verilen: ${o.quality})`);
  o.maxDiskHits = clamp(Math.round(num('maxDiskHits', o.maxDiskHits)), 1, MAX_HITS);
  o.disk = !!o.disk;
  o.planeGuard = !!o.planeGuard;
  o.resolutionScale = clamp(num('resolutionScale', o.resolutionScale), 0.1, 1);
  o.maxPixelRatio = clamp(num('maxPixelRatio', o.maxPixelRatio), 0.5, 4);
  o.analyticFate = !!o.analyticFate;
  if (o.rEscape !== 'auto') o.rEscape = Math.max(10, num('rEscape', o.rEscape));
  if (o.kappa !== null) o.kappa = clamp(num('kappa', o.kappa), 0.005, 0.5);
  if (o.maxSteps !== null) o.maxSteps = clamp(Math.round(num('maxSteps', o.maxSteps)), 8, 8192);
  return o;
}

/**
 * Doğrulanmış parametrelerden shader'ın ihtiyaç duyduğu türetilmiş değerler (f64; yükleme sırasında f32'ye iner).
 * @param {object} p        normalizeParams çıktısı
 * @param {number} width    hedef genişliği (piksel)
 * @param {number} height   hedef yüksekliği (piksel)
 */
export function deriveUniforms(p, width, height) {
  const a = p.a;
  const { rp, rm } = horizons(a);
  const fr = zamoFrame(a, p.rCam, p.thetaCam);

  // Disk iç yarıçapı: 'isco' veya sayı. Dairesel yörünge modeli r > r_ph'de tanımlı; ISCO altı ESTETİK/ekstrapolasyon
  // (Kerr'de ISCO altı disk modeli yok — math/README §9): r_ph(yön) + 1e-3'ten aşağı kıstırılır.
  const isco = iscoRadius(1, a, p.prograde);
  const rPh = photonOrbitRadius(1, a, p.prograde);
  let rIn = p.diskIn === 'isco' ? isco : p.diskIn;
  rIn = Math.max(rIn, rPh + 1e-3, rp);

  const budget = recommendedGpuBudget(a, p.analyticFate);
  const preset = QUALITY_PRESETS[p.quality];
  const kappa = p.kappa ?? preset.kappa;
  // 'high': spine bağlı bütçe; 'mobile': sabit N=256. analyticFate=false iken 'high' N spine göre 512/1024/2048.
  const maxSteps = p.maxSteps ?? (p.quality === 'mobile' ? preset.maxSteps : budget.maxSteps);

  const tanHalfY = Math.tan((p.fovY * Math.PI) / 360);
  const tanHalfX = (tanHalfY * width) / height;

  return {
    resolution: [width, height],
    tanHalf: [tanHalfX, tanHalfY],
    cam: [p.rCam, p.thetaCam, p.phiCam],
    tetrad: [fr.lapse, fr.omega, fr.sqrtGphiphi, fr.sqrtSigma],
    a,
    a2: a * a,
    rp,
    rm,
    kappa,
    maxSteps,
    rEscape: p.rEscape === 'auto' ? Math.max(300, 2 * p.rCam) : p.rEscape,
    analyticFate: p.analyticFate ? 1 : 0,
    diskOn: p.disk && p.diskOut > rIn ? 1 : 0,
    planeGuard: p.planeGuard ? 1 : 0,
    maxDiskHits: p.maxDiskHits,
    rIn,
    rOut: p.diskOut,
    spinSign: p.prograde ? 1 : -1,
    // bilgi amaçlı
    isco,
    rPhoton: rPh,
  };
}
