# Yarı-klasik kuantum kara delik fiziği

Kod: `src/physics/quantum.js` — Testler: `src/physics/quantum.test.mjs` (`npm test`)

## 1. Konvansiyonlar

| Konu | Seçim |
|---|---|
| Birimler | Çıktılar **SI** (K, J/K, m, s, W, yıl). Kütle argümanı **güneş kütlesi M☉**. Geometrik kısım (G = c = 1, uzunluk M) yalnızca `surfaceGravityGeom` içindedir (κ̂, M⁻¹ biriminde). |
| Kütle dönüşümü | G·M = `massSolar` · `GM_SUN` (units.js, IAU 2015 B3 nominal). T_H yalnızca G·M'e bağlıdır, bu yüzden G'nin belirsizliği (~2×10⁻⁵) T_H'ye girmez; S ve buharlaşma süresi G'ye ayrıca bağlıdır (CODATA 2018 G). |
| Spin | `aStar = a/M ∈ [0, 1]`. `aStar = 1` (ekstremal) kabul edilir: T = 0. Negatif spin yok. Prograd/retrograd ayrımı bu modülde yok (T, S yalnızca r± ve a'ya bağlı). |
| Hata | Kütle ≤ 0, sonlu olmayan sayı, `aStar ∉ [0,1]` → `RangeError`. `hawkingPeakWavelengthM(m, 1)` de `RangeError` (λ = ∞). |
| Fiziksel / estetik | Bu modülde yalnızca **fiziksel** büyüklükler vardır; estetik etki yoktur. |

Sabitler (`PHYSICAL_CONSTANTS`, anahtarlar: `hbar, kB, sigma, G, c`):

| Sabit | Değer | Not |
|---|---|---|
| c | 299 792 458 m/s | tam (SI 2019) |
| h | 6.626 070 15×10⁻³⁴ J s | tam; ħ = h/2π = 1.054 571 817×10⁻³⁴ J s |
| k_B | 1.380 649×10⁻²³ J/K | tam |
| σ | 5.670 374 419×10⁻⁸ W m⁻² K⁻⁴ | 2π⁵k_B⁴/(15h³c²) formülünden türetilir |
| G | 6.674 30×10⁻¹¹ m³ kg⁻¹ s⁻² | CODATA 2018 (bağıl belirsizlik 2.2×10⁻⁵) |
| b (Wien) | 2.897 771 955×10⁻³ m K | CODATA 2018 |
| T_CMB | 2.7255 K | Fixsen 2009 (±0.0006 K) |

Bu sabitler bu oturumda ağdan yeniden doğrulanmadı (ağ erişimi yoktu); tam-tanımlı SI 2019 değerleri ve CODATA 2018 önerilen değerleri bilgiden yazılmıştır. Planck birimleri bu sabitlerden hesaplanıp bilinen CODATA 2018 değerleriyle (≤ 2×10⁻⁶ göreli) karşılaştırılmıştır (testte).

## 2. Formüller

**Kaynaklar:** [H74] Hawking 1974, Nature 248, 30 · [H75] Hawking 1975, Commun. Math. Phys. 43, 199 · [B73] Bekenstein 1973, Phys. Rev. D 7, 2333 · [BCH73] Bardeen, Carter & Hawking 1973, Commun. Math. Phys. 31, 161 · [P76] Page 1976, Phys. Rev. D 13, 198 · [Is86] Israel 1986, Phys. Rev. Lett. 57, 397 (üçüncü yasa).

### 2.1 Yüzey çekimi — `surfaceGravityGeom(aStar)` [BCH73]

κ̂ = (r₊ − r₋) / (2 (r₊² + a²))  (M = 1; r± kerr.js `horizonRadii` ile). Eşdeğer: κ̂ = √(1 − a*²) / (2 r₊).
SI: κ = κ̂ c³ / (G M). a = 0: κ̂ = 1/4. a* → 1: κ̂ → 0 (a* = 0.998: κ̂ = 0.0297).

### 2.2 Hawking sıcaklığı — `hawkingTemperatureK(massSolar, aStar)` [H75]

T_H = ħ κ / (2π c k_B) = ħ c³ κ̂ / (2π k_B G M)

- Schwarzschild: T_H = ħ c³ / (8π G M k_B) ≈ 6.17×10⁻⁸ K · (M☉/M).
- T ∝ 1/M. Kerr: T(a*)/T(0) = 4 κ̂(a*) (monoton azalır); ekstremal a* = 1'de T = 0 (üçüncü yasa ile uyumlu: κ = 0'a sonlu işlemle ulaşılamaz [Is86]).

