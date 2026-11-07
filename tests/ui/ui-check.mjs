/**
 * Arayüz doğrulaması (Playwright, headless Chromium + SwiftShader). `node --test` ile ÇALIŞMAZ.
 *   node tests/ui/ui-check.mjs [--out=/tmp/karadelik-ui] [--only=shots|logic]
 * - Kontroller → setParams, fare/dokunmatik/klavye kamera etkisi, bilgi ekranı ↔ physics, konsol hatası.
 * - 375×812, 768×1024, 1024×768, 1440×900 ekran görüntüleri.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { CHROMIUM_ARGS, PROJECT_ROOT } from '../render/harness.mjs';
import { horizonRadii, ergosphereRadius, photonOrbitRadius, iscoRadius, frameDraggingOmega, shadowBoundary } from '../../src/physics/kerr.js';
import { schwarzschildShadowSin } from '../../src/ui/info.js';
import { radiativeEfficiency, diskTemperaturePeak } from '../../src/physics/disk.js';
import { gravitationalRadiusKm } from '../../src/physics/units.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const OUT = args.out || '/tmp/karadelik-ui';
const ONLY = args.only || '';
fs.mkdirSync(OUT, { recursive: true });

const DEG = Math.PI / 180;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? '  — ' + detail : ''}`);
}
const near = (x, y, tol = 1e-9) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(y));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({ root: PROJECT_ROOT, logLevel: 'warn', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const consoleErrors = [];

async function openPage({ width, height, touch = false }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: 'reduce', // ekran görüntüleri kararlı olsun
  });
  const page = await ctx.newPage();
  const tag = `${width}x${height}`;
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      // SwiftShader/Chromium'un okuma uyarısı: test kodundan değil; yine de listele
      consoleErrors.push(`[${tag}] [${m.type()}] ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] [pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__karadelik?.ui, null, { timeout: 60000 });
  // kamera yazımlarını kaydet (band atlama denetimi için)
  await page.evaluate(() => {
    const r = window.__karadelik.renderer;
    const orig = r.setParams.bind(r);
    window.__thetaLog = [];
    r.setParams = (p) => {
      if (p && 'thetaCam' in p) window.__thetaLog.push(p.thetaCam);
      return orig(p);
    };
  });
  return { ctx, page };
}

const P = (page) => page.evaluate(() => window.__karadelik.renderer.getParams());
const ST = (page) => page.evaluate(() => window.__karadelik.renderer.getStats());
async function settleCamera(page) {
  await page.waitForFunction(() => !window.__karadelik.ui.camera.isActive(), null, { timeout: 30000 });
}
async function settleRender(page, quietMs = 1500, maxMs = 40000) {
  const t0 = Date.now();
  let last = -1;
  let lastChange = Date.now();
  while (Date.now() - t0 < maxMs) {
    const f = (await ST(page)).frames;
    if (f !== last) { last = f; lastChange = Date.now(); }
    else if (Date.now() - lastChange > quietMs) return true;
    await sleep(250);
  }
  return false;
}
/** Hızlı mantık testleri için ucuz render. */
async function cheap(page) {
  await page.evaluate(() => window.__karadelik.ui.set({ animate: false, resolutionScale: 0.1, bloom: false }));
}

// ---------------------------------------------------------------- CDP dokunma yardımcıları
async function touchSeq(page, frames) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
  await send('touchStart', frames[0]);
  for (let i = 1; i < frames.length; i++) { await send('touchMove', frames[i]); await sleep(16); }
  await send('touchEnd', []);
  await cdp.detach();
}
const lerpPts = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a.map((p, k) => ({ x: p.x + ((b[k].x - p.x) * i) / n, y: p.y + ((b[k].y - p.y) * i) / n })));

