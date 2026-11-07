/**
 * Apple başlangıç görüntülerini (apple-touch-startup-image) üretir: public/splash/*.png ve index.html içindeki
 * <!-- splash:begin --> … <!-- splash:end --> bloğunu günceller.   node tests/ui/make-splash.mjs
 *
 * Görüntü, index.html'deki GERÇEK açılış ekranı işaretlemesi ve CSS'iyle (#splash) çizilir → uygulama açılırken
 * başlangıç görüntüsü ile web açılış ekranı arasında sıçrama olmaz.
 *
 * Boyut seçimi (CSS pt, DPR 3 iPhone / 2 iPad; media sorgusu portre değerleriyle yazılır):
 *  - iPhone: Face ID'li güncel modeller — 440×956 (16 Pro Max), 430×932 (14/15 Pro Max, 15/16 Plus), 428×926 (12/13 Pro Max, 14 Plus),
 *    402×874 (16 Pro), 393×852 (14 Pro, 15, 15 Pro, 16), 390×844 (12–14), 375×812 (X/XS/11 Pro/mini).
 *  - iPad (dikey+yatay): 1024×1366 (12.9"), 834×1194 (11"/Pro), 820×1180 (10.9" Air/10. nesil), 810×1080 (10.2").
 *  - Kapsam dışı (eski/az kullanılan) cihazlar iOS'un varsayılan açılışını görür; manifest background_color (#000000) ile uyumlu koyu zemin.
 *  Biçim: JPEG (kalite 88). Chromium gradyanlara gürültü ekler; PNG ≈ 1 MB/dosya olurdu, JPEG onlarca KB. iOS başlangıç görüntüsü olarak JPEG'i de kabul eder.
 *  Neden alt küme: her görüntü yaklaşık onlarca KB; yalnız eşleşen dosya indirilir, ama depoyu ve önbelleği şişirmemek için tam liste (≈ 30 boyut) üretilmez.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../render/harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const IPHONES = [[440, 956], [430, 932], [428, 926], [402, 874], [393, 852], [390, 844], [375, 812]].map(([w, h]) => ({ kind: 'iphone', w, h, dpr: 3 }));
const IPADS = [[1024, 1366], [834, 1194], [820, 1180], [810, 1080]].map(([w, h]) => ({ kind: 'ipad', w, h, dpr: 2 }));

const htmlPath = path.join(PROJECT_ROOT, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
const splash = /<div id="splash"[\s\S]*?<\/div>\s*(?=<noscript>|<script)/.exec(html)?.[0] ?? /<div id="splash"[\s\S]*?<div class="sign"[^>]*>[^<]*<\/div>\s*<\/div>/.exec(html)[0];
const icon = fs.readFileSync(path.join(PROJECT_ROOT, 'public/icons/icon-192.png')).toString('base64');
const page_html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>${style}</style></head><body>${splash.replace('/icons/icon-192.png', 'data:image/png;base64,' + icon)}</body></html>`;

const OUT = path.join(PROJECT_ROOT, 'public', 'splash');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const links = [];
for (const d of [...IPHONES, ...IPADS]) {
  for (const orient of d.kind === 'ipad' ? ['portrait', 'landscape'] : ['portrait']) {
    const [vw, vh] = orient === 'portrait' ? [d.w, d.h] : [d.h, d.w];
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: d.dpr, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.setContent(page_html);
    await page.waitForFunction(() => document.querySelector('#splash img').complete);
    const name = `${d.kind}-${d.w * d.dpr}x${d.h * d.dpr}${orient === 'landscape' ? '-yatay' : ''}.jpg`;
    await page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 88 });
    await ctx.close();
    const kb = (fs.statSync(path.join(OUT, name)).size / 1024).toFixed(0);
    console.log(`yazıldı splash/${name} (${vw}×${vh} @${d.dpr}x) ${kb} KB`);
    links.push(`  <link rel="apple-touch-startup-image" href="/splash/${name}" media="(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: ${orient})" />`);
  }
}
await browser.close();

const next = html.replace(/(<!-- splash:begin[^>]*-->)[\s\S]*?(<!-- splash:end -->)/, `$1\n${links.join('\n')}\n  $2`);
fs.writeFileSync(htmlPath, next);
console.log(`index.html güncellendi (${links.length} bağlantı)`);
