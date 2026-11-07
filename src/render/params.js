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
export const AXIS_KAPPA = 0.15; // eksen koruması göreli adım katsayısı κ_a (trace.glsl)
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
  rEscape: 'auto', // 'auto' = max(300, 2·rCam, 6·b_max) veya sayı
  kappa: null, // null: kaliteden; sayı: elle geçersiz kıl (test/ayar)
  maxSteps: null, // null: kaliteden/spine bağlı bütçeden; sayı: elle geçersiz kıl
  axisGuard: true, // 4b: kutup ekseni yakınında adım koruması (görsel mod; debug yolunda varsayılan KAPALI). README §Eksen koruması
  planeGuard: true, // YALNIZ TEST: false ⇒ θ_cam=π/2 bant koruması kapalı (negatif kontrol); üretimde hep true

  // --- Adım 4b — FİZİKSEL disk ışıması (docs/physics/disk.md §4.3)
  Tmax: 1e4, // K; T_eff(r) = Tmax · τ(r)  (Page–Thorne profili; tepe değer)
  fCol: 1, // renk düzeltmesi f_col (T_col = f_col T_eff); yıldız kütleli BH için ~1.7 (SH95)
  brightnessMode: 'band', // 'band' (mod B, band-fotometrik: Y(T_obs)/Y_ref · f_col⁻⁴) | 'bolometric' (mod A: (g τ)⁴)

  // --- Adım 4b — görüntü hattı (HDR → ESTETİK sonrası işlem)
  exposure: 0.5, // doğrusal çarpan (HDR radyans ölçeği; ton eşlemeden önce). Disk tepe Y_ref = 1; 0.5 ⇒ medyan disk ≈ orta gri, tepe doymaz
  tonemap: 'aces', // ESTETİK: 'aces' | 'agx' | 'neutral' | 'none' (none = yalnız [0,1] kırpma)
  bloom: true, // ESTETİK
  bloomStrength: 0.2, // ESTETİK: eklenen bloom / sahne oranı (pozlama sonrası, ton eşleme öncesi)
  bloomRadius: 0.7, // ESTETİK: 0–1, üst seviyelerin ağırlığı (büyük = geniş hale)

  // --- Adım 4b — ESTETİK öğeler
  turbulence: true, // ESTETİK: disk ışımasında ince ölçekli türbülans dokusu
  turbulenceAmp: 0.3, // 0–1
  turbulenceScale: 1.0, // M; en büyük hücre boyu
  animate: true, // türbülans yerel Kepler dönüşüyle akar (sürekli render gerektirir)
  timeScale: 20, // M/s (animasyon hızı)
  diskTime: null, // null: gerçek zaman; sayı: sabit zaman (M) — test/anlık görüntü
  diskEdgeFade: 0.1, // ESTETİK: dış kenar yumuşatma (disk genişliğinin kesri; 0 = sert kenar)
  stars: true, // yıldız alanı (ESTETİK dağılım; renkler kara cisim)
  starBrightness: 1, // ESTETİK ölçek
  milkyWay: 0.6, // ESTETİK Samanyolu bandı şiddeti (0 = yok)

  // --- Adım 4b — performans / etkileşim
  performance: 'balanced', // 'quality' | 'balanced' | 'battery' (PERFORMANCE_PRESETS)
  progressive: true, // durağan karede jitter'lı kare biriktirme (anti-aliasing)
  interactionScale: null, // null: ön ayardan; hareket sırasında çözünürlük çarpanı
  accumFrames: null, // null: ön ayardan; biriktirilecek kare sayısı
  animationFps: null, // null: ön ayardan; animasyonda en çok kare/sn
  dynamicResolution: null, // null: ön ayardan; kare süresine göre otomatik çözünürlük
});

/**
 * Performans modları (animasyon/etkileşim ↔ pil/GPU dengesi). null olan alanlar ön ayardan gelir.
 *   interactionScale : sürükleme/parametre değişimi sırasında iz sürme çözünürlük çarpanı
 *   settleMs         : son değişimden bu kadar ms sonra tam çözünürlüğe dönülür
 *   accumFrames      : durağan karede biriktirilecek jitter'lı kare sayısı (progressive)
 *   animationFps     : türbülans animasyonu açıkken en çok kare/sn
 *   dynamicResolution, minDynamicScale, maxDynamicScale : kare süresi hedefi tutmazsa çözünürlüğü otomatik düşür
 */
