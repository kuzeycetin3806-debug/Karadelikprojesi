// ============================================================================
// main.frag.glsl — giriş noktası.
//
// MODE_DEBUG       : 3 adet RGBA32F çıktı (renderDebug) — çekirdek doğrulaması (4a; düzen DEĞİŞMEDİ)
//   o0 = (status, r₁, g_cam₁, steps)
//   o1 = (θ_∞, φ_∞, n₁, hitCount)
//   o2 = (reason, φ₁, r₂, g_cam₂)
//   status: 0 yakalandı · 1 kaçtı · 2 disk;  reason: 0 normal · 1 bütçe bitti · 2 NaN
//   Vuruş yoksa r₁ = −1, g₁ = 0, n₁ = 0, φ₁ = −1;  kaçış yönü bilinmiyorsa θ_∞ = φ_∞ = −1.
// MODE_DEBUG_PHOTO : 3 adet RGBA32F çıktı (renderDebugPhoto) — disk fotometrisi doğrulaması (ilk vuruş)
//   o0 = (status, hitCount, r₁, g_cam₁)
//   o1 = (τ, T_obs, I, log10 Y(T_obs))            I: parlaklık çarpanı (mod A/B), türbülans/kenar HARİÇ
//   o2 = (R, G, B, türbülans·kenar)               nihai disk radyansı (türbülans/kenar DAHİL); vuruş yoksa 0
// Görsel mod       : doğrusal HDR radyans (RGBA16F); uAccumW < 1 ise önceki birikmiş kareyle ağırlıklı ortalama.
//
// 4c — ERTELENMİŞ GÖLGELENDİRME (deferred shading): görsel hat üç ayrı programa bölünebilir (aynı fizik, aynı sayılar):
//   MODE_TRACE : yalnız geodezik (pahalı) → uG önbelleği (RGBA32F):  disk (r, g_cam, φ, 2) | kaçış (θ_∞, φ_∞, ν_cam/ν_∞, 1) | yakalanma (0, 0, ν_cam/ν_∞, 0)
//   MODE_SHADE : uG → doğrusal HDR radyans (gökyüzü/yıldız + disk fotometrisi [+ türbülans, uTurbDeferred = 0 ise]); uAccumW ile birikir
//   MODE_ANIM  : uPrev (MODE_SHADE çıktısı, türbülanssız) × türbülans çarpanı(r, φ, uTime) — disk pikselleri dışında kopyalama.
//                Animasyonda geodezik ve gökyüzü HER KARE yeniden hesaplanmaz; yalnız bu ucuz geçiş çalışır.
// Yalnız maxDiskHits = 1 (opak disk) için: çok vuruşlu (yarı saydam) disk birleşik MODE_VISUAL yolunu kullanır.
// ============================================================================

#if defined(MODE_DEBUG) || defined(MODE_DEBUG_PHOTO)
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
#else
layout(location = 0) out vec4 fragColor;
#endif

#if defined(MODE_SHADE)
// uG (iz sürme önbelleği) → TraceResult (maxDiskHits = 1: en çok 1 vuruş, durum 2 ⇒ opak)
TraceResult decodeG(vec4 g, out float nuCam) {
  TraceResult T;
  int st = int(g.w + 0.5);
  T.status = st;
  T.reason = 0;
  T.steps = 0;
  T.hitCount = (st == 2) ? 1 : 0;
  T.planeCrossings = 0;
  for (int k = 0; k < MAX_HITS; k++) {
    T.hitR[k] = -1.0;
    T.hitG[k] = 0.0;
    T.hitPhi[k] = -1.0;
    T.hitN[k] = 0;
  }
  T.thInf = -1.0;
  T.phInf = -1.0;
  nuCam = 1.0;
  if (st == 2) {
    T.hitR[0] = g.x;
    T.hitG[0] = g.y;
    T.hitPhi[0] = g.z;
    T.hitN[0] = 1;
  } else {
    nuCam = g.z;
    if (st == 1) { T.thInf = g.x; T.phInf = g.y; }
  }
  return T;
}
#endif

void main() {
#if defined(MODE_ANIM)
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 base = texelFetch(uPrev, ip, 0);
  vec4 g = texelFetch(uG, ip, 0);
  if (g.w > 1.5) base.rgb = min(base.rgb * turbulenceFactor(g.x, g.z, diskPixelFootprint()), vec3(6.0e4));
  fragColor = base;
#elif defined(MODE_SHADE)
  float nuS;
  TraceResult TS = decodeG(texelFetch(uG, ivec2(gl_FragCoord.xy), 0), nuS);
  vec3 LS = shadeRay(TS, nuS);
  if (uAccumW < 1.0) LS = mix(texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0).rgb / uHdrEncode, LS, uAccumW);
  fragColor = vec4(LS * uHdrEncode, 1.0);
#else
#if defined(MODE_VISUAL) || defined(MODE_TRACE)
  vec2 ndc = 2.0 * (gl_FragCoord.xy + uJitter) / uResolution - 1.0;
#else
  vec2 ndc = 2.0 * gl_FragCoord.xy / uResolution - 1.0;   // y yukarı (GL); camera.js: ndcY = 1 − 2(j+½)/H ile aynı
#endif
  State y0;
  float nuCam;
  setupCameraRay(ndc, y0, nuCam);
  TraceResult T = traceRay(y0, nuCam);

#if defined(MODE_TRACE)
  fragColor = (T.status == 2) ? vec4(T.hitR[0], T.hitG[0], T.hitPhi[0], 2.0)
            : (T.status == 1) ? vec4(T.thInf, T.phInf, nuCam, 1.0)
            : vec4(0.0, 0.0, nuCam, 0.0);
#elif defined(MODE_DEBUG)
  o0 = vec4(float(T.status), T.hitR[0], T.hitG[0], float(T.steps));
  o1 = vec4(T.thInf, T.phInf, float(T.hitN[0]), float(T.hitCount));
  o2 = vec4(float(T.reason), T.hitPhi[0], T.hitR[1], T.hitG[1]);
#elif defined(MODE_DEBUG_PHOTO)
  o0 = vec4(float(T.status), float(T.hitCount), T.hitR[0], T.hitG[0]);
  if (T.hitCount > 0) {
    DiskShade s = shadeDiskHit(T.hitR[0], T.hitG[0], T.hitPhi[0]);
    o1 = vec4(s.photo.tau, s.photo.Tobs, s.photo.I, s.photo.log10Y);
    o2 = vec4(s.rgb, s.turb * s.edge);
  } else {
    o1 = vec4(0.0);
    o2 = vec4(0.0);
  }
#else
  vec3 L = shadeRay(T, nuCam);
  if (uAccumW < 1.0) L = mix(texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0).rgb / uHdrEncode, L, uAccumW);
  fragColor = vec4(L * uHdrEncode, 1.0);
#endif
#endif
}
