/**
 * Sahne küçük resimlerini üretir: public/scenes/<id>.webp   node tests/ui/make-scenes.mjs [--check]
 * Uygulamanın KENDİ renderer'ı headless Chromium (SwiftShader) içinde kullanılır; parametreler src/ui/scenes.js'ten gelir.
 * ESTETİK ayarlar (bloom, türbülans, ton eşleme) renderer varsayılanlarındadır; animasyon kapalı, disk zamanı sabit (tekrarlanabilir).
 * --check: yalnız dosyaların varlığını ve toplam boyutu (≤ 400 KB) denetler.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startHarness, PROJECT_ROOT } from '../render/harness.mjs';
import { SCENES, THUMB_SIZE, thumbFile } from '../../src/ui/scenes.js';

const OUT = path.join(PROJECT_ROOT, 'public', 'scenes');
const BUDGET = 400 * 1024;
fs.mkdirSync(OUT, { recursive: true });

if (process.argv.includes('--check')) {
  let total = 0, bad = 0;
  for (const s of SCENES) {
    const f = path.join(PROJECT_ROOT, 'public', thumbFile(s.id));
    if (!fs.existsSync(f)) { console.error(`YOK: ${thumbFile(s.id)}`); bad++; continue; }
    total += fs.statSync(f).size;
  }
  console.log(`${SCENES.length - bad}/${SCENES.length} küçük resim, toplam ${(total / 1024).toFixed(1)} KB (bütçe ${BUDGET / 1024} KB)`);
  process.exit(bad || total > BUDGET ? 1 : 0);
}

const h = await startHarness({ width: THUMB_SIZE.width, height: THUMB_SIZE.height });
try {
  let total = 0;
  for (const s of SCENES) {
    const patch = { ...s.patch, fovY: s.thumbFovY ?? 34, animate: false, diskTime: 40, resolutionScale: 1, performance: 'quality' };
    const b64 = await h.page.evaluate(async ({ patch, w, hgt }) => {
      const { renderer } = window.__karadelik;
      try { renderer.setParams(patch); } catch { const { performance: _p, ...rest } = patch; renderer.setParams(rest); }
      const c = document.getElementById('sahne');
      renderer.renderOnce({ frames: 16 });
      const blob = await new Promise((res) => c.toBlob(res, 'image/webp', 0.8));
      if (!blob || blob.type !== 'image/webp') throw new Error('webp üretilemedi');
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { b64: btoa(bin), cw: c.width, ch: c.height };
    }, { patch, w: THUMB_SIZE.width, hgt: THUMB_SIZE.height });
    const buf = Buffer.from(b64.b64, 'base64');
    fs.writeFileSync(path.join(PROJECT_ROOT, 'public', thumbFile(s.id)), buf);
    total += buf.length;
    console.log(`yazıldı ${thumbFile(s.id)} ${b64.cw}×${b64.ch} ${(buf.length / 1024).toFixed(1)} KB`);
  }
  console.log(`toplam ${(total / 1024).toFixed(1)} KB (bütçe ${BUDGET / 1024} KB)`);
  if (h.errors.length) console.log('uyarılar:', h.errors.slice(0, 3).join(' | '));
  process.exitCode = total > BUDGET ? 1 : 0;
} finally {
  await h.close();
}
