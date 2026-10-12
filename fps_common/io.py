"""Output plumbing shared by both scripts: JSON-mode stdout guarding, NDJSON progress, CSV, output folders.

Contract for external callers (e.g. a Node backend) when --json is passed:
  stdout  exactly one JSON object, written at the end ({"ok": true, ...} or {"ok": false, "error": ...})
  stderr  newline-delimited JSON events ({"event": "progress", ...}) plus any library chatter
  exit    0 = ok (including an "infeasible" result), 1 = internal error, 2 = bad input
"""
import csv, datetime, json, math, pathlib, sys, traceback
import numpy as np
from fps_common import InputError

ROOT = pathlib.Path(__file__).resolve().parent.parent


def jsonable(o):
    """numpy -> Python, NaN/inf -> None (JSON has no NaN)."""
    if isinstance(o, dict):
        return {k: jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [jsonable(v) for v in o]
    if isinstance(o, np.ndarray):
        return jsonable(o.tolist())
    if isinstance(o, (np.bool_, bool)):
        return bool(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        o = float(o)
        return o if math.isfinite(o) else None
    if isinstance(o, pathlib.Path):
        return str(o)
    return o


class JsonChannel:
    """In --json mode, keep the real stdout for the final result and send everything else to stderr."""

    def __init__(self, enabled):
        self.enabled = enabled
        self.stdout = sys.stdout
        if enabled:
            sys.stdout = sys.stderr

    def event(self, **kw):
        if self.enabled:
            sys.stderr.write(json.dumps(jsonable(kw)) + "\n"); sys.stderr.flush()

    def progress_cb(self, stage):
        def cb(done, total):
            self.event(event="progress", stage=stage, done=done, total=total)
        return cb

    def result(self, obj):
        self.stdout.write(json.dumps(jsonable(obj)) + "\n"); self.stdout.flush()


def run_json_main(main, argv):
    """Run main(argv, chan) and translate exceptions into the JSON error contract."""
    chan = JsonChannel(True)
    try:
        main(argv, chan)
        return 0
    except InputError as e:
        chan.result(dict(ok=False, type="input", error=str(e)))
        return 2
    except Exception as e:                                           # noqa: BLE001 - report every failure as JSON
        traceback.print_exc(file=sys.stderr)
        chan.result(dict(ok=False, type="internal", error="%s: %s" % (type(e).__name__, e)))
        return 1


def make_outdir(out, prefix, *parts):
    if out:
        d = pathlib.Path(out).expanduser()
    else:
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        d = ROOT / "out" / "_".join([prefix, *[str(p) for p in parts if p], stamp])
    d.mkdir(parents=True, exist_ok=True)
    return d.resolve()


def write_csv(path, header, rows):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        for r in rows:
            w.writerow(["" if v is None else ("%.10g" % v if isinstance(v, float) else v) for v in r])


def write_json(path, obj):
    pathlib.Path(path).write_text(json.dumps(jsonable(obj), indent=1) + "\n")


def fmt_tag(x):
    """Short filename-safe number tag: 0.349 -> '0.349', 30.0 -> '30'."""
    return ("%g" % x).replace("/", "")
