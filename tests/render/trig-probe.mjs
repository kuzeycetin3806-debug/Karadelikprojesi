/**
 * Cihaz sin/cos/bölme/sqrt doğruluk sondası (GLSL ES 3.00 yerleşikleri; src/shaders/trig.glsl'nin gerekçesi).
 * `node --test` ile çalışmaz.   node tests/render/trig-probe.mjs
 * Mutlak hata = |GPU sin(x) − Math.sin(x)| (x f32); bölme/sqrt göreli hata.
 * SwiftShader'da sin/cos maks ≈ 1.9e-4 ölçüldü (GLSL ES 3.00 şartnamesi [−π,π]'de 2⁻¹¹ ≈ 4.9e-4'e izin verir).
 */
import { startHarness } from './harness.mjs';

const h = await startHarness({ width: 64, height: 48 });
const out = await h.page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 4096; c.height = 1;
  const gl = c.getContext('webgl2');
  gl.getExtension('EXT_color_buffer_float');
  const vs = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p,0,1); }`;
  const fs = `#version 300 es
precision highp float;
uniform float uLo; uniform float uHi;
out vec4 o;
void main(){
  float x = mix(uLo, uHi, (gl_FragCoord.x - 0.5) / 4095.0);
  o = vec4(sin(x), cos(x), 1.0 / x, sqrt(abs(x)));
}`;
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
  gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4096, 1, 0, gl.RGBA, gl.FLOAT, null);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, 4096, 1);
  const res = {};
  for (const [name, lo, hi] of [['0.01..3.14', 0.01, 3.14], ['0.5..2.64 (theta)', 0.5, 2.64], ['0.01..40 (phi)', 0.01, 40], ['1..300 (r)', 1, 300]]) {
    gl.uniform1f(gl.getUniformLocation(pr, 'uLo'), lo); gl.uniform1f(gl.getUniformLocation(pr, 'uHi'), hi);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Float32Array(4096 * 4); gl.readPixels(0, 0, 4096, 1, gl.RGBA, gl.FLOAT, px);
    let es = 0, ec = 0, ed = 0, eq = 0, esMax = 0, ecMax = 0;
    for (let i = 0; i < 4096; i++) {
      const x = Math.fround(lo + (hi - lo) * (i / 4095));
      const ds = Math.abs(px[i * 4] - Math.sin(x)), dc = Math.abs(px[i * 4 + 1] - Math.cos(x));
      esMax = Math.max(esMax, ds); ecMax = Math.max(ecMax, dc);
      es += ds; ec += dc;
      ed = Math.max(ed, Math.abs(px[i * 4 + 2] * x - 1));
      eq = Math.max(eq, Math.abs(px[i * 4 + 3] / Math.sqrt(Math.abs(x)) - 1));
    }
    res[name] = { sinMean: es / 4096, sinMax: esMax, cosMean: ec / 4096, cosMax: ecMax, divRelMax: ed, sqrtRelMax: eq };
  }
  return res;
});
const e = (x) => x.toExponential(2).padStart(9);
console.log('aralık'.padEnd(20) + ' sin ort  sin maks  cos ort  cos maks  böl.göreli  sqrt göreli');
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(20) + [v.sinMean, v.sinMax, v.cosMean, v.cosMax, v.divRelMax, v.sqrtRelMax].map(e).join(' '));
await h.close();
