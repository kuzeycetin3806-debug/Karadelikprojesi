/**
 * Kerr / Schwarzschild temel fizik modülü (Boyer–Lindquist koordinatları).
 *
 * KONVANSİYONLAR
 *  - Birimler: G = c = 1; uzunluk ve zaman birimi M (kara delik kütlesi). `M` parametresi
 *    verilen her fonksiyonda uzunluklar M ile ölçeklenir (M=2 → tüm yarıçaplar 2 katı).
 *    `a` uzunluk birimindedir (a = a* · M, a* = boyutsuz spin ∈ [0,1]).
 *  - Metrik imzası (−,+,+,+). Koordinatlar (t, r, θ, φ), θ spin ekseninden ölçülür.
 *  - Spin ekseni +z yönünde, a ≥ 0 delik +φ yönünde döner.
 *    prograde=true  : yörünge delikle aynı yönde dönüyor (Ω > 0).
 *    prograde=false : retrograd yörünge (Ω < 0, işaretli açısal hız döner).
 *  - Geçersiz girdi (M ≤ 0, |a| > M, sonlu olmayan sayı, ufkun içindeki r vb.) → RangeError.
 *    Hiçbir fonksiyon sessizce NaN döndürmez (aşağıdaki "tanımsız" durumlar hata fırlatır).
 *  - `M` ilk argümandır; varsayılan değeri 1'dir (yalnızca `undefined` geçilirse devreye girer,
 *    örn. `horizonRadii(undefined, 0.9)`).
 *  - a = M (ekstrem Kerr) kabul edilir; r₊ = r₋ = M olur. BL koordinatlarında r = M bir
 *    koordinat tekilliğidir; sınır değerler (limit) belgelenmiştir.
 *
 * KAYNAKLAR
 *  [B72]  Bardeen, Press & Teukolsky 1972, ApJ 178, 347 (BPT) — ISCO, dairesel yörüngeler.
 *  [B73]  Bardeen 1973, "Timelike and null geodesics in the Kerr metric", Les Houches — ξ, η, gölge.
 *  [C83]  Chandrasekhar 1983, "The Mathematical Theory of Black Holes".
 *  [MTW]  Misner, Thorne & Wheeler 1973, "Gravitation", §33.
 *  [L79]  Luminet 1979, A&A 75, 228 — disk görüntüsü ve kırmızıya kayma.
 *
 * Ayrıntılı türetimler ve işaret konvansiyonları: docs/physics/kerr.md
 */

// ---------------------------------------------------------------------------
// Doğrulama yardımcıları (dışa aktarılmaz)
// ---------------------------------------------------------------------------

function checkMass(M) {
  if (!Number.isFinite(M) || !(M > 0)) {
    throw new RangeError(`M sonlu ve > 0 olmalı (verilen: ${M})`);
  }
}

/** |a| ≤ M kontrolü. nonNegative=true ise a ≥ 0 da şart (prograd/retrograd bayraklı fonksiyonlar). */
function checkSpin(M, a, nonNegative = false) {
  checkMass(M);
  if (!Number.isFinite(a)) throw new RangeError(`a sonlu olmalı (verilen: ${a})`);
  if (Math.abs(a) > M) {
    throw new RangeError(`|a| ≤ M olmalı; |a| > M çıplak tekillik verir (a=${a}, M=${M})`);
  }
  if (nonNegative && a < 0) {
    throw new RangeError(
      `a ≥ 0 olmalı; ters dönen delik için a>0 ve prograde=false kullanın (a=${a})`
    );
  }
}

function checkFinite(name, x) {
  if (!Number.isFinite(x)) throw new RangeError(`${name} sonlu olmalı (verilen: ${x})`);
}

/** Dış ufuk yarıçapı; (M−a)(M+a) çarpımı a≈M'de kesinliği korur. */
function rPlusOf(M, a) {
  return M + Math.sqrt((M - a) * (M + a));
}

