// PWA yardımcıları: service worker kaydı + güncelleme bildirimi, "uygulamayı yükle" (beforeinstallprompt), iOS ipucu.
// Bağımlılıksız; DOM'a dokunmaz (bildirimler index.js / shell.js tarafından çizilir).

const IOS_HINT_KEY = 'karadelik.iosHintDismissed';

export function isStandalone() {
  const mm = (q) => !!globalThis.matchMedia?.(q).matches;
  return mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)') || mm('(display-mode: minimal-ui)') || globalThis.navigator?.standalone === true;
}

export function isIOS() {
  const n = globalThis.navigator || {};
  return /iphone|ipad|ipod/i.test(n.userAgent || '') || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
}

// ---- yükleme istemi
let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach((f) => { try { f(); } catch { /* dinleyici hatası uygulamayı bozmasın */ } });

globalThis.addEventListener?.('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  emit();
});
globalThis.addEventListener?.('appinstalled', () => { deferred = null; emit(); });

export const canInstall = () => !!deferred && !isStandalone();
export function onInstallChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
export async function promptInstall() {
  if (!deferred) return null;
  const ev = deferred;
  deferred = null;
  emit();
  try {
    await ev.prompt();
    return (await ev.userChoice).outcome;
  } catch {
    return null;
  }
}

// ---- iOS "Ana Ekrana Ekle" ipucu (bir kez)
function store(op, v) {
  try { return op === 'get' ? localStorage.getItem(IOS_HINT_KEY) : localStorage.setItem(IOS_HINT_KEY, v); } catch { return null; }
}
export const shouldShowIosHint = () => isIOS() && !isStandalone() && !store('get');
export const dismissIosHint = () => { store('set', '1'); };

// ---- service worker
/**
 * @param {{onUpdateReady?: (apply: () => void) => void, onOfflineReady?: () => void}} cb
 * Dev sunucuda (import.meta.env.DEV) kaydedilmez.
 */
export function registerServiceWorker({ onUpdateReady, onOfflineReady } = {}) {
  if (import.meta.env?.DEV || !('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !userApplied) return;
    reloading = true;
    location.reload();
  });
  let userApplied = false;
  const hadController = !!navigator.serviceWorker.controller;

  const watch = (reg) => {
    const announce = (sw) => {
      if (!sw) return;
      const check = () => {
        if (sw.state !== 'installed') return;
        if (navigator.serviceWorker.controller) {
          onUpdateReady?.(() => { userApplied = true; sw.postMessage('SKIP_WAITING'); });
        } else if (!hadController) {
          onOfflineReady?.();
        }
      };
      sw.addEventListener('statechange', check);
      check();
    };
    if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
    reg.addEventListener('updatefound', () => announce(reg.installing));
    // uzun süre açık kalan uygulamada saatte bir güncelleme denetimi
    setInterval(() => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }, 3600_000);
  };

  const go = () => navigator.serviceWorker.register('./sw.js').then(watch).catch((e) => console.warn('service worker kaydı başarısız', e));
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}
