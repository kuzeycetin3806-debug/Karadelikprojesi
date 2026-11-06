# Kerr / Schwarzschild temel fizik modülü

Kod: `src/physics/kerr.js`, `src/physics/units.js` — Testler: `src/physics/kerr.test.mjs`

## 1. Konvansiyonlar

| Konu | Seçim |
|---|---|
| Birimler | G = c = 1. Uzunluk ve zaman birimi **M** (kara delik kütlesi). Her fonksiyon `M` alır (varsayılan 1; yalnızca `undefined` geçilirse). |
| Spin | `a` uzunluk birimindedir, a = a*·M; geçerli aralık 0 ≤ a ≤ M. `a = M` (ekstrem Kerr) kabul edilir. `\|a\| > M` → `RangeError` (çıplak tekillik). |
| Koordinatlar | Boyer–Lindquist (t, r, θ, φ); θ spin ekseninden ölçülür (θ = π/2 ekvator). |
| İmza | (−, +, +, +) |
| Yön | Spin ekseni +z; a > 0 delik +φ yönünde döner. |
| Prograd/retrograd | `prograde = true`: yörünge dönüşle aynı yönde, Ω > 0. `prograde = false`: Ω < 0 (işaretli döner). Retrograd için de `a ≥ 0` verilir (negatif a **verilmez**). |
| Hata davranışı | Tanımsız girdi → `RangeError` (M ≤ 0, \|a\| > M, sonlu olmayan sayı, ufkun içindeki r, ergosfer içinde statik gözlemci, r ≤ r_ph'de dairesel yörünge…). Sessiz `NaN` yoktur. |
| Fiziksel / estetik | Bu modülde yalnızca **fiziksel** büyüklükler vardır. Bloom, tonemapping gibi estetik efektler burada yoktur. |

Metrik fonksiyonları (`metricBL`, `frameDraggingOmega`, `ergosphereRadius`, `horizonRadii`, `staticRedshift`) negatif `a`'yı da kabul eder (ayna simetrisi); prograd/retrograd bayraklı fonksiyonlar `a ≥ 0` ister.

## 2. Formüller

Kısaltmalar: Σ = r² + a² cos²θ, Δ = r² − 2Mr + a², A = (r²+a²)² − a²Δ sin²θ.

**Kaynaklar:** [BPT72] Bardeen, Press & Teukolsky 1972, ApJ 178, 347 · [B73] Bardeen 1973, *Timelike and null geodesics in the Kerr metric* (Les Houches, "Black Holes") · [C83] Chandrasekhar 1983, *The Mathematical Theory of Black Holes*, §61–63 · [MTW] Misner–Thorne–Wheeler 1973, §33 · [L79] Luminet 1979, A&A 75, 228 · [T74] Thorne 1974, ApJ 191, 507.

### 2.1 Metrik — `metricBL(M, a, r, θ)` [BPT72; MTW 33.2]

- g_tt = −(1 − 2Mr/Σ)
- g_tφ = −2Mar sin²θ / Σ
- g_φφ = A sin²θ / Σ
- g_rr = Σ/Δ, g_θθ = Σ

Tanım bölgesi r > r₊ (Δ = 0'da g_rr sonsuz). Özdeşlik: g_tt g_φφ − g_tφ² = −Δ sin²θ.

### 2.2 Ufuklar — `horizonRadii(M, a)` [MTW 33.5]

r± = M ± √(M² − a²). a = 0: (2M, 0). a = M: (M, M). (M−a)(M+a) çarpımıyla hesaplanır (a ≈ M'de kesinlik).

### 2.3 Ergosfer — `ergosphereRadius(M, a, θ)` [MTW 33.5]

g_tt = 0 ⇒ r_E(θ) = M + √(M² − a² cos²θ). Ekvatorda 2M, kutuplarda r₊.

### 2.4 Çerçeve sürüklenmesi — `frameDraggingOmega(M, a, r, θ)` [BPT72]

ω = −g_tφ/g_φφ = **2Mar / A** (kapalı form; eksende 0/0 yok). Ufukta ω = Ω_H = a/(2M r₊); r → ∞: ω ≈ 2Ma/r³.

### 2.5 Ekvatoral foton yörüngesi — `photonOrbitRadius(M, a, prograde)` [BPT72 eq. 2.18; B73]

r_ph = 2M { 1 + cos[ (2/3) arccos(∓a/M) ] }  (üst işaret prograd).
a = 0: 3M. a = M: prograd M, retrograd 4M. Bağımsız koşul: r^{3/2} − 3M r^{1/2} ± 2a√M = 0 (testte kontrol edilir).

### 2.6 ISCO — `iscoRadius(M, a, prograde)` [BPT72 eq. 2.21]

ã = a/M,
Z₁ = 1 + (1−ã²)^{1/3} [ (1+ã)^{1/3} + (1−ã)^{1/3} ],
Z₂ = √(3ã² + Z₁²),
r_isco = M { 3 + Z₂ ∓ √[(3−Z₁)(3+Z₁+2Z₂)] }  (− prograd, + retrograd).
a = 0: 6M. a = M: prograd M, retrograd 9M. Bağımsız koşul: r² − 6Mr ± 8a√(Mr) − 3a² = 0.
*Not:* a = M prograd sonucu (r = M) BL'de ufukla çakışır; sınır (limit) değer olarak döner.

### 2.7 Dairesel yörünge büyüklükleri (ekvator) [BPT72 eq. 2.12–2.16]

s = +1 prograd, −1 retrograd; D = r^{3/4} √(r^{3/2} − 3M r^{1/2} + 2 s a√M).

| Fonksiyon | Formül |
|---|---|
| `keplerOmega` | Ω = +√M/(r^{3/2} + a√M) (prograd); Ω = −√M/(r^{3/2} − a√M) (retrograd) |
| `circularOrbitUt` | u^t = (r^{3/2} + s a√M)/D  ≡ 1/√(−(g_tt + 2g_tφΩ + g_φφΩ²)) |
| `circularOrbitEnergy` (ek) | E = −u_t = (r^{3/2} − 2M r^{1/2} + s a√M)/D |
| `circularOrbitAngularMomentum` (ek) | L = u_φ = s√M (r² − 2 s a√(Mr) + a²)/D |

Tanım: radikand > 0 ⇔ r > r_ph(yön). Aksi halde `RangeError`. r < r_isco'da yörünge dairesel ama **kararsızdır**; fonksiyonlar yine de değer verir (disk modeli r ≥ r_isco kullanmalıdır). Radyatif verim η = 1 − E(r_isco): a = 0 → 0.0572; a = 0.9 → 0.156; a = 0.998 → 0.321 [T74]; a = M → 1 − 1/√3 = 0.4226.

### 2.8 Disk kırmızıya kayması — `diskRedshiftFactor(M, a, r, λ, prograde)` [L79; BPT72]

**g = ν_gözlenen/ν_yayılan = 1 / ( u^t (1 − Ω λ) )**, λ = L_z/E = p_φ/(−p_t) (fotonun hareket sabiti).

Türetme: yayıcı u^μ = u^t(1, 0, 0, Ω); ν_em = −p_μu^μ = E u^t(1 − Ωλ); sonsuzdaki gözlemci ν_obs = E.

**İşaret konvansiyonu:**
- λ **fotonun** (yayıcıdan gözlemciye giden) L_z/E değeridir; λ > 0 ⇒ foton delikle aynı yönde (+φ) açısal momentum taşır.
- Ω işaretlidir (§2.7). Madde gözlemciye yaklaşırken Ωλ > 0 ⇒ g > 1 (maviye kayma).
- Bardeen ekran koordinatlarıyla: **λ = ξ = −α sinθ_o** (§2.11). Dolayısıyla prograd diskte **α < 0 yaklaşan (mavi) taraf**, α > 0 uzaklaşan (kırmızı) taraftır.
- Fiziksel (E > 0) fotonlar için 1 − Ωλ > 0 olmalıdır; aksi halde `RangeError`.
- Gözlenen özgül yoğunluk: I_ν,obs = g³ I_ν,em (I_ν/ν³ korunumu, Liouville); ν üzerinden entegre (bolometrik) yoğunluk g⁴.

Bu fonksiyon **hem yerçekimsel hem Doppler** etkisini içerir; ayrıştırma gerekirse yerçekimi kısmı için `staticRedshift` kullanın.

### 2.9 Statik gözlemci — `staticRedshift(M, a, r, θ)`

g = √(−g_tt) = √(1 − 2Mr/Σ). Statik gözlemci (sabit r, θ, φ) yalnızca ergoyüzeyin **dışında** (r > r_E(θ)) vardır; içeride g_tt ≥ 0 ve fonksiyon `RangeError` fırlatır. a = 0, r = 6M: √(2/3).

### 2.10 Kritik eğri — `criticalCurve(M, a, r)` [B73 eq. 2.8; C83 §63]

Sabit-r küresel foton yörüngeleri (ξ = L/E, η = Q/E²):

- ξ = [ r²(3M − r) − a²(r + M) ] / [ a (r − M) ]
- η = r³ [ 4Ma² − r (r − 3M)² ] / [ a² (r − M)² ]

a² > M²/2'de, δ = M² − a² ile cebirsel olarak eşdeğer ve a ≈ M'de iptal hatasından arınmış biçim kullanılır:
ξ = [M² + 2Mr − r² + δ(r+M)/(r−M)]/a, η = r³[(4M−r) − 4Mδ/(r−M)²]/a².

- Fiziksel aralık: η ≥ 0 ⇔ r_ph,pro ≤ r ≤ r_ph,retro. Dışında η < 0 döner (hata yok).
- **a = 0**: ξ, r'nin fonksiyonu değildir (yalnızca r = 3M, ξ² + η = 27M²) → `RangeError`; `shadowBoundary` kullanın.
- **a = M**: r = M'de limit (ξ, η) = (2M, 3M²) döner (NHEK boğazı). Ekvatoral prograd foton yörüngesi (r = M) η = 0'dır, ama iki limit sıra değiştirince farklı sonuç verir: a < M için η(r_ph) = 0 her zaman sağlanır (a → M'de η(r_ph) → 0), **a = M tam değerinde süreksizdir**.
- Doğrulama: Carter radyal potansiyeli R(r) = [(r²+a²) − aξ]² − Δ[(ξ−a)² + η] için R = R' = 0 (çift kök) testlerde kontrol edilir.

### 2.11 Gölge sınırı — `shadowBoundary(M, a, inclination, n)` [B73 eq. 2.10; C83 §63]

Sonsuzdaki gözlemci (eğim θ_o):

- **α = −ξ / sin θ_o**
- **β = ± √( η + a² cos²θ_o − ξ² cot²θ_o )**

(ξ, η) = `criticalCurve(r)`; r, β² ≥ 0 olan tek aralık [r₁, r₂] ⊂ [r_ph,pro, r_ph,retro] üzerinde değişir (aralığın uçları bisection ile bulunur; β²'nin tek aralıkta pozitif olduğu ve ξ(r)'nin monoton azaldığı a ∈ {0.3, 0.9, 1}, θ_o ∈ {0.3, 1, π/2} için sayısal olarak taranmıştır).

- α: ekranda izdüşümü alınmış spin eksenine dik (yatay); β: izdüşümü alınmış spin ekseni yönünde (düşey); birim M.
- a > 0 için gölge **+α yönüne kayar**; yassı (prograd) kenar α < 0 tarafındadır. Kenardan bakışta (θ_o = π/2) α ∈ [−ξ(r_ph,pro), −ξ(r_ph,retro)] (a = M: [−2M, 7M]).
- θ_o ve π − θ_o aynı eğriyi verir (ekvator yansıma simetrisi). θ_o ∈ [0, π].
- Dönen eğri üstten başlayıp **saat yönünde** dolaşılır; t = 0 noktası prograd uçtur. Parametrizasyon r = r_orta − yarıçap·cos t, t_k = 2πk/n. Çift `n` uç noktaları (β = 0) tam içerir; uçlarda β tam 0'a sabitlenir.
- Özel durumlar: a < 1e-8·M → tam çember 3√3 M; sin θ_o < 1e-6 → yüz yüze çember, yarıçap √(η₀ + a²) (ξ(r₀) = 0); a = M için 2(1+√2)M ≈ 4.828 M.
- a = M ve θ_o yeterince büyükken sol uç açıktır: sınırda α = −2M'de |β| ≤ √3 M dikey doğru parçası bulunur. Bu durumda t ∈ [0, 2π] kapalı aralıkta n nokta üretilir (ilk = (−2, +√3), son = (−2, −√3)); `n−1` çift seçilirse α_max tam örneklenir. Poligonu kapatan kenar bu doğru parçasıdır.
- Schwarzschild: tüm noktalar yarıçap b_c = 3√3 M çember üzerinde [Synge 1966; C83].

## 3. Birimler — `units.js`

| Sabit | Değer | Kaynak |
|---|---|---|
| c | 299 792 458 m/s | SI (tam) |
| G | 6.67430×10⁻¹¹ m³ kg⁻¹ s⁻² | CODATA 2018 |
| GM_sun | 1.3271244×10²⁰ m³/s² | IAU 2015 Çözünürlük B3 (nominal, tam) |
| M_sun | GM_sun/G ≈ 1.98841×10³⁰ kg | türetilmiş (bilgi amaçlı; dönüşümlerde kullanılmaz) |

- Uzunluk birimi GM/c²: 1 M_sun için **1.476625 km**. Schwarzschild yarıçapı 2GM/c² = 2.953250 km. Zaman birimi GM/c³ = 4.92549×10⁻⁶ s.
- Dönüşümler GM_sun'ı doğrudan kullanır (G'nin belirsizliği girmez).
- `REFERENCE_MASSES` (Sgr A* ≈ 4.297×10⁶ M_sun, GRAVITY 2021; M87* ≈ 6.5×10⁹ M_sun, EHT 2019) **yaklaşıktır ve belirsizdir**; yalnızca bilgi ekranı içindir.
- **Doğrulama notu:** Sabitler ve gök cismi kütleleri bu oturumda internetten yeniden doğrulanmadı; bilinen yayımlanmış değerlerdir. Yayın öncesi kaynak tablolardan teyit edilmelidir.

## 4. Sayısal notlar ve sınırlamalar

1. **Yakın-ekstrem spin:** a = M'de `circularOrbitUt/Energy/AngularMomentum`, r → M yakınında radikandaki yuvarlama hatası (≈10⁻¹⁶ mutlak, radikand ∝ (r−M)²) yüzünden `RangeError` verebilir (örn. r − M ≲ 10⁻⁸). Bu bir tasarım sınırıdır; render için a ≤ 0.998 önerilir (Thorne 1974 sınırı).
2. **Küçük spin:** a < 10⁻⁸·M'de `shadowBoundary` Schwarzschild çemberine geçer (fiziksel sapma O(a) < 10⁻⁸). Küçük a'da η(r_ph) = 0 testinin yuvarlama gürültüsü (r_ph − 3M ~ a olduğundan mutlak hata büyür; ölçülen): a = 10⁻² → ~10⁻¹², 10⁻³ → ~10⁻¹¹, 10⁻⁶ → ~10⁻⁸, 10⁻⁷ → ~10⁻⁷. Yani η(r_ph) = 0 kontrolü a ≳ 10⁻³ için ≤ 10⁻¹⁰ doğrulukta geçerlidir; çok küçük (10⁻⁶ altı) a'da `criticalCurve` kullanan tüketiciler η < 0 küçük değerlerini 0'a kıstırmalıdır (`shadowBoundary` bunu zaten yapar).
3. `diskRedshiftFactor` ve dairesel yörünge fonksiyonları yalnızca **ekvator düzlemi** içindir (θ = π/2).
4. Gölge sınırı yalnızca **gölgenin** (kritik eğri) sınırıdır; ışın izleme (merceklenme, disk görüntüsü) için bu modül kullanılmamalıdır — ışın yolu entegrasyonu `src/math/` kapsamındadır.
5. Test dizini komutu: Node ≥ 21'de `node --test src/physics/` dizini dosya sanıp **çalışmaz**; `node --test` (package.json betiği) veya `node --test "src/physics/*.test.mjs"` kullanın.

## 5. Doğrulama özeti (kerr.test.mjs)

- a = 0: r₊ = 2M, r₋ = 0, r_ph = 3M, r_isco = 6M, Ω(6M) = 6^{−3/2}, gölge yarıçapı 3√3 M (tüm noktalar), staticRedshift(6M) = √(2/3), η_verim = 0.0572.
- a → M: r_isco → M / 9M, r_ph → M / 4M, ISCO verimi → 0.4226, kenardan gölge α ∈ [−2M, 7M], yüz yüze yarıçap 2(1+√2) M.
- a = 0.9: r₊ = 1.43589, r_isco = 2.32088 / 8.71735, r_ph = 1.55785 / 3.91027, η = 0.156; a = 0.5: r_isco = 4.233; a = 0.998: r_isco = 1.2370, η = 0.321 (BPT72, T74 tabloları).
- Bağımsız cebirsel koşullar (foton yörüngesi, ISCO), dE/dr = 0 (ISCO), E/L/u^t'nin metrikle tutarlılığı, Carter çift kökü, g_tt g_φφ − g_tφ² özdeşliği, M ölçeklemesi, asimptotik davranış, hata davranışı.
