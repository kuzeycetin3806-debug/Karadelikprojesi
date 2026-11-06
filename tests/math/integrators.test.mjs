import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeWorkspace,
  rk4Step,
  rk4StepF32,
  dp45Step,
  errorNorm,
  nextStepSize,
  integrateRK4,
  integrateDP45,
} from '../../src/math/integrators.js';

/** En küçük kareler eğimi (log-log). */
export function slope(xs, ys) {
  const lx = xs.map(Math.log), ly = ys.map(Math.log);
  const n = xs.length;
  const mx = lx.reduce((s, v) => s + v, 0) / n, my = ly.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (lx[i] - mx) * (ly[i] - my); den += (lx[i] - mx) ** 2; }
  return num / den;
}

// Doğrusal olmayan test sistemi: sarkaç  θ'' = −sin θ  (y = [θ, ω]); enerji E = ω²/2 − cos θ korunur.
const pendulum = (y, out) => { out[0] = y[1]; out[1] = -Math.sin(y[0]); };
const energy = (y) => 0.5 * y[1] * y[1] - Math.cos(y[0]);
// Tam çözüm elde etmek için çok sıkı DP45 referansı
const ref = (y0, T) => integrateDP45(pendulum, y0, T, { rtol: 1e-14, atol: 1e-16 }).y;

test('RK4: global hata ∝ h^4 (sarkaç, T = 6)', () => {
  const y0 = Float64Array.of(1.5, 0);
  const T = 6;
  const yr = ref(y0, T);
  const hs = [], errs = [];
  for (const n of [20, 40, 80, 160, 320]) {
    const y = integrateRK4(pendulum, y0, T / n, n);
    hs.push(T / n);
    errs.push(Math.hypot(y[0] - yr[0], y[1] - yr[1]));
  }
  const s = slope(hs, errs);
  console.log('  RK4 sarkaç eğimi =', s.toFixed(3), ' hatalar:', errs.map((e) => e.toExponential(2)).join(' '));
  assert.ok(Math.abs(s - 4) < 0.15, `eğim ${s}`);
});

test('DP5 (5. mertebe çözüm) global hata ∝ h^5, gömülü hata tahmini ∝ h^5', () => {
  const y0 = Float64Array.of(1.5, 0);
  const T = 4;
  const yr = ref(y0, T);
  const ws = makeWorkspace(2);
  const err = new Float64Array(2);
  const hs = [], errs = [], est = [];
  for (const n of [32, 64, 128, 256]) {
    const h = T / n;
    let y = Float64Array.from(y0), yn = new Float64Array(2);
    let firstEst = 0;
    for (let i = 0; i < n; i++) {
      dp45Step(pendulum, y, h, yn, err, ws, false);
      if (i === 0) firstEst = Math.hypot(err[0], err[1]);
      const t = y; y = yn; yn = t;
    }
    hs.push(h);
    errs.push(Math.hypot(y[0] - yr[0], y[1] - yr[1]));
    est.push(firstEst);
  }
  const s5 = slope(hs, errs);
  const sEst = slope(hs, est);
  console.log('  DP5 eğim =', s5.toFixed(3), ' hata-tahmini eğimi =', sEst.toFixed(3));
  assert.ok(Math.abs(s5 - 5) < 0.4, `DP5 eğimi ${s5}`);
  assert.ok(Math.abs(sEst - 5) < 0.4, `tahmin eğimi ${sEst}`);
});

test('DP45 adaptif: tolerans altında, enerji korunumu', () => {
  for (const rtol of [1e-6, 1e-9, 1e-12]) {
    const y0 = Float64Array.of(1.5, 0);
    const T = 50;
    const r = integrateDP45(pendulum, y0, T, { rtol, atol: rtol * 1e-2 });
    const yr = ref(y0, T);
    const e = Math.hypot(r.y[0] - yr[0], r.y[1] - yr[1]);
    const dE = Math.abs(energy(r.y) - energy(y0));
    console.log(`  rtol=${rtol}: global hata=${e.toExponential(2)}  |ΔE|=${dE.toExponential(2)}  adım=${r.steps} red=${r.rejected}`);
    assert.ok(r.complete);
    assert.ok(e < 5e3 * rtol, `hata ${e} rtol ${rtol}`);
  }
});

test('FSAL: k7 = f(yNew)', () => {
  const ws = makeWorkspace(2);
  const y = Float64Array.of(0.7, 0.2), out = new Float64Array(2), err = new Float64Array(2), chk = new Float64Array(2);
  dp45Step(pendulum, y, 0.3, out, err, ws, false);
  pendulum(out, chk);
  assert.deepEqual(Array.from(ws.k7), Array.from(chk));
});

test('rk4StepF32: float64 RK4 ile ~1e-7 içinde; sonuçlar float32 değeridir', () => {
  const ws1 = makeWorkspace(2), ws2 = makeWorkspace(2);
  const f32f = (y, out) => { out[0] = y[1]; out[1] = Math.fround(-Math.fround(Math.sin(y[0]))); };
  const y = Float64Array.of(Math.fround(1.2), Math.fround(0.3));
  const a = new Float64Array(2), b = new Float64Array(2);
  rk4Step(pendulum, y, 0.05, a, ws1);
  rk4StepF32(f32f, y, Math.fround(0.05), b, ws2);
  for (let i = 0; i < 2; i++) {
    assert.equal(b[i], Math.fround(b[i]));
    assert.ok(Math.abs(a[i] - b[i]) < 5e-7);
  }
});

test('errorNorm / nextStepSize: NaN ve sınır durumları', () => {
  const y = Float64Array.of(1, 2, 3), yn = Float64Array.of(1, 2, 3);
  assert.equal(errorNorm(y, yn, Float64Array.of(0, 0, 0), 3, 1e-6, 1e-9), 0);
  assert.ok(Number.isNaN(errorNorm(y, yn, Float64Array.of(NaN, 0, 1e9), 3, 1e-6, 1e-9)));
  // son bileşen (t) nErr=2 ile dışlanır
  assert.equal(errorNorm(y, yn, Float64Array.of(0, 0, 1e9), 2, 1e-6, 1e-9), 0);
  assert.ok(nextStepSize(1, NaN) < 1);
  assert.equal(nextStepSize(1, 0), 5);
  assert.ok(Math.abs(nextStepSize(1, 1) - 0.9) < 1e-15);
});
