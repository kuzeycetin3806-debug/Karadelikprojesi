/**
 * Sonlu uzaklıktaki kamera → foton başlangıç koşulları (yerel ZAMO tetradı).
 *
 * KAMERA: Boyer–Lindquist konumu (r_cam, θ_cam, φ_cam), ZAMO (sıfır açısal momentumlu gözlemci)
 * çerçevesinde durur. Tetrad (M = 1):
 *   e_(t) = (∂_t + ω ∂_φ)/N,   e_(r) = √(Δ/Σ) ∂_r,   e_(θ) = ∂_θ/√Σ,   e_(φ) = ∂_φ/√g_φφ,
 *   N = √(ΣΔ/A) (laps), ω = frameDraggingOmega (src/physics).
 * Metrik büyüklükleri src/physics/kerr.js'ten alınır (kopyalanmaz).
 *
 * EKRAN YÖNELİMİ (docs/physics/kerr.md §2.11, birebir):
 *   n̂ = delikten gözlemciye birim vektör = r̂ (kamera deliğe −r̂ yönünde bakar),
 *   ê_β ("yukarı") = +z spin ekseninin ekran düzlemine izdüşümü = −θ̂,
 *   ê_α ("sağ")    = ê_β × n̂ = (−θ̂) × r̂ = +φ̂.
 * Piksel görüş yönü (kameradan dışarı): d = −r̂ + x·ê_α' + y·ê_β'  (teğet düzlem koordinatları x, y;
 * roll = 0 iken ê_α' = φ̂, ê_β' = −θ̂). Foton ise TERS yöne gelir: yerel çerçevede momentum yönü n = −d.
 * Sonsuz uzaklık sınırında (α, β) = r_cam (x, y) ve L = −α sinθ_o (kerr.md) elde edilir; sonlu r_cam'de
 * λ = L/E İZLENEN FOTONUN p_φ/(−p_t) değeridir ve −α sinθ_o'dan farklıdır (r_cam = 50M'de ~%2).
 *
 * ÇIKTI (ray nesnesi, E ≡ 1 normalizasyonu ile):
 *   r, theta, phi          : başlangıç konumu (BL)
 *   lambda                 : L/E = p_φ/(−p_t)  (hareket sabiti; disk g-faktörü için)
 *   pTheta                 : p_θ/E  (kovaryant, fiziksel foton)
 *   signR                  : fiziksel p_r işareti (+1 dışa giden foton, −1 içe giden). Merkezi piksel: +1
 *                            (foton delikten kameraya doğru gelir).
 *   Q                      : Carter sabiti (E = 1 için η)
 *   nuCamOverNuInf         : ν_kamera/ν_∞ = 1/(N + ω p_φ^{(1)}). Işın izleyicinin g-faktörü sonsuzdaki
 *                            gözlemciye göredir; kameranın gördüğü g_cam = g · nuCamOverNuInf.
 *   prDirect               : tetraddan doğrudan p_r/E (kontrol amaçlı; izleyici p_r'yi Carter
 *                            bağıntısından yeniden kurar → büyük r_cam'de yuvarlama kaybı yok)
 *   x, y                   : teğet düzlem ekran koordinatları.
 */

import { metricBL, frameDraggingOmega } from '../physics/kerr.js';
import { carterConstant } from './geodesic.js';

/**
 * ZAMO tetradı büyüklükleri (M = 1) — testlerde bağımsız kullanım için dışa açık.
 */
export function zamoFrame(a, r, theta) {
  const g = metricBL(1, a, r, theta);
  const omega = frameDraggingOmega(1, a, r, theta);
  const lapse = Math.sqrt((g.Sigma * g.Delta) / g.A);
  return {
    g,
    omega,
    lapse,
    sqrtGphiphi: Math.sqrt(g.gphiphi),
    sqrtSigma: Math.sqrt(g.Sigma),
    sqrtSigmaOverDelta: Math.sqrt(g.Sigma / g.Delta),
  };
}

/**
 * Kamera oluşturur.
 * @param {object} p
 * @param {number} p.a          boyutsuz spin 0 ≤ a ≤ 1 (M = 1)
 * @param {number} p.rCam       kamera yarıçapı (> r₊)
 * @param {number} p.thetaCam   kamera eğimi θ_cam ∈ (0, π) (kutup tekilliği nedeniyle uçlar hariç)
 * @param {number} [p.phiCam=0] kamera azimutu
 * @param {number} [p.fovY]     düşey görüş alanı (radyan, tam açı); varsayılan 40°
 * @param {number} [p.width=64] piksel sayısı
 * @param {number} [p.height=64]
 * @param {number} [p.roll=0]   görüş ekseni etrafında dönme (radyan); 0 = yukarı = spin ekseni izdüşümü
 */
