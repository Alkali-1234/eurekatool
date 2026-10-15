"""Terminal front end (Rich prompts, progress bar, result panels, plotext previews).

The wizard only collects answers and turns them into an argv list, so an interactive run goes through the same
argparse path as a scripted one, and the equivalent command line is printed for reproducibility.
"""
import math, pathlib, shlex
from contextlib import contextmanager
import numpy as np
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, BarColumn, TextColumn, TaskProgressColumn, TimeElapsedColumn, TimeRemainingColumn
from rich.markup import escape
from rich.prompt import Prompt, Confirm
from rich.table import Table
from rich.text import Text
from fps_common import InputError
from fps_common.waveform import load_waveform, list_mseed_channels, UNIT_TO_G, MSEED_EXT

console = Console()
DEF = dict(mu=0.10, p="2", r_min=0.15, r_max=6.0, dt=0.002, v_eps=1e-3)


# ----------------------------------------------------------------------------------------------- prompts
def ask_number(label, default=None, *, blank_ok=False, cast=float, check=None, why=""):
    """Prompt until a valid number (or blank, if allowed) is entered. Returns the value or None."""
    shown = "" if default is None else str(default)
    while True:
        s = Prompt.ask(escape(label), default=shown, show_default=bool(shown)).strip()
        if s == "" and blank_ok:
            return None
        try:
            v = cast(s)
        except ValueError:
            console.print("[red]  not a number[/red]")
            continue
        if check and not check(v):
            console.print("[red]  out of range%s[/red]" % (": " + why if why else ""))
            continue
        return v


def _pick_channel(path):
    chans = list_mseed_channels(path)
    if len(chans) == 1:
        return chans[0]
    t = Table(title="Traces in %s" % path.name, show_edge=False)
    t.add_column("#"); t.add_column("location"); t.add_column("channel")
    for i, (loc, ch) in enumerate(chans, 1):
        t.add_row(str(i), loc or "-", ch)
    console.print(t)
    i = ask_number("Trace number", 1, cast=int, check=lambda v: 1 <= v <= len(chans))
    return chans[i - 1]


def ask_waveform():
    console.rule("[bold]Waveform")
    src = Prompt.ask("Waveform source", choices=["elcentro", "custom"], default="elcentro")
    argv, load_kw = [], {}
    if src == "custom":
        while True:
            path = pathlib.Path(Prompt.ask("Path to record (.csv/.txt/.dat or .mseed)").strip().strip("'\"")).expanduser()
            if path.is_file():
                break
            console.print("[red]  file not found[/red]")
        argv += ["--source", str(path)]
        load_kw["source"] = str(path)
        if path.suffix.lower() in MSEED_EXT:
            loc, ch = _pick_channel(path)
            argv += ["--channel", ch] + (["--location", loc] if loc else [])
            load_kw.update(channel=ch, location=loc or None)
            xmls = sorted(path.parent.glob("*.xml"))
            inv = Prompt.ask("StationXML inventory (blank = samples already in physical units)",
                             default=str(xmls[0]) if len(xmls) == 1 else "").strip().strip("'\"")
            if inv:
                argv += ["--inventory", inv]
                load_kw["inventory"] = inv
                pre = Prompt.ask(escape("Response pre-filter f1,f2,f3,f4 [Hz] (blank = none)"), default="",
                                 show_default=False).strip()
                if pre:
                    argv += ["--pre-filt", pre]
                    load_kw["pre_filt"] = tuple(float(v) for v in pre.split(","))
            else:
                units = Prompt.ask("Units of the samples", choices=sorted(UNIT_TO_G), default="cm/s2")
                argv += ["--units", units]
                load_kw["units"] = units
        else:
            units = Prompt.ask("Units of the acceleration column", choices=sorted(UNIT_TO_G), default="g")
            argv += ["--units", units]
            load_kw["units"] = units
    else:
        load_kw["source"] = "elcentro"
    try:
        w = load_waveform(**load_kw)
    except InputError as e:
        console.print("[red]%s[/red]" % e)
        raise SystemExit(2)
    console.print("  [dim]%s: %d samples, dt = %.4g s, length %.2f s, native PGA %.4f g[/dim]"
                  % (w.meta["name"], w.meta["n"], w.meta["dt"], w.meta["length_s"], w.meta["pga_native_g"]))
    pga = ask_number("Target PGA [g] (blank = native %.4f g)" % w.meta["pga_native_g"], blank_ok=True,
                     check=lambda v: v > 0, why="must be > 0")
    if pga is not None:
        argv += ["--pga", "%g" % pga]
    dur = ask_number("Simulated duration [s] (blank = whole record, %.2f s)" % w.meta["length_s"], blank_ok=True,
                     check=lambda v: v > 0, why="must be > 0")
    if dur is not None:
        argv += ["--duration", "%g" % dur]
    return argv


