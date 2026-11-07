/**
 * Doğrulama betikleri için ortak denetim: GPU ve CPU E32'nin eksen koruması κ_a değeri AYNI olmalı.
 * (Denetim 1b7c0de/Ö2: debug yolu varsayılan korumasız kalmış, CPU korumalıydı ve hiçbir betik bunu yakalamamıştı.)
 *
 *   GPU : renderer.getStats().uniforms.axisKappa  — son renderDebug/renderDebugPhoto'da shader'a GERÇEKTEN yüklenen değer
 *   CPU : src/math/raytracer.js DEFAULT_OPTIONS.kappaAxis (E32'ye seçenek geçilmediğinde kullanılan)
 *   Sözleşme: src/render/params.js AXIS_KAPPA (f32'ye yuvarlanmış hali GPU'da görülür)
 */
import { DEFAULT_OPTIONS } from '../../src/math/raytracer.js';
import { AXIS_KAPPA } from '../../src/render/params.js';

/** @returns {string[]} hata iletileri (boş = tamam) */
export function checkAxisKappa({ gpuOn, gpuOff, gpuParamsAxisGuard }) {
  const errs = [];
  const f32 = Math.fround;
  if (DEFAULT_OPTIONS.axisGuard !== true) errs.push(`CPU DEFAULT_OPTIONS.axisGuard = ${DEFAULT_OPTIONS.axisGuard} (true bekleniyordu)`);
  if (DEFAULT_OPTIONS.kappaAxis !== AXIS_KAPPA) errs.push(`CPU kappaAxis ${DEFAULT_OPTIONS.kappaAxis} ≠ GPU AXIS_KAPPA ${AXIS_KAPPA}`);
  if (gpuParamsAxisGuard !== true) errs.push(`GPU params.axisGuard varsayılanı ${gpuParamsAxisGuard} (true bekleniyordu)`);
  if (gpuOn !== undefined && f32(gpuOn) !== f32(DEFAULT_OPTIONS.kappaAxis)) errs.push(`GPU varsayılan yolda yüklenen κ_a ${gpuOn} ≠ CPU ${DEFAULT_OPTIONS.kappaAxis}`);
  if (gpuOff !== undefined && gpuOff !== 0) errs.push(`GPU {axisGuard:false} yolunda κ_a ${gpuOff} (0 bekleniyordu)`);
  return errs;
}
export const AXIS_KAPPA_CPU = DEFAULT_OPTIONS.kappaAxis;
