/**
 * Görüntü hattı davranış testi (Adım 4b). `node --test` ile çalışmaz.   node tests/render/pipeline-test.mjs
 * (SwiftShader'da koşar: zamanlama eşikleri geniş tutulmuştur; mutlak hızlar temsili DEĞİLDİR.)
 *
 *  T1  yalnız-sonradan-işleme parametresi (exposure) iz sürmeyi YENİDEN ÇALIŞTIRMAZ; iz sürme parametresi (Tmax) çalıştırır
 *  T2  etkileşim: parametre değişince düşük çözünürlük (interactionScale), durunca tam çözünürlük, ardından accumFrames kare biriktirme
 *  T3  animasyon: sürekli kare, animationFps üst sınırı; dinamik çözünürlük kare süresi hedefi tutmayınca ölçeği düşürür
 *  T4  FİZİKSEL ↔ ESTETİK ayrımı: bloom KAPALI + tonemap 'none' ⇒ tuval pikseli = sRGB(min(1, exposure · radyans)); radyans renderDebugPhoto'dan
 *  T5  biriktirme: 8 jitter'lı kare ↔ 1 kare: ortalama parlaklık korunur (±%2), pikseller farklıdır (kenar yumuşar); iki aynı koşu bit-bit aynı
 *  T6  8-bit yedek HDR hedefi (forceByteHdr; bloom yok): çalışır, hata yok, parlak disk pikselleri float hattıyla ort ≤ 6/255, maks ≤ 24/255 (kodlama sınırı)
 *  T7  stop() sonrası hiç kare çizilmez
 */
import { startHarness } from './harness.mjs';

const h = await startHarness({ width: 160, height: 120 });
let bad = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) bad++; };

