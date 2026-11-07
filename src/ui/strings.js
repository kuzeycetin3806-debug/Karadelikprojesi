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
    guide: 'Kılavuz',
    about: 'Hakkında',
    privacy: 'Gizlilik politikası',
    install: 'Uygulamayı yükle',
    more: 'Diğer işlemler',
    menuLabel: 'Diğer işlemler menüsü',
    utilLabel: 'Uygulama araçları',
  },

  app: {
    version: 'Sürüm',
    copyright: 'Telif hakkı © 2026 kuzeycetin3806-debug — Tüm hakları saklıdır',
    designer: 'App design by Kuzey Çetin',
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

  // ---- Kılavuz ve gizlilik içeriği: tek kaynak. Uygulama içi pencereler (dialogs.js) ve bağımsız sayfalar
  // (public/kilavuz.html, public/gizlilik.html — tests/ui/make-pages.mjs üretir) AYNI veriyi kullanır.
  // Blok biçimi: ['p', metin] · ['h', alt başlık] · ['ul', [metin…]] · ['dl', [[terim, açıklama]…]] · ['keys', [[tuş, açıklama]…]]
  //              · ['note', metin] · ['links', [[etiket, adres]…]]
  guide: {
    title: 'Kullanım kılavuzu',
    lead: 'Dönen (Kerr) bir kara deliğin çevresinde ışığın nasıl büküldüğünü gerçek zamanlı keşfedin.',
    toc: 'Bölümler',
    openFull: 'Tam sayfa aç',
    backToApp: 'Uygulamaya dön',
    print: 'Yazdır',
    sections: [
      {
        id: 'start', title: 'Başlarken',
        blocks: [
          ['p', 'Bu uygulama, bir kara deliğin çevresindeki ışığın izlediği yolu her piksel için geriye doğru hesaplayarak (ışın izleme) görüntü üretir. Hesap cihazınızın ekran kartında yapılır; internet bağlantısı gerekmez.'],
          ['ul', [
            'Sahneyi sürükleyerek kara deliğin çevresinde dönün; iki parmakla (veya fare tekerleğiyle) yakınlaşın.',
            'Ayarlar düğmesiyle paneli açın ve bir hazır ayar seçin.',
            'İsterseniz Spin, Eğim, Uzaklık ve Disk sıcaklığı kaydırıcılarıyla görüntüyü değiştirin.',
            'Kamera düğmesi ekran görüntüsü kaydeder; “…” menüsünde Kılavuz, Hakkında, Gizlilik ve Tam ekran bulunur.',
          ]],
        ],
      },
      {
        id: 'camera', title: 'Kamerayı kontrol etme',
        blocks: [
          ['h', 'Fare'],
          ['keys', [['Sürükle', 'Kamerayı kara deliğin çevresinde döndürür (yörünge).'], ['Tekerlek', 'Yakınlaştırır / uzaklaştırır.'], ['Çift tıkla', 'Kamerayı başlangıç konumuna alır.']]],
          ['h', 'Dokunmatik ekran'],
          ['keys', [['Tek parmak sürükle', 'Yörünge.'], ['İki parmak aç/kıs', 'Yakınlaştır / uzaklaştır.'], ['Çift dokun', 'Kamerayı sıfırlar.']]],
          ['h', 'Klavye'],
          ['keys', [['← → ↑ ↓', 'Yörünge (yatay: azimut, dikey: eğim). Önce sahneye odaklanın (Tab).'], ['+  −  (PgUp / PgDn)', 'Yakınlaştır / uzaklaştır.'], ['Home veya 0', 'Kamerayı sıfırla.'], ['?', 'Bu kılavuzun Kontroller bölümünü aç / kapat.'], ['F', 'Tam ekran (tarayıcı destekliyorsa).'], ['Esc', 'Pencereyi, menüyü veya paneli kapat.']]],
          ['note', 'Kamera yumuşak hareket eder; hızlı bırakırsanız bir süre dönmeye devam eder. Eğim 1°–179° arasındadır.'],
        ],
      },
      {
        id: 'presets', title: 'Hazır ayarlar',
        blocks: [
          ['p', 'Hazır ayarlar tek dokunuşla spin, bakış açısı ve uzaklığı birlikte ayarlar. Diski açık bırakırlar; parlaklık, bloom gibi görüntü ayarlarınıza dokunmazlar.'],
          ['dl', [
            ['Schwarzschild yandan', 'Dönmeyen kara delik (a = 0), diske yandan (85°) bakış. Klasik “halka” görünümü.'],
            ['Kerr a = 0,9', 'Hızlı dönen kara delik, 75° eğim. Diskin iki yanı belirgin biçimde farklı parlar.'],
            ['Yüksek spin (a = 0,998)', 'Olabilecek en hızlı dönüşe yakın; disk ufka çok yaklaşır, gölge yamulur.'],
            ['Yüzden bakış', 'Kutuptan (10°) bakış: disk neredeyse tam daire, ortada gölge.'],
          ]],
        ],
      },
      {
        id: 'controls', title: 'Kontroller',
        blocks: [
          ['p', 'Panelin üstündeki Basit | Gelişmiş anahtarı kontrol sayısını belirler. Seçiminiz bu cihazda hatırlanır. Her kontrolün yanındaki “?” düğmesi kısa bir açıklama gösterir.'],
          ['h', 'Basit mod'],
          ['dl', [
            ['Spin (a)', 'Kara deliğin dönüş hızı, 0 ile 0,998 arası. 0 = dönmüyor. Büyüdükçe disk içeri yaklaşır ve görüntü asimetrik olur.'],
            ['Eğim', 'Bakış açınız. 0°’ye yakın: tepeden; 90°’ye yakın: diski yandan görürsünüz.'],
            ['Uzaklık', 'Kara delikten uzaklığınız. “M” kara deliğin kütlesine bağlı uzunluk birimidir (M = GM/c²). Yakınken ışık çok daha fazla bükülür.'],
            ['Disk sıcaklığı (Tmax)', 'Diskin en sıcak yerinin sıcaklığı, Kelvin. Düşük: kırmızı-turuncu; yüksek: beyaz-mavimsi.'],
            ['Animasyon', 'Diskin dönüşünü canlandırır. Kapalıyken görüntü durağandır, pil daha az harcanır.'],
          ]],
          ['h', 'Gelişmiş mod'],
          ['p', 'Gelişmiş modda tüm kontroller ve “Bilimsel bilgi” ekranı görünür. Kontroller kısa rozetlerle işaretlidir: FİZİKSEL (Kerr geodeziklerinden ve Page–Thorne disk modelinden gelir), ESTETİK (görsel hoşluk için; fiziksel öngörü değildir), GÖSTERİM (kamera, ölçek, performans; fiziksel içeriği değiştirmez).'],
          ['dl', [
            ['Disk dönüş yönü', 'Prograd: disk deliğin dönüşüyle aynı yönde. Retrograd: ters yönde (disk iç kenarı uzaklaşır).'],
            ['Azimut', 'Kameranın kara deliğin etrafındaki konumu. Delik eksen simetrik olduğundan görüntüyü yalnızca disk deseni ve gökyüzü yönünde değiştirir.'],
            ['Görüş alanı', 'Kameranın görüş açısı (derece). Fizik değişmez, yalnızca çerçeve.'],
            ['Disk', 'Toplanma diskini açar/kapatır; kapalıyken yalnızca merceklenen gökyüzü görünür.'],
            ['Dış yarıçap', 'Diskin dış kenarı (M). İç kenar her zaman kararlı en iç dairesel yörüngedir (ISCO).'],
            ['Dış kenar yumuşatma', 'Dış kenarda ışımayı yumuşakça söndürür (estetik).'],
            ['Renk düzeltmesi f_col', 'Gözlenen rengin etkin sıcaklığa oranı (yıldız kütleli kara delikler için yaklaşık 1,7).'],
            ['Parlaklık modu', 'Band: görünür ışıkta fotometrik. Bolometrik: toplam ışınım.'],
            ['Pozlama', 'Görüntüyü aydınlatır/karartır (EV). Yalnızca gösterim ölçeğidir; mutlak parlaklık kalibrasyonu değildir.'],
            ['Ton eşleme', 'Çok parlak (HDR) görüntüyü ekrana sığdırma yöntemi: ACES, AgX, Nötr, Yok.'],
            ['Bloom ve gücü', 'Parlak yerlerin etrafında saçılan ışık hâlesi (estetik).'],
            ['Türbülans ve genliği', 'Diskte ince ışıma dokusu (estetik; fiziksel bir benzetim değildir).'],
            ['Yıldızlar, Samanyolu', 'Arka plan gökyüzü. Işığın yönü ve renk kayması fiziksel; yıldız sayısı ve dağılımı estetiktir.'],
            ['Zaman ölçeği', 'Animasyonun hızı (gerçek 1 saniyede ilerleyen simülasyon süresi).'],
            ['Performans modu', 'Kalite / Dengeli / Pil: çözünürlük ve kare hızı için hazır tercih.'],
            ['Işın izleme kalitesi', 'Yüksek: ince adım, daha doğru kenarlar. Mobil: yaklaşık 2–3 kat hızlı, kenarlarda biraz daha az doğru.'],
            ['Çözünürlük ölçeği', 'Düşük değer hızlı ama bulanıktır.'],
          ]],
          ['h', 'Bilimsel bilgi ekranı'],
          ['p', 'Gelişmiş modda, seçtiğiniz spin ve bakış açısı için olay ufku, foton yörüngesi, ISCO, ışınım verimi, gölge boyutu gibi değerler anında hesaplanır (G = c = 1, uzunluk M cinsinden). İsteğe bağlı olarak bir kütle girerseniz (örneğin 10 güneş kütlesi) uzunluklar kilometre olarak da gösterilir.'],
        ],
      },
      {
        id: 'seeing', title: 'Ne görüyorsunuz?',
        blocks: [
          ['dl', [
            ['Gölge', 'Ortadaki karanlık bölge. Kara deliğin ufkuna düşen ışınların geldiği yönlerdir; ufkun kendisinden daha büyüktür. Dönmeyen bir delikte gölgenin yarıçapı yaklaşık 5,2 M (ufuk 2 M).'],
            ['Foton halkası', 'Gölgenin kenarındaki ince, parlak halka. Işık kara deliğin etrafında bir veya birkaç tur dönüp gözünüze ulaşır; ne kadar çok dolanırsa o kadar ince ve sönük bir halka oluşur.'],
            ['Merceklenmiş disk', 'Kara deliğin arkasında kalan disk bölümünün ışığı delikle bükülerek üstte ve altta görünür hâle gelir. Bu yüzden yandan bakarken bile diskin “üst kemeri” gölgenin üzerinden aşar.'],
            ['Doppler parlaması', 'Disk dönerken bir yanı size doğru, diğer yanı sizden uzağa hareket eder. Yaklaşan taraf daha parlak ve mavimsi, uzaklaşan taraf daha sönük ve kırmızımsıdır. Bu yüzden diskin iki yanı eşit parlamaz.'],
            ['Kırmızıya kayma', 'Kütleçekimi kuyusundan çıkan ışık enerji kaybeder: ufka yakın bölgelerden gelen ışık daha kırmızı ve sönüktür. Doppler etkisiyle birlikte rengi ve parlaklığı belirleyen toplam “g faktörü”nü oluşturur.'],
            ['Spin etkisi', 'Dönen deliklerde disk iç kenarı (ISCO) deliğe daha çok yaklaşır, disk daha sıcak ve parlak olur; gölge hafifçe yassılaşıp bir yana kayar.'],
          ]],
          ['note', 'Renkler kara cisim ışımasına dayanır ve yaklaşıktır; bloom, türbülans dokusu ve yıldız dağılımı gibi görsel efektler estetiktir. Ayrıntı için Hakkında penceresine bakın.'],
        ],
      },
      {
        id: 'performance', title: 'Performans ipuçları',
        blocks: [
          ['ul', [
            'Telefon ve tabletlerde uygulama otomatik olarak Mobil kalite ve Pil modunu seçer; ısınma ve pil tüketimi azalır.',
            'Görüntü takılıyorsa Gelişmiş modda Çözünürlük ölçeğini düşürün veya Animasyonu kapatın.',
            'Bloom ve Türbülans kapatılabilir; diğer ayarlar aynı kalır.',
            'Kamerayı hareket ettirirken çözünürlük geçici olarak düşer, durunca netleşir: bu beklenen davranıştır.',
            'iPhone/iPad’de Düşük Güç Modu ve cihaz ısındığında tarayıcı kare hızını kısabilir.',
            'Kullanmadığınız sekmeleri kapatmak ekran kartı belleğini boşaltır.',
          ]],
        ],
      },
      {
        id: 'install', title: 'Uygulamayı yükleme',
        blocks: [
          ['p', 'Uygulamayı ana ekrana ekleyebilirsiniz; adres çubuğu olmadan tam ekran açılır ve çevrimdışı da çalışır.'],
          ['dl', [
            ['iPhone / iPad (Safari)', 'Paylaş düğmesine dokunun → “Ana Ekrana Ekle” → Ekle. (iOS’ta yalnızca Safari bu seçeneği sunar.)'],
            ['Android (Chrome)', 'Menü (⋮) → “Uygulamayı yükle” veya “Ana ekrana ekle”. Ya da uygulamadaki “…” menüsünden “Uygulamayı yükle”.'],
            ['Masaüstü (Chrome / Edge)', 'Adres çubuğundaki yükle simgesine tıklayın ya da uygulamadaki “…” menüsünden “Uygulamayı yükle”.'],
          ]],
          ['note', 'İlk yüklemeden sonra uygulama internet olmadan da açılır. Yeni sürüm çıktığında “Yeni sürüm hazır” bildirimi görünür.'],
        ],
      },
      {
        id: 'trouble', title: 'Sorun giderme',
        blocks: [
          ['dl', [
            ['“Simülasyon başlatılamadı” / WebGL 2 yok', 'Simülasyon WebGL 2 gerektirir. Güncel bir tarayıcı kullanın (Safari 15+, Chrome, Edge, Firefox), tarayıcı ayarlarında donanım hızlandırmayı açın, pil tasarrufu modunu kapatın ve sayfayı yenileyin.'],
            ['Görüntü yavaş veya takılıyor', 'Panelde Gelişmiş → Performans modu: Pil; Çözünürlük ölçeğini düşürün; Animasyon ve Bloom’u kapatın.'],
            ['Siyah ekran', 'Önce kamerayı sıfırlayın (Sıfırla düğmesi). Disk ve yıldızlar kapalıysa sahne gerçekten siyah olabilir: Tüm ayarları sıfırlayın. Sürüyorsa sayfayı yenileyin.'],
            ['“Grafik bağlamı kayboldu” ekranı', 'Tarayıcı ekran kartını geçici olarak geri aldı. Birkaç saniye bekleyin; gelmezse sayfayı yeniden yükleyin.'],
            ['Eski sürüm görünüyor', 'Uygulamayı tamamen kapatıp yeniden açın veya “Yeni sürüm hazır” bildirimindeki Yenile’ye dokunun.'],
            ['Ekran görüntüsü inmiyor', 'Tarayıcı indirmeye izin vermiyor olabilir. iOS’ta görüntü “Dosyalar” uygulamasına veya indirilenlere kaydedilir.'],
          ]],
        ],
      },
    ],
  },

  privacy: {
    title: 'Gizlilik politikası',
    appName: 'Kara Delik Simülasyonu',
    effective: 'Yürürlük tarihi: 7 Kasım 2026',
    openFull: 'Tam sayfa aç',
    backToApp: 'Uygulamaya dön',
    print: 'Yazdır',
    repoUrl: 'https://github.com/kuzeycetin3806-debug/Karadelikprojesi',
    githubPrivacyUrl: 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement',
    sections: [
      {
        id: 'summary', title: 'Özet',
        blocks: [
          ['p', 'Kara Delik Simülasyonu kişisel verilerinizi toplamaz, saklamaz, satmaz ve paylaşmaz. Hesap, giriş, reklam, analitik veya çerez yoktur. Tüm hesaplamalar cihazınızda yapılır.'],
        ],
      },
      {
        id: 'who', title: 'Sorumlu',
        blocks: [
          ['p', 'Uygulamanın tasarımı ve geliştirilmesi: Kuzey Çetin.'],
        ],
      },
      {
        id: 'data', title: 'Hangi veriler toplanmaz?',
        blocks: [
          ['ul', [
            'Ad, e-posta, konum, kimlik, fotoğraf, kişi listesi gibi kişisel veriler istenmez ve toplanmaz.',
            'Kamera, mikrofon, konum veya benzeri cihaz izinleri istenmez.',
            'Analitik, reklam, izleme veya hata raporlama hizmeti kullanılmaz; çerez kullanılmaz.',
            'Harici yazı tipi, CDN veya üçüncü taraf betik kullanılmaz: uygulama yalnızca kendi adresindeki dosyaları yükler. Sistem yazı tipleri kullanılır.',
          ]],
        ],
      },
      {
        id: 'storage', title: 'Cihazınızda saklananlar',
        blocks: [
          ['p', 'Uygulama, tercihlerinizi hatırlamak için tarayıcının yerel depolamasını (localStorage) kullanır. Bu bilgiler yalnızca cihazınızda kalır, hiçbir yere gönderilmez ve kimliğinizle ilişkilendirilmez. Anahtarlar:'],
          ['dl', [
            ['karadelik.uiMode', 'Panel görünümü seçiminiz (Basit veya Gelişmiş).'],
            ['karadelik.tipSeen', '“Nasıl kullanılır” ipucunun kapatıldığı.'],
            ['karadelik.iosHintDismissed', 'iPhone/iPad’de “Ana Ekrana Ekle” ipucunun kapatıldığı.'],
          ]],
          ['p', 'Tarayıcınızın site verilerini temizleyerek bunları silebilirsiniz.'],
        ],
      },
      {
        id: 'cache', title: 'Çevrimdışı önbellek',
        blocks: [
          ['p', 'Uygulama çevrimdışı çalışabilmek için bir service worker ve cihaz önbelleği kullanır. Önbellekte yalnızca uygulama dosyaları (sayfa, betik, stil, simgeler, kılavuz ve bu sayfa) bulunur; kişisel veri bulunmaz. Site verilerini temizleyerek veya uygulamayı kaldırarak silinir.'],
        ],
      },
      {
        id: 'screenshots', title: 'Ekran görüntüleri',
        blocks: [
          ['p', 'Ekran görüntüsü yalnızca cihazınızda oluşturulur ve indirilir; hiçbir sunucuya yüklenmez.'],
        ],
      },
      {
        id: 'hosting', title: 'Barındırma',
        blocks: [
          ['p', 'Uygulama GitHub Pages üzerinde barındırılır. Siteyi açtığınızda GitHub, kendi sunucu günlüklerinde IP adresi ve tarayıcı bilgisi gibi teknik verileri işleyebilir. Bu işleme GitHub’ın sorumluluğundadır ve GitHub Gizlilik Bildirimi’ne tabidir.'],
          ['links', [['GitHub Genel Gizlilik Bildirimi', 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement']]],
        ],
      },
      {
        id: 'children', title: 'Çocukların gizliliği',
        blocks: [
          ['p', 'Uygulama kimseden, çocuklar dahil, kişisel veri toplamaz. Çocuklardan bilerek veri toplamayız.'],
        ],
      },
      {
        id: 'changes', title: 'Değişiklikler',
        blocks: [
          ['p', 'Bu politika değişirse bu sayfa güncellenir ve yürürlük tarihi değişir. Güncel metin her zaman uygulamanın içinden ve bu sayfadan okunabilir.'],
        ],
      },
      {
        id: 'contact', title: 'İletişim',
        blocks: [
          ['p', 'Sorularınız için projenin GitHub deposu üzerinden bir konu (issue) açabilirsiniz.'],
          ['links', [['GitHub deposu', 'https://github.com/kuzeycetin3806-debug/Karadelikprojesi']]],
          ['note', 'Bu metin sade bir bilgilendirmedir; hukuki danışmanlık yerine geçmez.'],
        ],
      },
    ],
    en: {
      id: 'english', lang: 'en', title: 'Privacy summary (English)',
      blocks: [
        ['p', 'Black Hole Simulation does not collect, store, sell or share personal data. There are no accounts, ads, analytics, cookies or third-party scripts, fonts or CDNs; all computation runs on your device.'],
        ['ul', [
          'Local storage (on your device only): karadelik.uiMode (Basic/Advanced panel choice), karadelik.tipSeen and karadelik.iosHintDismissed (dismissed tips).',
          'Offline cache: a service worker caches only the app files so the app works offline.',
          'Screenshots are created and saved on your device only; nothing is uploaded.',
          'Hosting: GitHub Pages. GitHub may process technical data such as your IP address in its server logs, under the GitHub General Privacy Statement.',
          'Children: no personal data is collected from anyone, including children.',
        ]],
        ['p', 'Effective date: 7 November 2026. Responsible: Kuzey Çetin. Contact: via the GitHub repository (no email address is published).'],
        ['links', [['GitHub repository', 'https://github.com/kuzeycetin3806-debug/Karadelikprojesi'], ['GitHub General Privacy Statement', 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement']]],
      ],
    },
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
    privacy: 'Tüm hesap cihazınızda yapılır; kişisel veri toplanmaz veya gönderilmez.',
    linksTitle: 'Belgeler',
    openGuide: 'Kullanım kılavuzu',
    openPrivacy: 'Gizlilik politikası',
    installTitle: 'Uygulama olarak kur',
    installText: 'Chrome/Edge: adres çubuğundaki yükle simgesi veya araç çubuğundaki düğme. iOS/iPadOS Safari: Paylaş → Ana Ekrana Ekle. Kurulduktan sonra çevrimdışı da çalışır.',
  },

  panel: {
    label: 'Kontrol paneli',
    resetAll: 'Tüm ayarları sıfırla',
    badgeLegend: 'Rozetler:',
    help: 'Açıklamayı göster/gizle',
    sheetHandle: 'Paneli sürükleme tutamacı',
    modeLabel: 'Panel görünümü',
    modeSimple: 'Basit',
    modeAdvanced: 'Gelişmiş',
    modeSimpleHint: 'Hazır ayarlar ve dört temel kontrol.',
    modeAdvancedHint: 'Tüm kontroller ve bilimsel bilgi ekranı.',
  },

  tip: {
    title: 'Nasıl kullanılır?',
    drag: ['Sürükleyin', 'Kara deliğin çevresinde dönün'],
    pinch: ['İki parmakla yakınlaştırın', 'Fare ile tekerlek'],
    settings: ['Ayarlar', 'Hazır ayarları ve kontrolleri açın'],
    ok: 'Anladım',
    label: 'Kısa kullanım ipucu',
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
    simple: 'Temel kontroller',
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

  simpleTip: {
    a: 'Kara deliğin ne kadar hızlı döndüğü. 0 = dönmüyor; büyüdükçe disk deliğe yaklaşır ve görüntü yamulur.',
    thetaCam: 'Kara deliğe hangi açıdan baktığınız. Küçük değer: tam tepeden (disk yuvarlak görünür). 90°’ye yakın: yandan (disk ince çizgi).',
    rCam: 'Kara delikten uzaklığınız. Küçük değer: yakın, görüntü daha çok bükülür. M, kara deliğin kütlesine bağlı uzunluk birimidir.',
    Tmax: 'Diskin en sıcak yerinin sıcaklığı (Kelvin). Düşükse kırmızı-turuncu, yüksekse beyaz-mavimsi görünür.',
    animate: 'Diskin dönüşünü canlandırır. Kapalıyken görüntü durağandır ve pil daha az harcanır.',
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
