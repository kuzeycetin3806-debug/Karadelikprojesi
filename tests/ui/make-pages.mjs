/**
 * Bağımsız sayfaları üretir: public/kilavuz.html ve public/gizlilik.html.   node tests/ui/make-pages.mjs [--check]
 * İçerik uygulama içi pencerelerle AYNI kaynaktan gelir (src/ui/strings.js → S.guide, S.privacy); tek kaynak, iki çıktı.
 * --check: dosyalar güncel mi (yeniden üretilince aynı mı) denetler, yazmaz; farklıysa 1 ile çıkar.
 * Sayfalar tek dosyadır: harici kaynak yok, sistem yazı tipi, açık/koyu tema (prefers-color-scheme), yazdırma stili.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../render/harness.mjs';
import { S } from '../../src/ui/strings.js';

const CHECK = process.argv.includes('--check');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function blocks(list) {
  return list.map(([kind, d]) => {
    switch (kind) {
      case 'p': return `<p>${esc(d)}</p>`;
      case 'h': return `<h3>${esc(d)}</h3>`;
      case 'note': return `<p class="note">${esc(d)}</p>`;
      case 'ul': return `<ul>${d.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
      case 'dl': return `<dl class="terms">${d.map(([t, x]) => `<dt>${esc(t)}</dt><dd>${esc(x)}</dd>`).join('')}</dl>`;
      case 'keys': return `<dl class="keys">${d.map(([k, v]) => `<dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
      case 'links': return `<p class="links">${d.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(l)}</a>`).join('')}</p>`;
      default: throw new Error(`bilinmeyen blok: ${kind}`);
    }
  }).join('\n      ');
}
const section = (sec) => `<section id="${esc(sec.id)}"${sec.lang ? ` lang="${esc(sec.lang)}"` : ''}>
      <h2>${esc(sec.title)}</h2>
      ${blocks(sec.blocks)}
    </section>`;

const CSS = `
:root{color-scheme:light dark;--bg:#f5f5f7;--card:#fff;--text:#1d1d1f;--muted:#55555c;--line:rgba(0,0,0,.12);--accent:#0a5fc4;--kbd:rgba(0,0,0,.05)}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#1c1c1e;--text:#f2f2f7;--muted:#a6a6ae;--line:rgba(255,255,255,.14);--accent:#64b5ff;--kbd:rgba(255,255,255,.1)}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
@supports (font:-apple-system-body){html{font:-apple-system-body}}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:1rem;line-height:1.55;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
.wrap{max-width:46rem;margin:0 auto}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px}
.bar a,.bar button{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--accent);font:inherit;font-size:.9375rem;text-decoration:none;cursor:pointer}
h1{font-size:1.75rem;line-height:1.2;margin:.4em 0 .2em}
.lead,.meta{color:var(--muted);margin:.2em 0 1em}
nav.toc{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 1.2em;padding:0}
nav.toc a{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--text);text-decoration:none;font-size:.875rem}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:4px 18px 16px;margin:0 0 14px;scroll-margin-top:12px}
h2{font-size:1.2rem;margin:.9em 0 .4em}
h3{font-size:1rem;margin:1.1em 0 .3em}
p{margin:.5em 0}
ul{margin:.5em 0;padding-left:1.3em}
li{margin:.25em 0}
dl.terms dt{font-weight:650;margin-top:.8em}
dl.terms dd{margin:.15em 0 0;color:var(--muted)}
dl.keys{display:grid;grid-template-columns:minmax(9rem,14rem) 1fr;gap:.5em 1em;margin:.5em 0;align-items:baseline}
dl.keys dt,dl.keys dd{margin:0}
@media (max-width:30rem){dl.keys{grid-template-columns:1fr;gap:.1em}dl.keys dd{margin-bottom:.6em}}
kbd{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:.8125rem;padding:2px 8px;border-radius:6px;border:1px solid var(--line);border-bottom-width:2px;background:var(--kbd);white-space:nowrap}
.note{color:var(--muted);font-size:.875rem}
.links{display:flex;flex-wrap:wrap;gap:4px 18px}
.links a{display:inline-flex;align-items:center;min-height:44px;color:var(--accent)}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
footer{margin:18px 0 0;color:var(--muted);font-size:.8125rem;text-align:center}
footer p{margin:.3em 0}
footer a{display:inline-flex;align-items:center;min-height:44px;padding:0 8px}
footer .sign{opacity:.8;letter-spacing:.03em}
@media print{
  :root{--bg:#fff;--card:#fff;--text:#000;--muted:#333;--line:#bbb;--accent:#000}
  body{padding:0;font-size:11pt}.bar,nav.toc{display:none}section{break-inside:avoid;border:0;border-bottom:1px solid #ccc;border-radius:0;padding:0 0 8px}
  a[href^="http"]::after{content:" (" attr(href) ")";font-size:.8em;color:#333}
}
@media (prefers-contrast:more){:root{--line:currentColor}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`.trim();

function page({ title, desc, h1, lead, meta, secs, other, selfFile }) {
  const toc = secs.map((s) => `<a href="#${esc(s.id)}">${esc(s.title)}</a>`).join('');
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="author" content="Kuzey Çetin">
<link rel="icon" type="image/svg+xml" href="icons/favicon.svg">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>
${CSS}
</style>
</head>
<body>
<!-- Bu dosya tests/ui/make-pages.mjs ile src/ui/strings.js içeriğinden üretilir; elle düzenlemeyin. -->
<div class="wrap">
  <div class="bar">
    <a href="./">&larr; ${esc(S.guide.backToApp)}</a>
    <button type="button" onclick="window.print()">${esc(S.guide.print)}</button>
  </div>
  <header>
    <h1>${esc(h1)}</h1>
    ${lead ? `<p class="lead">${esc(lead)}</p>` : ''}${meta ? `<p class="meta">${esc(meta)}</p>` : ''}
  </header>
  <nav class="toc" aria-label="${esc(S.guide.toc)}">${toc}</nav>
  <main>
    ${secs.map(section).join('\n    ')}
  </main>
  <footer>
    <p><a href="${other.href}">${esc(other.label)}</a> · <a href="./">${esc(S.guide.backToApp)}</a></p>
    <p>${esc(S.app.copyright)}</p>
    <p class="sign">${esc(S.app.designer)}</p>
  </footer>
</div>
</body>
</html>
`;
}

const pv = S.privacy;
const files = {
  'kilavuz.html': page({
    title: `${S.guide.title} — ${S.appTitle}`, desc: S.guide.lead, h1: S.guide.title, lead: S.guide.lead, meta: '',
    secs: S.guide.sections, other: { href: 'gizlilik.html', label: S.toolbar.privacy }, selfFile: 'kilavuz.html',
  }),
  'gizlilik.html': page({
    title: `${pv.title} — ${S.appTitle}`, desc: `${S.appTitle}: ${pv.sections[0].blocks[0][1]}`, h1: pv.title, lead: '', meta: `${pv.appName} · ${pv.effective}`,
    secs: [...pv.sections, pv.en], other: { href: 'kilavuz.html', label: S.toolbar.guide }, selfFile: 'gizlilik.html',
  }),
};

let stale = 0;
for (const [name, html] of Object.entries(files)) {
  const f = path.join(PROJECT_ROOT, 'public', name);
  if (CHECK) {
    const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    if (cur !== html) { stale++; console.error(`ESKİ: public/${name} (node tests/ui/make-pages.mjs ile yeniden üretin)`); }
  } else {
    fs.writeFileSync(f, html);
    console.log(`yazıldı public/${name} (${(html.length / 1024).toFixed(1)} KB)`);
  }
}
if (CHECK) { console.log(stale ? 'sayfalar güncel değil' : 'sayfalar güncel'); process.exit(stale ? 1 : 0); }
