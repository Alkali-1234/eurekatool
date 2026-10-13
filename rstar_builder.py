#!/usr/bin/env python3
"""R* builder: grid-search the spherical dish radius R for one waveform and one travel cap u_cap.

For every R on a log-spaced grid the slider is simulated with fps_ref.simulate (all R in one batch), and
    L_p(R) = ( mean_t |a_abs(t)|^p )^(1/p)     [g]     (p = 2 -> a_rms, p = inf -> a_max)
is computed from the transmitted (absolute) acceleration. R* is the minimiser of L_p over the grid points
whose peak slider travel u_max(R) <= u_cap. If no grid point fits, R* is null and status is "infeasible".

Modes:
  python rstar_builder.py                     interactive wizard (terminal)
  python rstar_builder.py --u-cap-mm 30 ...   plain CLI, human-readable summary
  python rstar_builder.py --json ...          one JSON object on stdout, NDJSON progress on stderr
Outputs (folder under out/ or --out): grid.csv, L_of_R.pdf/.png, result.json, and timeseries.csv (every time step
at R*, only when a feasible R* exists)
"""
import argparse, pathlib, shlex, sys

ROOT = pathlib.Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import fps_ref  # noqa: E402
from fps_common import InputError  # noqa: E402
from fps_common.io import JsonChannel, run_json_main, make_outdir, write_csv, write_json, fmt_tag  # noqa: E402
from fps_common.waveform import load_waveform, UNIT_TO_G  # noqa: E402

G = fps_ref.G
DEFAULTS = dict(mu=0.10, p=2.0, dt=0.002, v_eps=1e-3, r_min=0.15, r_max=6.0)
RK4_STABILITY = 2.8          # dt * mu * g / v_eps must stay below this (CLAUDE.md §3.6)


# ----------------------------------------------------------------------------------------------- arguments
class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise InputError(message)


def add_common_args(ap, n_r_default):
    w = ap.add_argument_group("waveform")
    w.add_argument("--source", default="elcentro",
                   help='"elcentro" (built-in NS record) or a path to .csv/.txt/.dat (time, acc) or .mseed')
    w.add_argument("--pga", type=float, default=None,
                   help="amplitude-scale the record to this PGA [g]; omit to use the record as is")
    w.add_argument("--units", choices=sorted(UNIT_TO_G), default="g",
                   help="units of the acceleration column (text files, or miniSEED without --inventory)")
    w.add_argument("--channel", help="miniSEED channel, e.g. HN1")
    w.add_argument("--location", help="miniSEED location code, e.g. 20")
    w.add_argument("--inventory", help="StationXML for miniSEED; the instrument response is removed to ACC")
    w.add_argument("--pre-filt", help="pre-filter corners f1,f2,f3,f4 [Hz] for response removal")
    w.add_argument("--t-start", type=float, default=0.0, help="drop the record before this time [s]")
    w.add_argument("--duration", type=float, default=None, help="simulated length [s]; default = whole record")
    ph = ap.add_argument_group("physics and grid")
    ph.add_argument("--mu", type=float, default=DEFAULTS["mu"], help="Coulomb friction coefficient")
    ph.add_argument("--p", type=float, default=DEFAULTS["p"], help="loss norm order (2 = RMS, inf = peak)")
    ph.add_argument("--r-min", type=float, default=DEFAULTS["r_min"], help="smallest R on the grid [m]")
    ph.add_argument("--r-max", type=float, default=DEFAULTS["r_max"], help="largest R on the grid [m]")
    ph.add_argument("--n-r", type=int, default=n_r_default, help="number of log-spaced R values")
    ph.add_argument("--dt", type=float, default=DEFAULTS["dt"], help="RK4 time step [s]")
    ph.add_argument("--v-eps", type=float, default=DEFAULTS["v_eps"], help="friction regularisation [m/s]")
    o = ap.add_argument_group("output")
    o.add_argument("--out", help="output folder (default: out/<auto name>)")
    o.add_argument("--json", action="store_true", help="print one JSON result object on stdout (for scripts)")


