// ============================================================================
// stars.glsl — prosedürel, deterministik yıldız alanı ve Samanyolu bandı.
//
// Gökyüzü YÖNÜ 3B birim vektörle örneklenir (θ,φ enlem-boylamı DEĞİL ⇒ kutup dikişi yok):
//   d = (sinθ_∞ cosφ_∞, sinθ_∞ sinφ_∞, cosθ_∞)  — sonsuzdaki BL yönü; kameradan bağımsız ⇒ yıldızlar gökte SABİT,
//   kamera dönünce yer değiştirir, merceklenme dışında bozulmaz.
// Yapı: DİKİŞSİZ 3B kafes. Yıldızlar birim hücreli bir 3B kafeste, merkezi |c| ∈ [R−½, R+½] kabuğunda olan hücrelerde yaşar
//   (hücre başına en çok 1 yıldız, hücre içi konum jitter'ı, PCG hash); yıldızın yönü normalize(konum). Bir pikselin yönü d için
//   q = R·d'nin hücresi ve 26 komşusu taranır (27 hash) ⇒ Gauss kuyrukları hiçbir hücre/yüz sınırında kesilmez, kutup/küp dikişi yoktur.
//   İki katman: parlak/seyrek (R=45) ve sönük/yoğun (R=130). Gökte düzgün yoğunluk: kabuk hücre sayısı ≈ 4πR².
//
// YILDIZ GÖRÜNTÜSÜ = NOKTA KAYNAK (denetim Ö3). Yıldızlar sonsuz küçük nokta kaynaklardır; görüntü düzleminde (ekran) PSF boyutunda
//   KALIR (σ_s = 0.65 tuval pikseli, Gauss) ve toplam akısı merceklenme büyütmesi μ ile ölçeklenir (Liouville: yüzey parlaklığı korunur,
//   nokta kaynağın akısı μ ile değişir). Uygulama: yerel gökyüzü Jakobiyeni J = [dFdx(d), dFdy(d)] (gök yönü / piksel); bir yıldıza
//   göre ekran ofseti δ = J⁺(d − d_yıldız) (piksel), PSF = exp(−|δ|²/2σ_eff²); μ = Ω_nominal / |dFdx(d) × dFdy(d)| (Ω_nominal =
//   merceksiz piksel katı açısı, perspektif cos³ düzeltmeli). Genlik = F · min(μ, MU_CAP) · σ_s²/σ_eff² (σ_eff² = σ_s² + ¼ piksel² ayak izi).
//   ⇒ merceklenmiş yıldız YAY OLARAK UZAMAZ; noktadır ve μ kadar parlaklaşır (Einstein halkası yakınında μ büyür) ya da sönükleşir (μ<1).
//   Yay görünümü gerçek bir yıldızın (sonlu açısal çaplı) ya da yaygın ışığın (Samanyolu) özelliğidir, nokta kaynağın değil.
//
// FİZİKSEL : yön eşlemesi (merceklenme), yıldız renk sıcaklığı → kara cisim kromatisitesi (blackbodyLUT, 3000–30000 K),
//            yerçekimi/Doppler kayması T_obs = ν_cam/ν_∞ · T_star ve band-luminans oranı 10^(logY(T_obs) − logY(T)) (Liouville),
//            nokta kaynak büyütmesi μ (akı ∝ μ) ve görüntü düzleminde PSF boyutunda kalma (yerel Jakobiyenden, piksel farkıyla).
// ESTETİK  : parlaklık dağılımı (kesik Pareto), yıldız sayısı/PSF boyu (σ_s), büyütme TAVANI STAR_MU_CAP (gerçekte μ→∞ kritik eğride),
//            Samanyolu bandı (şekil, renk, toz şeritleri, yıldız artışı), kaba ızgarada ¼ piksel² ayak izi süzmesi (örtüşme önleme).
//
// Ayak izi: yön türevi komşu piksellerden (dFdx/dFdy; 2×2 dörtlüde sabit) hesaplanır; σ_eff² = σ_s² + ¼ ⇒ küçülen (minified)
//   bölgelerde yıldız kaybolmaz, enerji korunur (genlik · σ_s²/σ_eff²).
// ============================================================================

// Galaktik düzlem normali ve "galaktik merkez" yönü (rastgele ama sabit; diskin düzlemine paralel değil)
const vec3 GAL_N = vec3(0.30058, -0.50097, 0.81157);        // ≈ normalize(0.30, −0.50, 0.81)
const vec3 GAL_C = vec3(0.95134, 0.21141, -0.22198);        // düzlemde (GAL_N·GAL_C ≈ 0), birim

vec3 sphToCart(float th, float ph) {
  vec2 s = sinCos(th);
  vec2 p = sinCos(ph);
  return vec3(s.x * p.y, s.x * p.x, s.y);
}

