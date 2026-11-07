// ============================================================================
// common.glsl — sabitler, uniform'lar, ortak tipler
// Kerr null geodezikleri, Boyer–Lindquist, M = 1, G = c = 1, E ≡ 1.
// CPU karşılığı: src/math/{geodesic,integrators,camera,raytracer}.js (f32 RK4 öykünmesi)
// FİZİKSEL: bu dosyadaki her şey fiziksel/sayısal çekirdektir (ESTETİK öğe yok).
// ============================================================================

#define MAX_HITS 4          // bir ışında saklanan en fazla disk vuruşu (maxDiskHits ≤ MAX_HITS)

const float PI = 3.14159265358979;
const float TWO_PI = 6.28318530717959;

const float DIR = -1.0;               // ışın GERİYE izlenir (geodesic.js dir = −1)
const float AXIS_EPS = 1e-7;          // |L| < AXIS_EPS ⇒ L = 0 (raytracer.js axisEps)
const float CAPTURE_MARGIN = 1e-3;    // r < r₊ + 1e-3 ⇒ yakalandı (captureMargin)
const float PLANE_EPS = 1e-6;         // |cosθ_cam| < 1e-6 ⇒ kamera disk düzleminde (planeEps, f32)
const int   HERMITE_ITERS = 24;       // CPU: 60 (f64). f32'de 2⁻²⁴'ten ince ikiye bölme anlamsız.

// --- çıktı çözünürlüğü / ekran
uniform vec2  uResolution;   // hedef boyutu (piksel)
uniform vec2  uTanHalf;      // (tan(fovX/2), tan(fovY/2)) — teğet düzlem yarı genişlikleri

// --- kamera (BL konumu + ZAMO tetrad sabitleri; CPU'da f64 hesaplanır, camera.js zamoFrame)
uniform vec3  uCam;          // (r_cam, θ_cam, φ_cam)
uniform vec4  uTetrad;       // (laps N, ω, √g_φφ, √Σ)

// --- metrik sabitleri (CPU'da f64 hesaplanıp f32'ye yuvarlanır)
uniform float uA;            // a
uniform float uA2;           // a²
uniform float uRp;           // r₊
uniform float uRm;           // r₋ = a²/r₊  (Δ = (r−r₊)(r−r₋), çarpan biçimi)

// --- izleyici ayarları
uniform float uKappa;        // h = κ·h_nat
uniform int   uMaxSteps;     // adım bütçesi N
uniform float uREscape;      // kaçış yarıçapı
uniform int   uAnalyticFate; // 1: bütçesi biten ışın analitik sınıflanır (§4.4); 0: "bütçe bitti → yakalandı"

// --- disk
uniform int   uDiskOn;       // 1: disk var
uniform int   uPlaneGuard;   // 1: |cosθ_cam|<1e-6 bant koruması açık (YALNIZ test için 0 yapılır: negatif kontrol)
uniform int   uMaxDiskHits;  // 1 = opak disk; ≤ MAX_HITS
uniform float uRIn;          // iç yarıçap (M)
uniform float uROut;         // dış yarıçap (M)
uniform float uSpinSign;     // +1 prograd, −1 retrograd disk

// --- integratör durumu: y = (r, θ, φ, p_r, p_θ); Hamilton biçimi, Mino zamanı
struct State {
  float r;
  float th;
  float ph;
  float pr;
  float pth;
};

// --- ışın başına sabitler (setupCameraRay doldurur)
float g_L;      // L = p_φ/E (|L| < 1e-7 ise 0)
float g_L2;     // L²
float g_aL;     // a·L
bool  g_hasL;   // L ≠ 0
float g_Q;      // Carter sabiti (kameradan, ham L ile)

// --- izleme sonucu
struct TraceResult {
  int   status;           // 0 yakalandı, 1 kaçtı, 2 disk (maxDiskHits doldu)
  int   reason;           // 0 normal sonlanma, 1 bütçe bitti (fate ile sınıflandı), 2 NaN
  int   steps;            // kabul edilen RK4 adımı
  int   hitCount;         // disk bölgesindeki ekvator kesişimi sayısı
  int   planeCrossings;   // tüm ekvator kesişimleri
  float hitR[MAX_HITS];   // kesişim yarıçapı (Hermite)
  float hitG[MAX_HITS];   // g_cam = g · ν_cam/ν_∞   (FİZİKSEL)
  float hitPhi[MAX_HITS]; // φ ∈ [0, 2π)
  int   hitN[MAX_HITS];   // kaçıncı ekvator geçişi (1 = birincil görüntü)
  float thInf;            // kaçış yönü θ_∞ ∈ [0, π]; bilinmiyorsa −1
  float phInf;            // kaçış yönü φ_∞ ∈ [0, 2π); bilinmiyorsa −1
};