def waveform_from_args(a):
    pre = None
    if a.pre_filt:
        try:
            pre = tuple(float(v) for v in a.pre_filt.split(","))
        except ValueError:
            pre = ()
        if len(pre) != 4:
            raise InputError("--pre-filt needs four comma-separated frequencies, e.g. 0.05,0.1,40,45")
    return load_waveform(a.source, units=a.units, channel=a.channel, location=a.location,
                         inventory=a.inventory, pre_filt=pre, t_start=a.t_start, pga=a.pga)


def r_grid_from_args(a):
    if not (0 < a.r_min < a.r_max):
        raise InputError("need 0 < --r-min < --r-max")
    if a.n_r < 2:
        raise InputError("--n-r must be at least 2")
    return np.geomspace(a.r_min, a.r_max, a.n_r)


def physics_from_args(a, wave):
    if a.mu < 0:
        raise InputError("--mu must be >= 0")
    if not a.p >= 1:
        raise InputError("--p must be >= 1 (use inf for the peak)")
    if a.dt <= 0 or a.v_eps <= 0:
        raise InputError("--dt and --v-eps must be > 0")
    T = a.duration if a.duration is not None else wave.duration
    if T <= a.dt:
        raise InputError("--duration must be longer than one time step")
    return dict(mu=a.mu, p=a.p, dt=a.dt, v_eps=a.v_eps, duration=T)


# ----------------------------------------------------------------------------------------------- core
def lp_norm(A, p):
    """Column-wise (mean |A|^p)^(1/p); p = inf gives max |A|. Scaled by the max so large p cannot overflow."""
    A = np.abs(A)
    peak = A.max(0)
    if np.isinf(p):
        return peak
    with np.errstate(invalid="ignore", divide="ignore"):
        return peak * (((A / peak) ** p).mean(0)) ** (1.0 / p)


def sweep(wave, R, mu, p, dt, v_eps, duration, progress=None):
    """Simulate every R in one batch. Returns the grid as arrays (u_max in mm, accelerations in g)."""
    R = np.asarray(R, float)
    fp, fpp = fps_ref.sphere(R)
    with np.errstate(invalid="ignore", over="ignore", divide="ignore"):
        out = fps_ref.simulate(fp, fpp, wave.t, wave.a_g, mu=mu, dt=dt, T=duration, v_eps=v_eps,
                               B=len(R), progress=progress)
        m = fps_ref.metrics(out)
        L = lp_norm(out["a_abs"] / G, p)
    ok = np.isfinite(m["u_max"]) & np.isfinite(L)      # not finite = slider ran past the edge of the sphere
    warnings = []
    if dt * mu * G / v_eps > RK4_STABILITY:
        warnings.append("dt*mu*g/v_eps = %.2f > %.1f: RK4 friction term may be unstable (CLAUDE.md §3.6)"
                        % (dt * mu * G / v_eps, RK4_STABILITY))
    if (~ok).any():
        warnings.append("%d of %d radii diverged (slider left the spherical cap); they count as infeasible"
                        % ((~ok).sum(), len(R)))
    nan = lambda v: np.where(ok, v, np.nan)  # noqa: E731
    return dict(R_m=R, u_max_mm=nan(m["u_max"] * 1e3), a_rms_g=nan(m["a_rms_g"]), a_max_g=nan(m["a_max_g"]),
                L_g=nan(L), ok=ok, params=dict(mu=mu, p=p, dt=dt, v_eps=v_eps, duration_s=duration),
                warnings=warnings, series=out)


