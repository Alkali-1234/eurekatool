#!/usr/bin/env python3
"""u_max table builder: R* for every travel cap u_cap in [u_min, u_max] with step du.

Uses rstar_builder's grid search. The simulation of a given R does not depend on u_cap (only the feasibility
mask u_max(R) <= u_cap does), so the R grid is simulated once and rstar_builder.select_rstar is applied per cap.
This gives exactly the same R* as running rstar_builder.py once per cap.

Modes:
  python umax_table_builder.py                                        interactive wizard (terminal)
  python umax_table_builder.py --u-min-mm 20 --u-max-mm 40 --du-mm 1  plain CLI
  python umax_table_builder.py --json ...                             one JSON object on stdout (each cap's full
                                                                      grid-search result), NDJSON progress on stderr
Outputs (folder under out/ or --out): table.csv, sweep_grid.csv, umax_table.pdf/.png, result.json, and
timeseries_R<R*>m.csv (every time step at R*) for each distinct R*; caps that share an R* share the file
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
from fps_common import InputError  # noqa: E402
from fps_common.io import run_json_main, make_outdir, write_csv, write_json, fmt_tag  # noqa: E402
from rstar_builder import (Parser, add_common_args, waveform_from_args, r_grid_from_args, physics_from_args,  # noqa: E402
                           sweep, select_rstar, grid_dict, grid_rows, GRID_HEADER, loss_label, describe,
                           command_line, write_timeseries)

MAX_CAPS = 10000
TABLE_HEADER = ["u_cap_mm", "status", "R_star_m", "L_star_g", "u_max_at_Rstar_mm", "a_max_actual_g", "a_rms_g",
                "n_feasible", "R_star_at_grid_edge", "timeseries_csv"]


def cap_list(u_min, u_max, du):
    if not (u_min > 0 and u_max >= u_min and du > 0):
        raise InputError("need 0 < --u-min-mm <= --u-max-mm and --du-mm > 0")
    n = int(np.floor((u_max - u_min) / du + 1e-9)) + 1
    if n > MAX_CAPS:
        raise InputError("%d caps requested; increase --du-mm" % n)
    return np.round(u_min + du * np.arange(n), 9)


def plot_table(rows, stem, title, p):
    from fps_common.plotstyle import plt, save, log_ticks
    u = np.array([r["u_cap_mm"] for r in rows])
    ok = np.array([r["status"] == "ok" for r in rows])
    get = lambda k: np.array([r[k] if r[k] is not None else np.nan for r in rows], float)  # noqa: E731
    panels = [("r_star_m", r"$R^{*}$ [m]"), ("L_star_g", loss_label(p).replace("(R)", r"(R^{*})")),
              ("a_max_star_g", r"$a_{\max,\mathrm{actual}}(R^{*})$ [$g$]")]
    fig, axs = plt.subplots(3, 1, figsize=(6.4, 6.4), sharex=True)
    for ax, (k, lab) in zip(axs, panels):
        y = get(k)
        ax.plot(u[ok], y[ok], "-", color="black", lw=0.7)
        ax.plot(u[ok], y[ok], "o", color="black", ms=2.8)
        if (~ok).any():
            lo = np.nanmin(y) if ok.any() else 0.0
            ax.plot(u[~ok], np.full((~ok).sum(), lo), "x", color="black", ms=4, mew=0.7, clip_on=False)
        ax.set_ylabel(lab)
    if (~ok).any():
        axs[0].plot([], [], "x", color="black", ms=4, mew=0.7, label=r"infeasible (no $R$ with $u_{\max}\leq u_{\mathrm{cap}}$)")
        axs[0].legend(loc="best", fontsize=8)
    rs = get("r_star_m")
    if ok.any() and np.nanmax(rs) / np.nanmin(rs) > 5:
        axs[0].set_yscale("log")
        lo, hi = axs[0].get_ylim()
        log_ticks(axs[0], lo, hi, axis="y")
    axs[-1].set_xlabel(r"Travel cap $u_{\mathrm{cap}}$ [mm]")
    axs[0].set_title(title, fontsize=9)
    fig.tight_layout()
    return save(fig, stem)


def run(argv, chan, ui=None):
    ap = Parser(prog="umax_table_builder.py", description=__doc__.split("\n")[0])
    add_common_args(ap, n_r_default=160)
    c = ap.add_argument_group("travel-cap range")
    c.add_argument("--u-min-mm", type=float, required=True, help="smallest u_cap [mm]")
    c.add_argument("--u-max-mm", type=float, required=True, help="largest u_cap [mm]")
    c.add_argument("--du-mm", type=float, required=True, help="u_cap step [mm]")
    a = ap.parse_args(argv)
    caps = cap_list(a.u_min_mm, a.u_max_mm, a.du_mm)
    wave = waveform_from_args(a)
    R = r_grid_from_args(a)
    phys = physics_from_args(a, wave)
    chan.event(event="start", script="umax_table_builder", n_r=len(R), n_caps=len(caps),
               steps=int(round(phys["duration"] / a.dt)))

    if ui is not None:
        with ui.progress("Simulating %d radii" % len(R)) as cb:
            sw = sweep(wave, R, progress=cb, **phys)
    else:
        sw = sweep(wave, R, progress=chan.progress_cb("simulate"), **phys)

    pga_tag = "pga" + fmt_tag(a.pga) if a.pga is not None else "native"
    outdir = make_outdir(a.out, "umaxtable", wave.meta["name"], pga_tag,
                         "ucap%s-%smm" % (fmt_tag(caps[0]), fmt_tag(caps[-1])))

    results, table, series = [], [], {}            # series: grid index of an R* -> its time-series file name
    for u in caps:
        sel = select_rstar(sw, u)
        i = sel["index"]
        if i is not None and i not in series:
            name = "timeseries_R%sm.csv" % fmt_tag(sw["R_m"][i])
            series[i] = name if name not in series.values() else "timeseries_R%sm_i%d.csv" % (fmt_tag(sw["R_m"][i]), i)
            write_timeseries(outdir / series[i], sw, i)
        row = dict(u_cap_mm=float(u), status=sel["status"], r_star_m=sel["r_star_m"], L_star_g=sel["L_star_g"],
                   u_max_star_mm=sel["u_max_star_mm"], a_max_star_g=sel["a_max_star_g"],
                   a_rms_star_g=sel["a_rms_star_g"], n_feasible=sel["n_feasible"], at_grid_edge=sel["at_grid_edge"],
                   timeseries_csv=series.get(i))
        table.append(row)
        results.append(dict(row, grid=grid_dict(sw, sel["feasible"])))
    files = dict(table_csv=outdir / "table.csv", sweep_csv=outdir / "sweep_grid.csv",
                 result_json=outdir / "result.json")
    write_csv(files["table_csv"], TABLE_HEADER,
              [(r["u_cap_mm"], r["status"], r["r_star_m"], r["L_star_g"], r["u_max_star_mm"], r["a_max_star_g"],
                r["a_rms_star_g"], r["n_feasible"], "" if r["at_grid_edge"] is None else int(r["at_grid_edge"]),
                r["timeseries_csv"]) for r in table])
    write_csv(files["sweep_csv"], GRID_HEADER[:-1], [row[:-1] for row in grid_rows(sw, sw["ok"])])
    files["plot_pdf"], files["plot_png"] = plot_table(table, outdir / "umax_table", describe(wave, phys), a.p)

    warnings = list(sw["warnings"])
    edge = [r["u_cap_mm"] for r in table if r["at_grid_edge"]]
    if edge:
        warnings.append("R* is at the edge of the R grid for u_cap = %s mm; widen --r-min/--r-max"
                        % ", ".join("%g" % v for v in edge))
    n_inf = sum(r["status"] != "ok" for r in table)
    if n_inf:
        warnings.append("%d of %d caps are infeasible (no R on the grid fits)" % (n_inf, len(table)))
    res = dict(ok=True, n_caps=len(caps), n_infeasible=n_inf, warnings=warnings,
               inputs=dict(**sw["params"], r_min=a.r_min, r_max=a.r_max, n_r=a.n_r, u_min_mm=a.u_min_mm,
                           u_max_mm=a.u_max_mm, du_mm=a.du_mm,
                           command=command_line("umax_table_builder.py", [s for s in argv if s != "--json"])),
               waveform=wave.meta, table=table, results=results, files={k: str(v) for k, v in files.items()})
    write_json(files["result_json"], res)
    if a.json:
        chan.result(res)
    elif ui is not None:
        ui.show_table(res)
    return res


def main():
    argv = sys.argv[1:]
    from fps_common import wizard
    if not argv:
        if not sys.stdin.isatty():
            sys.stderr.write("no arguments and no terminal: pass --u-min-mm/--u-max-mm/--du-mm (see --help)\n")
            return 2
        argv = wizard.ask_table()
        return wizard.run_interactive(run, argv, "umax_table_builder.py")
    if "--json" in argv:
        return run_json_main(run, argv)
    return wizard.run_interactive(run, argv, None)


if __name__ == "__main__":
    sys.exit(main())
