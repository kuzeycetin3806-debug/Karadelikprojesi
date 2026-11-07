// Tam ekran üçgeni (3 köşe, ekranı kapsar). Matris yok: konum doğrudan klip uzayında.
// RawShaderMaterial + glslVersion GLSL3 ile kullanılır (three '#version 300 es' ekler).
precision highp float;
in vec3 position;

void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
