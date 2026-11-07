// Eksen sıçraması (axis bounce) hatası ve `axisGuard` düzeltmesi.
//
// Hata: kutup ekseninden küçük ama sıfır olmayan L ile geçen ışın eksenden θ_min ≈ L/p'de "sıçrar". Sabit adımlı RK4'te doğal adım
// θ değişimini MUTLAK κ rad ile sınırladığından θ_min ≪ κ sıçramayı çözemez ⇒ sahte sınıf/kaçış yönü. GPU düzeltmesi
// (src/shaders/trace.glsl, κ_a = 0.15) CPU rk4 yoluna aynen taşındı (`axisGuard`, `kappaAxis`; varsayılan AÇIK).
// DP5(4)'te koruma yok: h ≤ capFactor·h_nat + hata denetimi sıçramayı zaten çözer (aşağıda ölçülür).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCamera } from '../../src/math/camera.js';
import { traceRay, DEFAULT_OPTIONS } from '../../src/math/raytracer.js';
import { deg } from './helpers.mjs';

const cls = (r) => (r.status === 'maxSteps' ? (r.reason === 'budget' && r.fate ? r.fate : 'captured') : r.status);

// a = 0.9, θ_cam = 75°, r_cam = 50, ince ızgara (240×180), merkez şerit |i − i_c| ≤ 12 (4320 piksel)
const A = 0.9, R_CAM = 50, GW = 240, GH = 180, STRIP = 12;
const params = { a: A, rOut: 20 };
const cam = createCamera({ a: A, rCam: R_CAM, thetaCam: deg(75), phiCam: 0, fovY: 2 * Math.atan(14 / R_CAM), width: GW, height: GH });
const ic = (GW - 1) / 2;
const strip = [];
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (Math.abs(i - ic) <= STRIP) strip.push(cam.pixelToRay(i, j));

const base = { maxDiskHits: 1, rEscape: 300 };
const rk4 = { integrator: 'rk4', kappa: 0.05, maxSteps: 512 };
const run = (opts) => strip.map((ray) => traceRay(params, ray, { ...base, ...opts }));
const mismatch = (X, Y) => X.reduce((n, r, k) => n + (cls(r) !== cls(Y[k]) ? 1 : 0), 0);
const meanSteps = (X) => X.reduce((s, r) => s + r.steps, 0) / X.length;

const R64 = run({ rtol: 1e-10, atol: 1e-12 });

test('E1. Varsayılanlar: axisGuard = true, kappaAxis = 0.15 (GPU AXIS_KAPPA ile aynı)', () => {
  assert.equal(DEFAULT_OPTIONS.axisGuard, true);
  assert.equal(DEFAULT_OPTIONS.kappaAxis, 0.15);
  const params_js = fs.readFileSync(new URL('../../src/render/params.js', import.meta.url), 'utf8');
  const m = params_js.match(/AXIS_KAPPA\s*=\s*([0-9.]+)/);
  assert.ok(m, 'params.js içinde AXIS_KAPPA bulunamadı');
  assert.equal(Number(m[1]), DEFAULT_OPTIONS.kappaAxis);
});

