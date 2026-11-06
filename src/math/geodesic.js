/**
 * Kerr null geodezikleri — Hamiltonyen formülasyon (Boyer–Lindquist), Mino zamanı.
 *
 * KONVANSİYONLAR (src/physics/kerr.js ve docs/physics/kerr.md ile aynı)
 *  - G = c = M = 1 (uzunluklar M cinsinden); a = boyutsuz spin a* ∈ [0,1]; imza (−,+,+,+).
 *  - Koordinatlar (t, r, θ, φ); θ spin ekseninden ölçülür; delik +φ yönünde döner.
 *  - Foton kovaryant 4-momentumu p_μ. Hareket sabitleri: E = −p_t, L = p_φ (= L_z), Carter sabiti Q.
 *    Işın izleyicide E ≡ 1 (normalize); o zaman λ = L/E = L = p_φ/(−p_t) (kerr.md §2.8).
 *
 * HAMİLTONYEN
 *   H = ½ g^{μν} p_μ p_ν = f / (2Σ),
 *   f = Δ p_r² + p_θ² + (p_φ + a sin²θ p_t)² / sin²θ − [ (r²+a²) p_t + a p_φ ]² / Δ.
 * Null: H = 0. Mino zamanı dσ = dλ_afin / Σ  ⇒  H̃ = ΣH = f/2 ile Hamilton denklemleri:
 *   dr/dσ = Δ p_r,   dθ/dσ = p_θ,
 *   dφ/dσ = W/sin²θ − aP/Δ,                 dt/dσ = aW − (r²+a²)P/Δ,
 *   dp_r/dσ = −½ [ Δ' p_r² − 4 r p_t P/Δ + Δ' P²/Δ² ],
 *   dp_θ/dσ = L² cosθ / sin³θ − a² sinθ cosθ p_t²,
 * burada P = (r²+a²)p_t + aL, W = L + a sin²θ p_t, Δ' = 2(r−1). Mino zamanında Σ'nın tekilliği
 * (ρ² → 0 yok) ve ufukta dr/dσ sonlu kalır (yalnız p_r ~ 1/Δ büyür).
 *
 * İKİ FORMÜLASYON (aynı yörünge, farklı durum değişkeni; ikisi de burada):
 *   "hamilton": y = [r, θ, φ, p_r, p_θ, t]            (kanonik momentumlar; H izlenebilir)
 *   "carter"  : y = [r, θ, φ, u_r, u_θ, t],  u_r = dr/dσ = Δ p_r, u_θ = dθ/dσ = p_θ,
 *               du_r/dσ = R'(r)/2,  du_θ/dσ = Θ'(θ)/2   (Carter potansiyelleri; H ≡ 0 sabit).
 *   Carter biçimi float32 için çok daha sağlamdır (p_r' içinde ~2r mertebesinde terimler birbirini
 *   götürür; Carter biçiminde götürme yok). Ayrıntı: src/math/README.md.
 *
 * Durum sırası SABİT: [r, θ, φ, X, Y, t]; t en sonda → hata denetiminden kolayca dışlanır.
 *
 * İŞARET / YÖN: Her sağ taraf üreticisi `dir` alır. dir = +1 fiziksel foton yönü (ileri), dir = −1 ışının
 * kameradan geriye (geçmişe) izlenmesi. dir = −1 tüm türevlerin işaretini çevirir; durum değişkenleri
 * (p_r, p_θ, u_r, u_θ) HER ZAMAN fiziksel fotonun değerleridir.
 *
 * θ EKSEN TEKİLLİĞİ: sinθ → 0'da L²/sin³θ ve L/sin²θ terimleri patlar. L = 0 (tam eksenel) ışınlarda bu
 * terimler analitik olarak yoktur (kodda L === 0 ise atlanır) ve θ koordinatı eksenden "geçip" negatif
 * değere gider; (r, −θ, φ) ≡ (r, θ, φ+π) olduğundan çıktı `canonicalAngles` ile indirgenir. L ≠ 0 ise
 * θ-potansiyeli ışını eksenden itar (sinθ_min ≈ |L|/√(Q+L²)); adım kuralı (naturalStep) sinθ·φ' terimiyle
 * bu bölgede adımı küçültür.
 */

import { horizonRadii } from '../physics/kerr.js';

const TWO_PI = 2 * Math.PI;

/** Ufuk yarıçapları (M=1). r₋ = a²/r₊ (kerr.js'teki Δ çarpan biçimiyle aynı: küçük a'da iptal yok). */
export function horizons(a) {
  const { rPlus } = horizonRadii(1, a);
  return { rp: rPlus, rm: (a * a) / rPlus };
}

