/**
 * Görsel mod anlık görüntüleri (gözle denetim; otomatik eşik YOK). `node --test` ile çalışmaz.
 *
 *     node tests/render/visual-snapshots.mjs --out=<dizin> [--size=480x360]
 *
 * Her kurulum için <dizin>/<ad>.png yazar. Gözle kontrol listesi (src/render/README.md):
 *  - prograd disk: yaklaşan (mavi) taraf SOLDA (α<0), uzaklaşan (kırmızı) SAĞDA;
 *  - gölge a>0 için sağa (+α) kaymış, yassı kenar solda;
 *  - disk arkasındaki kısım gölgenin üstünden "kavisli" görünür (üst/alt birincil görüntü), n=2 yeşil halka ince şerit;
 *  - gökyüzü ızgarası: kuzey (mavi) üstte; φ=0 meridyeni yeşil, ekvator sarı.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startHarness } from './harness.mjs';

const argv = Object.fromEntries(process.argv.slice(2).map((s) => { const m = s.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [s, true]; }));
const out = String(argv.out ?? path.join(os.tmpdir(), 'karadelik-gorsel'));
const [W, H] = String(argv.size ?? '480x360').split('x').map(Number);
fs.mkdirSync(out, { recursive: true });
const deg = (d) => (d * Math.PI) / 180;

const SHOTS = [
  { name: '01-schwarzschild-85', p: { a: 0, thetaCam: deg(85), rCam: 30, fovY: 40 } },
  { name: '02-kerr09-75-prograd', p: { a: 0.9, thetaCam: deg(75), rCam: 50, fovY: 30 } },
  { name: '03-kerr0998-60', p: { a: 0.998, thetaCam: deg(60), rCam: 50, fovY: 30 } },
  { name: '04-kerr09-75-retrograd', p: { a: 0.9, thetaCam: deg(75), rCam: 50, fovY: 30, prograde: false } },
  { name: '05-kerr09-75-ikincil', p: { a: 0.9, thetaCam: deg(80), rCam: 50, fovY: 22, maxDiskHits: 3 } },
  { name: '06-kerr09-faceon-10', p: { a: 0.9, thetaCam: deg(10), rCam: 50, fovY: 30 } },
  { name: '07-kerr09-yakin-r15', p: { a: 0.9, thetaCam: deg(80), rCam: 15, fovY: 60 } },
];

const h = await startHarness({ width: W, height: H });
try {
  for (const s of SHOTS) {
    const url = await h.page.evaluate((p) => {
      const r = window.__karadelik.renderer;
      r.setParams({ phiCam: 0, diskIn: 'isco', diskOut: 20, prograde: true, maxDiskHits: 1, quality: 'high', ...p });
      r.renderOnce();
      return document.getElementById('sahne').toDataURL('image/png'); // aynı görevde: tampon henüz temizlenmedi
    }, s.p);
    fs.writeFileSync(path.join(out, s.name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('yazıldı', path.join(out, s.name + '.png'));
  }
  console.log('Konsol hata/uyarı:', h.errors.length ? h.errors.join('\n') : 'YOK');
} finally {
  await h.close();
}
