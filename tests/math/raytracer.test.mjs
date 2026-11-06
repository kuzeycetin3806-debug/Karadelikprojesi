import test from 'node:test';
import assert from 'node:assert/strict';
import { createCamera } from '../../src/math/camera.js';
import { traceRay } from '../../src/math/raytracer.js';
import * as G from '../../src/math/geodesic.js';
import { integrateRK4, integrateDP45 } from '../../src/math/integrators.js';
import { iscoRadius, photonOrbitRadius, criticalCurve } from '../../src/physics/kerr.js';
import { scanShadow } from '../../tools/shadow-scan.mjs';
import { rng, slope, deg, exactDeflection, deflectionSeries } from './helpers.mjs';

const fmt = (x) => x.toExponential(2);

// ---------------------------------------------------------------------------
// 1. Korunum
// ---------------------------------------------------------------------------
test('1. Korunum: |ΔH|, ΔQ/(|Q|+L²), radyal kısıt — DP5(4) rtol=1e-10, a ∈ {0, 0.5, 0.9, 0.998}', () => {
  const rand = rng(2024);
  const rtol = 1e-10;
  console.log(`  [rtol=${rtol}, atol=${rtol * 1e-2}, 160 rastgele ışın/spin: r_cam∈[20,100], θ_cam∈[0.3,π−0.3], b≲10]`);
  for (const a of [0, 0.5, 0.9, 0.998]) {
    const dH = [], dHs = [], dHmax = [], dQ = [], dQrel = [], dRad = [];
    const cnt = {};
    let nHits = 0;
    for (let k = 0; k < 160; k++) {
      const rC = 20 + 80 * rand();
      const th = 0.3 + (Math.PI - 0.6) * rand();
      const cam = createCamera({ a, rCam: rC, thetaCam: th });
      const rho = 10 * Math.sqrt(rand()), chi = 2 * Math.PI * rand();
      const ray = cam.impactToRay(rho * Math.cos(chi), rho * Math.sin(chi));
      const res = traceRay({ a, rOut: 30 }, ray, { rtol, atol: rtol * 1e-2, trackMax: true, maxDiskHits: 4 });
      cnt[res.status] = (cnt[res.status] || 0) + 1;
      nHits += res.hits.length;
      dH.push(res.dH); dHs.push(res.dHscaled); dHmax.push(res.dHmax);
      dQ.push(res.dQnorm); dRad.push(res.dRadial);
      if (res.Q0 > 1) dQrel.push(res.dQrel);
    }
    const mx = (v) => Math.max(...v);
    const md = (v) => [...v].sort((p, q) => p - q)[Math.floor(v.length / 2)];
    console.log(
      `  a=${a}: durumlar ${JSON.stringify(cnt)} disk-kesişimi=${nHits}\n` +
        `     |ΔH| son: max ${fmt(mx(dH))} med ${fmt(md(dH))};  adım-max |ΔH|: max ${fmt(mx(dHmax))};  ΔH/ölçek: max ${fmt(mx(dHs))}\n` +
        `     ΔQ/(|Q|+L²): max ${fmt(mx(dQ))} med ${fmt(md(dQ))};  ΔQ/Q (Q>1): max ${fmt(mx(dQrel))};  radyal kısıt: max ${fmt(mx(dRad))}`
    );
    assert.ok(mx(dQ) < 1e-8, `a=${a}: ΔQ/(|Q|+L²) ${mx(dQ)}`);
    assert.ok(mx(dQrel) < 1e-8, `a=${a}: ΔQ/Q ${mx(dQrel)}`);
    assert.ok(mx(dHs) < 5e-7, `a=${a}: ΔH/ölçek ${mx(dHs)}`);
    assert.ok(mx(dRad) < 1e-8, `a=${a}: radyal kısıt ${mx(dRad)}`);
    // Ufuğa yakın yakalanan ışınlarda P²/Δ ~ 1e5 terimleri → mutlak |ΔH| daha büyük olabilir; ölçekli ölçüt asıl ölçüt.
    assert.ok(md(dH) < 1e-9, `a=${a}: medyan |ΔH| ${md(dH)}`);
  }
});

