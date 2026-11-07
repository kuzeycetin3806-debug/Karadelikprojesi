// Denetim 2 (commit efa2924) düzeltmelerinin testleri: Ö1 kaçış yönü, Ö2 θ_cam=π/2, Ö3 bütçe sınıflandırması.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCamera } from '../../src/math/camera.js';
import { traceRay, recommendedGpuBudget } from '../../src/math/raytracer.js';
import * as G from '../../src/math/geodesic.js';
import { runStudy, shadowErrorF32 } from '../../tools/float32-study.mjs';
import { deg, slope } from './helpers.mjs';

const fmt = (x) => x.toExponential(2);
const ang = (u, w) => Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1] + u[2] * w[2])));

// ---------------------------------------------------------------------------
// Ö1. Kaçış yönü ekstrapolasyonu: θ'' = −F[4], φ'' terimi
// ---------------------------------------------------------------------------
test('Ö1a. Düz-uzay-benzeri: r=300, θ=60°, p_θ=0 (Schwarzschild, L=8) → θ_∞ ≈ 1.047471 (büyük daire ekvatora doğru bükülür)', () => {
  const L = 8, th = Math.PI / 3;
  const Q = G.carterConstant(0, 1, L, th, 0);
  const ray = { r: 300, theta: th, phi: 0, lambda: L, pTheta: 0, signR: -1, Q };
  // Analitik düz uzay: b = L/sinθ, süpürülen açı δ = asin(b/r); cosθ_∞ = sin(i) cosδ, sin i = cosθ0
  const b = L / Math.sin(th);
  const flat = Math.acos(Math.cos(th) * Math.cos(Math.asin(b / 300)));
  const m = traceRay({ a: 0, disk: false }, ray, { rtol: 1e-12, atol: 1e-14, rEscape: 299 });
  const ref = traceRay({ a: 0, disk: false }, ray, { rtol: 1e-12, atol: 1e-14, rEscape: 1e5, maxSteps: 200000 });
  console.log(`  θ_∞: modül(r_esc≈300)=${m.escape.theta.toFixed(7)}  DP5 r_esc=1e5: ${ref.escape.theta.toFixed(7)}  düz uzay analitik=${flat.toFixed(7)}  (eski hatalı formül: 1.046924)`);
  assert.ok(Math.abs(m.escape.theta - 1.047471) < 1e-5, `θ_∞=${m.escape.theta}`);
  assert.ok(Math.abs(m.escape.theta - ref.escape.theta) < 1e-6);
  assert.ok(Math.abs(m.escape.theta - flat) < 1e-5);
  assert.ok(m.escape.theta > th, 'ışın ekvatora doğru (θ artar) bükülmeli');
});

test('Ö1b. L≠0, θ≠π/2: küçük r_esc kaçış yönü hatası (b/r_esc)³ ile ölçeklenir (referans: aynı ışın, r_esc=1e5 DP5)', () => {
  const pix = [[16, -9], [-12, 10], [12, -9], [8, 10], [-12, -9], [16, 6], [20, 12], [-18, -14]];
  for (const [a, thD] of [[0.9, 75], [0.998, 60], [0.5, 40]]) {
    const cam = createCamera({ a, rCam: 50, thetaCam: deg(thD) });
    const rEscs = [300, 600, 1200, 2400];
    const maxErr = rEscs.map(() => 0);
    let n = 0;
    for (const [X, Y] of pix) {
      const ray = cam.screenToRay(X / 50, Y / 50);
      const o = { rtol: 1e-12, atol: 1e-14 };
      const ref = traceRay({ a, disk: false }, ray, { ...o, rEscape: 1e5, maxSteps: 200000 });
      if (ref.status !== 'escaped') continue;
      n++;
      assert.ok(Math.abs(ref.L) > 0.5 && Math.abs(Math.cos(ref.escape.theta)) > 0.05, 'L≠0 ve θ≠π/2 olmalı');
      rEscs.forEach((re, i) => {
        const m = traceRay({ a, disk: false }, ray, { ...o, rEscape: re });
        assert.equal(m.status, 'escaped');
        maxErr[i] = Math.max(maxErr[i], ang(m.escape.dir, ref.escape.dir));
      });
    }
    const s = slope(rEscs, maxErr);
    console.log(`  a=${a} θ_o=${thD}° (${n} ışın): max hata r_esc=300/600/1200/2400: ${maxErr.map(fmt).join(' / ')}; log-log eğim = ${s.toFixed(2)} (beklenen −3)`);
    assert.ok(n >= 6);
    assert.ok(s < -2.6 && s > -3.4, `eğim ${s}`);
    assert.ok(maxErr[0] < 3e-4, `r_esc=300 hatası ${maxErr[0]}`);
  }
});

