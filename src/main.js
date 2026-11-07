// Uygulama giriş noktası (koordinatör sahipliğinde).
// Render katmanı: src/render/ (grafik ajanı) · Arayüz: src/ui/ (arayüz ajanı).
import { createBlackHoleRenderer } from './render/index.js';
import { createUI } from './ui/index.js';

const canvas = document.getElementById('sahne');
// Geçici render içi yörünge kontrolü kapalı: kamera kontrolünü arayüz katmanı yönetir.
const renderer = createBlackHoleRenderer(canvas, { controls: false });
const ui = createUI(renderer, { canvas, root: document.body });
renderer.start();
window.__karadelik = { renderer, ui }; // test ve hata ayıklama için
