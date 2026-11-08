// ============================================================================
// hotspot.glsl — disk düzleminde yörüngede dönen SICAK NOKTA (hot spot).
//
// FİZİKSEL (kinematik):
//   * Sıcak nokta r_s yarıçapında yerel Kepler açısal hızıyla döner:  φ_s(t_emit) = φ0 + Ω_s · t_emit,  Ω_s = keplerOmega(a, r_s, prograde)
//     (src/physics/kerr.js; işaretli: retrograd < 0). t = Boyer–Lindquist KOORDİNAT zamanı (M).
//   * IŞIĞIN YOL SÜRESİ (zaman gecikmesi): görüntülenen an t_obs için bir disk vuruşunun yayın zamanı t_emit = t_obs − tDelay, tDelay =
//     kameradan geriye izlenen geodezikte biriken koordinat zamanı (trace.glsl hitT; CPU raytracer.js hits[].tDelay). Birincil ve ikincil
//     (merceklenmiş) görüntü FARKLI tDelay ⇒ sıcak noktanın farklı evrelerini gösterir (ikincil görüntü gecikmeli parlar).
//     CPU'da φ0 + Ω_s·t_obs mod 2π (f64) hesaplanıp uHotPhase olarak gelir; burada yalnız −Ω_s·tDelay (|tDelay| ≲ 10³ M) eklenir ⇒ f32 yeterli.
//   * g-faktörü (Doppler + kütleçekimsel kayma) disk vuruşunun mevcut fotometrisinde (T_obs = g_cam · f_col · T_max · τ, photometry.glsl)
//     zaten var; burada ayrıca uygulanmaz — çarpan yayıcının KENDİ çerçevesindeki ışımadır, gözlenen renk/parlaklık g_cam ile kayar.
// ESTETİK  (genlik ve profil — bir MHD/ışıma modeli DEĞİL):
//   * Gauss profili exp(−d²/2σ²) (σ = uHotSigma, M) ve genlik B = uHotAmp: yerel ışıma çarpanı  1 + B·exp(−d²/2σ²)  (disk ışımasına ek,
//     renk kromatisitesi diskinki).  d² = (r − r_s)² + 4 r r_s sin²(Δφ/2)  (disk düzleminde ÖKLİD yaklaşımı: BL koordinatları, metrik
//     çarpanları (g_rr, g_φφ) yok — σ ≈ 0.5–1 M için ~%20 şekil hatası, konum doğru). Yarıçap kıstırması: params.js hotspotRadius.
// Zaman bağımlı olduğundan ertelenmiş hatta YALNIZ gölgelendirme aşamasında (A geçişi, her kare) uygulanır; geodezik yeniden izlenmez.
// ============================================================================

// Işıma çarpanı ≥ 1.  r, φ: disk vuruşu (BL); tDelay: M cinsinden geriye izlenen koordinat zamanı
float hotspotFactor(float r, float phi, float tDelay) {
  if (uHotOn == 0) return 1.0;
  float dph = phi - (uHotPhase - uHotOmega * tDelay);        // φ − φ_s(t_emit)
  dph -= TWO_PI * floor(dph * (1.0 / TWO_PI) + 0.5);          // [−π, π]
  float sh = sin(0.5 * dph);
  float dr = r - uHotR;
  float d2 = dr * dr + 4.0 * r * uHotR * sh * sh;
  return 1.0 + uHotAmp * exp(-0.5 * d2 / (uHotSigma * uHotSigma));
}