// ESTETİK tavan: büyütme genliğinin üst sınırı (gerçek μ kritik eğride sonsuza gider; tek bir yıldız ekranı doyurmasın)
const float STAR_MU_CAP = 24.0;

// Piksel başına yerel gökyüzü haritası (tek-biçimli akışta, dFdx/dFdy ile kurulur — shading.glsl)
struct SkyMap {
  vec3  p0;       // ekran ofseti δx = dot(p0, d − d_yıldız)  [iz sürme pikseli]
  vec3  p1;       // ekran ofseti δy = dot(p1, d − d_yıldız)
  float mu;       // merceksiz piksel katı açısı / yerel piksel katı açısı (tavanlı); 1 = merceksiz
  float sigPx2;   // PSF σ_s² (piksel²)
  float reject2;  // gökte kabul yarıçapı² (üstü Gauss katkısı < e⁻⁹)
};

// ddx, ddy: gök yönünün piksel başına değişimi; valid=false ⇒ komşu geçersiz ⇒ merceksiz (nominal) harita.
// fpNom: nominal piksel açısı (rad), persp: (1+x²+y²)^(-3/2) (kamera ekseninden uzak pikselin merceksiz katı açısı çarpanı)
SkyMap makeSkyMap(vec3 dir, vec3 ddx, vec3 ddy, bool valid, float fpNom, float persp) {
  SkyMap m;
  float sg = uStarSigma / fpNom;                       // PSF σ_s, iz sürme pikseli cinsinden (tuval/iz sürme oranı dahil)
  m.sigPx2 = sg * sg;
  float sigEff2 = m.sigPx2 + 0.25;
  if (valid) {
    float e = (0.02 * fpNom) * (0.02 * fpNom);         // düzenleme: ddx ≈ 0 ya da ddx ∥ ddy durumunda det → 0 olmasın
    float a = dot(ddx, ddx) + e;
    float c = dot(ddy, ddy) + e;
    float b = dot(ddx, ddy);
    float det = max(a * c - b * b, 1e-30);
    m.p0 = (c * ddx - b * ddy) / det;                  // δ = G⁻¹ Jᵀ dd
    m.p1 = (a * ddy - b * ddx) / det;
    m.mu = min(fpNom * fpNom * persp / sqrt(det), STAR_MU_CAP);
    m.reject2 = 18.0 * sigEff2 * (a + c);              // λ_max ≤ iz
  } else {
    // dik, birim teğet tabanı: δ = dd / fpNom
    vec3 t0 = normalize(cross(dir, abs(dir.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
    vec3 t1 = cross(dir, t0);
    m.p0 = t0 / fpNom;
    m.p1 = t1 / fpNom;
    m.mu = 1.0;
    m.reject2 = 18.0 * sigEff2 * fpNom * fpNom;
  }
  return m;
}

// Tek yıldız katmanı (3B kafes kabuğu). d: gökyüzü yönü, R: kabuk yarıçapı (hücre birimi)
vec3 starLayer(vec3 d, float R, float p0, float fMin, float fMax, float alpha, uint salt,
               float band, float bandBoost, SkyMap sm, float nuCam) {
  ivec3 c0 = ivec3(floor(d * R));
  float sigEff2 = sm.sigPx2 + 0.25;                    // PSF σ² + ¼ piksel² ayak izi (piksel²)
  float ampN = sm.sigPx2 / sigEff2;                    // enerji korunumu (ayak izi süzmesi)
  float pEff = p0 * (1.0 + bandBoost * band);
  vec3 col = vec3(0.0);
  for (int dz = -1; dz <= 1; dz++) {
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        ivec3 c = c0 + ivec3(dx, dy, dz);
        vec3 cen = vec3(c) + 0.5;
        if (abs(length(cen) - R) > 0.5) continue;      // yalnız kabuktaki hücreler
        uint h = hash3(c + 32768, salt);
        if (u01(h) >= min(pEff, 0.97)) continue;       // yıldız var mı
        h = pcg(h); float rx = u01(h);
        h = pcg(h); float ry = u01(h);
        h = pcg(h); float rz = u01(h);
        vec3 ds = normalize(vec3(c) + vec3(rx, ry, rz));
        vec3 dd = d - ds;
        float d2 = dot(dd, dd);
        if (d2 > sm.reject2) continue;
        vec2 dl = vec2(dot(sm.p0, dd), dot(sm.p1, dd)); // ekran ofseti (piksel)
        h = pcg(h); float rb = u01(h);      // parlaklık: kesik Pareto  F = fMin (1 − u (1 − q))^{−1/α},  q = (fMin/fMax)^α
        h = pcg(h); float rt = u01(h);      // sıcaklık
        float q = pow(fMin / fMax, alpha);
        float F = fMin * pow(1.0 - rb * (1.0 - q), -1.0 / alpha);
        float T = 3000.0 * pow(10.0, pow(rt, 1.5));    // 3000 … 30000 K (soğuk yıldızlar çoğunlukta)
        vec4 b0 = blackbodyLookup(T);
        vec4 b1 = blackbodyLookup(T * nuCam);          // FİZİKSEL: yerçekimi/Doppler kayması
        float shift = exp2((b1.a - b0.a) * LOG2_10);   // band-luminans oranı Y(gT)/Y(T)
        float amp = F * sm.mu * ampN * exp(-0.5 * dot(dl, dl) / sigEff2) * shift;   // nokta kaynak: akı ∝ μ, PSF görüntü düzleminde
        col += b1.rgb * amp;
      }
    }
  }
  return col;
}

// Samanyolu bandı şekli ∈ ~[0,1.5]  (ESTETİK). b = sin(galaktik enlem)
float milkyWayBand(vec3 d) {
  float b = dot(d, GAL_N);
  float core = exp(-0.5 * b * b / (0.10 * 0.10));
  float halo = exp(-0.5 * b * b / (0.32 * 0.32));
  float bulge = exp(-(1.0 - dot(d, GAL_C)) / 0.30);
  return core * (0.5 + 0.9 * bulge) + 0.18 * halo * (0.4 + bulge);
}

// Samanyolu yaygın ışığı (ESTETİK). fp2: açısal ayak izi² (radyan²)
vec3 milkyWayDiffuse(vec3 d, float band, float fp2, float nuCam) {
  float fp = sqrt(fp2);
  float dust = 0.0;
  float amp = 0.5, norm = 0.0, freq = 3.0;
  float lanes = 0.0;
  for (int o = 0; o < 4; o++) {
    float fade = clamp((1.0 / freq / max(fp, 1e-6) - 1.5) / 2.0, 0.0, 1.0);
    dust += amp * fade * (vnoise3(d * freq, 301u + uint(o) * 13u) - 0.5);
    norm += amp;
    freq *= 2.3;
    amp *= 0.55;
  }
  dust /= norm;
  float lane = smoothstep(0.02, 0.14, dust);                      // karanlık toz şeritleri
  float cloud = 0.65 + 3.2 * dust;                                // parlak bulutsular
  float level = band * max(cloud, 0.1) * (1.0 - 0.75 * lane * exp(-0.5 * dot(d, GAL_N) * dot(d, GAL_N) / (0.08 * 0.08)));
  vec3 warm = vec3(1.0, 0.80, 0.58);
  vec3 cool = vec3(0.62, 0.74, 1.0);
  vec3 tint = mix(cool, warm, clamp(0.35 + 0.9 * exp(-(1.0 - dot(d, GAL_C)) / 0.5), 0.0, 1.0));
  // FİZİKSEL kayma (≈5500 K temsili): band luminansı Y(gT)/Y(T)
  float shift = exp2((blackbodyLookup(5500.0 * nuCam).a - blackbodyLookup(5500.0).a) * LOG2_10);
  return tint * (0.06 * level * shift);
}

// Tüm gökyüzü ışıması (yön biliniyorsa)
vec3 skyRadiance(vec3 d, float nuCam, float fp2, SkyMap sm) {
  vec3 col = vec3(0.0);
  float band = milkyWayBand(d);
  if (uMilkyWay > 0.0) col += uMilkyWay * milkyWayDiffuse(d, band, fp2, nuCam);
  if (uStarsOn != 0) {
    vec3 s = vec3(0.0);
    s += starLayer(d, 45.0, 0.22, 0.10, 8.0, 1.35, 11u, band, 1.5, sm, nuCam);      // parlak / seyrek
    s += starLayer(d, 130.0, 0.30, 0.016, 0.32, 1.15, 5003u, band, 3.0, sm, nuCam); // sönük / yoğun
    col += uStarBrightness * s;
  }
  return col;
}

// Yönü bilinmeyen (bütçesi biten, kaçar) foton halkası pikselleri: gökyüzü ortalaması.
// Gerekçe: kritik eğriye sonsuz yakın ışınlar gökyüzünün her yerini örnekler ⇒ çözülmemiş bir yıldız toplamı ≈ yaygın ortalama.
vec3 skyMeanRadiance(float nuCam) {
  vec3 tint = vec3(1.0, 0.85, 0.66);
  float shift = exp2((blackbodyLookup(5500.0 * nuCam).a - blackbodyLookup(5500.0).a) * LOG2_10);
  return tint * (0.006 * uMilkyWay * shift) + vec3(0.0015) * float(uStarsOn) * uStarBrightness;
}