test('Ö1c. escapeSecondDerivatives: θ\'\' = −F[4]; θ\'\' ve φ\'\' izleme zamanında sonlu farkla (F(y±εF)) uyuşur', () => {
  const a = 0.9, L = 3.1, th = 1.1, r = 40;
  const Q = G.carterConstant(a, 1, L, th, 0.7);
  const f = G.makeRhsHamilton(a, 1, L, -1);
  const y = Float64Array.of(r, th, 0.2, G.radialMomentum(a, 1, L, Q, r, -1), 0.7, 0);
  const F = new Float64Array(6);
  f(y, F);
  const d2 = G.escapeSecondDerivatives(a, L, r, th, F);
  const eps = 1e-6, yp = Float64Array.from(y), ym = Float64Array.from(y), Fp = new Float64Array(6), Fm = new Float64Array(6);
  for (let i = 0; i < 6; i++) { yp[i] += eps * F[i]; ym[i] -= eps * F[i]; }
  f(yp, Fp); f(ym, Fm);
  const fdTh = (Fp[1] - Fm[1]) / (2 * eps), fdPh = (Fp[2] - Fm[2]) / (2 * eps);
  console.log(`  θ'': analitik ${d2.thetaPP.toFixed(8)} (−F4=${(-F[4]).toFixed(8)}) sonlu fark ${fdTh.toFixed(8)};  φ'': ${d2.phiPP.toExponential(6)} vs ${fdPh.toExponential(6)}`);
  assert.ok(Math.abs(d2.thetaPP - fdTh) < 1e-6 * Math.abs(fdTh) + 1e-9);
  assert.ok(Math.abs(d2.phiPP - fdPh) < 1e-6 * Math.abs(fdPh) + 1e-9);
  assert.equal(d2.thetaPP, -F[4]);
});

// ---------------------------------------------------------------------------
// Ö2. θ_cam = π/2: kameranın kendisi düzlem kesişimi sayılmaz
// ---------------------------------------------------------------------------
for (const prec of ['f64', 'f32']) {
  for (const rC of [15, 50]) {
    test(`Ö2. θ_cam=π/2, r_cam=${rC}, ${prec}: sahte kamera vuruşu yok; üst/alt yarı ayna simetrik (durum, n, r)`, () => {
      const a = 0.9;
      const th = prec === 'f32' ? Math.fround(Math.PI / 2) : Math.PI / 2; // GPU'da θ_cam float32 gelir
      const cam = createCamera({ a, rCam: rC, thetaCam: th });
      const o = prec === 'f64'
        ? { rtol: 1e-12, atol: 1e-14 }
        : { integrator: 'rk4', precision: 'f32', kappa: 0.05, maxSteps: 512, crossing: 'hermite', rEscape: 300 };
      const run = (opts, x, y) => traceRay({ a, rOut: 20 }, cam.screenToRay(x / rC, y / rC), opts);
      let asym = 0, asymOld = 0, fake = 0, fakeOld = 0, tot = 0, maxdr = 0, nHit = 0;
      for (const X of [-12, -8, -5, -3, 0.5, 3, 5, 8, 12]) for (const Y of [1, 2, 4, 6, 9]) {
        const up = run(o, X, Y), dn = run(o, X, -Y);
        const upO = run({ ...o, planeEps: 0 }, X, Y), dnO = run({ ...o, planeEps: 0 }, X, -Y); // koruma kapalı (eski davranış)
        tot++;
        const isFake = (t) => t.hits.some((h) => h.step === 1 && Math.abs(h.r - rC) < 1e-3);
        fake += [up, dn].filter(isFake).length;
        fakeOld += [upO, dnO].filter(isFake).length;
        const same = (p, q) => p.status === q.status && p.hits.length === q.hits.length && p.hits.every((h, i) => h.n === q.hits[i].n);
        if (!same(up, dn)) asym++;
        if (!same(upO, dnO)) asymOld++;
        up.hits.forEach((h, i) => { maxdr = Math.max(maxdr, Math.abs(h.r - dn.hits[i].r)); nHit++; assert.equal(h.n, 1, 'birincil görüntü n=1'); });
      }
      console.log(`  ${tot} ayna çifti: sahte vuruş ${fake} (koruma kapalıyken ${fakeOld}); asimetrik çift ${asym} (kapalıyken ${asymOld}); ${nHit} vuruşta max |r_üst − r_alt| = ${fmt(maxdr)}`);
      assert.equal(fake, 0);
      assert.equal(asym, 0);
      assert.ok(nHit > 5);
      assert.ok(maxdr < (prec === 'f64' ? 1e-8 : 5e-4), `ayna farkı ${maxdr}`);
      assert.ok(asymOld > 0 || fakeOld > 0, 'test duyarlı olmalı: koruma kapalıyken hata görülmeli');
    });
  }
}

