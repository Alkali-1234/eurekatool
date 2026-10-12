import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from obspy import UTCDateTime
g = 9.80665
d = np.load("/home/claude/out/ugm_acc.npz")
t = d["t"]; t0 = UTCDateTime(str(d["t0"]))
orig = UTCDateTime("2023-06-30T12:57:42.4")
t = t + (t0 - orig)
try:
    plt.rcParams.update({"text.usetex": True, "font.family": "serif", "font.serif": ["Computer Modern Roman"]})
    fig0 = plt.figure(); fig0.text(0.5,0.5,r"$a$"); fig0.canvas.draw(); plt.close(fig0)
    tex = True
except Exception as e:
    print("usetex failed, falling back:", e)
    plt.rcParams.update({"text.usetex": False, "font.family": "serif", "mathtext.fontset": "cm", "font.serif": ["cmr10"], "axes.formatter.use_mathtext": True, "axes.unicode_minus": False})
    tex = False
plt.rcParams.update({"axes.linewidth": 0.6, "xtick.direction": "in", "ytick.direction": "in",
                     "xtick.top": True, "ytick.right": True, "font.size": 9})
fig, axs = plt.subplots(3, 1, figsize=(6.4, 5.4), sharex=True)
for ax, (ch, lab) in zip(axs, [("HNE", "E--W"), ("HNN", "N--S"), ("HNZ", "Vertical")]):
    a = d[ch] / g
    ax.plot(t, a, color="black", lw=0.35)
    ax.axhline(0, color="black", lw=0.3)
    i = np.argmax(np.abs(a))
    ax.plot(t[i], a[i], marker="o", mfc="none", mec="black", ms=5, mew=0.6)
    ax.annotate(r"$a_{\max}=%.4f\,g$" % abs(a[i]) if tex else r"$a_{max}=%.4f\,g$" % abs(a[i]),
                xy=(t[i], a[i]), xytext=(t[i]+25, a[i]*0.95 if abs(a[i])>0 else 0), fontsize=8,
                arrowprops=dict(arrowstyle="-", lw=0.5, color="black"))
    ax.set_ylabel(r"$a(t)$ [$g$], " + lab)
    ax.set_xlim(0, t[-1])
    lim = 1.15*np.max(np.abs(a)); ax.set_ylim(-lim, lim)
axs[-1].set_xlabel(r"Time since origin [s]")
axs[0].set_title(r"GE.UGM (Yogyakarta), $M_w\,5.9$, 2023-06-30 12:57:42 UTC, off S Java (76 km depth)", fontsize=9)
fig.tight_layout()
fig.savefig("/home/claude/out/ugm_20230630_acc.pdf")
fig.savefig("/home/claude/out/ugm_20230630_acc.png", dpi=200)
print("saved; usetex =", tex)
