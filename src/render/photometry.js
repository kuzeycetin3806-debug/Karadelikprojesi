/**
 * Disk fotometrisi — CPU tarafı (Adım 4b). FİZİKSEL.
 *
 * `src/physics/disk.js` fonksiyonlarını İÇE AKTARIR (kopyalamaz) ve GPU'ya gidecek tabloları/uniform'ları üretir:
 *   - profil tablosu  T_eff/T_max (256 × R32F, s = √((r−r_in)/(r_out−r_in)) eşlemesi)   → uProfile
 *   - kara cisim LUT   [R,G,B (Y=1), log10 Y] (256 × RGBA32F, log10 T ∈ [3,5])           → uBB
 *   - T > 1e5 K luminans serisi (RJ genişlemesi) normalize katsayıları (a, b, c)          → uSeries
 *   - Y_ref = log10 Y(T_max)   (f_col'dan BAĞIMSIZ; denetim K2)                            → uLogYref
 * ve doğrulama için GPU'nun yaptığı hesabın CPU karşılığını (`diskPhotometryCPU`) verir.
 *
 * Fiziksel kural özeti (docs/physics/disk.md §4.3):
 *   renk      : T_obs = g_cam · f_col · T_max · τ(r)  →  kara cisim kromatisitesi (Y = 1)
 *   mod A     : I = (g_cam τ)^4                       (bolometrik; f_col kaybolur)
 *   mod B     : I = Y(T_obs)/Y(T_max) · f_col^-4       (band-fotometrik; g bağımlılığı Y(g T) içinde, ayrıca g³/g⁴ YOK)
 *               Y_ref = Y(T_max) f_col'dan bağımsızdır ⇒ f_col değişimi FİZİKSEL parlaklık değişimini verir (sabit pozlamada
 *               tepe ≈ f_col⁻⁴ · Y(f_col T_max)/Y(T_max); T_max=1e4, f_col=1.7: 0.416). f_col⁻⁴ normalizasyonla yutulmaz.
 */
import {
  diskProfileTable,
  diskTemperatureProfile,
  blackbodyLUT,
  blackbodyToLinearSRGB,
  blackbodyLuminanceSeries,
  sampleDiskProfileTable,
  sampleBlackbodyLUT,
  BLACKBODY_LUT_TMIN,
  BLACKBODY_LUT_TMAX,
} from '../physics/disk.js';

export const PROFILE_N = 256;
export const BB_LUT_N = 256;
/** T < 1000 K Wien söndürmesi: ln Y ≈ ln Y(1000 K) − WIEN_K (1/T − 1/1000 K)  (disk.md §5.4; ±%30 @600 K'ye kadar). */
export const WIEN_K = 2.3e4;
/** Shader'daki `WIEN_DEX` ile aynı: log10 cinsinden eğim (K). */
export const WIEN_DEX = WIEN_K / Math.LN10;

// ---------------------------------------------------------------------------------------------
// Önbellekli üreticiler
// ---------------------------------------------------------------------------------------------
let lutCache = null;
/** Kara cisim LUT'u (bir kez üretilir). `data`: Float32Array(4N) = [R,G,B,log10Y]. */
export function getBlackbodyLUT() {
  if (!lutCache) lutCache = blackbodyLUT(BB_LUT_N);
  return lutCache;
}

let seriesCache = null;
/**
 * T > 1e5 K için normalize RJ serisi: Y(T)/Y(1e5) = a x − b + c/x,  x = T/1e5,  a − b + c = 1.
 * `blackbodyLuminanceSeries(T) = αT − β + γ/T` olduğundan üç noktadan (x = 1, 2, 4) 3×3 doğrusal sistem çözülür
 * (JS'ten katsayı dışa vermek gerekmedi; physics'e dokunulmadı). Kontrol: x = 100'de yeniden üretim hatası ~1e-12.
 */
