/**
 * GPU ↔ CPU piksel piksel doğrulama (Adım 4a). `node --test` ile çalışmaz; elle çalıştır:
 *
 *     node tests/render/gpu-validate.mjs [--grid=96x72] [--quick] [--json=çıktı.json]
 *
 * Her kurulumda aynı kamera/parametrelerle üç sonuç karşılaştırılır:
 *   GPU  : src/shaders (SwiftShader'da gerçek f32), renderer.renderDebug
 *   E32  : CPU float32 ÖYKÜNMESİ  traceRay({integrator:'rk4', precision:'f32', form:'hamilton', kappa, maxSteps,
 *          crossing:'hermite'})  — shader'ın birebir portu olduğu algoritma
 *   R64  : CPU float64 DP5(4) referansı (rtol 1e-10) — doğruluk kaynağı
 * Raporlanan çiftler: GPU–E32 (port doğruluğu), GPU–R64 (nihai doğruluk), E32–R64 (taban çizgisi: f32+RK4 kesme hatası).
 *
 * Sınıf kuralı (shader sınıfı): status 'maxSteps' ise analitik fate ('captured' | 'escaped'); NaN ise 'captured'.
 * Çıkış kodu: tüm kabul eşikleri sağlanırsa 0, aksi halde 1 (eşikler README'de gerekçelendirilmiştir).
 */
import fs from 'node:fs';
import { createCamera } from '../../src/math/camera.js';
import { traceRay, recommendedGpuBudget } from '../../src/math/raytracer.js';
import { startHarness } from './harness.mjs';

const deg = (d) => (d * Math.PI) / 180;

// ---------------------------------------------------------------- argümanlar
const argv = Object.fromEntries(
  process.argv.slice(2).map((s) => {
    const m = s.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [s, true];
  }),
);
const [GW0, GH0] = String(argv.grid ?? '96x72').split('x').map(Number);
if (!(GW0 >= 64 && GH0 >= 48)) throw new Error('ızgara en az 64x48 olmalı');

// ---------------------------------------------------------------- kurulumlar
const R_OUT = 20;
const R_ESC = 300; // GPU 'auto' = max(300, 2 r_cam) ile aynı (r_cam ≤ 150)
const HALF_HEIGHT = 14; // ekran dikey yarı-yüksekliği ≈ 14 M (math/README §7 çalışmasıyla aynı)

/**
 * grid: [W,H] (varsayılan --grid); odd=true ⇒ tek sayılı ızgara: merkez sütun x=0 (L=0 eksen yolu) ve merkez satır y=0 vardır.
 * quality: 'mobile' ⇒ κ=0.10, N=256 (CPU E32 de aynı κ,N ile çalışır); info: true ⇒ eşik uygulanmaz, yalnız raporlanır.
 * noCeil: GPU–R64 mutlak tavanları (README §7 κ=0.05 ölçümlerine dayanır) uygulanmaz.
 */
const SETUPS = [
  { name: 'A  a=0.9   θ=75°  r=50', a: 0.9, thetaDeg: 75, rCam: 50 },
  { name: 'B  a=0.998 θ=60°  r=50', a: 0.998, thetaDeg: 60, rCam: 50 },
  { name: 'C  a=0     θ=85°  r=30', a: 0, thetaDeg: 85, rCam: 30 },
  { name: 'D  a=0.9   θ=π/2  r=30 (tam θ=π/2)', a: 0.9, thetaDeg: 90, rCam: 30, control: 'planeGuard' },
  { name: 'E  a=0.9   θ=75°  r=50 maxHits=3', a: 0.9, thetaDeg: 75, rCam: 50, maxDiskHits: 3 },
  { name: 'F  a=0.9   θ=75°  r=50 retrograd', a: 0.9, thetaDeg: 75, rCam: 50, prograde: false },
  { name: 'G  a=0.9   θ=75°  r=50 tek-ızgara (L=0 merkez sütunu)', a: 0.9, thetaDeg: 75, rCam: 50, odd: true },
  { name: 'H  a=0.9   θ=10°  r=50 tek-ızgara (kutba yakın kamera)', a: 0.9, thetaDeg: 10, rCam: 50, odd: true },
  { name: 'I  a=0.9   θ=75°  r=50 mobile (κ=0.10, N=256)', a: 0.9, thetaDeg: 75, rCam: 50, quality: 'mobile', noCeil: true },
  { name: 'J  a=0.9   θ=75°  r=200 [BİLGİ: büyük r_cam, eşiksiz]', a: 0.9, thetaDeg: 75, rCam: 200, info: true },
];
const SETUPS_RUN = argv.quick ? SETUPS.slice(0, 2) : SETUPS;

