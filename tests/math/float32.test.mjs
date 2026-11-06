import test from 'node:test';
import assert from 'node:assert/strict';
import { runStudy, shadowErrorF32 } from '../../tools/float32-study.mjs';
import { createCamera } from '../../src/math/camera.js';
import { traceRay } from '../../src/math/raytracer.js';
import { deg } from './helpers.mjs';

const fmt = (x) => (Number.isFinite(x) ? x.toExponential(2) : 'n/a');
const base = { integrator: 'rk4', form: 'hamilton', maxSteps: 512, crossing: 'hermite', rEscape: 300 };

// Ortak referans (float64, DP5(4), rtol=1e-10) — bir kez hesaplanır
let REF = null;
function study(candidate, opts = {}) {
  const r = runStudy({ a: 0.9, thetaDeg: 75, rCam: 50, grid: 32, candidate, ref: REF, ...opts });
  REF = REF ?? r.refRows;
  return r;
}

test('6a. float32 RK4 (Hamilton, κ=0.05, N=512, Hermite) ↔ float64 DP5(4): disk kesişimi r ve g hataları', () => {
  const r = study({ ...base, precision: 'f32', kappa: 0.05 });
  console.log(
    `  32×32 piksel (a=0.9, θ_o=75°, r_cam=50): uyuşmazlık ${(100 * r.mismatchRate).toFixed(2)}% (${r.mismatch}/${r.nTot}), disk=${r.nDisk}, maxSteps=${r.nMaxSteps}, adım ort/maks=${r.stepsMean.toFixed(0)}/${r.stepsMax}\n` +
      `  Δr: med ${fmt(r.dr.med)} p90 ${fmt(r.dr.p90)} p99 ${fmt(r.dr.p99)} maks ${fmt(r.dr.max)};  Δφ p99 ${fmt(r.dphi.p99)};  Δg/g: med ${fmt(r.dg.med)} p99 ${fmt(r.dg.p99)};  yön hatası med ${fmt(r.ddir.med)} rad`
  );
  assert.ok(r.nDisk > 400);
  assert.ok(r.dr.med < 1e-4, `Δr medyan ${r.dr.med}`);
  assert.ok(r.dr.p90 < 2e-3, `Δr p90 ${r.dr.p90}`);
  assert.ok(r.dg.med < 1e-4);
  assert.ok(r.mismatchRate < 0.02, `uyuşmazlık ${r.mismatchRate}`);
  assert.ok(r.ddir.med < 2e-3, `kaçış yönü (rEscape=300) ${r.ddir.med}`);
  assert.ok(r.stepsMax <= 512);
});

test('6b. Hata kaynağı: kesme hatası (κ) baskın; f32 yuvarlaması f64-RK4 ile aynı mertebe; Hermite ≫ doğrusal kesişim', () => {
  const rows = {};
  for (const [name, c] of Object.entries({
    f64_h010: { ...base, precision: 'f64', kappa: 0.1 },
    f64_h005: { ...base, precision: 'f64', kappa: 0.05 },
    f64_h0025: { ...base, precision: 'f64', kappa: 0.025 },
    f32_h005: { ...base, precision: 'f32', kappa: 0.05 },
    f32_h005_lin: { ...base, precision: 'f32', kappa: 0.05, crossing: 'linear' },
  })) rows[name] = study(c);
  for (const [k, r] of Object.entries(rows)) console.log(`  ${k.padEnd(13)} Δr med ${fmt(r.dr.med)} p90 ${fmt(r.dr.p90)} p99 ${fmt(r.dr.p99)} | uyuşmazlık ${(100 * r.mismatchRate).toFixed(2)}% | adım ort ${r.stepsMean.toFixed(0)}`);
  // κ yarılandıkça (RK4: ~h⁴) medyan hata azalır
  assert.ok(rows.f64_h005.dr.med < rows.f64_h010.dr.med / 4);
  assert.ok(rows.f64_h0025.dr.med < rows.f64_h005.dr.med / 4);
  // f32 yuvarlaması κ=0.05'te baskın değil
  assert.ok(rows.f32_h005.dr.med < 5 * rows.f64_h005.dr.med + 5e-5);
  // Doğrusal kesişim enterpolasyonu belirgin biçimde kötüdür
  assert.ok(rows.f32_h005_lin.dr.med > 20 * rows.f32_h005.dr.med, 'doğrusal enterpolasyon en az 20× kötü olmalı');
});

