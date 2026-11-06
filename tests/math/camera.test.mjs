import test from 'node:test';
import assert from 'node:assert/strict';
import { metricBL } from '../../src/physics/kerr.js';
import { createCamera, zamoFrame } from '../../src/math/camera.js';

const deg = (d) => (d * Math.PI) / 180;
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const norm = (u) => Math.hypot(...u);
const unit = (u) => u.map((x) => x / norm(u));

test('Ekran yönelimi, kerr.md §2.11 ile VEKTÖREL olarak (Bardeen formülü kullanılmadan): L = (b×n̂)_z, p_θ', () => {
  // a = 0, çok uzak kamera → düz uzay. n̂ = delikten gözlemciye; ê_β = ẑ'nin izdüşümü; ê_α = ê_β × n̂.
  for (const [thO, phiC] of [[deg(80), 0], [deg(60), 0.7], [deg(120), -1.2], [deg(35), 2.5]]) {
    const D = 1e7;
    const cam = createCamera({ a: 0, rCam: D, thetaCam: thO, phiCam: phiC });
    const n = [Math.sin(thO) * Math.cos(phiC), Math.sin(thO) * Math.sin(phiC), Math.cos(thO)];
    const z = [0, 0, 1];
    const zp = z.map((c, i) => c - dot(z, n) * n[i]);
    const eb = unit(zp);
    const ea = cross(eb, n);
    for (const [al, be] of [[-7, 0], [7, 0], [0, 5], [0, -5], [3, 4], [-6, -2]]) {
      const ray = cam.impactToRay(al, be);
      // gözlemci konumu x0 = D n + b ; foton yönü +n
      const b = [0, 1, 2].map((i) => al * ea[i] + be * eb[i]);
      const x0 = [0, 1, 2].map((i) => D * n[i] + b[i]);
      const Lz = cross(x0, n)[2]; // (x × p)_z, |p| = 1
      // kovaryant p_θ = r (n̂_foton · θ̂(x0))
      const r0 = norm(x0), th0 = Math.acos(x0[2] / r0), ph0 = Math.atan2(x0[1], x0[0]);
      const that = [Math.cos(th0) * Math.cos(ph0), Math.cos(th0) * Math.sin(ph0), -Math.sin(th0)];
      const pth = r0 * dot(n, that);
      assert.ok(Math.abs(ray.lambda - Lz) < 5e-5, `θ=${thO} (α,β)=(${al},${be}): λ=${ray.lambda} vs L_z=${Lz}`);
      assert.ok(Math.abs(ray.pTheta - pth) < 5e-5, `θ=${thO} (α,β)=(${al},${be}): p_θ=${ray.pTheta} vs ${pth}`);
      // kerr.md: L_z = −α sinθ_o
      assert.ok(Math.abs(ray.lambda + al * Math.sin(thO)) < 5e-5);
      assert.equal(ray.signR, 1);
    }
  }
});

test('Piksel yönü: sağ piksel → λ<0 (α>0), üst piksel → p_θ>0 (β>0); merkez → L=0, p_θ=0', () => {
  const cam = createCamera({ a: 0.5, rCam: 1e5, thetaCam: deg(70), width: 65, height: 65, fovY: deg(10) });
  const c = cam.pixelToRay(32, 32);
  assert.ok(c.lambda === 0, `merkez λ = ${c.lambda}`); // -0 === 0 (L === 0 koruması her ikisini yakalar)
  assert.ok(Math.abs(c.pTheta) < 1e-12);
  const right = cam.pixelToRay(60, 32);
  const left = cam.pixelToRay(4, 32);
  const top = cam.pixelToRay(32, 4);
  const bottom = cam.pixelToRay(32, 60);
  assert.ok(right.lambda < 0 && left.lambda > 0);
  assert.ok(top.pTheta > 0 && bottom.pTheta < 0);
  // kenar pikselleri teğet düzlemde ±tanHalf·(1 − 1/W)
  const e = cam.pixelToRay(0, 32);
  assert.ok(Math.abs(e.x + cam.tanHalfX * (1 - 1 / 65)) < 1e-15);
});

test('roll = 90°: screenToRay(x,0) ≡ roll=0 için screenToRay(0,x)', () => {
  const c0 = createCamera({ a: 0.9, rCam: 50, thetaCam: deg(80) });
  const c1 = createCamera({ a: 0.9, rCam: 50, thetaCam: deg(80), roll: Math.PI / 2 });
  const A = c1.screenToRay(0.05, 0), B = c0.screenToRay(0, 0.05);
  assert.ok(Math.abs(A.lambda - B.lambda) < 1e-14 && Math.abs(A.pTheta - B.pTheta) < 1e-14);
});

