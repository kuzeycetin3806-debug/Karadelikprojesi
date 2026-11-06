/**
 * kerr.js ve units.js testleri.  Çalıştırma:  npm test   (veya:  node --test "src/physics/*.test.mjs")
 * NOT: `node --test src/physics/` Node ≥ 21'de dizini dosya sanıp başarısız olur.
 * Birimler: G = c = 1, uzunluk M cinsinden (aksi belirtilmedikçe M = 1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  metricBL,
  horizonRadii,
  ergosphereRadius,
  frameDraggingOmega,
  photonOrbitRadius,
  iscoRadius,
  keplerOmega,
  circularOrbitUt,
  circularOrbitEnergy,
  circularOrbitAngularMomentum,
  diskRedshiftFactor,
  staticRedshift,
  criticalCurve,
  shadowBoundary,
} from './kerr.js';
import {
  C,
  GM_SUN,
  gravitationalRadiusKm,
  schwarzschildRadiusKm,
  timeUnitSeconds,
  lengthToKm,
  kmToLength,
  timeToSeconds,
  secondsToTime,
} from './units.js';

const close = (actual, expected, tol = 1e-12, msg = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg} beklenen ${expected}, bulunan ${actual}, fark ${Math.abs(actual - expected)} > ${tol}`
  );

const R_CRIT = 3 * Math.sqrt(3); // Schwarzschild kritik etki parametresi (M=1)

// ---------------------------------------------------------------------------
// a = 0 (Schwarzschild) sınır değerleri
// ---------------------------------------------------------------------------

test('a=0: ufuklar r+=2M, r-=0', () => {
  const { rPlus, rMinus } = horizonRadii(1, 0);
  close(rPlus, 2);
  close(rMinus, 0);
});

test('a=0: r_ph=3M (prograd ve retrograd), r_isco=6M', () => {
  close(photonOrbitRadius(1, 0, true), 3);
  close(photonOrbitRadius(1, 0, false), 3);
  close(iscoRadius(1, 0, true), 6);
  close(iscoRadius(1, 0, false), 6);
});

test('a=0: Ω(6M) = 6^{-3/2}; retrogradda işaret ters', () => {
  close(keplerOmega(1, 0, 6, true), Math.pow(6, -1.5));
  close(keplerOmega(1, 0, 6, false), -Math.pow(6, -1.5));
});

test('a=0: u^t = 1/√(1−3M/r), r=6M için √2', () => {
  close(circularOrbitUt(1, 0, 6, true), Math.SQRT2);
  close(circularOrbitUt(1, 0, 10, true), 1 / Math.sqrt(1 - 0.3));
});

test('a=0: gölge sınırı yarıçapı 3√3 M (tüm noktalar, her eğim açısı)', () => {
  for (const inc of [0, 0.3, Math.PI / 4, Math.PI / 2, 2.5, Math.PI]) {
    const pts = shadowBoundary(1, 0, inc, 128);
    assert.equal(pts.length, 128);
    for (const p of pts) close(Math.hypot(p.alpha, p.beta), R_CRIT, 1e-12, `inc=${inc}`);
  }
});

test('a=0: staticRedshift(r=6M) = √(2/3)', () => {
  close(staticRedshift(1, 0, 6, Math.PI / 2), Math.sqrt(2 / 3));
  close(staticRedshift(1, 0, 6, 0.7), Math.sqrt(2 / 3)); // θ'dan bağımsız
});

test('a=0: ISCO ve foton küresinde E, L Schwarzschild değerleriyle uyumlu', () => {
  close(circularOrbitEnergy(1, 0, 6), 2 * Math.SQRT2 / 3); // E_isco = √(8/9)
  close(circularOrbitAngularMomentum(1, 0, 6), 2 * Math.sqrt(3)); // L_isco = 2√3 M
  close(1 - circularOrbitEnergy(1, 0, 6), 0.0572, 5e-5); // verim 5.72 %
});

test('a=0: disk kırmızıya kayması (Schwarzschild)', () => {
  // λ=0: yalnızca enine Doppler + yerçekimi: g = √(1−3M/r)
  close(diskRedshiftFactor(1, 0, 6, 0), Math.sqrt(0.5));
  // Kenardan bakış: λ = −α; g = √(1−3/r)/(1+Ω α)  [Luminet 1979]
  const r = 8;
  const Om = Math.pow(r, -1.5);
  const alpha = 3.0;
  close(diskRedshiftFactor(1, 0, r, -alpha), Math.sqrt(1 - 3 / r) / (1 + Om * alpha));
  // Yaklaşan tarafta (α<0 ⇒ λ>0) g daha büyük (λ'nın işaretine göre monotonluk)
  assert.ok(diskRedshiftFactor(1, 0, r, +6) > diskRedshiftFactor(1, 0, r, -6));
});

test('diskRedshiftFactor: Ωλ>0 yalnızca g > 1/u^t garantisi verir (g>1 değil)', () => {
  // a=0, r=6M, λ=0.1: Ωλ>0 ama g ≈ 0.712 < 1 (K4)
  const ut = circularOrbitUt(1, 0, 6, true);
  const Om = keplerOmega(1, 0, 6, true);
  const lam = 0.1;
  assert.ok(Om * lam > 0);
  const g = diskRedshiftFactor(1, 0, 6, lam, true);
  assert.ok(g > 1 / ut);
  assert.ok(g < 1);
  // Yeterince büyük λ ile g>1 olur
  assert.ok(diskRedshiftFactor(1, 0, 6, 6, true) > 1);
});

// ---------------------------------------------------------------------------
// Ekstrem Kerr limitleri (a → M)
// ---------------------------------------------------------------------------

test('a=M: r_isco prograd→M, retrograd→9M; r_ph prograd→M, retrograd→4M', () => {
  close(iscoRadius(1, 1, true), 1, 1e-12);
  close(iscoRadius(1, 1, false), 9, 1e-12);
  close(photonOrbitRadius(1, 1, true), 1, 1e-12);
  close(photonOrbitRadius(1, 1, false), 4, 1e-12);
  const h = horizonRadii(1, 1);
  close(h.rPlus, 1);
  close(h.rMinus, 1);
});

test('a→M (a=1−1e-9): sürekli yaklaşım', () => {
  const a = 1 - 1e-9;
  // r_isco,pro − M ≈ (4δ)^{1/3} ~ 1.6e-3, r_ph,pro − M ~ (2·... δ)^{1/2} ~ 1e-4
  close(iscoRadius(1, a, true), 1, 5e-3);
  close(iscoRadius(1, a, false), 9, 1e-6);
  close(photonOrbitRadius(1, a, true), 1, 1e-3);
  close(photonOrbitRadius(1, a, false), 4, 1e-6);
});

test('a=M: verim 1−E_isco → 1−1/√3 ≈ 0.4226 (Thorne 1974)', () => {
  const E = circularOrbitEnergy(1, 1, 1 + 1e-4, true);
  close(1 - E, 1 - 1 / Math.sqrt(3), 1e-3);
});

test('a=M: criticalCurve limiti r=M → (ξ, η) = (2M, 3M²); r=4M → (−7M, 0)', () => {
  const c1 = criticalCurve(1, 1, 1);
  close(c1.xi, 2);
  close(c1.eta, 3);
  const c4 = criticalCurve(1, 1, 4);
  close(c4.xi, -7);
  close(c4.eta, 0, 1e-12);
});

test('a=M: kenardan gölge α ∈ [−2M, 7M], dikey kenar |β|≤√3 M (Bardeen 1973)', () => {
  // a=M, θ_o=90°: sol uç "açık" → n−1 çift olsun (n=361) ki α_max=7 örneklensin.
  const pts = shadowBoundary(1, 1, Math.PI / 2, 361);
  assert.equal(pts.length, 361);
  const al = pts.map((p) => p.alpha);
  close(Math.min(...al), -2, 1e-8);
  close(Math.max(...al), 7, 1e-8);
  // Dikey doğru parçası: ilk nokta (−2, +√3), son nokta (−2, −√3); aradaki tüm noktalar α>−2.
  close(pts[0].alpha, -2, 1e-12);
  close(pts[0].beta, Math.sqrt(3), 1e-12);
  close(pts[360].alpha, -2, 1e-12);
  close(pts[360].beta, -Math.sqrt(3), 1e-12);
  for (let k = 1; k < 360; k++) assert.ok(pts[k].alpha > -2);
  // α=+7 ucunda β=0
  const kmax = al.indexOf(Math.max(...al));
  close(pts[kmax].beta, 0, 1e-12);
});

test('shadowBoundary: uç noktalarda β tam 0 (a<M, kenardan ve eğik gözlemci)', () => {
  for (const [a, inc] of [[0.9, Math.PI / 2], [0.9, 1.0], [0.5, 0.4]]) {
    const pts = shadowBoundary(1, a, inc, 100); // çift n: t=0 ve t=π örneklenir
    assert.equal(pts[0].beta, 0);
    assert.equal(pts[50].beta, 0);
    const bs = pts.map((p) => p.beta);
    assert.ok(bs.slice(1, 50).every((b) => b > 0));
    assert.ok(bs.slice(51).every((b) => b < 0));
  }
});

test('a=M: yüz yüze gölge yarıçapı 2(1+√2) M', () => {
  for (const p of shadowBoundary(1, 1, 0, 16)) {
    close(Math.hypot(p.alpha, p.beta), 2 * (1 + Math.SQRT2), 1e-12);
  }
});

// ---------------------------------------------------------------------------
// a = 0.9 (literatür karşılaştırması)
// ---------------------------------------------------------------------------

test('a=0.9: literatür değerleri (BPT 1972, Thorne 1974)', () => {
  const a = 0.9;
  close(horizonRadii(1, a).rPlus, 1 + Math.sqrt(0.19), 1e-12); // 1.43589
  close(horizonRadii(1, a).rMinus, 1 - Math.sqrt(0.19), 1e-12);
  close(iscoRadius(1, a, true), 2.32088, 5e-5); // tablolardaki 2.321
  close(iscoRadius(1, a, false), 8.71735, 5e-5); // 8.717
  close(photonOrbitRadius(1, a, true), 1.55785, 5e-5);
  close(photonOrbitRadius(1, a, false), 3.91027, 5e-5);
  close(1 - circularOrbitEnergy(1, a, iscoRadius(1, a, true), true), 0.1558, 5e-4); // η ≈ 15.6 %
});

test('a=0.5 ve a=0.998 ISCO (Thorne 1974: 4.233 M, 1.237 M; η≈0.321)', () => {
  close(iscoRadius(1, 0.5, true), 4.233, 5e-4);
  close(iscoRadius(1, 0.998, true), 1.2369, 5e-4);
  close(1 - circularOrbitEnergy(1, 0.998, iscoRadius(1, 0.998, true), true), 0.321, 1e-3);
});

test('foton yörüngesi ve ISCO bağımsız cebirsel koşulları sağlar (BPT 2.18, 2.21)', () => {
  for (const a of [0.1, 0.5, 0.9, 0.99]) {
    for (const pro of [true, false]) {
      const s = pro ? 1 : -1;
      const rp = photonOrbitRadius(1, a, pro);
      close(Math.pow(rp, 1.5) - 3 * Math.sqrt(rp) + 2 * s * a, 0, 1e-12, `r_ph a=${a}`);
      const ri = iscoRadius(1, a, pro);
      close(ri * ri - 6 * ri + 8 * s * a * Math.sqrt(ri) - 3 * a * a, 0, 1e-11, `r_isco a=${a}`);
    }
  }
});

test('dairesel yörünge E, L, u^t, Ω metrikle tutarlı (u·u=−1, E=−u_t, L=u_φ)', () => {
  for (const a of [0, 0.5, 0.9]) {
    for (const pro of [true, false]) {
      for (const r of [iscoRadius(1, a, pro) + 0.5, 12, 30]) {
        const g = metricBL(1, a, r, Math.PI / 2);
        const Om = keplerOmega(1, a, r, pro);
        const ut = circularOrbitUt(1, a, r, pro);
        // u^t = 1/√(−(g_tt + 2 g_tφ Ω + g_φφ Ω²))
        close(ut, 1 / Math.sqrt(-(g.gtt + 2 * g.gtphi * Om + g.gphiphi * Om * Om)), 1e-11);
        const E = -(g.gtt * ut + g.gtphi * Om * ut);
        const L = g.gtphi * ut + g.gphiphi * Om * ut;
        close(circularOrbitEnergy(1, a, r, pro), E, 1e-11, `E a=${a} r=${r}`);
        close(circularOrbitAngularMomentum(1, a, r, pro), L, 1e-10, `L a=${a} r=${r}`);
      }
    }
  }
});

test('ISCO: dE/dr = 0 (BPT ISCO tanımı, sayısal türev)', () => {
  for (const a of [0, 0.5, 0.9]) {
    for (const pro of [true, false]) {
      const ri = iscoRadius(1, a, pro);
      const h = 1e-5;
      const dE =
        (circularOrbitEnergy(1, a, ri + h, pro) - circularOrbitEnergy(1, a, ri - h, pro)) / (2 * h);
      close(dE, 0, 1e-7, `a=${a} pro=${pro}`);
    }
  }
});

// ---------------------------------------------------------------------------
// criticalCurve
// ---------------------------------------------------------------------------

test('criticalCurve: r=r_ph (prograd/retrograd) uçlarında η=0', () => {
  for (const a of [0.01, 0.1, 0.5, 0.9, 0.99, 0.999999]) {
    for (const pro of [true, false]) {
      const rp = photonOrbitRadius(1, a, pro);
      const { eta } = criticalCurve(1, a, rp);
      close(eta, 0, 1e-8, `a=${a} pro=${pro}`);
    }
  }
  // a=M: retrograd uç (r=4M) η=0; prograd r=M'de limit sırası nedeniyle η=3M² (belgelenmiş istisna)
  close(criticalCurve(1, 1, 4).eta, 0, 1e-12);
  close(criticalCurve(1, 1, photonOrbitRadius(1, 1, true)).eta, 3, 1e-9);
});

test('criticalCurve: uç ξ değerleri işaretleri (prograd ξ>0, retrograd ξ<0) ve a=M değerleri', () => {
  for (const a of [0.3, 0.9]) {
    assert.ok(criticalCurve(1, a, photonOrbitRadius(1, a, true)).xi > 0);
    assert.ok(criticalCurve(1, a, photonOrbitRadius(1, a, false)).xi < 0);
  }
  close(criticalCurve(1, 1, photonOrbitRadius(1, 1, true)).xi, 2, 1e-9);
  close(criticalCurve(1, 1, photonOrbitRadius(1, 1, false)).xi, -7, 1e-9);
});

test('criticalCurve: Carter radyal potansiyeli R(r)=0 ve R\'(r)=0 (çift kök)', () => {
  // R(r) = [(r²+a²) − aξ]² − Δ[(ξ−a)² + η]  (Bardeen 1973)
  for (const a of [0.2, 0.7, 0.95, 1]) {
    const r1 = photonOrbitRadius(1, a, true);
    const r2 = photonOrbitRadius(1, a, false);
    for (let i = 0; i <= 20; i++) {
      const r = r1 + ((r2 - r1) * i) / 20;
      const { xi, eta } = criticalCurve(1, a, r);
      assert.ok(eta >= -1e-9);
      const D = r * r - 2 * r + a * a;
      const P = r * r + a * a - a * xi;
      const K2 = (xi - a) ** 2 + eta;
      close(P * P - D * K2, 0, 1e-10, `R a=${a} r=${r}`);
      close(4 * r * P - (2 * r - 2) * K2, 0, 1e-10, `R' a=${a} r=${r}`);
    }
  }
});

test('criticalCurve: küçük a açılımı ξ_pro = 3√3 − 2a − a²/(2√3) + O(a³), ξ_retro = −3√3 − 2a + O(a²)', () => {
  // Türetme (M=1): prograd foton yörüngesi √r (r−3) + 2a = 0 → r = 3 − 2a/√3 + O(a²);
  // ξ = [r²(3−r) − a²(r+1)]/[a(r−1)] → ξ = 3√3 − 2a + c₂a², c₂ sayısal olarak −1/(2√3)=−0.288675.
  // (İşaret hatası ξ=3√3+2a veya ξ=3√3 olsaydı fark 2a ≥ 2e-3 olurdu; tolerans O(a³) mertebesinde.)
  const s3 = 3 * Math.sqrt(3);
  for (const a of [1e-2, 1e-3]) {
    const rp = photonOrbitRadius(1, a, true);
    const { xi, eta } = criticalCurve(1, a, rp);
    close(xi, s3 - 2 * a - (a * a) / (2 * Math.sqrt(3)), 5 * a * a * a, `ξ_pro a=${a}`);
    // Önde gelen terim tek başına O(a²) hatalı kalır: işaret/katsayı hatası yakalanır
    assert.ok(Math.abs(xi - (s3 - 2 * a)) < 0.4 * a * a);
    assert.ok(Math.abs(xi - (s3 + 2 * a)) > 3.9 * a);
    close(eta, 0, 1e-8);
    close(xi * xi + eta, 27 - 12 * Math.sqrt(3) * a, 5 * a * a); // ξ²+η = 27 − 12√3 a + O(a²)
    close(rp, 3 - (2 * a) / Math.sqrt(3), 2 * a * a);
    // Retrograd: ξ_retro = −3√3 − 2a + O(a²) (ξ<0; |ξ| büyür)
    const rr = photonOrbitRadius(1, a, false);
    const xr = criticalCurve(1, a, rr).xi;
    close(xr, -s3 - 2 * a, 0.4 * a * a, `ξ_retro a=${a}`);
  }
});

test('criticalCurve: a=0 anlamlı hata fırlatır', () => {
  assert.throws(() => criticalCurve(1, 0, 3), RangeError);
});

// ---------------------------------------------------------------------------
// shadowBoundary (Kerr)
// ---------------------------------------------------------------------------

test('shadowBoundary: Kerr gölgesi a>0 için +α yönüne kayar, β simetrik, kapalı ve sonlu', () => {
  for (const a of [0.3, 0.9, 0.998]) {
    for (const inc of [0.2, 1.0, Math.PI / 2]) {
      const pts = shadowBoundary(1, a, inc, 200);
      for (const p of pts) assert.ok(Number.isFinite(p.alpha) && Number.isFinite(p.beta));
      const al = pts.map((p) => p.alpha);
      const mean = al.reduce((s, x) => s + x, 0) / al.length;
      assert.ok(Math.max(...al) + Math.min(...al) > 0, `a=${a} inc=${inc}: +α kayması`);
      assert.ok(mean > 0 || a < 0.1);
      // β → −β simetrisi
      const betas = pts.map((p) => p.beta);
      close(Math.max(...betas), -Math.min(...betas), 1e-9);
    }
  }
});

test('shadowBoundary: ekvatoral gözlemci α uçları = −ξ(r_ph) (Bardeen 1973)', () => {
  const a = 0.9;
  const pts = shadowBoundary(1, a, Math.PI / 2, 360);
  const al = pts.map((p) => p.alpha);
  close(Math.min(...al), -criticalCurve(1, a, photonOrbitRadius(1, a, true)).xi, 1e-9);
  close(Math.max(...al), -criticalCurve(1, a, photonOrbitRadius(1, a, false)).xi, 1e-9);
});

test('shadowBoundary: noktalar eğri ilişkisini sağlar α²+β² = η+ξ²+a²cos²θ_o', () => {
  const a = 0.7;
  const inc = 1.1;
  const pts = shadowBoundary(1, a, inc, 90);
  // Her nokta için r'yi α'dan geri çözmek yerine ξ = −α sinθ_o ile tutarlılık:
  // ξ'nin criticalCurve aralığında olduğunu ve (ξ,η) çiftinin eğri üzerinde bulunduğunu doğrula.
  for (const p of pts) {
    const xi = -p.alpha * Math.sin(inc);
    // r'yi ξ(r) monoton azaldığı için bisection ile bul
    let lo = photonOrbitRadius(1, a, true);
    let hi = photonOrbitRadius(1, a, false);
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi);
      if (criticalCurve(1, a, mid).xi > xi) lo = mid;
      else hi = mid;
    }
    const eta = criticalCurve(1, a, 0.5 * (lo + hi)).eta;
    const lhs = p.alpha ** 2 + p.beta ** 2;
    const rhs = eta + xi * xi + a * a * Math.cos(inc) ** 2;
    close(lhs, rhs, 1e-7);
  }
});

test('shadowBoundary: M ölçeklemesi çok küçük M için de geçerli (K1: tol ∝ M²)', () => {
  for (const [M, inc] of [[1e-6, 1.4], [1e-4, Math.PI / 2 - 0.001], [1e6, 1.4]]) {
    const p1 = shadowBoundary(1, 0.9, inc, 64);
    const pM = shadowBoundary(M, 0.9 * M, inc, 64);
    p1.forEach((p, i) => {
      close(pM[i].alpha / M, p.alpha, 1e-7, `M=${M} i=${i}`);
      close(pM[i].beta / M, p.beta, 1e-7, `M=${M} i=${i}`);
    });
    assert.equal(pM[0].beta, 0);
    assert.equal(pM[32].beta, 0);
  }
});

// ---------------------------------------------------------------------------
// Ekran yönelimi: bağımsız (Bardeen formülünü kullanmayan) vektörel sınama  [Ö1, Ö2]
// ---------------------------------------------------------------------------

test('ekran yönelimi: düz uzayda L_z = (b×n̂)_z = −α sinθ_o (ê_α = ê_β × n̂, vektörel kurulum)', () => {
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cross = (u, v) => [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const norm = (u) => {
    const l = Math.hypot(...u);
    return u.map((x) => x / l);
  };
  const zhat = [0, 0, 1];
  for (const thetaO of [0.3, 1.0, Math.PI / 2, 2.2, 3.0]) {
    for (const phiO of [0, 0.7, -2.0]) {
      // n̂: delikten gözlemciye
      const n = [
        Math.sin(thetaO) * Math.cos(phiO),
        Math.sin(thetaO) * Math.sin(phiO),
        Math.cos(thetaO),
      ];
      // ê_β: +z'nin ekrana (n̂'ya dik düzleme) izdüşümü
      const zp = zhat.map((z, i) => z - dot(zhat, n) * n[i]);
      const eb = norm(zp);
      // ê_α = ê_β × n̂ (gözlemci deliğe bakarken sağ taraf: ileri × yukarı = (−n̂) × ê_β)
      const ea = cross(eb, n);
      const forward = n.map((x) => -x);
      const rightByDef = cross(forward, eb);
      for (let i = 0; i < 3; i++) close(ea[i], rightByDef[i], 1e-14);
      for (const [alpha, beta] of [[-7, 0], [4, -1.5], [2.5, 3.1]]) {
        const b = [0, 1, 2].map((i) => alpha * ea[i] + beta * eb[i]);
        // Fiziksel foton +n̂ yönünde gider; konumu b (+ n̂ boyunca kayma) → L = x × p, p = n̂
        const L = cross(b, n);
        close(L[2], -alpha * Math.sin(thetaO), 1e-13, `θ_o=${thetaO} φ_o=${phiO} α=${alpha}`);
        // β bileşeni L_z'ye katkı vermez (ê_β, n̂ ve ẑ ile aynı düzlemde)
        close(dot(b, n), 0, 1e-14);
      }
    }
  }
});

test('ekran yönelimi: sabit referans g değerleri (bağımsız ışın izleme, a=0.9, θ_o=80°)', () => {
  // Kaynak: bilimsel denetim raporu §3b — ekrandan geometrik kurulan ışınlar, Bardeen formülü
  // kullanılmadan Kerr geodeziği olarak integre edildi. Girdi: λ = −α sinθ_o.
  const a = 0.9;
  const thetaO = (80 * Math.PI) / 180;
  const cases = [
    { alpha: -7, r: 6.208, g: 1.29907 }, // yaklaşan taraf (sol), mavi
    { alpha: +7, r: 5.7629, g: 0.4994 }, // uzaklaşan taraf (sağ), kırmızı
  ];
  for (const { alpha, r, g } of cases) {
    const lam = -alpha * Math.sin(thetaO);
    close(diskRedshiftFactor(1, a, r, lam, true), g, 1e-4, `α=${alpha}`);
  }
  assert.ok(diskRedshiftFactor(1, a, 6.208, 7 * Math.sin(thetaO), true) > 1);
  assert.ok(diskRedshiftFactor(1, a, 5.7629, -7 * Math.sin(thetaO), true) < 1);
});

test('shadowBoundary: a→0 sürekliliği (a=1e-3, çember ±0.1 %)', () => {
  for (const p of shadowBoundary(1, 1e-3, 1.0, 64)) {
    close(Math.hypot(p.alpha, p.beta), R_CRIT, 3e-3);
  }
});

test('shadowBoundary: M ölçeklemesi ve girdi doğrulama', () => {
  const p1 = shadowBoundary(1, 0.9, 1.0, 40);
  const p3 = shadowBoundary(3, 2.7, 1.0, 40);
  p1.forEach((p, i) => {
    close(p3[i].alpha, 3 * p.alpha, 1e-9);
    close(p3[i].beta, 3 * p.beta, 1e-9);
  });
  assert.throws(() => shadowBoundary(1, 0.5, 1, 3), RangeError);
  assert.throws(() => shadowBoundary(1, 0.5, -0.1, 16), RangeError);
  assert.throws(() => shadowBoundary(1, 1.5, 1, 16), RangeError);
});

// ---------------------------------------------------------------------------
// Metrik, ergosfer, çerçeve sürüklenmesi
// ---------------------------------------------------------------------------

test('metrik: a=0 Schwarzschild bileşenleri', () => {
  const r = 5;
  const th = 1.1;
  const g = metricBL(1, 0, r, th);
  close(g.gtt, -(1 - 2 / r));
  close(g.gtphi, 0);
  close(g.gphiphi, r * r * Math.sin(th) ** 2);
  close(g.grr, 1 / (1 - 2 / r));
  close(g.gthth, r * r);
  close(g.Sigma, r * r);
  close(g.Delta, r * r - 2 * r);
});

test('metrik: Kerr özdeşlikleri g_tt g_φφ − g_tφ² = −Δ sin²θ ve Σ,Δ,A tanımları', () => {
  for (const [a, r, th] of [
    [0.9, 3, 0.8],
    [0.5, 10, 1.4],
    [0.99, 1.6, Math.PI / 2],
  ]) {
    const g = metricBL(1, a, r, th);
    close(g.gtt * g.gphiphi - g.gtphi ** 2, -g.Delta * Math.sin(th) ** 2, 1e-10);
    close(g.Sigma, r * r + a * a * Math.cos(th) ** 2);
    close(g.Delta, r * r - 2 * r + a * a);
    close(g.A, (r * r + a * a) ** 2 - a * a * g.Delta * Math.sin(th) ** 2);
  }
});

test('ergoyüzey: ekvatorda 2M, kutupta r+, gtt=0 doğrulaması', () => {
  close(ergosphereRadius(1, 0.9, Math.PI / 2), 2);
  close(ergosphereRadius(1, 0, 0.7), 2);
  close(ergosphereRadius(1, 0.9, 0), horizonRadii(1, 0.9).rPlus);
  close(ergosphereRadius(1, 1, Math.PI / 2), 2);
  for (const th of [0.4, 1.0, 1.5]) {
    const rE = ergosphereRadius(1, 0.9, th);
    close(metricBL(1, 0.9, rE, th).gtt, 0, 1e-12);
  }
});

test('çerçeve sürüklenmesi: ω = −g_tφ/g_φφ; ufukta Ω_H = a/(2M r+); eksende 0/0 yok', () => {
  const a = 0.9;
  for (const [r, th] of [[2.5, 1.0], [6, Math.PI / 2], [20, 0.4]]) {
    const g = metricBL(1, a, r, th);
    close(frameDraggingOmega(1, a, r, th), -g.gtphi / g.gphiphi, 1e-13);
  }
  const rp = horizonRadii(1, a).rPlus;
  close(frameDraggingOmega(1, a, rp, 1.0), a / (2 * rp), 1e-12);
  close(frameDraggingOmega(1, a, rp + 1e-9, 1.0), a / (2 * rp), 1e-8);
  assert.ok(Number.isFinite(frameDraggingOmega(1, a, 5, 0)));
});

test('asimptotik: r→∞ için g_tt→−1, ω→0 (ω ≈ 2Ma/r³), Ω_Kepler ≈ r^{-3/2}', () => {
  const r = 1e6;
  close(metricBL(1, 0.9, r, 1.0).gtt, -1, 1e-5);
  close(metricBL(1, 0.9, r, 1.0).grr, 1, 1e-5);
  const w = frameDraggingOmega(1, 0.9, r, 1.0);
  assert.ok(w < 1e-17 && w > 0);
  close(w / ((2 * 0.9) / r ** 3), 1, 1e-6);
  close(keplerOmega(1, 0.9, r, true) / Math.pow(r, -1.5), 1, 1e-8);
  close(staticRedshift(1, 0.9, r, 1.0), 1, 1e-5);
  close(diskRedshiftFactor(1, 0.9, r, 0, true), 1, 1e-5);
});

// ---------------------------------------------------------------------------
// M ölçeklemesi
// ---------------------------------------------------------------------------

test('M ölçeklemesi: M=2 iken tüm yarıçaplar iki katı (a* sabit)', () => {
  for (const a of [0, 0.5, 0.9]) {
    for (const pro of [true, false]) {
      close(photonOrbitRadius(2, 2 * a, pro), 2 * photonOrbitRadius(1, a, pro), 1e-12);
      close(iscoRadius(2, 2 * a, pro), 2 * iscoRadius(1, a, pro), 1e-12);
    }
    close(horizonRadii(2, 2 * a).rPlus, 2 * horizonRadii(1, a).rPlus, 1e-12);
    close(horizonRadii(2, 2 * a).rMinus, 2 * horizonRadii(1, a).rMinus, 1e-12);
    close(ergosphereRadius(2, 2 * a, 0.8), 2 * ergosphereRadius(1, a, 0.8), 1e-12);
  }
  // Boyutsuz büyüklükler değişmez, Ω ∝ 1/M
  close(circularOrbitUt(2, 1.0, 20, true), circularOrbitUt(1, 0.5, 10, true), 1e-12);
  close(keplerOmega(2, 1.0, 20, true), 0.5 * keplerOmega(1, 0.5, 10, true), 1e-12);
  close(staticRedshift(2, 1.0, 20, 1.0), staticRedshift(1, 0.5, 10, 1.0), 1e-12);
  close(criticalCurve(2, 1.0, 20).xi, 2 * criticalCurve(1, 0.5, 10).xi, 1e-10);
  close(criticalCurve(2, 1.0, 20).eta, 4 * criticalCurve(1, 0.5, 10).eta, 1e-9);
  // g-faktörü: λ uzunluk boyutlu
  close(
    diskRedshiftFactor(2, 1.0, 20, 6, true),
    diskRedshiftFactor(1, 0.5, 10, 3, true),
    1e-12
  );
});

test('M varsayılanı (undefined → 1)', () => {
  assert.deepEqual(horizonRadii(undefined, 0), { rPlus: 2, rMinus: 0 });
  close(iscoRadius(undefined, 0, true), 6);
});

// ---------------------------------------------------------------------------
// Hata davranışı
// ---------------------------------------------------------------------------

test('geçersiz girdi RangeError fırlatır (sessiz NaN yok)', () => {
  assert.throws(() => horizonRadii(1, 1.01), RangeError); // |a| > M
  assert.throws(() => horizonRadii(0, 0), RangeError);
  assert.throws(() => horizonRadii(-1, 0), RangeError);
  assert.throws(() => horizonRadii(1, NaN), RangeError);
  assert.throws(() => iscoRadius(1, -0.5, true), RangeError); // a<0 prograde bayraklı
  assert.throws(() => photonOrbitRadius(1, 2, true), RangeError);
  assert.throws(() => metricBL(1, 0.9, 1.4, 1.0), RangeError); // r < r+
  assert.throws(() => metricBL(1, 0, 2, 1.0), RangeError); // r = r+
  assert.throws(() => frameDraggingOmega(1, 0.9, 1.0, 1.0), RangeError);
  assert.throws(() => keplerOmega(1, 0.9, NaN, true), RangeError);
  assert.throws(() => circularOrbitUt(1, 0, 3, true), RangeError); // r = r_ph
  assert.throws(() => circularOrbitUt(1, 0, 2.5, true), RangeError); // r < r_ph
  assert.throws(() => circularOrbitUt(1, 0.5, 3.5, false), RangeError); // retro r_ph=3.53
  assert.throws(() => staticRedshift(1, 0, 2, Math.PI / 2), RangeError); // ufukta
  assert.throws(() => staticRedshift(1, 0.9, 1.9, Math.PI / 2), RangeError); // ergosferde
  assert.throws(() => diskRedshiftFactor(1, 0, 6, 1e3), RangeError); // 1−Ωλ<0
  assert.throws(() => diskRedshiftFactor(1, 0, 6, Infinity), RangeError);
});

test('K2: Δ=(r−r₊)(r−r₋); r>r₊ iken Δ=0 / g_rr=∞ dönmez, ufukta RangeError', () => {
  // a=M: r₊=r₋=M → Δ=(r−1)². Eski açık biçim r−1 ≲ 1e-8'de 0 döndürebiliyordu.
  for (const eps of [1e-3, 1e-6, 1e-8, 1e-9, 1e-12, 1e-15]) {
    const r = 1 + eps;
    const e = r - 1; // tam
    const g = metricBL(1, 1, r, 1.0);
    assert.ok(g.Delta > 0, `eps=${eps}`);
    assert.ok(Number.isFinite(g.grr), `eps=${eps}`);
    close(g.Delta / (e * e), 1, 1e-12, `eps=${eps}`);
  }
  // a=0.999999: log ızgarada r₊'nın hemen dışı
  const rp = horizonRadii(1, 0.999999).rPlus;
  const rm = horizonRadii(1, 0.999999).rMinus;
  for (let k = 0; k < 40; k++) {
    const r = rp + Math.pow(10, -2 - 0.3 * k);
    if (!(r > rp)) continue;
    const g = metricBL(1, 0.999999, r, 0.5);
    assert.ok(g.Delta > 0 && Number.isFinite(g.grr), `k=${k}`);
    close(g.Delta / ((r - rp) * (r - rm)), 1, 1e-6, `k=${k}`);
  }
  // Ufukta ve içinde: RangeError (sessiz sonsuzluk yok)
  assert.throws(() => metricBL(1, 1, 1, 1.0), RangeError);
  assert.throws(() => metricBL(1, 0.999999, rp, 1.0), RangeError);
  // Çerçeve sürüklenmesi ufukta tanımlı kalır ve Ω_H'ye eşittir (a/(2M r₊))
  close(frameDraggingOmega(1, 1, 1, 1.0), 0.5, 1e-14);
});

test('K3: keplerOmega retrograd a=M, r=M RangeError; çevresinde sonlu', () => {
  assert.throws(() => keplerOmega(1, 1, 1, false), RangeError);
  assert.throws(() => keplerOmega(2, 2, 2, false), RangeError);
  // Prograd aynı noktada limit değeri verir: 1/(1+1)
  close(keplerOmega(1, 1, 1, true), 0.5, 1e-14);
  // r > M'de retrograd sonlu ve negatif
  const om = keplerOmega(1, 1, 1 + 1e-6, false);
  assert.ok(Number.isFinite(om) && om < 0);
  // r_isco,retro = 9M'de Ω = −1/(27 − 1)
  close(keplerOmega(1, 1, 9, false), -1 / 26, 1e-14);
});

test('ergosfer içi/dışı: statik gözlemci yalnızca dışarıda', () => {
  const rE = ergosphereRadius(1, 0.9, Math.PI / 2);
  assert.ok(staticRedshift(1, 0.9, rE + 1e-6, Math.PI / 2) < 1e-2);
  // Kutupta ergosfer yok: ufuğun hemen dışında da tanımlı
  const rp = horizonRadii(1, 0.9).rPlus;
  assert.ok(Number.isFinite(staticRedshift(1, 0.9, rp + 0.01, 0)));
});

// ---------------------------------------------------------------------------
// Kerr disk kırmızıya kayması: tutarlılık
// ---------------------------------------------------------------------------

test('diskRedshiftFactor: g = 1/(u^t(1−Ωλ)); prograd disk, ekran koordinatı ilişkisi', () => {
  const a = 0.9;
  const r = 6;
  const ut = circularOrbitUt(1, a, r, true);
  const Om = keplerOmega(1, a, r, true);
  const lam = 2.0;
  close(diskRedshiftFactor(1, a, r, lam, true), 1 / (ut * (1 - Om * lam)), 1e-14);
  // ξ=λ=−α sinθ_o: α<0 (yaklaşan taraf) için g, α>0 tarafından büyük
  const sinO = 1;
  assert.ok(
    diskRedshiftFactor(1, a, r, -(-3) * sinO, true) > diskRedshiftFactor(1, a, r, -(3) * sinO, true)
  );
  // Retrograd diskte Ω<0 → işaret tersine döner
  assert.ok(diskRedshiftFactor(1, a, 10, -2, false) > diskRedshiftFactor(1, a, 10, 2, false));
});

// ---------------------------------------------------------------------------
// units.js
// ---------------------------------------------------------------------------

test('units: 1 M_sun için GM/c² ≈ 1.4766 km, r_s ≈ 2.9532 km, GM/c³ ≈ 4.9255 µs', () => {
  close(gravitationalRadiusKm(1), 1.4766, 5e-5);
  close(schwarzschildRadiusKm(1), 2.9532, 1e-4);
  close(timeUnitSeconds(1), 4.9255e-6, 5e-10);
  close(gravitationalRadiusKm(1), GM_SUN / (C * C) / 1e3, 1e-15);
});

test('units: kütle ve dönüşüm ölçeklemesi', () => {
  close(gravitationalRadiusKm(10) / gravitationalRadiusKm(1), 10, 1e-12);
  close(timeUnitSeconds(4.3e6) / timeUnitSeconds(1), 4.3e6, 1e-3);
  close(lengthToKm(2, 1), schwarzschildRadiusKm(1), 1e-12);
  close(kmToLength(lengthToKm(7.3, 12), 12), 7.3, 1e-12);
  close(secondsToTime(timeToSeconds(5, 3), 3), 5, 1e-12);
  assert.throws(() => gravitationalRadiusKm(0), RangeError);
  assert.throws(() => timeUnitSeconds(-1), RangeError);
  assert.throws(() => gravitationalRadiusKm(NaN), RangeError);
});
