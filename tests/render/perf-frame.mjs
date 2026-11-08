/**
 * Gerçek rAF döngüsünde kare başı maliyet (SwiftShader GÖRECELİ; gerçek GPU'yu TEMSİL ETMEZ). `node --test` ile çalışmaz.
 *
 *     node tests/render/perf-frame.mjs [--profile=iphone|desktop|both] [--perf=auto|battery|balanced] [--secs=6] [--json=çıktı.json]
 *
 * Üç senaryo (yeni hat ve eski hat için AYNI betik; yalnız genel API'yi — setParams/getStats/start — kullanır):
 *   (a) DURAĞAN  : animate=false; yakınsama süresi + sonrasında 3 s'de kaç kare çizildi (iyi hat: 0)
 *   (b) ANİMASYON: varsayılan sahne (türbülans akışı açık); ısınma sonrası `secs` saniyede kare/sn ve ms/kare (= 1000/fps) ve GPU meşguliyeti
 *                  `animationFps` ÜST SINIRI 120'ye çıkarılarak kapasite ölçülür ("kapasite") ve varsayılan sınırla ("varsayılan")
 *   (c) SÜRÜKLEME: her rAF'te phiCam değişir; kare/sn ve ulaşılan iz sürme genişliği
 * Çıktıda `ms/kare` = rAF döngüsünün verimi (1000/fps): GPU işi sınırlayıcı olduğunda kare başı maliyet.
 */
import fs from 'node:fs';
import { startHarness } from './harness.mjs';

const argv = Object.fromEntries(process.argv.slice(2).map((s) => { const m = s.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [s, true]; }));
const secs = Number(argv.secs ?? 6);
const perfName = String(argv.perf ?? 'battery');
const which = String(argv.profile ?? 'both');
const PROFILES = {
  iphone: { name: 'iPhone 390×844@3', w: 390, h: 844, dsf: 3, touch: true, params: { quality: 'mobile', performance: perfName, resolutionScale: 0.75 } },
  desktop: { name: 'Masaüstü 1440×900@1', w: 1440, h: 900, dsf: 1, touch: false, params: { quality: 'high', performance: perfName === 'battery' ? 'balanced' : perfName, resolutionScale: 1 } },
};
const list = which === 'both' ? ['iphone', 'desktop'] : [which];
const rows = [];