export const PERFORMANCE_PRESETS = Object.freeze({
  quality: { interactionScale: 0.6, settleMs: 150, accumFrames: 16, animationFps: 60, dynamicResolution: false, minDynamicScale: 0.5, maxDynamicScale: 1 },
  balanced: { interactionScale: 0.5, settleMs: 150, accumFrames: 8, animationFps: 30, dynamicResolution: true, minDynamicScale: 0.35, maxDynamicScale: 1 },
  battery: { interactionScale: 0.35, settleMs: 120, accumFrames: 4, animationFps: 15, dynamicResolution: true, minDynamicScale: 0.3, maxDynamicScale: 0.7 },
});

export const TONEMAPS = Object.freeze(['aces', 'agx', 'neutral', 'none']);
export const BRIGHTNESS_MODES = Object.freeze(['band', 'bolometric']);
/** Disk animasyonunun periyodu (M). Akış-haritası çift fazlı olduğundan desen tam T_PERIOD'da yinelenir (shader ile aynı). */
export const TURB_PERIOD = 50;

/** Yalnız sonradan işleme (iz sürme gerektirmez): değişince yalnız bloom+kompozit yeniden çalışır. */
export const POST_ONLY_KEYS = Object.freeze(['exposure', 'tonemap', 'bloom', 'bloomStrength', 'bloomRadius']);
/** Değişince iz sürmeyi yeniden çalıştırmayan ama hedef/boyut etkileyen anahtarlar (etkileşim sayılmaz). */
export const NON_INTERACTIVE_KEYS = Object.freeze([
  'quality', 'resolutionScale', 'maxPixelRatio', 'performance', 'progressive', 'interactionScale', 'accumFrames', 'animationFps',
  'dynamicResolution', 'kappa', 'maxSteps', 'analyticFate', 'rEscape', 'planeGuard', 'maxDiskHits', 'axisGuard',
]);

/** Ön ayar + elle geçersiz kılmalarla etkin performans ayarı. */
export function effectivePerformance(p) {
  const pre = PERFORMANCE_PRESETS[p.performance];
  return {
    interactionScale: p.interactionScale ?? pre.interactionScale,
    settleMs: pre.settleMs,
    accumFrames: p.progressive ? (p.accumFrames ?? pre.accumFrames) : 1,
    animationFps: p.animationFps ?? pre.animationFps,
    dynamicResolution: p.dynamicResolution ?? pre.dynamicResolution,
    minDynamicScale: pre.minDynamicScale,
    maxDynamicScale: pre.maxDynamicScale,
  };
}

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
  o.axisGuard = !!o.axisGuard;
  o.resolutionScale = clamp(num('resolutionScale', o.resolutionScale), 0.1, 1);
  o.maxPixelRatio = clamp(num('maxPixelRatio', o.maxPixelRatio), 0.5, 4);
  o.analyticFate = !!o.analyticFate;
  if (o.rEscape !== 'auto') o.rEscape = Math.max(10, num('rEscape', o.rEscape));
  if (o.kappa !== null) o.kappa = clamp(num('kappa', o.kappa), 0.005, 0.5);
  if (o.maxSteps !== null) o.maxSteps = clamp(Math.round(num('maxSteps', o.maxSteps)), 8, 8192);

  // --- 4b
  o.Tmax = clamp(num('Tmax', o.Tmax), 2000, 1e6);
  o.fCol = clamp(num('fCol', o.fCol), 1, 3);
  if (!BRIGHTNESS_MODES.includes(o.brightnessMode)) throw new RangeError(`brightnessMode 'band' | 'bolometric' olmalı (verilen: ${o.brightnessMode})`);
  o.exposure = clamp(num('exposure', o.exposure), 1e-3, 1e3);
  if (!TONEMAPS.includes(o.tonemap)) throw new RangeError(`tonemap ${TONEMAPS.join(' | ')} olmalı (verilen: ${o.tonemap})`);
  o.bloom = !!o.bloom;
  o.bloomStrength = clamp(num('bloomStrength', o.bloomStrength), 0, 2);
  o.bloomRadius = clamp(num('bloomRadius', o.bloomRadius), 0, 1);
  o.turbulence = !!o.turbulence;
  o.turbulenceAmp = clamp(num('turbulenceAmp', o.turbulenceAmp), 0, 1);
  o.turbulenceScale = clamp(num('turbulenceScale', o.turbulenceScale), 0.2, 10);
  o.animate = !!o.animate;
  o.timeScale = clamp(num('timeScale', o.timeScale), 0, 200);
  if (o.diskTime !== null) o.diskTime = num('diskTime', o.diskTime);
  o.diskEdgeFade = clamp(num('diskEdgeFade', o.diskEdgeFade), 0, 0.5);
  o.stars = !!o.stars;
  o.starBrightness = clamp(num('starBrightness', o.starBrightness), 0, 10);
  o.milkyWay = clamp(num('milkyWay', o.milkyWay), 0, 2);
  if (!(o.performance in PERFORMANCE_PRESETS)) throw new RangeError(`performance 'quality' | 'balanced' | 'battery' olmalı (verilen: ${o.performance})`);
  o.progressive = !!o.progressive;
  if (o.interactionScale !== null) o.interactionScale = clamp(num('interactionScale', o.interactionScale), 0.1, 1);
  if (o.accumFrames !== null) o.accumFrames = clamp(Math.round(num('accumFrames', o.accumFrames)), 1, 64);
  if (o.animationFps !== null) o.animationFps = clamp(num('animationFps', o.animationFps), 5, 120);
  if (o.dynamicResolution !== null) o.dynamicResolution = !!o.dynamicResolution;
  return o;
}

