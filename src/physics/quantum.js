/**
 * Yarı-klasik kuantum kara delik fiziği: Hawking sıcaklığı, Bekenstein–Hawking entropisi,
 * buharlaşma süresi, Planck birimleri.
 *
 * KONVANSİYONLAR
 *  - Bu modül SI birimleri döndürür (K, J/K, m, s, W, yıl). Geometrik (G = c = 1, uzunluk M) kısım yalnızca
 *    `surfaceGravityGeom` ve iç hesaplardadır: κ̂ M⁻¹ birimindedir (κ = κ̂ c³/(G M)).
 *  - Kütle argümanı güneş kütlesi M☉ cinsindendir; dönüşüm units.js'deki GM_SUN (IAU 2015 B3 nominal,
 *    G'den bağımsız) ile yapılır: G·M = massSolar · GM_SUN. T_H yalnızca G·M'e bağlıdır, dolayısıyla G'nin
 *    belirsizliği T_H'ye girmez; S ve buharlaşma süresi G'ye ayrıca bağlıdır (CODATA 2018 G).
 *  - Spin aStar = a/M ∈ [0, 1] (aStar = 1: ekstremal; T = 0). Negatif spin verilmez (ayna simetrisi).
 *  - Geçersiz girdi (kütle ≤ 0, sonlu olmayan sayı, aStar ∉ [0,1]) → RangeError. Sessiz NaN yok.
 *  - Tüm fonksiyonlar saf fonksiyondur. Her şey FİZİKSEL büyüklüktür (estetik etki yok).
 *  - YARI-KLASİK: sabit (arka plan) Kerr/Schwarzschild geometrisinde kuantum alan teorisi; geri-tepki (kütle
 *    kaybı) ve kuantum kütleçekimi düzeltmeleri YOKTUR; sonuçlar M ≫ Planck kütlesi için anlamlıdır.
 *
 * KAYNAKLAR
 *  [H74]  Hawking 1974, Nature 248, 30 — "Black hole explosions?".
 *  [H75]  Hawking 1975, Commun. Math. Phys. 43, 199 — "Particle creation by black holes".
 *  [B73]  Bekenstein 1973, Phys. Rev. D 7, 2333 — "Black holes and entropy".
 *  [BCH73] Bardeen, Carter & Hawking 1973, Commun. Math. Phys. 31, 161 — kara delik mekaniğinin dört yasası.
 *  [P76]  Page 1976, Phys. Rev. D 13, 198 — gri-cisim faktörlü, çok türlü emisyon (buharlaşma süresi düzeltmesi).
 *  [C18]  CODATA 2018 (Tiesinga vd. 2021, Rev. Mod. Phys. 93, 025010) — sabitler.
 *  [W]    Wien yer değiştirme sabiti b = 2.897771955×10⁻³ m·K (CODATA 2018, SI 2019 sabitlerinden türetilmiş).
 *
 * Bu oturumda sabitler ağdan yeniden doğrulanmadı (ağ erişimi yok); değerler yazarın bilgisinden alınmış ve
 * tam-tanımlı SI 2019 sabitlerinden (h, k_B, c) ya da CODATA 2018 önerilen G'sinden türetilmiştir.
 *
 * Ayrıntılar, sınırlamalar ve arayüz metinleri: docs/physics/quantum.md
 */

import { horizonRadii } from './kerr.js';
import { C, G_SI, GM_SUN, M_SUN_KG } from './units.js';

// ---------------------------------------------------------------------------
// Sabitler (SI)
// ---------------------------------------------------------------------------
const H_PLANCK = 6.62607015e-34; // J s (tam; SI 2019)
const K_B = 1.380649e-23; // J/K (tam; SI 2019)
const HBAR = H_PLANCK / (2 * Math.PI); // ≈ 1.054571817e-34 J s
const SIGMA = (2 * Math.PI ** 5 * K_B ** 4) / (15 * H_PLANCK ** 3 * C ** 2); // ≈ 5.670374419e-8 W m⁻² K⁻⁴
const WIEN_B = 2.897771955e-3; // m K
const T_CMB = 2.7255; // K (Fixsen 2009, ±0.0006)
const YEAR_S = 365.25 * 86400; // Jülyen yılı, s

/** Fiziksel sabitler (SI). units.js ile tutarlı: c ve G aynı nesnelerden alınır. */
export const PHYSICAL_CONSTANTS = Object.freeze({
  hbar: HBAR, // J s
  kB: K_B, // J/K
  sigma: SIGMA, // W m⁻² K⁻⁴
  G: G_SI, // m³ kg⁻¹ s⁻²
  c: C, // m/s
});

// ---------------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------------
function checkMassSolar(m) {
  if (!Number.isFinite(m) || !(m > 0)) {
    throw new RangeError(`Kütle sonlu ve > 0 olmalı (M☉ cinsinden; verilen: ${m})`);
  }
}

