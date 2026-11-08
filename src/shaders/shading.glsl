// ============================================================================
// shading.glsl — Adım 4b: iz sürme sonucundan DOĞRUSAL HDR RADYANS (sRGB primerleri, ton eşlemesiz, pozlamasız).
//
// FİZİKSEL (bu dosyada): diskin Page–Thorne sıcaklığı, T_obs = g_cam f_col T_max τ, kara cisim rengi/parlaklığı (photometry.glsl),
//                        gökyüzü yönünden yıldız örnekleme (nokta kaynak: görüntü düzleminde PSF, akı ∝ büyütme μ) + yerçekimi/Doppler kayması (stars.glsl), yakalanma = siyah.
// SICAK NOKTA (hotspot.glsl): Kepler yörüngesi + ışık yolu gecikmesi (tDelay) + g FİZİKSEL; Gauss genliği/boyutu ESTETİK.
// ESTETİK  (bu dosyada): türbülans dokusu ve dış kenar yumuşatma (turbulence.glsl), yıldız dağılımı/PSF/Samanyolu (stars.glsl),
//                        maxDiskHits>1 iken çok vuruşlu yarı saydamlık (α = 0.7; opak diskte ışın ilk vuruşta DURUR),
//                        yönü bilinmeyen halka pikselleri için gökyüzü ortalaması (skyMeanRadiance).
// Pozlama (GÖSTERİM ölçeği), bloom, ton eşleme (ESTETİK), sRGB kodlama (gösterim): bloom_*.frag.glsl / composite.frag.glsl.
// ============================================================================

vec3 sanitizeRadiance(vec3 c) {
  // NaN/negatif ⇒ 0 (bloom NaN'ı tüm görüntüye yayar); yarı-kayan sınır 65504
  c = vec3(c.r >= 0.0 ? c.r : 0.0, c.g >= 0.0 ? c.g : 0.0, c.b >= 0.0 ? c.b : 0.0);
  return min(c, vec3(6.0e4));
}

// Bir disk vuruşunun nihai radyansı + (debug için) bileşenleri
struct DiskShade {
  DiskPhoto photo;
  float turb;     // ESTETİK türbülans çarpanı
  float edge;     // ESTETİK kenar yumuşatma
  float hot;      // sıcak nokta çarpanı (hotspot.glsl; kinematik+gecikme FİZİKSEL, genlik ESTETİK); uHotOn = 0 ⇒ 1
  vec3  rgb;      // I · rgb · turb · edge · hot
};

DiskShade shadeDiskHit(float r, float gCam, float phi, float tDelay) {
  DiskShade s;
  s.photo = diskPhoto(r, gCam);
  // uTurbDeferred = 1: çarpan animasyon geçişinde (main.frag.glsl MODE_ANIM) uygulanır; burada 1 (yalnız MODE_SHADE bunu açar)
  s.turb = (uTurbDeferred != 0) ? 1.0 : turbulenceFactor(r, phi, diskPixelFootprint());
  s.edge = diskEdgeFactor(r);
  // zaman bağımlı sıcak nokta da aynı kuralla: uTurbDeferred = 1 ⇒ animasyon geçişinde (A) uygulanır
  s.hot = (uTurbDeferred != 0) ? 1.0 : hotspotFactor(r, phi, tDelay);
  s.rgb = s.photo.rgb * (s.photo.I * s.turb * s.edge * s.hot);
  return s;
}

vec3 shadeRay(TraceResult T, float nuCam) {
  // --- gökyüzü yönü ve ayak izi: dFdx/dFdy ŞART TEK-biçimli akışta (burada, dallanmadan önce)
  bool known = (T.status == 1) && (T.thInf >= 0.0);
  vec3 dir = known ? sphToCart(T.thInf, T.phInf) : vec3(0.0, 0.0, 1.0);
  float vf = known ? 1.0 : 0.0;
  vec3 ddx = dFdx(dir);
  vec3 ddy = dFdy(dir);
  float dvf = abs(dFdx(vf)) + abs(dFdy(vf));
  float fpNom = 2.0 * uTanHalf.y / uResolution.y;
  // komşu piksel geçerli yöne sahip değilse (kaçış/yakalanma/disk sınırı) türev anlamsız ⇒ nominal ayak izi
  float fp2 = (dvf > 0.0) ? fpNom * fpNom : clamp(max(dot(ddx, ddx), dot(ddy, ddy)), 0.25 * fpNom * fpNom, 1.0);
  // yıldızlar için yerel gökyüzü haritası (görüntü düzlemi PSF + büyütme μ; stars.glsl). Geçerli yalnız yön biliniyor ve komşular geçerliyse.
  vec2 ndcS = 2.0 * (gl_FragCoord.xy + uJitter) / uResolution - 1.0;
  vec2 tp = ndcS * uTanHalf;
  float persp = pow(1.0 + dot(tp, tp), -1.5);
  SkyMap sm = makeSkyMap(dir, ddx, ddy, known && dvf == 0.0, fpNom, persp);

  // --- arka plan (disk vuruşlarının ARKASI). Yakalandı ⇒ siyah.
  vec3 bg = vec3(0.0);
  if (T.status == 1) bg = known ? skyRadiance(dir, nuCam, fp2, sm) : skyMeanRadiance(nuCam);

  // --- disk vuruşları ön→arka. status == 2 ise son vuruş OPAK (ışın orada durdu).
  vec3 col = vec3(0.0);
  float trans = 1.0;
  for (int k = 0; k < MAX_HITS; k++) {
    if (k >= T.hitCount) break;
    bool last = (T.status == 2) && (k == T.hitCount - 1);
    float alpha = (uMaxDiskHits > 1 && !last) ? 0.7 : 1.0;   // ESTETİK
    DiskShade s = shadeDiskHit(T.hitR[k], T.hitG[k], T.hitPhi[k], T.hitT[k]);
    col += trans * alpha * s.rgb;
    trans *= (1.0 - alpha);
  }
  col += trans * bg;
  return sanitizeRadiance(col);
}
