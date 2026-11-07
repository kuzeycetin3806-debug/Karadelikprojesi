# GPU ışın izleme çekirdeği ve fotogerçekçi görüntü hattı (`src/render/`, `src/shaders/`) — Adım 4a + 4b

Kerr null geodeziklerinin GLSL ES 3.00 (WebGL2) portu (**4a**, CPU referansına piksel piksel doğrulanmış) ve onun üstünde **fiziksel disk ışıması, yıldız alanı ve HDR görüntü hattı (4b)**.
Fiziksel (doğrusal radyans) ile estetik (bloom, ton eşleme, dağılım/doku seçimleri) her yerde ayrıdır: §5 tablosu.

| Dosya | İçerik |
|---|---|
| `src/render/index.js` | `createBlackHoleRenderer(canvas, opts?)`: sahne/uniform, **iz sürme → bloom → kompozit** hattı, HDR birikim hedefleri, uyarlamalı çözünürlük döngüsü, debug MRT (`renderDebug`, `renderDebugPhoto`) |
| `src/render/params.js` | parametre sözleşmesi: doğrulama/kıstırma, varsayılanlar, kalite + **performans** ön ayarları, **uniform türetimi** (f64 CPU hesapları) |
| `src/render/photometry.js` | disk fotometrisi CPU tarafı: profil tablosu, kara cisim LUT'u, T>1e5 K serisi, `Y_ref`; GPU hesabının CPU eşleniği `diskPhotometryCPU` (doğrulama). `src/physics/disk.js` fonksiyonlarını **içe aktarır** |
| `src/render/post.js` | **ESTETİK** sonradan işleme: çok seviyeli bloom (Jimenez) + kompozit (pozlama, ACES/AgX/Neutral, sRGB, dither) |
| `src/render/controls.js` | GEÇİCİ fare/dokunmatik yörünge kontrolü (kalıcı arayüzü arayüz ajanı yapacak) |
| `src/shaders/*.glsl`, `index.js` | `common` → `trig` → `geodesic` → `integrator` → `camera` → `crossing` → `escape` → `trace` → `noise` → `photometry` → `turbulence` → `stars` → `shading` → `main.frag`; post: `bloom_down/bloom_up/composite.frag.glsl`. `buildFragmentShader({debug, photo, nativeTrig})` birleştirir |
| `tests/render/` | `gpu-validate.mjs` (CPU↔GPU çekirdek), **`photometry-validate.mjs`** (T_obs/parlaklık CPU↔GPU), **`axis-guard-validate.mjs`**, **`pipeline-test.mjs`**, `api-smoke.mjs`, `perf.mjs`, `visual-snapshots.mjs`, `harness.mjs`. **`node --test` ile çalışmaz** |

## 1. Hat

```
  İZ SÜRME geçişi (src/shaders, tam çözünürlük × ölçek)                      FİZİKSEL (+ estetik doku/dağılım seçimleri, §5)
    piksel → ZAMO kamera → Kerr geodeziği (RK4) → disk vuruşu | kaçış yönü | yakalanma
    disk vuruşu  : τ(r) tablosu, T_obs = g_cam f_col T_max τ, kara cisim rengi/parlaklığı        → doğrusal HDR radyans (RGBA16F)
    kaçış        : yön 3B birim vektör → yıldız alanı + Samanyolu, T_obs = ν_cam/ν_∞ T_star
    jitter'lı kareler ortalama (ilerleyici AA); sonuç = doğrusal radyans, pozlamasız, ton eşlemesiz
        │
  BLOOM (isteğe bağlı)   ×exposure → 13-tap aşağı (Karis) ×5 seviye → çadır yukarı örnekleme       ESTETİK
        │
  KOMPOZİT               ×exposure + bloom → ton eşleme (ACES | AgX | Neutral | yok) → sRGB OETF → dither     ESTETİK / gösterim
```
`exposure`, bloom ve ton eşleme **yalnız sonradan işlemdir**: bunlar değişince iz sürme yeniden çalışmaz (yalnız bloom + kompozit; `pipeline-test` T1).
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
**Debug yolunda (`renderDebug`) varsayılan KAPALI** ⇒ `gpu-validate` 4a'nın birebir portunu sınamaya devam eder; `renderDebug(w, h, {axisGuard:true})` korumalı yolu verir.
κ_a = 0.05 doğruluğu iyileştirmedi, ortalama adımı %8–29 artırdı ⇒ 0.15 seçildi (ort. adım artışı ≈ %1).

## 3. Parametre sözleşmesi (arayüz ajanı için)

