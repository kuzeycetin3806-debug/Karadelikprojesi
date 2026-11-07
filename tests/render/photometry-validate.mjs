/**
 * Disk fotometrisi doğrulaması (Adım 4b): GPU'nun hesapladığı τ, T_obs, parlaklık I ve RGB radyansı ↔ CPU (src/physics/disk.js + traceRay gCam).
 * `node --test` ile çalışmaz.   node tests/render/photometry-validate.mjs [--grid=96x72] [--json=çıktı.json]
 *
 * GPU: renderer.renderDebugPhoto (MODE_DEBUG_PHOTO; türbülans ve kenar yumuşatma KAPALI — ESTETİK öğeler sınanmaz).
 * CPU: aynı kamera/ızgarada traceRay (E32: rk4 + f32 + hamilton + hermite, GPU çekirdeğinin eşleniği) → hit.r, hit.gCam;
 *      sonra disk.js (diskTemperatureProfile, blackbodyToLinearSRGB integrali) ile T_obs ve I.
 * Üç katman ayrı raporlanır (neden: hata kaynağını ayırmak):
 *   [PORT]  GPU ↔ CPU(f64, AYNI formül: tablo + LUT enterpolasyonu + seri/Wien) — girdi: GPU'nun kendi (r, g_cam)'ı.
 *           Yalnız f32/cihaz aritmetiği farkı. Eşik MUTLAK: göreli hata medyan ≤ 1e-5, p99 ≤ 2e-4.
 *   [TABLO] CPU(f64, tablo+LUT) ↔ CPU(f64, TAM: diskTemperatureProfile + Planck integrali) — girdi: aynı (r, g_cam).
 *           Tablo/LUT/seri yaklaşıklığı; physics belgesindeki tablo hatalarıyla (disk.md §5.4) uyumlu olmalı. Bilgi (tavan: medyan ≤ 2e-3).
 *   [U-U]   GPU ↔ CPU(f64, TAM) — girdi: CPU E32 izinden (r, g_cam). Uçtan uca: ışın farkı + tablo + f32.
 * Göreli hata yalnız I ≥ 1e-3 (tepe Y_ref = 1'in %0.1'i) olan pikseller için; I < 1e-3 (Wien kuyruğu / ISCO) ayrıca bilgi olarak.
 * Çıkış kodu: [PORT] ve [TABLO] eşikleri sağlanırsa 0.
 */
import fs from 'node:fs';
import { createCamera } from '../../src/math/camera.js';
import { traceRay, recommendedGpuBudget } from '../../src/math/raytracer.js';
import { startHarness } from './harness.mjs';
import { diskPhotometryCPU } from '../../src/render/photometry.js';
import { iscoRadius } from '../../src/physics/kerr.js';

const deg = (d) => (d * Math.PI) / 180;
const argv = Object.fromEntries(process.argv.slice(2).map((s) => { const m = s.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [s, true]; }));
const [GW, GH] = String(argv.grid ?? '96x72').split('x').map(Number);
const R_OUT = 20;
const HALF_HEIGHT = 14;

const SETUPS = [
  { name: 'S1 a=0.9 θ75° Tmax=1e4 f=1 band', a: 0.9, th: 75, rCam: 50, Tmax: 1e4, fCol: 1, mode: 'band' },
  { name: 'S2 a=0.9 θ75° Tmax=1e4 f=1 bolometrik (mod A)', a: 0.9, th: 75, rCam: 50, Tmax: 1e4, fCol: 1, mode: 'bolometric' },
  { name: 'S3 a=0.9 θ75° Tmax=1e6 (T_obs>1e5 K: seri) band', a: 0.9, th: 75, rCam: 50, Tmax: 1e6, fCol: 1, mode: 'band' },
  { name: 'S4 a=0 θ85° Tmax=2000 (T_obs<1e3 K: Wien) band', a: 0, th: 85, rCam: 30, Tmax: 2000, fCol: 1, mode: 'band' },
  { name: 'S5 a=0.998 θ60° Tmax=1e5 f=1.7 band', a: 0.998, th: 60, rCam: 50, Tmax: 1e5, fCol: 1.7, mode: 'band' },
  { name: 'S6 a=0.9 retrograd θ75° Tmax=3e4 f=1.7 bolometrik', a: 0.9, th: 75, rCam: 50, Tmax: 3e4, fCol: 1.7, mode: 'bolometric', prograde: false },
  { name: 'S7 a=0.5 θ60° r=20 Tmax=8e3 f=1.3 band', a: 0.5, th: 60, rCam: 20, Tmax: 8e3, fCol: 1.3, mode: 'band' },
];