// ---------------------------------------------------------------- kabul eşikleri
// İKİ KATMAN (gerekçe: src/render/README.md "GPU doğrulama"):
//  (1) GPU–E32 — PORT DOĞRULUĞU, MUTLAK eşikler. İkisi de aynı algoritmayı (aynı κ, N, Hermite, f32) çalıştırır; fark yalnızca
//      yuvarlama sırası / sin-cos / bölme gerçeklemesidir. Kesme hatası (~1e-5, E32–R64 medyanı) ORTAKTIR ve farkta çıkar; geriye
//      f32 gürültüsü kalır. Bu gürültü yalnız kritik eğri / disk kenarı yakınındaki pikselleri çevirebilir (alan oranı ≲ 1e-3).
//  (2) GPU–R64 — NİHAİ DOĞRULUK, aynı koşunun E32–R64 TABAN ÇİZGİSİNE göreli: GPU, "README'nin beklediği f32+RK4" düzeyinden
//      kötü olmamalı (≤ 2× taban + küçük taban değer). Ayrıca README §7 ölçümlerinden (a=0.9/75°: uyuşmazlık %0.5, Δr medyan
//      1.4e-5) ~3× marjlı mutlak tavanlar.
const THRESH = {
  e32: {
    mismatchRate: 0.002,
    hitCountMismatchRate: 0.002,
    nLabelMismatchRate: 0.002,
    drMed: 2e-5, drP99: 5e-3,
    dgMed: 1e-5, dgP99: 2e-4,
    ddirMed: 1e-5, ddirP99: 1e-3,
    stepSameRate: 0.98,
  },
  r64: {
    factor: 2.0,
    mismatchFloor: 0.002, // uyuşmazlık: ≤ E32–R64 + %0.2
    drMedFloor: 2e-6, dgMedFloor: 1e-7, ddirMedFloor: 2e-6, ddirP99Floor: 1e-4,
    mismatchCeil: 0.015, drMedCeil: 1e-4, dgMedCeil: 1e-4,
  },
};

// ---------------------------------------------------------------- yardımcılar
const cls = (r) => (r.status === 'maxSteps' ? (r.reason === 'budget' && r.fate ? r.fate : 'captured') : r.status);
const CLS_NAME = ['captured', 'escaped', 'disk'];

