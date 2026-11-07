// ============================================================================
// camera.glsl — piksel → foton başlangıç koşulları (ZAMO tetradı)
// CPU: camera.js createCamera().pixelToRay / rayFromLocalSight (roll = 0) + raytracer.js başlangıç durumu
//
// Ekran yönelimi (kerr.md §2.11, birebir camera.js):
//   n̂ = r̂ (delikten kameraya), yukarı ê_β = −θ̂, sağ ê_α = +φ̂, kamera −r̂ yönüne bakar.
//   Görüş yönü d = (−1, −y, +x) (r̂, θ̂, φ̂); foton yönü n = −d/|d|.
//   Sağdaki piksel (x>0) ⇒ n_φ<0 ⇒ L<0; üstteki piksel (y>0) ⇒ n_θ>0 ⇒ p_θ>0.
// ZAMO: p^(t)=1, p^(i)=n_i;  p_φ = √g_φφ n_φ, p_θ = √Σ n_θ;  E = N + ω p_φ  ⇒  L = p_φ/E, p_θ/E.
// ν_cam/ν_∞ = 1/E  (g_cam = g · nuCam).
// Başlangıç p_r Carter bağıntısından kurulur: p_r = sign·√R(r)/Δ  (tetrad'ın p_r'si KULLANILMAZ).
// FİZİKSEL.
// ============================================================================

// Carter radyal potansiyeli R(x) = [(x²+a²) − aL]² − Δ(x)[Q + (L−a)²]   (E = 1)
float radialPotential(float x, float L, float Q) {
  float P = (x * x + uA2) - uA * L;
  float d = L - uA;
  float K = Q + d * d;
  return P * P - ((x - uRp) * (x - uRm)) * K;
}

// ndc ∈ [−1,1]²  (y yukarı).  y0: başlangıç durumu, nuCam: ν_cam/ν_∞.
void setupCameraRay(vec2 ndc, out State y0, out float nuCam) {
  float x = ndc.x * uTanHalf.x;     // sağ
  float y = ndc.y * uTanHalf.y;     // yukarı
  float norm = sqrt((1.0 + y * y) + x * x);
  float nth = y / norm;             // −d_θ/|d|  (d_θ = −y)
  float nph = -x / norm;            // −d_φ/|d|  (d_φ = +x)

  float pPhi1 = uTetrad.z * nph;
  float pTh1 = uTetrad.w * nth;
  float Ecov = uTetrad.x + uTetrad.y * pPhi1;
  float Lraw = pPhi1 / Ecov;
  float pTheta = pTh1 / Ecov;
  nuCam = 1.0 / Ecov;

  // Carter sabiti HAM L ile (camera.js: carterConstant(a, 1, L, θ, pθ)); L = 0 ise L²/sin² terimi yok
  vec2 scCam = sinCos(uCam.y);
  float sth = scCam.x;
  float cth = scCam.y;
  float Lterm = (Lraw == 0.0) ? 0.0 : (Lraw * Lraw) / (sth * sth);
  g_Q = pTheta * pTheta + (cth * cth) * (Lterm - uA2);

  // |L| < 1e-7 ⇒ L = 0 (kutup geçişi sertliğini önler, yön hatası ≲ 2e-8 rad)
  g_L = (abs(Lraw) < AXIS_EPS) ? 0.0 : Lraw;
  g_L2 = g_L * g_L;
  g_aL = uA * g_L;
  g_hasL = (g_L != 0.0);

  // p_r = +√R/Δ  (signR = +1: merkez ve tüm ekran pikselleri için n_r = 1/|d| > 0)
  float R = radialPotential(uCam.x, g_L, g_Q);
  float D = (uCam.x - uRp) * (uCam.x - uRm);
  float pr0 = sqrt(R > 0.0 ? R : 0.0) / D;

  y0 = State(uCam.x, uCam.y, uCam.z, pr0, pTheta);
}
