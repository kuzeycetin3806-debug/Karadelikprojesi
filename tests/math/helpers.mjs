// Test yardımcıları (test dosyası değildir; node --test yalnızca *.test.mjs çalıştırır).

/** Deterministik sözde-rastgele sayı üreteci (mulberry32). */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** log-log en küçük kareler eğimi. */
export function slope(xs, ys) {
  const lx = xs.map(Math.log), ly = ys.map(Math.log);
  const n = xs.length;
  const mx = lx.reduce((s, v) => s + v, 0) / n, my = ly.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (lx[i] - mx) * (ly[i] - my); den += (lx[i] - mx) ** 2; }
  return num / den;
}

export const deg = (d) => (d * Math.PI) / 180;

/**
 * Schwarzschild (M=1) fotonunun TOPLAM sapma açısı δ(b) = Δφ_toplam − π — ODE'den bağımsız kuadratür.
 *   Δφ = 2 ∫_0^{u0} du / √(1/b² − u² + 2u³),   u0: dönüm noktası (en küçük pozitif kök),
 *   P(u) = (u0 − u) S(u),  S(u) = −2u² + (1−2u0)u + u0(1−2u0),  u = u0 − w²  ⇒  Δφ = 4 ∫_0^{√u0} dw/√S.
 * Bileşik Simpson (N = 20000) → ~1e-14.
 */
export function exactDeflection(b) {
  let u0 = 1 / b;
  for (let i = 0; i < 100; i++) {
    const g = u0 * u0 - 2 * u0 ** 3 - 1 / (b * b);
    const dg = 2 * u0 - 6 * u0 * u0;
    u0 -= g / dg;
  }
  const S = (u) => -2 * u * u + (1 - 2 * u0) * u + u0 * (1 - 2 * u0);
  const f = (w) => 1 / Math.sqrt(S(u0 - w * w));
  const N = 20000;
  const W = Math.sqrt(u0);
  const h = W / N;
  let sum = f(0) + f(W);
  for (let i = 1; i < N; i++) sum += f(i * h) * (i % 2 ? 4 : 2);
  return 4 * (sum * h) / 3 - Math.PI;
}

/** Zayıf alan serisi: δ = 4/b + (15π/4)/b² + (128/3)/b³ + (3465π/64)/b⁴ + … (M=1). */
export function deflectionSeries(b, order = 2) {
  const c = [4, (15 * Math.PI) / 4, 128 / 3, (3465 * Math.PI) / 64];
  let s = 0;
  for (let k = 0; k < order; k++) s += c[k] / b ** (k + 1);
  return s;
}
