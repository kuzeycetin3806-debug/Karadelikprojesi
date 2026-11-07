/**
 * Eksen koruması (Adım 4b) doğrulaması: GPU (koruma KAPALI = 4a'nın birebir portu) ↔ GPU (koruma AÇIK) ↔ R64 (f64 DP5(4) referansı).
 * `node --test` ile çalışmaz.   node tests/render/axis-guard-validate.mjs [--grid=96x72] [--json=çıktı.json]
 *
 * Arka plan: kutup ekseninden θ_min ≈ L/p mesafesinde "sıçrayan" (L ≠ 0, küçük) ışınlar için doğal adım (κ = 0.05 rad mutlak θ değişimi)
 * sıçramayı çözemez; CPU E32 (src/math) ve 4a GPU portu AYNI hatayı yapar (GPU–E32 uyumu bunu yakalamaz; R64 yakalar).
 * Koruma (trace.glsl, uAxisKappa): adım ayrıca κ_a·max(|sinθ|, s_min)/|θ'| ve κ_a·√(max(|sinθ|, s_min)/|p_θ'|) ile sınırlanır.
 *
 * Kurulumlar gpu-validate.mjs'in A, B, C, F, G (L=0 sütunu), H (θ=10°) ve J (r=200) kurulumlarıyla aynıdır (aynı ızgara/r_esc/κ/N).
 * ÇEKİRDEK sınama: debug yolu varsayılan olarak koruma KAPALI (gpu-validate dokunulmaz); burada açıkça `{axisGuard:true}` istenir.
 *
 * Kabul: (1) her kurulumda koruma AÇIK sınıf uyuşmazlığı ≤ KAPALI uyuşmazlığı (+ gürültü payı 2 piksel) — koruma kötüleştirmemeli;
 *        (2) merkez-sütun şeridinde (|i − i_c| ≤ 6) koruma AÇIK uyuşmazlık ≤ 1 piksel;
 *        (3) bütçesi biten piksel sayısı AÇIK ≤ KAPALI + 2; (4) ortalama adım artışı ≤ %20; (5) eksenden uzak piksellerde (şerit dışı) Δr medyanı bozulmaz.
 */
import fs from 'node:fs';
import { createCamera } from '../../src/math/camera.js';
import { traceRay, recommendedGpuBudget } from '../../src/math/raytracer.js';
import { startHarness } from './harness.mjs';

const deg = (d) => (d * Math.PI) / 180;
const argv = Object.fromEntries(process.argv.slice(2).map((s) => { const m = s.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [s, true]; }));
const [GW0, GH0] = String(argv.grid ?? '96x72').split('x').map(Number);
const R_OUT = 20, R_ESC = 300, HALF_HEIGHT = 14;
const SETUPS = [
  { name: 'A a=0.9 θ75° r50', a: 0.9, th: 75, rCam: 50 },
  { name: 'B a=0.998 θ60° r50', a: 0.998, th: 60, rCam: 50 },
  { name: 'C a=0 θ85° r30', a: 0, th: 85, rCam: 30 },
  { name: 'F a=0.9 θ75° r50 retrograd', a: 0.9, th: 75, rCam: 50, prograde: false },
  { name: 'G a=0.9 θ75° r50 tek-ızgara (L=0 sütunu)', a: 0.9, th: 75, rCam: 50, odd: true },
  { name: 'H a=0.9 θ10° r50 tek-ızgara', a: 0.9, th: 10, rCam: 50, odd: true },
  { name: 'J a=0.9 θ75° r200', a: 0.9, th: 75, rCam: 200 },
  { name: 'K a=0.9 θ75° r50 ince ızgara 240×180 (merkez şerit)', a: 0.9, th: 75, rCam: 50, grid: [240, 180], strip: 12 },
];