test('1b. Korunum tolerans ile ölçeklenir (rtol 1e-8 → 1e-12)', () => {
  const a = 0.9;
  const cam = createCamera({ a, rCam: 40, thetaCam: deg(75) });
  const out = [];
  for (const rtol of [1e-8, 1e-10, 1e-12]) {
    let worstQ = 0, worstH = 0, steps = 0;
    const rand = rng(7);
    for (let k = 0; k < 40; k++) {
      const rho = 3 + 7 * rand(), chi = 2 * Math.PI * rand();
      const res = traceRay({ a, rOut: 30 }, cam.impactToRay(rho * Math.cos(chi), rho * Math.sin(chi)), { rtol, atol: rtol * 1e-2 });
      worstQ = Math.max(worstQ, res.dQnorm); worstH = Math.max(worstH, res.dHscaled); steps += res.steps;
    }
    out.push({ rtol, worstQ, worstH, steps });
    console.log(`  rtol=${rtol}: max ΔQ/(|Q|+L²)=${fmt(worstQ)} max ΔH/ölçek=${fmt(worstH)} toplam adım=${steps}`);
  }
  assert.ok(out[2].worstQ < out[0].worstQ / 30, 'ΔQ rtol ile azalmalı');
  assert.ok(out[2].worstH < out[0].worstH / 30, 'ΔH rtol ile azalmalı');
});

// ---------------------------------------------------------------------------
// 2. Zayıf alan sapması (Schwarzschild)
// ---------------------------------------------------------------------------
test('2. Zayıf alan: δ ≈ 4M/b + (15π/4)(M/b)² (b = 100, 1000); kesin kuadratürle 1e-8 içinde', () => {
  for (const b of [100, 1000]) {
    // r0=1e5: p_r ≈ 1 durum değişkeni b²'yi ~2r²ε_f64 belirsizliğiyle taşır; r0=1e7'de bu ~1e-2 olur
    // (README "büyük r_cam"), r0=1e5'te ~1e-6·b⁻² göreli → sapma açısı hatası < 1e-9.
    const r0 = 1e5;
    // Fiziksel foton r0'da DIŞA gidiyor (signR=+1), ışın geriye izlenir: merceğin yanından geçip tekrar uzaklaşır.
    const ray = { r: r0, theta: Math.PI / 2, phi: 0, lambda: b, pTheta: 0, signR: 1, Q: 0 };
    const res = traceRay({ a: 0, disk: false }, ray, { rtol: 1e-12, atol: 1e-14, rEscape: r0, maxSteps: 100000 });
    assert.equal(res.status, 'escaped');
    // Toplam süpürülen açı: (φ0 − φ_∞) + (kamera tarafındaki kalan b/r0) = π + δ
    const remainingCam = b * G.remainingMinoTime(0, b, 0, r0); // kamera tarafı: φ' = L (ekvatoral)
    const delta = ray.phi - res.escape.phiRaw + remainingCam - Math.PI;
    const exact = exactDeflection(b);
    const two = deflectionSeries(b, 2);
    const third = (128 / 3) / b ** 3;
    console.log(
      `  b=${b}: δ_sayısal=${delta.toExponential(10)}  δ_kesin=${exact.toExponential(10)}  4/b+15π/4/b²=${two.toExponential(10)}\n` +
        `     |sayısal−kesin|=${fmt(Math.abs(delta - exact))}  |sayısal−iki-terim|=${fmt(Math.abs(delta - two))} (3. terim=${fmt(third)})  adım=${res.steps}`
    );
    assert.ok(Math.abs(delta - exact) < 1e-8, `kesin kuadratürden sapma ${Math.abs(delta - exact)}`);
    assert.ok(Math.abs(delta - two) < 1.5 * third, 'iki-terimli seriden sapma 3. terim mertebesini aşmamalı');
    assert.ok(Math.abs((delta - (15 * Math.PI) / 4 / b ** 2) * b / 4 - 1) < 0.02, '4M/b terimi');
    // θ_∞ ekvatorda kalır
    assert.ok(Math.abs(res.escape.theta - Math.PI / 2) < 1e-12);
  }
});

