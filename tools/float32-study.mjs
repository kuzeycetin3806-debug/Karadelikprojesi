/**
 * float32 (GPU) öykünmesi ↔ float64 referansı karşılaştırma çalışması.
 *
 * Referans : DP5(4), Hamilton biçimi, rtol=1e-10, float64.
 * Aday     : sabit-formüllü RK4 (h = κ · h_nat), Math.fround ile her işlemde yuvarlama,
 *            form ∈ {hamilton, carter}, adım bütçesi N, kesişim yöntemi ∈ {linear, hermite}.
 *
 * Ölçülen: (i) sınıflandırma uyuşmazlığı, (ii) disk kesişim yarıçapı ve g hatası,
 *          (iii) gölge sınırı (yakalanma yarıçapı ρ_c) hatası.
 *
 * Kullanım: node tools/float32-study.mjs [a] [theta_deg] [rCam] [grid] [guard=both|on|off]
 *   guard: eksen koruması (raytracer.js `axisGuard`, varsayılan AÇIK). `both` (varsayılan) her yapılandırmayı KAPALI ve AÇIK koşar;
 *   KAPALI sütunu eksen-sıçrama hatasını içeren eski davranıştır (README §7 notu).
 * (testler `runStudy` ve `shadowErrorF32` fonksiyonlarını kullanır)
 */
import { createCamera } from '../src/math/camera.js';
import { traceRay } from '../src/math/raytracer.js';
import { shadowRadiusAlong } from './shadow-scan.mjs';

const deg = (d) => (d * Math.PI) / 180;

function stats(v) {
  if (v.length === 0) return { n: 0, max: NaN, rms: NaN, med: NaN, p90: NaN, p99: NaN };
  const s = [...v].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    n: v.length,
    max: s[s.length - 1],
    rms: Math.sqrt(v.reduce((x, y) => x + y * y, 0) / v.length),
    med: q(0.5),
    p90: q(0.9),
    p99: q(0.99),
  };
}

/**
 * 'maxSteps' (bütçe bitti): rule 'numeric' → "yakalandı" (sayısal yaklaşım); rule 'analytic' → res.fate.
 */
const shaderClass = (res, rule = 'numeric') =>
  res.status === 'maxSteps' ? (rule === 'analytic' && res.fate ? res.fate : 'captured') : res.status;

/**
 * Piksel ızgarası üzerinde f32 adayını f64 referansıyla karşılaştırır.
 * @returns {object} istatistikler
 */
export function runStudy({ a, thetaDeg, rCam = 50, grid = 40, halfWidth = 14, rOut = 20, candidate, refOpts = {}, ref, budgetRule = 'numeric' }) {
  const th = deg(thetaDeg);
  const cam = createCamera({ a, rCam, thetaCam: th, fovY: 2 * Math.atan(halfWidth / rCam), width: grid, height: grid });
  const params = { a, rOut };
  const dr = [], dg = [], dphi = [], ddir = [];
  let mismatch = 0, nDisk = 0, nTot = 0, nMaxSteps = 0, stepSum = 0, stepMax = 0;
  const rows = [];
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const ray = cam.pixelToRay(i, j);
      const R = ref ? ref[j * grid + i] : traceRay(params, ray, { rtol: 1e-10, atol: 1e-12, ...refOpts });
      const C = traceRay(params, ray, candidate);
      nTot++;
      stepSum += C.steps; stepMax = Math.max(stepMax, C.steps);
      if (C.status === 'maxSteps') nMaxSteps++;
      const rs = shaderClass(R, budgetRule), cs = shaderClass(C, budgetRule);
      if (rs !== cs) mismatch++;
      if (R.status === 'escaped' && C.status === 'escaped') {
        const u = R.escape.dir, w = C.escape.dir;
        ddir.push(Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1] + u[2] * w[2]))));
      }
      if (R.status === 'disk' && C.status === 'disk') {
        nDisk++;
        dr.push(Math.abs(C.hits[0].r - R.hits[0].r));
        dg.push(Math.abs(C.hits[0].g / R.hits[0].g - 1));
        let dp = Math.abs(C.hits[0].phi - R.hits[0].phi);
        if (dp > Math.PI) dp = 2 * Math.PI - dp;
        dphi.push(dp);
      }
      rows.push(R);
    }
  }
  return {
    nTot, nDisk, mismatch, mismatchRate: mismatch / nTot, nMaxSteps,
    stepsMean: stepSum / nTot, stepsMax: stepMax,
    dr: stats(dr), dg: stats(dg), dphi: stats(dphi), ddir: stats(ddir),
    refRows: rows,
  };
}