function quantile(sorted, p) {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
function stats(v) {
  const s = [...v].sort((x, y) => x - y);
  return { n: s.length, med: quantile(s, 0.5), p90: quantile(s, 0.9), p99: quantile(s, 0.99), max: s.length ? s[s.length - 1] : NaN };
}
const f = (x, d = 2) => (Number.isFinite(x) ? x.toExponential(d) : '  n/a  ');
const pct = (x) => (100 * x).toFixed(2) + '%';
function angleBetween(t1, p1, t2, p2) {
  const u = [Math.sin(t1) * Math.cos(p1), Math.sin(t1) * Math.sin(p1), Math.cos(t1)];
  const w = [Math.sin(t2) * Math.cos(p2), Math.sin(t2) * Math.sin(p2), Math.cos(t2)];
  // atan2(|u×w|, u·w): küçük açılarda acos'tan kesin
  const cx = u[1] * w[2] - u[2] * w[1], cy = u[2] * w[0] - u[0] * w[2], cz = u[0] * w[1] - u[1] * w[0];
  return Math.atan2(Math.hypot(cx, cy, cz), u[0] * w[0] + u[1] * w[1] + u[2] * w[2]);
}
const dphi = (a, b) => {
  let d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
};

/** CPU sonucunu GPU debug alanlarıyla aynı biçime indirger. */
function cpuView(r) {
  const h = r.hits;
  return {
    cls: cls(r),
    steps: r.steps,
    hitCount: h.length,
    r1: h[0]?.r ?? NaN,
    g1: h[0]?.gCam ?? NaN,
    n1: h[0]?.n ?? 0,
    phi1: h[0]?.phi ?? NaN,
    esc: r.escape ? [r.escape.theta, r.escape.phi] : null,
  };
}

/** Karşılaştırma: A (aday) − B (referans). */
function compare(A, B, nPix) {
  let mismatch = 0, hitCountMismatch = 0, nBothDisk = 0, stepSame = 0;
  const dr = [], dg = [], dp = [], ddir = [], dsteps = [], mism = [];
  for (let k = 0; k < nPix; k++) {
    const a = A[k], b = B[k];
    if (a.cls !== b.cls) { mismatch++; mism.push(k); }
    if (a.hitCount !== b.hitCount) hitCountMismatch++;
    if (a.hitCount >= 1 && b.hitCount >= 1) {
      nBothDisk++;
      dr.push(Math.abs(a.r1 - b.r1));
      dg.push(Math.abs(a.g1 / b.g1 - 1));
      dp.push(dphi(a.phi1, b.phi1));
    }
    if (a.esc && b.esc) ddir.push(angleBetween(a.esc[0], a.esc[1], b.esc[0], b.esc[1]));
    if (a.steps === b.steps) stepSame++;
    dsteps.push(Math.abs(a.steps - b.steps));
  }
  return {
    mismatch, mismatchRate: mismatch / nPix, hitCountMismatch, hitCountMismatchRate: hitCountMismatch / nPix,
    nBothDisk, dr: stats(dr), dg: stats(dg), dphi: stats(dp), ddir: stats(ddir),
    stepSameRate: stepSame / nPix, dsteps: stats(dsteps), mism,
  };
}

// ---------------------------------------------------------------- çalıştırma
const harness = await startHarness({ width: 64, height: 48 });
const results = [];
let failed = false;
const fails = [];
const t0 = Date.now();

try {
  const info = await harness.page.evaluate(() => {
    const gl = window.__karadelik.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      floatRT: !!gl.getExtension('EXT_color_buffer_float'),
      maxDrawBuffers: gl.getParameter(gl.MAX_DRAW_BUFFERS),
    };
  });
  console.log(`GPU: ${info.renderer} | ${info.version} | EXT_color_buffer_float=${info.floatRT} | MAX_DRAW_BUFFERS=${info.maxDrawBuffers}`);
  console.log(`Izgara ${GW0}x${GH0} (tek-ızgara kurulumlarda +1) · κ=0.05 N=recommendedGpuBudget · r_out=${R_OUT} · r_esc=${R_ESC} · maxDiskHits=1 (aksi belirtilmedikçe)\n`);

  for (const S of SETUPS_RUN) {
    const GW = S.odd && GW0 % 2 === 0 ? GW0 + 1 : GW0;
    const GH = S.odd && GH0 % 2 === 0 ? GH0 + 1 : GH0;
    const th = deg(S.thetaDeg);
    const prograde = S.prograde ?? true;
    const maxDiskHits = S.maxDiskHits ?? 1;
    const fovY = 2 * Math.atan(HALF_HEIGHT / S.rCam); // radyan
    const mobile = S.quality === 'mobile';
    const budget = mobile ? { kappa: 0.1, maxSteps: 256 } : recommendedGpuBudget(S.a, true);

    // --- GPU
    const tg = Date.now();
    const raw = await harness.page.evaluate(async (q) => {
      const r = window.__karadelik.renderer;
      r.setParams(q.params);
      const gp = r.getParams();
      const t = performance.now();
      const d = await r.renderDebug(q.w, q.h);
      return { data: Array.from(d), ms: performance.now() - t, gp };
    }, {
      params: {
        a: S.a, thetaCam: th, rCam: S.rCam, phiCam: 0, fovY: (fovY * 180) / Math.PI, diskIn: 'isco', diskOut: R_OUT,
        prograde, quality: mobile ? 'mobile' : 'high', maxDiskHits, analyticFate: true, rEscape: R_ESC, planeGuard: true,
      },
      w: GW, h: GH,
    });
    const gpuMs = raw.ms;
    const D = raw.data;
    const nPix = GW * GH;
    const gpu = new Array(nPix);
    for (let k = 0; k < nPix; k++) {
      const o = k * 12;
      const st = CLS_NAME[D[o]];
      const hc = D[o + 7];
      gpu[k] = {
        cls: st, steps: D[o + 3], hitCount: hc, r1: hc ? D[o + 1] : NaN, g1: hc ? D[o + 2] : NaN, n1: D[o + 6],
        phi1: hc ? D[o + 9] : NaN, reason: D[o + 8], esc: D[o + 4] >= 0 ? [D[o + 4], D[o + 5]] : null,
        r2: D[o + 10], g2: D[o + 11],
      };
    }

    // --- CPU: kamera piksel ızgarası (GPU ile aynı fovY / en-boy)
    const cam = createCamera({ a: S.a, rCam: S.rCam, thetaCam: th, phiCam: 0, fovY, width: GW, height: GH });
    const params = { a: S.a, rOut: R_OUT, prograde };
    const e32 = new Array(nPix), r64 = new Array(nPix);
    const e32Opts = {
      integrator: 'rk4', precision: 'f32', form: 'hamilton', kappa: budget.kappa, maxSteps: budget.maxSteps,
      crossing: 'hermite', rEscape: R_ESC, maxDiskHits,
    };
    const r64Opts = { rtol: 1e-10, atol: 1e-12, maxDiskHits };
    const tc = Date.now();
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const ray = cam.pixelToRay(i, j);
        e32[j * GW + i] = cpuView(traceRay(params, ray, e32Opts));
        r64[j * GW + i] = cpuView(traceRay(params, ray, r64Opts));
      }
    }
    const cpuMs = Date.now() - tc;

    const gE = compare(gpu, e32, nPix);
    const gR = compare(gpu, r64, nPix);
    const eR = compare(e32, r64, nPix);

    // sınıf sayıları
    const count = (arr, c) => arr.filter((x) => x.cls === c).length;
    const stepsMeanGpu = gpu.reduce((s, x) => s + x.steps, 0) / nPix;
    const stepsMaxGpu = Math.max(...gpu.map((x) => x.steps));
    const nBudget = gpu.filter((x) => x.reason === 1).length;
    const nNaN = gpu.filter((x) => x.reason === 2).length;
    const nCamRadiusHit = gpu.filter((x) => x.hitCount > 0 && Math.abs(x.r1 - S.rCam) < 0.05).length;

    // n etiketi uyuşmazlığı (n1)
    let nMismatch = 0;
    for (let k = 0; k < nPix; k++) if (gpu[k].hitCount && e32[k].hitCount && gpu[k].n1 !== e32[k].n1) nMismatch++;
    // ikinci vuruş (maxDiskHits>1)
    const r2d = [], g2d = [];
    if (maxDiskHits > 1) {
      // CPU ikinci vuruşu için yeniden izle (cpuView yalnız ilk vuruşu saklıyor)
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const k = j * GW + i;
        if (gpu[k].hitCount >= 2) {
          const res = traceRay(params, cam.pixelToRay(i, j), e32Opts);
          if (res.hits.length >= 2) {
            r2d.push(Math.abs(gpu[k].r2 - res.hits[1].r));
            g2d.push(Math.abs(gpu[k].g2 / res.hits[1].gCam - 1));
          }
        }
      }
    }

    // bütçesi biten ışınların ANALİTİK sınıflaması (reason = 1): GPU f32 vs CPU f32/f64
    let budgetVsR64 = 0, budgetVsE32 = 0, budgetE32VsR64 = 0, nBudgetCaptured = 0;
    for (let k = 0; k < nPix; k++) {
      if (gpu[k].reason !== 1) continue;
      if (gpu[k].cls === 'captured') nBudgetCaptured++;
      if (gpu[k].cls !== r64[k].cls) budgetVsR64++;
      if (gpu[k].cls !== e32[k].cls) budgetVsE32++;
      if (e32[k].cls !== r64[k].cls) budgetE32VsR64++;
    }

    // L = 0 eksen yolu (tek-ızgara: merkez sütun x = 0 ⇒ Lraw = −0 ⇒ L = 0, kutuptan geçebilir)
    let axis = null;
    if (S.odd) {
      const ic = (GW - 1) / 2;
      let mm = 0, dmax = 0, nEsc = 0, nAxisCross = 0;
      for (let j = 0; j < GH; j++) {
        const k = j * GW + ic;
        if (gpu[k].cls !== e32[k].cls) mm++;
        if (gpu[k].esc && e32[k].esc) { nEsc++; dmax = Math.max(dmax, angleBetween(gpu[k].esc[0], gpu[k].esc[1], e32[k].esc[0], e32[k].esc[1])); }
        // kutuptan geçen ışın: kaçış φ'si kamera meridyeninden π kadar kaymış (φ_cam=0 ⇒ φ_∞ ≈ π)
        if (gpu[k].esc && Math.abs(Math.cos(gpu[k].esc[1]) + 1) < 0.5) nAxisCross++;
      }
      axis = { column: GH, mismatch: mm, escCompared: nEsc, escMaxErr: dmax, escapedWithPhiNearPi: nAxisCross };
    }

    // NEGATİF KONTROL — θ_cam = π/2 bant koruması kapalı: sahte kesişim GPU'da gerçekten oluşuyor mu?
    let control = null;
    if (S.control === 'planeGuard') {
      const raw2 = await harness.page.evaluate(async (q) => {
        const r = window.__karadelik.renderer;
        r.setParams({ ...q.params, planeGuard: false });
        const d = await r.renderDebug(q.w, q.h);
        r.setParams({ planeGuard: true });
        return Array.from(d);
      }, {
        params: {
          a: S.a, thetaCam: th, rCam: S.rCam, phiCam: 0, fovY: (fovY * 180) / Math.PI, diskIn: 'isco', diskOut: R_OUT,
          prograde, quality: 'high', maxDiskHits, analyticFate: true, rEscape: R_ESC,
        },
        w: GW, h: GH,
      });
      const e32off = [];
      const e32OffOpts = { ...e32Opts, planeEps: 0 };
      let nNlabel = 0, nHit = 0, nCpuNlabel = 0, nCpuHit = 0, nAgree = 0;
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const k = j * GW + i;
        const o = k * 12;
        const offHit = raw2[o + 7], offN = raw2[o + 6];
        if (offHit !== gpu[k].hitCount) nHit++;
        if (offHit && gpu[k].hitCount && offN !== gpu[k].n1) nNlabel++;
        const c = cpuView(traceRay(params, cam.pixelToRay(i, j), e32OffOpts));
        if (c.hitCount !== e32[k].hitCount) nCpuHit++;
        if (c.hitCount && e32[k].hitCount && c.n1 !== e32[k].n1) nCpuNlabel++;
        if (c.hitCount === offHit && (c.hitCount === 0 || c.n1 === offN)) nAgree++;
      }
      control = { gpuOff_vs_on_hitCountChanged: nHit, gpuOff_vs_on_nLabelChanged: nNlabel, cpuOff_vs_on_hitCountChanged: nCpuHit, cpuOff_vs_on_nLabelChanged: nCpuNlabel, gpuOffVsCpuOff_agreeRate: nAgree / nPix };
    }

    const row = {
      setup: S.name, grid: [GW, GH], budget, gpuMs, cpuMs, budgetRays: { n: nBudget, captured: nBudgetCaptured, vsR64Mismatch: budgetVsR64, vsE32Mismatch: budgetVsE32, e32VsR64Mismatch: budgetE32VsR64 }, axis, control,
      classes: { captured: count(gpu, 'captured'), escaped: count(gpu, 'escaped'), disk: count(gpu, 'disk') },
      cpuClassesR64: { captured: count(r64, 'captured'), escaped: count(r64, 'escaped'), disk: count(r64, 'disk') },
      stepsMeanGpu, stepsMaxGpu, nBudget, nNaN, nCamRadiusHit, nMismatch,
      gE: strip(gE), gR: strip(gR), eR: strip(eR),
      secondHit: maxDiskHits > 1 ? { n: r2d.length, dr: stats(r2d), dg: stats(g2d) } : null,
      mismatchPixels: { gpuVsE32: gE.mism.slice(0, 40), gpuVsR64: gR.mism.slice(0, 40) },
    };
    results.push(row);

    // --- yazdır
    console.log(`━━ ${S.name}  (N=${budget.maxSteps}, κ=${budget.kappa})  GPU ${gpuMs.toFixed(0)} ms · CPU(E32+R64) ${cpuMs} ms`);
    console.log(`   GPU sınıfları: yakalandı ${row.classes.captured} · kaçtı ${row.classes.escaped} · disk ${row.classes.disk}   | R64: ${row.cpuClassesR64.captured}/${row.cpuClassesR64.escaped}/${row.cpuClassesR64.disk}`);
    console.log(`   adım ort/maks (GPU): ${stepsMeanGpu.toFixed(1)}/${stepsMaxGpu} · bütçe biten ${nBudget} · NaN ${nNaN} · r≈r_cam'de sahte vuruş ${nCamRadiusHit}`);
    console.log('   çift        | uyuşmaz. (n)  | vuruş-say. | n-etiket | Δr med / p99 / maks       | ΔgCam(göreli) med / p99 / maks | kaçış yönü Δ(rad) med / p99 / maks | adım==');
    printPair('GPU–E32', gE, row.nMismatch);
    printPair('GPU–R64', gR, null);
    printPair('E32–R64', eR, null);
    if (row.secondHit) {
      console.log(`   2. vuruş (GPU–E32, n=${row.secondHit.n}): Δr med/p99/maks ${f(row.secondHit.dr.med)}/${f(row.secondHit.dr.p99)}/${f(row.secondHit.dr.max)} · Δg ${f(row.secondHit.dg.med)}/${f(row.secondHit.dg.p99)}/${f(row.secondHit.dg.max)}`);
    }
    if (nBudget > 0) console.log(`   bütçesi biten ${nBudget} ışın (analitik fate): yakalandı ${nBudgetCaptured}, kaçtı ${nBudget - nBudgetCaptured} · sınıf uyuşmazlığı GPU–E32 ${budgetVsE32} · GPU–R64 ${budgetVsR64} (taban E32–R64 ${budgetE32VsR64})`);
    if (axis) console.log(`   merkez sütun (L=0 eksen yolu, ${axis.column} piksel): sınıf uyuşmazlığı GPU–E32 ${axis.mismatch} · kaçış yönü maks hata ${f(axis.escMaxErr)} rad (${axis.escCompared} piksel) · φ_∞≈π (kutuptan geçen) ${axis.escapedWithPhiNearPi}`);
    if (control) console.log(`   NEGATİF KONTROL (planeGuard KAPALI): GPU vuruş sayısı değişen ${control.gpuOff_vs_on_hitCountChanged}, n-etiketi değişen ${control.gpuOff_vs_on_nLabelChanged} piksel | CPU(planeEps=0) ${control.cpuOff_vs_on_hitCountChanged}/${control.cpuOff_vs_on_nLabelChanged} | GPU(kapalı)↔CPU(kapalı) uyum ${pct(control.gpuOffVsCpuOff_agreeRate)}`);
    console.log('');

    // --- kabul eşikleri
    const T1 = THRESH.e32, T2 = THRESH.r64;
    const mismCeil = S.noCeil ? Infinity : T2.mismatchCeil, drCeil = S.noCeil ? Infinity : T2.drMedCeil, dgCeil = S.noCeil ? Infinity : T2.dgMedCeil;
    const chk = (cond, msg) => { if (!cond && !S.info) { fails.push(`${S.name}: ${msg}`); failed = true; } };
    const le = (x, lim) => !(x > lim); // NaN (veri yok) başarısız sayılmaz
    chk(gE.mismatchRate <= T1.mismatchRate, `GPU–E32 sınıf uyuşmazlığı ${pct(gE.mismatchRate)} > ${pct(T1.mismatchRate)}`);
    chk(gE.hitCountMismatchRate <= T1.hitCountMismatchRate, `GPU–E32 vuruş sayısı uyuşmazlığı ${pct(gE.hitCountMismatchRate)}`);
    chk(nMismatch / nPix <= T1.nLabelMismatchRate, `GPU–E32 n-etiketi uyuşmazlığı ${nMismatch}`);
    chk(le(gE.dr.med, T1.drMed), `GPU–E32 medyan Δr ${f(gE.dr.med)} > ${f(T1.drMed)}`);
    chk(le(gE.dr.p99, T1.drP99), `GPU–E32 p99 Δr ${f(gE.dr.p99)} > ${f(T1.drP99)}`);
    chk(le(gE.dg.med, T1.dgMed), `GPU–E32 medyan ΔgCam ${f(gE.dg.med)} > ${f(T1.dgMed)}`);
    chk(le(gE.dg.p99, T1.dgP99), `GPU–E32 p99 ΔgCam ${f(gE.dg.p99)} > ${f(T1.dgP99)}`);
    chk(le(gE.ddir.med, T1.ddirMed), `GPU–E32 medyan kaçış yönü ${f(gE.ddir.med)} > ${f(T1.ddirMed)}`);
    chk(le(gE.ddir.p99, T1.ddirP99), `GPU–E32 p99 kaçış yönü ${f(gE.ddir.p99)} > ${f(T1.ddirP99)}`);
    chk(gE.stepSameRate >= T1.stepSameRate, `GPU–E32 adım sayısı aynı oranı ${pct(gE.stepSameRate)} < ${pct(T1.stepSameRate)}`);
    chk(gR.mismatchRate <= Math.min(mismCeil, eR.mismatchRate + T2.mismatchFloor), `GPU–R64 uyuşmazlık ${pct(gR.mismatchRate)} (taban E32–R64 ${pct(eR.mismatchRate)})`);
    chk(le(gR.dr.med, Math.min(drCeil, T2.factor * eR.dr.med + T2.drMedFloor)), `GPU–R64 medyan Δr ${f(gR.dr.med)} (taban ${f(eR.dr.med)})`);
    chk(le(gR.dg.med, Math.min(dgCeil, T2.factor * eR.dg.med + T2.dgMedFloor)), `GPU–R64 medyan ΔgCam ${f(gR.dg.med)} (taban ${f(eR.dg.med)})`);
    chk(le(gR.ddir.med, T2.factor * eR.ddir.med + T2.ddirMedFloor), `GPU–R64 medyan kaçış yönü ${f(gR.ddir.med)} (taban ${f(eR.ddir.med)})`);
    chk(le(gR.ddir.p99, T2.factor * eR.ddir.p99 + T2.ddirP99Floor), `GPU–R64 p99 kaçış yönü ${f(gR.ddir.p99)} (taban ${f(eR.ddir.p99)})`);
    chk(nNaN === 0, `${nNaN} piksel NaN`);
    chk(nCamRadiusHit === 0, `${nCamRadiusHit} sahte vuruş r≈r_cam`);
    // analitik fate: port doğruluğu GPU–E32 (f32 ↔ f32/f64 hasTurningPointBelow) ve R64'e göre taban çizgisinden kötü olmama
    chk(budgetVsE32 <= Math.ceil(0.02 * nBudget), `bütçesi biten ışınlarda GPU–E32 sınıf uyuşmazlığı ${budgetVsE32}/${nBudget}`);
    chk(budgetVsR64 <= budgetE32VsR64 + Math.ceil(0.02 * nBudget), `bütçesi biten ışınlarda GPU–R64 uyuşmazlığı ${budgetVsR64} > taban ${budgetE32VsR64} + marj`);
    if (axis) chk(axis.mismatch === 0 && le(axis.escMaxErr, 1e-3), `merkez sütun (L=0): uyuşmazlık ${axis.mismatch}, kaçış yönü maks ${f(axis.escMaxErr)}`);
    if (control) {
      chk(control.gpuOff_vs_on_nLabelChanged + control.gpuOff_vs_on_hitCountChanged > 0, 'negatif kontrol: koruma kapalıyken GPU çıktısı DEĞİŞMEDİ (koruma sınanamadı)');
      chk(control.gpuOffVsCpuOff_agreeRate >= 0.98, `negatif kontrol: GPU(kapalı)↔CPU(kapalı) uyum ${pct(control.gpuOffVsCpuOff_agreeRate)} < %98`);
    }
  }
} finally {
  await harness.close();
}

