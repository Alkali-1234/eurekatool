import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from obspy import read, read_inventory
plt.rcParams.update({"text.usetex": False, "font.family": "serif", "mathtext.fontset": "cm",
    "font.serif": ["cmr10"], "axes.formatter.use_mathtext": True, "axes.unicode_minus": False,
    "axes.linewidth": 0.6, "xtick.direction": "in", "ytick.direction": "in",
    "xtick.top": True, "ytick.right": True, "font.size": 9})
d = "/tmp/claude-0/-home-claude/5a55ec1f-f6ee-530a-8f82-090f0381a597/scratchpad/sev/nz/"
st = read(d+"hvsc.mseed"); inv = read_inventory(d+"hvsc.xml")
st.detrend("demean"); st.remove_response(inventory=inv, output="ACC")
g = 9.80665
fig, axs = plt.subplots(3, 1, figsize=(6.4, 5.4), sharex=True)
for ax, (ch, lab) in zip(axs, [("HN1", "HN1 (az. 116$^{\\circ}$)"), ("HN2", "HN2"), ("HNZ", "Vertical")]):
    tr = st.select(channel=ch)[0]; a = tr.data/g
    t = tr.times() + (tr.stats.starttime - st[0].stats.starttime)
    ax.plot(t, a, color="black", lw=0.35); ax.axhline(0, color="black", lw=0.3)
    i = np.argmax(np.abs(a)); ax.plot(t[i], a[i], "o", mfc="none", mec="black", ms=5, mew=0.6)
    ax.annotate(r"$a_{\max}=%.3f\,g$" % abs(a[i]), xy=(t[i], a[i]), xytext=(t[i]+8, a[i]*0.55), fontsize=8,
                arrowprops=dict(arrowstyle="-", lw=0.5, color="black"))
    ax.set_ylabel(r"$a(t)$ [$g$], " + lab); ax.set_xlim(0, t[-1]); l = 1.2*np.abs(a).max(); ax.set_ylim(-l, l)
axs[-1].set_xlabel(r"Time since 2011-02-21 23:51:33 UTC [s]")
axs[0].set_title(r"NZ.HVSC (Heathcote Valley), Christchurch $M_w\,6.2$, 2011-02-22 NZDT", fontsize=9)
fig.tight_layout()
fig.savefig("/home/claude/out/hvsc_christchurch2011_acc.pdf"); fig.savefig("/home/claude/out/hvsc_christchurch2011_acc.png", dpi=200)