try {
  const R = await h.page.evaluate(async () => {
    const mod = await import('/src/render/index.js');
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const until = async (fn, ms = 30000) => { const t = performance.now(); while (!fn()) { if (performance.now() - t > ms) return false; await wait(20); } return true; };
    const mkCanvas = (w, hh) => { const cv = document.createElement('canvas'); cv.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${hh}px`; document.body.appendChild(cv); return cv; };
    const readPx = (gl, w, hh) => { const b = new Uint8Array(w * hh * 4); gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    const base = { a: 0.9, thetaCam: (75 * Math.PI) / 180, rCam: 50, fovY: 30, phiCam: 0, diskOut: 20, diskTime: 40, animate: false, dynamicResolution: false, resolutionScale: 1 };
    const o = {};

    // ---------------- T1 + T2 + T7: rAF döngüsü
    {
      const cv = mkCanvas(160, 120);
      const r = mod.createBlackHoleRenderer(cv, { controls: false, preserveDrawingBuffer: true, params: { ...base, accumFrames: 3 } });
      const gl = r.getContext();
      r.start();
      o.t1_settled = await until(() => r.getStats().accumCount >= 3);
      const st0 = r.getStats();
      o.t1_frames0 = st0.frames;
      const img0 = readPx(gl, 160, 120);
      r.setParams({ exposure: 0.2 });
      await wait(600);
      const img1 = readPx(gl, 160, 120);
      o.t1_framesAfterPost = r.getStats().frames - st0.frames;
      let s0 = 0, s1 = 0;
      for (let i = 0; i < img0.length; i += 4) { s0 += img0[i] + img0[i + 1] + img0[i + 2]; s1 += img1[i] + img1[i + 1] + img1[i + 2]; }
      o.t1_lumRatio = s1 / s0;
      r.setParams({ Tmax: 5000 });
      await wait(800);
      o.t1_framesAfterTrace = r.getStats().frames - st0.frames - o.t1_framesAfterPost;

      // T2: etkileşim → düşük çözünürlük → tam çözünürlük → biriktirme
      await until(() => r.getStats().accumCount >= 3);
      const seq = [];
      r.setParams({ phiCam: 0.4 });
      const t = performance.now();
      while (performance.now() - t < 4000) {
        const s = r.getStats();
        seq.push([s.traceWidth, s.accumCount, s.interacting ? 1 : 0, Math.round(performance.now() - t)]);
        await wait(15);
      }
      o.t2_seq = seq;
      const lowSeen = seq.find((x) => x[0] === 80);
      o.t2_lowSeen = !!lowSeen;
      o.t2_lowInteracting = lowSeen ? lowSeen[2] === 1 : false;
      o.t2_final = seq[seq.length - 1];

      // T7: stop()
      r.stop();
      const f = r.getStats().frames;
      r.setParams({ phiCam: 0.5, Tmax: 7000 });
      await wait(400);
      o.t7_framesAfterStop = r.getStats().frames - f;
      r.dispose();
      cv.remove();
    }

    // ---------------- T3: animasyon
    {
      const cv = mkCanvas(160, 120);
      const r = mod.createBlackHoleRenderer(cv, { controls: false, params: { ...base, diskTime: null, animate: true, turbulence: true, animationFps: 4, performance: 'quality' } });
      r.start();
      await wait(500);
      const f0 = r.getStats().frames;
      await wait(2000);
      o.t3_framesCapped = r.getStats().frames - f0;
      o.t3_animating = r.getStats().animating;
      r.setParams({ animationFps: 60 });
      await wait(300);
      const f1 = r.getStats().frames;
      await wait(2000);
      o.t3_framesFast = r.getStats().frames - f1;
      r.dispose();
      cv.remove();
    }
    {
      const cv = mkCanvas(320, 240);
      const r = mod.createBlackHoleRenderer(cv, { controls: false, params: { ...base, diskTime: null, animate: true, turbulence: true, performance: 'balanced', dynamicResolution: true, animationFps: 30 } });
      r.start();
      await wait(6000);
      const s = r.getStats();
      o.t3_dyn = s.dynamicScale;
      o.t3_traceW = s.traceWidth;
      r.dispose();
      cv.remove();
    }

    // ---------------- T4 + T5 + T6: eşzamanlı çizimler (renderOnce + readPixels aynı görevde)
    {
      const cv = mkCanvas(160, 120);
      const r = mod.createBlackHoleRenderer(cv, { controls: false, params: { ...base, bloom: false, tonemap: 'none', exposure: 0.5, turbulence: false, diskEdgeFade: 0 } });
      const gl = r.getContext();
      const ph = Array.from(await r.renderDebugPhoto(160, 120, { axisGuard: true })); // görsel hat da eksen korumalı
      r.renderOnce({ frames: 1 });
      const img = readPx(gl, 160, 120);
      // GL satır 0 = alt; debug satır 0 = üst
      const enc = (x) => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; };
      let n = 0, maxd = 0, sum = 0;
      for (let j = 0; j < 120; j++) for (let i = 0; i < 160; i++) {
        const k = (j * 160 + i) * 12;
        if (!(ph[k] === 2 && ph[k + 1] > 0)) continue;
        const px = ((119 - j) * 160 + i) * 4;
        for (let c = 0; c < 3; c++) {
          const exp = 255 * enc(0.5 * ph[k + 8 + c]);
          const d = Math.abs(img[px + c] - exp);
          maxd = Math.max(maxd, d); sum += d; n++;
        }
      }
      o.t4 = { n: n / 3, maxd, meanAbs: sum / n };

      // T5: biriktirme
      r.setParams({ bloom: true, tonemap: 'aces' });
      r.renderOnce({ frames: 1 });
      const a1 = readPx(gl, 160, 120);
      r.renderOnce({ frames: 8 });
      const a8 = readPx(gl, 160, 120);
      r.renderOnce({ frames: 8 });
      const a8b = readPx(gl, 160, 120);
      let l1 = 0, l8 = 0, diff = 0, same = true;
      for (let i = 0; i < a1.length; i += 4) {
        l1 += a1[i] + a1[i + 1] + a1[i + 2]; l8 += a8[i] + a8[i + 1] + a8[i + 2];
        diff += Math.abs(a1[i] - a8[i]) + Math.abs(a1[i + 1] - a8[i + 1]) + Math.abs(a1[i + 2] - a8[i + 2]);
      }
      for (let i = 0; i < a8.length; i++) if (a8[i] !== a8b[i]) { same = false; break; }
      o.t5 = { lumRatio: l8 / l1, meanAbsDiff: diff / (a1.length / 4 * 3), deterministic: same };

      // T6: 8-bit yedek hedef
      const cv2 = mkCanvas(160, 120);
      const rb = mod.createBlackHoleRenderer(cv2, { controls: false, forceByteHdr: true, params: { ...base, bloom: false, tonemap: 'aces', exposure: 0.5 } });
      r.setParams({ bloom: false, tonemap: 'aces', exposure: 0.5 }); // 8-bit yedekte bloom yok ⇒ adil karşılaştırma
      r.renderOnce({ frames: 1 });
      const f32img = readPx(gl, 160, 120);
      rb.renderOnce({ frames: 1 });
      const byteImg = readPx(rb.getContext(), 160, 120);
      let nb = 0, sd = 0, md = 0, nonBlack = 0;
      for (let i = 0; i < f32img.length; i += 4) {
        const lum = (f32img[i] + f32img[i + 1] + f32img[i + 2]) / 3;
        if (byteImg[i] + byteImg[i + 1] + byteImg[i + 2] > 30) nonBlack++;
        if (lum > 90) { for (let c = 0; c < 3; c++) { const d = Math.abs(f32img[i + c] - byteImg[i + c]); sd += d; md = Math.max(md, d); nb++; } }
      }
      o.t6 = { hdr: rb.getStats().hdr, nonBlack, nCompared: nb / 3, meanAbs: sd / nb, maxAbs: md };
      rb.dispose(); cv2.remove();
      r.dispose(); cv.remove();
    }
    return o;
  });

  console.log('T1 — yalnız-sonradan-işleme ↔ iz sürme');
  ok(R.t1_settled, `başlangıçta ${R.t1_frames0} iz sürme karesi ile durağan (accumFrames=3) duruma ulaşıldı`);
  ok(R.t1_framesAfterPost === 0, `exposure değişimi: ${R.t1_framesAfterPost} yeni iz sürme karesi (beklenen 0)`);
  ok(R.t1_lumRatio < 0.5 && R.t1_lumRatio > 0.05, `exposure 0.5→0.2: tuval parlaklığı ×${R.t1_lumRatio.toFixed(2)} (post çalıştı; ton eşleme sıkıştırması nedeniyle ≈ 0.2–0.4)`);
  ok(R.t1_framesAfterTrace >= 1, `Tmax değişimi: ${R.t1_framesAfterTrace} yeni iz sürme karesi (beklenen ≥ 1)`);

  console.log('T2 — etkileşim ve ilerleyici iyileştirme');
  ok(R.t2_lowSeen && R.t2_lowInteracting, `parametre değişince iz sürme genişliği 80 (= 0.5 × 160), interacting=${R.t2_lowInteracting}`);
  const fin = R.t2_final;
  ok(fin[0] === 160 && fin[1] === 3 && fin[2] === 0, `durunca tam çözünürlük (${fin[0]}) ve ${fin[1]}/3 kare biriktirildi, interacting=${fin[2]}`);
  const iLow = R.t2_seq.findIndex((x) => x[0] === 80);
  const firstFull = R.t2_seq.slice(Math.max(0, iLow)).find((x) => x[0] === 160 && x[1] >= 1);
  const tLow = R.t2_seq[Math.max(0, iLow)][3];
  ok(!!firstFull && firstFull[3] - tLow >= 120, `tam çözünürlüğe dönüş son değişimden ≈ settleMs (150 ms) sonra: düşük çözünürlükten ${firstFull ? firstFull[3] - tLow : '?'} ms sonra`);

  console.log('T3 — animasyon, fps sınırı, dinamik çözünürlük');
  ok(R.t3_animating && R.t3_framesCapped >= 2 && R.t3_framesCapped <= 4 * 2 + 3, `animationFps=4: 2 s'de ${R.t3_framesCapped} kare (beklenen 2…11; sınırsız olsaydı SwiftShader'da çok daha fazla)`);
  ok(R.t3_framesFast > R.t3_framesCapped, `animationFps=60: 2 s'de ${R.t3_framesFast} kare (> ${R.t3_framesCapped})`);
  ok(R.t3_dyn < 0.9 && R.t3_traceW < 320, `kare süresi hedefi (33 ms) tutmayınca ölçek düştü: dynamicScale=${R.t3_dyn.toFixed(2)}, iz sürme genişliği ${R.t3_traceW} < 320`);

  console.log('T4 — fiziksel radyans ↔ estetik sonrası işlem ayrımı');
  ok(R.t4.n > 1000 && R.t4.maxd <= 3, `bloom KAPALI + tonemap none: ${R.t4.n} disk pikseli, |tuval − sRGB(0.5·radyans)| maks ${R.t4.maxd.toFixed(2)}/255, ort ${R.t4.meanAbs.toFixed(2)} (dither ±1 + yuvarlama + yarı-float)`);

  console.log('T5 — jitter biriktirme');
  ok(Math.abs(R.t5.lumRatio - 1) < 0.02 && R.t5.meanAbsDiff > 0.05, `8 kare ↔ 1 kare: parlaklık oranı ${R.t5.lumRatio.toFixed(4)} (±%2), ort. |Δ| ${R.t5.meanAbsDiff.toFixed(3)}/255 (>0: kenarlar yumuşadı)`);
  ok(R.t5.deterministic, 'iki aynı koşu (diskTime sabit, 8 kare) bit-bit aynı (yıldızlar/biriktirme deterministik)');

  console.log('T6 — 8-bit yedek HDR hedefi');
  ok(R.t6.hdr.startsWith('8-bit') && R.t6.nonBlack > 500 && R.t6.nCompared > 500 && R.t6.meanAbs <= 6 && R.t6.maxAbs <= 24, `${R.t6.hdr}: ${R.t6.nonBlack} aydınlık piksel; parlak ${R.t6.nCompared} pikselde float hattıyla |Δ| ort ${R.t6.meanAbs.toFixed(2)}, maks ${R.t6.maxAbs}/255 (ort ≤ 6, maks ≤ 24: 8-bit doğrusal kodlama = radyans/8 → 0.03'lük basamaklar ve L>8'de kırpma; yalnız ACİL YEDEK)`);

  console.log('T7 — stop()');
  ok(R.t7_framesAfterStop === 0, `stop() sonrası ${R.t7_framesAfterStop} kare`);
  // Chromium "GPU stall due to ReadPixels": bu testin kendi readPixels çağrılarının performans uyarısı (üretim kodunda readPixels yok)
  const errs = h.errors.filter((e) => !e.includes('GPU stall due to ReadPixels'));
  ok(errs.length === 0, 'tarayıcı konsolunda hata/uyarı yok (testin kendi readPixels performans uyarısı hariç)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  if (process.argv.includes('--verbose')) console.log(JSON.stringify(R.t2_seq.slice(0, 40)));
} finally {
  await h.close();
}
console.log(bad === 0 ? '\nHAT TESTİ: GEÇTİ' : `\nHAT TESTİ: ${bad} BAŞARISIZ`);
process.exitCode = bad === 0 ? 0 : 1;