// ================================================================== MANTIK TESTLERİ (masaüstü, fare)
async function logicDesktop() {
  console.log('\n== Masaüstü 1440×900 — mantık testleri ==');
  const { ctx, page } = await openPage({ width: 1440, height: 900 });
  await cheap(page);
  await page.evaluate(() => window.__karadelik.ui.open());
  await settleRender(page, 800, 20000);

  // --- bilgi ekranı ↔ physics
  const readInfo = () =>
    page.$$eval('[data-info]', (els) => Object.fromEntries(els.map((e) => [e.dataset.info, parseFloat(e.querySelector('.v').dataset.value)])));
  await page.evaluate(() => window.__karadelik.ui.set({ a: 0, prograde: true, thetaCam: 85 * Math.PI / 180, rCam: 50 }));
  await settleCamera(page);
  let info = await readInfo();
  check('a=0: r₊ = 2', near(info.rPlus, 2, 1e-12), String(info.rPlus));
  check('a=0: r_ph = 3 (prograd & retrograd)', near(info.rPhPro, 3, 1e-12) && near(info.rPhRetro, 3, 1e-12));
  check('a=0: r_isco = 6', near(info.rIsco, 6, 1e-12), String(info.rIsco));
  check('a=0: ergosfer = 2, r₋ = 0, Ω_H = 0', near(info.ergo, 2) && info.rMinus === 0 && info.omegaH === 0);
  check('a=0: gölge genişliği = yüksekliği = 6√3', near(info.shadowW, 6 * Math.sqrt(3), 1e-6) && near(info.shadowH, 6 * Math.sqrt(3), 1e-6), `${info.shadowW}, ${info.shadowH}`);
  check('a=0: açısal gölge ψ (r=50) = asin(3√3√(1−2/50)/50)', near(info.shadowAng, Math.asin(3 * Math.sqrt(3) * Math.sqrt(1 - 2 / 50) / 50), 1e-12), String(info.shadowAng));
  check('açısal gölge formülü: r=1e6 → sinψ·r → 3√3', near(schwarzschildShadowSin(1e6) * 1e6, 3 * Math.sqrt(3), 2e-6), String(schwarzschildShadowSin(1e6) * 1e6));
  check('a=0: η ≈ 0,0572', Math.abs(info.eta - 0.0572) < 1e-4, String(info.eta));
  check('a=0: Page–Thorne T_max konumu ≈ 9,55 M', Math.abs(info.tPeak - 9.55) < 0.05, String(info.tPeak));

  for (const [a, pro] of [[0.9, true], [0.9, false], [0.998, true]]) {
    await page.evaluate(([a, pro]) => window.__karadelik.ui.set({ a, prograde: pro, thetaCam: 75 * Math.PI / 180, rCam: 50 }), [a, pro]);
    await settleCamera(page);
    await sleep(150);
    const p = await P(page);
    info = await readInfo();
    const hz = horizonRadii(1, a);
    const sh = shadowBoundary(1, a, p.thetaCam, 180);
    const al = sh.map((s) => s.alpha), be = sh.map((s) => s.beta);
    const exp = {
      rPlus: hz.rPlus, rMinus: hz.rMinus, ergo: ergosphereRadius(1, a, Math.PI / 2),
      rPhPro: photonOrbitRadius(1, a, true), rPhRetro: photonOrbitRadius(1, a, false), rIsco: iscoRadius(1, a, pro),
      eta: radiativeEfficiency(a, pro), omegaH: frameDraggingOmega(1, a, hz.rPlus, Math.PI / 2),
      shadowW: Math.max(...al) - Math.min(...al), shadowH: Math.max(...be) - Math.min(...be),
      omegaCam: frameDraggingOmega(1, a, p.rCam, p.thetaCam), tPeak: diskTemperaturePeak(1, a, pro).r,
    };
    // tPeak: düz bir maksimumun argmax'ı (altın oran araması) motorlar arası ~1e-8 oynar → 1e-6 toleransı
    const bad = Object.keys(exp).filter((k) => !near(info[k], exp[k], (k === 'tPeak' || k.startsWith('shadow')) ? 1e-6 : 1e-12));
    check(`bilgi ekranı = physics (a=${a}, ${pro ? 'prograd' : 'retrograd'})`, bad.length === 0, bad.length ? `farklı: ${bad.map((k) => `${k} ekran=${info[k]} beklenen=${exp[k]}`).join('; ')} (θ=${p.thetaCam})` : `r_isco=${info.rIsco.toFixed(4)} η=${info.eta.toFixed(4)}`);
  }

  await page.evaluate(() => window.__karadelik.ui.set({ a: 0.5 }));
  await sleep(150);
  check('a>0: açısal gölge satırı "—" (NaN)', Number.isNaN((await readInfo()).shadowAng));
  // --- kütle → km
  await page.evaluate(() => { document.querySelector('[data-sec=info]').open = true; });
  await page.evaluate(() => window.__karadelik.ui.set({ a: 0 }));
  await page.fill('#ui-mass', '10');
  await sleep(200);
  const kmTxt = await page.textContent('[data-info=rPlus] .km');
  const expKm = 2 * gravitationalRadiusKm(10);
  check('kütle=10 M☉: r₊ km karşılığı', kmTxt.replace(/\s/g, '').includes(expKm.toFixed(1).replace('.', ',')), `${kmTxt} (beklenen ${expKm.toFixed(2)})`);
  await page.fill('#ui-mass', '-3');
  await sleep(100);
  check('geçersiz kütle uyarısı', await page.isVisible('.mass-err'));
  await page.fill('#ui-mass', '');

  // --- kontroller → setParams
  await page.evaluate(() => window.__karadelik.ui.set({ a: 0.5, disk: true }));
  await page.fill('#ui-a', '0.7');
  check('spin kaydırıcısı → a', near((await P(page)).a, 0.7, 1e-9), String((await P(page)).a));
  await page.click('label[for="ui-prograde-false"]');
  check('retrograd seçimi → prograde=false', (await P(page)).prograde === false);
  await page.click('label[for="ui-prograde-true"]');
  check('prograd seçimi → prograde=true', (await P(page)).prograde === true);
  await page.fill('#ui-Tmax', '500');
  check('T_max log kaydırıcı (500/1000 → √(2000·10⁶)·… )', near((await P(page)).Tmax, 2000 * Math.pow(500, 0.5), 1e-9), String((await P(page)).Tmax));
  await page.fill('#ui-diskOut', '35');
  check('dış yarıçap → diskOut', (await P(page)).diskOut === 35);
  await page.fill('#ui-diskEdgeFade', '0.25');
  check('dış kenar yumuşatma → diskEdgeFade', near((await P(page)).diskEdgeFade, 0.25, 1e-9), String((await P(page)).diskEdgeFade));
  check('diskEdgeFade ESTETİK rozetli', (await page.textContent('[data-ctl=diskEdgeFade] .badge')).trim() === 'ESTETİK');
  check('pozlama GÖSTERİM rozetli', (await page.textContent('[data-ctl=exposure] .badge')).trim() === 'GÖSTERİM');
  check('gölge etiketi "sonsuzdaki gözlemci"', (await page.textContent('[data-info=shadowW] .row-label')).includes('sonsuzdaki gözlemci') && !(await page.textContent('[data-info=shadowW]')).includes('ekrandaki'));
  await page.fill('#ui-fCol', '1.7');
  check('f_col → fCol', near((await P(page)).fCol, 1.7, 1e-9));
  await page.click('label[for="ui-brightnessMode-bolometric"]');
  check('parlaklık modu → bolometric', (await P(page)).brightnessMode === 'bolometric');
  await page.fill('#ui-exposure', '2');
  check('pozlama EV=2 → exposure=4', near((await P(page)).exposure, 4, 1e-9));
  await page.click('label[for="ui-tonemap-agx"]');
  check('ton eşleme → agx', (await P(page)).tonemap === 'agx');
  await page.evaluate(() => window.__karadelik.ui.set({ bloom: true }));
  await sleep(100);
  await page.fill('#ui-bloomStrength', '0.8');
  check('bloom gücü', near((await P(page)).bloomStrength, 0.8, 1e-9));
  await page.uncheck('#ui-bloom');
  await sleep(300);
  check('bloom kapat → bloom=false ve güç kaydırıcısı devre dışı', (await P(page)).bloom === false && (await page.isDisabled('#ui-bloomStrength')));
  await page.uncheck('#ui-turbulence');
  await page.uncheck('#ui-stars');
  await page.fill('#ui-milkyWay', '1.2');
  await page.fill('#ui-fovY', '55');
  await page.check('#ui-animate');
  await sleep(300);
  await page.fill('#ui-timeScale', '40');
  await page.uncheck('#ui-animate');
  let p = await P(page);
  check('türbülans/yıldız/samanyolu/fov/zaman ölçeği', p.turbulence === false && p.stars === false && near(p.milkyWay, 1.2, 1e-9) && p.fovY === 55 && p.timeScale === 40, JSON.stringify({ t: p.turbulence, s: p.stars, mw: p.milkyWay, fov: p.fovY, ts: p.timeScale }));
  await page.click('label[for="ui-performance-quality"]');
  await page.click('label[for="ui-quality-mobile"]');
  await page.fill('#ui-resolutionScale', '0.5');
  p = await P(page);
  check('performans / kalite / çözünürlük ölçeği', p.performance === 'quality' && p.quality === 'mobile' && near(p.resolutionScale, 0.5, 1e-9));
  await page.uncheck('#ui-disk');
  await sleep(1500);
  check('disk kapat → disk=false, Tmax devre dışı', (await P(page)).disk === false && (await page.isDisabled('#ui-Tmax')), `disk=${(await P(page)).disk} dis=${await page.isDisabled('#ui-Tmax')}`);

  // --- ön ayarlar
  const presets = { schwarzschild: [0, 85], kerr09: [0.9, 75], kerr0998: [0.998, 80], faceOn: [0.9, 10] };
  for (const [id, [a, th]] of Object.entries(presets)) {
    await page.click(`[data-preset="${id}"]`);
    await settleCamera(page);
    p = await P(page);
    check(`ön ayar ${id}`, p.a === a && Math.abs(p.thetaCam / DEG - th) < 0.01 && p.disk === true, `a=${p.a} θ=${(p.thetaCam / DEG).toFixed(2)}`);
  }
  await page.click('[data-sec="presets"] summary').catch(() => {});

  // --- tümünü sıfırla
  await page.click('.reset-all');
  await settleCamera(page);
  p = await P(page);
  check('tümünü sıfırla (a=0,9; EV; ton eşleme)', p.a === 0.9 && p.tonemap === 'aces' && near(p.exposure, 0.5) && p.bloom === true);
  await cheap(page);

  // --- kamera: fare
  await page.evaluate(() => window.__karadelik.ui.camera.reset());
  await settleCamera(page);
  const p0 = await P(page);
  await page.mouse.move(600, 450);
  await page.mouse.down();
  await page.evaluate(() => { window.__interSamples = []; const f = () => { window.__interSamples.push(window.__karadelik.renderer.getStats().interacting); window.__rafId = requestAnimationFrame(f); }; f(); });
  for (let i = 1; i <= 20; i++) { await page.mouse.move(600 + i * 5, 450 - i * 2); await sleep(16); }
  await page.mouse.up();
  await settleCamera(page);
  const p1 = await P(page);
  const sawInteracting = await page.evaluate(() => { cancelAnimationFrame(window.__rafId); return window.__interSamples.some(Boolean); });
  check('fare sürükle → phiCam azalır (sağa)', p1.phiCam < p0.phiCam - 0.2, `${p0.phiCam.toFixed(3)} → ${p1.phiCam.toFixed(3)}`);
  check('fare sürükle → thetaCam artar (yukarı)', p1.thetaCam > p0.thetaCam + 0.05, `${(p0.thetaCam / DEG).toFixed(1)}° → ${(p1.thetaCam / DEG).toFixed(1)}°`);
  check('sürükleme sırasında getStats().interacting = true', sawInteracting);

  // atalet: hızlı bırakınca bırakıştan sonra hareket sürer
  await page.evaluate(() => window.__karadelik.ui.camera.reset());
  await settleCamera(page);
  await page.mouse.move(600, 450);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(600 + i * 25, 450); await sleep(10); }
  const beforeUp = (await P(page)).phiCam;
  await page.mouse.up();
  await settleCamera(page);
  const afterInertia = (await P(page)).phiCam;
  check('ataletli hareket (bırakınca devam eder)', afterInertia < beforeUp - 0.02, `${beforeUp.toFixed(3)} → ${afterInertia.toFixed(3)}`);

  // tekerlek
  await page.evaluate(() => window.__karadelik.ui.camera.reset());
  await settleCamera(page);
  await page.mouse.move(600, 450);
  await page.mouse.wheel(0, 300);
  await settleCamera(page);
  const rOut = (await P(page)).rCam;
  await page.mouse.wheel(0, -600);
  await settleCamera(page);
  const rIn = (await P(page)).rCam;
  check('tekerlek aşağı → r büyür, yukarı → küçülür (log)', rOut > 50 * 1.2 && rIn < rOut / 1.4, `50 → ${rOut.toFixed(1)} → ${rIn.toFixed(1)}`);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 3000);
  await settleCamera(page);
  check('r üst sınırı ≤ 150', (await P(page)).rCam <= 150 + 1e-6, String((await P(page)).rCam));
  await page.evaluate(() => window.__karadelik.ui.set({ a: 0.9 }));
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -3000);
  await settleCamera(page);
  const rMinExp = horizonRadii(1, 0.9).rPlus + 3;
  check('r alt sınırı = r₊ + 3 M', near((await P(page)).rCam, rMinExp, 1e-6), `${(await P(page)).rCam.toFixed(4)} (beklenen ${rMinExp.toFixed(4)})`);

  // klavye
  await page.evaluate(() => window.__karadelik.ui.camera.reset());
  await settleCamera(page);
  await page.focus('#sahne');
  const k0 = await P(page);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await settleCamera(page);
  const kL = await P(page);
  await page.keyboard.press('ArrowUp'); await settleCamera(page);
  const kU = await P(page);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await settleCamera(page);
  const kD = await P(page);
  await page.keyboard.press('+'); await settleCamera(page);
  const kP = await P(page);
  await page.keyboard.press('-'); await page.keyboard.press('-'); await settleCamera(page);
  const kM = await P(page);
  check('klavye: ←/→ azimut', kL.phiCam > k0.phiCam + 0.05, `${k0.phiCam.toFixed(3)} → ${kL.phiCam.toFixed(3)}`);
  check('klavye: ↑ eğim artar, ↓ azalır', kU.thetaCam > k0.thetaCam && kD.thetaCam < kU.thetaCam);
  check('klavye: + yakınlaştırır, − uzaklaştırır', kP.rCam < k0.rCam && kM.rCam > kP.rCam);
  await page.keyboard.press('Home'); await settleCamera(page);
  const kH = await P(page);
  check('klavye: Home → varsayılan', near(kH.rCam, 50, 1e-6) && Math.abs(kH.thetaCam - 75 * DEG) < 1e-6 && Math.abs(kH.phiCam) < 1e-6);

  // slider üstünde oklar kamerayı oynatmamalı
  await page.focus('#ui-a');
  const th0 = (await P(page)).thetaCam;
  await page.keyboard.press('ArrowUp');
  await sleep(200);
  check('kaydırıcıda ok tuşu kamerayı oynatmaz', (await P(page)).thetaCam === th0);

  // çift tıklama sıfırlama
  await page.evaluate(() => window.__karadelik.ui.camera.setTarget({ phi: 2, theta: 40 * Math.PI / 180, r: 20 }));
  await settleCamera(page);
  await page.mouse.dblclick(600, 450);
  await settleCamera(page);
  const dc = await P(page);
  check('çift tıklama → varsayılan kamera', near(dc.rCam, 50, 1e-6) && Math.abs(dc.thetaCam - 75 * DEG) < 1e-6 && Math.abs(dc.phiCam) < 1e-6);

  // 89,5°–90,5° bandı
  await page.evaluate(() => { window.__thetaLog.length = 0; });
  await page.mouse.move(600, 450);
  await page.mouse.down();
  for (let i = 1; i <= 80; i++) { await page.mouse.move(600, 450 - i * 2); await sleep(8); }
  await page.mouse.up();
  await settleCamera(page);
  const thLog = await page.evaluate(() => window.__thetaLog);
  const inBand = thLog.filter((t) => t > 89.5 * DEG && t < 90.5 * DEG);
  const maxTh = Math.max(...thLog) / DEG;
  check('eğim sürüklenirken 89,5°–90,5° bandı hiç yazılmadı', thLog.length > 5 && inBand.length === 0 && maxTh > 95, `${thLog.length} yazım, maks θ=${maxTh.toFixed(1)}°`);
  await page.evaluate(() => window.__karadelik.ui.camera.setTarget({ theta: 90 * Math.PI / 180 }));
  await settleCamera(page);
  const t90 = (await P(page)).thetaCam / DEG;
  check('θ=90° istenirse banttan kıyıya kayar', t90 <= 89.5 + 1e-9 || t90 >= 90.5 - 1e-9, `${t90.toFixed(3)}°`);
  await page.evaluate(() => window.__karadelik.ui.camera.setTarget({ theta: 0 }));
  await settleCamera(page);
  check('θ alt sınırı 1°', Math.abs((await P(page)).thetaCam / DEG - 1) < 1e-6);
  await page.evaluate(() => window.__karadelik.ui.camera.setTarget({ theta: Math.PI }));
  await settleCamera(page);
  check('θ üst sınırı 179°', Math.abs((await P(page)).thetaCam / DEG - 179) < 1e-6);

  // panel aç/kapa + Esc
  await page.evaluate(() => window.__karadelik.ui.camera.reset());
  await page.click('#panel-toggle');
  await sleep(800);
  check('panel aç/kapa düğmesi (aria-expanded=false)', (await page.getAttribute('#panel-toggle', 'aria-expanded')) === 'false' && !(await page.isVisible('#panel')));
  await page.click('#panel-toggle');
  // Sabit bekleme yerine koşul: SwiftShader'da render ana iş parçacığını yüzlerce ms meşgul edebilir.
  await page.waitForFunction(() => window.__karadelik.ui.isOpen() && !document.getElementById('panel').hasAttribute('inert') && getComputedStyle(document.getElementById('panel')).visibility === 'visible' && getComputedStyle(document.getElementById('ui-a')).visibility === 'visible', null, { timeout: 15000 });
  await page.focus('#ui-a');
  const focAfter = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  check('panel açıkken kaydırıcıya odak verilebilir', focAfter === 'ui-a', focAfter);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__karadelik.ui.isOpen() && document.activeElement?.id === 'panel-toggle' && getComputedStyle(document.getElementById('panel')).visibility === 'hidden', null, { timeout: 15000 }).catch(() => {});
  const preEsc = await page.evaluate(() => { const el = document.getElementById('ui-a'); const d = el?.closest('details'); return { detailsOpen: d ? d.open : null, disabled: el?.disabled, rect: el?.getBoundingClientRect().height }; });
  const escSt = await page.evaluate(() => ({ open: window.__karadelik.ui.isOpen(), active: document.activeElement?.id || document.activeElement?.tagName }));
  check('Esc paneli kapatır, odak düğmeye döner', !(await page.isVisible('#panel')) && escSt.active === 'panel-toggle', JSON.stringify({ ...escSt, ...preEsc, focAfter }));
  await page.click('#panel-toggle');
  await page.waitForFunction(() => window.__karadelik.ui.isOpen() && !document.getElementById('panel').hasAttribute('inert') && getComputedStyle(document.getElementById('panel')).visibility === 'visible' && getComputedStyle(document.getElementById('ui-a')).visibility === 'visible', null, { timeout: 15000 });

  // ekran görüntüsü indirme
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('button[aria-label="Ekran görüntüsü indir"]')]);
  const dlPath = path.join(OUT, 'indirilen-' + dl.suggestedFilename());
  await dl.saveAs(dlPath);
  const sig = fs.readFileSync(dlPath).subarray(0, 8).toString('hex');
  check('ekran görüntüsü indirme (PNG)', sig === '89504e470d0a1a0a' && fs.statSync(dlPath).size > 1000, `${dl.suggestedFilename()} ${fs.statSync(dlPath).size} B`);

  // klavye gezinmesi: Tab ile odak halkası olan öğeye ulaşılır
  await page.focus('#panel-toggle');
  let reached = 0;
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => !!document.activeElement?.closest('#panel'))) reached++; }
  check('Tab ile panel öğelerine gezinme', reached >= 3, `${reached}/12`);
  const a11y = await page.evaluate(() => {
    const unlabeled = [...document.querySelectorAll('#ui input, #ui button, #ui select')].filter((e) => {
      const lab = e.getAttribute('aria-label') || (e.labels && e.labels.length) || e.textContent.trim() || e.getAttribute('aria-labelledby');
      return !lab;
    }).map((e) => e.id || e.className);
    return unlabeled;
  });
  check('etiketsiz form öğesi yok', a11y.length === 0, a11y.join(','));

  await ctx.close();
}

