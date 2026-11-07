/**
 * İnce akresyon diski ışıma fiziği — Novikov–Thorne / Page–Thorne modeli, sıcaklık ölçeği,
 * gözlenen kara cisim rengi.
 *
 * KONVANSİYONLAR
 *  - Boyutsuz/geometrik kısımlar: G = c = 1, uzunluk M cinsinden (kerr.js ile aynı). `M` ilk argümandır,
 *    r ve a uzunluk birimindedir (a = a*·M); iç hesap r̂ = r/M, a* = a/M ile yapılır.
 *  - Ṁ = 1 normalizasyonu: pageThorneFlux, Ṁ (geometrik birim, kütle/zaman = boyutsuz) = 1 için
 *    yerel akıyı verir:  F = Ṁ · F̂(r̂, a*) / M²,  F̂ boyutsuz (pageThorneFluxHat).
 *    SI'ye çevirme:  F_SI [W/m²] = Ṁ_SI c² · F̂ / r_g²,  r_g = GM/c².
 *  - prograde=true: disk delikle aynı yönde döner (a>0). prograde=false: retrograd disk (a>0 delik,
 *    ters dönen disk); iç hesapta a* → −a* (yönü çevir) ile prograd formüllerine indirgenir.
 *  - Fiziksel/estetik ayrımı: bu dosyadaki her şey FİZİKSELDİR (renk eşleme/gamut işlemi hariç:
 *    gamut-dışı desaturasyon bir GÖSTERİM kararıdır, "estetik" olarak işaretlenmiştir).
 *  - Geçersiz girdi → RangeError (sessiz NaN yok).
 *
 * KAYNAKLAR
 *  [PT74] Page & Thorne 1974, ApJ 191, 499 — relativistik ince disk akısı (yerel akı tanımı ~eq. 11, kapalı form ~eq. 15n).
 *         UYARI: denklem NUMARALARI belleğe dayalıdır, makaleden teyit edilmedi; FORMÜLÜN KENDİSİ ise
 *         tanım integraline (kuadratür) ve enerji korunumuna karşı sayısal olarak doğrulandı (disk.test.mjs).
 *  [NT73] Novikov & Thorne 1973, "Astrophysics of black holes", Les Houches.
 *  [SS73] Shakura & Sunyaev 1973, A&A 24, 337 — göreli olmayan limit.
 *  [BPT72] Bardeen, Press & Teukolsky 1972, ApJ 178, 347 — dairesel yörünge E, L, Ω; E_isco.
 *  [T74]  Thorne 1974, ApJ 191, 507 — a* = 0.998 sınırı, verim.
 *  [W13]  Wyman, Sloan & Shirley 2013, JCGT 2(2), 1–11 — CIE 1931 CMF çok-loblu Gauss yaklaşımı.
 *  [CIE31] CIE 1931 2° standart gözlemci; [IEC 61966-2-1] sRGB (D65) matrisi.
 *  [SH95] Shimura & Takahara 1995, ApJ 445, 780 — renk düzeltme faktörü f_col ≈ 1.7.
 *
 * Ayrıntılı türetimler, sınırlamalar: docs/physics/disk.md
 */

import { iscoRadius } from './kerr.js';
import { C, GM_SUN } from './units.js';

// ---------------------------------------------------------------------------
// Sabitler (SI) — h, k_B, c: SI 2019 (tam). m_p, σ_T: CODATA 2018 (bu oturumda ağdan teyit edilmedi).
// ---------------------------------------------------------------------------
export const H_PLANCK = 6.62607015e-34; // J s (tam)
export const K_BOLTZMANN = 1.380649e-23; // J/K (tam)
export const SIGMA_SB = (2 * Math.PI ** 5 * K_BOLTZMANN ** 4) / (15 * H_PLANCK ** 3 * C ** 2); // ≈5.670374e-8 W m⁻² K⁻⁴
export const M_PROTON = 1.67262192369e-27; // kg (CODATA 2018)
export const SIGMA_THOMSON = 6.6524587321e-29; // m² (CODATA 2018)
/** Desteklenen en büyük prograd spin a* (üstünde x₁≈x₂ ve r_isco→r₊ nedeniyle kapalı form kötü koşullu). */
export const A_STAR_MAX_PRO = 0.9999;

// ---------------------------------------------------------------------------
// Doğrulama yardımcıları
// ---------------------------------------------------------------------------
function checkFinite(name, x) {
  if (!Number.isFinite(x)) throw new RangeError(`${name} sonlu olmalı (verilen: ${x})`);
}

/** Boyutsuz spin kontrolü; işaretli iç spin a_s = ±a* döner. */
function signedSpin(aStar, prograde) {
  checkFinite('a*', aStar);
  if (aStar < 0 || aStar > 1) {
    throw new RangeError(`0 ≤ a* ≤ 1 olmalı (ters dönüş için prograde=false kullanın; verilen: ${aStar})`);
  }
  if (prograde && aStar > A_STAR_MAX_PRO) {
    throw new RangeError(
      `Prograd disk için a* ≤ ${A_STAR_MAX_PRO} desteklenir (verilen: ${aStar}): a*→1'de r_isco→r₊ ve ` +
        `Page–Thorne kökleri x₁=x₂ çakışır (kapalı form tekil); Thorne sınırı 0.998 zaten bunun altındadır [T74].`
    );
  }
  return prograde ? aStar : -aStar;
}

