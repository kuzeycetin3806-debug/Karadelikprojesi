// ============================================================================
// crossing.glsl — ekvator (θ = π/2) kesişimi: kübik Hermite + disk g-faktörü
// CPU: raytracer.js refineCrossing('hermite'), recordCrossing; physics/kerr.js diskRedshiftFactor
// FİZİKSEL.
// ============================================================================

// Kübik Hermite: değer y0,y1; eğim (zaten h ile çarpılmış) hf0,hf1; s ∈ [0,1]
float hermite(float s, float y0, float hf0, float y1, float hf1) {
  float s2 = s * s;
  float s3 = s2 * s;
  return (2.0 * s3 - 3.0 * s2 + 1.0) * y0 +
         (s3 - 2.0 * s2 + s) * hf0 +
         (-2.0 * s3 + 3.0 * s2) * y1 +
         (s3 - s2) * hf1;
}

// [yA → yB] adımında cosθ işaret değiştirdi: Hermite arayüzünde cos(θ(s)) = 0 kökünü ikiye bölmeyle bul,
// sonra r ve φ'yi aynı s'de değerlendir. FA, FB: adım başı/sonu türevleri (DIR dahil), h: kullanılan adım.
void refineCrossing(State yA, State yB, State FA, State FB, float h,
                    out float rS, out float thS, out float phS) {
  float hFAth = h * FA.th, hFBth = h * FB.th;
  float lo = 0.0, hi = 1.0;
  float mlo = sinCos(yA.th).y;
  for (int it = 0; it < HERMITE_ITERS; it++) {
    float mid = 0.5 * (lo + hi);
    float m = sinCos(hermite(mid, yA.th, hFAth, yB.th, hFBth)).y;
    if (m * mlo > 0.0) { lo = mid; mlo = m; } else { hi = mid; }
  }
  float s = 0.5 * (lo + hi);
  rS  = hermite(s, yA.r,  h * FA.r,  yB.r,  h * FB.r);
  thS = hermite(s, yA.th, hFAth,     yB.th, hFBth);
  phS = hermite(s, yA.ph, h * FA.ph, yB.ph, h * FB.ph);
}

// Ekvatoral dairesel yörüngedeki yayıcıdan SONSUZDAKİ gözlemciye g = 1/(uᵗ(1 − Ωλ))  [kerr.md §2.7–2.8]
//   uᵗ = (r^{3/2} + s a)/(r^{3/4} √(r^{3/2} − 3 r^{1/2} + 2 s a)),  Ω = s/(r^{3/2} + s a),  λ = L (ışından).
// s = +1 prograd, −1 retrograd. Tanımsızsa (r ≤ r_ph veya 1 − Ωλ ≤ 0) 0 döner (CPU: RangeError).
float diskRedshiftInf(float r, float lambda) {
  float sr = sqrt(r);
  float r32 = r * sr;
  float rad = (r32 - 3.0 * sr) + 2.0 * uSpinSign * uA;
  if (!(rad > 0.0)) return 0.0;
  float D = (sr * sqrt(sr)) * sqrt(rad);        // r^{3/4} √rad  (pow() kullanılmaz: yaklaşık)
  float den = r32 + uSpinSign * uA;
  float ut = den / D;
  float Omega = uSpinSign / den;
  float f = 1.0 - Omega * lambda;
  if (!(f > 0.0)) return 0.0;
  return 1.0 / (ut * f);
}

// (θ, φ) → θ ∈ [0, π], φ ∈ [0, 2π).  θ eksenden geçmişse (θ<0 veya >π): (r,−θ,φ) ≡ (r,θ,φ+π).
vec2 canonicalAngles(float th, float ph) {
  float t = mod(th, TWO_PI);
  float p = ph;
  if (t > PI) { t = TWO_PI - t; p += PI; }
  p = mod(p, TWO_PI);
  return vec2(t, p);
}
