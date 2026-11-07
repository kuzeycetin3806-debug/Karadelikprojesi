/**
 * Kara delik render çekirdeği: tam ekran Kerr null-geodezik ışın izleyici (WebGL2 / GLSL ES 3.00) + fotogerçekçi görüntü hattı.
 *
 * Hat (Adım 4b):
 *   1. İZ SÜRME geçişi  (src/shaders)  : piksel başına geodezik + disk fotometrisi + yıldız alanı → DOĞRUSAL HDR radyans (RGBA16F)
 *      - alt-piksel jitter'lı kare biriktirme (durağan karede ilerleyici anti-aliasing)
 *      - hareket sırasında düşük çözünürlük, durunca tam çözünürlük; animasyonda kare süresine göre otomatik ölçek
 *   2. BLOOM (ESTETİK, isteğe bağlı) : çok seviyeli aşağı/yukarı örnekleme
 *   3. KOMPOZİT (ESTETİK): pozlama + bloom + ton eşleme + sRGB + dither → tuval
 *
 * Algoritma GLSL'dedir ve src/math/ CPU referansının f32-RK4 yolunun birebir portudur (4a; gpu-validate ile doğrulanır).
 * Ayrıntı ve parametre sözleşmesi: src/render/README.md
 *
 * Kullanım:
 *   const r = createBlackHoleRenderer(canvas); r.start(); r.setParams({ a: 0.9, thetaCam: 1.2 });
 *   const data = await r.renderDebug(64, 48);        // Float32Array, bkz. DEBUG_FIELDS
 *   const ph = await r.renderDebugPhoto(64, 48);     // Float32Array, bkz. PHOTO_FIELDS
 */
import {
  WebGLRenderer, WebGLRenderTarget, Scene, OrthographicCamera, Mesh, BufferGeometry, BufferAttribute,
  RawShaderMaterial, GLSL3, FloatType, HalfFloatType, UnsignedByteType, RGBAFormat, RedFormat, NearestFilter, LinearFilter,
  NoBlending, Vector2, Vector3, Vector4, DataTexture, ClampToEdgeWrapping,
} from 'three';
import { vertexShader, buildFragmentShader } from '../shaders/index.js';
import {
  DEFAULT_PARAMS, QUALITY_PRESETS, PERFORMANCE_PRESETS, POST_ONLY_KEYS, NON_INTERACTIVE_KEYS, TURB_PERIOD,
  normalizeParams, deriveUniforms, effectivePerformance,
} from './params.js';
import { attachOrbitControls } from './controls.js';
import { createPostChain } from './post.js';
import {
  PROFILE_N, BB_LUT_N, getBlackbodyLUT, getProfileTable, photometryScalars,
} from './photometry.js';

export { DEFAULT_PARAMS, QUALITY_PRESETS, PERFORMANCE_PRESETS, normalizeParams, deriveUniforms, effectivePerformance };

/** Debug çıktısının piksel başına alan sırası (stride = 12 float; satır 0 = görüntünün ÜST satırı). */
export const DEBUG_FIELDS = Object.freeze([
  'status', 'r1', 'gCam1', 'steps', // o0
  'thetaInf', 'phiInf', 'n1', 'hitCount', // o1
  'reason', 'phi1', 'r2', 'gCam2', // o2
]);
export const DEBUG_STRIDE = DEBUG_FIELDS.length;
/** Fotometri debug çıktısı (renderDebugPhoto; ilk disk vuruşu). I = parlaklık çarpanı (türbülans/kenar hariç). */
export const PHOTO_FIELDS = Object.freeze([
  'status', 'hitCount', 'r1', 'gCam1', // o0
  'tau', 'Tobs', 'I', 'log10Y', // o1
  'R', 'G', 'B', 'turbEdge', // o2
]);
/** status: 0 = yakalandı, 1 = kaçtı, 2 = disk (maxDiskHits doldu). */
export const STATUS = Object.freeze({ CAPTURED: 0, ESCAPED: 1, DISK: 2 });
/** reason: 0 = normal sonlanma, 1 = adım bütçesi bitti (analitik fate), 2 = NaN. */
export const REASON = Object.freeze({ NORMAL: 0, BUDGET: 1, NAN: 2 });

