import { defineConfig } from 'vite';

// GitHub Pages proje sayfası (https://<kullanıcı>.github.io/<depo>/) alt yolda sunulur;
// göreli taban yolu her alt yolda çalışır.
export default defineConfig({
  base: './',
});
