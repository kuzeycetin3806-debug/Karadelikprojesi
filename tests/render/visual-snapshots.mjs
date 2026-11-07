/**
 * Görsel mod anlık görüntüleri (gözle denetim; otomatik eşik YOK). `node --test` ile çalışmaz.
 *
 *     node tests/render/visual-snapshots.mjs [--out=<dizin>] [--size=640x480] [--frames=8] [--only=ad,ad]
 *
 * Varsayılan çıktı dizini: /tmp/karadelik-gorsel-4b/. Her kurulum için <dizin>/<ad>.png yazar.
 * Tam hat: iz sürme (frames kare jitter'lı biriktirme) → bloom → ACES → sRGB. `diskTime` sabit ⇒ tekrarlanabilir görüntü.
 *
 * Gözle kontrol listesi (src/render/README.md §Görsel inceleme):
 *  - prograd disk: yaklaşan (mavi-beyaz, parlak) taraf SOLDA (α<0), uzaklaşan (turuncu, sönük) SAĞDA;
 *  - gölge a>0 için sağa kaymış, yassı kenar solda; diskin arka yarısı gölgenin üstünden kavisli (birincil görüntü), altında ince ikincil yay;
 *  - ISCO'ya doğru disk kararır (T→0), tepe r≈9.55 M (a=0) civarı en parlak; yıldızlar kutup dikişi olmadan, ince noktalar;
 *  - halo (bloom) yalnız en parlak bölgede, yıldızlar sert noktalar kalmalı; Samanyolu bandı hafif.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startHarness } from './harness.mjs';

const argv = Object.fromEntries(process.argv.slice(2).map((s) => { const m = s.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [s, true]; }));
const out = String(argv.out ?? '/tmp/karadelik-gorsel-4b');
const [W, H] = String(argv.size ?? '640x480').split('x').map(Number);
const FRAMES = Number(argv.frames ?? 8);
const only = argv.only ? String(argv.only).split(',') : null;
fs.mkdirSync(out, { recursive: true });
const deg = (d) => (d * Math.PI) / 180;

export const SHOTS = [
  { name: '01-schwarzschild-yandan-86', p: { a: 0, thetaCam: deg(86), rCam: 40, fovY: 30 } },
  { name: '02-kerr09-75', p: { a: 0.9, thetaCam: deg(75), rCam: 50, fovY: 30 } },
  { name: '03-kerr0998-85', p: { a: 0.998, thetaCam: deg(85), rCam: 50, fovY: 30 } },
  { name: '04-kerr09-yuzden-10', p: { a: 0.9, thetaCam: deg(10), rCam: 50, fovY: 30 } },
  { name: '05-kerr09-yakin-r15', p: { a: 0.9, thetaCam: deg(80), rCam: 15, fovY: 60 } },
];

const h = await startHarness({ width: W, height: H });
try {
  for (const s of SHOTS) {
    if (only && !only.some((o) => s.name.includes(o))) continue;
    const t0 = Date.now();
    const url = await h.page.evaluate(({ p, frames }) => {
      const r = window.__karadelik.renderer;
      r.setParams({
        phiCam: 0, diskIn: 'isco', diskOut: 20, prograde: true, maxDiskHits: 1, quality: 'high', resolutionScale: 1,
        diskTime: 40, dynamicResolution: false, ...p,
      });
      r.renderOnce({ frames });
      return document.getElementById('sahne').toDataURL('image/png'); // aynı görevde: tampon henüz temizlenmedi
    }, { p: s.p, frames: FRAMES });
    fs.writeFileSync(path.join(out, s.name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('yazıldı', path.join(out, s.name + '.png'), `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  console.log('Konsol hata/uyarı:', h.errors.length ? h.errors.join('\n') : 'YOK');
  if (h.errors.length) process.exitCode = 1;
} finally {
  await h.close();
}