function checkSpin(aStar) {
  if (!Number.isFinite(aStar) || aStar < 0 || aStar > 1) {
    throw new RangeError(`aStar ∈ [0, 1] olmalı (verilen: ${aStar})`);
  }
}

// ---------------------------------------------------------------------------
// 1. Yüzey çekimi ve Hawking sıcaklığı
// ---------------------------------------------------------------------------

/**
 * Boyutsuz yüzey çekimi κ̂ = κ·GM/c³ [M⁻¹ birimi, G=c=1]:
 *   κ̂ = (r₊ − r₋) / (2 (r₊² + a²))   (M = 1)             [BCH73; Wald 1984, §12.5]
 * a=0: 1/4. a→1: κ̂ = √(1−a*²)/(2 r₊) → 0. Aynı sonuç: √(M²−a²)/(2 M r₊).
 * @param {number} aStar a/M ∈ [0,1]
 */
export function surfaceGravityGeom(aStar = 0) {
  checkSpin(aStar);
  const { rPlus, rMinus } = horizonRadii(1, aStar);
  return (rPlus - rMinus) / (2 * (rPlus * rPlus + aStar * aStar));
}

/**
 * Hawking sıcaklığı [K]: T_H = ħ c³ κ̂ / (2π k_B G M) = ħ c³ κ̂ / (2π k_B · (G M))  [H75].
 * Schwarzschild: T = ħc³/(8π G M k_B) ≈ 6.17×10⁻⁸ K (M☉/M). T ∝ 1/M.
 * Kerr: T → 0 (a* → 1). Sürekli, monoton azalan bir spin bağımlılığı: T(a*)/T(0) = 4κ̂(a*).
 * @param {number} massSolar kütle (M☉)
 * @param {number} aStar a/M ∈ [0,1]
 */
export function hawkingTemperatureK(massSolar, aStar = 0) {
  checkMassSolar(massSolar);
  const kappaHat = surfaceGravityGeom(aStar);
  const GM = massSolar * GM_SUN; // m³/s²
  return (HBAR * C ** 3 * kappaHat) / (2 * Math.PI * K_B * GM);
}

// ---------------------------------------------------------------------------
// 2. Entropi
// ---------------------------------------------------------------------------

/**
 * Bekenstein–Hawking entropisi [B73, H75]:  S = k_B A c³ / (4 G ħ),
 *   A = 4π (r₊² + a²) (GM/c²)²    (r₊, a: M biriminde; Kerr alanı [BCH73]).
 * S/k_B = π (r̂₊² + a*²) G M² /(ħ c).  a=0, 1 M☉: ≈ 1.05×10⁷⁷ k_B.
 * @returns {{S_over_kB:number, S_JK:number}} boyutsuz S/k_B ve S [J/K]
 */
export function bekensteinHawkingEntropy(massSolar, aStar = 0) {
  checkMassSolar(massSolar);
  checkSpin(aStar);
  const { rPlus } = horizonRadii(1, aStar);
  const areaHat = 4 * Math.PI * (rPlus * rPlus + aStar * aStar); // A / (GM/c²)²
  const GM = massSolar * GM_SUN;
  const rg = GM / (C * C); // m
  const area = areaHat * rg * rg; // m²
  const S_over_kB = (area * C ** 3) / (4 * G_SI * HBAR);
  return { S_over_kB, S_JK: S_over_kB * K_B };
}

// ---------------------------------------------------------------------------
// 3. Tayf
// ---------------------------------------------------------------------------

/**
 * Wien tepe dalga boyu λ_max = b / T_H [m] — KARA CİSİM varsayımıyla.
 * UYARI: gerçek Hawking spektrumu kara cisim DEĞİL, gri-cisimdir (her türün Γ_s(ω) soğurma
 * olasılığıyla çarpılmış Planck); tepe konumu kayar, düşük frekanslar bastırılır [H75, P76].
 * Kerr'de ek olarak spin terimi (ω − mΩ_H) gelir. Bu değer yalnızca mertebe göstergesidir.
 * aStar = 1 (T = 0) → RangeError (dalga boyu sonsuz).
 */
export function hawkingPeakWavelengthM(massSolar, aStar = 0) {
  const T = hawkingTemperatureK(massSolar, aStar);
  if (!(T > 0)) throw new RangeError('T_H = 0 (ekstremal): tepe dalga boyu tanımsız (∞)');
  return WIEN_B / T;
}

// ---------------------------------------------------------------------------
// 4. Buharlaşma
// ---------------------------------------------------------------------------