export function getLuminanceSeries() {
  if (seriesCache) return seriesCache;
  const S0 = blackbodyLuminanceSeries(1e5);
  const xs = [1, 2, 4];
  // satır: [x, −1, 1/x | s]
  const M = xs.map((x) => [x, -1, 1 / x, blackbodyLuminanceSeries(1e5 * x) / S0]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  const a = M[0][3] / M[0][0];
  const bNeg = M[1][3] / M[1][1]; // katsayı −1 ile çarpıldığı için bNeg = b·(−1)/(−1) → b
  const c = M[2][3] / M[2][2];
  seriesCache = { a, b: bNeg, c };
  return seriesCache;
}

/** log10 Y(T) — doğrudan integralden (LUT değil). Çok düşük T'de (<150 K) Wien yaklaşımı (integral taşar). */
export function log10YExact(T) {
  if (T < 150) return log10YExact(150) - WIEN_DEX * (1 / T - 1 / 150);
  return Math.log10(blackbodyToLinearSRGB(T).luminance);
}

// profil tablosu önbelleği (a, yön, r_out anahtarlı; tek giriş: kaydırıcı sürüklenirken yeniden hesap ucuz)
let profCache = { key: '', value: null };
/** Tablo: {N, rIn, rOut, aStar, prograde, data: Float32Array(N)}. r_out ≤ r_isco ise null (disk yok). */
export function getProfileTable(aStar, prograde, rOut) {
  const key = `${aStar}|${prograde}|${rOut}`;
  if (profCache.key === key) return profCache.value;
  let value = null;
  try {
    value = diskProfileTable(aStar, prograde, rOut, PROFILE_N);
  } catch (e) {
    if (!(e instanceof RangeError)) throw e; // r_out ≤ r_isco
  }
  profCache = { key, value };
  return value;
}

/** Shader'a gidecek skaler fotometri uniform'ları (f64 → f32 yüklemede). */
export function photometryScalars({ Tmax, fCol, brightnessMode }) {
  const s = getLuminanceSeries();
  return {
    tmax: Tmax,
    fCol,
    fColInv4: fCol ** -4,
    logYref: log10YExact(Tmax), // K2: f_col'dan bağımsız referans
    brightMode: brightnessMode === 'bolometric' ? 0 : 1,
    series: [s.a, s.b, s.c],
  };
}

// ---------------------------------------------------------------------------------------------
// Doğrulama için CPU karşılığı (GLSL `diskSample` ile aynı adımlar; fonksiyonlar src/physics/disk.js'ten)
// ---------------------------------------------------------------------------------------------
/**
 * @param {{a:number, prograde:boolean, rOut:number, Tmax:number, fCol:number, brightnessMode:'band'|'bolometric'}} cfg
 * @param {number} r      vuruş yarıçapı (M)
 * @param {number} gCam   g_cam = ν_cam/ν_em   (hit.gCam)
 * @returns {{tau:number, tauTable:number, Tobs:number, I:number, ITable:number, rgb:number[], log10Y:number, rgbLut:number[]}}
 *   `tau/I/rgb` = tam fonksiyonlar (diskTemperatureProfile + blackbodyToLinearSRGB integrali);
 *   `tauTable/ITable/rgbLut` = GPU'nun yaptığı gibi tablo/LUT enterpolasyonu (GLSL ile aynı formüller).
 */
export function diskPhotometryCPU(cfg, r, gCam) {
  const { a, prograde, rOut, Tmax, fCol, brightnessMode } = cfg;
  const tbl = getProfileTable(a, prograde, rOut);
  const tau = diskTemperatureProfile(1, a, r, prograde);
  const tauTable = tbl ? sampleDiskProfileTable(tbl, r) : 0;
  const lut = getBlackbodyLUT();
  const logYref = log10YExact(Tmax); // K2
  const ser = getLuminanceSeries();

  const out = {};
  for (const [tag, t] of [['', tau], ['Table', tauTable]]) {
    const Tobs = gCam * fCol * Tmax * t;
    let I;
    let log10Y;
    let rgb;
    if (tag === '') {
      // TAM: doğrudan integral
      if (Tobs > 1) {
        log10Y = log10YExact(Tobs);
        rgb = blackbodyToLinearSRGB(Math.min(Math.max(Tobs, BLACKBODY_LUT_TMIN), 1e12)).rgb; // kromatisite 1e3'ten aşağı kıstırılır
        if (Tobs > BLACKBODY_LUT_TMAX) rgb = blackbodyToLinearSRGB(BLACKBODY_LUT_TMAX).rgb; // >1e5 K: renk 1e5'te sabit
      } else {
        log10Y = -Infinity;
        rgb = [0, 0, 0];
      }
      out.Tobs = Tobs;
      out.log10Y = log10Y;
      out.rgb0 = rgb;
    } else {
      // GPU eşleniği: LUT + (T>1e5: seri, 1e5'te çapalı) + (T<1e3: Wien)
      const Tc = Math.max(Tobs, 1);
      const s = sampleBlackbodyLUT(lut, Tc);
      log10Y = s.log10Y;
      rgb = s.rgb;
      if (Tc > BLACKBODY_LUT_TMAX) {
        const x = Tc / BLACKBODY_LUT_TMAX;
        log10Y += Math.log10(ser.a * x - ser.b + ser.c / x);
      } else if (Tc < BLACKBODY_LUT_TMIN) {
        log10Y -= WIEN_DEX * (1 / Tc - 1 / BLACKBODY_LUT_TMIN);
      }
      out.log10YLut = log10Y;
      out.rgbLut = rgb;
    }
    const Ival =
      brightnessMode === 'bolometric' ? (gCam * t) ** 4 : Math.pow(10, log10Y - logYref) * fCol ** -4;
    if (tag === '') out.I = Ival;
    else out.ITable = Ival;
  }
  out.tau = tau;
  out.tauTable = tauTable;
  out.rgb = out.rgb0.map((c) => c * out.I);
  out.rgbLutRadiance = out.rgbLut.map((c) => c * out.ITable);
  return out;
}