test('6c. Biçim seçimi: float32 için Hamilton (p_r), Carter (u_r = dr/dσ ~ r²) biçiminden belirgin biçimde iyidir', () => {
  const H = study({ ...base, precision: 'f32', kappa: 0.05 });
  const C = study({ ...base, precision: 'f32', kappa: 0.05, form: 'carter' });
  console.log(`  uyuşmazlık: Hamilton ${(100 * H.mismatchRate).toFixed(2)}%  Carter ${(100 * C.mismatchRate).toFixed(2)}%;  Δr medyan: ${fmt(H.dr.med)} vs ${fmt(C.dr.med)}`);
  assert.ok(C.mismatchRate > 2 * H.mismatchRate);
  assert.ok(C.dr.med > 100 * H.dr.med);
});

test('6d. Gölge sınırı (yakalanma yarıçapı ρ_c): f32 − f64, r_cam = 30…500 (Hamilton, κ=0.05, N=1200)', () => {
  const errs = {};
  for (const rCam of [30, 50, 200, 500]) {
    const cand = { integrator: 'rk4', precision: 'f32', form: 'hamilton', kappa: 0.05, maxSteps: 1200, crossing: 'hermite', rEscape: Math.max(300, 2 * rCam) };
    errs[rCam] = shadowErrorF32({ a: 0.9, thetaDeg: 75, rCam, candidate: cand, nAngles: 8, iters: 24 }).max;
  }
  console.log('  max |Δρ_c|: ' + Object.entries(errs).map(([k, v]) => `r_cam=${k}: ${fmt(v)}`).join('  '));
  assert.ok(errs[30] < 5e-4 && errs[50] < 5e-4, 'r_cam ≤ 50: < 5e-4 M');
  assert.ok(errs[200] < 5e-3, 'r_cam = 200: < 5e-3 M');
  assert.ok(errs[500] > errs[50], 'hata r_cam ile büyür (p_r nicemlemesi ∝ r²ε₃₂)');
});

test('6e. Gölge sınırı adım bütçesi N\'ye bağlı: N küçüldükçe gölge şişer (maxSteps → "yakalandı")', () => {
  const errAt = (N) => shadowErrorF32({ a: 0.9, thetaDeg: 75, rCam: 50, nAngles: 8, iters: 24, candidate: { integrator: 'rk4', precision: 'f32', form: 'hamilton', kappa: 0.05, maxSteps: N, crossing: 'hermite', rEscape: 300 } });
  const e256 = errAt(256), e512 = errAt(512), e1024 = errAt(1024);
  console.log(`  N=256: max Δρ ${fmt(e256.max)} (ort ${fmt(e256.mean)});  N=512: ${fmt(e512.max)} (${fmt(e512.mean)});  N=1024: ${fmt(e1024.max)} (${fmt(e1024.mean)})`);
  assert.ok(e256.mean > e512.mean && e512.mean > 0, 'bütçe artınca şişme azalır (ortalama ρ_c fazlalığı)');
  assert.ok(e1024.max < 1e-3);
});

test('6f. Uç durum a=0.998, θ_o=85°: f32 öykünmesi NaN üretmez, tüm kesişimler sonlu ve g>0', () => {
  const cam = createCamera({ a: 0.998, rCam: 50, thetaCam: deg(85), width: 24, height: 24, fovY: deg(30) });
  let nanCount = 0, statusCount = {};
  for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) {
    const res = traceRay({ a: 0.998, rOut: 20 }, cam.pixelToRay(i, j), { ...base, precision: 'f32', kappa: 0.05, maxSteps: 400 });
    statusCount[res.status] = (statusCount[res.status] || 0) + 1;
    if (res.reason === 'nan') nanCount++;
    assert.ok(Number.isFinite(res.rEnd));
    for (const h of res.hits) assert.ok(Number.isFinite(h.r) && h.g > 0);
  }
  console.log('  a=0.998, θ_o=85°, 24×24: ' + JSON.stringify(statusCount) + `, NaN=${nanCount}`);
  assert.equal(nanCount, 0);
});
