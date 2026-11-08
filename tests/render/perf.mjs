/**
 * SwiftShader ms/kare ölçümü (görsel mod). `node --test` ile çalışmaz.
 *
 *     node tests/render/perf.mjs [--frames=3] [--json=çıktı.json]
 *
 * Her hücre: `renderer.benchmark()` — iz sürme (+ isteğe bağlı bloom + kompozit) tek karesi, 1 piksellik okumayla GPU bitişini BEKLER.
 *   "tam hat"  : iz sürme (HDR) + bloom + ACES + sRGB kompozit (varsayılan görsel mod, biriktirmesiz tek kare)
 *   "iz sürme" : yalnız iz sürme geçişi (jeodezik + fotometri + yıldız alanı + türbülans)
 * Bölüm 2: 320×240'ta bileşen maliyeti (aynı kamera; yıldız/Samanyolu, türbülans, eksen koruması, bloom ayrı ayrı kapatılır).
 *
 * UYARI: SwiftShader bir CPU yazılım rasterleştiricisidir (çok çekirdekli SIMD). Gerçek GPU'yu TEMSİL ETMEZ:
 * mutlak süreler ve hatta kalite seviyeleri arasındaki ORAN gerçek donanımda farklı olur (dallanma/ıraksama maliyeti, sin/cos
 * donanım birimi, kayıt basıncı). Yalnızca göreli eğilim (piksel ∝ süre, κ/N etkisi) için kaba bir gösterge sayın.
 */
import fs from 'node:fs';
import os from 'node:os';
import { startHarness } from './harness.mjs';

const argv = Object.fromEntries(process.argv.slice(2).map((s) => { const m = s.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [s, true]; }));
const frames = Number(argv.frames ?? 3);
const deg = (d) => (d * Math.PI) / 180;

const SIZES = [[160, 120], [320, 240], [640, 480]];
const CASES = [
  { name: 'A a=0.9 θ75° r50  (high κ=0.05 N=512)', p: { a: 0.9, thetaCam: deg(75), rCam: 50, fovY: 30, quality: 'high' } },
  { name: 'A a=0.9 θ75° r50  (mobile κ=0.10 N=256)', p: { a: 0.9, thetaCam: deg(75), rCam: 50, fovY: 30, quality: 'mobile' } },
  { name: 'B a=0.998 θ60° r50 (high)', p: { a: 0.998, thetaCam: deg(60), rCam: 50, fovY: 30, quality: 'high' } },
  { name: 'C a=0 θ85° r30    (high)', p: { a: 0, thetaCam: deg(85), rCam: 30, fovY: 40, quality: 'high' } },
];
const COMPONENTS = [
  ['tam varsayılan (yıldız+MW+türbülans+eksen koruması)', {}],
  ['yıldız + Samanyolu KAPALI', { stars: false, milkyWay: 0 }],
  ['türbülans KAPALI', { turbulence: false }],
  ['eksen koruması KAPALI (4a adım kuralı)', { axisGuard: false }],
  ['yıldız+MW+türbülans KAPALI (çekirdek + fotometri)', { stars: false, milkyWay: 0, turbulence: false }],
  ['çekirdek + fotometri, eksen koruması KAPALI', { stars: false, milkyWay: 0, turbulence: false, axisGuard: false }],
  ['disk KAPALI (yalnız merceklenme + gökyüzü)', { disk: false }],
];
const BASE = { phiCam: 0, diskIn: 'isco', diskOut: 20, maxDiskHits: 1, resolutionScale: 1, diskTime: 40, animate: false, dynamicResolution: false, stars: true, milkyWay: 0.6, turbulence: true, axisGuard: true, disk: true, bloom: true, tonemap: 'aces' };

