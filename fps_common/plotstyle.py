"""Black-and-white, LaTeX-like matplotlib style (same rcParams as severe_records/plot_hvsc.py)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

plt.rcParams.update({"text.usetex": False, "font.family": "serif", "mathtext.fontset": "cm",
    "font.serif": ["cmr10"], "axes.formatter.use_mathtext": True, "axes.unicode_minus": False,
    "axes.linewidth": 0.6, "xtick.direction": "in", "ytick.direction": "in",
    "xtick.top": True, "ytick.right": True, "font.size": 9, "hatch.linewidth": 0.4,
    "legend.frameon": True, "legend.framealpha": 1.0, "legend.edgecolor": "black", "legend.fancybox": False})

HATCH_EDGE = "0.6"   # grey hatch for infeasible regions (greyscale, no colour)


def save(fig, stem):
    """Save fig as <stem>.pdf and <stem>.png; return both paths."""
    pdf, png = str(stem) + ".pdf", str(stem) + ".png"
    fig.savefig(pdf)
    fig.savefig(png, dpi=200)
    plt.close(fig)
    return pdf, png


def log_ticks(ax, lo, hi, axis="x"):
    """Plain-number ticks (0.2, 0.5, 1, 2, ...) on a log axis instead of 2x10^-1."""
    from matplotlib.ticker import FixedLocator, FuncFormatter, NullFormatter
    nice = [m * 10.0 ** e for e in range(-4, 5) for m in (1, 2, 3, 5)]
    ticks = [v for v in nice if lo * (1 - 1e-9) <= v <= hi * (1 + 1e-9)]
    a = ax.xaxis if axis == "x" else ax.yaxis
    a.set_major_locator(FixedLocator(ticks))
    a.set_major_formatter(FuncFormatter(lambda v, _: "%g" % v))
    a.set_minor_formatter(NullFormatter())
