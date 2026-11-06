/**
 * Sayısal integratörler: RK4 (sabit adım) ve Dormand–Prince 5(4) (adaptif adım).
 *
 * Tüm integratörler "sağ taraf" fonksiyonunu f(y, out) biçiminde bekler: `out` (Float64Array) y'deki
 * türevle doldurulur, dönüş değeri yoktur. Bu, sıcak döngüde bellek ayırmayı önler ve GLSL'deki
 * "yerel dizi" yapısına birebir karşılık gelir.
 *
 * Çalışma alanı (`makeWorkspace(n)`) çağıranın sahip olduğu dizilerdir; aynı alan art arda çağrılarda
 * yeniden kullanılır.
 *
 * Kaynaklar:
 *  - Dormand & Prince 1980, J. Comp. Appl. Math. 6, 19 — katsayılar (DOPRI5, FSAL).
 *  - Hairer, Nørsett & Wanner 1993, "Solving ODEs I", §II.4 — adım kontrolü.
 */

/** n-boyutlu durum için çalışma alanı. */
export function makeWorkspace(n) {
  const mk = () => new Float64Array(n);
  return {
    n,
    k1: mk(), k2: mk(), k3: mk(), k4: mk(), k5: mk(), k6: mk(), k7: mk(),
    tmp: mk(),
  };
}

// ---------------------------------------------------------------------------
// RK4 (klasik, sabit adım)
// ---------------------------------------------------------------------------

/**
 * Tek RK4 adımı: out = y + h·(k1 + 2k2 + 2k3 + k4)/6.
 * @param {boolean} k1Ready  true ise ws.k1 zaten f(y) ile doldurulmuştur (tekrar hesaplanmaz).
 */
export function rk4Step(f, y, h, out, ws, k1Ready = false) {
  const { k1, k2, k3, k4, tmp } = ws;
  const n = y.length;
  if (!k1Ready) f(y, k1);
  const h2 = 0.5 * h;
  for (let i = 0; i < n; i++) tmp[i] = y[i] + h2 * k1[i];
  f(tmp, k2);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + h2 * k2[i];
  f(tmp, k3);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + h * k3[i];
  f(tmp, k4);
  const h6 = h / 6;
  for (let i = 0; i < n; i++) out[i] = y[i] + h6 * (k1[i] + 2 * (k2[i] + k3[i]) + k4[i]);
}

/**
 * float32 öykünmeli RK4 adımı: HER aritmetik işlem Math.fround ile yuvarlanır
 * (GPU'nun tek duyarlıklı davranışına yakın; FMA kullanılmadığı varsayılır).
 * f, kendi içinde float32 öykünmesi yapan bir sağ taraf olmalıdır (bkz. geodesic.js *F32 üreticileri).
 */
export function rk4StepF32(f, y, h, out, ws, k1Ready = false) {
  const fr = Math.fround;
  const { k1, k2, k3, k4, tmp } = ws;
  const n = y.length;
  if (!k1Ready) f(y, k1);
  const h2 = fr(0.5 * h);
  for (let i = 0; i < n; i++) tmp[i] = fr(y[i] + fr(h2 * k1[i]));
  f(tmp, k2);
  for (let i = 0; i < n; i++) tmp[i] = fr(y[i] + fr(h2 * k2[i]));
  f(tmp, k3);
  for (let i = 0; i < n; i++) tmp[i] = fr(y[i] + fr(h * k3[i]));
  f(tmp, k4);
  const h6 = fr(h / 6);
  for (let i = 0; i < n; i++) {
    const s = fr(fr(k1[i] + fr(2 * fr(k2[i] + k3[i]))) + k4[i]);
    out[i] = fr(y[i] + fr(h6 * s));
  }
}

/**
 * Sabit adımlı RK4 ile t0'dan t0+nSteps·h'ye integrasyon (test/yakınsama yardımcısı).
 * @returns {Float64Array} son durum
 */
export function integrateRK4(f, y0, h, nSteps) {
  const n = y0.length;
  const ws = makeWorkspace(n);
  let y = Float64Array.from(y0);
  let yn = new Float64Array(n);
  for (let s = 0; s < nSteps; s++) {
    rk4Step(f, y, h, yn, ws);
    const t = y; y = yn; yn = t;
  }
  return y;
}

// ---------------------------------------------------------------------------
// Dormand–Prince 5(4)
// ---------------------------------------------------------------------------