/**
 * Gölge sınırı (ρ_c) f32 adayı − f64 referansı. Aynı kamera (impactToRay, r_cam), 12 doğrultu.
 */
export function shadowErrorF32({ a, thetaDeg, rCam = 50, candidate, nAngles = 12, iters = 26, budgetRule = 'numeric' }) {
  const th = deg(thetaDeg);
  const cam = createCamera({ a, rCam, thetaCam: th });
  const errs = [];
  for (let k = 0; k < nAngles; k++) {
    const chi = ((k + 0.37) * 2 * Math.PI) / nAngles;
    const ref = shadowRadiusAlong(cam, { a }, chi, { iters, rtol: 1e-10, atol: 1e-12 });
    const f32 = shadowRadiusAlong(cam, { a }, chi, { iters, budgetRule, ...candidate });
    errs.push(f32 - ref);
  }
  return { errs, max: Math.max(...errs.map(Math.abs)), mean: errs.reduce((x, y) => x + y, 0) / errs.length };
}

const fmt = (x) => (Number.isFinite(x) ? x.toExponential(2) : 'n/a');

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = Number(process.argv[2] ?? 0.9);
  const thetaDeg = Number(process.argv[3] ?? 75);
  const rCam = Number(process.argv[4] ?? 50);
  const grid = Number(process.argv[5] ?? 40);
  const guardArg = process.argv[6] ?? 'both';
  const guards = guardArg === 'on' ? [true] : guardArg === 'off' ? [false] : [false, true];
  console.log(`# float32 çalışması: a=${a} θ_o=${thetaDeg}° r_cam=${rCam} ızgara=${grid}×${grid}`);
  let ref;
  const configs = [];
  for (const form of ['hamilton', 'carter'])
    for (const kappa of [0.2, 0.1, 0.05])
      for (const N of [128, 256, 512])
        for (const guard of guards)
          configs.push({ form, kappa, N, guard });
  console.log('form      κ     N    guard | uyuşmazlık  maxSteps  adım(ort/max) | Δr max / rms     | Δg_göreli max   | gölge Δρ max');
  for (const c of configs) {
    const cand = { integrator: 'rk4', precision: 'f32', form: c.form, kappa: c.kappa, maxSteps: c.N, crossing: 'hermite', axisGuard: c.guard };
    const r = runStudy({ a, thetaDeg, rCam, grid, candidate: cand, ref });
    ref = r.refRows;
    const sh = shadowErrorF32({ a, thetaDeg, rCam, candidate: cand });
    console.log(
      `${c.form.padEnd(9)} ${String(c.kappa).padEnd(5)} ${String(c.N).padEnd(4)} ${(c.guard ? 'AÇIK' : 'KAPALI').padEnd(6)}| ` +
        `${(100 * r.mismatchRate).toFixed(2).padStart(6)}%    ${String(r.nMaxSteps).padStart(5)}    ${r.stepsMean.toFixed(0).padStart(4)}/${String(r.stepsMax).padEnd(4)}  | ` +
        `${fmt(r.dr.max)} ${fmt(r.dr.rms)} | ${fmt(r.dg.max)}    | ${fmt(sh.max)}`
    );
  }
}
