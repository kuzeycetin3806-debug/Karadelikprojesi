// Kamera kontrolcüsü: fare / dokunmatik / klavye, ataletli ve yumuşak hareket.
// ESTETİK/etkileşim katmanı: fiziksel içeriği yok. Renderer'a yalnız setParams({phiCam, thetaCam, rCam}) ile yazar.
import { horizonRadii } from '../physics/kerr.js';

const DEG = Math.PI / 180;
export const THETA_MIN = 1 * DEG;
export const THETA_MAX = 179 * DEG;
export const BAND_LO = 89.5 * DEG; // disk düzlemi dejenere bandı (kontrol sırasında atlanır)
export const BAND_HI = 90.5 * DEG;
export const R_MAX_UI = 150; // renderer 1000'e izin verir; f32 hassasiyeti nedeniyle UI sınırı
export const R_MARGIN = 3; // r_min = r₊ + 3 M

const ORBIT_SPEED = 0.0055; // rad / piksel
const WHEEL_SPEED = 0.0012; // ln(r) / deltaY birimi
const KEY_ANGLE = 3 * DEG;
const KEY_ZOOM = 0.08; // ln(r) adımı
const SMOOTH_RATE = 18; // 1/s (üstel yaklaşma)
const SCENE_RATE = 5; // 1/s: sahne geçişlerinde daha yumuşak (≈ 1,5–2 s)
const INERTIA_DECAY = 3.4; // 1/s (iOS kaydırma hissi: üstel sürtünme)
const INERTIA_DECAY_REDUCED = 14; // prefers-reduced-motion: atalet çok kısa
const INERTIA_MAX = 6; // rad/s
const ZOOM_RATE = 7; // 1/s: çift dokunma yakınlaş/uzaklaş geçişi
const PINCH_WHEEL = 0.012; // ctrl+tekerlek (iz yüzeyi pinch'i): ln(r) / deltaY birimi
const NEAR_FACTOR = 0.4; // çift dokunma "yakın" uzaklığı = sahne uzaklığı × 0,4
const LOCK_PX = 8; // iki parmak jesti kilitlenme eşiği (piksel)
const MIN_ROT_DIST = 40; // parmaklar bu kadar yakınken dönme algılanmaz (gürültü)
const TAP_MS = 300;
const DOUBLE_TAP_MS = 350;
const TAP_SLOP = 10;
const DOUBLE_TAP_DIST = 32;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** θ dejenere bandına düştüyse hareket yönüne göre karşı kıyıya atlar. */
export function skipBand(theta, dir = 0) {
  if (theta > BAND_LO && theta < BAND_HI) {
    if (dir > 0) return BAND_HI;
    if (dir < 0) return BAND_LO;
    return theta - BAND_LO < BAND_HI - theta ? BAND_LO : BAND_HI;
  }
  return theta;
}

export function rMinFor(a) {
  return horizonRadii(1, a).rPlus + R_MARGIN;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{getParams:()=>object, setParams:(p:object)=>object}} renderer
 * @param {{onChange?:()=>void, onUserInput?:()=>void}} [opts]
 */