const h = await startHarness({ width: SIZES[0][0], height: SIZES[0][1] });
const rows = [];
try {
  const info = await h.page.evaluate(() => {
    const gl = window.__karadelik.renderer.getContext();
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  console.log(`GPU: ${info} | CPU çekirdek: ${os.cpus().length} (${os.cpus()[0]?.model ?? '?'})`);
  console.log(`Her hücre: ${frames} karenin ortalaması (1 piksellik okuma ile eşzamanlı), ilk kare ısınma (shader derleme) hariç. "tam/iz" = tam hat / yalnız iz sürme (ms).\n`);
  console.log('kurulum'.padEnd(44) + SIZES.map(([w, hh]) => `${w}×${hh}`.padStart(16)).join('') + '   µs/piksel iz sürme (640×480)');

  for (const c of CASES) {
    const line = [];
    let usPerPx = NaN;
    for (const [w, hh] of SIZES) {
      await h.page.setViewportSize({ width: w, height: hh });
      const r = await h.page.evaluate(({ p, frames, BASE }) => {
        const r = window.__karadelik.renderer;
        r.setParams({ ...BASE, ...p });
        const full = r.benchmark({ frames, warmup: 1, post: true });
        const trace = r.benchmark({ frames, warmup: 0, post: false });
        return { full, trace };
      }, { p: c.p, frames, BASE });
      line.push(`${r.full.msPerFrame.toFixed(0)}/${r.trace.msPerFrame.toFixed(0)}`);
      if (w === 640) usPerPx = (r.trace.msPerFrame * 1000) / (r.trace.width * r.trace.height);
      rows.push({ case: c.name, width: r.trace.width, height: r.trace.height, fullMs: r.full.msPerFrame, traceMs: r.trace.msPerFrame });
    }
    console.log(c.name.padEnd(44) + line.map((x) => `${x} ms`.padStart(16)).join('') + `   ${usPerPx.toFixed(1)}`);
  }

  console.log('\nBileşen maliyeti (320×240, A high; yalnız iz sürme ms; tam hat için son sütun):');
  await h.page.setViewportSize({ width: 320, height: 240 });
  let ref = NaN;
  for (const [name, p] of COMPONENTS) {
    const r = await h.page.evaluate(({ p, frames, BASE, A }) => {
      const r = window.__karadelik.renderer;
      r.setParams({ ...BASE, ...A, ...p });
      const trace = r.benchmark({ frames: Math.max(frames, 4), warmup: 1, post: false });
      const full = r.benchmark({ frames: 2, warmup: 0, post: true });
      return { trace: trace.msPerFrame, full: full.msPerFrame };
    }, { p, frames, BASE, A: CASES[0].p });
    if (!Number.isFinite(ref)) ref = r.trace;
    console.log(`  ${name.padEnd(54)} ${r.trace.toFixed(0).padStart(5)} ms (${((r.trace / ref) * 100).toFixed(0).padStart(3)}%)   tam hat ${r.full.toFixed(0)} ms`);
    rows.push({ component: name, traceMs: r.trace, fullMs: r.full });
  }

  // bloom + kompozit maliyeti (iz sürme hariç): tam − iz sürme farkı
  console.log('\nsin/cos maliyeti (320×240, a=0.9 θ75° r50, high; yalnız iz sürme):');
  const trig = await h.page.evaluate(async ({ frames, p, BASE }) => {
    const mod = await import('/src/render/index.js');
    const res = {};
    for (const nativeTrig of [false, true]) {
      const cv = document.createElement('canvas');
      cv.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:240px';
      document.body.appendChild(cv);
      const r = mod.createBlackHoleRenderer(cv, { nativeTrig, controls: false });
      r.setParams({ ...BASE, ...p });
      res[nativeTrig ? 'native' : 'sinCos'] = r.benchmark({ frames, warmup: 1, post: false }).msPerFrame;
      r.dispose();
      cv.remove();
    }
    return res;
  }, { frames, p: CASES[0].p, BASE });
  console.log(`  trig.glsl sinCos: ${trig.sinCos.toFixed(0)} ms/kare · yerel sin/cos: ${trig.native.toFixed(0)} ms/kare (oran ${(trig.sinCos / trig.native).toFixed(2)}×)`);
  rows.push({ case: 'trig', ...trig });

  // 4c: ertelenmiş hat aşama maliyetleri (T+S ayrı programlar ↔ birleşik tek geçiş; yalnız S; yalnız A; bloom+kompozit)
  console.log('\n4c aşama maliyetleri (A high; "iz sürme" = T+S [ertelenmiş] ya da birleşik; ms/kare, benchmark() eşzamanlı):');
  console.log('boyut'.padEnd(10) + 'birleşik'.padStart(10) + 'T+S (erteli)'.padStart(14) + 'yalnız S'.padStart(10) + 'yalnız A'.padStart(10) + 'A+komp (bloom önbellekli)'.padStart(27) + 'bloom+komp (önbelleksiz)'.padStart(25) + '   (A+komp)/(T+S)');
  for (const [w, hh] of [[160, 120], [320, 240], [640, 480]]) {
    await h.page.setViewportSize({ width: w, height: hh });
    const r = await h.page.evaluate(({ frames, BASE, A }) => {
      const r = window.__karadelik.renderer;
      r.setParams({ ...BASE, ...A.p, deferred: false });
      const fused = r.benchmark({ frames, warmup: 1, post: false }).msPerFrame;
      r.setParams({ deferred: 'auto' });
      const ts = r.benchmark({ frames, warmup: 1, post: false }).msPerFrame;
      const sh = r.benchmark({ frames, warmup: 1, post: false, mode: 'shade' }).msPerFrame;
      const an = r.benchmark({ frames, warmup: 1, post: false, mode: 'anim' }).msPerFrame;
      const anPost = r.benchmark({ frames, warmup: 1, post: true, mode: 'anim' }).msPerFrame;
      const shPost = r.benchmark({ frames, warmup: 1, post: true, mode: 'shade' }).msPerFrame; // her karede yeni taban ⇒ bloom önbelleksiz
      return { fused, ts, sh, an, anPost, post: shPost - sh };
    }, { frames: Math.max(frames, 3), BASE: { ...BASE, animate: true, diskTime: null }, A: CASES[0] });
    console.log(`${w}×${hh}`.padEnd(10) + r.fused.toFixed(0).padStart(10) + r.ts.toFixed(0).padStart(14) + r.sh.toFixed(0).padStart(10) + r.an.toFixed(0).padStart(10) + r.anPost.toFixed(0).padStart(27) + r.post.toFixed(0).padStart(25) + `   ${(r.anPost / r.ts).toFixed(2)}`);
    rows.push({ stage: `${w}x${hh}`, ...r });
  }

  // Chromium "GPU stall due to ReadPixels": ölçümün kendi eşzamanlama okumasının (benchmark) performans uyarısı; beklenen ve zararsız
const errs = h.errors.filter((e) => !e.includes('GPU stall due to ReadPixels'));
console.log('\nKonsol hata/uyarı (benchmark readPixels performans uyarısı hariç):', errs.length ? '\n' + errs.join('\n') : 'YOK');
} finally {
  await h.close();
}
if (argv.json) fs.writeFileSync(String(argv.json), JSON.stringify(rows, null, 1));
