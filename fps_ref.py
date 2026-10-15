"""Independent reference simulator: 1D slider on a convex dish y=f(x), Coulomb friction, base excitation.
EOM while sliding (verified symbolically in verify_eom.py), sigma = direction of sliding:
 (1+f'^2) xdd + f' f'' xd^2 + g f' + mu_k*sigma*(g + f'' xd^2 - f' ag) = -ag
Two friction models (friction=...), batched over B candidate dishes, RK4, dt=0.002 s:
 "stickslip" (default)  static mu_s / kinetic mu_k. A slider at rest stays locked (xdd = 0, a_abs = ag) while the
                        friction it needs, |lambda| (CLAUDE.md §3.5.7), is <= mu_s; it slides with mu_k otherwise.
                        Stops (xd = 0) and breakaways are located inside the time step. v_eps is not used.
 "tanh"                 the original regularised model: sgn(v) -> tanh(v/v_eps), one mu (needs mu_s == mu_k).
"""
import numpy as np
G = 9.80665
MAX_PHASES = 8          # stick/slip switches resolved inside one time step; more are cut off and counted
N_ROOT = 32             # samples of the Hermite cubic used to locate a stop inside a step

def sphere(R):
    R = np.asarray(R, float)
    fp  = lambda x: x/np.sqrt(R**2 - x**2)
    fpp = lambda x: R**2/(R**2 - x**2)**1.5
    return fp, fpp

def friction_pair(mu=None, mu_s=None, mu_k=None):
    """(mu_s, mu_k): mu sets both, mu_s / mu_k override it. Static friction cannot be below kinetic."""
    mu_s = mu if mu_s is None else mu_s
    mu_k = mu if mu_k is None else mu_k
    if mu_s is None or mu_k is None:
        raise ValueError("give mu, or both mu_s and mu_k")
    if mu_k < 0 or mu_s < mu_k:
        raise ValueError("need 0 <= mu_k <= mu_s (got mu_s=%g, mu_k=%g)" % (mu_s, mu_k))
    return float(mu_s), float(mu_k)

def stick_band(f1, mu_s):
    """Ground accelerations [m/s^2] between which a slider resting where the slope is f1 stays stuck.
    From |lambda| <= mu_s with lambda = -f' - ag(1+f'^2)/(g - f' ag). With f' = tan(theta), mu_s = tan(phi):
    lo = -g tan(phi + theta), hi = g tan(phi - theta). Leaving through hi slides towards -x, through lo towards +x."""
    return -G*(mu_s + f1)/(1 - mu_s*f1), G*(mu_s - f1)/(1 + mu_s*f1)

def simulate(fp, fpp, t_rec, a_rec_g, mu=None, dt=0.002, T=30.0, v_eps=1e-3, B=1, x0=0.0, v0=0.0, progress=None,
             mu_s=None, mu_k=None, friction="stickslip"):
    """a_rec_g: ground accel in g at times t_rec (linear interpolation). Returns dict of time series.
    Friction: mu sets mu_s = mu_k; mu_s / mu_k override it (see friction_pair).
    progress: optional callback progress(k, n), called every ~1 % of the steps; it does not affect the numerics.
    Returned series (rows = time steps): x [m], v = xd [m/s], a_abs = xdd + ag [m/s^2], ag [m/s^2] (ground),
    stuck (bool, all False for "tanh"); a_peak [m/s^2] = max |a_abs| per dish including the breakaway instants, which
    fall between samples (with mu_s > mu_k, a_abs jumps down at breakaway, so the sampled peak can miss it);
    n_cut = number of steps whose switches exceeded MAX_PHASES (stickslip)."""
    mu_s, mu_k = friction_pair(mu, mu_s, mu_k)
    n = int(round(T/dt))
    th = np.arange(2*n + 1)*(dt/2)
    ag = np.interp(th, t_rec, a_rec_g, right=0.0)*G          # ground accel [m/s^2] at half steps
    if friction == "tanh":
        if mu_s != mu_k:
            raise ValueError('friction="tanh" has a single mu; it needs mu_s == mu_k')
        return _simulate_tanh(fp, fpp, ag, mu_k, dt, n, v_eps, B, x0, v0, progress)
    if friction != "stickslip":
        raise ValueError('friction must be "stickslip" or "tanh"')
    return _simulate_stickslip(fp, fpp, ag, mu_s, mu_k, dt, n, B, x0, v0, progress)