export function createCameraController(canvas, renderer, opts = {}) {
  const home = (() => {
    const p = renderer.getParams();
    return { phi: p.phiCam, theta: p.thetaCam, r: p.rCam };
  })();
  let rMin = rMinFor(renderer.getParams().a);
  let rate = SMOOTH_RATE;

  const cur = { phi: home.phi, theta: home.theta, logr: Math.log(home.r) };
  const tgt = { ...cur };
  const vel = { phi: 0, theta: 0 }; // atalet (rad/s)
  const written = { phi: cur.phi, theta: cur.theta, r: home.r }; // renderer'a en son yazılan

  let raf = 0;
  let lastT = 0;
  let dragging = false;

  const pointers = new Map(); // id → {x, y}
  let pinchDist = 0;
  let gesture = null; // {t, x, y, moved, id}
  let lastTap = null;
  let lastMoveT = 0;

  const clampLogR = (v) => clamp(v, Math.log(rMin), Math.log(R_MAX_UI));

  /** Dışarıdan (ör. test / başka kod) renderer.setParams ile değişmişse benimse. */
  function adoptExternal() {
    const p = renderer.getParams();
    const rOut = Math.abs(p.rCam - written.r) > 1e-9 * Math.max(1, p.rCam);
    if (p.phiCam !== written.phi || p.thetaCam !== written.theta || rOut) {
      cur.phi = tgt.phi = written.phi = p.phiCam;
      cur.theta = tgt.theta = written.theta = p.thetaCam;
      cur.logr = tgt.logr = Math.log(p.rCam);
      written.r = p.rCam;
      vel.phi = vel.theta = 0;
    }
  }

  function setTheta(raw, dir) {
    tgt.theta = skipBand(clamp(raw, THETA_MIN, THETA_MAX), dir);
  }

  function wake() {
    if (!raf) {
      lastT = 0;
      raf = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    raf = 0;
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    adoptExternal();

    if (!dragging) {
      if (Math.abs(vel.phi) > 1e-3 || Math.abs(vel.theta) > 1e-3) {
        tgt.phi += vel.phi * dt;
        const before = tgt.theta;
        setTheta(tgt.theta + vel.theta * dt, vel.theta);
        if (tgt.theta === THETA_MIN || tgt.theta === THETA_MAX || tgt.theta === before) vel.theta = 0;
        const f = Math.exp(-INERTIA_DECAY * dt);
        vel.phi *= f;
        vel.theta *= f;
        if (Math.abs(vel.phi) < 0.02) vel.phi = 0;
        if (Math.abs(vel.theta) < 0.02) vel.theta = 0;
      }
    }
    tgt.logr = clampLogR(tgt.logr);

    const k = 1 - Math.exp(-rate * dt);
    cur.phi += (tgt.phi - cur.phi) * k;
    const nextTheta = cur.theta + (tgt.theta - cur.theta) * k;
    cur.theta = nextTheta > BAND_LO && nextTheta < BAND_HI ? (tgt.theta > cur.theta ? BAND_HI : BAND_LO) : nextTheta;
    cur.logr += (tgt.logr - cur.logr) * k;

    const settled =
      Math.abs(tgt.phi - cur.phi) < 1e-5 &&
      Math.abs(tgt.theta - cur.theta) < 1e-5 &&
      Math.abs(tgt.logr - cur.logr) < 1e-5 &&
      vel.phi === 0 &&
      vel.theta === 0 &&
      !dragging;
    if (settled) {
      cur.phi = tgt.phi;
      cur.theta = tgt.theta;
      cur.logr = tgt.logr;
    }
    push();
    if (!settled) raf = requestAnimationFrame(tick);
  }

  function push() {
    const r = Math.exp(cur.logr);
    if (cur.phi === written.phi && cur.theta === written.theta && Math.abs(r - written.r) < 1e-12 * r) return;
    const out = renderer.setParams({ phiCam: cur.phi, thetaCam: cur.theta, rCam: r });
    written.phi = out.phiCam;
    written.theta = out.thetaCam;
    written.r = out.rCam;
    opts.onChange?.();
  }

  // ---------------------------------------------------------------- API
  /** Hedefi ayarla (yumuşak geçiş). Alanlar: phi, theta (rad), r (M). */
  function setTarget({ phi, theta, r } = {}, { instant = false, slow = false } = {}) {
    adoptExternal();
    rate = slow && !instant ? SCENE_RATE : SMOOTH_RATE;
    if (phi !== undefined) {
      // En kısa yoldan dön: eksenel simetri nedeniyle φ → φ ± 2π görüntüyü değiştirmez (çok turlu dönüşü önler).
      const k = Math.round((cur.phi - phi) / (2 * Math.PI));
      if (k !== 0) { cur.phi -= 2 * Math.PI * k; tgt.phi -= 2 * Math.PI * k; }
      tgt.phi = phi;
    }
    if (theta !== undefined) setTheta(theta, theta - tgt.theta);
    if (r !== undefined) tgt.logr = clampLogR(Math.log(r));
    vel.phi = vel.theta = 0;
    if (instant) {
      cur.phi = tgt.phi;
      cur.theta = tgt.theta;
      cur.logr = tgt.logr;
    }
    wake();
  }

  function setSpin(a) {
    rMin = rMinFor(a);
    tgt.logr = clampLogR(tgt.logr);
    wake();
  }

  function reset(opts) {
    setTarget({ phi: home.phi, theta: home.theta, r: home.r }, opts);
  }

  /** Çift dokunma / Home / reset() bu görünüme döner (seçili sahnenin kamerası). */
  function setHome({ phi, theta, r }) {
    home.phi = phi; home.theta = theta; home.r = r;
  }

  function getTarget() {
    return { phi: tgt.phi, theta: tgt.theta, r: Math.exp(tgt.logr) };
  }

  // ---------------------------------------------------------------- işaretçi
  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    adoptExternal();
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    opts.onUserInput?.();
    rate = SMOOTH_RATE;
    if (pointers.size === 1) {
      dragging = true;
      vel.phi = vel.theta = 0;
      gesture = { t: performance.now(), x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
      lastMoveT = performance.now();
    } else {
      gesture = null;
      if (pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        pinchDist = Math.hypot(p.x - q.x, p.y - q.y);
      }
    }
    wake();
  };

  const onMove = (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur2 = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur2);
    const now = performance.now();
    if (pointers.size === 1) {
      const dx = cur2.x - prev.x;
      const dy = cur2.y - prev.y;
      if (gesture) gesture.moved = Math.max(gesture.moved, Math.hypot(cur2.x - gesture.x, cur2.y - gesture.y));
      const dPhi = -dx * ORBIT_SPEED;
      const dTheta = -dy * ORBIT_SPEED;
      tgt.phi += dPhi;
      setTheta(tgt.theta + dTheta, dTheta);
      const dt = Math.max(0.004, (now - lastMoveT) / 1000);
      lastMoveT = now;
      vel.phi = 0.5 * vel.phi + 0.5 * (dPhi / dt);
      vel.theta = 0.5 * vel.theta + 0.5 * (dTheta / dt);
      wake();
    } else if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (pinchDist > 0 && d > 0) {
        tgt.logr = clampLogR(tgt.logr - Math.log(d / pinchDist));
        wake();
      }
      pinchDist = d;
    }
  };

  const onUp = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    pinchDist = 0;
    const now = performance.now();
    if (gesture && gesture.id === e.pointerId && e.type === 'pointerup') {
      const tap = gesture.moved < TAP_SLOP && now - gesture.t < TAP_MS;
      if (tap) {
        if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_DIST) {
          lastTap = null;
          reset();
        } else {
          lastTap = { t: now, x: e.clientX, y: e.clientY };
        }
      } else {
        lastTap = null;
      }
    }
    gesture = null;
    if (pointers.size === 0) {
      dragging = false;
      if (now - lastMoveT > 90) vel.phi = vel.theta = 0; // durarak bırakıldı → atalet yok
    } else if (pointers.size === 1) {
      vel.phi = vel.theta = 0; // pinch → tek parmak geçişinde sıçrama olmasın
    }
    wake();
  };

  const onWheel = (e) => {
    e.preventDefault();
    adoptExternal();
    opts.onUserInput?.();
    rate = SMOOTH_RATE;
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    tgt.logr = clampLogR(tgt.logr + clamp(e.deltaY * unit, -300, 300) * WHEEL_SPEED);
    wake();
  };

  // ---------------------------------------------------------------- klavye
  const onKey = (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof Element && (t.closest('input, select, textarea, [contenteditable="true"], [data-no-camera-keys]'))) return;
    let handled = true;
    adoptExternal();
    switch (e.key) {
      case 'ArrowLeft': tgt.phi += KEY_ANGLE; break;
      case 'ArrowRight': tgt.phi -= KEY_ANGLE; break;
      case 'ArrowUp': setTheta(tgt.theta + KEY_ANGLE, 1); break;
      case 'ArrowDown': setTheta(tgt.theta - KEY_ANGLE, -1); break;
      case '+':
      case '=':
      case 'PageUp': tgt.logr = clampLogR(tgt.logr - KEY_ZOOM); break;
      case '-':
      case '_':
      case 'PageDown': tgt.logr = clampLogR(tgt.logr + KEY_ZOOM); break;
      case 'Home':
      case '0': reset(); break;
      default: handled = false;
    }
    if (handled) {
      rate = SMOOTH_RATE;
      e.preventDefault();
      opts.onUserInput?.();
      wake();
    }
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);

  return {
    setTarget,
    setSpin,
    reset,
    setHome,
    getTarget,
    isActive: () => raf !== 0 || dragging,
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('lostpointercapture', onUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    },
  };
}
