import sys, numpy as np
sys.path.insert(0, sys.argv[1])
from fps_ref import *
# (1) mu=0, small amplitude: period must be 2*pi*sqrt(R/g)
R = 0.75; fp, fpp = sphere(R)
o = simulate(fp, fpp, np.array([0, 1.0]), np.zeros(2), mu=0.0, T=10, x0=0.005)
x = o["x"][:, 0]; t = o["t"]
zc = t[1:][(x[:-1] > 0) & (x[1:] <= 0)]            # downward zero crossings
Tm = np.mean(np.diff(zc)); print("period  sim %.5f s   2*pi*sqrt(R/g) %.5f s" % (Tm, 2*np.pi*np.sqrt(R/G)))
# (2) free decay with friction: amplitude must fall by 2*mu*R per half cycle, stop inside |x| <= mu*R
mu = 0.02; fp, fpp = sphere(R)   # rest band mu*R = 15 mm, so release from 100 mm
o = simulate(fp, fpp, np.array([0, 1.0]), np.zeros(2), mu=mu, T=20, x0=0.10, v_eps=1e-4, dt=0.001)
x = o["x"][:, 0]
pk = [abs(x[i]) for i in range(1, len(x)-1) if abs(x[i]) >= abs(x[i-1]) and abs(x[i]) > abs(x[i+1]) and abs(x[i]) > 1e-4]
print("peaks [mm]:", np.round(np.array(pk[:5])*1e3, 3), " first drop %.3f mm, 2*mu*R (small-angle) = %.3f mm" % ((pk[0]-pk[1])*1e3, 2*mu*R*1e3))
print("rest position %.3f mm, rest band mu*R = %.1f mm" % (x[-1]*1e3, mu*R*1e3))