// ---------------------------------------------------------------------------
// Ö3. Bütçesi biten ışının analitik sınıflandırması
// ---------------------------------------------------------------------------
test('Ö3a. hasTurningPointBelow: Schwarzschild b_c(1∓1e-4) için r=10\'da kök var/yok; Kerr prograd kritik b için de', () => {
  const bc = 3 * Math.sqrt(3);
  assert.equal(G.hasTurningPointBelow(0, bc * (1 - 1e-4), 0, 10), false);
  assert.equal(G.hasTurningPointBelow(0, bc * (1 + 1e-4), 0, 10), true);
  // r=2.9: foton küresinin içi; kök (3'te) aralığın dışında → yok (yakalanır)
  assert.equal(G.hasTurningPointBelow(0, bc * (1 + 1e-4), 0, 2.9), false);
  // izleyici ile tutarlılık: DP5 kararı ↔ kök varlığı (kamera r=50, a=0.9, θ=75°)
  const cam = createCamera({ a: 0.9, rCam: 50, thetaCam: deg(75) });
  let n = 0, bad = 0;
  for (let k = 0; k < 120; k++) {
    const rho = 4 + 3 * (k / 120), chi = (2 * Math.PI * k) / 120 + 0.1;
    const ray = cam.impactToRay(rho * Math.cos(chi), rho * Math.sin(chi));
    const res = traceRay({ a: 0.9, disk: false }, ray, { rtol: 1e-11, atol: 1e-13 });
    const predicted = !G.hasTurningPointBelow(0.9, ray.lambda, ray.Q, ray.r); // kök yok ⇒ yakalanır
    if (res.status === 'captured' || res.status === 'escaped') { n++; if (predicted !== (res.status === 'captured')) bad++; }
  }
  console.log(`  ${n} ışın: analitik (kök yok ⇒ yakalandı) ↔ DP5 durumu uyuşmazlığı = ${bad}`);
  assert.ok(n > 100);
  assert.equal(bad, 0);
});

test('Ö3b. f32 RK4 N=512, a=0.998: bütçesi biten ışınların fate\'i DP5 referansıyla uyuşur; N=512 yeterli', () => {
  for (const thD of [60, 85]) {
    const rec = recommendedGpuBudget(0.998);
    assert.equal(rec.maxSteps, 512);
    const cand = { integrator: 'rk4', precision: 'f32', form: 'hamilton', kappa: rec.kappa, maxSteps: rec.maxSteps, crossing: 'hermite', rEscape: 300 };
    const cam = createCamera({ a: 0.998, rCam: 50, thetaCam: deg(thD), width: 40, height: 40, fovY: 2 * Math.atan(14 / 50) });
    let exhausted = 0, badFate = 0;
    for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) {
      const ray = cam.pixelToRay(i, j);
      const C = traceRay({ a: 0.998, rOut: 20 }, ray, cand);
      if (C.status !== 'maxSteps') continue;
      exhausted++;
      const R = traceRay({ a: 0.998, rOut: 20 }, ray, { rtol: 1e-10, atol: 1e-12 });
      if (R.status === 'captured' && C.fate !== 'captured') badFate++;
    }
    console.log(`  a=0.998 θ_o=${thD}°: bütçesi biten ${exhausted}/1600 piksel; DP5 'captured' iken fate≠captured = ${badFate}`);
    assert.ok(exhausted > 5);
    assert.equal(badFate, 0);
  }
});

