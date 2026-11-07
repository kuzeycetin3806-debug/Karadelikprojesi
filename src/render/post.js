/**
 * Sonradan işleme zinciri (Adım 4b) — HDR doğrusal radyans → ekran. TAMAMEN ESTETİK/gösterim aşamasıdır:
 *   - pozlama (doğrusal çarpan), bloom (çok seviyeli, ucuz), ton eşleme (ACES/AgX/Neutral), sRGB kodlama, dither.
 * Fiziksel radyans (iz sürme geçişinin çıktısı) bu aşamada DEĞİŞTİRİLMEZ; bloom ve ton eşleme kapatılabilir.
 *
 * Bloom: Jimenez (CoD:AW) ilerlemeli aşağı örnekleme (13-tap, ilk seviyede Karis ortalaması) + çadır filtreli yukarı örnekleme.
 * Seviye sayısı BLOOM_LEVELS (varsayılan 5) ⇒ iz sürme çözünürlüğünün 1/2 … 1/32'si. Maliyet: tam çözünürlüklü tek okuma + küçük zincir.
 */
import {
  WebGLRenderTarget, RawShaderMaterial, GLSL3, HalfFloatType, UnsignedByteType, RGBAFormat, LinearFilter, ClampToEdgeWrapping,
  NoBlending, Vector2, Mesh, Scene, OrthographicCamera, BufferGeometry, BufferAttribute,
} from 'three';
import { vertexShader, postShaders } from '../shaders/index.js';

export const BLOOM_LEVELS = 5;
export const TONEMAP_INDEX = Object.freeze({ none: 0, aces: 1, agx: 2, neutral: 3 });

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {{ hdrType?: number }} [opts]  HDR hedeflerinin türü (varsayılan HalfFloatType)
 */
export function createPostChain(renderer, opts = {}) {
  const type = opts.hdrType ?? HalfFloatType;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new Mesh(geometry);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const mk = (fragmentShader, uniforms) =>
    new RawShaderMaterial({
      glslVersion: GLSL3, vertexShader, fragmentShader, uniforms,
      depthTest: false, depthWrite: false, blending: NoBlending,
    });

  const uDown = {
    uSrc: { value: null }, uSrcTexel: { value: new Vector2() }, uDstInv: { value: new Vector2() },
    uExposure: { value: 1 }, uFirst: { value: 0 },
  };
  const uUp = {
    uLow: { value: null }, uHigh: { value: null }, uLowTexel: { value: new Vector2() }, uDstInv: { value: new Vector2() },
    uRadius: { value: 0.7 },
  };
  const uComp = {
    uHdr: { value: null }, uBloom: { value: null }, uInvSize: { value: new Vector2() }, uExposure: { value: 1 },
    uBloomMix: { value: 0 }, uTonemap: { value: 1 }, toneMappingExposure: { value: 1 },
  };
  const downMat = mk(postShaders.bloomDown, uDown);
  const upMat = mk(postShaders.bloomUp, uUp);
  const compMat = mk(postShaders.composite, uComp);

  const makeRT = (w, h) =>
    new WebGLRenderTarget(w, h, {
      type, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false,
    });

  let down = [];
  let up = [];
  let srcW = 0;
  let srcH = 0;
  // boyuta göre LRU önbellek (etkileşim/dinamik ölçek geçişlerinde zincir yeniden ayrılmaz)
  const cache = new Map(); // "WxH" → {down, up}
  const CACHE_MAX = 4;

  function ensure(w, h) {
    if (w === srcW && h === srcH && down.length) return;
    const key = `${w}x${h}`;
    let e = cache.get(key);
    if (e) cache.delete(key);
    else {
      e = { down: [], up: [] };
      for (let i = 0; i < BLOOM_LEVELS; i++) {
        const lw = Math.max(2, Math.ceil(w / 2 ** (i + 1)));
        const lh = Math.max(2, Math.ceil(h / 2 ** (i + 1)));
        e.down.push(makeRT(lw, lh));
        if (i < BLOOM_LEVELS - 1) e.up.push(makeRT(lw, lh));
      }
    }
    cache.set(key, e);
    while (cache.size > CACHE_MAX) {
      const [k0, e0] = cache.entries().next().value;
      cache.delete(k0);
      for (const t of [...e0.down, ...e0.up]) t.dispose();
    }
    down = e.down;
    up = e.up;
    srcW = w;
    srcH = h;
  }

  function pass(material, target, w, h) {
    mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, w, h);
    renderer.render(scene, cam);
  }

  /** Bloom görüntüsünü (U0, iz sürme çözünürlüğünün yarısı) üretir. `exposure` ilk seviyede uygulanır. */
  function bloom(srcTexture, w, h, exposure, radius) {
    ensure(w, h);
    let prevTex = srcTexture;
    let pw = w;
    let ph = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const dst = down[i];
      uDown.uSrc.value = prevTex;
      uDown.uSrcTexel.value.set(1 / pw, 1 / ph);
      uDown.uDstInv.value.set(1 / dst.width, 1 / dst.height);
      uDown.uExposure.value = exposure;
      uDown.uFirst.value = i === 0 ? 1 : 0;
      pass(downMat, dst, dst.width, dst.height);
      prevTex = dst.texture;
      pw = dst.width;
      ph = dst.height;
    }
    let low = down[BLOOM_LEVELS - 1];
    uUp.uRadius.value = radius;
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
      const dst = up[i];
      uUp.uLow.value = low.texture;
      uUp.uHigh.value = down[i].texture;
      uUp.uLowTexel.value.set(1 / low.width, 1 / low.height);
      uUp.uDstInv.value.set(1 / dst.width, 1 / dst.height);
      pass(upMat, dst, dst.width, dst.height);
      low = dst;
    }
    return low.texture;
  }

  /** Σ_{i<L} radius^i : bloom toplamının normalizasyonu (bloomStrength = sahne enerjisinin yeniden dağıtılan kesri). */
  function bloomNorm(radius) {
    let s = 0;
    for (let i = 0; i < BLOOM_LEVELS; i++) s += radius ** i;
    return s;
  }

  /** HDR (+bloom) → tuval. outW×outH: tuvalin çizim tamponu boyutu. */
  function composite(hdrTexture, bloomTexture, outW, outH, { exposure, bloomMix, tonemap }) {
    uComp.uHdr.value = hdrTexture;
    uComp.uBloom.value = bloomTexture ?? hdrTexture;
    uComp.uInvSize.value.set(1 / outW, 1 / outH);
    uComp.uExposure.value = exposure;
    uComp.uBloomMix.value = bloomTexture ? bloomMix : 0;
    uComp.uTonemap.value = TONEMAP_INDEX[tonemap] ?? 1;
    pass(compMat, null, outW, outH);
  }

  function dispose() {
    for (const e of cache.values()) for (const t of [...e.down, ...e.up]) t.dispose();
    downMat.dispose();
    upMat.dispose();
    compMat.dispose();
    geometry.dispose();
  }

  return { bloom, bloomNorm, composite, makeRT, dispose, hdrType: type, isByte: type === UnsignedByteType };
}