def ask_physics(n_r_default):
    console.rule("[bold]Physics and R grid")
    argv = []
    mu_s = ask_number("Static friction coefficient mu_s", DEF["mu"], check=lambda v: v >= 0, why="must be >= 0")
    mu_k = ask_number("Kinetic friction coefficient mu_k", mu_s, check=lambda v: 0 <= v <= mu_s,
                      why="must be between 0 and mu_s")
    p = ask_number("Loss norm p (2 = RMS, inf = peak)", DEF["p"], check=lambda v: v >= 1, why="must be >= 1")
    r_min = ask_number("R min [m]", DEF["r_min"], check=lambda v: v > 0, why="must be > 0")
    r_max = ask_number("R max [m]", DEF["r_max"], check=lambda v: v > r_min, why="must be > R min")
    n_r = ask_number("Number of R values (log-spaced)", n_r_default, cast=int, check=lambda v: v >= 2)
    argv += ["--mu", "%g" % mu_s] if mu_s == mu_k else ["--mu-s", "%g" % mu_s, "--mu-k", "%g" % mu_k]
    argv += ["--p", "%g" % p, "--r-min", "%g" % r_min, "--r-max", "%g" % r_max, "--n-r", str(n_r)]
    if Confirm.ask(escape("Change numerical settings (dt = %g s, friction model = stickslip)?" % DEF["dt"]), default=False):
        dt = ask_number("Time step dt [s]", DEF["dt"], check=lambda v: v > 0)
        argv += ["--dt", "%g" % dt]
        if mu_s == mu_k and Prompt.ask("Friction model", choices=["stickslip", "tanh"], default="stickslip") == "tanh":
            ve = ask_number("Friction regularisation v_eps [m/s]", DEF["v_eps"], check=lambda v: v > 0)
            argv += ["--friction", "tanh", "--v-eps", "%g" % ve]
    return argv


def ask_rstar():
    console.print(Panel("[bold]R* builder[/bold]\nGrid search of the dish radius R for one waveform and one "
                        "travel cap u_cap.", expand=False))
    argv = ask_waveform()
    console.rule("[bold]Travel cap")
    u = ask_number("u_cap [mm] (feasible if u_max <= u_cap)", 30, check=lambda v: v > 0, why="must be > 0")
    return argv + ["--u-cap-mm", "%g" % u] + ask_physics(80)


def ask_table():
    console.print(Panel("[bold]u_max table builder[/bold]\nR* for every travel cap u_cap in a range "
                        "(one shared R sweep).", expand=False))
    argv = ask_waveform()
    console.rule("[bold]Travel-cap range")
    lo = ask_number("u_cap min [mm]", 20, check=lambda v: v > 0, why="must be > 0")
    hi = ask_number("u_cap max [mm]", 40, check=lambda v: v >= lo, why="must be >= min")
    du = ask_number("u_cap step [mm]", 1, check=lambda v: v > 0, why="must be > 0")
    return argv + ["--u-min-mm", "%g" % lo, "--u-max-mm", "%g" % hi, "--du-mm", "%g" % du] + ask_physics(160)


def run_interactive(run, argv, script):
    """Run with the Rich front end (progress bar + result panel). script=None skips echoing the command."""
    import sys
    if script:
        console.print("\n[dim]Equivalent command:[/dim] %s\n" % " ".join(shlex.quote(s) for s in ["python", script, *argv]))
    from fps_common.io import JsonChannel
    try:
        run(argv, JsonChannel(False), ui=sys.modules[__name__])
    except InputError as e:
        console.print("[red]error:[/red] %s" % e)
        return 2
    return 0


# ----------------------------------------------------------------------------------------------- output
@contextmanager
def progress(label):
    with Progress(TextColumn("{task.description}"), BarColumn(), TaskProgressColumn(), TimeElapsedColumn(),
                  TimeRemainingColumn(), console=console) as pr:
        task = pr.add_task(label, total=1)

        def cb(done, total):
            pr.update(task, total=total, completed=done)
        yield cb