def select_rstar(sw, u_cap_mm):
    """Apply the travel cap to a sweep and pick R* = argmin L over the feasible radii."""
    if not u_cap_mm > 0:
        raise InputError("u_cap must be > 0 mm")
    with np.errstate(invalid="ignore"):
        feas = sw["ok"] & (sw["u_max_mm"] <= u_cap_mm)
    sel = dict(u_cap_mm=float(u_cap_mm), feasible=feas, n_feasible=int(feas.sum()), index=None, status="infeasible",
               r_star_m=None, L_star_g=None, u_max_star_mm=None, a_max_star_g=None, a_rms_star_g=None,
               at_grid_edge=None)
    if feas.any():
        i = int(np.flatnonzero(feas)[np.argmin(sw["L_g"][feas])])
        sel.update(index=i, status="ok", r_star_m=float(sw["R_m"][i]), L_star_g=float(sw["L_g"][i]),
                   u_max_star_mm=float(sw["u_max_mm"][i]), a_max_star_g=float(sw["a_max_g"][i]),
                   a_rms_star_g=float(sw["a_rms_g"][i]), at_grid_edge=i in (0, len(sw["R_m"]) - 1))
    return sel


def grid_dict(sw, feas):
    return dict(R_m=sw["R_m"], u_max_mm=sw["u_max_mm"], L_g=sw["L_g"], a_max_g=sw["a_max_g"],
                a_rms_g=sw["a_rms_g"], feasible=feas)


def grid_rows(sw, feas):
    return [(float(r), float(u), float(ar), float(am), float(l), int(f)) for r, u, ar, am, l, f in
            zip(sw["R_m"], sw["u_max_mm"], sw["a_rms_g"], sw["a_max_g"], sw["L_g"], feas)]


GRID_HEADER = ["R_m", "u_max_mm", "a_rms_g", "a_max_g", "L_g", "feasible"]
TIMESERIES_HEADER = ["t_s", "ag_g", "theta_rad", "theta_dot_rad_s", "theta_ddot_rad_s2", "u_mm", "u_dot_m_s",
                     "u_ddot_m_s2", "a_abs_g"]


def timeseries(sw, i):
    """Every simulated time step for grid radius i, as columns in TIMESERIES_HEADER order.
    u = x is the signed slider displacement relative to the dish, theta the polar angle with sin(theta) = u/R, so
        theta_dot = u_dot / c,  theta_ddot = u_ddot / c + u u_dot^2 / c^3,  c = sqrt(R^2 - u^2) = R cos(theta).
    u_ddot is the relative acceleration (a_abs - ag); a_abs is the transmitted acceleration (CLAUDE.md §3.5)."""
    s, R = sw["series"], sw["R_m"][i]
    u, ud, a_abs, ag = s["x"][:, i], s["v"][:, i], s["a_abs"][:, i], s["ag"]
    udd = a_abs - ag
    c = np.sqrt(R * R - u * u)
    return np.column_stack([s["t"], ag / G, np.arcsin(u / R), ud / c, udd / c + u * ud * ud / c ** 3, u * 1e3, ud,
                            udd, a_abs / G])


def write_timeseries(path, sw, i):
    np.savetxt(path, timeseries(sw, i), fmt="%.10g", delimiter=",", header=",".join(TIMESERIES_HEADER), comments="")


# ----------------------------------------------------------------------------------------------- plotting
def loss_label(p):
    if np.isinf(p):
        return r"$L_\infty(R)=a_{\max}$ [$g$]"
    if p == 2:
        return r"$L_2(R)=a_{\mathrm{rms}}$ [$g$]"
    return r"$L_{%g}(R)$ [$g$]" % p


def infeasible_spans(R, feas):
    """Contiguous runs of infeasible grid points as (lo, hi) R-intervals, split at geometric midpoints."""
    mids = np.sqrt(R[:-1] * R[1:])
    edges = np.concatenate([[R[0]], mids, [R[-1]]])
    spans, i = [], 0
    while i < len(R):
        if not feas[i]:
            j = i
            while j + 1 < len(R) and not feas[j + 1]:
                j += 1
            spans.append((edges[i], edges[j + 1]))
            i = j + 1
        else:
            i += 1
    return spans