// ================================================================== DOKUNMATİK (telefon)
async function logicTouch() {
  console.log('\n== Telefon 375×812 (hasTouch) — dokunmatik testleri ==');
  const { ctx, page } = await openPage({ width: 375, height: 812, touch: true });
  await cheap(page);
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const p00 = await P(page);
  check('dokunmatik cihazda mobil kalite varsayılanları', coarse ? p00.quality === 'mobile' && p00.performance === 'battery' : true, `coarse=${coarse} quality=${p00.quality}`);
  check('telefonda panel başlangıçta kapalı', !(await page.evaluate(() => window.__karadelik.ui.isOpen())));
  await page.evaluate(() => window.__karadelik.ui.camera.reset());
  await settleCamera(page);

  const base = await P(page);
  await touchSeq(page, lerpPts([{ x: 200, y: 300 }], [{ x: 120, y: 360 }], 10));
  await settleCamera(page);
  const d1 = await P(page);
  check('tek parmak sürükle → yörünge', Math.abs(d1.phiCam - base.phiCam) > 0.2 && Math.abs(d1.thetaCam - base.thetaCam) > 0.1 && Math.abs(d1.rCam - base.rCam) < 1e-6, `Δφ=${(d1.phiCam - base.phiCam).toFixed(2)} Δθ=${((d1.thetaCam - base.thetaCam) / DEG).toFixed(1)}°`);

  await page.evaluate(() => window.__karadelik.ui.camera.reset());
  await settleCamera(page);
  const pb = await P(page);
  await touchSeq(page, lerpPts([{ x: 160, y: 400 }, { x: 215, y: 400 }], [{ x: 90, y: 400 }, { x: 285, y: 400 }], 12));
  await settleCamera(page);
  const pz = await P(page);
  check('iki parmak açma (pinch) → yakınlaştırma', pz.rCam < pb.rCam * 0.6 && Math.abs(pz.phiCam - pb.phiCam) < 0.05, `r: ${pb.rCam} → ${pz.rCam.toFixed(1)}`);
  const pz1 = pz.rCam;
  await touchSeq(page, lerpPts([{ x: 90, y: 400 }, { x: 285, y: 400 }], [{ x: 150, y: 400 }, { x: 225, y: 400 }], 12));
  await settleCamera(page);
  check('iki parmak kapama → uzaklaştırma', (await P(page)).rCam > pz1 * 1.5, `${pz1.toFixed(1)} → ${(await P(page)).rCam.toFixed(1)}`);

  // çift dokunma
  const cdp = await page.context().newCDPSession(page);
  const tap = async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 300, id: 1 }] }); await sleep(30); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  await tap(); await sleep(90); await tap();
  await settleCamera(page);
  const dt = await P(page);
  check('çift dokunma → varsayılan kamera', near(dt.rCam, 50, 1e-6) && Math.abs(dt.thetaCam - 75 * DEG) < 1e-6 && Math.abs(dt.phiCam) < 1e-6);
  await cdp.detach();

  // panel (sheet)
  await page.tap('#panel-toggle');
  await sleep(500);
  check('telefon: panel alttan açılır (sheet)', await page.evaluate(() => {
    const r = document.getElementById('panel').getBoundingClientRect();
    return r.bottom >= innerHeight - 1 && r.top > innerHeight * 0.3 && r.width >= innerWidth - 1;
  }));
  const cv = await page.evaluate(() => { const r = document.getElementById('sahne').getBoundingClientRect(); const s = document.getElementById('panel').getBoundingClientRect(); return { h: r.height, sheetTop: s.top }; });
  check('telefon: sahne sheet üstünde kalan alana sığar (dock)', Math.abs(cv.h - cv.sheetTop) < 2, `canvas h=${cv.h} sheet top=${cv.sheetTop}`);
  // dokunmatik kaydırıcı ile spin
  await page.fill('#ui-a', '0.3');
  check('dokunmatik: kaydırıcı → a', near((await P(page)).a, 0.3, 1e-9));
  // aşağı kaydırarak kapat
  const bbox = await page.evaluate(() => { const r = document.querySelector('.panel-head').getBoundingClientRect(); return { x: r.x + 120, y: r.y + 14 }; });
  await touchSeq(page, lerpPts([{ x: bbox.x, y: bbox.y }], [{ x: bbox.x, y: bbox.y + 140 }], 8));
  await sleep(500);
  check('telefon: başlıktan aşağı kaydırınca sheet kapanır', !(await page.evaluate(() => window.__karadelik.ui.isOpen())));
  await ctx.close();
}

