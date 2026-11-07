// GLSL ES 3.00 parçalarını birleştirir (Vite `?raw` içe aktarması).
// Three.js RawShaderMaterial + glslVersion GLSL3 kullanılırken '#version 300 es' satırını three ekler;
// burada yalnız precision ve (isteğe bağlı) MODE_DEBUG tanımı eklenir.
import vertexShader from './fullscreen.vert.glsl?raw';
import common from './common.glsl?raw';
import trig from './trig.glsl?raw';
import geodesic from './geodesic.glsl?raw';
import integrator from './integrator.glsl?raw';
import camera from './camera.glsl?raw';
import crossing from './crossing.glsl?raw';
import escape from './escape.glsl?raw';
import trace from './trace.glsl?raw';
import shading from './shading.glsl?raw';
import main from './main.frag.glsl?raw';

export { vertexShader };

/** Birleştirme sırası bağımlılık sırasıdır (GLSL'de ileri bildirim yok). */
export const fragmentChunks = Object.freeze({
  common, trig, geodesic, integrator, camera, crossing, escape, trace, shading, main,
});

/**
 * @param {{debug?: boolean, nativeTrig?: boolean}} opts
 *   debug=true: 3 × RGBA32F çıktı (MODE_DEBUG); false: ekran rengi.
 *   nativeTrig=true: cihazın sin/cos'u (hızlı ama doğruluğu cihaza bağlı); false (varsayılan): trig.glsl sinCos.
 */
export function buildFragmentShader({ debug = false, nativeTrig = false } = {}) {
  const head =
    'precision highp float;\nprecision highp int;\n' +
    (debug ? '#define MODE_DEBUG\n' : '') +
    (nativeTrig ? '#define NATIVE_TRIG\n' : '');
  return head + Object.values(fragmentChunks).join('\n');
}
