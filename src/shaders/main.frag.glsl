// ============================================================================
// main.frag.glsl — giriş noktası.
//   MODE_DEBUG tanımlıysa: 3 adet RGBA32F çıktı (renderDebug); aksi halde ekrana renk (görsel mod).
//
// Debug çıktı düzeni (ayrıntı: src/render/README.md):
//   o0 = (status, r₁, g_cam₁, steps)
//   o1 = (θ_∞, φ_∞, n₁, hitCount)
//   o2 = (reason, φ₁, r₂, g_cam₂)
//   status: 0 yakalandı · 1 kaçtı · 2 disk;  reason: 0 normal · 1 bütçe bitti · 2 NaN
//   Vuruş yoksa r₁ = −1, g₁ = 0, n₁ = 0, φ₁ = −1;  kaçış yönü bilinmiyorsa θ_∞ = φ_∞ = −1.
// ============================================================================

#ifdef MODE_DEBUG
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
#else
layout(location = 0) out vec4 fragColor;
#endif

void main() {
  vec2 ndc = 2.0 * gl_FragCoord.xy / uResolution - 1.0;   // y yukarı (GL); camera.js: ndcY = 1 − 2(j+½)/H ile aynı
  State y0;
  float nuCam;
  setupCameraRay(ndc, y0, nuCam);
  TraceResult T = traceRay(y0, nuCam);

#ifdef MODE_DEBUG
  o0 = vec4(float(T.status), T.hitR[0], T.hitG[0], float(T.steps));
  o1 = vec4(T.thInf, T.phInf, float(T.hitN[0]), float(T.hitCount));
  o2 = vec4(float(T.reason), T.hitPhi[0], T.hitR[1], T.hitG[1]);
#else
  fragColor = vec4(shadeRay(T), 1.0);
#endif
}
