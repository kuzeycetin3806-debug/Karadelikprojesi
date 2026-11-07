// Arayüz giriş noktası: createUI(renderer, { canvas, root }).
// Renderer ile sözleşme: yalnız setParams / getParams / getStats / renderOnce (src/render/README.md §3).
import '../styles/ui.css';
import { h, icon, ICONS } from './dom.js';
import { S } from './strings.js';
import { createCameraController } from './camera.js';
import { createPanel } from './panel.js';

const CAMERA_KEYS = ['phiCam', 'thetaCam', 'rCam'];
const PHONE_MQ = '(max-width: 699px)';

export function createUI(renderer, { canvas, root = document.body } = {}) {
  if (!canvas) throw new TypeError('createUI: canvas gerekli');

  // Dokunmatik / kaba imleç cihazlarda README §3.5 önerisi: mobil kalite + pil modu (kullanıcı panelden değiştirebilir).
  const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches;
  const defaults = renderer.getParams();
  if (coarse) renderer.setParams({ quality: 'mobile', performance: 'battery', resolutionScale: 0.75 });
  // Dikey (portre) ekranlarda yatay görüş çok daralır ve disk kırpılır → başlangıç fovY'sini en/boy oranına göre hafifçe artır.
  const aspect = (globalThis.innerWidth || 1) / (globalThis.innerHeight || 1);
  if (aspect < 1.2) {
    const fov = Math.min(55, Math.max(defaults.fovY, (2 * Math.atan(0.5 / aspect) * 180) / Math.PI));
    renderer.setParams({ fovY: Math.round(fov) });
  }
  const resetBase = { ...renderer.getParams() };

  const state = { mass: null, open: false };
  const phoneMq = globalThis.matchMedia?.(PHONE_MQ);

  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', S.canvasLabel);

  // ---- yenileme (rAF ile birleştirilir)
  let refreshQueued = false;
  function scheduleRefresh() {
    if (refreshQueued || !state.open) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      if (state.open) panel.refresh();
    });
  }

  const hint = h('p.hint', { 'aria-hidden': 'true' }, S.hint);
  let hintTimer = setTimeout(hideHint, 9000);
  function hideHint() {
    clearTimeout(hintTimer);
    hint.classList.add('gone');
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

  const panel = createPanel({
    renderer,
    set,
    applyPreset: (patch) => set(patch),
    getMass: () => state.mass,
    setMass: (v) => { state.mass = v; panel.invalidateInfo(); scheduleRefresh(); },
    onClose: () => setOpen(false),
    onResetAll: () => {
      const { phiCam, thetaCam, rCam, ...rest } = resetBase;
      set(rest);
      cam.reset();
    },
  });

  // ---- araç çubuğu
  const toggleBtn = h(
    'button.btn.tb-btn.tb-panel',
    { type: 'button', id: 'panel-toggle', 'aria-controls': 'panel', 'aria-expanded': 'false', 'aria-label': S.toolbar.panelToggleLabel, onClick: () => setOpen(!state.open) },
    icon(...ICONS.sliders),
    h('span.tb-text', null, S.toolbar.panelOpen)
  );
  const resetBtn = h('button.btn.tb-btn.tb-icon', { type: 'button', 'aria-label': S.toolbar.resetCamera, title: S.toolbar.resetCamera, onClick: () => cam.reset() }, icon(...ICONS.reset));
  const shotBtn = h('button.btn.tb-btn.tb-icon', { type: 'button', 'aria-label': S.toolbar.screenshot, title: S.toolbar.screenshot, onClick: () => { screenshot(); } }, icon(...ICONS.camera));
  const toolbar = h('div.toolbar', { role: 'toolbar', 'aria-label': S.appTitle }, toggleBtn, resetBtn, shotBtn);
  const toast = h('div.toast', { role: 'status', 'aria-live': 'polite' });

  const ui = h('div#ui.ui', null, toolbar, hint, panel.el, toast);
  root.append(ui);

  // ---- aç / kapa
  function setOpen(open, { focus = true } = {}) {
    open = !!open;
    const wasInside = panel.el.contains(document.activeElement);
    state.open = open;
    document.body.classList.toggle('ui-open', open);
    ui.classList.toggle('open', open);
    toggleBtn.setAttribute('aria-expanded', String(open));
    panel.el.setAttribute('aria-hidden', String(!open));
    if (open) {
      panel.el.removeAttribute('inert');
      panel.refresh();
      panel.startStats();
      hideHint();
    } else {
      panel.el.setAttribute('inert', '');
      panel.stopStats();
      if (wasInside && focus) toggleBtn.focus();
    }
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

  setOpen(globalThis.matchMedia ? !phoneMq.matches : true, { focus: false });

  return {
    set,
    getParams: () => renderer.getParams(),
    camera: cam,
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => state.open,
    setMass: (v) => { panel.setMassText(v); state.mass = v; panel.invalidateInfo(); scheduleRefresh(); },
    screenshot,
    refresh: () => panel.refresh(),
    defaults,
    destroy() {
      cam.dispose();
      panel.stopStats();
      clearTimeout(hintTimer);
      clearTimeout(toastTimer);
      ui.remove();
      document.body.classList.remove('ui-open');
    },
  };
}