/**
 * Buharlaşma süresi (Schwarzschild). Basit tahmin (yalnız fotonlar, kara cisim, Stefan–Boltzmann):
 *   L = ħ c⁶ /(15360 π G² M²),  dM/dt = −L/c²  ⇒  t = 5120 π G² M³ / (ħ c⁴)   [H74/H75; Page 1976 girişi].
 * 1 M☉: ≈ 2.1×10⁶⁷ yıl. t ∝ M³.
 * NOT: Page (1976) düzeltmesi (gri-cisim faktörleri + nötrino + graviton) süreyi birkaç kat kısaltır
 * (mertebe aynı, 10⁶⁶–10⁶⁷ yıl); katsayısı bu oturumda KAYNAKTAN DOĞRULANAMADIĞI için burada verilmez.
 * @returns {{seconds:number, years:number, assumptions:string[]}}
 */
export function evaporationTimeS(massSolar) {
  checkMassSolar(massSolar);
  const GM = massSolar * GM_SUN; // G M
  // G²M³ = (GM)² · M ; M = massSolar·M_SUN_KG (= GM_SUN/G_SI)
  const M = massSolar * M_SUN_KG; // kg (G'ye bağımlı türetilmiş değer; (GM)²·M = G²M³)
  const seconds = (5120 * Math.PI * GM * GM * M) / (HBAR * C ** 4);
  return {
    seconds,
    years: seconds / YEAR_S,
    assumptions: [
      'Schwarzschild (dönmeyen, yüksüz) delik; spin ve yük yok sayıldı.',
      'Yalnızca fotonlar, Stefan–Boltzmann kara cisim yaklaşımı (gri-cisim faktörü yok): t = 5120 π G² M³/(ħ c⁴).',
      'Page (1976) düzeltmesi (nötrino ve graviton kanalları, gri-cisim faktörleri) süreyi birkaç kat kısaltır; ' +
        'bu katsayı doğrulanamadığı için dahil edilmedi. Mertebe ve M³ ölçeklemesi değişmez.',
      'Evrenin sıcaklığı (CMB, 2.7255 K) yok sayıldı: M ≳ 4.5×10²² kg olan delikler bugün buharlaşmaz, net soğurur; ' +
        'bu süre "yalnızca boşlukta, soğuk arka planda" geçerlidir.',
      'Yarı-klasik; M ≪ Planck kütlesine yakın ve son evrede (M ≲ 10¹⁷ g, ek parçacık türleri) geçersiz.',
      'Madde akresyonu, birleşmeler ve bilinmeyen ek parçacık türleri yok sayıldı.',
    ],
  };
}

/**
 * Hawking ışıma gücü, Stefan–Boltzmann kara cisim yaklaşımı (Schwarzschild):
 *   L = A σ T⁴ = ħ c⁶ /(15360 π G² M²),  A = 16π (GM/c²)².   [W]
 * YALNIZ MERTEBE GÖSTERGESİ: gerçek emisyon gri-cisimdir (Γ_s(ω) türe bağlı): düşük frekanslar bastırılır,
 * ama yüksek frekansta yakalama kesiti 27πM² > 16πM² olduğundan toplam güç kara cisimden büyük de olabilir;
 * nötrino/graviton gibi ek türler gücü artırır. Yönü kesin değildir (belirsizlik birkaç kat). 1 M☉: ≈ 9×10⁻²⁹ W.
 */
export function hawkingLuminosityW(massSolar) {
  const T = hawkingTemperatureK(massSolar, 0);
  const rg = (massSolar * GM_SUN) / (C * C);
  const area = 16 * Math.PI * rg * rg;
  return area * SIGMA * T ** 4;
}

/**
 * T_H = T_CMB (2.7255 K) olan Schwarzschild kütlesi [M☉]:  M = ħ c³ /(8π G k_B T_CMB).
 * ≈ 4.5×10²² kg ≈ 0.6 Ay kütlesi (Ay = 7.342×10²² kg). Bundan büyük delikler bugün net soğurur.
 * (G·M üzerinden M☉'ya çevrilir: M[M☉] = (ħc³/(8π k_B T)) / GM_SUN.)
 */
export function cmbEquilibriumMassSolar() {
  const GM = (HBAR * C ** 3) / (8 * Math.PI * K_B * T_CMB); // m³/s²
  return GM / GM_SUN;
}

// ---------------------------------------------------------------------------
// 5. Planck birimleri
// ---------------------------------------------------------------------------

/**
 * Planck birimleri (SI) [C18]:
 *   ℓ_P = √(ħG/c³) ≈ 1.616255×10⁻³⁵ m,  t_P = ℓ_P/c ≈ 5.391247×10⁻⁴⁴ s,
 *   m_P = √(ħc/G) ≈ 2.176434×10⁻⁸ kg,   T_P = m_P c²/k_B ≈ 1.416784×10³² K.
 */
export function planckUnits() {
  const lengthM = Math.sqrt((HBAR * G_SI) / C ** 3);
  const massKg = Math.sqrt((HBAR * C) / G_SI);
  return {
    lengthM,
    timeS: lengthM / C,
    massKg,
    temperatureK: (massKg * C * C) / K_B,
  };
}
