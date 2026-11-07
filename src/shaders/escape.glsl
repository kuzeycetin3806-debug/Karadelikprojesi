// ============================================================================
// escape.glsl — kaçış yönü ekstrapolasyonu ve bütçesi biten ışının ANALİTİK sınıflandırması
// CPU: geodesic.js remainingMinoTime, escapeSecondDerivatives, hasTurningPointBelow
// FİZİKSEL.
// ============================================================================

// ---------------------------------------------------------------------------
// Kaçış yönü: kalan Mino süresi σ_rem = ∫_r^∞ dr/√R = 1/r − c₂/(6r³) − c₃/(8r⁴)
//   c₂ = 2(a² − aL) − K,  c₃ = 2K,  K = Q + (L − a)²
// İZLEME zamanında: θ_∞ = θ + F₁σ + ½θ''σ²,  φ_∞ = φ + F₂σ + ½φ''σ²
//   θ'' = −F[4]  (F[4] = dp_θ/dτ),  φ'' = (∂F₂/∂r)F₀ + (∂F₂/∂θ)F₁   (F = rhs(y), DIR dahil)
//   ∂F₂/∂r = DIR·a(2r/Δ + PΔ'/Δ²),  ∂F₂/∂θ = −DIR·2L cosθ/sin³θ,  P = aL − (r²+a²)
// Hata ≈ (b/r_esc)³ rad.
// ---------------------------------------------------------------------------
void escapeDirection(State y, State F, out float thInf, out float phInf) {
  float d = g_L - uA;
  float K = g_Q + d * d;
  float c2 = 2.0 * (uA2 - uA * g_L) - K;
  float c3 = 2.0 * K;
  float r = y.r;
  float sr = 1.0 / r - c2 / (6.0 * r * r * r) - c3 / (8.0 * r * r * r * r);

  float D = (r - uRp) * (r - uRm);
  float P = uA * g_L - (r * r + uA2);
  vec2 sc = sinCos(y.th);
  float s = sc.x;
  float c = sc.y;
  float dF2dr = DIR * uA * ((2.0 * r) / D + (P * (2.0 * (r - 1.0))) / (D * D));
  float dF2dth = g_hasL ? (-DIR * 2.0 * g_L * c) / (s * s * s) : 0.0;
  float thetaPP = -F.pth;
  float phiPP = dF2dr * F.r + dF2dth * F.th;

  float thRaw = y.th + F.th * sr + 0.5 * thetaPP * sr * sr;
  float phRaw = y.ph + F.ph * sr + 0.5 * phiPP * sr * sr;
  vec2 ang = canonicalAngles(thRaw, phRaw);
  thInf = ang.x;
  phInf = ang.y;
}

// ---------------------------------------------------------------------------
// (r₊, r) aralığında R(x) = 0 kökü (dönüm noktası) var mı?
//   R(r₊) = (r₊²+a²−aL)² ≥ 0 ve R(r) > 0 ⇒ kök ancak R'nin aralıktaki yerel minimumu ≤ 0 ise vardır.
//   R' = 4x³ + 2c₂x + c₃  (x² terimi yok) ⇒ kritik noktalar kapalı formülle (trigonometrik / Cardano).
// İçe giden ışın için: kök yok ⇒ ufka girer (YAKALANDI); kök var ⇒ döner (KAÇAR).
// Sonuç hareket sabitlerine (L, Q) ve anlık r'ye bağlıdır; adım sayısı N'den bağımsızdır.
// ---------------------------------------------------------------------------
float cbrtSigned(float x) {
  return x == 0.0 ? 0.0 : sign(x) * pow(abs(x), 1.0 / 3.0);
}

bool hasTurningPointBelow(float L, float Q, float r) {
  if (!(r > uRp)) return false;
  float d = L - uA;
  float K = Q + d * d;
  float c2 = 2.0 * (uA2 - uA * L) - K;
  float c3 = 2.0 * K;
  float minR = min(radialPotential(uRp, L, Q), radialPotential(r, L, Q));
  // R' = 4(x³ + p x + q)
  float p = 0.5 * c2;
  float q = 0.25 * c3;
  float disc = -(4.0 * p * p * p + 27.0 * q * q);
  if (disc > 0.0) {
    // 3 gerçek kök (p < 0)
    float m = 2.0 * sqrt(-p / 3.0);
    float arg = clamp((3.0 * q) / (p * m), -1.0, 1.0);
    float phi = acos(arg) / 3.0;
    for (int k = 0; k < 3; k++) {
      float x = m * cos(phi - (TWO_PI * float(k)) / 3.0);
      if (x > uRp && x < r) minR = min(minR, radialPotential(x, L, Q));
    }
  } else {
    // 1 gerçek kök (Cardano)
    float sq = sqrt(max(0.0, (q * q) / 4.0 + (p * p * p) / 27.0));
    float x = cbrtSigned(-q / 2.0 + sq) + cbrtSigned(-q / 2.0 - sq);
    if (x > uRp && x < r) minR = min(minR, radialPotential(x, L, Q));
  }
  return minR <= 0.0;
}