function checkMass(M) {
  if (!Number.isFinite(M) || !(M > 0)) throw new RangeError(`M sonlu ve > 0 olmalı (verilen: ${M})`);
}

// ---------------------------------------------------------------------------
// Gauss–Legendre (16 nokta) — referans/yedek kuadratür için
// ---------------------------------------------------------------------------
const GL_N = 16;
const GL = (() => {
  const xs = new Array(GL_N);
  const ws = new Array(GL_N);
  for (let i = 0; i < GL_N; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (GL_N + 0.5));
    let pp = 1;
    for (let it = 0; it < 100; it++) {
      let p1 = 1;
      let p2 = 0;
      for (let j = 0; j < GL_N; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * j + 1) * z * p2 - j * p3) / (j + 1);
      }
      pp = (GL_N * (z * p1 - p2)) / (z * z - 1);
      const z1 = z;
      z = z1 - p1 / pp;
      if (Math.abs(z - z1) < 1e-15) break;
    }
    xs[i] = z;
    ws[i] = 2 / ((1 - z * z) * pp * pp);
  }
  return { xs, ws };
})();

/** ∫_lo^hi f(x) dx, `panels` eşit panelde 16-nokta Gauss–Legendre. */
function integrateGL(f, lo, hi, panels = 1) {
  let sum = 0;
  const w = (hi - lo) / panels;
  for (let p = 0; p < panels; p++) {
    const a0 = lo + p * w;
    const h = 0.5 * w;
    const c = a0 + h;
    let s = 0;
    for (let i = 0; i < GL_N; i++) s += GL.ws[i] * f(c + h * GL.xs[i]);
    sum += s * h;
  }
  return sum;
}

// ---------------------------------------------------------------------------
// 1. Page–Thorne akısı
// ---------------------------------------------------------------------------

/**
 * Dairesel ekvatoral yörünge büyüklükleri, x = √r̂ ve işaretli spin a_s (M=1) cinsinden [BPT72 eq. 2.12–2.16]:
 *   P = x³ − 3x + 2a_s,   E = (x³ − 2x + a_s)/(x^{3/2}√P),   L = (x⁴ − 2a_s x + a_s²)/(x^{3/2}√P),
 *   Ω = 1/(x³ + a_s),     dL/dx analitik.
 * (kerr.js'teki circularOrbit* ile aynı; testte kerr.js'e karşı doğrulanır.)
 */
function orbitX(aS, x) {
  const P = x * x * x - 3 * x + 2 * aS;
  const sP = Math.sqrt(P);
  const x32 = x * Math.sqrt(x);
  const N = x ** 4 - 2 * aS * x + aS * aS;
  const E = (x * x * x - 2 * x + aS) / (x32 * sP);
  const L = N / (x32 * sP);
  const dN = 4 * x * x * x - 2 * aS;
  // dL/dx = [N' x P − (3/2) N P − (1/2) N x P'] / (x^{5/2} P^{3/2}),  P' = 3x² − 3
  const Lx = (dN * x * P - 1.5 * N * P - 0.5 * N * x * (3 * x * x - 3)) / (x * x32 * P * sP);
  const Om = 1 / (x * x * x + aS);
  return { E, L, Lx, Om, P };
}

/**
 * Page–Thorne kökleri: x³ − 3x + 2a_s = 0 [PT74, 15n ile birlikte]
 *   x₁ = 2cos[(arccos a_s − π)/3],  x₂ = 2cos[(arccos a_s + π)/3],  x₃ = −2cos[(arccos a_s)/3].
 * (a_s = 0: 0, ±√3.)  Not: x₁+x₂+x₃ = 0, x₁x₂x₃ = −2a_s.
 */
export function pageThorneRoots(aSigned) {
  checkFinite('a_s', aSigned);
  if (Math.abs(aSigned) > 1) throw new RangeError(`|a_s| ≤ 1 olmalı (verilen: ${aSigned})`);
  const ac = Math.acos(aSigned);
  return {
    x1: 2 * Math.cos((ac - Math.PI) / 3),
    x2: 2 * Math.cos((ac + Math.PI) / 3),
    x3: -2 * Math.cos(ac / 3),
  };
}

/**
 * Kapalı formun GPU'ya aktarılabilir sabitleri (aşağıdaki f̂ formülüyle birlikte):
 *   {aS, x0, x1,x2,x3, c1,c2,c3},  c_i = 3(x_i − a_s)² / [x_i (x_i − x_j)(x_i − x_k)].
 * x_i = 0 (a_s = 0'da x₂) için limit c_i = 0 alınır.
 */
export function pageThorneClosedFormCoefficients(aStar, prograde = true) {
  const aS = signedSpin(aStar, prograde);
  const x0 = Math.sqrt(iscoRadius(1, aStar, prograde));
  const { x1, x2, x3 } = pageThorneRoots(aS);
  const coef = (xi, xj, xk) =>
    xi === 0 ? 0 : (3 * (xi - aS) * (xi - aS)) / (xi * (xi - xj) * (xi - xk));
  return { aS, x0, x1, x2, x3, c1: coef(x1, x2, x3), c2: coef(x2, x3, x1), c3: coef(x3, x1, x2) };
}

