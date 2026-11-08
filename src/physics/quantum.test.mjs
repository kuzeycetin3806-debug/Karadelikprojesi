/**
 * quantum.js testleri.  Çalıştırma:  npm test   (veya:  node --test "src/physics/*.test.mjs")
 * Birimler: SI (K, J/K, kg, s, m); kütle argümanı M☉. Geometrik birimler yalnızca surfaceGravityGeom'da (G=c=1, M⁻¹).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PHYSICAL_CONSTANTS,
  hawkingTemperatureK,
  surfaceGravityGeom,
  bekensteinHawkingEntropy,
  hawkingPeakWavelengthM,
  evaporationTimeS,
  hawkingLuminosityW,
  cmbEquilibriumMassSolar,
  planckUnits,
} from './quantum.js';
import { C, G_SI, GM_SUN, M_SUN_KG } from './units.js';
import { K_BOLTZMANN, H_PLANCK, SIGMA_SB } from './disk.js';
import { horizonRadii } from './kerr.js';

const { hbar, kB, sigma } = PHYSICAL_CONSTANTS;

function near(actual, expected, rel, msg) {
  const err = Math.abs(actual - expected) / Math.abs(expected);
  assert.ok(err <= rel, `${msg ?? ''} beklenen ${expected}, bulunan ${actual}, göreli hata ${err} > ${rel}`);
}

test('sabitler: units.js ve disk.js ile tutarlı', () => {
  assert.equal(PHYSICAL_CONSTANTS.c, C);
  assert.equal(PHYSICAL_CONSTANTS.G, G_SI);
  assert.equal(kB, K_BOLTZMANN);
  near(hbar, H_PLANCK / (2 * Math.PI), 1e-15);
  near(hbar, 1.054571817e-34, 1e-9, 'ħ CODATA 2018');
  near(sigma, 5.670374419e-8, 1e-9, 'σ CODATA 2018');
  near(sigma, SIGMA_SB, 1e-12, 'σ disk.js ile');
  assert.ok(Object.isFrozen(PHYSICAL_CONSTANTS));
});

test('Schwarzschild: T_H(1 M☉) ≈ 6.17e-8 K', () => {
  near(hawkingTemperatureK(1), 6.17e-8, 1e-3);
  // Bağımsız: ħc³/(8π G M k_B) doğrudan SI ile
  const direct = (hbar * C ** 3) / (8 * Math.PI * G_SI * M_SUN_KG * kB);
  near(hawkingTemperatureK(1, 0), direct, 1e-12);
});

test('T ∝ 1/M', () => {
  const T1 = hawkingTemperatureK(1);
  near(hawkingTemperatureK(10) * 10, T1, 1e-13);
  near(hawkingTemperatureK(4.3e6) * 4.3e6, T1, 1e-13);
  near(hawkingTemperatureK(0.01) * 0.01, T1, 1e-13);
  // Kerr'de de 1/M
  near(hawkingTemperatureK(7, 0.6) * 7, hawkingTemperatureK(1, 0.6), 1e-13);
});

test('yüzey çekimi: κ̂(0)=1/4, Kerr formülü ve ekstremal limit', () => {
  assert.equal(surfaceGravityGeom(0), 0.25);
  assert.equal(surfaceGravityGeom(), 0.25);
  // κ̂ = √(1−a²)/(2 r₊) kapalı biçimi
  for (const a of [0.1, 0.5, 0.9, 0.998]) {
    const { rPlus } = horizonRadii(1, a);
    near(surfaceGravityGeom(a), Math.sqrt((1 - a) * (1 + a)) / (2 * rPlus), 1e-12, `a=${a}`);
  }
  // monoton azalan, → 0
  let prev = surfaceGravityGeom(0);
  for (const a of [0.2, 0.5, 0.8, 0.95, 0.99, 0.999, 0.99999, 1 - 1e-9]) {
    const k = surfaceGravityGeom(a);
    assert.ok(k < prev, `a=${a} monoton azalmalı`);
    prev = k;
  }
  assert.ok(surfaceGravityGeom(1 - 1e-12) < 1e-5);
  assert.equal(surfaceGravityGeom(1), 0);
});

test('ekstremal Kerr: T → 0', () => {
  assert.equal(hawkingTemperatureK(1, 1), 0);
  assert.ok(hawkingTemperatureK(1, 1 - 1e-10) < 1e-9); // T(1 M☉, a=0) = 6e-8 K
  assert.ok(hawkingTemperatureK(10, 0.998) < hawkingTemperatureK(10, 0));
  near(hawkingTemperatureK(1, 0.998) / hawkingTemperatureK(1, 0), 4 * surfaceGravityGeom(0.998), 1e-12);
  assert.throws(() => hawkingPeakWavelengthM(1, 1), RangeError);
});

test('entropi: 1 M☉ ≈ 1.05e77 k_B, S ∝ M², alan ilişkisi', () => {
  const { S_over_kB, S_JK } = bekensteinHawkingEntropy(1);
  near(S_over_kB, 1.0489e77, 1e-3);
  assert.ok(S_over_kB > 1.0e77 && S_over_kB < 1.1e77);
  near(S_JK, S_over_kB * kB, 1e-14);
  near(bekensteinHawkingEntropy(10).S_over_kB / S_over_kB, 100, 1e-12);
  near(bekensteinHawkingEntropy(4.3e6).S_over_kB / S_over_kB, 4.3e6 ** 2, 1e-12);
  // S = k_B A c³/(4Għ), A = 16π(GM/c²)² (r_s = 2GM/c²)
  const rs = (2 * GM_SUN) / (C * C);
  const A = 4 * Math.PI * rs * rs;
  near(S_over_kB, (A * C ** 3) / (4 * G_SI * hbar), 1e-12);
  // Planck alanı biçimi: S/k_B = A /(4 ℓ_P²)
  const lP = planckUnits().lengthM;
  near(S_over_kB, A / (4 * lP * lP), 1e-12);
  // Kerr: a=0 → 2 M²; a→1 → yarıya iner (A_ext/A_schw = 1/2)
  near(bekensteinHawkingEntropy(1, 1).S_over_kB / S_over_kB, 0.5, 1e-12);
  assert.ok(bekensteinHawkingEntropy(1, 0.7).S_over_kB < S_over_kB);
  assert.ok(bekensteinHawkingEntropy(1, 0.7).S_over_kB > bekensteinHawkingEntropy(1, 1).S_over_kB);
});

test('birinci yasa (Schwarzschild, SI): c² dM = T dS', () => {
  const m0 = 10; // M☉
  const h = 1e-4 * m0;
  const dS = (bekensteinHawkingEntropy(m0 + h).S_JK - bekensteinHawkingEntropy(m0 - h).S_JK) / (2 * h); // J/K / M☉
  const dMkg = M_SUN_KG; // kg / M☉
  const T = hawkingTemperatureK(m0);
  near((T * dS) / dMkg, C * C, 1e-7, 'T dS/dM = c²');
  // Ayrık fark biçimi: ΔE = T ΔS
  const dE = C * C * (2 * h * M_SUN_KG);
  const dSfinite = bekensteinHawkingEntropy(m0 + h).S_JK - bekensteinHawkingEntropy(m0 - h).S_JK;
  near(T * dSfinite, dE, 1e-7);
});

test('birinci yasa (Kerr, sabit J): c² dM = T dS', () => {
  const m0 = 10;
  const a0 = 0.7;
  // J = a* G M²/c = a* (GM)² /(G c)  — M↔M(1±ε) ve a* = a0 (m0/M)² ile J sabit tutulur
  const state = (m) => ({ m, a: a0 * (m0 / m) ** 2 });
  const h = 1e-4 * m0;
  const s1 = state(m0 + h);
  const s2 = state(m0 - h);
  const dS = bekensteinHawkingEntropy(s1.m, s1.a).S_JK - bekensteinHawkingEntropy(s2.m, s2.a).S_JK;
  const dE = C * C * (2 * h * M_SUN_KG);
  near(hawkingTemperatureK(m0, a0) * dS, dE, 1e-6, 'Kerr: T dS = c² dM (dJ=0)');
});

test('tepe dalga boyu: λ = b/T, M ile doğru orantılı', () => {
  near(hawkingPeakWavelengthM(1) * hawkingTemperatureK(1), 2.897771955e-3, 1e-12);
  near(hawkingPeakWavelengthM(10) / hawkingPeakWavelengthM(1), 10, 1e-12);
  // 1 M☉: ≈ 47 km (r_s = 2.95 km'nin ~16 katı)
  near(hawkingPeakWavelengthM(1), 4.7e4, 5e-3);
});

test('buharlaşma süresi: 1 M☉ ≈ 2.1e67 yıl, t ∝ M³', () => {
  const e = evaporationTimeS(1);
  near(e.years, 2.1e67, 0.01);
  near(e.seconds / (365.25 * 86400), e.years, 1e-14);
  near(evaporationTimeS(10).seconds / e.seconds, 1000, 1e-12);
  near(evaporationTimeS(1e-3).seconds * 1e9, e.seconds, 1e-12);
  assert.ok(Array.isArray(e.assumptions) && e.assumptions.length > 0);
  assert.ok(e.assumptions.every((s) => typeof s === 'string'));
  // Bağımsız: t = 5120π G²M³/(ħc⁴) SI; 1 kg için ≈ 8.41e-17 s
  const t1kg = (5120 * Math.PI * G_SI ** 2) / (hbar * C ** 4);
  near(t1kg, 8.41e-17, 2e-3);
  near(e.seconds, t1kg * M_SUN_KG ** 3, 1e-12);
});

test('Hawking ışıma gücü: L = Aσ T⁴, 1 M☉ ≈ 9e-29 W, L ∝ 1/M²; ömürle tutarlılık', () => {
  const L = hawkingLuminosityW(1);
  near(L, 9.0e-29, 5e-3);
  near(hawkingLuminosityW(10) * 100, L, 1e-12);
  // L = ħ c⁶/(15360 π G² M²)
  near(L, (hbar * C ** 6) / (15360 * Math.PI * G_SI ** 2 * M_SUN_KG ** 2), 1e-12);
  // t = M c²/(3L) (dM/dt = −L/c², L ∝ M⁻²)
  near((M_SUN_KG * C * C) / (3 * L), evaporationTimeS(1).seconds, 1e-12);
});

test('CMB denge kütlesi: T_H = 2.7255 K, ≈ 4.5e22 kg ≈ Ay\'ın %61\'i', () => {
  const m = cmbEquilibriumMassSolar();
  near(hawkingTemperatureK(m), 2.7255, 1e-12);
  near(m * M_SUN_KG, 4.5e22, 5e-3);
  const moon = 7.342e22; // kg
  const frac = (m * M_SUN_KG) / moon;
  assert.ok(frac > 0.55 && frac < 0.67, `Ay kütlesi oranı ${frac}`);
  // Daha büyük delik CMB'den soğuk
  assert.ok(hawkingTemperatureK(1) < 2.7255);
  assert.ok(hawkingTemperatureK(m / 2) > 2.7255);
});

test('Planck birimleri (CODATA 2018)', () => {
  const p = planckUnits();
  near(p.lengthM, 1.616255e-35, 2e-6);
  near(p.timeS, 5.391247e-44, 2e-6);
  near(p.massKg, 2.176434e-8, 2e-6);
  near(p.temperatureK, 1.416784e32, 2e-6);
  near(p.lengthM / p.timeS, C, 1e-14);
});

test('örnek astrofiziksel kütleler: T_H ≪ T_CMB', () => {
  for (const m of [1, 10, 4.297e6, 6.5e9]) {
    assert.ok(hawkingTemperatureK(m) < 2.7255 / 1e7);
  }
});

test('geçersiz girdi → RangeError', () => {
  const bad = [0, -1, NaN, Infinity, undefined, 'x'];
  for (const m of bad) {
    assert.throws(() => hawkingTemperatureK(m), RangeError, `T m=${m}`);
    assert.throws(() => bekensteinHawkingEntropy(m), RangeError);
    assert.throws(() => hawkingPeakWavelengthM(m), RangeError);
    assert.throws(() => evaporationTimeS(m), RangeError);
    assert.throws(() => hawkingLuminosityW(m), RangeError);
  }
  for (const a of [-0.1, 1.0001, NaN, Infinity]) {
    assert.throws(() => hawkingTemperatureK(1, a), RangeError, `a=${a}`);
    assert.throws(() => surfaceGravityGeom(a), RangeError);
    assert.throws(() => bekensteinHawkingEntropy(1, a), RangeError);
  }
});
