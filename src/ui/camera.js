// Kamera kontrolcüsü: fare / dokunmatik / klavye, ataletli ve yumuşak hareket.
// ESTETİK/etkileşim katmanı: fiziksel içeriği yok. Renderer'a yalnız setParams({phiCam, thetaCam, rCam}) ile yazar.
//
// Jest tasarımı (v4):
//  - Tek yol: Pointer Events (touch/mouse/pen). Tarayıcı dokunmatik eylemleri `touch-action: none` ile kapalı → 300 ms gecikme yok;
//    hiçbir (passive olmayan) touch dinleyicisi yok. getCoalescedEvents ile birleştirilmiş noktalar tek tek işlenir (pürüzsüz sürükleme).
//  - Tüm hedef güncellemeleri `tgt` üzerinde birikir; renderer'a yazım yalnız rAF döngüsünde (kare başına en çok BİR setParams) ve
//    yalnız değer değiştiyse yapılır.
//  - Tek parmak / sol fare: yörünge (yatay = azimut, dikey = eğim); bırakınca hız-duyarlı atalet (üstel sürtünme).
//  - İki parmak: baskın jest kilidi — pinch (uzaklık, ln r; kara delik merkezli), döndürme (azimut) ya da birlikte dikey kaydırma (eğim).
//    Eşik (LOCK_PX) aşılınca en büyük net hareket seçilir; parmaklar kalkana dek diğerleri yok sayılır.
//  - Çift dokunma / çift tık: sahne uzaklığı ↔ yakın arasında geçiş (sıfırlama menüde / Home tuşunda).
//  - Fare: sürükle = yörünge, sağ tık sürükle = yalnız azimut, tekerlek / ctrl+tekerlek (iz yüzeyi pinch'i) = uzaklık.
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
const VEL_WINDOW_MS = 100;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const wrapPi = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

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
  let rendererRMin = 0; // renderer'ın bildirdiği alt sınır (getStats().limits.rCamMin), yoksa 0
  const rMinNow = (a) => Math.max(rMinFor(a), rendererRMin);
  let rMin = rMinNow(renderer.getParams().a);
  const rMax = R_MAX_UI;
  let rate = SMOOTH_RATE;
  const reducedMq = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => !!reducedMq?.matches;

  const cur = { phi: home.phi, theta: home.theta, logr: Math.log(home.r) };
  const tgt = { ...cur };
  const vel = { phi: 0, theta: 0 }; // atalet (rad/s)
  const written = { phi: cur.phi, theta: cur.theta, r: home.r }; // renderer'a en son yazılan

  let raf = 0;
  let lastT = 0;
  let dragging = false;

  const pointers = new Map(); // id → {x, y}
  let mode = 'orbit'; // 'orbit' (tek parmak/sol fare) | 'azimuth' (sağ fare)
  let multi = false; // iki parmak görüldü: tüm parmaklar kalkana dek tek parmak yörüngesi kapalı
  let two = null; // iki parmak durumu
  let gesture = null; // tek dokunuş (dokunma/tık ayrımı): {t, x, y, moved, id}
  let lastTap = null;
  let lastMoveT = 0;
  let samples = []; // son hareketler (atalet hızı için): {t, dPhi, dTheta}

  const clampLogR = (v) => clamp(v, Math.log(rMin), Math.log(rMax));

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
        // kenarda yumuşak durma: hedef kenarda durur, görüntü ona üstel yaklaşır (sıçrama / lastik yok)
        if (tgt.theta === THETA_MIN || tgt.theta === THETA_MAX || tgt.theta === before) vel.theta = 0;
        const f = Math.exp(-(reduced() ? INERTIA_DECAY_REDUCED : INERTIA_DECAY) * dt);
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

  /** Kare başına tek yazım; değer değişmediyse hiç yazılmaz. */
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
  function setTarget({ phi, theta, r } = {}, { instant = false, slow = false, rate: rateOpt } = {}) {
    adoptExternal();
    rate = rateOpt ?? (slow && !instant ? SCENE_RATE : SMOOTH_RATE);
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
    rMin = rMinNow(a);
    tgt.logr = clampLogR(tgt.logr);
    wake();
  }

  /** Renderer bir alt sınır bildiriyorsa (getStats().limits.rCamMin) kullanılır; arayüzün r₊ + 3 M sınırından küçük olamaz. */
  function setLimits({ rMin: lo } = {}) {
    if (!Number.isFinite(lo) || !(lo > 0) || lo === rendererRMin) return;
    rendererRMin = lo;
    rMin = rMinNow(renderer.getParams().a);
    tgt.logr = clampLogR(tgt.logr);
    wake();
  }

  function reset(o) {
    setTarget({ phi: home.phi, theta: home.theta, r: home.r }, o);
  }

  /** Çift dokunma / çift tık: sahne uzaklığı ↔ yakın (açılar korunur). Dönüş: 'near' | 'home'. */
  function toggleZoom() {
    adoptExternal();
    const near = clamp(home.r * NEAR_FACTOR, rMin, rMax);
    const r = Math.exp(tgt.logr);
    const goHome = r <= near * 1.2;
    setTarget({ r: goHome ? home.r : near }, { instant: reduced(), rate: ZOOM_RATE });
    return goHome ? 'home' : 'near';
  }

  /** Home / reset() / menüdeki "Kamerayı sıfırla" bu görünüme döner (seçili sahnenin kamerası). */
  function setHome({ phi, theta, r }) {
    home.phi = phi; home.theta = theta; home.r = r;
  }

  function getTarget() {
    return { phi: tgt.phi, theta: tgt.theta, r: Math.exp(tgt.logr) };
  }

  // ---------------------------------------------------------------- işaretçi
  const stamp = (ev) => (ev.timeStamp > 0 ? ev.timeStamp : performance.now());

  function orbitStep(prev, ev) {
    const x = ev.clientX, y = ev.clientY;
    const dx = x - prev.x;
    const dy = y - prev.y;
    prev.x = x; prev.y = y;
    if (dx === 0 && dy === 0) return;
    if (gesture) gesture.moved = Math.max(gesture.moved, Math.hypot(x - gesture.x, y - gesture.y));
    const dPhi = -dx * ORBIT_SPEED;
    const dTheta = mode === 'azimuth' ? 0 : -dy * ORBIT_SPEED;
    tgt.phi += dPhi;
    if (dTheta) setTheta(tgt.theta + dTheta, dTheta);
    const t = stamp(ev);
    samples.push({ t, dPhi, dTheta });
    while (samples.length > 1 && t - samples[0].t > VEL_WINDOW_MS) samples.shift();
    lastMoveT = t;
  }

  function twoMetrics() {
    const [p, q] = [...pointers.values()];
    return { d: Math.hypot(p.x - q.x, p.y - q.y), a: Math.atan2(q.y - p.y, q.x - p.x), cy: (p.y + q.y) / 2 };
  }

  function beginTwo() {
    const m = twoMetrics();
    two = { d0: m.d, cy0: m.cy, dPrev: m.d, aPrev: m.a, cyPrev: m.cy, aNet: 0, lock: null };
  }

  function twoStep() {
    if (!two) return;
    const m = twoMetrics();
    const dAng = wrapPi(m.a - two.aPrev);
    if (!two.lock) {
      two.aNet += dAng;
      const pinch = Math.abs(m.d - two.d0);
      const rot = m.d >= MIN_ROT_DIST ? (Math.abs(two.aNet) * m.d) / 2 : 0; // her parmağın kat ettiği yay (piksel)
      const pan = Math.abs(m.cy - two.cy0);
      const best = Math.max(pinch, rot, pan);
      if (best >= LOCK_PX) two.lock = best === pinch ? 'pinch' : best === rot ? 'rotate' : 'pan';
    } else if (two.lock === 'pinch') {
      if (two.dPrev > 1 && m.d > 1) tgt.logr = clampLogR(tgt.logr - Math.log(m.d / two.dPrev));
    } else if (two.lock === 'rotate') {
      if (m.d >= MIN_ROT_DIST) tgt.phi -= dAng;
    } else if (two.lock === 'pan') {
      const dTheta = -(m.cy - two.cyPrev) * ORBIT_SPEED;
      if (dTheta) setTheta(tgt.theta + dTheta, dTheta);
    }
    two.dPrev = m.d; two.aPrev = m.a; two.cyPrev = m.cy;
  }

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    adoptExternal();
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    opts.onUserInput?.();
    rate = SMOOTH_RATE;
    if (pointers.size === 1) {
      mode = e.pointerType === 'mouse' && e.button === 2 ? 'azimuth' : 'orbit';
      dragging = true;
      multi = false;
      vel.phi = vel.theta = 0;
      samples = [];
      gesture = { t: performance.now(), x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
      lastMoveT = stamp(e);
    } else {
      gesture = null;
      multi = true;
      vel.phi = vel.theta = 0;
      if (pointers.size === 2) beginTwo();
    }
    wake();
  };

  const onMove = (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const list = e.getCoalescedEvents?.();
    const evs = list && list.length ? list : [e];
    if (pointers.size === 1) {
      if (multi) { prev.x = e.clientX; prev.y = e.clientY; return; } // iki parmaktan kalan tek parmak: yörünge yok
      for (const ev of evs) orbitStep(prev, ev);
      wake();
    } else if (pointers.size === 2) {
      const last = evs[evs.length - 1];
      prev.x = last.clientX; prev.y = last.clientY;
      twoStep();
      wake();
    }
  };

  const onUp = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const now = performance.now();
    if (gesture && gesture.id === e.pointerId && e.type === 'pointerup' && mode === 'orbit') {
      const tap = gesture.moved < TAP_SLOP && now - gesture.t < TAP_MS;
      if (tap) {
        if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_DIST) {
          lastTap = null;
          toggleZoom();
        } else {
          lastTap = { t: now, x: e.clientX, y: e.clientY };
        }
      } else {
        lastTap = null;
      }
    }
    gesture = null;
    two = null;
    if (pointers.size === 1) {
      // iki parmaktan biri kalktı: kalan parmak yörünge başlatmaz; eski hız da yok
      vel.phi = vel.theta = 0;
      samples = [];
    }
    if (pointers.size === 0) {
      dragging = false;
      if (!multi && e.type === 'pointerup') releaseVelocity(now);
      else vel.phi = vel.theta = 0;
      multi = false;
      samples = [];
    }
    wake();
  };

  /** Son ~100 ms'lik hareketten atalet hızı (rad/s): hız-duyarlı; durarak bırakılırsa atalet yok. */
  function releaseVelocity(now) {
    vel.phi = vel.theta = 0;
    if (now - lastMoveT > 90 || !samples.length) return;
    const first = samples[0];
    const last = samples[samples.length - 1];
    let span = last.t - first.t;
    let sp = 0, st = 0;
    if (samples.length === 1) { span = 16; sp = first.dPhi; st = first.dTheta; }
    else for (let i = 1; i < samples.length; i++) { sp += samples[i].dPhi; st += samples[i].dTheta; }
    span = Math.max(span, 8);
    vel.phi = clamp(sp / (span / 1000), -INERTIA_MAX, INERTIA_MAX);
    vel.theta = clamp(st / (span / 1000), -INERTIA_MAX, INERTIA_MAX);
  }

  const onWheel = (e) => {
    e.preventDefault();
    adoptExternal();
    opts.onUserInput?.();
    rate = SMOOTH_RATE;
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    // ctrl+tekerlek: iz yüzeyi (trackpad) pinch'i — küçük deltaY'ler, daha yüksek kazanç
    const gain = e.ctrlKey ? PINCH_WHEEL : WHEEL_SPEED;
    const lim = e.ctrlKey ? 60 : 300;
    tgt.logr = clampLogR(tgt.logr + clamp(e.deltaY * unit, -lim, lim) * gain);
    wake();
  };

  // Safari (masaüstü iz yüzeyi) pinch'i: gesture* olayları; dokunmatikte pointer akışı zaten işlediği için yalnız işaretçi yokken.
  let gScale = 1;
  const onGestureStart = (e) => { if (pointers.size === 0) { gScale = 1; e.preventDefault(); } };
  const onGestureChange = (e) => {
    if (pointers.size !== 0) return;
    e.preventDefault();
    if (!(e.scale > 0)) return;
    adoptExternal();
    opts.onUserInput?.();
    rate = SMOOTH_RATE;
    tgt.logr = clampLogR(tgt.logr - Math.log(e.scale / gScale));
    gScale = e.scale;
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
  canvas.addEventListener('gesturestart', onGestureStart, { passive: false });
  canvas.addEventListener('gesturechange', onGestureChange, { passive: false });
  window.addEventListener('keydown', onKey);

  return {
    setTarget,
    setSpin,
    setLimits,
    reset,
    toggleZoom,
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
      canvas.removeEventListener('gesturestart', onGestureStart);
      canvas.removeEventListener('gesturechange', onGestureChange);
      window.removeEventListener('keydown', onKey);
    },
  };
}