function strip(c) { const { mism, ...rest } = c; return rest; }
function printPair(name, c, nMis) {
  console.log(
    `   ${name.padEnd(10)}  | ${pct(c.mismatchRate).padStart(7)} (${String(c.mismatch).padStart(3)}) | ${String(c.hitCountMismatch).padStart(4)}       | ${nMis === null ? '   –   ' : String(nMis).padStart(5) + '  '}  | ${f(c.dr.med)} / ${f(c.dr.p99)} / ${f(c.dr.max)} | ${f(c.dg.med)} / ${f(c.dg.p99)} / ${f(c.dg.max)}     | ${f(c.ddir.med)} / ${f(c.ddir.p99)} / ${f(c.ddir.max)}     | ${pct(c.stepSameRate)}`,
  );
}

console.log('Konsol uyarı/hata (tarayıcı):', harness.errors.length === 0 ? 'YOK' : '\n' + harness.errors.join('\n'));
if (harness.errors.length) { failed = true; fails.push('tarayıcı konsolunda hata/uyarı'); }
console.log(`\nToplam süre ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (argv.json) fs.writeFileSync(String(argv.json), JSON.stringify({ thresholds: THRESH, results }, null, 1));
if (failed) {
  console.log('\nKABUL EŞİKLERİ: BAŞARISIZ');
  for (const m of fails) console.log('  ✗ ' + m);
  process.exitCode = 1;
} else {
  console.log('\nKABUL EŞİKLERİ: GEÇTİ');
}
