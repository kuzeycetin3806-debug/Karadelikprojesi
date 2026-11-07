// Uygulama giriş noktası (koordinatör sahipliğinde; PWA/kabuk bağlantısı arayüz ajanı tarafından eklendi).
// Render katmanı: src/render/ (grafik ajanı) · Arayüz: src/ui/ (arayüz ajanı).
import { createBlackHoleRenderer } from './render/index.js';
import { createUI } from './ui/index.js';
import { initShell } from './ui/shell.js';
import { registerServiceWorker, shouldShowIosHint, dismissIosHint } from './ui/pwa.js';
import { S } from './ui/strings.js';
import { ICONS } from './ui/dom.js';

const canvas = document.getElementById('sahne');
const shell = initShell();
shell.watchContext(canvas);

let renderer = null;
let ui = null;
try {
  shell.progress(45, S.app.splash.init);
  // Geçici render içi yörünge kontrolü kapalı: kamera kontrolünü arayüz katmanı yönetir.
  renderer = createBlackHoleRenderer(canvas, { controls: false });
  ui = createUI(renderer, { canvas, root: document.body });
  shell.progress(70, S.app.splash.shader);
  renderer.start();
  shell.whenFirstFrame(renderer);
  window.__karadelik = { renderer, ui }; // test ve hata ayıklama için
} catch (err) {
  // WebGL2 yok / başlatma hatası: uygulama çökmesin, anlaşılır ekran göster.
  console.error('başlatma hatası', err);
  shell.fatal(err);
}

if (renderer) {
  registerServiceWorker({
    onUpdateReady: (apply) => shell.banner({
      id: 'banner-update', text: S.app.update.text, icn: ICONS.reset,
      actions: [[S.app.update.dismiss, null, false], [S.app.update.action, apply, true]],
    }),
    onOfflineReady: () => shell.banner({ id: 'banner-offline', text: S.app.offlineReady, icn: ICONS.download, actions: [[S.app.close, null, false]] }),
  });
  if (shouldShowIosHint()) {
    setTimeout(() => shell.banner({
      id: 'banner-ios', text: S.app.ios.text, icn: ICONS.share,
      actions: [[S.app.ios.dismiss, dismissIosHint, true]],
    }), 4000);
  }
}
