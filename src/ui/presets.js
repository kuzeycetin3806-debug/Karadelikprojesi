// Hazır ayarlar (Gelişmiş panel). Her biri bir sahneyle aynı parametreleri kullanır: sceneId varsa ona yönlenir (src/ui/scenes.js).
// Hazır ayarlar. Gerçek gözlem adlarıyla karıştırılabilecek isim kullanılmaz; yalnız geometri/spin tanımı.
// Görüş alanı (fovY) kullanıcı seçimi olarak korunur (ekran en/boy oranına bağlı).
const DEG = Math.PI / 180;

export const PRESETS = [
  { id: 'schwarzschild', patch: { a: 0, prograde: true, thetaCam: 85 * DEG, phiCam: 0, rCam: 50, disk: true } },
  { id: 'kerr09', patch: { a: 0.9, prograde: true, thetaCam: 75 * DEG, phiCam: 0, rCam: 50, disk: true } },
  { id: 'kerr0998', sceneId: 'extreme', patch: { a: 0.998, prograde: true, thetaCam: 80 * DEG, phiCam: 0, rCam: 40, disk: true } },
  { id: 'faceOn', patch: { a: 0.9, prograde: true, thetaCam: 10 * DEG, phiCam: 0, rCam: 50, disk: true } },
];
