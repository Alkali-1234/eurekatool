import sys, numpy as np
sys.path.insert(0, sys.argv[1])
from fps_ref import *
d = np.loadtxt(sys.argv[2], delimiter="," if sys.argv[2].endswith(".csv") else None); t, a = d[:, 0], d[:, 1]
a = scale_to_pga(a, 0.349)                       # project regime: PGA 0.349 g
Rs = np.geomspace(0.15, 6.0, 80)
fp, fpp = sphere(Rs)
o = simulate(fp, fpp, t, a, mu=0.10, dt=0.002, T=30.0, v_eps=1e-3, B=len(Rs))
m = metrics(o)
ok = m["u_max"] <= 0.030
print("R scan: %d values, feasible (u_max<=30mm): %d" % (len(Rs), ok.sum()))
i = np.where(ok)[0]
j = i[np.argmin(m["a_rms_g"][i])]
print("best feasible sphere: R=%.3f m  u_max=%.2f mm  a_rms=%.4f g  a_max=%.4f g" % (Rs[j], m["u_max"][j]*1e3, m["a_rms_g"][j], m["a_max_g"][j]))
for k in (0, 10, 20, 30, 40, 50, 60, 79):
    print("  R=%5.2f  u_max=%7.2f mm  a_rms=%.4f g  a_max=%.4f g%s" % (Rs[k], m["u_max"][k]*1e3, m["a_rms_g"][k], m["a_max_g"][k], "" if ok[k] else "   (> u_cap)"))
print("small-angle bound g(mu+u_max/R) at best R: %.4f g" % (0.10 + m["u_max"][j]/Rs[j]))