def _simulate_tanh(fp, fpp, ag, mu, dt, n, v_eps, B, x0, v0, progress):
    x = np.full(B, x0, float); v = np.full(B, v0, float)
    X = np.empty((n+1, B)); V = np.empty((n+1, B)); A = np.empty((n+1, B)); X[0] = x; V[0] = v
    def acc(x, v, a):
        f1, f2 = fp(x), fpp(x)
        s = np.tanh(v/v_eps)
        return (-a - G*f1 - f1*f2*v*v - mu*s*(G + f2*v*v - f1*a))/(1 + f1*f1)
    A[0] = acc(x, v, ag[0]) + ag[0]
    every = max(1, n//100)
    for k in range(n):
        if progress is not None and k % every == 0: progress(k, n)
        a0, a1, a2 = ag[2*k], ag[2*k+1], ag[2*k+2]
        k1x, k1v = v, acc(x, v, a0)
        k2x, k2v = v + 0.5*dt*k1v, acc(x + 0.5*dt*k1x, v + 0.5*dt*k1v, a1)
        k3x, k3v = v + 0.5*dt*k2v, acc(x + 0.5*dt*k2x, v + 0.5*dt*k2v, a1)
        k4x, k4v = v + dt*k3v,     acc(x + dt*k3x,     v + dt*k3v,     a2)
        x = x + dt/6*(k1x + 2*k2x + 2*k3x + k4x)
        v = v + dt/6*(k1v + 2*k2v + 2*k3v + k4v)
        X[k+1] = x; V[k+1] = v; A[k+1] = acc(x, v, ag[2*k+2]) + ag[2*k+2]   # absolute (transmitted) accel
    if progress is not None: progress(n, n)
    return dict(t=np.arange(n+1)*dt, x=X, v=V, a_abs=A, ag=ag[0::2], stuck=np.zeros((n+1, B), bool),
                a_peak=np.abs(A).max(0), n_cut=0)

def _simulate_stickslip(fp, fpp, ag, mu_s, mu_k, dt, n, B, x0, v0, progress):
    """Event-located stick-slip. Every element is either stuck (v = 0, x fixed) or sliding in direction s = +-1
    with s*v >= 0. One time step is covered in phases; each element keeps its own progress tau in [0, dt]:
      stuck:   find the first time the ground acceleration leaves stick_band (exact: the band is fixed while x is,
               and ag is piecewise linear in the step), break away there in the direction of the excess.
      sliding: RK4 over the rest of the step with s frozen. If s*v ends <= 0 the slider stopped inside the step:
               locate the stop on the cubic Hermite interpolant of v, integrate to it, set v = 0 and test stick
               there; if it does not stick it slides on in the direction the stick test gives."""
    def acc(x, v, a, s):
        f1, f2 = fp(x), fpp(x)
        return (-a - G*f1 - f1*f2*v*v - mu_k*s*(G + f2*v*v - f1*a))/(1 + f1*f1)
    def ag_at(k, tau):                     # piecewise linear through the half-step samples of step k
        a0, a1, a2 = ag[2*k], ag[2*k+1], ag[2*k+2]
        u = tau/(0.5*dt)
        return np.where(u <= 1, a0 + (a1 - a0)*u, a1 + (a2 - a1)*(u - 1))
    def rk4(x, v, s, k, t0, h):
        a0, a1, a2 = ag_at(k, t0), ag_at(k, t0 + 0.5*h), ag_at(k, t0 + h)
        k1x, k1v = v, acc(x, v, a0, s)
        k2x, k2v = v + 0.5*h*k1v, acc(x + 0.5*h*k1x, v + 0.5*h*k1v, a1, s)
        k3x, k3v = v + 0.5*h*k2v, acc(x + 0.5*h*k2x, v + 0.5*h*k2v, a1, s)
        k4x, k4v = v + h*k3v,     acc(x + h*k3x,     v + h*k3v,     a2, s)
        x1 = x + h/6*(k1x + 2*k2x + 2*k3x + k4x)
        v1 = v + h/6*(k1v + 2*k2v + 2*k3v + k4v)
        return x1, v1, k1v, acc(x1, v1, a2, s)
    def settle(mask, x, a):
        """For elements in mask at rest (v = 0) at position x under ground accel a: stick, or slide which way."""
        lo, hi = stick_band(fp(x), mu_s)
        stk = mask & (a >= lo) & (a <= hi)
        return stk, np.where(a > hi, -1.0, 1.0)

    x = np.full(B, x0, float); v = np.full(B, v0, float)
    s = np.where(v > 0, 1.0, -1.0)
    stuck, s0 = settle(v == 0, x, np.full(B, ag[0]))
    s = np.where(v == 0, s0, s)
    X = np.empty((n+1, B)); V = np.empty((n+1, B)); A = np.empty((n+1, B)); S = np.empty((n+1, B), bool)
    X[0] = x; V[0] = v; S[0] = stuck
    A[0] = np.where(stuck, ag[0], acc(x, v, ag[0], s) + ag[0])
    a_pk = np.abs(np.where(v == 0, ag[0], A[0]))                      # covers a breakaway at t = 0
    r = np.arange(1, N_ROOT + 1)[:, None]/N_ROOT                     # Hermite sample points in (0, 1]
    h00, h10, h01, h11 = 2*r**3 - 3*r**2 + 1, r**3 - 2*r**2 + r, -2*r**3 + 3*r**2, r**3 - r**2
    n_cut, every = 0, max(1, n//100)
    for k in range(n):
        if progress is not None and k % every == 0: progress(k, n)
        tau = np.where(np.isfinite(x), 0.0, dt)                     # diverged elements are left as they are
        for _ in range(MAX_PHASES):
            act = tau < dt
            if not act.any():
                break
            # ---- stuck: first exit from the stick band in [tau, dt/2] or [max(tau, dt/2), dt]
            st = act & stuck
            if st.any():
                lo, hi = stick_band(fp(x), mu_s)
                tm = np.maximum(tau, 0.5*dt)
                ta = (tau, ag_at(k, tau)); tb = (tm, ag_at(k, tm)); tc = (np.full(B, dt), ag_at(k, np.full(B, dt)))
                t_brk = np.full(B, np.inf); a_brk = np.zeros(B)
                for (t1, a1), (t2, a2) in ((ta, tb), (tb, tc)):
                    out = st & np.isinf(t_brk) & ((a2 > hi) | (a2 < lo))
                    c = np.where(a2 > hi, hi, lo)
                    with np.errstate(invalid="ignore", divide="ignore"):
                        q = np.clip(np.where(a2 != a1, (c - a1)/(a2 - a1), 0.0), 0.0, 1.0)
                    t_brk = np.where(out, t1 + q*(t2 - t1), t_brk); a_brk = np.where(out, a2, a_brk)
                brk = st & np.isfinite(t_brk)
                a_pk = np.where(brk, np.maximum(a_pk, np.abs(ag_at(k, np.where(brk, t_brk, 0.0)))), a_pk)
                tau = np.where(st & ~brk, dt, np.where(brk, t_brk, tau))
                stuck = stuck & ~brk
                s = np.where(brk, np.where(a_brk > hi, -1.0, 1.0), s)
            # ---- sliding: RK4 to the end of the step with the direction frozen
            sl = act & ~stuck
            if sl.any():
                h = dt - tau
                x1, v1, a0, a1 = rk4(x, v, s, k, tau, h)
                go = sl & ((s*v1 > 0) | ~np.isfinite(v1) | (h <= 1e-12*dt))
                x = np.where(go, x1, x); v = np.where(go, v1, v); tau = np.where(go, dt, tau)
                ev = sl & ~go                                       # stopped inside the step
                if ev.any():
                    phi = s*(h00*v + h10*h*a0 + h01*v1 + h11*h*a1)  # s*v on the Hermite cubic, (N_ROOT, B)
                    j = np.argmax(phi <= 0, axis=0)                 # first sample at or past the stop
                    cols = np.arange(B)
                    r_hi, p_hi = r[j, 0], phi[j, cols]
                    r_lo = np.where(j > 0, r[np.maximum(j - 1, 0), 0], 0.0)
                    p_lo = np.where(j > 0, phi[np.maximum(j - 1, 0), cols], s*v)
                    with np.errstate(invalid="ignore", divide="ignore"):
                        r_st = np.where(p_lo > 0, r_lo + (r_hi - r_lo)*p_lo/(p_lo - p_hi), r_hi)
                    hs = np.where(ev, r_st*h, 0.0)
                    xs, _, _, _ = rk4(x, v, s, k, tau, hs)
                    x = np.where(ev, xs, x); v = np.where(ev, 0.0, v); tau = np.where(ev, tau + hs, tau)
                    stk, s_new = settle(ev, x, ag_at(k, tau))
                    stuck = stuck | stk
                    s = np.where(ev & ~stk, s_new, s)
        else:
            if (tau < dt).any():
                n_cut += 1                                          # rest of the step skipped for those elements
        a2 = ag[2*k+2]
        X[k+1] = x; V[k+1] = v; S[k+1] = stuck
        A[k+1] = np.where(stuck, a2, acc(x, v, a2, s) + a2)          # absolute (transmitted) accel
    if progress is not None: progress(n, n)
    return dict(t=np.arange(n+1)*dt, x=X, v=V, a_abs=A, ag=ag[0::2], stuck=S,
                a_peak=np.maximum(np.abs(A).max(0), a_pk), n_cut=n_cut)

def metrics(out, T=None):
    A, X = out["a_abs"]/G, out["x"]
    a_max = np.abs(A).max(0) if "a_peak" not in out else out["a_peak"]/G
    return dict(u_max=np.abs(X).max(0), a_max_g=a_max, a_rms_g=np.sqrt((A**2).mean(0)))

def scale_to_pga(a_g, pga_target_g):
    """Amplitude scaling only: same shape/frequency content, peak = target (all in g)."""
    return a_g*(pga_target_g/np.abs(a_g).max())
