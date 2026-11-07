// ============================================================================
// shading.glsl — Adım 4b: iz sürme sonucundan DOĞRUSAL HDR RADYANS (sRGB primerleri, ton eşlemesiz, pozlamasız).
//
// FİZİKSEL (bu dosyada): diskin Page–Thorne sıcaklığı, T_obs = g_cam f_col T_max τ, kara cisim rengi/parlaklığı (photometry.glsl),
//                        gökyüzü yönünden yıldız örnekleme + yerçekimi/Doppler kayması (stars.glsl), yakalanma = siyah.
// ESTETİK  (bu dosyada): türbülans dokusu ve dış kenar yumuşatma (turbulence.glsl), yıldız dağılımı/PSF/Samanyolu (stars.glsl),
//                        maxDiskHits>1 iken çok vuruşlu yarı saydamlık (α = 0.7; opak diskte ışın ilk vuruşta DURUR),
//                        yönü bilinmeyen halka pikselleri için gökyüzü ortalaması (skyMeanRadiance).
// Pozlama, bloom, ton eşleme, sRGB kodlama: post.glsl / composite.frag.glsl (ESTETİK sonrası işlem).
// ============================================================================

vec3 sanitizeRadiance(vec3 c) {
  // NaN/negatif ⇒ 0 (bloom NaN'ı tüm görüntüye yayar); yarı-kayan sınır 65504
  c = vec3(c.r >= 0.0 ? c.r : 0.0, c.g >= 0.0 ? c.g : 0.0, c.b >= 0.0 ? c.b : 0.0);
  return min(c, vec3(6.0e4));
}

// Piksel ayak izi (M cinsinden, disk düzleminde yaklaşık): kamera mesafesi × piksel açısı; yatık bakışta uzar
float diskPixelFootprint() {
  float px = uCam.x * 2.0 * uTanHalf.y / uResolution.y;
  float cosI = max(abs(cos(uCam.y)), 0.15);
  return px / sqrt(cosI);
}

// Bir disk vuruşunun nihai radyansı + (debug için) bileşenleri
struct DiskShade {
  DiskPhoto photo;
  float turb;     // ESTETİK türbülans çarpanı
  float edge;     // ESTETİK kenar yumuşatma
  vec3  rgb;      // I · rgb · turb · edge
};

DiskShade shadeDiskHit(float r, float gCam, float phi) {
  DiskShade s;
  s.photo = diskPhoto(r, gCam);
  s.turb = turbulenceFactor(r, phi, diskPixelFootprint());
  s.edge = diskEdgeFactor(r);
  s.rgb = s.photo.rgb * (s.photo.I * s.turb * s.edge);
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

  // --- arka plan (disk vuruşlarının ARKASI). Yakalandı ⇒ siyah.
  vec3 bg = vec3(0.0);
  if (T.status == 1) bg = known ? skyRadiance(dir, nuCam, fp2) : skyMeanRadiance(nuCam);

  // --- disk vuruşları ön→arka. status == 2 ise son vuruş OPAK (ışın orada durdu).
  vec3 col = vec3(0.0);
  float trans = 1.0;
  for (int k = 0; k < MAX_HITS; k++) {
    if (k >= T.hitCount) break;
    bool last = (T.status == 2) && (k == T.hitCount - 1);
    float alpha = (uMaxDiskHits > 1 && !last) ? 0.7 : 1.0;   // ESTETİK
    DiskShade s = shadeDiskHit(T.hitR[k], T.hitG[k], T.hitPhi[k]);
    col += trans * alpha * s.rgb;
    trans *= (1.0 - alpha);
  }
  col += trans * bg;
  return sanitizeRadiance(col);
}
