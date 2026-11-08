// Arayüz metinleri — tek sözlük (ileride i18n için). Başka dosyalarda sabit metin YAZMAYIN.
// Rozet sınıfları: phys = FİZİKSEL, aest = ESTETİK, view = GÖSTERİM (kamera/ölçek/performans; fiziksel içerik değil).

export const LANG = 'tr';

// ---- SAHNELER: her sahnenin başlığı, sade açıklaması ve "Neye bakmalı?" maddeleri (tek kaynak).
// Parametreler src/ui/scenes.js'te. Bilimsel iddialar bu dosyada toplanır (fizik denetimi için).
// Sayılar src/physics fonksiyonlarıyla ui-check.mjs'te doğrulanır (r_isco, η, 3√3, …).
const SCENE_TEXT = {
  schwarzschild: {
    short: 'Dönmeyen',
    title: 'Dönmeyen kara delik — yandan bakış',
    text: 'Hiç dönmeyen (a = 0) bir kara delik. Gölgesi tam bir dairedir ve yarıçapı yaklaşık 5,2 M’dir; olay ufku ise 2 M’dir. Diske neredeyse yandan baktığımız için disk ince bir çizgi gibi görünür; yine de deliğin arkasında kalan kısmın ışığı bükülerek gölgenin üstünden aşar.',
    look: ['Gölgenin üzerinden kemer gibi aşan parlak yay: diskin deliğin arkasındaki kısmı.', 'Gölgenin kenarındaki çok ince parlak halka: foton halkası.', 'Diskin sol yanı sağından daha parlak: o yan bize doğru geliyor (Doppler).'],
  },
  kerr09: {
    short: 'Hızlı dönen',
    title: 'Hızlı dönen kara delik (a = 0,9)',
    text: 'Delik, aynı kütle için kuramın izin verdiği en yüksek dönme açısal momentumunun yüzde 90’ı ile dönüyor (a = 0,9). Çevresindeki uzay-zaman da dönmeye sürüklenir; disk deliğin dönüşüyle aynı yönde döndüğü için iç kenarı, dönmeyen delikteki 6 M yerine yaklaşık 2,3 M’ye kadar iner ve disk daha sıcak, daha parlak olur. Gölge yan bakışta bir miktar yassılaşır ve ekranda sağa kayar; düzleşen kenar diskin bize yaklaşan (sol) tarafındadır.',
    look: ['Gölgenin sol kenarı düzleşmiş: gölge tam daire değil.', 'Disk daha içeriye uzanıyor; en parlak bölge iç kenarın hemen dışında (ISCO’nun yaklaşık 1,5 katı uzaklıkta), tam iç kenarda ışıma sıfıra iner.', 'Sol taraf (bize doğru gelen yan) belirgin biçimde daha parlak.'],
  },
  extreme: {
    short: 'Çok hızlı',
    title: 'Neredeyse en hızlı dönen kara delik (a = 0,998)',
    text: 'Kuramın izin verdiği en yüksek dönüşe (a = 1) çok yakın; bu uygulamada üst sınır 0,998’dir. Diskin iç kenarı yaklaşık 1,2 M’ye kadar iner. Bu ince disk modelinde gaz ISCO’ya kadar yavaşça yaklaşırken durgun kütle enerjisinin yaklaşık yüzde 32’si ışığa dönüşebilir (dönmeyen delikte yaklaşık yüzde 5,7).',
    look: ['Gölgenin belirgin biçimde yassılaşmış ve kaymış hâli.', 'Diskin iç kenarı gölgeye çok yakın.', 'İki yan arasındaki parlaklık farkı büyük.'],
  },
  faceOn: {
    short: 'Yukarıdan',
    title: 'Yukarıdan bakış — yüz yüze',
    text: 'Kamera deliğin dönme ekseni yakınında, diske tepeden bakıyor (eğim yaklaşık 10°). Disk neredeyse tam bir halka, gölge neredeyse bir daire olarak görünür. Diskin hareketi neredeyse görüş doğrultumuza dik olduğundan, bize doğru ya da bizden uzağa hızı çok küçüktür; bu yüzden iki yan arasındaki Doppler parlaklık farkı yandan bakışa göre çok daha azdır (ama sıfır değildir).',
    look: ['Gölge neredeyse daire.', 'Işıma halka boyunca daha düzgün dağılmış: Doppler farkı küçük.', 'Gölgeyi çevreleyen ince parlak çizgi: foton halkası.'],
  },
  tilt17: {
    short: 'Hafif eğik',
    title: 'Hafif eğik bakış (yaklaşık 17°)',
    text: 'Deliğe eksenine yakın, yaklaşık 17° eğimle bakıyoruz. Disk bir halka gibi görünür ve bir yanı daha parlaktır. M87 galaksisinin jetinin görüş doğrultusuyla yaklaşık 17° yaptığı radyo (VLBI) gözlemlerinden bilinir ve Olay Ufku Teleskobu (EHT) çalışmalarında M87* için eksen eğimi olarak varsayılır. Bu sahne yalnızca benzer bir bakış geometrisini gösterir; M87*’nin görüntüsü değildir (orada parlak taraf güneydedir, spin ölçülmemiştir ve gaz akışı çok daha sıcak ve kalındır).',
    look: ['Halkanın sol yanı sağından daha parlak.', 'Gölge hâlâ neredeyse yuvarlak, ama hafifçe kaymış.', 'Gölgenin kenarında parlak foton halkası.'],
  },
  retro: {
    short: 'Ters dönen',
    title: 'Ters dönen disk (retrograd)',
    text: 'Disk, deliğin dönüşünün tersi yönünde dönüyor. Bu durumda diskin en içteki kararlı yörüngesi (ISCO) uzaklaşır: a = 0,9 için yaklaşık 8,7 M (diskin delikle aynı yönde döndüğü durumda 2,3 M). Bu modelde ince disk ISCO’da biter, bu yüzden daha az ışır (verim yaklaşık yüzde 3,9) ve ortadaki boşluk geniş görünür.',
    look: ['Diskin iç kenarı gölgeden belirgin biçimde uzakta.', 'Parlak taraf bu kez sağda: bize doğru gelen yan değişti.', 'Gölgenin şekli diskin yönüne bağlı değildir; yalnız deliğin dönüşüne ve bakış açısına bağlıdır.'],
  },
  close: {
    short: 'Çok yakın',
    title: 'Çok yakından (12 M)',
    text: 'Kamera deliğin yalnızca 12 M uzağında ve geniş açılı. Bu mesafede ışığın bükülmesi çok daha belirgin: gölge görüş alanının büyük bölümünü kaplar ve arka plandaki yıldızlar gölgenin çevresinde uzayıp bükülür. Etiketler bu mesafede gizlenir, çünkü konumları yalnızca uzaktan bakış için hesaplanabilir.',
    look: ['Gölge çok büyük görünüyor.', 'Gölgenin çevresinde yıldız alanı belirgin biçimde bükülmüş.', 'Disk görüş alanına sığmıyor; kenarları ekran dışında kalabilir.'],
  },
  below: {
    short: 'Alttan',
    title: 'Diskin altından bakış',
    text: 'Kamera disk düzleminin altında (eğim 115°). Kara delik ve disk ekvator düzlemine göre simetrik, ince disk de iki yüzünden aynı ışıdığı için bu görüntü, üstten 65° ile bakışın alt-üst çevrilmiş hâlidir. Yani deliğin arkasından bükülen yay artık gölgenin altında, diskin yakın kısmı ise üstünde görünür.',
    look: ['Merceklenmiş arka yay gölgenin altında.', 'Diskin yakın kısmı gölgenin üstünden geçiyor.', 'Dönüş yönü değişmedi: bize doğru gelen (parlak) yan yine solda.'],
  },
};
const SCENE_ORDER = ['schwarzschild', 'kerr09', 'extreme', 'faceOn', 'tilt17', 'retro', 'close', 'below'];
const SCENE_GUIDE = SCENE_ORDER.map((id) => [SCENE_TEXT[id].title, SCENE_TEXT[id].text]);

