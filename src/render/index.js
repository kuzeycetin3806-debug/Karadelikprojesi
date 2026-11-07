/**
 * Kara delik render çekirdeği (Adım 4a): tam ekran Kerr null-geodezik ışın izleyici (WebGL2 / GLSL ES 3.00).
 *
 * Bu dosya: Three.js sahne kurulumu, uniform yönetimi, görsel mod (ekran), debug mod (float MRT → CPU).
 * Algoritma GLSL'dedir (src/shaders/) ve src/math/ CPU referansının f32-RK4 yolunun birebir portudur.
 * Ayrıntı ve parametre sözleşmesi: src/render/README.md
 *
 * Kullanım:
 *   const r = createBlackHoleRenderer(canvas); r.start(); r.setParams({ a: 0.9, thetaCam: 1.2 });
 *   const data = await r.renderDebug(64, 48);   // Float32Array, bkz. DEBUG_FIELDS
 */
import {
  WebGLRenderer, WebGLRenderTarget, Scene, OrthographicCamera, Mesh, BufferGeometry, BufferAttribute,
  RawShaderMaterial, GLSL3, FloatType, RGBAFormat, NearestFilter, NoBlending, Vector2, Vector3, Vector4,
} from 'three';
import { vertexShader, buildFragmentShader } from '../shaders/index.js';
import { DEFAULT_PARAMS, QUALITY_PRESETS, normalizeParams, deriveUniforms } from './params.js';
import { attachOrbitControls } from './controls.js';

export { DEFAULT_PARAMS, QUALITY_PRESETS, normalizeParams, deriveUniforms };

/** Debug çıktısının piksel başına alan sırası (stride = 12 float; satır 0 = görüntünün ÜST satırı). */
export const DEBUG_FIELDS = Object.freeze([
  'status', 'r1', 'gCam1', 'steps', // o0
  'thetaInf', 'phiInf', 'n1', 'hitCount', // o1
  'reason', 'phi1', 'r2', 'gCam2', // o2
]);
export const DEBUG_STRIDE = DEBUG_FIELDS.length;
/** status: 0 = yakalandı, 1 = kaçtı, 2 = disk (maxDiskHits doldu). */
export const STATUS = Object.freeze({ CAPTURED: 0, ESCAPED: 1, DISK: 2 });
/** reason: 0 = normal sonlanma, 1 = adım bütçesi bitti (analitik fate), 2 = NaN. */
export const REASON = Object.freeze({ NORMAL: 0, BUDGET: 1, NAN: 2 });

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} [opts]
 * @param {object}  [opts.params]               başlangıç parametreleri (DEFAULT_PARAMS üzerine)
 * @param {boolean} [opts.controls=true]        geçici fare/dokunmatik yörünge kontrolü
 * @param {boolean} [opts.preserveDrawingBuffer=false]  ekran görüntüsü/test için true
 * @param {boolean} [opts.nativeTrig=false]   true: cihazın sin/cos'u (hızlı; doğruluk cihaza bağlı). Varsayılan: src/shaders/trig.glsl
 */
