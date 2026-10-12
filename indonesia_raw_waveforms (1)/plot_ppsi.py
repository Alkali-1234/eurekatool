import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from obspy import read
plt.rcParams.update({"text.usetex": False, "font.family": "serif", "mathtext.fontset": "cm",
    "font.serif": ["cmr10"], "axes.formatter.use_mathtext": True, "axes.unicode_minus": False,
    "axes.linewidth": 0.6, "xtick.direction": "in", "ytick.direction": "in",
    "xtick.top": True, "ytick.right": True, "font.size": 9})
base = "/tmp/claude-0/-home-claude/5a55ec1f-f6ee-530a-8f82-090f0381a597/scratchpad/dl_zenodo/"
g = 980.665
fig, axs = plt.subplots(3, 1, figsize=(6.4, 5.4), sharex=True)
for ax, (ch, lab) in zip(axs, [("HNE", "E--W"), ("HNN", "N--S"), ("HNZ", "Vertical")]):
    tr = read(base + f"PPSI.{ch}.mseed")[0]
    a = tr.data / g
    t = np.arange(tr.stats.npts) / tr.stats.sampling_rate
    ax.plot(t, a, color="black", lw=0.35); ax.axhline(0, color="black", lw=0.3)
    i = np.argmax(np.abs(a))
    ax.plot(t[i], a[i], marker="o", mfc="none", mec="black", ms=5, mew=0.6)
    ax.annotate(r"$a_{\max}=%.4f\,g$" % abs(a[i]), xy=(t[i], a[i]), xytext=(t[i]+40, a[i]*0.9), fontsize=8,
                arrowprops=dict(arrowstyle="-", lw=0.5, color="black"))
    ax.set_ylabel(r"$a(t)$ [$g$], " + lab); ax.set_xlim(0, t[-1])
    lim = 1.2*np.abs(a).max(); ax.set_ylim(-lim, lim)
axs[-1].set_xlabel(r"Time since record start (2010-10-25 14:42:20 UTC) [s]")
axs[0].set_title(r"BM.PPSI, 2010 Mentawai $M_w\,7.8$ (BMKG strong-motion, Zenodo 3351683)", fontsize=9)
fig.tight_layout()
fig.savefig("/home/claude/out/ppsi_mentawai2010_acc.pdf"); fig.savefig("/home/claude/out/ppsi_mentawai2010_acc.png", dpi=200)
