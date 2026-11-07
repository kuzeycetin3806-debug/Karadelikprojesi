# GPU ışın izleme çekirdeği (`src/render/`, `src/shaders/`) — Adım 4a

Kerr null geodeziklerinin GLSL ES 3.00 (WebGL2) portu. **Fotogerçekçilik hedef değildir**; hedef, CPU referansına
(`src/math/`) piksel piksel doğrulanmış bir çekirdektir. Disk sıcaklık profili, yıldız alanı, bloom: Adım 4b.

| Dosya | İçerik |
|---|---|
| `src/render/index.js` | `createBlackHoleRenderer(canvas, opts?)`: Three.js sahne/uniform yönetimi, görsel mod, debug mod (float MRT → CPU), `start/stop/setParams/getParams/renderDebug` |
| `src/render/params.js` | parametre sözleşmesi: doğrulama/kıstırma, varsayılanlar, kalite ön ayarları, **uniform türetimi** (f64 CPU hesapları) |
| `src/render/controls.js` | GEÇİCİ fare/dokunmatik yörünge kontrolü (kalıcı arayüzü arayüz ajanı yapacak) |
| `src/shaders/*.glsl`, `index.js` | `common` (uniform/sabit/tipler) → `trig` → `geodesic` → `integrator` → `camera` → `crossing` → `escape` → `trace` → `shading` → `main.frag` (Vite `?raw`; `buildFragmentShader({debug, nativeTrig})` birleştirir) |
| `tests/render/` | `gpu-validate.mjs` (CPU↔GPU), `api-smoke.mjs`, `perf.mjs`, `visual-snapshots.mjs`, `harness.mjs` (Vite JS API + Playwright). **`node --test` ile çalışmaz** |

## 1. Algoritma (CPU `src/math/` f32-RK4 yolunun birebir portu)

