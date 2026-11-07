// ============================================================================
// shading.glsl — GEÇİCİ görsel mod (Adım 4a). Fotogerçekçilik hedef DEĞİL; çekirdeğin doğruluğunu
// gözle denetlemek için basit renklendirme. Disk sıcaklık profili, yıldız alanı, bloom: Adım 4b.
//
// FİZİKSEL girdiler : g_cam (gravitasyonel kayma + Doppler), vuruş yarıçapı r, görüntü sırası n,
//                     kaçış yönü (θ_∞, φ_∞), yakalanma.
// ESTETİK öğeler    : (E1) g_cam → renk eşlemesi (mavi/kırmızı),  (E2) parlaklık ∝ g_cam⁴ ölçeği ve
//                     üstel sıkıştırma 1−exp(−x),  (E3) ikincil görüntü renk tonu (n = 2 yeşil, n ≥ 3 mor),
//                     (E4) çok vuruşta yarı saydamlık (α = 0.7),  (E5) enlem/boylam ızgarası gökyüzü
//                     (merceklenmeyi görünür kılan tanılama deseni — gerçek bir arka plan DEĞİL),
//                     (E6) kaçış yönü bilinmeyen (bütçe biten, fate = kaçar) pikselin soluk kehribar rengi,
//                     (E7) gama 1/2.2.
// ============================================================================

// (E1)(E2)(E3) Disk vuruşu rengi. g_cam > 1 mavi, < 1 kırmızı, ≈ 1 beyaz.
// Parlaklık g_cam⁴ ile (bolometrik yoğunluk, g⁴ — FİZİKSEL oran; mutlak ölçek ESTETİK).
vec3 diskColor(float gCam, int n) {
  float lg = log2(max(gCam, 1e-3));
  vec3 white = vec3(1.0, 0.92, 0.8);
  vec3 blue = vec3(0.35, 0.55, 1.0);
  vec3 red = vec3(1.0, 0.25, 0.1);
  float t = clamp(lg / 0.6, -1.0, 1.0);                                  // g=1.5 → +1 (mavi), g=0.66 → −1 (kırmızı)
  vec3 tint = (t >= 0.0) ? mix(white, blue, t) : mix(white, red, -t);
  float g2 = gCam * gCam;
  float I = 0.5 * g2 * g2;
  vec3 col = tint * (1.0 - exp(-I));
  if (n == 2) col *= vec3(0.55, 1.0, 0.65);      // ikincil görüntü
  else if (n >= 3) col *= vec3(1.0, 0.55, 1.0);  // üçüncül ve sonrası
  return col;
}

// (E5) Gökyüzü: 15° aralıklı enlem/boylam ızgarası + dama deseni. θ_∞ ∈ [0,π], φ_∞ ∈ [0,2π).
vec3 skyGrid(float th, float ph) {
  const float STEP = PI / 12.0;
  float ti = th / STEP;
  float pi_ = ph / STEP;
  float dTh = abs(fract(ti + 0.5) - 0.5) * STEP;                       // en yakın enlem çizgisine açı
  float dPh = abs(fract(pi_ + 0.5) - 0.5) * STEP * max(sin(th), 0.05); // en yakın boylam çizgisine uzaklık
  float checker = mod(floor(ti) + floor(pi_), 2.0);
  vec3 base = (th < 0.5 * PI) ? vec3(0.05, 0.08, 0.16) : vec3(0.16, 0.08, 0.05);   // kuzey mavi, güney sıcak
  base *= (0.6 + 0.8 * checker);
  float w = 0.012;
  float polarFade = smoothstep(0.1, 0.35, sin(th));                      // kutupta φ çizgileri yakınsar: alias'ı söndür
  float line = max(1.0 - smoothstep(0.0, w, dTh), (1.0 - smoothstep(0.0, w, dPh)) * polarFade);
  vec3 lineCol = vec3(0.75);
  if (abs(th - 0.5 * PI) < 0.5 * STEP && dTh < w * 1.5) lineCol = vec3(1.0, 0.9, 0.2);  // ekvator
  if (dPh < w * 1.5 && (ph < STEP * 0.5 || ph > TWO_PI - STEP * 0.5)) lineCol = vec3(0.3, 1.0, 0.4); // φ = 0 meridyeni
  return mix(base, lineCol, line);
}

vec3 shadeRay(TraceResult T) {
  vec3 col = vec3(0.0);
  float trans = 1.0;

  // Arka plan (disk vuruşlarının ARKASINDA kalan ışık). Yakalandıysa siyah.
  vec3 bg = vec3(0.0);
  if (T.status == 1) {
    bg = (T.thInf >= 0.0) ? skyGrid(T.thInf, T.phInf) : vec3(0.18, 0.12, 0.04); // (E6)
  }

  // Disk vuruşları ön→arka. status==2 ise son vuruş opak.
  for (int k = 0; k < MAX_HITS; k++) {
    if (k >= T.hitCount) break;
    bool last = (T.status == 2) && (k == T.hitCount - 1);
    float alpha = (uMaxDiskHits > 1 && !last) ? 0.7 : 1.0;   // (E4)
    col += trans * alpha * diskColor(T.hitG[k], T.hitN[k]);
    trans *= (1.0 - alpha);
  }
  col += trans * bg;
  return pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));          // (E7)
}
