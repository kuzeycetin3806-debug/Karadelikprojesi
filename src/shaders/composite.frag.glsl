// ============================================================================
// composite.frag.glsl — HDR → ekran.  (three'nin ton eşleme fonksiyonları başa eklenir: bkz. src/shaders/index.js)
//
//   FİZİKSEL girdi : uHdr = doğrusal radyans (ton eşlemesiz, pozlamasız)
//   pozlama        : doğrusal çarpan — GÖSTERİM ölçeği (görüntüleme ölçeği; ne fizik ne estetik: radyansı ekran aralığına yerleştirir)
//   ESTETİK        : + bloom (uBloom), ton eşleme (ACES/AgX/Neutral/yok), dither
//   sRGB OETF      : standart kodlama (IEC 61966-2-1) — ekran gereği, estetik değil
// ============================================================================
uniform sampler2D uHdr;
uniform sampler2D uBloom;
uniform vec2 uInvSize;       // 1 / tuval boyutu
uniform float uExposure;
uniform float uBloomMix;     // bloomStrength / Σ radius^i  (0 = kapalı)
uniform int uTonemap;        // 0 yok (kırp) · 1 ACES · 2 AgX · 3 Neutral

out vec4 fragColor;

vec3 linearToSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

uint pcgh(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

void main() {
  vec2 uv = gl_FragCoord.xy * uInvSize;
  vec3 c = texture(uHdr, uv).rgb * uExposure;
  if (uBloomMix > 0.0) c += uBloomMix * texture(uBloom, uv).rgb;
  c = vec3(c.r >= 0.0 ? c.r : 0.0, c.g >= 0.0 ? c.g : 0.0, c.b >= 0.0 ? c.b : 0.0);
  if (uTonemap == 1) c = ACESFilmicToneMapping(c);
  else if (uTonemap == 2) c = AgXToneMapping(c);
  else if (uTonemap == 3) c = NeutralToneMapping(c);
  else c = clamp(c, 0.0, 1.0);
  c = linearToSRGB(c);
  // üçgen dağılımlı dither (±1 LSB): 8-bit bantlaşmayı önler
  uint k = uint(gl_FragCoord.x) + 8191u * uint(gl_FragCoord.y);
  float n = float(pcgh(k) >> 8u) * (1.0 / 16777216.0) + float(pcgh(k + 1234567u) >> 8u) * (1.0 / 16777216.0) - 1.0;
  fragColor = vec4(c + n * (1.0 / 255.0), 1.0);
}