/** r > r₊ (strict=true) veya r ≥ r₊ (strict=false) şartı. */
function checkOutside(M, a, r, strict = true) {
  checkFinite('r', r);
  const rp = rPlusOf(M, a);
  if (strict ? !(r > rp) : !(r >= rp)) {
    throw new RangeError(
      `r dış ufkun ${strict ? 'dışında (r > r₊)' : 'üstünde veya dışında (r ≥ r₊)'} olmalı: ` +
        `r=${r}, r₊=${rp}`
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Metrik
// ---------------------------------------------------------------------------

/**
 * Kerr metriğinin BL bileşenleri [B72, MTW 33.2]:
 *   Σ = r² + a² cos²θ,  Δ = r² − 2Mr + a²,  A = (r²+a²)² − a² Δ sin²θ
 *   g_tt = −(1 − 2Mr/Σ),  g_tφ = −2Mar sin²θ/Σ,  g_φφ = A sin²θ/Σ,
 *   g_rr = Σ/Δ,  g_θθ = Σ.
 * Tanım bölgesi: r > r₊ (ufkun dışı; Δ=0'da g_rr sonsuz olur → RangeError).
 * @returns {{Sigma:number, Delta:number, A:number, gtt:number, gtphi:number,
 *            gphiphi:number, grr:number, gthth:number}}
 */
export function metricBL(M = 1, a = 0, r, theta) {
  checkSpin(M, a);
  checkOutside(M, a, r, true);
  checkFinite('theta', theta);
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const s2 = s * s;
  const Sigma = r * r + a * a * c * c;
  const Delta = r * r - 2 * M * r + a * a;
  const A = (r * r + a * a) ** 2 - a * a * Delta * s2;
  return {
    Sigma,
    Delta,
    A,
    gtt: -(1 - (2 * M * r) / Sigma),
    gtphi: (-2 * M * a * r * s2) / Sigma,
    gphiphi: (A * s2) / Sigma,
    grr: Sigma / Delta,
    gthth: Sigma,
  };
}

// ---------------------------------------------------------------------------
// 2. Ufuklar
// ---------------------------------------------------------------------------

/**
 * r± = M ± √(M² − a²) [MTW 33.5]. a=0: (2M, 0); a=M: (M, M).
 */
export function horizonRadii(M = 1, a = 0) {
  checkSpin(M, a);
  const root = Math.sqrt((M - a) * (M + a));
  return { rPlus: M + root, rMinus: M - root };
}

// ---------------------------------------------------------------------------
// 3. Ergosfer
// ---------------------------------------------------------------------------

/**
 * Dış ergoyüzey (g_tt = 0): r_E(θ) = M + √(M² − a² cos²θ) [MTW 33.5, Bardeen 1973].
 * Kutuplarda (θ=0,π) r₊'a, ekvatorda 2M'e eşittir.
 */
export function ergosphereRadius(M = 1, a = 0, theta) {
  checkSpin(M, a);
  checkFinite('theta', theta);
  const ac = a * Math.cos(theta);
  return M + Math.sqrt((M - ac) * (M + ac));
}

// ---------------------------------------------------------------------------
// 4. Çerçeve sürüklenmesi
// ---------------------------------------------------------------------------

/**
 * ω = −g_tφ/g_φφ = 2Mar/A  (ZAMO açısal hızı) [B72, MTW 33.x].
 * Kapalı form kullanılır, bu yüzden eksen üzerinde (sinθ=0) 0/0 sorunu yoktur.
 * r ≥ r₊ gerekir (ufukta ω = Ω_H = a/(2M r₊)). r→∞: ω ≈ 2Ma/r³ → 0.
 */
export function frameDraggingOmega(M = 1, a = 0, r, theta) {
  checkSpin(M, a);
  checkOutside(M, a, r, false);
  checkFinite('theta', theta);
  const s = Math.sin(theta);
  const Delta = r * r - 2 * M * r + a * a;
  const A = (r * r + a * a) ** 2 - a * a * Delta * s * s;
  return (2 * M * a * r) / A;
}

// ---------------------------------------------------------------------------
// 5. Foton yörüngesi (ekvatoral)
// ---------------------------------------------------------------------------

/**
 * Ekvatoral dairesel foton yörüngesi [B72 eq. 2.18, Bardeen 1973]:
 *   r_ph = 2M { 1 + cos[ (2/3) arccos(∓ a/M) ] }   (üst işaret prograd)
 * a=0: 3M. a=M: prograd M, retrograd 4M.
 */
export function photonOrbitRadius(M = 1, a = 0, prograde = true) {
  checkSpin(M, a, true);
  const x = prograde ? -a / M : a / M;
  return 2 * M * (1 + Math.cos((2 / 3) * Math.acos(x)));
}

// ---------------------------------------------------------------------------
// 6. ISCO
// ---------------------------------------------------------------------------

/**
 * ISCO — Bardeen–Press–Teukolsky 1972, eq. (2.21):
 *   Z₁ = 1 + (1−ã²)^{1/3} [ (1+ã)^{1/3} + (1−ã)^{1/3} ],  Z₂ = √(3ã² + Z₁²),
 *   r_isco = M { 3 + Z₂ ∓ √[(3−Z₁)(3+Z₁+2Z₂)] }   (− prograd, + retrograd), ã = a/M.
 * a=0: 6M. a=M: prograd M, retrograd 9M.
 * NOT: a=M prograd sonucu (r=M) BL'de ufukla çakışır; limit değer olarak döner.
 */
export function iscoRadius(M = 1, a = 0, prograde = true) {
  checkSpin(M, a, true);
  const at = a / M;
  const Z1 =
    1 + Math.cbrt((1 - at) * (1 + at)) * (Math.cbrt(1 + at) + Math.cbrt(1 - at));
  const Z2 = Math.sqrt(3 * at * at + Z1 * Z1);
  const root = Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2));
  return M * (3 + Z2 + (prograde ? -root : root));
}

// ---------------------------------------------------------------------------
// 7–8. Dairesel ekvatoral yörüngeler
// ---------------------------------------------------------------------------

/**
 * İşaretli açısal hız (dφ/dt) [B72 eq. 2.16]:
 *   Ω = +√M /(r^{3/2} + a√M)  (prograd),   Ω = −√M /(r^{3/2} − a√M)  (retrograd).
 * Pozitif = deliğin dönüş yönü. Retrogradda payda r ≥ r₊ için daima > 0'dır.
 * Zaman benzeri/kararlı olma koşulu BURADA denetlenmez (bkz. circularOrbitUt).
 */
export function keplerOmega(M = 1, a = 0, r, prograde = true) {
  checkSpin(M, a, true);
  checkOutside(M, a, r, false);
  const sM = Math.sqrt(M);
  const r32 = r * Math.sqrt(r);
  return prograde ? sM / (r32 + a * sM) : -sM / (r32 - a * sM);
}

/** Ortak: dairesel yörünge paydası D = r^{3/4} √(r^{3/2} − 3M r^{1/2} + 2 s a √M). */
function circularOrbitDenominator(M, a, r, prograde) {
  checkSpin(M, a, true);
  checkOutside(M, a, r, false);
  const s = prograde ? 1 : -1;
  const sr = Math.sqrt(r);
  const rad = r * sr - 3 * M * sr + 2 * s * a * Math.sqrt(M);
  if (!(rad > 0)) {
    throw new RangeError(
      `r=${r}: bu bölgede zaman benzeri dairesel yörünge yok ` +
        `(r > r_ph=${photonOrbitRadius(M, a, prograde)} gerekir)`
    );
  }
  return { D: Math.pow(r, 0.75) * Math.sqrt(rad), s };
}

/**
 * Ekvatoral dairesel yörüngede u^t = dt/dτ [B72 eq. 2.15]:
 *   u^t = (r^{3/2} + s a√M) / ( r^{3/4} √(r^{3/2} − 3M r^{1/2} + 2 s a√M) ),  s=+1 prograd, −1 retrograd.
 * Eşdeğer: u^t = 1/√(−(g_tt + 2 g_tφ Ω + g_φφ Ω²)). a=0: 1/√(1−3M/r).
 * Tanım: radikand > 0 ⇔ r > r_ph(foton yörüngesi). Aksi halde RangeError.
 * Not: r < r_isco'da yörünge dairesel ama KARARSIZDIR; fonksiyon yine de değer verir.
 */
export function circularOrbitUt(M = 1, a = 0, r, prograde = true) {
  const { D, s } = circularOrbitDenominator(M, a, r, prograde);
  return (r * Math.sqrt(r) + s * a * Math.sqrt(M)) / D;
}

/**
 * Dairesel yörünge özgül enerjisi E = −u_t [B72 eq. 2.12]:
 *   E = (r^{3/2} − 2M r^{1/2} + s a√M) / D.   (EK fonksiyon; verim η = 1 − E(r_isco))
 */
export function circularOrbitEnergy(M = 1, a = 0, r, prograde = true) {
  const { D, s } = circularOrbitDenominator(M, a, r, prograde);
  const sr = Math.sqrt(r);
  return (r * sr - 2 * M * sr + s * a * Math.sqrt(M)) / D;
}

/**
 * Dairesel yörünge özgül açısal momentumu L = u_φ [B72 eq. 2.13]:
 *   L = s √M ( r² − 2 s a √(M r) + a² ) / D.   (EK fonksiyon)
 */
export function circularOrbitAngularMomentum(M = 1, a = 0, r, prograde = true) {
  const { D, s } = circularOrbitDenominator(M, a, r, prograde);
  return (s * Math.sqrt(M) * (r * r - 2 * s * a * Math.sqrt(M * r) + a * a)) / D;
}

// ---------------------------------------------------------------------------
// 9. Disk kırmızıya kayması
// ---------------------------------------------------------------------------

/**
 * Ekvatoral dairesel yörüngedeki yayıcıdan sonsuzdaki gözlemciye g-faktörü:
 *   g = ν_gözlenen / ν_yayılan = 1 / ( u^t (1 − Ω λ) ),   λ = L_z/E = p_φ/(−p_t) (foton).
 * Türetme: ν_em = −p_μ u^μ = E u^t (1 − Ωλ); ν_obs = E.  [L79, B72]
 * İŞARET KONVANSİYONU:
 *  - λ, FOTONUN (yayıcıdan gözlemciye giden) sabit L_z/E değeridir; λ>0 fotonun delikle aynı
 *    yönde (+φ) açısal momentum taşıdığı anlamına gelir. Bardeen ekran koordinatlarıyla
 *    λ = ξ = −α sinθ_o (α: ekranda spin eksenine dik yatay yer değiştirme).
 *  - Ω işaretli (keplerOmega ile aynı). Madde gözlemciye yaklaşırken Ωλ > 0 → g > 1 (maviye kayma).
 *  - Gözlenen yoğunluk için I_obs = g³ I_em (I_ν/ν³ korunumu); bolometrik: g⁴.
 * Fiziksel olarak E>0 fotonlar için 1 − Ωλ > 0 olmalıdır; aksi halde (fiziksel olmayan λ) RangeError.
 */
export function diskRedshiftFactor(M = 1, a = 0, r, lambda, prograde = true) {
  checkFinite('lambda', lambda);
  const ut = circularOrbitUt(M, a, r, prograde);
  const Omega = keplerOmega(M, a, r, prograde);
  const f = 1 - Omega * lambda;
  if (!(f > 0)) {
    throw new RangeError(
      `1 − Ωλ = ${f} ≤ 0: bu λ bu yörüngeden kaçan (E>0) bir fotona karşılık gelmez`
    );
  }
  return 1 / (ut * f);
}

// ---------------------------------------------------------------------------
// 10. Statik gözlemci
// ---------------------------------------------------------------------------

/**
 * Statik gözlemci (sabit r,θ,φ) için g = √(−g_tt) = √(1 − 2Mr/Σ).
 * Statik gözlemci yalnızca ergoyüzeyin DIŞINDA (r > r_E(θ)) vardır; içinde g_tt ≥ 0 olup
 * tanımsızdır → RangeError. a=0: √(1−2M/r), r=6M için √(2/3).
 */
export function staticRedshift(M = 1, a = 0, r, theta) {
  checkSpin(M, a);
  checkFinite('r', r);
  checkFinite('theta', theta);
  const rE = ergosphereRadius(M, a, theta);
  if (!(r > rE)) {
    throw new RangeError(
      `Statik gözlemci yalnızca ergoyüzeyin dışında tanımlı: r=${r}, r_E(θ)=${rE}`
    );
  }
  const c = Math.cos(theta);
  const Sigma = r * r + a * a * c * c;
  return Math.sqrt(1 - (2 * M * r) / Sigma);
}

// ---------------------------------------------------------------------------
// 11. Kritik eğri (küresel foton yörüngeleri)
// ---------------------------------------------------------------------------

/**
 * Sabit-r küresel foton yörüngelerinin hareket sabitleri [B73 eq. 2.8; Chandrasekhar 1983 §63]:
 *   ξ = L/E = [ r²(3M − r) − a²(r + M) ] / [ a (r − M) ]
 *   η = Q/E² = r³ [ 4M a² − r (r − 3M)² ] / [ a² (r − M)² ]
 * Sayısal kararlılık için a² > M²/2'de eşdeğer δ = M²−a² biçimi kullanılır:
 *   ξ = [ M² + 2Mr − r² + δ (r+M)/(r−M) ] / a,
 *   η = r³ [ (4M−r) − 4Mδ/(r−M)² ] / a²
 * (a=M, r=M limiti ξ=2M, η=3M²'dir ve doğrudan döndürülür.)
 *
 * Fiziksel foton yörüngesi: η ≥ 0 ⇔ r_ph,pro ≤ r ≤ r_ph,retro. Bu aralığın dışında η<0
 * döner (fiziksel değil; fonksiyon hata vermez).
 * UYARI (a=M tam değerinde): r_ph,pro = M'de η=0 (ekvatoral yörünge) olsa da bu fonksiyon r=M için
 * limit r→M (δ=0 sabit) değerini, yani (ξ,η)=(2M,3M²) döndürür (NHEK boğazı). İki limit sıra
 * değiştirince farklıdır; a<M için η(r_ph)=0 her zaman sağlanır (a→M'de sürekli, a=M'de süreksiz).
 * Tanım: a = 0'da ξ, r'nin fonksiyonu değildir (yalnızca ξ²+η = 27M² kalır) → RangeError;
 * Schwarzschild için shadowBoundary kullanın. r ≥ r₊ gerekir.
 */
export function criticalCurve(M = 1, a = 0, r) {
  checkSpin(M, a, true);
  if (a === 0) {
    throw new RangeError(
      'criticalCurve: a=0 için ξ(r) tanımsız (Schwarzschild: ξ²+η=27M² ve r=3M); ' +
        'shadowBoundary(M, 0, inclination, n) kullanın'
    );
  }
  checkOutside(M, a, r, false);
  const delta = (M - a) * (M + a);
  const d = r - M;
  if (a * a > 0.5 * M * M) {
    // δ-biçimi (a≈M'de iptal hatası yok)
    const xiTerm = delta === 0 ? 0 : (delta * (r + M)) / d;
    const etaTerm = delta === 0 ? 0 : (4 * M * delta) / (d * d);
    return {
      xi: (M * M + 2 * M * r - r * r + xiTerm) / a,
      eta: (r * r * r * ((4 * M - r) - etaTerm)) / (a * a),
    };
  }
  const x = r - 3 * M;
  return {
    xi: (r * r * (3 * M - r) - a * a * (r + M)) / (a * d),
    eta: (r * r * r * (4 * M * a * a - r * x * x)) / (a * a * d * d),
  };
}

// ---------------------------------------------------------------------------
// 12. Gölge sınırı
// ---------------------------------------------------------------------------

/** β²(r) = η + a² cos²θ_o − ξ² cot²θ_o  [B73 eq. 2.10] */
function betaSquared(M, a, thetaO, r) {
  const { xi, eta } = criticalCurve(M, a, r);
  const c = Math.cos(thetaO);
  const s = Math.sin(thetaO);
  return eta + a * a * c * c - (xi * xi * c * c) / (s * s);
}

/**
 * Sonsuzdaki gözlemcinin ekranında kara delik gölgesinin sınırı [B73; Chandrasekhar 1983 §63].
 *   α = −ξ / sinθ_o,   β = ± √( η + a² cos²θ_o − ξ² cot²θ_o ),
 * ξ(r), η(r) için r ∈ [r₁, r₂] ⊂ [r_ph,pro, r_ph,retro] ve β² ≥ 0 olmalıdır.
 *
 * Koordinatlar (M cinsinden): α = ekranda izdüşümü alınmış spin eksenine DİK (yatay),
 * β = izdüşümü alınmış spin ekseni yönünde (düşey). α = −ξ/sinθ_o seçimi Bardeen'inkidir:
 * a>0 için gölge +α yönüne kayar, prograd (yassı) kenar α<0 tarafındadır; disk maddesinin
 * gözlemciye yaklaşan (mavi kayma) tarafı da α<0'dır (λ=ξ=−α sinθ_o ile tutarlı).
 *
 * @param {number} M
 * @param {number} a            0 ≤ a ≤ M
 * @param {number} inclination  gözlemcinin spin eksenine göre açısı θ_o (radyan), [0, π].
 *                              0 = yüz yüze (face-on), π/2 = kenardan. θ_o ve π−θ_o aynı eğriyi verir.
 * @param {number} n            nokta sayısı (tamsayı ≥ 4). Çift n, α uç noktalarını (β=0) tam içerir.
 * @returns {{alpha:number, beta:number}[]} kapalı eğri (ilk nokta sonuncuya tekrar edilmez),
 *          t=0 noktası prograd/küçük-r ucudur (β=0, α=α_min); eğri üst yarıdan (β>0) saat yönünde dolaşılır.
 *
 * a=M ve θ_o yeterince büyükse (örn. 90°) sol uç "açık"tır: sınır α=−2M'de |β| ≤ √3 M olan
 * dikey bir doğru parçası içerir. Bu durumda t ∈ [0,2π] kapalı aralıkta n nokta üretilir; ilk nokta
 * (α₁,+β₁), son nokta (α₁,−β₁) olur ve poligonu kapatan kenar bu doğru parçasıdır.
 * (α_max'ın tam yakalanması için bu durumda n−1 çift seçilmelidir.)
 *
 * Özel durumlar: a < 1e-8 M → tam çember (Schwarzschild, yarıçap 3√3 M);
 * sinθ_o < 1e-6 → yüz yüze çember, yarıçap √(η₀ + a²) (ξ(r₀)=0).
 * Parametrizasyon: r = r_orta + yarıçap_aralığı·cos t, t_k = 2πk/n (uçlarda nokta yoğunlaşır).
 */
export function shadowBoundary(M = 1, a = 0, inclination, n) {
  checkSpin(M, a, true);
  checkFinite('inclination', inclination);
  if (inclination < 0 || inclination > Math.PI) {
    throw new RangeError(`inclination [0, π] aralığında olmalı (verilen: ${inclination})`);
  }
  if (!Number.isInteger(n) || n < 4) {
    throw new RangeError(`n tamsayı ≥ 4 olmalı (verilen: ${n})`);
  }

  const pts = new Array(n);
  const TWO_PI = 2 * Math.PI;

  // Schwarzschild: tam çember
  if (a < 1e-8 * M) {
    const R = 3 * Math.sqrt(3) * M;
    for (let k = 0; k < n; k++) {
      const t = (TWO_PI * k) / n;
      pts[k] = { alpha: -R * Math.cos(t), beta: R * Math.sin(t) };
    }
    // t=0 noktası Kerr ile aynı yönelim için α_min (= −R) alır.
    return pts;
  }

  const rPro = photonOrbitRadius(M, a, true);
  const rRet = photonOrbitRadius(M, a, false);

  // ξ(r₀) = 0 kökü (ξ, [rPro, rRet] üzerinde azalır).
  let lo = rPro;
  let hi = rRet;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (criticalCurve(M, a, mid).xi > 0) lo = mid;
    else hi = mid;
  }
  const r0 = 0.5 * (lo + hi);

  const sinO = Math.sin(inclination);
  if (sinO < 1e-6) {
    // Yüz yüze: ξ=0 zorunlu → çember.
    const { eta } = criticalCurve(M, a, r0);
    const R = Math.sqrt(Math.max(0, eta + a * a));
    for (let k = 0; k < n; k++) {
      const t = (TWO_PI * k) / n;
      pts[k] = { alpha: -R * Math.cos(t), beta: R * Math.sin(t) };
    }
    return pts;
  }

  // β²(r) ≥ 0 olan aralığın uçları [r1, r2] (r₀'da β² = η + a²cos²θ_o > 0).
  const g = (r) => betaSquared(M, a, inclination, r);
  const tol = -1e-12;
  let r1 = rPro;
  if (g(rPro) < tol) {
    let l = rPro;
    let h = r0;
    for (let i = 0; i < 200; i++) {
      const m = 0.5 * (l + h);
      if (g(m) >= 0) h = m;
      else l = m;
    }
    r1 = h;
  }
  let r2 = rRet;
  if (g(rRet) < tol) {
    let l = r0;
    let h = rRet;
    for (let i = 0; i < 200; i++) {
      const m = 0.5 * (l + h);
      if (g(m) >= 0) l = m;
      else h = m;
    }
    r2 = l;
  }

  const rMid = 0.5 * (r1 + r2);
  const rHalf = 0.5 * (r2 - r1);
  const betaEps = 1e-9 * M * M; // uç noktada β²'nin sayısal gürültü eşiği

  // "Açık uç": a=M'de (δ=0) r₁=M noktasında β>0 kalır; gölge sınırı orada α=−2M'de
  // dikey bir doğru parçası içerir (NHEK boğazı). Poligonun bu parçayı kesmemesi için
  // alt dalın (α₁,−β₁) noktasıyla bitmesi gerekir → t ∈ [0, 2π] kapalı aralıkta n nokta.
  const openEnd1 = r1 === rPro && g(r1) > betaEps;
  const denom = openEnd1 ? n - 1 : n;

  for (let k = 0; k < n; k++) {
    const t = (TWO_PI * k) / denom;
    let r = rMid - rHalf * Math.cos(t); // t=0 → r=r1 (küçük r, prograd uç)
    const isEnd1 = k === 0 || (openEnd1 && k === n - 1);
    const isEnd2 = 2 * k === denom;
    if (isEnd1) r = r1;
    else if (isEnd2) r = r2;
    const { xi } = criticalCurve(M, a, r);
    const g2 = g(r);
    // Uçlarda β²≈0 olmalı: sqrt gürültüsünü (≈1e-7) önlemek için tam 0'a sabitle.
    const b = (isEnd1 || isEnd2) && g2 < betaEps ? 0 : Math.sqrt(Math.max(0, g2));
    const lower = (openEnd1 && k === n - 1) || (k > 0 && Math.sin(t) < 0);
    pts[k] = { alpha: -xi / sinO, beta: lower ? -b : b };
  }
  return pts;
}