/**
 * f̂ = M·f  (PT74 ~eq. 15n, Ṁ=1):  F̂ = f̂ / (4π r̂),  r̂ = x².
 *   f̂ = 3/(2 x² (x³ − 3x + 2a_s)) · [ x − x₀ − (3/2) a_s ln(x/x₀)
 *         − Σ_i c_i ln((x − x_i)/(x₀ − x_i)) ],        x₀ = √r̂_isco.
 */
function fHatClosed(co, x) {
  const { aS, x0, x1, x2, x3, c1, c2, c3 } = co;
  const br =
    x -
    x0 -
    1.5 * aS * Math.log(x / x0) -
    c1 * Math.log((x - x1) / (x0 - x1)) -
    c2 * Math.log((x - x2) / (x0 - x2)) -
    c3 * Math.log((x - x3) / (x0 - x3));
  return (1.5 / (x * x * (x * x * x - 3 * x + 2 * aS))) * br;
}

/**
 * f̂ doğrudan tanımdan [PT74 ~eq. 11]:  f = (−Ω,r) (E − ΩL)⁻² ∫_{r_isco}^{r} (E − ΩL) L,r dr
 * (sıfır-tork iç sınır koşulu: integral r_isco'da başlar). x = √r değişkeninde kuadratür.
 * Kapalı formdan BAĞIMSIZ referans; ISCO yakınında iptal hatasına karşı yedek olarak da kullanılır.
 */
function fHatQuadrature(aS, x, x0, panels) {
  const integral = integrateGL(
    (xi) => {
      const o = orbitX(aS, xi);
      return (o.E - o.Om * o.L) * o.Lx;
    },
    x0,
    x,
    panels
  );
  const o = orbitX(aS, x);
  const OmR = (-3 * x * x) / (x * x * x + aS) ** 2 / (2 * x); // dΩ/dr = (dΩ/dx)/(2x)
  const d = o.E - o.Om * o.L;
  return (-OmR / (d * d)) * integral;
}

/**
 * Boyutsuz Page–Thorne yerel akısı F̂(r̂; a*), Ṁ=1 ve M=1 birimlerinde (F = Ṁ F̂ / M²).
 * Bir YÜZEYDEN (disk iki yüzlüdür) enerji akısı, yayıcı ile birlikte dönen çerçevede [PT74 ~eq. 11]:
 *   F = Ṁ f /(4π r),   [e^{ν+ψ+μ} = r, ekvatorda; test: induced metrik determinantı]
 * kapalı form PT74 ~eq. 15n (bkz. fHatClosed). r ≤ r_isco → 0 (ISCO altında emisyon yok; sıfır tork).
 * ISCO'ya (x−x₀ < 2·10⁻³ x₀) çok yakın yerde iptal hatasını önlemek için tek-panel kuadratür kullanılır.
 * Doğruluk (f64): kapalı form vs. bağımsız kuadratür ≲ 1e-13 (r/r_isco ≥ 1.01), a* ≤ 0.998.
 * Limitler: r ≫ r_isco → 3(1−√(r_isco/r))/(8π r³) [SS73]; F̂(r_isco) = 0, F̂ ∝ (r − r_isco)² civarında.
 * @param {number} aStar 0 ≤ a/M ≤ 1 (prograd için ≤ 0.9999)
 * @param {number} rHat  r/M
 * @param {boolean} prograde
 */
export function pageThorneFluxHat(aStar, rHat, prograde = true) {
  const aS = signedSpin(aStar, prograde);
  checkFinite('r/M', rHat);
  if (!(rHat > 0)) throw new RangeError(`r/M > 0 olmalı (verilen: ${rHat})`);
  const rIsco = iscoRadius(1, aStar, prograde);
  if (rHat <= rIsco) return 0;
  const x = Math.sqrt(rHat);
  const x0 = Math.sqrt(rIsco);
  let f;
  if (x - x0 < 2e-3 * x0) {
    f = fHatQuadrature(aS, x, x0, 1);
  } else {
    f = fHatClosed(pageThorneClosedFormCoefficients(aStar, prograde), x);
  }
  return f / (4 * Math.PI * rHat);
}

/** Aynı F̂, ama yalnızca kuadratürle (referans; `panels` panel × 16 nokta). Testler/doğrulama için. */
export function pageThorneFluxHatQuadrature(aStar, rHat, prograde = true, panels = 64) {
  const aS = signedSpin(aStar, prograde);
  checkFinite('r/M', rHat);
  const rIsco = iscoRadius(1, aStar, prograde);
  if (rHat <= rIsco) return 0;
  const x = Math.sqrt(rHat);
  const x0 = Math.sqrt(rIsco);
  return fHatQuadrature(aS, x, x0, panels) / (4 * Math.PI * rHat);
}

