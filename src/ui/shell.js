// Uygulama kabuğu: açılış ekranı, ölümcül hata / bağlam kaybı ekranı, bildirim şeritleri.
import { h, icon, ICONS } from './dom.js';
import { S } from './strings.js';
import { isStandalone } from './pwa.js';

const SPLASH_TIMEOUT_MS = 25000;

export function initShell() {
  if (isStandalone()) document.documentElement.classList.add('standalone');

  // ---- açılış ekranı (işaretleme index.html'de; JS gelmeden de görünür)
  const splash = document.getElementById('splash');
  const bar = document.getElementById('splash-bar');
  const msg = document.getElementById('splash-msg');
  const track = splash?.querySelector('[role=progressbar]');
  let hidden = false;
  function progress(pct, text) {
    if (!splash || hidden) return;
    if (bar) bar.style.width = `${pct}%`;
    track?.setAttribute('aria-valuenow', String(Math.round(pct)));
    if (text && msg) msg.textContent = text;
  }
  function hideSplash() {
    if (!splash || hidden) return;
    hidden = true;
    progress(100, S.app.splash.ready);
    // kısa bir an "hazır" göster, sonra yumuşak kaybol
    setTimeout(() => {
      splash.classList.add('done');
      document.body.classList.add('app-ready');
      setTimeout(() => splash.remove(), 900);
    }, 120);
  }

  /** İlk kare çizilene (getStats().frames > 0) kadar bekler; zaman aşımında yine de gizler. */
  function whenFirstFrame(renderer) {
    const t0 = performance.now();
    const tick = () => {
      let frames = 0;
      try { frames = renderer.getStats().frames; } catch { /* yok say */ }
      if (frames > 0 || performance.now() - t0 > SPLASH_TIMEOUT_MS) hideSplash();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---- hata ekranı
  let fatalEl = null;
  function showFatalScreen({ title, text, err, lost }) {
    hideSplash();
    fatalEl?.remove();
    const detail = err ? String(err?.message || err) : '';
    fatalEl = h('div.fatal', { role: 'alert', 'data-fatal': lost ? 'lost' : 'init' },
      h('div.fatal-card', null,
        h('div.fatal-icon', null, icon(...ICONS.info)),
        h('h2', null, title),
        h('p', null, text),
        !lost && h('div.fatal-needs', null,
          h('h3', null, S.app.fatal.needs),
          h('ul', null, ...S.app.fatal.needsList.map((t) => h('li', null, t)))),
        h('button.btn.fatal-btn', { type: 'button', onClick: () => location.reload() }, S.app.fatal.retry),
        detail && h('details', null, h('summary', null, S.app.fatal.detail), h('pre', null, detail))));
    document.body.append(fatalEl);
    fatalEl.querySelector('button')?.focus({ preventScroll: true });
  }
  function fatal(err) {
    showFatalScreen({ title: S.app.fatal.title, text: S.app.fatal.noWebgl, err });
  }
  function watchContext(canvas) {
    canvas.addEventListener('webglcontextlost', () => showFatalScreen({ title: S.app.fatal.lostTitle, text: S.app.fatal.lostText, lost: true }));
    canvas.addEventListener('webglcontextrestored', () => { fatalEl?.remove(); fatalEl = null; });
  }

  // ---- bildirim şeridi (güncelleme, iOS ipucu, çevrimdışı hazır)
  function banner({ text, actions = [], icn, id }) {
    document.getElementById(id)?.remove();
    const el = h('div.banner', { role: 'status', id, 'aria-live': 'polite' },
      icn ? icon(...icn) : null,
      h('span.banner-text', null, text),
      h('span.banner-actions', null, ...actions.map(([label, fn, primary]) =>
        h(`button.btn.banner-btn${primary ? '.primary' : ''}`, { type: 'button', onClick: () => { fn?.(); el.remove(); } }, label))));
    document.body.append(el);
    return el;
  }

  progress(25, S.app.splash.init);
  return { progress, whenFirstFrame, hideSplash, fatal, watchContext, banner };
}
