/**
 * GEÇİCİ yörünge kontrolü (fare + dokunmatik). Kalıcı arayüzü arayüz ajanı yapacak.
 * ESTETİK/etkileşim: fiziksel bir içeriği yoktur.
 *   - sürükle: φ_cam (yatay), θ_cam (dikey)
 *   - tekerlek / iki parmakla kıstırma: r_cam (üstel)
 */
export function attachOrbitControls(canvas, api) {
  const pointers = new Map();
  let pinchDist = 0;

  const onDown = (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      pinchDist = Math.hypot(p.x - q.x, p.y - q.y);
    }
  };
  const onMove = (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    const p = api.getParams();
    if (pointers.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      api.setParams({ phiCam: p.phiCam - dx * 0.005, thetaCam: p.thetaCam - dy * 0.005 });
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0 && d > 0) api.setParams({ rCam: p.rCam * (pinchDist / d) });
      pinchDist = d;
    }
  };
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    pinchDist = 0;
  };
  const onWheel = (e) => {
    e.preventDefault();
    const p = api.getParams();
    api.setParams({ rCam: p.rCam * Math.exp(e.deltaY * 0.001) });
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
  };
}