Hamilton biçimi, Mino zamanı, durum `y = (r, θ, φ, p_r, p_θ)`, E ≡ 1, ışın **geriye** izlenir (`DIR = −1`).
RK4 sabit formüllü adım `h = κ·h_nat` (`h_nat = 1/√((r'/ρ)² + θ'² + (sinθ φ')²)`, ρ = r − r₊), κ = 0.05 (high) / 0.10 (mobile),
bütçe N = `recommendedGpuBudget(a, analytic)` (high: 512) / 256 (mobile). Δ = (r−r₊)(r−r₋), r₋ = a²/r₊.
Her adımdan sonra sıra (CPU ile aynı): ekvator kesişimi (kübik Hermite; ISCO ≤ r ≤ r_out ise vuruş) → `hits ≥ maxDiskHits` ⇒ disk
→ `r < r₊+1e-3` ⇒ yakalandı → `r > r_esc ∧ p_r < 0` ⇒ kaçtı (θ_∞, φ_∞: σ_rem, θ'' = −F[4], φ'' dahil).
Bütçe biterse **analitik sınıflandırma** (`hasTurningPointBelow`: içe giden ve (r₊, r)'de R(r)=0 kökü yoksa yakalandı, aksi halde kaçtı;
kaçış yönü bilinmez ⇒ `θ_∞ = φ_∞ = −1`). |L| < 1e-7 ⇒ L = 0 (`L==0` dalı: `L/sin²θ`, `L²cosθ/sin³θ` yok; θ eksenden geçebilir,
`canonicalAngles` indirger). Kamera `|cosθ_cam| < 1e-6` ise (θ_cam = π/2 tam) sahte ilk-adım kesişimi sayılmaz.
Kamera: ZAMO tetradı, `sağ = +φ̂`, `yukarı = −θ̂`, görüş `−r̂` (`camera.js` ile aynı); `λ = p_φ/E`, `ν_cam/ν_∞ = 1/E`.
`g = 1/(uᵗ(1−Ωλ))` (λ = ışının L'si) ve **ekrana/çıktıya `g_cam = g·ν_cam/ν_∞`** yazılır.

## 2. Parametre sözleşmesi (arayüz ajanı için)

```js
import { createBlackHoleRenderer } from './render/index.js';
const r = createBlackHoleRenderer(canvas, { controls: true /* geçici yörünge kontrolü */, nativeTrig: false });
r.start();                       // rAF döngüsü; yalnız parametre/boyut değişince (kirli) çizer
r.setParams({ a: 0.9 });         // kısmi güncelleme; kıstırılmış TAM parametre nesnesini döndürür
r.getParams();                   // kopya
await r.renderDebug(64, 48);     // Float32Array (bkz. §4)
```

| Parametre | Tür / aralık | Varsayılan | Açıklama |
|---|---|---|---|
| `a` | 0 … 0.998 (kıstırılır) | 0.9 | boyutsuz spin (a=1 ISCO/g tanımsız) |
| `thetaCam` | rad, [1e-3, π−1e-3] | 75° | kamera eğimi (θ=π/2 tam değeri desteklenir ama §6'ya bakın) |
| `rCam` | M, [r₊+0.25, 1000] | 50 | kamera yarıçapı (f32 koşullanması r ≲ 200'de rahat, §6) |
| `phiCam` | rad | 0 | kamera azimutu |
| `fovY` | derece [1, 120] | 40 | dikey görüş alanı (tam açı) |
| `diskIn` | `'isco'` ∣ sayı (M) | `'isco'` | iç yarıçap; sayı < r_ph+1e-3 ise kıstırılır, ISCO altı ESTETİK ekstrapolasyon |
| `diskOut` | M | 20 | dış yarıçap |
| `prograde` | bool | true | disk dönüş yönü (delikle aynı = true) |
| `quality` | `'high'` ∣ `'mobile'` | `'high'` | high: κ=0.05, N=512; mobile: κ=0.10, N=256 |
| `maxDiskHits` | 1 … 4 | 1 | 1 = opak disk; >1 ikincil/üçüncül görüntüler (yarı saydam, ESTETİK) |
| `disk` | bool | true | false: disk yok, yalnız merceklenme |
| `resolutionScale` | 0.1 … 1 | 1 | etkin piksel oranı = `min(devicePixelRatio, maxPixelRatio)·resolutionScale` |
| `maxPixelRatio` | 0.5 … 4 | 2 | |
| `analyticFate` | bool | true | bütçesi biten ışın analitik sınıflanır (önerilen); false: "bütçe bitti → yakalandı" ve N spine bağlı (512/1024/2048) |
| `rEscape` | `'auto'` ∣ sayı | `'auto'` = max(300, 2·rCam) | kaçış yarıçapı; yön hatası ≈ (b/r_esc)³ rad |
| `kappa`, `maxSteps` | sayı ∣ null | null | kalite ön ayarını elle geçersiz kıl (test/ayar) |
| `planeGuard` | bool | true | **YALNIZ TEST**: false = θ_cam=π/2 koruması kapalı (negatif kontrol) |

Hatalı tür → `TypeError`; bilinmeyen `quality` → `RangeError`; aralık dışı sayısal değer **kıstırılır** (kaydırıcıları kırmamak için).
Ek API: `renderOnce()`, `benchmark({frames, warmup})` (eşzamanlı ms/kare), `getStats()`, `getContext()`, `isRunning()`, `dispose()`.
`opts`: `controls` (varsayılan true), `preserveDrawingBuffer`, `nativeTrig` (§5), `params`.
**Arayüz notu:** tuvale `touch-action:none` zaten `index.html`'de; `controls:false` ile geçici kontrol kapatılıp arayüz kendi `setParams` çağrılarını yapabilir.
**Kalite önerisi:** mobil/iPad `quality:'mobile'` + `resolutionScale` 0.5–0.75; `renderer.benchmark()` ile başlangıçta ms/kare ölçülüp ölçek ayarlanabilir
(ölçüm `readPixels` ile bekler; üretim döngüsünde çağırmayın).

## 3. Uniform listesi (`src/shaders/common.glsl`)

`uResolution`(vec2 piksel) · `uTanHalf`(vec2: tan(fovX/2), tan(fovY/2)) · `uCam`(r, θ, φ) · `uTetrad`(N, ω, √g_φφ, √Σ — `zamoFrame`, f64'te hesaplanır) ·
`uA, uA2, uRp, uRm` (a, a², r₊, r₋ = a²/r₊; f64'te hesaplanıp f32'ye yuvarlanır) · `uKappa` · `uMaxSteps`(int) · `uREscape` · `uAnalyticFate`(int) ·
`uDiskOn`(int) · `uMaxDiskHits`(int ≤ 4) · `uRIn, uROut` · `uSpinSign`(±1) · `uPlaneGuard`(int, test). Derleme tanımları: `MODE_DEBUG`, `NATIVE_TRIG`.

## 4. Debug modu (`renderDebug(width, height)`)

3 × RGBA32F (WebGL2 MRT, `EXT_color_buffer_float` şart). Dönen `Float32Array` uzunluğu `width·height·12`; piksel (i, j) (**j = 0 görüntünün üst satırı**) için
`(j·width + i)·12 + DEBUG_FIELDS.indexOf(alan)`; `DEBUG_FIELDS` = `status, r1, gCam1, steps, thetaInf, phiInf, n1, hitCount, reason, phi1, r2, gCam2`.
`status`: 0 yakalandı · 1 kaçtı · 2 disk (maxDiskHits doldu). `reason`: 0 normal · 1 bütçe bitti · 2 NaN. `r1, gCam1, n1, phi1` = ilk disk vuruşu
(vuruş yoksa −1, 0, 0, −1); `r2, gCam2` ikinci vuruş; `hitCount` disk bölgesindeki ekvator kesişimi sayısı; `n` = kaçıncı ekvator geçişi (1 = birincil).
Kaçış yönü bilinmiyorsa (`reason = 1`, kaçar) `thetaInf = phiInf = −1`.

## 5. Fiziksel ve estetik öğelerin ayrımı

| Öğe | Sınıf | Dosya |
|---|---|---|
| Geodezik integrasyon, adım kuralı, kesişim, yakalanma/kaçış, analitik fate, kaçış yönü | **FİZİKSEL** | `geodesic/integrator/crossing/escape/trace.glsl` |
| `g` (gravitasyonel kayma + Doppler), `g_cam = g·ν_cam/ν_∞`, kamera tetradı, ışık sapması/merceklenme | **FİZİKSEL** | `camera/crossing.glsl` |
| Disk parlaklığının *oranı* ∝ g_cam⁴ (bolometrik, Liouville) | FİZİKSEL (oran) / **ESTETİK** (mutlak ölçek 0.5) | `shading.glsl` E2 |
| g_cam → renk (mavi/kırmızı/beyaz), `1−exp(−x)` sıkıştırma, gama 1/2.2 | **ESTETİK** | `shading.glsl` E1, E2, E7 |
| İkincil görüntü tonu (n=2 yeşil, n≥3 mor), çok vuruşta α=0.7 yarı saydamlık | **ESTETİK** | `shading.glsl` E3, E4 |
| Enlem/boylam ızgarası + dama (tanılama deseni, gerçek arka plan değil), kutup söndürme | **ESTETİK** | `shading.glsl` E5 |
| Bütçesi biten "kaçar" pikselin soluk kehribar rengi (yön bilinmiyor) | **ESTETİK** (tanılama) | `shading.glsl` E6 |
| Yörünge kontrolü, devicePixelRatio/çözünürlük ölçeği | etkileşim / **ESTETİK** | `controls.js`, `index.js` |
| `sinCos` (trig.glsl) | **FİZİKSEL** (sayısal kesinlik) | `trig.glsl` |

## 6. CPU'dan farklar ve gerekçeleri

1. **Kendi `sinCos`'u** (`trig.glsl`: Cody–Waite π/2 indirgemesi + Cephes polinomu): cihaz `sin/cos`'u kullanılmaz. **Ölçüm:** SwiftShader'ın `sin/cos` mutlak hatası
   ort 5e-5, **maks 1.9e-4** (GLSL ES 3.00 şartnamesi [−π,π]'de ~2⁻¹¹ ≈ 5e-4'e izin verir; bölme ≈ 4 ulp, sqrt ≈ 3 ulp; yeniden üretmek için `tests/render/trig-probe.mjs`). Yerel `sin/cos` ile GPU–E32 medyan Δr **3.9e-4**
   ve kaçış yönü **1.9e-4 rad** idi (cosθ = 0 kökünü ve p_θ, φ' denklemlerini sistematik bozar); `sinCos` ile **2.8e-6 / 8e-7** (≈140×/230× iyi). **Maliyet:** SwiftShader'da 1.33× yavaş
   (gerçek GPU'da farklı olabilir); `createBlackHoleRenderer(canvas, {nativeTrig:true})` yerel sürümü açar. Gerçek GPU'larda yerel `sin/cos` kalitesi cihaza bağlıdır; ölçülmedi.
2. **Başlangıç p_r f32'de** Carter bağıntısından kurulur (CPU: f64'te kurulup f32'ye yuvarlanır): birkaç ulp fark; etkisi `2r²ε` ölçeğinde (math/README §5.2).
3. **Kamera sabitleri** (N, ω, √g_φφ, √Σ, r₊, r₋) f64'te `src/math` ile hesaplanıp f32 uniform olur; piksel başına kısım (norm, L, p_θ, Q, ν_cam) shader'da f32. `roll` desteklenmez (`camera.js`'te var, GPU'da yok).
4. **Hermite kesişimi:** CPU 60, GPU 24 ikiye bölme (f32'de 2⁻²⁴'ten ince anlamsız); yalnız θ(s) bisect edilir, r ve φ aynı s'de değerlendirilir (CPU ile aynı formüller).
5. **`g`:** r^{3/4} = √r·√√r (yaklaşık `pow` kullanılmaz); tanımsız (r ≤ r_ph veya 1−Ωλ ≤ 0) ⇒ `g = 0` (CPU: `RangeError`). `diskIn` r_ph+1e-3'ten küçükse kıstırılır.
6. **`hasTurningPointBelow`/`cbrt`/`acos` f32'de** (CPU f64; `cbrt` = `sign·pow(|x|,⅓)`). Yalnız bütçesi biten ışınlarda (B: 103 ışın) ve R(x) minimumda ikinci mertebeden duyarsız; testlerde CPU ile uyumlu.
7. `rEscape` varsayılan max(300, 2·r_cam) (CPU: max(1e4, 2 r_cam)); NaN ⇒ yakalandı (`reason=2`, CPU sayısal kuralıyla aynı). `t` (tDelay) integre edilmez. `maxDiskHits ≤ 4`.
8. Sınırlar: a ≤ 0.998, θ_cam ∈ [1e-3, π−1e-3], r_cam ∈ [r₊+0.25, 1000].

## 7. GPU doğrulaması (`tests/render/gpu-validate.mjs`)

Üç sonuç aynı kamera/ızgarada karşılaştırılır: **GPU** (SwiftShader, gerçek f32), **E32** (CPU `traceRay`, `rk4`+`f32`+`hamilton`+`hermite`, aynı κ/N) ve **R64** (CPU DP5(4), rtol 1e-10).
Izgara 96×72 (tek-ızgara kurulumlarda 97×73), r_out = 20, r_esc = 300. Sınıf kuralı: bütçesi biten ışın analitik fate ile sınıflanır.

**Kabul eşikleri (iki katman).** (1) **GPU–E32 = port doğruluğu, mutlak:** sınıf/vuruş-sayısı/n-etiketi uyuşmazlığı ≤ %0.2; medyan Δr ≤ 2e-5, p99 ≤ 5e-3; medyan ΔgCam ≤ 1e-5, p99 ≤ 2e-4 (göreli);
kaçış yönü medyan ≤ 1e-5, p99 ≤ 1e-3 rad; adım sayısı aynı oranı ≥ %98. Gerekçe: ikisi de aynı algoritmayı çalıştırır, kesme hatası (~1e-5) ortaktır ve farkta çıkar; geriye yalnız yuvarlama/sin-cos gürültüsü kalır ve bu
yalnız kritik eğri/disk kenarındaki pikselleri çevirebilir. (2) **GPU–R64 = nihai doğruluk, taban çizgisine göreli:** aynı koşunun E32–R64 değerinin ≤ 2× + küçük taban değer (GPU, "README §7'nin beklediği f32+RK4" düzeyinden kötü olmamalı),
ek olarak README §7'ye dayalı mutlak tavanlar (uyuşmazlık ≤ %1.5, medyan Δr ≤ 1e-4, medyan Δg ≤ 1e-4; mobile kurulumunda tavanlar yok). İlk denemede kaçış yönü p99 için mutlak 2e-3 koymuştum; taban çizgisi (E32–R64) aynı değeri
(3.3e-2) veriyordu, yani sapma GPU'dan değil yöntemden geliyordu — eşiği gevşetmek yerine ölçütü taban çizgisine göreli yaptım.

**Gerçek çıktı** (özet; tam çıktı `node tests/render/gpu-validate.mjs`). Hücre: GPU–E32 uyuşmazlık / Δr medyan–p99 / ΔgCam medyan–p99 / kaçış yönü medyan–p99 (rad) / adım==; GPU–R64 uyuşmazlık (taban E32–R64):

| Kurulum | GPU–E32 uyuşm. | Δr med / p99 | ΔgCam med / p99 | yön med / p99 | adım== | GPU–R64 uyuşm. (taban) | Δr med GPU–R64 (taban) |
|---|---|---|---|---|---|---|---|
| A a=0.9 θ75° r50 | 0/6912 | 2.8e-6 / 3.9e-4 | 1.2e-7 / 1.7e-5 | 8.2e-7 / 2.1e-5 | %99.99 | 39 (39) | 1.44e-5 (1.31e-5) |
| B a=0.998 θ60° r50 | 0 | 2.4e-6 / 2.0e-4 | 1.2e-7 / 1.0e-5 | 6.7e-7 / 1.1e-5 | %100 | 9 (9) | 1.13e-5 (1.01e-5) |
| C a=0 θ85° r30 | 0 | 3.9e-6 / 2.9e-4 | 1.1e-7 / 1.0e-5 | 5.1e-7 / 1.2e-5 | %99.91 | 44 (44) | 1.26e-5 (1.31e-5) |
| D a=0.9 **θ=π/2** r30 | 0 | 7.6e-6 / 6.0e-4 | 2.5e-7 / 2.2e-5 | 5.3e-7 / 8.7e-6 | %99.97 | 50 (50) | 7.8e-5 (6.8e-5) |
| E a=0.9 θ75° r50 maxHits=3 | 1 | 2.8e-6 / 3.9e-4 | 1.2e-7 / 1.7e-5 | 8.4e-7 / 1.5e-4 | %99.68 | 39 (38) | 1.44e-5 (1.31e-5) |
| F a=0.9 θ75° r50 retrograd | 0 | 3.2e-6 / 4.7e-4 | 1.1e-7 / 9.0e-6 | 8.6e-7 / 1.4e-4 | %99.93 | 47 (47) | 1.19e-5 (1.11e-5) |
| G a=0.9 θ75° r50, tek-ızgara (L=0 sütunu) | 0 | 2.9e-6 / 3.5e-4 | 1.2e-7 / 1.8e-5 | 7.8e-7 / 2.0e-5 | %100 | 10 (10) | 1.35e-5 (1.25e-5) |
| H a=0.9 **θ10°** r50, tek-ızgara | 0 | 1.8e-6 / 6.7e-5 | 9.6e-8 / 7.6e-6 | 4.7e-7 / 4.3e-6 | %99.99 | 2 (2) | 1.66e-5 (1.46e-5) |
| I a=0.9 θ75° r50 **mobile** (κ=.10 N=256) | 0 | 2.8e-6 / 4.4e-4 | 1.2e-7 / 1.8e-5 | 8.6e-7 / 1.9e-5 | %99.97 | 78 (78) | 9.6e-5 (9.5e-5) |
| J a=0.9 θ75° **r200** [bilgi] | 0 | 5.7e-6 / 8.9e-3 | 1.8e-7 / 3.6e-4 | 9.1e-7 / 3.5e-4 | %99.96 | 36 (36) | 3.2e-4 (2.8e-4) |

Ek bulgular: (a) **Bütçesi biten ışınlar** (B: 103, E: 3, H: 2, J: 1): GPU–E32 sınıf uyuşmazlığı **0**; B'de 103/103 yakalandı ve R64 ile aynı. H'de iki ışın GPU = E32 ama R64'ten farklı (taban E32–R64 de 2; kritik eğri üstü).
(b) **θ=π/2 negatif kontrol (D):** koruma kapalıyken GPU'da 586 pikselin n-etiketi kayıyor (CPU `planeEps=0`: tam 586), GPU(kapalı)↔CPU(kapalı) uyum %100; koruma açıkken sahte vuruş 0 → koruma GPU'da çalışıyor.
(c) **L=0 merkez sütunu (G):** 73 pikselde 0 uyuşmazlık, 23 ışın kutuptan geçip kaçıyor (φ_∞≈π), kaçış yönü maks hatası 1.65e-5 rad. (d) **İkinci vuruş** (E, 396 piksel): Δr medyan 1.8e-5, ΔgCam medyan 4.5e-7.
(e) **Büyük r_cam (J):** E32–R64 medyan Δr r=50'de 1.3e-5 → r=200'de 2.8e-4 (math/README §5.2'deki `2r²ε` nicemlemesi); GPU bunu aynen izler. (f) **Taban çizgisi uyuşmazlığı** (E32–R64 = GPU–R64, %0.1–0.7; mobile %1.13) README §7 ile uyumlu (%0.5, %1.4);
p99/maks Δr (0.06–1.5 M, ~10 M) gölge kenarı/disk dış kenarı teğet ışınlarının sınıf çevirmesinden gelir, GPU'dan değil.
Tarayıcı konsolu: hata/uyarı **yok** (shader derleme dahil). `node tests/render/api-smoke.mjs`: 18/18 kontrol geçti.

## 8. Performans (SwiftShader — gerçek GPU'yu TEMSİL ETMEZ)

SwiftShader CPU yazılım rasterleştiricisidir (bu makinede 4 çekirdek, Xeon 2.1 GHz). Mutlak süreler, hatta kalite seviyeleri arasındaki oran gerçek donanımda farklı olur
(dallanma ıraksaması, sin/cos birimi, kayıt basıncı, sürücü döngü zaman aşımı). Aşağıdakiler yalnızca piksel sayısıyla ölçeklenmeyi ve κ/N etkisini gösterir.
Ölçüm: 2 karenin ortalaması, her kare 1 piksellik `readPixels` ile eşzamanlı (Chromium'da `gl.finish()` GPU'yu beklemez), ısınma hariç.

| Kurulum (görsel mod) | 160×120 | 320×240 | 640×480 | µs/piksel (640×480) |
|---|---|---|---|---|
| A a=0.9 θ75° r50 high (κ=.05, N=512) | 51 ms | 172 ms | 707 ms | 2.3 |
| A mobile (κ=.10, N=256) | 24 ms | 96 ms | 364 ms | 1.2 |
| B a=0.998 θ60° r50 high | 47 ms | 144 ms | 537 ms | 1.7 |
| C a=0 θ85° r30 high | 50 ms | 216 ms | 869 ms | 2.8 |

`trig.glsl sinCos`: 175 ms/kare, yerel `sin/cos`: 131 ms/kare (320×240, A) ⇒ 1.33×. Ortalama adım sayısı (GPU): A 92.6, B 69.0 (maks 512), C 103, mobile 46.
Süre ≈ piksel sayısıyla doğrusal; mobile ≈ 0.5× (adım sayısı yarı). `npm run build` → `dist/` 563 kB (145 kB gzip; three.js dahil).

## 9. Bilinen sorunlar / sınırlamalar

- **Gerçek GPU'da ölçüm yok.** Doğruluk SwiftShader'da (gerçek f32, ama bölme/sqrt ≈ şartname sınırında) ölçüldü; `sinCos` cihazdan bağımsız doğruluk için yazıldı ama gerçek donanımda ayrıca sınanmadı. Windows/ANGLE-D3D'de uzun (N=512) döngü zaman aşımı riski ölçülmedi.
- **r_cam büyüdükçe f32 koşullanması bozulur** (J, math/README §5.2): kalıcı çözüm p_r'yi R(r)'den cebirsel türetmek (henüz yok).
- **θ_cam = π/2 tam değeri** korumayla çalışır (D, negatif kontrol) ama kenar-üzerinden disk fiziksel olarak dejenere kalır (math/README §4.1); arayüz bandı (89.5°–90.5°) kaydırıcıdan uzak tutmalıdır.
- Bütçesi biten "kaçar" ışının yönü yoktur (`thInf = −1`, B'de yok, H/E/J'de 1–3 ışın): 4b'de ince "foton halkası" olarak ele alınmalı.
- `analyticFate = false` (sayısal kural) GPU'da ayrıca doğrulanmadı (yalnız `captured = true` dalı).
- `roll`, disk dokusu/sıcaklık profili, yıldız alanı, bloom, tonemapping: 4b. Üretimde `three`'nin tamamı paketlenir (563 kB); ayrı bir chunk/dinamik içe aktarma koordinatör kararıdır.

## 10. Testleri çalıştırma

```
node tests/render/gpu-validate.mjs [--grid=96x72] [--quick] [--json=cikti.json]   # CPU↔GPU tablo; eşikler sağlanmazsa çıkış kodu 1
node tests/render/api-smoke.mjs                                                   # API sözleşmesi
node tests/render/perf.mjs [--frames=3]                                           # ms/kare
node tests/render/visual-snapshots.mjs --out=<dizin>                              # PNG'ler (gözle denetim)
```
Vite sunucusu ve Chromium (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`) betik içinden başlar/kapanır.