export const S = {
  appTitle: 'Kara Delik Simülasyonu',
  appSubtitle: 'Kerr geometrisi · ışın izleme',
  canvasLabel: 'Kara delik sahnesi. Oklar: yörünge, artı/eksi: yakınlaştırma, Home: kamerayı sıfırla.',
  hint: 'Sürükle: yörünge · Tekerlek / iki parmak: yakınlaştır · Çift tıkla: sıfırla',

  // ---- sahneler, bilgi kartı, etiketler
  scenes: SCENE_TEXT,
  sceneOrder: SCENE_ORDER,
  sceneCustom: {
    short: 'Özel',
    title: 'Özel görünüm',
    text: 'Ayarlardan seçtiğiniz değerlerle oluşan görünüm. Aşağıdaki sayılar şu anki dönüş hızınıza ve bakış açınıza göre hesaplanır. Hazır bir görünüme dönmek için alttaki kartlardan birini seçin.',
    look: ['Gölgenin ve diskin biçimi dönüş hızına ve bakış açısına göre değişir.', 'Bize doğru gelen taraf daha parlaktır.', 'Etiketleri açarak bu özellikleri ekranda işaretleyebilirsiniz.'],
  },
  sceneStrip: { label: 'Sahneler', hint: 'Sahne seç' },
  infoCard: {
    label: 'Sahne açıklaması',
    close: 'Bilgi kartını kapat',
    look: 'Neye bakmalı?',
    numbers: 'Bu görünümün sayıları',
    chips: { rPlus: 'Olay ufku', rIsco: 'Diskin iç kenarı (ISCO)', eta: 'Işınım verimi', shadowW: 'Gölge genişliği' },
    chipTips: {
      rPlus: 'Olay ufkunun yarıçapı r₊ (M biriminde): geri dönüşü olmayan sınır.',
      rIsco: 'En içteki kararlı dairesel yörünge: ince diskin iç kenarı.',
      eta: 'Diske düşen maddenin durgun kütle enerjisinin ışığa dönüşen kesri.',
      shadowW: 'Gölgenin yatay genişliği (deliğe uzaktan bakan gözlemci için, M biriminde).',
    },
    labelsTitle: 'Etiketler',
    labelsHelp: 'Gölgeyi, foton halkasını, diskin bükülmüş arka tarafını ve Doppler ile parlayan yanı ekranda işaretler.',
    whatIs: 'Kara delik nedir?',
  },
  labels: {
    shadow: 'Gölge',
    ring: 'Foton halkası',
    lens: 'Diskin arka tarafı (ışık bükülmüş)',
    dopplerPro: 'Bize doğru gelen taraf — daha parlak (Doppler)',
    dopplerRetro: 'Bize doğru gelen taraf — daha parlak (Doppler)',
    near: 'Etiketler uzaktan bakışta (r ≥ 15 M) gösterilir; bu kadar yakında konumları güvenilir değildir.',
    approx: 'Konumlar deliğe uzaktan bakan gözlemci için yaklaşıktır.',
  },

  toolbar: {
    info: 'Bilgi',
    infoLabel: 'Bilgi: sahne açıklaması ve etiketler',
    panelOpen: 'Ayarlar',
    panelClose: 'Ayarları kapat',
    panelToggleLabel: 'Ayarlar panelini aç/kapat',
    resetCamera: 'Kamerayı sıfırla',
    screenshot: 'Ekran görüntüsü indir',
    fullscreen: 'Tam ekran',
    exitFullscreen: 'Tam ekrandan çık',
    guide: 'Kılavuz',
    about: 'Hakkında',
    privacy: 'Gizlilik politikası',
    install: 'Uygulamayı yükle',
    more: 'Menü',
    menuLabel: 'Uygulama menüsü',
    utilLabel: 'Uygulama araçları',
    barLabel: 'Bilgi',
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
    lead: 'Dönen bir kara deliğin çevresinde ışığın nasıl büküldüğünü gerçek zamanlı keşfedin. Alttaki Sahneler ile farklı görünümleri deneyin.',
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
            'Ekranın altındaki kartlardan bir sahne seçin: her biri kara deliğe farklı bir koşulda bakar. Kartları yana kaydırarak hepsini görebilirsiniz.',
            'Sol üstteki “i” düğmesi seçili sahneyi anlatır ve “Neye bakmalı?” ipuçlarını verir. Aynı yerden “Etiketler”i açarak gölge, foton halkası ve Doppler tarafını ekranda işaretleyebilirsiniz.',
            'Sağ üstteki “…” menüsünde Ayarlar, Ekran görüntüsü, Kılavuz, Hakkında, Gizlilik, Tam ekran ve Uygulamayı yükle bulunur.',
            'Sahneyi sürükleyerek kara deliğin çevresinde dönün; iki parmakla (veya fare tekerleğiyle) yakınlaşın; çift dokunarak sahnenin başlangıç görünümüne dönün.',
          ]],
        ],
      },
      {
        id: 'whatis', title: 'Kara delik nedir?',
        blocks: [
          ['p', 'Kara delik, kütleçekiminin o kadar güçlü olduğu bir bölgedir ki belli bir sınırın içinden ışık bile dışarı çıkamaz. Bu sınıra olay ufku denir. Dönmeyen bir kara deliğin ufku, kütlesine bağlı olarak 2GM/c² yarıçaplı bir küredir: Güneş kütlesi için yaklaşık 3 km. Bu uygulamada uzunluklar M birimiyle verilir (M = GM/c²); bu birimde dönmeyen deliğin ufkunun yarıçapı 2 M’dir.'],
          ['dl', [
            ['Işığın bükülmesi (merceklenme)', 'Kütleçekimi uzay-zamanı büker; ışık bu eğri uzay-zamanda kendi “en düz” yolunu izler, ama bu yol bize bükülmüş görünür. Bu yüzden deliğin arkasında kalan disk ve yıldızların ışığı deliğin çevresinden dolanıp gözümüze ulaşır; görüntüler kayar ve çarpılır.'],
            ['Gölge', 'Gölge, geriye doğru izlediğimizde ufka varan ışınların geldiği karanlık bölgedir; ufkun kendisinden büyük görünür, çünkü ufka yeterince yaklaşan ışık kütleçekimiyle bükülüp deliğe düşer. Dönmeyen delikte gölgenin yarıçapı 3√3 M ≈ 5,2 M, yani ufkun (2 M) yaklaşık 2,6 katıdır. Bu değer, deliğe uzaktan bakan gözlemci içindir. Dönen deliklerde gölge, bakış açısına bağlı olarak yassılaşır ve bir yana kayar (yan bakışta belirgin, tepeden bakışta çok az).'],
            ['Foton halkası', 'Gölgenin hemen dışında, ışık deliğin çevresinde yarım tur veya daha fazla dolanıp gözümüze ulaşır; bu görüntüler gölge kenarında ince, parlak bir halka oluşturur. Halka, deliğe yakın “foton yörüngelerine” yakın dolanan ışığın izidir. Dönmeyen delikte bu kararsız dairesel foton yörüngesi 3 M’de bulunur (halkanın ekrandaki yarıçapı ise 5,2 M görünür). Dönen deliklerde tek bir yarıçap yoktur: ışık, delikten farklı uzaklıklardaki bir yörünge ailesinde dolanabilir (a = 0,9 için ekvatorda 1,6 M ile 3,9 M arası).'],
            ['ISCO (diskin iç kenarı)', 'Gaz deliğin çevresinde dairesel yörüngelerde döner; ama belli bir yarıçaptan içeride kararlı dairesel yörünge yoktur. Bu sınıra ISCO (en içteki kararlı dairesel yörünge) denir; dönmeyen delikte 6 M’dir. Bu simülasyonda ince disk ISCO’da başlar. Delik hızlı döndükçe ve disk onunla aynı yönde dönerse ISCO deliğe yaklaşır (a = 0,998 için yaklaşık 1,2 M).'],
            ['Doppler etkisi', 'Disk dönerken bir yanı bize doğru gelir, öbür yanı bizden uzaklaşır. Yaklaşan taraf daha parlak ve daha sıcak (mavimsi), uzaklaşan taraf daha sönük ve daha kırmızımsı görünür. Bu simülasyonda gözlenen renk sıcaklığı T_gözlenen = g·T ile kayar (g: toplam kayma faktörü).'],
            ['Kütleçekimsel kırmızıya kayma', 'Işık kütleçekim kuyusundan çıkarken enerjisi azalır: aynı sıcaklıktaki gaz, deliğe ne kadar yakınsa gözümüze o kadar kırmızı ve sönük ulaşır. Diskin iç bölgeleri çok sıcak olduğu için yine de en parlak bölgelerdir. Doppler etkisiyle birlikte rengi ve parlaklığı belirleyen toplam “g faktörü”nü oluşturur.'],
          ]],
          ['note', 'Önemli: Bu bir fotoğraf değil, fizik denklemleriyle hesaplanan bir simülasyondur. Disk modeli geometrik olarak ince, ışınımla soğuyan klasik bir toplanma diskidir (Novikov–Thorne / Page–Thorne); korona, jet, manyetik alan ve polarizasyon yoktur. M87* gibi gerçek kara deliklerin çevresindeki sıcak, kalın gaz akışları farklı görünür. Olay ufkunun içi, ışık çıkamadığı için hiçbir şekilde görünmez.'],
        ],
      },
      {
        id: 'scenes', title: 'Sahneler ve etiketler',
        blocks: [
          ['p', 'Her sahne, kara deliğin dönüşünü, diskin yönünü ve kameranın konumunu birlikte ayarlar. Seçince kamera yumuşakça o görünüme geçer; sonra istediğiniz gibi döndürebilir, ayarlardan değiştirebilirsiniz. Ekrandaki “i” düğmesi sahneyi açıklar.'],
          ['dl', SCENE_GUIDE],
          ['p', 'Etiketler: “i” kartındaki Etiketler anahtarı gölgeyi, foton halkasını, diskin bükülmüş arka tarafını ve Doppler ile daha parlak görünen yanı yazıyla işaretler. Konumlar deliğe uzaktan bakan gözlemci için hesaplanır; kamera 15 M’den yakınsa etiketler gizlenir.'],
        ],
      },
      {
        id: 'camera', title: 'Kamerayı kontrol etme',
        blocks: [
          ['h', 'Fare'],
          ['keys', [['Sürükle', 'Kamerayı kara deliğin çevresinde döndürür (yörünge).'], ['Tekerlek', 'Yakınlaştırır / uzaklaştırır.'], ['Çift tıkla', 'Kamerayı seçili sahnenin başlangıç konumuna alır.']]],
          ['h', 'Dokunmatik ekran'],
          ['keys', [['Tek parmak sürükle', 'Yörünge.'], ['İki parmak aç/kıs', 'Yakınlaştır / uzaklaştır.'], ['Çift dokun', 'Kamerayı sıfırlar.'], ['Kart şeridini kaydır', 'Sahneleri gezer (kamerayı oynatmaz).']]],
          ['h', 'Klavye'],
          ['keys', [['← → ↑ ↓', 'Yörünge (yatay: azimut, dikey: eğim). Önce sahneye odaklanın (Tab).'], ['+  −  (PgUp / PgDn)', 'Yakınlaştır / uzaklaştır.'], ['Home veya 0', 'Kamerayı sıfırla.'], ['?', 'Bu kılavuzun Ayarlar bölümünü aç / kapat.'], ['F', 'Tam ekran (tarayıcı destekliyorsa).'], ['Esc', 'Pencereyi, menüyü, bilgi kartını veya ayarları kapat.']]],
          ['note', 'Kamera yumuşak hareket eder; hızlı bırakırsanız bir süre dönmeye devam eder. Bakış açısı 1°–179° arasındadır.'],
        ],
      },
      {
        id: 'controls', title: 'Ayarlar',
        blocks: [
          ['p', '“…” menüsünden Ayarlar’ı açın. Üstteki Basit | Gelişmiş anahtarı kontrol sayısını belirler; seçiminiz bu cihazda hatırlanır. Her kontrolün yanındaki “?” düğmesi kısa bir açıklama gösterir.'],
          ['h', 'Basit mod'],
          ['dl', [
            ['Dönüş hızı (a)', 'Kara deliğin dönüş hızı (tam adı: açısal momentum oranı a = J/M²), 0 ile 0,998 arası. 0 = dönmüyor. Büyüdükçe (disk deliğle aynı yönde dönüyorsa) disk deliğe yaklaşır ve görüntü asimetrik olur.'],
            ['Bakış açısı (eğim θ)', 'Kara deliğe hangi açıdan baktığınız. 0°’ye yakın: tepeden; 90°’ye yakın: diski yandan görürsünüz; 90°’den büyük: diskin altından.'],
            ['Uzaklık (r)', 'Kara delikten uzaklığınız. “M” kara deliğin kütlesine bağlı uzunluk birimidir (M = GM/c²). Yakınken ışık çok daha fazla bükülür.'],
            ['Animasyon', 'Diskin dönüşünü canlandırır. Kapalıyken görüntü durağandır, pil daha az harcanır.'],
          ]],
          ['h', 'Gelişmiş mod'],
          ['p', 'Gelişmiş modda tüm kontroller, hazır ayarlar ve “Bilimsel bilgi” ekranı görünür. Kontroller kısa rozetlerle işaretlidir: FİZİKSEL (Kerr geodeziklerinden ve Page–Thorne disk modelinden gelir), ESTETİK (görsel hoşluk için; fiziksel öngörü değildir), GÖSTERİM (kamera, ölçek, performans; fiziksel içeriği değiştirmez).'],
          ['dl', [
            ['Disk dönüş yönü', 'Prograd: disk deliğin dönüşüyle aynı yönde. Retrograd: ters yönde (disk iç kenarı uzaklaşır).'],
            ['Azimut', 'Kameranın kara deliğin etrafındaki konumu. Delik eksen simetrik olduğundan görüntüyü yalnızca disk deseni ve gökyüzü yönünde değiştirir.'],
            ['Görüş alanı', 'Kameranın görüş açısı (derece). Fizik değişmez, yalnızca çerçeve.'],
            ['Disk', 'Toplanma diskini açar/kapatır; kapalıyken yalnızca merceklenen gökyüzü görünür.'],
            ['Disk sıcaklığı (T_max)', 'Diskin en sıcak yerinin sıcaklığı, Kelvin. Düşük: kırmızı-turuncu; yüksek: beyaz-mavimsi.'],
            ['Dış yarıçap', 'Diskin dış kenarı (M). İç kenar her zaman kararlı en iç dairesel yörüngedir (ISCO).'],
            ['Dış kenar yumuşatma', 'Dış kenarda ışımayı yumuşakça söndürür (estetik).'],
            ['Renk düzeltmesi f_col', 'Gözlenen rengin etkin sıcaklığa oranı (yıldız kütleli kara delikler için yaklaşık 1,7).'],
            ['Parlaklık modu', 'Band: görünür ışıkta fotometrik. Bolometrik: toplam ışınım.'],
            ['Pozlama', 'Görüntüyü aydınlatır/karartır (EV). Yalnızca gösterim ölçeğidir; mutlak parlaklık kalibrasyonu değildir.'],
            ['Ton eşleme', 'Çok parlak (HDR) görüntüyü ekrana sığdırma yöntemi: ACES, AgX, Nötr, Yok.'],
            ['Bloom ve gücü', 'Parlak yerlerin etrafında saçılan ışık hâlesi (estetik).'],
            ['Türbülans ve genliği', 'Diskte ince ışıma dokusu (estetik; fiziksel bir benzetim değildir).'],
            ['Yıldızlar, Samanyolu', 'Arka plan gökyüzü. Işığın yönü ve renk kayması fiziksel; yıldız sayısı ve dağılımı estetiktir.'],
            ['Animasyon hızı', 'Animasyonun hızı (gerçek 1 saniyede ilerleyen simülasyon süresi).'],
            ['Performans', 'Otomatik: uygulama cihazınızın hızına göre çözünürlüğü kendisi ayarlar. Kalite / Dengeli / Pil: elle seçilen hazır tercihler.'],
            ['Işın izleme kalitesi', 'Yüksek: ince adım, daha doğru kenarlar. Mobil: yaklaşık 2–3 kat hızlı, kenarlarda biraz daha az doğru.'],
            ['Çözünürlük', 'Düşük değer hızlı ama bulanıktır.'],
          ]],
          ['h', 'Bilimsel bilgi ekranı'],
          ['p', 'Gelişmiş modda, seçtiğiniz dönüş hızı ve bakış açısı için olay ufku, foton yörüngesi, ISCO, ışınım verimi, gölge boyutu gibi değerler anında hesaplanır (G = c = 1, uzunluk M cinsinden). İsteğe bağlı olarak bir kütle girerseniz (örneğin 10 güneş kütlesi) uzunluklar kilometre olarak da gösterilir.'],
        ],
      },
      {
        id: 'seeing', title: 'Ne görüyorsunuz?',
        blocks: [
          ['dl', [
            ['Gölge ve foton halkası', 'Ortadaki karanlık bölge ve kenarındaki ince parlak halka (ayrıntı için “Kara delik nedir?” bölümüne bakın).'],
            ['Merceklenmiş disk', 'Kara deliğin arkasında kalan disk bölümünün ışığı delikle bükülerek gölgenin üstünde (altından bakınca altında) görünür hâle gelir. Bu yüzden yandan bakarken bile diskin “arka kemeri” gölgenin üzerinden aşar.'],
            ['Doppler parlaması', 'Yaklaşan taraf daha parlak ve mavimsi, uzaklaşan taraf daha sönük ve kırmızımsıdır. Diskin dönüşü deliğin dönüşüyle aynı yöndeyse (prograd) yaklaşan taraf solda olur; ters yönde dönüyorsa sağda. Bu, diskin üstünden de altından da bakınca aynıdır.'],
            ['Kırmızıya kayma', 'Işık kütleçekim kuyusundan çıkarken enerjisi azalır: aynı sıcaklıktaki gaz, deliğe ne kadar yakınsa gözümüze o kadar kırmızı ve sönük ulaşır. Diskin iç bölgeleri çok sıcak olduğu için yine de en parlak bölgelerdir. Doppler etkisiyle birlikte rengi ve parlaklığı belirleyen toplam “g faktörü”nü oluşturur.'],
            ['Spin etkisi', 'Dönen deliklerde disk iç kenarı (ISCO) deliğe daha çok yaklaşır (disk deliğin dönüşüyle aynı yöndeyse), disk daha sıcak ve parlak olur; gölge yassılaşıp ekranda bir yana kayar. Bu, yan bakışta belirgindir; tepeden bakışta neredeyse kaybolur.'],
          ]],
          ['note', 'Renkler kara cisim ışımasına dayanır ve yaklaşıktır; bloom, türbülans dokusu ve yıldız dağılımı gibi görsel efektler estetiktir. Ayrıntı için Hakkında penceresine bakın.'],
        ],
      },
      {
        id: 'performance', title: 'Performans ipuçları',
        blocks: [
          ['ul', [
            'Varsayılan “Otomatik” performans modunda uygulama, cihazınızın hızına göre çözünürlüğü kendisi ayarlar; ısınma ve pil tüketimi azalır.',
            'Görüntü yine de takılıyorsa Ayarlar → Gelişmiş modda Çözünürlüğü düşürün veya Animasyonu kapatın.',
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
            ['Görüntü yavaş veya takılıyor', '“…” → Ayarlar → Gelişmiş → Performans: Pil; Çözünürlüğü düşürün; Animasyon ve Bloom’u kapatın.'],
            ['Siyah ekran', 'Önce kamerayı sıfırlayın (çift dokunma veya “…” → Kamerayı sıfırla). Disk ve yıldızlar kapalıysa sahne gerçekten siyah olabilir: Ayarlar’da “Tüm ayarları sıfırla”yı deneyin. Sürüyorsa sayfayı yenileyin.'],
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
          ['p', 'Uygulama iki adreste yayımlanır: GitHub Pages ve Netlify. Siteyi açtığınızda, hangi adresi kullanıyorsanız o barındırma sağlayıcısı (GitHub veya Netlify) kendi sunucu günlüklerinde IP adresi ve tarayıcı bilgisi gibi teknik verileri işleyebilir. Bu işleme ilgili sağlayıcının sorumluluğundadır ve onun gizlilik bildirimine tabidir.'],
          ['links', [['GitHub Genel Gizlilik Bildirimi', 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement'], ['Netlify Gizlilik Politikası', 'https://www.netlify.com/privacy/']]],
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
          'Hosting: GitHub Pages and Netlify. Whichever address you use, that hosting provider (GitHub or Netlify) may process technical data such as your IP address in its server logs, under its own privacy policy.',
          'Children: no personal data is collected from anyone, including children.',
        ]],
        ['p', 'Effective date: 7 November 2026. Responsible: Kuzey Çetin. Contact: via the GitHub repository (no email address is published).'],
        ['links', [['GitHub repository', 'https://github.com/kuzeycetin3806-debug/Karadelikprojesi'], ['GitHub General Privacy Statement', 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement'], ['Netlify Privacy Policy', 'https://www.netlify.com/privacy/']]],
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
    installText: 'Chrome/Edge: adres çubuğundaki yükle simgesi veya “…” menüsündeki “Uygulamayı yükle”. iOS/iPadOS Safari: Paylaş → Ana Ekrana Ekle. Kurulduktan sonra çevrimdışı da çalışır.',
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
    modeSimpleHint: 'Üç kaydırıcı ve animasyon anahtarı.',
    modeAdvancedHint: 'Tüm kontroller ve bilimsel bilgi ekranı.',
  },

  tip: {
    title: 'Nasıl kullanılır?',
    drag: ['Sürükleyin', 'Kara deliğin çevresinde dönün'],
    pinch: ['İki parmakla yakınlaştırın', 'Fare ile tekerlek'],
    settings: ['Alttaki kartlar', 'Farklı kara delik görünümlerini seçin'],
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
    a: { label: 'Dönüş hızı (a)', tip: 'Boyutsuz açısal momentum oranı a = J/M² (günlük dilde “dönüş hızı”). 0 = Schwarzschild. Üst sınır 0,998 (a = 1\'de ISCO ve kırmızıya kayma tanımsızlaşır).' },
    prograde: { label: 'Disk dönüş yönü', tip: 'Prograd: disk deliğin dönüşüyle aynı yönde; ISCO küçülür ve verim artar. Retrograd: ters yönde (ISCO büyür).', options: { true: 'Prograd', false: 'Retrograd' } },
    thetaCam: { label: 'Bakış açısı (eğim θ)', tip: 'Kameranın dönme eksenine göre kutupsal açısı. 0° = kutuptan (yüzden), 90° = disk düzlemi. 89,5°–90,5° bandı dejenere olduğundan atlanır.' },
    phiCam: { label: 'Yön (azimut φ)', tip: 'Kameranın eksen çevresindeki konumu. Eksenel simetri nedeniyle görüntüyü yalnızca disk deseni/gökyüzü yönünde değiştirir.' },
    rCam: { label: 'Uzaklık (r)', tip: 'Kameranın Boyer–Lindquist yarıçapı (M cinsinden). En az r₊ + 3 M, en çok 150 M (f32 hassasiyeti).' },
    fovY: { label: 'Görüş alanı', tip: 'Dikey görüş açısı (derece). Işın izleme projeksiyonudur; fizik değişmez.' },
    disk: { label: 'Disk', tip: 'İnce, opak, Page–Thorne ışıyan toplanma diski. Kapalıysa yalnızca merceklenen gökyüzü görünür.' },
    Tmax: { label: 'Disk sıcaklığı (T_max)', tip: 'Disk etkin sıcaklığının tepe değeri (Kelvin). T_eff(r) = T_max·τ(r), τ Page–Thorne profilidir. Kütle ve ṁ yerine doğrudan seçilir.' },
    diskOut: { label: 'Disk dış kenarı', tip: 'Diskin dış kenarı (M). İç kenar daima ISCO\'dur (altında Page–Thorne ışıması yoktur). Dış kenar yumuşatması estetiktir.' },
    diskEdgeFade: { label: 'Dış kenar yumuşatma', tip: 'Diskin dış kenarında, disk genişliğinin bu kesri boyunca ışımayı sönümler (0 = sert kenar). Estetiktir: bu bölgede Page–Thorne ışımasını değiştirir.' },
    fCol: { label: 'Renk düzeltmesi f_col', tip: 'T_renk = f_col·T_eff. Yıldız kütleli kara delikler için ≈ 1,7. Band modunda renk f_col·T sıcaklığına kayar, yüzey parlaklığı f_col⁻⁴ ile seyrelir (parlaklık f_col⁻⁴·Y(f_col·T)/Y(T) kadar değişir); gerekirse pozlamayı artırın.' },
    brightnessMode: { label: 'Parlaklık modu', tip: 'Band: görünür bantta fotometrik (kara cisim ışınımı gözlem bandında). Bolometrik: toplam ışınım, (g·τ)⁴. Renk her ikisinde aynıdır.', options: { band: 'Band', bolometric: 'Bolometrik' } },
    exposure: { label: 'Pozlama', tip: 'HDR radyansın ton eşlemeden önceki ölçeği (EV = log₂). Yalnızca GÖSTERİM (görüntüleme) ölçeğidir: fiziksel radyansı değiştirmez, mutlak parlaklık kalibrasyonu değildir. Ucuzdur, iz sürmeyi yeniden çalıştırmaz.' },
    tonemap: { label: 'Ton eşleme', tip: 'HDR → ekran dönüşümü. “Yok” yalnızca [0,1] kırpar ve fiziksel radyansı olduğu gibi gösterir.', options: { aces: 'ACES', agx: 'AgX', neutral: 'Nötr', none: 'Yok' } },
    bloom: { label: 'Parlama (bloom)', tip: 'Parlak bölgelerin saçılan hale efekti. Estetik sonradan işleme.' },
    bloomStrength: { label: 'Parlama gücü', tip: 'Sahne enerjisinin hale olarak yeniden dağıtılan kesri.' },
    turbulence: { label: 'Disk dokusu (türbülans)', tip: 'Diskte ince ölçekli ışıma dokusu. Estetik; MHD simülasyonu değildir.' },
    turbulenceAmp: { label: 'Doku şiddeti', tip: 'Işıma modülasyonunun şiddeti (0–1).' },
    stars: { label: 'Yıldızlar', tip: 'Arka plan yıldız alanı. Yön eşlemesi, merceklenme ve renk kayması fiziksel; sayı/parlaklık dağılımı estetiktir.' },
    milkyWay: { label: 'Samanyolu', tip: 'Arka plan Samanyolu bandının şiddeti (0 = yok). Şekil ve renk estetiktir.' },
    animate: { label: 'Animasyon', tip: 'Disk deseni yerel Kepler açısal hızıyla akar. Sürekli çizim gerektirir (daha çok pil kullanır).' },
    timeScale: { label: 'Animasyon hızı', tip: 'Animasyon hızı: gerçek 1 saniyede ilerleyen simülasyon süresi (M).' },
    performance: { label: 'Performans', tip: 'Otomatik: uygulama cihazın hızına göre çözünürlüğü ve kare hızını kendisi ayarlar. Kalite / Dengeli / Pil: etkileşim çözünürlüğü, biriktirilen kare sayısı ve animasyon kare hızı için sabit ön ayarlar.', options: { auto: 'Otomatik', quality: 'Kalite', balanced: 'Dengeli', battery: 'Pil' } },
    quality: { label: 'Işın izleme kalitesi', tip: 'Yüksek: ince adım (κ = 0,05, 512 adım). Mobil: κ = 0,10, 256 adım (~2–3× hızlı, kenarlarda biraz daha az doğru).', options: { high: 'Yüksek', mobile: 'Mobil' } },
    resolutionScale: { label: 'Çözünürlük', tip: 'Durağan iz sürme çözünürlüğü / tuval çözünürlüğü. Düşük değer hızlıdır, bulanıktır.' },
  },

  simpleTip: {
    a: 'Kara deliğin ne kadar hızlı döndüğü (tam adı: açısal momentum oranı a = J/M²). 0 = dönmüyor; büyüdükçe disk deliğe yaklaşır ve görüntü yamulur.',
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
    frameMs: 'Kare süresi',
    adaptive: 'Uyarlama düzeyi',
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