const quantile = (s, p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN);
const stats = (v) => { const s = [...v].sort((x, y) => x - y); return { n: s.length, med: quantile(s, 0.5), p99: quantile(s, 0.99), max: s.length ? s[s.length - 1] : NaN }; };
const f = (x) => (Number.isFinite(x) ? x.toExponential(2) : '  n/a  ');
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

const harness = await startHarness({ width: 64, height: 48 });
const results = [];
const fails = [];
const T0 = Date.now();
try {
  console.log(`Izgara ${GW}x${GH}, r_out=${R_OUT}; türbülans/kenar yumuşatma KAPALI; göreli hata yalnız I ≥ 1e-3.\n`);
  for (const S of SETUPS) {
    const prograde = S.prograde ?? true;
    const th = deg(S.th);
    const fovY = 2 * Math.atan(HALF_HEIGHT / S.rCam);
    const budget = recommendedGpuBudget(S.a, true);

    // --- GPU (renderDebugPhoto)
    const raw = await harness.page.evaluate(async (q) => {
      const r = window.__karadelik.renderer;
      r.setParams(q.params);
      return Array.from(await r.renderDebugPhoto(q.w, q.h));
    }, {
      params: {
        a: S.a, thetaCam: th, rCam: S.rCam, phiCam: 0, fovY: (fovY * 180) / Math.PI, diskIn: 'isco', diskOut: R_OUT, prograde, quality: 'high',
        maxDiskHits: 1, rEscape: 300, Tmax: S.Tmax, fCol: S.fCol, brightnessMode: S.mode, turbulence: false, diskEdgeFade: 0,
      },
      w: GW, h: GH,
    });

    // --- CPU E32 izi (uçtan uca girdi)
    const cam = createCamera({ a: S.a, rCam: S.rCam, thetaCam: th, phiCam: 0, fovY, width: GW, height: GH });
    const tp = { a: S.a, rOut: R_OUT, prograde };
    const e32 = { integrator: 'rk4', precision: 'f32', form: 'hamilton', kappa: budget.kappa, maxSteps: budget.maxSteps, crossing: 'hermite', rEscape: 300, maxDiskHits: 1 };
    const cfg = { a: S.a, prograde, rOut: R_OUT, Tmax: S.Tmax, fCol: S.fCol, brightnessMode: S.mode };

    const acc = { tau: [], Tobs: [], I: [], logY: [], rgb: [], tab_Tobs: [], tab_I: [], tab_rgb: [], tab_tau: [], uu_Tobs: [], uu_I: [], tail: [], rgbExactDiff: [] };
    let nDisk = 0, nBoth = 0, nTail = 0, nSeries = 0, nWien = 0;
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const o = (j * GW + i) * 12;
        const hc = raw[o + 1];
        if (!(hc > 0)) continue;
        nDisk++;
        const r1 = raw[o + 2], g1 = raw[o + 3];
        const gtau = raw[o + 4], gTobs = raw[o + 5], gI = raw[o + 6], glogY = raw[o + 7];
        const gR = [raw[o + 8], raw[o + 9], raw[o + 10]];
        const c = diskPhotometryCPU(cfg, r1, g1); // GPU'nun kendi (r, g_cam)'ı ile
        if (c.Tobs > 1e5) nSeries++;
        if (c.Tobs < 1e3) nWien++;
        if (!(c.I >= 1e-3)) {
          nTail++;
          if (c.ITable >= 1e-12) acc.tail.push(rel(gI, c.ITable)); // kuyrukta yalnız [PORT] (aynı formül); I < 1e-12 ≡ 0 (Wien, f32 alt taşma)
          continue;
        }
        // [PORT]: GPU ↔ CPU(f64, aynı formül)
        acc.tau.push(rel(gtau, c.tauTable));
        acc.Tobs.push(rel(gTobs, g1 * cfg.fCol * cfg.Tmax * c.tauTable));
        acc.I.push(rel(gI, c.ITable));
        acc.logY.push(Math.abs(glogY - c.log10YLut));
        // RGB radyans: GPU (I·rgb, turb=edge=1) ↔ CPU(LUT·ITable); her kanal, tepe bileşene göre göreli
        const rr = c.rgbLut.map((v) => v * c.ITable);
        acc.rgb.push(Math.max(...rr.map((v, k) => Math.abs(gR[k] - v))) / Math.max(...rr));
        // [TABLO]: CPU(tablo+LUT) ↔ CPU(TAM)
        acc.tab_tau.push(Math.abs(c.tauTable - c.tau) / Math.max(c.tau, 1e-30));
        acc.tab_Tobs.push(rel(g1 * cfg.fCol * cfg.Tmax * c.tauTable, c.Tobs));
        acc.tab_I.push(rel(c.ITable, c.I));
        if (c.Tobs >= 1e3) acc.tab_rgb.push(Math.max(...c.rgb0.map((v, k) => Math.abs(v - c.rgbLut[k]))));
        // [U-U]: CPU E32 izinden (r, g_cam)
        const ray = cam.pixelToRay(i, j);
        const res = traceRay(tp, ray, e32);
        if (res.hits.length) {
          nBoth++;
          const cu = diskPhotometryCPU(cfg, res.hits[0].r, res.hits[0].gCam);
          acc.uu_Tobs.push(rel(gTobs, cu.Tobs));
          if (cu.I >= 1e-3) acc.uu_I.push(rel(gI, cu.I));
        }
      }
    }
    const row = {
      setup: S.name, nDisk, nTail, nSeries, nWien, nBoth,
      port: { tau: stats(acc.tau), Tobs: stats(acc.Tobs), I: stats(acc.I), logY: stats(acc.logY), rgb: stats(acc.rgb), tail_I: stats(acc.tail) },
      tablo: { tau: stats(acc.tab_tau), Tobs: stats(acc.tab_Tobs), I: stats(acc.tab_I), rgb: stats(acc.tab_rgb) },
      uu: { Tobs: stats(acc.uu_Tobs), I: stats(acc.uu_I) },
    };
    results.push(row);
    console.log(`━━ ${S.name}   disk pikseli ${nDisk} (I<1e-3 kuyruk: ${nTail}; T_obs>1e5 K: ${nSeries}; T_obs<1e3 K: ${nWien})`);
    console.log('   katman/büyüklük            | medyan     p99        maks       (n)');
    const line = (n, s, unit = '') => console.log(`   ${n.padEnd(26)} | ${f(s.med)}  ${f(s.p99)}  ${f(s.max)}  (${s.n}) ${unit}`);
    line('[PORT]  τ  (göreli)', row.port.tau);
    line('[PORT]  T_obs (göreli)', row.port.Tobs);
    line('[PORT]  I  (göreli)', row.port.I);
    line('[PORT]  log10Y (mutlak)', row.port.logY, 'dex');
    line('[PORT]  RGB radyans (mutlak/tepe)', row.port.rgb);
    line('[PORT]  I kuyruk (1e-12≤I<1e-3)', row.port.tail_I);
    line('[TABLO] τ  (göreli)', row.tablo.tau);
    line('[TABLO] T_obs (göreli)', row.tablo.Tobs);
    line('[TABLO] I  (göreli)', row.tablo.I);
    line('[TABLO] RGB kromatisite (mutlak)', row.tablo.rgb);
    line('[U-U]   T_obs (göreli)', row.uu.Tobs);
    line('[U-U]   I  (göreli)', row.uu.I);
    console.log('');

    const chk = (cond, msg) => { if (!cond) fails.push(`${S.name}: ${msg}`); };
    const ok = (x, lim) => !(x > lim); // NaN (veri yok) geçer; veri yoksa aşağıda ayrıca uyarılır
    chk(nDisk > 200, `disk pikseli çok az (${nDisk})`);
    chk(ok(row.port.tau.med, 1e-5) && ok(row.port.tau.p99, 2e-4), `[PORT] τ med ${f(row.port.tau.med)} p99 ${f(row.port.tau.p99)}`);
    chk(ok(row.port.Tobs.med, 1e-5) && ok(row.port.Tobs.p99, 2e-4), `[PORT] T_obs med ${f(row.port.Tobs.med)} p99 ${f(row.port.Tobs.p99)}`);
    chk(ok(row.port.I.med, 1e-5) && ok(row.port.I.p99, 2e-4), `[PORT] I med ${f(row.port.I.med)} p99 ${f(row.port.I.p99)}`);
    chk(ok(row.port.rgb.med, 1e-5) && ok(row.port.rgb.p99, 2e-4), `[PORT] RGB med ${f(row.port.rgb.med)} p99 ${f(row.port.rgb.p99)}`);
    chk(ok(row.tablo.I.med, 2e-3), `[TABLO] I medyan ${f(row.tablo.I.med)} > 2e-3`);
    chk(ok(row.tablo.Tobs.med, 2e-3), `[TABLO] T_obs medyan ${f(row.tablo.Tobs.med)} > 2e-3`);
    if (S.mode === 'bolometric') chk(row.uu.I.n > 100, '[U-U] karşılaştırılabilir piksel az');
  }
} finally {
  await harness.close();
}

