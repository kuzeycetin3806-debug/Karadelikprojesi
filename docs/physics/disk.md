# İnce akresyon diski ışıma fiziği — Novikov–Thorne / Page–Thorne

Kod: `src/physics/disk.js` · Testler: `src/physics/disk.test.mjs` · Bağımlılık: `kerr.js` (ISCO, `circularOrbit*`), `units.js`.

**Birimler.** Boyutsuz/geometrik kısım: G = c = 1, uzunluk M cinsinden (kerr.md ile aynı). SI'ye geçilen yerler (sıcaklık, Planck) açıkça "SI" diye işaretlidir.
**Fiziksel / estetik ayrımı.** Bu belgedeki her şey **fiziksel**tir; tek istisna §5.3'teki gamut-dışı desaturasyondur (**gösterim kararı**). Bloom, ton eşleme, gama kodlaması, pozlama arayüz/grafik tarafındadır ve burada yoktur.

> Denklem numaraları (PT74 ~eq. 11, ~eq. 15n vb.) **belleğe dayalıdır, makaleden teyit edilmedi** (bu oturumda ağ erişimi onaylanmadı). Formüllerin kendisi ise makaleden bağımsız olarak, tanım integrali ve enerji korunumuna karşı sayısal doğrulandı (§7).

---

## 1. Page–Thorne yerel akısı — `pageThorneFluxHat`, `pageThorneFlux`

### 1.1 Model ve varsayımlar
Ekvatoral, geometrik olarak ince, optik olarak kalın, kararlı (stationary) disk; gaz ISCO'ya kadar kararlı dairesel yörüngelerde; iç sınırda **sıfır tork** (ISCO'da cisim "düşer"); her yüzey yerel olarak kara cisim; ISCO altında emisyon yok [NT73, PT74].

### 1.2 Tanım
Yayıcıyla birlikte dönen (comoving) çerçevede bir yüzün enerji akısı [PT74 ~eq. 11]:

```
F(r) = Ṁ f(r) / (4π r)
f(r) = (−Ω,r) (E − ΩL)⁻² ∫_{r_isco}^{r} (E − ΩL) L,r dr
```
E, L, Ω ekvatoral dairesel yörünge büyüklükleridir (kerr.md §2.7, [BPT72]). Ekvatorda `e^{ν+ψ+μ} = r` (testte `metricBL`'den: √(−det g₍t,r,φ₎) = r, 1e-12). Retrograd disk: a* → −a* (φ'yi çevirmek; ΩL, Ω,r L,r değişmez).

### 1.3 Kapalı form (x = √(r/M), x₀ = √(r_isco/M), a_s = ±a*)
```
f̂ = M f = 3 / (2 x² (x³ − 3x + 2a_s)) ·
      [ x − x₀ − (3/2) a_s ln(x/x₀) − Σ_{i=1..3} c_i ln((x − x_i)/(x₀ − x_i)) ]

c_i = 3 (x_i − a_s)² / [ x_i (x_i − x_j)(x_i − x_k) ]      (i,j,k döngüsel)

x₁ = 2cos[(arccos a_s − π)/3],  x₂ = 2cos[(arccos a_s + π)/3],  x₃ = −2cos[(arccos a_s)/3]   (x³ − 3x + 2a_s = 0 kökleri)
```
**Boyutsuz akı** (Ṁ = 1, M = 1): `F̂ = f̂ / (4π r̂)`, `r̂ = x²`. Genel: `F = Ṁ F̂(r/M, a/M) / M²` (`pageThorneFlux`).
a_s = 0'da x₂ = 0 ve c₂ → 0 (limit; kodda x_i = 0 ise c_i = 0).

**SI'ye çeviri:** `F_SI [W/m²] = Ṁ_SI c² · F̂ / r_g²`, `r_g = GM/c²`.

### 1.4 Alan elemanı ve enerji bütçesi (∫F dA)
Disk worldtube'u (t, r, φ) üzerindeki indüklenen 3-metrikten `dτ dA = r dt dr dφ` ⇒ **comoving alan elemanı `dA = r uᵗ dr dφ`** (Schwarzschild'de = γ r dr dφ/√(1−2/r); testte doğrulandı). İki yüz için sonsuzdaki güç:

