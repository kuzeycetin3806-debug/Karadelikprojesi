/**
 * GPU doğrulama ortak altyapısı: Vite dev sunucusu (JS API) + headless Chromium (SwiftShader WebGL2).
 * Bu dosya `node --test` ile ÇALIŞTIRILMAZ (adı *.test.mjs değil). Playwright global kurulumdan `require` ile alınır.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const CHROMIUM_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/**
 * @param {{width?:number, height?:number}} [o]  tarayıcı görünümü (canvas boyutu); küçük tut: SwiftShader yazılımsal
 * @returns {Promise<{page, messages:string[], errors:string[], url:string, close:()=>Promise<void>}>}
 */
export async function startHarness({ width = 128, height = 96 } = {}) {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const url = server.resolvedUrls.local[0];

  const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const messages = [];
  const errors = [];
  page.on('console', (m) => {
    const t = `[${m.type()}] ${m.text()}`;
    messages.push(t);
    if (m.type() === 'error' || m.type() === 'warning') errors.push(t);
  });
  page.on('pageerror', (e) => {
    const t = `[pageerror] ${e.message}`;
    messages.push(t);
    errors.push(t);
  });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__karadelik?.renderer, null, { timeout: 60000 });
  // main.js start() çağırdı: tam görünümde gereksiz çizimi durdur (testler kareleri kendisi ister)
  await page.evaluate(() => window.__karadelik.renderer.stop());

  return {
    page,
    messages,
    errors,
    url,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}
