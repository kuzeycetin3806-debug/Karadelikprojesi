/**
 * Birim dönüşümleri: geometrik birimler (G = c = 1, uzunluk/zaman birimi M) ↔ SI/km/s.
 *
 * SABİTLER VE KAYNAKLAR
 *  - C        = 299 792 458 m/s (tam; SI 2019 tanımı).
 *  - GM_SUN   = 1.3271244×10²⁰ m³/s² — IAU 2015 Çözünürlük B3 "nominal" güneş kütle parametresi
 *               (tam tanımlı değer). G'nin belirsizliği (~2×10⁻⁵ bağıl) GM_SUN'a girmez; bu yüzden
 *               tüm dönüşümler G·M_sun yerine doğrudan GM_SUN kullanır.
 *  - G_SI     = 6.67430×10⁻¹¹ m³ kg⁻¹ s⁻² — CODATA 2018 önerilen değer (u = 1.5×10⁻¹⁵).
 *  - M_SUN_KG = GM_SUN / G_SI ≈ 1.98841×10³⁰ kg (TÜRETİLMİŞ; G belirsizliğini taşır,
 *               dönüşümlerde kullanılmaz, yalnızca bilgi amaçlı).
 *
 * Bu sabitler bu oturumda ağ üzerinden yeniden doğrulanmadı; kaynak değerler yazarın bilgisinden
 * alınmıştır (kullanım öncesi IAU 2015 B3 / CODATA tablosundan teyit edilmesi önerilir).
 *
 * Tüm "solarMasses" argümanları güneş kütlesi cinsindendir (GM_SUN ile ölçeklenir).
 */

export const C = 299792458; // m/s (tam)
export const G_SI = 6.6743e-11; // m³ kg⁻¹ s⁻² (CODATA 2018)
export const GM_SUN = 1.3271244e20; // m³ s⁻² (IAU 2015 B3 nominal)
export const M_SUN_KG = GM_SUN / G_SI; // kg (türetilmiş)

function checkSolarMass(solarMasses) {
  if (!Number.isFinite(solarMasses) || !(solarMasses > 0)) {
    throw new RangeError(`Kütle sonlu ve > 0 olmalı (güneş kütlesi cinsinden; verilen: ${solarMasses})`);
  }
}

/** Uzunluk birimi GM/c² (km). 1 M_sun için ≈ 1.4766 km. */
export function gravitationalRadiusKm(solarMasses = 1) {
  checkSolarMass(solarMasses);
  return (solarMasses * GM_SUN) / (C * C) / 1e3;
}

/** Schwarzschild yarıçapı r_s = 2GM/c² (km). 1 M_sun için ≈ 2.9532 km. */
export function schwarzschildRadiusKm(solarMasses = 1) {
  return 2 * gravitationalRadiusKm(solarMasses);
}

/** Zaman birimi GM/c³ (saniye). 1 M_sun için ≈ 4.9255×10⁻⁶ s. */
export function timeUnitSeconds(solarMasses = 1) {
  checkSolarMass(solarMasses);
  return (solarMasses * GM_SUN) / (C * C * C);
}

/** Geometrik uzunluk (M cinsinden, örn. r/M) → km. */
export function lengthToKm(lengthInM, solarMasses = 1) {
  if (!Number.isFinite(lengthInM)) throw new RangeError(`Uzunluk sonlu olmalı (verilen: ${lengthInM})`);
  return lengthInM * gravitationalRadiusKm(solarMasses);
}

/** km → geometrik uzunluk (M cinsinden). */
export function kmToLength(km, solarMasses = 1) {
  if (!Number.isFinite(km)) throw new RangeError(`km sonlu olmalı (verilen: ${km})`);
  return km / gravitationalRadiusKm(solarMasses);
}

/** Geometrik zaman (M cinsinden) → saniye. */
export function timeToSeconds(timeInM, solarMasses = 1) {
  if (!Number.isFinite(timeInM)) throw new RangeError(`Zaman sonlu olmalı (verilen: ${timeInM})`);
  return timeInM * timeUnitSeconds(solarMasses);
}

/** Saniye → geometrik zaman (M cinsinden). */
export function secondsToTime(seconds, solarMasses = 1) {
  if (!Number.isFinite(seconds)) throw new RangeError(`Saniye sonlu olmalı (verilen: ${seconds})`);
  return seconds / timeUnitSeconds(solarMasses);
}

/**
 * Bilgi ekranı için örnek kütleler (güneş kütlesi cinsinden, YAKLAŞIK; belirsizlik ciddidir).
 *  - Sgr A*: ≈ 4.30×10⁶ (GRAVITY Collab. 2021, A&A 647, A59: 4.297±0.012 ×10⁶, uzaklık belirsizliğine bağlı).
 *  - M87*:   ≈ 6.5×10⁹ (EHT Collab. 2019, ApJL 875, L6: 6.5±0.7 ×10⁹).
 */
export const REFERENCE_MASSES = Object.freeze({
  sgrAStar: 4.297e6,
  m87Star: 6.5e9,
});