// ================================================================== EKRAN GÖRÜNTÜLERİ
const VIEWS = [
  { name: '375x812-iphone', width: 375, height: 812, touch: true },
  { name: '768x1024-ipad-dikey', width: 768, height: 1024, touch: true },
  { name: '1024x768-ipad-yatay', width: 1024, height: 768, touch: true },
  { name: '1440x900-masaustu', width: 1440, height: 900, touch: false },
];

async function layoutAudit(page, label, touch) {
  const r = await page.evaluate(() => {
    const vis = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]') && !e.closest('details:not([open]) > .sec-body'); };
    const small = [];
    for (const e of document.querySelectorAll('#ui button, #ui input[type=range], #ui .seg label, #ui .switch, #ui summary, #ui input[type=number]')) {
      if (!vis(e) || !e.closest('#panel, .toolbar')) continue;
      const b = e.getBoundingClientRect();
      if (b.height < 43.5 || b.width < 43.5) small.push(`${e.tagName.toLowerCase()}.${(e.className || e.id || '').toString().slice(0, 24)} ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    const panel = document.getElementById('panel');
    const pb = panel.getBoundingClientRect();
    return {
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      small,
      panelInside: pb.left >= -1 && pb.right <= innerWidth + 1 && pb.top >= -1 && pb.bottom <= innerHeight + 1,
      canvas: (() => { const c = document.getElementById('sahne').getBoundingClientRect(); return `${Math.round(c.width)}×${Math.round(c.height)}`; })(),
    };
  });
  check(`[${label}] yatay taşma yok`, !r.overflowX);
  check(`[${label}] panel görünümün içinde`, r.panelInside);
  if (touch) check(`[${label}] dokunma hedefleri ≥ 44 px`, r.small.length === 0, r.small.slice(0, 6).join('; '));
  return r;
}

async function screenshots() {
  console.log('\n== Ekran görüntüleri ==');
  for (const v of VIEWS) {
    const { ctx, page } = await openPage(v);
    // durağan, belirli desen; telefon/iPad kalite varsayılanı korunur
    await page.evaluate(() => window.__karadelik.ui.set({ animate: false, diskTime: 40, resolutionScale: 0.5 }));
    await page.evaluate(() => window.__karadelik.ui.open());
    await settleRender(page);
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${v.name}-${n}.png`) });
    await shot('panel-acik');
    await layoutAudit(page, `${v.name} panel açık`, v.touch);
    // alt bölümleri aç: ölçek için bilgi + performans
    await page.evaluate(() => {
      document.querySelectorAll('.sec').forEach((d) => (d.open = d.dataset.sec === 'info' || d.dataset.sec === 'stats'));
      document.querySelector('[data-sec=info]').scrollIntoView();
    });
    await page.fill('#ui-mass', '10');
    await sleep(300);
    await page.click('[data-info=rIsco] .row-label');
    await sleep(300);
    await shot('bilgi');
    await layoutAudit(page, `${v.name} bilgi açık`, v.touch);
    await page.fill('#ui-mass', '');
    await page.evaluate(() => {
      document.querySelectorAll('.sec').forEach((d) => (d.open = ['bh', 'camera', 'disk'].includes(d.dataset.sec)));
      document.querySelector('.panel-scroll').scrollTop = 0;
    });
    await sleep(200);
    await shot('kontroller');
    await page.evaluate(() => window.__karadelik.ui.close());
    await settleRender(page, 1000, 30000);
    await sleep(500);
    await shot('panel-kapali');
    const st = await ST(page);
    check(`[${v.name}] kapalıyken tuval tam ekran`, st.width >= v.width - 1);
    await ctx.close();
  }
}

try {
  if (ONLY !== 'shots') { await logicDesktop(); await logicTouch(); }
  if (ONLY !== 'logic') await screenshots();
} catch (e) {
  console.error('TEST HATASI:', e);
  results.push({ name: 'beklenmeyen hata', ok: false, detail: String(e?.stack || e) });
} finally {
  await browser.close();
  await server.close();
}

console.log('\n== Konsol ==');
const relevant = consoleErrors.filter((e) => !/GPU stall|ReadPixels/i.test(e));
check('konsolda hata/uyarı yok', relevant.length === 0, relevant.slice(0, 5).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\nÖZET: ${results.length - failed.length}/${results.length} geçti${failed.length ? ' — BAŞARISIZ: ' + failed.map((f) => f.name).join('; ') : ''}`);
console.log(`Ekran görüntüleri: ${OUT}`);
process.exit(failed.length ? 1 : 0);
