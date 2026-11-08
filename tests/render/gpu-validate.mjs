/**
 * GPU ↔ CPU piksel piksel doğrulama (Adım 4a, 4b-düzeltme). `node --test` ile çalışmaz; elle çalıştır:
 *
 *     node tests/render/gpu-validate.mjs [--grid=96x72] [--quick] [--json=çıktı.json] [--selftest-noguard]
 *
 *   --selftest-noguard: üretim yolunu BİLEREK korumasız yapar (params.axisGuard=false); betiğin kırmızıya döndüğünü (Ö1/Ö2 gerilemesini
 *   yakaladığını) göstermek içindir — çıkış kodu 1 beklenir.
 *
 * Her kurulumda aynı kamera/parametrelerle şu sonuçlar karşılaştırılır:
 *   GPU  : src/shaders (SwiftShader'da gerçek f32), renderer.renderDebug — ÜRETİM YOLU: seçenek verilmez, eksen koruması görsel
 *          modla aynı (params.axisGuard = true, κ_a = AXIS_KAPPA). Port sınaması için ayrıca {axisGuard:false} ikinci geçişi.
 *   E32  : CPU float32 ÖYKÜNMESİ  traceRay({integrator:'rk4', precision:'f32', form:'hamilton', kappa, maxSteps, crossing:'hermite'})
 *          — shader'ın birebir portu olduğu algoritma; eksen koruması CPU varsayılanı (açık). İkinci geçişte {axisGuard:false}.
 *   R64  : CPU float64 DP5(4) referansı (rtol 1e-10, rEscape = GPU ile aynı) — doğruluk kaynağı (E32'den BAĞIMSIZ)
 * Katmanlar:
 *   [PORT-ÜRETİM]  GPU(koruma açık) ↔ E32(açık)     MUTLAK port eşikleri (yuvarlama/sin-cos farkı)
 *   [PORT-4a]      GPU({axisGuard:false}) ↔ E32({axisGuard:false})  aynı eşikler (4a'nın korumasız birebir portu hâlâ doğru mu)
 *   [NİHAİ]        GPU(koruma açık) ↔ R64            MUTLAK eşikler (E32 taban çizgisine bağlı DEĞİL): sınıf uyuşmazlığı, Δr p99, ΔgCam p99, kaçış yönü p99
 *   [UZAMSAL]      GPU(açık) ↔ R64 uyuşmazlıklarının haritası: merkez sütun bandında (|i−i_c| ≤ 6) ≥2 uyuşmazlık ya da herhangi bir 5×5 blokta
 *                  ≥2 uyuşmazlık = kümelenme = BAŞARISIZ (eksen kusuru böyle görünür; rastgele tek kritik-eğri çevirmeleri kümelenmez)
 *   [κ_a]          GPU'ya yüklenen κ_a = CPU E32 kappaAxis (guard-assert.mjs)
 * E32–R64 yalnız BİLGİdir (f32+RK4 kesme hatası taban çizgisi); kabul koşulu DEĞİLDİR.
 *
 * Sınıf kuralı (shader sınıfı): status 'maxSteps' ise analitik fate ('captured' | 'escaped'); NaN ise 'captured'.
 * Çıkış kodu: tüm kabul eşikleri sağlanırsa 0, aksi halde 1 (eşikler README §8.1'de gerekçelendirilmiştir).
 */
import fs from 'node:fs';
import { createCamera } from '../../src/math/camera.js';
import { traceRay, recommendedGpuBudget } from '../../src/math/raytracer.js';
import { startHarness } from './harness.mjs';
import { checkAxisKappa } from './guard-assert.mjs';
import { DEFAULT_PARAMS } from '../../src/render/params.js';

const deg = (d) => (d * Math.PI) / 180;

