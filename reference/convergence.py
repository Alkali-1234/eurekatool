import sys, time, numpy as np
sys.path.insert(0, sys.argv[1])
from fps_ref import *
d = np.loadtxt(sys.argv[2], delimiter="," if sys.argv[2].endswith(".csv") else None); t, a = d[:, 0], d[:, 1]
a = scale_to_pga(a, 0.349)
Rs = np.array([0.275, 1.55]); fp, fpp = sphere(Rs)
print("   dt      v_eps   | R=0.275: u_max[mm] a_rms[g] a_max[g] | R=1.55: u_max[mm] a_rms[g] a_max[g]")
for dt, ve in [(0.002, 1e-3), (0.001, 1e-3), (0.0005, 1e-3), (0.002, 1e-2), (0.001, 1e-2), (0.0005, 1e-2), (0.0005, 3e-2), (0.0002, 1e-4)]:
    t0 = time.time(); o = simulate(fp, fpp, t, a, mu=0.10, dt=dt, T=30.0, v_eps=ve, B=2); m = metrics(o)
    print("  %.4f  %.0e  |  %6.2f  %.4f  %.4f  |  %6.2f  %.4f  %.4f   (%.0fs)" % (dt, ve, m["u_max"][0]*1e3, m["a_rms_g"][0], m["a_max_g"][0], m["u_max"][1]*1e3, m["a_rms_g"][1], m["a_max_g"][1], time.time()-t0))