/** Δ = (r − r₊)(r − r₋) — çarpan biçimi (kerr.md §2.1). */
export function deltaOf(a, r) {
  const { rp, rm } = horizons(a);
  return (r - rp) * (r - rm);
}

// ---------------------------------------------------------------------------
// Hareket sabitleri ve potansiyeller
// ---------------------------------------------------------------------------

/** Null Carter sabiti Q = p_θ² + cos²θ (L²/sin²θ − a²E²). L = 0 için eksende de tanımlı. */
export function carterConstant(a, E, L, theta, pTheta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const Lterm = L === 0 ? 0 : (L * L) / (s * s);
  return pTheta * pTheta + c * c * (Lterm - a * a * E * E);
}

/** Radyal potansiyel R(r) = [(r²+a²)E − aL]² − Δ [Q + (L − aE)²]  ⇒  (dr/dσ)² = R. */
export function radialPotential(a, E, L, Q, r) {
  const P = (r * r + a * a) * E - a * L;
  const K = Q + (L - a * E) * (L - a * E);
  return P * P - deltaOf(a, r) * K;
}

/** R'(r) = 4 r E [(r²+a²)E − aL] − 2(r−1) [Q + (L−aE)²]. */
export function radialPotentialDerivative(a, E, L, Q, r) {
  const P = (r * r + a * a) * E - a * L;
  const K = Q + (L - a * E) * (L - a * E);
  return 4 * r * E * P - 2 * (r - 1) * K;
}

/** Θ(θ) = Q + cos²θ (a²E² − L²/sin²θ)  ⇒  (dθ/dσ)² = Θ. */
export function thetaPotential(a, E, L, Q, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const Lterm = L === 0 ? 0 : (L * L) / (s * s);
  return Q + c * c * (a * a * E * E - Lterm);
}

/**
 * Hamiltonyen terimleri: f = ΣH·2, H = f/(2Σ) ve ölçek (f'in büyük terimlerinin toplamı).
 * Not: f içinde P²/Δ ile Δp_r² ~ r² mertebesinde birbirini götürür; mutlak yuvarlama tabanı
 * ≈ 1e-16 · scale. Büyük r_cam'de H değerini bu yüzden ölçekle birlikte yorumlayın.
 */
export function hamiltonianTerms(a, E, L, r, theta, pr, pTheta) {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const D = deltaOf(a, r);
  const Sigma = r * r + a * a * c * c;
  const P = -(r * r + a * a) * E + a * L;
  const Ws = L === 0 ? -a * E * s : L / s - a * E * s; // W/sinθ
  const t1 = D * pr * pr;
  const t2 = pTheta * pTheta + Ws * Ws;
  const t3 = (P * P) / D;
  const f = t1 + t2 - t3;
  return { f, H: f / (2 * Sigma), scale: t1 + t2 + t3, Sigma };
}

/** p_r = ±√R / Δ  (sign = fiziksel p_r işareti). R < 0 (sayısal gürültü) ise dönüm noktası: 0. */
export function radialMomentum(a, E, L, Q, r, sign) {
  const R = radialPotential(a, E, L, Q, r);
  return sign * Math.sqrt(R > 0 ? R : 0) / deltaOf(a, r);
}

// ---------------------------------------------------------------------------
// Sağ taraf üreticileri (float64)
// ---------------------------------------------------------------------------

/**
 * Hamilton biçimi: y = [r, θ, φ, p_r, p_θ, t]. Dönen f(y, out) Mino zamanında türev yazar.
 * @param {number} dir +1 ileri (fiziksel foton), −1 geriye (ışın izleme)
 */
export function makeRhsHamilton(a, E, L, dir = 1) {
  const { rp, rm } = horizons(a);
  const a2 = a * a;
  const pt = -E;
  const L2 = L * L;
  const hasL = L !== 0;
  return function rhsHamilton(y, out) {
    const r = y[0], th = y[1], pr = y[3], pth = y[4];
    const s = Math.sin(th), c = Math.cos(th);
    const s2 = s * s;
    const D = (r - rp) * (r - rm);
    const Dp = 2 * r - 2;
    const r2a2 = r * r + a2;
    const P = r2a2 * pt + a * L;
    const PD = P / D;
    const Ws2 = (hasL ? L / s2 : 0) + a * pt; // W / sin²θ
    out[0] = dir * (D * pr);
    out[1] = dir * pth;
    out[2] = dir * (Ws2 - a * PD);
    out[3] = dir * (-0.5 * (Dp * pr * pr - 4 * r * pt * PD + PD * PD * Dp));
    out[4] = dir * ((hasL ? (L2 * c) / (s2 * s) : 0) - a2 * s * c * pt * pt);
    out[5] = dir * (a * (L + a * s2 * pt) - r2a2 * PD);
  };
}

