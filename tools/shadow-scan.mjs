/**
 * Gölge sınırı taraması: ekranda yarıçap taraması + ikiye bölme ile yakalanma sınırı.
 * Hem tests/math/raytracer.test.mjs hem de tools/float32-study.mjs tarafından kullanılır.
 *
 * Kullanım (CLI):  node tools/shadow-scan.mjs [a] [theta_deg] [rCam]
 */
import { createCamera } from '../src/math/camera.js';
import { traceRay } from '../src/math/raytracer.js';
import { shadowBoundary } from '../src/physics/kerr.js';

/** 'maxSteps' (kritik yörüngeye çok yakın) ve 'captured' → içeride; 'escaped'/'disk' → dışarıda. */
export function isInside(status) {
  return status === 'captured' || status === 'maxSteps';
}

/**
 * Ekranda χ doğrultusunda gölge yarıçapı ρ_c(χ): ρ = √(α²+β²), (α,β) = ρ (cosχ, sinχ).
 * @param {object} cam   createCamera çıktısı
 * @param {object} params traceRay params ({a, ...})
 * @param {number} chi
 * @param {object} [opts] traceRay seçenekleri (+ rLo, rHi, iters)
 */
export function shadowRadiusAlong(cam, params, chi, opts = {}) {
  let lo = opts.rLo ?? 1.0; // içeride olmalı
  let hi = opts.rHi ?? 14; // dışarıda olmalı
  const iters = opts.iters ?? 40;
  const inside = (rho) => {
    const al = rho * Math.cos(chi), be = rho * Math.sin(chi);
    const ray = opts.mapping === 'bardeen' ? cam.bardeenRay(al, be) : cam.impactToRay(al, be);
    const res = traceRay({ ...params, disk: false }, ray, opts);
    return isInside(res.status);
  };
  if (!inside(lo)) throw new Error(`ρ=${lo} içeride değil (χ=${chi})`);
  if (inside(hi)) throw new Error(`ρ=${hi} dışarıda değil (χ=${chi})`);
  for (let i = 0; i < iters; i++) {
    const mid = 0.5 * (lo + hi);
    if (inside(mid)) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Çokgenin (shadowBoundary) orijinden χ doğrultusundaki kesişim uzaklığı. */
export function polygonRadiusAlong(poly, chi) {
  const dx = Math.cos(chi), dy = Math.sin(chi);
  let best = NaN;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const ex = q.alpha - p.alpha, ey = q.beta - p.beta;
    // p + s e = ρ d  ⇒  s = −(p×d)/(e×d),  ρ = (p + s e)·d   (a×b = a_x b_y − a_y b_x)
    const den = ex * dy - ey * dx;
    if (Math.abs(den) < 1e-300) continue;
    const s = -(p.alpha * dy - p.beta * dx) / den;
    const rho = (p.alpha + s * ex) * dx + (p.beta + s * ey) * dy;
    if (s >= -1e-12 && s <= 1 + 1e-12 && rho > 0) best = Number.isNaN(best) ? rho : Math.max(best, rho);
  }
  return best;
}

export function scanShadow({ a, thetaDeg, rCam, nAngles = 24, opts = {} }) {
  const th = (thetaDeg * Math.PI) / 180;
  const cam = createCamera({ a, rCam, thetaCam: th });
  const poly = shadowBoundary(1, a, th, 4000);
  const rows = [];
  let maxErr = 0;
  for (let k = 0; k < nAngles; k++) {
    const chi = ((k + 0.37) * 2 * Math.PI) / nAngles;
    const rhoRay = shadowRadiusAlong(cam, { a }, chi, opts);
    const rhoRef = polygonRadiusAlong(poly, chi);
    const err = rhoRay - rhoRef;
    maxErr = Math.max(maxErr, Math.abs(err));
    rows.push({ chi, rhoRay, rhoRef, err });
  }
  return { rows, maxErr };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = Number(process.argv[2] ?? 0.9);
  const thetaDeg = Number(process.argv[3] ?? 60);
  const rCam = Number(process.argv[4] ?? 1e4);
  const mapping = process.argv[5] ?? 'impact';
  const { rows, maxErr } = scanShadow({ a, thetaDeg, rCam, opts: { mapping } });
  for (const r of rows) {
    console.log(`χ=${r.chi.toFixed(3)}  ρ_ışın=${r.rhoRay.toFixed(6)}  ρ_shadowBoundary=${r.rhoRef.toFixed(6)}  fark=${r.err.toExponential(2)}`);
  }
  console.log(`a=${a} θ_o=${thetaDeg}° r_cam=${rCam}: max |fark| = ${maxErr.toExponential(3)}`);
}
