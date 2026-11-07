// ============================================================================
// geodesic.glsl — Hamilton denklemleri (Mino zamanı) ve doğal adım
// CPU: geodesic.js makeRhsHamiltonF32 (E = 1 ⇒ p_t = −1), naturalStepF32
//
//   dr/dσ  = Δ p_r                      dθ/dσ = p_θ
//   dφ/dσ  = W/sin²θ − aP/Δ
//   dp_r/dσ  = −½[Δ' p_r² − 4 r p_t P/Δ + Δ' P²/Δ²]
//   dp_θ/dσ  = L² cosθ/sin³θ − a² sinθ cosθ p_t²
//   P = (r²+a²)p_t + aL,  W = L + a sin²θ p_t,  Δ' = 2(r−1)
//
// Işın geriye izlenir: tüm türevler DIR = −1 ile çarpılır; durum değişkenleri fiziksel fotonundur.
// İşlem SIRASI CPU f32 öykünmesiyle aynıdır (t1, t2, t3 toplama sırası dahil).
// L = 0 (eksenel ışın) için L/sin²θ ve L²cosθ/sin³θ terimleri analitik olarak yoktur (g_hasL).
// FİZİKSEL.
// ============================================================================

float deltaOf(float r) {
  return (r - uRp) * (r - uRm);   // çarpan biçimi: a≈1'de r²−2r+a² iptali yok
}

// Sağ taraf. `sc` çıktısı (sinθ, cosθ): doğal adım ve kesişim sınaması için yeniden hesaplanmasın.
State rhs(State y, out vec2 sc) {
  sc = sinCos(y.th);
  float s = sc.x;
  float c = sc.y;
  float s2 = s * s;
  float D = (y.r - uRp) * (y.r - uRm);
  float Dp = 2.0 * y.r - 2.0;
  float r2a2 = y.r * y.r + uA2;
  float P = g_aL - r2a2;                      // p_t = −1
  float PD = P / D;
  float Ws2 = (g_hasL ? g_L / s2 : 0.0) - uA; // W/sin²θ
  float t1 = Dp * (y.pr * y.pr);
  float t2 = (4.0 * y.r) * PD;
  float t3 = (PD * PD) * Dp;
  State F;
  F.r   = DIR * (D * y.pr);
  F.th  = DIR * y.pth;
  F.ph  = DIR * (Ws2 - uA * PD);
  F.pr  = DIR * (-0.5 * ((t1 + t2) + t3));
  F.pth = DIR * ((g_hasL ? (g_L2 * c) / (s2 * s) : 0.0) - uA2 * (s * c));
  return F;
}

// h_nat = 1/√((r'/ρ)² + θ'² + (sinθ φ')²), ρ = r − r₊
//  büyük r: ≈ 1/r · ufuk yakını: ∝ (r − r₊) · foton küresi: ≈ 1/b · eksen yakını: küçülür.
float naturalStep(State y, State F, float s) {
  float rho = y.r - uRp;
  float q = F.r / rho;
  float w = s * F.ph;
  float sum = (q * q + F.th * F.th) + w * w;
  return 1.0 / sqrt(sum);
}