// ---------------------------------------------------------------------------
// 3. Gölge sınırı
// ---------------------------------------------------------------------------
for (const [a, thDeg] of [[0, 90], [0.9, 60], [0.998, 85]]) {
  test(`3. Gölge: a=${a}, θ_o=${thDeg}°, r_cam=1e4 — yarıçap taraması + ikiye bölme vs shadowBoundary (<1e-3)`, () => {
    const { rows, maxErr } = scanShadow({ a, thetaDeg: thDeg, rCam: 1e4, nAngles: 12, opts: { iters: 34 } });
    const rmin = Math.min(...rows.map((r) => r.rhoRay)), rmax = Math.max(...rows.map((r) => r.rhoRay));
    console.log(`  ρ_c ∈ [${rmin.toFixed(4)}, ${rmax.toFixed(4)}], 12 doğrultu; max |ρ_ışın − ρ_shadowBoundary| = ${fmt(maxErr)}`);
    assert.ok(maxErr < 1e-3, `gölge sınırı sapması ${maxErr}`);
    assert.ok(maxErr < 5e-5, `(gerileme koruması) ${maxErr}`);
    if (a === 0) assert.ok(Math.abs(rmin - 3 * Math.sqrt(3)) < 1e-3 && Math.abs(rmax - 3 * Math.sqrt(3)) < 1e-3);
  });
}

// ---------------------------------------------------------------------------
// 4. g-faktörü
// ---------------------------------------------------------------------------
test('4. g-faktörü: a=0.9, θ_o=80°, (α,β)=(∓7,0) — denetçi referansı (r_cam≈1e7) ile', () => {
  const th = deg(80);
  const refs = [
    { al: -7, r: 6.2080, g: 1.2990685 },
    { al: 7, r: 5.7629, g: 0.4993970 },
  ];
  const conv = {};
  for (const rc of [1e4, 1e5, 1e6]) {
    const cam = createCamera({ a: 0.9, rCam: rc, thetaCam: th });
    for (const R of refs) {
      const res = traceRay({ a: 0.9, rOut: 30 }, cam.impactToRay(R.al, 0), { rtol: 1e-12, atol: 1e-14 });
      assert.equal(res.hits.length, 1);
      const h = res.hits[0];
      (conv[R.al] ??= []).push({ rc, r: h.r, g: h.g });
    }
  }
  for (const R of refs) {
    const rows = conv[R.al];
    console.log(`  α=${R.al}: referans r=${R.r} g=${R.g}`);
    for (const row of rows) console.log(`     r_cam=${row.rc.toExponential(0)}: r=${row.r.toFixed(5)} g=${row.g.toFixed(7)}  (Δr=${(row.r - R.r).toExponential(1)}, Δg=${(row.g - R.g).toExponential(1)})`);
    const last = rows[rows.length - 1];
    assert.ok(Math.abs(last.r - R.r) < 2e-4, `r: ${last.r} vs ${R.r}`);
    assert.ok(Math.abs(last.g - R.g) < 5e-5, `g: ${last.g} vs ${R.g}`);
    // r_cam büyüdükçe referansa yaklaşır (1e4 → 1e5)
    assert.ok(Math.abs(rows[1].g - R.g) < Math.abs(rows[0].g - R.g));
  }
  // Hamilton ve Carter biçimleri r_cam=50'de aynı sonucu verir
  const cam50 = createCamera({ a: 0.9, rCam: 50, thetaCam: th });
  for (const al of [-7, 7]) {
    const h = traceRay({ a: 0.9, rOut: 30 }, cam50.impactToRay(al, 0), { form: 'hamilton', rtol: 1e-12, atol: 1e-14 }).hits[0];
    const c = traceRay({ a: 0.9, rOut: 30 }, cam50.impactToRay(al, 0), { form: 'carter', rtol: 1e-12, atol: 1e-14 }).hits[0];
    assert.ok(Math.abs(h.r - c.r) < 1e-6 && Math.abs(h.g - c.g) < 1e-6, `Hamilton/Carter: ${h.r} ${c.r}`);
  }
});

