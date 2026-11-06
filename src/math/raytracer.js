/**
 * Kerr ışın izleyici — CPU referans uygulaması (float64) ve float32/RK4 öykünmesi.
 *
 * Işın, kameradan GERİYE (fotonun geçmişine) doğru, Mino zamanında integre edilir. Fiziksel foton
 * kameraya gelir; izleme yönü bunun tersidir (geodesic.js `dir = −1`). Durum: [r, θ, φ, X, Y, t]
 * (bkz. geodesic.js): hamilton → X = p_r, Y = p_θ; carter → X = u_r = Δp_r, Y = p_θ.
 *
 * SONLANDIRMA (öncelik sırası, her kabul edilen adımdan sonra):
 *   1. θ = π/2 kesişimi → (disk sınırları içindeyse) kayıt; `maxDiskHits` dolunca status = 'disk'
 *   2. r < r₊ + captureMargin                      → 'captured'
 *   3. r > rEscape ve ışın dışarı gidiyor            → 'escaped' (+ asimptotik yön)
 *   4. adım bütçesi bitti / NaN / adım sıfırlandı     → 'maxSteps' (reason alanı ayrıntı verir)
 * `status` SONLANMA olayını verir; ekvator kesişimleri `hits` dizisindedir (ışın disk geçip sonra
 * kaçmış/yakalanmış olabilir → status 'escaped', hits.length ≥ 1).
 *
 * ADIM KONTROLÜ
 *   integrator 'dp45': Dormand–Prince 5(4), FSAL; hata normu max_i |e_i|/(atol + rtol max(|y|,|y'|)) (t hariç),
 *                      h ≤ capFactor · h_nat(y)  (geodesic.naturalStep; ufuk/eksen/büyük-r ölçeği).
 *   integrator 'rk4' : sabit-formüllü adım h = κ · h_nat(y)  (GPU kuralı; adaptif hata kestirimi yok).
 *   precision 'f32'  : yalnız rk4; her işlem Math.fround ile yuvarlanır.
 *
 * Fiziksel / estetik ayrımı: bu modül yalnız fiziksel büyüklükleri üretir (g-faktörü dahil); parlaklık,
 * bloom vb. estetik işlemler burada yoktur.
 */

import { iscoRadius, diskRedshiftFactor } from '../physics/kerr.js';
import * as G from './geodesic.js';
import {
  makeWorkspace,
  dp45Step,
  rk4Step,
  rk4StepF32,
  errorNorm,
  nextStepSize,
} from './integrators.js';

const HALF_PI = Math.PI / 2;
const fr32 = Math.fround;

export const DEFAULT_OPTIONS = Object.freeze({
  integrator: 'dp45', // 'dp45' | 'rk4'
  form: 'hamilton', // 'hamilton' | 'carter'
  precision: 'f64', // 'f64' | 'f32' (f32 yalnız rk4 ile)
  rtol: 1e-10,
  atol: 1e-12,
  capFactor: 0.5, // dp45: h ≤ capFactor · h_nat
  kappa: 0.1, // rk4: h = kappa · h_nat
  maxSteps: 20000, // kabul edilen adım bütçesi
  rEscape: undefined, // varsayılan: max(1e4, 2 r_cam)
  captureMargin: 1e-3, // r < r₊ + captureMargin → yakalandı
  maxDiskHits: 1, // bu kadar disk kesişiminde dur (1 = opak disk)
  crossing: undefined, // 'newton' | 'hermite' | 'linear' (varsayılan: f64'te newton, f32'de hermite)
  trackMax: false, // her adımda |ΔH|, |ΔQ| maksimumunu izle
});

/** Disk modeli varsayılanları: r_in = ISCO, r_out = 20 M. */
export function diskDefaults(a, prograde = true) {
  return { rIn: iscoRadius(1, a, prograde), rOut: 20, prograde };
}

/**
 * Tek ışın izle.
 * @param {object} params   { a, rIn?, rOut?, prograde?=true, disk?=true }
 * @param {object} ray      camera.js çıktısı: { r, theta, phi, lambda, pTheta, signR, Q, nuCamOverNuInf? }
 * @param {object} [opts]   DEFAULT_OPTIONS alanları
 * @returns {{status:string, hits:object[], escape:object|null, steps:number, rejected:number,
 *            planeCrossings:number, dH:number, dHscaled:number, dQ:number, dQrel:number,
 *            dRadial:number, rEnd:number, reason?:string}}
 */
