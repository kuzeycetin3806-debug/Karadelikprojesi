// ============================================================================
// noise.glsl — deterministik tamsayı hash'i ve değer gürültüsü (yardımcı; ESTETİK öğeler kullanır:
// türbülans, yıldız alanı, Samanyolu). Float tabanlı sin-hash KULLANILMAZ (cihazdan cihaza farklı sonuç verir);
// PCG tamsayı hash'i her GPU'da aynı bitleri üretir ⇒ yıldız alanı deterministik.
// Negatif tamsayıdan uint dönüşümü şartnamede dikkat gerektirdiğinden kafes koordinatlarına pozitif öteleme eklenir.
// ============================================================================

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

// [0, 1) — üst 24 bit
float u01(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }

uint hash2(ivec2 p, uint salt) {
  return pcg(pcg(uint(p.x) + salt) ^ (uint(p.y) * 2654435761u));
}

uint hash3(ivec3 p, uint salt) {
  return pcg(pcg(pcg(uint(p.x) + salt) ^ (uint(p.y) * 2654435761u)) ^ (uint(p.z) * 2246822519u));
}

vec2 quintic(vec2 f) { return f * f * f * (f * (f * 6.0 - 15.0) + 10.0); }
vec3 quintic(vec3 f) { return f * f * f * (f * (f * 6.0 - 15.0) + 10.0); }

// 2B değer gürültüsü ∈ [0,1]
float vnoise2(vec2 p, uint salt) {
  vec2 i = floor(p);
  vec2 w = quintic(p - i);
  ivec2 ii = ivec2(i) + 32768;
  float a = u01(hash2(ii, salt));
  float b = u01(hash2(ii + ivec2(1, 0), salt));
  float c = u01(hash2(ii + ivec2(0, 1), salt));
  float d = u01(hash2(ii + ivec2(1, 1), salt));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

// 3B değer gürültüsü ∈ [0,1]
float vnoise3(vec3 p, uint salt) {
  vec3 i = floor(p);
  vec3 w = quintic(p - i);
  ivec3 ii = ivec3(i) + 32768;
  float n000 = u01(hash3(ii, salt));
  float n100 = u01(hash3(ii + ivec3(1, 0, 0), salt));
  float n010 = u01(hash3(ii + ivec3(0, 1, 0), salt));
  float n110 = u01(hash3(ii + ivec3(1, 1, 0), salt));
  float n001 = u01(hash3(ii + ivec3(0, 0, 1), salt));
  float n101 = u01(hash3(ii + ivec3(1, 0, 1), salt));
  float n011 = u01(hash3(ii + ivec3(0, 1, 1), salt));
  float n111 = u01(hash3(ii + ivec3(1, 1, 1), salt));
  return mix(mix(mix(n000, n100, w.x), mix(n010, n110, w.x), w.y),
             mix(mix(n001, n101, w.x), mix(n011, n111, w.x), w.y), w.z);
}