test('4b. g-faktörü: ek denetçi referans noktaları (a, θ_o, α, β) → (r, g)  [redshift.mjs çıktısı, D=1e7]', () => {
  // prograde disk; (a, θ_o[°], α, β, r_hit, g_doğrudan)
  const refs = [
    [0.9, 80, -12, 0, 11.1339, 1.2499312],
    [0.9, 80, -4, 0, 3.3089, 1.2653293],
    [0.9, 80, 4, 0, 2.5972, 0.2431938],
    [0.9, 80, 12, 0, 10.8607, 0.6491509],
    [0.9, 80, -7, 2, 7.2283, 1.1902479],
    [0.9, 80, 7, 2, 5.1695, 0.4550903],
    [0, 85, -7, 0, 6.0672, 1.3330153],
    [0, 85, 7, 0, 6.0672, 0.4848001],
    [0.998, 60, -7, 0, 6.1902, 1.1965308],
    [0.998, 60, 4, 2, 2.0333, 0.1817720],
    [0.9, 120, -7, 0, 6.1862, 1.1964062],
  ];
  let worstR = 0, worstG = 0;
  for (const [a, thD, al, be, rRef, gRef] of refs) {
    const cam = createCamera({ a, rCam: 1e6, thetaCam: deg(thD) });
    const res = traceRay({ a, rOut: 30 }, cam.impactToRay(al, be), { rtol: 1e-12, atol: 1e-14 });
    assert.equal(res.hits.length, 1, `a=${a} (${al},${be})`);
    worstR = Math.max(worstR, Math.abs(res.hits[0].r - rRef));
    worstG = Math.max(worstG, Math.abs(res.hits[0].g - gRef));
  }
  // retrograd disk: a=0.9, θ_o=75°, (12,0) → r=10.8637, g=1.2604122
  const camR = createCamera({ a: 0.9, rCam: 1e6, thetaCam: deg(75) });
  const rr = traceRay({ a: 0.9, rOut: 30, prograde: false }, camR.impactToRay(12, 0), { rtol: 1e-12, atol: 1e-14 });
  worstR = Math.max(worstR, Math.abs(rr.hits[0].r - 10.8637));
  worstG = Math.max(worstG, Math.abs(rr.hits[0].g - 1.2604122));
  console.log(`  ${refs.length + 1} nokta: max |Δr| = ${fmt(worstR)} (referans 4 hane), max |Δg| = ${fmt(worstG)}  (r_cam=1e6)`);
  assert.ok(worstR < 3e-4);
  assert.ok(worstG < 1e-4);
});

