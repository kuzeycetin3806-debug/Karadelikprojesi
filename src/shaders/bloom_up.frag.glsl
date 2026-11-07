// ============================================================================
// bloom_up.frag.glsl — ESTETİK bloom: yukarı örnekleme (3×3 çadır) ve üst seviyeyle toplama
//   U_i = D_i + radius · tent(U_{i+1})
// ============================================================================
uniform sampler2D uLow;     // bir alt (daha küçük) seviye (U_{i+1} ya da son D)
uniform sampler2D uHigh;    // aynı seviyenin aşağı örneklenmiş hali D_i
uniform vec2 uLowTexel;     // 1 / uLow boyutu
uniform vec2 uDstInv;       // 1 / hedef boyutu
uniform float uRadius;      // 0–1

out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy * uDstInv;
  vec2 t = uLowTexel;
  vec3 s = texture(uLow, uv).rgb * 4.0;
  s += (texture(uLow, uv + t * vec2(-1.0, 0.0)).rgb + texture(uLow, uv + t * vec2(1.0, 0.0)).rgb
      + texture(uLow, uv + t * vec2(0.0, -1.0)).rgb + texture(uLow, uv + t * vec2(0.0, 1.0)).rgb) * 2.0;
  s += texture(uLow, uv + t * vec2(-1.0, -1.0)).rgb + texture(uLow, uv + t * vec2(1.0, -1.0)).rgb
     + texture(uLow, uv + t * vec2(-1.0, 1.0)).rgb + texture(uLow, uv + t * vec2(1.0, 1.0)).rgb;
  s *= 1.0 / 16.0;
  fragColor = vec4(texture(uHigh, uv).rgb + uRadius * s, 1.0);
}