export function traceRay(params, ray, opts = {}) {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const a = params.a;
  const prograde = params.prograde ?? true;
  const dd = diskDefaults(a, prograde);
  const rIn = params.rIn ?? dd.rIn;
  const rOut = params.rOut ?? dd.rOut;
  const diskOn = params.disk !== false && rOut > rIn;
  const f32 = o.precision === 'f32';
  if (f32 && o.integrator !== 'rk4') throw new RangeError("precision 'f32' yalnız integrator 'rk4' ile");
  const hamilton = o.form === 'hamilton';
  const crossMode = o.crossing ?? (f32 ? 'hermite' : 'newton');

  const { rp } = G.horizons(a);
  const L = ray.lambda;
  const Q = ray.Q;
  const rEsc = o.rEscape ?? Math.max(1e4, 2 * ray.r);
  const rCapture = rp + o.captureMargin;

  // --- başlangıç durumu: p_r (veya u_r) Carter bağıntısından yeniden kurulur (büyük r_cam'de iptal yok)
  const Rinit = G.radialPotential(a, 1, L, Q, ray.r);
  const ur0 = ray.signR * Math.sqrt(Rinit > 0 ? Rinit : 0);
  const X0 = hamilton ? ur0 / G.deltaOf(a, ray.r) : ur0;
  const y0 = Float64Array.of(ray.r, ray.theta, ray.phi, X0, ray.pTheta, 0);
  if (f32) for (let i = 0; i < 6; i++) y0[i] = fr32(y0[i]);

  // --- sağ taraf (geriye: dir = −1)
  let f;
  if (f32) f = hamilton ? G.makeRhsHamiltonF32(a, L, -1) : G.makeRhsCarterF32(a, L, Q, -1);
  else f = hamilton ? G.makeRhsHamilton(a, 1, L, -1) : G.makeRhsCarter(a, 1, L, Q, -1);

  // --- tanılama (H, Q, radyal kısıt) — daima float64'te değerlendirilir
  function diag(y) {
    const r = y[0], th = y[1];
    const D = G.deltaOf(a, r);
    const ur = hamilton ? D * y[3] : y[3];
    const pr = hamilton ? y[3] : y[3] / D;
    const { f: fv, H, scale } = G.hamiltonianTerms(a, 1, L, r, th, pr, y[4]);
    const P = r * r + a * a - a * L;
    const res = Math.abs(ur * ur - G.radialPotential(a, 1, L, Q, r)) / (P * P);
    return { H, f: fv, scale, Q: G.carterConstant(a, 1, L, th, y[4]), res };
  }
  const d0 = diag(y0);
  let maxDH = 0, maxDQ = 0, maxRes = 0;

  const n = 6;
  const ws = makeWorkspace(n);
  const ws2 = makeWorkspace(n); // kesişim inceltmesi için ayrı alan (FSAL k1/k7 bozulmasın)
  const errv = new Float64Array(n);
  let y = Float64Array.from(y0);
  let yn = new Float64Array(n);
  const yA = new Float64Array(n); // adım başı kopyası
  const kA = new Float64Array(n);
  const yS = new Float64Array(n);
  const Ftmp = new Float64Array(n);
  const rpF = fr32(rp);
  const kappaF = fr32(o.kappa);

  const hNat = f32
    ? (yy, F) => G.naturalStepF32(rpF, yy[0], yy[1], F[0], F[1], F[2])
    : (yy, F) => G.naturalStep(rp, yy[0], yy[1], F[0], F[1], F[2]);

  const hits = [];
  let planeCrossings = 0;
  let status = null;
  let reason;
  let escape = null;
  let steps = 0, rejected = 0, attempts = 0;
  let rMin = y0[0];

  // Adım fonksiyonu (kesişim inceltmesi için aynı entegratörle kısmi adım)
  function partialStep(yFrom, hs, out) {
    if (o.integrator === 'dp45') dp45Step(f, yFrom, hs, out, errv, ws2, false);
    else if (f32) rk4StepF32(f, yFrom, fr32(hs), out, ws2, false);
    else rk4Step(f, yFrom, hs, out, ws2, false);
  }

  /** [yA→yB] adımında θ=π/2 geçildi: kesişim durumunu `yS`e yaz. */
  function refineCrossing(h, FA, FB, yB) {
    const muA = Math.cos(yA[1]);
    const muB = Math.cos(yB[1]);
    if (crossMode === 'linear') {
      const s = muA / (muA - muB);
      for (let i = 0; i < n; i++) yS[i] = yA[i] + s * (yB[i] - yA[i]);
      return;
    }
    if (crossMode === 'hermite') {
      const eval_ = (s, i) => {
        const s2 = s * s, s3 = s2 * s;
        return (
          (2 * s3 - 3 * s2 + 1) * yA[i] +
          (s3 - 2 * s2 + s) * h * FA[i] +
          (-2 * s3 + 3 * s2) * yB[i] +
          (s3 - s2) * h * FB[i]
        );
      };
      let lo = 0, hi = 1, mlo = muA;
      for (let it = 0; it < 60; it++) {
        const mid = 0.5 * (lo + hi);
        const m = Math.cos(eval_(mid, 1));
        if (m * mlo > 0) { lo = mid; mlo = m; } else hi = mid;
      }
      const s = 0.5 * (lo + hi);
      for (let i = 0; i < n; i++) yS[i] = eval_(s, i);
      return;
    }
    // 'newton': kısmi adım yeniden integrasyonu + Newton (köşeli parantezli)
    let lo = 0, hi = h;
    let hs = (h * muA) / (muA - muB);
    for (let it = 0; it < 12; it++) {
      partialStep(yA, hs, yS);
      const mu = Math.cos(yS[1]);
      if (Math.abs(mu) < 1e-15) return;
      if (mu * muA > 0) lo = hs; else hi = hs;
      f(yS, Ftmp);
      const dmu = -Math.sin(yS[1]) * Ftmp[1];
      let hn = hs - mu / dmu;
      if (!(hn > lo && hn < hi)) hn = 0.5 * (lo + hi);
      if (hn === hs) return;
      hs = hn;
    }
    partialStep(yA, hs, yS);
  }

  function recordCrossing(h, FA, FB, yB) {
    refineCrossing(h, FA, FB, yB);
    planeCrossings++;
    const rH = yS[0];
    if (diskOn && rH >= rIn && rH <= rOut) {
      const ang = G.canonicalAngles(yS[1], yS[2]);
      const g = diskRedshiftFactor(1, a, rH, L, prograde);
      hits.push({
        n: planeCrossings, // kaçıncı ekvator geçişi (1 = birincil görüntü, 2 = ikincil, ...)
        r: rH,
        phi: ang.phi,
        phiRaw: yS[2],
        lambda: L,
        g,
        gCam: ray.nuCamOverNuInf !== undefined ? g * ray.nuCamOverNuInf : undefined,
        tDelay: -yS[5], // kamera ile yayılma arasındaki koordinat zamanı farkı (>0)
        step: steps,
      });
    }
  }

  // --- ana döngü
  const maxAttempts = 4 * o.maxSteps + 100;
  f(y, ws.k1);
  let h;
  if (o.integrator === 'dp45') h = 0.1 * hNat(y, ws.k1);

  while (status === null) {
    if (steps >= o.maxSteps || attempts >= maxAttempts) { status = 'maxSteps'; reason = 'budget'; break; }
    attempts++;
    yA.set(y);
    kA.set(ws.k1);

    if (o.integrator === 'dp45') {
      const hcap = o.capFactor * hNat(y, ws.k1);
      if (h > hcap) h = hcap;
      dp45Step(f, y, h, yn, errv, ws, true);
      const en = errorNorm(y, yn, errv, 5, o.rtol, o.atol);
      if (!(en <= 1)) {
        rejected++;
        h = nextStepSize(h, en, 0.9, 0.2, 1);
        if (!(h > 1e-14)) { status = 'maxSteps'; reason = 'stuck'; }
        continue;
      }
      // kabul
      const hUsed = h;
      steps++;
      ws.k1.set(ws.k7); // FSAL
      h = nextStepSize(h, en);
      if (!(yn[0] === yn[0]) || !(yn[1] === yn[1])) { status = 'maxSteps'; reason = 'nan'; break; }
      if (Math.cos(yA[1]) * Math.cos(yn[1]) < 0) recordCrossing(hUsed, kA, ws.k1, yn);
      y.set(yn);
    } else {
      let hh = f32 ? fr32(kappaF * hNat(y, ws.k1)) : o.kappa * hNat(y, ws.k1);
      if (f32) rk4StepF32(f, y, hh, yn, ws, true);
      else rk4Step(f, y, hh, yn, ws, true);
      steps++;
      if (!(yn[0] === yn[0]) || !(yn[1] === yn[1])) { status = 'maxSteps'; reason = 'nan'; break; }
      f(yn, ws.k1);
      if (Math.cos(yA[1]) * Math.cos(yn[1]) < 0) recordCrossing(hh, kA, ws.k1, yn);
      y.set(yn);
    }

    if (y[0] < rMin) rMin = y[0];

    if (o.trackMax) {
      const d = diag(y);
      const dh = Math.abs(d.H - d0.H);
      const dq = Math.abs(d.Q - d0.Q);
      if (dh > maxDH) maxDH = dh;
      if (dq > maxDQ) maxDQ = dq;
      if (d.res > maxRes) maxRes = d.res;
    }

    if (hits.length >= o.maxDiskHits && diskOn) { status = 'disk'; break; }
    if (y[0] < rCapture) { status = 'captured'; break; }
    if (y[0] > rEsc && y[3] < 0) {
      status = 'escaped';
      // Asimptotik yön: kalan Mino süresi σ_rem = ∫_r^∞ dr/√R (remainingMinoTime, O(r⁻⁵) hata).
      // θ için 2. mertebe (θ'' = F[4]), φ için 1. mertebe (hata ~ (b/r_esc)² rad; ekvatoral/düz
      // durumda φ'=L sabit olduğundan hata ≪ bu).
      const F = ws.k1;
      const sr = G.remainingMinoTime(a, L, Q, y[0]);
      const thInf = y[1] + F[1] * sr + 0.5 * F[4] * sr * sr;
      const phInf = y[2] + F[2] * sr;
      const ang = G.canonicalAngles(thInf, phInf);
      escape = {
        theta: ang.theta,
        phi: ang.phi,
        thetaRaw: thInf,
        phiRaw: phInf,
        dir: G.directionFromAngles(ang.theta, ang.phi),
      };
      break;
    }
  }

  const dEnd = diag(y);
  return {
    status,
    reason,
    hits,
    escape,
    steps,
    rejected,
    planeCrossings,
    // korunum hataları (başlangıç → son); *Max alanları trackMax=true iken adım adım maksimumdur
    dH: Math.abs(dEnd.H - d0.H),
    dHscaled: Math.abs(dEnd.f - d0.f) / Math.max(d0.scale, 1e-300),
    dQ: Math.abs(dEnd.Q - d0.Q),
    dQrel: Math.abs(dEnd.Q - d0.Q) / Math.max(d0.Q, 1e-12), // |ΔQ|/Q (ekvatoral Q≈0 ışınlarda anlamsız)
    dQnorm: Math.abs(dEnd.Q - d0.Q) / Math.max(Math.abs(d0.Q) + L * L, 1e-12), // |ΔQ|/(|Q|+L²): her ışında tanımlı (Kerr'de Q<0 olabilir)
    dRadial: dEnd.res,
    dHmax: o.trackMax ? maxDH : undefined,
    dQmax: o.trackMax ? maxDQ / Math.max(d0.Q + L * L, 1e-12) : undefined, // (Q+L²)'ye göre normalize
    dRadialMax: o.trackMax ? maxRes : undefined,
    rEnd: y[0],
    rMin, // izlenen yol boyunca en küçük r (adım örneklemesiyle)
    thetaEnd: y[1],
    phiEnd: y[2],
    tEnd: y[5],
    H0: d0.H,
    Q0: d0.Q,
    E: 1,
    L,
  };
}
