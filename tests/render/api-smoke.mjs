/**
 * Render API duman testi: parametre sözleşmesi, kıstırma, start/stop döngüsü, yörünge kontrolü, çözünürlük ölçeği,
 * debug çıktı düzeni. `node --test` ile çalışmaz.   node tests/render/api-smoke.mjs
 * Çıkış kodu 0 = tüm kontroller geçti.
 */
import { startHarness } from './harness.mjs';

const h = await startHarness({ width: 160, height: 120 });
let bad = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) bad++; };

try {
  const R = await h.page.evaluate(async () => {
    const r = window.__karadelik.renderer;
    const o = {};
    o.keys = Object.keys(r).sort();
    o.defaults = r.getParams();

    // kıstırma
    r.setParams({ a: 5, thetaCam: Math.PI / 2, fovY: 1000, maxDiskHits: 99, rCam: 1e9, resolutionScale: 7 });
    o.clamped = r.getParams();
    r.setParams({ a: -1, thetaCam: 0, rCam: 0.1 });
    o.clamped2 = r.getParams();
    try { r.setParams({ quality: 'ultra' }); o.badQuality = 'kabul edildi'; } catch (e) { o.badQuality = e.constructor.name; }
    try { r.setParams({ a: 'x' }); o.badType = 'kabul edildi'; } catch (e) { o.badType = e.constructor.name; }

    // 4b parametreleri
    o.newDefaults = { Tmax: o.defaults.Tmax, fCol: o.defaults.fCol, mode: o.defaults.brightnessMode, exposure: o.defaults.exposure, tonemap: o.defaults.tonemap, perf: o.defaults.performance };
    r.setParams({ Tmax: 1, fCol: 99, exposure: 1e9, bloomStrength: 99, turbulenceAmp: 5, milkyWay: -1, interactionScale: 5, accumFrames: 1000 });
    o.clamped4b = r.getParams();
    for (const [k, v] of [['tonemap', 'filmic'], ['brightnessMode', 'foo'], ['performance', 'ultra'], ['Tmax', 'x']]) {
      try { r.setParams({ [k]: v }); o['bad_' + k] = 'kabul edildi'; } catch (e) { o['bad_' + k] = e.constructor.name; }
    }
    r.setParams({ Tmax: 1e4, fCol: 1, exposure: 0.5, bloomStrength: 0.2, turbulenceAmp: 0.3, milkyWay: 0.6, interactionScale: null, accumFrames: null });

    // start/stop + kirli bayrak
    r.setParams({ a: 0.9, thetaCam: 1.3, rCam: 50, fovY: 30, quality: 'mobile', resolutionScale: 0.5, maxDiskHits: 1, rCam: 50, dynamicResolution: false });
    const f0 = r.getStats().frames;
    r.start();
    await new Promise((res) => setTimeout(res, 1500));
    o.framesRunning = r.getStats().frames - f0;
    o.isRunning = r.isRunning();
    const st = r.getStats();
    o.size = [st.traceWidth, st.traceHeight];
    o.canvasSize = [st.width, st.height];
    r.stop();
    const f1 = r.getStats().frames;
    r.setParams({ phiCam: 1 });
    await new Promise((res) => setTimeout(res, 300));
    o.framesAfterStop = r.getStats().frames - f1;

    // yörünge kontrolü (sürükleme + tekerlek). Uygulamanın kendi renderer'ı artık {controls:false} (kontrolü arayüz katmanı yönetir),
    // bu yüzden geçici kontrol AYRI bir tuvalde, {controls:true} ile oluşturulan ikinci bir renderer'la sınanır (test varsayımı güncellendi).
    const mod = await import('/src/render/index.js');
    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 120;
    document.body.appendChild(cv);
    const rc = mod.createBlackHoleRenderer(cv, { controls: true });
    const before = rc.getParams();
    const ev = (type, x, y, extra = {}) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true, ...extra }));
    ev('pointerdown', 50, 50); ev('pointermove', 90, 70); ev('pointerup', 90, 70);
    const after = rc.getParams();
    o.drag = { dphi: after.phiCam - before.phiCam, dtheta: after.thetaCam - before.thetaCam };
    const r0 = after.rCam;
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, bubbles: true, cancelable: true }));
    o.wheel = rc.getParams().rCam / r0;
    rc.dispose();
    cv.remove();

    // debug çıktı düzeni
    r.setParams({ a: 0, thetaCam: 1.5, rCam: 30, fovY: 40, quality: 'high', phiCam: 0, diskOut: 20, resolutionScale: 1, rEscape: 'auto' });
    const d = await r.renderDebug(8, 6);
    o.debugLen = d.length;
    // CPU f64 referansı (math/camera + raytracer, a=0 θ=1.5 r=30 fov40 8×6): piksel (i=4,j=3) → disk r=14.153 n=1; (3,2) → yakalandı
    o.debugPix = { disk: [d[(3 * 8 + 4) * 12 + 0], d[(3 * 8 + 4) * 12 + 1], d[(3 * 8 + 4) * 12 + 6]], cap: d[(2 * 8 + 3) * 12 + 0] };
    o.debugAllFinite = Array.from(d).every((x) => Number.isFinite(x));
    return o;
  });

  console.log('API anahtarları:', R.keys.join(', '));
  for (const k of ['start', 'stop', 'setParams', 'getParams', 'renderDebug', 'renderDebugPhoto', 'renderOnce']) ok(R.keys.includes(k), `API: ${k}`);
  ok(R.defaults.a === 0.9 && R.defaults.quality === 'high' && R.defaults.diskIn === 'isco', 'varsayılan parametreler');
  ok(R.clamped.a === 0.998 && R.clamped.thetaCam < Math.PI / 2 + 1e-9 && R.clamped.fovY === 120 && R.clamped.maxDiskHits === 4 && R.clamped.rCam === 1000 && R.clamped.resolutionScale === 1, 'aşırı değerler kıstırılıyor (a≤0.998, fov≤120, hits≤4, r≤1000, ölçek≤1)');
  ok(R.clamped2.a === 0 && R.clamped2.thetaCam === 1e-3 && R.clamped2.rCam > 2, `alt sınırlar (a=0, θ_min=1e-3, r_cam>r₊: ${R.clamped2.rCam})`);
  ok(R.newDefaults.Tmax === 1e4 && R.newDefaults.fCol === 1 && R.newDefaults.mode === 'band' && R.newDefaults.tonemap === 'aces' && R.newDefaults.perf === 'auto', `4b/4c varsayılanları: Tmax=${R.newDefaults.Tmax}, fCol=${R.newDefaults.fCol}, mod=${R.newDefaults.mode}, tonemap=${R.newDefaults.tonemap}, performans=${R.newDefaults.perf}`);
  ok(R.clamped4b.Tmax === 2000 && R.clamped4b.fCol === 3 && R.clamped4b.exposure === 1000 && R.clamped4b.bloomStrength === 2 && R.clamped4b.turbulenceAmp === 1 && R.clamped4b.milkyWay === 0 && R.clamped4b.interactionScale === 1 && R.clamped4b.accumFrames === 64, '4b aşırı değerler kıstırılıyor (Tmax≥2000, fCol≤3, exposure≤1000, bloom≤2, türbülans≤1, milkyWay≥0, interactionScale≤1, accumFrames≤64)');
  ok(R.bad_tonemap === 'RangeError' && R.bad_brightnessMode === 'RangeError' && R.bad_performance === 'RangeError' && R.bad_Tmax === 'TypeError', `geçersiz 4b değerleri: tonemap→${R.bad_tonemap}, brightnessMode→${R.bad_brightnessMode}, performance→${R.bad_performance}, Tmax→${R.bad_Tmax}`);
  ok(R.badQuality === 'RangeError' && R.badType === 'TypeError', `geçersiz kalite → ${R.badQuality}, geçersiz tür → ${R.badType}`);
  ok(R.isRunning && R.framesRunning >= 1, `start(): ${R.framesRunning} kare çizildi (yalnız kirli iken)`);
  ok(R.size[0] === 80 && R.size[1] === 60 && R.canvasSize[0] === 160 && R.canvasSize[1] === 120, `resolutionScale=0.5 ⇒ iz sürme ${R.size.join('×')} (beklenen 80×60), tuval ${R.canvasSize.join('×')} (beklenen 160×120)`);
  ok(R.framesAfterStop === 0, `stop() sonrası kare çizilmiyor (${R.framesAfterStop})`);
  ok(R.drag.dphi < 0 && R.drag.dtheta < 0, `sürükleme: Δφ=${R.drag.dphi.toFixed(3)}, Δθ=${R.drag.dtheta.toFixed(3)}`);
  ok(R.wheel > 1.2, `tekerlek: r_cam × ${R.wheel.toFixed(3)}`);
  ok(R.debugLen === 8 * 6 * 12 && R.debugAllFinite, `renderDebug(8,6): ${R.debugLen} float, hepsi sonlu`);
  ok(R.debugPix.disk[0] === 2 && Math.abs(R.debugPix.disk[1] - 14.153) < 0.01 && R.debugPix.disk[2] === 1, `piksel (4,3) disk r=${R.debugPix.disk[1].toFixed(4)} n=${R.debugPix.disk[2]} (CPU: 14.153, n=1); satır sırası üst=0 doğru`);
  ok(R.debugPix.cap === 0, `piksel (3,2) yakalandı (CPU: captured), status=${R.debugPix.cap}`);
  ok(h.errors.length === 0, 'tarayıcı konsolunda hata/uyarı yok' + (h.errors.length ? ': ' + h.errors.join(' | ') : ''));
} finally {
  await h.close();
}
console.log(bad === 0 ? '\nDUMAN TESTİ: GEÇTİ' : `\nDUMAN TESTİ: ${bad} BAŞARISIZ`);
process.exitCode = bad === 0 ? 0 : 1;