def plot_rstar(sw, sel, stem, title):
    from fps_common.plotstyle import plt, save, log_ticks, HATCH_EDGE
    from matplotlib.patches import Patch
    from matplotlib.lines import Line2D
    R, L, u, feas = sw["R_m"], sw["L_g"], sw["u_max_mm"], sel["feasible"]
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(6.4, 5.4), sharex=True, gridspec_kw=dict(height_ratios=[3, 2]))
    for ax in (ax1, ax2):
        for lo, hi in infeasible_spans(R, feas):
            ax.axvspan(lo, hi, facecolor="white", edgecolor=HATCH_EDGE, hatch="///", lw=0, zorder=0)
    ax1.plot(R, L, "-", color="black", lw=0.7, zorder=2)
    ax1.plot(R[feas], L[feas], "o", color="black", ms=2.6, zorder=3)
    ax1.plot(R[~feas], L[~feas], "o", mfc="white", mec="black", mew=0.5, ms=2.6, zorder=3)
    ax2.plot(R, u, "-", color="black", lw=0.7, zorder=2)
    ax2.plot(R[feas], u[feas], "o", color="black", ms=2.6, zorder=3)
    ax2.plot(R[~feas], u[~feas], "o", mfc="white", mec="black", mew=0.5, ms=2.6, zorder=3)
    ax2.axhline(sel["u_cap_mm"], color="black", lw=0.7, ls="--", zorder=2)
    ax2.annotate(r"$u_{\mathrm{cap}}=%g$ mm" % sel["u_cap_mm"], xy=(1.0, sel["u_cap_mm"]),
                 xycoords=("axes fraction", "data"), xytext=(-4, 3), textcoords="offset points", ha="right",
                 va="bottom", fontsize=8, bbox=dict(fc="white", ec="none", pad=1))
    if sel["status"] == "ok":
        rs, ls_ = sel["r_star_m"], sel["L_star_g"]
        for ax in (ax1, ax2):
            ax.axvline(rs, color="black", lw=0.5, ls=":", zorder=1)
        ax1.plot(rs, ls_, marker="*", ms=13, mfc="white", mec="black", mew=0.8, zorder=4)
        ax2.plot(rs, sel["u_max_star_mm"], marker="*", ms=11, mfc="white", mec="black", mew=0.8, zorder=4)
        right = np.log(rs / R[0]) > 0.7 * np.log(R[-1] / R[0])          # keep the label inside the axes
        ax1.annotate(r"$R^{*}=%.3f$ m" "\n" r"$L(R^{*})=%.4f\,g$" % (rs, ls_), xy=(rs, ls_),
                     xytext=(-12 if right else 12, 18), ha="right" if right else "left",
                     textcoords="offset points", fontsize=8, bbox=dict(fc="white", ec="none", pad=1),
                     arrowprops=dict(arrowstyle="-", lw=0.5, color="black"))
    else:
        ax1.text(0.5, 0.92, r"no feasible $R$ on the grid ($u_{\max}>u_{\mathrm{cap}}$ everywhere)",
                 transform=ax1.transAxes, ha="center", fontsize=8, bbox=dict(fc="white", ec="black", lw=0.5))
    ax1.set_xscale("log")
    ax1.set_ylabel(loss_label(sw["params"]["p"]))
    ax2.set_ylabel(r"$u_{\max}$ [mm]")
    ax2.set_xlabel(r"Dish radius $R$ [m]")
    ax1.set_xlim(R[0], R[-1])
    log_ticks(ax2, R[0], R[-1])
    handles = [Line2D([], [], ls="", marker="o", color="black", ms=3, label="feasible"),
               Patch(facecolor="white", edgecolor=HATCH_EDGE, hatch="///", lw=0.4,
                     label=r"infeasible ($u_{\max}>u_{\mathrm{cap}}$)")]
    if sel["status"] == "ok":
        handles.append(Line2D([], [], ls="", marker="*", ms=9, mfc="white", mec="black", label=r"$R^{*}$"))
    ax1.legend(handles=handles, loc="upper right", fontsize=8)
    ax1.set_title(title, fontsize=9)
    fig.tight_layout()
    return save(fig, stem)