// --- ESTETİK öğe denetimi (fizikle karıştırılmaz; yalnız "makul ve sınırlı mı" sağlık denetimi)
//   kenar yumuşatma: GPU çarpanı ↔ CPU smoothstep formülü;  türbülans: çarpan pozitif, sınırlı, ortalama ≈ 1
{
  const harness2 = await startHarness({ width: 64, height: 48 });
  try {
    const S = SETUPS[0];
    const th = deg(S.th);
    const fovY = 2 * Math.atan(HALF_HEIGHT / S.rCam);
    const fade = 0.1;
    const base = { a: S.a, thetaCam: th, rCam: S.rCam, phiCam: 0, fovY: (fovY * 180) / Math.PI, diskIn: 'isco', diskOut: R_OUT, prograde: true, quality: 'high', maxDiskHits: 1, rEscape: 300, Tmax: S.Tmax, fCol: 1, brightnessMode: 'band', diskTime: 40 };
    // Türbülans ayak izi süzmesi (uCam.x·2tan(fov/2)/H): kaba ızgarada (96×72) tüm oktavlar DOĞRUCA söner ⇒ çarpan ≡ 1; bu yüzden ince ızgara
    const run = (extra, w = GW, h = GH) => harness2.page.evaluate(async (q) => {
      const r = window.__karadelik.renderer;
      r.setParams(q.p);
      return Array.from(await r.renderDebugPhoto(q.w, q.h, { axisGuard: true }));
    }, { p: { ...base, ...extra }, w, h });
    const rIn = iscoRadius(1, S.a, true);
    const w = fade * (R_OUT - rIn);
    const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const rawEdge = await run({ turbulence: false, diskEdgeFade: fade });
    const TW = 384, TH = 288;
    const rawTurb = await run({ turbulence: true, turbulenceAmp: 0.3, diskEdgeFade: 0 }, TW, TH);
    const eErr = [], tv = [];
    for (let k = 0; k < GW * GH; k++) {
      const o = k * 12;
      if (!(rawEdge[o + 1] > 0)) continue;
      eErr.push(Math.abs(rawEdge[o + 11] - (1 - sm(R_OUT - w, R_OUT, rawEdge[o + 2]))));
    }
    for (let k = 0; k < TW * TH; k++) if (rawTurb[k * 12 + 1] > 0) tv.push(rawTurb[k * 12 + 11]);
    const mean = tv.reduce((a, b) => a + b, 0) / tv.length;
    const sd = Math.sqrt(tv.reduce((a, b) => a + (b - mean) ** 2, 0) / tv.length);
    const eS = stats(eErr);
    console.log(`[ESTETİK] kenar yumuşatma (fade=${fade}): GPU çarpanı ↔ CPU smoothstep: maks |Δ| ${f(eS.max)} (n=${eS.n})`);
    console.log(`[ESTETİK] türbülans çarpanı (amp=0.3, ${TW}×${TH} ızgara, ${tv.length} disk pikseli): ortalama ${mean.toFixed(3)}, σ ${sd.toFixed(3)}, min ${Math.min(...tv).toFixed(3)}, maks ${Math.max(...tv).toFixed(3)}\n`);
    if (!(eS.max < 1e-5)) fails.push(`ESTETİK kenar yumuşatma GPU↔CPU maks ${f(eS.max)}`);
    if (!(sd > 0.02 && Math.min(...tv) > 0.05 && Math.max(...tv) < 20 && Math.abs(mean - 1) < 0.25)) fails.push(`ESTETİK türbülans çarpanı makul aralıkta değil (ort ${mean.toFixed(3)}, min ${Math.min(...tv).toFixed(3)}, maks ${Math.max(...tv).toFixed(3)})`);
    harness.errors.push(...harness2.errors);
  } finally {
    await harness2.close();
  }
}
console.log('Konsol uyarı/hata (tarayıcı):', harness.errors.length === 0 ? 'YOK' : '\n' + harness.errors.join('\n'));
if (harness.errors.length) fails.push('tarayıcı konsolunda hata/uyarı');
console.log(`Toplam süre ${((Date.now() - T0) / 1000).toFixed(1)} s`);
if (argv.json) fs.writeFileSync(String(argv.json), JSON.stringify({ results }, null, 1));
if (fails.length) {
  console.log('\nFOTOMETRİ DOĞRULAMASI: BAŞARISIZ');
  for (const m of fails) console.log('  ✗ ' + m);
  process.exitCode = 1;
} else {
  console.log('\nFOTOMETRİ DOĞRULAMASI: GEÇTİ');
}