/**
 * Page & Thorne (1974) yerel akısı F(r), Ṁ = 1 (geometrik birim), G=c=1: F = F̂(r/M, a/M)/M².
 * Birim: [Ṁ]/[uzunluk]². SI'ye: F_SI = Ṁ_SI c² F̂ / r_g² (bkz. diskMaxTemperatureK).
 * Bir yüz için, yayıcı ile birlikte dönen (comoving) çerçevede ölçülen enerji akısı (enerji/zaman/alan).
 * @param {number} M kütle (geometrik uzunluk birimi)
 * @param {number} a spin (uzunluk), 0 ≤ a ≤ M
 * @param {number} r yarıçap (BL, uzunluk)
 */
export function pageThorneFlux(M = 1, a = 0, r, prograde = true) {
  checkMass(M);
  checkFinite('a', a);
  return pageThorneFluxHat(a / M, r / M, prograde) / (M * M);
}

// ---------------------------------------------------------------------------
// Enerji bütçesi / verim
// ---------------------------------------------------------------------------

/** E_isco = √(1 − 2/(3 r̂_isco)) [BPT72 eq. 2.23] — tüm a* için (a*=1 prograd dahil, kerr.js bunu atar). */
export function iscoSpecificEnergy(aStar, prograde = true) {
  signedSpinNoLimit(aStar);
  const r = iscoRadius(1, aStar, prograde);
  return Math.sqrt(1 - 2 / (3 * r));
}

function signedSpinNoLimit(aStar) {
  checkFinite('a*', aStar);
  if (aStar < 0 || aStar > 1) throw new RangeError(`0 ≤ a* ≤ 1 olmalı (verilen: ${aStar})`);
}

/** Radyatif verim η(a) = 1 − E_isco [Thorne 1974; kerr.md §2.7]: a=0 → 0.0572; a=0.998 → 0.321; a=1 → 0.4226. */
export function radiativeEfficiency(aStar, prograde = true) {
  return 1 - iscoSpecificEnergy(aStar, prograde);
}

/**
 * Enerji bütçesi integralleri (Ṁ=1, M=1):
 *   ηInf   = ∫ 4π r E F dr   (sonsuzdaki ışınım gücü / Ṁ; E = −u_t)  → 1 − E_isco (r_max → ∞)
 *   ηLocal = ∫ 4π r F dr      (yayıcı çerçevesinde toplanan güç; enerji-at-infinity ağırlığı olmadan) ≥ ηInf
 * Burada 4π = 2 yüz × 2π; dA·dτ/dt = r dr dφ (comoving alan elemanı dA = r uᵗ dr dφ, bkz. disk.md §1.4).
 * Yarıçap integrali s = 1/√r̂ değişkeninde (∞'a kadar) alınır; kuyruk F ∝ r⁻³ olduğundan yakınsar.
 * @returns {{etaInf:number, etaLocal:number, etaExpected:number}}
 */
export function diskEnergyBudget(aStar, prograde = true, panels = 400) {
  const aS = signedSpin(aStar, prograde);
  const x0 = Math.sqrt(iscoRadius(1, aStar, prograde));
  const co = pageThorneClosedFormCoefficients(aStar, prograde);
  // dr = 2x dx = −2 s⁻³ ds,  s = 1/x ∈ (0, 1/x0].  4π r F = f̂ (Ṁ=1)
  const integrandInf = (s) => {
    if (s <= 0) return 0;
    const x = 1 / s;
    const f = x - x0 < 2e-3 * x0 ? fHatQuadrature(aS, x, x0, 1) : fHatClosed(co, x);
    return f * orbitX(aS, x).E * 2 * x * x * x;
  };
  const integrandLoc = (s) => {
    if (s <= 0) return 0;
    const x = 1 / s;
    const f = x - x0 < 2e-3 * x0 ? fHatQuadrature(aS, x, x0, 1) : fHatClosed(co, x);
    return f * 2 * x * x * x;
  };
  // s=0'da integrand→0 (≈3s); sağ uç s=1/x0'da f̂=0
  const sMax = 1 / x0;
  return {
    etaInf: integrateGL(integrandInf, 0, sMax, panels),
    etaLocal: integrateGL(integrandLoc, 0, sMax, panels),
    etaExpected: radiativeEfficiency(aStar, prograde),
  };
}

// ---------------------------------------------------------------------------
// 2. Sıcaklık profili
// ---------------------------------------------------------------------------

const peakCache = new Map();

/**
 * Akı (dolayısıyla T_eff ∝ F^{1/4}) maksimumu: konum ve değer (boyutsuz, a*'a bağlı; M'den bağımsız).
 * Yöntem: log-ızgara taraması + altın oran araması (F̂ ISCO'dan sonra tek tepeli).
 * @returns {{rHat:number, fluxHat:number, rIsco:number}}  (r/M cinsinden)
 */
