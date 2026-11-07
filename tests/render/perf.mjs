/**
 * SwiftShader ms/kare ölçümü (görsel mod). `node --test` ile çalışmaz.
 *
 *     node tests/render/perf.mjs [--frames=3] [--json=çıktı.json]
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

const h = await startHarness({ width: SIZES[0][0], height: SIZES[0][1] });
const rows = [];
try {
  const info = await h.page.evaluate(() => {
    const gl = window.__karadelik.renderer.getContext();
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  console.log(`GPU: ${info} | CPU çekirdek: ${os.cpus().length} (${os.cpus()[0]?.model ?? '?'})`);
  console.log(`Her hücre: ${frames} karenin ortalaması (1 piksellik readPixels ile eşzamanlı; Chromium'da gl.finish() GPU'yu beklemez), ilk kare ısınma (shader derleme) hariç.\n`);
  console.log('kurulum'.padEnd(44) + SIZES.map(([w, hh]) => `${w}×${hh}`.padStart(12)).join('') + '   µs/piksel (640×480)');

  for (const c of CASES) {
    const line = [];
    let usPerPx = NaN;
    for (const [w, hh] of SIZES) {
      await h.page.setViewportSize({ width: w, height: hh });
      const r = await h.page.evaluate(({ p, frames }) => {
        const r = window.__karadelik.renderer;
        r.setParams({ phiCam: 0, diskIn: 'isco', diskOut: 20, maxDiskHits: 1, resolutionScale: 1, ...p });
        return r.benchmark({ frames, warmup: 1 });
      }, { p: c.p, frames });
      line.push(r.msPerFrame);
      if (w === 640) usPerPx = (r.msPerFrame * 1000) / (r.width * r.height);
      rows.push({ case: c.name, width: r.width, height: r.height, msPerFrame: r.msPerFrame });
    }
    console.log(c.name.padEnd(44) + line.map((x) => `${x.toFixed(0)} ms`.padStart(12)).join('') + `   ${usPerPx.toFixed(1)}`);
  }

  // sin/cos: cihaz içi (native) ↔ trig.glsl sinCos — iki ayrı renderer (yalnız SwiftShader'da anlamlı bir maliyet göstergesi)
  console.log('\nsin/cos maliyeti (320×240, a=0.9 θ75° r50, high):');
  await h.page.setViewportSize({ width: 320, height: 240 });
  const trig = await h.page.evaluate(async ({ frames, p }) => {
    const mod = await import('/src/render/index.js');
    const res = {};
    for (const nativeTrig of [false, true]) {
      const cv = document.createElement('canvas');
      cv.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:240px';
      document.body.appendChild(cv);
      const r = mod.createBlackHoleRenderer(cv, { nativeTrig, controls: false });
      r.setParams({ phiCam: 0, diskIn: 'isco', diskOut: 20, ...p });
      res[nativeTrig ? 'native' : 'sinCos'] = r.benchmark({ frames, warmup: 1 }).msPerFrame;
      r.dispose();
      cv.remove();
    }
    return res;
  }, { frames, p: CASES[0].p });
  console.log(`  trig.glsl sinCos: ${trig.sinCos.toFixed(0)} ms/kare · yerel sin/cos: ${trig.native.toFixed(0)} ms/kare (oran ${(trig.sinCos / trig.native).toFixed(2)}×)`);
  rows.push({ case: 'trig', ...trig });

  console.log('\nKonsol hata/uyarı:', h.errors.length ? '\n' + h.errors.join('\n') : 'YOK');
} finally {
  await h.close();
}
if (argv.json) fs.writeFileSync(String(argv.json), JSON.stringify(rows, null, 1));
