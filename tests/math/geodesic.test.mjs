import test from 'node:test';
import assert from 'node:assert/strict';
import { metricBL } from '../../src/physics/kerr.js';
import * as G from '../../src/math/geodesic.js';

// Deterministik sözde-rastgele sayı üreteci (mulberry32)
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('Hamilton hızları = Σ g^{μν} p_ν  (src/physics metriğiyle bağımsız kontrol)', () => {
  const rand = rng(1);
  for (const a of [0, 0.5, 0.9, 0.998]) {
    const { rp } = G.horizons(a);
    for (let k = 0; k < 40; k++) {
      const r = rp + 0.2 + 30 * rand();
      const th = 0.1 + (Math.PI - 0.2) * rand();
      const E = 0.5 + rand();
      const L = (rand() - 0.5) * 12;
      const pr = (rand() - 0.5) * 3;
      const pth = (rand() - 0.5) * 8;
      const f = G.makeRhsHamilton(a, E, L, +1);
      const y = Float64Array.of(r, th, 0.3, pr, pth, 0);
      const out = new Float64Array(6);
      f(y, out);
      // Mino hızları → afin hızlar: dx/dλ = (dx/dσ)/Σ ; p_μ = g_μν dx^ν/dλ
      const g = metricBL(1, a, r, th);
      const tdot = out[5] / g.Sigma, rdot = out[0] / g.Sigma, thdot = out[1] / g.Sigma, phdot = out[2] / g.Sigma;
      const pt = g.gtt * tdot + g.gtphi * phdot;
      const pph = g.gtphi * tdot + g.gphiphi * phdot;
      const prr = g.grr * rdot;
      const pthh = g.gthth * thdot;
      const sc = 1 + Math.abs(E) + Math.abs(L) + Math.abs(pr) + Math.abs(pth);
      assert.ok(Math.abs(pt + E) < 1e-11 * sc, `a=${a} p_t: ${pt} vs ${-E}`);
      assert.ok(Math.abs(pph - L) < 1e-11 * sc, `a=${a} p_φ: ${pph} vs ${L}`);
      assert.ok(Math.abs(prr - pr) < 1e-11 * sc, `a=${a} p_r: ${prr} vs ${pr}`);
      assert.ok(Math.abs(pthh - pth) < 1e-11 * sc, `a=${a} p_θ: ${pthh} vs ${pth}`);
    }
  }
});

test('dp_r/dσ ve dp_θ/dσ = −∂H̃/∂(r,θ) (merkezi sonlu fark, H̃ = f/2)', () => {
  const rand = rng(2);
  for (const a of [0, 0.7, 0.998]) {
    const { rp } = G.horizons(a);
    for (let k = 0; k < 30; k++) {
      const r = rp + 0.5 + 15 * rand();
      const th = 0.3 + 2.5 * rand();
      const E = 1;
      const L = (rand() - 0.5) * 10;
      const pr = (rand() - 0.5) * 2;
      const pth = (rand() - 0.5) * 6;
      const Ht = (rr, tt) => 0.5 * G.hamiltonianTerms(a, E, L, rr, tt, pr, pth).f;
      const e = 1e-5;
      const dHdr = (Ht(r + e, th) - Ht(r - e, th)) / (2 * e);
      const dHdth = (Ht(r, th + e) - Ht(r, th - e)) / (2 * e);
      const out = new Float64Array(6);
      G.makeRhsHamilton(a, E, L, +1)(Float64Array.of(r, th, 0, pr, pth, 0), out);
      const sc = 1 + Math.abs(dHdr) + Math.abs(dHdth);
      assert.ok(Math.abs(out[3] + dHdr) < 1e-6 * sc, `a=${a} r=${r}: ${out[3]} vs ${-dHdr}`);
      assert.ok(Math.abs(out[4] + dHdth) < 1e-6 * sc, `a=${a} θ=${th}: ${out[4]} vs ${-dHdth}`);
    }
  }
});