for (const key of list) {
  const P = PROFILES[key];
  const h = await startHarness({ width: P.w, height: P.h, deviceScaleFactor: P.dsf, hasTouch: P.touch });
  try {
    const R = await h.page.evaluate(async ({ P, secs }) => {
      const mod = await import('/src/render/index.js');
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const cv = document.createElement('canvas');
      cv.style.cssText = `position:fixed;left:0;top:0;width:${P.w}px;height:${P.h}px`;
      document.body.appendChild(cv);
      const base = { a: 0.9, thetaCam: 1.3, rCam: 50, fovY: P.w < 600 ? 50 : 40, phiCam: 0, diskTime: null, ...P.params };
      const r = mod.createBlackHoleRenderer(cv, { controls: false, params: base, device: { mobile: P.touch } });
      const out = { hdr: r.getStats().hdr };
      // ısınma: gölgelendirici derleme/ilk önbellek (soğuk derleme SwiftShader'da saniyeler sürer ve ölçümü bozar) — çok düşük çözünürlükte tek kare
      r.setParams({ resolutionScale: 0.1, animate: false });
      r.renderOnce({ frames: 1 });
      r.setParams({ resolutionScale: base.resolutionScale, animate: true });
      const quiet = async (maxMs = 90000, still = 900) => {
        let last = r.getStats().frames; let t = performance.now(); const t0 = t;
        while (performance.now() - t0 < maxMs) {
          await wait(60);
          const f = r.getStats().frames;
          if (f !== last) { last = f; t = performance.now(); } else if (performance.now() - t > still) return performance.now() - t0 - still;
        }
        return -1;
      };
      r.start();

      // (a) durağan
      r.setParams({ animate: false });
      const sA0 = r.getStats(); const tA0 = performance.now();
      const settleMs = await quiet();
      const sA1 = r.getStats();
      out.a = { settleMs, traceFramesToSettle: (sA1.traceFrames ?? sA1.frames) - (sA0.traceFrames ?? sA0.frames), traceW: sA1.traceWidth, traceH: sA1.traceHeight, scale: sA1.scale };
      const fIdle0 = r.getStats().frames; const pIdle0 = r.getStats().presented ?? fIdle0;
      await wait(3000);
      out.a.idleFrames3s = r.getStats().frames - fIdle0;
      out.a.idlePresented3s = (r.getStats().presented ?? r.getStats().frames) - pIdle0;
      out.a.mode = r.getStats().mode ?? '-';

      // (b) animasyon: kapasite (fps sınırı 120) ve varsayılan sınır. Kararlı duruma gelene kadar bekle (ilk kareler: A/bloom derlemesi, hedef ayırma, GPU kuyruğu dolması
      // SwiftShader'da saniyeler sürer): son 3 s'de ≥ 2 kare ilerlediyse kararlı say (en çok 60 s)
      const steady = async () => {
        const hist = [];
        const t0 = performance.now();
        while (performance.now() - t0 < 60000) {
          await wait(1000);
          hist.push([performance.now(), r.getStats().frames]);
          const old = hist.find(([t]) => performance.now() - t <= 3200);
          if (hist.length >= 4 && old && hist[hist.length - 1][1] - old[1] >= 2) return (performance.now() - t0) / 1000;
        }
        return -1;
      };
      for (const [label, fps] of [['capacity', 120], ['default', null]]) {
        r.setParams({ animate: true, turbulence: true, animationFps: fps });
        const warm = await steady();
        const s0 = r.getStats(); const t0 = performance.now();
        await wait(secs * 1000);
        const s1 = r.getStats(); const dt = (performance.now() - t0) / 1000;
        const df = s1.frames - s0.frames;
        const dtr = (s1.traceFrames ?? s1.frames) - (s0.traceFrames ?? s0.frames);
        out['b_' + label] = { fps: df / dt, msPerFrame: df > 0 ? (dt * 1000) / df : Infinity, traceFramesPerSec: dtr / dt, traceW: s1.traceWidth, traceH: s1.traceHeight, dyn: s1.dynamicScale, mode: s1.mode ?? '-', level: s1.adaptiveLevel ?? '-', warmS: warm };
      }
      r.setParams({ animationFps: null });

      // (c) sürükleme
      r.setParams({ animate: true });
      await wait(1500);
      const sC0 = r.getStats(); const tC0 = performance.now();
      let phi = 0; let ticks = 0;
      await new Promise((res) => {
        const tick = () => { phi += 0.012; r.setParams({ phiCam: phi }); ticks++; if (performance.now() - tC0 < secs * 1000) requestAnimationFrame(tick); else res(); };
        requestAnimationFrame(tick);
      });
      const sC1 = r.getStats(); const dtC = (performance.now() - tC0) / 1000;
      const dfC = sC1.frames - sC0.frames;
      out.c = { fps: dfC / dtC, msPerFrame: dfC > 0 ? (dtC * 1000) / dfC : Infinity, traceW: sC1.traceWidth, traceH: sC1.traceHeight, dyn: sC1.dynamicScale, mode: sC1.mode ?? '-', level: sC1.adaptiveLevel ?? '-' };
      r.dispose();
      return out;
    }, { P, secs });
    console.log(`\n=== ${P.name} | perf=${P.params.performance} | HDR ${R.hdr} ===`);
    const f = (x) => (Number.isFinite(x) ? x.toFixed(1) : '∞');
    console.log(`(a) DURAĞAN    : yakınsama ${f(R.a.settleMs)} ms, ${R.a.traceFramesToSettle} iz sürme karesi, iz sürme ${R.a.traceW}×${R.a.traceH}; sonra 3 s'de çizilen kare: ${R.a.idleFrames3s} (sunum ${R.a.idlePresented3s}), mod=${R.a.mode}`);
    for (const k of ['b_capacity', 'b_default']) {
      const b = R[k];
      console.log(`(b) ANİMASYON ${k === 'b_capacity' ? '(kapasite, fps<=120)' : '(varsayılan fps sınırı) '}: ${f(b.fps)} kare/sn = ${f(b.msPerFrame)} ms/kare; iz sürme/sn ${f(b.traceFramesPerSec)}; iz sürme ${b.traceW}×${b.traceH} dyn=${b.dyn?.toFixed?.(2)} mod=${b.mode} seviye=${b.level}; kararlı duruma ${b.warmS?.toFixed?.(0)} s`);
    }
    console.log(`(c) SÜRÜKLEME  : ${f(R.c.fps)} kare/sn = ${f(R.c.msPerFrame)} ms/kare; iz sürme ${R.c.traceW}×${R.c.traceH} dyn=${R.c.dyn?.toFixed?.(2)} mod=${R.c.mode} seviye=${R.c.level}`);
    const errs = h.errors.filter((e) => !e.includes('GPU stall'));
    console.log('konsol hata/uyarı:', errs.length ? errs.join(' | ') : 'YOK');
    rows.push({ profile: key, perf: P.params.performance, ...R });
  } finally {
    await h.close();
  }
}
if (argv.json) fs.writeFileSync(String(argv.json), JSON.stringify(rows, null, 1));
