// GLSL ES 3.00 parçalarını birleştirir (Vite `?raw` içe aktarması).
// Three.js RawShaderMaterial + glslVersion GLSL3 kullanılırken '#version 300 es' satırını three ekler;
// burada yalnız precision ve (isteğe bağlı) MODE_* tanımları eklenir.
import { ShaderChunk } from 'three';
import vertexShader from './fullscreen.vert.glsl?raw';
import common from './common.glsl?raw';
import trig from './trig.glsl?raw';
import geodesic from './geodesic.glsl?raw';
import integrator from './integrator.glsl?raw';
import camera from './camera.glsl?raw';
import crossing from './crossing.glsl?raw';
import escape from './escape.glsl?raw';
import trace from './trace.glsl?raw';
import noise from './noise.glsl?raw';
import photometry from './photometry.glsl?raw';
import turbulence from './turbulence.glsl?raw';
import stars from './stars.glsl?raw';
import shading from './shading.glsl?raw';
import main from './main.frag.glsl?raw';
import bloomDown from './bloom_down.frag.glsl?raw';
import bloomUp from './bloom_up.frag.glsl?raw';
import composite from './composite.frag.glsl?raw';

export { vertexShader };

/** Birleştirme sırası bağımlılık sırasıdır (GLSL'de ileri bildirim yok). */
export const fragmentChunks = Object.freeze({
  common, trig, geodesic, integrator, camera, crossing, escape, trace, noise, photometry, turbulence, stars, shading, main,
});

/** 4c — ertelenmiş gölgelendirme programlarının parça listeleri (yalnız gerekeni derler: iOS'ta kısa derleme süresi). */
const MODE_CHUNKS = Object.freeze({
  trace: { common, trig, geodesic, integrator, camera, crossing, escape, trace, main },
  shade: { common, trig, noise, photometry, turbulence, stars, shading, main },
  anim: { common, noise, turbulence, main },
});

const PRECISION = 'precision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';

/**
 * @param {{debug?: boolean, photo?: boolean, nativeTrig?: boolean, mode?: 'visual'|'trace'|'shade'|'anim'}} opts
 *   debug=true : 3 × RGBA32F çıktı (MODE_DEBUG; çekirdek doğrulaması, 4a düzeni).
 *   photo=true : 3 × RGBA32F çıktı (MODE_DEBUG_PHOTO; disk fotometrisi doğrulaması).
 *   ikisi de false: görsel mod. mode='visual' (varsayılan): birleşik (MODE_VISUAL; iz sürme + gölgelendirme tek geçiş; doğrusal HDR radyans, jitter, biriktirme).
 *     4c ertelenmiş hat: mode='trace' (yalnız geodezik → uG), 'shade' (uG → radyans), 'anim' (radyans × türbülans; main.frag.glsl).
 *   nativeTrig=true: cihazın sin/cos'u (hızlı ama doğruluğu cihaza bağlı); false (varsayılan): trig.glsl sinCos.
 */
export function buildFragmentShader({ debug = false, photo = false, nativeTrig = false, mode = 'visual' } = {}) {
  const m = debug || photo ? 'visual' : mode;
  const head =
    PRECISION +
    (debug ? '#define MODE_DEBUG\n' : '') +
    (photo ? '#define MODE_DEBUG_PHOTO\n' : '') +
    (!debug && !photo ? `#define MODE_${m === 'visual' ? 'VISUAL' : m.toUpperCase()}\n` : '') +
    (nativeTrig ? '#define NATIVE_TRIG\n' : '');
  const chunks = MODE_CHUNKS[m] && !debug && !photo ? MODE_CHUNKS[m] : fragmentChunks;
  return head + Object.values(chunks).join('\n');
}

/** Sonradan işleme gölgelendiricileri (ESTETİK; bloom + kompozit). */
export const postShaders = Object.freeze({
  bloomDown: PRECISION + bloomDown,
  bloomUp: PRECISION + bloomUp,
  // three'nin ton eşleme fonksiyonları (ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping); toneMappingExposure = 1 verilir
  composite: PRECISION + ShaderChunk.tonemapping_pars_fragment + composite,
});