const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
// 5. mertebe ağırlıkları (= 7. aşamanın a satırı → FSAL)
const B1 = 35 / 384, B3 = 500 / 1113, B4 = 125 / 192, B5 = -2187 / 6784, B6 = 11 / 84;
// hata katsayıları e = b5 − b4
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;

/**
 * Tek Dormand–Prince adımı. out: 5. mertebe çözüm; err: (5. − 4. mertebe) yerel hata vektörü.
 * Adım sonunda ws.k7 = f(out) (FSAL): kabul edilirse bir sonraki adımın k1'i olarak kullanılabilir.
 * @param {boolean} k1Ready  true ise ws.k1 = f(y) hazırdır.
 */
export function dp45Step(f, y, h, out, err, ws, k1Ready = false) {
  const { k1, k2, k3, k4, k5, k6, k7, tmp } = ws;
  const n = y.length;
  if (!k1Ready) f(y, k1);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + h * (A21 * k1[i]);
  f(tmp, k2);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + h * (A31 * k1[i] + A32 * k2[i]);
  f(tmp, k3);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + h * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]);
  f(tmp, k4);
  for (let i = 0; i < n; i++) {
    tmp[i] = y[i] + h * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]);
  }
  f(tmp, k5);
  for (let i = 0; i < n; i++) {
    tmp[i] = y[i] + h * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
  }
  f(tmp, k6);
  for (let i = 0; i < n; i++) {
    out[i] = y[i] + h * (B1 * k1[i] + B3 * k3[i] + B4 * k4[i] + B5 * k5[i] + B6 * k6[i]);
  }
  f(out, k7);
  for (let i = 0; i < n; i++) {
    err[i] = h * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
  }
}

/**
 * Ölçekli maksimum-norm hata: max_i |err_i| / (atol + rtol·max(|y_i|, |yNew_i|)),  i < nErr.
 * nErr < n olarak verilirse son bileşenler (ör. koordinat zamanı t) hata denetiminden çıkarılır.
 */
export function errorNorm(y, yNew, err, nErr, rtol, atol) {
  let m = 0;
  for (let i = 0; i < nErr; i++) {
    const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yNew[i]));
    const e = Math.abs(err[i]) / sc;
    if (e !== e) return NaN; // NaN yayılımı: adım reddedilmeli
    if (e > m) m = e;
  }
  return m;
}

/**
 * Hairer tipi PI'sız basit denetleyici: h_yeni = h · clamp(safety · err^(−1/5), minFac, maxFac).
 * Reddedilen adımda maxFac = 1 kullanın (büyütme yok).
 */
export function nextStepSize(h, errNorm, safety = 0.9, minFac = 0.2, maxFac = 5) {
  if (errNorm === 0) return h * maxFac;
  if (!(errNorm < Infinity)) return h * minFac; // NaN / ∞ → en sert küçültme
  const fac = safety * Math.pow(errNorm, -0.2);
  return h * Math.min(maxFac, Math.max(minFac, fac));
}

/**
 * Genel amaçlı adaptif DP5(4) integrasyonu t0 → t1 (t, f'in açık değişkeni değil; özerk sistem).
 * Test ve yakınsama çalışmaları içindir; ışın izleyici kendi döngüsünü kullanır (olay tespiti için).
 * @param {object} [opt] { rtol=1e-9, atol=1e-12, h0, maxSteps=1e6, nErr=y.length }
 * @returns {{y:Float64Array, steps:number, rejected:number}}
 */
export function integrateDP45(f, y0, span, opt = {}) {
  const n = y0.length;
  const rtol = opt.rtol ?? 1e-9;
  const atol = opt.atol ?? 1e-12;
  const nErr = opt.nErr ?? n;
  const maxSteps = opt.maxSteps ?? 1e6;
  const ws = makeWorkspace(n);
  const err = new Float64Array(n);
  let y = Float64Array.from(y0);
  let yn = new Float64Array(n);
  let h = opt.h0 ?? span * 1e-3;
  let t = 0;
  let steps = 0, rejected = 0;
  f(y, ws.k1);
  while (t < span && steps + rejected < maxSteps) {
    if (t + h > span) h = span - t;
    dp45Step(f, y, h, yn, err, ws, true);
    const en = errorNorm(y, yn, err, nErr, rtol, atol);
    if (en <= 1) {
      t += h; steps++;
      const tmp = y; y = yn; yn = tmp;
      ws.k1.set(ws.k7); // FSAL
      h = nextStepSize(h, en);
    } else {
      rejected++;
      h = nextStepSize(h, en, 0.9, 0.2, 1);
    }
  }
  return { y, steps, rejected, complete: t >= span };
}
