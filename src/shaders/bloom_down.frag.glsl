// ============================================================================
// bloom_down.frag.glsl — ESTETİK bloom: aşağı örnekleme (Jimenez 13-tap; ilk seviyede Karis ortalaması)
// Girdi: HDR doğrusal radyans. İlk seviyede pozlama (uExposure) uygulanır ⇒ bloom, ekranda görülen parlaklığa göre hesaplanır.
// ============================================================================
uniform sampler2D uSrc;
uniform vec2 uSrcTexel;     // 1 / kaynak boyutu
uniform vec2 uDstInv;       // 1 / hedef boyutu
uniform float uExposure;    // yalnız ilk seviye
uniform int uFirst;         // 1: ilk seviye (pozlama + Karis)

out vec4 fragColor;

vec3 fetch(vec2 uv) {
  vec3 c = texture(uSrc, uv).rgb;
  c = vec3(c.r >= 0.0 ? c.r : 0.0, c.g >= 0.0 ? c.g : 0.0, c.b >= 0.0 ? c.b : 0.0);   // NaN kalkanı
  return (uFirst == 1) ? c * uExposure : c;
}
float karis(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }

void main() {
  vec2 uv = gl_FragCoord.xy * uDstInv;
  vec2 t = uSrcTexel;
  vec3 a = fetch(uv + t * vec2(-2.0, -2.0));
  vec3 b = fetch(uv + t * vec2( 0.0, -2.0));
  vec3 c = fetch(uv + t * vec2( 2.0, -2.0));
  vec3 d = fetch(uv + t * vec2(-2.0,  0.0));
  vec3 e = fetch(uv);
  vec3 f = fetch(uv + t * vec2( 2.0,  0.0));
  vec3 g = fetch(uv + t * vec2(-2.0,  2.0));
  vec3 h = fetch(uv + t * vec2( 0.0,  2.0));
  vec3 i = fetch(uv + t * vec2( 2.0,  2.0));
  vec3 j = fetch(uv + t * vec2(-1.0, -1.0));
  vec3 k = fetch(uv + t * vec2( 1.0, -1.0));
  vec3 l = fetch(uv + t * vec2(-1.0,  1.0));
  vec3 m = fetch(uv + t * vec2( 1.0,  1.0));
  vec3 r;
  if (uFirst == 1) {
    // Karis ortalaması: tek parlak pikselin (yıldız, disk kenarı) titreşen "ateşböceği" bloom'unu bastırır
    vec3 g0 = 0.25 * (j + k + l + m);
    vec3 g1 = 0.25 * (a + b + d + e);
    vec3 g2 = 0.25 * (b + c + e + f);
    vec3 g3 = 0.25 * (d + e + g + h);
    vec3 g4 = 0.25 * (e + f + h + i);
    float w0 = 0.5 * karis(g0), w1 = 0.125 * karis(g1), w2 = 0.125 * karis(g2), w3 = 0.125 * karis(g3), w4 = 0.125 * karis(g4);
    r = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  } else {
    r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  fragColor = vec4(r, 1.0);
}
