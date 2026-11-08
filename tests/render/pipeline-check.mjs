/**
 * Görüntü hattı davranış testi (Adım 4b). `node --test` ile çalışmaz.   node tests/render/pipeline-check.mjs
 * (SwiftShader'da koşar: zamanlama eşikleri geniş tutulmuştur; mutlak hızlar temsili DEĞİLDİR.)
 *
 *  T1  yalnız-sonradan-işleme parametresi (exposure) iz sürmeyi YENİDEN ÇALIŞTIRMAZ; iz sürme parametresi (Tmax) çalıştırır
 *  T2  etkileşim: parametre değişince düşük çözünürlük (interactionScale), durunca tam çözünürlük, ardından accumFrames kare biriktirme
 *  T3  animasyon: sürekli kare, animationFps üst sınırı; dinamik çözünürlük kare süresi hedefi tutmayınca ölçeği düşürür
 *  T4  FİZİKSEL ↔ ESTETİK ayrımı: bloom KAPALI + tonemap 'none' ⇒ tuval pikseli = sRGB(min(1, exposure · radyans)); radyans renderDebugPhoto'dan
 *  T5  biriktirme: 8 jitter'lı kare ↔ 1 kare: ortalama parlaklık korunur (±%2), pikseller farklıdır (kenar yumuşar); iki aynı koşu bit-bit aynı
 *  T6  8-bit yedek HDR hedefi (forceByteHdr; bloom yok): çalışır, hata yok, parlak disk pikselleri float hattıyla ort ≤ 6/255, maks ≤ 24/255 (kodlama sınırı)
 *  T7  stop() sonrası hiç kare çizilmez
 *  --- 4c (ertelenmiş gölgelendirme, akıllı döngü, iOS dayanıklılığı) ---
 *  T8  DURAĞAN sahne: yakınsadıktan sonra hiçbir geçiş (iz sürme/gölgelendirme/animasyon/sunum) çalışmaz; mod 'idle'
 *  T9  ANİMASYON (ertelenmiş hat): 2 s'de iz sürme sayısı 0, gölgelendirme 0 (önbellek), animasyon geçişi her kare; mod 'animating'
 *  T10 ertelenmiş ≡ birleşik hat (aynı sahne, renderOnce): piksel farkı ≤ 1/255
 *  T11 animasyon geçişi ≡ türbülansı gölgelendirmeye işleyen hat (aynı simTime): fark ≤ 2/255 (yarım-float yuvarlaması)
 *  T12 yalnız-gölgelendirme parametresi (Tmax): iz sürme 0, gölgelendirme ≥ 1; sonuç birleşik hatla aynı
 *  T13 şeritli (kare-üstü) iz sürme ≡ tek geçiş: bit-bit aynı
 *  T14 sayfa görünmezken render durur, görünür olunca sürer
 *  T15 bağlam kaybı/geri yükleme (WEBGL_lose_context): renderer toparlanır, kare üretimi sürer, görüntü siyah değil
 *  T16 yedekler: ertelenmiş hat kapalı (RGBA32F yok) ve 8-bit HDR + animasyon çalışır
 *  T17 bellek: 16 farklı tuval boyutu sonrası önbellek girdisi ≤ 6, GL doku/geometri sayısı sınırlı (sızıntı yok); döngü ayarı (animationFps) değişimi yeniden iz sürme tetiklemez
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
      const r = mod.createBlackHoleRenderer(cv, { controls: false, params: { ...base, diskTime: null, animate: true, turbulence: true, performance: 'balanced', dynamicResolution: true, animationFps: 30, deferred: false } });
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

    // ---------------- 4c: T8 + T9 (durağan / animasyon) — gerçek rAF döngüsü
    {
      const cv = mkCanvas(160, 120);
      const r = mod.createBlackHoleRenderer(cv, { controls: false, params: { ...base, animate: false, accumFrames: 3 } });
      r.start();
      o.t8_settled = await until(() => r.getStats().accumCount >= 3 && r.getStats().mode === 'idle');
      await wait(400);
      const s0 = r.getStats();
      await wait(1500);
      const s1 = r.getStats();
      o.t8 = { dTicks: s1.ticks - s0.ticks, dTrace: s1.traceFrames - s0.traceFrames, dShade: s1.shadeFrames - s0.shadeFrames, dAnim: s1.animFrames - s0.animFrames, dPresented: s1.presented - s0.presented, mode: s1.mode, fps: s1.fps, deferred: s1.deferred };
      // animasyonu aç: taban bir kez yeniden gölgelendirilir (türbülans A'ya geçer), sonra yalnız A
      r.setParams({ animate: true, diskTime: null, animationFps: 30, performance: 'quality' });
      await until(() => r.getStats().animFrames >= 3, 20000);
      await wait(300);
      const a0 = r.getStats();
      await wait(2000);
      const a1 = r.getStats();
      o.t9 = { dTrace: a1.traceFrames - a0.traceFrames, dShade: a1.shadeFrames - a0.shadeFrames, dAnim: a1.animFrames - a0.animFrames, dPresented: a1.presented - a0.presented, mode: a1.mode, fps: a1.fps, simAdvanced: a1.simTime - a0.simTime };
      // kamera hareketi: animasyonda yeniden iz sürme yalnız o zaman
      r.setParams({ phiCam: 0.3 });
      await wait(900);
      const a2 = r.getStats();
      o.t9_cam = { dTrace: a2.traceFrames - a1.traceFrames, dAnim: a2.animFrames - a1.animFrames };
      r.dispose(); cv.remove();
    }

    // ---------------- 4c: T10 + T11 + T12 + T13 (eşdeğerlik)
    {
      const eq = { ...base, bloom: false, tonemap: 'none', exposure: 0.5, diskTime: 23.3, animate: false, turbulence: true, turbulenceAmp: 0.5 };
      const cvA = mkCanvas(160, 120); const cvB = mkCanvas(160, 120);
      const rD = mod.createBlackHoleRenderer(cvA, { controls: false, preserveDrawingBuffer: true, params: eq });
      const rF = mod.createBlackHoleRenderer(cvB, { controls: false, preserveDrawingBuffer: true, params: { ...eq, deferred: false } });
      o.t10_deferred = rD.getStats().deferred; o.t10_fusedDeferred = rF.getStats().deferred;
      const diff = (x, y) => { let m = 0, sum = 0, n = 0; for (let i = 0; i < x.length; i += 4) for (let c = 0; c < 3; c++) { const d = Math.abs(x[i + c] - y[i + c]); m = Math.max(m, d); sum += d; n++; } return { max: m, mean: sum / n }; };
      rD.renderOnce({ frames: 4 }); rF.renderOnce({ frames: 4 });
      const pD = readPx(rD.getContext(), 160, 120); const pF = readPx(rF.getContext(), 160, 120);
      o.t10 = diff(pD, pF);
      let lum = 0; for (let i = 0; i < pD.length; i += 4) lum += pD[i] + pD[i + 1] + pD[i + 2];
      o.t10_lum = lum / (pD.length / 4 * 3);

      // T11: animasyon geçişi ↔ türbülans gölgelendirmede (aynı simTime)
      const cvC = mkCanvas(160, 120);
      const rA = mod.createBlackHoleRenderer(cvC, { controls: false, preserveDrawingBuffer: true, params: { ...eq, diskTime: null, animate: true, timeScale: 20, animationFps: 120, performance: 'quality' } });
      rA.start();
      await until(() => rA.getStats().traceWidth === 160 && rA.getStats().mode === 'animating', 30000); // ilk düşük çözünürlüklü kare geçsin
      const fA0 = rA.getStats().animFrames;
      await until(() => rA.getStats().animFrames >= fA0 + 3, 30000);
      rA.stop();
      const tA = rA.getStats().simTime;
      const pA = readPx(rA.getContext(), 160, 120);
      rA.setParams({ animate: false, diskTime: tA }); // türbülans gölgelendirmeye işlenir (baked), aynı zaman
      rA.renderOnce({ frames: 1 });
      const pAb = readPx(rA.getContext(), 160, 120);
      o.t11 = diff(pA, pAb); o.t11_t = tA;
      rA.dispose(); cvC.remove();

      // T12: Tmax (yalnız gölgelendirme) — loop ile
      const cvE = mkCanvas(160, 120);
      const rS = mod.createBlackHoleRenderer(cvE, { controls: false, preserveDrawingBuffer: true, params: { ...eq, progressive: false } });
      rS.start();
      await until(() => rS.getStats().mode === 'idle' && rS.getStats().frames > 0, 30000);
      await wait(300);
      const q0 = rS.getStats();
      rS.setParams({ Tmax: 7000 });
      await until(() => rS.getStats().shadeFrames > q0.shadeFrames, 20000);
      await wait(400);
      const q1 = rS.getStats();
      const pS = readPx(rS.getContext(), 160, 120);
      rF.setParams({ Tmax: 7000 }); rF.renderOnce({ frames: 1 });
      const pF1 = readPx(rF.getContext(), 160, 120);
      o.t12 = { dTrace: q1.traceFrames - q0.traceFrames, dShade: q1.shadeFrames - q0.shadeFrames, ...diff(pS, pF1), mode: q1.mode };
      rS.dispose(); cvE.remove();

      // T13: şeritli ↔ tek geçiş (bit-bit)
      const cvG = mkCanvas(160, 120);
      const rB = mod.createBlackHoleRenderer(cvG, { controls: false, preserveDrawingBuffer: true, params: { ...eq, maxTickPixels: 3000 } });
      rB.renderOnce({ frames: 3 });
      const pB = readPx(rB.getContext(), 160, 120);
      o.t13_bands = rB.getStats().bands;
      rD.renderOnce({ frames: 3 });
      const pD3 = readPx(rD.getContext(), 160, 120);
      let same = true; for (let i = 0; i < pB.length; i++) if (pB[i] !== pD3[i]) { same = false; break; }
      o.t13_same = same;
      rB.dispose(); cvG.remove(); rD.dispose(); rF.dispose(); cvA.remove(); cvB.remove();
    }

    // ---------------- 4c: T14 görünürlük + T15 bağlam kaybı + T16 yedekler
    {
      const cv = mkCanvas(160, 120);
      const r = mod.createBlackHoleRenderer(cv, { controls: false, preserveDrawingBuffer: true, params: { ...base, diskTime: null, animate: true, animationFps: 30 } });
      r.start();
      await until(() => r.getStats().animFrames >= 3, 30000);
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      await wait(300);
      const h0 = r.getStats();
      await wait(1000);
      const h1 = r.getStats();
      o.t14_hiddenFrames = (h1.frames - h0.frames) + (h1.presented - h0.presented);
      o.t14_mode = h1.mode; o.t14_paused = h1.paused;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      await wait(1200);
      o.t14_resumed = r.getStats().frames - h1.frames;

      // T15: bağlam kaybı
      const ext = r.getContext().getExtension('WEBGL_lose_context');
      o.t15_hasExt = !!ext;
      if (ext) {
        const f0 = r.getStats().frames;
        ext.loseContext();
        await wait(300);
        o.t15_lost = r.getStats().contextLost;
        const fl = r.getStats().frames;
        await wait(400);
        o.t15_framesWhileLost = r.getStats().frames - fl;
        ext.restoreContext();
        await until(() => r.getStats().contextRestores >= 1 && r.getStats().frames > fl + 2, 40000);
        const st = r.getStats();
        o.t15_restores = st.contextRestores; o.t15_framesAfter = st.frames - fl; o.t15_lostAfter = st.contextLost;
        await wait(500);
        r.stop();
        const img = readPx(r.getContext(), 160, 120);
        let nz = 0; for (let i = 0; i < img.length; i += 4) if (img[i] + img[i + 1] + img[i + 2] > 30) nz++;
        o.t15_nonBlack = nz;
      }
      r.dispose(); cv.remove();

      // T16: yedekler
      const cvN = mkCanvas(160, 120);
      const rN = mod.createBlackHoleRenderer(cvN, { controls: false, forceNoDeferred: true, params: { ...base, diskTime: null, animate: true, animationFps: 30 } });
      rN.start();
      await until(() => rN.getStats().frames >= 3, 30000);
      o.t16_noDeferred = { deferred: rN.getStats().deferred, frames: rN.getStats().frames, trace: rN.getStats().traceFrames, hdr: rN.getStats().hdr };
      rN.dispose(); cvN.remove();
      const cvM = mkCanvas(160, 120);
      const rM = mod.createBlackHoleRenderer(cvM, { controls: false, forceByteHdr: true, params: { ...base, diskTime: null, animate: true, animationFps: 30 } });
      rM.start();
      await until(() => rM.getStats().frames >= 3, 30000);
      o.t16_byte = { deferred: rM.getStats().deferred, frames: rM.getStats().frames, hdr: rM.getStats().hdr };
      rM.dispose(); cvM.remove();
    }

    // ---------------- 4c: T17 bellek / sızıntı + döngü ayarı yeniden iz sürme tetiklemez
    {
      const cv = mkCanvas(96, 72);
      const r = mod.createBlackHoleRenderer(cv, { controls: false, device: { mobile: true }, params: { ...base, animate: false, accumFrames: 1 } });
      r.start();
      await until(() => r.getStats().mode === 'idle' && r.getStats().frames > 0, 30000);
      const sizes = [];
      for (let k = 0; k < 16; k++) {
        const w = 64 + ((k * 37) % 90); const hh = 48 + ((k * 23) % 60);
        cv.style.width = w + 'px'; cv.style.height = hh + 'px';
        await wait(60);
        r.renderOnce({ frames: 1 });
        sizes.push([w, hh]);
        if (k === 7) { const st = r.getStats(); o.t17_mid = { tex: st.gl.textures, entries: st.cacheEntries }; }
      }
      const st = r.getStats();
      o.t17 = { entries: st.cacheEntries, tex: st.gl.textures, geo: st.gl.geometries, programs: st.gl.programs, gpuMB: st.gpuMB, midTex: o.t17_mid.tex };
      // döngü ayarı değişimi: yeniden iz sürme yok
      await until(() => r.getStats().mode === 'idle', 30000);
      await wait(300);
      const a = r.getStats();
      r.setParams({ animationFps: 15, accumFrames: 1, interactionScale: 0.5, dynamicResolution: true, performance: 'battery' });
      await wait(700);
      const b = r.getStats();
      o.t17_loopOnly = { dTrace: b.traceFrames - a.traceFrames, dShade: b.shadeFrames - a.shadeFrames };
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
  ok(R.t3_dyn < 0.9 && R.t3_traceW < 320, `[birleşik/yedek hat, deferred:false] kare süresi hedefi (33 ms) tutmayınca ölçek düştü: dynamicScale=${R.t3_dyn.toFixed(2)}, iz sürme genişliği ${R.t3_traceW} < 320`);

  console.log('T4 — fiziksel radyans ↔ estetik sonrası işlem ayrımı');
  ok(R.t4.n > 1000 && R.t4.maxd <= 3, `bloom KAPALI + tonemap none: ${R.t4.n} disk pikseli, |tuval − sRGB(0.5·radyans)| maks ${R.t4.maxd.toFixed(2)}/255, ort ${R.t4.meanAbs.toFixed(2)} (dither ±1 + yuvarlama + yarı-float)`);

  console.log('T5 — jitter biriktirme');
  ok(Math.abs(R.t5.lumRatio - 1) < 0.02 && R.t5.meanAbsDiff > 0.05, `8 kare ↔ 1 kare: parlaklık oranı ${R.t5.lumRatio.toFixed(4)} (±%2), ort. |Δ| ${R.t5.meanAbsDiff.toFixed(3)}/255 (>0: kenarlar yumuşadı)`);
  ok(R.t5.deterministic, 'iki aynı koşu (diskTime sabit, 8 kare) bit-bit aynı (yıldızlar/biriktirme deterministik)');

  console.log('T6 — 8-bit yedek HDR hedefi');
  ok(R.t6.hdr.startsWith('8-bit') && R.t6.nonBlack > 500 && R.t6.nCompared > 500 && R.t6.meanAbs <= 6 && R.t6.maxAbs <= 24, `${R.t6.hdr}: ${R.t6.nonBlack} aydınlık piksel; parlak ${R.t6.nCompared} pikselde float hattıyla |Δ| ort ${R.t6.meanAbs.toFixed(2)}, maks ${R.t6.maxAbs}/255 (ort ≤ 6, maks ≤ 24: 8-bit doğrusal kodlama = radyans/8 → 0.03'lük basamaklar ve L>8'de kırpma; yalnız ACİL YEDEK)`);

  console.log('T7 — stop()');
  ok(R.t7_framesAfterStop === 0, `stop() sonrası ${R.t7_framesAfterStop} kare`);


  console.log('T8 — durağan sahne (animate=false)');
  ok(R.t8_settled && R.t8.dTicks === 0 && R.t8.dTrace === 0 && R.t8.dShade === 0 && R.t8.dAnim === 0 && R.t8.dPresented === 0 && R.t8.mode === 'idle' && R.t8.fps === 0, `yakınsadıktan sonra 1.5 s'de iz sürme ${R.t8.dTrace}, gölgelendirme ${R.t8.dShade}, animasyon ${R.t8.dAnim}, sunum ${R.t8.dPresented} (hepsi 0 beklenir); rAF döngüsü de durdu (1.5 s'de ${R.t8.dTicks} tik); mod='${R.t8.mode}', fps=${R.t8.fps}`);
  console.log('T9 — animasyon (ertelenmiş hat: geodezik bir kez, görünüş her kare)');
  ok(R.t8.deferred, 'ertelenmiş hat etkin (RGBA32F + RGBA16F render edilebilir)');
  ok(R.t9.dTrace === 0 && R.t9.dShade === 0 && R.t9.dAnim >= 5 && R.t9.dPresented >= 5 && R.t9.mode === 'animating' && R.t9.simAdvanced > 0.1, `2 s'de iz sürme ${R.t9.dTrace} (beklenen 0), gölgelendirme ${R.t9.dShade} (0), animasyon geçişi ${R.t9.dAnim} (≥5), sunum ${R.t9.dPresented}; mod='${R.t9.mode}', fps=${R.t9.fps.toFixed(1)}, simTime +${R.t9.simAdvanced.toFixed(2)} M`);
  ok(R.t9_cam.dTrace >= 1 && R.t9_cam.dAnim >= 1, `kamera hareketi: yeniden iz sürme ${R.t9_cam.dTrace} kare (≥1), animasyon sürüyor (${R.t9_cam.dAnim})`);
  console.log('T10–T13 — eşdeğerlik');
  ok(R.t10_deferred && !R.t10_fusedDeferred && R.t10.max <= 1 && R.t10_lum > 5, `ertelenmiş ↔ birleşik (renderOnce 4 kare, ort. parlaklık ${R.t10_lum.toFixed(1)}/255): maks |Δ| ${R.t10.max}/255, ort ${R.t10.mean.toFixed(4)}`);
  ok(R.t11.max <= 2 && R.t11.mean < 0.2, `animasyon geçişi ↔ gölgelendirmede türbülans (simTime=${R.t11_t.toFixed(2)} M): maks |Δ| ${R.t11.max}/255, ort ${R.t11.mean.toFixed(4)} (yarım-float taban × çarpan yuvarlaması)`);
  ok(R.t12.dTrace === 0 && R.t12.dShade >= 1 && R.t12.max <= 1, `Tmax değişimi: iz sürme ${R.t12.dTrace} (0), gölgelendirme ${R.t12.dShade} (≥1); birleşik hatla maks |Δ| ${R.t12.max}/255, ort ${R.t12.mean.toFixed(4)}`);
  ok(R.t13_bands > 1 && R.t13_same, `şeritli iz sürme (${R.t13_bands} şerit) ↔ tek geçiş: bit-bit ${R.t13_same ? 'aynı' : 'FARKLI'}`);
  console.log('T14–T16 — görünürlük, bağlam kaybı, yedekler');
  ok(R.t14_hiddenFrames === 0 && R.t14_paused && R.t14_mode === 'idle' && R.t14_resumed >= 2, `sayfa gizliyken ${R.t14_hiddenFrames} kare/sunum (0), paused=${R.t14_paused}, mod=${R.t14_mode}; görünür olunca ${R.t14_resumed} kare`);
  ok(R.t15_hasExt && R.t15_lost && R.t15_framesWhileLost === 0 && R.t15_restores === 1 && R.t15_framesAfter > 2 && !R.t15_lostAfter && R.t15_nonBlack > 500, `bağlam kaybı: kayıpken ${R.t15_framesWhileLost} kare; geri yükleme sayısı ${R.t15_restores}, sonra ${R.t15_framesAfter} kare, görüntü siyah değil (${R.t15_nonBlack} aydınlık piksel)`);
  ok(!R.t16_noDeferred.deferred && R.t16_noDeferred.frames >= 3 && R.t16_noDeferred.trace >= 3, `ertelenmiş hat yok (RGBA32F yokmuş gibi): birleşik hat çalışıyor (${R.t16_noDeferred.frames} kare, hepsi tam iz sürme: ${R.t16_noDeferred.trace})`);
  ok(!R.t16_byte.deferred && R.t16_byte.frames >= 3 && R.t16_byte.hdr.startsWith('8-bit'), `8-bit HDR + animasyon: birleşik hat çalışıyor (${R.t16_byte.frames} kare, ${R.t16_byte.hdr})`);
  console.log('T17 — bellek ve döngü ayarları');
  ok(R.t17.entries <= 6 && R.t17.tex <= R.t17.midTex + 4 && R.t17.tex < 80 && R.t17.geo <= 3, `16 farklı tuval boyutu sonrası: önbellek girdisi ${R.t17.entries} (≤ 6), GL doku ${R.t17.tex} (ortada ${R.t17.midTex}; artış yok), geometri ${R.t17.geo}, program ${R.t17.programs}, ${R.t17.gpuMB.toFixed(2)} MB`);
  ok(R.t17_loopOnly.dTrace === 0 && R.t17_loopOnly.dShade === 0, `animationFps/accumFrames/interactionScale/performance değişimi: yeniden iz sürme ${R.t17_loopOnly.dTrace}, gölgelendirme ${R.t17_loopOnly.dShade} (beklenen 0)`);
  // Chromium "GPU stall due to ReadPixels": bu testin kendi readPixels çağrılarının performans uyarısı (üretim kodunda readPixels yok)
  const errs = h.errors.filter((e) => !e.includes('GPU stall due to ReadPixels'));
  ok(errs.length === 0, 'tarayıcı konsolunda hata/uyarı yok (testin kendi readPixels performans uyarısı hariç)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  if (process.argv.includes('--verbose')) console.log(JSON.stringify(R.t2_seq.slice(0, 40)));
} finally {
  await h.close();
}
console.log(bad === 0 ? '\nHAT TESTİ: GEÇTİ' : `\nHAT TESTİ: ${bad} BAŞARISIZ`);
process.exitCode = bad === 0 ? 0 : 1;
