#!/usr/bin/env python3
"""Waveform helper for the web GUI: list miniSEED traces, or preview a record exactly as the builders load it.

  python waveform_tool.py channels PATH
      -> {"ok": true, "channels": [{"location": "20", "channel": "HN1"}, ...]}
  python waveform_tool.py preview [the builders' waveform flags: --source --pga --units --channel --location
                                   --inventory --pre-filt --t-start --duration]
      -> {"ok": true, "meta": {...}, "t": [...], "a_g": [...], "stats": {...}, "spectrum": {"f": [...], "amp": [...]}}

Same JSON contract as the builders (fps_common/io.py): one object on stdout, exit 0 / 1 / 2.
The preview goes through rstar_builder.waveform_from_args, so t_start, pga, units and response removal are identical
to what a run would simulate. Time series are min/max-decimated for plotting so the peaks survive.
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
from fps_common import InputError  # noqa: E402
from fps_common.io import run_json_main  # noqa: E402
from fps_common.waveform import list_mseed_channels  # noqa: E402

MAX_POINTS = 4000
MAX_SPECTRUM_POINTS = 600


def minmax_decimate(t, a, n_max=MAX_POINTS):
    """Keep the min and the max of each bucket (in time order), so a plot of ~n_max points shows every peak."""
    if len(t) <= n_max:
        return t, a
    n_buckets = n_max // 2
    edges = np.linspace(0, len(t), n_buckets + 1).astype(int)
    keep = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        if hi <= lo:
            continue
        seg = a[lo:hi]
        i, j = lo + int(np.argmin(seg)), lo + int(np.argmax(seg))
        keep.extend(sorted({i, j}))
    keep = np.array(keep)
    return t[keep], a[keep]


def fourier_spectrum(t, a):
    """Single-sided Fourier amplitude |A(f)|*dt [g·s], log-spaced subsample for a log-log plot."""
    dt = float(np.median(np.diff(t)))
    amp = np.abs(np.fft.rfft(a)) * dt
    f = np.fft.rfftfreq(len(a), dt)
    f, amp = f[1:], amp[1:]                                   # drop DC
    if len(f) > MAX_SPECTRUM_POINTS:
        idx = np.unique(np.geomspace(1, len(f), MAX_SPECTRUM_POINTS).astype(int) - 1)
        f, amp = f[idx], amp[idx]
    return dict(f=f, amp=amp)


def run_channels(argv, chan):
    if len(argv) != 1:
        raise InputError("usage: waveform_tool.py channels PATH")
    path = pathlib.Path(argv[0]).expanduser()
    if not path.is_file():
        raise InputError(f"file not found: {path}")
    try:
        chans = list_mseed_channels(path)
    except Exception as e:                                        # noqa: BLE001 - obspy raises many types
        raise InputError(f"{path.name}: not readable as miniSEED ({type(e).__name__}: {e})")
    chan.result(dict(ok=True, channels=[dict(location=loc, channel=ch) for loc, ch in chans]))


def run_preview(argv, chan):
    from rstar_builder import Parser, add_common_args, waveform_from_args
    ap = Parser(prog="waveform_tool.py preview")
    add_common_args(ap, n_r_default=80)
    a = ap.parse_args(argv)
    wave = waveform_from_args(a)
    t, ag = wave.t, wave.a_g
    i_pk = int(np.argmax(np.abs(ag)))
    td, ad = minmax_decimate(t, ag)
    duration_used = a.duration if a.duration is not None else wave.duration
    stats = dict(pga_g=float(abs(ag[i_pk])), t_pga_s=float(t[i_pk]), a_pga_g=float(ag[i_pk]),
                 rms_g=float(np.sqrt(np.mean(ag ** 2))), duration_used_s=float(duration_used),
                 n_plotted=int(len(td)))
    chan.result(dict(ok=True, meta=wave.meta, t=td, a_g=ad, stats=stats, spectrum=fourier_spectrum(t, ag)))


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("channels", "preview"):
        sys.stderr.write(__doc__)
        return 2
    cmd, argv = sys.argv[1], sys.argv[2:]
    return run_json_main(run_channels if cmd == "channels" else run_preview, argv)


if __name__ == "__main__":
    sys.exit(main())
