# Kara Delik Simülasyonu — Koordinatör Talimatları

Bu proje; bilimsel olarak doğru, fotogerçekçi ve etkileşimli bir 3D kara delik simülasyonudur
(Three.js + WebGL/GLSL, tarayıcıda; masaüstü, mobil ve iPad).

## Ana ajanın rolü
Ana oturum **baş mimar, proje yöneticisi ve koordinatördür**:
- Mimariyi ve nihai kararları yönetir; görevleri uzman alt ajanlara dağıtır.
- Alt ajan çıktılarını doğrudan kabul etmez: diff'i okur, testleri kendisi çalıştırır.
- Fizik/matematik sonuçlarını Grafik ajanına iletmeden önce kontrol eder (gerekirse denetçiye onaylatır).
- Entegrasyonu ve commit'leri kendisi yapar.

## Alt ajanlar (`.claude/agents/`)
| Ajan | Model | Effort | Dosya sahipliği |
|---|---|---|---|
| `fizik-uzmani` | claude-sonnet-5-5 | high | `src/physics/`, `docs/physics/` |
| `matematik-uzmani` | claude-sonnet-5-5 | high | `src/math/`, `tests/`, `tools/` |
| `grafik-shader-uzmani` | claude-sonnet-5-5 | high | `src/render/`, `src/shaders/` |
| `arayuz-ux-uzmani` | claude-sonnet-5-5 | medium | `src/ui/`, `src/styles/`, `index.html` |
| `bilimsel-denetci` | claude-opus-5-5 | max | salt okunur (Write/Edit yok), yalnızca rapor |

Ortak/paylaşılan dosyalar (`package.json`, `src/main.js`, yapılandırma) **yalnızca ana ajan** tarafından düzenlenir.

## Görev dağıtım kuralları
1. Bağımsız görevleri paralel çalıştır; **aynı dosyayı aynı anda iki ajana verme**.
2. Her görev isteminde: hedef, sahip olunan dosyalar, dokunulmayacak dosyalar, kabul kriterleri, beklenen rapor.
3. Akış: Fizik → (Denetçi) → Matematik → (Denetçi) → Grafik → Arayüz → Denetçi (entegrasyon sonrası).
4. Her ajandan rapor iste: yapılan işler, yöntemler, test çıktıları, sorunlar.
5. Gereksiz ajan çağırma; küçük işleri ana ajan kendisi yapsın.

## Model / effort politikası
- **Kritik** (GR denklemleri, Kerr metriği, ışın yolları, merceklenme doğruluğu, büyük mimari, kritik hatalar,
  son bilimsel doğrulama): Opus 5.5 + max. Uygulama: `bilimsel-denetci` ajanı veya ana ajanın kendisi;
  gerekirse bir uzman ajan tek seferlik `model: "opus"`, `effort: "max"` ile çağrılır.
- **Orta** (shader, grafik optimizasyonu, sayısal uygulama, karmaşık hata ayıklama): Sonnet 5.5 + high.
- **Rutin** (UI, CSS, basit bileşen, küçük düzenleme, dokümantasyon): Sonnet 5.5 + medium.
- Not: Agent aracında `model` geçersiz kılma her zaman mümkündür; `effort` geçersiz kılma yalnızca kullanıcı
  açıkça istediğinde kullanılmalıdır — aksi halde ajanın frontmatter'daki effort değeri geçerlidir.

## Kullanım limiti
- Beş ajanı aynı anda çalıştırma; yalnızca gereken uzmanı çağır.
- Opus/max yalnızca kritik işlerde (denetçi pahalıdır: entegrasyon kilometre taşlarında çağır, her küçük değişiklikte değil).
- Aynı araştırmayı iki ajana yaptırma; bir ajanın sonucunu diğerine özet olarak ilet.

## Bilimsel kurallar
- Birimler: G = c = 1, uzunluk birimi M (aksi açıkça belirtilmedikçe).
- Fiziksel efektler ile estetik efektler (bloom, tonemapping vb.) kodda ve dokümanda ayrı işaretlenir.
- Her yeni fizik fonksiyonu limit testleriyle gelir (a=0: r₊=2M, r_ph=3M, r_isco=6M, b_c=3√3M).