test('E2. GLSL ile aynı formül (trace.glsl / camera.glsl metin denetimi — sürüklenmeyi yakalar)', () => {
  const trace = fs.readFileSync(new URL('../../src/shaders/trace.glsl', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const camera = fs.readFileSync(new URL('../../src/shaders/camera.glsl', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.ok(trace.includes('float se = max(abs(sc.x), g_sMin);'));
  assert.ok(trace.includes('float c1 = se / max(abs(F.th), 1e-30);'));
  assert.ok(trace.includes('float c2 = sqrt(se / max(abs(F.pth), 1e-30));'));
  assert.ok(trace.includes('hh = min(hh, uAxisKappa * min(c1, c2));'));
  assert.ok(camera.includes('g_sMin = g_hasL ? 0.25 * abs(g_L) / sqrt(g_Q + uA2 + g_L2) : 0.0;'));
});

for (const precision of ['f32', 'f64']) {
  test(`E3 [${precision}]. a=0.9 θ=75° r=50 merkez şerit: korumasız RK4 R64 ile UYUŞMAZ, korumalı uyuşur`, () => {
    const prec = { precision };
    const off = run({ ...rk4, ...prec, axisGuard: false });
    const on = run({ ...rk4, ...prec }); // varsayılan: korumalı
    const mOff = mismatch(off, R64), mOn = mismatch(on, R64);
    const sOff = meanSteps(off), sOn = meanSteps(on);
    console.log(`  ${precision}: sınıf uyuşmazlığı vs R64 (${strip.length} px): korumasız ${mOff} → korumalı ${mOn}; ort. adım ${sOff.toFixed(1)} → ${sOn.toFixed(1)} (%${(100 * (sOn / sOff - 1)).toFixed(1)})`);
    assert.ok(mOff >= 100, `hata yeniden üretilemedi: korumasız uyuşmazlık ${mOff} (beklenen ≥ 100, GPU ölçümü 229)`);
    assert.equal(mOn, 0, `korumalı uyuşmazlık ${mOn}`);
    assert.ok(sOn <= 1.2 * sOff, 'ort. adım artışı > %20');
  });
}

test('E4. f32 korumalı ↔ f64 korumalı: şerit sınıfları aynı; hatalı ışın sayısı R64 ölçeğinde 0', () => {
  const on32 = run({ ...rk4, precision: 'f32' });
  const on64 = run({ ...rk4, precision: 'f64' });
  assert.equal(mismatch(on32, on64), 0);
});

test('E5. Eksenden uzak piksellerde koruma etkisiz: sonuç (adım, durum, vuruş r, θ_son) bit-bit aynı (≥ %99.9)', () => {
  const g = 96, h = 72;
  const c = createCamera({ a: A, rCam: R_CAM, thetaCam: deg(75), phiCam: 0, fovY: 2 * Math.atan(14 / R_CAM), width: g, height: h });
  const icc = (g - 1) / 2;
  const o = { ...base, ...rk4, precision: 'f32' };
  let n = 0, same = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < g; i++) {
    if (Math.abs(i - icc) <= STRIP) continue;
    const ray = c.pixelToRay(i, j);
    const X = traceRay(params, ray, { ...o, axisGuard: false });
    const Y = traceRay(params, ray, o);
    n++;
    if (X.steps === Y.steps && X.status === Y.status && X.hits[0]?.r === Y.hits[0]?.r && X.thetaEnd === Y.thetaEnd) same++;
  }
  console.log(`  eksenden uzak ${n} piksel: bit-bit aynı ${same}`);
  assert.ok(same >= 0.999 * n, `${same}/${n}`);
});

test('E6. L = 0 (tam meridyen) ışınında koruma devre dışı: sonuç aynı', () => {
  const g = 97, h = 73; // tek ızgara → merkez sütun L = 0
  const c = createCamera({ a: A, rCam: R_CAM, thetaCam: deg(75), phiCam: 0, fovY: 2 * Math.atan(14 / R_CAM), width: g, height: h });
  const i = (g - 1) / 2;
  for (let j = 0; j < h; j++) {
    const ray = c.pixelToRay(i, j);
    const X = traceRay(params, ray, { ...base, ...rk4, precision: 'f32', axisGuard: false });
    const Y = traceRay(params, ray, { ...base, ...rk4, precision: 'f32' });
    assert.equal(Y.L, 0);
    assert.equal(Y.steps, X.steps);
    assert.equal(Y.thetaEnd, X.thetaEnd);
  }
});

test('E7. DP5(4) adaptif yol: axisGuard seçeneği etkisiz; sıçrama zaten çözülür (rtol 1e-8 / 1e-10 / 1e-12 şerit sınıfları aynı)', () => {
  const sub = strip.filter((_, k) => k % 3 === 0); // hız için her 3. piksel
  const go = (o) => sub.map((ray) => traceRay(params, ray, { ...base, ...o }));
  const a10 = go({ rtol: 1e-10, atol: 1e-12 });
  const a10off = go({ rtol: 1e-10, atol: 1e-12, axisGuard: false });
  const a8 = go({ rtol: 1e-8, atol: 1e-10 });
  const a12 = go({ rtol: 1e-12, atol: 1e-14 });
  a10.forEach((r, k) => { assert.equal(r.steps, a10off[k].steps); assert.equal(r.thetaEnd, a10off[k].thetaEnd); });
  const m8 = a8.reduce((n, r, k) => n + (cls(r) !== cls(a12[k]) ? 1 : 0), 0);
  const m10 = a10.reduce((n, r, k) => n + (cls(r) !== cls(a12[k]) ? 1 : 0), 0);
  console.log(`  DP5(4) vs rtol=1e-12 (${sub.length} px): rtol 1e-8 uyuşmazlık ${m8}, rtol 1e-10 uyuşmazlık ${m10}`);
  assert.equal(m8, 0);
  assert.equal(m10, 0);
});