### 2.3 Entropi — `bekensteinHawkingEntropy(massSolar, aStar)` [B73, H75]

S = k_B A c³ / (4 G ħ) = k_B A / (4 ℓ_P²),  A = 4π (r₊² + a²) (GM/c²)²  (r₊, a: M biriminde)

S/k_B = π (r̂₊² + a*²) G M² / (ħ c). Schwarzschild, 1 M☉: ≈ 1.05×10⁷⁷ k_B (≈ 1.45×10⁵⁴ J/K). S ∝ M²; a* → 1'de S, Schwarzschild değerinin yarısına iner (A_ekstremal = 4π·2 M² = A_Schw/2).
Dönüş: `{ S_over_kB, S_JK }`.

### 2.4 Birinci yasa

dM c² = T dS + Ω_H dJ [BCH73]. Testte (i) Schwarzschild için dM c² = T dS, (ii) Kerr için sabit J altında (a* = a₀ (M₀/M)²) dM c² = T dS sayısal olarak doğrulanır (göreli hata ≲ 10⁻⁶).

### 2.5 Tepe dalga boyu — `hawkingPeakWavelengthM`

λ_max = b / T_H (Wien; **kara cisim varsayımı**). 1 M☉: ≈ 47 km (r_s = 2.95 km'nin ~16 katı; Hawking dalga boyu ufuk boyutunu aşar).
**Uyarı:** Gerçek Hawking spektrumu kara cisim değil **gri-cisimdir**: her parçacık türü (spin s) için Planck dağılımı, deliğin o frekans ve açısal momentumdaki soğurma olasılığı Γ_s(ω, ℓ) ile çarpılır [H75, P76]. Düşük frekanslar (λ ≳ r_s) güçlü biçimde bastırılır; tepe konumu ve toplam güç kara cisim değerinden sapar. Kerr'de ayrıca (ω − mΩ_H) terimi ve süperradyans girer. Bu değer yalnızca **mertebe göstergesidir**.

### 2.6 Işıma gücü — `hawkingLuminosityW`

L = A σ T⁴ = ħ c⁶ / (15360 π G² M²),  A = 16π (GM/c²)².  1 M☉: ≈ 9.0×10⁻²⁹ W.
Stefan–Boltzmann kara cisim yaklaşımıdır; yalnızca mertebe. Gri-cisim etkisi iki yönlüdür: düşük frekanslarda soğurma olasılığı Γ_s küçüktür (güç bastırılır), yüksek frekanslarda ise yakalama kesiti 27π M² (foton küresi, b_c = 3√3 M) kara cisim alanı 16π M²'den büyüktür (güç ~27/16 oranında artabilir). Ayrıca nötrino ve graviton gibi ek türler toplamı artırır. Bu yüzden gerçek toplam gücün kara cisim değerinden küçük mü büyük mü olduğu burada kesin olarak söylenmez; belirsizlik birkaç katlıdır (Page 1976 sayıları bu oturumda doğrulanamadı).

### 2.7 Buharlaşma süresi — `evaporationTimeS`

Basit tahmin (yalnız foton, kara cisim): dM/dt = −L/c² ⇒ t = 5120 π G² M³ / (ħ c⁴) ≈ 8.41×10⁻¹⁷ s · (M/kg)³; 1 M☉ ≈ 2.1×10⁶⁷ yıl. t ∝ M³.
Page (1976) düzeltmesi: gri-cisim faktörleri + nötrino + graviton kanalları süreyi basit tahmine göre **birkaç kat kısaltır** (mertebe aynı kalır; M ≳ 10¹⁷ g için). Doğru katsayı bu oturumda kaynaktan teyit edilemediği için koda **konmadı**; `assumptions` alanında belirtilir. Ayrıca M ≲ 10¹⁷ g'de elektron/pozitron ve ağır türler devreye girer; Page'in sonucu bu aralıkta kütleye bağlı bir çarpan içerir.
Evrenin yaşı ≈ 1.38×10¹⁰ yıl olduğundan, ömrü evren yaşına eşit olan (basit formülle) delik ~ 1.7×10¹¹ kg (Page ile birkaç ×10¹¹ kg) mertebesindedir.

### 2.8 CMB denge kütlesi — `cmbEquilibriumMassSolar`

T_H = T_CMB ⇒ M = ħ c³ / (8π G k_B T_CMB) ≈ 4.5×10²² kg ≈ 2.26×10⁻⁸ M☉ ≈ Ay kütlesinin ~%61'i (Ay: 7.342×10²² kg). Bundan büyük delikler CMB'den daha soğuktur; ışıdıklarından fazlasını soğurur ve (başka kütle girişi olmasa bile) büyür. CMB sıcaklığı evrenin genişlemesiyle düştükçe eşik kütle de küçülür.

### 2.9 Planck birimleri — `planckUnits` [CODATA 2018]

ℓ_P = √(ħG/c³) = 1.616255×10⁻³⁵ m · t_P = ℓ_P/c = 5.391247×10⁻⁴⁴ s · m_P = √(ħc/G) = 2.176434×10⁻⁸ kg · T_P = m_P c²/k_B = 1.416784×10³² K.

## 3. Doğrulama (npm test → `quantum.test.mjs`, 15 test)

| Kontrol | Sonuç |
|---|---|
| T_H(1 M☉, a=0) | 6.1703×10⁻⁸ K (doğrudan SI formülüyle 10⁻¹² içinde aynı) |
| T ∝ 1/M (Schwarzschild ve Kerr) | 10⁻¹³ içinde |
| κ̂(0) = 1/4; κ̂ = √(1−a²)/(2r₊); monoton azalış; a→1 → 0 | geçti |
| Ekstremal: T(a=1) = 0; T(a=0.998)/T(0) = 4κ̂ | geçti |
| S(1 M☉) | 1.0489×10⁷⁷ k_B; S ∝ M²; S = A/(4ℓ_P²); a=1 → yarı | geçti |
| Birinci yasa Schwarzschild (sayısal türev, SI) | göreli hata < 10⁻⁷ |
| Birinci yasa Kerr (sabit J) | göreli hata < 10⁻⁶ |
| Buharlaşma 1 M☉ | 2.095×10⁶⁷ yıl; ∝ M³; 1 kg için 8.41×10⁻¹⁷ s |
| L = ħc⁶/(15360πG²M²); t = Mc²/(3L) tutarlılığı | 10⁻¹² içinde |
| CMB denge kütlesi | T_H = 2.7255 K; 4.50×10²² kg; Ay'ın %61.3'ü |
| Planck birimleri | CODATA 2018 değerleri, ≤ 2×10⁻⁶ |

Örnek değerler (a = 0; basit-formül ömrü):

| M | T_H [K] | S/k_B | λ_Wien [m] (kara cisim) | L [W] (SB) | Ömür [yıl] |
|---|---|---|---|---|---|
| 1 M☉ | 6.17×10⁻⁸ | 1.05×10⁷⁷ | 4.7×10⁴ | 9.0×10⁻²⁹ | 2.1×10⁶⁷ |
| 10 M☉ | 6.17×10⁻⁹ | 1.05×10⁷⁹ | 4.7×10⁵ | 9.0×10⁻³¹ | 2.1×10⁷⁰ |
| 4.3×10⁶ M☉ (Sgr A*) | 1.43×10⁻¹⁴ | 1.94×10⁹⁰ | 2.0×10¹¹ | 4.9×10⁻⁴² | 1.7×10⁸⁷ |
| 6.5×10⁹ M☉ (M87*) | 9.49×10⁻¹⁸ | 4.43×10⁹⁶ | 3.1×10¹⁴ | 2.1×10⁻⁴⁸ | 5.8×10⁹⁶ |

## 4. Sınırlamalar ve dürüstlük notları

- **Yarı-klasik.** Alan kuantum, uzay-zaman klasik (sabit Schwarzschild/Kerr zemini). Kütle kaybının geometriye geri-tepkisi ve kuantum kütleçekimi düzeltmeleri modellenmez; Planck ölçeğine yakın kütlelerde ve buharlaşmanın son evresinde geçersizdir.
- **Gri-cisim.** Kara cisim tepe dalga boyu, ışıma gücü ve ömür yalnızca mertebe tahminidir (bkz. 2.5–2.7). Kerr deliklerde ek olarak spin, kütleden daha hızlı azalır (Page 1976b, Phys. Rev. D 14, 3260); bu modülde Kerr için yalnız T ve S verilir, buharlaşma yalnız Schwarzschild.
- **Gözlenmedi.** Hawking ışıması hiç doğrudan gözlenmemiştir. Astrofiziksel deliklerde (yıldız kütleli, süper kütleli) T_H ≪ T_CMB olduğundan gözlenemez. Laboratuvar analog sistemleri (ör. Steinhauer, akustik ufuk) benzer matematiği sınar, ama gerçek kütleçekimsel Hawking ışımasının kanıtı değildir.
- **İlkel kara delikler spekülatiftir.** ~10¹¹–10¹² kg altındaki ilkel deliklerin bugün buharlaşıyor olabileceği fikri teoriktir; böyle bir delik gözlenmemiştir.
- **Bilgi paradoksu açık sorundur** (Hawking 1976, "Breakdown of predictability in gravitational collapse"). Bu belge ve kod taraf tutmaz; bilginin korunup korunmadığı (Page eğrisi, adalar/replika karmaları, güvenlik duvarı vb. önerilerin hiçbiri bu kodda kullanılmaz) kesin çözülmüş değildir.
- Entropinin mikroskobik kökeni genel olarak çözülmüş değildir; belirli süpersimetrik/ekstremal deliklerde sicim kuramı sayımı (Strominger–Vafa 1996) S_BH'yi yeniden üretir, ama Schwarzschild için genel bir mikrodurum sayımı yoktur.
- Dört yasa [BCH73; üçüncü: Is86]: (0) κ ufuk üzerinde sabit; (1) dM = T dS + Ω dJ + Φ dQ; (2) alan azalmaz (Hawking 1971; Hawking ışıması klasik enerji koşulunu ihlal ederek bunu *yarı-klasik* düzeyde aşar, genelleştirilmiş yasa S_BH + S_madde artar); (3) κ = 0'a sonlu işlemle ulaşılamaz. Termodinamik benzetme, Hawking ışımasıyla gerçek sıcaklık/entropi olarak yorumlanır.

## 5. ARAYÜZ İÇİN sade Türkçe metin önerileri

**Başlık: Kuantum fiziği ve kara delikler**

1. **Hawking ışıması nedir?** 1974'te Stephen Hawking, kuantum alan kuramı ile genel göreliliği birlikte kullanarak kara deliklerin tamamen "kara" olmadığını gösterdi: olay ufkunun yakınındaki kuantum alanlar nedeniyle bir kara delik, çok hafif bir ısıl ışıma yayar. Sık duyulan "ufukta bir parçacık çifti oluşur, biri içeri düşer, diğeri kaçar" anlatımı bir **benzetmedir**; asıl hesap alanların ufuk çevresinde nasıl davrandığına dayanır ve bu resim hesabı birebir yansıtmaz.

2. **Sıcaklık kütleyle ters orantılıdır.** Bir kara deliğin Hawking sıcaklığı kütlesiyle ters orantılı değişir: kütle on kat artarsa sıcaklık on kat düşer. Güneş kütleli bir delik için bu yaklaşık 0,00000006 kelvin (60 nanokelvin) kadardır. Dönen deliklerde sıcaklık spin arttıkça düşer; en hızlı dönen (ekstremal) delik kuramsal olarak sıfır sıcaklığa sahiptir.

3. **Bu yüzden bugün büyüyorlar.** Evreni dolduran kozmik mikrodalga artalan ışıması 2,7 kelvindir; Güneş kütleli bir deliğin sıcaklığından milyonlarca kat yüksektir. Delik yaydığından fazlasını soğurur, yani net olarak kazanır. Hawking ışımasının artalandan sıcak olması için deliğin kütlesinin yaklaşık 4,5×10²² kg'dan (Ay kütlesinin yaklaşık %60'ı) küçük olması gerekir; böyle bir delik gözlenmiş değildir.

