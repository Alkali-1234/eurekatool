"""Independent reference simulator: 1D slider on a convex dish y=f(x), Coulomb friction, base excitation.
EOM (verified symbolically in verify_eom.py):
 (1+f'^2) xdd + f' f'' xd^2 + g f' + mu*sgn(xd)*(g + f'' xd^2 - f' ag) = -ag
Friction regularised: sgn(v) -> tanh(v/v_eps). Batched over B candidate dishes. RK4, dt=0.002 s.
"""
import numpy as np
G = 9.80665

def sphere(R):
    R = np.asarray(R, float)
    fp  = lambda x: x/np.sqrt(R**2 - x**2)
    fpp = lambda x: R**2/(R**2 - x**2)**1.5
    return fp, fpp

def simulate(fp, fpp, t_rec, a_rec_g, mu, dt=0.002, T=30.0, v_eps=1e-3, B=1, x0=0.0, v0=0.0, progress=None):
    """a_rec_g: ground accel in g at times t_rec (linear interpolation). Returns dict of time series.
    progress: optional callback progress(k, n), called every ~1 % of the steps; it does not affect the numerics."""
    n = int(round(T/dt))
    th = np.arange(2*n + 1)*(dt/2)
    ag = np.interp(th, t_rec, a_rec_g, right=0.0)*G          # ground accel [m/s^2] at half steps
    x = np.full(B, x0, float); v = np.full(B, v0, float)
    X = np.empty((n+1, B)); A = np.empty((n+1, B)); X[0] = x
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
        X[k+1] = x; A[k+1] = acc(x, v, ag[2*k+2]) + ag[2*k+2]   # absolute (transmitted) accel
    if progress is not None: progress(n, n)
    return dict(t=np.arange(n+1)*dt, x=X, a_abs=A)

def metrics(out, T=None):
    A, X = out["a_abs"]/G, out["x"]
    return dict(u_max=np.abs(X).max(0), a_max_g=np.abs(A).max(0), a_rms_g=np.sqrt((A**2).mean(0)))

def scale_to_pga(a_g, pga_target_g):
    """Amplitude scaling only: same shape/frequency content, peak = target (all in g)."""
    return a_g*(pga_target_g/np.abs(a_g).max())
