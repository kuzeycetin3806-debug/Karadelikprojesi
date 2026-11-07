// ============================================================================
// trace.glsl — ana izleme döngüsü (CPU: raytracer.js traceRay, integrator 'rk4', precision 'f32')
//
// Her kabul edilen adımdan sonra sıra (CPU ile aynı):
//   1) cosθ işaret değiştirdi ⇒ ekvator kesişimi (disk içindeyse vuruş kaydı)
//   2) hits ≥ maxDiskHits (ve disk açık)  ⇒ status 2 (disk)
//   3) r < r₊ + 1e-3                      ⇒ status 0 (yakalandı)
//   4) r > r_esc ve p_r < 0               ⇒ status 1 (kaçtı) + (θ_∞, φ_∞)
// Bütçe N biterse: uAnalyticFate=1 ⇒ içe giden ve (r₊, r)'de R kökü yoksa yakalandı, aksi halde kaçtı
// (kaçış yönü BİLİNMEZ: thInf = phInf = −1); uAnalyticFate=0 ⇒ "yakalandı" (sayısal yaklaşım).
// NaN ⇒ yakalandı sayılır (reason = 2).
//
// Sahte kesişim koruması (kamera disk düzleminde, |cosθ_cam| < 1e-6): ilk adımda kameradan çıkış ve iki ucu da
// ε-bandında kalan adımlar kesişim sayılmaz (raytracer.js `spurious`).
// FİZİKSEL.
// ============================================================================

TraceResult traceRay(State y0, float nuCam) {
  TraceResult T;
  T.status = -1;
  T.reason = 0;
  T.steps = 0;
  T.hitCount = 0;
  T.planeCrossings = 0;
  for (int k = 0; k < MAX_HITS; k++) {
    T.hitR[k] = -1.0;
    T.hitG[k] = 0.0;
    T.hitPhi[k] = -1.0;
    T.hitN[k] = 0;
  }
  T.thInf = -1.0;
  T.phInf = -1.0;

  bool diskOn = (uDiskOn != 0) && (uROut > uRIn);
  float rCapture = uRp + CAPTURE_MARGIN;

  State y = y0;
  vec2 sc;                      // (sinθ, cosθ) geçerli durumda
  State F = rhs(y, sc);
  bool camInPlane = (uPlaneGuard != 0) && abs(sc.y) < PLANE_EPS;

  for (int i = 0; i < uMaxSteps; i++) {
    State yA = y;
    State kA = F;

    float hh = uKappa * naturalStep(y, F, sc.x);
    State yn = rk4Step(y, F, hh);
    T.steps++;

    if (isnan(yn.r) || isnan(yn.th)) {
      T.status = 0;
      T.reason = 2;
      break;
    }

    vec2 scn;
    State Fn = rhs(yn, scn);

    // --- 1) ekvator kesişimi
    float cA = sc.y;              // cosθ adım başında
    float cB = scn.y;             // cosθ adım sonunda
    if (cA * cB < 0.0) {
      bool spurious = camInPlane &&
        ((T.steps == 1 && abs(cA) < PLANE_EPS) || (abs(cA) < PLANE_EPS && abs(cB) < PLANE_EPS));
      if (!spurious) {
        float rS, thS, phS;
        refineCrossing(yA, yn, kA, Fn, hh, rS, thS, phS);
        T.planeCrossings++;
        if (diskOn && rS >= uRIn && rS <= uROut && T.hitCount < MAX_HITS) {
          vec2 ang = canonicalAngles(thS, phS);
          float g = diskRedshiftInf(rS, g_L);
          int k = T.hitCount;
          T.hitR[k] = rS;
          T.hitG[k] = g * nuCam;        // g_cam = g · ν_cam/ν_∞
          T.hitPhi[k] = ang.y;
          T.hitN[k] = T.planeCrossings;
          T.hitCount++;
        }
      }
    }

    y = yn;
    F = Fn;
    sc = scn;

    // --- 2) disk (opak: maxDiskHits dolunca dur)
    if (diskOn && T.hitCount >= uMaxDiskHits) { T.status = 2; break; }
    // --- 3) yakalanma
    if (y.r < rCapture) { T.status = 0; break; }
    // --- 4) kaçış: fiziksel p_r < 0 (foton içe gelir) ⇒ geriye izlenen ışın dışa gidiyor (CPU: y[3] < 0)
    if (y.r > uREscape && y.pr < 0.0) {
      T.status = 1;
      escapeDirection(y, F, T.thInf, T.phInf);
      break;
    }
  }

  if (T.status < 0) {
    // Bütçe bitti → analitik sınıf (F = rhs(y); F.r < 0: izleme yönünde içe gidiyor)
    T.reason = 1;
    bool captured = true;
    if (uAnalyticFate != 0) {
      bool inward = F.r < 0.0;
      captured = inward && !hasTurningPointBelow(g_L, g_Q, y.r);
    }
    T.status = captured ? 0 : 1;
  }
  return T;
}