/**
 * Doğrulanmış parametrelerden shader'ın ihtiyaç duyduğu türetilmiş değerler (f64; yükleme sırasında f32'ye iner).
 * @param {object} p        normalizeParams çıktısı
 * @param {number} width    hedef genişliği (piksel)
 * @param {number} height   hedef yüksekliği (piksel)
 * @param {number} [canvasHeight]  nihai tuval yüksekliği (piksel; yıldız PSF boyu için — iz sürme çözünürlüğünden bağımsız)
 */
export function deriveUniforms(p, width, height, canvasHeight = height) {
  const a = p.a;
  const { rp, rm } = horizons(a);
  const fr = zamoFrame(a, p.rCam, p.thetaCam);

  // Disk iç yarıçapı: 'isco' veya sayı. Dairesel yörünge modeli r > r_ph'de tanımlı; ISCO altı ESTETİK/ekstrapolasyon
  // (Kerr'de ISCO altı disk modeli yok — math/README §9): r_ph(yön) + 1e-3'ten aşağı kıstırılır.
  const isco = iscoRadius(1, a, p.prograde);
  const rPh = photonOrbitRadius(1, a, p.prograde);
  let rIn = p.diskIn === 'isco' ? isco : p.diskIn;
  // 4b: ISCO altında Page–Thorne ışıması YOK (sıfır tork modeli; disk.md §1.1) ⇒ iç yarıçap ISCO'dan küçük olamaz.
  rIn = Math.max(rIn, isco, rPh + 1e-3, rp);

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
    // 'auto': max(300, 2 r_cam, 6 b_max); b_max = r_cam·tan(yarı-köşegen açı) ekrandaki en büyük çarpma parametresi.
    // Kaçış yönü kesme hatası ≈ (b/r_esc)³ rad: geniş görüş açılı uzak kamerada (b ~ r_esc) büyür; terim yalnız o durumda devreye girer.
    rEscape: p.rEscape === 'auto' ? Math.max(300, 2 * p.rCam, 6 * p.rCam * Math.hypot(tanHalfX, tanHalfY)) : p.rEscape,
    analyticFate: p.analyticFate ? 1 : 0,
    diskOn: p.disk && p.diskOut > rIn ? 1 : 0,
    planeGuard: p.planeGuard ? 1 : 0,
    axisKappa: p.axisGuard ? AXIS_KAPPA : 0,
    maxDiskHits: p.maxDiskHits,
    rIn,
    rOut: p.diskOut,
    spinSign: p.prograde ? 1 : -1,
    // --- 4b
    turbAmp: p.disk && p.turbulence ? p.turbulenceAmp : 0,
    turbScale: p.turbulenceScale,
    edgeFade: p.diskEdgeFade,
    starsOn: p.stars ? 1 : 0,
    starBrightness: p.starBrightness,
    milkyWay: p.milkyWay,
    // yıldız PSF'i: ekran uzayında ~0.65 piksel (nihai tuval pikseli), gökte radyan olarak
    starSigma: 0.65 * ((2 * tanHalfY) / Math.max(1, canvasHeight)),
    // bilgi amaçlı
    isco,
    rPhoton: rPh,
  };
}