export function createCamera(p) {
  const a = p.a;
  const rCam = p.rCam;
  const thetaCam = p.thetaCam;
  const phiCam = p.phiCam ?? 0;
  const fovY = p.fovY ?? (40 * Math.PI) / 180;
  const width = p.width ?? 64;
  const height = p.height ?? 64;
  const roll = p.roll ?? 0;
  if (!(thetaCam > 0 && thetaCam < Math.PI)) {
    throw new RangeError(`thetaCam (0, π) içinde olmalı (verilen: ${thetaCam})`);
  }
  const fr = zamoFrame(a, rCam, thetaCam);
  const tanHalfY = Math.tan(fovY / 2);
  const tanHalfX = (tanHalfY * width) / height;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  /**
   * Yerel ZAMO çerçevesinde GÖRÜŞ yönü d = (d_r̂, d_θ̂, d_φ̂) (birim olması gerekmez) → ray nesnesi.
   */
  function rayFromLocalSight(dr, dth, dph) {
    const norm = Math.hypot(dr, dth, dph);
    // foton yönü n = −d (birim)
    const nr = -dr / norm;
    const nth = -dth / norm;
    const nph = -dph / norm;
    // ZAMO'da p^(t) = 1, p^(i) = n_i  ⇒  kovaryant bileşenler
    const pPhi1 = fr.sqrtGphiphi * nph; // p_φ = √g_φφ p^(φ̂)
    const pTh1 = fr.sqrtSigma * nth; // p_θ = √Σ p^(θ̂)
    const pR1 = fr.sqrtSigmaOverDelta * nr; // p_r = √(Σ/Δ) p^(r̂)
    // p_(t) = (p_t + ω p_φ)/N = −p^(t) = −1  ⇒  E = −p_t = N + ω p_φ
    const Ecov = fr.lapse + fr.omega * pPhi1;
    const L = pPhi1 / Ecov;
    const pTheta = pTh1 / Ecov;
    return {
      a,
      r: rCam,
      theta: thetaCam,
      phi: phiCam,
      lambda: L,
      pTheta,
      signR: nr >= 0 ? 1 : -1,
      Q: carterConstant(a, 1, L, thetaCam, pTheta),
      nuCamOverNuInf: 1 / Ecov,
      prDirect: pR1 / Ecov,
    };
  }

  /** Teğet düzlem koordinatları (x: sağ, y: yukarı) → ray. */
  function screenToRay(x, y) {
    // roll: (sağ, yukarı) tabanını görüş ekseni etrafında döndür
    const xr = cr * x - sr * y;
    const yr = sr * x + cr * y;
    // sağ = +φ̂, yukarı = −θ̂, ileri = −r̂
    const ray = rayFromLocalSight(-1, -yr, xr);
    ray.x = x;
    ray.y = y;
    return ray;
  }

  return {
    a,
    rCam,
    thetaCam,
    phiCam,
    fovY,
    width,
    height,
    frame: fr,
    tanHalfX,
    tanHalfY,
    rayFromLocalSight,
    screenToRay,
    /**
     * Piksel (i: sütun 0..width−1 soldan sağa, j: satır 0..height−1 yukarıdan aşağıya) merkezi → ray.
     * Alt-piksel örnekleme için i, j kesirli verilebilir (merkez = tamsayı + 0.5).
     */
    pixelToRay(i, j) {
      const ndcX = (2 * (i + 0.5)) / width - 1;
      const ndcY = 1 - (2 * (j + 0.5)) / height;
      return screenToRay(ndcX * tanHalfX, ndcY * tanHalfY);
    },
    /**
     * Bardeen tipi etki parametreleri (α, β) [M] → ray (sonsuz-gözlemci ekranıyla karşılaştırma için).
     * Yerel görüş açısı ψ: r_cam sinψ = b·N (b = √(α²+β²), N = ZAMO laps) — yani yerel enerjiye göre
     * düzeltilmiş; böylece L/E ≈ −α sinθ_cam (hata O(M²/r_cam²), O(a/r_cam)). Düzeltme olmadan
     * (α = r_cam tanψ) b, M/r_cam göreli hatayla ölçülür (r_cam = 1e4'te ~5e-4·b).
     */
    impactToRay(alpha, beta) {
      const b = Math.hypot(alpha, beta);
      if (b === 0) return screenToRay(0, 0);
      const s = (b * fr.lapse) / rCam;
      if (!(s < 1)) throw new RangeError(`etki parametresi kameradan büyük: b=${b}, r_cam=${rCam}`);
      const t = s / Math.sqrt(1 - s * s);
      return screenToRay((t * alpha) / b, (t * beta) / b);
    },
    /**
     * TAM Bardeen eşlemesi: (α, β) → hareket sabitleri (ξ, η) doğrudan kurulur, yani
     * L = −α sinθ_cam, p_θ = β (Θ(θ_cam) = β² tanım gereği), E = 1. Yerel yön tetraddan türetilmez;
     * sonlu r_cam'de de "(α,β) ekranı"nın birebir tanımıdır (gölge sınırı testlerinde yöntem hatasını
     * ayırmak için). Çıktı yerel yön alanı içermez; nuCamOverNuInf = (1 − ωL)/N.
     */
    bardeenRay(alpha, beta) {
      const L = -alpha * Math.sin(thetaCam);
      return {
        a,
        r: rCam,
        theta: thetaCam,
        phi: phiCam,
        lambda: L,
        pTheta: beta,
        signR: 1,
        Q: carterConstant(a, 1, L, thetaCam, beta),
        nuCamOverNuInf: (1 - fr.omega * L) / fr.lapse,
      };
    },
  };
}