export function diskPeakHat(aStar, prograde = true) {
  const aS = signedSpin(aStar, prograde);
  const key = aS;
  const hit = peakCache.get(key);
  if (hit) return hit;
  const rIsco = iscoRadius(1, aStar, prograde);
  const f = (r) => pageThorneFluxHat(aStar, r, prograde);
  const n = 400;
  const lo0 = rIsco * (1 + 1e-6);
  const hi0 = rIsco * 60;
  let best = 0;
  let bestV = -1;
  for (let i = 0; i <= n; i++) {
    const r = lo0 * Math.pow(hi0 / lo0, i / n);
    const v = f(r);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  let a = lo0 * Math.pow(hi0 / lo0, Math.max(0, best - 1) / n);
  let b = lo0 * Math.pow(hi0 / lo0, Math.min(n, best + 1) / n);
  const gr = 0.5 * (Math.sqrt(5) - 1);
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < 200 && b - a > 1e-12 * b; i++) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - gr * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + gr * (b - a);
      fd = f(d);
    }
  }
  const rHat = 0.5 * (a + b);
  const out = Object.freeze({ rHat, fluxHat: f(rHat), rIsco });
  if (peakCache.size > 64) peakCache.clear();
  peakCache.set(key, out);
  return out;
}

/**
 * Tepe sıcaklığının konumu (uzunluk birimi): { r, rHat, fluxHat }. a=0: r ≈ 9.55 M (bkz. disk.md §2).
 */
export function diskTemperaturePeak(M = 1, a = 0, prograde = true) {
  checkMass(M);
  checkFinite('a', a);
  const p = diskPeakHat(a / M, prograde);
  return { r: p.rHat * M, rHat: p.rHat, fluxHat: p.fluxHat };
}

/**
 * Boyutsuz sıcaklık profili T(r)/T_max = (F(r)/F_max)^{1/4} (T_eff = (F/σ)^{1/4}). 0 ≤ değer ≤ 1.
 * r ≤ r_isco → 0. T_max'ın konumu için diskTemperaturePeak.
 */
export function diskTemperatureProfile(M = 1, a = 0, r, prograde = true) {
  checkMass(M);
  checkFinite('a', a);
  checkFinite('r', r);
  const aStar = a / M;
  const peak = diskPeakHat(aStar, prograde);
  const F = pageThorneFluxHat(aStar, r / M, prograde);
  return Math.pow(Math.min(1, F / peak.fluxHat), 0.25);
}

/**
 * GPU için T/T_max tablosu (Float32Array, N giriş). r̂ ↔ tablo eşlemesi (M birimi, a*'a bağlı):
 *   s = √((r̂ − r̂_in)/(r̂_out − r̂_in)) ∈ [0,1],  r̂ = r̂_in + s² (r̂_out − r̂_in),  tablo[i] = T/T_max(s=i/(N−1)).
 * Bu s-eşlemesi ISCO'daki √(r−r_isco) tekilliğini düzleştirir (T ∝ s). Gölgelendiricide doğrusal enterpolasyon.
 * Ölçülen hata: bkz. diskProfileTableError.
 * @returns {{N:number, rIn:number, rOut:number, aStar:number, prograde:boolean, data:Float32Array}}
 */
export function diskProfileTable(aStar, prograde = true, rOutHat = 20, N = 256) {
  signedSpin(aStar, prograde);
  if (!Number.isInteger(N) || N < 8) throw new RangeError(`N tamsayı ≥ 8 olmalı (verilen: ${N})`);
  const rIn = iscoRadius(1, aStar, prograde);
  if (!(rOutHat > rIn)) throw new RangeError(`r_out > r_isco=${rIn} olmalı (verilen: ${rOutHat})`);
  const data = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = i / (N - 1);
    const r = rIn + s * s * (rOutHat - rIn);
    data[i] = diskTemperatureProfile(1, aStar, r, prograde);
  }
  return { N, rIn, rOut: rOutHat, aStar, prograde, data };
}

/** Tablodan GLSL'in yapacağı gibi (s-eşlemesi + doğrusal enterpolasyon) T/T_max okur. r ∉ [rIn,rOut] → kenar değer. */
export function sampleDiskProfileTable(table, rHat) {
  const { N, rIn, rOut, data } = table;
  const s = Math.sqrt(Math.min(1, Math.max(0, (rHat - rIn) / (rOut - rIn))));
  const u = s * (N - 1);
  const i = Math.min(N - 2, Math.floor(u));
  const t = u - i;
  return data[i] * (1 - t) + data[i + 1] * t;
}

/** Tablo hatası: yoğun örneklemede max |T_tablo − T_tam|/T_max ve akı (T⁴) üzerinde max göreli hata (T/T_max > 0.1 için). */
export function diskProfileTableError(table, samples = 4000) {
  let maxAbs = 0;
  let maxRelFlux = 0;
  for (let k = 1; k < samples; k++) {
    const r = table.rIn + ((table.rOut - table.rIn) * k) / samples;
    const exact = diskTemperatureProfile(1, table.aStar, r, table.prograde);
    const tab = sampleDiskProfileTable(table, r);
    maxAbs = Math.max(maxAbs, Math.abs(tab - exact));
    if (exact > 0.1) maxRelFlux = Math.max(maxRelFlux, Math.abs((tab / exact) ** 4 - 1));
  }
  return { maxAbsT: maxAbs, maxRelFluxWhereTgt01: maxRelFlux };
}

// ---------------------------------------------------------------------------
// 3. Mutlak sıcaklık ölçeği
// ---------------------------------------------------------------------------

