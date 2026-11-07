// ============================================================================
// trig.glsl — cihazdan bağımsız doğru sin/cos
//
// NEDEN: GLSL ES 3.00 şartnamesi sin/cos için [−π, π]'de yalnızca ~2⁻¹¹ (≈5e-4) mutlak hataya izin verir.
// Ölçüm (SwiftShader, tests/render/README): sin/cos mutlak hata ort 5e-5, MAKS 1.9e-4. Bu, θ'nın cosθ = 0 kökünü
// (disk kesişimi) ve p_θ, φ' denklemlerini sistematik bozar (disk r hatası ~4e-4, kaçış yönü ~2e-4 rad).
// Çözüm: Cody–Waite aralık indirgemesi (π/2 üç parçalı) + Cephes sinf/cosf polinomları (|r| ≤ π/4, hata ≲ 1 ulp).
// θ ∈ (−π, 2π) aralığında (eksenden geçen L=0 ışınları dahil) geçerlidir; |k| ≤ 4 olduğundan k·sabit tam.
// θ = π/2 yakınında cosθ = −sin(θ − π/2) göreli doğruluğunu korur (kamera disk düzleminde sınaması için önemli).
//
// NATIVE_TRIG tanımlıysa cihazın sin/cos'u kullanılır (hızlı, doğruluğu cihaza bağlı).
// FİZİKSEL (sayısal kesinlik).
// ============================================================================

// (sin, cos)
vec2 sinCos(float x) {
#ifdef NATIVE_TRIG
  return vec2(sin(x), cos(x));
#else
  float k = floor(x * 0.6366197723675814 + 0.5);               // en yakın π/2 katı
  float r = ((x - k * 1.5703125) - k * 4.837512969970703125e-4) - k * 7.54978995489188216e-8;
  float z = r * r;
  float s = r + r * z * ((((-1.9515295891e-4) * z + 8.3321608736e-3) * z) - 1.6666654611e-1);
  float c = 1.0 - 0.5 * z + z * z * (((2.443315711809948e-5 * z - 1.388731625493765e-3) * z) + 4.166664568298827e-2);
  float q = k - 4.0 * floor(0.25 * k);                          // k mod 4 ∈ {0,1,2,3}
  if (q < 0.5) return vec2(s, c);
  if (q < 1.5) return vec2(c, -s);
  if (q < 2.5) return vec2(-s, -c);
  return vec2(-c, s);
#endif
}
