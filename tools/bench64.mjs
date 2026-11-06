/**
 * 64×64 ışınlık ekranın CPU (Node.js, tek iş parçacığı) süre ölçümü.
 * Kullanım: node tools/bench64.mjs [a] [theta_deg] [rCam] [reps]
 */
import { createCamera } from '../src/math/camera.js';
import { traceRay } from '../src/math/raytracer.js';

const a = Number(process.argv[2] ?? 0.9);
const thetaDeg = Number(process.argv[3] ?? 75);
const rCam = Number(process.argv[4] ?? 50);
const reps = Number(process.argv[5] ?? 5);
const W = 64;
const cam = createCamera({ a, rCam, thetaCam: (thetaDeg * Math.PI) / 180, width: W, height: W, fovY: 2 * Math.atan(14 / rCam) });
const rays = [];
for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) rays.push(cam.pixelToRay(i, j));

const configs = [
  ['DP5(4) f64 rtol=1e-10 (referans), Hamilton', { integrator: 'dp45', rtol: 1e-10, atol: 1e-12 }, 1],
  ['DP5(4) f64 rtol=1e-8, Hamilton', { integrator: 'dp45', rtol: 1e-8, atol: 1e-10 }, 1],
  ['DP5(4) f64 rtol=1e-10, maxDiskHits=4', { integrator: 'dp45', rtol: 1e-10, atol: 1e-12 }, 4],
  ['RK4 f64 κ=0.05 (GPU kuralı), N=512', { integrator: 'rk4', precision: 'f64', kappa: 0.05, maxSteps: 512, crossing: 'hermite', rEscape: 300 }, 1],
  ['RK4 f32-öykünme κ=0.05, N=512', { integrator: 'rk4', precision: 'f32', kappa: 0.05, maxSteps: 512, crossing: 'hermite', rEscape: 300 }, 1],
  ['RK4 f32-öykünme κ=0.10, N=256', { integrator: 'rk4', precision: 'f32', kappa: 0.1, maxSteps: 256, crossing: 'hermite', rEscape: 300 }, 1],
];

console.log(`# 64×64 = ${W * W} ışın, a=${a}, θ_o=${thetaDeg}°, r_cam=${rCam}, disk r_out=20; Node ${process.version}; en iyi/${reps} tekrar`);
for (const [name, opts, hits] of configs) {
  // ısınma
  for (let k = 0; k < 200; k++) traceRay({ a, rOut: 20 }, rays[k * 20 % rays.length], { ...opts, maxDiskHits: hits });
  let best = Infinity, steps = 0, st = {};
  for (let rep = 0; rep < reps; rep++) {
    const t0 = performance.now();
    let s = 0;
    const cnt = {};
    for (const ray of rays) {
      const res = traceRay({ a, rOut: 20 }, ray, { ...opts, maxDiskHits: hits });
      s += res.steps + res.rejected;
      cnt[res.status] = (cnt[res.status] || 0) + 1;
    }
    const dt = performance.now() - t0;
    if (dt < best) { best = dt; steps = s; st = cnt; }
  }
  console.log(`${name.padEnd(48)} ${best.toFixed(0).padStart(5)} ms  (${((best * 1000) / rays.length).toFixed(0).padStart(4)} µs/ışın, ort. ${(steps / rays.length).toFixed(0)} adım/ışın)  ${JSON.stringify(st)}`);
}
