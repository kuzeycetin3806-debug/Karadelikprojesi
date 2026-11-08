/**
 * Arayüz doğrulaması (Playwright, headless Chromium + SwiftShader). `node --test` ile ÇALIŞMAZ.
 *   node tests/ui/ui-check.mjs [--out=/tmp/karadelik-ui] [--only=shots|logic|shell]
 * - Kontroller → setParams, fare/dokunmatik/klavye kamera etkisi, bilgi ekranı ↔ physics, konsol hatası.
 * - 375×812, 768×1024, 1024×768, 1440×900 ekran görüntüleri.
 * v3 (sade arayüz): 2 kalıcı düğme (i, …) + sahne şeridi, sahne kartları → setParams, bilgi kartı, etiketler (--only=scenes).
 * - Basit/Gelişmiş mod, … menüsü, Kılavuz/Gizlilik, bağımsız sayfalar, imza, Apple cihaz profilleri (Chromium + Playwright devices; WebKit motoru yok).
 *   --apple-out=/tmp/karadelik-apple  --only=apple|simple|docs
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
const PWA_OUT = args['pwa-out'] || '/tmp/karadelik-pwa';
const APPLE_OUT = args['apple-out'] || '/tmp/karadelik-apple';
fs.mkdirSync(APPLE_OUT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PWA_OUT, { recursive: true });

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

async function openPage({ width, height, touch = false, device = null, dpr = 1, colorScheme = 'dark', init = null }) {
  const ctx = await browser.newContext(device
    ? { ...device, deviceScaleFactor: dpr, reducedMotion: 'reduce', colorScheme }
    : { viewport: { width, height }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce', colorScheme });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const tag = device ? (device.__name || 'device') : `${width}x${height}`;
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      // SwiftShader/Chromium'un okuma uyarısı: test kodundan değil; yine de listele
      consoleErrors.push(`[${tag}] [${m.type()}] ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] [pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__karadelik?.ui, null, { timeout: 60000 });
  // SwiftShader'da tam çözünürlüklü animasyonlu kare saniyeler sürer: ilk kare ucuz olsun (testler gerektiğinde kendi ayarını yapar)
  await page.evaluate(() => window.__karadelik.ui.set({ animate: false, resolutionScale: 0.25 }));
  // açılış ekranı ilk kare çizilince kalkar (önce pointer-events'i keser, sonra DOM'dan çıkar)
  await page.waitForSelector('#splash', { state: 'detached', timeout: 90000 });
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

/** "…" menüsünü açıp öğeye tıklar (menü öğeleri: guide | about | privacy | fullscreen | install). */
async function openMenuItem(page, id) {
  if (!(await page.isVisible('#app-menu'))) await page.click('#menu-toggle');
  await page.waitForSelector(`#app-menu [data-menu=${id}]`, { state: 'visible', timeout: 10000 });
  await page.click(`#app-menu [data-menu=${id}]`);
}
/** Ayarlar panelini "…" menüsünden açar (kalıcı Ayarlar düğmesi yok). */
async function openSettings(page) {
  if (await page.evaluate(() => window.__karadelik.ui.isOpen())) return;
  await openMenuItem(page, 'settings');
  await page.waitForFunction(() => window.__karadelik.ui.isOpen() && !document.getElementById('panel').hasAttribute('inert') && getComputedStyle(document.getElementById('panel')).visibility === 'visible', null, { timeout: 15000 });
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
  // tüm kontroller Gelişmiş modda (Basit mod ayrı denetlenir: simpleChecks)
  await page.click('label[for="ui-mode-advanced"]');
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
    await page.waitForFunction(() => document.querySelector('[data-info=rPlus] .v')?.dataset.value !== undefined);
    await sleep(100);
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
  await page.waitForFunction(() => document.getElementById('ui-Tmax').disabled, null, { timeout: 30000 });
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

  // ayarlar: menüden aç/kapa + Esc (kalıcı Ayarlar düğmesi yok; Ayarlar "…" menüsündedir)
  await page.evaluate(() => window.__karadelik.ui.camera.reset());
  await openMenuItem(page, 'settings');
  await page.waitForFunction(() => !window.__karadelik.ui.isOpen() && getComputedStyle(document.getElementById('panel')).visibility === 'hidden', null, { timeout: 30000 });
  check('menü → Ayarlar öğesi paneli kapatır (anahtar davranışı)', !(await page.isVisible('#panel')));
  await openMenuItem(page, 'settings');
  await page.waitForFunction(() => window.__karadelik.ui.isOpen() && !document.getElementById('panel').hasAttribute('inert') && getComputedStyle(document.getElementById('panel')).visibility === 'visible' && getComputedStyle(document.getElementById('ui-a')).visibility === 'visible', null, { timeout: 15000 });
  await page.focus('#ui-a');
  const focAfter = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  check('ayarlar açıkken kaydırıcıya odak verilebilir', focAfter === 'ui-a', focAfter);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__karadelik.ui.isOpen() && getComputedStyle(document.getElementById('panel')).visibility === 'hidden', null, { timeout: 15000 }).catch(() => {});
  const escSt = await page.evaluate(() => ({ open: window.__karadelik.ui.isOpen(), active: document.activeElement?.id || document.activeElement?.tagName }));
  check('Esc ayarları kapatır, odak “…” düğmesine döner', !(await page.isVisible('#panel')) && escSt.active === 'menu-toggle', JSON.stringify({ ...escSt, focAfter }));
  await openSettings(page);

  // ekran görüntüsü indirme
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), openMenuItem(page, 'screenshot')]);
  const dlPath = path.join(OUT, 'indirilen-' + dl.suggestedFilename());
  await dl.saveAs(dlPath);
  const sig = fs.readFileSync(dlPath).subarray(0, 8).toString('hex');
  check('ekran görüntüsü indirme (PNG)', sig === '89504e470d0a1a0a' && fs.statSync(dlPath).size > 1000, `${dl.suggestedFilename()} ${fs.statSync(dlPath).size} B`);

  // klavye gezinmesi: Tab ile odak halkası olan öğeye ulaşılır
  await page.focus('#menu-toggle');
  let reached = 0;
  for (let i = 0; i < 24; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => !!document.activeElement?.closest('#panel'))) reached++; }
  check('Tab ile panel öğelerine gezinme (sahne kartlarından sonra)', reached >= 3, `${reached}/24`);
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
  const hasAuto = await page.evaluate(() => window.__karadelik.ui.hasAuto);
  check('dokunmatik cihazda arayüz kendi performans varsayılanını koymaz: renderer “auto” (yoksa eski mobil/pil geri dönüşü)', !coarse || (hasAuto ? p00.performance === 'auto' : p00.quality === 'mobile' && p00.performance === 'battery'), `coarse=${coarse} auto=${hasAuto} performance=${p00.performance} quality=${p00.quality} scale=${p00.resolutionScale}`);
  check('telefonda ayarlar paneli başlangıçta kapalı', !(await page.evaluate(() => window.__karadelik.ui.isOpen())));
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
  await page.tap('#menu-toggle');
  await page.tap('#app-menu [data-menu=settings]');
  await page.waitForFunction(() => { const p = document.getElementById('panel'); const r = p.getBoundingClientRect(); return getComputedStyle(p).visibility === 'visible' && r.bottom >= innerHeight - 1 && r.top < innerHeight * 0.7; }, null, { timeout: 30000 });
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
  await page.waitForFunction(() => !window.__karadelik.ui.isOpen(), null, { timeout: 30000 }).catch(() => {});
  check('telefon: başlıktan aşağı kaydırınca sheet kapanır', !(await page.evaluate(() => window.__karadelik.ui.isOpen())));
  await ctx.close();
}


// ================================================================== KABUK / PWA KONTROLLERİ
const pngSize = (f) => { const b = fs.readFileSync(f); return b.readUInt32BE(8) === 0x0d0a1a0a || b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
const NO_GL2 = () => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : orig.call(this, type, ...rest); };
};

function manifestChecks() {
  console.log('\n== Manifest ve ikonlar ==');
  const pub = path.join(PROJECT_ROOT, 'public');
  let m = null;
  try { m = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.webmanifest'), 'utf8')); } catch (e) { /* aşağıda başarısız */ }
  check('manifest geçerli JSON', !!m);
  if (!m) return;
  check('manifest: ad/kısa ad/dil', m.name === 'Kara Delik Simülasyonu' && m.short_name === 'Kara Delik' && m.lang === 'tr');
  check('manifest: göreli start_url/scope', m.start_url === './' && m.scope === './');
  check('manifest: display standalone + override', m.display === 'standalone' && m.display_override?.join() === 'fullscreen,standalone' && m.orientation === 'any');
  check('manifest: renkler ve kategoriler', m.background_color === '#000000' && /^#[0-9a-f]{6}$/i.test(m.theme_color) && m.categories?.join() === 'education,science');
  const bad = [];
  for (const ic of m.icons) {
    if (/^(\/|[a-z]+:)/i.test(ic.src)) bad.push(`mutlak yol: ${ic.src}`);
    const f = path.join(pub, ic.src);
    if (!fs.existsSync(f)) { bad.push(`yok: ${ic.src}`); continue; }
    if (ic.type === 'image/png') {
      const [w, h] = pngSize(f) || [0, 0];
      if (`${w}x${h}` !== ic.sizes) bad.push(`${ic.src}: ${w}x${h} ≠ ${ic.sizes}`);
    }
  }
  check('manifest: ikon dosyaları var, boyutlar doğru, yollar göreli', bad.length === 0, bad.join('; '));
  const has = (sz, purpose) => m.icons.some((i) => i.sizes === sz && i.purpose === purpose);
  check('manifest: 192, 512, 512 maskable, 180 ikonları', has('192x192', 'any') && has('512x512', 'any') && has('512x512', 'maskable') && has('180x180', 'any'));
  check('favicon dosyaları (svg + 32 px png)', fs.existsSync(path.join(pub, 'icons/favicon.svg')) && pngSize(path.join(pub, 'icons/favicon-32.png'))?.join('x') === '32x32');
  check('sw.js mevcut', fs.existsSync(path.join(pub, 'sw.js')));
}

async function rawPage(opts = {}, init) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 }, reducedMotion: 'reduce', ...opts });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  return { ctx, page, errs };
}