```
dL∞/dr = 2 · F · E · (dA/dr dφ)(dτ/dt) · 2π = 4π r E F dr          (E = −u_t: yerel enerji → sonsuzdaki enerji)
L∞ = Ṁ ∫ f E dr  = Ṁ (1 − E_isco),   E_isco = √(1 − 2/(3 r̂_isco))   [BPT72]
```
Yani **bağlanma enerjisinin η = 1 − E_isco kadarı ışınım olarak kaçar**, geri kalanı (E_isco) deliğe girer (geri dönen/yakalanan ışınım ihmal). Yerel çerçevede toplanan güç `L_yerel = Ṁ ∫ f dr` (E ağırlığı yok) L∞'dan **büyüktür** (kırmızıya kayma/bağlanma).

| a* | r_isco/M | η = 1−E_isco | ∫f E dr (kod) | ∫f dr (yerel) |
|---|---|---|---|---|
| 0 | 6 | 0.057191 | 0.057191 | 0.058287 |
| 0.9 | 2.3209 | 0.155753 | 0.155753 | 0.164582 |
| 0.998 | 1.2370 | 0.320994 | 0.320994 | 0.365629 |
| 0.9 retro | 8.7174 | 0.038998 | 0.038998 | 0.039500 |

### 1.5 Limitler
- **r ≫ r_isco, a = 0:** `F̂ → 3(1 − √(r_isco/r)) / (8π r³)` (Shakura–Sunyaev göreli olmayan limit [SS73]). Ölçülen sapma ≈ −1.5/√r: r = 10²: −13.6 %, 10⁴: −1.5 %, 10⁶: −0.15 %. (Bu O(r⁻¹ᐟ²) fark, GR'de ∫(E−ΩL)L,r integraline gelen sabit katkıdır; hata değildir.)
- **ISCO'da** `F = 0`, ve `F ∝ (r − r_isco)²` (integrand L,r ∝ (r − r_isco) olduğu için).
- r ≤ r_isco → 0 döner (hata fırlatmaz: "ISCO altında emisyon yok").

### 1.6 Sayısal not ve sınırlar
- Kapalı form f64'te ISCO yakınında iptal hatasına açıktır (r/r_isco = 1.0001'de ~5·10⁻⁸ bağıl); x − x₀ < 2·10⁻³ x₀ için kodda tek-panel 16-nokta Gauss–Legendre yedeği kullanılır. İki yol çakışır: ~1e-11 bağıl.
- **Prograd a* ≤ 0.9999** desteklenir (a* → 1'de x₁ → x₂ ve r_isco → r₊; kapalı form tekil). a* = 1 prograd → `RangeError`. Retrograd a* = 1 serbest. Thorne sınırı a* = 0.998 [T74].
- **float32 (GLSL) emülasyonu** (her işlem `Math.fround`, katsayılar f64'ten gelir), `|F32/F64 − 1|`:

| r/r_isco | 1.001 | 1.01 | 1.05 | 1.1 | 1.3 | 2 | 10 |
|---|---|---|---|---|---|---|---|
| a=0 | 6.5e-2 | 8.4e-4 | 6.8e-6 | 1.1e-5 | 6.5e-7 | 3.8e-8 | 2.6e-8 |
| a=0.9 | 3.7e-2 | 5.5e-4 | 7.4e-6 | 1.1e-5 | 1.9e-6 | 1.8e-7 | 5.4e-8 |
| a=0.998 | 1.0e-1 | 1.2e-4 | 7.5e-6 | 1.4e-6 | 2.8e-6 | 1.2e-7 | 2.7e-7 |
| a=0.9 retro | 4.8e-2 | 2.7e-4 | 1.4e-5 | 5.3e-6 | 1.8e-6 | 9.9e-8 | 3.3e-7 |

  Hata yalnızca ISCO'nun hemen yanında büyür; orada T/T_max ≲ 0.1 (F ∝ ε²) olduğundan görüntüde fark edilmez. Yine de en güvenli yol §6'daki tablodur.

---

## 2. Sıcaklık profili ve T_max konumu — `diskTemperatureProfile`, `diskTemperaturePeak`

Yerel kara cisim: `σ T_eff⁴ = F` ⇒ `T(r)/T_max = (F(r)/F_max)^{1/4}` (0 ≤ değer ≤ 1; `r ≤ r_isco` → 0).
`T_max` konumu = `F` maksimumu (log-ızgara + altın oran; önbellekli).

| a* (prograd) | r_isco/M | r_tepe/M | r_tepe/r_isco | F̂_max |
|---|---|---|---|---|
| 0 | 6 | **9.5509** | 1.592 | 1.3678e-5 |
| 0.5 | 4.2330 | 6.6151 | 1.563 | 4.2645e-5 |
| 0.9 | 2.3209 | 3.4418 | 1.483 | 3.3923e-4 |
| 0.998 | 1.2370 | 1.5812 | 1.278 | 4.7816e-3 |
| 0.9 retro | 8.7174 | 14.080 | 1.615 | 4.1664e-6 |

**a = 0 için tepe r ≈ 9.55 M** — kendim türettim (kod + bağımsız ince-ızgara kuadratür taraması, ±2·10⁻³ M uyum). Göreli olmayan SS formülünün tepesi `F ∝ r⁻³(1 − √(r₀/r))` ⇒ `r = (49/36) r₀ = 8.17 M` olur; **GR tepesi bundan ~1.4 M dışarıdadır** (görevde geçen "≈ 8.2 M" Newton değeridir). Bu değeri bir literatür değeriyle karşılaştırmadım (kaynağa erişilemedi); doğrulama türetmenin iç tutarlılığına ve SS limitine dayanır.

---

## 3. Mutlak sıcaklık ölçeği — `diskMaxTemperatureK`

```
L_Edd = 4π G M m_p c / σ_T = 1.2571×10³¹ W (M/M☉)   (= 1.26×10³⁸ erg/s; saf H, Thomson)
Ṁ     = ṁ L_Edd / (η c²),    ṁ ≡ L_disk/L_Edd,  η = η(a, yön) = 1 − E_isco
σ T_max⁴ = Ṁ c² F̂_max / r_g²   ⇒   T_max = [ ṁ L_Edd F̂_max / (η σ r_g²) ]^{1/4}  ∝ (ṁ/M)^{1/4}
```
Bu tanımla diskin sonsuzdaki toplam gücü **tam** `ṁ L_Edd`'dir (testte `∫4π r E σT⁴ dr` ile SI'de 10⁻⁵ içinde doğrulandı). *Ṁ_Edd'in tanımı kaynaklara göre değişir (sabit η = 0.1 yaygın); burada η(a) kullanılır.*

Örnekler (kodla hesaplandı, T_eff): 10 M☉, ṁ=0.1, a=0 → 3.95×10⁶ K (kT≈0.34 keV); a=0.9 → 6.86×10⁶ K. 10⁸ M☉, ṁ=0.1, a=0 → 7.0×10⁴ K.

**Arayüzde doğrudan T_max:** profil `T(r) = T_max · diskTemperatureProfile(...)` olduğundan kullanıcı `T_max`'ı doğrudan seçebilir; (M, ṁ) yalnızca `T_max`'ı hesaplayan bir kısayoldur.

**Geçerlilik.** `thinDiskValidityWarning(ṁ)`: ṁ ≲ 0.01 (RIAF) ve ṁ ≳ 0.3 (slim/kalın disk) için uyarı döner (eşikler **yaklaşıktır**). **Sgr A\* ve M87\*** bu rejimlerdedir (ışıma ≪ 10⁻² L_Edd, geometrik olarak kalın, radyatif olarak verimsiz akış; EHT görüntüsü sinkrotron ışımalı sıcak plazmadır). Onlara ince-disk sıcaklığı formülünü uygulamak fiziksel değildir; görsel amaçla yapılacaksa `T_max` doğrudan seçilmeli ve "sanatsal" diye işaretlenmelidir. (Formül mekanik olarak çalışır: 4.3×10⁶ M☉, ṁ=10⁻⁸ → ~2.7×10³ K — sayı anlamlı bir tahmin değildir.)

**Renk düzeltmesi (isteğe bağlı):** gerçek atmosferler saçılma yüzünden "değiştirilmiş kara cisim" verir: `T_col = f_col T_eff`, `I_ν = f_col⁻⁴ B_ν(f_col T_eff)` (bolometrik akı korunur). Stellar kütle BH'lerde f_col ≈ 1.7 [SH95] (AGN için fark: daha karmaşık). Varsayılan `fCol = 1`.

---

## 4. Gözlenen ışıma — Liouville, g³ mü g⁴ mü?

### 4.1 Türetme
Boş uzayda/geodezik boyunca I_ν/ν³ korunur (Liouville; faz-uzayı yoğunluğu invaryantı). Yayıcıda ν_em, gözlemcide ν_obs = g ν_em:

```
I_ν,obs(ν_obs) / ν_obs³ = I_ν,em(ν_em) / ν_em³   ⇒   I_ν,obs(ν) = g³ I_ν,em(ν/g)
```
**Kara cisim** `I_ν,em = B_ν(T) = (2hν³/c²)/(e^{hν/kT} − 1)` için:

```
g³ B_ν(ν/g; T) = g³ · 2h(ν/g)³/c² / (e^{hν/(g k T)} − 1) = (2hν³/c²)/(e^{hν/(k·gT)} − 1) = B_ν(ν; g T)
```
**⇒ Gözlenen spektrum tam olarak T_obs = g·T sıcaklıklı kara cisimdir** (ekstra g çarpanı yok). `dν = g dν_em` olduğundan bolometrik:

```
I_bol,obs = ∫ B_ν(gT) dν = σ (gT)⁴/π = g⁴ σ T⁴/π
```
(Testler: `g³B_ν(ν/g;T) ≡ B_ν(gT)` 1e-12; sayısal ∫ = g⁴σT⁴/π 1e-6.) f_col ile: `I_ν,obs = f_col⁻⁴ B_ν(g f_col T_eff)`, `I_bol,obs = g⁴ σ T_eff⁴/π` (f_col bolometrikte kaybolur).

### 4.2 Karmaşanın çözümü
- **g³**, *aynı fotonların* karşılaştırmasıdır: gözlenen ν'deki yoğunluk, yayılan **ν/g**'deki yoğunluğun g³ katıdır. Sabit bir ν'de "I_obs = g³ I_em" **yazılamaz**; kara cisim için sonuç zaten `B_ν(gT)`'dir.
- **g⁴**, **tüm frekanslar üzerinden integre** (bolometrik) yoğunluktur: `I_bol,obs = g⁴ I_bol,em`. Sezgisel okuma: g (foton enerjisi) · g (foton varış hızı) · g² (görünür solid açı) = g⁴.
- **Bir kameranın/gözün gördüğü band luminansı ikisi de değildir:** `Y_obs = ∫B_ν(gT) ȳ dν = Y(g T)`. Rayleigh–Jeans (T_obs ≫ 2.6×10⁴ K; yıldız kütleli BH diskleri!) `Y ∝ T_obs ∝ g`; Wien kuyruğunda (T_obs ≪ 5×10³ K) `Y ∝ exp(−c₂/(λ T_obs))` çok dik.

### 4.3 Grafik için kural (net)
| Büyüklük | Nereden |
|---|---|
| **Renk (kromatisite)** | `T_obs = g · f_col · T_eff` → `blackbodyLUT` (RGB, Y = 1) |
| **Parlaklık, mod A ("bolometrik", varsayılan)** | `g⁴ · (T_eff/T_max)⁴ = g⁴ F/F_max` (f_col kaybolur) × kromatisite × pozlama |
| **Parlaklık, mod B ("band / katı fotometrik")** | `f_col⁻⁴ · Y(T_obs)/Y_ref` , `Y_ref = Y(f_col T_max)` (LUT'un 4. kanalı log₁₀Y) |

**Mod A ve B aynı gösterim değildir.** A: "enerjiyi" gösterir ve T_obs'tan bağımsız olarak g⁴ verir (sıcak/soğuk tarafın kontrastı **abartılıdır** ya da eksik, çünkü gözün duyarlılığı göz ardı edilir); B: gerçek bir görünür-band kamera/göz modelidir. Mod B'de g³ **ya da** g⁴ ayrıca uygulanmaz; tüm g bağımlılığı `Y(gT)` içindedir (g'yi iki kez saymayın). Seçim estetik/bilimsel taahhüt meselesidir; fiziksel olarak doğru olan B'dir (band için), A bolometrik bir kameradır.

`g` olarak **`hit.gCam`** (sonlu uzaklıktaki kamerayı da içeren ν_cam/ν_em; src/math/README.md) kullanılmalıdır; `hit.g` sonsuzdaki gözlemciye aittir.

---

## 5. Kara cisim → doğrusal sRGB — `blackbodyToLinearSRGB`

### 5.1 Hesap
1. Planck `B_λ(T) = 2hc²/λ⁵ /(e^{hc/(λkT)} − 1)` (SI: h, k_B, c SI-2019 tam).
2. `X, Y, Z = ∫ B_λ {x̄, ȳ, z̄}(λ) dλ`, λ = 360…830 nm, 1 nm adım. Birim W m⁻² sr⁻¹ (K_m = 683 lm/W çarpılmaz).
3. CMF: **Wyman, Sloan & Shirley 2013** çok-loblu Gauss (JCGT 2(2)) [W13] — kodda `cieXYZBarWyman`:
   `x̄ = 1.056 g(599.8;37.9,31.0) + 0.362 g(442.0;16.0,26.7) − 0.065 g(501.1;20.4,26.2)`, `ȳ = 0.821 g(568.8;46.9,40.5) + 0.286 g(530.9;16.3,31.1)`, `z̄ = 1.217 g(437.0;11.8,36.0) + 0.681 g(459.0;26.0,13.8)`; `g(λ;μ,σ₁,σ₂) = exp(−½((λ−μ)/σ)²)`, σ = σ₁ (λ<μ), σ₂ (λ≥μ).
   *Katsayılar belleğe dayalıdır, makaleden teyit edilmedi.*
4. XYZ → doğrusal sRGB (D65) [IEC 61966-2-1]: `R = 3.2404542X − 1.5371385Y − 0.4985314Z`, `G = −0.9692660X + 1.8760108Y + 0.0415560Z`, `B = 0.0556434X − 0.2040259Y + 1.0572252Z`.
5. **Renklilik ve parlaklık ayrı döner:** `rgb` Y = 1'e normalize (Y = 0.2126729R + 0.7151522G + 0.0721750B), `luminance` = Y (W m⁻² sr⁻¹). `rgb` HDR'dır (bileşenler 1'i aşabilir, örn. 1000 K'de R≈4); sRGB gama kodlaması **uygulanmaz** (arayüz/ton eşleme).

### 5.2 Doğruluk
- **Planck eğrisi (xy):** bağımsız kontrol olarak Kim vd. 2002 polinom yaklaşımı (belleğe dayalı katsayılar) ile 4000–25000 K'de |Δxy| ≤ 7×10⁻⁴ (6504 K'de 7×10⁻⁵). Bu, Planck + Wyman + xy zincirinin tutarlı olduğunu gösterir (ve katsayı hatası olmadığını güçlü biçimde ima eder).
- **6504 K:** xy = (0.3134, 0.3237); D65 = (0.3127, 0.3290). Planck eğrisi D65'in ~0.005 altındadır (Δuv ≈ 0.003, beklenen); doğrusal RGB = (1.042, 0.984, 1.035) — beyazdan ≲ %4. 
- **Wyman fit ↔ tam CIE 1931 tablosu: ÖLÇÜLEMEDİ.** Resmi tablo (CVRL) indirmek için ağ erişimi onaylanmadı; depoda CIE tablosu yok. Yapılan dolaylı kontroller: (i) ∫x̄ = 106.77, ∫ȳ = 106.92, ∫z̄ = 106.88 (CIE ≈ 106.86; belleğe dayalı) → eşit-enerji beyazı xy = (0.333, 0.333) ±10⁻³; (ii) ȳ(555) = 0.998; (iii) Planck eğrisi karşılaştırması (yukarıda). Belleğe dayalı birkaç nokta (örn. x̄(555) 0.517 vs ~0.512, x̄(600) 1.056 vs ~1.062) ~%1 farkı gösteriyor; bunlar **teyit edilmemiş** sayılardır. [W13] kendi makalesinde fit hatasının görsel olarak ihmal edilebilir olduğunu söyler. **Açık iş:** tam tabloyla tek seferlik fark ölçümü (örn. `tools/` altında) — bkz. §8.

### 5.3 Gamut-dışı (GÖSTERİM kararı)
Planck eğrisi sRGB üçgeninin dışına yalnızca düşük T'de (≈ 1900 K altı, **B < 0**) çıkar; 3000 K ve üstünde bileşenler pozitiftir (testle: desaturasyon 3000…10⁵ K'de tam 0). Negatif bileşen varsa **aynı luminanstaki griye (1,1,1)** doğru en küçük t kadar karıştırılır: `rgb' = rgb + t(1 − rgb)`, `t = max_i(−rgb_i/(1 − rgb_i))` (rgb_i<0). Luminans korunur (Y(1,1,1) = 1). `t` döner (`desaturation`): 1000 K'de 0.087, 1900 K'de 0.0016. Kırpma (clip) kullanılmaz çünkü ton/luminansı bozar. Pozitif taraftaki 1'i aşan değerler **kırpılmaz** (HDR).

### 5.4 GPU tablosu — `blackbodyLUT(N=256)`
Log₁₀T'ye göre eşit aralıklı (1000…10⁵ K, uçlar dahil), `Float32Array(4N)`: satır i = `[R, G, B, log₁₀Y]` (RGB Y=1, Y: W m⁻² sr⁻¹). Koordinat `u = (log₁₀T − 3)/2`; texel merkezi `(u(N−1) + 0.5)/N`.

**Ölçülen tablo hatası** (2001 log-T noktası, doğrudan integrale karşı, doğrusal enterpolasyon):

| N | max \|ΔRGB\| (Y=1) | max \|Δlog₁₀Y\| |
|---|---|---|
| 256 | 1.6×10⁻³ (1905 K'de, R≈2.6 → %0.06 bağıl) | 3.7×10⁻⁴ (%0.09 luminans) |
| 128 | 2.9×10⁻³ | 1.5×10⁻³ |

**Aralık dışı kurallar** (T_obs ∈ [10³, 10⁵] K dışı; yıldız kütleli disklerde T_obs ~10⁶–10⁷ K olur!):
- **T > 10⁵ K:** kromatisite 10⁵ K değerine kıstırılır (Rayleigh–Jeans sınırına yakınsıyor: 10⁵ → 10⁷ K'de rgb (0.681, 0.978, 2.160) → (0.667, 0.975, 2.229), ≲ %3). Luminans için **`blackbodyLuminanceSeries(T)`** = αT − β + γ/T (RJ genişlemesi; 10⁵ K'de tam integralle < 2×10⁻³, 10⁶ K'de < 10⁻⁵, 10⁷ K'de < 10⁻⁶). (Basit `Y ∝ T` ekstrapolasyonu 10⁵ K'nin üstünde %9'dan %14'e kadar yanılır — kullanmayın.)
- **T < 10³ K:** kromatisite 1000 K değerine kıstırılır (koyu kırmızı). Luminans Wien yasasıyla düşer: `ln Y ≈ ln Y(1000 K) − 2.3×10⁴ K (1/T − 1/1000 K)` (800 K'de Y≈3·10⁻³ Y(1000K), 600 K'de ~2.5×10⁻⁷; 600 K'ye kadar katsayı ±%30). Pratikte `Y→0`: gölgelendirici `smoothstep` ile sönümleyebilir.

---

## 6. GPU'ya taşınacak fonksiyonlar (özet)

**CPU (JS, f64) → doku/uniform:**

| Veri | Üretici | Biçim | Boyut | Ne zaman |
|---|---|---|---|---|
| T/T_max profili | `diskProfileTable(a*, prograde, rOut, 256)` | 1D doku, tek kanal, R32F (veya R16F + LINEAR) | 256 float (1 KB) | a, yön, r_out değişince |
| Kara cisim rengi | `blackbodyLUT(256)` | 1D doku RGBA32F | 256×4 float (4 KB) | bir kez |
| (alternatif) kapalı form | `pageThorneClosedFormCoefficients(a*, prograde)` | 8 uniform: `aS, x0, x1, x2, x3, c1, c2, c3` | 8 float | a, yön değişince |
| Ölçek | `diskMaxTemperatureK(...)` veya kullanıcı | `uniform float uTmax` (K), `uFcol`, `uExposure`, `uMode` | 4 float | UI |
| Yüksek-T luminans (mod B) | `blackbodyLuminanceSeries` katsayıları α, β, γ | 3 uniform | | bir kez (JS'ten dışa vermek gerekirse isteyin) |

Gerekirse RGBA32F + `LINEAR` filtre mobilde `OES_texture_float_linear` gerektirir → **NEAREST + elle `mix`** (güvenli) veya RGBA16F (log₁₀Y için ~0.01 mutlak hata, ~%2 luminans; mod A'da sorun değil).

**GLSL (piksel başına, disk çarpmasında; r̂ = hit.r/M, g = hit.gCam):**
```glsl
// 1) profil tablosu (s-eşlemesi ISCO'daki √ tekilliğini düzleştirir)
float s   = sqrt(clamp((rHat - uRIn) / (uROut - uRIn), 0.0, 1.0));   // rHat<uRIn → emisyon yok (discard)
float tau = tableLerp(uProfile, s * (N - 1.0));                        // T_eff / T_max
float Teff = uTmax * tau;
// 2) gözlenen sıcaklık (Liouville): renk g·f_col·Teff'ten
float Tobs = g * uFcol * Teff;
// 3) renk (kromatisite, Y=1) + log10 Y
float u = clamp((log(Tobs)/log(10.0) - 3.0) * 0.5, 0.0, 1.0) * (Nlut - 1.0);
vec4 c = lutLerp(uBB, u);                       // c.rgb: Y=1, c.a: log10 Y
// 4) parlaklık
float Ibol = pow(g, 4.0) * pow(tau, 4.0);       // mod A: g^4 F/F_max   (g^3 AYRICA UYGULANMAZ)
vec3 col = (uMode == 0) ? c.rgb * Ibol * uExposure
                        : c.rgb * pow(10.0, c.a - uLog10Yref) * pow(uFcol, -4.0) * uExposure;
```
`uLog10Yref` = `log10 Y(f_col T_max)` (CPU'da hesaplanır). T_obs LUT dışındaysa §5.4'teki kurallar. Gama kodlaması/ton eşleme **estetik** aşamadır.

**Alternatif — kapalı form GLSL** (tablo yerine): `x = sqrt(rHat)`; `br = x - x0 - 1.5*aS*log(x/x0) - c1*log((x-x1)/(x0-x1)) - c2*log((x-x2)/(x0-x2)) - c3*log((x-x3)/(x0-x3))`; `F̂ = 1.5/(x*x*(x*x*x - 3.0*x + 2.0*aS)) * br / (4π rHat)`; sonra `tau = pow(F̂/F̂max, 0.25)` (`F̂max` = `diskPeakHat(a*).fluxHat` uniform'u). float32 hatası §1.6. Önerim: **tablo** (kenar durumlarda sağlam, ISCO yakınında dalgalanma yok).

---

## 7. Doğrulama özeti (disk.test.mjs, 23 test)
- PT kökleri: kalıntı ≤ 1e-13; toplam 0, çarpım −2a.
- Kapalı form ≡ tanım integrali (bağımsız Gauss–Legendre, 7 (a, yön) × 6 yarıçap): bağıl ≤ 2e-9. kerr.js `circularOrbit*` + sonlu-fark dL/dr + Simpson ile tamamen bağımsız integral: ≤ 1e-5.
- ISCO: F = 0, kuadratik yaklaşma (oran 4 ± %2). SS limiti (a=0): sapma < 2/√r, 10²…10⁶'da monoton azalır.
- Enerji korunumu: ∫2F E dA(dτ/dt) = 1 − E_isco, 1e-6 (a = 0, 0.5, 0.9, 0.998, retro 0.7); `etaLocal > etaInf`.
- Uçtan uca SI: ∫4π r E σT⁴ dr = ṁ L_Edd, 1e-5 (3 durum).
- T_max: a=0 → 9.5509 M, bağımsız tarama ±2e-3; tepe a ile içeri ve daha sıcak.
- Liouville g³B_ν(ν/g) = B_ν(gT): 1e-12; bolometrik 1e-6.
- Renk: 6504 K ≈ D65; B/R T ile monoton; Y = 1; negatif bileşen yok; Kim polinomu ≤ 2e-3 (ölçülen 7e-4); LUT hataları §5.4.

## 8. Sınırlamalar ve açık sorular
1. **İnce, optik olarak kalın disk** (H/R ≪ 1). ṁ ≲ 0.01 (RIAF) veya ≳ 0.3 (slim) geçersiz; Sgr A\*/M87\* için geçersiz (§3).
2. **ISCO altında emisyon yok** ve sıfır tork: gerçek (MHD) disklerde ISCO içinde de ışıma/tork vardır (örn. Noble vd.; kesin sayı vermiyorum). Novikov–Thorne verimin alt sınırı gibi düşünülmeli.
3. **Geri dönen ışınım (returning radiation)** ve ufka düşen/yakalanan ışınım ihmal edilmiştir (bu yüzden L∞ = ṁL_Edd tam). Yüksek spinde (a* ≳ 0.9) önemli olabilir [Cunningham 1975].
4. **Kara cisim varsayımı:** gerçek spektrum f_col ≈ 1.7 [SH95] ile "değiştirilmiş kara cisim"; limb darkening ve polarizasyon yok (yerel yayılım izotropik; yüzey normaline göre açı bağımlılığı yok).
5. **Kamera uzaklığı:** g için `hit.gCam` (src/math/README.md).
6. **Wyman ↔ tam CIE farkı ölçülmedi** (ağ yok). Açık iş: CVRL `ciexyz31_1.csv` indirilip bir araç (`tools/`) ile fark ölçülmeli; fark ≳ %2 çıkarsa LUT doğrudan tam tabloyla üretilebilir (API değişmez).
7. **PT74 denklem numaraları teyit edilmedi** (formül sayısal doğrulandı). Sabitler m_p, σ_T (CODATA 2018) ağdan teyit edilmedi (units.js ile aynı not); L_Edd 1.257×10³¹ W beklenen 1.26×10³⁸ erg/s ile uyumlu.
8. **a* → 1 prograd (> 0.9999)** desteklenmez; `a* = 1` prograd için `RangeError`.
9. Retrograd disk ile ters dönen delik aynı fiziktir; `prograde=false` + `a>0` kullanılır.

## Kaynaklar
[PT74] Page & Thorne 1974, ApJ 191, 499 · [NT73] Novikov & Thorne 1973, *Black Holes (Les Houches 1972)* · [SS73] Shakura & Sunyaev 1973, A&A 24, 337 · [BPT72] Bardeen, Press & Teukolsky 1972, ApJ 178, 347 · [T74] Thorne 1974, ApJ 191, 507 · [SH95] Shimura & Takahara 1995, ApJ 445, 780 · [W13] Wyman, Sloan & Shirley 2013, JCGT 2(2), 1–11 · [Cunningham 1975] ApJ 202, 788 · CIE 1931 2° standart gözlemci · IEC 61966-2-1 (sRGB).