def describe(wave, phys):
    m = wave.meta
    pga = (r"PGA %.3f $g$ (scaled)" % m["pga_used_g"]) if m["pga_target_g"] else (r"PGA %.3f $g$" % m["pga_used_g"])
    p = r"\infty" if np.isinf(phys["p"]) else "%g" % phys["p"]
    return r"%s, %s, $\mu=%g$, $p=%s$, %g s" % (m["name"].replace("_", " "), pga, phys["mu"], p,
                                               phys["duration"])


# ----------------------------------------------------------------------------------------------- entry
def command_line(script, argv):
    return " ".join(shlex.quote(s) for s in ["python", script, *argv])


def run(argv, chan, ui=None):
    """Parse argv, run the sweep, write outputs. Returns the result dict (also printed in --json mode)."""
    ap = Parser(prog="rstar_builder.py", description=__doc__.split("\n")[0])
    add_common_args(ap, n_r_default=80)
    ap.add_argument("--u-cap-mm", type=float, required=True, help="travel cap u_cap [mm]; feasible if u_max <= u_cap")
    a = ap.parse_args(argv)
    wave = waveform_from_args(a)
    R = r_grid_from_args(a)
    phys = physics_from_args(a, wave)
    if not a.u_cap_mm > 0:
        raise InputError("--u-cap-mm must be > 0")
    chan.event(event="start", script="rstar_builder", n_r=len(R), steps=int(round(phys["duration"] / a.dt)))

    if ui is not None:
        with ui.progress("Simulating %d radii" % len(R)) as cb:
            sw = sweep(wave, R, progress=cb, **phys)
    else:
        sw = sweep(wave, R, progress=chan.progress_cb("simulate"), **phys)
    sel = select_rstar(sw, a.u_cap_mm)

    pga_tag = "pga" + fmt_tag(a.pga) if a.pga is not None else "native"
    outdir = make_outdir(a.out, "rstar", wave.meta["name"], pga_tag, "ucap%smm" % fmt_tag(a.u_cap_mm))
    files = dict(grid_csv=outdir / "grid.csv", result_json=outdir / "result.json")
    write_csv(files["grid_csv"], GRID_HEADER, grid_rows(sw, sel["feasible"]))
    if sel["status"] == "ok":
        files["timeseries_csv"] = outdir / "timeseries.csv"
        write_timeseries(files["timeseries_csv"], sw, sel["index"])
    files["plot_pdf"], files["plot_png"] = plot_rstar(sw, sel, outdir / "L_of_R", describe(wave, phys))

    res = dict(ok=True, status=sel["status"], r_star_m=sel["r_star_m"], L_star_g=sel["L_star_g"],
               u_max_star_mm=sel["u_max_star_mm"], a_max_star_g=sel["a_max_star_g"],
               a_rms_star_g=sel["a_rms_star_g"], at_grid_edge=sel["at_grid_edge"], n_feasible=sel["n_feasible"],
               u_cap_mm=a.u_cap_mm, timeseries_csv="timeseries.csv" if sel["status"] == "ok" else None, warnings=sw["warnings"] + (
                   ["R* is at the edge of the R grid; widen --r-min/--r-max"] if sel["at_grid_edge"] else []),
               inputs=dict(**sw["params"], r_min=a.r_min, r_max=a.r_max, n_r=a.n_r,
                           command=command_line("rstar_builder.py", [s for s in argv if s != "--json"])),
               waveform=wave.meta, grid=grid_dict(sw, sel["feasible"]), files={k: str(v) for k, v in files.items()})
    write_json(files["result_json"], res)
    if a.json:
        chan.result(res)
    elif ui is not None:
        ui.show_rstar(res)
    return res


def main():
    argv = sys.argv[1:]
    if not argv:
        if not sys.stdin.isatty():
            sys.stderr.write("no arguments and no terminal: pass --u-cap-mm ... (see --help)\n")
            return 2
        from fps_common import wizard
        argv = wizard.ask_rstar()
        return wizard.run_interactive(run, argv, "rstar_builder.py")
    if "--json" in argv:
        return run_json_main(run, argv)
    from fps_common import wizard
    return wizard.run_interactive(run, argv, None)


if __name__ == "__main__":
    sys.exit(main())