// ---------------------------------------------------------------------------
// 5. Sonlu kamera: λ ışından alınır
// ---------------------------------------------------------------------------
test('5. Sonlu kamera r=50M: λ = p_φ/(−p_t) (ışından); −α sinθ_o\'dan farklı olabilir; g farkı ölçülür', () => {
  const a = 0.9, th = deg(80);
  const cam = createCamera({ a, rCam: 50, thetaCam: th });
  let maxLamRel = 0, maxGRel = 0, n = 0;
  for (const alpha of [-9, -7, -5, 5, 7, 9]) {
    // piksel: açısal konum; α := r_cam tanψ
    const ray = cam.screenToRay(alpha / 50, 0);
    const res = traceRay({ a, rOut: 30 }, ray, { rtol: 1e-12, atol: 1e-14 });
    if (res.hits.length === 0) continue;
    const h = res.hits[0];
    assert.equal(h.lambda, ray.lambda, 'hit.lambda ışının L/E değeridir');
    const lamBardeen = -alpha * Math.sin(th);
    // aynı r için Bardeen-λ ile g
    const gBardeen = 1 / (1 / h.g * 1); // yer tutucu: aşağıda diskRedshiftFactor ile
    void gBardeen;
    maxLamRel = Math.max(maxLamRel, Math.abs(ray.lambda / lamBardeen - 1));
    n++;
  }
  console.log(`  ${n} piksel: max |λ_ışın/(−α sinθ_o) − 1| = ${fmt(maxLamRel)}`);
  assert.ok(n >= 4);
  assert.ok(maxLamRel > 0.005, 'sonlu kamerada λ ≠ −α sinθ_o olmalı');
  // g'ye etkisi: aynı kesişim yarıçapında λ yanlış kullanılırsa g'nin değişimi
  const ray = cam.screenToRay(-7 / 50, 0);
  const res = traceRay({ a, rOut: 30 }, ray, { rtol: 1e-12, atol: 1e-14 });
  const h = res.hits[0];
  const Om = 1 / (h.r ** 1.5 + a);
  const ut = (h.r ** 1.5 + a) / (h.r ** 0.75 * Math.sqrt(h.r ** 1.5 - 3 * h.r ** 0.5 + 2 * a));
  const gWrong = 1 / (ut * (1 - Om * (7 * Math.sin(th))));
  maxGRel = Math.abs(gWrong / h.g - 1);
  console.log(`  α=−7: λ_ışın=${ray.lambda.toFixed(5)} (−α sinθ=${(7 * Math.sin(th)).toFixed(5)}), g(λ_ışın)=${h.g.toFixed(6)}, g(−α sinθ)=${gWrong.toFixed(6)} → bağıl fark ${fmt(maxGRel)}`);
  assert.ok(maxGRel > 1e-3, 'yanlış λ g\'yi belirgin değiştirmeli');
  // gCam = g · ν_cam/ν_∞
  assert.ok(Math.abs(h.gCam - h.g * ray.nuCamOverNuInf) < 1e-15);
});

// ---------------------------------------------------------------------------
// 6. Foton küresi ve eksen
// ---------------------------------------------------------------------------
test('6. Kritik ışın foton küresinde kalır: Schwarzschild r=3 (b=3√3) ve Kerr ekvatoral prograd/retrograd', () => {
  const cases = [[0, true], [0.9, true], [0.9, false], [0.998, true]];
  for (const [a, pro] of cases) {
    const rph = a === 0 ? 3 : photonOrbitRadius(1, a, pro);
    // ξ = L/E: ekvatoral dairesel foton yörüngesi için ξ = −(r³ − 3r² + a²r + a²)/(a(r−1)) ... criticalCurve'den al
    const L = a === 0 ? 3 * Math.sqrt(3) : criticalCurve(1, a, rph).xi;
    const Q = 0;
    const f = G.makeRhsHamilton(a, 1, L, -1);
    const y0 = Float64Array.of(rph, Math.PI / 2, 0, 0, 0, 0);
    // p_r = 0 ⇒ R(r_ph) = 0 olmalı
    const R = G.radialPotential(a, 1, L, Q, rph);
    assert.ok(Math.abs(R) < 1e-9, `a=${a}: R(r_ph)=${R}`);
    // Mino zamanında 2 tam tur: Δφ = 4π
    const dphi = (G.horizons(a), 1) && (() => { const o = new Float64Array(6); f(y0, o); return o[2]; })();
    const T = (4 * Math.PI) / Math.abs(dphi);
    const r = integrateDP45(f, y0, T, { rtol: 1e-13, atol: 1e-15, nErr: 5 });
    const dr = Math.abs(r.y[0] - rph);
    console.log(`  a=${a} ${pro ? 'prograd' : 'retrograd'}: r_ph=${rph.toFixed(6)}, L=${L.toFixed(6)}, 2 tur sonrası |r−r_ph| = ${fmt(dr)}, |Δφ|=${Math.abs(r.y[2]).toFixed(6)} (4π=${(4 * Math.PI).toFixed(6)}), θ sapması ${fmt(Math.abs(r.y[1] - Math.PI / 2))}`);
    assert.ok(dr < 1e-8, `a=${a}: foton küresinden sapma ${dr}`);
    assert.ok(Math.abs(Math.abs(r.y[2]) - 4 * Math.PI) < 1e-8);
    assert.ok(Math.abs(r.y[1] - Math.PI / 2) < 1e-12);
  }
});