// ---------------------------------------------------------------- argümanlar
const argv = Object.fromEntries(
  process.argv.slice(2).map((s) => {
    const m = s.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [s, true];
  }),
);
const [GW0, GH0] = String(argv.grid ?? '96x72').split('x').map(Number);
// 4c: adım kuralı (GPU params.stepRule ↔ CPU E32 stepRule AYNI olmalı; R64 adım kuralından bağımsızdır). Varsayılan = renderer varsayılanı.
const STEP_RULE = String(argv.steprule ?? DEFAULT_PARAMS.stepRule);
if (!(GW0 >= 64 && GH0 >= 48)) throw new Error('ızgara en az 64x48 olmalı');

// ---------------------------------------------------------------- kurulumlar
const R_OUT = 20;
const R_ESC = 300; // GPU 'auto' = max(300, 2 r_cam) ile aynı (r_cam ≤ 150)
const HALF_HEIGHT = 14; // ekran dikey yarı-yüksekliği ≈ 14 M (math/README §7 çalışmasıyla aynı)

/**
 * grid: [W,H] (varsayılan --grid); odd=true ⇒ tek sayılı ızgara: merkez sütun x=0 (L=0 eksen yolu) ve merkez satır y=0 vardır.
 * quality: 'mobile' ⇒ κ=0.10, N=256 (CPU E32 de aynı κ,N ile çalışır); info: true ⇒ eşik uygulanmaz, yalnız raporlanır.
 * abs / port: o kurulum için MUTLAK [NİHAİ] / [PORT] eşiklerinin gerekçeli geçersiz kılmaları (README §8.1):
 *   I (mobile): κ=0.10 kesme hatası ΔgCam p99'u ~7× büyütür (E32–R64 aynı 1.3e-4) ⇒ 3e-4.
 *   L (θ=179°): f32 θ'nın π yakınında ulp'si 2.4e-7 ⇒ sinθ_cam=0.017 için göreli 1.4e-5; GPU ve E32 sinCos'u θ'yı 1 ulp farklı
 *   yuvarlayabilir ⇒ GPU–E32 medyan Δr 2.4e-5 (kuzey kutbunda 2.2e-6): port medyan eşiği 5e-5. (README §12, K1: bilinen sınır.)
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
  { name: 'I  a=0.9   θ=75°  r=50 mobile (κ=0.10, N=256)', a: 0.9, thetaDeg: 75, rCam: 50, quality: 'mobile', abs: { dgP99: 3e-4 } },
  { name: 'J  a=0.9   θ=75°  r=200 [BİLGİ: büyük r_cam, eşiksiz]', a: 0.9, thetaDeg: 75, rCam: 200, info: true },
  // --- kutba yakın kurulumlar (denetim Ö2.5)
  { name: 'K  a=0.9   θ=1°   r=50 tek-ızgara (kuzey kutbuna 1°)', a: 0.9, thetaDeg: 1, rCam: 50, odd: true },
  { name: 'L  a=0.998 θ=179° r=40 tek-ızgara (güney kutbuna 1°)', a: 0.998, thetaDeg: 179, rCam: 40, odd: true, port: { drMed: 5e-5 } },
  { name: 'M  a=0.9   θ=3°   r=15 tek-ızgara (kutba yakın + yakın kamera)', a: 0.9, thetaDeg: 3, rCam: 15, odd: true },
];
const SETUPS_RUN = argv.quick ? SETUPS.slice(0, 2) : SETUPS;

// ---------------------------------------------------------------- kabul eşikleri
// ÜÇ KATMAN (gerekçe: src/render/README.md §8.1):
//  (1) PORT — GPU ↔ E32, MUTLAK. İkisi de aynı algoritmayı (aynı κ, N, Hermite, f32, aynı eksen koruması) çalıştırır; fark yalnızca
//      yuvarlama sırası / sin-cos / bölme gerçeklemesidir. Hem üretim (koruma açık) hem 4a (koruma kapalı) geçişinde uygulanır.
//  (2) NİHAİ — GPU(üretim yolu) ↔ R64, MUTLAK ve E32 taban çizgisinden BAĞIMSIZ (E32'ye bağlı eşik E32'nin ortak hatalarını gizler;
//      denetim Ö2). Değerler 1b7c0de denetçi ölçümlerinin (sınıf 0, Δr p99 ≤ 7.7e-4, ΔgCam p99 ≤ 3.2e-5, yön p99 ≤ 2.3e-4) ~2–3× marjlısı.
//  (3) UZAMSAL — uyuşmazlık kümelenmesi yok (başlıktaki kural).
const THRESH = {
  port: {
    mismatchRate: 0.002,
    hitCountMismatchRate: 0.002,
    nLabelMismatchRate: 0.002,
    drMed: 2e-5, drP99: 5e-3,
    dgMed: 1e-5, dgP99: 2e-4,
    ddirMed: 1e-5, ddirP99: 1e-3,
    stepSameRate: 0.98,
  },
  abs: {
    mismatchRate: 0.001, // ≤ %0.1 (96×72'de 6 piksel); ölçülen: 0
    drMed: 2e-4, //   ölçülen ≤ 9e-5 (mobile) — κ=0.05'te ≤ 6.5e-5
    drP99: 2e-3, //   ölçülen ≤ 1e-3 (mobile), ≤ 7.7e-4 (diğerleri)
    dgMed: 5e-6, //   ölçülen ≤ 2.5e-6
    dgP99: 1e-4, //   ölçülen ≤ 3.2e-5 (mobile 1.3e-4: κ=0.10 kesme hatası ⇒ kurulum geçersiz kılması 3e-4)
    ddirMed: 1e-4, // ölçülen ≤ 4e-5
    ddirP99: 5e-4, // ölçülen ≤ 2.3e-4
  },
  band: 6, // merkez sütun bandı yarı genişliği (|i − i_c| ≤ band)
  clusterWindow: 4, // Chebyshev uzaklığı ≤ 4 ⇒ aynı 5×5 blokta
  clusterMax: 1, // bir blokta/bantta en çok 1 uyuşmazlık (≥2 = kümelenme)
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

/** Uyuşmazlık piksellerinin uzamsal kümelenmesi (indeks listesi → merkez bant sayısı, kümedeki piksel sayısı, ilk küme konumu). */
function spatial(mism, GW, GH, T) {
  const ic = (GW - 1) / 2;
  const at = mism.map((k) => [k % GW, Math.floor(k / GW)]);
  let band = 0;
  for (const [i] of at) if (Math.abs(i - ic) <= T.band) band++;
  const clustered = new Set();
  let firstPair = null;
  for (let u = 0; u < at.length; u++) {
    for (let v = u + 1; v < at.length; v++) {
      if (Math.max(Math.abs(at[u][0] - at[v][0]), Math.abs(at[u][1] - at[v][1])) <= T.clusterWindow) {
        clustered.add(u); clustered.add(v);
        if (!firstPair) firstPair = [at[u], at[v]];
      }
    }
  }
  return { band, clustered: clustered.size, firstPair };
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
  console.log(`Izgara ${GW0}x${GH0} (tek-ızgara kurulumlarda +1) · κ=0.05 N=recommendedGpuBudget · r_out=${R_OUT} · r_esc=${R_ESC} · maxDiskHits=1 (aksi belirtilmedikçe)`);
  console.log(`Adım kuralı: GPU stepRule='${STEP_RULE}' ↔ CPU E32 stepRule='${STEP_RULE}'`);
  console.log('Üretim yolu: renderDebug seçeneksiz (eksen koruması AÇIK) ↔ E32 varsayılan (koruma AÇIK) ↔ R64; ayrıca 4a portu {axisGuard:false} ↔ E32 {axisGuard:false}\n');

  for (const S of SETUPS_RUN) {
    const GW = S.odd && GW0 % 2 === 0 ? GW0 + 1 : GW0;
    const GH = S.odd && GH0 % 2 === 0 ? GH0 + 1 : GH0;
    const th = (S.thetaDeg * Math.PI) / 180;
    const prograde = S.prograde ?? true;
    const maxDiskHits = S.maxDiskHits ?? 1;
    const fovY = 2 * Math.atan(HALF_HEIGHT / S.rCam); // radyan
    const mobile = S.quality === 'mobile';
    const budget = mobile ? { kappa: 0.1, maxSteps: 256 } : recommendedGpuBudget(S.a, true);
    const TP = { ...THRESH.port, ...(S.port ?? {}) };
    const TA = { ...THRESH.abs, ...(S.abs ?? {}) };

    // --- GPU: üretim yolu (seçeneksiz) + 4a portu ({axisGuard:false})
    const baseParams = {
      a: S.a, thetaCam: th, rCam: S.rCam, phiCam: 0, fovY: (fovY * 180) / Math.PI, diskIn: 'isco', diskOut: R_OUT,
      prograde, quality: mobile ? 'mobile' : 'high', maxDiskHits, analyticFate: true, rEscape: R_ESC, planeGuard: true, stepRule: STEP_RULE,
      ...(argv['selftest-noguard'] ? { axisGuard: false } : {}), // YALNIZ öz-sınama: üretim yolu korumasız ⇒ betik BAŞARISIZ olmalı
    };
    const tg = Date.now();
    const raw = await harness.page.evaluate(async (q) => {
      const r = window.__karadelik.renderer;
      r.setParams(q.params); // axisGuard VERİLMEZ ⇒ varsayılan (true)
      const gp = r.getParams();
      const t = performance.now();
      const prod = await r.renderDebug(q.w, q.h); // üretim yolu: seçenek yok
      const ms = performance.now() - t;
      const kOn = r.getStats().uniforms.axisKappa;
      const off = await r.renderDebug(q.w, q.h, { axisGuard: false });
      const kOff = r.getStats().uniforms.axisKappa;
      return { prod: Array.from(prod), off: Array.from(off), ms, kOn, kOff, gpAxisGuard: gp.axisGuard };
    }, { params: baseParams, w: GW, h: GH });
    const gpuMs = raw.ms;
    const nPix = GW * GH;
    const decode = (D) => {
      const out = new Array(nPix);
      for (let k = 0; k < nPix; k++) {
        const o = k * 12;
        const hc = D[o + 7];
        out[k] = {
          cls: CLS_NAME[D[o]], steps: D[o + 3], hitCount: hc, r1: hc ? D[o + 1] : NaN, g1: hc ? D[o + 2] : NaN, n1: D[o + 6],
          phi1: hc ? D[o + 9] : NaN, reason: D[o + 8], esc: D[o + 4] >= 0 ? [D[o + 4], D[o + 5]] : null,
          r2: D[o + 10], g2: D[o + 11],
        };
      }
      return out;
    };
    const gpu = decode(raw.prod);
    const gpuOff = decode(raw.off);

    // κ_a eşitliği (GPU ↔ CPU)
    for (const m of checkAxisKappa({ gpuOn: raw.kOn, gpuOff: raw.kOff, gpuParamsAxisGuard: raw.gpAxisGuard })) {
      fails.push(`${S.name}: κ_a: ${m}`); failed = true;
    }

    // --- CPU: kamera piksel ızgarası (GPU ile aynı fovY / en-boy)
    const cam = createCamera({ a: S.a, rCam: S.rCam, thetaCam: th, phiCam: 0, fovY, width: GW, height: GH });
    const params = { a: S.a, rOut: R_OUT, prograde };
    const e32 = new Array(nPix), e32off = new Array(nPix), r64 = new Array(nPix), dirTruth = new Array(nPix).fill(NaN);
    // eksen koruması seçeneği VERİLMEZ ⇒ CPU varsayılanı (açık); E32-4a: {axisGuard:false}
    const e32Opts = {
      integrator: 'rk4', precision: 'f32', form: 'hamilton', kappa: budget.kappa, maxSteps: budget.maxSteps,
      crossing: 'hermite', rEscape: R_ESC, maxDiskHits, stepRule: STEP_RULE,
    };
    const e32OffOpts = { ...e32Opts, axisGuard: false };
    const r64Opts = { rtol: 1e-10, atol: 1e-12, maxDiskHits, rEscape: R_ESC };
    const r64TruthOpts = { rtol: 1e-10, atol: 1e-12, maxDiskHits }; // varsayılan r_esc (1e4): kesme hatasının BİLGİ ölçümü
    const tc = Date.now();
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const ray = cam.pixelToRay(i, j);
        const k = j * GW + i;
        e32[k] = cpuView(traceRay(params, ray, e32Opts));
        e32off[k] = cpuView(traceRay(params, ray, e32OffOpts));
        r64[k] = cpuView(traceRay(params, ray, r64Opts));
        if (r64[k].cls === 'escaped' && r64[k].esc && gpu[k].esc) {
          const tr = traceRay(params, ray, r64TruthOpts);
          if (tr.escape) dirTruth[k] = angleBetween(gpu[k].esc[0], gpu[k].esc[1], tr.escape.theta, tr.escape.phi);
        }
      }
    }
    const cpuMs = Date.now() - tc;

    const gE = compare(gpu, e32, nPix); //  [PORT-ÜRETİM]
    const gR = compare(gpu, r64, nPix); //  [NİHAİ]
    const eR = compare(e32, r64, nPix); //  bilgi
    const gEoff = compare(gpuOff, e32off, nPix); // [PORT-4a]
    const gRoff = compare(gpuOff, r64, nPix); //  bilgi: korumasız GPU'nun R64'e karşı hatası (koruma gereksinimi)
    const sp = spatial(gR.mism, GW, GH, THRESH);
    const truthDir = stats(dirTruth.filter(Number.isFinite));

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
      let mm = 0, mmR = 0, dmax = 0, dmaxR = 0, nEsc = 0, nAxisCross = 0;
      for (let j = 0; j < GH; j++) {
        const k = j * GW + ic;
        if (gpu[k].cls !== e32[k].cls) mm++;
        if (gpu[k].cls !== r64[k].cls) mmR++;
        if (gpu[k].esc && e32[k].esc) { nEsc++; dmax = Math.max(dmax, angleBetween(gpu[k].esc[0], gpu[k].esc[1], e32[k].esc[0], e32[k].esc[1])); }
        if (gpu[k].esc && r64[k].esc) dmaxR = Math.max(dmaxR, angleBetween(gpu[k].esc[0], gpu[k].esc[1], r64[k].esc[0], r64[k].esc[1]));
        // kutuptan geçen ışın: kaçış φ'si kamera meridyeninden π kadar kaymış (φ_cam=0 ⇒ φ_∞ ≈ π)
        if (gpu[k].esc && Math.abs(Math.cos(gpu[k].esc[1]) + 1) < 0.5) nAxisCross++;
      }
      axis = { column: GH, mismatch: mm, mismatchR64: mmR, escCompared: nEsc, escMaxErr: dmax, escMaxErrR64: dmaxR, escapedWithPhiNearPi: nAxisCross };
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
      }, { params: baseParams, w: GW, h: GH });
      const e32OffPlane = { ...e32Opts, planeEps: 0 };
      let nNlabel = 0, nHit = 0, nCpuNlabel = 0, nCpuHit = 0, nAgree = 0;
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const k = j * GW + i;
        const o = k * 12;
        const offHit = raw2[o + 7], offN = raw2[o + 6];
        if (offHit !== gpu[k].hitCount) nHit++;
        if (offHit && gpu[k].hitCount && offN !== gpu[k].n1) nNlabel++;
        const c = cpuView(traceRay(params, cam.pixelToRay(i, j), e32OffPlane));
        if (c.hitCount !== e32[k].hitCount) nCpuHit++;
        if (c.hitCount && e32[k].hitCount && c.n1 !== e32[k].n1) nCpuNlabel++;
        if (c.hitCount === offHit && (c.hitCount === 0 || c.n1 === offN)) nAgree++;
      }
      control = { gpuOff_vs_on_hitCountChanged: nHit, gpuOff_vs_on_nLabelChanged: nNlabel, cpuOff_vs_on_hitCountChanged: nCpuHit, cpuOff_vs_on_nLabelChanged: nCpuNlabel, gpuOffVsCpuOff_agreeRate: nAgree / nPix };
    }

    const row = {
      setup: S.name, grid: [GW, GH], budget, gpuMs, cpuMs, axisKappa: { gpuOn: raw.kOn, gpuOff: raw.kOff },
      budgetRays: { n: nBudget, captured: nBudgetCaptured, vsR64Mismatch: budgetVsR64, vsE32Mismatch: budgetVsE32, e32VsR64Mismatch: budgetE32VsR64 }, axis, control,
      classes: { captured: count(gpu, 'captured'), escaped: count(gpu, 'escaped'), disk: count(gpu, 'disk') },
      cpuClassesR64: { captured: count(r64, 'captured'), escaped: count(r64, 'escaped'), disk: count(r64, 'disk') },
      stepsMeanGpu, stepsMaxGpu, nBudget, nNaN, nCamRadiusHit, nMismatch,
      gE: strip(gE), gR: strip(gR), eR: strip(eR), gEoff: strip(gEoff), gRoff: strip(gRoff), spatial: sp, truthDir,
      thresholds: { port: TP, abs: TA },
      secondHit: maxDiskHits > 1 ? { n: r2d.length, dr: stats(r2d), dg: stats(g2d) } : null,
      mismatchPixels: { gpuVsE32: gE.mism.slice(0, 40), gpuVsR64: gR.mism.slice(0, 40) },
    };
    results.push(row);

    // --- yazdır
    console.log(`━━ ${S.name}  (N=${budget.maxSteps}, κ=${budget.kappa}, κ_a GPU ${raw.kOn.toFixed(3)})  GPU ${gpuMs.toFixed(0)} ms · CPU(E32×2+R64) ${cpuMs} ms`);
    console.log(`   GPU sınıfları: yakalandı ${row.classes.captured} · kaçtı ${row.classes.escaped} · disk ${row.classes.disk}   | R64: ${row.cpuClassesR64.captured}/${row.cpuClassesR64.escaped}/${row.cpuClassesR64.disk}`);
    console.log(`   adım ort/maks (GPU): ${stepsMeanGpu.toFixed(1)}/${stepsMaxGpu} · bütçe biten ${nBudget} · NaN ${nNaN} · r≈r_cam'de sahte vuruş ${nCamRadiusHit}`);
    console.log('   çift                     | uyuşmaz. (n)  | vuruş-say. | n-etiket | Δr med / p99 / maks       | ΔgCam(göreli) med / p99 / maks | kaçış yönü Δ(rad) med / p99 / maks | adım==');
    printPair('GPU–E32 [PORT-ÜRETİM]', gE, row.nMismatch);
    printPair('GPU–R64 [NİHAİ]', gR, null);
    printPair('GPUoff–E32off [PORT-4a]', gEoff, null);
    printPair('GPUoff–R64 (bilgi)', gRoff, null);
    printPair('E32–R64 (bilgi)', eR, null);
    console.log(`   [UZAMSAL] GPU–R64 uyuşmazlıkları: merkez bant (|i−i_c|≤${THRESH.band}) ${sp.band} · 5×5 blokta kümelenen ${sp.clustered}${sp.firstPair ? ' (örn. ' + JSON.stringify(sp.firstPair) + ')' : ''}   | koruma KAPALI: ${gRoff.mismatch} uyuşmazlık`);
    console.log(`   kaçış yönü, R64 r_esc=1e4 (kesme hatası dahil; BİLGİ): med/p99/maks ${f(truthDir.med)} / ${f(truthDir.p99)} / ${f(truthDir.max)} (n=${truthDir.n})`);
    if (row.secondHit) {
      console.log(`   2. vuruş (GPU–E32, n=${row.secondHit.n}): Δr med/p99/maks ${f(row.secondHit.dr.med)}/${f(row.secondHit.dr.p99)}/${f(row.secondHit.dr.max)} · Δg ${f(row.secondHit.dg.med)}/${f(row.secondHit.dg.p99)}/${f(row.secondHit.dg.max)}`);
    }
    if (nBudget > 0) console.log(`   bütçesi biten ${nBudget} ışın (analitik fate): yakalandı ${nBudgetCaptured}, kaçtı ${nBudget - nBudgetCaptured} · sınıf uyuşmazlığı GPU–E32 ${budgetVsE32} · GPU–R64 ${budgetVsR64} (E32–R64 ${budgetE32VsR64})`);
    if (axis) console.log(`   merkez sütun (L=0 eksen yolu, ${axis.column} piksel): sınıf uyuşmazlığı GPU–E32 ${axis.mismatch} · GPU–R64 ${axis.mismatchR64} · kaçış yönü maks hata E32 ${f(axis.escMaxErr)} / R64 ${f(axis.escMaxErrR64)} rad (${axis.escCompared} piksel) · φ_∞≈π (kutuptan geçen) ${axis.escapedWithPhiNearPi}`);
    if (control) console.log(`   NEGATİF KONTROL (planeGuard KAPALI): GPU vuruş sayısı değişen ${control.gpuOff_vs_on_hitCountChanged}, n-etiketi değişen ${control.gpuOff_vs_on_nLabelChanged} piksel | CPU(planeEps=0) ${control.cpuOff_vs_on_hitCountChanged}/${control.cpuOff_vs_on_nLabelChanged} | GPU(kapalı)↔CPU(kapalı) uyum ${pct(control.gpuOffVsCpuOff_agreeRate)}`);
    console.log('');

    // --- kabul eşikleri
    const chk = (cond, msg) => { if (!cond && !S.info) { fails.push(`${S.name}: ${msg}`); failed = true; } };
    const le = (x, lim) => !(x > lim); // NaN (veri yok) başarısız sayılmaz
    const portChecks = (tag, c, nLab) => {
      chk(c.mismatchRate <= TP.mismatchRate, `${tag} sınıf uyuşmazlığı ${pct(c.mismatchRate)} > ${pct(TP.mismatchRate)}`);
      chk(c.hitCountMismatchRate <= TP.hitCountMismatchRate, `${tag} vuruş sayısı uyuşmazlığı ${pct(c.hitCountMismatchRate)}`);
      if (nLab !== null) chk(nLab / nPix <= TP.nLabelMismatchRate, `${tag} n-etiketi uyuşmazlığı ${nLab}`);
      chk(le(c.dr.med, TP.drMed), `${tag} medyan Δr ${f(c.dr.med)} > ${f(TP.drMed)}`);
      chk(le(c.dr.p99, TP.drP99), `${tag} p99 Δr ${f(c.dr.p99)} > ${f(TP.drP99)}`);
      chk(le(c.dg.med, TP.dgMed), `${tag} medyan ΔgCam ${f(c.dg.med)} > ${f(TP.dgMed)}`);
      chk(le(c.dg.p99, TP.dgP99), `${tag} p99 ΔgCam ${f(c.dg.p99)} > ${f(TP.dgP99)}`);
      chk(le(c.ddir.med, TP.ddirMed), `${tag} medyan kaçış yönü ${f(c.ddir.med)} > ${f(TP.ddirMed)}`);
      chk(le(c.ddir.p99, TP.ddirP99), `${tag} p99 kaçış yönü ${f(c.ddir.p99)} > ${f(TP.ddirP99)}`);
      chk(c.stepSameRate >= TP.stepSameRate, `${tag} adım sayısı aynı oranı ${pct(c.stepSameRate)} < ${pct(TP.stepSameRate)}`);
    };
    portChecks('[PORT-ÜRETİM] GPU–E32', gE, nMismatch);
    portChecks('[PORT-4a] GPUoff–E32off', gEoff, null);
    // [NİHAİ]: mutlak, E32'den bağımsız
    chk(gR.mismatchRate <= TA.mismatchRate, `[NİHAİ] GPU–R64 sınıf uyuşmazlığı ${pct(gR.mismatchRate)} (${gR.mismatch} piksel) > ${pct(TA.mismatchRate)}`);
    chk(le(gR.dr.med, TA.drMed), `[NİHAİ] GPU–R64 medyan Δr ${f(gR.dr.med)} > ${f(TA.drMed)}`);
    chk(le(gR.dr.p99, TA.drP99), `[NİHAİ] GPU–R64 p99 Δr ${f(gR.dr.p99)} > ${f(TA.drP99)}`);
    chk(le(gR.dg.med, TA.dgMed), `[NİHAİ] GPU–R64 medyan ΔgCam ${f(gR.dg.med)} > ${f(TA.dgMed)}`);
    chk(le(gR.dg.p99, TA.dgP99), `[NİHAİ] GPU–R64 p99 ΔgCam ${f(gR.dg.p99)} > ${f(TA.dgP99)}`);
    chk(le(gR.ddir.med, TA.ddirMed), `[NİHAİ] GPU–R64 medyan kaçış yönü ${f(gR.ddir.med)} > ${f(TA.ddirMed)}`);
    chk(le(gR.ddir.p99, TA.ddirP99), `[NİHAİ] GPU–R64 p99 kaçış yönü ${f(gR.ddir.p99)} > ${f(TA.ddirP99)}`);
    // [UZAMSAL]
    chk(sp.band <= THRESH.clusterMax, `[UZAMSAL] merkez sütun bandında ${sp.band} uyuşmazlık (kümelenme)`);
    chk(sp.clustered === 0, `[UZAMSAL] 5×5 blokta kümelenen ${sp.clustered} uyuşmazlık pikseli ${JSON.stringify(sp.firstPair)}`);
    chk(nNaN === 0, `${nNaN} piksel NaN`);
    // sahte vuruş r≈r_cam yalnız kamera disk düzlemine yakınken anlamlıdır (kutba yakın kamerada disk r≈r_cam'de GERÇEKTEN görülebilir)
    if (Math.abs(Math.cos(th)) < 0.2) chk(nCamRadiusHit === 0, `${nCamRadiusHit} sahte vuruş r≈r_cam`);
    // analitik fate: port doğruluğu GPU–E32 ve R64'e göre MUTLAK (tabana göreli değil)
    chk(budgetVsE32 <= Math.ceil(0.02 * nBudget), `bütçesi biten ışınlarda GPU–E32 sınıf uyuşmazlığı ${budgetVsE32}/${nBudget}`);
    chk(budgetVsR64 <= Math.ceil(0.01 * nBudget), `bütçesi biten ışınlarda GPU–R64 uyuşmazlığı ${budgetVsR64}/${nBudget} > %1`);
    if (axis) chk(axis.mismatch === 0 && le(axis.escMaxErr, 1e-3), `merkez sütun (L=0): GPU–E32 uyuşmazlık ${axis.mismatch}, kaçış yönü maks ${f(axis.escMaxErr)}`);
    if (axis) chk(axis.mismatchR64 === 0 && le(axis.escMaxErrR64, 1e-3), `merkez sütun (L=0): GPU–R64 uyuşmazlık ${axis.mismatchR64}, kaçış yönü maks ${f(axis.escMaxErrR64)}`);
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
    `   ${name.padEnd(24)} | ${pct(c.mismatchRate).padStart(7)} (${String(c.mismatch).padStart(3)}) | ${String(c.hitCountMismatch).padStart(4)}       | ${nMis === null ? '   –   ' : String(nMis).padStart(5) + '  '}  | ${f(c.dr.med)} / ${f(c.dr.p99)} / ${f(c.dr.max)} | ${f(c.dg.med)} / ${f(c.dg.p99)} / ${f(c.dg.max)}     | ${f(c.ddir.med)} / ${f(c.ddir.p99)} / ${f(c.ddir.max)}     | ${pct(c.stepSameRate)}`,
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
