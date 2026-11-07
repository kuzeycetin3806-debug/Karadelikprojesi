// Arayüz metinleri — tek sözlük (ileride i18n için). Başka dosyalarda sabit metin YAZMAYIN.
// Rozet sınıfları: phys = FİZİKSEL, aest = ESTETİK, view = GÖSTERİM (kamera/ölçek/performans; fiziksel içerik değil).

export const LANG = 'tr';

export const S = {
  appTitle: 'Kara Delik Simülasyonu',
  appSubtitle: 'Kerr geometrisi · ışın izleme',
  canvasLabel: 'Kara delik sahnesi. Oklar: yörünge, artı/eksi: yakınlaştırma, Home: kamerayı sıfırla.',
  hint: 'Sürükle: yörünge · Tekerlek / iki parmak: yakınlaştır · Çift tıkla: sıfırla',

  toolbar: {
    panelOpen: 'Ayarlar',
    panelClose: 'Paneli kapat',
    panelToggleLabel: 'Kontrol panelini aç/kapat',
    resetCamera: 'Kamerayı sıfırla',
    screenshot: 'Ekran görüntüsü indir',
    fullscreen: 'Tam ekran',
    exitFullscreen: 'Tam ekrandan çık',
    help: 'Yardım ve kısayollar (?)',
    about: 'Hakkında',
    install: 'Uygulamayı yükle',
    utilLabel: 'Uygulama araçları',
  },

  app: {
    version: 'Sürüm',
    copyright: 'Telif hakkı © 2026 kuzeycetin3806-debug — Tüm hakları saklıdır',
    close: 'Kapat',
    splash: { load: 'Yükleniyor…', init: 'Işın izleyici hazırlanıyor…', shader: 'Shader derleniyor, ilk kare çiziliyor…', ready: 'Hazır' },
    update: { text: 'Yeni sürüm hazır', action: 'Yenile', dismiss: 'Sonra' },
    ios: { text: 'Uygulama olarak eklemek için Paylaş düğmesine, ardından “Ana Ekrana Ekle”ye dokunun.', dismiss: 'Anladım' },
    offlineReady: 'Uygulama çevrimdışı kullanıma hazır.',
    fatal: {
      title: 'Simülasyon başlatılamadı',
      noWebgl: 'Bu cihazda veya tarayıcıda WebGL 2 kullanılamıyor. Simülasyon, GPU üzerinde ışın izleme yaptığı için WebGL 2 gerektirir.',
      needs: 'Gerekenler',
      needsList: [
        'Güncel bir tarayıcı: Safari 15+ (iOS/iPadOS 15+), Chrome, Edge veya Firefox.',
        'Tarayıcı ayarlarında “donanım hızlandırma”nın açık olması.',
        'Güncel ekran kartı sürücüsü; pil tasarrufu modunun kapalı olması.',
      ],
      retry: 'Yeniden dene',
      detail: 'Teknik ayrıntı',
      lostTitle: 'Grafik bağlamı kayboldu',
      lostText: 'Tarayıcı grafik işlemcisini geçici olarak geri aldı (bellek baskısı veya sürücü sıfırlaması olabilir). Bağlam geri gelirse görüntü kendiliğinden devam eder; gelmezse sayfayı yeniden yükleyin.',
    },
  },

  help: {
    title: 'Yardım ve kısayollar',
    groups: [
      { title: 'Fare', rows: [['Sürükle', 'Kamerayı kara delik çevresinde döndür (yörünge)'], ['Tekerlek', 'Yakınlaştır / uzaklaştır'], ['Çift tıkla', 'Kamerayı sıfırla']] },
      { title: 'Dokunmatik', rows: [['Tek parmak sürükle', 'Yörünge'], ['İki parmak aç/kıs (pinch)', 'Yakınlaştır / uzaklaştır'], ['Çift dokun', 'Kamerayı sıfırla']] },
      { title: 'Klavye', rows: [['← →  ↑ ↓', 'Yörünge (azimut / eğim)'], ['+  −  (PgUp / PgDn)', 'Yakınlaştır / uzaklaştır'], ['Home veya 0', 'Kamerayı sıfırla'], ['?', 'Bu yardım penceresi'], ['F', 'Tam ekran (destekleniyorsa)'], ['Esc', 'Pencereyi / paneli kapat']] },
    ],
    badges: 'Rozetler: FİZİKSEL = Kerr geodeziklerinden/Page–Thorne modelinden gelir; ESTETİK = görsel hoşluk için, öngörü değildir; GÖSTERİM = kamera, ölçek, performans.',
  },

  about: {
    title: 'Hakkında',
    intro: 'Dönen (Kerr) bir kara delik çevresinde, kamera pikselinden geriye doğru ışık geodeziklerini GPU üzerinde ışın izleyerek hesaplayan etkileşimli bir simülasyon. Toplanma diski, Page–Thorne ince disk modeliyle ışıyan, kütleçekimsel kırmızıya kayma ve Doppler etkileri dahil edilmiş sıcaklık profilini kullanır. G = c = 1; uzunluk birimi M.',
    layersTitle: 'Fiziksel / estetik / gösterim ayrımı',
    layers: [
      ['phys', 'FİZİKSEL', 'Kerr metriği, ışık geodezikleri, merceklenme, gölge, ISCO, Page–Thorne sıcaklık profili, g faktörü (Doppler + kütleçekimsel kırmızıya kayma).'],
      ['aest', 'ESTETİK', 'Bloom, türbülans dokusu, disk dış kenar yumuşatması, yıldız/Samanyolu dağılımı, ton eşleme seçimi. Öngörü değildir.'],
      ['view', 'GÖSTERİM', 'Kamera, görüş alanı, pozlama, çözünürlük ölçeği, kalite/performans ayarları. Fiziksel içeriği değiştirmez.'],
    ],
    refsTitle: 'Kaynaklar',
    refs: [
      'Bardeen, J. M. (1973). Timelike and null geodesics in the Kerr metric. Les Houches.',
      'Bardeen, J. M., Press, W. H., Teukolsky, S. A. (1972). Rotating black holes: locally nonrotating frames, energy extraction, and scalar synchrotron radiation. ApJ 178, 347.',
      'Page, D. N., Thorne, K. S. (1974). Disk-accretion onto a black hole. I. Time-averaged structure of accretion disk. ApJ 191, 499.',
      'Luminet, J.-P. (1979). Image of a spherical black hole with thin accretion disk. A&A 75, 228.',
    ],
    note: 'Ayrıntılı denklemler ve sınır testleri: docs/physics/.',
    privacy: 'Tüm hesap cihazınızda yapılır; veri toplanmaz veya gönderilmez.',
    installTitle: 'Uygulama olarak kur',
    installText: 'Chrome/Edge: adres çubuğundaki yükle simgesi veya araç çubuğundaki düğme. iOS/iPadOS Safari: Paylaş → Ana Ekrana Ekle. Kurulduktan sonra çevrimdışı da çalışır.',
  },

  panel: {
    label: 'Kontrol paneli',
    resetAll: 'Tüm ayarları sıfırla',
    badgeLegend: 'Rozetler:',
    help: 'Açıklamayı göster/gizle',
    sheetHandle: 'Paneli sürükleme tutamacı',
  },

  badge: {
    phys: 'FİZİKSEL',
    aest: 'ESTETİK',
    view: 'GÖSTERİM',
  },
  badgeTip: {
    phys: 'Fiziksel model parametresi: sonuç Kerr geodeziklerinden / Page–Thorne diskinden gelir.',
    aest: 'Estetik seçim: görsel hoşluk içindir, fiziksel bir öngörü değildir.',
    view: 'Gösterim/kalite ayarı: kamera, ölçek veya performans; fiziksel içeriği değiştirmez.',
  },

  sections: {
    presets: 'Hazır ayarlar',
    bh: 'Kara delik',
    camera: 'Kamera',
    disk: 'Disk',
    image: 'Görüntü',
    perf: 'Performans',
    info: 'Bilimsel bilgi',
    stats: 'Performans göstergesi',
  },

  presets: {
    schwarzschild: 'Schwarzschild yandan',
    kerr09: 'Kerr a = 0,9',
    kerr0998: 'Yüksek spin (a = 0,998)',
    faceOn: 'Yüzden bakış',
  },

  controls: {
    a: { label: 'Spin a/M', tip: 'Boyutsuz dönme parametresi a/M. 0 = Schwarzschild. Üst sınır 0,998 (a = 1\'de ISCO ve kırmızıya kayma tanımsızlaşır).' },
    prograde: { label: 'Disk dönüş yönü', tip: 'Prograd: disk deliğin dönüşüyle aynı yönde; ISCO küçülür ve verim artar. Retrograd: ters yönde (ISCO büyür).', options: { true: 'Prograd', false: 'Retrograd' } },
    thetaCam: { label: 'Eğim θ', tip: 'Kameranın dönme eksenine göre kutupsal açısı. 0° = kutuptan (yüzden), 90° = disk düzlemi. 89,5°–90,5° bandı dejenere olduğundan atlanır.' },
    phiCam: { label: 'Azimut φ', tip: 'Kameranın eksen çevresindeki konumu. Eksenel simetri nedeniyle görüntüyü yalnızca disk deseni/gökyüzü yönünde değiştirir.' },
    rCam: { label: 'Uzaklık r', tip: 'Kameranın Boyer–Lindquist yarıçapı (M cinsinden). En az r₊ + 3 M, en çok 150 M (f32 hassasiyeti).' },
    fovY: { label: 'Görüş alanı', tip: 'Dikey görüş açısı (derece). Işın izleme projeksiyonudur; fizik değişmez.' },
    disk: { label: 'Disk', tip: 'İnce, opak, Page–Thorne ışıyan toplanma diski. Kapalıysa yalnızca merceklenen gökyüzü görünür.' },
    Tmax: { label: 'Disk T_max', tip: 'Disk etkin sıcaklığının tepe değeri (Kelvin). T_eff(r) = T_max·τ(r), τ Page–Thorne profilidir. Kütle ve ṁ yerine doğrudan seçilir.' },
    diskOut: { label: 'Dış yarıçap', tip: 'Diskin dış kenarı (M). İç kenar daima ISCO\'dur (altında Page–Thorne ışıması yoktur). Dış kenar yumuşatması estetiktir.' },
    diskEdgeFade: { label: 'Dış kenar yumuşatma', tip: 'Diskin dış kenarında, disk genişliğinin bu kesri boyunca ışımayı sönümler (0 = sert kenar). Estetiktir: bu bölgede Page–Thorne ışımasını değiştirir.' },
    fCol: { label: 'Renk düzeltmesi f_col', tip: 'T_renk = f_col·T_eff. Yıldız kütleli kara delikler için ≈ 1,7. Band modunda renk f_col·T sıcaklığına kayar, yüzey parlaklığı f_col⁻⁴ ile seyrelir (parlaklık f_col⁻⁴·Y(f_col·T)/Y(T) kadar değişir); gerekirse pozlamayı artırın.' },
    brightnessMode: { label: 'Parlaklık modu', tip: 'Band: görünür bantta fotometrik (kara cisim ışınımı gözlem bandında). Bolometrik: toplam ışınım, (g·τ)⁴. Renk her ikisinde aynıdır.', options: { band: 'Band', bolometric: 'Bolometrik' } },
    exposure: { label: 'Pozlama', tip: 'HDR radyansın ton eşlemeden önceki ölçeği (EV = log₂). Yalnızca GÖSTERİM (görüntüleme) ölçeğidir: fiziksel radyansı değiştirmez, mutlak parlaklık kalibrasyonu değildir. Ucuzdur, iz sürmeyi yeniden çalıştırmaz.' },
    tonemap: { label: 'Ton eşleme', tip: 'HDR → ekran dönüşümü. “Yok” yalnızca [0,1] kırpar ve fiziksel radyansı olduğu gibi gösterir.', options: { aces: 'ACES', agx: 'AgX', neutral: 'Nötr', none: 'Yok' } },
    bloom: { label: 'Bloom', tip: 'Parlak bölgelerin saçılan hale efekti. Estetik sonradan işleme.' },
    bloomStrength: { label: 'Bloom gücü', tip: 'Sahne enerjisinin hale olarak yeniden dağıtılan kesri.' },
    turbulence: { label: 'Türbülans', tip: 'Diskte ince ölçekli ışıma dokusu. Estetik; MHD simülasyonu değildir.' },
    turbulenceAmp: { label: 'Türbülans genliği', tip: 'Işıma modülasyonunun şiddeti (0–1).' },
    stars: { label: 'Yıldızlar', tip: 'Arka plan yıldız alanı. Yön eşlemesi, merceklenme ve renk kayması fiziksel; sayı/parlaklık dağılımı estetiktir.' },
    milkyWay: { label: 'Samanyolu', tip: 'Arka plan Samanyolu bandının şiddeti (0 = yok). Şekil ve renk estetiktir.' },
    animate: { label: 'Animasyon', tip: 'Disk deseni yerel Kepler açısal hızıyla akar. Sürekli çizim gerektirir (daha çok pil kullanır).' },
    timeScale: { label: 'Zaman ölçeği', tip: 'Animasyon hızı: gerçek 1 saniyede ilerleyen simülasyon süresi (M).' },
    performance: { label: 'Performans modu', tip: 'Etkileşim çözünürlüğü, biriktirilen kare sayısı ve animasyon kare hızı için ön ayar.', options: { quality: 'Kalite', balanced: 'Dengeli', battery: 'Pil' } },
    quality: { label: 'Işın izleme kalitesi', tip: 'Yüksek: ince adım (κ = 0,05, 512 adım). Mobil: κ = 0,10, 256 adım (~2–3× hızlı, kenarlarda biraz daha az doğru).', options: { high: 'Yüksek', mobile: 'Mobil' } },
    resolutionScale: { label: 'Çözünürlük ölçeği', tip: 'Durağan iz sürme çözünürlüğü / tuval çözünürlüğü. Düşük değer hızlıdır, bulanıktır.' },
  },

  units: { M: 'M', deg: '°', K: 'K', EV: 'EV', ms: 'M/s', km: 'km', s: 's', rads: 'rad/s', perM: 'M⁻¹' },

  info: {
    intro: 'Değerler seçili parametrelerden anlık hesaplanır (G = c = 1, uzunluk birimi M).',
    massLabel: 'Kütle (isteğe bağlı)',
    massUnit: 'M☉',
    massPlaceholder: 'örn. 10',
    massHelp: 'Kütle girilirse uzunluklar km, zaman birimi saniye olarak da gösterilir.',
    massPresets: { one: '10 M☉', sgr: '4,3×10⁶ M☉', m87: '6,5×10⁹ M☉' },
    massPresetTitle: { one: 'Yıldız kütleli örnek', sgr: 'Samanyolu merkezindeki delik mertebesi (yaklaşık)', m87: 'M87 galaksisi merkezi mertebesi (yaklaşık)' },
    massInvalid: 'Kütle pozitif bir sayı olmalı.',
    lengthUnit: 'Uzunluk birimi GM/c²',
    timeUnit: 'Zaman birimi GM/c³',
    unavailable: '—',
    docNote: 'Ayrıntı: docs/physics/kerr.md',
    expand: 'Açıklamayı göster/gizle',
    shadowNote: 'Gölge genişliği/yüksekliği, sonsuzdaki gözlemci için Bardeen (1973) kritik eğrisinin α–β düzlemindeki boyutlarıdır (M cinsinden). Kamera yakınken (r ≲ 10 M) kameranın gördüğü gölge bundan belirgin farklıdır: ör. a = 0, r = 5 M\'de pinhole ekran yarıçapı r·tanψ ≈ 6,78 M (≈ %31 büyük; açısal yarıçap ψ ≈ 53,6°, atan(3√3/5) ≈ 46,1°\'ye göre ≈ %16 büyük). r = 10–50 M aralığında fark yaklaşık ±%2 mertebesindedir.',
    shadowAngNote: 'Açısal gölge yarıçapı için kapalı form yalnızca a = 0\'da vardır; a > 0 için gösterilmez.',
    rows: {
      rPlus: {
        label: 'Olay ufku r₊',
        desc: 'Dış ufuk: geri dönüşsüz yüzey. r₊ = M + √(M² − a²).',
        src: 'MTW 33.5 · kerr.md §2.2 (horizonRadii)',
      },
      rMinus: {
        label: 'İç ufuk r₋',
        desc: 'Cauchy (iç) ufku. r₋ = M − √(M² − a²) = a²/r₊.',
        src: 'MTW 33.5 · kerr.md §2.2 (horizonRadii)',
      },
      ergo: {
        label: 'Ergosfer (ekvator)',
        desc: 'Statik gözlemcinin var olamadığı sınır; g_tt = 0. r_E(θ) = M + √(M² − a² cos²θ). Ekvatorda 2M, kutuplarda r₊.',
        src: 'MTW 33.5 · kerr.md §2.3 (ergosphereRadius)',
      },
      rPhPro: {
        label: 'Foton yörüngesi r_ph (prograd)',
        desc: 'Ekvatoral dairesel foton yörüngesi, deliğin dönüşüyle aynı yönde. a = 0 için 3M.',
        src: 'Bardeen–Press–Teukolsky 1972, eş. 2.18 · kerr.md §2.5',
      },
      rPhRetro: {
        label: 'Foton yörüngesi r_ph (retrograd)',
        desc: 'Ekvatoral dairesel foton yörüngesi, deliğe ters yönde. a = 0 için 3M; a = M için 4M.',
        src: 'Bardeen–Press–Teukolsky 1972, eş. 2.18 · kerr.md §2.5',
      },
      rIsco: {
        label: 'ISCO r_isco (seçili yön)',
        desc: 'En içteki kararlı dairesel yörünge: diskin iç kenarı. a = 0 için 6M. Seçili disk yönüne (prograd/retrograd) göre hesaplanır.',
        src: 'Bardeen–Press–Teukolsky 1972, eş. 2.21 · kerr.md §2.6',
      },
      eta: {
        label: 'Işınım verimi η',
        desc: 'η = 1 − E_isco: ISCO\'ya düşen kütlenin ışınıma çevrilen enerji kesri. a = 0 için ≈ %5,7; a = 0,998 prograd için ≈ %32.',
        src: 'Thorne 1974 · kerr.md §2.7 · disk.md §1 (radiativeEfficiency)',
      },
      omegaH: {
        label: 'Ufuk açısal hızı Ω_H',
        desc: 'Ufkun açısal hızı: Ω_H = a/(2M r₊). Ufukta çerçeve sürüklenmesi ω bu değere eşittir.',
        src: 'BPT72 · kerr.md §2.4 (frameDraggingOmega, r = r₊)',
      },
      shadowW: {
        label: 'Gölge genişliği (sonsuzdaki gözlemci, Bardeen eğrisi)',
        desc: 'Sonsuzdaki gözlemci için Bardeen kritik eğrisinin α–β düzlemindeki yatay genişliği Δα (M cinsinden), seçili eğim için. Schwarzschild\'de 2·3√3 M ≈ 10,39 M. Kameranın gördüğü açısal boyut değildir.',
        src: 'Bardeen 1973 · kerr.md §2.11 (shadowBoundary)',
      },
      shadowH: {
        label: 'Gölge yüksekliği (sonsuzdaki gözlemci, Bardeen eğrisi)',
        desc: 'Sonsuzdaki gözlemci için Bardeen kritik eğrisinin α–β düzlemindeki dikey yüksekliği Δβ (M cinsinden), seçili eğim için. Kameranın gördüğü açısal boyut değildir.',
        src: 'Bardeen 1973 · kerr.md §2.11 (shadowBoundary)',
      },
      shadowAng: {
        label: 'Gölge açısal yarıçapı (kamerada, yalnız a = 0)',
        desc: 'Schwarzschild\'de r konumundaki statik gözlemcinin gördüğü gölge yarıçapı: sin ψ = 3√3 M·√(1 − 2M/r)/r. Yalnız a = 0\'da kapalı form; a > 0 için gösterilmez. r → ∞ için ψ·r → 3√3 M.',
        src: 'Synge 1966 · Schwarzschild\'de kritik çarpma parametresi b_c = 3√3 M',
      },
      omegaCam: {
        label: 'Çerçeve sürüklenmesi ω (kamerada)',
        desc: 'Kamera konumunda ZAMO açısal hızı: ω = 2Mar/A. Uzakta ≈ 2Ma/r³ ile hızla azalır.',
        src: 'BPT72 · kerr.md §2.4 (frameDraggingOmega)',
      },
      tPeak: {
        label: 'Page–Thorne T_max konumu',
        desc: 'Disk etkin sıcaklığının en yüksek olduğu yarıçap (seçili spin ve yön için). a = 0 için ≈ 9,55 M.',
        src: 'Page & Thorne 1974 · disk.md §2 (diskTemperaturePeak)',
      },
    },
  },

  stats: {
    fps: 'Kare hızı',
    trace: 'İz çözünürlüğü',
    canvas: 'Tuval',
    scale: 'Ölçek',
    accum: 'Biriken kare',
    mode: 'Durum',
    hdr: 'HDR hedefi',
    interacting: 'etkileşim',
    animating: 'animasyon',
    idle: 'durağan',
  },

  errors: {
    screenshot: 'Ekran görüntüsü alınamadı.',
  },
  toast: {
    saved: 'Ekran görüntüsü kaydedildi.',
  },
};
