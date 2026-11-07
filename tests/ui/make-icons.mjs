/**
 * PWA ikonlarını üretir: public/icons/*.svg ve *.png (headless Chromium, 2D).   node tests/ui/make-icons.mjs
 * Tasarım: stilize gölge + foton halkası + Doppler asimetrili disk (sol/yaklaşan taraf parlak-beyaz, sağ/uzaklaşan sönük-kırmızı).
 * Özgün çizimdir; herhangi bir marka/film görseli taklidi değildir. Maskable sürüm: içerik %80 güvenli dairenin içinde.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../render/harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const DIR = path.join(PROJECT_ROOT, 'public', 'icons');
fs.mkdirSync(DIR, { recursive: true });

/** @param {'any'|'full'} bg  any = yuvarlak köşeli (saydam köşe); full = tam kaplayan (maskable / apple-touch) */
function svg(bg, scale = 1) {
  const bgShape = bg === 'any'
    ? '<rect width="512" height="512" rx="112" fill="url(#bg)"/>'
    : '<rect width="512" height="512" fill="url(#bg)"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="46%" r="75%"><stop offset="0" stop-color="#14192b"/><stop offset="1" stop-color="#03040a"/></radialGradient>
    <linearGradient id="dop" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fffaf0"/><stop offset="0.28" stop-color="#ffd27a"/><stop offset="0.62" stop-color="#e8641e"/><stop offset="1" stop-color="#6a1708"/>
    </linearGradient>
    <linearGradient id="dopArc" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffe6b0"/><stop offset="0.5" stop-color="#ff9a3c"/><stop offset="1" stop-color="#9a2a0c"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    <clipPath id="top"><rect x="0" y="0" width="512" height="256"/></clipPath>
  </defs>
  ${bgShape}
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <g transform="rotate(-9 256 256)">
      <!-- merceklenen disk görüntüsü (gölgenin üstünden aşan yay) + foton halkası -->
      <circle cx="256" cy="256" r="104" fill="none" stroke="url(#dopArc)" stroke-width="30" opacity="0.95" clip-path="url(#top)"/>
      <circle cx="256" cy="256" r="88" fill="none" stroke="#ffb15c" stroke-width="12" filter="url(#glow)" opacity="0.8"/>
      <!-- gölge -->
      <circle cx="256" cy="256" r="84" fill="#000"/>
      <!-- ön disk (Doppler asimetrili) -->
      <path fill-rule="evenodd" fill="url(#dop)" d="M256 222 C150 222 76 240 66 256 C76 272 150 290 256 290 C362 290 436 272 446 256 C436 240 362 222 256 222 Z M256 244 C206 244 168 250 168 256 C168 262 206 268 256 268 C306 268 344 262 344 256 C344 250 306 244 256 244 Z" transform="translate(0 6)"/>
      <!-- gölgenin arka yarısı diski örter -->
      <circle cx="256" cy="256" r="84" fill="#000" clip-path="url(#top)"/>
      <circle cx="256" cy="256" r="85" fill="none" stroke="#fff3d8" stroke-width="5"/>
    </g>
  </g>
</svg>
`;
}

const files = {
  'icon.svg': svg('any'),
  'icon-maskable.svg': svg('full', 0.8),
  'icon-full.svg': svg('full'),
};
for (const [n, s] of Object.entries(files)) fs.writeFileSync(path.join(DIR, n), s);
fs.copyFileSync(path.join(DIR, 'icon.svg'), path.join(DIR, 'favicon.svg'));
fs.rmSync(path.join(DIR, 'icon-full.svg'));

const jobs = [
  ['icon.svg', 'icon-192.png', 192, true],
  ['icon.svg', 'icon-512.png', 512, true],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512, false],
  ['icon.svg', 'favicon-32.png', 32, true],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out, size, transparent] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const data = fs.readFileSync(path.join(DIR, src), 'utf8');
  await page.setContent(`<body style="margin:0;background:transparent"><img style="display:block;width:${size}px;height:${size}px" src="data:image/svg+xml;base64,${Buffer.from(data).toString('base64')}"></body>`);
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: path.join(DIR, out), omitBackground: transparent });
  console.log('yazıldı', out, size);
}
// apple-touch-icon: tam kaplayan (iOS kendi köşe maskesini uygular)
{
  const full = svg('full').replace(/<svg /, '<svg ');
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(`<body style="margin:0"><img style="display:block;width:180px;height:180px" src="data:image/svg+xml;base64,${Buffer.from(full).toString('base64')}"></body>`);
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: path.join(DIR, 'apple-touch-icon.png') });
  console.log('yazıldı apple-touch-icon.png 180');
}
await browser.close();
