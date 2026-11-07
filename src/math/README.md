# Kerr null geodezik ışın izleyici — CPU referans uygulaması (`src/math/`)

Bu modül iki iş görür: **(1)** GLSL shader'ının birebir port edileceği referans algoritma,
**(2)** shader çıktısını doğrulamak için "doğruluk kaynağı" (float64). Tüm büyüklükler **fiziksel**tir;
bloom/tonemapping gibi estetik işlemler bu modülde yoktur.

| Dosya | İçerik |
|---|---|
| `geodesic.js` | Hamilton denklemleri (BL, Mino zamanı), Carter biçimi, potansiyeller R(r), Θ(θ), sabitler E, L, Q, H; float32 öykünmeli sağ taraflar; adım kuralı `naturalStep`; açı yardımcıları |
| `integrators.js` | RK4 (sabit adım, + float32 öykünmeli), Dormand–Prince 5(4) (FSAL, adaptif), hata normu, adım denetleyicisi |
| `camera.js` | Sonlu uzaklıktaki ZAMO kamerası: piksel → foton başlangıç koşulları; `impactToRay`, `bardeenRay` |
| `raytracer.js` | `traceRay(params, ray, opts)` — sonlandırma, disk kesişimleri, g-faktörü, kaçış yönü, korunum hataları |
| `../../tests/math/*.test.mjs` | node:test; `helpers.mjs` (kesin sapma kuadratürü vb.); `audit-fixes.test.mjs` (denetim-2 düzeltmeleri: kaçış yönü, θ_cam=π/2, bütçe sınıflandırması) |
| `../../tools/` | `shadow-scan.mjs` (gölge sınırı taraması), `float32-study.mjs` (f32↔f64 çalışması), `bench64.mjs` (64×64 süre) |

Fizik formülleri `src/physics/kerr.js`'ten **import edilir** (`metricBL`, `frameDraggingOmega`, `horizonRadii`,
`iscoRadius`, `diskRedshiftFactor`); kopyalanmaz. Testlerde `shadowBoundary`, `criticalCurve`,
`photonOrbitRadius` referans olarak kullanılır.

## 1. Konvansiyonlar

- G = c = M = 1; `a` boyutsuz spin ∈ [0,1]; imza (−,+,+,+); BL koordinatları (t, r, θ, φ), θ spin ekseninden.
- Foton: E = −p_t, L = p_φ, Carter sabiti Q. **E ≡ 1 normalize**: λ = L/E = L = p_φ/(−p_t) (kerr.md §2.8).
  Gerçek λ HER ZAMAN ışından alınır (`ray.lambda`); λ = −α sinθ_o yalnızca sonsuz gözlemci içindir.
- Ekran yönelimi (kerr.md §2.11, birebir): n̂ = r̂ (delikten kameraya), **yukarı ê_β = −θ̂**, **sağ ê_α = ê_β × n̂ = +φ̂**.
  Fiziksel foton n = −(görüş yönü) ile gelir. Sağdaki piksel ⇒ α > 0 ⇒ L < 0; üstteki piksel ⇒ β > 0 ⇒ p_θ > 0.
  Test: düz uzayda L_z = (b×n̂)_z vektörel olarak (Bardeen formülü kullanılmadan) doğrulanır.
- `ray` nesnesi (kamera çıktısı): `{r, theta, phi, lambda, pTheta, signR, Q, nuCamOverNuInf, prDirect}`.
  `signR` fiziksel p_r işareti (+1: foton delikten kameraya doğru gidiyor; merkez piksel).
- **Işın geriye (geçmişe) izlenir**: fiziksel foton kameraya gelir, izleme yönü tersidir (`dir = −1`).
  Durum değişkenleri (p_r, p_θ, u_r, u_θ) her zaman fiziksel fotonun değerleridir; `dir = −1` yalnızca türevlerin işaretini çevirir.

## 2. Denklemler

H = ½ g^{μν}p_μp_ν = f/(2Σ),
f = Δp_r² + p_θ² + (p_φ + a sin²θ p_t)²/sin²θ − [(r²+a²)p_t + a p_φ]²/Δ.