export function createBlackHoleRenderer(canvas, opts = {}) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
  });
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);
  const gl = renderer.getContext();

  // --- paylaşılan uniform nesneleri (görsel ve debug malzemeleri aynı değerleri okur)
  const U = {
    uResolution: { value: new Vector2(1, 1) },
    uTanHalf: { value: new Vector2(1, 1) },
    uCam: { value: new Vector3() },
    uTetrad: { value: new Vector4() },
    uA: { value: 0 },
    uA2: { value: 0 },
    uRp: { value: 2 },
    uRm: { value: 0 },
    uKappa: { value: 0.05 },
    uMaxSteps: { value: 512 },
    uREscape: { value: 300 },
    uAnalyticFate: { value: 1 },
    uDiskOn: { value: 1 },
    uPlaneGuard: { value: 1 },
    uMaxDiskHits: { value: 1 },
    uRIn: { value: 6 },
    uROut: { value: 20 },
    uSpinSign: { value: 1 },
  };

  const makeMaterial = (debug) =>
    new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: buildFragmentShader({ debug, nativeTrig: !!opts.nativeTrig }),
      uniforms: U,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new Mesh(geometry, makeMaterial(false));
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const orthoCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let debugMaterial = null; // yalnız renderDebug çağrılınca derlenir
  let debugTarget = null;

  // --- durum
  let params = normalizeParams(opts.params ?? {});
  let dirty = true;
  let running = false;
  let rafId = 0;
  let contextLost = false;
  const stats = { frames: 0, lastFrameMs: 0, width: 0, height: 0, uniforms: null };

  function writeUniforms(w, h) {
    const d = deriveUniforms(params, w, h);
    U.uResolution.value.set(d.resolution[0], d.resolution[1]);
    U.uTanHalf.value.set(d.tanHalf[0], d.tanHalf[1]);
    U.uCam.value.set(d.cam[0], d.cam[1], d.cam[2]);
    U.uTetrad.value.set(d.tetrad[0], d.tetrad[1], d.tetrad[2], d.tetrad[3]);
    U.uA.value = d.a;
    U.uA2.value = d.a2;
    U.uRp.value = d.rp;
    U.uRm.value = d.rm;
    U.uKappa.value = d.kappa;
    U.uMaxSteps.value = d.maxSteps;
    U.uREscape.value = d.rEscape;
    U.uAnalyticFate.value = d.analyticFate;
    U.uDiskOn.value = d.diskOn;
    U.uPlaneGuard.value = d.planeGuard;
    U.uMaxDiskHits.value = d.maxDiskHits;
    U.uRIn.value = d.rIn;
    U.uROut.value = d.rOut;
    U.uSpinSign.value = d.spinSign;
    return d;
  }

  // --- boyut: etkin piksel oranı = min(devicePixelRatio, maxPixelRatio) · resolutionScale
  function targetSize() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, params.maxPixelRatio) * params.resolutionScale;
    const cssW = canvas.clientWidth || canvas.width || 1;
    const cssH = canvas.clientHeight || canvas.height || 1;
    return [Math.max(1, Math.floor(cssW * dpr)), Math.max(1, Math.floor(cssH * dpr))];
  }
  function updateSize() {
    const [w, h] = targetSize();
    const cur = renderer.getDrawingBufferSize(new Vector2());
    if (cur.x !== w || cur.y !== h) {
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false); // CSS boyutuna dokunma (index.html belirler)
      dirty = true;
    }
  }

  // --- görsel mod
  function renderFrame() {
    updateSize();
    const size = renderer.getDrawingBufferSize(new Vector2());
    const t0 = performance.now();
    stats.uniforms = writeUniforms(size.x, size.y);
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.render(scene, orthoCam);
    stats.lastFrameMs = performance.now() - t0; // CPU tarafı gönderim süresi (GPU süresi DEĞİL)
    stats.frames++;
    stats.width = size.x;
    stats.height = size.y;
    dirty = false;
  }

  function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (contextLost) return;
    updateSize();
    if (dirty) renderFrame();
  }

  const onLost = (e) => { e.preventDefault(); contextLost = true; };
  const onRestored = () => { contextLost = false; dirty = true; };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  // --- genel API
  function setParams(p = {}) {
    params = normalizeParams(p, params);
    dirty = true;
    return { ...params };
  }
  const detachControls =
    opts.controls === false ? null : attachOrbitControls(canvas, { getParams: () => ({ ...params }), setParams });

  /**
   * Debug mod: float render hedefine (3 × RGBA32F) çizer ve CPU'ya okur.
   * @returns {Promise<Float32Array>} uzunluk = width·height·DEBUG_STRIDE; piksel (i, j) (j = 0 üst satır) için
   *          indeks (j·width + i)·DEBUG_STRIDE + DEBUG_FIELDS.indexOf(alan)
   */
  async function renderDebug(width, height) {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (!renderer.extensions.has('EXT_color_buffer_float')) {
      throw new Error('EXT_color_buffer_float desteklenmiyor: debug modu çalışamaz');
    }
    if (!debugMaterial) debugMaterial = makeMaterial(true);
    if (!debugTarget || debugTarget.width !== width || debugTarget.height !== height) {
      debugTarget?.dispose();
      debugTarget = new WebGLRenderTarget(width, height, {
        count: 3,
        type: FloatType,
        format: RGBAFormat,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });
    }
    const prevMat = mesh.material;
    mesh.material = debugMaterial;
    stats.uniforms = writeUniforms(width, height);
    renderer.setRenderTarget(debugTarget);
    renderer.setViewport(0, 0, width, height);
    renderer.render(scene, orthoCam);
    renderer.setRenderTarget(null);
    mesh.material = prevMat;

    // Üç okuma da burada eşzamanlı başlatılır (readPixels çağrıda yapılır; araya başka çizim giremez).
    const n = width * height;
    const bufs = [0, 1, 2].map(() => new Float32Array(n * 4));
    await Promise.all(bufs.map((b, i) => renderer.readRenderTargetPixelsAsync(debugTarget, 0, 0, width, height, b, undefined, i)));

    const out = new Float32Array(n * DEBUG_STRIDE);
    for (let j = 0; j < height; j++) {
      const srcRow = (height - 1 - j) * width; // GL satır 0 = alt
      for (let i = 0; i < width; i++) {
        const s = (srcRow + i) * 4;
        const o = (j * width + i) * DEBUG_STRIDE;
        for (let k = 0; k < 4; k++) {
          out[o + k] = bufs[0][s + k];
          out[o + 4 + k] = bufs[1][s + k];
          out[o + 8 + k] = bufs[2][s + k];
        }
      }
    }
    dirty = true; // uniform'lar debug boyutuna ayarlandı; görsel kare yeniden yazılmalı
    return out;
  }

  /** Bir görsel kareyi hemen (eşzamanlı) çizer. */
  function renderOnce() {
    renderFrame();
  }

  /**
   * Eşzamanlı ölçüm: `frames` kare çizer; her karede 1 piksellik readPixels ile GPU bitişini BEKLER
   * (Chromium'da gl.finish() GPU'yu beklemez: ölçüm 0 ms çıkar).
   * @returns {{msPerFrame:number, width:number, height:number, frames:number}}
   */
  function benchmark({ frames = 3, warmup = 1 } = {}) {
    const px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (let i = 0; i < warmup; i++) { renderFrame(); sync(); }
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) { renderFrame(); sync(); }
    const dt = performance.now() - t0;
    return { msPerFrame: dt / frames, width: stats.width, height: stats.height, frames };
  }

  function start() {
    if (running) return;
    running = true;
    dirty = true;
    rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function dispose() {
    stop();
    detachControls?.();
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    debugTarget?.dispose();
    mesh.material.dispose();
    debugMaterial?.dispose();
    geometry.dispose();
    renderer.dispose();
  }

  return {
    start,
    stop,
    setParams,
    getParams: () => ({ ...params }),
    renderDebug,
    // --- ek
    renderOnce,
    benchmark,
    dispose,
    getStats: () => ({ ...stats }),
    getContext: () => gl,
    isRunning: () => running,
  };
}