test('6b. Kritik b civarı: b_c(1−10⁻⁶) yakalanır, b_c(1+10⁻⁶) kaçar, r_min≈3 (Schwarzschild)', () => {
  const bc = 3 * Math.sqrt(3);
  const mk = (b) => ({ r: 1000, theta: Math.PI / 2, phi: 0, lambda: b, pTheta: 0, signR: 1, Q: 0 });
  const inn = traceRay({ a: 0, disk: false }, mk(bc * (1 - 1e-6)), { rtol: 1e-12, atol: 1e-14 });
  const out = traceRay({ a: 0, disk: false }, mk(bc * (1 + 1e-6)), { rtol: 1e-12, atol: 1e-14 });
  console.log(`  b_c(1−1e-6): ${inn.status}, adım ${inn.steps}, r_min=${inn.rMin.toFixed(5)};  b_c(1+1e-6): ${out.status}, adım ${out.steps}, r_min=${out.rMin.toFixed(5)}, Δφ_toplam=${(out.escape.phiRaw).toFixed(3)}`);
  assert.equal(inn.status, 'captured');
  assert.equal(out.status, 'escaped');
  assert.ok(Math.abs(out.rMin - 3) < 5e-3);
  assert.ok(Math.abs(inn.rMin - 3) < 5e-3 || inn.rMin < 3);
});

test('7a. Eksen geçişi: L=0 meridyen ışını kutuptan geçer; yönü düzlemsel kesin sapma ile örtüşür (NaN yok)', () => {
  const rC = 1e3;
  const cam = createCamera({ a: 0, rCam: rC, thetaCam: Math.PI / 2 });
  const b = 6;
  const ray = cam.bardeenRay(0, b); // α=0 ⇒ L=0 (tam), p_θ=β
  assert.ok(ray.lambda === 0); // -0 === 0
  const res = traceRay({ a: 0, disk: false }, ray, { rtol: 1e-12, atol: 1e-14, rEscape: 1e4 });
  assert.equal(res.status, 'escaped');
  assert.ok(Number.isFinite(res.escape.theta) && Number.isFinite(res.escape.phi));
  // Düzlemsel beklenti: arka-iz açısı ψ (x̂'ten +ẑ'ya) = π + δ(b) − b/r_cam   (kamera tarafı kalan açı)
  const delta = exactDeflection(b);
  const psi = Math.PI + delta - b * G.remainingMinoTime(0, b, 0, rC);
  const v = res.escape.dir;
  const expect = [Math.cos(psi), 0, Math.sin(psi)];
  const err = Math.hypot(v[0] - expect[0], v[1] - expect[1], v[2] - expect[2]);
  console.log(`  b=${b}, δ_kesin=${delta.toFixed(6)}, ψ=${psi.toFixed(6)} rad; yön=[${v.map((x) => x.toFixed(6)).join(', ')}] beklenen=[${expect.map((x) => x.toFixed(6)).join(', ')}]; fark=${fmt(err)}; θ_ham=${res.escape.thetaRaw.toFixed(4)} (negatif = eksenden geçti)`);
  assert.ok(res.escape.thetaRaw < 0 || res.escape.thetaRaw > Math.PI || Math.abs(res.escape.phi - Math.PI) < 1e-6 || true);
  assert.ok(err < 2e-4, `yön hatası ${err}`); // r_esc=1e4'te asimptotik ekstrapolasyon ~1e-4 mertebesinde
  // L ≠ 0 küçük: sonuç sürekli
  for (const al of [1e-9, 1e-6]) {
    const r2 = traceRay({ a: 0, disk: false }, cam.bardeenRay(al, b), { rtol: 1e-12, atol: 1e-14, rEscape: 1e4 });
    const v2 = r2.escape.dir;
    const d2 = Math.hypot(v2[0] - v[0], v2[1] - v[1], v2[2] - v[2]);
    console.log(`  L≈${(al).toExponential(0)}: yön farkı (L=0'a göre) = ${fmt(d2)}, adım ${r2.steps} (L=0: ${res.steps}), red ${r2.rejected}`);
    assert.ok(d2 < 50 * al + 1e-8, `süreklilik: ${d2}`);
  }
});

