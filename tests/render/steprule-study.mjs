/**
 * Adım kuralı çalışması (4c): GPU stepRule 'full' ↔ 'nodrag', R64'e (f64 DP5(4)) karşı, rastgele kamera kümesinde. `node --test` ile çalışmaz.
 *
 *     node tests/render/steprule-study.mjs [--cams=24] [--grid=64x48] [--seed=7]
 *
 * Amaç: gpu-validate'in sabit 13 kurulumundaki tek-tük sınıf çevirmelerinin (disk dış kenarı r_out'a ~1e-3 yakın ışınlar) kural farkı mı yoksa
 * rastgele kesme hatası mı olduğunu daha geniş örnekle ayırmak; ayrıca adım istatistiği (ortalama / p99 / en kötü) ve bütçe tükenmesi.
 * "Kenar duyarlı" çevirme: R64 disk kesişim yarıçapı r_out ya da r_isco'ya ≤ 1.5e-2 uzak (Hermite+RK4 kesme hatası ~ 5e-3 mertebesinde, yatay ışınlarda büyür).
 */
import { createCamera } from '../../src/math/camera.js';
import { traceRay, recommendedGpuBudget } from '../../src/math/raytracer.js';
import { iscoRadius } from '../../src/physics/kerr.js';
import { startHarness } from './harness.mjs';

const argv = Object.fromEntries(process.argv.slice(2).map((s) => { const m = s.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [s, true]; }));
const NC = Number(argv.cams ?? 24);
const [GW, GH] = String(argv.grid ?? '64x48').split('x').map(Number);
let seed = Number(argv.seed ?? 7);
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const A_SET = [0, 0.5, 0.9, 0.998];
const cams = [];
for (let c = 0; c < NC; c++) {
  const inPlane = c % 4 === 0;
  cams.push({
    a: A_SET[Math.floor(rnd() * A_SET.length)], thetaDeg: inPlane ? 90 : 20 + 70 * rnd(), rCam: [20, 30, 50][Math.floor(rnd() * 3)],
    prograde: rnd() < 0.8, phi: rnd() * 6.28,
  });
}
const NAMES = ['captured', 'escaped', 'disk'];
const cls = (r) => (r.status === 'maxSteps' ? (r.reason === 'budget' && r.fate ? r.fate : 'captured') : r.status);
const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const R_OUT = 20, R_ESC = 300;

const h = await startHarness({ width: 64, height: 48 });
const tot = { full: null, nodrag: null };
for (const k of Object.keys(tot)) tot[k] = { mism: 0, edgeMism: 0, otherMism: 0, clusters: 0, budget: 0, steps: [], px: 0, ms: 0, drAll: [] };
try {
  for (const cam of cams) {
    const th = (cam.thetaDeg * Math.PI) / 180;
    const fovY = 2 * Math.atan(14 / cam.rCam);
    const camera = createCamera({ a: cam.a, rCam: cam.rCam, thetaCam: th, phiCam: cam.phi, fovY, width: GW, height: GH });
    const params = { a: cam.a, rOut: R_OUT, prograde: cam.prograde };
    const rIsco = iscoRadius(1, cam.a, cam.prograde);
    const ref = [];
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) ref.push(traceRay(params, camera.pixelToRay(i, j), { rtol: 1e-10, atol: 1e-12, maxDiskHits: 1, rEscape: R_ESC }));
    for (const rule of ['full', 'nodrag']) {
      const raw = await h.page.evaluate(async (qq) => {
        const r = window.__karadelik.renderer;
        r.setParams(qq.params);
        const t = performance.now();
        const d = await r.renderDebug(qq.w, qq.h);
        return { d: Array.from(d), ms: performance.now() - t };
      }, {
        params: { a: cam.a, thetaCam: th, rCam: cam.rCam, phiCam: cam.phi, fovY: (fovY * 180) / Math.PI, diskIn: 'isco', diskOut: R_OUT, prograde: cam.prograde, quality: 'high', maxDiskHits: 1, analyticFate: true, rEscape: R_ESC, planeGuard: true, stepRule: rule },
        w: GW, h: GH,
      });
      const T = tot[rule];
      T.ms += raw.ms;
      const bad = [];
      for (let k = 0; k < GW * GH; k++) {
        const o = k * 12;
        const rc = cls(ref[k]);
        T.px++;
        T.steps.push(raw.d[o + 3]);
        if (raw.d[o + 8] === 1) T.budget++;
        if (NAMES[raw.d[o]] !== rc) {
          T.mism++;
          const rr = ref[k].hits[0]?.r;
          const edge = rr !== undefined && (Math.abs(rr - R_OUT) < 1.5e-2 || Math.abs(rr - rIsco) < 1.5e-2);
          if (edge) T.edgeMism++; else T.otherMism++;
          bad.push([k % GW, Math.floor(k / GW)]);
        }
        if (ref[k].hits.length && raw.d[o + 7] > 0) T.drAll.push(Math.abs(raw.d[o + 1] - ref[k].hits[0].r));
      }
      for (const [x, y] of bad) if (bad.some(([u, v]) => (u !== x || v !== y) && Math.abs(u - x) <= 4 && Math.abs(v - y) <= 4)) { T.clusters++; }
    }
  }
} finally {
  await h.close();
}
console.log(`Rastgele ${NC} kamera (her 4'ün biri θ=90° tam düzlemde), ızgara ${GW}×${GH}, r_out=${R_OUT}, κ=0.05/N=recommendedGpuBudget(analytic), R64 = DP5(4) rtol 1e-10\n`);
console.log('kural    | piksel  | R64 sınıf uyuşmazlığı | kenar-duyarlı / diğer | kümeli piksel | bütçesi biten | adım ort / p99 / en kötü | Δr med / p99 | GPU ms (SwiftShader, toplam)');
for (const rule of ['full', 'nodrag']) {
  const T = tot[rule];
  console.log(`${rule.padEnd(8)} | ${String(T.px).padStart(7)} | ${String(T.mism).padStart(8)} (%${(100 * T.mism / T.px).toFixed(3)}) | ${String(T.edgeMism).padStart(5)} / ${String(T.otherMism).padEnd(5)} | ${String(T.clusters).padStart(6)} | ${String(T.budget).padStart(6)} | ${(T.steps.reduce((x, y) => x + y, 0) / T.px).toFixed(1)} / ${q(T.steps, 0.99)} / ${T.steps.reduce((x, y) => Math.max(x, y), 0)} | ${q(T.drAll, 0.5).toExponential(1)} / ${q(T.drAll, 0.99).toExponential(1)} | ${T.ms.toFixed(0)}`);
}
