import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Service worker sürüm damgası: her build'de dist/sw.js içindeki VERSION, derlenmiş
 * index.html'in (hash'li asset adlarını içerir) özetinden türetilir. İçerik değişince
 * SW baytları değişir → tarayıcı yeni SW'yi bulur → "Yeni sürüm hazır" bildirimi çıkar.
 */
function swVersionStamp() {
  let outDir = 'dist';
  return {
    name: 'karadelik-sw-version',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    writeBundle() {
      const sw = join(outDir, 'sw.js');
      const html = join(outDir, 'index.html');
      if (!existsSync(sw) || !existsSync(html)) return;
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      const hash = createHash('sha256').update(readFileSync(html)).digest('hex').slice(0, 10);
      const src = readFileSync(sw, 'utf8');
      const out = src.replace(/const VERSION = '[^']*';/, `const VERSION = '${pkg.version}-${hash}';`);
      if (out === src) this.warn('sw.js içinde VERSION satırı bulunamadı; damga uygulanmadı');
      writeFileSync(sw, out);
    },
  };
}

// GitHub Pages proje sayfası (https://<kullanıcı>.github.io/<depo>/) alt yolda sunulur;
// göreli taban yolu her alt yolda çalışır.
export default defineConfig({
  base: './',
  plugins: [swVersionStamp()],
});
