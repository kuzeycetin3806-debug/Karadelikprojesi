// ============================================================================
// integrator.glsl — klasik RK4, sabit formüllü adım (hata kestirimi yok)
// CPU: integrators.js rk4StepF32. h = κ·h_nat çağıran tarafta hesaplanır.
// k1 = rhs(y) çağıranda hazırdır (önceki adımın sonunda hesaplanan rhs(yn)).
// FİZİKSEL (sayısal yöntem).
// ============================================================================

State stateAxpy(State y, float h, State k) {
  State o;
  o.r   = y.r   + h * k.r;
  o.th  = y.th  + h * k.th;
  o.ph  = y.ph  + h * k.ph;
  o.pr  = y.pr  + h * k.pr;
  o.pth = y.pth + h * k.pth;
  o.t   = y.t   + h * k.t;
  return o;
}

// y_{n+1} = y + h/6 · ((k1 + 2(k2 + k3)) + k4)   (toplama sırası CPU ile aynı)
State rk4Step(State y, State k1, float h) {
  vec2 sc;
  float h2 = 0.5 * h;
  State k2 = rhs(stateAxpy(y, h2, k1), sc);
  State k3 = rhs(stateAxpy(y, h2, k2), sc);
  State k4 = rhs(stateAxpy(y, h, k3), sc);
  float h6 = h / 6.0;
  State o;
  o.r   = y.r   + h6 * ((k1.r   + 2.0 * (k2.r   + k3.r))   + k4.r);
  o.th  = y.th  + h6 * ((k1.th  + 2.0 * (k2.th  + k3.th))  + k4.th);
  o.ph  = y.ph  + h6 * ((k1.ph  + 2.0 * (k2.ph  + k3.ph))  + k4.ph);
  o.pr  = y.pr  + h6 * ((k1.pr  + 2.0 * (k2.pr  + k3.pr))  + k4.pr);
  o.pth = y.pth + h6 * ((k1.pth + 2.0 * (k2.pth + k3.pth)) + k4.pth);
  o.t   = y.t   + h6 * ((k1.t   + 2.0 * (k2.t   + k3.t))   + k4.t);
  return o;
}
