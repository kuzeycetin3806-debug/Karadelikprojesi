/**
 * Kara delik render çekirdeği: tam ekran Kerr null-geodezik ışın izleyici (WebGL2 / GLSL ES 3.00) + fotogerçekçi görüntü hattı.
 *
 * Hat (Adım 4c — ertelenmiş gölgelendirme):
 *   1. İZ SÜRME (T)     : piksel başına geodezik → G önbelleği (RGBA32F: vuruş r, g_cam, φ | kaçış yönü | durum)       [pahalı; kamera/geometri değişince]
 *   2. GÖLGELENDİRME (S): G → doğrusal HDR radyans (gökyüzü/yıldız + disk fotometrisi [+ türbülans]) → jitter'lı biriktirme   [orta; gölgelendirme parametresi değişince]
 *   3. ANİMASYON (A)    : S çıktısı × türbülans çarpanı(r, φ, zaman) → HDR                                               [çok ucuz; animasyon açıkken her kare]
 *   4. BLOOM (ESTETİK)  : çok seviyeli aşağı/yukarı örnekleme (mobil/düşük kademe: ucuz bloom)
 *   5. KOMPOZİT         : pozlama (GÖSTERİM) + bloom + ton eşleme (ESTETİK) + sRGB (gösterim kodlaması) + dither → tuval
 * Durağan sahnede hiçbir geçiş çalışmaz (yalnız birkaç ilerleyici biriktirme karesinden sonra boşta). Animasyonda yalnız 3–5 çalışır.
 * Ertelenmiş hat desteklenmiyorsa (RGBA32F/RGBA16F render hedefi yok) ya da maxDiskHits > 1 ise eski birleşik tek geçiş kullanılır (1+2 birleşik; her animasyon karesi tam iz sürme).
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
  DEFAULT_PARAMS, QUALITY_PRESETS, PERFORMANCE_PRESETS, POST_ONLY_KEYS, SHADE_ONLY_KEYS, CLOCK_KEYS, LOOP_ONLY_KEYS, NON_INTERACTIVE_KEYS, TURB_PERIOD, AXIS_KAPPA,
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

/** Uyarlamalı çözünürlük basamağı: dyn = 2^(−k/LADDER) (k tamsayı ⇒ sonlu sayıda iz sürme boyutu ⇒ hedef önbelleği yeniden ayrılmaz). */
const LADDER = 6;
const dynOf = (k) => 2 ** (-k / LADDER);

/**
 * Cihaz sınıfı (UYGULAMA/GÖSTERİM kararları için; fizik değişmez). iPadOS 13+ kendini 'MacIntel' olarak tanıtır ⇒ dokunma noktası sayısına bakılır.
 * @param {{mobile?: boolean}} [override]
 */
function detectDevice(override) {
  const nav = globalThis.navigator ?? {};
  const ua = nav.userAgent ?? '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
  const android = /Android/i.test(ua);
  const coarse = !!globalThis.matchMedia?.('(pointer: coarse)')?.matches;
  return { mobile: override?.mobile ?? (ios || android || coarse), ios, lowPower: false, safeLevel: 0 };
}

/**
 * Ham GL ile "bu biçim gerçekten render edilebilir mi" sınaması (uzantı adı yetmez: iOS/Safari'de uzantı bildirip eksik kalabilir).
 * Bağlamayı null'a geri alır (three durum önbelleği ile tutarlı); GL hata bayrağını temizler.
 */