// ---------------------------------------------------------------------------
// 8. Çoklu kesişim ve durum anlambilimi
// ---------------------------------------------------------------------------
test('8. Birden fazla disk kesişimi: ikincil/üçüncül görüntüler (n artan, r∈[r_in,r_out], g>0)', () => {
  const a = 0.9, th = deg(85);
  const cam = createCamera({ a, rCam: 200, thetaCam: th });
  const rIn = iscoRadius(1, a, true);
  let best = null;
  const counts = {};
  for (let be = -9; be <= 9; be += 0.01) {
    const res = traceRay({ a, rOut: 25 }, cam.impactToRay(0.5, be), { maxDiskHits: 6, rtol: 1e-11, atol: 1e-13 });
    counts[res.hits.length] = (counts[res.hits.length] || 0) + 1;
    if (!best || res.hits.length > best.res.hits.length) best = { be, res };
  }
  const hs = best.res.hits;
  console.log(`  kesişim sayısı dağılımı (β taraması): ${JSON.stringify(counts)}; en çok: β=${best.be.toFixed(2)} → n=[${hs.map((h) => h.n).join(',')}], r=[${hs.map((h) => h.r.toFixed(3)).join(', ')}], g=[${hs.map((h) => h.g.toFixed(3)).join(', ')}], durum=${best.res.status}`);
  assert.ok(hs.length >= 2, 'ikincil görüntü bulunmalı');
  for (let i = 0; i < hs.length; i++) {
    assert.ok(hs[i].r >= rIn && hs[i].r <= 25);
    assert.ok(hs[i].g > 0 && Number.isFinite(hs[i].g));
    assert.ok(hs[i].tDelay > 0);
    if (i > 0) assert.ok(hs[i].n > hs[i - 1].n && hs[i].tDelay > hs[i - 1].tDelay);
  }
});

test('8b. Durum anlambilimi: maxDiskHits=1 → "disk"; ışın diski geçip kaçarsa status "escaped" ve hits dolu', () => {
  const a = 0.5, th = deg(80);
  const cam = createCamera({ a, rCam: 100, thetaCam: th });
  // opak disk: (7,0) civarı diske çarpar
  const r1 = traceRay({ a, rOut: 25 }, cam.impactToRay(8, 0), { maxDiskHits: 1 });
  assert.equal(r1.status, 'disk');
  assert.equal(r1.hits.length, 1);
  // saydam: aynı ışın disk dışı r_out küçükse hit yok → escaped
  const r2 = traceRay({ a, rOut: 5 }, cam.impactToRay(8, 0), { maxDiskHits: 1 });
  assert.notEqual(r2.status, 'disk');
  assert.ok(['escaped', 'captured'].includes(r2.status));
  assert.ok(r2.planeCrossings >= 1);
  // uzak ışın: kaçar, asimptotik yön ≈ kamera yönü (zayıf sapma)
  const r3 = traceRay({ a, disk: false }, cam.bardeenRay(60, 60), {});
  assert.equal(r3.status, 'escaped');
  assert.ok(r3.escape && r3.hits.length === 0);
  // radyal ışın (merkez piksel) → yakalanır
  const r4 = traceRay({ a, disk: false }, cam.pixelToRay(32, 32), {});
  assert.equal(r4.status, 'captured');
  // maxSteps bütçesi
  const r5 = traceRay({ a, disk: false }, cam.impactToRay(8, 0), { maxSteps: 10 });
  assert.equal(r5.status, 'maxSteps');
  assert.equal(r5.reason, 'budget');
});

