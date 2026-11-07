/**
 * disk.js testleri.  Çalıştırma:  npm test   (veya:  node --test "src/physics/*.test.mjs")
 * Birimler: G = c = 1, uzunluk M cinsinden (aksi belirtilmedikçe M = 1); SI olan yerler açıkça belirtilmiştir.
 *
 * "Belleğe dayalı" işaretli referanslar (Kim vd. 2002 Planck eğrisi polinomu, CIE ∫x̄≈∫ȳ≈∫z̄≈106.86, D65 xy)
 * bu oturumda ağdan resmi kaynaktan teyit EDİLMEMİŞTİR; dar toleranslı bağımsız tutarlılık kontrolleridir.
 * Tam CIE tablosuna karşı Wyman farkı ölçülemedi (bkz. docs/physics/disk.md §4.4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  iscoRadius,
  circularOrbitEnergy,
  circularOrbitAngularMomentum,
  circularOrbitUt,
  keplerOmega,
  metricBL,
} from './kerr.js';
import {
  C,
} from './units.js';
import {
  SIGMA_SB,
  pageThorneRoots,
  pageThorneClosedFormCoefficients,
  pageThorneFluxHat,
  pageThorneFluxHatQuadrature,
  pageThorneFlux,
  iscoSpecificEnergy,
  radiativeEfficiency,
  diskEnergyBudget,
  diskPeakHat,
  diskTemperaturePeak,
  diskTemperatureProfile,
  diskProfileTable,
  diskProfileTableError,
  sampleDiskProfileTable,
  eddingtonLuminosityW,
  diskMaxTemperatureK,
  thinDiskValidityWarning,
  planckNu,
  observedBlackbody,
  cieXYZBarWyman,
  blackbodyToLinearSRGB,
  blackbodyLuminanceSeries,
  blackbodyLUT,
  sampleBlackbodyLUT,
  blackbodyLUTError,
} from './disk.js';
import { GM_SUN } from './units.js';

const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);
const close = (actual, expected, tol, msg = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg} beklenen ${expected}, bulunan ${actual}, fark ${Math.abs(actual - expected)} > ${tol}`
  );
const closeRel = (actual, expected, tol, msg = '') =>
  assert.ok(relErr(actual, expected) <= tol, `${msg} beklenen ${expected}, bulunan ${actual}, bağıl fark ${relErr(actual, expected)} > ${tol}`);

/** Basit bileşik Simpson (n çift). */
function simpson(f, a, b, n) {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

// ---------------------------------------------------------------------------
// 1. Page–Thorne akısı
// ---------------------------------------------------------------------------

test('PT kökleri: x³ − 3x + 2a = 0, toplam 0, çarpım −2a', () => {
  for (const aS of [-1, -0.9, -0.3, 0, 0.3, 0.9, 0.998]) {
    const { x1, x2, x3 } = pageThorneRoots(aS);
    for (const x of [x1, x2, x3]) close(x ** 3 - 3 * x + 2 * aS, 0, 1e-13, `a=${aS}`);
    close(x1 + x2 + x3, 0, 1e-13);
    close(x1 * x2 * x3, -2 * aS, 1e-13);
  }
  const r0 = pageThorneRoots(0);
  close(r0.x1, Math.sqrt(3), 1e-15);
  close(r0.x2, 0, 1e-15);
  close(r0.x3, -Math.sqrt(3), 1e-15);
});

test('Kapalı form (PT74 15n) ≡ tanımdan bağımsız kuadratür (f = −Ω,r(E−ΩL)⁻²∫(E−ΩL)L,r dr)', () => {
  const cases = [
    [0, true],
    [0.5, true],
    [0.9, true],
    [0.998, true],
    [0.5, false],
    [0.9, false],
    [1, false],
  ];
  for (const [a, pro] of cases) {
    const r0 = iscoRadius(1, a, pro);
    for (const k of [1.02, 1.1, 1.5, 3, 10, 100]) {
      const r = r0 * k;
      const cf = pageThorneFluxHat(a, r, pro);
      const q = pageThorneFluxHatQuadrature(a, r, pro, 200);
      closeRel(cf, q, 2e-9, `a=${a} pro=${pro} r/r0=${k}`);
    }
  }
});

test('kerr.js E, L, Ω ile tam bağımsız tanım-integrali (sonlu fark dL/dr, Simpson) ≡ pageThorneFluxHat', () => {
  // f = (−Ω,r)(E−ΩL)⁻² ∫(E−ΩL) L,r dr — doğrudan kerr.js fonksiyonlarıyla (iç x-formüllerinden bağımsız).
  const fRef = (a, r, pro) => {
    const r0 = iscoRadius(1, a, pro);
    const Lr = (rr) => {
      const h = 1e-5 * rr;
      return (circularOrbitAngularMomentum(1, a, rr + h, pro) - circularOrbitAngularMomentum(1, a, rr - h, pro)) / (2 * h);
    };
    const ED = (rr) => circularOrbitEnergy(1, a, rr, pro) - keplerOmega(1, a, rr, pro) * circularOrbitAngularMomentum(1, a, rr, pro);
    const integral = simpson((rr) => ED(rr) * Lr(rr), r0, r, 4000);
    const h = 1e-5 * r;
    const OmR = (keplerOmega(1, a, r + h, pro) - keplerOmega(1, a, r - h, pro)) / (2 * h);
    return (-OmR / ED(r) ** 2) * integral;
  };
  for (const [a, pro] of [[0, true], [0.9, true], [0.7, false]]) {
    const r0 = iscoRadius(1, a, pro);
    for (const k of [1.2, 2, 5, 20]) {
      const r = r0 * k;
      const fHat = pageThorneFluxHat(a, r, pro) * 4 * Math.PI * r;
      closeRel(fHat, fRef(a, r, pro), 1e-5, `a=${a} pro=${pro} r=${r}`);
    }
  }
});

test('ISCO: F(r_isco)=0, r<r_isco → 0, F ≥ 0, ISCO yakınında F ∝ (r−r_isco)² (sıfır tork)', () => {
  for (const [a, pro] of [[0, true], [0.9, true], [0.998, true], [0.9, false]]) {
    const r0 = iscoRadius(1, a, pro);
    assert.equal(pageThorneFluxHat(a, r0, pro), 0);
    assert.equal(pageThorneFluxHat(a, 0.9 * r0, pro), 0);
    let prev = 0;
    for (let k = 1; k <= 200; k++) {
      const F = pageThorneFluxHat(a, r0 * (1 + 0.05 * k), pro);
      assert.ok(F > 0 && Number.isFinite(F));
      prev = F;
    }
    assert.ok(prev > 0);
    // kuadratik yaklaşma: oran ≈ 4 (ε→2ε); yüksek-spinde asimptotik rejim için ε küçük seçilir
    const F1 = pageThorneFluxHat(a, r0 * (1 + 1e-4), pro);
    const F2 = pageThorneFluxHat(a, r0 * (1 + 2e-4), pro);
    close(F2 / F1, 4, 0.02, `a=${a} pro=${pro}`);
  }
});

test('Göreli olmayan limit (a=0, r ≫ r_isco): F → 3(1−√(r_isco/r))/(8π r³) [SS73], sapma ∝ r^{-1/2}', () => {
  const ss = (r) => (3 / (8 * Math.PI * r ** 3)) * (1 - Math.sqrt(6 / r));
  let prevDev = Infinity;
  for (const r of [1e2, 1e3, 1e4, 1e5, 1e6]) {
    const dev = Math.abs(pageThorneFluxHat(0, r) / ss(r) - 1);
    assert.ok(dev < 2 / Math.sqrt(r), `r=${r}: dev=${dev}`);
    assert.ok(dev < prevDev, 'sapma r ile azalmalı');
    prevDev = dev;
  }
  assert.ok(prevDev < 2e-3);
  // Her spin ve yönde de aynı limit (r_isco'ya göre)
  for (const [a, pro] of [[0.9, true], [0.9, false]]) {
    const r0 = iscoRadius(1, a, pro);
    const r = 1e6;
    const s = (3 / (8 * Math.PI * r ** 3)) * (1 - Math.sqrt(r0 / r));
    assert.ok(Math.abs(pageThorneFluxHat(a, r, pro) / s - 1) < 3e-3);
  }
});

test('pageThorneFlux(M,a,r): ölçekleme F = F̂/M² ve geçersiz girdiler', () => {
  closeRel(pageThorneFlux(4, 2.0, 40, true), pageThorneFluxHat(0.5, 10, true) / 16, 1e-14);
  assert.throws(() => pageThorneFlux(0, 0, 10), RangeError);
  assert.throws(() => pageThorneFluxHat(-0.1, 10), RangeError);
  assert.throws(() => pageThorneFluxHat(1.1, 10, false), RangeError);
  assert.throws(() => pageThorneFluxHat(1, 10, true), RangeError, 'prograd a*=1 desteklenmez');
  assert.throws(() => pageThorneFluxHat(0.5, NaN), RangeError);
  assert.throws(() => pageThorneFluxHat(0.5, -1), RangeError);
  assert.doesNotThrow(() => pageThorneFluxHat(1, 10, false));
  // a=0: prograd ≡ retrograd
  closeRel(pageThorneFluxHat(0, 12, true), pageThorneFluxHat(0, 12, false), 1e-14);
});

test('GLSL eşliği: dışa verilen katsayılarla yazılan kapalı form ≡ pageThorneFluxHat', () => {
  for (const [a, pro] of [[0, true], [0.9, true], [0.5, false]]) {
    const { aS, x0, x1, x2, x3, c1, c2, c3 } = pageThorneClosedFormCoefficients(a, pro);
    for (const r of [iscoRadius(1, a, pro) * 1.3, 15, 100]) {
      const x = Math.sqrt(r);
      const br =
        x - x0 - 1.5 * aS * Math.log(x / x0) -
        c1 * Math.log((x - x1) / (x0 - x1)) -
        c2 * Math.log((x - x2) / (x0 - x2)) -
        c3 * Math.log((x - x3) / (x0 - x3));
      const F = (1.5 / (x * x * (x ** 3 - 3 * x + 2 * aS))) * br / (4 * Math.PI * r);
      closeRel(F, pageThorneFluxHat(a, r, pro), 1e-12);
    }
  }
});

// ---------------------------------------------------------------------------
// 1b. Enerji bütçesi / alan elemanı
// ---------------------------------------------------------------------------

test('Ekvatoral indüklenen 3-metrik: √(−det g_(t,r,φ)) = r (e^{ν+ψ+μ} = r) ve dA = r uᵗ dr dφ', () => {
  for (const a of [0, 0.5, 0.9, 0.998]) {
    for (const r of [3, 5, 10, 40]) {
      const g = metricBL(1, a, r, Math.PI / 2);
      const det = g.grr * (g.gtt * g.gphiphi - g.gtphi * g.gtphi); // blok yapı: (t,φ) ⊕ (r)
      closeRel(Math.sqrt(-det), r, 1e-12, `a=${a} r=${r}`);
    }
  }
  // Schwarzschild: dA(comoving) = γ r dr dφ/√(1−2/r) = r uᵗ dr dφ,  γ = √((r−2)/(r−3))
  const r = 10;
  const gamma = Math.sqrt((r - 2) / (r - 3));
  closeRel(gamma / Math.sqrt(1 - 2 / r), circularOrbitUt(1, 0, r), 1e-14);
});

test('E_isco = √(1−2/(3 r_isco)) ≡ kerr.js circularOrbitEnergy(r_isco); verim değerleri', () => {
  for (const [a, pro] of [[0, true], [0.5, true], [0.9, true], [0.998, true], [0.5, false], [1, false]]) {
    const r0 = iscoRadius(1, a, pro);
    close(iscoSpecificEnergy(a, pro), circularOrbitEnergy(1, a, r0, pro), 1e-12, `a=${a} pro=${pro}`);
  }
  close(radiativeEfficiency(0), 1 - Math.sqrt(8 / 9), 1e-15); // 0.0572
  close(radiativeEfficiency(0), 0.0572, 5e-5);
  close(radiativeEfficiency(0.998), 0.321, 5e-4); // [T74]
  close(radiativeEfficiency(1, true), 1 - 1 / Math.sqrt(3), 1e-12); // 0.4226 (kerr.md §2.7), a*=1 prograd verimi
  close(radiativeEfficiency(1, false), 1 - Math.sqrt(1 - 2 / 27), 1e-12);
});

test('Enerji korunumu: ∫ 2F E dA(dτ/dt) = ∫4π r E F dr = Ṁ(1 − E_isco); bir kısım ışınım olarak kaçar', () => {
  // Tamamen bağımsız entegrasyon: F → pageThorneFluxHat; E, uᵗ → kerr.js; s = 1/√r değişkeninde Simpson.
  for (const [a, pro] of [[0, true], [0.5, true], [0.9, true], [0.998, true], [0.7, false]]) {
    const r0 = iscoRadius(1, a, pro);
    const integrand = (s) => {
      if (s <= 0) return 0;
      const r = 1 / (s * s);
      if (r <= r0) return 0;
      const F = pageThorneFluxHat(a, r, pro);
      const E = circularOrbitEnergy(1, a, r, pro);
      const ut = circularOrbitUt(1, a, r, pro);
      const dArea = r * ut; // × dr dφ  (comoving)
      const dtauDt = 1 / ut;
      const faces = 2;
      const dphi = 2 * Math.PI;
      return faces * F * E * dArea * dtauDt * dphi * (2 / (s * s * s)); // dr = 2 s⁻³ ds
    };
    const L = simpson(integrand, 0, 1 / Math.sqrt(r0), 20000);
    const eta = 1 - circularOrbitEnergy(1, a, r0, pro);
    closeRel(L, eta, 1e-6, `a=${a} pro=${pro}: L∞/Ṁ`);
    // yerel çerçevede toplanan güç (E ağırlığı yok) daha büyüktür, ama < 1 (bağlanma enerjisinin hepsi değil)
    const b = diskEnergyBudget(a, pro);
    closeRel(b.etaInf, eta, 1e-6, 'diskEnergyBudget.etaInf');
    assert.ok(b.etaLocal > b.etaInf && b.etaLocal < 1, `etaLocal=${b.etaLocal}`);
  }
});

// ---------------------------------------------------------------------------
// 2. Sıcaklık profili ve T_max konumu
// ---------------------------------------------------------------------------

test('a=0 T_max konumu: türetilmiş r ≈ 9.55 M (SS göreli olmayan 49/36·r_isco = 8.17 M DEĞİL); bağımsız tarama', () => {
  // Bağımsız: kuadratür tabanlı akıyı ince ızgarada tara.
  let best = 0;
  let bestR = 0;
  for (let r = 8; r <= 11; r += 0.001) {
    const F = pageThorneFluxHatQuadrature(0, r, true, 40);
    if (F > best) {
      best = F;
      bestR = r;
    }
  }
  const pk = diskTemperaturePeak(1, 0, true);
  close(pk.r, bestR, 2e-3, 'tepe konumu');
  close(pk.r, 9.5509, 1e-3);
  closeRel(pk.fluxHat, best, 1e-9);
  // Göreli olmayan SS tepesi: F ∝ r⁻³(1−√(r0/r)) → r = (49/36) r0
  let bestN = 0;
  let bestNR = 0;
  for (let r = 6.001; r < 15; r += 0.0005) {
    const F = (1 - Math.sqrt(6 / r)) / r ** 3;
    if (F > bestN) {
      bestN = F;
      bestNR = r;
    }
  }
  close(bestNR, (49 / 36) * 6, 2e-3);
  assert.ok(pk.r - bestNR > 1, 'GR tepesi Newton tepesinden belirgin dışarıda');
});

test('Sıcaklık profili: T/T_max ∈ [0,1], ISCO\'da 0, tepede 1; a büyüdükçe tepe içeri ve daha sıcak', () => {
  let prevPeak = Infinity;
  let prevFlux = 0;
  for (const a of [0, 0.3, 0.6, 0.9, 0.99, 0.998]) {
    const pk = diskTemperaturePeak(1, a, true);
    const r0 = iscoRadius(1, a, true);
    assert.ok(pk.r > r0);
    assert.ok(pk.r < prevPeak);
    assert.ok(pk.fluxHat > prevFlux);
    prevPeak = pk.r;
    prevFlux = pk.fluxHat;
    assert.equal(diskTemperatureProfile(1, a, r0, true), 0);
    closeRel(diskTemperatureProfile(1, a, pk.r, true), 1, 1e-9);
    for (const k of [1.01, 1.3, 2, 5, 50]) {
      const t = diskTemperatureProfile(1, a, r0 * k, true);
      assert.ok(t >= 0 && t <= 1 + 1e-12);
    }
    // büyük r'de T ∝ r^{-3/4}
    const t1 = diskTemperatureProfile(1, a, 1e4, true);
    const t2 = diskTemperatureProfile(1, a, 2e4, true);
    close(Math.log(t1 / t2) / Math.log(2), 0.75, 0.01);
  }
  // M ölçeklemesi: profil yalnızca r/M'e bağlı
  closeRel(diskTemperatureProfile(3, 1.5, 30, true), diskTemperatureProfile(1, 0.5, 10, true), 1e-12);
  // retrograd: tepe dışarıda
  assert.ok(diskTemperaturePeak(1, 0.9, false).r > diskTemperaturePeak(1, 0, true).r);
});

test('GPU profil tablosu: N=256, s=√((r−r_in)/(r_out−r_in)) eşlemesi, enterpolasyon hatası küçük', () => {
  const cases = [
    [0, true, 20, 1e-4, 1e-3],
    [0.9, true, 20, 3e-4, 2e-3],
    [0.998, true, 20, 1e-3, 5e-3],
    [0.9, false, 30, 1e-4, 1e-3],
    [0, true, 100, 5e-4, 5e-3],
  ];
  for (const [a, pro, rOut, tolT, tolF] of cases) {
    const tab = diskProfileTable(a, pro, rOut, 256);
    assert.equal(tab.data.length, 256);
    assert.equal(tab.data[0], 0);
    assert.ok(tab.data[255] > 0);
    const err = diskProfileTableError(tab, 3000);
    assert.ok(err.maxAbsT < tolT, `a=${a} rOut=${rOut}: max|ΔT/Tmax|=${err.maxAbsT}`);
    assert.ok(err.maxRelFluxWhereTgt01 < tolF, `a=${a} rOut=${rOut}: akı hatası=${err.maxRelFluxWhereTgt01}`);
    // düğüm noktalarında (float32 yuvarlama dışında) tam
    const i = 100;
    const r = tab.rIn + (i / 255) ** 2 * (tab.rOut - tab.rIn);
    close(sampleDiskProfileTable(tab, r), diskTemperatureProfile(1, a, r, pro), 1e-6);
  }
});

// ---------------------------------------------------------------------------
// 3. Mutlak ölçek
// ---------------------------------------------------------------------------

test('Eddington ışıma gücü: 1.26×10³¹ W/M☉ (1.26×10³⁸ erg/s)', () => {
  closeRel(eddingtonLuminosityW(1), 1.257e31, 2e-3);
  closeRel(eddingtonLuminosityW(10), 10 * eddingtonLuminosityW(1), 1e-14);
});

test('T_max ölçekleri: ∝ ṁ^{1/4}, ∝ M^{-1/4}; uçtan uca: ∫4π r E σT⁴ dr = ṁ L_Edd (SI)', () => {
  const base = diskMaxTemperatureK({ solarMasses: 10, eddingtonRatio: 0.1, aStar: 0 });
  closeRel(diskMaxTemperatureK({ solarMasses: 10, eddingtonRatio: 1.6, aStar: 0 }) / base, 2, 1e-12);
  closeRel(diskMaxTemperatureK({ solarMasses: 160, eddingtonRatio: 0.1, aStar: 0 }) / base, 0.5, 1e-12);
  assert.ok(diskMaxTemperatureK({ solarMasses: 10, eddingtonRatio: 0.1, aStar: 0.9 }) > base);
  assert.ok(base > 1e6 && base < 1e7, `T_max(10 M☉, 0.1 L_Edd) = ${base}`);

  // Uçtan uca güç: yerel akı σT_eff⁴ (SI) → sonsuzdaki güç, bağımsız; L = ṁ L_Edd olmalı.
  for (const [Msun, mdot, a, pro] of [[10, 0.1, 0, true], [1e8, 0.3, 0.9, true], [10, 0.05, 0.5, false]]) {
    const Tmax = diskMaxTemperatureK({ solarMasses: Msun, eddingtonRatio: mdot, aStar: a, prograde: pro });
    const rg = (GM_SUN * Msun) / (C * C); // m
    const r0 = iscoRadius(1, a, pro);
    const integrand = (s) => {
      if (s <= 0) return 0;
      const rHat = 1 / (s * s);
      if (rHat <= r0) return 0;
      const T = Tmax * diskTemperatureProfile(1, a, rHat, pro);
      const E = circularOrbitEnergy(1, a, rHat, pro);
      // dL = 4π r E F dr,  r = rHat rg,  dr = rg dr̂,  dr̂ = 2 s⁻³ ds
      return 4 * Math.PI * rHat * rg * E * SIGMA_SB * T ** 4 * rg * (2 / (s * s * s));
    };
    const L = simpson(integrand, 0, 1 / Math.sqrt(r0), 20000);
    closeRel(L, mdot * eddingtonLuminosityW(Msun), 1e-5, `M=${Msun} ṁ=${mdot} a=${a}`);
  }
});

test('İnce disk geçerlilik uyarısı: RIAF (Sgr A*/M87* benzeri) uyarılır, 0.1 uyarılmaz', () => {
  assert.ok(thinDiskValidityWarning(1e-8));
  assert.ok(thinDiskValidityWarning(1e-4));
  assert.equal(thinDiskValidityWarning(0.1), null);
  assert.ok(thinDiskValidityWarning(1.0));
});

// ---------------------------------------------------------------------------
// 4. Gözlenen ışıma (Liouville) ve kara cisim rengi
// ---------------------------------------------------------------------------

test('Liouville: g³ B_ν(ν/g; T) ≡ B_ν(g T) (kara cisim, g³ ve sıcaklık kayması aynı şeydir)', () => {
  for (const T of [3000, 6504, 2e4]) {
    for (const g of [0.3, 0.8, 1.0, 1.4]) {
      for (const nu of [1e13, 5.4e14, 2e15]) {
        const lhs = g ** 3 * planckNu(nu / g, T);
        closeRel(lhs, planckNu(nu, g * T), 1e-12, `T=${T} g=${g} ν=${nu}`);
      }
    }
  }
});

test('Bolometrik: ∫ B_ν(gT) dν = g⁴ σT⁴/π (sayısal integral)', () => {
  const T = 8000;
  for (const g of [0.5, 1, 1.3]) {
    const Tobs = g * T;
    // ln ν üzerinde Simpson: ν = e^u, dν = ν du
    const nuLo = 1e9;
    const nuHi = 80 * (1.380649e-23 * Tobs) / 6.62607015e-34;
    const I = simpson((u) => planckNu(Math.exp(u), Tobs) * Math.exp(u), Math.log(nuLo), Math.log(nuHi), 20000);
    const o = observedBlackbody({ Teff: T, g });
    closeRel(I, o.bolometric, 1e-6, `g=${g}`);
    closeRel(o.bolometric, (g ** 4 * SIGMA_SB * T ** 4) / Math.PI, 1e-14);
    closeRel(o.Tobs, g * T, 1e-14);
  }
  // f_col: bolometrik değişmez, renk sıcaklığı f_col ile artar, spektral genlik f_col⁻⁴
  const o17 = observedBlackbody({ Teff: 1e6, g: 1, fCol: 1.7 });
  closeRel(o17.Tobs, 1.7e6, 1e-14);
  closeRel(o17.dilution, 1.7 ** -4, 1e-14);
  closeRel(o17.bolometric, observedBlackbody({ Teff: 1e6, g: 1 }).bolometric, 1e-14);
  // Doğrudan: ∫ f⁻⁴ B_ν(f T) dν = σT⁴/π
  {
    const f = 1.7;
    const T = 6000;
    const Tc = f * T;
    const nuHi = 80 * (1.380649e-23 * Tc) / 6.62607015e-34;
    const I = simpson((u) => f ** -4 * planckNu(Math.exp(u), Tc) * Math.exp(u), Math.log(1e9), Math.log(nuHi), 20000);
    closeRel(I, (SIGMA_SB * T ** 4) / Math.PI, 1e-6);
  }
  assert.throws(() => observedBlackbody({ Teff: 1e4, g: 0 }), RangeError);
  assert.throws(() => observedBlackbody({ Teff: 1e4, g: 1, fCol: 0.5 }), RangeError);
});

test('Wyman CMF yaklaşımı: eşit-enerji normalizasyonu (belleğe dayalı CIE ≈106.86) ve ȳ(555) ≈ 1', () => {
  const s = [0, 0, 0];
  for (let nm = 360; nm <= 830; nm++) {
    const c = cieXYZBarWyman(nm);
    for (let k = 0; k < 3; k++) s[k] += c[k];
  }
  for (const v of s) closeRel(v, 106.86, 2e-3);
  const E = s[0] + s[1] + s[2];
  close(s[0] / E, 1 / 3, 1e-3);
  close(s[1] / E, 1 / 3, 1e-3);
  close(cieXYZBarWyman(555)[1], 1, 0.01);
  assert.ok(cieXYZBarWyman(450)[2] > 1.5 && cieXYZBarWyman(450)[0] < 0.5);
  assert.ok(cieXYZBarWyman(600)[0] > 0.9);
});

test('Kara cisim rengi: 6504 K ≈ D65 beyaz noktası; düşük T kırmızı, yüksek T mavimsi; Y normalizasyonu', () => {
  const w = blackbodyToLinearSRGB(6504);
  close(w.x, 0.3127, 0.01, 'D65 x');
  close(w.y, 0.329, 0.01, 'D65 y'); // Planck eğrisi D65'in ~0.005 altında (Δuv≈0.003); beklenen
  const mx = Math.max(...w.rgb);
  const mn = Math.min(...w.rgb);
  assert.ok(mx / mn < 1.06, `6504 K RGB oranları: ${w.rgb}`);
  const lo = blackbodyToLinearSRGB(2000).rgb;
  assert.ok(lo[0] > lo[1] && lo[1] > lo[2], `2000 K: ${lo}`);
  const hi = blackbodyToLinearSRGB(20000).rgb;
  assert.ok(hi[2] > hi[1] && hi[1] > hi[0], `20000 K: ${hi}`);
  // B/R tek biçimli artar
  let prev = -Infinity;
  for (let lg = 3; lg <= 5.0001; lg += 0.05) {
    const { rgb } = blackbodyToLinearSRGB(10 ** lg);
    const ratio = rgb[2] / rgb[0];
    assert.ok(ratio >= prev - 1e-12, `B/R monoton değil, log10T=${lg}`);
    prev = ratio;
    // Y = 0.2126729R + 0.7151522G + 0.0721750B = 1 (sRGB matrisinin tam tersi; gamut desaturasyonu dahil)
    close(0.2126729 * rgb[0] + 0.7151522 * rgb[1] + 0.072175 * rgb[2], 1, 1e-6, `Y, log10T=${lg}`);
    assert.ok(Math.min(...rgb) >= -1e-12, `negatif bileşen log10T=${lg}`);
  }
  // Gamut: 1900 K civarına kadar desaturasyon var, ≥3000 K'de yok
  assert.ok(blackbodyToLinearSRGB(1000).desaturation > 0);
  for (const T of [3000, 5000, 6504, 1e4, 3e4, 1e5]) assert.equal(blackbodyToLinearSRGB(T).desaturation, 0);
  // Luminans artar (T↑)
  assert.ok(blackbodyToLinearSRGB(1e4).luminance > blackbodyToLinearSRGB(5e3).luminance);
  assert.throws(() => blackbodyToLinearSRGB(0), RangeError);
});

test('Planck eğrisi bağımsız kontrol: Kim vd. 2002 polinomu (4000–25000 K, belleğe dayalı), |Δxy| < 2×10⁻³', () => {
  const kim = (T) => {
    const x = -3.0258469e9 / T ** 3 + 2.1070379e6 / T ** 2 + 0.2226347e3 / T + 0.24039;
    const y = 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
    return [x, y];
  };
  for (const T of [4000, 5000, 6504, 8000, 10000, 15000, 25000]) {
    const c = blackbodyToLinearSRGB(T);
    const [kx, ky] = kim(T);
    assert.ok(Math.hypot(c.x - kx, c.y - ky) < 2e-3, `T=${T}: (${c.x},${c.y}) vs (${kx},${ky})`);
  }
});

test('Yüksek-T luminans serisi αT − β + γ/T tam integrale uyar', () => {
  closeRel(blackbodyLuminanceSeries(1e5), blackbodyToLinearSRGB(1e5).luminance, 2e-3);
  closeRel(blackbodyLuminanceSeries(1e6), blackbodyToLinearSRGB(1e6).luminance, 1e-5);
  closeRel(blackbodyLuminanceSeries(1e7), blackbodyToLinearSRGB(1e7).luminance, 1e-6);
});

test('Kara cisim LUT: 256 giriş (RGBA32F), uçlar doğru, enterpolasyon hatası küçük', () => {
  const lut = blackbodyLUT(256);
  assert.equal(lut.data.length, 4 * 256);
  const a = blackbodyToLinearSRGB(1000);
  const b = blackbodyToLinearSRGB(1e5);
  close(lut.data[0], a.rgb[0], 1e-5 * a.rgb[0]);
  close(lut.data[3], Math.log10(a.luminance), 1e-5);
  close(lut.data[4 * 255 + 2], b.rgb[2], 1e-5 * b.rgb[2]);
  close(lut.data[4 * 255 + 3], Math.log10(b.luminance), 1e-5);
  const err = blackbodyLUTError(lut, 2001);
  assert.ok(err.maxRgbAbs < 3e-3, `RGB hata ${err.maxRgbAbs}`);
  assert.ok(err.maxLog10Y < 6e-4, `log10Y hata ${err.maxLog10Y}`);
  // Aralık dışı kıstırma
  assert.deepEqual(sampleBlackbodyLUT(lut, 500).rgb, sampleBlackbodyLUT(lut, 1000).rgb);
  assert.deepEqual(sampleBlackbodyLUT(lut, 1e7).rgb, sampleBlackbodyLUT(lut, 1e5).rgb);
});