async function shellChecks() {
  console.log('\n== Kabuk: splash, hakkında, yardım, hata ekranı ==');
  const { ctx, page } = await openPage({ width: 1440, height: 900 });
  check('splash ilk kareden sonra kayboldu', (await page.$('#splash')) === null && (await ST(page)).frames > 0);
  const head = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
    touch: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
    capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content,
    bar: document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]')?.content,
    title: document.querySelector('meta[name=apple-mobile-web-app-title]')?.content,
    themes: document.querySelectorAll('meta[name=theme-color]').length,
    desc: !!document.querySelector('meta[name=description]')?.content,
    og: !!document.querySelector('meta[property="og:title"]') && !!document.querySelector('meta[property="og:description"]'),
    vp: document.querySelector('meta[name=viewport]')?.content,
  }));
  check('index.html: manifest + apple-touch-icon bağlı', /manifest\.webmanifest$/.test(head.manifest) && /apple-touch-icon\.png$/.test(head.touch), JSON.stringify(head));
  check('index.html: iOS meta, theme-color ×2, description, og, viewport-fit=cover', head.capable === 'yes' && head.bar === 'black-translucent' && head.title && head.themes === 2 && head.desc && head.og && /viewport-fit=cover/.test(head.vp));
  check('dev sunucuda service worker kaydedilmedi', (await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))) === 0);

  // kılavuz (eski Yardım ile birleşti): ? ile Kontroller bölümü açılır, Esc ile kapanır
  await page.keyboard.press('?');
  await page.waitForSelector('#dlg-guide[open]', { timeout: 10000 });
  check('? → kılavuz penceresi açılır', await page.isVisible('#dlg-guide'));
  check('? → kılavuz Kontroller bölümüne kaydırır', await page.evaluate(() => { const b = document.querySelector('#dlg-guide .dlg-body').getBoundingClientRect(); const t = document.getElementById('guide-controls').getBoundingClientRect(); return t.top >= b.top - 2 && t.top < b.top + b.height * 0.5; }));
  check('kılavuz: fare/dokunmatik/klavye alt başlıkları', (await page.$$eval('#guide-camera h4', (e) => e.map((x) => x.textContent))).join() === 'Fare,Dokunmatik ekran,Klavye');
  check('kılavuz: 9 bölüm (başlarken, kara delik nedir, sahneler…sorun giderme), tekrar eden Yardım penceresi yok', (await page.$$eval('#dlg-guide .doc-sec > h3', (e) => e.map((x) => x.textContent))).join('|') === 'Başlarken|Kara delik nedir?|Sahneler ve etiketler|Kamerayı kontrol etme|Ayarlar|Ne görüyorsunuz?|Performans ipuçları|Uygulamayı yükleme|Sorun giderme' && (await page.$('#dlg-help')) === null);
  check('kılavuz: “Tam sayfa aç” bağlantısı kilavuz.html', (await page.getAttribute('#dlg-guide a.dlg-full', 'href')).endsWith('kilavuz.html'));
  const th0 = (await P(page)).thetaCam;
  await page.keyboard.press('ArrowUp');
  check('diyalog açıkken ok tuşu kamerayı oynatmaz', (await P(page)).thetaCam === th0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('dlg-guide').open, null, { timeout: 10000 });
  check('Esc kılavuz penceresini kapatır', !(await page.isVisible('#dlg-guide')));

  // hakkında
  await openMenuItem(page, 'about');
  await page.waitForSelector('#dlg-about[open]', { timeout: 10000 });
  const txt = await page.textContent('#dlg-about');
  check('hakkında: kaynaklar (Bardeen, BPT, Page–Thorne, Luminet)', /Bardeen, J\. M\. \(1973\)/.test(txt) && /Press, W\. H\./.test(txt) && /Page, D\. N\./.test(txt) && /Luminet/.test(txt));
  check('hakkında: FİZİKSEL/ESTETİK/GÖSTERİM + telif + sürüm', /FİZİKSEL/.test(txt) && /ESTETİK/.test(txt) && /GÖSTERİM/.test(txt) && /Telif hakkı © 2026 kuzeycetin3806-debug — Tüm hakları saklıdır/.test(txt) && /Sürüm \d+\.\d+\.\d+/.test(txt));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('dlg-about').open, null, { timeout: 10000 });
  check('Esc hakkında penceresini kapatır, odak “…” düğmesine döner', (await page.evaluate(() => document.activeElement?.id)) === 'menu-toggle');
  check('hakkında: imza + Kılavuz/Gizlilik bağlantıları', /App design by Kuzey Çetin/.test(txt) && /Kullanım kılavuzu/.test(txt) && /Gizlilik politikası/.test(txt));
  await page.click('#menu-toggle');
  check('tam ekran menü öğesi (destekleniyorsa görünür)', await page.evaluate(() => { const b = document.querySelector('[data-menu=fullscreen]'); return document.fullscreenEnabled ? !b.hidden : b.hidden; }));

  // yükleme: olay yokken menü öğesi gizli; sahte beforeinstallprompt ile görünür
  check('yükle menü öğesi olay yokken gizli', !(await page.isVisible('[data-menu=install]')));
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt');
    e.prompt = () => { window.__prompted = 1; return Promise.resolve(); };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await page.click('#menu-toggle');
  await page.waitForSelector('[data-menu=install]', { state: 'visible', timeout: 5000 });
  await page.click('[data-menu=install]');
  await page.waitForFunction(() => window.__prompted === 1 && document.querySelector('[data-menu=install]').hidden, null, { timeout: 5000 });
  check('beforeinstallprompt → menü öğesi görünür, tıklayınca prompt(), sonra gizlenir', true);

  // standalone sınıfı: seçim/uzun basma kapalı
  const sa = await page.evaluate(() => { document.documentElement.classList.add('standalone'); const cs = getComputedStyle(document.getElementById('sahne')); return { us: cs.userSelect, ta: cs.touchAction }; });
  check('standalone: sahnede metin seçimi kapalı, touch-action none', sa.us === 'none' && sa.ta === 'none', JSON.stringify(sa));
  await ctx.close();

  // bağlam kaybı → hata ekranı, geri gelince kalkar (kendi bağlamı: konsol uyarıları sayılmaz)
  {
    const r = await rawPage();
    await r.page.goto(url, { waitUntil: 'load' });
    await r.page.waitForSelector('#splash', { state: 'detached', timeout: 90000 });
    await r.page.evaluate(() => { window.__lose = window.__karadelik.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
    await r.page.waitForSelector('.fatal[data-fatal=lost]', { timeout: 10000 });
    check('bağlam kaybı → anlaşılır ekran (role=alert), sayfa hatası yok', (await r.page.getAttribute('.fatal', 'role')) === 'alert' && r.errs.length === 0, r.errs.join('|'));
    await r.page.evaluate(() => window.__lose.restoreContext());
    await r.page.waitForSelector('.fatal', { state: 'detached', timeout: 15000 }).catch(() => {});
    check('bağlam geri gelince hata ekranı kalkar', (await r.page.$('.fatal')) === null);
    await r.ctx.close();
  }
  // WebGL2 yok → hata ekranı
  {
    const r = await rawPage({}, NO_GL2);
    await r.page.goto(url, { waitUntil: 'load' });
    await r.page.waitForSelector('.fatal[data-fatal=init]', { timeout: 30000 });
    const f = await r.page.evaluate(() => ({ text: document.querySelector('.fatal').textContent, splash: !!document.getElementById('splash'), app: !!window.__karadelik }));
    check('WebGL2 yok → hata ekranı (gerekenler listesi), çökme yok', /WebGL 2/.test(f.text) && /donanım hızlandırma/.test(f.text) && /Safari/.test(f.text) && r.errs.length === 0, r.errs.join('|'));
    await new Promise((res) => setTimeout(res, 1300));
    check('WebGL2 yok → açılış ekranı hata ekranının altında kalmaz', (await r.page.$('#splash')) === null || (await r.page.evaluate(() => getComputedStyle(document.getElementById('splash')).visibility)) === 'hidden');
    await r.page.screenshot({ path: path.join(PWA_OUT, '1440-hata-webgl2.png') });
    await r.ctx.close();
  }
  // iOS Safari (standalone değil): Ana Ekrana Ekle ipucu bir kez
  {
    const r = await rawPage({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    await r.page.goto(url, { waitUntil: 'load' });
    await r.page.waitForSelector('#splash', { state: 'detached', timeout: 90000 });
    await new Promise((res) => setTimeout(res, 5200));
    check('iOS: kullanım ipucu açıkken “Ana Ekrana Ekle” şeridi görünmez (üst üste binmez)', (await r.page.isVisible('.tip')) && (await r.page.$('#banner-ios')) === null);
    await r.page.click('.tip-ok');
    await r.page.waitForSelector('#banner-ios', { timeout: 60000 });
    check('iOS Safari: "Ana Ekrana Ekle" ipucu görünür', /Ana Ekrana Ekle/.test(await r.page.textContent('#banner-ios')));
    await r.page.screenshot({ path: path.join(PWA_OUT, '375-ios-ipucu.png') });
    await r.page.click('#banner-ios button');
    await r.page.reload({ waitUntil: 'load' });
    await r.page.waitForSelector('#splash', { state: 'detached', timeout: 90000 });
    await new Promise((res) => setTimeout(res, 4800));
    check('iOS ipucu kapatılınca (localStorage) tekrar gösterilmez', (await r.page.$('#banner-ios')) === null);
    await r.ctx.close();
  }
}

async function pwaScreens() {
  console.log('\n== PWA ekran görüntüleri ==');
  for (const v of [{ n: '375x812', width: 375, height: 812, touch: true }, { n: '768x1024', width: 768, height: 1024, touch: true }, { n: '1440x900', width: 1440, height: 900, touch: false }]) {
    // splash: main.js istegi tutulur → yalnız statik açılış ekranı görünür
    {
      const r = await rawPage({ viewport: { width: v.width, height: v.height }, hasTouch: v.touch, isMobile: v.touch });
      await r.page.route('**/src/main.js*', () => {});
      await r.page.goto(url, { waitUntil: 'commit' });
      await r.page.waitForSelector('#splash img', { timeout: 30000 });
      await r.page.waitForFunction(() => document.querySelector('#splash img').complete);
      await sleep(900);
      await r.page.screenshot({ path: path.join(PWA_OUT, `${v.n}-splash.png`) });
      await r.ctx.close();
    }
    const { ctx, page } = await openPage(v);
    await page.evaluate(() => window.__karadelik.ui.set({ animate: false, diskTime: 40, resolutionScale: 0.5 }));
    await settleRender(page, 1000, 30000);
    await page.screenshot({ path: path.join(PWA_OUT, `${v.n}-ana.png`) });
    await openMenuItem(page, 'about');
    await page.waitForSelector('#dlg-about[open]');
    await sleep(500);
    await page.screenshot({ path: path.join(PWA_OUT, `${v.n}-hakkinda.png`) });
    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    await page.waitForSelector('#dlg-guide[open]');
    await sleep(500);
    await page.screenshot({ path: path.join(PWA_OUT, `${v.n}-kilavuz.png`) });
    const ov = await page.evaluate(() => { const d = document.querySelector('dialog[open]').getBoundingClientRect(); return d.left >= 0 && d.right <= innerWidth && d.top >= 0 && d.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth + 1; });
    check(`[${v.n}] kılavuz penceresi görünüm içinde, taşma yok`, ov);
    await ctx.close();
  }
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
    await page.evaluate(() => { window.__karadelik.ui.setMode('advanced'); window.__karadelik.ui.open(); });
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
    await page.waitForFunction(() => document.querySelector('[data-info=rPlus] .km')?.textContent.includes('km'), null, { timeout: 30000 });
    await page.click('[data-info=rIsco] .row-label');
    await page.waitForSelector('[data-info=rIsco] .row-detail', { state: 'visible', timeout: 10000 }).catch(() => {});
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

// ================================================================== SADE ARAYÜZ / MENÜ / KILAVUZ / GİZLİLİK / İMZA
const SIGN = 'App design by Kuzey Çetin';
const SIMPLE_KEYS = ['a', 'thetaCam', 'rCam', 'animate'];

/** Görünür etkileşim hedeflerinden 44×44 px altında kalanları döndürür (dokunmatik profiller için). */
async function smallTargets(page) {
  return page.evaluate(() => {
    const out = [];
    const sel = 'a[href], button, summary, input[type=range], input[type=number], .seg label, label.switch';
    for (const e of document.querySelectorAll(sel)) {
      if (e.closest('.sr-only')) continue;
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (b.width === 0 || b.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (e.closest('[inert]') || e.closest('[hidden]')) continue;
      if (b.height < 43.5 || b.width < 43.5) out.push(`${e.tagName.toLowerCase()}.${(e.className || e.id || '').toString().slice(0, 22)} ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    return out;
  });
}
const visibleKeys = (page) => page.$$eval('#panel [data-ctl]', (els) => els.filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).display !== 'none'; }).map((e) => e.dataset.ctl));
const visibleCount = (page, sel) => page.$$eval(sel, (els) => els.filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }).length);

async function simpleChecks() {
  console.log('\n== Basit / Gelişmiş mod, … menüsü, ipucu, Kılavuz, Gizlilik, imza ==');
  const { ctx, page } = await openPage({ width: 1440, height: 900 });
  await cheap(page);
  await page.evaluate(() => window.__karadelik.ui.open());
  await settleRender(page, 600, 15000);

  // ---- ilk açılış ipucu (bir defalık)
  check('ilk açılışta “Nasıl kullanılır” ipucu görünür', await page.isVisible('.tip') && /Sürükleyin/.test(await page.textContent('.tip')) && /Alttaki kartlar/.test(await page.textContent('.tip')));
  await page.click('.tip-ok');
  await page.waitForSelector('.tip', { state: 'hidden', timeout: 5000 });
  check('ipucu kapatılınca gizlenir ve localStorage’a yazılır', (await page.evaluate(() => localStorage.getItem('karadelik.tipSeen'))) === '1');

  // ---- Basit mod (varsayılan)
  check('varsayılan mod Basit; seçici segmentli kontrol (Basit | Gelişmiş)', (await page.evaluate(() => window.__karadelik.ui.getMode())) === 'simple' && (await page.$$eval('.seg-mode label', (l) => l.map((x) => x.textContent.trim()))).join('|') === 'Basit|Gelişmiş');
  check('mod anahtarı kaydırılan alanın üstünde (sabit)', await page.evaluate(() => document.querySelector('.modebar').getBoundingClientRect().bottom <= document.querySelector('.panel-scroll').getBoundingClientRect().top + 1));
  const totalCtl = await page.$$eval('#panel [data-ctl]', (e) => e.length);
  const simpleVis = await visibleKeys(page);
  check('Basit: yalnız Dönüş hızı, Bakış açısı, Uzaklık kaydırıcıları + Animasyon anahtarı görünür', simpleVis.join() === SIMPLE_KEYS.join(), simpleVis.join());
  check('Basit: diğer kontroller silinmedi, yalnız gizli (DOM’da 25 kontrol)', totalCtl === 25, String(totalCtl));
  check('Basit: hazır ayar kartları gizli (sahne şeridi yeterli); DOM’da 4 kart durur', (await visibleCount(page, '.preset')) === 0 && (await page.$$eval('.preset svg.preset-thumb', (s) => s.length)) === 4);
  check('Basit: rozetler, lejant, bilimsel bilgi ve performans göstergesi gizli', (await visibleCount(page, '#panel .badge')) === 0 && (await visibleCount(page, '#panel .legend')) === 0 && (await visibleCount(page, '#panel [data-sec=info] summary')) === 0 && (await visibleCount(page, '#panel [data-sec=stats] summary')) === 0);
  await page.click('[data-ctl=a] .ctl-help');
  const tipSimple = await page.textContent('[data-ctl=a] .ctl-tip .tip-simple');
  check('Basit: “?” tek dokunuşla sade açıklama gösterir (teknik metin gizli)', await page.isVisible('[data-ctl=a] .tip-simple') && !(await page.isVisible('[data-ctl=a] .tip-adv')) && /ne kadar hızlı/.test(tipSimple));
  await page.click('[data-ctl=a] .ctl-help');
  // basit kontroller renderer'a yazar
  await page.fill('#ui-a', '0.5');
  await page.fill('#ui-thetaCam', '60');
  await settleCamera(page);
  let p = await P(page);
  check('Basit: Dönüş hızı/Bakış açısı kaydırıcıları → setParams (Tmax Gelişmiş’e taşındı)', near(p.a, 0.5, 1e-9) && near(p.thetaCam, 60 * DEG, 1e-6), `a=${p.a} θ=${(p.thetaCam / DEG).toFixed(2)}`);
  check('Basit: kaydırıcı değişince görünüm “Özel görünüm” olur (kart seçimi kalkar)', (await page.evaluate(() => window.__karadelik.ui.getScene())) === null && (await page.$$eval('.scene-card.selected', (e) => e.length)) === 0);
  await page.check('#ui-animate');
  check('Basit: Animasyon anahtarı → animate', (await P(page)).animate === true);
  await page.uncheck('#ui-animate');
  check('Basit: panel altında imza', (await page.textContent('.panel-sign')).trim() === SIGN);

  // ---- Gelişmiş
  await page.click('label[for="ui-mode-advanced"]');
  const advVis = await visibleKeys(page);
  check('Gelişmiş: tüm 25 kontrol görünür (Tmax dahil) + 4 hazır ayar kartı', advVis.length === 25 && advVis.includes('Tmax') && (await visibleCount(page, '.preset')) === 4, String(advVis.length));
  check('Gelişmiş: FİZİKSEL/ESTETİK/GÖSTERİM rozetleri ve lejant geri gelir', (await visibleCount(page, '#panel .badge.phys')) > 0 && (await visibleCount(page, '#panel .badge.aest')) > 0 && (await visibleCount(page, '#panel .badge.view')) > 0 && (await visibleCount(page, '#panel .legend')) === 1);
  check('Gelişmiş: bilimsel bilgi + performans göstergesi bölümleri görünür', (await visibleCount(page, '#panel [data-sec=info] summary')) === 1 && (await visibleCount(page, '#panel [data-sec=stats] summary')) === 1);
  check('Gelişmiş: mod localStorage’da', (await page.evaluate(() => localStorage.getItem('karadelik.uiMode'))) === 'advanced');
  const camOpen = () => page.evaluate(() => `${window.__karadelik.ui.getMode()}:${document.querySelector('[data-sec=camera]').open}`);
  await page.click('[data-sec=camera] summary');
  const afterClose = await camOpen();
  await page.click('label[for="ui-mode-simple"]');
  const inSimple = await camOpen();
  check('Basit’e dönünce temel kontrolleri içeren bölümler açık zorlanır', inSimple === 'simple:true', `${afterClose} → ${inSimple}`);
  await page.click('label[for="ui-mode-advanced"]');
  const backAdv = await camOpen();
  check('Gelişmiş’e dönünce bölüm açık/kapalı durumu geri yüklenir (kamera kapalı kaldı)', backAdv === 'advanced:false', `${afterClose} → ${inSimple} → ${backAdv}`);
  await page.click('[data-sec=camera] summary');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__karadelik?.ui, null, { timeout: 60000 });
  await page.evaluate(() => window.__karadelik.ui.set({ animate: false, resolutionScale: 0.25 }));
  check('yeniden yüklemede mod hatırlanır (Gelişmiş) ve ipucu tekrar gösterilmez', (await page.evaluate(() => window.__karadelik.ui.getMode())) === 'advanced' && !(await page.isVisible('.tip')));
  await page.evaluate(() => window.__karadelik.ui.open()); // yeniden yüklemeden sonra ayarlar kapalı başlar
  await page.waitForFunction(() => getComputedStyle(document.getElementById('ui-mode-simple').labels[0]).visibility === 'visible', null, { timeout: 15000 });
  await page.click('label[for="ui-mode-simple"]');
  check('Basit seçimi de hatırlanır', (await page.evaluate(() => localStorage.getItem('karadelik.uiMode'))) === 'simple');
  await page.waitForSelector('#splash', { state: 'detached', timeout: 90000 });

  // ---- araç çubuğu: birincil + … menüsü
  const permanent = await page.$$eval('.toolbar button', (b) => b.filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.id));
  check('ekranda yalnız 2 kalıcı düğme: “i” bilgi + “…” menü (Ayarlar/Sıfırla/Ekran görüntüsü menüye taşındı)', permanent.join() === 'info-toggle,menu-toggle', permanent.join());
  await page.click('#menu-toggle');
  check('… menüsü açılır (aria-expanded=true, role=menu)', (await page.getAttribute('#menu-toggle', 'aria-expanded')) === 'true' && (await page.getAttribute('#app-menu', 'role')) === 'menu');
  const items = await page.$$eval('#app-menu .menu-item:not([hidden])', (b) => b.map((x) => x.dataset.menu));
  check('… menüsü: Ayarlar, Kamerayı sıfırla, Ekran görüntüsü, Kılavuz, Hakkında, Gizlilik (+ Tam ekran/Yükle varsa)', ['settings', 'reset', 'screenshot', 'guide', 'about', 'privacy'].every((k) => items.includes(k)), items.join());
  await page.keyboard.press('Escape');
  check('Esc … menüsünü kapatır, odak düğmeye döner', !(await page.isVisible('#app-menu')) && (await page.evaluate(() => document.activeElement?.id)) === 'menu-toggle' && (await page.getAttribute('#menu-toggle', 'aria-expanded')) === 'false');
  await page.focus('#menu-toggle');
  await page.keyboard.press('ArrowDown');
  const f1 = await page.evaluate(() => document.activeElement?.dataset.menu);
  await page.keyboard.press('ArrowDown');
  const f2 = await page.evaluate(() => document.activeElement?.dataset.menu);
  check('menü: ↓ ile açılır ve öğeler arasında gezinilir', f1 === 'settings' && f2 === 'reset', `${f1} → ${f2}`);
  await page.mouse.click(700, 500);
  check('menü dışına tıklayınca kapanır', !(await page.isVisible('#app-menu')));

  // ---- Kılavuz / Gizlilik / Hakkında
  await openMenuItem(page, 'guide');
  await page.waitForSelector('#dlg-guide[open]');
  const gtxt = await page.textContent('#dlg-guide');
  check('Kılavuz açılır; içerik: gölge, foton halkası, merceklenme, Doppler, kırmızıya kayma, iOS Safari, WebGL2', ['Gölge', 'Foton halkası', 'Merceklenmiş disk', 'Doppler parlaması', 'Kırmızıya kayma', 'Ana Ekrana Ekle', 'WebGL 2', 'pil'].every((k) => new RegExp(k, 'i').test(gtxt)));
  await page.click('#dlg-guide [data-goto=trouble]');
  check('Kılavuz bölüm düğmesi ilgili bölüme kaydırır', await page.evaluate(() => { const b = document.querySelector('#dlg-guide .dlg-body').getBoundingClientRect(); const t = document.getElementById('guide-trouble').getBoundingClientRect(); return t.top >= b.top - 2 && t.top < b.top + 200; }));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('dlg-guide').open);
  await openMenuItem(page, 'privacy');
  await page.waitForSelector('#dlg-privacy[open]');
  const ptxt = await page.textContent('#dlg-privacy');
  check('Gizlilik açılır: yürürlük 7 Kasım 2026, localStorage anahtarları, GitHub Pages/IP, Çocukların gizliliği, İngilizce özet', /7 Kasım 2026/.test(ptxt) && /karadelik\.uiMode/.test(ptxt) && /GitHub Pages/.test(ptxt) && /IP adresi/.test(ptxt) && /Çocukların gizliliği/.test(ptxt) && /does not collect/.test(ptxt));
  check('Gizlilik: GitHub ve Netlify gizlilik bildirimleri + depo bağlantıları, e-posta adresi yok', (await page.$$eval('#dlg-privacy a.ext', (a) => a.map((x) => x.href))).join() === 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement,https://www.netlify.com/privacy/,https://github.com/kuzeycetin3806-debug/Karadelikprojesi,https://github.com/kuzeycetin3806-debug/Karadelikprojesi,https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement,https://www.netlify.com/privacy/' && !/[\w.+-]+@[\w-]+\.[\w.]+/.test(ptxt));
  check('Gizlilik: “Tam sayfa aç” → gizlilik.html', (await page.getAttribute('#dlg-privacy a.dlg-full', 'href')).endsWith('gizlilik.html'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('dlg-privacy').open);
  await openMenuItem(page, 'about');
  await page.waitForSelector('#dlg-about[open]');
  check('Hakkında altbilgisinde imza', (await page.textContent('#dlg-about .dlg-foot .designer')).trim() === SIGN);
  await page.click('#dlg-about [data-open=privacy]');
  await page.waitForSelector('#dlg-privacy[open]');
  check('Hakkında → Gizlilik politikası düğmesi gizlilik penceresini açar (hakkında kapanır)', !(await page.evaluate(() => document.getElementById('dlg-about').open)));
  await page.keyboard.press('Escape');
  await ctx.close();
}

async function docsChecks() {
  console.log('\n== Bağımsız sayfalar, harici istek taraması, gizlilik doğruluğu ==');
  const origin = new URL(url).origin;
  // --- kaynak taraması (statik)
  const { S } = await import('../../src/ui/strings.js');
  const { PREF_KEYS } = await import('../../src/ui/prefs.js');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const srcFiles = [...walk(path.join(PROJECT_ROOT, 'src')).filter((f) => /\.(js|css|glsl)$/.test(f)), path.join(PROJECT_ROOT, 'index.html'), ...walk(path.join(PROJECT_ROOT, 'public')).filter((f) => /\.(html|js|css|webmanifest|svg)$/.test(f))];
  const hosts = new Set();
  const bad = [];
  for (const f of srcFiles) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/https?:\/\/([a-z0-9.-]+)[^\s'"`)<>]*/gi)) if (!/^(www\.w3\.org)$/.test(m[1])) hosts.add(m[1]);
    if (/@import|fonts\.googleapis|gstatic|unpkg|jsdelivr|cdnjs|google-analytics|googletagmanager|sendBeacon|XMLHttpRequest|WebSocket\(|EventSource\(|document\.cookie/.test(t)) bad.push(path.relative(PROJECT_ROOT, f));
    if (/\.js$/.test(f) && !f.endsWith('public/sw.js') && /\bfetch\(/.test(t)) bad.push(path.relative(PROJECT_ROOT, f) + ' (fetch)');
  }
  check('kaynak taraması: harici font/CDN/analitik/çerez/ağ API’si yok', bad.length === 0, bad.join(', '));
  check('kaynakta yalnız GitHub/Netlify bağlantıları (tıklanabilir, istek değil)', [...hosts].every((h) => /^(github\.com|docs\.github\.com|www\.netlify\.com)$/.test(h)), [...hosts].join(','));
  const codeKeys = new Set();
  for (const f of walk(path.join(PROJECT_ROOT, 'src/ui')).filter((x) => x.endsWith('.js') && !x.endsWith('strings.js'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"`](karadelik\.[A-Za-z]+)['"`]/g)) codeKeys.add(m[1]);
  const policyKeys = new Set(S.privacy.sections.find((x) => x.id === 'storage').blocks.find(([k]) => k === 'dl')[1].map(([k]) => k));
  check('gizlilik politikasındaki localStorage anahtarları = koddakiler', [...codeKeys].sort().join() === [...policyKeys].sort().join() && [...codeKeys].sort().join() === Object.values(PREF_KEYS).sort().join(), `${[...codeKeys].sort().join()} | ${[...policyKeys].sort().join()}`);
  // ---- metinlerdeki sayılar src/physics fonksiyonlarıyla tutarlı mı (fizik denetimi için)
  const tr = (x, d) => x.toFixed(d).replace('.', ',');
  const SC = S.scenes;
  const hasAll = (txt, arr) => arr.every((x) => txt.includes(x));
  const bc = 3 * Math.sqrt(3);
  const whatis = JSON.stringify(S.guide.sections.find((x) => x.id === 'whatis'));
  check('metin: gölge yarıçapı 3√3 M ≈ 5,2 M ve ufku 2 M’nin ≈ 2,6 katı (b_c = 3√3 M, r₊ = 2 M)', hasAll(SC.schwarzschild.text, [`${tr(bc, 1)} M`, `${tr(horizonRadii(1, 0).rPlus, 0)} M`]) && hasAll(whatis, ['3√3 M', tr(bc, 1), tr(bc / horizonRadii(1, 0).rPlus, 1)]) && Math.abs(shadowBoundary(1, 0, 1, 8)[0].alpha + bc) < 1e-12);
  check('metin: foton küresi 3 M, ISCO 6 M (a=0), a=0,998 için ≈ 1,2 M', hasAll(whatis, [`${photonOrbitRadius(1, 0, true)} M`, `${iscoRadius(1, 0, true)} M`, `${tr(iscoRadius(1, 0.998, true), 1)} M`]));
  check('sahne metni: a=0,9 prograd ISCO ≈ 2,3 M', SC.kerr09.text.includes(`${tr(iscoRadius(1, 0.9, true), 1)} M`) && SC.retro.text.includes(`${tr(iscoRadius(1, 0.9, true), 1)} M`));
  check('sahne metni: a=0,998 ISCO ≈ 1,2 M, verim %32 (a=0: %5,7)', SC.extreme.text.includes(`${tr(iscoRadius(1, 0.998, true), 1)} M`) && SC.extreme.text.includes(`yüzde ${Math.round(100 * radiativeEfficiency(0.998, true))}`) && SC.extreme.text.includes(`yüzde ${tr(100 * radiativeEfficiency(0, true), 1)}`));
  check('sahne metni: retrograd a=0,9 ISCO ≈ 8,7 M, verim ≈ %3,9', SC.retro.text.includes(`${tr(iscoRadius(1, 0.9, false), 1)} M`) && SC.retro.text.includes(`yüzde ${tr(100 * radiativeEfficiency(0.9, false), 1)}`));
  const { SCENES, DEFAULT_SCENE } = await import('../../src/ui/scenes.js');
  check('8 sahne; her birinin başlığı, açıklaması ve en az 3 “Neye bakmalı?” maddesi var; açıklama ≤ 4 cümle', SCENES.length === 8 && SCENES.every((sc) => { const t = SC[sc.id]; return t && t.title && t.short && t.look.length >= 3 && t.text.split(/[.!?]\s/).length <= 4; }));
  check('“M87* görüntüsüdür” iddiası yok; yalnız bilgi notu', !/M87\* (görüntüsüdür|fotoğrafı)/.test(SC.tilt17.text) && /görüntüsü değildir/.test(SC.tilt17.text) && !Object.values(SC).some((t) => /Interstellar|Gargantua/i.test(t.text)));
  check('varsayılan sahne = renderer varsayılanı (a=0,9, 75°, 50 M)', DEFAULT_SCENE === 'kerr09' && SCENES.find((x) => x.id === 'kerr09').patch.a === 0.9);
  const thumbs = SCENES.map((sc) => path.join(PROJECT_ROOT, 'public/scenes', `${sc.id}.webp`));
  const tsize = thumbs.reduce((n, f) => n + (fs.existsSync(f) ? fs.statSync(f).size : 1e9), 0);
  check('sahne küçük resimleri (webp) var, toplam ≤ 400 KB', thumbs.every((f) => fs.existsSync(f) && fs.readFileSync(f).subarray(8, 12).toString() === 'WEBP') && tsize <= 400 * 1024, `${(tsize / 1024).toFixed(1)} KB`);
  const swTxt = fs.readFileSync(path.join(PROJECT_ROOT, 'public/sw.js'), 'utf8');
  check('sw.js ön önbelleğinde tüm sahne küçük resimleri', SCENES.every((sc) => swTxt.includes(`'${sc.id}'`)) && /scenes\/\$\{id\}\.webp/.test(swTxt));
  const mk = (await import('node:child_process')).spawnSync('node', ['tests/ui/make-pages.mjs', '--check'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  check('kilavuz.html / gizlilik.html güncel (strings.js’den üretilmiş)', mk.status === 0, (mk.stderr || '').trim());

  // --- tarayıcıda: uygulama + sayfalar → yalnız aynı kökene istek
  for (const [file, opts] of [['', {}], ['kilavuz.html', {}], ['gizlilik.html', {}]]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, reducedMotion: 'reduce', colorScheme: 'dark' });
    const page = await ctx.newPage();
    const reqs = [];
    page.on('request', (r) => reqs.push(r.url()));
    const resp = await page.goto(url + file, { waitUntil: 'load' });
    if (!file) { await page.waitForFunction(() => window.__karadelik?.renderer?.getStats().frames > 0, null, { timeout: 120000 }); }
    const external = reqs.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:'));
    check(`${file || 'uygulama (/)'}: 200 ve harici istek yok (${reqs.length} istek)`, resp.status() === 200 && external.length === 0, external.slice(0, 3).join(' '));
    if (file) {
      const info = await page.evaluate(() => ({
        doctype: document.doctype?.name, charset: document.characterSet, lang: document.documentElement.lang,
        vp: document.querySelector('meta[name=viewport]')?.content, back: document.querySelector('a[href="./"]')?.textContent,
        h1: document.querySelector('h1')?.textContent, sign: document.querySelector('footer .sign')?.textContent,
        overflow: document.documentElement.scrollWidth > innerWidth + 1, secs: document.querySelectorAll('main > section').length,
        style: document.querySelector('style')?.textContent || '', ext: [...document.querySelectorAll('link[href],script[src],img[src]')].map((e) => e.getAttribute('href') || e.getAttribute('src')),
      }));
      check(`${file}: doctype, utf-8, lang=tr, viewport, uygulamaya dönüş ./, imza`, info.doctype === 'html' && /utf-8/i.test(info.charset) && info.lang === 'tr' && /width=device-width/.test(info.vp) && /Uygulamaya dön/.test(info.back) && info.sign === SIGN && info.h1.length > 3);
      check(`${file}: tek dosya (harici stil/betik/görsel yok), prefers-color-scheme + print stili`, info.ext.every((x) => /^icons\//.test(x)) && /prefers-color-scheme:dark/.test(info.style) && /@media print/.test(info.style) && !info.overflow, info.ext.join());
      await page.emulateMedia({ colorScheme: 'dark' });
      const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.emulateMedia({ colorScheme: 'light' });
      const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.emulateMedia({ media: 'print' });
      const printBar = await page.evaluate(() => getComputedStyle(document.querySelector('.bar')).display);
      check(`${file}: koyu tema siyah, açık tema açık gri, yazdırmada düğme çubuğu gizli`, dark === 'rgb(0, 0, 0)' && light === 'rgb(245, 245, 247)' && printBar === 'none', `${dark} / ${light} / ${printBar}`);
      await page.emulateMedia({ media: 'screen', colorScheme: 'dark' });
      const t375 = await smallTargets(page);
      check(`${file}: dokunma hedefleri ≥ 44 px (375 px)`, t375.length === 0, t375.slice(0, 4).join('; '));
      await page.screenshot({ path: path.join(APPLE_OUT, `sayfa-${file.replace('.html', '')}-375.png`), fullPage: false });
      if (file === 'gizlilik.html') {
        const txt = await page.evaluate(() => document.body.innerText);
        check('gizlilik.html: yürürlük 7 Kasım 2026, sorumlu Kuzey Çetin, GitHub Gizlilik Bildirimi + depo, İngilizce özet, e-posta yok', /7 Kasım 2026/.test(txt) && /Kuzey Çetin/.test(txt) && (await page.$('a[href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement"]')) && (await page.$('a[href="https://github.com/kuzeycetin3806-debug/Karadelikprojesi"]')) && (await page.$('a[href="https://www.netlify.com/privacy/"]')) && (await page.$('section[lang=en]')) && !/[\w.+-]+@[\w-]+\.[\w.]+/.test(txt));
      } else {
        check('kilavuz.html: 9 bölüm, Kara delik nedir/Sahneler/Ayarlar/iOS kurulum içerikleri', info.secs === 9 && /Paylaş/.test(await page.evaluate(() => document.body.innerText)));
      }
    }
    await ctx.close();
  }

  // --- uygulama içi kılavuz = bağımsız sayfa (aynı bölüm başlıkları)
  const gs = S.guide.sections.map((x) => x.title).join('|');
  const pg = await browser.newPage();
  await pg.goto(url + 'kilavuz.html');
  check('kilavuz.html bölüm başlıkları = uygulama içi kılavuz', (await pg.$$eval('main > section > h2', (e) => e.map((x) => x.textContent))).join('|') === gs);
  await pg.close();

  // --- index.html: Apple meta, başlangıç görüntüleri, ikon
  const html = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');
  const links = [...html.matchAll(/<link rel="apple-touch-startup-image" href="\/([^"]+)" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: (\w+)\)"/g)];
  const jpegSize = (f) => { const b = fs.readFileSync(f); let o = 2; while (o < b.length) { if (b[o] !== 0xff) { o++; continue; } const m = b[o + 1]; if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5)]; o += 2 + b.readUInt16BE(o + 2); } return null; };
  const badSplash = [];
  for (const [, f, w, h, dpr, ori] of links) {
    const file = path.join(PROJECT_ROOT, 'public', f);
    if (!fs.existsSync(file)) { badSplash.push(`yok ${f}`); continue; }
    const [pw, ph] = jpegSize(file) || [0, 0];
    const [ew, eh] = ori === 'portrait' ? [w * dpr, h * dpr] : [h * dpr, w * dpr];
    if (pw !== ew || ph !== eh) badSplash.push(`${f}: ${pw}×${ph} ≠ ${ew}×${eh}`);
  }
  check('apple-touch-startup-image: 15 bağlantı, dosyalar var, piksel boyutları media sorgusuyla uyumlu', links.length === 15 && badSplash.length === 0, badSplash.join('; ') || `${links.length}`);
  const png = fs.readFileSync(path.join(PROJECT_ROOT, 'public/icons/apple-touch-icon.png'));
  check('apple-touch-icon 180×180, opak (alfa kanalı yok → iOS siyaha çevirmez)', png.readUInt32BE(16) === 180 && png.readUInt32BE(20) === 180 && png[25] === 2);
  check('index.html: imza + apple-mobile-web-app-* + status-bar black-translucent', html.includes(`>${SIGN}</div>`) && /apple-mobile-web-app-capable" content="yes"/.test(html) && /black-translucent/.test(html) && /apple-mobile-web-app-title/.test(html));
  const css = fs.readFileSync(path.join(PROJECT_ROOT, 'src/styles/ui.css'), 'utf8');
  check('CSS: yazı boyutları rem (dinamik tip), sistem yazı tipi, @supports yedekleri', !/font-size:\s*[\d.]+px/.test(css) && /-apple-system-body/.test(css) && /-apple-system, BlinkMacSystemFont, 'SF Pro Text'/.test(css) && /@supports not \(\(-webkit-backdrop-filter/.test(css) && /prefers-contrast: more/.test(css) && /prefers-reduced-motion: reduce/.test(css));
  const sw = fs.readFileSync(path.join(PROJECT_ROOT, 'public/sw.js'), 'utf8');
  check('sw.js: sayfalar önbellek kabuğunda, VERSION satırı biçimi korunmuş', /'kilavuz\.html'/.test(sw) && /'gizlilik\.html'/.test(sw) && /^const VERSION = '[^']*';$/m.test(sw));
}

// ================================================================== SAHNELER · BİLGİ KARTI · ETİKETLER
async function sceneChecks() {
  console.log('\n== Sahne şeridi, bilgi kartı, etiketler (1440×900) ==');
  const { SCENES } = await import('../../src/ui/scenes.js');
  const { S } = await import('../../src/ui/strings.js');
  const { ctx, page } = await openPage({ width: 1440, height: 900 });
  await cheap(page);
  await page.click('.tip-ok').catch(() => {});

  // --- yerleşim: ≤ 2 kalıcı düğme + şerit
  const vis = await page.evaluate(() => [...document.querySelectorAll('#ui button, #ui input, #ui summary')].filter((e) => {
    const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]') && !e.closest('[inert]') && !e.closest('.sr-only') && !e.closest('#scene-strip') && !e.closest('.banner') && !e.closest('.tip');
  }).map((e) => e.id || e.className));
  check('ekranda en fazla 2 kalıcı düğme (şerit kartları ve geçici ipucu/bildirim hariç)', vis.length <= 2 && vis.includes('info-toggle') && vis.includes('menu-toggle'), vis.join());
  check('sahne şeridi: 8 kart, her kartta gerçek küçük resim yüklendi (naturalWidth > 0)', await page.evaluate(() => { const c = [...document.querySelectorAll('.scene-card')]; return c.length === 8 && c.every((x) => { const i = x.querySelector('img'); return i && i.complete && i.naturalWidth > 0; }); }));
  const stripCss = await page.evaluate(() => { const l = document.querySelector('.scene-list'); const st = document.getElementById('scene-strip'); return { ta: getComputedStyle(l).touchAction, ox: getComputedStyle(l).overflowX, pb: parseFloat(getComputedStyle(st).paddingBottom), outside: !document.getElementById('sahne').contains(st) }; });
  check('şerit: touch-action pan-x, yatay kaydırılır, altı güvenli alan payı, kameranın DIŞINDA', stripCss.ta === 'pan-x' && stripCss.ox === 'auto' && stripCss.pb >= 12 && stripCss.outside, JSON.stringify(stripCss));
  check('varsayılan sahne seçili (aria-pressed)', (await page.getAttribute('.scene-card[data-scene=kerr09]', 'aria-pressed')) === 'true' && (await page.$$eval('.scene-card[aria-pressed=true]', (e) => e.length)) === 1);

  // --- her kart doğru parametreleri yazar
  for (const sc of SCENES) {
    await page.click(`.scene-card[data-scene=${sc.id}]`);
    await settleCamera(page);
    await page.waitForFunction((a) => Math.abs(window.__karadelik.renderer.getParams().a - a) < 1e-9, sc.patch.a, { timeout: 10000 });
    const p = await P(page);
    const base = await page.evaluate(() => window.__karadelik.ui.defaults.fovY);
    const okFov = sc.fovY == null ? p.fovY >= base - 1e-9 : p.fovY >= sc.fovY - 1e-9;
    const ok = near(p.a, sc.patch.a, 1e-9) && p.prograde === sc.patch.prograde && near(p.thetaCam, sc.patch.thetaCam, 1e-6) && near(p.rCam, sc.patch.rCam, 1e-6) && Math.abs(p.phiCam) < 1e-6 && p.disk === true && okFov;
    check(`sahne ${sc.id}: a=${sc.patch.a}, ${sc.patch.prograde ? 'prograd' : 'retrograd'}, θ=${(sc.patch.thetaCam / DEG).toFixed(0)}°, r=${sc.patch.rCam}`, ok, `a=${p.a} pro=${p.prograde} θ=${(p.thetaCam / DEG).toFixed(2)} r=${p.rCam.toFixed(3)} fov=${p.fovY}`);
  }
  // sahne seçince "sıfırla" o sahnenin kamerasına döner
  await page.evaluate(() => window.__karadelik.ui.camera.setTarget({ phi: 1, theta: 40 * Math.PI / 180, r: 90 }, { instant: true }));
  await page.mouse.dblclick(600, 450);
  await settleCamera(page);
  const rs = await P(page);
  check('çift tıklama seçili sahnenin (alttan bakış) kamerasına döner', near(rs.thetaCam, 115 * DEG, 1e-6) && near(rs.rCam, 50, 1e-6));

  // --- bilgi kartı: metin sahneye göre değişir
  await page.click('.scene-card[data-scene=schwarzschild]');
  await settleCamera(page);
  await page.click('#info-toggle');
  await page.waitForSelector('#scene-info', { state: 'visible' });
  const t1 = { title: await page.textContent('#info-title'), text: await page.textContent('#info-text'), look: await page.$$eval('#info-look li', (e) => e.length) };
  await page.click('.scene-card[data-scene=retro]');
  await settleCamera(page);
  const t2 = { title: await page.textContent('#info-title'), text: await page.textContent('#info-text') };
  check('bilgi kartı: başlık ve açıklama seçili sahneye göre değişir (açıkken de)', t1.title === S.scenes.schwarzschild.title && t1.text === S.scenes.schwarzschild.text && t2.title === S.scenes.retro.title && t2.text === S.scenes.retro.text && t1.text !== t2.text && t1.look >= 3, `${t1.title} → ${t2.title}`);
  const chips = await page.$$eval('[data-chip]', (e) => Object.fromEntries(e.map((x) => [x.dataset.chip, parseFloat(x.dataset.value)])));
  check('bilgi kartı sayıları physics’ten: retrograd a=0,9 ISCO ve verim', near(chips.rIsco, iscoRadius(1, 0.9, false), 1e-12) && near(chips.eta, radiativeEfficiency(0.9, false), 1e-12) && near(chips.rPlus, horizonRadii(1, 0.9).rPlus, 1e-12), JSON.stringify(chips));
  check('bilgi kartında “Neye bakmalı?” başlığı, Etiketler anahtarı (varsayılan KAPALI) ve “Kara delik nedir?” düğmesi', (await page.textContent('#scene-info')).includes('Neye bakmalı?') && !(await page.isChecked('#info-labels')) && !(await page.isVisible('#labels')) && (await page.isVisible('.info-whatis')));
  await page.click('.info-whatis');
  await page.waitForSelector('#dlg-guide[open]');
  check('“Kara delik nedir?” kılavuzun ilgili bölümünü açar ve bilgi kartını kapatır', !(await page.isVisible('#scene-info')) && await page.evaluate(() => { const b = document.querySelector('#dlg-guide .dlg-body').getBoundingClientRect(); const t = document.getElementById('guide-whatis').getBoundingClientRect(); return t.top >= b.top - 2 && t.top < b.top + b.height * 0.5; }));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('dlg-guide').open);
  await page.click('#info-toggle');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#scene-info', { state: 'hidden' });
  check('Esc bilgi kartını kapatır, odak “i” düğmesine döner', (await page.evaluate(() => document.activeElement?.id)) === 'info-toggle');

  // --- etiketler: a=0, θ=90° (≈89,5°), r=50
  await page.evaluate(() => window.__karadelik.ui.set({ a: 0, prograde: true, thetaCam: 90 * Math.PI / 180, rCam: 50, phiCam: 0, disk: true }));
  await settleCamera(page);
  await page.click('#info-toggle');
  await page.click('label[for=info-labels]');
  await page.waitForSelector('#labels', { state: 'visible' });
  await page.evaluate(() => window.__karadelik.ui.closeInfo());
  await sleep(400);
  const lbl = () => page.evaluate(() => {
    const out = {};
    for (const e of document.querySelectorAll('.lbl')) { const b = e.getBoundingClientRect(); out[e.dataset.label] = { vis: !e.hidden && b.width > 0, x: b.x + b.width / 2, y: b.y + b.height / 2, text: e.textContent }; }
    const c = document.getElementById('sahne').getBoundingClientRect();
    return { out, c: { x: c.x, y: c.y, w: c.width, h: c.height }, note: !document.querySelector('.lbl-note').hidden };
  });
  let L = await lbl();
  const pp = await P(page);
  const sb = shadowBoundary(1, pp.a, pp.thetaCam, 180);
  const al = sb.map((q) => q.alpha);
  const cAlpha = (Math.max(...al) + Math.min(...al)) / 2;
  const k = (L.c.h / 2) / (Math.tan(pp.fovY * Math.PI / 360) * pp.rCam);
  const exp = { x: L.c.x + L.c.w / 2 + cAlpha * k, y: L.c.y + L.c.h / 2 };
  const rad = 3 * Math.sqrt(3) * k;
  const dist = Math.hypot(L.out.shadow.x - exp.x, L.out.shadow.y - exp.y);
  check('etiketler açık (a=0, θ≈90°, r=50): 4 etiket görünür, metinleri sade', ['shadow', 'ring', 'lens', 'doppler'].every((n) => L.out[n]?.vis) && L.out.shadow.text === 'Gölge' && L.out.ring.text === 'Foton halkası' && L.out.lens.text === 'Diskin arka tarafı (ışık bükülmüş)' && L.out.doppler.text === 'Bize doğru gelen taraf — daha parlak (Doppler)', JSON.stringify(Object.fromEntries(Object.entries(L.out).map(([a, b]) => [a, b.vis]))));
  check('“Gölge” etiketi gölge merkezine yakın (shadowBoundary → piksel, ±%5 gölge yarıçapı)', dist <= 0.05 * rad + 1.5, `fark ${dist.toFixed(2)} px, yarıçap ${rad.toFixed(1)} px, beklenen (${exp.x.toFixed(1)}, ${exp.y.toFixed(1)})`);
  const outlineBox = await page.evaluate(() => { const b = document.querySelector('.lbl-outline').getBBox(); return { w: b.width, h: b.height }; });
  check('gölge anahat çizgisi (shadowBoundary) çapı = 2·3√3 M karşılığı piksel (±%1)', Math.abs(outlineBox.w - 2 * rad) < 0.01 * 2 * rad && Math.abs(outlineBox.h - 2 * rad) < 0.01 * 2 * rad, `${outlineBox.w.toFixed(1)} × ${outlineBox.h.toFixed(1)} px, beklenen ${(2 * rad).toFixed(1)}`);
  check('Doppler etiketi prograd diskte merkezin SOLUNDA (yaklaşan taraf α<0)', L.out.doppler.x < L.c.x + L.c.w / 2);
  await page.evaluate(() => window.__karadelik.ui.set({ prograde: false }));
  await page.waitForFunction(() => { const e = document.querySelector('.lbl[data-label=doppler]'); const b = e.getBoundingClientRect(); const c = document.getElementById('sahne').getBoundingClientRect(); return e.dataset.side === 'right' && b.x + b.width / 2 > c.x + c.width / 2; }, null, { timeout: 20000 }).catch(() => {});
  L = await lbl();
  check('retrograd diskte Doppler etiketi SAĞA geçer', L.out.doppler.x > L.c.x + L.c.w / 2, `x=${L.out.doppler.x?.toFixed(0)} merkez=${(L.c.x + L.c.w / 2).toFixed(0)} vis=${L.out.doppler.vis}`);
  await page.evaluate(() => window.__karadelik.ui.set({ prograde: true, thetaCam: 115 * Math.PI / 180 }));
  await settleCamera(page);
  await page.waitForFunction(() => document.getElementById('labels').dataset.side === '-1', null, { timeout: 20000 });
  await sleep(200);
  L = await lbl();
  check('diskin altından bakışta (θ>90°) merceklenmiş yay etiketi gölgenin ALTINDA', L.out.lens.vis && L.out.lens.y > L.out.shadow.y, `lens y=${L.out.lens.y.toFixed(0)} shadow y=${L.out.shadow.y.toFixed(0)}`);
  await page.evaluate(() => window.__karadelik.ui.set({ thetaCam: 10 * Math.PI / 180 }));
  await settleCamera(page);
  await page.waitForFunction(() => document.querySelector('.lbl[data-label=lens]').hidden, null, { timeout: 20000 });
  await sleep(200);
  L = await lbl();
  check('yüz yüze bakışta (10°) yay ve Doppler etiketleri gizlenir; gölge/halka kalır', !L.out.lens.vis && !L.out.doppler.vis && L.out.shadow.vis && L.out.ring.vis);
  await page.evaluate(() => window.__karadelik.ui.set({ thetaCam: 75 * Math.PI / 180, rCam: 12 }));
  await settleCamera(page);
  await page.waitForFunction(() => document.getElementById('labels').dataset.state === 'near', null, { timeout: 20000 });
  await sleep(200);
  L = await lbl();
  check('r < 15 M: etiketler gizlenir, “uzaktan bakışta gösterilir” notu görünür', Object.values(L.out).every((x) => !x.vis) && L.note);
  await page.evaluate(() => window.__karadelik.ui.set({ rCam: 50, disk: false }));
  await settleCamera(page);
  await page.waitForFunction(() => document.getElementById('labels').dataset.state === 'on' && document.querySelector('.lbl[data-label=lens]').hidden, null, { timeout: 20000 });
  await sleep(200);
  L = await lbl();
  check('disk kapalıyken disk etiketleri (yay, Doppler) gizlenir', !L.out.lens.vis && !L.out.doppler.vis && L.out.shadow.vis);
  await page.evaluate(() => window.__karadelik.ui.set({ disk: true }));
  await page.evaluate(() => window.__karadelik.ui.openInfo());
  await page.click('label[for=info-labels]');
  check('Etiketler anahtarı kapatınca katman gizlenir (ve açıkken yeniden açılır)', !(await page.isVisible('#labels')));
  await page.evaluate(() => window.__karadelik.ui.closeInfo());
  await ctx.close();

  // --- yumuşak geçiş (azaltılmış hareket KAPALI)
  {
    const r = await openPage({ width: 1024, height: 700 });
    await r.page.emulateMedia({ reducedMotion: 'no-preference' });
    await cheap(r.page);
    await r.page.evaluate(() => { window.__karadelik.ui.applyScene('close'); });
    const mid = await r.page.evaluate(() => ({ active: window.__karadelik.ui.camera.isActive(), p: window.__karadelik.renderer.getParams() }));
    await settleCamera(r.page);
    await r.page.waitForFunction(() => Math.abs(window.__karadelik.renderer.getParams().a - 0.9) < 1e-9);
    const fin = await P(r.page);
    check('sahne geçişi yumuşak (kamera hemen sıçramaz) ve sonunda tam hedefte', mid.active && Math.abs(mid.p.rCam - 12) > 1 && near(fin.rCam, 12, 1e-6) && fin.fovY >= 70 - 1e-9, `ilk r=${mid.p.rCam.toFixed(1)} → ${fin.rCam.toFixed(2)}`);
    await r.ctx.close();
  }

  // --- telefon: şerit kaydırması kamerayı oynatmaz
  {
    const r = await openPage({ width: 375, height: 812, touch: true });
    await cheap(r.page);
    await r.page.click('.tip-ok').catch(() => {});
    const before = await P(r.page);
    const box = await r.page.evaluate(() => { const b = document.querySelector('.scene-list').getBoundingClientRect(); return { x: b.x, y: b.y + b.height / 2, w: b.width, sl: document.querySelector('.scene-list').scrollLeft, over: document.querySelector('.scene-list').scrollWidth > b.width }; });
    await touchSeq(r.page, lerpPts([{ x: box.x + 300, y: box.y }], [{ x: box.x + 60, y: box.y + 12 }], 12));
    await sleep(500);
    const after = await P(r.page);
    const sl2 = await r.page.evaluate(() => document.querySelector('.scene-list').scrollLeft);
    check('telefon: şeridi yatay kaydırmak kamerayı oynatmaz, şerit kayar', box.over && sl2 > box.sl + 50 && after.phiCam === before.phiCam && after.thetaCam === before.thetaCam && after.rCam === before.rCam, `scrollLeft ${box.sl} → ${sl2}`);
    const geo = await r.page.evaluate(() => { const s = document.getElementById('scene-strip').getBoundingClientRect(); const cards = [...document.querySelectorAll('.scene-card')].map((c) => c.getBoundingClientRect()); return { bottom: s.bottom, vh: innerHeight, h: Math.min(...cards.map((c) => c.height)) }; });
    check('telefon: şerit alt kenarda, kartlar ≥ 44 px yüksek', Math.abs(geo.bottom - geo.vh) < 1.5 && geo.h >= 44, JSON.stringify(geo));
    await r.page.tap('.scene-card[data-scene=faceOn]');
    await settleCamera(r.page);
    check('telefon: karta dokunmak sahneyi seçer', near((await P(r.page)).thetaCam, 10 * DEG, 1e-6));
    await r.ctx.close();
  }
}

// ================================================================== APPLE PROFİLLERİ (Chromium + Playwright cihaz profilleri)
const APPLE = [
  { name: 'iphone17pro', dev: 'iPhone 17 Pro', touch: true, phone: true },
  { name: 'iphoneSE', dev: 'iPhone SE', touch: true, phone: true },
  { name: 'ipadpro11-dikey', dev: 'iPad Pro 11', touch: true },
  { name: 'ipadpro11-yatay', dev: 'iPad Pro 11 landscape', touch: true },
  { name: 'masaustu-1440x900', dev: null, touch: false },
];

async function appleChecks() {
  console.log('\n== Apple profilleri (Chromium + devices; WebKit motoru değil) ==');
  const pw = require('playwright');
  const noHint = () => { try { localStorage.setItem('karadelik.iosHintDismissed', '1'); } catch { /* yok say */ } };
  for (const v of APPLE) {
    const dev = v.dev ? pw.devices[v.dev] : null;
    if (v.dev && !dev) { check(`[${v.name}] cihaz profili mevcut`, false, v.dev); continue; }
    const tag = v.name;
    const vp = dev ? dev.viewport : { width: 1440, height: 900 };
    // 1) statik açılış ekranı (main.js tutulur): imza, güvenli alan, ekran görüntüsü
    {
      const ctx = await browser.newContext(dev ? { ...dev, reducedMotion: 'reduce' } : { viewport: vp, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.route('**/src/main.js*', () => {});
      await page.goto(url, { waitUntil: 'commit' });
      await page.waitForSelector('#splash img', { timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('#splash img').complete);
      await sleep(400);
      const r = await page.evaluate(() => { const s = document.getElementById('splash-sign').getBoundingClientRect(); const cs = getComputedStyle(document.getElementById('splash-sign')); return { text: document.getElementById('splash-sign').textContent, bottom: s.bottom, vh: innerHeight, top: s.top, size: parseFloat(cs.fontSize), vis: cs.visibility }; });
      check(`[${tag}] açılış ekranı: imza en altta, küçük, görünüm içinde`, r.text === SIGN && r.bottom <= r.vh && r.top > r.vh * 0.8 && r.size <= 13 && r.vis === 'visible', JSON.stringify(r));
      await page.screenshot({ path: path.join(APPLE_OUT, `${tag}-splash.png`) });
      await ctx.close();
    }
    // 2) uygulama
    const { ctx, page } = await openPage(dev ? { device: { ...dev, __name: tag }, dpr: 1, init: noHint } : { width: 1440, height: 900, init: noHint });
    await page.evaluate(() => window.__karadelik.ui.set({ animate: false, resolutionScale: 0.35, bloom: false }));
    await settleRender(page, 800, 20000);
    const shot = (n) => page.screenshot({ path: path.join(APPLE_OUT, `${tag}-${n}.png`) });
    const ov = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1);
    check(`[${tag}] ana ekran: sayfa taşması / kaydırma çubuğu yok`, !(await ov()));
    await page.evaluate(() => window.__karadelik.ui.close());
    await sleep(500);
    await shot('ana-basit');
    // v3: ilk açılış ipucu kapatılır; sahne şeridi, bilgi kartı ve etiketler
    await page.click('.tip-ok').catch(() => {});
    await sleep(500);
    await shot('ana-sahneler');
    if (v.touch) { const t = await smallTargets(page); check(`[${tag}] ana ekran + sahne şeridi: dokunma hedefleri ≥ 44 px`, t.length === 0, t.slice(0, 6).join('; ')); }
    check(`[${tag}] sahne şeridi alt kenarda ve görünüm içinde`, await page.evaluate(() => { const s = document.getElementById('scene-strip').getBoundingClientRect(); return Math.abs(s.bottom - innerHeight) < 1.5 && s.left >= 0 && s.right <= innerWidth + 1; }));
    await page.evaluate(() => window.__karadelik.ui.openInfo());
    await sleep(450);
    await shot('bilgi-karti');
    check(`[${tag}] bilgi kartı görünüm içinde, şeridin üstünde, kaydırılabilir`, await page.evaluate(() => { const c = document.getElementById('scene-info').getBoundingClientRect(); const s = document.getElementById('scene-strip').getBoundingClientRect(); return c.left >= -1 && c.right <= innerWidth + 1 && c.top >= 0 && c.bottom <= s.top + 1; }));
    if (v.touch) { const t = await smallTargets(page); check(`[${tag}] bilgi kartı: dokunma hedefleri ≥ 44 px`, t.length === 0, t.slice(0, 6).join('; ')); }
    await page.evaluate(() => { window.__karadelik.ui.closeInfo(); window.__karadelik.ui.setLabels(true); });
    await settleRender(page, 600, 15000);
    await sleep(500);
    await shot('etiketler');
    const lbOk = await page.evaluate(() => [...document.querySelectorAll('.lbl:not([hidden])')].every((e) => { const b = e.getBoundingClientRect(); const s = document.getElementById('scene-strip').getBoundingClientRect(); return b.left >= -1 && b.right <= innerWidth + 1 && b.top >= 0 && b.bottom <= s.top + 1; }));
    check(`[${tag}] etiketler görünüm içinde, şerit/araç düğmeleriyle çakışmıyor`, lbOk);
    await page.evaluate(() => window.__karadelik.ui.setLabels(false));
    // overscroll / dokunma / uzun basma
    const css = await page.evaluate(() => ({
      body: getComputedStyle(document.body).overscrollBehaviorY, html: getComputedStyle(document.documentElement).overscrollBehaviorY,
      canvasTouch: getComputedStyle(document.getElementById('sahne')).touchAction, canvasSel: getComputedStyle(document.getElementById('sahne')).userSelect,
      uiTouch: getComputedStyle(document.getElementById('ui')).touchAction, scroll: getComputedStyle(document.querySelector('.panel-scroll')).overscrollBehaviorY,
      fixed: getComputedStyle(document.documentElement).overflow,
    }));
    check(`[${tag}] sahne: lastik bant yok (overscroll none), touch-action none, metin seçimi yok; arayüz çift dokunma yakınlaştırması yok; panel kaydırması contain`, css.body === 'none' && css.html === 'none' && css.canvasTouch === 'none' && css.canvasSel === 'none' && css.uiTouch === 'manipulation' && css.scroll === 'contain', JSON.stringify(css));
    const ctxm = await page.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.getElementById('sahne').dispatchEvent(e); return e.defaultPrevented; });
    check(`[${tag}] sahnede uzun basma / sağ tık menüsü engellenir`, ctxm);

    // panel (Basit)
    await page.evaluate(() => window.__karadelik.ui.open());
    await page.waitForFunction(() => getComputedStyle(document.getElementById('panel')).visibility === 'visible', null, { timeout: 15000 });
    await sleep(500);
    await shot('panel-basit');
    const pb = await page.evaluate(() => { const b = document.getElementById('panel').getBoundingClientRect(); return b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1; });
    check(`[${tag}] Basit panel görünümün içinde, taşma yok`, pb && !(await ov()));
    if (v.touch) { const t = await smallTargets(page); check(`[${tag}] Basit panel: dokunma hedefleri ≥ 44 px`, t.length === 0, t.slice(0, 6).join('; ')); }
    // Gelişmiş
    await page.click('label[for="ui-mode-advanced"]');
    await sleep(300);
    await shot('panel-gelismis');
    if (v.touch) { const t = await smallTargets(page); check(`[${tag}] Gelişmiş panel: dokunma hedefleri ≥ 44 px`, t.length === 0, t.slice(0, 6).join('; ')); }
    await page.evaluate(() => { document.querySelector('[data-sec=info]').open = true; document.querySelector('[data-sec=info]').scrollIntoView(); });
    await sleep(200);
    if (v.touch) { const t = await smallTargets(page); check(`[${tag}] Gelişmiş + bilgi bölümü: dokunma hedefleri ≥ 44 px`, t.length === 0, t.slice(0, 6).join('; ')); }
    await shot('panel-gelismis-bilgi');
    await page.evaluate(() => { document.querySelector('.panel-scroll').scrollTop = 1e6; });
    await sleep(150);
    check(`[${tag}] panel altında imza görünür (kaydırınca)`, await page.evaluate(() => { const e = document.querySelector('.panel-sign'); const b = e.getBoundingClientRect(); const pr = document.getElementById('panel').getBoundingClientRect(); return e.textContent === 'App design by Kuzey Çetin' && b.bottom <= pr.bottom + 1 && b.top >= pr.top; }));
    await page.click('label[for="ui-mode-simple"]');
    if (v.phone) await page.evaluate(() => window.__karadelik.ui.close());
    // … menüsü
    await page.click('#menu-toggle');
    await sleep(350);
    await shot('menu');
    const mi = await page.evaluate(() => { const m = document.getElementById('app-menu').getBoundingClientRect(); return m.left >= 0 && m.right <= innerWidth + 1 && m.bottom <= innerHeight; });
    check(`[${tag}] … menüsü görünüm içinde`, mi);
    if (v.touch) { const t = await smallTargets(page); check(`[${tag}] … menüsü + araç çubuğu: dokunma hedefleri ≥ 44 px`, t.length === 0, t.slice(0, 6).join('; ')); }
    await page.keyboard.press('Escape');
    // kılavuz / gizlilik / hakkında
    for (const [id, nm] of [['guide', 'kilavuz'], ['privacy', 'gizlilik'], ['about', 'hakkinda']]) {
      await openMenuItem(page, id);
      await page.waitForSelector(`#dlg-${id}[open]`);
      await sleep(450);
      await shot(nm);
      const di = await page.evaluate(() => { const d = document.querySelector('dialog[open]').getBoundingClientRect(); return d.left >= 0 && d.right <= innerWidth && d.top >= 0 && d.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth + 1; });
      check(`[${tag}] ${nm} penceresi görünüm içinde`, di);
      if (v.touch) { const t = await smallTargets(page); check(`[${tag}] ${nm} penceresi: dokunma hedefleri ≥ 44 px`, t.length === 0, t.slice(0, 6).join('; ')); }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    }
    // açık tema: yalnız iPad dikey + masaüstü
    if (tag === 'ipadpro11-dikey' || !v.dev) {
      await page.emulateMedia({ colorScheme: 'light' });
      await openMenuItem(page, 'guide');
      await page.waitForSelector('#dlg-guide[open]');
      await sleep(400);
      await shot('kilavuz-acik-tema');
      const lc = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('dlg-guide')); const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map((x) => (s.startsWith('color(') ? Number(x) * 255 : Number(x))); const lum = (c) => { const f = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }; const bg = lum(rgb(cs.backgroundColor)); const fg = lum(rgb(cs.color)); const mu = getComputedStyle(document.querySelector('#dlg-guide dl.terms dd')); const mfg = lum(rgb(mu.color)); const r = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); return { bg: cs.backgroundColor, ratio: r(bg, fg), muted: r(bg, mfg) }; });
      check(`[${tag}] açık temada kılavuz okunaklı (metin ≥ 7:1, soluk metin ≥ 4,5:1)`, lc.ratio >= 7 && lc.muted >= 4.5, JSON.stringify(lc));
      await page.keyboard.press('Escape');
      await page.emulateMedia({ colorScheme: 'dark' });
    }
    if (v.touch && v.dev === 'iPad Pro 11') {
      // Stage Manager / Split View / Slide Over: dar genişlikler
      for (const w of [320, 507, 678, 744]) {
        await page.setViewportSize({ width: w, height: 800 });
        await sleep(250);
        await page.evaluate(() => window.__karadelik.ui.open());
        await sleep(450);
        const r2 = await page.evaluate(() => { const b = document.getElementById('panel').getBoundingClientRect(); const t = document.querySelector('.toolbar').getBoundingClientRect(); const u = document.querySelector('.toolbar-util').getBoundingClientRect(); return { inside: b.left >= -1 && b.right <= innerWidth + 1, overlap: !(t.right <= u.left || u.right <= t.left) && t.bottom > u.top && u.bottom > t.top, ox: document.documentElement.scrollWidth > innerWidth + 1 }; });
        check(`[${tag}] yeniden boyutlandırma ${w}×800 (Split View / Slide Over / Stage Manager): panel içeride, çubuklar çakışmıyor, taşma yok`, r2.inside && !r2.overlap && !r2.ox, JSON.stringify(r2));
        if (w === 320) await shot('dar-320');
      }
    }
    await ctx.close();
  }
}

try {
  if (ONLY === 'shell') { manifestChecks(); await shellChecks(); await pwaScreens(); }
  else if (ONLY === 'simple') await simpleChecks();
  else if (ONLY === 'docs') await docsChecks();
  else if (ONLY === 'apple') await appleChecks();
  else if (ONLY === 'scenes') await sceneChecks();
  else {
    if (ONLY !== 'shots') { manifestChecks(); await logicDesktop(); await logicTouch(); await shellChecks(); await simpleChecks(); await docsChecks(); await sceneChecks(); }
    if (ONLY !== 'logic') { await screenshots(); await pwaScreens(); await appleChecks(); }
  }
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