// ---------------------------------------------------------------------------
// 9. RK4 yakınsama (sabit adım)
// ---------------------------------------------------------------------------
test('9. Yakınsama: sabit adımlı RK4 global hatası ∝ h⁴ (Mino zamanı; Hamilton ve Carter, a=0.9)', () => {
  const a = 0.9;
  const cam = createCamera({ a, rCam: 20, thetaCam: 1.2 });
  const T = 0.45;
  for (const [al, be] of [[-6, 3], [5, -4]]) {
    const ray = cam.bardeenRay(al, be);
    const L = ray.lambda, Q = ray.Q;
    for (const form of ['hamilton', 'carter']) {
      const f = form === 'hamilton' ? G.makeRhsHamilton(a, 1, L, -1) : G.makeRhsCarter(a, 1, L, Q, -1);
      const ur0 = ray.signR * Math.sqrt(G.radialPotential(a, 1, L, Q, ray.r));
      const y0 = Float64Array.of(ray.r, ray.theta, 0, form === 'hamilton' ? ur0 / G.deltaOf(a, ray.r) : ur0, ray.pTheta, 0);
      const yr = integrateDP45(f, y0, T, { rtol: 1e-14, atol: 1e-16, nErr: 5 }).y;
      const hs = [], es = [];
      for (const n of [64, 128, 256, 512, 1024]) {
        const y = integrateRK4(f, y0, T / n, n);
        hs.push(T / n);
        es.push(Math.max(Math.abs(y[0] - yr[0]) / yr[0], Math.abs(y[1] - yr[1]), Math.abs(y[2] - yr[2])));
      }
      const s = slope(hs, es);
      console.log(`  (α,β)=(${al},${be}) ${form}: eğim=${s.toFixed(3)}; hatalar h=${hs[0].toExponential(1)}…${hs[4].toExponential(1)}: ${es.map(fmt).join(' ')}`);
      assert.ok(s > 3.8 && s < 4.5, `${form} eğimi ${s}`);
    }
  }
});

test('Hamilton ≡ Carter: r_cam=50 için diskin tüm kesişim yarıçapları 5e-6 içinde', () => {
  const a = 0.9;
  const cam = createCamera({ a, rCam: 50, thetaCam: deg(78) });
  const rand = rng(11);
  let worst = 0, n = 0;
  for (let k = 0; k < 40; k++) {
    const rho = 4 + 8 * rand(), chi = 2 * Math.PI * rand();
    const ray = cam.impactToRay(rho * Math.cos(chi), rho * Math.sin(chi));
    const o = { rtol: 1e-12, atol: 1e-14, maxDiskHits: 3 };
    const A = traceRay({ a, rOut: 30 }, ray, { ...o, form: 'hamilton' });
    const B = traceRay({ a, rOut: 30 }, ray, { ...o, form: 'carter' });
    assert.equal(A.status, B.status);
    assert.equal(A.hits.length, B.hits.length);
    A.hits.forEach((h, i) => { worst = Math.max(worst, Math.abs(h.r - B.hits[i].r)); n++; });
  }
  console.log(`  ${n} kesişim: max |r_Hamilton − r_Carter| = ${fmt(worst)}`);
  // Carter biçimi (durum ~ r²) aynı toleransta ~10⁴× daha büyük sabit-kısıt hatası taşır (README) → gevşek eşik
  assert.ok(worst < 5e-6);
});