const halton = (i, b) => {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
};
const clampN = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} [opts]
 * @param {object}  [opts.params]               başlangıç parametreleri (DEFAULT_PARAMS üzerine)
 * @param {boolean} [opts.controls=true]        geçici fare/dokunmatik yörünge kontrolü
 * @param {boolean} [opts.preserveDrawingBuffer=false]  ekran görüntüsü/test için true
 * @param {boolean} [opts.nativeTrig=false]   true: cihazın sin/cos'u (hızlı; doğruluk cihaza bağlı). Varsayılan: src/shaders/trig.glsl
 * @param {boolean} [opts.forceByteHdr=false] YALNIZ TEST: float HDR hedefi yokmuş gibi 8-bit yedek hedefi kullan
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

  // HDR hedef türü: yarım float (render edilebilirse) — aksi halde 8-bit yedek (radyans/8 kodlanır; bloom yok)
  const floatRT = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const hdrFloat = floatRT && !opts.forceByteHdr;
  const hdrType = hdrFloat ? HalfFloatType : UnsignedByteType;
  const hdrEncode = hdrFloat ? 1 : 1 / 8;

  // --- tablolar (CPU'da f64 üretilir; NEAREST + shader'da elle mix ⇒ OES_texture_float_linear gerekmez)
  const profileData = new Float32Array(PROFILE_N);
  const profileTex = new DataTexture(profileData, PROFILE_N, 1, RedFormat, FloatType);
  const lut = getBlackbodyLUT();
  const bbTex = new DataTexture(new Float32Array(lut.data), BB_LUT_N, 1, RGBAFormat, FloatType);
  for (const t of [profileTex, bbTex]) {
    t.minFilter = NearestFilter;
    t.magFilter = NearestFilter;
    t.wrapS = ClampToEdgeWrapping;
    t.wrapT = ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.needsUpdate = true;
  }
  let profileKey = '';

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
    uAxisKappa: { value: 0 },
    uDiskOn: { value: 1 },
    uPlaneGuard: { value: 1 },
    uMaxDiskHits: { value: 1 },
    uRIn: { value: 6 },
    uROut: { value: 20 },
    uSpinSign: { value: 1 },
    // 4b — fotometri
    uProfile: { value: profileTex },
    uBB: { value: bbTex },
    uProfRIn: { value: 6 },
    uProfROut: { value: 20 },
    uTmax: { value: 1e4 },
    uFcol: { value: 1 },
    uFcolInv4: { value: 1 },
    uLogYref: { value: 0 },
    uBrightMode: { value: 1 },
    uSeries: { value: new Vector3(1, 0, 0) },
    // 4b — ESTETİK
    uTime: { value: 0 },
    uTurbAmp: { value: 0 },
    uTurbScale: { value: 1 },
    uEdgeFade: { value: 0 },
    uStarsOn: { value: 1 },
    uStarBrightness: { value: 1 },
    uMilkyWay: { value: 0 },
    uStarSigma: { value: 1e-3 },
    // 4b — görsel mod
    uJitter: { value: new Vector2(0, 0) },
    uAccumW: { value: 1 },
    uPrev: { value: null },
    uHdrEncode: { value: hdrEncode },
  };

  const makeMaterial = (mode) =>
    new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: buildFragmentShader({ debug: mode === 'debug', photo: mode === 'photo', nativeTrig: !!opts.nativeTrig }),
      uniforms: U,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new Mesh(geometry, makeMaterial('visual'));
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const orthoCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const visualMaterial = mesh.material;
  const debugMaterials = { debug: null, photo: null }; // yalnız istenince derlenir
  const mrtTargets = {}; // anahtar: debug türü

  const post = createPostChain(renderer, { hdrType });

  // --- durum
  let params = normalizeParams(opts.params ?? {});
  let running = false;
  let rafId = 0;
  let contextLost = false;
  let dirtyTrace = true; // iz sürme yeniden gerekli
  let dirtyPost = false; // yalnız bloom+kompozit gerekli
  let axisKappaOverride = null; // renderMRT içinde: debug yolunda varsayılan 0 (4a birebir port), {axisGuard:true} ile açılır
  let interactUntil = 0; // performance.now() < bu ⇒ etkileşim (düşük çözünürlük)
  let simTime = 0; // disk animasyonu zamanı (M)
  let lastLoopT = 0;
  let lastTraceT = 0;
  let frameEma = 0;
  let okFrames = 0;
  let dyn = 1; // dinamik çözünürlük çarpanı
  let lastScale = -1; // son iz sürmenin ölçeği
  const accum = { rts: [null, null], idx: 0, count: 0, w: 0, h: 0 };
  const stats = {
    frames: 0, lastFrameMs: 0, width: 0, height: 0, traceWidth: 0, traceHeight: 0, scale: 1, accumCount: 0, dynamicScale: 1,
    interacting: false, animating: false, uniforms: null,
  };

  // --- tuval boyutu: çizim tamponu = CSS × min(devicePixelRatio, maxPixelRatio)  (resolutionScale iz sürme çözünürlüğünü belirler)
  function canvasTarget() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, params.maxPixelRatio);
    const cssW = canvas.clientWidth || canvas.width || 1;
    const cssH = canvas.clientHeight || canvas.height || 1;
    return [Math.max(1, Math.floor(cssW * dpr)), Math.max(1, Math.floor(cssH * dpr))];
  }
  function updateSize() {
    const [w, h] = canvasTarget();
    const cur = renderer.getDrawingBufferSize(new Vector2());
    if (cur.x !== w || cur.y !== h) {
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false); // CSS boyutuna dokunma (index.html belirler)
      dirtyTrace = true;
    }
    return [w, h];
  }

  // --- uniform yazımı
  function diskTimeUniform() {
    const t = params.diskTime !== null ? params.diskTime : simTime;
    return ((t % TURB_PERIOD) + TURB_PERIOD) % TURB_PERIOD;
  }
  function writeUniforms(w, h, canvasH) {
    const d = deriveUniforms(params, w, h, canvasH);
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
    U.uAxisKappa.value = axisKappaOverride ?? d.axisKappa;
    U.uDiskOn.value = d.diskOn;
    U.uPlaneGuard.value = d.planeGuard;
    U.uMaxDiskHits.value = d.maxDiskHits;
    U.uRIn.value = d.rIn;
    U.uROut.value = d.rOut;
    U.uSpinSign.value = d.spinSign;

    // fotometri: profil tablosu (a, yön, r_out değişince yeniden yüklenir)
    const key = `${params.a}|${params.prograde}|${params.diskOut}`;
    const tbl = getProfileTable(params.a, params.prograde, params.diskOut);
    if (key !== profileKey) {
      profileKey = key;
      if (tbl) profileData.set(tbl.data);
      else profileData.fill(0);
      profileTex.needsUpdate = true;
    }
    U.uProfRIn.value = tbl ? tbl.rIn : d.rIn;
    U.uProfROut.value = tbl ? tbl.rOut : d.rIn + 1;
    const ph = photometryScalars(params);
    U.uTmax.value = ph.tmax;
    U.uFcol.value = ph.fCol;
    U.uFcolInv4.value = ph.fColInv4;
    U.uLogYref.value = ph.logYref;
    U.uBrightMode.value = ph.brightMode;
    U.uSeries.value.set(ph.series[0], ph.series[1], ph.series[2]);

    U.uTime.value = diskTimeUniform();
    U.uTurbAmp.value = d.turbAmp;
    U.uTurbScale.value = d.turbScale;
    U.uEdgeFade.value = d.edgeFade;
    U.uStarsOn.value = d.starsOn;
    U.uStarBrightness.value = d.starBrightness;
    U.uMilkyWay.value = d.milkyWay;
    U.uStarSigma.value = d.starSigma;
    return d;
  }

  // --- HDR birikim hedefleri (boyuta göre LRU önbellek: etkileşim/dinamik ölçek geçişlerinde hedef yeniden ayrılmaz)
  const accumCache = new Map(); // "WxH" → [rtA, rtB]
  const ACCUM_CACHE_MAX = 4;
  function ensureAccum(w, h) {
    if (accum.w === w && accum.h === h && accum.rts[0]) return;
    const key = `${w}x${h}`;
    let pair = accumCache.get(key);
    if (pair) accumCache.delete(key); // yeniden ekleyerek "en son kullanılan" yap
    else {
      const mk = () =>
        new WebGLRenderTarget(w, h, {
          type: hdrType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter,
          wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false,
        });
      pair = [mk(), mk()];
    }
    accumCache.set(key, pair);
    while (accumCache.size > ACCUM_CACHE_MAX) {
      const [oldKey, oldPair] = accumCache.entries().next().value;
      accumCache.delete(oldKey);
      for (const t of oldPair) t.dispose();
    }
    accum.rts = pair;
    accum.w = w;
    accum.h = h;
    accum.idx = 0;
    accum.count = 0;
  }

  /**
   * İZ SÜRME geçişi. scale: tuval çözünürlüğüne oranla; accumulate: önceki birikmişe jitter'lı katıl.
   * @returns {{w:number,h:number}} iz sürme boyutu
   */
  function traceFrame(scale, accumulate) {
    const [cw, ch] = updateSize();
    const tw = Math.max(1, Math.round(cw * scale));
    const th = Math.max(1, Math.round(ch * scale));
    ensureAccum(tw, th);
    const t0 = performance.now();
    stats.uniforms = writeUniforms(tw, th, ch);
    const fresh = !accumulate || accum.count === 0;
    if (fresh) accum.count = 0;
    const n = accum.count; // birikmiş kare sayısı
    U.uAccumW.value = fresh ? 1 : 1 / (n + 1);
    U.uJitter.value.set(fresh ? 0 : halton(n + 1, 2) - 0.5, fresh ? 0 : halton(n + 1, 3) - 0.5);
    U.uPrev.value = accum.rts[accum.idx].texture;
    const dst = 1 - accum.idx;
    mesh.material = visualMaterial;
    renderer.setRenderTarget(accum.rts[dst]);
    renderer.setViewport(0, 0, tw, th);
    renderer.render(scene, orthoCam);
    accum.idx = dst;
    accum.count = n + 1;
    stats.lastFrameMs = performance.now() - t0; // CPU tarafı gönderim süresi (GPU süresi DEĞİL)
    stats.frames++;
    stats.traceWidth = tw;
    stats.traceHeight = th;
    stats.width = cw;
    stats.height = ch;
    stats.scale = scale;
    stats.accumCount = accum.count;
    lastScale = scale;
    dirtyTrace = false;
    return { w: tw, h: th };
  }

  /** Bloom + kompozit (ESTETİK). En son birikmiş HDR'dan tuvale. */
  function postFrame() {
    if (!accum.rts[accum.idx]) return;
    const src = accum.rts[accum.idx];
    const exposure = params.exposure / hdrEncode;
    let bloomTex = null;
    let bloomMix = 0;
    if (hdrFloat && params.bloom && params.bloomStrength > 0) {
      bloomTex = post.bloom(src.texture, accum.w, accum.h, exposure, params.bloomRadius);
      bloomMix = params.bloomStrength / post.bloomNorm(params.bloomRadius);
    }
    const dbs = renderer.getDrawingBufferSize(new Vector2());
    const [cw, ch] = [dbs.x, dbs.y];
    post.composite(src.texture, bloomTex, cw, ch, { exposure, bloomMix, tonemap: params.tonemap });
    dirtyPost = false;
  }

  function isAnimating() {
    return params.disk && params.turbulence && params.turbulenceAmp > 0 && params.animate && params.timeScale > 0 && params.diskTime === null;
  }

  /** Etkin iz sürme ölçeği (kare öncesi). */
  function desiredScale(perf, interacting, animating) {
    let s = params.resolutionScale;
    if (interacting) s *= perf.interactionScale;
    if (perf.dynamicResolution && (interacting || animating)) s *= dyn;
    return clampN(s, 0.05, 1);
  }

  // --- rAF döngüsü
  function loop(now) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (contextLost) return;
    const perf = effectivePerformance(params);
    const animating = isAnimating();
    if (lastLoopT > 0 && animating) simTime += Math.min(100, now - lastLoopT) * 1e-3 * params.timeScale;
    lastLoopT = now;
    updateSize();
    const interacting = performance.now() < interactUntil;
    stats.interacting = interacting;
    stats.animating = animating;

    const scale = desiredScale(perf, interacting, animating);
    let doTrace = false;
    let accumulate = false;
    if (dirtyTrace) doTrace = true;
    else if (animating) doTrace = now - lastTraceT >= 1000 / perf.animationFps - 2;
    else if (!interacting && scale !== lastScale) doTrace = true; // etkileşim bitti ⇒ tam çözünürlük
    else if (!interacting && accum.count > 0 && accum.count < perf.accumFrames) {
      doTrace = true;
      accumulate = true; // durağan kare: jitter'lı biriktirme
    }

    if (doTrace) {
      // kare süresi denetleyicisi (yalnız ardışık animasyon/etkileşim karelerinde)
      if (!accumulate && (animating || interacting) && lastTraceT > 0) {
        const dt = now - lastTraceT;
        if (dt < 500) {
          frameEma = frameEma ? frameEma * 0.8 + dt * 0.2 : dt;
          const target = animating ? 1000 / perf.animationFps : 1000 / 30;
          if (perf.dynamicResolution) {
            if (frameEma > target * 1.4) {
              dyn = Math.max(perf.minDynamicScale, dyn * 0.9);
              frameEma = target;
              okFrames = 0;
            } else if (frameEma < target * 1.15 && ++okFrames >= 30) {
              dyn = Math.min(perf.maxDynamicScale, dyn * 1.06);
              okFrames = 0;
            }
          }
        }
      }
      dyn = clampN(dyn, perf.minDynamicScale, perf.maxDynamicScale);
      stats.dynamicScale = dyn;
      lastTraceT = now;
      traceFrame(scale, accumulate);
      postFrame();
    } else if (dirtyPost) {
      postFrame();
    }
  }

  const onLost = (e) => { e.preventDefault(); contextLost = true; };
  const onRestored = () => { contextLost = false; accum.count = 0; dirtyTrace = true; profileKey = ''; };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  // --- genel API
  function setParams(p = {}) {
    const prev = params;
    params = normalizeParams(p, params);
    let trace = false;
    let interactive = false;
    let postOnly = false;
    for (const k of Object.keys(params)) {
      if (prev[k] === params[k]) continue;
      if (POST_ONLY_KEYS.includes(k)) postOnly = true;
      else {
        trace = true;
        if (!NON_INTERACTIVE_KEYS.includes(k)) interactive = true;
      }
    }
    if (trace) dirtyTrace = true;
    if (postOnly) dirtyPost = true;
    if (interactive) interactUntil = performance.now() + effectivePerformance(params).settleMs;
    return { ...params };
  }
  const detachControls =
    opts.controls === false ? null : attachOrbitControls(canvas, { getParams: () => ({ ...params }), setParams });

  /**
   * MRT debug: float render hedefine (3 × RGBA32F) çizer ve CPU'ya okur. kind: 'debug' (4a düzeni) | 'photo' (PHOTO_FIELDS).
   * jitter yok, biriktirme yok, tuvale dokunmaz.
   */
  async function renderMRT(kind, width, height, { axisGuard = false } = {}) {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (!renderer.extensions.has('EXT_color_buffer_float')) {
      throw new Error('EXT_color_buffer_float desteklenmiyor: debug modu çalışamaz');
    }
    if (!debugMaterials[kind]) debugMaterials[kind] = makeMaterial(kind);
    let target = mrtTargets[kind];
    if (!target || target.width !== width || target.height !== height) {
      target?.dispose();
      target = mrtTargets[kind] = new WebGLRenderTarget(width, height, {
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
    mesh.material = debugMaterials[kind];
    axisKappaOverride = axisGuard ? deriveUniforms(params, width, height).axisKappa : 0;
    stats.uniforms = writeUniforms(width, height, height);
    axisKappaOverride = null;
    U.uJitter.value.set(0, 0);
    U.uAccumW.value = 1;
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, width, height);
    renderer.render(scene, orthoCam);
    renderer.setRenderTarget(null);
    mesh.material = prevMat;

    // Üç okuma da burada eşzamanlı başlatılır (readPixels çağrıda yapılır; araya başka çizim giremez).
    const n = width * height;
    const bufs = [0, 1, 2].map(() => new Float32Array(n * 4));
    await Promise.all(bufs.map((b, i) => renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height, b, undefined, i)));

    const out = new Float32Array(n * 12);
    for (let j = 0; j < height; j++) {
      const srcRow = (height - 1 - j) * width; // GL satır 0 = alt
      for (let i = 0; i < width; i++) {
        const s = (srcRow + i) * 4;
        const o = (j * width + i) * 12;
        for (let k = 0; k < 4; k++) {
          out[o + k] = bufs[0][s + k];
          out[o + 4 + k] = bufs[1][s + k];
          out[o + 8 + k] = bufs[2][s + k];
        }
      }
    }
    dirtyTrace = true; // uniform'lar debug boyutuna ayarlandı; görsel kare yeniden yazılmalı
    return out;
  }
  /** opts.axisGuard=true: görsel moddaki eksen adım korumasıyla (varsayılan false: 4a'nın birebir portu). */
  const renderDebug = (w, h, o) => renderMRT('debug', w, h, o);
  const renderDebugPhoto = (w, h, o) => renderMRT('photo', w, h, o);

  /**
   * Bir görsel kareyi hemen (eşzamanlı) çizer: tam çözünürlük (`resolutionScale`), `frames` jitter'lı kare biriktirilir.
   * Anlık görüntü ve testler için; etkileşim/animasyon denetleyicisini devreden çıkarır.
   */
  function renderOnce({ frames = 1 } = {}) {
    const scale = clampN(params.resolutionScale, 0.05, 1);
    traceFrame(scale, false);
    for (let i = 1; i < frames; i++) traceFrame(scale, true);
    postFrame();
  }

  /** Eşzamanlı ölçüm; yalnız iz sürme (`post:false`) ya da tüm hat (`post:true`). 1 piksellik okuma GPU bitişini BEKLER. */
  function benchmark({ frames = 3, warmup = 1, post: withPost = true } = {}) {
    const scale = clampN(params.resolutionScale, 0.05, 1);
    const px = new Uint8Array(4);
    const px16 = hdrFloat ? new Uint16Array(4) : new Uint8Array(4);
    const sync = () => {
      if (withPost) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      else renderer.readRenderTargetPixels(accum.rts[accum.idx], 0, 0, 1, 1, px16);
    };
    const one = () => { traceFrame(scale, false); if (withPost) postFrame(); sync(); };
    for (let i = 0; i < warmup; i++) one();
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) one();
    const dt = performance.now() - t0;
    return { msPerFrame: dt / frames, width: stats.traceWidth, height: stats.traceHeight, canvasWidth: stats.width, canvasHeight: stats.height, frames };
  }

  function start() {
    if (running) return;
    running = true;
    dirtyTrace = true;
    lastLoopT = 0;
    lastTraceT = 0;
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
    for (const t of Object.values(mrtTargets)) t?.dispose();
    for (const pair of accumCache.values()) for (const t of pair) t.dispose();
    visualMaterial.dispose();
    for (const m of Object.values(debugMaterials)) m?.dispose();
    post.dispose();
    profileTex.dispose();
    bbTex.dispose();
    geometry.dispose();
    renderer.dispose();
  }

  return {
    start,
    stop,
    setParams,
    getParams: () => ({ ...params }),
    renderDebug,
    renderDebugPhoto,
    // --- ek
    renderOnce,
    benchmark,
    dispose,
    getStats: () => ({ ...stats, hdr: hdrFloat ? 'half-float' : '8-bit (yedek)' }),
    getContext: () => gl,
    isRunning: () => running,
  };
}