4. **Buharlaşma süresi.** Sadece ışıma ile kütle kaybetseydi (başka hiçbir şey yutmasaydı) süre kütlenin küpüyle artar. Güneş kütleli bir delik için basit tahmin yaklaşık 10⁶⁷ yıldır; evrenin şimdiki yaşı yaklaşık 1,4×10¹⁰ yıldır. Süper kütleli bir delik için bu süre, yaklaşık 10⁹⁶–10⁹⁷ yıl bulur. Bu sayılar yaklaşık mertebe değerleridir; ayrıntılı hesaplar süreyi birkaç kat değiştirir.

5. **Entropi ve alan yasası.** Jacob Bekenstein (1973) ve Hawking, bir kara deliğin entropisinin hacmiyle değil **ufkunun alanıyla** orantılı olduğunu gösterdi: S = k_B A c³/(4Għ). Güneş kütleli bir delik için bu yaklaşık 10⁷⁷ k_B'dir, yani sıradan bir yıldızın entropisinden çok daha büyüktür. "Bir bölgedeki bilgi, hacmi değil sınırının alanı kadar" fikri (holografik ilke) buradan doğmuştur; hâlâ bir araştırma konusudur.

6. **Bilgi paradoksu: açık soru.** Madde bir kara deliğe düşerse içindeki bilgiye ne olur? Hawking ışıması neredeyse ısıl göründüğü için, delik buharlaştığında bilginin kaybolup kaybolmadığı tartışmalıdır. Fizikçiler bu konuda henüz görüş birliğine varmamıştır; kesin bir yanıt yoktur.

7. **Bu simülasyonda Hawking ışıması görünmez.** Güneş kütleli bir delikten ışıyan güç yaklaşık 10⁻²⁸ watt (mertebe olarak) kadardır ve Sgr A* veya M87* için çok daha küçüktür; üstelik delik her yönden gelen artalan ışımasından daha soğuktur. Bu yüzden ekrandaki parlaklık yalnızca akresyon diski ve merceklenmiş ışıktan gelir; Hawking ışıması çizilmez. Bu bölümdeki sayılar bilgilendirme amaçlı hesaplardır, görüntünün parçası değildir.

(Not, arayüz ajanı için: 1.–7. maddelerdeki sayılar `quantum.js` fonksiyonlarından üretilebilir; metne gömülecekse yuvarlak mertebe olarak verilmeli, "≈" ile işaretlenmelidir.)