test('Ö3c. Gölge şişmesi (f32−f64 ρ_c, N=512, κ=0.05, a=0.998): "bütçe→yakalandı" (sayısal yaklaşım) vs analitik sınıflandırma', () => {
  const cand = { integrator: 'rk4', precision: 'f32', form: 'hamilton', kappa: 0.05, maxSteps: 512, crossing: 'hermite', rEscape: 300 };
  for (const thD of [60, 85]) {
    const num = shadowErrorF32({ a: 0.998, thetaDeg: thD, rCam: 50, candidate: cand, nAngles: 12, iters: 22, budgetRule: 'numeric' });
    const ana = shadowErrorF32({ a: 0.998, thetaDeg: thD, rCam: 50, candidate: cand, nAngles: 12, iters: 22, budgetRule: 'analytic' });
    console.log(`  θ_o=${thD}°: sayısal kural max/ort Δρ_c = ${fmt(num.max)} / ${fmt(num.mean)} M;  analitik: ${fmt(ana.max)} / ${fmt(ana.mean)} M  (azalma ×${(num.max / ana.max).toFixed(0)})`);
    assert.ok(num.max > 5e-2, `sayısal kural belirgin şişirmeli: ${num.max}`);
    assert.ok(ana.max < 2e-4, `analitik kural f32 düzeyinde kalmalı: ${ana.max}`);
  }
  // N'den bağımsızlık
  const cand256 = { ...cand, maxSteps: 256 };
  const a256 = shadowErrorF32({ a: 0.998, thetaDeg: 60, rCam: 50, candidate: cand256, nAngles: 12, iters: 22, budgetRule: 'analytic' });
  console.log(`  analitik, N=256: max Δρ_c = ${fmt(a256.max)}`);
  assert.ok(a256.max < 2e-4);
});

test('Ö3d. recommendedGpuBudget: analitik kuralda N=512; sayısal kuralda spine bağlı', () => {
  assert.equal(recommendedGpuBudget(0.998).maxSteps, 512);
  assert.equal(recommendedGpuBudget(0.998, false).maxSteps, 2048);
  assert.equal(recommendedGpuBudget(0.9, false).maxSteps, 1024);
  assert.equal(recommendedGpuBudget(0.5, false).maxSteps, 512);
});

test('Ö3e. İsteğe bağlı stepRule:"nodrag" (çerçeve sürüklenmesi adım kuralından dışlanır): a=0.998 en kötü adım sayısı düşer; doğruluk bedeli ölçülür', () => {
  const base = { integrator: 'rk4', precision: 'f32', form: 'hamilton', kappa: 0.05, maxSteps: 512, crossing: 'hermite', rEscape: 300 };
  const full = runStudy({ a: 0.998, thetaDeg: 60, rCam: 50, grid: 24, candidate: base, budgetRule: 'analytic' });
  const nod = runStudy({ a: 0.998, thetaDeg: 60, rCam: 50, grid: 24, candidate: { ...base, stepRule: 'nodrag' }, ref: full.refRows, budgetRule: 'analytic' });
  console.log(`  full: maxSteps-px ${full.nMaxSteps}, adım ort/maks ${full.stepsMean.toFixed(0)}/${full.stepsMax}, Δr med ${fmt(full.dr.med)} p99 ${fmt(full.dr.p99)};  nodrag: ${nod.nMaxSteps}, ${nod.stepsMean.toFixed(0)}/${nod.stepsMax}, Δr med ${fmt(nod.dr.med)} p99 ${fmt(nod.dr.p99)}`);
  assert.ok(nod.stepsMax < 0.7 * full.stepsMax);
  assert.ok(nod.dr.med < 3 * full.dr.med + 1e-5);
});