```js
import { createBlackHoleRenderer } from './render/index.js';
const r = createBlackHoleRenderer(canvas, { controls: true /* geçici yörünge kontrolü */, nativeTrig: false });
r.start();                       // rAF döngüsü; yalnız gerektiğinde çizer (§6); animasyon açıkken sürekli
r.setParams({ a: 0.9 });         // kısmi güncelleme; kıstırılmış TAM parametre nesnesini döndürür
r.getParams();  r.getStats();    // getStats: frames, width/height (tuval), traceWidth/Height, scale, accumCount, dynamicScale, interacting, animating, hdr
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
| `axisGuard` | bool | true | §2.1 (görsel mod) |
| `analyticFate`, `rEscape`, `kappa`, `maxSteps`, `planeGuard` | — | true, `'auto'`, null, null, true | gelişmiş/test; `rEscape 'auto'` = **max(300, 2 r_cam, 6 b_max)**, b_max = r_cam·tan(yarı-köşegen açı) (4b: geniş açı + uzak kamerada kaçış yönü hatası ≈ (b/r_esc)³ büyür) |

### 3.2 Disk ışıması (FİZİKSEL)
| Parametre | Tür / aralık | Varsayılan | Açıklama |
|---|---|---|---|
| `Tmax` | K, [2000, 1e6] | 1e4 | T_eff(r) = Tmax·τ(r) (Page–Thorne profilinin tepe değeri). Kullanıcı doğrudan seçer; (M, ṁ) → `diskMaxTemperatureK` yalnız kısayol |
| `fCol` | [1, 3] | 1 | renk düzeltmesi: T_col = f_col T_eff (yıldız kütleli BH için ~1.7). **Mod B'de parlaklık f_col⁻⁴ ile düşer** ⇒ f_col>1'de `exposure` artırılmalı |
| `brightnessMode` | `'band'` ∣ `'bolometric'` | `'band'` | mod B (band-fotometrik, fiziksel olarak doğru görünür-band kamera) ∣ mod A (bolometrik, (g τ)⁴). Renk her ikisinde aynıdır |

### 3.3 Görüntü hattı (ESTETİK sonrası işlem; iz sürme gerektirmez)
| Parametre | Tür / aralık | Varsayılan | Açıklama |
|---|---|---|---|
| `exposure` | [1e-3, 1e3], doğrusal çarpan | 0.5 | HDR radyans ölçeği. Disk tepe parlaklığı Y_ref = 1 (mod B); 0.5 ⇒ medyan disk ≈ orta gri, tepe doymaz. Önerilen kaydırıcı: log (EV = log₂) |
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
| `diskEdgeFade` | [0, 0.5] | 0.1 | dış kenar yumuşatma (disk genişliği kesri; 0 = sert) |
| `stars` | bool | true | yıldız alanı |
| `starBrightness` | [0, 10] | 1 | yıldız ölçeği |
| `milkyWay` | [0, 2] | 0.6 | Samanyolu bandı (0 = yok) |

### 3.5 Performans / etkileşim
| Parametre | Tür / aralık | Varsayılan | Açıklama |
|---|---|---|---|
| `performance` | `'quality'`∣`'balanced'`∣`'battery'` | `'balanced'` | ön ayar (aşağı). Ayrıca elle geçersiz kılma alanları: |
| `interactionScale` | null ∣ [0.1, 1] | null | hareket sırasında iz sürme çözünürlük çarpanı |
| `accumFrames` | null ∣ 1…64 | null | durağan karede biriktirilecek jitter'lı kare sayısı |
| `animationFps` | null ∣ [5, 120] | null | animasyonda en çok kare/sn |
| `dynamicResolution` | null ∣ bool | null | kare süresi hedefi tutmazsa ölçeği otomatik düşür |
| `progressive` | bool | true | false: biriktirme yok (accumFrames = 1) |
| `resolutionScale` | [0.1, 1] | 1 | durağan iz sürme çözünürlüğü / tuval çözünürlüğü. **Tuval tamponu = CSS × min(devicePixelRatio, maxPixelRatio)**; iz sürme ondan ölçekli ve bilinear büyütülür |
| `maxPixelRatio` | [0.5, 4] | 2 | |

| ön ayar | interactionScale | settleMs | accumFrames | animationFps | dynamicResolution (min–maks ölçek) |
|---|---|---|---|---|---|
| `quality` | 0.6 | 150 | 16 | 60 | kapalı |
| `balanced` | 0.5 | 150 | 8 | 30 | açık (0.35–1) |
| `battery` | 0.35 | 120 | 4 | 15 | açık (0.3–0.7) |

**Arayüz notları.** Tuvale `touch-action:none` `index.html`'de. `controls:false` ile geçici kontrol kapatılıp arayüz kendi `setParams` çağrılarını yapabilir. Kaydırıcı sürüklenirken her `setParams` otomatik "etkileşim" sayılır (düşük çözünürlük →
150 ms sonra tam çözünürlük → jitter biriktirme). Yalnız `exposure/tonemap/bloom*` anında ucuzdur (iz sürme yok). Mobil/iPad: `quality:'mobile'` + `performance:'battery'` (+ `resolutionScale` 0.5–0.75).
`animate:false` tamamen durağan, pil dostu kare verir (animasyon kapalıyken GPU boşta).

## 4. Debug modları

**`renderDebug(width, height, {axisGuard=false}?)`** (4a düzeni **değişmedi**): 3 × RGBA32F (WebGL2 MRT, `EXT_color_buffer_float` şart). `Float32Array` uzunluğu `width·height·12`; piksel (i, j) (**j = 0 üst satır**) için
`(j·width + i)·12 + DEBUG_FIELDS.indexOf(alan)`; `DEBUG_FIELDS` = `status, r1, gCam1, steps, thetaInf, phiInf, n1, hitCount, reason, phi1, r2, gCam2`.
`status`: 0 yakalandı · 1 kaçtı · 2 disk. `reason`: 0 normal · 1 bütçe bitti · 2 NaN. Vuruş yoksa `r1=−1, gCam1=0, n1=0, phi1=−1`; kaçış yönü bilinmiyorsa `thetaInf = phiInf = −1`.

**`renderDebugPhoto(width, height, {axisGuard=false}?)`** (4b; ilk disk vuruşu): `PHOTO_FIELDS` = `status, hitCount, r1, gCam1, tau, Tobs, I, log10Y, R, G, B, turbEdge`.
`tau` = T_eff/T_max, `Tobs` = g_cam f_col T_max τ (K), `I` = parlaklık çarpanı (türbülans/kenar **hariç**; mod A: (gτ)⁴, mod B: Y(T_obs)/Y_ref·f_col⁻⁴), `log10Y` = LUT/seri/Wien log₁₀Y(T_obs),
`R,G,B` = nihai disk radyansı (`I · kromatisite · türbülans · kenar`), `turbEdge` = ESTETİK çarpanların çarpımı.

## 5. Fiziksel ve estetik öğelerin ayrımı

| Öğe | Sınıf | Dosya |
|---|---|---|
| Geodezik integrasyon, adım kuralı, **eksen koruması**, kesişim, yakalanma/kaçış, analitik fate, kaçış yönü | **FİZİKSEL** (sayısal) | `geodesic/integrator/crossing/escape/trace.glsl` |
| `g_cam` (gravitasyonel kayma + Doppler), kamera tetradı, ışık sapması/merceklenme | **FİZİKSEL** | `camera/crossing.glsl` |
| Disk sıcaklık profili τ(r) (Page–Thorne), T_obs = g_cam f_col T_max τ, kara cisim kromatisitesi, mod A/B parlaklığı, T>1e5 K serisi, T<1e3 K Wien | **FİZİKSEL** | `photometry.glsl`, `photometry.js`, `src/physics/disk.js` |
| Opak disk (ilk vuruşta durma), yakalanma = siyah | **FİZİKSEL** (model) | `trace.glsl`, `shading.glsl` |
| Yıldız yönü eşlemesi (3B birim vektör, merceklenme), yıldız renk sıcaklığı → kara cisim, T_obs = ν_cam/ν_∞·T_star, band-luminans kayması, yüzey parlaklığı korunumu (ayak izi süzmesi) | **FİZİKSEL** | `stars.glsl` |
| Yıldız sayısı/parlaklık dağılımı (kesik Pareto)/PSF boyu, sıcaklık dağılımı, **Samanyolu** (şekil, renk, toz, yıldız artışı) | **ESTETİK** | `stars.glsl` |
| Yönü bilinmeyen halka pikselleri için gökyüzü ortalaması | **ESTETİK** (yaklaşım) | `stars.glsl` `skyMeanRadiance` |
| **Disk türbülans dokusu** (Kepler Ω ile akan, çift-fazlı akış haritası), dış kenar yumuşatma, `maxDiskHits>1` yarı saydamlık (α=0.7) | **ESTETİK** | `turbulence.glsl`, `shading.glsl` |
| Pozlama çarpanı | gösterim ölçeği | `composite.frag.glsl` |
| **Bloom**, **ton eşleme** (ACES/AgX/Neutral), dither | **ESTETİK** | `bloom_*.frag.glsl`, `composite.frag.glsl` |
| sRGB OETF (IEC 61966-2-1) | gösterim kodlaması (estetik değil) | `composite.frag.glsl` |
| Jitter'lı kare biriktirme (ilerleyici AA), uyarlamalı çözünürlük, dinamik ölçek | etkileşim / kalite | `index.js` |
| `sinCos` (trig.glsl) | **FİZİKSEL** (sayısal kesinlik) | `trig.glsl` |

`bloom:false, tonemap:'none'` ⇒ tuval = sRGB(min(1, exposure·radyans)) (`pipeline-test` T4: maks 1.45/255).

## 6. Performans ve etkileşim davranışı

* **Hareket/sürükleme:** iz sürme çözünürlüğü `resolutionScale × interactionScale` (varsayılan 0.5 ⇒ ¼ piksel), tuval tamponu tam çözünürlükte kalır (kompozit bilinear büyütür).
* **Durunca:** son değişimden `settleMs` (150 ms) sonra tam çözünürlük; ardından **ilerleyici iyileştirme**: `accumFrames` jitter'lı (Halton 2,3) kare ortalaması (doğrusal HDR'de; AA). Kare başına bir rAF, biriktirme bitince GPU boşta.
* **Animasyon (`animate`+`turbulence`):** sürekli render gerekir; `animationFps` ile sınırlanır (balanced 30). **Biriktirme yok** (hareketli desende hayalet bırakır) ⇒ kenarlar bu modda anti-alias'sızdır; yıldız PSF'i ve türbülans ayak izi süzmesi titreşimi bastırır.
* **Dinamik çözünürlük:** ardışık animasyon/etkileşim karelerinin süresi (rAF) hedefi (animasyonda 1000/animationFps, etkileşimde 33 ms) %40 aşarsa ölçek ×0.9 (alt sınır ön ayardan), 30 kare rahat geçerse ×1.06. GPU zamanı ölçülmez (rAF aralığı).
* Boyuta göre **LRU hedef önbelleği** (4 boyut): etkileşim/ölçek geçişlerinde HDR hedefleri ve bloom zinciri yeniden ayrılmaz.
* Disk animasyonunun **maliyeti**: iz sürme tam yeniden çalışır (türbülans fotometrinin parçası); disk kapalı/animasyon kapalıyken boşta kare yok.

## 7. Disk, yıldız alanı ve halka ayrıntıları

### 7.1 Disk ışıması (`docs/physics/disk.md` §3–§6)
* **Tablolar** (CPU f64 → doku): `diskProfileTable(a, prograde, r_out, 256)` → **R32F 256×1**, `s = √((r−r_isco)/(r_out−r_isco))`; `blackbodyLUT(256)` → **RGBA32F 256×1** `[R,G,B (Y=1), log₁₀Y]`, log₁₀T ∈ [3,5].
  Mobil güvenliği: ikisi de `NEAREST` + shader'da elle `mix` (`OES_texture_float_linear` gerekmez); örnekleyiciler `highp`.
* **Sıcaklık:** `T_obs = g_cam · f_col · T_max · τ(r)` (`hit.gCam`).
* **Mod B (varsayılan):** `I = 10^(log₁₀Y(T_obs) − log₁₀Y_ref) · f_col⁻⁴`, `Y_ref = Y(f_col T_max)` (CPU'da integralden). g³/g⁴ **ayrıca uygulanmaz** (g bağımlılığı Y(gT) içindedir). **Mod A:** `I = (g_cam τ)⁴`.
* **LUT dışı:** T > 1e5 K: kromatisite 1e5 K'de sabit; `log₁₀Y = log₁₀Y_LUT(1e5) + log₁₀(a x − b + c/x)`, x = T/1e5 — katsayılar `blackbodyLuminanceSeries`'ten (3 noktadan 3×3 çözüm; uniform `uSeries`), 1e5 K'ye **çapalı** (süreksizlik yok).
  T < 1e3 K: kromatisite 1e3 K'de sabit, `log₁₀Y −= (2.3e4/ln10)(1/T − 10⁻³)` (Wien; ±%30 @600 K — `disk.md §5.4`).
* ISCO'dan içeride ışıma ve disk **yok** (`diskIn ≥ r_isco`).

### 7.2 Yıldız alanı (`stars.glsl`)
Yön = sonsuzdaki BL yönünden 3B birim vektör `(sinθ_∞cosφ_∞, sinθ_∞sinφ_∞, cosθ_∞)` (**enlem-boylam örneklemesi yok**, 4a'nın kutup dikişi gitti). Kameradan bağımsız ⇒ yıldızlar gökte sabit.
**Dikişsiz 3B kafes:** birim hücreli kafeste, merkezi `|c| ∈ [R−½, R+½]` kabuğunda olan hücrelerde en çok 1 yıldız (PCG tamsayı hash; GPU'dan bağımsız deterministik), yönü `normalize(konum)`; piksel için 27 hücre taranır ⇒ küp dikişi/hücre sınırı kesilmesi yok.
İki katman: parlak/seyrek (R=45, ≈5.6 bin yıldız, F ∈ [0.1, 8]) ve sönük/yoğun (R=130, ≈64 bin yıldız, F ∈ [0.016, 0.32]); kesik Pareto parlaklık; sıcaklık 3000–30000 K (`blackbodyLUT`, soğuk çoğunlukta); Samanyolu bandında yıldız olasılığı artar.
Yıldız = gökte σ_s Gauss disk (σ_s = 0.65 nihai tuval pikseli) ⇒ **yüzey parlaklığı korunur**: merceklenmeyle büyür/yay olarak uzar. Ayak izi (`dFdx/dFdy` yön türevi): `σ_eff² = σ_s² + (ayak izi/2)²`, genlik ×σ_s²/σ_eff² ⇒ küçülen bölgelerde yıldız kaybolmaz (sönük/geniş olur).
Komşu piksel yönü geçersizse (kaçış/yakalanma/disk sınırı) nominal ayak izi kullanılır. **Fiziksel kayma:** `T_obs = (ν_cam/ν_∞) T_star` ve band-luminans oranı 10^(logY(T_obs) − logY(T)).
**Samanyolu (ESTETİK):** galaktik düzlem normali ve "merkez" yönü sabit (disk düzlemine paralel değil); çekirdek + halo + bulge; 4 oktavlı 3B değer gürültüsü (bulutsu/toz şeridi), ayak izine göre oktav söndürme.
Dar görüş alanında (≈30°) yıldızlar yay şeklinde görünür: **bu fiziksel** (r_cam=50'de ekran kenarında bile sapma ≈ görüş alanı kadar).

### 7.3 Yönü bilinmeyen (`thInf = −1`, bütçesi biten, kaçar) halka pikselleri
Bu ışınlar kritik eğriye sonsuz yakındır (çok tur fotonküresinde dolanır) ve gökyüzünün **her yerini** örnekler ⇒ çözülmemiş yıldız toplamı ≈ yaygın ortalama. Yaklaşım: **sabit düşük gökyüzü ortalaması** (`skyMeanRadiance`: Samanyolu ortalaması + zayıf yıldız parıltısı,
ν_cam/ν_∞ ile kaymış). Rastgele yön seçmek halkada "parlayan yıldız gürültüsü" üretirdi. Eksen koruması sonrası bu piksel çok azaldı (160×120: 01 kurulumunda yönü bilinmeyen kaçan 36 → 4, yüzden 10° 20 → 0, mw-bulge 32 → 0, A/B/C 0); a=0.998'de (B) bütçesi biten 103/6912 ışının hepsi **yakalandı**'dır (yön gerekmez). ESTETİK yaklaşım.

## 8. Doğrulama

### 8.1 Çekirdek (`tests/render/gpu-validate.mjs`) — 4a ile **aynı sayılar** (debug yolu koruma kapalı = birebir port)
Üç sonuç aynı kamera/ızgarada karşılaştırılır: **GPU** (SwiftShader, gerçek f32), **E32** (CPU `traceRay`, `rk4`+`f32`+`hamilton`+`hermite`) ve **R64** (CPU DP5(4), rtol 1e-10). Izgara 96×72 (tek-ızgara 97×73), r_out = 20, r_esc = 300.
Kabul eşikleri iki katmanlıdır (4a, değişmedi): (1) GPU–E32 port doğruluğu, mutlak (sınıf/vuruş uyuşmazlığı ≤ %0.2; medyan Δr ≤ 2e-5, p99 ≤ 5e-3; medyan ΔgCam ≤ 1e-5, p99 ≤ 2e-4; yön medyan ≤ 1e-5, p99 ≤ 1e-3 rad; adım== ≥ %98);
(2) GPU–R64 taban çizgisine göreli (≤ 2× E32–R64 + küçük taban) ve README §7'ye dayalı mutlak tavanlar.

**Son koşu (4b kodu, `node tests/render/gpu-validate.mjs`): `KABUL EŞİKLERİ: GEÇTİ`, tarayıcı konsolu hata/uyarı YOK.** Özet (GPU–E32 uyuşmazlık / Δr medyan–p99 / ΔgCam medyan–p99 / yön medyan–p99 rad / adım==; GPU–R64 uyuşmazlık = taban E32–R64):

| Kurulum | GPU–E32 uyuşm. | Δr med / p99 | ΔgCam med / p99 | yön med / p99 | adım== | GPU–R64 uyuşm. (=taban) |
|---|---|---|---|---|---|---|
| A a=0.9 θ75° r50 | 0/6912 | 2.8e-6 / 3.9e-4 | 1.2e-7 / 1.7e-5 | 8.2e-7 / 2.1e-5 | %99.99 | 39 (39) |
| B a=0.998 θ60° r50 | 0 | 2.4e-6 / 2.0e-4 | 1.2e-7 / 1.0e-5 | 6.7e-7 / 1.1e-5 | %100 | 9 (9) |
| C a=0 θ85° r30 | 0 | 3.9e-6 / 2.9e-4 | 1.1e-7 / 1.0e-5 | 5.1e-7 / 1.2e-5 | %99.91 | 44 (44) |
| D a=0.9 **θ=π/2** r30 | 0 | 7.6e-6 / 6.0e-4 | 2.5e-7 / 2.2e-5 | 5.3e-7 / 8.7e-6 | %99.97 | 50 (50) |
| E a=0.9 θ75° maxHits=3 | 1 | 2.8e-6 / 3.9e-4 | 1.2e-7 / 1.7e-5 | 8.4e-7 / 1.5e-4 | %99.68 | 39 (38) |
| F retrograd | 0 | 3.2e-6 / 4.7e-4 | 1.1e-7 / 9.0e-6 | 8.6e-7 / 1.4e-4 | %99.93 | 47 (47) |
| G tek-ızgara (L=0 sütunu) | 0 | 2.9e-6 / 3.5e-4 | 1.2e-7 / 1.8e-5 | 7.8e-7 / 2.0e-5 | %100 | 10 (10) |
| H θ10° tek-ızgara | 0 | 1.8e-6 / 6.7e-5 | 9.6e-8 / 7.6e-6 | 4.7e-7 / 4.3e-6 | %99.99 | 2 (2) |
| I mobile (κ=.10 N=256) | 0 | 2.8e-6 / 4.4e-4 | 1.2e-7 / 1.8e-5 | 8.6e-7 / 1.9e-5 | %99.97 | 78 (78) |
| J r200 [bilgi] | 0 | 5.7e-6 / 8.9e-3 | 1.8e-7 / 3.6e-4 | 9.1e-7 / 3.5e-4 | %99.96 | 36 (36) |

Ek bulgular (4a, değişmedi): bütçesi biten ışınlarda GPU–E32 sınıf uyuşmazlığı 0 (B: 103/103 yakalandı = R64); θ=π/2 negatif kontrol (D) çalışıyor; L=0 merkez sütunu (G) 73 pikselde 0 uyuşmazlık;
ikinci vuruş (E, 396 piksel) Δr medyan 1.8e-5. **Düzeltme (4b):** "GPU–R64 = taban E32–R64" sütunundaki uyuşmazlıkların kaynağı 4a'da "gölge kenarı/teğet ışınlar" diye yorumlanmıştı; §8.2 bunların eksen kusuru olduğunu gösterir.

### 8.2 Eksen koruması (`tests/render/axis-guard-validate.mjs`: `KABUL: GEÇTİ`)
Aynı kurulumlar, GPU (koruma kapalı = 4a portu) ↔ GPU (açık) ↔ R64 (aynı r_esc). Sınıf uyuşmazlığı (R64'e göre), bütçesi biten, ortalama adım, kaçış yönü hatası (rad):

| Kurulum | uyuşmazlık KAPALI → AÇIK | ort. adım | yön p99 KAPALI → AÇIK | yön maks KAPALI → AÇIK |
|---|---|---|---|---|
| A a=0.9 θ75° r50 | **39 → 0** | 92.6 → 93.7 (%1.2) | 3.3e-2 → 3.1e-5 | 0.77 → 6.5e-3 |
| B a=0.998 θ60° | **9 → 0** | 69.0 → 69.5 | 3.1e-3 → 2.7e-5 | 9.8e-2 → 3.5e-5 |
| C a=0 θ85° r30 | **44 → 0** | 103.3 → 104.5 | 4.6e-2 → 4.8e-5 | 0.73 → 1.5e-4 |
| F retrograd | **47 → 0** | 107.3 → 108.3 | 3.5e-2 → 2.3e-4 | 0.77 → 6.5e-3 |
| G tek-ızgara (L=0) | **10 → 0** | 92.7 → 93.3 | 7.0e-2 → 2.9e-5 | 1.03 → 5.4e-4 |
| H θ10° | **2 → 0** (bütçesi biten 2 → 0) | 59.4 → 60.2 | 1.5e-4 → 1.5e-4 | aynı |
| J r200 | **36 → 1** | 125.4 → 126.5 | 1.4e-2 → 3.4e-4 | 0.64 → 2.2e-2 |
| K 240×180, merkez şerit (|i−i_c|≤12, 4320 px) | **229 → 0** | 92.5 → 93.6 | 3.6e-2 → 3.0e-5 | 3.0 → 9.7e-3 |

Eksenden uzak piksellerde Δr medyanı **bozulmadı** (örn. A: 1.42e-5 → 1.42e-5). Bütçe tükenmesi: 01 kurulumunda (160×120) 48 → 8, mw-bulge 32 → 0, yüzden (10°) 20 → 0. a=0.998'de (B) bütçesi biten 103 ışın aynıdır (başka nedenle; hepsi yakalanır = R64).
Kalan: r_cam=200 + 90° görüş açısında eksenden geçen ışınlarda 1–2.5° (R64 aynı r_esc) hata — f32 koşullanması (§9), koruma çözünürlüğünden değil (κ_a=0.05 aynı sonucu verdi).

### 8.3 Disk fotometrisi (`tests/render/photometry-validate.mjs`: `GEÇTİ`)
GPU `renderDebugPhoto` (96×72, türbülans/kenar kapalı) ↔ CPU: `src/physics/disk.js` (`diskTemperatureProfile`, `blackbodyToLinearSRGB` integrali, tablo/LUT/seri örnekleyicileri) ve E32 `traceRay` (`hit.r`, `hit.gCam`). Göreli hata yalnız I ≥ 1e-3 piksellerde.
**[PORT]** = GPU ↔ CPU(f64, *aynı formül*, GPU'nun kendi r, g_cam'ı ile) — yalnız f32/cihaz aritmetiği; eşik medyan ≤ 1e-5, p99 ≤ 2e-4. **[TABLO]** = CPU(tablo+LUT) ↔ CPU(tam integral) — enterpolasyon/seri/Wien yaklaşıklığı (eşik medyan ≤ 2e-3). **[U-U]** = GPU ↔ CPU(tam), r ve g_cam CPU E32 izinden — uçtan uca.

| Kurulum (n disk pikseli) | [PORT] T_obs med/p99 | [PORT] I med/p99 | [PORT] RGB med/p99 | [TABLO] I med/maks | [U-U] T_obs med/p99 | [U-U] I med/p99 |
|---|---|---|---|---|---|---|
| S1 a=0.9 θ75° Tmax=1e4 f=1, **B** (3421) | 3.8e-8 / 1.4e-7 | 1.9e-6 / 6.1e-6 | 1.9e-6 / 5.5e-6 | 1.3e-4 / 1.2e-3 | 3.6e-6 / 4.8e-5 | 1.3e-4 / 3.8e-4 |
| S2 aynı, **A (bolometrik)** | 3.8e-8 / 1.4e-7 | 1.3e-7 / 5.2e-7 | 4.1e-7 / 9.7e-7 | 1.4e-5 / 5.7e-4 | 3.6e-6 / 5.2e-5 | 1.4e-5 / 2.1e-4 |
| S3 Tmax=1e6 (**T_obs>1e5 K: seri**, 3416 piksel) | 3.7e-8 / 1.4e-7 | 5.8e-7 / 1.7e-6 | 5.7e-7 / 1.7e-6 | 5.7e-6 / 1.6e-4 | 3.6e-6 / 6.4e-5 | 6.3e-6 / 7.5e-5 |
| S4 a=0 θ85° Tmax=2000 (**T_obs<1e3 K: Wien**, 63 piksel) | 2.9e-8 / 1.1e-7 | 5.4e-6 / 1.6e-5 | 5.1e-6 / 1.5e-5 | 4.2e-4 / 1.1e-3 | 7.2e-7 / 2.3e-5 | 4.2e-4 / 8.4e-4 |
| S5 a=0.998 θ60° Tmax=1e5 f=1.7 (137 piksel >1e5 K) | 5.0e-8 / 1.8e-7 | 6.2e-7 / 2.0e-6 | 6.3e-7 / 2.1e-6 | 5.5e-6 / 1.9e-3 | 5.4e-6 / 2.9e-5 | 5.8e-6 / 4.3e-5 |
| S6 retrograd Tmax=3e4 f=1.7, A | 4.5e-8 / 7.4e-7 | 1.1e-7 / 2.8e-6 | 1.3e-7 / 3.1e-6 | 8.9e-6 / 8.1e-5 | 2.2e-6 / 8.5e-5 | 8.9e-6 / 3.4e-4 |
| S7 a=0.5 θ60° r20 Tmax=8e3 f=1.3 | 4.5e-8 / 1.8e-7 | 1.4e-6 / 3.9e-6 | 1.6e-6 / 4.5e-6 | 8.6e-5 / 7.1e-4 | 8.7e-7 / 3.6e-5 | 8.5e-5 / 3.0e-4 |

[PORT] mutlak eşiklerin (1e-5 / 2e-4) **~5–1000×** altında; [TABLO] hataları `disk.md §5.4`'teki LUT hatasıyla (log₁₀Y ≤ 3.7e-4 ⇒ ≈ %0.09) uyumlu (I medyan 1e-4 mertebesi, maks 1.9e-3). [U-U] maksimumlar (örn. S6: T_obs maks 0.135) disk kenarında GPU/E32 ışınının farklı yarıçapa düştüğü tek tük piksellerdir (p99 ≤ 8.5e-5).
ESTETİK sağlık denetimi: kenar yumuşatma GPU ↔ CPU smoothstep maks |Δ| 1.6e-7; türbülans çarpanı (amp 0.3, 384×288 ızgara, 54 260 piksel) ortalama 1.013, σ 0.214, aralık 0.52–1.88.
(Kaba 96×72 ızgarada türbülans çarpanı ≡ 1: piksel ayak izi (0.77 M) hücreden (1 M) büyük ⇒ ayak izi süzmesi tüm oktavları **doğru olarak** söndürür.)

### 8.4 Hat davranışı (`tests/render/pipeline-test.mjs`: `HAT TESTİ: GEÇTİ`)
T1 `exposure` değişimi **0** yeni iz sürme karesi (post çalışır, tuval ×0.48), `Tmax` değişimi iz sürme çalıştırır · T2 parametre değişince iz sürme genişliği 80 (=0.5×160), durunca ≈152 ms sonra 160 ve 3/3 kare biriktirilir ·
T3 `animationFps=4` ⇒ 2 s'de 10 kare (60 ⇒ 35), kare süresi hedefi tutmayınca `dynamicScale` 1 → 0.35 · **T4 bloom kapalı + tonemap none: 10 029 disk pikselinde |tuval − sRGB(0.5·radyans)| maks 1.45/255, ort 0.40** (fiziksel/estetik ayrımı) ·
T5 8 kare ↔ 1 kare parlaklık ×1.0028, iki aynı koşu bit-bit aynı (deterministik yıldız/biriktirme) · T6 8-bit yedek hedef çalışır (ort 4.15, maks 18/255 sapma; yalnız acil yedek) · T7 `stop()` sonrası 0 kare · konsol temiz.
`api-smoke`: tüm kontroller geçti (4b varsayılanları, kıstırma, geçersiz değerler, çözünürlük ölçeği 80×60 iz sürme / 160×120 tuval). `npm run build`: dist 604.7 kB (160 kB gzip; 4a: 563/145).

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

## 10. CPU'dan farklar ve gerekçeleri (4a, güncel)

1. **Kendi `sinCos`'u** (`trig.glsl`): cihaz `sin/cos`'u kullanılmaz (SwiftShader mutlak hata maks 1.9e-4; `sinCos` ile GPU–E32 medyan Δr 3.9e-4 → 2.8e-6). `{nativeTrig:true}` yerel sürümü açar (yeniden üretmek için `trig-probe.mjs`).
2. **Başlangıç p_r f32'de** Carter bağıntısından; **kamera sabitleri** f64'te hesaplanıp f32 uniform; `roll` desteklenmez.
3. **Hermite kesişimi:** CPU 60, GPU 24 ikiye bölme. **`g`:** r^{3/4} = √r·√√r; tanımsız ⇒ `g = 0`.
4. **`hasTurningPointBelow`/`cbrt`/`acos` f32'de.** `rEscape` varsayılanı 4b'de `max(300, 2 r_cam, 6 b_max)` (CPU: max(1e4, 2 r_cam)); NaN ⇒ yakalandı. `t` integre edilmez.
5. **4b — eksen koruması (§2.1): görsel modda CPU E32'den KASITLI sapma** (CPU referansı hatalıdır). Debug yolunda varsayılan kapalı (birebir port).
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

* **Gerçek GPU'da ölçüm yok.** Doğruluk SwiftShader'da (gerçek f32), performans yalnız göreli. Windows/ANGLE-D3D'de uzun (N=512) döngü zaman aşımı riski ölçülmedi. Uyarlamalı çözünürlük GPU süresini değil rAF aralığını izler.
* **Matematik ekibine:** `src/math` f32-RK4 `traceRay`'in eksen yakını sıçramayı çözemediği (§2.1) 4a'dan beri bilinmiyordu; `math/README §7` taban uyuşmazlıkları (%0.5/%1.4) ve p99/maks Δr ("gölge kenarı") büyük ölçüde buradan geliyor. Öneri: `naturalStep`'e `L ≠ 0` iken göreli-θ ve bariyer zaman-ölçeği sınırı (trace.glsl'deki gibi) ekleyip `bench64/float32` tablolarını yenilemek. GPU–E32 doğrulaması bu hatayı gizledi (ikisi aynı hatayı yapıyor) — E32'ye karşı değil R64'e karşı sınama şart.
* **Matematik ekibine (2):** kaçış yönü kesme hatası ≈ (b/r_esc)³ ve r_cam ≳ 150 + fov ≳ 60°'de f32 koşullanması (b² belirsizliği ≈ 2r²ε) yıldız konumunda ~1° hata verebilir; kalıcı çözüm p_r'yi R(r)'den cebirsel kurmak (math §9).
* **Fizik ekibine:** (1) Mod B `f_col⁻⁴` çarpanı (görev gereği) f_col=1.7'de diski ×0.12 karartır; tepe normalizasyonu `Y_ref = Y(f_col T_max)` bu istenen anlam mı, yoksa Y_ref f_col'dan bağımsız mı olmalı? (2) T < 1e3 K Wien sabiti (2.3e4 K, ±%30) — LUT'u 300 K'ye uzatıp sabiti kaldırmak ister misiniz (görüntüde etkisiz: I < 1e-3)? (3) ISCO altı (plunging) ışıma ve geri dönen ışınım yok; yüksek spinde (a ≳ 0.9) disk iç kısmında önemli olabilir (disk.md §8.3). (4) T>1e5 K'de kromatisite 1e5 K'de donuk (≲ %3 hata; disk.md §5.4) — görüntüde Tmax=1e6'da mavi plato. (5) Opak disk iki yüzünü de aynı ışıtıyor; limb darkening/polarizasyon yok.
* **Estetik uyarılar:** animasyon modunda biriktirme yok ⇒ gölge/disk kenarı anti-alias'sız; dar görüş açısı + 8-bit yedek hedefte düşük kalite; `fCol ≠ 1` ve `Tmax` değişimi disk parlaklığını normalize eder (mod B tepe Y_ref=1): mutlak parlaklığı `exposure` belirler.
* 8-bit yedek HDR hedefi (float renderable yoksa): radyans/8, bloom yok, ort. sapma 4/255 (yalnız acil yedek; gerçek cihazda sınanmadı).
* `analyticFate=false` GPU'da ayrıca doğrulanmadı. `roll` yok. `three` tamamı paketlenir (604 kB).

## 13. Testleri çalıştırma

```
node tests/render/gpu-validate.mjs [--grid=96x72] [--quick] [--json=cikti.json]   # CPU↔GPU çekirdek (debug yolu, koruma kapalı); eşik sağlanmazsa çıkış kodu 1
node tests/render/photometry-validate.mjs [--grid=96x72] [--json=cikti.json]      # T_obs/parlaklık/RGB: GPU ↔ disk.js + traceRay gCam
node tests/render/axis-guard-validate.mjs [--grid=96x72]                          # eksen koruması ↔ R64
node tests/render/pipeline-test.mjs                                               # biriktirme, etkileşim, animasyon, dinamik ölçek, fiziksel/estetik ayrımı, 8-bit yedek
node tests/render/api-smoke.mjs                                                   # API sözleşmesi
node tests/render/perf.mjs [--frames=3]                                           # ms/kare, bileşen maliyeti
node tests/render/visual-snapshots.mjs [--out=/tmp/karadelik-gorsel-4b] [--size=640x480] [--frames=8] [--only=ad]   # PNG'ler (gözle denetim)
```
Vite sunucusu ve Chromium (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`) betik içinden başlar/kapanır. Chromium'un test kodunun kendi `readPixels` çağrılarından ürettiği "GPU stall" performans uyarısı pipeline/perf testlerinde süzülür (üretim kodunda `readPixels` yok; `benchmark()` ve test hariç).