Mino zamanı dσ = dλ_afin/Σ ⇒ H̃ = ΣH = f/2 ile Hamilton denklemleri (P = (r²+a²)p_t + aL, W = L + a sin²θ p_t, Δ' = 2(r−1)):

```
dr/dσ = Δ p_r                         dθ/dσ = p_θ
dφ/dσ = W/sin²θ − aP/Δ                dt/dσ = aW − (r²+a²)P/Δ
dp_r/dσ = −½[Δ' p_r² − 4 r p_t P/Δ + Δ' P²/Δ²]
dp_θ/dσ = L² cosθ/sin³θ − a² sinθ cosθ p_t²
```

Neden Mino zamanı? Σ'nın çarpanı ortadan kalkar; ufukta dr/dσ = √R(r₊) **sonlu** kalır (yalnızca p_r ~ 1/Δ büyür);
θ-hareketi r-hareketinden ayrışır; kaçan ışınlar için toplam σ aralığı sınırlıdır (σ ≈ 1/r).
Bağımsız doğrulama (`geodesic.test.mjs`): hızlar = Σ g^{μν}p_ν (`metricBL` ile), momentum türevleri = −∂H̃/∂(r,θ) (sonlu fark).

**Durum vektörü (sabit sıra):** `y = [r, θ, φ, X, Y, t]`.
- `form: 'hamilton'` (varsayılan): X = p_r, Y = p_θ.
- `form: 'carter'`: X = u_r = dr/dσ = Δp_r, Y = p_θ; du_r/dσ = R'(r)/2, R = [(r²+a²)E − aL]² − Δ[Q + (L−aE)²].
- t sonda ve hata denetiminden çıkarılır; E, L sabit olduğundan `y`'de yoktur (korunumları kurulum gereği tam).

Başlangıçta p_r, **Carter bağıntısından yeniden kurulur** (p_r = signR·√R/Δ); kameranın tetraddan verdiği `prDirect`
kullanılmaz. Neden: f içinde Δp_r² ile P²/Δ ~ r² mertebesinde birbirini götürür (r_cam=1e7'de mutlak yuvarlama ~1e-2);
R(r) ise iyi koşulludur.

## 3. Kamera → ışın (`camera.js`)

ZAMO tetradı: e_(t) = (∂_t + ω∂_φ)/N, e_(r) = √(Δ/Σ)∂_r, e_(θ) = ∂_θ/√Σ, e_(φ) = ∂_φ/√g_φφ, N = √(ΣΔ/A).
Yerel çerçevede p^(t) = 1, p^(i) = n_i (n = −görüş yönü). Kovaryant: p_φ = √g_φφ n_φ, p_θ = √Σ n_θ, p_r = √(Σ/Δ) n_r,
E = N + ω p_φ ⇒ **λ = p_φ/E, p_θ/E**. Bağımsız test: p^μ = e_(t) + n_i e_(i) kurulup `metricBL` ile indislenir
(null olması, λ = p_φ/(−p_t), p_r Carter bağıntısı).
`nuCamOverNuInf = 1/E` — ışın izleyicinin g'si sonsuzdaki gözlemciye göredir; kameranın gördüğü g_cam = g·nuCamOverNuInf
(`hit.gCam`).

Üç giriş noktası: `pixelToRay(i,j)` / `screenToRay(x,y)` (teğet düzlem, **piksel açısı**), `impactToRay(α,β)` (Bardeen
etki parametreleri, **lapse düzeltmeli**: r_cam sinψ = bN), `bardeenRay(α,β)` (sabitlerden **tam**: L = −α sinθ_cam, p_θ = β).
r_cam=50'de piksel açısından α := r_cam tanψ alınırsa λ/(−α sinθ_o) − 1 = 1.08% (a=0.9, θ_o=80°); bu yüzden g için
λ ışından alınmalıdır (testte g farkı %0.8).

## 4. İzleyici (`traceRay`)

### 4.1 Sonlandırma (her kabul edilen adımdan sonra, bu öncelikle)

| Sıra | Koşul | `status` |
|---|---|---|
| 1 | cosθ işaret değiştirdi ⇒ ekvator kesişimi kaydedilir; disk içindeyse `hits`'e eklenir; `hits.length ≥ maxDiskHits` | `'disk'` |
| 2 | r < r₊ + `captureMargin` (1e-3) | `'captured'` |
| 3 | r > `rEscape` ve ışın dışarı gidiyor (fiziksel p_r < 0) | `'escaped'` (+ `escape`) |
| 4 | adım bütçesi / NaN / adım < 1e-14 | `'maxSteps'` (`reason`: `budget`/`nan`/`stuck`); bütçe bitince `fate` = `'captured'`/`'escaped'` (analitik, §4.4) |

`status` **sonlanma olayıdır**; ışın diski geçip sonra kaçabilir (`status:'escaped'`, `hits.length ≥ 1`). `maxDiskHits=1` opak disk,
`>1` ikincil/üçüncül görüntüler. `hit.n` = kaçıncı ekvator geçişi (disk dışı geçişler de sayılır; n=1 birincil görüntü).
Neden r₊+1e-3 güvenli: (r₊, r₊+1e-3) aralığında R(r)=0 kökü (dönüm noktası) yoktur — en yakın dönüm noktası foton yörüngesi civarındadır ve
r_ph,pro − r₊ ≥ 0.011 (a ≤ 0.998 için); bu aralığa giren ışın geri dönemez. (Yalnız "R(r₊) > 0" yeterli gerekçe değildir: R(r₊)>0 ufkun hemen
dışında kök olmadığını değil, yalnızca ufkun kendisinde R'nin pozitif olduğunu söyler.)

Disk: ince, ekvatoral, r_in = ISCO (`params.rIn`, varsayılan `iscoRadius`), r_out parametrik (varsayılan 20), `prograde`.
`hit = {n, r, phi, lambda, g, gCam, tDelay, phiRaw, step}`; **g = `diskRedshiftFactor(1, a, r, λ_ışın, prograde)`**.
Kesişim inceltme: `newton` (kısmi adım yeniden integrasyonu, f64 referans), `hermite` (kübik Hermite, GPU için), `linear`.

Kaçış yönü: kalan Mino süresi σ_rem = ∫_r^∞ dr/√R = 1/r − c₂/(6r³) − c₃/(8r⁴) (`remainingMinoTime`; c₂ = 2(a²−aL) − K, c₃ = 2K,
K = Q + (L−a)²). **İzleme zamanında** (τ = −σ, F = f(y) zaten `dir=−1` ile çarpılmış): θ_∞ = θ + F₁σ + ½θ''σ², φ_∞ = φ + F₂σ + ½φ''σ²,
**θ'' = −F[4]** (F[4] = dp_θ/dτ), φ'' = (∂F₂/∂r)F₀ + (∂F₂/∂θ)F₁ (analitik; `escapeSecondDerivatives`). Hata ≈ (b/r_esc)³ rad
(ölçüm: r_esc=300/600/1200/2400 → 4.9e-5/6.1e-6/7.5e-7/9.4e-8, eğim −3.0; a=0.9, θ_o=75°). Düz-uzay kontrolü: r=300, θ=60°, p_θ=0 → θ_∞=1.047471
(eski, işareti ters formül 1.046924 veriyordu: ışın ekvatordan uzaklaşıyordu). Test: `audit-fixes.test.mjs` Ö1a–c.
Çıktı: `escape = {theta, phi, thetaRaw, phiRaw, dir:[x,y,z]}` (θ ∈ [0,π], φ ∈ [0,2π); `dir` arka plan dokusu için).

**θ_cam = π/2 (kamera tam disk düzleminde) — dejenere durum.** f64'te cos(π/2)=+6e-17, f32'de cos(fround(π/2))=−4.4e-8: kamera düzlemin bir
yanında sayılır ve ilk adımda SAHTE bir işaret değişimi algılanırdı (r_cam ≤ r_out'ta ekranın yarısı r=r_cam'de "disk" vuruşu alıyor, r_cam > r_out'ta
n etiketi 1 yerine 2 oluyor; yarı değişir f32↔f64). Düzeltme (`planeEps`, varsayılan f64 1e-12, f32 1e-6): |cosθ_cam| < ε ise (i) ilk adımda
kameradan çıkış ve (ii) iki ucu da ε-bandında kalan adımlar (ekvatoral ışının gürültü geçişleri) kesişim sayılmaz. Test (`audit-fixes.test.mjs` Ö2,
r_cam = 15 ve 50, f64 ve f32): sahte vuruş 0 (korumasız: 45/45), üst/alt ayna çiftlerinde durum ve n aynı, |Δr| f64 ≤ 4.9e-11, f32 ≤ 8.7e-5.
**UI notu:** kameranın ince diskin düzlemine tam oturduğu θ_cam = 90° yine de kaçınılacak bir durumdur (disk kenar-üzerinden görünür, ışınlar
yarı-düzlemsel/ayna simetrik, katman sıralaması belirsiz); eğim kaydırıcısını (örn. 89.5°–90.5°) bandından uzak tutun ya da θ_cam'e küçük bir
ofset (≥1e-3 rad) ekleyin. GPU'ya θ_cam float32 olarak geçerse bu bant korumasını shader'da da uygulayın (|cosθ_cam| < 1e-6 ⇒ ilk adım kesişimi yok).

### 4.2 Adım kontrolü

**Doğal adım** (`naturalStep`): h_nat = 1/√((r'/ρ)² + θ'² + (sinθ φ')²), ρ = r − r₊.
- büyük r: r' ≈ r², ρ ≈ r ⇒ h ≈ 1/r (adım r ile geometrik büyür, ~ln r adım);
- **ufuk yakını**: r' sonlu, ρ → 0 ⇒ h ∝ (r − r₊) (p_r ~ 1/Δ, φ, t patlamasını çözer; ufka geometrik yaklaşım, ~ln(1/ε) adım);
- foton küresi: r' ≈ 0, θ' ~ φ' ~ b ⇒ h ≈ 1/b (tur başına 2π/κ adım);
- eksen yakını: sinθ·φ' = L/sinθ büyür ⇒ h küçülür.
Türevler zaten hesaplanmış olduğundan ek maliyet ≈ 1 sin + 1 sqrt.

- `integrator:'dp45'` (referans): Dormand–Prince 5(4), FSAL; norm = max_i |e_i|/(atol + rtol·max(|y_i|,|y'_i|)) (i<5; t hariç);
  denetleyici h·clamp(0.9·err^(−1/5), 0.2, 5); ek olarak **h ≤ capFactor·h_nat** (0.5) — hata tahmini küçükken eksen/ufuk/kesişim
  yapısının atlanmasını önler. Varsayılan rtol=1e-10, atol=1e-12.
- `integrator:'rk4'` (GPU kuralı): h = κ·h_nat(y); hata kestirimi yok; `maxSteps` = sabit bütçe N. `precision:'f32'`: her işlem `Math.fround`.
- `stepRule:'nodrag'` (isteğe bağlı, **varsayılan değil**): φ' yerine L/sinθ − a sinθ (aP/Δ çerçeve sürüklenmesi terimi yok). φ döngüsel olduğundan
  r,θ'ya geri beslenmez; a=0.998'de ufuk yakını adım boyunu gereksiz küçülten tek terim budur. Ölçüm §7 (bütçe yükü ~2× düşer ama p99 Δr bazı vakalarda 1.5–4.6× kötüleşir → önerilmez).

### 4.3 θ eksen tekilliği

- L²/sin³θ ve L/sin²θ terimleri eksende patlar. **L = 0** (merkez sütun, meridyen düzlemi) için bu terimler analitik olarak yoktur
  (kodda `L === 0` ise atlanır, 0/0 olmaz): θ koordinatı eksenden "geçip" negatif olur; (r, −θ, φ) ≡ (r, θ, φ+π)
  olduğundan çıktı `canonicalAngles` ile indirgenir. Ekvator geçişi cosθ ile algılandığından θ = −π/2 de yakalanır.
  Test: b = 6 meridyen ışını kutuptan geçer, yön kesin sapma kuadratüründen beklenenle 1e-10 uyumlu.
- **0 < |L| < `axisEps`** (1e-7): ışın kutuptan ~|L|/b uzaklıkta geçer, φ π kadar çok hızlı döner ⇒ adım ~|L|/b'ye düşer
  (L=1e-9'da adım 1e-14'ün altına iner, `stuck`). Bu yüzden |L| < axisEps ise L := 0 (yön hatası ≲ 2e-8 rad).
  L = 1e-6 ve 1e-3 doğrudan integre edilir (testte süreklilik doğrulanır; L=1e-6'da ~1000 ret).
- GPU için: aynı yaklaşım (|L| < ε ⇒ L=0 ve `L==0` dalı) ya da sinθ'yı ε'dan aşağı kıstırma; kamera θ_cam'in kutuptan ≥ ~1e-3 rad uzak olması önerilir.

### 4.4 Bütçe bitince analitik sınıflandırma (`fate`)

Adım bütçesi biten (`status:'maxSteps'`, `reason:'budget'`) ışın için `fate` hareket sabitlerinden (L, Q: ışın başına tam) ve anlık r'den
hesaplanır: **içe giden ışın için (r₊, r) aralığında R(r)=0 kökü (dönüm noktası) yoksa ışın yakalanmıştır**; kök varsa dönüp kaçar; dışa giden ışın
zaten dönmüştür (kaçar). R(r₊) ≥ 0 ve R(r) > 0 olduğundan kök ancak R'nin aralıktaki yerel minimumu ≤ 0 ise vardır; R' = 4r³+2c₂r+c₃ r² terimsiz
kübik olduğundan kritik noktalar kapalı formülle bulunur (`hasTurningPointBelow`). Sonuç adım sayısı N'den bağımsızdır.
**Kural karşılaştırması:** "bütçe bitti → yakalandı" (shader'ın eski kuralı) fiziksel değil, **sayısal bir yaklaşımdır**: gölgeyi N'e bağlı biçimde
dışa şişirir (Ö3c, §7). Analitik kural bunu kaldırır; kaçan sınıfta (fate='escaped') arka plan yönü bilinmez (ince bir kritik-eğri halkası).

## 5. Koşullanma (önemli sayısal bulgular)

1. **Hamilton biçiminde korunan sabit f'dir** (b²'ye mutlak hata); **Carter/u_r biçiminde Δ·f korunur** (C = u_r² − R).
   Kısıt hatası Carter'da (r_cam/r)² ile büyür: r_cam=50 → r≈3'te ~600×. Sonuç: Carter biçimi DP45 f64'te bile r_cam ≳ 1e3'te,
   RK4 κ=0.05'te r_cam=50'de bozulur (radyal kısıt hatası 0.94, radyal ışın "kaçar"). **Hamilton (p_r) önerilir.**
2. **p_r ≈ 1 durum değişkeni b²'yi ancak 2r²ε kesinliğiyle taşır**: f64'te r_cam=1e6 → ~2e-4, 1e7 → ~2e-2; f32'de r=200 → 5e-3,
   r=1000 → 0.12. Sonuç: referansın (f64) sonsuz-gözlemci karşılaştırmaları r_cam≈1e5–1e6'da en iyidir (1e7'de bozulur);
   shader için r_cam ≲ 200 (veya ışını CPU'da r≈50–100'e taşıyıp başlangıç durumunu vermek).
3. Mutlak |ΔH| ufka yakın yakalanan ışınlarda büyür (terimler P²/Δ ~ 1e5): bu nedenle **ΔH/ölçek** (ölçek = |Δp_r²|+|K_θ|+|P²/Δ|) raporlanır.
4. Carter sabiti Kerr'de **negatif olabilir** (kutup yakını); göreli ΔQ için ölçek |Q|+L² kullanılır (`dQnorm`).

## 6. Doğrulama özeti (gerçek çıktılar; `node --test` → 91/91 geçti, ~2.7 s)

**Korunum** (DP5(4), rtol=1e-10, atol=1e-12, 160 rastgele ışın/spin, r_cam∈[20,100], b≲10; ΔQ/Q yalnız Q>1):

| a | maks ΔQ/(\|Q\|+L²) | maks ΔQ/Q | maks ΔH/ölçek | medyan \|ΔH\| | maks \|ΔH\| (ufka yakın) | radyal kısıt maks |
|---|---|---|---|---|---|---|
| 0 | 1.2e-9 | 1.2e-9 | 1.8e-9 | 8.5e-15 | 1.5e-7 | 1.5e-10 |
| 0.5 | 4.4e-10 | 4.4e-10 | 1.9e-9 | 8.5e-15 | 5.0e-7 | 1.5e-10 |
| 0.9 | 1.4e-9 | 1.4e-9 | 5.2e-9 | 8.5e-15 | 2.0e-6 | 1.5e-10 |
| 0.998 | 4.8e-10 | 4.8e-10 | 5.5e-8 | 8.5e-15 | 3.5e-5 | 1.6e-10 |

Tolerans ölçeklemesi (a=0.9, 40 ışın): rtol 1e-8 → 1e-10 → 1e-12: maks ΔQ 1.2e-8 → 1.5e-10 → 1.5e-12; ΔH/ölçek 2.9e-7 → 1.4e-9 → 1.5e-11;
toplam adım 2388 → 5893 → 14722.

**Zayıf alan** (Schwarzschild, r₀=1e5): b=100: δ = 4.1222539892e-2, kesin (ODE'den bağımsız kuadratür) 4.1222539749e-2, fark 1.4e-10;
iki-terimli formül 4.1178097e-2 (fark 4.44e-5 = üçüncü terim (128/3)/b³ = 4.27e-5 mertebesi). b=1000: fark 2.5e-11.

**Gölge** (r_cam=1e4, 12 doğrultu, yarıçap taraması + 34 ikiye bölme; `shadowBoundary` ile): a=0/θ=90°: 1.6e-6; a=0.9/60°: 2.4e-6;
a=0.998/85°: 2.5e-6 (hedef 1e-3). Kritik b: b_c(1−1e-6) yakalanır, b_c(1+1e-6) kaçar, r_min = 3.0025; r_ph'de bırakılan ışın 2 tur
sonra |r−r_ph| ≤ 7e-10 (Schwarzschild, Kerr prograd/retrograd).

**g-faktörü** (a=0.9, θ_o=80°, **r_cam=1e4**, referans = denetçinin bağımsız izleyicisi): (α,β)=(−7,0): modül r=6.206991154, g=1.299221370 (ref 6.206991152, 1.299221371);
(+7,0): 5.761331113, 0.499285020 (ref 5.761331114, 0.499285021). 14 noktada (a=0, 0.9, 0.998, retrograd dahil; ek 12 nokta aynı bağımsız izleyiciyle üretildi)
maks |Δr| = 2.3e-8, maks |Δg| = 2.0e-9 (testte eşik 1e-7). Eski referans (D=1e7'den düz çizgiyle taşınmış, ~1e-4 kendi hatası) kaldırıldı.

**RK4 yakınsama** (sabit Mino adımı, a=0.9, T=0.45): log-log eğim Hamilton 4.28 / 4.08, Carter 4.04 / 4.03 (beklenen 4). DP5: eğim 5.12.

## 7. float32 çalışması ve GPU için öneriler

Ölçüm düzeneği (`tools/float32-study.mjs`, `tests/math/float32.test.mjs`): referans = float64 DP5(4) rtol=1e-10; aday = RK4,
her işlemde `Math.fround`, 32×32–40×40 piksel, r_cam = 50, a=0.9, θ_o=75° (diğer: a=0 θ=85°, a=0.998 θ=60°), r_out = 20.
(`Math.sin/cos` iyimser: `fround(sin)`; gerçek GPU'da 1–2 ulp'den kötü olabilir.)

**Hata kaynağı kesme hatasıdır, float32 değil**: κ=0.05'te Δr medyanı f64-RK4 5.3e-6, f32-RK4 1.5e-5 (aynı mertebe); κ yarılandıkça
~16× düşer (f64: 8.0e-5 → 5.3e-6 → 3.4e-7). **Kesişim**: Hermite (kübik) doğrusala göre ~200× iyi (Δr medyan 1.5e-5 vs 2.8e-3).

| Ayar (Hamilton, f32, Hermite, r_esc=300) | uyuşmazlık | Δr med / p90 / p99 | adım ort/maks | gölge Δρ_c maks |
|---|---|---|---|---|
| κ=0.10, N=256 | %1.4 | 7.7e-5 / 9.4e-4 / 1.2 | 47 / 156 | 4.0e-3 |
| κ=0.05, N=512 | %0.5 | 1.4e-5 / 2.0e-4 / 6.3e-2 | 94 / 314 | 4.3e-3 |
| κ=0.05, N=1024 | — | — | — | 8.5e-5 |
| κ=0.025, N=640 | %0.0 | 1.6e-5 / 1.9e-4 / 9.4e-3 | 189 / 628 | 1.8e-1 (bütçe) |

(uyuşmazlık = shader sınıfı: `maxSteps` ⇒ "yakalandı"; yüzdelikler a=0.9/θ=75°, 40×40; p99 gölge kenarındaki birkaç piksele aittir.)
Diğer vakalar (κ=0.05, N=512): a=0 θ=85°: ort/maks adım 126/265, Δr med 6.9e-5; a=0.998 θ=60°: 70/512, Δr med 1.1e-5 (32 ışın bütçeye takılır).

**Önerilen shader algoritması (Hamilton, float32):**
```
durum y = (r, θ, φ, p_r, p_θ);  sabitler: a, L, Q (ışın başına), r₊, r₋ = a²/r₊
başlangıç: p_r = sign·√R(r)/Δ   (Carter bağıntısı; kameradan gelen p_r kullanılmaz), L=0 ise |L|<1e-7
for i in 0 ..< N:                                  # N = 512 (kalite) / 256 (hızlı)
    k1 = F(y);  h = κ · 1/√((k1.r/(r−r₊))² + k1.θ² + (sinθ·k1.φ)²)      # κ = 0.05 / 0.10
    RK4 adımı (4 F değerlendirmesi); (cosθ_eski·cosθ_yeni < 0) ⇒ kübik Hermite ile r*, φ*; g = 1/(u^t(1−Ωλ)), λ = L
    if r < r₊ + 1e-3: yakalandı;   if r > r_esc(≈300) && p_r < 0: kaçtı → (θ_∞, φ_∞) ekstrapolasyonu (θ''=−F[4], φ'' terimi dahil)
bütçe bitti → ANALİTİK: içe giden ve (r₊, r)'de R(r)=0 kökü yok ⇒ yakalandı; aksi halde kaçar (§4.4)
              [eski "bütçe bitti → yakalandı" kuralı = SAYISAL YAKLAŞIM; yalnız analitik kural yoksa, N spine bağlı seçilerek]
```
`hit.g` sonsuzdaki gözlemciye göredir: g = 1/(uᵗ(1−Ωλ)). **Sonlu kamera için ekrana yazılan değer `hit.gCam` = g·ν_cam/ν_∞ olmalıdır**
(ν_cam/ν_∞ = `ray.nuCamOverNuInf` = 1/E_ZAMO, kameradan ışın başına gelir). Fark r_cam=50'de gCam/g = 1.0205, g⁴'te (yoğunluk/parlaklık
ölçeği) %8.4. gCam, bağımsız izleyiciyle 5e-12 içinde doğrulandı. Sözde-koddaki `g` yalnızca r_cam→∞ sınırında doğrudur.
- **Δ'yı çarpan biçiminde** hesaplayın: (r − r₊)(r − r₋), r₋ = a²/r₊ (kerr.md §2.1); a≈1'de r²−2r+a² iptali sıfır verir.
- **Bütçe** (`recommendedGpuBudget(a, analytic)`): analitik kuralla N=512 tüm spinlerde yeterli (a=0.998'de ρ_c hatası 4e-5…9e-5 M, N=256'da da 4e-5);
  sayısal kuralla N spine bağlı: a<0.9 → 512, 0.9≤a<0.99 → 1024, a≥0.99 → 2048 (N=2048'de a=0.998 şişme 4e-4…8e-4 M).
- **Ortalama maliyet** κ=0.05'te ≈ 94 adım ≈ 380 F değerlendirmesi/ışın (a=0.9); en kötü ışın ≈ 310 adım. Mobil için κ=0.10/N=256 (47 adım).
- **Disk kesişiminde** yalnızca (r, φ, λ) gerekir; ISCO ≤ r ≤ r_out denetimi ve g için u^t, Ω kapalı formülleri (kerr.md §2.7) kullanılır.
- **Opak disk** için ilk kesişimde dur (`maxDiskHits=1`); ikincil görüntüler için N≥512 ve döngüde devam.

**float32 riskleri:**
1. *Biçim*: Carter/u_r durumu (~r²) f32'de kullanılamaz (uyuşmazlık %3.3, Δr medyan 1.8e-2 vs Hamilton %0.0, 1.5e-5). p_r kullanın.
2. *Büyük r_cam*: b² belirsizliği ≈ 2r²·6e-8. Gölge ρ_c f32−f64 hatası: r_cam=30: 2.7e-5, 50: 8.5e-5, 200: 1.5e-3, 500: 5.4e-3, 1000: 3.9e-2 (a=0.9).
   **Piksel cinsinden** (sabit FOV: 1 piksel ≈ r_cam·FOV/H·M; 40° FOV, 1080 piksel için ≈ r_cam·6.4e-4 M): r_cam=50 → 8.5e-5 M ≈ 0.003 piksel;
   200 → 1.5e-3 M ≈ 0.012; 500 → 5.4e-3 ≈ 0.017; 1000 → 3.9e-2 ≈ 0.06 piksel. Yani sabit FOV'da r_cam ≲ 1000 görsel olarak sorunsuzdur ("r_cam ≲ 200 şart"
   ifadesi fazla katıydı); sorun yalnızca güçlü yakınlaştırmada (FOV küçülünce piksel başına M azalır) önem kazanır. "Işını CPU'da r≈50–100'e taşıyın"
   her piksel ve her kare için uygulanamaz; kalıcı çözüm p_r'yi R(r)'den kurmak (§9, gelecek iş).
3. *Adım bütçesi*: kritik eğriye yakın ışınlar ~ln(1/δρ) tur harcar. "Bütçe bitti → yakalandı" bir **sayısal yaklaşımdır** ve gölgeyi şişirir
   (κ=0.05, f32−f64 ρ_c, 12 yön, en çok/ortalama): a=0.9/85°: N=256 ort 0.22 M, N=512 4.8e-3/9.6e-4 M, N=1024 5.6e-5; **a=0.998: N=512 60°: 0.124/0.024 M,
   85°: 0.154/0.034 M (≈4–5 piksel, 1080p/40°/r_cam=50); N=1024: 0.015–0.021 M; N=2048: 4e-4–8e-4 M**. En kötü yön χ≈191° (Kerr'in yassı prograd kenarı).
   Neden: ufuk yakınında çerçeve sürüklenmesi (φ' ∝ aP/Δ) adımı belirler, oysa φ döngüseldir. **Analitik sınıflandırma (§4.4) bu şişmeyi N=512'de
   0.124→4.3e-5 M (×2860, 60°) ve 0.154→7.8e-5 M (×1980, 85°) düşürür** (f32 düzeyi; N=256'da da 4.3e-5). Bütçesi biten pikseller yine N adım harcar
   (a=0.998/60°, 40×40: 32 piksel) ama doğru sınıflanır (hepsi DP5 ile uyumlu).
   `stepRule:'nodrag'` (isteğe bağlı): a=0.998/60° en kötü adım 512→229–231, bütçeyi bitiren piksel 32→0 (sayısal kuralla N=512'de bile gölge hatası 0.124→4.3e-4);
   ama p99 Δr 7.9e-2→1.2e-1 (a=0.998/60°), 6.3e-2→2.9e-1 (a=0.9/75°), 1.06→0.64 (a=0.998/85°), Δg p99 1.5e-3→4.1e-3 (a=0.9/75°): kritik halka yakınında
   sürüklenme terimi adımı kendiliğinden inceltiyormuş → varsayılan yapılmadı.
4. *Hermite şart*: doğrusal kesişim r'de ~3e-3 hata (görünür halka/kenar sorunları) verir.
5. *p_r' içindeki götürme*: terimler ~2r mertebesinde birbirini götürür (r=20'de mutlak hata ~r·ε₃₂); testlerde baskın değil ama r_cam büyüdükçe 2. maddeye dönüşür.
6. *sin/cos*: GPU'da `sin` büyük argümanda zayıf; θ ∈ (0,π) küçük kalır, φ yalnızca toplanır (sin/cos gerekmez) — φ'yi toplayın, kullanılacağı yerde indirgeyin (`mod 2π`).
7. *Eksen*: |L|<1e-7 ⇒ L=0 (kamera tarafında, ışın başına bir kez); kamera θ_cam kutuptan ≥ 1e-3 uzak. L=0 iken `L/s²` ve `L²c/s³` terimleri
   0/0 (NaN) vermesin diye ya `L==0` ile atlanmalı ya da `max(s², 1e-30)` ile paydalar kıstırılmalıdır (L=0'da pay da 0 olduğundan sonuç 0 kalır).
8. *Döngü*: sabit N, erken `break` (çıkan ışınlar için dalsal sapma); iç döngüde `dFdx` gibi türev gerektiren çağrı yok.
9. *Ufuk yakını*: `captureMargin` 1e-3 yeterli; a=0.998'de r₊=1.063 ve Δ_min ≈ 1e-3·(r₊−r₋)=1.3e-4 (f32 normalinde rahat).
10. *Doğrulama*: shader çıktısı bu modülün `traceRay` çıktısıyla (aynı κ, N, f32 öykünmesi) piksel piksel karşılaştırılmalı; f64 DP5(4) hedef (Δr medyan ~1e-5).

## 8. Performans (Node v22.23.4, tek iş parçacığı, 64×64 = 4096 ışın, `tools/bench64.mjs`, en iyi/5)

| Yapılandırma (a=0.9, θ_o=75°, r_cam=50) | süre | µs/ışın | adım/ışın |
|---|---|---|---|
| DP5(4) f64 rtol=1e-10 (referans) | 606 ms | 148 | 276 |
| DP5(4) f64 rtol=1e-8 | 256 ms | 62 | 111 |
| DP5(4) f64 rtol=1e-10, maxDiskHits=4 | 1012 ms | 247 | 471 |
| RK4 f64 κ=0.05, N=512 | 121 ms | 29 | 94 |
| RK4 f32-öykünme κ=0.05, N=512 | 187 ms | 46 | 94 |
| RK4 f32-öykünme κ=0.10, N=256 | 105 ms | 26 | 47 |

a=0.998/θ=60°: 349 / 154 / 1016 / 93 / 141 / 80 ms (aynı sıra).

## 9. Bilinen sınırlamalar / açık noktalar

- a = 1 tam değerinde `diskRedshiftFactor`/ISCO fizik modülünde r = M noktasında tanımsızdır; render için a ≤ 0.998.
- Çok küçük 0<|L|<1e-7 snap ile L=0 yapılır (yön hatası ≲ 2e-8 rad). Kutba çok yakın kamera (θ_cam < ~1e-3) desteklenmez.
- Kaçış yönü hatası ≈ (b/r_esc)³ rad (θ'' ve φ'' dahil, Ö1 düzeltmesi sonrası); r_esc=300'de en kötü 5e-5–2e-4 rad (b≲20), r_esc=1e4'te < 1e-8.
- θ_cam = π/2 tam değeri dejenere (bkz. §4.1 UI notu); a=1 ve θ_cam < 1e-3 desteklenmiyor.
- Kerr'de ISCO altı (r < r_isco) disk modeli yoktur; dairesel yörünge fonksiyonları r_ph altında RangeError verir (r_in ≥ ISCO sürece sorun yok).
- Zaman gecikmesi `tDelay` koordinat zamanıdır (BL t); r_cam büyükken büyüktür, göreli farklar anlamlıdır.
- **Gelecek iş:** p_r'yi durum olarak taşımak yerine R(r)'den cebirsel türetmek (p_r = ±√R/Δ; kısıt kendiliğinden sağlanır, dönüm noktasında işaret çevirme gerekir) — §5.2'deki nicemleme sınırını (2r²ε) kaldırır ve büyük r_cam / yakınlaştırma için asıl çözümdür. Henüz uygulanmadı/ölçülmedi.