def _fmt(v, f):
    return "-" if v is None or (isinstance(v, float) and not math.isfinite(v)) else f % v


def _warnings(res):
    for w in res.get("warnings", []):
        console.print("[yellow]warning:[/yellow] %s" % w)


def _files(res):
    paths = [pathlib.Path(v) for v in res["files"].values()]
    console.print("[bold]Output folder:[/bold] %s" % paths[0].parent, soft_wrap=True)
    console.print("  " + "  ".join(p.name for p in paths))


def _plotext(build):
    import plotext as plt
    plt.clear_figure()
    plt.plotsize(min(console.width, 100), 20)
    plt.theme("clear")
    build(plt)
    console.print(Text.from_ansi(plt.build()))


def show_rstar(res):
    g = res["grid"]
    R, L = np.array(g["R_m"], float), np.array([np.nan if v is None else v for v in g["L_g"]], float)
    feas = np.array(g["feasible"], bool)

    def build(plt):
        plt.xscale("log")
        ok, bad = feas & np.isfinite(L), ~feas & np.isfinite(L)
        if ok.any():
            plt.scatter(R[ok].tolist(), L[ok].tolist(), marker="•", label="feasible")
        if bad.any():
            plt.scatter(R[bad].tolist(), L[bad].tolist(), marker="x", label="u_max > u_cap")
        if res["status"] == "ok":
            plt.scatter([res["r_star_m"]], [res["L_star_g"]], marker="@", label="R*")
        plt.title("L(R)")
        plt.xlabel("R [m]")
        plt.ylabel("L [g]")
    _plotext(build)

    t = Table(show_header=False, show_edge=False, box=None)
    t.add_column(style="bold"); t.add_column()
    if res["status"] == "ok":
        t.add_row("R*", "%.4f m" % res["r_star_m"])
        t.add_row("L(R*)", "%.5f g  (p = %s)" % (res["L_star_g"], _fmt(res["inputs"]["p"], "%g")))
        t.add_row("u_max(R*)", "%.2f mm  <=  u_cap %g mm" % (res["u_max_star_mm"], res["u_cap_mm"]))
        t.add_row("a_max(R*)", "%.5f g" % res["a_max_star_g"])
        t.add_row("a_rms(R*)", "%.5f g" % res["a_rms_star_g"])
    else:
        t.add_row("status", "[red]infeasible[/red]: u_max > %g mm for every R on the grid" % res["u_cap_mm"])
    t.add_row("feasible", "%d / %d radii" % (res["n_feasible"], len(R)))
    t.add_row("PGA", "%.4f g" % res["waveform"]["pga_used_g"])
    i = res["inputs"]
    t.add_row("friction", "mu_s = %g, mu_k = %g (%s)" % (i["mu_s"], i["mu_k"], i["friction"]))
    console.print(Panel(t, title="R* result", expand=False))
    _warnings(res)
    _files(res)


def show_table(res):
    rows = res["table"]
    t = Table(title="u_cap -> R*", show_edge=False)
    for h in ["u_cap [mm]", "R* [m]", "L* [g]", "u_max(R*) [mm]", "a_max [g]", "a_rms [g]"]:
        t.add_column(escape(h), justify="right")
    for r in rows:
        if r["status"] == "ok":
            t.add_row("%g" % r["u_cap_mm"], "%.4f" % r["r_star_m"], "%.5f" % r["L_star_g"],
                      "%.2f" % r["u_max_star_mm"], "%.5f" % r["a_max_star_g"], "%.5f" % r["a_rms_star_g"])
        else:
            t.add_row("%g" % r["u_cap_mm"], "[red]infeasible[/red]", "-", "-", "-", "-")
    ok = [r for r in rows if r["status"] == "ok"]

    def build(plt):
        if ok:
            plt.plot([r["u_cap_mm"] for r in ok], [r["r_star_m"] for r in ok], marker="•", label="R*")
        plt.title("R*(u_cap)")
        plt.xlabel("u_cap [mm]")
        plt.ylabel("R* [m]")
    if ok:
        _plotext(build)
    console.print(t)
    _warnings(res)
    _files(res)
    ts = sorted({r["timeseries_csv"] for r in rows if r["timeseries_csv"]})
    if ts:
        console.print("  time series at R*: " + "  ".join(ts))