test('Carter biçimi = Hamilton biçimi (null durumda): u_r\' = (Δ p_r)\', Θ ve R potansiyelleri', () => {
  const rand = rng(3);
  for (const a of [0, 0.5, 0.9, 0.998]) {
    const { rp } = G.horizons(a);
    for (let k = 0; k < 40; k++) {
      const r = rp + 0.5 + 25 * rand();
      const th = 0.2 + 2.7 * rand();
      const L = (rand() - 0.5) * 10;
      const pth = (rand() - 0.5) * 5;
      const Q = G.carterConstant(a, 1, L, th, pth);
      const R = G.radialPotential(a, 1, L, Q, r);
      if (R <= 0) continue; // bu r yasak bölge
      const D = G.deltaOf(a, r);
      const pr = G.radialMomentum(a, 1, L, Q, r, rand() < 0.5 ? 1 : -1);
      // H = 0 (ölçekli)
      const { f, scale } = G.hamiltonianTerms(a, 1, L, r, th, pr, pth);
      assert.ok(Math.abs(f) < 1e-12 * scale, `H≠0: f=${f} scale=${scale}`);
      // (Δ p_r)² = R
      assert.ok(Math.abs((D * pr) ** 2 - R) < 1e-12 * R);
      // Θ(θ) = p_θ²
      assert.ok(Math.abs(G.thetaPotential(a, 1, L, Q, th) - pth * pth) < 1e-12 * (1 + pth * pth));
      // u_r' : Carter  vs  d(Δ p_r)/dσ = Δ' ṙ p_r + Δ ṗ_r
      const oH = new Float64Array(6), oC = new Float64Array(6);
      G.makeRhsHamilton(a, 1, L, +1)(Float64Array.of(r, th, 0, pr, pth, 0), oH);
      G.makeRhsCarter(a, 1, L, Q, +1)(Float64Array.of(r, th, 0, D * pr, pth, 0), oC);
      const urdotH = (2 * r - 2) * oH[0] * pr + D * oH[3];
      assert.ok(Math.abs(urdotH - oC[3]) < 1e-9 * (1 + Math.abs(oC[3])), `u_r': ${urdotH} vs ${oC[3]}`);
      assert.ok(Math.abs(oC[3] - 0.5 * G.radialPotentialDerivative(a, 1, L, Q, r)) < 1e-9 * (1 + Math.abs(oC[3])));
      for (const i of [0, 1, 2, 4, 5]) {
        assert.ok(Math.abs(oH[i] - oC[i]) < 1e-9 * (1 + Math.abs(oH[i])), `bileşen ${i}`);
      }
    }
  }
});

test('dir = −1 tüm türevlerin işaretini çevirir', () => {
  const y = Float64Array.of(7, 1.1, 0.2, -0.8, 2.0, 0);
  const o1 = new Float64Array(6), o2 = new Float64Array(6);
  G.makeRhsHamilton(0.9, 1, 3, +1)(y, o1);
  G.makeRhsHamilton(0.9, 1, 3, -1)(y, o2);
  for (let i = 0; i < 6; i++) assert.equal(o1[i], -o2[i]);
});

test('Eksen: L = 0 ve θ = 0 tam kutupta sağ taraf sonlu (NaN yok); L ≠ 0 yakın eksende büyür', () => {
  for (const make of [
    (L) => G.makeRhsHamilton(0.9, 1, L, -1),
    (L) => G.makeRhsCarter(0.9, 1, L, 4, -1),
  ]) {
    const out = new Float64Array(6);
    make(0)(Float64Array.of(10, 0, 0.5, 0.9, 0.1, 0), out);
    for (const v of out) assert.ok(Number.isFinite(v), `NaN/∞: ${Array.from(out)}`);
    make(0)(Float64Array.of(10, Math.PI, 0.5, 0.9, 0.1, 0), out);
    for (const v of out) assert.ok(Number.isFinite(v));
    make(1e-6)(Float64Array.of(10, 1e-4, 0.5, 0.9, 0.1, 0), out);
    assert.ok(Math.abs(out[2]) > 1e2, 'L≠0 eksen yakınında φ\' büyümeli');
  }
});