/** Eddington ışıma gücü (W), saf hidrojen (Thomson saçılması): L_Edd = 4π G M m_p c/σ_T ≈ 1.26×10³¹ W (M/M☉). */
export function eddingtonLuminosityW(solarMasses) {
  if (!Number.isFinite(solarMasses) || !(solarMasses > 0)) {
    throw new RangeError(`Kütle sonlu ve > 0 olmalı (güneş kütlesi; verilen: ${solarMasses})`);
  }
  return (4 * Math.PI * GM_SUN * solarMasses * M_PROTON * C) / SIGMA_THOMSON;
}

/**
 * Kütle akışı: Ṁ = ṁ L_Edd/(η c²) [kg/s]  (ṁ = eddingtonRatio ≡ L_disk/L_Edd; η = η(a) = 1 − E_isco).
 * Bu tanımla diskin sonsuzdaki toplam ışıma gücü tam ṁ·L_Edd'dir (Novikov–Thorne, geri dönen ışınım yok).
 */
export function diskMassAccretionRateKgPerS(solarMasses, eddingtonRatio, aStar = 0, prograde = true) {
  if (!Number.isFinite(eddingtonRatio) || !(eddingtonRatio > 0)) {
    throw new RangeError(`eddingtonRatio sonlu ve > 0 olmalı (verilen: ${eddingtonRatio})`);
  }
  signedSpinNoLimit(aStar);
  return (eddingtonRatio * eddingtonLuminosityW(solarMasses)) / (radiativeEfficiency(aStar, prograde) * C * C);
}

/**
 * Tepe etkin sıcaklığı T_max (K):
 *   σ T_max⁴ = Ṁ c² F̂_max / r_g²,   Ṁ c² = ṁ L_Edd/η,   r_g = G M/c²
 *   ⇒ T_max = [ ṁ L_Edd F̂_max / (η σ r_g²) ]^{1/4}  ∝ (ṁ/M)^{1/4}.
 * Bu T_EFF'tir (f_col = 1 kara cisim). Renk düzeltmesi için f_col ayrıca uygulanır (observedDiskRadiance).
 * Örnek (bu kodla hesaplandı): M=10 M☉, ṁ=0.1, a=0 → T_max ≈ 3.9×10⁶ K (kT ≈ 0.34 keV);
 * M=10⁸ M☉, ṁ=0.1, a=0 → ≈ 7.0×10⁴ K. a=0.9 prograd için ≈ 1.7 kat daha sıcak.
 * @param {{solarMasses:number, eddingtonRatio:number, aStar?:number, prograde?:boolean}} p
 */
export function diskMaxTemperatureK({ solarMasses, eddingtonRatio, aStar = 0, prograde = true }) {
  const { fluxHat } = diskPeakHat(aStar, prograde);
  const eta = radiativeEfficiency(aStar, prograde);
  const rg = (GM_SUN * solarMasses) / (C * C); // m
  const LEdd = eddingtonLuminosityW(solarMasses);
  if (!Number.isFinite(eddingtonRatio) || !(eddingtonRatio > 0)) {
    throw new RangeError(`eddingtonRatio sonlu ve > 0 olmalı (verilen: ${eddingtonRatio})`);
  }
  return Math.pow((eddingtonRatio * LEdd * fluxHat) / (eta * SIGMA_SB * rg * rg), 0.25);
}

/**
 * İnce disk geçerlilik uyarısı (dize veya null). Ölçüt yaklaşık ve YAKLAŞIKTIR:
 *  - ṁ ≲ 0.01: iç bölge radyatif olarak verimsiz/optik ince/kalın akış (RIAF) → ince disk modeli geçersiz.
 *    Sgr A* ve M87* bu rejimdedir (ṁ ≪ 0.01); T_max'ı doğrudan seçmek "sanatsal" bir seçimdir.
 *  - ṁ ≳ 0.3: ışınım basıncı diski şişirir (slim/kalın disk) → H/R ≪ 1 varsayımı bozulur.
 */