/**
 * Carter / Mino biçimi: y = [r, θ, φ, u_r, u_θ, t], u_r = dr/dσ, u_θ = dθ/dσ (fiziksel foton için).
 * du_r/dσ = R'/2 = 2 r p_t P − ½Δ'K,  du_θ/dσ = Θ'/2 = L² cosθ/sin³θ − a² sinθ cosθ.
 * Q, başlangıç koşulundan gelen sabittir (carterConstant).
 */
export function makeRhsCarter(a, E, L, Q, dir = 1) {
  const { rp, rm } = horizons(a);
  const a2 = a * a;
  const pt = -E;
  const L2 = L * L;
  const hasL = L !== 0;
  const K = Q + (L - a * E) * (L - a * E);
  return function rhsCarter(y, out) {
    const r = y[0], th = y[1], ur = y[3], uth = y[4];
    const s = Math.sin(th), c = Math.cos(th);
    const s2 = s * s;
    const D = (r - rp) * (r - rm);
    const r2a2 = r * r + a2;
    const P = r2a2 * pt + a * L;
    const PD = P / D;
    const Ws2 = (hasL ? L / s2 : 0) + a * pt;
    out[0] = dir * ur;
    out[1] = dir * uth;
    out[2] = dir * (Ws2 - a * PD);
    out[3] = dir * (2 * r * pt * P - (r - 1) * K);
    out[4] = dir * ((hasL ? (L2 * c) / (s2 * s) : 0) - a2 * s * c * E * E);
    out[5] = dir * (a * (L + a * s2 * pt) - r2a2 * PD);
  };
}

// ---------------------------------------------------------------------------
// Sağ taraf üreticileri (float32 öykünmesi: HER işlem Math.fround ile yuvarlanır)
// ---------------------------------------------------------------------------

/**
 * Hamilton biçiminin float32 öykünmesi (E = 1). GLSL'e satır satır karşılık gelir.
 * sin/cos için fround(Math.sin) kullanılır: gerçek GPU'larda sin/cos 1–2 ulp'den kötü olabilir
 * (bu öykünme iyimserdir; bkz. README "float32 riskleri").
 */
export function makeRhsHamiltonF32(a, L, dir = 1) {
  const fr = Math.fround;
  const { rp, rm } = horizons(a);
  const A = fr(a), A2 = fr(a * a), LF = fr(L), L2 = fr(L * L), aL = fr(a * L);
  const RP = fr(rp), RM = fr(rm);
  const hasL = L !== 0;
  return function rhsHamiltonF32(y, out) {
    const r = y[0], th = y[1], pr = y[3], pth = y[4];
    const s = fr(Math.sin(th)), c = fr(Math.cos(th));
    const s2 = fr(s * s);
    const D = fr(fr(r - RP) * fr(r - RM));
    const Dp = fr(fr(2 * r) - 2);
    const r2a2 = fr(fr(r * r) + A2);
    const P = fr(aL - r2a2); // p_t = −1
    const PD = fr(P / D);
    const Ws2 = fr((hasL ? fr(LF / s2) : 0) - A);
    const t1 = fr(Dp * fr(pr * pr));
    const t2 = fr(fr(4 * r) * PD);
    const t3 = fr(fr(PD * PD) * Dp);
    out[0] = dir * fr(D * pr);
    out[1] = dir * pth;
    out[2] = dir * fr(Ws2 - fr(A * PD));
    out[3] = dir * fr(-0.5 * fr(fr(t1 + t2) + t3));
    out[4] = dir * fr((hasL ? fr(fr(L2 * c) / fr(s2 * s)) : 0) - fr(A2 * fr(s * c)));
    out[5] = dir * fr(fr(A * fr(LF - fr(A * s2))) - fr(r2a2 * PD));
  };
}

/** Carter biçiminin float32 öykünmesi (E = 1). Önerilen GPU biçimi. */
export function makeRhsCarterF32(a, L, Q, dir = 1) {
  const fr = Math.fround;
  const { rp, rm } = horizons(a);
  const A = fr(a), A2 = fr(a * a), LF = fr(L), L2 = fr(L * L), aL = fr(a * L);
  const RP = fr(rp), RM = fr(rm);
  const K = fr(fr(Q) + fr(fr(L - a) * fr(L - a)));
  const hasL = L !== 0;
  return function rhsCarterF32(y, out) {
    const r = y[0], th = y[1], ur = y[3], uth = y[4];
    const s = fr(Math.sin(th)), c = fr(Math.cos(th));
    const s2 = fr(s * s);
    const D = fr(fr(r - RP) * fr(r - RM));
    const r2a2 = fr(fr(r * r) + A2);
    const P = fr(aL - r2a2);
    const PD = fr(P / D);
    const Ws2 = fr((hasL ? fr(LF / s2) : 0) - A);
    out[0] = dir * ur;
    out[1] = dir * uth;
    out[2] = dir * fr(Ws2 - fr(A * PD));
    out[3] = dir * fr(fr(fr(-2 * r) * P) - fr(fr(r - 1) * K));
    out[4] = dir * fr((hasL ? fr(fr(L2 * c) / fr(s2 * s)) : 0) - fr(A2 * fr(s * c)));
    out[5] = dir * fr(fr(A * fr(LF - fr(A * s2))) - fr(r2a2 * PD));
  };
}

