// Sahne parametre kümeleri (yalnız veri; DOM yok → tests/ui/make-scenes.mjs Node'da da içe aktarır).
// Başlık / açıklama / "Neye bakmalı?" metinleri strings.js → S.scenes. Parametreler renderer sözleşmesindendir
// (src/render/README.md §3). Burada fizik formülü yok: tüm değerler kullanıcıya sunulan geometri seçimleridir.
const DEG = Math.PI / 180;

/**
 * a: dönüş (a/M) · prograde: disk yönü · thetaCam: bakış açısı (rad; 89,5°–90,5° dejenere bandından kaçınılır)
 * rCam: kamera yarıçapı (M) · fovY: null → uygulamanın taban görüş alanı; sayı → en az o kadar (geniş açı)
 * thumbFovY: yalnız küçük resim üretimi için çerçeve.
 */
export const SCENES = [
  { id: 'schwarzschild', patch: { a: 0, prograde: true, thetaCam: 85 * DEG, phiCam: 0, rCam: 50, disk: true }, fovY: null, thumbFovY: 36 },
  { id: 'kerr09', patch: { a: 0.9, prograde: true, thetaCam: 75 * DEG, phiCam: 0, rCam: 50, disk: true }, fovY: null, thumbFovY: 34 },
  { id: 'extreme', patch: { a: 0.998, prograde: true, thetaCam: 80 * DEG, phiCam: 0, rCam: 40, disk: true }, fovY: null, thumbFovY: 34 },
  { id: 'faceOn', patch: { a: 0.9, prograde: true, thetaCam: 10 * DEG, phiCam: 0, rCam: 50, disk: true }, fovY: null, thumbFovY: 40 },
  { id: 'tilt17', patch: { a: 0.9, prograde: true, thetaCam: 17 * DEG, phiCam: 0, rCam: 50, disk: true }, fovY: null, thumbFovY: 40 },
  { id: 'retro', patch: { a: 0.9, prograde: false, thetaCam: 75 * DEG, phiCam: 0, rCam: 50, disk: true }, fovY: null, thumbFovY: 40 },
  { id: 'close', patch: { a: 0.9, prograde: true, thetaCam: 80 * DEG, phiCam: 0, rCam: 12, disk: true }, fovY: 70, thumbFovY: 70 },
  { id: 'below', patch: { a: 0.9, prograde: true, thetaCam: 115 * DEG, phiCam: 0, rCam: 50, disk: true }, fovY: null, thumbFovY: 36 },
];

export const DEFAULT_SCENE = 'kerr09'; // renderer varsayılanıyla aynı görünüm (a = 0,9, 75°, 50 M)

export const sceneById = (id) => SCENES.find((s) => s.id === id) || null;

/** Önizleme dosyası (public/scenes/<id>.webp); tests/ui/make-scenes.mjs üretir. */
export const THUMB_SIZE = { width: 288, height: 180 };
export const thumbFile = (id) => `scenes/${id}.webp`;

/** Sahnenin renderer'a yazılacak görüş alanı: taban fov'dan küçük olamaz. */
export const sceneFov = (scene, baseFov) => (scene.fovY == null ? baseFov : Math.max(baseFov, scene.fovY));