export function thinDiskValidityWarning(eddingtonRatio) {
  if (eddingtonRatio < 0.01) {
    return 'ṁ < ~0.01: radyatif olarak verimsiz akış (RIAF) rejimi; ince Novikov–Thorne diski geçerli değil (Sgr A*, M87* bu rejimde).';
  }
  if (eddingtonRatio > 0.3) {
    return 'ṁ > ~0.3: ışınım basıncı diski kalınlaştırır (slim/kalın disk); H/R ≪ 1 varsayımı bozulur.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. Gözlenen ışıma (Liouville) ve kara cisim rengi
// ---------------------------------------------------------------------------

/** Planck B_λ(T) [W m⁻² sr⁻¹ m⁻¹], λ metre. */
export function planckLambda(lambdaM, T) {
  const x = (H_PLANCK * C) / (lambdaM * K_BOLTZMANN * T);
  return (2 * H_PLANCK * C * C) / (lambdaM ** 5 * Math.expm1(x));
}

/** Planck B_ν(T) [W m⁻² sr⁻¹ Hz⁻¹]. Liouville: B_ν,obs(ν) = g³ B_ν(ν/g; T) ≡ B_ν(g T) (disk.md §3.1). */
export function planckNu(nu, T) {
  const x = (H_PLANCK * nu) / (K_BOLTZMANN * T);
  return (2 * H_PLANCK * nu ** 3) / (C * C * Math.expm1(x));
}

/**
 * Gözlenen yoğunluk özeti (CPU referansı; GLSL ile birebir aynı mantık).
 *   T_obs = g · f_col · T_eff        (renk sıcaklığı; kara cisim için I_ν,obs = f_col⁻⁴ B_ν(T_obs))
 *   I_bol,obs = g⁴ σ T_eff⁴/π        (bolometrik; f_col'dan bağımsız — akı korunumu)
 * @param {{Teff:number, g:number, fCol?:number}} p  Teff: yerel etkin sıcaklık (K), g: ν_obs/ν_em
 */
export function observedBlackbody({ Teff, g, fCol = 1 }) {
  checkFinite('Teff', Teff);
  checkFinite('g', g);
  if (!(Teff >= 0) || !(g > 0) || !(fCol >= 1)) throw new RangeError('Teff ≥ 0, g > 0, fCol ≥ 1 olmalı');
  return {
    Tobs: g * fCol * Teff,
    bolometric: (g ** 4 * SIGMA_SB * Teff ** 4) / Math.PI, // W m⁻² sr⁻¹
    dilution: fCol ** -4, // spektral genlik çarpanı: I_ν = dilution · B_ν(T_obs)
  };
}

// --- CIE 1931 2° CMF: Wyman, Sloan & Shirley 2013 çok-loblu Gauss yaklaşımı [W13, eq. 1–3] -----
const lobe = (l, mu, s1, s2) => {
  const t = (l - mu) / (l < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};

/** CIE 1931 2° x̄,ȳ,z̄ (λ nm). [W13] çok-loblu fit; tam tabloya göre fark: disk.md §4. */
export function cieXYZBarWyman(lambdaNm) {
  const l = lambdaNm;
  return [
    1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
    0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
    1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8),
  ];
}

/** CIE XYZ (D65 beyaz noktalı) → doğrusal sRGB [IEC 61966-2-1]. */
export function xyzToLinearSRGB(X, Y, Z) {
  return [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ];
}

/**
 * Kara cisim ışıma yoğunluğunun CIE XYZ'si: X = ∫B_λ(T) x̄(λ) dλ, ... λ ∈ [360, 830] nm, 1 nm adım.
 * Birim: W m⁻² sr⁻¹ (K_m = 683 lm/W çarpılmamış; cd/m² için ×683).
 */
export function blackbodyXYZ(T) {
  if (!Number.isFinite(T) || !(T > 0)) throw new RangeError(`T sonlu ve > 0 olmalı (verilen: ${T})`);
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let nm = 360; nm <= 830; nm++) {
    const B = planckLambda(nm * 1e-9, T) * 1e-9; // W m⁻² sr⁻¹ nm⁻¹
    const [xb, yb, zb] = cieXYZBarWyman(nm);
    X += B * xb;
    Y += B * yb;
    Z += B * zb;
  }
  return [X, Y, Z];
}

/**
 * Kara cismin (sıcaklık T) doğrusal sRGB rengi — renklilik ve parlaklık AYRI döner.
 *  - rgb: luminansa normalize (Y = 0.2126R + 0.7152G + 0.0722B = 1), D65 beyaz. HDR: bileşenler 1'i aşabilir
 *    (görüntüleme/ton eşleme arayüz tarafındadır).
 *  - luminance: Y (W m⁻² sr⁻¹) gerçek band-integre parlaklık (log10 için tabloya bkz.).
 *  - GAMUT DIŞI (estetik/gösterim kararı): rgb'nin bir bileşeni < 0 ise aynı luminanstaki griye (1,1,1) doğru
 *    en küçük t kadar karıştırılır: rgb' = rgb + t(1 − rgb); luminans korunur (beyazın Y'si 1). `desaturation` = t.
 *    Planck eğrisi sRGB'de ≈1900 K altında (B<0) ve çok yüksek T'de gamut dışına çıkar.
 * @returns {{rgb:number[], luminance:number, x:number, y:number, desaturation:number}}
 */
export function blackbodyToLinearSRGB(T) {
  const [X, Y, Z] = blackbodyXYZ(T);
  const sum = X + Y + Z;
  let rgb = xyzToLinearSRGB(X / Y, 1, Z / Y);
  const minC = Math.min(rgb[0], rgb[1], rgb[2]);
  let t = 0;
  if (minC < 0) {
    // rgb_i + t(1 − rgb_i) ≥ 0  ⇒  t ≥ −rgb_i/(1 − rgb_i)  (rgb_i < 0 için)
    for (const c of rgb) if (c < 0) t = Math.max(t, -c / (1 - c));
    rgb = rgb.map((c) => c + t * (1 - c));
  }
  return { rgb, luminance: Y, x: X / sum, y: Y / sum, desaturation: t };
}

let rjCoeffs = null;

/**
 * Yüksek T (T ≳ 10⁵ K) için band-luminans serisi (Rayleigh–Jeans genişlemesi, 1/(eˣ−1) = 1/x − 1/2 + x/12 − …):
 *   Y(T) = α T − β + γ/T,   α = 2ck ∫ȳ λ⁻⁴dλ,  β = hc² ∫ȳ λ⁻⁵dλ,  γ = (h²c³/6k) ∫ȳ λ⁻⁶dλ   [W m⁻² sr⁻¹].
 * T=10⁵ K'de tam integralle ≲ 10⁻³ (bir sonraki terim ~x³/720), T=10⁷ K'de ≲ 10⁻⁶ uyum (testte ölçülür).
 * LUT'un 10⁵ K üstünü kıstırma yerine bunu kullanın: log10Y = log10(α T − β + γ/T).
 * Aynı ȳ (Wyman) ve aynı λ-ızgarası (360–830 nm, 1 nm) ile hesaplanır.
 */
export function blackbodyLuminanceSeries(T) {
  if (!Number.isFinite(T) || !(T > 0)) throw new RangeError(`T sonlu ve > 0 olmalı (verilen: ${T})`);
  if (!rjCoeffs) {
    let i4 = 0;
    let i5 = 0;
    let i6 = 0;
    for (let nm = 360; nm <= 830; nm++) {
      const y = cieXYZBarWyman(nm)[1];
      const l = nm * 1e-9;
      i4 += (y / l ** 4) * 1e-9;
      i5 += (y / l ** 5) * 1e-9;
      i6 += (y / l ** 6) * 1e-9;
    }
    rjCoeffs = {
      alpha: 2 * C * K_BOLTZMANN * i4,
      beta: H_PLANCK * C * C * i5,
      gamma: ((H_PLANCK * H_PLANCK * C ** 3) / (6 * K_BOLTZMANN)) * i6,
    };
  }
  const { alpha, beta, gamma } = rjCoeffs;
  return alpha * T - beta + gamma / T;
}

/** Dışa açık LUT parametreleri. */
export const BLACKBODY_LUT_TMIN = 1000;
export const BLACKBODY_LUT_TMAX = 100000;

/**
 * GPU tablosu: log10 T'ye göre eşit aralıklı N giriş (T = 1000 … 100000 K, uçlar dahil).
 * Format: Float32Array(4N), satır i: [R, G, B, log10(Y)] — (R,G,B) luminansa normalize doğrusal sRGB (Y=1),
 * log10(Y) radyometrik band-luminans (W m⁻² sr⁻¹). Koordinat: u = (log10 T − 3)/2 ∈ [0,1]; texel merkezi için
 * (u(N−1) + 0.5)/N. Gölgelendirici: iki texel getir + mix (RGBA32F + NEAREST ya da HalfFloat/LINEAR).
 */
export function blackbodyLUT(N = 256) {
  if (!Number.isInteger(N) || N < 8) throw new RangeError(`N tamsayı ≥ 8 olmalı (verilen: ${N})`);
  const data = new Float32Array(4 * N);
  const l0 = Math.log10(BLACKBODY_LUT_TMIN);
  const l1 = Math.log10(BLACKBODY_LUT_TMAX);
  for (let i = 0; i < N; i++) {
    const T = Math.pow(10, l0 + ((l1 - l0) * i) / (N - 1));
    const { rgb, luminance } = blackbodyToLinearSRGB(T);
    data.set([rgb[0], rgb[1], rgb[2], Math.log10(luminance)], 4 * i);
  }
  return { N, Tmin: BLACKBODY_LUT_TMIN, Tmax: BLACKBODY_LUT_TMAX, data };
}

/** LUT'tan GLSL'in yapacağı gibi (log T'de doğrusal enterpolasyon) okur. T aralık dışı ise kenara kıstırılır. */
export function sampleBlackbodyLUT(lut, T) {
  const { N, data } = lut;
  const l0 = Math.log10(lut.Tmin);
  const l1 = Math.log10(lut.Tmax);
  const u = Math.min(1, Math.max(0, (Math.log10(T) - l0) / (l1 - l0))) * (N - 1);
  const i = Math.min(N - 2, Math.floor(u));
  const t = u - i;
  const out = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) out[k] = data[4 * i + k] * (1 - t) + data[4 * (i + 1) + k] * t;
  return { rgb: out.slice(0, 3), log10Y: out[3] };
}

/**
 * LUT hatası: yoğun log-T örneklemesinde (varsayılan 2001 nokta) doğrudan integrale karşı
 *  maxRgbAbs  — max |ΔR|,|ΔG|,|ΔB| (Y=1 normalizasyonunda)
 *  maxLog10Y  — max |Δ log10 Y|   (0.001 ≈ %0.23 luminans)
 */
export function blackbodyLUTError(lut, samples = 2001) {
  const l0 = Math.log10(lut.Tmin);
  const l1 = Math.log10(lut.Tmax);
  let maxRgbAbs = 0;
  let maxLog10Y = 0;
  for (let k = 0; k < samples; k++) {
    const T = Math.pow(10, l0 + ((l1 - l0) * k) / (samples - 1));
    const ex = blackbodyToLinearSRGB(T);
    const lu = sampleBlackbodyLUT(lut, T);
    for (let c = 0; c < 3; c++) maxRgbAbs = Math.max(maxRgbAbs, Math.abs(lu.rgb[c] - ex.rgb[c]));
    maxLog10Y = Math.max(maxLog10Y, Math.abs(lu.log10Y - Math.log10(ex.luminance)));
  }
  return { maxRgbAbs, maxLog10Y };
}
