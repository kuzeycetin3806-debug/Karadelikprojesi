// Uygulama giriş noktası (koordinatör sahipliğinde).
// Render katmanı src/render/ (grafik ajanı), arayüz src/ui/ (arayüz ajanı) tarafından sağlanır.
import { createBlackHoleRenderer } from './render/index.js';

const canvas = document.getElementById('sahne');
const renderer = createBlackHoleRenderer(canvas);
renderer.start();
window.__karadelik = { renderer }; // test ve hata ayıklama için