function probeRenderable(gl, internalFormat, format, type) {
  let ok = false;
  const tex = gl.createTexture();
  const fb = gl.createFramebuffer();
  try {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE && gl.getError() === gl.NO_ERROR;
  } catch {
    ok = false;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.deleteFramebuffer(fb);
  gl.deleteTexture(tex);
  while (gl.getError() !== gl.NO_ERROR) { /* temizle */ }
  return ok;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} [opts]
 * @param {object}  [opts.params]               başlangıç parametreleri (DEFAULT_PARAMS üzerine)
 * @param {boolean} [opts.controls=true]        geçici fare/dokunmatik yörünge kontrolü
 * @param {boolean} [opts.preserveDrawingBuffer=false]  ekran görüntüsü/test için true (üretimde gerekmez: UI renderOnce + toBlob'u aynı görevde yapar)
 * @param {boolean} [opts.nativeTrig=false]   true: cihazın sin/cos'u (hızlı; doğruluk cihaza bağlı). Varsayılan: src/shaders/trig.glsl
 * @param {boolean} [opts.forceByteHdr=false] YALNIZ TEST: float HDR hedefi yokmuş gibi 8-bit yedek hedefi kullan
 * @param {boolean} [opts.forceNoDeferred=false] YALNIZ TEST: RGBA32F hedefi yokmuş gibi (ertelenmiş hat kapalı, birleşik hat)
 * @param {{mobile?: boolean}} [opts.device]  cihaz sınıfını elle belirle (test); varsayılan: UA/ekran algısı
 * @param {'high-performance'|'default'|'low-power'} [opts.powerPreference]  varsayılan: mobil/iOS 'default', masaüstü 'high-performance'
 */
export function createBlackHoleRenderer(canvas, opts = {}) {
  const device = detectDevice(opts.device);
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    // iOS/Android'de 'high-performance' etkisizdir ya da ısıtır; masaüstünde ayrık GPU'yu seçer (Mac'te pil/ısı: bkz. README §3.5)
    powerPreference: opts.powerPreference ?? (device.mobile ? 'default' : 'high-performance'),
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
  });
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);
  const gl = renderer.getContext();

  // --- yetenekler (iOS Safari: uzantı + gerçek render edilebilirlik sınaması)
  const caps = { f32rt: false, f16rt: false, hdrFloat: false, deferred: false, maxTexture: 4096 };
  function detectCaps() {
    const ext32 = renderer.extensions.has('EXT_color_buffer_float');
    const ext16 = renderer.extensions.has('EXT_color_buffer_half_float');
    caps.f32rt = ext32 && probeRenderable(gl, gl.RGBA32F, gl.RGBA, gl.FLOAT);
    // RGBA16F: WebGL2'de EXT_color_buffer_float ya da EXT_color_buffer_half_float ile render edilebilir
    caps.f16rt = (ext32 || ext16) && probeRenderable(gl, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    caps.hdrFloat = caps.f16rt && !opts.forceByteHdr;
    // ertelenmiş hat: G önbelleği RGBA32F (NEAREST + texelFetch ⇒ OES_texture_float_linear GEREKMEZ) + RGBA16F HDR
    caps.deferred = caps.f32rt && caps.hdrFloat && !opts.forceNoDeferred;
    caps.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
  }
  detectCaps();
  let hdrFloat = caps.hdrFloat;
  const hdrType = () => (hdrFloat ? HalfFloatType : UnsignedByteType);
  const hdrEncode = hdrFloat ? 1 : 1 / 8;

  // --- tablolar (CPU'da f64 üretilir; NEAREST + shader'da elle mix ⇒ OES_texture_float_linear gerekmez)
  const profileData = new Float32Array(PROFILE_N);
  const lut = getBlackbodyLUT();
  let profileTex = null;
  let bbTex = null;
  function makeTables() {
    profileTex = new DataTexture(profileData, PROFILE_N, 1, RedFormat, FloatType);
    bbTex = new DataTexture(new Float32Array(lut.data), BB_LUT_N, 1, RGBAFormat, FloatType);
    for (const t of [profileTex, bbTex]) {
      t.minFilter = NearestFilter;
      t.magFilter = NearestFilter;
      t.wrapS = ClampToEdgeWrapping;
      t.wrapT = ClampToEdgeWrapping;
      t.generateMipmaps = false;
      t.needsUpdate = true;
    }
  }
  makeTables();
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
    uStepNoDrag: { value: 1 },
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
    // 4c — ertelenmiş hat
    uG: { value: null },
    uTurbDeferred: { value: 0 },
  };

  const makeMaterial = (mode) =>
    new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: buildFragmentShader({
        debug: mode === 'debug', photo: mode === 'photo', nativeTrig: !!opts.nativeTrig,
        mode: ['trace', 'shade', 'anim'].includes(mode) ? mode : 'visual',
      }),
      uniforms: U,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });

  const makeGeometry = () => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    return g;
  };
  let geometry = makeGeometry();
  const mesh = new Mesh(geometry);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const orthoCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let materials = {}; // anahtar: 'visual' | 'trace' | 'shade' | 'anim' | 'debug' | 'photo' — yalnız istenince derlenir
  const mat = (mode) => (materials[mode] ??= makeMaterial(mode));
  let mrtTargets = {}; // anahtar: debug türü

  let post = createPostChain(renderer, { hdrType: hdrType() });

  // --- durum
  let params = normalizeParams(opts.params ?? {});
  let running = false;
  let rafId = 0;
  let contextLost = false;
  let hidden = typeof document !== 'undefined' ? document.hidden === true : false;
  let dirtyTrace = true; // geodezik (T) yeniden gerekli
  let dirtyShade = false; // yalnız gölgelendirme (S) gerekli (ertelenmiş hatta G önbellekten)
  let dirtyPost = false; // yalnız bloom+kompozit gerekli
  let axisKappaOverride = null; // renderMRT içinde: {axisGuard} açık/kapalı seçeneğiyle belirlenir (varsayılan: params.axisGuard = görsel modla aynı)
  let interactUntil = 0; // performance.now() < bu ⇒ etkileşim (düşük çözünürlük)
  let simTime = 0; // disk animasyonu zamanı (M)
  let lastLoopT = 0;
  let lastTraceT = 0; // birleşik (yedek) hatta son animasyon karesi
  let lastAnimT = 0; // ertelenmiş hatta son animasyon karesi
  let lastScale = -1; // son iz sürmenin ölçeği
  let prevTickActive = false; // önceki rAF karesinde etkileşimli sahne çizildi mi (denetleyici ardışıklığı)
  let prevTickT = 0;
  let job = null; // süren (şeritli) iz sürme işi
  const stats = {
    frames: 0, presented: 0, traceFrames: 0, shadeFrames: 0, animFrames: 0, lastFrameMs: 0, frameMs: 0, fps: 0,
    width: 0, height: 0, traceWidth: 0, traceHeight: 0, scale: 1, accumCount: 0, dynamicScale: 1, adaptiveLevel: 0,
    mode: 'idle', interacting: false, animating: false, uniforms: null, contextRestores: 0, bands: 1, gpuMB: 0, simTime: 0, ticks: 0,
  };
  let lastSceneT = 0;

  // --- hedef önbelleği (boyuta göre LRU, BAYT bütçeli): entry = {w, h, rts:[A,B] (HDR ping-pong), G (RGBA32F iz sürme önbelleği), H (animasyon çıktısı)}
  const cache = new Map();
  const CACHE_MAX_BYTES = device.mobile ? 96e6 : 600e6;
  const CACHE_MAX_COUNT = 6;
  const bytesOf = (e) => e.w * e.h * ((hdrFloat ? 8 : 4) * 2 + (e.G ? 16 : 0) + (e.H ? 8 : 0));
  const mkTarget = (w, h, type, filter) =>
    new WebGLRenderTarget(w, h, {
      type, format: RGBAFormat, minFilter: filter, magFilter: filter,
      wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false,
    });
  const disposeEntry = (e) => { for (const t of [...e.rts, e.G, e.H]) t?.dispose(); };
  function getEntry(w, h) {
    const key = `${w}x${h}`;
    let e = cache.get(key);
    if (e) cache.delete(key); // yeniden ekleyerek "en son kullanılan" yap
    else e = { w, h, rts: [mkTarget(w, h, hdrType(), LinearFilter), mkTarget(w, h, hdrType(), LinearFilter)], G: null, H: null };
    cache.set(key, e);
    return e;
  }
  function evict() {
    let total = 0;
    for (const e of cache.values()) total += bytesOf(e);
    for (const [k, e] of cache) {
      if (cache.size <= 1 || (cache.size <= CACHE_MAX_COUNT && total <= CACHE_MAX_BYTES)) break;
      if (e === cur.e || (job && e === job.e)) continue;
      cache.delete(k);
      total -= bytesOf(e);
      disposeEntry(e);
    }
    stats.gpuMB = total / 1e6;
  }
  const ensureG = (e) => (e.G ??= mkTarget(e.w, e.h, FloatType, NearestFilter));
  const ensureH = (e) => (e.H ??= mkTarget(e.w, e.h, hdrType(), LinearFilter));

  /** Görüntülenen durum: hangi hedef, kaç jitter'lı kare birikti, taban görüntü türü. kind: 'fused' | 'baked' (türbülans S içinde) | 'deferred' (türbülans A'da) */
  const cur = { e: null, idx: 0, count: 0, kind: 'none', gValid: false, hValid: false, jitter: new Vector2(0, 0), scale: 1, version: 0 };
  let bloomKey = ''; // bloom önbelleği anahtarı (taban sürümü + boyut + pozlama + yarıçap + kademe)
  let bloomTexCached = null;

  // --- kare süresi denetleyicisi (uyarlamalı çözünürlük basamağı k; 'auto' ve dynamicResolution=true olan tüm ön ayarlar)
  const ctl = {
    k: 0, ema: 0, ok: 0, skip: 4, downs: 0, lastDownT: 0, upBlockedUntil: 0, nextAdjustT: 0,
    animEma: 0, animDiv: 1, animOk: 0, animSkip: 6, animProbeAt: 0, animProbeFailed: 0, kMin: 0, kMax: 12,
  };
  function ctlBounds(perf) {
    ctl.kMin = Math.round(-LADDER * Math.log2(perf.maxDynamicScale));
    ctl.kMax = Math.max(ctl.kMin, Math.round(-LADDER * Math.log2(perf.minDynamicScale)));
    ctl.k = clampN(ctl.k, ctl.kMin, ctl.kMax);
  }

  // --- tuval boyutu: çizim tamponu = CSS × min(devicePixelRatio, maxPixelRatio)  (resolutionScale/maxTracePixels iz sürme çözünürlüğünü belirler)
  function canvasTarget() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, params.maxPixelRatio);
    const cssW = canvas.clientWidth || canvas.width || 1;
    const cssH = canvas.clientHeight || canvas.height || 1;
    const lim = Math.min(caps.maxTexture, 8192);
    return [clampN(Math.floor(cssW * dpr), 1, lim), clampN(Math.floor(cssH * dpr), 1, lim)];
  }
  let sizeInit = false;
  function updateSize() {
    const [w, h] = canvasTarget();
    const cur0 = renderer.getDrawingBufferSize(new Vector2());
    if (cur0.x !== w || cur0.y !== h) {
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false); // CSS boyutuna dokunma (index.html belirler)
      dirtyTrace = true;
      if (sizeInit) interactUntil = performance.now() + effectivePerformance(params, device).settleMs; // yeniden boyutlandırma: önce düşük çözünürlük
      sizeInit = true;
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
    const axisKappa = axisKappaOverride ?? d.axisKappa;
    U.uAxisKappa.value = axisKappa;
    U.uStepNoDrag.value = d.stepNoDrag;
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
    return { ...d, axisKappa }; // gerçekten yüklenen κ_a (doğrulama betikleri okur)
  }

  // --- yol seçimi
  const deferredActive = () => caps.deferred && params.deferred !== false && params.maxDiskHits === 1;
  function isAnimating() {
    return params.disk && params.turbulence && params.turbulenceAmp > 0 && params.animate && params.timeScale > 0 && params.diskTime === null;
  }
  /** Ertelenmiş hatta taban görüntü türü: animasyonda türbülans A geçişinde ('deferred'), değilse S içinde ('baked'). Birleşik hat: 'fused'. */
  const desiredKind = () => (deferredActive() ? (isAnimating() ? 'deferred' : 'baked') : 'fused');
  const cheapBloomNow = (perf) => hdrFloat && (perf.cheapBloom === true || (perf.cheapBloom === 'auto' && (ctl.k - ctl.kMin >= 3 || ctl.animDiv > 1)));

  // --- çözünürlük planı
  /** Durağan iz sürme ölçeği: resolutionScale ve piksel bütçesi (maxTracePixels). */
  function settledScale(perf, cw, ch) {
    let s = params.resolutionScale;
    const px = cw * ch;
    if (px * s * s > perf.maxTracePixels) s = Math.sqrt(perf.maxTracePixels / px);
    return clampN(s, 0.05, 1);
  }
  function desiredScale(perf, cw, ch, interacting, fusedAnimating) {
    let s = settledScale(perf, cw, ch);
    if (interacting) s *= perf.interactionScale;
    if (perf.dynamicResolution && (interacting || fusedAnimating)) s *= dynOf(ctl.k);
    return clampN(s, 0.05, 1);
  }

  // =====================================================================================================================
  // İz sürme işi (T + S ya da birleşik): şeritli (kare-üstü) olabilir. Şeritler arasında görüntülenen kare DEĞİŞMEZ (çift tampon).
  // =====================================================================================================================
  function setScissor(target, on, y0 = 0, h = 0) {
    if (!target) return;
    target.scissorTest = on;
    if (on) target.scissor.set(0, y0, target.width, h);
  }
  function abandonJob() {
    if (!job) return;
    setScissor(job.e.G, false);
    for (const t of job.e.rts) setScissor(t, false);
    job = null;
  }
  function bandsFor(pixels, perf) {
    return clampN(Math.ceil(pixels / Math.max(1e3, perf.maxTickPixels)), 1, 16);
  }

  /** İş başlat. scale: tuval çözünürlüğüne oranla; accumulate: önceki birikmişe jitter'lı katıl; bands: şerit sayısı. */
  function beginJob(scale, accumulate, bands, perf) {
    const [cw, ch] = updateSize();
    const tw = Math.max(1, Math.round(cw * scale));
    const th = Math.max(1, Math.round(ch * scale));
    const e = getEntry(tw, th);
    const deferred = deferredActive();
    const kind = desiredKind();
    const same = cur.e === e;
    const fresh = !accumulate || !same || cur.count === 0 || cur.kind !== kind;
    const n = fresh ? 0 : cur.count;
    if (deferred) ensureG(e);
    evict();
    dirtyTrace = false;
    dirtyShade = false;
    job = {
      e, tw, th, cw, ch, deferred, kind, fresh, n, scale, bands, next: 0, t0: performance.now(),
      jx: fresh ? 0 : halton(n + 1, 2) - 0.5, jy: fresh ? 0 : halton(n + 1, 3) - 0.5,
      src: same ? cur.idx : 0, // birikim kaynağı (önceki HDR)
    };
    job.dst = same ? 1 - cur.idx : 0;
    return job;
  }

  /** Bir şerit çiz. Son şeritse işi tamamlar ve true döner. */
  function stepJob(j) {
    const bandH = Math.ceil(j.th / j.bands);
    const y0 = j.next * bandH;
    const bh = Math.min(bandH, j.th - y0);
    const banded = j.bands > 1;
    stats.uniforms = writeUniforms(j.tw, j.th, j.ch);
    U.uAccumW.value = j.fresh ? 1 : 1 / (j.n + 1);
    U.uJitter.value.set(j.jx, j.jy);
    U.uPrev.value = j.e.rts[j.src === j.dst ? 1 - j.dst : j.src].texture;
    U.uTurbDeferred.value = j.kind === 'deferred' ? 1 : 0;
    const dst = j.e.rts[j.dst];
    if (j.deferred) {
      // T: geodezik → G
      setScissor(j.e.G, banded, y0, bh);
      mesh.material = mat('trace');
      renderer.setRenderTarget(j.e.G);
      renderer.setViewport(0, 0, j.tw, j.th);
      renderer.render(scene, orthoCam);
      // S: G → HDR
      U.uG.value = j.e.G.texture;
      setScissor(dst, banded, y0, bh);
      mesh.material = mat('shade');
    } else {
      setScissor(dst, banded, y0, bh);
      mesh.material = mat('visual');
    }
    renderer.setRenderTarget(dst);
    renderer.setViewport(0, 0, j.tw, j.th);
    renderer.render(scene, orthoCam);
    j.next++;
    if (j.next < j.bands) {
      if (banded) gl.flush(); // her şerit ayrı komut tamponu: iOS GPU zaman aşımı riskini azaltır
      return false;
    }
    // --- tamamlandı: görüntülenen duruma işle
    setScissor(j.e.G, false);
    setScissor(dst, false);
    cur.e = j.e;
    cur.idx = j.dst;
    cur.count = j.n + 1;
    cur.kind = j.kind;
    cur.gValid = j.deferred;
    cur.hValid = false;
    cur.version++;
    cur.jitter.set(j.jx, j.jy);
    cur.scale = j.scale;
    lastScale = j.scale;
    stats.lastFrameMs = performance.now() - j.t0; // CPU tarafı gönderim süresi (GPU süresi DEĞİL)
    stats.traceWidth = j.tw;
    stats.traceHeight = j.th;
    stats.width = j.cw;
    stats.height = j.ch;
    stats.scale = j.scale;
    stats.accumCount = cur.count;
    stats.bands = j.bands;
    stats.traceFrames++;
    if (j.deferred) stats.shadeFrames++;
    sceneFrameDone();
    job = null;
    return true;
  }

  /** S yalnız: G önbellekten yeniden gölgelendir (geodezik yok). Türbülans modu (baked/deferred) ya da gölgelendirme parametresi değişince. */
  function shadeOnly(kind = desiredKind()) {
    const e = cur.e;
    const [, ch] = updateSize();
    dirtyShade = false;
    const t0 = performance.now();
    const dst = 1 - cur.idx;
    stats.uniforms = writeUniforms(e.w, e.h, ch);
    U.uAccumW.value = 1;
    U.uJitter.value.copy(cur.jitter);
    U.uPrev.value = e.rts[cur.idx].texture;
    U.uTurbDeferred.value = kind === 'deferred' ? 1 : 0;
    U.uG.value = e.G.texture;
    mesh.material = mat('shade');
    renderer.setRenderTarget(e.rts[dst]);
    renderer.setViewport(0, 0, e.w, e.h);
    renderer.render(scene, orthoCam);
    cur.idx = dst;
    cur.count = 1; // tek jitter örneği (G'nin kendi jitter'ı); ilerleyici iyileştirme yeniden başlar
    cur.kind = kind;
    cur.hValid = false;
    cur.version++;
    stats.accumCount = 1;
    stats.shadeFrames++;
    stats.lastFrameMs = performance.now() - t0;
    sceneFrameDone();
  }

  /** A: taban × türbülans (animasyon). Yeni HDR dokusunu cur.e.H'ye yazar. */
  function animPass() {
    const e = cur.e;
    const [, ch] = updateSize();
    const t0 = performance.now();
    const H = ensureH(e);
    stats.uniforms = writeUniforms(e.w, e.h, ch);
    U.uPrev.value = e.rts[cur.idx].texture;
    U.uG.value = e.G.texture;
    mesh.material = mat('anim');
    renderer.setRenderTarget(H);
    renderer.setViewport(0, 0, e.w, e.h);
    renderer.render(scene, orthoCam);
    cur.hValid = true;
    stats.simTime = simTime; // bu A geçişinin kullandığı simülasyon zamanı (M)
    stats.animFrames++;
    stats.lastFrameMs = performance.now() - t0;
    sceneFrameDone();
  }

  /** Bir rAF karesinde (T / S / A geçişlerinden herhangi biri) sahne çizildi: tek sayılır (frames = sunulan sahne karesi). */
  let sceneDirty = false;
  const sceneFrameDone = () => { sceneDirty = true; };
  function flushSceneFrame(t) {
    if (!sceneDirty) return;
    sceneDirty = false;
    stats.frames++;
    if (lastSceneT > 0 && t - lastSceneT < 1000) stats.frameMs = stats.frameMs ? stats.frameMs * 0.8 + (t - lastSceneT) * 0.2 : t - lastSceneT;
    lastSceneT = t;
  }

  /**
   * Bloom + kompozit (ESTETİK). Kompozit girdisi: animasyon geçişi çıktısı (varsa) yoksa taban HDR.
   * Bloom girdisi HER ZAMAN taban HDR'dır (animasyonda türbülanssız) ve taban/pozlama/yarıçap/kademe değişmedikçe önbellekten gelir
   * (ESTETİK sadeleştirme: türbülans ortalaması ≈ 1 ve bloom geniş çekirdekle süzer; animasyon karesinde 9 geçiş tasarrufu).
   */
  function postFrame(perf) {
    const e = cur.e;
    if (!e) return;
    const base = e.rts[cur.idx];
    const src = cur.hValid && e.H ? e.H : base;
    const exposure = params.exposure / hdrEncode;
    let bloomTex = null;
    let bloomMix = 0;
    perf ??= effectivePerformance(params, device);
    const cheap = cheapBloomNow(perf);
    if (hdrFloat && params.bloom && params.bloomStrength > 0) {
      const key = `${cur.version}|${e.w}x${e.h}|${exposure}|${params.bloomRadius}|${cheap}`;
      if (key !== bloomKey) {
        bloomTexCached = post.bloom(base.texture, e.w, e.h, exposure, params.bloomRadius, cheap);
        bloomKey = key;
      }
      bloomTex = bloomTexCached;
      bloomMix = params.bloomStrength / post.bloomNorm(params.bloomRadius, cheap);
    }
    const dbs = renderer.getDrawingBufferSize(new Vector2());
    post.composite(src.texture, bloomTex, dbs.x, dbs.y, { exposure, bloomMix, tonemap: params.tonemap });
    dirtyPost = false;
    stats.presented++;
  }

  // =====================================================================================================================
  // Uyarlamalı kalite denetleyicisi
  // =====================================================================================================================
  /**
   * Etkin (etkileşim / birleşik-yedek animasyon) iz sürme karelerinin rAF aralığı örneği (dt, ms). target: ms.
   * GPU süresi ölçülmez (iOS Safari'de EXT_disjoint_timer_query yok): arka basınç (backpressure) altında rAF aralığı = en yavaş aşamanın süresi.
   */
  function ctlSample(now, dt, target, perf) {
    if (!perf.dynamicResolution || !(dt > 0) || dt > 500) return;
    ctl.ema = ctl.ema ? ctl.ema * 0.75 + dt * 0.25 : dt;
    if (ctl.skip > 0) { ctl.skip--; return; }
    if (now - ctl.lastDownT > 30000 && ctl.downs > 0) { ctl.downs--; ctl.lastDownT = now; } // sakin dönemde geri çekilme süresi kısalır
    if (ctl.ema > target * 1.25 && now >= ctl.nextAdjustT && ctl.k < ctl.kMax) {
      // maliyet ∝ piksel ∝ ölçek² ⇒ gereken basamak sayısı = LADDER/2·log2(ema/hedef)
      const steps = clampN(Math.ceil((LADDER / 2) * Math.log2(ctl.ema / target)), 1, 4);
      ctl.k = Math.min(ctl.kMax, ctl.k + steps);
      ctl.downs = Math.min(ctl.downs + 1, 5);
      ctl.lastDownT = now;
      ctl.upBlockedUntil = now + 3000 * 2 ** (ctl.downs - 1); // ısınma (thermal) histerezisi: art arda düşüşte yukarı çıkma bekleme süresi üstel artar
      ctl.nextAdjustT = now + 200;
      ctl.ema = target;
      ctl.ok = 0;
      ctl.skip = 3; // yeni boyut: ilk kareler (hedef ayırma) ölçümü bozar
    } else if (ctl.ema < target * 0.62 && ctl.k > ctl.kMin) {
      if (++ctl.ok >= 40 && now >= ctl.upBlockedUntil) {
        ctl.k--;
        ctl.ok = 0;
        ctl.skip = 3;
      }
    } else {
      ctl.ok = 0;
    }
  }

  /** Ertelenmiş hatta animasyon karesi hızı: hedef aralığı tutamıyorsa kare atla (1/2, 1/3, 1/4); periyodik olarak geri dene. */
  function animThrottle(now, interval, perf) {
    if (lastAnimT > 0 && perf.dynamicResolution) {
      const dt = now - lastAnimT;
      if (dt < 500) {
        ctl.animEma = ctl.animEma ? ctl.animEma * 0.8 + dt * 0.2 : dt;
        const want = interval * ctl.animDiv;
        if (ctl.animSkip > 0) ctl.animSkip--;
        else if (ctl.animEma > want * 1.45 + 4 && ctl.animDiv < 4) {
          ctl.animDiv++;
          ctl.animEma = 0;
          ctl.animSkip = 6;
          ctl.animProbeAt = now + 15000 * 2 ** Math.min(ctl.animProbeFailed, 3);
        } else if (ctl.animDiv > 1 && now >= ctl.animProbeAt) {
          ctl.animDiv--; // geri dene: tutamazsa yukarıdaki dal tekrar düşürür, bekleme üstel uzar
          ctl.animProbeFailed++;
          ctl.animEma = 0;
          ctl.animSkip = 6;
        } else if (ctl.animDiv === 1) ctl.animProbeFailed = Math.max(0, ctl.animProbeFailed - 0.002);
      }
    }
  }

  // --- rAF döngüsü
  /** Durmuş döngüyü uyandır (setParams, yeniden boyutlandırma, görünürlük, bağlam geri yüklemesi). */
  function wake() {
    if (running && !rafId && !hidden && !contextLost) rafId = requestAnimationFrame(loop);
  }
  function loop(now) {
    rafId = 0;
    if (!running || hidden || contextLost) return; // gizli / bağlam kayıp: tamamen dur (visibilitychange / webglcontextrestored uyandırır)
    rafId = requestAnimationFrame(loop);
    stats.ticks++;
    const perf = effectivePerformance(params, device);
    ctlBounds(perf);
    const animating = isAnimating();
    if (lastLoopT > 0 && animating) simTime += Math.min(100, now - lastLoopT) * 1e-3 * params.timeScale;
    lastLoopT = now;
    const [cw, ch] = updateSize();
    const interacting = performance.now() < interactUntil;
    stats.interacting = interacting;
    stats.animating = animating;
    stats.dynamicScale = dynOf(ctl.k);
    stats.adaptiveLevel = ctl.k - ctl.kMin;

    const deferred = deferredActive();
    const kind = desiredKind();
    const fusedAnimating = animating && !deferred;
    const interval = 1000 / perf.animationFps;
    if (job && dirtyTrace) abandonJob();
    if (dirtyShade && !job && !(deferred && cur.gValid && cur.e)) { dirtyTrace = true; dirtyShade = false; } // önbellek yok ⇒ tam iz sürme

    const quick = interacting || !cur.e; // ilk kare de düşük çözünürlük (hızlı ilk görüntü)
    const scale = desiredScale(perf, cw, ch, quick, fusedAnimating);
    let drewScene = false; // bu karede sahne (T/S/A) çizildi mi
    if (job) {
      drewScene = true;
      stepJob(job);
    } else {
      let startJob = null;
      let reshade = false;
      if (dirtyTrace) startJob = { acc: false };
      else if (deferred && cur.e && cur.gValid && (dirtyShade || cur.kind !== kind)) reshade = true;
      else if (cur.e && cur.kind !== kind) startJob = { acc: false }; // G yok (ör. birleşik→ertelenmiş geçiş)
      else if (fusedAnimating) { if (now - lastTraceT >= interval - 2) startJob = { acc: false }; }
      else if (!interacting && scale !== lastScale) startJob = { acc: false }; // etkileşim bitti ⇒ durağan çözünürlük
      else if (!interacting && !animating && cur.count > 0 && cur.count < perf.accumFrames) startJob = { acc: true }; // animasyonda biriktirme yok (hareketli desende hayalet + türbülans maskesi tek örnekten)

      if (startJob || reshade) {
        // kare süresi denetleyicisi yalnız ardışık etkileşim kareleri (önceki kare de etkindi) ya da birleşik-yedek animasyon karelerinde örnekler
        if (interacting) ctlSample(now, prevTickActive ? now - prevTickT : 0, 1000 / 30, perf);
        else if (fusedAnimating && lastTraceT > 0) ctlSample(now, now - lastTraceT, Math.max(28, interval), perf);
        drewScene = true;
        if (startJob) {
          const bands = quick ? 1 : bandsFor(Math.round(cw * scale) * Math.round(ch * scale), perf);
          lastTraceT = now;
          beginJob(scale, startJob.acc, bands, perf);
          stepJob(job);
        } else shadeOnly();
      }
    }

    // --- animasyon (ertelenmiş hat): taban türbülanssız ise A geçişi; şeritli iş sürerken ve G geçersizken çalışmaz
    let presented = false;
    if (!job && deferred && animating && cur.e && cur.gValid && cur.kind === 'deferred') {
      if (drewScene || now - lastAnimT >= interval * ctl.animDiv - 2) {
        if (!drewScene) animThrottle(now, interval, perf);
        animPass();
        lastAnimT = now;
        postFrame(perf);
        presented = true;
      }
    }
    if (!presented && ((drewScene && !job) || dirtyPost) && cur.e) postFrame(perf);

    prevTickActive = drewScene && interacting;
    prevTickT = now;
    flushSceneFrame(performance.now());

    // --- kip bildirimi
    const pendingRefine = !interacting && !!cur.e && !fusedAnimating &&
      (dirtyTrace || dirtyShade || scale !== lastScale || (!animating && cur.count > 0 && cur.count < perf.accumFrames));
    stats.mode = job || !cur.e || (pendingRefine && !interacting) ? 'refining'
      : interacting ? 'interacting' : animating ? 'animating' : 'idle';
    if (interacting && (drewScene || job)) stats.mode = 'interacting';
    const t = performance.now();
    stats.fps = lastSceneT > 0 && t - lastSceneT < 1000 && stats.frameMs > 0 ? 1000 / stats.frameMs : 0;
    // gerçek boşta: yapılacak hiçbir şey yok ⇒ rAF'i de durdur (pil: ekran bağlantısı uyandırması yok)
    if (stats.mode === 'idle' && !job && !dirtyTrace && !dirtyShade && !dirtyPost) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  // --- bağlam kaybı / geri yükleme (iOS: bellek baskısı, GPU zaman aşımı, arka plana alma)
  let lostAt = 0;
  const onLost = (e) => {
    e.preventDefault();
    contextLost = true;
    lostAt = performance.now();
    job = null;
    cur.e = null;
    cur.gValid = false;
    cur.hValid = false;
    cur.count = 0;
    cur.kind = 'none';
    cache.clear(); // GL nesneleri gitti; eski RenderTarget nesneleri dispose EDİLMEZ (geçersiz nesneyi silmek GL uyarısı üretir), yalnız bırakılır
  };
  const onRestored = () => {
    // three kendi durumunu (extensions, properties, state) önce yeniden kurar (onun dinleyicisi önce kaydedildi)
    detectCaps();
    // Bağlama bağlı JS nesnelerini ATARAK yeniden kur (eski GL nesneleri geçersiz; dispose etmek "object does not belong to this context" uyarısı üretir)
    post = createPostChain(renderer, { hdrType: hdrType() });
    makeTables();
    U.uProfile.value = profileTex;
    U.uBB.value = bbTex;
    materials = {};
    mrtTargets = {};
    geometry = makeGeometry();
    mesh.geometry = geometry;
    hdrFloat = caps.hdrFloat;
    contextLost = false;
    profileKey = '';
    dirtyTrace = true;
    lastScale = -1;
    stats.contextRestores++;
    // 60 s içinde yinelenen kayıp ⇒ iş kare başına çok ağır olabilir (iOS GPU zaman aşımı): piksel bütçesini ve şerit boyunu küçült
    if (performance.now() - lostAt < 60000 && stats.contextRestores > 1) device.safeLevel = Math.min(4, device.safeLevel + 1);
    lastLoopT = 0;
    bloomKey = '';
    wake();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  // --- sayfa görünürlüğü: gizliyken render'ı tamamen durdur (pil/ısı); dönüşte zamanlayıcıları sıfırla ve yeniden çiz
  const onVisibility = () => {
    hidden = document.hidden === true;
    if (hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      stats.mode = 'idle';
    } else if (running && !rafId) {
      lastLoopT = 0;
      lastAnimT = 0;
      lastTraceT = 0;
      prevTickActive = false;
      ctl.skip = 4;
      dirtyPost = true; // tarayıcı çizim tamponunu atmış olabilir
      rafId = requestAnimationFrame(loop);
    }
  };
  const onPageShow = (e) => { if (e.persisted) { dirtyPost = true; } };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    globalThis.addEventListener?.('pageshow', onPageShow);
  }

  // --- yeniden boyutlandırma: boşta rAF durduğundan CSS boyutu / pencere değişimini ayrıca izle
  let resizeObserver = null;
  try {
    resizeObserver = new ResizeObserver(() => wake());
    resizeObserver.observe(canvas);
  } catch { /* ResizeObserver yok: pencere olayları yeter */ }
  globalThis.addEventListener?.('resize', wake);
  globalThis.addEventListener?.('orientationchange', wake);

  // --- pil durumu (Battery Status API; Safari'de yok ⇒ yok sayılır): şarjsız ve < %25 ⇒ animasyon ≤ 20 kare/sn
  let batteryCleanup = null;
  try {
    const gb = globalThis.navigator?.getBattery?.bind(globalThis.navigator);
    if (gb) {
      gb().then((b) => {
        const upd = () => { device.lowPower = !b.charging && b.level < 0.25; };
        upd();
        b.addEventListener('levelchange', upd);
        b.addEventListener('chargingchange', upd);
        batteryCleanup = () => { b.removeEventListener('levelchange', upd); b.removeEventListener('chargingchange', upd); };
      }).catch(() => {});
    }
  } catch { /* yok say */ }

  // --- genel API
  function setParams(p = {}) {
    const prev = params;
    params = normalizeParams(p, params);
    let trace = false;
    let shade = false;
    let interactive = false;
    let postOnly = false;
    const defer = deferredActive();
    for (const k of Object.keys(params)) {
      if (prev[k] === params[k]) continue;
      if (POST_ONLY_KEYS.includes(k)) postOnly = true;
      else if (CLOCK_KEYS.includes(k) || LOOP_ONLY_KEYS.includes(k)) continue; // yeni çizim gerekmez (saat hızı / döngü ayarı)
      else if (SHADE_ONLY_KEYS.includes(k) && defer) shade = true; // geodezik önbellekten; düşük çözünürlük gerekmez
      else {
        trace = true; // birleşik hatta gölgelendirme parametreleri de tam iz sürme ister (eski davranış)
        if (!NON_INTERACTIVE_KEYS.includes(k)) interactive = true;
      }
    }
    if (trace) dirtyTrace = true;
    else if (shade) dirtyShade = true;
    if (job && (trace || shade)) dirtyTrace = true; // süren şeritli iş eski parametrelerle başladı: yeniden başlat
    if (postOnly) dirtyPost = true;
    if (interactive) interactUntil = performance.now() + effectivePerformance(params, device).settleMs;
    wake();
    return { ...params };
  }
  const detachControls =
    opts.controls === false ? null : attachOrbitControls(canvas, { getParams: () => ({ ...params }), setParams });

  /**
   * MRT debug: float render hedefine (3 × RGBA32F) çizer ve CPU'ya okur. kind: 'debug' (4a düzeni) | 'photo' (PHOTO_FIELDS).
   * jitter yok, biriktirme yok, tuvale dokunmaz.
   */
  async function renderMRT(kind, width, height, { axisGuard = params.axisGuard } = {}) {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (!caps.f32rt) {
      throw new Error('EXT_color_buffer_float desteklenmiyor: debug modu çalışamaz');
    }
    abandonJob(); // süren şeritli iş uniform'ları kullanırdı
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
    mesh.material = mat(kind);
    axisKappaOverride = axisGuard ? AXIS_KAPPA : 0;
    stats.uniforms = writeUniforms(width, height, height);
    axisKappaOverride = null;
    U.uJitter.value.set(0, 0);
    U.uAccumW.value = 1;
    U.uTurbDeferred.value = 0;
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, width, height);
    renderer.render(scene, orthoCam);
    renderer.setRenderTarget(null);

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
    wake();
    return out;
  }
  /**
   * opts.axisGuard: varsayılan = params.axisGuard (görsel modla AYNI eksen adım koruması, üretim yolu). Açık {axisGuard:false} = 4a'nın
   * korumasız birebir portu (yalnız port sınaması için). Gerçekten yüklenen κ_a: getStats().uniforms.axisKappa. Adım kuralı (stepRule) görsel modla aynıdır.
   */
  const renderDebug = (w, h, o) => renderMRT('debug', w, h, o);
  const renderDebugPhoto = (w, h, o) => renderMRT('photo', w, h, o);

  /** Eşzamanlı iş: tüm şeritler art arda (her şerit sonrası flush). */
  function runJobSync(scale, accumulate, perf) {
    abandonJob();
    const [cw, ch] = updateSize();
    const tw = Math.max(1, Math.round(cw * scale));
    const th = Math.max(1, Math.round(ch * scale));
    const j = beginJob(scale, accumulate, bandsFor(tw * th, perf), perf);
    while (!stepJob(j));
  }
  function syncScale(perf) {
    const [cw, ch] = updateSize();
    return settledScale(perf, cw, ch);
  }

  /**
   * Bir görsel kareyi hemen (eşzamanlı) çizer: durağan çözünürlük (`resolutionScale` ∧ piksel bütçesi), `frames` jitter'lı kare biriktirilir.
   * Anlık görüntü ve testler için; etkileşim/animasyon denetleyicisini devreden çıkarır. Türbülans bu karede gölgelendirmeye işlenir (animasyon geçişi yok).
   */
  function renderOnce({ frames = 1 } = {}) {
    const perf = effectivePerformance(params, device);
    const scale = syncScale(perf);
    runJobSync(scale, false, perf);
    for (let i = 1; i < frames; i++) runJobSync(scale, true, perf);
    postFrame(perf);
    dirtyTrace = false;
    flushSceneFrame(performance.now());
  }

  /**
   * Eşzamanlı ölçüm. mode: 'full' (varsayılan; iz sürme + gölgelendirme [+ bloom + kompozit], kare başına tam iş),
   * 'anim' (yalnız animasyon geçişi [+ bloom + kompozit]; geodezik önbellekten — animasyon karesi maliyeti), 'shade' (yalnız gölgelendirme).
   * 1 piksellik okuma GPU bitişini BEKLER.
   */
  function benchmark({ frames = 3, warmup = 1, post: withPost = true, mode = 'full' } = {}) {
    const perf = effectivePerformance(params, device);
    const scale = syncScale(perf);
    const px = new Uint8Array(4);
    const px16 = hdrFloat ? new Uint16Array(4) : new Uint8Array(4);
    const sync = () => {
      if (withPost) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      else renderer.readRenderTargetPixels(cur.hValid && cur.e.H ? cur.e.H : cur.e.rts[cur.idx], 0, 0, 1, 1, px16);
    };
    let one;
    if (mode === 'full') one = () => { runJobSync(scale, false, perf); if (withPost) postFrame(perf); sync(); };
    else {
      if (!deferredActive()) throw new Error(`benchmark mode '${mode}': ertelenmiş hat etkin değil`);
      runJobSync(scale, false, perf);
      if (mode === 'shade') one = () => { shadeOnly(); if (withPost) postFrame(perf); sync(); };
      else one = () => { if (cur.kind !== 'deferred') shadeOnly('deferred'); animPass(); if (withPost) postFrame(perf); sync(); };
    }
    for (let i = 0; i < warmup; i++) one();
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) one();
    const dt = performance.now() - t0;
    dirtyTrace = true;
    return { msPerFrame: dt / frames, width: stats.traceWidth, height: stats.traceHeight, canvasWidth: stats.width, canvasHeight: stats.height, frames, mode };
  }
  function start() {
    if (running) return;
    running = true;
    dirtyTrace = true;
    lastLoopT = 0;
    lastTraceT = 0;
    lastAnimT = 0;
    prevTickActive = false;
    if (!hidden) rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    stats.mode = 'idle';
  }
  function dispose() {
    stop();
    detachControls?.();
    batteryCleanup?.();
    resizeObserver?.disconnect();
    globalThis.removeEventListener?.('resize', wake);
    globalThis.removeEventListener?.('orientationchange', wake);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
      globalThis.removeEventListener?.('pageshow', onPageShow);
    }
    abandonJob();
    for (const t of Object.values(mrtTargets)) t?.dispose();
    for (const e of cache.values()) disposeEntry(e);
    cache.clear();
    for (const m of Object.values(materials)) m?.dispose();
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
    getStats: () => {
      const t = performance.now();
      return {
        ...stats,
        // gecikmeli güncellenen alanlar: döngü durduğunda bile tutarlı olsun
        fps: lastSceneT > 0 && t - lastSceneT < 1000 && stats.frameMs > 0 ? 1000 / stats.frameMs : 0,
        traceScale: stats.scale,
        hdr: hdrFloat ? 'half-float' : '8-bit (yedek)',
        deferred: deferredActive(),
        device: { mobile: device.mobile, ios: device.ios, lowPower: device.lowPower, safeLevel: device.safeLevel },
        caps: { ...caps },
        paused: hidden,
        contextLost,
        cacheEntries: cache.size,
        gl: { textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length ?? 0 },
      };
    },
    getContext: () => gl,
    isRunning: () => running,
  };
}
