// ============================================================================
// photometry.glsl — disk ışıması: sıcaklık profili, kara cisim rengi ve parlaklık  (FİZİKSEL)
// CPU karşılığı: src/render/photometry.js diskPhotometryCPU (src/physics/disk.js fonksiyonlarıyla).
// Kaynak denklemler: docs/physics/disk.md §4.3, §5.4, §6.
//
//   τ(r)    = T_eff/T_max            profil tablosu (NEAREST + elle mix)
//   T_obs   = g_cam · f_col · T_max · τ(r)         (Liouville: g³B_ν(ν/g;T) = B_ν(gT); hit.g DEĞİL, hit.gCam)
//   renk    = blackbody(T_obs) kromatisitesi (Y = 1)    T > 1e5 K: renk 1e5 K'de sabit;  T < 1e3 K: renk 1e3 K'de sabit
//   mod A   : I = (g_cam τ)^4                                  (bolometrik; f_col kaybolur)
//   mod B   : I = 10^(log10 Y(T_obs) − log10 Y_ref) · f_col⁻⁴   (band-fotometrik; g³/g⁴ AYRICA uygulanmaz)
//   Y(T)    : LUT (1e3…1e5 K) | T>1e5: LUT(1e5)·(a x − b + c/x), x = T/1e5 (RJ serisi, 1e5'e çapalı) | T<1e3: Wien söndürmesi
// ============================================================================

const float LOG2_10 = 3.321928094887362;     // log2(10)
const float LOG10_2 = 0.301029995663981;     // log10(2)
const float BB_TMIN = 1000.0;
const float BB_TMAX = 100000.0;
const float WIEN_DEX = 9989.57;              // 2.3e4 K / ln(10)  (photometry.js WIEN_DEX)

// Kara cisim LUT'u: (rgb [Y=1], log10 Y). T aralık dışı kurallarıyla (yukarıdaki başlık).
vec4 blackbodyLookup(float T) {
  float Tc = clamp(T, BB_TMIN, BB_TMAX);
  int n = textureSize(uBB, 0).x;
  float u = clamp((log2(Tc) * LOG10_2 - 3.0) * 0.5, 0.0, 1.0) * float(n - 1);
  int i0 = min(int(floor(u)), n - 2);
  float t = u - float(i0);
  vec4 v = mix(texelFetch(uBB, ivec2(i0, 0), 0), texelFetch(uBB, ivec2(i0 + 1, 0), 0), t);
  if (T > BB_TMAX) {
    float x = T * 1e-5;
    v.a += log2(max(uSeries.x * x - uSeries.y + uSeries.z / x, 1e-30)) * LOG10_2;
  } else if (T < BB_TMIN) {
    v.a -= WIEN_DEX * (1.0 / max(T, 1.0) - 1.0 / BB_TMIN);
  }
  return v;
}

// τ(r) = T_eff/T_max.  s = √((r − r_in)/(r_out − r_in)) (ISCO'daki √ tekilliğini düzleştirir).
float diskTau(float r) {
  float s = sqrt(clamp((r - uProfRIn) / (uProfROut - uProfRIn), 0.0, 1.0));
  int n = textureSize(uProfile, 0).x;
  float u = s * float(n - 1);
  int i0 = min(int(floor(u)), n - 2);
  float t = u - float(i0);
  return mix(texelFetch(uProfile, ivec2(i0, 0), 0).r, texelFetch(uProfile, ivec2(i0 + 1, 0), 0).r, t);
}

struct DiskPhoto {
  float tau;     // T_eff/T_max
  float Tobs;    // gözlenen renk sıcaklığı (K)
  float I;       // parlaklık çarpanı (mod A: (gτ)⁴; mod B: Y(T_obs)/Y_ref · f_col⁻⁴)
  float log10Y;  // LUT log10 Y(T_obs) (mod B girdisi; yalnız doğrulama için)
  vec3  rgb;     // kromatisite (Y = 1)
};

// FİZİKSEL disk örneği (türbülans/kenar yumuşatma YOK — onlar ESTETİK, turbulence.glsl)
DiskPhoto diskPhoto(float r, float gCam) {
  DiskPhoto d;
  d.tau = diskTau(r);
  d.Tobs = gCam * uFcol * uTmax * d.tau;
  vec4 bb = blackbodyLookup(max(d.Tobs, 1.0));
  d.rgb = bb.rgb;
  d.log10Y = bb.a;
  if (uBrightMode == 0) {
    float gt = gCam * d.tau;
    float g2 = gt * gt;
    d.I = g2 * g2;
  } else {
    d.I = exp2((bb.a - uLogYref) * LOG2_10) * uFcolInv4;
  }
  if (d.Tobs <= 0.0) d.I = 0.0;
  return d;
}