const NAMES = ['captured', 'escaped', 'disk'];
const cls = (r) => (r.status === 'maxSteps' ? (r.reason === 'budget' && r.fate ? r.fate : 'captured') : r.status);
const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const ang = (t1, p1, t2, p2) => {
  const u = [Math.sin(t1) * Math.cos(p1), Math.sin(t1) * Math.sin(p1), Math.cos(t1)];
  const w = [Math.sin(t2) * Math.cos(p2), Math.sin(t2) * Math.sin(p2), Math.cos(t2)];
  const cx = u[1] * w[2] - u[2] * w[1], cy = u[2] * w[0] - u[0] * w[2], cz = u[0] * w[1] - u[1] * w[0];
  return Math.atan2(Math.hypot(cx, cy, cz), u[0] * w[0] + u[1] * w[1] + u[2] * w[2]);
};
const f = (x) => (Number.isFinite(x) ? x.toExponential(2) : ' n/a ');

const harness = await startHarness({ width: 64, height: 48 });
const results = [];
const fails = [];
try {
  for (const S of SETUPS) {
    let [GW, GH] = S.grid ?? [GW0, GH0];
    if (S.odd) { if (GW % 2 === 0) GW++; if (GH % 2 === 0) GH++; }
    const th = deg(S.th);
    const prograde = S.prograde ?? true;
    const fovY = 2 * Math.atan(HALF_HEIGHT / S.rCam);
    const budget = recommendedGpuBudget(S.a, true);
    const raw = await harness.page.evaluate(async (qq) => {
      const r = window.__karadelik.renderer;
      r.setParams(qq.params);
      const off = Array.from(await r.renderDebug(qq.w, qq.h, { axisGuard: false }));
      const on = Array.from(await r.renderDebug(qq.w, qq.h, { axisGuard: true }));
      return { off, on };
    }, {
      params: { a: S.a, thetaCam: th, rCam: S.rCam, phiCam: 0, fovY: (fovY * 180) / Math.PI, diskIn: 'isco', diskOut: R_OUT, prograde, quality: 'high', maxDiskHits: 1, analyticFate: true, rEscape: R_ESC, planeGuard: true },
      w: GW, h: GH,
    });
    const cam = createCamera({ a: S.a, rCam: S.rCam, thetaCam: th, phiCam: 0, fovY, width: GW, height: GH });
    const params = { a: S.a, rOut: R_OUT, prograde };
    const icen = (GW - 1) / 2;
    const stripHalf = S.strip ?? 6;
    const m = { off: 0, on: 0, offStrip: 0, onStrip: 0, nStrip: 0, budgetOff: 0, budgetOn: 0, stepsOff: 0, stepsOn: 0, maxStepsOn: 0 };
    const drOffFar = [], drOnFar = [], dirOff = [], dirOn = [];
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const o = (j * GW + i) * 12;
      const ref = traceRay(params, cam.pixelToRay(i, j), { rtol: 1e-10, atol: 1e-12, maxDiskHits: 1, rEscape: R_ESC });
      const rc = cls(ref);
      const cOff = NAMES[raw.off[o]], cOn = NAMES[raw.on[o]];
      const inStrip = Math.abs(i - icen) <= stripHalf;
      if (inStrip) m.nStrip++;
      if (cOff !== rc) { m.off++; if (inStrip) m.offStrip++; }
      if (cOn !== rc) { m.on++; if (inStrip) m.onStrip++; }
      if (raw.off[o + 8] === 1) m.budgetOff++;
      if (raw.on[o + 8] === 1) m.budgetOn++;
      m.stepsOff += raw.off[o + 3]; m.stepsOn += raw.on[o + 3]; m.maxStepsOn = Math.max(m.maxStepsOn, raw.on[o + 3]);
      if (ref.escape && raw.off[o] === 1 && raw.off[o + 4] >= 0) dirOff.push(ang(raw.off[o + 4], raw.off[o + 5], ref.escape.theta, ref.escape.phi));
      if (ref.escape && raw.on[o] === 1 && raw.on[o + 4] >= 0) dirOn.push(ang(raw.on[o + 4], raw.on[o + 5], ref.escape.theta, ref.escape.phi));
      if (!inStrip && ref.hits.length && raw.off[o + 7] > 0 && raw.on[o + 7] > 0) {
        drOffFar.push(Math.abs(raw.off[o + 1] - ref.hits[0].r));
        drOnFar.push(Math.abs(raw.on[o + 1] - ref.hits[0].r));
      }
    }
    const nPix = GW * GH;
    const row = {
      setup: S.name, grid: [GW, GH], mismatchOff: m.off, mismatchOn: m.on, stripN: m.nStrip, stripOff: m.offStrip, stripOn: m.onStrip,
      budgetOff: m.budgetOff, budgetOn: m.budgetOn, meanStepsOff: m.stepsOff / nPix, meanStepsOn: m.stepsOn / nPix, maxStepsOn: m.maxStepsOn,
      dirOff: { med: q(dirOff, 0.5), p99: q(dirOff, 0.99), max: q(dirOff, 1) }, dirOn: { med: q(dirOn, 0.5), p99: q(dirOn, 0.99), max: q(dirOn, 1) },
      drFarMedOff: q(drOffFar, 0.5), drFarMedOn: q(drOnFar, 0.5),
    };
    results.push(row);
    console.log(`━━ ${S.name}  (${GW}×${GH}, N=${budget.maxSteps})`);
    console.log(`   sınıf uyuşmazlığı vs R64: KAPALI ${m.off} (%${(100 * m.off / nPix).toFixed(2)}) → AÇIK ${m.on} (%${(100 * m.on / nPix).toFixed(2)})   | merkez şerit (|i−i_c|≤${stripHalf}, ${m.nStrip} px): ${m.offStrip} → ${m.onStrip}`);
    console.log(`   bütçesi biten: ${m.budgetOff} → ${m.budgetOn} | ort. adım ${row.meanStepsOff.toFixed(1)} → ${row.meanStepsOn.toFixed(1)} (%${(100 * (row.meanStepsOn / row.meanStepsOff - 1)).toFixed(1)}) | maks adım (AÇIK) ${m.maxStepsOn}`);
    console.log(`   kaçış yönü hatası (rad) med/p99/maks: KAPALI ${f(row.dirOff.med)}/${f(row.dirOff.p99)}/${f(row.dirOff.max)} → AÇIK ${f(row.dirOn.med)}/${f(row.dirOn.p99)}/${f(row.dirOn.max)}`);
    console.log(`   eksenden uzak Δr medyan: ${f(row.drFarMedOff)} → ${f(row.drFarMedOn)}\n`);

    const chk = (c, msg) => { if (!c) fails.push(`${S.name}: ${msg}`); };
    chk(m.on <= m.off + 2, `koruma AÇIK uyuşmazlık ${m.on} > KAPALI ${m.off} + 2`);
    if (S.strip || S.odd === undefined) chk(m.onStrip <= 1, `merkez şeritte AÇIK uyuşmazlık ${m.onStrip} > 1`);
    chk(m.budgetOn <= m.budgetOff + 2, `bütçesi biten ${m.budgetOn} > ${m.budgetOff} + 2`);
    chk(row.meanStepsOn <= 1.2 * row.meanStepsOff, `ort. adım artışı %${(100 * (row.meanStepsOn / row.meanStepsOff - 1)).toFixed(1)} > %20`);
    chk(!(row.drFarMedOn > 2 * row.drFarMedOff + 1e-6), `eksenden uzak Δr medyanı bozuldu ${f(row.drFarMedOff)} → ${f(row.drFarMedOn)}`);
  }
} finally {
  await harness.close();
}
console.log('Konsol uyarı/hata (tarayıcı):', harness.errors.length === 0 ? 'YOK' : '\n' + harness.errors.join('\n'));
if (harness.errors.length) fails.push('tarayıcı konsolunda hata/uyarı');
if (argv.json) fs.writeFileSync(String(argv.json), JSON.stringify({ results }, null, 1));
if (fails.length) {
  console.log('\nEKSEN KORUMASI DOĞRULAMASI: BAŞARISIZ');
  for (const m of fails) console.log('  ✗ ' + m);
  process.exitCode = 1;
} else {
  console.log('\nEKSEN KORUMASI DOĞRULAMASI: GEÇTİ');
}
