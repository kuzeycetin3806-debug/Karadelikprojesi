/**
 * PWA doğrulaması: dist/ çıktısını /Karadelikprojesi/ ALT YOLUNDA (GitHub Pages gibi) basit bir node http sunucusuyla sunar;
 * Playwright ile service worker kaydı/etkinleşmesi, manifest bağlantısı, ÇEVRİMDIŞI açılış + render, güncelleme bildirimi akışını sınar.
 *   node tests/ui/pwa-check.mjs [--no-build]      `node --test` ile ÇALIŞMAZ.
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CHROMIUM_ARGS, PROJECT_ROOT } from '../render/harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const NO_BUILD = process.argv.includes('--no-build');
const BASE_PATH = '/Karadelikprojesi/';
const DIST = path.join(PROJECT_ROOT, 'dist');
if (!NO_BUILD) execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe' });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
let swVersion = 'v1'; // güncelleme testi: sunucu farklı baytlı sw.js verir
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith(BASE_PATH)) { res.writeHead(404).end('yok'); return; }
  let rel = decodeURIComponent(u.pathname.slice(BASE_PATH.length)) || 'index.html';
  const f = path.join(DIST, rel);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end('yok'); return; }
  let body = fs.readFileSync(f);
  if (rel === 'sw.js' && swVersion !== 'v1') body = Buffer.from(body.toString().replace(/const VERSION = '[^']*'/, `const VERSION = '${swVersion}'`));
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': rel === 'sw.js' || rel === 'index.html' ? 'no-cache' : 'public, max-age=31536000' });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const base = origin + BASE_PATH;

const results = [];
function check(name, ok, detail = '') { results.push(ok); console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? '  — ' + detail : ''}`); }

const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GPU stall|ReadPixels/i.test(m.text())) problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(origin)) problems.push(`[http ${r.status()}] ${r.url()}`); });

const firstFrame = () => page.waitForFunction(() => window.__karadelik?.renderer?.getStats().frames > 0, null, { timeout: 120000 });
const cheapStart = async () => { await page.waitForFunction(() => !!window.__karadelik?.ui, null, { timeout: 60000 }); await page.evaluate(() => window.__karadelik.ui.set({ animate: false, resolutionScale: 0.25 })); };

try {
  console.log(`\n== PWA (${base}) ==`);
  await page.goto(base, { waitUntil: 'load' });
  await cheapStart();
  await firstFrame();
  await page.waitForSelector('#splash', { state: 'detached', timeout: 60000 });
  check('alt yolda uygulama açıldı, render başladı, splash kalktı', true);

  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, state: r.active?.state, script: r.active?.scriptURL };
  });
  check('service worker kaydoldu ve etkin', reg.state === 'activated' && reg.scope === base && reg.script === base + 'sw.js', JSON.stringify(reg));

  const man = await page.evaluate(async () => {
    const l = document.querySelector('link[rel=manifest]');
    const r = await fetch(l.href);
    const j = await r.json();
    return { href: l.href, ok: r.ok, ct: r.headers.get('content-type'), name: j.name, icons: j.icons.map((i) => new URL(i.src, l.href).href) };
  });
  check('manifest bağlı, alt yolda çözülüyor', man.href === base + 'manifest.webmanifest' && man.ok && man.name === 'Kara Delik Simülasyonu', man.href);
  const iconStatuses = await page.evaluate(async (u) => Promise.all(u.map((x) => fetch(x).then((r) => r.status))), man.icons);
  check('manifest ikonları alt yoldan 200 döner', iconStatuses.every((s) => s === 200), iconStatuses.join());

  // sayfa SW denetimine geçsin (clients.claim) ve önbellek dolsun
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const c = await caches.open(names[0]);
    return { names, urls: (await c.keys()).map((r) => r.url) };
  });
  check('önbellek: kilavuz.html ve gizlilik.html ön yüklendi (çevrimdışı açılsın)', cached.urls.includes(base + 'kilavuz.html') && cached.urls.includes(base + 'gizlilik.html'));
  const fullHref = await page.evaluate(() => { const d = window.__karadelik.ui.dialogs; return [d.guide.querySelector('a.dlg-full').href, d.privacy.querySelector('a.dlg-full').href]; });
  check('uygulama içi “Tam sayfa aç” bağlantıları alt yolda doğru çözülür', fullHref[0] === base + 'kilavuz.html' && fullHref[1] === base + 'gizlilik.html', fullHref.join(' '));
  const splashImgs = await page.evaluate(async () => Promise.all([...document.querySelectorAll('link[rel=apple-touch-startup-image]')].map((l) => fetch(l.href).then((r) => r.status))));
  check('apple-touch-startup-image bağlantıları alt yoldan 200 döner', splashImgs.length === 15 && splashImgs.every((x) => x === 200), `${splashImgs.length} bağlantı`);
  const sceneIds = ['schwarzschild', 'kerr09', 'extreme', 'faceOn', 'tilt17', 'retro', 'close', 'below'];
  check('önbellek: 8 sahne küçük resmi ön yüklendi (çevrimdışı şerit için)', sceneIds.every((id) => cached.urls.includes(`${base}scenes/${id}.webp`)), `${cached.urls.filter((u) => u.includes('/scenes/')).length}/8`);
  check('önbellek: index + hash\'li assets + manifest + ikonlar ön yüklendi', cached.urls.includes(base) && cached.urls.some((u) => /\/assets\/index-.*\.js$/.test(u)) && cached.urls.some((u) => /\/assets\/index-.*\.css$/.test(u)) && cached.urls.includes(base + 'manifest.webmanifest'), `${cached.names} · ${cached.urls.length} girdi`);

  // ---- çevrimdışı
  await ctx.setOffline(true);
  const resp = await page.reload({ waitUntil: 'load' });
  check('çevrimdışı yenileme: belge servis çalışanından geldi', !!resp && resp.ok() && resp.fromServiceWorker(), `status=${resp?.status()}`);
  await cheapStart();
  await firstFrame();
  await page.waitForSelector('#splash', { state: 'detached', timeout: 60000 });
  check('çevrimdışı: uygulama açıldı ve render başladı', await page.evaluate(() => window.__karadelik.renderer.getStats().frames > 0));
  const imgs = await page.evaluate(async () => {
    const im = [...document.querySelectorAll('.scene-card img')];
    await Promise.all(im.map((i) => i.decode().catch(() => {})));
    return { n: im.length, ok: im.filter((i) => i.complete && i.naturalWidth > 0).length };
  });
  check('çevrimdışı: sahne şeridindeki 8 küçük resim yüklendi ve çözüldü', imgs.n === 8 && imgs.ok === 8, `${imgs.ok}/${imgs.n}`);
  const off = await page.evaluate(() => ({ panel: !!document.getElementById('panel'), fatal: !!document.querySelector('.fatal') }));
  check('çevrimdışı: arayüz kuruldu, hata ekranı yok', off.panel && !off.fatal);
  // alt sayfa gezinmesi de çevrimdışı index'e düşer
  const r2 = await page.goto(base + 'index.html', { waitUntil: 'load' });
  check('çevrimdışı: /index.html gezinmesi önbellekten', !!r2 && r2.ok());
  // yeni sayfalar çevrimdışı açılır (kendi içerikleriyle; index'e düşmez)
  for (const [f, re] of [['kilavuz.html', /Kullanım kılavuzu/], ['gizlilik.html', /7 Kasım 2026/]]) {
    const rr = await page.goto(base + f, { waitUntil: 'load' });
    const t = await page.evaluate(() => ({ title: document.title, h1: document.querySelector('h1')?.textContent || '', body: document.body.innerText, app: !!window.__karadelik }));
    check(`çevrimdışı: ${f} önbellekten açılır, kendi içeriği (uygulama kabuğu değil)`, !!rr && rr.ok() && rr.fromServiceWorker() && re.test(t.body) && !t.app, `status=${rr?.status()} h1=${t.h1}`);
  }
  await page.goto(base + 'index.html', { waitUntil: 'load' });
  await cheapStart();
  await ctx.setOffline(false);

  // ---- güncelleme akışı
  swVersion = 'v2';
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  await page.waitForSelector('#banner-update', { timeout: 30000 });
  check('yeni sw.js → "Yeni sürüm hazır — Yenile" bildirimi', /Yeni sürüm hazır/.test(await page.textContent('#banner-update')));
  await Promise.all([page.waitForEvent('load', { timeout: 60000 }), page.click('#banner-update button.primary')]);
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration()).active?.state === 'activated' && (await caches.keys()).join() === 'karadelik-v2', null, { timeout: 30000 });
  check('Yenile → sayfa yeniden yüklendi, yeni önbellek sürümü etkin, eskisi silindi', true, (await page.evaluate(() => caches.keys())).join());
  await cheapStart();
  await firstFrame();
  check('güncelleme sonrası uygulama çalışıyor', true);

  check('konsolda hata/uyarı, sayfa hatası, HTTP ≥ 400 yok', problems.length === 0, problems.slice(0, 5).join(' | '));
} catch (e) {
  console.error('TEST HATASI:', e);
  results.push(false);
  if (problems.length) console.error(problems.join('\n'));
} finally {
  await browser.close();
  server.close();
}
const bad = results.filter((x) => !x).length;
console.log(`\nÖZET: ${results.length - bad}/${results.length} geçti`);
process.exit(bad ? 1 : 0);