test('Sonlu kamera (a=0.9, r=50): tetraddan kurulan p^μ boş (null), λ = p_φ/(−p_t) metrikle bağımsız doğrulanır', () => {
  const a = 0.9, rC = 50, th = deg(80);
  const cam = createCamera({ a, rCam: rC, thetaCam: th });
  const fr = zamoFrame(a, rC, th);
  const g = metricBL(1, a, rC, th);
  for (const [x, y] of [[0, 0], [0.12, 0.03], [-0.15, -0.08], [0.05, 0.2]]) {
    const ray = cam.screenToRay(x, y);
    // bağımsız: gözlemci yerel yönü n = −d, d ∝ (−1, −y, x)
    const nrm = Math.hypot(1, x, y);
    const nr = 1 / nrm, nth = y / nrm, nph = -x / nrm;
    // p^μ = e_(t)^μ + n_r e_(r)^μ + n_θ e_(θ)^μ + n_φ e_(φ)^μ   (E_yerel = 1)
    const pu = [1 / fr.lapse, nr * Math.sqrt(g.Delta / g.Sigma), nth / Math.sqrt(g.Sigma), fr.omega / fr.lapse + nph / Math.sqrt(g.gphiphi)];
    const pt = g.gtt * pu[0] + g.gtphi * pu[3];
    const pph = g.gtphi * pu[0] + g.gphiphi * pu[3];
    const pr = g.grr * pu[1];
    const pth = g.gthth * pu[2];
    const nullity = g.gtt * pu[0] ** 2 + 2 * g.gtphi * pu[0] * pu[3] + g.gphiphi * pu[3] ** 2 + g.grr * pu[1] ** 2 + g.gthth * pu[2] ** 2;
    assert.ok(Math.abs(nullity) < 1e-12, `null değil: ${nullity}`);
    const E = -pt;
    assert.ok(Math.abs(ray.lambda - pph / E) < 1e-13 * (1 + Math.abs(ray.lambda)), `λ: ${ray.lambda} vs ${pph / E}`);
    assert.ok(Math.abs(ray.pTheta - pth / E) < 1e-13 * (1 + Math.abs(pth / E)));
    assert.ok(Math.abs(ray.prDirect - pr / E) < 1e-13 * (1 + Math.abs(pr / E)));
    assert.ok(Math.abs(ray.nuCamOverNuInf - 1 / E) < 1e-14);
    // Carter bağıntısı: tetraddan gelen p_r, R(r)/Δ² ile tutarlı (H = 0)
    const P = (rC * rC + a * a) - a * ray.lambda;
    const R = P * P - g.Delta * (ray.Q + (ray.lambda - a) ** 2);
    assert.ok(Math.abs((g.Delta * ray.prDirect) ** 2 - R) < 1e-9 * R, `R: ${(g.Delta * ray.prDirect) ** 2} vs ${R}`);
  }
});

test('Sonlu kamera r=50M: piksel açısından (α := r_cam tanψ) λ ≠ −α sinθ_o (>%1); impactToRay/bardeenRay ile tutarlılık', () => {
  const th = deg(80);
  const al = -7;
  const out = {};
  for (const rC of [50, 1e6]) {
    const cam = createCamera({ a: 0.9, rCam: rC, thetaCam: th });
    const ray = cam.screenToRay(al / rC, 0); // piksel: açısal konum, α := r_cam · tanψ
    out[rC] = ray.lambda / (-al * Math.sin(th)) - 1;
  }
  console.log('  göreli sapma λ/(−α sinθ) − 1 (α = r_cam tanψ):  r=50 →', out[50].toExponential(3), '  r=1e6 →', out[1e6].toExponential(3));
  assert.ok(Math.abs(out[50]) > 0.01 && Math.abs(out[50]) < 0.03, `r=50 sapması ${out[50]}`);
  assert.ok(Math.abs(out[1e6]) < 1e-5);
  // lapse-düzeltmeli impactToRay: r=50'de bile L/E ≈ −α sinθ (O(a²/r², M²/r²) kalır); bardeenRay tam
  const cam50 = createCamera({ a: 0.9, rCam: 50, thetaCam: th });
  const imp = cam50.impactToRay(al, 0), bar = cam50.bardeenRay(al, 0);
  console.log('  r=50: impactToRay λ =', imp.lambda, ' bardeenRay λ =', bar.lambda, ' (−α sinθ =', -al * Math.sin(th), ')');
  assert.ok(Math.abs(imp.lambda / bar.lambda - 1) < 2e-3);
  assert.ok(Math.abs(bar.lambda - (-al * Math.sin(th))) < 1e-15);
  // bardeenRay: Θ(θ_cam) = β²  ⇒  Q = β² + cos²θ(α² sin²θ/sin²θ... ) kontrolü: Q = p_θ² + cos²θ (L²/sin²θ − a²)
  const b2 = cam50.bardeenRay(-3, 4);
  assert.ok(Math.abs(b2.Q - (16 + Math.cos(th) ** 2 * (9 - 0.81))) < 1e-12);
  assert.ok(b2.pTheta === 4);
});

test('impactToRay (r=1e6) ≡ bardeenRay (aynı sabitler) — 1e-5 içinde', () => {
  const cam = createCamera({ a: 0.9, rCam: 1e6, thetaCam: deg(80) });
  for (const [al, be] of [[-7, 0], [7, 0], [3, -4], [-10, 6]]) {
    const A = cam.impactToRay(al, be), B = cam.bardeenRay(al, be);
    assert.ok(Math.abs(A.lambda - B.lambda) < 1e-5, `λ ${A.lambda} vs ${B.lambda}`);
    assert.ok(Math.abs(A.pTheta - B.pTheta) < 1e-5, `p_θ ${A.pTheta} vs ${B.pTheta}`);
    assert.ok(Math.abs(A.nuCamOverNuInf / B.nuCamOverNuInf - 1) < 1e-6);
  }
});

test('θ_cam kutupta (0, π) → RangeError', () => {
  assert.throws(() => createCamera({ a: 0, rCam: 50, thetaCam: 0 }), RangeError);
  assert.throws(() => createCamera({ a: 0, rCam: 50, thetaCam: Math.PI }), RangeError);
});
