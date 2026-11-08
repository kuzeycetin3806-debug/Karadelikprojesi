# GPU ışın izleme çekirdeği ve fotogerçekçi görüntü hattı (`src/render/`, `src/shaders/`) — Adım 4a + 4b + 4c (performans / iOS)

Kerr null geodeziklerinin GLSL ES 3.00 (WebGL2) portu (**4a**, CPU referansına piksel piksel doğrulanmış) ve onun üstünde **fiziksel disk ışıması, yıldız alanı ve HDR görüntü hattı (4b)**.
Fiziksel (doğrusal radyans) ile estetik (bloom, ton eşleme, dağılım/doku seçimleri) her yerde ayrıdır: §5 tablosu.
**4c (kasma/iOS turu):** ertelenmiş gölgelendirme (geodezik bir kez, görünüş her kare), akıllı döngü (durağanda GPU boşta), uyarlamalı kalite denetleyicisi (`performance:'auto'`), iz sürme piksel bütçesi + şeritli iş, iOS/Safari dayanıklılığı: bkz. §6, §9, §14.

| Dosya | İçerik |
|---|---|
| `src/render/index.js` | `createBlackHoleRenderer(canvas, opts?)`: sahne/uniform, **iz sürme (T) → gölgelendirme (S) → animasyon (A) → bloom → kompozit** hattı (4c: ertelenmiş gölgelendirme), HDR birikim/önbellek hedefleri, akıllı rAF döngüsü + uyarlamalı kalite denetleyicisi, bağlam kaybı/görünürlük/pil, debug MRT (`renderDebug`, `renderDebugPhoto`) |
| `src/render/params.js` | parametre sözleşmesi: doğrulama/kıstırma, varsayılanlar, kalite + **performans** ön ayarları, **uniform türetimi** (f64 CPU hesapları) |
| `src/render/photometry.js` | disk fotometrisi CPU tarafı: profil tablosu, kara cisim LUT'u, T>1e5 K serisi, `Y_ref`; GPU hesabının CPU eşleniği `diskPhotometryCPU` (doğrulama). `src/physics/disk.js` fonksiyonlarını **içe aktarır** |
| `src/render/post.js` | **ESTETİK** sonradan işleme: çok seviyeli bloom (Jimenez) + kompozit (pozlama, ACES/AgX/Neutral, sRGB, dither) |
| `src/render/controls.js` | GEÇİCİ fare/dokunmatik yörünge kontrolü (kalıcı arayüzü arayüz ajanı yapacak) |
| `src/shaders/*.glsl`, `index.js` | `common` → `trig` → `geodesic` → `integrator` → `camera` → `crossing` → `escape` → `trace` → `noise` → `photometry` → `turbulence` → `stars` → `shading` → `main.frag`; post: `bloom_down/bloom_up/composite.frag.glsl`. `buildFragmentShader({debug, photo, nativeTrig, mode})` birleştirir; 4c: `mode:'trace'` (yalnız geodezik → G), `'shade'` (G → radyans), `'anim'` (radyans × türbülans) yalnız gereken parçaları derler (iOS'ta kısa derleme) |
| `tests/render/` | `gpu-validate.mjs` (CPU↔GPU çekirdek; üretim yolu + R64'e mutlak eşikler + uzamsal küme denetimi; `--steprule=`), **`photometry-validate.mjs`** (T_obs/parlaklık CPU↔GPU), **`axis-guard-validate.mjs`**, **`pipeline-check.mjs`** (T1–T16: akıllı döngü, ertelenmiş hat eşdeğerliği, görünürlük, bağlam kaybı, yedekler), `api-smoke.mjs`, `perf.mjs` (aşama maliyetleri), **`perf-frame.mjs`** (gerçek rAF döngüsünde durağan/animasyon/sürükleme, iPhone + masaüstü), **`steprule-study.mjs`** (full ↔ nodrag, rastgele kameralar, R64), `visual-snapshots.mjs`, `harness.mjs`, `guard-assert.mjs`. **`node --test` ile çalışmaz** |

## 1. Hat

```
  İZ SÜRME geçişi (src/shaders, tam çözünürlük × ölçek)                      FİZİKSEL (+ estetik doku/dağılım seçimleri, §5)
    piksel → ZAMO kamera → Kerr geodeziği (RK4) → disk vuruşu | kaçış yönü | yakalanma
    disk vuruşu  : τ(r) tablosu, T_obs = g_cam f_col T_max τ, kara cisim rengi/parlaklığı        → doğrusal HDR radyans (RGBA16F)
    kaçış        : yön 3B birim vektör → yıldız alanı (nokta kaynak: görüntü düzleminde PSF, akı ∝ büyütme μ) + Samanyolu, T_obs = ν_cam/ν_∞ T_star
    jitter'lı kareler ortalama (ilerleyici AA); sonuç = doğrusal radyans, pozlamasız, ton eşlemesiz
        │
  BLOOM (isteğe bağlı)   ×exposure → 13-tap aşağı (Karis) ×5 seviye → çadır yukarı örnekleme       ESTETİK (girdi pozlaması gösterim)
        │
  KOMPOZİT               ×exposure (GÖSTERİM) + bloom → ton eşleme (ACES | AgX | Neutral | yok) → sRGB OETF → dither     bloom/ton eşleme ESTETİK; exposure/sRGB gösterim
```
`exposure`, bloom ve ton eşleme **yalnız sonradan işlemdir**: bunlar değişince iz sürme yeniden çalışmaz (yalnız bloom + kompozit; `pipeline-check` T1).

**4c — ertelenmiş gölgelendirme (deferred shading).** Yukarıdaki "iz sürme geçişi" üç programa bölünür (aynı fizik, aynı sayılar; `pipeline-check` T10–T12 eşdeğerliği sınar):
```
 T  İZ SÜRME      piksel → ZAMO → Kerr geodeziği (RK4) → G (RGBA32F, NEAREST):  disk (r, g_cam, φ, 2) | kaçış (θ_∞, φ_∞, ν_cam/ν_∞, 1) | yakalanma (0, 0, ν_cam/ν_∞, 0)   PAHALI: yalnız kamera/geometri değişince
 S  GÖLGELENDİRME G → yıldız alanı/Samanyolu + disk fotometrisi [+ türbülans] → doğrusal HDR (RGBA16F), jitter biriktirme                                          ORTA: gölgelendirme parametresi (Tmax, fCol, yıldız, türbülans…) değişince
 A  ANİMASYON     S çıktısı × türbülans çarpanı(r, φ, zaman) → HDR (disk piksellerinde; diğerleri kopya)                                                                      ÇOK UCUZ: animasyonda her kare
```
Animasyonda S çıktısı türbülanssız tutulur (`uTurbDeferred = 1`), A her kare `exp(6·amp·fbm)` çarpanını G'deki (r, φ)'dan uygular ⇒ geodezik ve gökyüzü (yıldızlar) HER KARE yeniden hesaplanmaz. Durağan ya da animasyonsuz durumda türbülans S içinde işlenir ("baked"). `maxDiskHits > 1` (yarı saydam çok vuruş), RGBA32F/RGBA16F render hedefi yoksa ya da `deferred:false` ise eski **birleşik** tek geçiş kullanılır (T+S birleşik; her animasyon karesi tam iz sürme; `getStats().deferred` = false).
HDR hedefi RGBA16F'tir (yarım float, doğrusal filtrelenebilir; `EXT_color_buffer_float` ya da `EXT_color_buffer_half_float` gerekir). İkisi de yoksa 8-bit **acil yedek** hedef (radyans/8; bloom yok; §9).

## 2. Algoritma (4a — CPU `src/math/` f32-RK4 yolunun birebir portu)

Hamilton biçimi, Mino zamanı, durum `y = (r, θ, φ, p_r, p_θ)`, E ≡ 1, ışın **geriye** izlenir (`DIR = −1`).
RK4 sabit formüllü adım `h = κ·h_nat` (`h_nat = 1/√((r'/ρ)² + θ'² + (sinθ φ')²)`, ρ = r − r₊), κ = 0.05 (high) / 0.10 (mobile),
bütçe N = `recommendedGpuBudget(a, analytic)` (high: 512) / 256 (mobile). Δ = (r−r₊)(r−r₋), r₋ = a²/r₊.
Her adımdan sonra sıra (CPU ile aynı): ekvator kesişimi (kübik Hermite; ISCO ≤ r ≤ r_out ise vuruş) → `hits ≥ maxDiskHits` ⇒ disk
→ `r < r₊+1e-3` ⇒ yakalandı → `r > r_esc ∧ p_r < 0` ⇒ kaçtı (θ_∞, φ_∞: σ_rem, θ'' = −F[4], φ'' dahil).
**Disk opaktır: ilk vuruşta ışın SONLANIR** (`maxDiskHits = 1`); ikincil/üçüncül görüntüler birincil vuruşun olmadığı piksellerde doğal olarak görünür.
Bütçe biterse **analitik sınıflandırma** (`hasTurningPointBelow`); kaçış yönü bilinmez ⇒ `θ_∞ = φ_∞ = −1` (§7.3). |L| < 1e-7 ⇒ L = 0 (`L==0` dalı).
Kamera: ZAMO tetradı, `sağ = +φ̂`, `yukarı = −θ̂`, görüş `−r̂`; `λ = p_φ/E`, `ν_cam/ν_∞ = 1/E`.
`g = 1/(uᵗ(1−Ωλ))` ve **çıktıya `g_cam = g·ν_cam/ν_∞`** yazılır (fotometri `hit.g` DEĞİL `g_cam` kullanır).

### 2.1 Eksen koruması (4b'de bulundu ve eklendi) — `uAxisKappa`, parametre `axisGuard`

**Bulgu.** Kutup ekseninden küçük ama sıfır olmayan |L| ile geçen ışınlar eksene `θ_min ≈ L/p` mesafesinde "sıçrar" (`L²cosθ/sin³θ` bariyeri). Doğal adım θ'nın
**mutlak** değişimini κ rad ile sınırlar; `θ_min ≪ κ` ise sıçrama çözülemez ve ışın **sahte sonuç** verir (merkez sütunda sahte disk vuruşu/yanlış kaçış yönü;
4a görüntüsünde de `docs/goruntuler/*.png` merkez sütunda "nokta zinciri" olarak görünüyordu). CPU E32 (`src/math`) aynı hatayı yapar — GPU–E32 uyumu bunu **yakalamaz**; yalnız R64 yakalar.
Doğrulama (CPU E32, merkez sütun çevresi 108 piksel, a=0.9 θ75° r50): κ=0.05'te R64'e aykırı 37, κ=0.005'te 4, κ=0.0005'te 0 (kesme hatası olduğunu gösterir; 4a README §7'de "gölge kenarı/teğet ışınlar" diye açıklanan
E32–R64 uyuşmazlıklarının (39, 9, 44, 47, 10, 2, 36 piksel) **tamamı bu kusurdan geliyormuş**, tablo §8.2).

**Çare (yalnız GPU, yalnız `L ≠ 0`):** `trace.glsl` adımı ayrıca `κ_a·max(|sinθ|, s_min)/|θ'|` (göreli θ değişimi) ve `κ_a·√(max(|sinθ|, s_min)/|p_θ'|)` (bariyer kuvvetinin zaman ölçeği) ile sınırlar;
`κ_a = 0.15`, `s_min = ¼|L|/√(Q + a² + L²)` (L=0 yakınında Zeno'yu önler). Eksenden uzak ışınlarda sınır hiç etkin değildir (sonuç bit-bit aynı).
**Debug yolları (`renderDebug`, `renderDebugPhoto`) varsayılanı `params.axisGuard`** (görsel modla AYNI, yani açık: üretim yolu sınanır). 4a'nın korumasız birebir portu yalnız açık `{axisGuard:false}` ile istenir (`gpu-validate` ikinci geçişi). *Düzeltme (denetim 1b7c0de Ö1/Ö2): önceki sürümde debug varsayılanı korumasızdı, CPU E32 ise korumalı olduğundan `gpu-validate` kırmızıya dönmüş ve üretim yolu hiç sınanmamıştı.* GPU'ya gerçekten yüklenen κ_a `getStats().uniforms.axisKappa` ile okunur; doğrulama betikleri bunun CPU `DEFAULT_OPTIONS.kappaAxis` (=0.15) ile eşit olduğunu assert eder (`guard-assert.mjs`).
κ_a = 0.05 doğruluğu iyileştirmedi, ortalama adımı %8–29 artırdı ⇒ 0.15 seçildi (ort. adım artışı ≈ %1).

### 2.2 Adım kuralı `stepRule` (4c) — `'full'` (varsayılan) ∣ `'nodrag'` (GPU portu hazır, varsayılan YAPILMADI)

`stepRule:'nodrag'` = `src/math/raytracer.js` `stepRule:'nodrag'`un **birebir portu** (`geodesic.glsl` `naturalStep`, `uStepNoDrag`): doğal adımdaki φ' yerine `L/sinθ − a sinθ` (çerçeve sürüklenmesi `aP/Δ` terimi yok; φ döngüsel olduğundan r, θ dinamiğine geri beslenmez). Yalnız **adım boyutunu** değiştirir; denklemler, kesişim, yakalanma/kaçış, analitik fate aynıdır.
**Neden:** ufuk yakınında `aP/Δ` adımı gereksiz küçültür ⇒ SIMD grubunun en yavaş ışını (en kötü adım sayısı) uzar. Ölçüm (`tests/render/steprule-study.mjs`, 32 rastgele kamera × 80×60 = 153 600 ışın, R64'e karşı): adım ort/p99/en kötü **89.9 / 288 / 512 (full) → 87.1 / 235 / 421 (nodrag)**, bütçesi biten 1182 → 0, R64 sınıf uyuşmazlığı 2 → 0, Δr med/p99 aynı (7.6e-6 / 4.5e-4); SwiftShader GPU süresi 941 → 773 ms (−%18, gürültü ±%15). `axis-guard-validate` (13 kurulum): en kötü adım A 372→306, B 512→238, J 512→378, K 496→353, P2 512→232; ortalama adım −%1…−%7.
**Karar (koordinatör kuralı: "R64'e karşı mutlak eşikler GEÇİYORSA varsayılan yap"):** `gpu-validate --steprule=nodrag` **BAŞARISIZ** (tek madde): D kurulumunda (a=0.9, θ=π/2 tam disk düzlemi, r=30) iki yatay-komşu piksel `[40,35],[40,36]` R64'te disk (r = 19.9958, dış kenar r_out=20'ye 4.2e-3) iken GPU nodrag'da kaçıyor ⇒ **[UZAMSAL] 5×5 kümelenme** ölçütü kırmızı. Diğer tüm mutlak eşikler (sınıf uyuşmazlığı D'de 2/6912 = %0.03 ≤ %0.1, Δr/ΔgCam/yön p99) ve diğer 12 kurulum GEÇTİ. Neden: kamera tam düzlemdeyken iki simetrik ışın r_out'a 4e-3 uzakta düzleme sığ açıyla iniyor; Hermite+RK4 kesişim hatası (E32 'full' bile 19.9898, hata 6e-3) kenarı geçebiliyor — CPU E32 nodrag da aynı pikselleri aynı yönde çeviriyor (GPU–E32 uyuşmazlığı 0), yani port doğru, çevirme kesme hatası. 32 kameralık geniş örnekte nodrag'da hiç yok. Kural gereği **varsayılan `'full'` bırakıldı**; `setParams({stepRule:'nodrag'})` ile açılır, `node tests/render/gpu-validate.mjs --steprule=nodrag` ve `axis-guard-validate.mjs --steprule=nodrag` çalışır (ikincisi GEÇTİ). Koordinatör eşiği gevşetmeye (ör. [UZAMSAL]'dan r_out/r_isco'ya ≤ 1.5e-2 yakın ışınları muaf tutmak) ya da nodrag'ı yalnız `quality:'mobile'`a bağlamaya karar verirse tek satır: `params.js` `DEFAULT_PARAMS.stepRule`.

## 3. Parametre sözleşmesi (arayüz ajanı için)

```js
import { createBlackHoleRenderer } from './render/index.js';
const r = createBlackHoleRenderer(canvas, { controls: true /* geçici yörünge kontrolü */, nativeTrig: false });
r.start();                       // rAF döngüsü; yalnız gerektiğinde çizer (§6); animasyon açıkken sürekli
r.setParams({ a: 0.9 });         // kısmi güncelleme; kıstırılmış TAM parametre nesnesini döndürür
r.getParams();  r.getStats();    // getStats: bkz. §3.6 (fps, frameMs, traceScale, mode, adaptiveLevel, …)
r.renderOnce({ frames: 8 });     // eşzamanlı, tam çözünürlük, 8 jitter'lı kare (anlık görüntü/test)
await r.renderDebug(64, 48);     // Float32Array (bkz. §4)    await r.renderDebugPhoto(64, 48);   // bkz. §4
```
Hatalı tür → `TypeError`; bilinmeyen `quality`/`performance`/`tonemap`/`brightnessMode` → `RangeError`; aralık dışı sayısal değer **kıstırılır** (kaydırıcıları kırmamak için).

### 3.1 Geometri / çekirdek (4a)
| Parametre | Tür / aralık | Varsayılan | Açıklama |
|---|---|---|---|
| `a` | 0 … 0.998 (kıstırılır) | 0.9 | boyutsuz spin (a=1 ISCO/g tanımsız) |
| `thetaCam` | rad, [1e-3, π−1e-3] | 75° | kamera eğimi (θ=π/2 tam desteklenir, dejenere; arayüz 89.5°–90.5° bandından kaçınmalı) |
| `rCam` | M, [r₊+0.25, 1000] | 50 | kamera yarıçapı (f32 koşullanması r ≲ 200'de rahat, §9) |
| `phiCam` | rad | 0 | kamera azimutu |
| `fovY` | derece [1, 120] | 40 | dikey görüş alanı |
| `diskIn` | `'isco'` ∣ sayı (M) | `'isco'` | iç yarıçap. **4b: ISCO'dan küçük olamaz** (ISCO altında Page–Thorne ışıması yok; `max(diskIn, r_isco, r_ph+1e-3, r₊)`) |
| `diskOut` | M | 20 | dış yarıçap (profil tablosu bu aralıkta üretilir) |
| `prograde` | bool | true | disk dönüş yönü (delikle aynı = true) |
| `disk` | bool | true | false: disk yok, yalnız merceklenme |
| `maxDiskHits` | 1 … 4 | 1 | **1 = opak disk**; >1 ikincil/üçüncül görüntüler yarı saydam (α=0.7, ESTETİK) |
| `quality` | `'high'` ∣ `'mobile'` | `'high'` | high: κ=0.05, N=512; mobile: κ=0.10, N=256 |
| `axisGuard` | bool | true | §2.1 (görsel mod **ve** debug yolları varsayılanı) |
| `stepRule` | `'full'`∣`'nodrag'` | `'full'` | 4c, §2.2 (GPU portu hazır; varsayılan yapılmadı) |
| `analyticFate`, `rEscape`, `kappa`, `maxSteps`, `planeGuard` | — | true, `'auto'`, null, null, true | gelişmiş/test; `rEscape 'auto'` = **max(300, 2 r_cam, 6 b_max)**, b_max = r_cam·tan(yarı-köşegen açı) (4b: geniş açı + uzak kamerada kaçış yönü hatası ≈ (b/r_esc)³ büyür) |

### 3.2 Disk ışıması (FİZİKSEL)
| Parametre | Tür / aralık | Varsayılan | Açıklama |
|---|---|---|---|
| `Tmax` | K, [2000, 1e6] | 1e4 | T_eff(r) = Tmax·τ(r) (Page–Thorne profilinin tepe değeri). Kullanıcı doğrudan seçer; (M, ṁ) → `diskMaxTemperatureK` yalnız kısayol |
| `fCol` | [1, 3] | 1 | renk düzeltmesi: T_col = f_col T_eff (yıldız kütleli BH için ~1.7). **Mod B'de parlaklık fiziksel olarak değişir** (§7.1: `f_col⁻⁴·Y(f_col T)/Y(T_max)`; T_max=1e4, f_col=1.7 ⇒ tepe ×0.416) ⇒ f_col>1'de `exposure` artırmak gerekebilir |
| `brightnessMode` | `'band'` ∣ `'bolometric'` | `'band'` | mod B (band-fotometrik, fiziksel olarak doğru görünür-band kamera) ∣ mod A (bolometrik, (g τ)⁴). Renk her ikisinde aynıdır |

### 3.3 Görüntü hattı (sonrası işlem; iz sürme gerektirmez) — `exposure` GÖSTERİM, bloom/ton eşleme ESTETİK
| Parametre | Tür / aralık | Varsayılan | Açıklama |
|---|---|---|---|
| `exposure` | [1e-3, 1e3], doğrusal çarpan | 0.5 | **GÖSTERİM ölçeği** (görüntüleme ölçeği; ne fizik ne estetik — radyansı ekran aralığına yerleştirir). Mod B'de g=1, τ=1 noktasında I = f_col⁻⁴Y(f_col T_max)/Y(T_max) (f_col=1: 1); 0.5 ⇒ medyan disk ≈ orta gri, tepe doymaz. Önerilen kaydırıcı: log (EV = log₂) |
| `tonemap` | `'aces'`∣`'agx'`∣`'neutral'`∣`'none'` | `'aces'` | `none` = yalnız [0,1] kırpma (fiziksel radyansı olduğu gibi gösterir) |
| `bloom` | bool | true | |
| `bloomStrength` | [0, 2] | 0.2 | sahne enerjisinin yeniden dağıtılan kesri (Σ radius^i ile normalize) |
| `bloomRadius` | [0, 1] | 0.7 | büyük = geniş hale |

### 3.4 ESTETİK öğeler
| Parametre | Tür / aralık | Varsayılan | Açıklama |
|---|---|---|---|
| `turbulence` | bool | true | diskte ince ölçekli türbülans (ışıma modülasyonu; fiziksel değil) |
| `turbulenceAmp` | [0, 1] | 0.3 | çarpan σ ≈ 0.21 (amp=0.3), aralık 0.5–1.9 |
| `turbulenceScale` | M, [0.2, 10] | 1.0 | en büyük hücre boyu |
| `animate` | bool | true | desen yerel Kepler Ω(r) ile akar (sürekli render gerektirir; §6) |
| `timeScale` | M/s, [0, 200] | 20 | animasyon hızı (1 s = 20 M; r=6'da yörünge 92 M ≈ 4.6 s) |
| `diskTime` | null ∣ sayı (M) | null | null: gerçek zaman; sayı: sabit (test/anlık görüntü; desen 50 M'de yinelenir) |
| `diskEdgeFade` | [0, 0.5] | 0.1 | **ESTETİK, varsayılan AÇIK.** Dış kenar yumuşatma (disk genişliği kesri; 0 = sert): smoothstep ile **dış %10'luk bölgede (r ∈ [r_out − 0.1(r_out − r_in), r_out]) Page–Thorne ışımasını DEĞİŞTİRİR** (parlaklık 1 → 0). Fiziksel ışıma isteniyorsa `0` yapılmalıdır |
| `stars` | bool | true | yıldız alanı |
| `starBrightness` | [0, 10] | 1 | yıldız ölçeği |
| `milkyWay` | [0, 2] | 0.6 | Samanyolu bandı (0 = yok) |

### 3.5 Performans / etkileşim
| Parametre | Tür / aralık | Varsayılan | Açıklama |
|---|---|---|---|
| `performance` | `'auto'`∣`'quality'`∣`'balanced'`∣`'battery'` | **`'auto'`** (4c; eskiden `'balanced'`) | `auto`: cihaz sınıfına (mobil/iOS ↔ masaüstü, UA + `pointer:coarse` + iPadOS `maxTouchPoints`) ve ölçülen kare süresine uyarlanır (§6.3). Ön ayar tablosu aşağıda. Elle geçersiz kılma alanları: |
| `interactionScale` | null ∣ [0.1, 1] | null | hareket sırasında iz sürme çözünürlük çarpanı |
| `accumFrames` | null ∣ 1…64 | null | durağan karede biriktirilecek jitter'lı kare sayısı (animasyonda biriktirme YOK) |
| `animationFps` | null ∣ [5, 120] | null | animasyonda en çok kare/sn (pil azalıyorsa ≤ 20) |
| `dynamicResolution` | null ∣ bool | null | ölçülen kare süresi hedefi tutmazsa çözünürlüğü basamaklı düşür (§6.3) |
| `progressive` | bool | true | false: biriktirme yok (accumFrames = 1) |
| `resolutionScale` | [0.1, 1] | 1 | durağan iz sürme çözünürlüğü / tuval çözünürlüğü. **Tuval tamponu = CSS × min(devicePixelRatio, maxPixelRatio)**; iz sürme ondan ölçekli ve bilinear büyütülür |
| `maxPixelRatio` | [0.5, 4] | 2 | tuval tamponu DPR üst sınırı (iPhone @3x ⇒ 2x) |
| `maxTracePixels` | null ∣ ≥1e4 | null | **4c** durağan iz sürme çözünürlüğü piksel üst sınırı (null = ön ayar/cihaz); aşılırsa ölçek `√(sınır/tuval pikseli)`e iner ve tuvale bilinear büyütülür (**GÖSTERİM**, fizik değişmez) |
| `maxTickPixels` | null ∣ ≥1e3 | null | **4c** tek rAF karesinde iz sürülecek en çok piksel; aşılırsa iş yatay şeritlere bölünür (kare başına bir şerit; iOS GPU zaman aşımı koruması) |
| `deferred` | `'auto'`∣bool | `'auto'` | **4c** ertelenmiş gölgelendirme (§1). `false`: birleşik tek geçiş (test/yedek). `maxDiskHits>1` ya da RGBA32F/RGBA16F hedefi yoksa kendiliğinden birleşik |
| `stepRule` | `'full'`∣`'nodrag'` | `'full'` | §2.2 |

| ön ayar | interactionScale | settleMs | accumFrames | animationFps | dynamicResolution (min–maks ölçek) | maxTracePixels | maxTickPixels | bloom |
|---|---|---|---|---|---|---|---|---|
| `quality` | 0.6 | 150 | 16 | 60 | kapalı | ∞ | ∞ | tam |
| `balanced` | 0.5 | 150 | 8 | 30 | açık (0.35–1) | ∞ | 4 Mpx | tam; adaptiveLevel ≥ 3 ya da animasyon kare atlıyorsa ucuz |
| `battery` | 0.35 | 120 | 4 | 20 (eskiden 15) | açık (0.3–0.7) | 0.8 Mpx | 0.6 Mpx | ucuz |
| **`auto` masaüstü** | 0.5 | 150 | 8 | 60 | açık (0.3–1) | 8 Mpx | 3 Mpx | tam; adaptiveLevel ≥ 3 ya da kare atlıyorsa ucuz |
| **`auto` mobil/iOS** | 0.4 | 130 | 4 | 30 | açık (0.25–1) | 1.0 Mpx | 0.5 Mpx | ucuz |

**Arayüz notları (4c).** Tuvale `touch-action:none` `index.html`'de. `controls:false` ile geçici kontrol kapatılıp arayüz kendi `setParams` çağrılarını yapabilir. Kamera/geometri parametresi sürüklenirken her `setParams` "etkileşim" sayılır (düşük çözünürlük → `settleMs` sonra durağan çözünürlük → jitter biriktirme → **boşta: hiçbir geçiş çalışmaz, rAF bile durur**). **Yalnız-gölgelendirme** parametreleri (`Tmax, fCol, brightnessMode, turbulence*, diskEdgeFade, stars, starBrightness, milkyWay, animate, diskTime`) ertelenmiş hatta **geodezik yeniden hesaplanmadan** (G önbelleğinden) anında uygulanır, düşük çözünürlüğe düşmez. `exposure/tonemap/bloom*` yalnız bloom + kompozit çalıştırır. `timeScale` hiçbir şey çizdirmez. `performance/resolutionScale/maxTracePixels/animationFps/accumFrames…` değişimi yeniden iz sürme gerektirmez (döngü kendi karşılaştırır; ölçek değiştiyse bir kez yeniden izlenir).
**Mobil/iPad önerisi:** yalnız `quality:'mobile'` yeterli; `performance` varsayılan `'auto'` bırakılırsa cihaz sınıfı tanınır ve piksel bütçesi/ucuz bloom/ölçek denetleyicisi kendiliğinden devreye girer (eski öneri `performance:'battery'` + `resolutionScale 0.5–0.75` hâlâ geçerli ama artık gerekmez). `animate:false` animasyonu tamamen kapatır (zaten animasyon artık ucuzdur).

### 3.6 `getStats()` sözleşmesi (arayüz için; 4c)
```js
r.getStats() → {
  fps,            // son 1 s içinde sunulan SAHNE karesi/sn (boşta 0)
  frameMs,        // ardışık sahne kareleri arası ms (EMA); boştayken son etkin değer
  traceScale,     // son iz sürmenin tuval çözünürlüğüne oranı (= scale)
  mode,           // 'idle' | 'interacting' | 'animating' | 'refining'   (refining: durağan çözünürlüğe geçiş / jitter biriktirme / şeritli iş)
  adaptiveLevel,  // 0 = uyarlamalı düşüş yok; k = 2^(−k/6) basamak (denetleyici k kadar çözünürlük düşürdü); dynamicScale = 2^(−(adaptiveLevel+kMin)/6)
  // geriye uyumlu: frames, width/height (tuval), traceWidth/Height, scale, accumCount, dynamicScale, interacting, animating, hdr, uniforms, lastFrameMs
  // yeni: presented (kompozit sayısı), traceFrames, shadeFrames, animFrames, bands (son işin şerit sayısı), simTime, gpuMB (önbellek hedefleri), contextRestores,
  //       deferred (bool), device {mobile, ios, lowPower, safeLevel}, caps {f32rt, f16rt, hdrFloat, deferred, maxTexture}, paused (sayfa gizli), contextLost
}
```
`frames`: sunulan sahne karesi (T / S / A geçişlerinden en az biri çalışan rAF karesi); yalnız bloom/kompozit (`exposure`) sayılmaz (`presented` sayar).

## 4. Debug modları

**`renderDebug(width, height, {axisGuard = params.axisGuard}?)`** (4a düzeni **değişmedi**): 3 × RGBA32F (WebGL2 MRT, `EXT_color_buffer_float` şart). `Float32Array` uzunluğu `width·height·12`; piksel (i, j) (**j = 0 üst satır**) için
`(j·width + i)·12 + DEBUG_FIELDS.indexOf(alan)`; `DEBUG_FIELDS` = `status, r1, gCam1, steps, thetaInf, phiInf, n1, hitCount, reason, phi1, r2, gCam2`.
`status`: 0 yakalandı · 1 kaçtı · 2 disk. `reason`: 0 normal · 1 bütçe bitti · 2 NaN. Vuruş yoksa `r1=−1, gCam1=0, n1=0, phi1=−1`; kaçış yönü bilinmiyorsa `thetaInf = phiInf = −1`.

**`renderDebugPhoto(width, height, {axisGuard = params.axisGuard}?)`** (4b; ilk disk vuruşu): `PHOTO_FIELDS` = `status, hitCount, r1, gCam1, tau, Tobs, I, log10Y, R, G, B, turbEdge`.
`tau` = T_eff/T_max, `Tobs` = g_cam f_col T_max τ (K), `I` = parlaklık çarpanı (türbülans/kenar **hariç**; mod A: (gτ)⁴, mod B: Y(T_obs)/Y(T_max)·f_col⁻⁴), `log10Y` = LUT/seri/Wien log₁₀Y(T_obs),
`R,G,B` = nihai disk radyansı (`I · kromatisite · türbülans · kenar`), `turbEdge` = ESTETİK çarpanların çarpımı.

## 5. Fiziksel ve estetik öğelerin ayrımı

| Öğe | Sınıf | Dosya |
|---|---|---|
| Geodezik integrasyon, adım kuralı, **eksen koruması**, kesişim, yakalanma/kaçış, analitik fate, kaçış yönü | **FİZİKSEL** (sayısal) | `geodesic/integrator/crossing/escape/trace.glsl` |
| `g_cam` (gravitasyonel kayma + Doppler), kamera tetradı, ışık sapması/merceklenme | **FİZİKSEL** | `camera/crossing.glsl` |
| Disk sıcaklık profili τ(r) (Page–Thorne), T_obs = g_cam f_col T_max τ, kara cisim kromatisitesi, mod A/B parlaklığı, T>1e5 K serisi, T<1e3 K Wien | **FİZİKSEL** | `photometry.glsl`, `photometry.js`, `src/physics/disk.js` |
| Opak disk (ilk vuruşta durma), yakalanma = siyah | **FİZİKSEL** (model) | `trace.glsl`, `shading.glsl` |
| Yıldız yönü eşlemesi (3B birim vektör, merceklenme), yıldız renk sıcaklığı → kara cisim, T_obs = ν_cam/ν_∞·T_star, band-luminans kayması, **nokta kaynak büyütmesi (akı ∝ μ = Ω_nominal/\|∂d/∂x × ∂d/∂y\|) ve görüntü düzleminde PSF boyutunda kalma** | **FİZİKSEL** | `stars.glsl` |
| Yıldız sayısı/parlaklık dağılımı (kesik Pareto)/**PSF boyu σ_s=0.65 piksel**/**büyütme tavanı `STAR_MU_CAP`=24**, sıcaklık dağılımı, ¼ piksel² ayak izi süzmesi, **Samanyolu** (şekil, renk, toz, yıldız artışı) | **ESTETİK** | `stars.glsl` |
| Yönü bilinmeyen halka pikselleri için gökyüzü ortalaması | **ESTETİK** (yaklaşım) | `stars.glsl` `skyMeanRadiance` |
| **Disk türbülans dokusu** (Kepler Ω ile akan, çift-fazlı akış haritası), **dış kenar yumuşatma `diskEdgeFade` (varsayılan AÇIK: dış %10'da Page–Thorne ışımasını değiştirir)**, `maxDiskHits>1` yarı saydamlık (α=0.7) | **ESTETİK** | `turbulence.glsl`, `shading.glsl` |
| Pozlama çarpanı `exposure` | **GÖSTERİM** (görüntüleme ölçeği; ne fizik ne estetik) | `composite.frag.glsl` |
| **Bloom**, **ton eşleme** (ACES/AgX/Neutral), dither | **ESTETİK** | `bloom_*.frag.glsl`, `composite.frag.glsl` |
| sRGB OETF (IEC 61966-2-1) | gösterim kodlaması (estetik değil) | `composite.frag.glsl` |
| Jitter'lı kare biriktirme (ilerleyici AA), uyarlamalı çözünürlük, dinamik ölçek | etkileşim / kalite | `index.js` |
| **4c** Ertelenmiş gölgelendirme (G önbelleği, T/S/A ayrımı), akıllı döngü, şeritli iş, bayt bütçeli önbellek | **hesaplama organizasyonu** (fizik/estetik çıktı değişmez: `pipeline-check` T10–T13) | `index.js`, `main.frag.glsl` |
| **4c** İz sürme piksel bütçesi `maxTracePixels` (düşük çözünürlük + bilinear büyütme), uyarlamalı denetleyici | **GÖSTERİM** (görüntüleme çözünürlüğü) | `index.js`, `params.js` |
| **4c** Animasyonda bloom girdisi = türbülanssız taban (önbellekli), ucuz bloom (4 örnek, 4 seviye) | **ESTETİK** (bloom zaten estetik) | `index.js`, `post.js`, `bloom_down.frag.glsl` |
| **4c** `stepRule` (nodrag) | **FİZİKSEL** (sayısal; yalnız adım boyutu) | `geodesic.glsl` |
| `sinCos` (trig.glsl) | **FİZİKSEL** (sayısal kesinlik) | `trig.glsl` |

`bloom:false, tonemap:'none'` ⇒ tuval = sRGB(min(1, exposure·radyans)) (`pipeline-check` T4: maks 1.45/255). Mod B f_col normalizasyonu: Y_ref = Y(T_max) (f_col'dan bağımsız) ⇒ f_col değişimi FİZİKSEL parlaklık değişimini verir; `exposure` yalnız gösterim ölçeğidir.

## 6. Performans ve etkileşim davranışı (4c — yeniden yazıldı)

### 6.1 Kare başına ne çalışır (akıllı döngü)
| Durum | Çalışan geçişler | GPU |
|---|---|---|
| **Durağan** (animasyon kapalı, biriktirme bitti) | hiçbiri; rAF bile durdurulur (`mode:'idle'`, `fps:0`); `setParams`/yeniden boyutlandırma/görünürlük uyandırır | boşta |
| Sürükleme / geometri değişimi | T+S (düşük çözünürlük: `settleMs` boyunca `resolutionScale·interactionScale·2^(−k/6)`) [+ A] + bloom + kompozit | etkin |
| Durunca | tek T+S (durağan çözünürlük, gerekirse şeritli) + `accumFrames−1` jitter'lı T+S (ilerleyici AA), sonra boşta | kısa süre |
| Yalnız gölgelendirme parametresi (Tmax, yıldız, türbülans…) | yalnız S (G önbellekten; geodezik YOK) + bloom + kompozit | kısa |
| Yalnız `exposure/tonemap/bloom*` | bloom + kompozit | çok kısa |
| **Animasyon** (varsayılan sahne: `animate` ∧ `turbulence`) | **yalnız A** + kompozit, `animationFps` ile sınırlı; bloom taban görüntüden BİR KEZ hesaplanıp önbelleğe alınır (§6.4). Geodezik/yıldızlar yeniden hesaplanmaz | çok hafif |
| Animasyon + kamera hareketi | T+S [+A] (düşük çözünürlük) yalnız hareket sürerken | etkin |
| Sayfa gizli (`document.hidden`) | hiçbiri (rAF iptal; dönüşte zamanlayıcılar sıfırlanır, yeniden çizilir) | boşta |

Animasyonda biriktirme yoktur (hareketli desende hayalet bırakır; türbülans maskesi tek örnekten alınır) ⇒ kenarlar anti-alias'sızdır — **4a/4b ile aynı** davranış. Birleşik/yedek hatta (`getStats().deferred === false`) animasyonun her karesi tam iz sürmedir (eski davranış) ve uyarlamalı denetleyici bu kareler için çözünürlüğü düşürür.

### 6.2 Maliyet analizi (özet; ölçümler §9)
SwiftShader'da (göreli): eski hatta her animasyon karesi = tam T+S+bloom+kompozit; animasyon varsayılan olarak AÇIK olduğu için **uygulama kullanıcı hiçbir şey yapmasa da sürekli tam çözünürlükte iz sürüyordu** (geodezik ≈ %55–60, fotometri ≈ %20–25, yıldız+Samanyolu ≈ %20–35, bloom+kompozit ≲ %10). Mobil GPU'da bu, termal kısılma ve düşük FPS'nin ana nedeniydi. 4c ile animasyon karesi = A + kompozit (bloom önbellekli).

### 6.3 Uyarlamalı kalite denetleyicisi (`dynamicResolution`; `auto`/`balanced`/`battery`)
* **Girdi:** GPU süresi ölçülemez (iOS Safari'de `EXT_disjoint_timer_query` yok) ⇒ rAF aralığı (arka basınç altında en yavaş aşamanın süresi). Etkileşimde ardışık kareler arası, birleşik animasyonda son iz sürmeden bu yana geçen süre; hedef 33 ms (≥ 30 FPS hissi; birleşik animasyonda `max(28, 1000/animationFps)`).
* **Basamak:** çözünürlük `2^(−k/6)` (k tamsayı ⇒ sonlu sayıda iz sürme boyutu ⇒ hedef önbelleği yeniden ayrılmaz). Aşım ⇒ k += ⌈3·log₂(EMA/hedef)⌉ (1…4; maliyet ∝ ölçek²). Sınır `[−6·log₂(maxDynamicScale), −6·log₂(minDynamicScale)]`.
* **Histerezis / ısınma (thermal):** EMA hedefin %125'ini aşarsa düş (en çok 5 kare/s ile); EMA hedefin %62'sinin altında 40 ardışık kare ⇒ 1 basamak çık. Her düşüşten sonra yukarı çıkma `3 s·2^(art arda düşüş−1)` süre engellenir (cihaz ısındıkça kısılma sürerse çözünürlük "pompalamaz"); 30 s sakin dönem sayacı geri sarar. Yeni boyuta geçişten sonra ilk 3 örnek (hedef ayırma) yok sayılır.
* **Animasyon hızı (ertelenmiş hat):** A kareleri hedef aralığı (1000/animationFps) tutamazsa (EMA > %145) kare atlanır (1/2, 1/3, 1/4) ve ucuz bloom açılır; 15 s·2ⁿ sonra bir kademe geri denenir.
* **Durağan çözünürlük hiçbir zaman `k`dan etkilenmez** (yalnız `resolutionScale` ∧ `maxTracePixels`): durunca her zaman tam kalite.
* `document.hidden`/`pagehide`: render durur. `navigator.getBattery` varsa (Chromium) şarjsız ve < %25 ⇒ animasyon ≤ 20 kare/sn; Safari'de yok ⇒ yok sayılır.

### 6.4 Önbellekler
* Boyuta göre **bayt bütçeli LRU** hedef önbelleği (mobil 96 MB, masaüstü 600 MB, en çok 6 boyut): HDR ping-pong (RGBA16F ×2) + G (RGBA32F, yalnız ertelenmiş hat) + A çıktısı (RGBA16F, yalnız animasyon). Boyut değişiminde sızıntı yok (`pipeline-check` T17); `getStats().gpuMB`.
* **Bloom önbelleği:** animasyonda bloom girdisi türbülanssız taban görüntüdür (ESTETİK sadeleştirme: türbülans ortalaması ≈ 1.01, bloom geniş çekirdekle zaten süzer) ⇒ bloom taban/pozlama/yarıçap değişmedikçe yeniden hesaplanmaz.
* Disk profil tablosu (R32F) ve kara cisim LUT'u (RGBA32F): NEAREST + elle `mix` (iOS'ta `OES_texture_float_linear` yok olabilir).

## 7. Disk, yıldız alanı ve halka ayrıntıları

### 7.1 Disk ışıması (`docs/physics/disk.md` §3–§6)
* **Tablolar** (CPU f64 → doku): `diskProfileTable(a, prograde, r_out, 256)` → **R32F 256×1**, `s = √((r−r_isco)/(r_out−r_isco))`; `blackbodyLUT(256)` → **RGBA32F 256×1** `[R,G,B (Y=1), log₁₀Y]`, log₁₀T ∈ [3,5].
  Mobil güvenliği: ikisi de `NEAREST` + shader'da elle `mix` (`OES_texture_float_linear` gerekmez); örnekleyiciler `highp`.
* **Sıcaklık:** `T_obs = g_cam · f_col · T_max · τ(r)` (`hit.gCam`).
* **Mod B (varsayılan):** `I = 10^(log₁₀Y(T_obs) − log₁₀Y_ref) · f_col⁻⁴`, **`Y_ref = Y(T_max)`** (CPU'da integralden; **f_col'dan BAĞIMSIZ** — denetim K2). Önceki sürümde `Y_ref = Y(f_col T_max)` idi ⇒ tepe f_col⁻⁴'e düşmüyor, f_col⁻⁴ ile normalize edilip fiziksel parlaklık değişimi yutuluyordu (T_max=1e4, f_col=1.7: fizik 0.416, kod 0.120). Şimdi g=1, τ=1'de `I = f_col⁻⁴Y(f_col T_max)/Y(T_max)` (=0.416). g³/g⁴ **ayrıca uygulanmaz** (g bağımlılığı Y(gT) içindedir). **Mod A:** `I = (g_cam τ)⁴` (f_col kaybolur).
* **LUT dışı:** T > 1e5 K: kromatisite 1e5 K'de sabit; `log₁₀Y = log₁₀Y_LUT(1e5) + log₁₀(a x − b + c/x)`, x = T/1e5 — katsayılar `blackbodyLuminanceSeries`'ten (3 noktadan 3×3 çözüm; uniform `uSeries`), 1e5 K'ye **çapalı** (süreksizlik yok).
  T < 1e3 K: kromatisite 1e3 K'de sabit, `log₁₀Y −= (2.3e4/ln10)(1/T − 10⁻³)` (Wien; ±%30 @600 K — `disk.md §5.4`).
* ISCO'dan içeride ışıma ve disk **yok** (`diskIn ≥ r_isco`).

### 7.2 Yıldız alanı (`stars.glsl`)
Yön = sonsuzdaki BL yönünden 3B birim vektör `(sinθ_∞cosφ_∞, sinθ_∞sinφ_∞, cosθ_∞)` (**enlem-boylam örneklemesi yok**, 4a'nın kutup dikişi gitti). Kameradan bağımsız ⇒ yıldızlar gökte sabit.
**Dikişsiz 3B kafes:** birim hücreli kafeste, merkezi `|c| ∈ [R−½, R+½]` kabuğunda olan hücrelerde en çok 1 yıldız (PCG tamsayı hash; GPU'dan bağımsız deterministik), yönü `normalize(konum)`; piksel için 27 hücre taranır ⇒ küp dikişi/hücre sınırı kesilmesi yok.
İki katman: parlak/seyrek (R=45, ≈5.6 bin yıldız, F ∈ [0.1, 8]) ve sönük/yoğun (R=130, ≈64 bin yıldız, F ∈ [0.016, 0.32]); kesik Pareto parlaklık; sıcaklık 3000–30000 K (`blackbodyLUT`, soğuk çoğunlukta); Samanyolu bandında yıldız olasılığı artar.
**Yıldız = NOKTA KAYNAK (denetim Ö3).** Önceki sürüm yıldızı *gökyüzü düzleminde* σ_s=0.65 piksel Gauss olarak çiziyor, büyütülen yıldızı sabit tepe parlaklıkla **yay** olarak uzatıyordu ve bunu "fiziksel" diye sunuyordu; oysa bu estetik bir modelin (sonlu açısal çaplı kaynak varsayımı) sonucuydu. Gerçek nokta kaynağın görüntüsü ekranda PSF boyutunda kalır ve **akısı büyütme μ ile ölçeklenir**. Şimdi: yerel gökyüzü Jakobiyeni `J = [dFdx(d), dFdy(d)]` (gök yönü / iz sürme pikseli); bir yıldıza göre **ekran ofseti** `δ = J⁺(d − d_yıldız)` (piksel; `J⁺ = (JᵀJ)⁻¹Jᵀ`; Gram matrisine `(0.02 fp_nom)²` eklenir, böylece ddx≈0 ya da ddx∥ddy'de det→0 olmaz), PSF = `exp(−|δ|²/2σ_eff²)` — **görüntü düzleminde** izotropik; `μ = Ω_nominal/|dFdx(d)×dFdy(d)|`, `Ω_nominal = fp_nom²(1+x²+y²)^(−3/2)` (merceksiz piksel katı açısı, perspektif düzeltmeli); genlik = `F·min(μ, μ_cap)·σ_s²/σ_eff²`, `σ_eff² = σ_s² + ¼` (¼ piksel² ayak izi süzmesi: kaba ızgarada yıldız kaybolmasın, enerji korunur). `μ_cap = STAR_MU_CAP = 24` **ESTETİK tavandır** (gerçek μ kritik eğride → ∞). Sonuç: merceklenmiş yıldız yay olarak uzamaz, **nokta kalır ve μ kadar parlaklaşır/sönükleşir**; yay yalnız sonlu çaplı kaynağın ya da yaygın ışığın (Samanyolu) özelliğidir. Tutarlılık ölçümü (stars-only, 640×480, 16 kare, bölge toplamı eski↔yeni): uzak bölgelerde toplam enerji ±%20 içinde (sonlu yıldız örneği gürültüsü dahil) (eski yüzey-parlaklığı modeliyle aynı; μ≈1'de aynı yıldız aynı tepe değeri verir: 0.0207 = 0.0207), tepe değerler BH yakınında ×1.4–4.7 artar (μ>1).
Komşu piksel yönü geçersizse (kaçış/yakalanma/disk sınırı) nominal (merceksiz, izotrop, μ=1) harita kullanılır. **Fiziksel kayma:** `T_obs = (ν_cam/ν_∞) T_star` ve band-luminans oranı 10^(logY(T_obs) − logY(T)).
**Samanyolu (ESTETİK):** galaktik düzlem normali ve "merkez" yönü sabit (disk düzlemine paralel değil); çekirdek + halo + bulge; 4 oktavlı 3B değer gürültüsü (bulutsu/toz şeridi), ayak izine göre oktav söndürme.
**Not (düzeltme):** önceki sürümde burada "dar görüş alanında yıldızlar yay şeklinde görünür: bu fiziksel" yazıyordu; **yanlıştı** — yaylar estetik PSF modelinden geliyordu. Şimdi yıldızlar noktadır; gerçek bir yıldızın açısal çapı (≲ 1e-8 rad) PSF'in çok altında olduğundan nokta kaynak varsayımı doğrudur. Sınır: dFdx/dFdy 2×2 dörtlüde sabit olduğundan μ ve ofset doğrusallaştırması kritik eğri/gölge kenarına çok yakın piksellerde (J'nin hızla değiştiği yerlerde) kabadır; tavan ve düzenleme bu durumda yıldızı kaybetmek ya da tek piksele sıkıştırmakla sınırlıdır.

### 7.3 Yönü bilinmeyen (`thInf = −1`, bütçesi biten, kaçar) halka pikselleri
Bu ışınlar kritik eğriye sonsuz yakındır (çok tur fotonküresinde dolanır) ve gökyüzünün **her yerini** örnekler ⇒ çözülmemiş yıldız toplamı ≈ yaygın ortalama. Yaklaşım: **sabit düşük gökyüzü ortalaması** (`skyMeanRadiance`: Samanyolu ortalaması + zayıf yıldız parıltısı,
ν_cam/ν_∞ ile kaymış). Rastgele yön seçmek halkada "parlayan yıldız gürültüsü" üretirdi. Eksen koruması sonrası bu piksel çok azaldı (160×120: 01 kurulumunda yönü bilinmeyen kaçan 36 → 4, yüzden 10° 20 → 0, mw-bulge 32 → 0, A/B/C 0); a=0.998'de (B) bütçesi biten 103/6912 ışının hepsi **yakalandı**'dır (yön gerekmez). ESTETİK yaklaşım.

## 8. Doğrulama

### 8.1 Çekirdek (`tests/render/gpu-validate.mjs`) — ÜRETİM yolu + R64'e MUTLAK eşikler
**Düzeltme (denetim 1b7c0de Ö1/Ö2).** Önceki sürüm GPU debug yolunu korumasız (4a portu), CPU E32'yi korumalı çalıştırıp kırmızıya dönmüştü; ayrıca GPU–R64 eşikleri E32–R64 *taban çizgisine* göreliydi (E32'nin ortak hatasını gizler) ve README'deki "GEÇTİ" iddiası geçersizdi. Şimdi:

* **GPU = üretim yolu:** `renderDebug(w, h)` seçeneksiz (⇒ `params.axisGuard`, κ_a = 0.15, görsel modla aynı). E32 = `traceRay` varsayılanı (koruma AÇIK, `kappaAxis` 0.15). R64 = DP5(4) (rtol 1e-10, **`rEscape` = GPU ile aynı 300**: algoritma doğruluğu; r_esc=1e4'e göre kesme hatası dahil kaçış yönü ayrıca *bilgi* olarak basılır).
* **κ_a eşitliği** her kurulumda assert edilir (`guard-assert.mjs`): GPU'ya yüklenen κ_a = CPU `DEFAULT_OPTIONS.kappaAxis` = `AXIS_KAPPA` = 0.15; `{axisGuard:false}` yolunda 0; `params.axisGuard` varsayılanı true.
* **[PORT-ÜRETİM]** GPU ↔ E32 (koruma açık/açık) ve **[PORT-4a]** GPU `{axisGuard:false}` ↔ E32 `{axisGuard:false}` (4a'nın korumasız birebir portu hâlâ doğru mu): mutlak eşikler — sınıf/vuruş uyuşmazlığı ≤ %0.2; medyan Δr ≤ 2e-5, p99 ≤ 5e-3; medyan ΔgCam ≤ 1e-5, p99 ≤ 2e-4; yön medyan ≤ 1e-5, p99 ≤ 1e-3 rad; adım== ≥ %98. Fark yalnız yuvarlama sırası / sin-cos / bölme gerçeklemesidir.
* **[NİHAİ]** GPU(üretim) ↔ R64, **E32'den bağımsız mutlak eşikler**: sınıf uyuşmazlığı ≤ **%0.1**; Δr medyan ≤ 2e-4, **p99 ≤ 2e-3**; ΔgCam medyan ≤ 5e-6, **p99 ≤ 1e-4**; kaçış yönü medyan ≤ 1e-4, **p99 ≤ 5e-4 rad**. Gerekçe: denetçinin korumalı yolda ölçtüğü (sınıf 0 / Δr p99 ≤ 7.7e-4 / ΔgCam p99 ≤ 3.2e-5 / yön p99 ≤ 2.3e-4) değerlerin 2–3× marjı; bizim ölçümümüz aynı (tabloda: maks Δr p99 7.7e-4 [D], ΔgCam p99 3.0e-5 [D], yön p99 2.3e-4 [F]). **Kurulum geçersiz kılmaları:** *mobile* (κ=0.10, N=256) yalnız ΔgCam p99 ≤ **3e-4** (ölçülen 1.3e-4; RK4 kesme hatası ∝ κ⁴ ile ΔgCam p99'u ~7× büyütür, E32–R64 aynıdır; Δr p99 1.0e-3 ve diğerleri 2e-3 altında kalır); *r_cam=200 (J)* BİLGİ (f32 koşullanması: Δr p99 1.1e-2, §9) — eşiksiz ama tabloda. *L (θ=179°)*: yalnız [PORT] medyan Δr ≤ 5e-5 (ölçülen 2.4e-5): f32 θ'nın π yakınında ulp'si 2.4e-7, sinθ_cam = 0.017 ⇒ göreli 1.4e-5 hata; GPU ve E32 sinCos'u θ'yı 1 ulp farklı yuvarlayabilir (kuzey kutbunda aynı ölçüt 2.2e-6; bkz. §12 K1).
* **[UZAMSAL]** GPU–R64 uyuşmazlık haritası: merkez sütun bandında (|i−i_c| ≤ 6) ≥ 2 uyuşmazlık **ya da** herhangi bir 5×5 blokta (Chebyshev ≤ 4) ≥ 2 uyuşmazlık = kümelenme = BAŞARISIZ. Eksen kusuru merkez sütunda onlarca piksellik küme olarak görünür (korumasız: 39–110 piksel), kritik eğrinin rastgele tek-piksel çevirmeleri kümelenmez. Tablo sütunu "bant / kümelenen".
* Bütçesi biten ışınlar (analitik fate): GPU–E32 uyuşmazlığı ≤ ⌈%2⌉, **GPU–R64 ≤ ⌈%1⌉ (mutlak)**; merkez sütun (L=0) GPU–E32 ve GPU–R64 sınıf uyuşmazlığı 0, yön ≤ 1e-3 rad. `--selftest-noguard` üretim yolunu bilerek korumasız yapar; betik 60+ ihlalle KIRMIZIYA döner (A: 39 uyuşmazlık, [UZAMSAL] küme, κ_a eşitsizliği) — testin Ö1/Ö2 gerilemesini yakaladığının kanıtı.

**Son koşu (`node tests/render/gpu-validate.mjs`, 45 s): `KABUL EŞİKLERİ: GEÇTİ`, tarayıcı konsolu hata/uyarı YOK.** 96×72 (tek-ızgara 97×73), r_out=20, r_esc=300, κ=0.05/N=512 (mobile 0.10/256). Sütunlar: GPU–R64 [NİHAİ]; GPU–E32 [PORT-ÜRETİM] uyuşmazlık · Δr med/p99; koruma KAPALI GPU–R64 uyuşmazlığı (karşılaştırma):

| Kurulum | GPU–R64 uyuşm. | Δr med / p99 | ΔgCam med / p99 | yön med / p99 (rad) | GPU–E32: uyuşm. · Δr med / p99 | bant / küme | koruma KAPALI GPU–R64 uyuşm. |
|---|---|---|---|---|---|---|---|
| A a=0.9  θ=75° r=50 | 0/6912 | 1.4e-5 / 4.9e-4 | 3.7e-7 / 2.2e-5 | 4.0e-6 / 3.0e-5 | 0 · 2.8e-6 / 3.6e-4 | 0 / 0 | 39 |
| B a=0.998 θ=60° r=50 | 0/6912 | 1.1e-5 / 3.4e-4 | 2.6e-7 / 2.1e-5 | 3.9e-6 / 2.7e-5 | 0 · 2.3e-6 / 2.0e-4 | 0 / 0 | 9 |
| C a=0   θ=85° r=30 | 0/6912 | 1.3e-5 / 5.5e-4 | 2.4e-7 / 9.1e-6 | 2.4e-6 / 4.8e-5 | 0 · 3.8e-6 / 2.9e-4 | 0 / 0 | 44 |
| D a=0.9  θ=π/2 r=30 (tam θ=π/2) | 0/6912 | 6.5e-5 / 7.7e-4 | 2.1e-6 / 3.0e-5 | 2.4e-6 / 2.3e-5 | 0 · 7.0e-6 / 5.4e-4 | 0 / 0 | 50 |
| E a=0.9  θ=75° r=50 maxHits=3 | 0/6912 | 1.4e-5 / 4.9e-4 | 3.7e-7 / 2.2e-5 | 5.0e-6 / 2.2e-4 | 0 · 2.8e-6 / 3.6e-4 | 0 / 0 | 39 |
| F a=0.9  θ=75° r=50 retrograd | 0/6912 | 1.2e-5 / 6.6e-4 | 2.7e-7 / 1.2e-5 | 4.5e-6 / 2.3e-4 | 0 · 3.1e-6 / 4.3e-4 | 0 / 0 | 47 |
| G a=0.9  θ=75° r=50 tek-ızgara (L=0 merkez sütunu) | 0/7081 | 1.3e-5 / 4.3e-4 | 3.5e-7 / 2.4e-5 | 4.0e-6 / 2.9e-5 | 0 · 2.9e-6 / 3.6e-4 | 0 / 0 | 10 |
| H a=0.9  θ=10° r=50 tek-ızgara (kutba yakın kamera) | 0/7081 | 1.6e-5 / 1.0e-4 | 2.3e-7 / 9.4e-6 | 3.7e-5 / 1.5e-4 | 0 · 1.9e-6 / 6.4e-5 | 0 / 0 | 2 |
| I a=0.9  θ=75° r=50 mobile (κ=0.10, N=256) | 0/6912 | 9.0e-5 / 1.0e-3 | 2.5e-6 / 1.3e-4 | 4.1e-5 / 6.0e-5 | 0 · 2.7e-6 / 3.8e-4 | 0 / 0 | 78 |
| J a=0.9  θ=75° r=200 | 1/6912 | 3.1e-4 / 1.1e-2 | 8.3e-6 / 4.3e-4 | 4.1e-5 / 3.4e-4 | 0 · 5.7e-6 / 7.9e-3 | 0 / 0 | 36 |
| K a=0.9  θ=1°  r=50 tek-ızgara (kuzey kutbuna 1°) | 0/7081 | 2.7e-5 / 1.2e-4 | 3.6e-7 / 1.2e-5 | 3.8e-5 / 5.8e-5 | 0 · 2.2e-6 / 6.8e-5 | 0 / 0 | 103 |
| L a=0.998 θ=179° r=40 tek-ızgara (güney kutbuna 1°) | 1/7081 | 2.7e-5 / 2.4e-4 | 3.9e-7 / 2.7e-5 | 3.6e-5 / 9.7e-5 | 0 · 2.4e-5 / 9.7e-5 | 0 / 0 | 110 |
| M a=0.9  θ=3°  r=15 tek-ızgara (kutba yakın + yakın kamera) | 0/7081 | 5.3e-5 / 3.8e-4 | 1.2e-6 / 8.7e-6 | n/a / n/a | 0 · 1.3e-6 / 1.3e-5 | 0 / 0 | 10 |

[PORT-4a] (korumasız GPU ↔ korumasız E32) tüm kurulumlarda eşiklerin içinde (E'de 1 vuruş sayısı farkı, ≤ %0.2; Δr/ΔgCam/yön değerleri yukarıdakilerle aynı mertebe). Korumasız GPU–R64 uyuşmazlığı (son sütun, tüm kurulumlarda eksen kusuru) §8.2'de ayrıntılı. E32–R64 (bilgi): J ve L'de 1, diğerlerinde 0 uyuşmazlık.
Ek bulgular: bütçesi biten ışınlarda GPU–E32 ve GPU–R64 sınıf uyuşmazlığı 0 (B: 103/103, L: 92/92 yakalandı = R64); θ=π/2 negatif kontrol (D) çalışıyor (planeGuard kapalı ⇒ GPU çıktısı değişir); L=0 merkez sütunu (G/H/K/L/M, 73 piksel) 0 uyuşmazlık; ikinci vuruş (E) Δr medyan 1.8e-5. Kaçış yönü, R64 r_esc=1e4'e karşı (kesme hatası dahil, bilgi): p99 ≤ 3.4e-4 (H'de 2 pikselde 2.1e-3: (b/r_esc)³ kesme hatası).
Not (kutuplar): K (θ=1°, kuzey) ve L (θ=179°, güney) iki kutupta da R64'e uyuşur (0 ve 1 piksel); güney kutbunda f32 θ çözünürlüğü kuzeyden 2400× kabadır (ulp(π)=2.4e-7 ↔ ulp(1e-3)=1e-10) — bilinen sınır §12.

### 8.2 Eksen koruması (`tests/render/axis-guard-validate.mjs`: `GEÇTİ`)
Aynı kurulumlar + **kutba yakın üçü (P1 θ=1°, P2 θ=179°, P3 θ=3°/r=15; denetim Ö2.5)**: GPU `{axisGuard:false}` (4a portu) ↔ GPU `{axisGuard:true}` ↔ R64 (aynı r_esc). Ayrıca seçeneksiz `renderDebug()` çıktısının `{axisGuard:true}` ile **bit-bit aynı** olduğu ve κ_a'nın CPU ile eşit olduğu assert edilir. Sınıf uyuşmazlığı (R64'e göre), bütçesi biten, ortalama adım, kaçış yönü hatası (rad), eksenden uzak Δr medyanı (KAPALI → AÇIK):

| Kurulum | uyuşmazlık (merkez bant) | bütçesi biten | ort. adım | yön p99 | yön maks | eksenden uzak Δr med |
|---|---|---|---|---|---|---|
| A a=0.9 θ75° r50 | **39 → 0** (bant 39 → 0) | 0 → 0 | 92.6 → 93.7 (+%1.2) | 3.3e-2 → 3.0e-5 | 7.7e-1 → 6.5e-3 | 1.4e-5 → 1.4e-5 |
| B a=0.998 θ60° r50 | **9 → 0** (bant 9 → 0) | 103 → 103 | 69.0 → 69.5 (+%0.8) | 3.1e-3 → 2.7e-5 | 9.8e-2 → 3.5e-5 | 1.1e-5 → 1.1e-5 |
| C a=0 θ85° r30 | **44 → 0** (bant 44 → 0) | 0 → 0 | 103.3 → 104.5 (+%1.1) | 4.6e-2 → 4.8e-5 | 7.3e-1 → 1.4e-4 | 1.2e-5 → 1.2e-5 |
| F a=0.9 θ75° r50 retrograd | **47 → 0** (bant 47 → 0) | 0 → 0 | 107.3 → 108.3 (+%0.9) | 3.5e-2 → 2.3e-4 | 7.7e-1 → 6.5e-3 | 1.2e-5 → 1.2e-5 |
| G a=0.9 θ75° r50 tek-ızgara (L=0 sütunu) | **10 → 0** (bant 10 → 0) | 0 → 0 | 92.7 → 93.3 (+%0.7) | 7.0e-2 → 2.9e-5 | 1.0e+0 → 5.4e-4 | 1.3e-5 → 1.3e-5 |
| H a=0.9 θ10° r50 tek-ızgara | **2 → 0** (bant 2 → 0) | 2 → 0 | 59.4 → 60.2 (+%1.2) | 1.5e-4 → 1.5e-4 | 1.5e-4 → 1.5e-4 | 1.6e-5 → 1.5e-5 |
| J a=0.9 θ75° r200 | **36 → 1** (bant 35 → 0) | 1 → 1 | 125.4 → 126.5 (+%0.9) | 1.4e-2 → 3.4e-4 | 6.4e-1 → 2.2e-2 | 2.8e-4 → 2.8e-4 |
| K a=0.9 θ75° r50 ince ızgara 240×180 (merkez şerit) | **229 → 0** (bant 229 → 0) | 0 → 0 | 92.5 → 93.6 (+%1.2) | 3.6e-2 → 3.0e-5 | 3.0e+0 → 9.7e-3 | 1.3e-5 → 1.3e-5 |
| P1 a=0.9 θ=1° r50 tek-ızgara (kuzey kutbuna 1°) | **103 → 0** (bant 67 → 0) | 85 → 0 | 66.4 → 69.9 (+%5.2) | 2.4e-1 → 5.8e-5 | 2.4e-1 → 5.8e-5 | 2.5e-3 → 2.8e-5 |
| P2 a=0.998 θ=179° r40 tek-ızgara (güney kutbuna 1°) | **110 → 1** (bant 70 → 0) | 174 → 92 | 62.8 → 68.0 (+%8.2) | 4.6e-3 → 9.7e-5 | 4.6e-3 → 9.7e-5 | 5.7e-3 → 2.7e-5 |
| P3 a=0.9 θ=3° r15 tek-ızgara (kutba yakın + yakın kamera) | **10 → 0** (bant 10 → 0) | 0 → 0 | 44.4 → 54.0 (+%21.4) | n/a → n/a | n/a → n/a | 5.6e-3 → 6.9e-5 |

Eksenden uzak piksellerde Δr medyanı bozulmadı (kutba yakın kurulumlarda **düzeldi**: P1 2.5e-3 → 2.8e-5, P2 5.7e-3 → 2.7e-5, P3 5.6e-3 → 6.9e-5 — kutba yakın kamerada ekran ışınlarının çoğu |L| küçüktür, bu yüzden "eksenden uzak" kümesi de kusurdan etkilenmişti).
Kalan: r_cam=200 + 90° görüş açısında eksenden geçen ışınlarda 1–2.5° (R64 aynı r_esc) hata — f32 koşullanması (§9), koruma çözünürlüğünden değil (κ_a=0.05 aynı sonucu verdi).

**Adım artışı ölçütü (güncellendi, denetim Ö2.5).** Eski ölçüt: ortalama adım artışı ≤ %20. Eksenden uzak kameralarda artış %0.7–1.2'dir (eksenden geçen ışınların oranı küçüktür). Kutba yakın kamerada ekran ışınlarının *çoğu* eksene yakın (|L| küçük) olduğundan koruma birçok ışında etkin olur: P1 +%5.2, P2 +%8.2, **P3 (θ=3°, r=15) +%21.4** (denetçi +%22 ölçmüştü). Bu artış korumasız yolun *yanlış* sonucu karşılığıdır (P3'te R64'e aykırı 10, P1'de 103, P2'de 110 piksel, bütçesi biten P2'de 174 → 92). Ölçüt: kamera kutuptan ≥ 5° uzakken **≤ %20**; kutba ≤ 5° yakın kurulumlarda (`polar`) **≤ %30** (ölçülen maks %21.4 + ≈%40 marj). Süre: SwiftShader'da koruma KAPALI/AÇIK ms oranı 0.97–1.16 (A, P3, P1; ölçüm gürültüsü ±%15–30 ile ayırt edilemez).

### 8.3 Disk fotometrisi (`tests/render/photometry-validate.mjs`: `GEÇTİ`)
GPU `renderDebugPhoto` (96×72, türbülans/kenar kapalı, **üretim yolu: seçeneksiz ⇒ eksen koruması AÇIK**; κ_a eşitliği assert edilir) ↔ CPU: `src/physics/disk.js` (`diskTemperatureProfile`, `blackbodyToLinearSRGB` integrali, tablo/LUT/seri örnekleyicileri) ve E32 `traceRay` (`hit.r`, `hit.gCam`; koruma varsayılan AÇIK). Göreli hata yalnız I ≥ 1e-3 piksellerde.
**Düzeltme (denetim Ö2.6):** önceki sürüm GPU'yu korumasız çalıştırıp CPU E32 korumalıyken karşılaştırıyordu ve [U-U] katmanı fark edilmeden bozulmuştu (S1: T_obs p99 3.9e-3, I p99 2e-2) çünkü [U-U] için eşik yoktu. Artık korumalı yol kullanılıyor ve [U-U] **p99 eşikleri** var: **T_obs ≤ 2e-4, I ≤ 1e-3** (ölçülen maks p99: 6.8e-5 / 3.6e-4).
**[PORT]** = GPU ↔ CPU(f64, *aynı formül*, GPU'nun kendi r, g_cam'ı ile) — yalnız f32/cihaz aritmetiği; eşik medyan ≤ 1e-5, p99 ≤ 2e-4. **[TABLO]** = CPU(tablo+LUT) ↔ CPU(tam integral) — enterpolasyon/seri/Wien yaklaşıklığı (eşik medyan ≤ 2e-3). **[U-U]** = GPU ↔ CPU(tam), r ve g_cam CPU E32 izinden — uçtan uca. **[K2]** = *bağımsız* mod B anlamı: `I = f_col⁻⁴·Y(T_obs)/Y(T_max)` (GPU'nun T_obs'u + physics/disk.js tam Planck integrali; eşik medyan ≤ 2e-3, p99 ≤ 1e-2) — Y_ref = Y(T_max) kararının (K2) GPU'da uygulandığını gösterir; S8'de (f_col=1.7) g=1,τ=1 tepe ≈ 0.416.

| Kurulum (n disk pikseli) | [PORT] T_obs med/p99 | [PORT] I med/p99 | [PORT] RGB med/p99 | [TABLO] I med/maks | [U-U] T_obs med/p99 | [U-U] I med/p99 | [K2] med/p99 |
|---|---|---|---|---|---|---|---|
| S1 a=0.9 θ75° Tmax=1e4 f=1, **B** (3384) | 3.8e-8 / 1.4e-7 | 1.9e-6 / 6.1e-6 | 1.9e-6 / 5.5e-6 | 1.3e-4 / 1.2e-3 | 3.6e-6 / 4.7e-5 | 1.3e-4 / 3.6e-4 | 1.4e-4 / 2.9e-4 |
| S2 aynı, **A (bolometrik)** (3384) | 3.8e-8 / 1.4e-7 | 1.3e-7 / 5.2e-7 | 4.0e-7 / 9.7e-7 | 1.4e-5 / 5.7e-4 | 3.6e-6 / 5.4e-5 | 1.4e-5 / 2.2e-4 | – |
| S3 Tmax=1e6 (**T_obs>1e5 K: seri**) (3384) | 3.7e-8 / 1.4e-7 | 5.8e-7 / 1.7e-6 | 5.8e-7 / 1.7e-6 | 5.6e-6 / 1.6e-4 | 3.6e-6 / 6.8e-5 | 6.3e-6 / 8.0e-5 | 9.3e-6 / 1.0e-5 |
| S4 a=0 θ85° Tmax=2000 (**T_obs<1e3 K: Wien**, 61 piksel) (1982) | 2.9e-8 / 1.0e-7 | 5.4e-6 / 1.6e-5 | 5.1e-6 / 1.5e-5 | 4.2e-4 / 1.1e-3 | 7.0e-7 / 2.3e-5 | 4.2e-4 / 8.1e-4 | 3.9e-4 / 6.7e-4 |
| S5 a=0.998 θ60° Tmax=1e5 f=1.7 (137 piksel >1e5 K) (5570) | 4.9e-8 / 1.8e-7 | 1.5e-6 / 3.4e-6 | 1.6e-6 / 3.5e-6 | 5.5e-6 / 1.9e-3 | 5.4e-6 / 2.9e-5 | 5.5e-6 / 4.1e-5 | 8.3e-6 / 2.1e-5 |
| S6 retrograd Tmax=3e4 f=1.7, A (2636) | 4.5e-8 / 7.0e-7 | 1.1e-7 / 2.6e-6 | 1.3e-7 / 3.0e-6 | 8.9e-6 / 8.1e-5 | 2.2e-6 / 5.3e-5 | 8.7e-6 / 2.1e-4 | – |
| S7 a=0.5 θ60° r20 Tmax=8e3 f=1.3 (5034) | 4.5e-8 / 1.9e-7 | 1.5e-6 / 3.9e-6 | 1.7e-6 / 4.5e-6 | 8.6e-5 / 7.1e-4 | 8.6e-7 / 3.6e-5 | 8.5e-5 / 3.0e-4 | 8.0e-5 / 1.7e-4 |
| S8 a=0.9 θ75° Tmax=1e4 **f=1.7** (K2) (3384) | 4.4e-8 / 1.7e-7 | 1.3e-6 / 3.8e-6 | 1.6e-6 / 4.5e-6 | 7.4e-5 / 9.9e-4 | 3.6e-6 / 5.2e-5 | 7.3e-5 / 2.7e-4 | 7.9e-5 / 1.7e-4 |

[PORT] mutlak eşiklerin (1e-5 / 2e-4) **~5–1000×** altında; [TABLO] hataları `disk.md §5.4`'teki LUT hatasıyla (log₁₀Y ≤ 3.7e-4 ⇒ ≈ %0.09) uyumlu (I medyan 1e-4 mertebesi, maks 1.9e-3). [U-U] maksimumlar (T_obs ≤ 2e-3, I ≤ 1.2e-2) disk kenarında GPU/E32 ışınının farklı yarıçapa düştüğü tek tük piksellerdir (p99 ≤ eşiklerin 3–5× altında).
ESTETİK sağlık denetimi: kenar yumuşatma GPU ↔ CPU smoothstep maks |Δ| 1.6e-7; türbülans çarpanı (amp 0.3, 384×288 ızgara, 54 260 piksel) ortalama 1.013, σ 0.214, aralık 0.52–1.88.
(Kaba 96×72 ızgarada türbülans çarpanı ≡ 1: piksel ayak izi (0.77 M) hücreden (1 M) büyük ⇒ ayak izi süzmesi tüm oktavları **doğru olarak** söndürür.)

### 8.4 Hat davranışı (`tests/render/pipeline-check.mjs`: `HAT TESTİ: GEÇTİ`)
T1 `exposure` değişimi **0** yeni iz sürme karesi (post çalışır, tuval ×0.50), `Tmax` değişimi iz sürme çalıştırır · T2 parametre değişince iz sürme genişliği 80 (=0.5×160), durunca ≈152 ms sonra 160 ve 3/3 kare biriktirilir ·
T3 `animationFps=4` ⇒ 2 s'de 10 kare (60 ⇒ 35), kare süresi hedefi tutmayınca `dynamicScale` 1 → 0.35 · **T4 bloom kapalı + tonemap none: 10 029 disk pikselinde |tuval − sRGB(0.5·radyans)| maks 1.45/255, ort 0.40** (fiziksel/estetik ayrımı) ·
T5 8 kare ↔ 1 kare parlaklık ×1.0085, iki aynı koşu bit-bit aynı (deterministik yıldız/biriktirme) · T6 8-bit yedek hedef çalışır (ort 4.09, maks 18/255 sapma; yalnız acil yedek) · T7 `stop()` sonrası 0 kare · konsol temiz.
`api-smoke`: tüm kontroller geçti (4b varsayılanları, kıstırma, geçersiz değerler, çözünürlük ölçeği 80×60 iz sürme / 160×120 tuval; yörünge kontrolü **ayrı tuvalde `{controls:true}` ile ikinci bir renderer'la** sınanır — uygulamanın renderer'ı artık `controls:false`, eski test varsayımı 1b7c0de'den beri kırıktı). `npm run build`: dist 646.5 kB (175.8 kB gzip; arayüz katmanı dahil).

## 9. Performans (SwiftShader — gerçek GPU'yu TEMSİL ETMEZ)

SwiftShader CPU yazılım rasterleştiricisidir (4 çekirdek, Xeon 2.1 GHz). Mutlak süreler ve kalite seviyeleri arası oran gerçek donanımda farklıdır. **Ölçüm gürültüsü ±%15** (aynı makine, art arda koşular). Tek kare, 1 piksellik okumayla eşzamanlı, ısınma hariç.
`tam/iz` = tam hat (iz sürme + bloom + ACES kompozit) / yalnız iz sürme (ms), biriktirmesiz tek kare:

| Kurulum | 160×120 | 320×240 | 640×480 | µs/piksel iz sürme (640×480) |
|---|---|---|---|---|
| A a=0.9 θ75° r50 high | 81 / 77 | 318 / 315 | 1292 / 1223 | 4.0 |
| A mobile (κ=.10, N=256) | 58 / 56 | 228 / 231 | 900 / 813 | 2.6 |
| B a=0.998 θ60° high | 53 / 53 | 198 / 195 | 810 / 816 | 2.7 |
| C a=0 θ85° r30 high | 98 / 110 | 369 / 383 | 1391 / 1375 | 4.5 |

**4a ile karşılaştırma (aynı makine, aynı gün, `git show HEAD:` kopyası):** A high 160×120/320×240/640×480 = 58 / 196 / 816 ms; mobile 29 / 126 / 431; B 38 / 177 / 625; C 55 / 276 / 960. Yani 4b iz sürmesi ≈ **+%10…+%60** (kurulum/boyuta bağlı: A high 640×480 816 → 1223 = +%50, 320×240 196 → 315 = +%61; B high 320×240 177 → 195 = +%10; C high 640×480 960 → 1375 = +%43; 160×120'de sabit yük ve gürültü baskın).
Ayrıştırma (320×240, A high; kopya üzerinde `shadeRay` sabitlenerek): iz sürme çekirdeği **değişmedi** (≈165–200 ms, 4a ile aynı); ek maliyet gölgelendirmeden: disk fotometrisi ≈ %20–25, gökyüzü (Samanyolu bandı + dir) ≈ %10, yıldız katmanları ≈ %25 (27 hücre × 2 katman), türbülans ≈ %0–2 (disk piksellerinde 8 değer gürültüsü), eksen koruması ≈ %0–8 (ortalama adım +%1; gürültü içinde),
bloom + kompozit ≲ %10. Bileşen tablosu (`perf.mjs` bölüm 2): tam varsayılan 100 %, yıldız+MW kapalı ≈ 73–81 %, çekirdek+fotometri ≈ 75–84 %. Disk kapalı (her ışın uzağa gider) ≈ 180 % (jeodezik maliyeti).
`sinCos` / yerel `sin/cos`: 1.17–1.26×. Gerçek GPU'da ölçülmedi; mobil için `quality:'mobile'`, `performance:'battery'`, `animate:false` bu maliyeti ~2–3× azaltır (κ/N + ölçek).


### 9.1 4c önce/sonra (SwiftShader, GÖRECELİ; gürültü ±%30, GPU kuyruğu patlamalı çalışır — mutlak değerlere güvenmeyin)
**Aşama maliyeti (`perf.mjs`, eşzamanlı, A high, ms/kare):**

| boyut | birleşik (eski) | T+S | yalnız S | yalnız A | A + kompozit (bloom önbellekli) | (A+komp)/(T+S) |
|---|---|---|---|---|---|---|
| 160×120 | 136 | 122 | 40 | 3 | 5 | 0.04 |
| 320×240 | 480 | 432 | 172 | 22 | 16 | 0.04 |
| 640×480 | 1622 | 1683 | 576 | 41 | 73 | 0.04 |

Eski hatta animasyon karesi = birleşik (+ bloom + kompozit); yeni hatta ≈ %4. Yalnız-gölgelendirme parametresi (Tmax, yıldız…) ≈ %35 (geodezik yok). T+S ≈ birleşik (gürültü içinde). Sürükleme kare başı maliyeti ≈ değişmedi (T+S + ~%4 A); kazanç çözünürlük politikasından (piksel bütçesi, `auto` denetleyici) gelir.
**Gerçek rAF döngüsü (`perf-frame.mjs`; eski = battery/balanced, iz sürme çözünürlüğü dinamik ölçekle 0.3–0.59'a düşmüş; yeni = auto):**

| senaryo | iPhone 390×844@3 eski | iPhone yeni | masaüstü 1440×900 eski | masaüstü yeni |
|---|---|---|---|---|
| (a) durağan: yakınsadıktan sonra 3 s'de çizilen kare / rAF | 0 | 0, `mode:'idle'`, rAF durur | 0 | 0 |
| (b) animasyon, iz sürme/sn | 1.3–3.0 (her kare tam iz sürme) | **0** | 0.3 | **0** |
| (b) animasyon kare/sn, iz sürme çözünürlüğü | 1.3–3.0 @ 175×380 (0.07 Mpx) | 0.5–5.5 @ 585×1266 (0.74 Mpx) | 0.0–0.3 @ 850×531 | 0.0–2.0 @ 1440×900 (1.3 Mpx) |
| (c) sürükleme kare/sn | 3.3 @ 175×380 | 2.6 @ 234×506 | 0.5 @ 850×531 | 0.2 @ 1440×900 (yarı ölçek 720×450) |

Not: yeni hat animasyonda 11× (iPhone) / 2.4× (masaüstü) daha fazla piksel üzerinde, iz sürme yapmadan çalışır; SwiftShader'da A+kompozit+bloom 1.3 Mpx'te bile CPU rasterleştirici için ağırdır (kare/sn düşük görünür), gerçek GPU'da bu geçişler ms mertebesindedir (doğrulanamadı). Sürüklemede masaüstü yeni < eski görünmesi: eski hat dinamik ölçeği 0.59'a indirmişti, yeni denetleyici 6 s içinde yeterli örnek toplayamadı (kare 5–6 s) — gerçek GPU'da kareler ms olduğundan denetleyici hızlı yakınsar (SwiftShader'da doğrulanamaz).

## 10. CPU'dan farklar ve gerekçeleri (4a, güncel)

1. **Kendi `sinCos`'u** (`trig.glsl`): cihaz `sin/cos`'u kullanılmaz (SwiftShader mutlak hata maks 1.9e-4; `sinCos` ile GPU–E32 medyan Δr 3.9e-4 → 2.8e-6). `{nativeTrig:true}` yerel sürümü açar (yeniden üretmek için `trig-probe.mjs`).
2. **Başlangıç p_r f32'de** Carter bağıntısından; **kamera sabitleri** f64'te hesaplanıp f32 uniform; `roll` desteklenmez.
3. **Hermite kesişimi:** CPU 60, GPU 24 ikiye bölme. **`g`:** r^{3/4} = √r·√√r; tanımsız ⇒ `g = 0`.
4. **`hasTurningPointBelow`/`cbrt`/`acos` f32'de.** `rEscape` varsayılanı 4b'de `max(300, 2 r_cam, 6 b_max)` (CPU: max(1e4, 2 r_cam)); NaN ⇒ yakalandı. `t` integre edilmez.
5. **4b — eksen koruması (§2.1): görsel modda CPU E32'den KASITLI sapma** (CPU referansı hatalıdır). Debug yollarında varsayılan = görsel modla aynı (açık); korumasız 4a portu yalnız açık `{axisGuard:false}` ile (`gpu-validate` [PORT-4a]).
6. **4b — ISCO altı:** `diskIn` ISCO'dan küçük kıstırılır (önceden ESTETİK ekstrapolasyondu).
7. **4b — ESTETİK yaklaşıklar:** disk fotonlarının varış gecikmesi (ışık yolu süresi) türbülans animasyonunda yok; disk iki yüzü aynı ışır; limb darkening yok.
8. Sınırlar: a ≤ 0.998, θ_cam ∈ [1e-3, π−1e-3], r_cam ∈ [r₊+0.25, 1000].

## 11. Görsel inceleme (`node tests/render/visual-snapshots.mjs` → `/tmp/karadelik-gorsel-4b/`) — bulunan ve düzeltilen kusurlar

1. **Merkez sütunda dikey "nokta zinciri" (hem gökyüzünde hem diskte, ~12 piksel genişliğinde)** — 4a görüntüsünde de vardı. Neden: eksen sıçramasının çözülememesi (§2.1). Düzeltildi (eksen koruması); R64'e karşı 5040 piksellik şeritte aykırı 443 → 0.
2. **Yıldızlar neredeyse görünmez/seyrek** — ilk sürümde küp yüzü hücreleri + Gauss genişlik tavanı (`cap` = 0.39 piksel < PSF) yıldızı yarım-piksel noktaya düşürdü. Küp yüzü yaklaşımı **dikişsiz 3B kafesle** değiştirildi (§7.2); taban olasılığı band artışı doymasın diye düşürüldü.
3. **Disk her yerde beyaza doymuş** — varsayılan pozlama 1 idi; I dağılımı (medyan 0.47, p90 1.15) ölçülüp varsayılan `exposure` 0.5 yapıldı.
4. **Türbülans "fırça darbesi" gibi çok çizgisel** — akış-haritası periyodu 150 → 50 M (diferansiyel dönmenin sarması azaldı), `turbulenceAmp` 0.45 → 0.3.
5. **Geniş açı + uzak kamerada alt kenarda "kanat" şeklinde yıldız bozulması** — kaçış yönü kesme hatası (b ≈ r_esc). `rEscape 'auto'` b_max'a göre ölçeklendi; kanatlar kayboldu.
6. **Samanyolu görünmüyordu** — yaygın ışık ≈ 4× artırıldı, yıldız yoğunluğu artışı görünür hale getirildi (taban p0 düşürülerek).
Gözle onaylananlar: yaklaşan (mavi-beyaz, parlak) taraf solda, uzaklaşan (turuncu-kahve, sönük) sağda; gölge a>0 için sağa kaymış; ISCO'ya doğru disk kararır; fotonlar halkası (n=2 ince yay) hâlâ var; yıldızlar kutup dikişi olmadan.
Çıktılar: `01-schwarzschild-yandan-86`, `02-kerr09-75`, `03-kerr0998-85`, `04-kerr09-yuzden-10`, `05-kerr09-yakin-r15` (640×480, 8 kare, `diskTime=40`).

## 12. Bilinen sorunlar / sınırlamalar / fizik–matematik ekibine sorular

* **Gerçek GPU'da ölçüm yok.** Doğruluk SwiftShader'da (gerçek f32), performans yalnız göreli. Windows/ANGLE-D3D ve **iOS/Metal'de** uzun (N=512) döngü zaman aşımı riski ölçülmedi (4c önlemleri §14, doğrulanmadı). Uyarlamalı çözünürlük GPU süresini değil rAF aralığını izler (iOS Safari'de `EXT_disjoint_timer_query` yok).
* **Matematik ekibine:** `src/math` f32-RK4 `traceRay`'in eksen yakını sıçramayı çözemediği (§2.1) 4a'dan beri bilinmiyordu; `math/README §7` taban uyuşmazlıkları (%0.5/%1.4) ve p99/maks Δr ("gölge kenarı") büyük ölçüde buradan geliyor. Öneri: `naturalStep`'e `L ≠ 0` iken göreli-θ ve bariyer zaman-ölçeği sınırı (trace.glsl'deki gibi) ekleyip `bench64/float32` tablolarını yenilemek. GPU–E32 doğrulaması bu hatayı gizledi (ikisi aynı hatayı yapıyor) — E32'ye karşı değil R64'e karşı sınama şart.
* **Matematik ekibine (2):** kaçış yönü kesme hatası ≈ (b/r_esc)³ ve r_cam ≳ 150 + fov ≳ 60°'de f32 koşullanması (b² belirsizliği ≈ 2r²ε) yıldız konumunda ~1° hata verebilir; kalıcı çözüm p_r'yi R(r)'den cebirsel kurmak (math §9).
* **Fizik ekibine:** (1) *[KARARLANDI, K2]* Mod B artık `Y_ref = Y(T_max)` (f_col'dan bağımsız): fiziksel parlaklık f_col⁻⁴·Y(f_col T)/Y(T_max) olarak değişir. `docs/physics/disk.md:143` hâlâ `Y_ref = Y(f_col T_max)` yazıyor — güncellenmesi gerekir (bu ajanın dosyası değil). (2) T < 1e3 K Wien sabiti (2.3e4 K, ±%30) — LUT'u 300 K'ye uzatıp sabiti kaldırmak ister misiniz (görüntüde etkisiz: I < 1e-3)? (3) ISCO altı (plunging) ışıma ve geri dönen ışınım yok; yüksek spinde (a ≳ 0.9) disk iç kısmında önemli olabilir (disk.md §8.3). (4) T>1e5 K'de kromatisite 1e5 K'de donuk (≲ %3 hata; disk.md §5.4) — görüntüde Tmax=1e6'da mavi plato. (5) Opak disk iki yüzünü de aynı ışıtıyor; limb darkening/polarizasyon yok.
* **Estetik uyarılar:** animasyon modunda biriktirme yok ⇒ gölge/disk kenarı anti-alias'sız; dar görüş açısı + 8-bit yedek hedefte düşük kalite; mod B'de `Tmax` değişimi disk parlaklığını Y(T_obs)/Y(T_max) oranıyla normalize eder (T_max'ın kendisi mutlak ölçeği belirlemez), `fCol` ise fiziksel parlaklığı değiştirir (K2); mutlak gösterim parlaklığını `exposure` belirler.
* **K1 — güney kutbu f32 sınırı (bilinen sınır, düzeltilmedi):** f32'de θ ≈ π yakınında θ çözünürlüğü ulp(π)=2.4e-7'dir (θ ≈ 0'da ulp(1e-3)=1e-10); bu yüzden güney kutbuna ≲ 1° yakın kamerada ya da çok küçük |L| ≠ 0 (π − θ_min ≲ 1e-5) ışınlarda L²cosθ/sin³θ bariyeri bozulabilir. Çare (θ>π/2'de durumu (π−θ, −p_θ) yansıtılmış yarıkürede tutmak) ışının ekvatoru geçtiği her yerde yeniden yansıtmayı, kesişim/açı çıktılarında dönüşümü ve `src/math` E32 ile **bit düzeyi birebirliğin kaybını** gerektirdiğinden YAPILMADI. Ölçüm: L kurulumu (a=0.998, θ=179°, merkez sütun L=0 dahil) R64'e göre 1/7081 uyuşmazlık, Δr p99 2.4e-4, yön p99 9.7e-5 — pratikte gözlenebilir bir sorun yok; yalnız GPU–E32 medyan Δr 2.4e-5 (kuzeyde 2.2e-6) yuvarlama farkı var. Merkez sütun tam L=0'dır (|L|<1e-7 ⇒ 0 dalı); 1e-7 < |L| < 1e-5 bandına ancak güney kutbuna ≲ 1e-3 rad yakın kamerada ve aşırı yüksek çözünürlükte (x adımı ≲ 2e-4) ulaşılır.
* **Yıldız yayları (Ö3):** nokta kaynak modeli uygulandı (§7.2); merceklenmiş yıldızlar artık yay değil noktadır. Kritik eğriye çok yakın piksellerde dFdx/dFdy 2×2 dörtlük kabalığı ve `STAR_MU_CAP` (ESTETİK) tavanı geçerlidir. Sonlu çaplı kaynak (Güneş benzeri yakın yıldız) modellenmedi.
* 8-bit yedek HDR hedefi (float renderable yoksa): radyans/8, bloom yok, ort. sapma 4/255 (yalnız acil yedek; gerçek cihazda sınanmadı).
* `analyticFate=false` GPU'da ayrıca doğrulanmadı. `roll` yok. `three` tamamı paketlenir (604 kB).

## 13. Testleri çalıştırma

```
node tests/render/gpu-validate.mjs [--grid=96x72] [--quick] [--json=cikti.json] [--selftest-noguard]   # CPU↔GPU çekirdek (üretim yolu + R64 mutlak eşikler + uzamsal küme); eşik sağlanmazsa çıkış kodu 1; --selftest-noguard: bilerek kırmızı
node tests/render/photometry-validate.mjs [--grid=96x72] [--json=cikti.json]      # T_obs/parlaklık/RGB: GPU ↔ disk.js + traceRay gCam
node tests/render/axis-guard-validate.mjs [--grid=96x72]                          # eksen koruması ↔ R64
node tests/render/pipeline-check.mjs                                               # biriktirme, etkileşim, animasyon, dinamik ölçek, fiziksel/estetik ayrımı, 8-bit yedek
node tests/render/api-smoke.mjs                                                   # API sözleşmesi
node tests/render/perf.mjs [--frames=3]                                           # ms/kare, bileşen maliyeti, 4c aşama maliyetleri (T+S / S / A)
node tests/render/perf-frame.mjs [--profile=iphone|desktop|both] [--perf=auto|battery|balanced] [--secs=6]   # gerçek rAF döngüsünde durağan/animasyon/sürükleme (önce/sonra)
node tests/render/steprule-study.mjs [--cams=32] [--grid=80x60]                    # stepRule full ↔ nodrag, rastgele kameralar, R64'e karşı
node tests/render/gpu-validate.mjs --steprule=nodrag      # adım kuralını CPU E32 ile birlikte değiştirir (axis-guard-validate de --steprule alır)
node tests/render/visual-snapshots.mjs [--out=/tmp/karadelik-gorsel-4b] [--size=640x480] [--frames=8] [--only=ad]   # PNG'ler (gözle denetim)
```
Vite sunucusu ve Chromium (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`) betik içinden başlar/kapanır. Chromium'un test kodunun kendi `readPixels` çağrılarından ürettiği "GPU stall" performans uyarısı pipeline/perf testlerinde süzülür (üretim kodunda `readPixels` yok; `benchmark()` ve test hariç).

## 14. iOS / iPadOS Safari (WebGL2) özel notlar — 4c

**Gerçek cihazda doğrulanmadı** (SwiftShader + bilinen WebGL2/iOS kısıtları). Aşağıdakiler kod düzeyi önlemlerdir.

| Konu | Karar / uygulama |
|---|---|
| **Render hedefi türü** | Uzantı adına güvenmek yerine **ham GL ile sınama** (`probeRenderable`): RGBA32F (G önbelleği) ve RGBA16F (HDR) için 4×4 FBO kurulup `checkFramebufferStatus === COMPLETE` aranır (iOS'ta uzantı bildirip eksik kalan sürümler). RGBA16F yoksa 8-bit yedek HDR (bloom yok); RGBA32F yoksa ertelenmiş hat kapanır, birleşik hat çalışır. Bağlam geri yüklenince yeniden sınanır. `EXT_color_buffer_half_float` tek başına RGBA16F için yeterlidir (WebGL2). |
| **LINEAR float doku** | Hiçbir yerde varsayılmaz: G önbelleği, profil (R32F) ve kara cisim LUT'u (RGBA32F) `NEAREST` + `texelFetch` (+ elle `mix`); HDR ara hedefler RGBA16F (WebGL2'de çekirdekte filtrelenebilir). `OES_texture_float_linear` gerekmez. |
| **MRT** | Üretim hattı tek renk eklentisi kullanır (T: 1×RGBA32F; S/A: 1×RGBA16F). 3×RGBA32F MRT yalnız `renderDebug*` (doğrulama) içindir; iOS'un MRT bayt/piksel sınırından kaçınmak için üretimde kullanılmaz. |
| **Hassasiyet** | Her program `precision highp float; highp int; highp sampler2D;` ile başlar (post dahil); döngü sayaçları `int`, mediump'a düşmez. |
| **Uzun döngü / GPU zaman aşımı** | (1) piksel bütçesi `maxTracePixels` (mobil 1.0 Mpx) ⇒ tek kare iş sınırlı; (2) `maxTickPixels` (mobil 0.5 Mpx) aşılırsa durağan/biriktirme işi yatay **şeritlere** bölünür, kare başına bir şerit + `gl.flush()` (görüntülenen kare şeritler arasında değişmez; `pipeline-check` T13 bit-bit eşdeğer); (3) etkileşimde çözünürlük düşük; (4) `stepRule:'nodrag'` en kötü adımı ~%18 (p99) – %54 (B, P2) azaltır ama varsayılan değil (§2.2); (5) bağlam kaybı **60 s içinde tekrarlarsa** `safeLevel` artar ve piksel/şerit bütçeleri ×0.7 küçülür (en çok 4 kademe). |
| **Bağlam kaybı / geri yükleme** | `webglcontextlost` → `preventDefault`, iş ve önbellek bırakılır (geçersiz GL nesneleri dispose edilmez: "object does not belong to this context" uyarısı çıkardı); `webglcontextrestored` → yetenekler yeniden sınanır, **post zinciri, tablolar, malzemeler, geometri, debug hedefleri atılıp yeniden kurulur**, durum sıfırlanır, tam yeniden çizim. Arayüz kendi "bağlam kayboldu" ekranını gösterir (renderer bağımsız). `pipeline-check` T15 (`WEBGL_lose_context`). |
| **Bellek** | Bayt bütçeli LRU (mobil 96 MB); iz sürme boyutları `2^(−k/6)` basamaklı ⇒ az sayıda boyut; tuval tamponu `maxPixelRatio` (2) ile sınırlı ve `MAX_TEXTURE_SIZE`/8192'ye kıstırılır. `dispose()` tüm hedefleri/malzemeleri/olay dinleyicilerini bırakır. |
| **Güç / ısı** | `powerPreference`: mobil/iOS `'default'`, masaüstü `'high-performance'` (opts ile geçersiz kılınır). Boşta rAF durur; gizli sayfada hiçbir iş yok; animasyon ≤ `animationFps` (auto mobil 30, pil azsa 20); ucuz bloom; `antialias:false, depth:false, stencil:false, alpha:false`; `preserveDrawingBuffer` yalnız `opts` ile (UI ekran görüntüsü `renderOnce` + `toBlob` aynı görevde alır). |
| **Cihaz algısı** | iPadOS 13+ `MacIntel` + `maxTouchPoints > 1`, iPhone/iPad UA, Android UA, `(pointer: coarse)`. Yalnız **gösterim/performans** kararlarını (piksel bütçesi, ön ayar, ucuz bloom, önbellek bütçesi) etkiler; fizik/kalite (`quality`) otomatik DEĞİŞMEZ. |
| **Shader derleme** | Ertelenmiş hat yalnız gerekeni derler (T: çekirdek; S: gökyüzü+fotometri; A: türbülans); birleşik program ancak gerekirse. İlk karede derleme süresi (Metal) tarayıcıya bağlıdır. |

**Gerçek cihazda doğrulanamayanlar (öncelik sırasıyla):** (1) iPhone/iPad'de gerçek FPS ve ısınma davranışı; denetleyici hedefleri (33 ms) ve eşikleri (%125 / %62) iOS rAF zamanlamasına göre ayar isteyebilir; (2) `probeRenderable`nin RGBA32F kararı eski iOS 15 cihazlarda; (3) şeritli işin `gl.flush()` ile iOS komut tamponunu gerçekten bölüp bölmediği ve `maxTickPixels` (0.5 Mpx) değerinin güvenli olup olmadığı; (4) bağlam kaybı sonrası otomatik toparlanma (Safari bazen yeniden yüklemeyi tercih eder); (5) Safari 17+ ProMotion rAF 120 Hz'de `animationFps` aralık mantığı; (6) uzun oturumda bellek (Safari sekme limiti).

