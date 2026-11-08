// Arayüz giriş noktası: createUI(renderer, { canvas, root }).
// Renderer ile sözleşme: yalnız setParams / getParams / getStats / renderOnce (src/render/README.md §3).
import '../styles/ui.css';
import { h, icon, ICONS } from './dom.js';
import { S } from './strings.js';
import { createCameraController } from './camera.js';
import { createPanel } from './panel.js';
import { createDialogs } from './dialogs.js';
import { canInstall, onInstallChange, promptInstall } from './pwa.js';
import { PREF_KEYS, readPref, writePref } from './prefs.js';
import { SCENES, DEFAULT_SCENE, sceneById, sceneFov } from './scenes.js';
import { createSceneStrip } from './sceneStrip.js';
import { createInfoCard } from './infoCard.js';
import { createLabels } from './labels.js';
import { fixed, sig } from './format.js';

const CAMERA_KEYS = ['phiCam', 'thetaCam', 'rCam'];
const PHONE_MQ = '(max-width: 699px)';

export function createUI(renderer, { canvas, root = document.body } = {}) {
  if (!canvas) throw new TypeError('createUI: canvas gerekli');

  // Performans: renderer'ın 'auto' modu (cihaza göre çözünürlüğü kendisi ayarlar) kullanılır; arayüz kendi mobil varsayılanını koymaz.
  // 'auto' henüz yoksa (RangeError) eski davranışa düşülür: dokunmatik cihazda mobil kalite + pil modu (README §3.5).
  const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches;
  const defaults = renderer.getParams();
  let hasAuto = false;
  try {
    renderer.setParams({ performance: 'auto' });
    hasAuto = renderer.getParams().performance === 'auto';
  } catch {
    if (coarse) renderer.setParams({ quality: 'mobile', performance: 'battery', resolutionScale: 0.75 });
  }
  // Dikey (portre) ekranlarda yatay görüş çok daralır ve disk kırpılır → başlangıç fovY'sini en/boy oranına göre hafifçe artır.
  const aspect = (globalThis.innerWidth || 1) / (globalThis.innerHeight || 1);
  if (aspect < 1.2) {
    const fov = Math.min(55, Math.max(defaults.fovY, (2 * Math.atan(0.5 / aspect) * 180) / Math.PI));
    renderer.setParams({ fovY: Math.round(fov) });
  }
  const resetBase = { ...renderer.getParams() };

  const state = { mass: null, open: false, infoOpen: false, scene: DEFAULT_SCENE };
  const reducedMq = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const phoneMq = globalThis.matchMedia?.(PHONE_MQ);

  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', S.canvasLabel);

  // ---- yenileme (rAF ile birleştirilir): başlık, etiketler, bilgi kartı sayıları, ayar paneli
  let refreshQueued = false;
  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      updateCaption();
      labels.schedule();
      if (state.infoOpen) infoCard.refreshNumbers();
      if (state.open) panel.refresh();
    });
  }

  // ---- ilk açılış ipucu (bir kez; kapatılabilir; localStorage'da hatırlanır)
  const tipRow = (ic, [title, sub]) => h('li', null, h('span.tip-ic', null, icon(...ic)), h('span.tip-tx', null, h('strong', null, title), h('small', null, sub)));
  const tipEl = h('aside.tip', { role: 'region', 'aria-label': S.tip.label },
    h('h2', null, S.tip.title),
    h('ul', null,
      tipRow(ICONS.orbit, S.tip.drag),
      tipRow(ICONS.pinch, S.tip.pinch),
      tipRow(ICONS.scenes, S.tip.settings)),
    h('button.btn.tip-ok', { type: 'button', onClick: () => hideHint() }, S.tip.ok));
  let tipGone = readPref(PREF_KEYS.tipSeen) === '1';
  if (tipGone) tipEl.hidden = true;
  function hideHint() {
    if (tipGone) return;
    tipGone = true;
    writePref(PREF_KEYS.tipSeen, '1');
    tipEl.classList.add('gone');
    setTimeout(() => { tipEl.hidden = true; }, 400);
  }

  const cam = createCameraController(canvas, renderer, { onChange: scheduleRefresh, onUserInput: hideHint });

  // ---- tek giriş noktası: renderer'a yazan her şey buradan geçer
  function set(patch) {
    const rest = {};
    const camPatch = {};
    for (const [k, v] of Object.entries(patch)) (CAMERA_KEYS.includes(k) ? camPatch : rest)[k] = v;
    if (Object.keys(rest).length) {
      const out = renderer.setParams(rest);
      if ('a' in rest) cam.setSpin(out.a);
    }
    if (Object.keys(camPatch).length) {
      cam.setTarget({ phi: camPatch.phiCam, theta: camPatch.thetaCam, r: camPatch.rCam });
    }
    scheduleRefresh();
  }

  // ---- sahne durumu: kullanıcı fiziksel/kamera ayarını Ayarlar'dan değiştirirse görünüm "özel" olur
  const CUSTOM_KEYS = ['a', 'prograde', 'thetaCam', 'rCam', 'phiCam', 'fovY', 'disk'];
  let tweenRaf = 0;
  const cancelTween = () => { if (tweenRaf) cancelAnimationFrame(tweenRaf); tweenRaf = 0; };
  /** Sayısal parametreleri (a, fovY) yumuşakça hedefe götürür; azaltılmış harekette anında uygular. */
  function tweenParams(target, ms = 900) {
    cancelTween();
    const p0 = renderer.getParams();
    const from = Object.fromEntries(Object.keys(target).map((k) => [k, p0[k]]));
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const patch = {};
      for (const k of Object.keys(target)) patch[k] = t >= 1 ? target[k] : from[k] + (target[k] - from[k]) * e;
      set(patch);
      tweenRaf = t < 1 ? requestAnimationFrame(step) : 0;
    };
    tweenRaf = requestAnimationFrame(step);
  }

  /** Sahneyi uygular: parametre kümesini renderer'a yazar, kamera yumuşakça geçer. */
  function applyScene(id, { instant = false } = {}) {
    const sc = sceneById(id);
    if (!sc) return false;
    cancelTween();
    const inst = instant || !!reducedMq?.matches;
    const { a, prograde, thetaCam, phiCam, rCam, disk } = sc.patch;
    const fovY = sceneFov(sc, resetBase.fovY);
    state.scene = id;
    set({ prograde, disk });
    cam.setHome({ phi: phiCam, theta: thetaCam, r: rCam });
    if (inst) {
      set({ a, fovY });
      cam.setTarget({ phi: phiCam, theta: thetaCam, r: rCam }, { instant: true });
    } else {
      tweenParams({ a, fovY });
      cam.setTarget({ phi: phiCam, theta: thetaCam, r: rCam }, { slow: true });
    }
    strip.select(id);
    infoCard.render(id);
    canvas.setAttribute('aria-label', `${S.canvasLabel} ${S.scenes[id].title}.`);
    scheduleRefresh();
    return true;
  }
  /** Ayarlar panelinden gelen kullanıcı değişiklikleri. */
  function userSet(patch) {
    cancelTween();
    if (state.scene && Object.keys(patch).some((k) => CUSTOM_KEYS.includes(k))) {
      state.scene = null;
      strip.select(null);
      infoCard.render(null);
      canvas.setAttribute('aria-label', S.canvasLabel);
    }
    set(patch);
  }

  const panel = createPanel({
    renderer,
    hasAuto,
    set: userSet,
    applyPreset: (pr) => { if (!applyScene(pr.sceneId ?? pr.id)) userSet(pr.patch); },
    getMass: () => state.mass,
    setMass: (v) => { state.mass = v; panel.invalidateInfo(); scheduleRefresh(); },
    onClose: () => setOpen(false),
    onResetAll: () => {
      cancelTween();
      const { phiCam, thetaCam, rCam, ...rest } = resetBase;
      set(rest);
      applyScene(DEFAULT_SCENE, { instant: true });
    },
  });

  // ---- kalıcı düğmeler: (1) "i" bilgi (sol üst), (2) "…" menü (sağ üst). Başka kalıcı düğme yok.
  const infoBtn = h(
    'button.btn.tb-btn.tb-icon.tb-info',
    { type: 'button', id: 'info-toggle', 'aria-controls': 'scene-info', 'aria-expanded': 'false', 'aria-label': S.toolbar.infoLabel, title: S.toolbar.info, onClick: () => setInfoOpen(!state.infoOpen) },
    icon(...ICONS.info)
  );
  const toolbar = h('div.toolbar', { role: 'toolbar', 'aria-label': S.toolbar.barLabel }, infoBtn);

  // yükle (beforeinstallprompt) · tam ekran
  const installBtn2 = h('button.btn.install-wide', { type: 'button', hidden: true, 'data-install': '', onClick: () => { promptInstall(); } }, icon(...ICONS.download), h('span', null, S.toolbar.install));
  const fsEl = document.documentElement;
  const fsApi = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
  const fsActive = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function toggleFullscreen() {
    try {
      const p = fsActive()
        ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
        : (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl);
      p?.catch?.(() => {});
    } catch { /* kullanıcı jesti yoksa vb. */ }
  }

  const dialogs = createDialogs({ install: installBtn2 });

  const menuBtn = h('button.btn.tb-btn.tb-icon.tb-more', {
    type: 'button', id: 'menu-toggle', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'app-menu',
    'aria-label': S.toolbar.more, title: S.toolbar.more, onClick: () => (menu.hidden ? openMenu({ focusFirst: true }) : closeMenu()),
  }, icon(...ICONS.more));
  const mkItem = (id, ic, label, fn, attrs) => h('button.menu-item', {
    type: 'button', role: 'menuitem', tabindex: '-1', 'data-menu': id, ...attrs,
    onClick: () => { closeMenu({ focus: id === 'settings' ? false : true }); fn(); },
  }, icon(...ic), h('span', null, label));
  const itemSettings = mkItem('settings', ICONS.sliders, S.toolbar.panelOpen, () => setOpen(!state.open));
  const itemReset = mkItem('reset', ICONS.reset, S.toolbar.resetCamera, () => cam.reset());
  const itemShot = mkItem('screenshot', ICONS.camera, S.toolbar.screenshot, () => { screenshot(); });
  const itemGuide = mkItem('guide', ICONS.book, S.toolbar.guide, () => dialogs.openGuide());
  const itemAbout = mkItem('about', ICONS.info, S.toolbar.about, () => dialogs.openAbout());
  const itemPrivacy = mkItem('privacy', ICONS.shield, S.toolbar.privacy, () => dialogs.openPrivacy());
  const itemFs = mkItem('fullscreen', ICONS.fullscreen, S.toolbar.fullscreen, toggleFullscreen, { hidden: !fsApi, 'data-install': null });
  const itemInstall = mkItem('install', ICONS.download, S.toolbar.install, () => { promptInstall(); }, { hidden: true, 'data-install': '' });
  const menu = h('div#app-menu.menu', { role: 'menu', 'aria-label': S.toolbar.menuLabel, hidden: true }, itemSettings, itemReset, itemShot, itemGuide, itemAbout, itemPrivacy, itemFs, itemInstall);
  const menuItems = () => [...menu.querySelectorAll('.menu-item')].filter((b) => !b.hidden);
  function openMenu({ focusFirst = false } = {}) {
    menu.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    if (focusFirst) menuItems()[0]?.focus();
  }
  function closeMenu({ focus = true } = {}) {
    if (menu.hidden) return;
    const inside = menu.contains(document.activeElement);
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    if (focus && inside) menuBtn.focus();
  }
  menu.addEventListener('keydown', (e) => {
    const items = menuItems();
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
    else if (e.key === 'Tab') closeMenu({ focus: false });
  });
  menuBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu({ focusFirst: true }); }
    else if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); closeMenu(); }
  });
  const onDocPointer = (e) => { if (!menu.hidden && !utilbar.contains(e.target)) closeMenu({ focus: false }); };
  document.addEventListener('pointerdown', onDocPointer, true);
  const utilbar = h('div.toolbar.toolbar-util', { role: 'toolbar', 'aria-label': S.toolbar.utilLabel }, menuBtn, menu);

  const syncInstall = () => { const v = canInstall(); itemInstall.hidden = !v; installBtn2.hidden = !v; };
  const offInstall = onInstallChange(syncInstall);
  syncInstall();
  const syncFs = () => {
    const a = fsActive();
    const l = a ? S.toolbar.exitFullscreen : S.toolbar.fullscreen;
    itemFs.replaceChildren(icon(...(a ? ICONS.exitFullscreen : ICONS.fullscreen)), h('span', null, l));
  };
  syncFs();
  document.addEventListener('fullscreenchange', syncFs);
  document.addEventListener('webkitfullscreenchange', syncFs);

  const onGlobalKey = (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof Element && t.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (e.key === '?') { e.preventDefault(); dialogs.isOpen() ? dialogs.closeAll() : dialogs.openGuide('controls'); }
    else if ((e.key === 'f' || e.key === 'F') && fsApi && !dialogs.isOpen()) { e.preventDefault(); toggleFullscreen(); }
  };
  window.addEventListener('keydown', onGlobalKey);

  // iOS Safari: sahnede sayfa yakınlaştırma jesti ve uzun basma menüsü kapalı (kamera kendi jestlerini yönetir)
  const onGesture = (e) => { if (e.target === canvas) e.preventDefault(); };
  document.addEventListener('gesturestart', onGesture, { passive: false });
  document.addEventListener('gesturechange', onGesture, { passive: false });
  const onCtx = (e) => e.preventDefault();
  canvas.addEventListener('contextmenu', onCtx);

  // Ekran klavyesi (kütle girişi): görsel görünüm alanı küçülünce panel klavyenin üstüne taşınır (--kb), alan görünür kalır.
  const vv = globalThis.visualViewport;
  const syncViewport = () => {
    const kb = vv ? Math.max(0, globalThis.innerHeight - vv.height - vv.offsetTop) : 0;
    document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
    document.body.classList.toggle('kb-open', kb > 80);
    labels.schedule();
  };
  vv?.addEventListener('resize', syncViewport);
  vv?.addEventListener('scroll', syncViewport);
  const onFocusIn = (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'number') setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  };
  panel.el.addEventListener('focusin', onFocusIn);

  const toast = h('div.toast', { role: 'status', 'aria-live': 'polite' });

  // ---- sahne şeridi · bilgi kartı · başlık · etiketler
  const strip = createSceneStrip({ onSelect: (id) => { closeMenu({ focus: false }); applyScene(id); } });
  const infoCard = createInfoCard({
    getParams: () => renderer.getParams(),
    onClose: () => setInfoOpen(false),
    onLabels: (v) => labels.setEnabled(v),
    onWhatIs: () => { setInfoOpen(false, { focus: false }); dialogs.openGuide('whatis'); },
  });
  const labels = createLabels({
    canvas,
    getParams: () => renderer.getParams(),
    getBounds: () => {
      const top = infoBtn.getBoundingClientRect().bottom + 8;
      const sr = strip.el.getBoundingClientRect();
      const bottom = (sr.height > 0 ? sr.top : globalThis.innerHeight) - 8;
      return { top, bottom };
    },
  });
  const capTitle = h('strong.cap-title');
  const capSub = h('span.cap-sub');
  const caption = h('div#scene-caption.scene-caption', null, capTitle, capSub);
  function updateCaption() {
    const p = renderer.getParams();
    capTitle.textContent = state.scene ? S.scenes[state.scene].short : S.sceneCustom.short;
    capSub.textContent = `a = ${fixed(p.a, 2)} · ${fixed((p.thetaCam * 180) / Math.PI, 0)}° · ${sig(p.rCam, 2)} M`;
  }

  const ui = h('div#ui.ui', null, toolbar, caption, utilbar, labels.el, strip.el, tipEl, infoCard.el, panel.el, toast);
  root.append(ui);

  // şeridin yüksekliği → --strip-h (ipucu, bildirim, bilgi kartı şeridin üstünde durur)
  const syncStrip = () => {
    const hgt = strip.el.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--strip-h', `${Math.round(hgt)}px`);
    labels.schedule();
  };
  const stripRO = typeof ResizeObserver === 'function' ? new ResizeObserver(syncStrip) : null;
  stripRO?.observe(strip.el);
  const canvasRO = typeof ResizeObserver === 'function' ? new ResizeObserver(() => labels.schedule()) : null;
  canvasRO?.observe(canvas);
  window.addEventListener('resize', syncStrip);
  syncStrip();
  syncViewport();

  // ---- bilgi kartı aç / kapa
  function setInfoOpen(open, { focus = true } = {}) {
    open = !!open;
    if (open === state.infoOpen) return;
    const wasInside = infoCard.el.contains(document.activeElement);
    state.infoOpen = open;
    infoCard.el.hidden = !open;
    infoBtn.setAttribute('aria-expanded', String(open));
    infoBtn.classList.toggle('on', open);
    document.body.classList.toggle('info-open', open);
    if (open) {
      if (state.open) setOpen(false, { focus: false });
      closeMenu({ focus: false });
      infoCard.render(state.scene);
      hideHint();
      infoCard.body.focus({ preventScroll: true });
    } else if (wasInside && focus) infoBtn.focus();
  }
  infoCard.el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); setInfoOpen(false); }
  });
  // Telefon: bilgi kartı açıkken sahneye dokunmak (kamerayı kullanmak) kartı kapatır; başlıktan aşağı kaydırmak da.
  const onCanvasDown = () => { if (state.infoOpen && phoneMq?.matches) setInfoOpen(false, { focus: false }); };
  canvas.addEventListener('pointerdown', onCanvasDown);
  let infoSwipe = null;
  infoCard.head.addEventListener('pointerdown', (e) => {
    if (!phoneMq?.matches || e.target.closest('button')) return;
    infoSwipe = { y: e.clientY, id: e.pointerId };
  });
  infoCard.head.addEventListener('pointermove', (e) => {
    if (infoSwipe && e.pointerId === infoSwipe.id && e.clientY - infoSwipe.y > 50) { infoSwipe = null; setInfoOpen(false); }
  });
  const endInfoSwipe = () => { infoSwipe = null; };
  infoCard.head.addEventListener('pointerup', endInfoSwipe);
  infoCard.head.addEventListener('pointercancel', endInfoSwipe);

  // ---- ayarlar aç / kapa
  function setOpen(open, { focus = true } = {}) {
    open = !!open;
    const wasInside = panel.el.contains(document.activeElement);
    state.open = open;
    document.body.classList.toggle('ui-open', open);
    ui.classList.toggle('open', open);
    panel.el.setAttribute('aria-hidden', String(!open));
    if (open) {
      if (state.infoOpen) setInfoOpen(false, { focus: false });
      panel.el.removeAttribute('inert');
      panel.refresh();
      panel.startStats();
    } else {
      panel.el.setAttribute('inert', '');
      panel.stopStats();
      if (wasInside && focus) menuBtn.focus();
    }
    labels.schedule();
  }
  panel.el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
  });

  // Telefon: başlıktan aşağı kaydırarak kapat
  let swipe = null;
  panel.header.addEventListener('pointerdown', (e) => {
    if (!phoneMq?.matches || e.target.closest('button')) return;
    swipe = { y: e.clientY, id: e.pointerId };
  });
  panel.header.addEventListener('pointermove', (e) => {
    if (swipe && e.pointerId === swipe.id && e.clientY - swipe.y > 60) { swipe = null; setOpen(false); }
  });
  const endSwipe = () => { swipe = null; };
  panel.header.addEventListener('pointerup', endSwipe);
  panel.header.addEventListener('pointercancel', endSwipe);

  // ---- ekran görüntüsü (renderOnce → aynı görevde toBlob: preserveDrawingBuffer gerekmez)
  let toastTimer = 0;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }
  function screenshot() {
    return new Promise((resolve) => {
      try {
        renderer.renderOnce({ frames: 8 });
        canvas.toBlob((blob) => {
          if (!blob) { showToast(S.errors.screenshot); resolve(null); return; }
          const p = renderer.getParams();
          const name = `karadelik_a${p.a.toFixed(3)}_th${Math.round((p.thetaCam * 180) / Math.PI)}.png`;
          const url = URL.createObjectURL(blob);
          const link = h('a', { href: url, download: name });
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          showToast(S.toast.saved);
          resolve(blob);
        }, 'image/png');
      } catch (err) {
        console.warn('ekran görüntüsü', err);
        showToast(S.errors.screenshot);
        resolve(null);
      }
    });
  }

  // başlangıç: ayarlar ve bilgi kartı kapalı; varsayılan sahne seçili (renderer varsayılanıyla aynı görünüm)
  setOpen(false, { focus: false });
  strip.select(state.scene);
  infoCard.render(state.scene);
  cam.setHome({ phi: sceneById(state.scene).patch.phiCam, theta: sceneById(state.scene).patch.thetaCam, r: sceneById(state.scene).patch.rCam });
  updateCaption();

  return {
    set,
    getParams: () => renderer.getParams(),
    camera: cam,
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => state.open,
    openInfo: () => setInfoOpen(true),
    closeInfo: () => setInfoOpen(false),
    isInfoOpen: () => state.infoOpen,
    applyScene,
    getScene: () => state.scene,
    scenes: SCENES,
    setLabels: (v) => { infoCard.setLabels(v); labels.setEnabled(v); },
    labels,
    hasAuto,
    setMass: (v) => { panel.setMassText(v); state.mass = v; panel.invalidateInfo(); scheduleRefresh(); },
    screenshot,
    setMode: (m) => panel.setMode(m),
    getMode: () => panel.getMode(),
    dialogs,
    refresh: () => panel.refresh(),
    defaults,
    destroy() {
      cancelTween();
      cam.dispose();
      panel.stopStats();
      offInstall();
      dialogs.destroy();
      labels.dispose();
      stripRO?.disconnect();
      canvasRO?.disconnect();
      window.removeEventListener('resize', syncStrip);
      window.removeEventListener('keydown', onGlobalKey);
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('gesturestart', onGesture);
      document.removeEventListener('gesturechange', onGesture);
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.removeEventListener('pointerdown', onCanvasDown);
      vv?.removeEventListener('resize', syncViewport);
      vv?.removeEventListener('scroll', syncViewport);
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
      clearTimeout(toastTimer);
      ui.remove();
      document.body.classList.remove('ui-open', 'info-open');
    },
  };
}