/**
 * Büyük r'de kalan Mino süresi σ_rem = ∫_r^∞ dr/√R(r) (E = 1), 1/r'nin 3. mertebesine kadar:
 *   R = r⁴ + c2 r² + c3 r + c4,  c2 = 2(a²−aL) − K, c3 = 2K, K = Q + (L−a)²
 *   σ_rem = 1/r − c2/(6r³) − c3/(8r⁴) + O(r⁻⁵).
 * Işın kaçarken (θ_∞, φ_∞) ekstrapolasyonu ve zayıf alan testleri için kullanılır. Düz uzayda
 * ekvatoral ışın için L·σ_rem = asin(b/r) serisinin (b/r + (b/r)³/6) ilk terimlerini verir.
 */
export function remainingMinoTime(a, L, Q, r) {
  const K = Q + (L - a) * (L - a);
  const c2 = 2 * (a * a - a * L) - K;
  const c3 = 2 * K;
  return 1 / r - c2 / (6 * r * r * r) - c3 / (8 * r * r * r * r);
}

// ---------------------------------------------------------------------------
// Adım kuralı (ufuk yakını + eksen yakını + büyük r için tek formül)
// ---------------------------------------------------------------------------

/**
 * "Doğal" Mino adımı: h_nat = 1 / √( (r'/ρ)² + θ'² + (sinθ φ')² ),  ρ = r − r₊.
 *   - büyük r:   r' ≈ r², ρ ≈ r  ⇒ h ≈ 1/r  (adım r ile geometrik büyür: ln r adım)
 *   - ufuk yakını: r' sonlu, ρ → 0 ⇒ h ∝ (r − r₊)  (p_r ~ 1/Δ ve φ, t patlamasını çözer)
 *   - foton küresi: r' ≈ 0, θ' ve φ' ~ b ⇒ h ≈ 1/b  (tur başına ~2π κ⁻¹ adım)
 *   - eksen yakını: sinθ·φ' = L/sinθ büyür ⇒ h küçülür
 * Kullanım: h = κ · h_nat; κ ≈ 0.05–0.3. vr, vth, vph, F türev vektörünün (r', θ', φ') bileşenleridir
 * (işaret önemsiz), yani sağ taraf zaten hesaplandığı için ek maliyet ≈ bir sin + bir sqrt.
 */
export function naturalStep(rp, r, theta, vr, vth, vph) {
  const rho = r - rp;
  const q = vr / rho;
  const w = Math.sin(theta) * vph;
  return 1 / Math.sqrt(q * q + vth * vth + w * w);
}

/** naturalStep'in float32 öykünmesi. */
export function naturalStepF32(rpF, r, theta, vr, vth, vph) {
  const fr = Math.fround;
  const rho = fr(r - rpF);
  const q = fr(vr / rho);
  const w = fr(fr(Math.sin(theta)) * vph);
  const sum = fr(fr(fr(q * q) + fr(vth * vth)) + fr(w * w));
  return fr(1 / fr(Math.sqrt(sum)));
}

// ---------------------------------------------------------------------------
// Açı yardımcıları
// ---------------------------------------------------------------------------

/**
 * (θ, φ) → θ ∈ [0, π], φ ∈ [0, 2π). θ negatif / > π ise eksenden geçilmiştir:
 * (r, −θ, φ) ≡ (r, θ, φ+π).
 */
export function canonicalAngles(theta, phi) {
  let th = theta % TWO_PI;
  if (th < 0) th += TWO_PI;
  let ph = phi;
  if (th > Math.PI) {
    th = TWO_PI - th;
    ph += Math.PI;
  }
  ph %= TWO_PI;
  if (ph < 0) ph += TWO_PI;
  return { theta: th, phi: ph };
}

/** Birim yön vektörü (x, y, z) = (sinθ cosφ, sinθ sinφ, cosθ). */
export function directionFromAngles(theta, phi) {
  const s = Math.sin(theta);
  return [s * Math.cos(phi), s * Math.sin(phi), Math.cos(theta)];
}
