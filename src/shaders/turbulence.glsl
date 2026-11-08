// ============================================================================
// turbulence.glsl — ESTETİK: disk ışımasında ince ölçekli türbülans dokusu + dış kenar yumuşatma.
//
// FİZİKSEL DEĞİLDİR (bir MHD simülasyonu değil): ışımayı (Y ve renk korunur) çarpan, log-normal bir modülasyon.
// Fiziksel olan tek şey advekte edilen desenin yerel Kepler açısal hızıyla dönmesidir:
//   Ω(r) = s/(r^{3/2} + s a)   (kerr.md §2.7; src/physics ile aynı)  ⇒ desen φ' = φ − Ω(r) t  sabit kalır.
// Fotonun varış gecikmesi (ışık yolu süresi) hesaba katılmaz (t integre edilmiyor).
//
// Diferansiyel dönme desene sınırsız sarılma verir; bunu sınırlamak için iki-fazlı "akış haritası" karışımı kullanılır:
// faz_i = fract(t/T + i/2), ağırlık_i = üçgen(faz_i), her katman Ω·T·faz_i kadar kaydırılmış (T = TURB_PERIOD) ⇒ desen T'de yinelenir.
// Piksel ayak izi (uCam.x · 2tan(fov/2)/H) altındaki oktavlar söndürülür (alias ve titreşim yok); biriktirme ayrıca AA yapar.
// ============================================================================

const float TURB_PERIOD = 50.0;   // M — params.js TURB_PERIOD ile aynı

// 4 oktavlı fbm, merkezlenmiş (≈ [−½, ½]). p: disk düzleminde Kartezyen konum (M), pix: piksel ayak izi (M)
float turbFbm(vec2 p, float pix) {
  float sum = 0.0;
  float norm = 0.0;
  float amp = 0.5;
  float cell = uTurbScale;
  vec2 q = p;
  for (int o = 0; o < 4; o++) {
    float fade = clamp((cell / max(pix, 1e-4) - 1.5) / 2.0, 0.0, 1.0);   // dalga boyu < ~1.5 piksel ⇒ 0, > ~3.5 piksel ⇒ 1
    sum += amp * fade * (vnoise2(q / cell, 101u + uint(o) * 7u) - 0.5);
    norm += amp;
    cell *= 0.5;
    amp *= 0.55;
  }
  return sum / norm;
}

// Işıma çarpanı (ortalama ≈ 1). r, φ: vuruş noktası (BL), pix: piksel ayak izi (M)
float turbulenceFactor(float r, float phi, float pix) {
  if (uTurbAmp <= 0.0) return 1.0;
  float sr = sqrt(r);
  float omega = uSpinSign / (r * sr + uSpinSign * uA);
  float ph1 = fract(uTime / TURB_PERIOD);
  float ph2 = fract(uTime / TURB_PERIOD + 0.5);
  float w1 = 1.0 - abs(2.0 * ph1 - 1.0);
  float w2 = 1.0 - w1;
  float a1 = phi - omega * TURB_PERIOD * ph1;
  float a2 = phi - omega * TURB_PERIOD * ph2;
  float c1 = turbFbm(r * vec2(cos(a1), sin(a1)), pix);
  float c2 = turbFbm(r * vec2(cos(a2), sin(a2)), pix);
  float c = (w1 * c1 + w2 * c2) / sqrt(w1 * w1 + w2 * w2);   // varyans korumalı karışım
  return exp(uTurbAmp * 6.0 * c);
}

// Dış kenar yumuşatma ∈ [0,1]: ESTETİK (fiziksel disk r_out'ta aniden kesilmez; kesim bir parametredir)
float diskEdgeFactor(float r) {
  if (uEdgeFade <= 0.0) return 1.0;
  float w = uEdgeFade * (uROut - uProfRIn);
  return 1.0 - smoothstep(uROut - w, uROut, r);
}

// Piksel ayak izi (M cinsinden, disk düzleminde yaklaşık): kamera mesafesi × piksel açısı; yatık bakışta uzar
// (shading.glsl'den buraya taşındı: animasyon geçişi yalnız turbulence.glsl'i derler)
float diskPixelFootprint() {
  float px = uCam.x * 2.0 * uTanHalf.y / uResolution.y;
  float cosI = max(abs(cos(uCam.y)), 0.15);
  return px / sqrt(cosI);
}