test('naturalStep: büyük r → ~1/r, ufuk yakını → ∝ (r−r₊), foton küresi → ~1/b', () => {
  const a = 0;
  const { rp } = G.horizons(a);
  // büyük r: r' = r², θ'=b, φ'=b/sin²θ
  const r = 1e4;
  assert.ok(Math.abs(G.naturalStep(rp, r, 1.2, r * r, 5, 5) * r - 1) < 1e-3);
  // ufuk yakını: r' = 1 sabit
  const h1 = G.naturalStep(rp, rp + 1e-2, Math.PI / 2, 1, 0, 0);
  const h2 = G.naturalStep(rp, rp + 1e-3, Math.PI / 2, 1, 0, 0);
  assert.ok(Math.abs(h1 / h2 - 10) < 1e-9);
  // foton küresi
  const b = 3 * Math.sqrt(3);
  assert.ok(Math.abs(G.naturalStep(rp, 3, Math.PI / 2, 0, 0, b) - 1 / b) < 1e-12);
});

test('canonicalAngles: eksenden geçiş (θ<0) → (−θ, φ+π); aralıklar', () => {
  let c = G.canonicalAngles(-0.3, 1.0);
  assert.ok(Math.abs(c.theta - 0.3) < 1e-15 && Math.abs(c.phi - (1.0 + Math.PI)) < 1e-15);
  c = G.canonicalAngles(-Math.PI / 2, 0);
  assert.ok(Math.abs(c.theta - Math.PI / 2) < 1e-15 && Math.abs(c.phi - Math.PI) < 1e-15);
  c = G.canonicalAngles(0.5, -0.1);
  assert.ok(Math.abs(c.phi - (2 * Math.PI - 0.1)) < 1e-15);
  c = G.canonicalAngles(Math.PI + 0.2, 6.0);
  assert.ok(Math.abs(c.theta - (Math.PI - 0.2)) < 1e-14);
  const d = G.directionFromAngles(c.theta, c.phi);
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-14);
});

test('float32 sağ taraf: float64 ile uyum (tipik durum, r=20)', () => {
  const a = 0.9, L = 4.2, th = 1.3, pth = 1.1;
  const Q = G.carterConstant(a, 1, L, th, pth);
  const r = 20;
  const pr = G.radialMomentum(a, 1, L, Q, r, -1);
  const D = G.deltaOf(a, r);
  const o64 = new Float64Array(6), o32 = new Float64Array(6);
  const fr = Math.fround;
  G.makeRhsHamilton(a, 1, L, -1)(Float64Array.of(r, th, 0, pr, pth, 0), o64);
  G.makeRhsHamiltonF32(a, L, -1)(Float64Array.of(r, fr(th), 0, fr(pr), fr(pth), 0), o32);
  for (const i of [0, 1, 2, 4, 5]) assert.ok(Math.abs(o32[i] - o64[i]) < 1e-4 * (1 + Math.abs(o64[i])), `H f32 bileşen ${i}`);
  // p_r' büyük terimlerin farkıdır → mutlak hata ~ r·ε_f32 (bkz. README)
  assert.ok(Math.abs(o32[3] - o64[3]) < 5e-5 * r, `H f32 p_r': ${o32[3]} vs ${o64[3]}`);
  G.makeRhsCarter(a, 1, L, Q, -1)(Float64Array.of(r, th, 0, D * pr, pth, 0), o64);
  G.makeRhsCarterF32(a, L, Q, -1)(Float64Array.of(r, fr(th), 0, fr(D * pr), fr(pth), 0), o32);
  for (let i = 0; i < 6; i++) assert.ok(Math.abs(o32[i] - o64[i]) < 1e-4 * (1 + Math.abs(o64[i])), `C f32 bileşen ${i}`);
});
