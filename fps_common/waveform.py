"""Load a ground-acceleration record as (t [s], a [g]) and optionally amplitude-scale it to a target PGA.

Sources:
  "elcentro"               built-in El Centro NS (data/elcentro_NS.csv, decoded from CLAUDE.md App. B)
  path.csv / .txt / .dat   two columns: time [s], acceleration [units]; comma or whitespace separated
  path.mseed               miniSEED via obspy; with an inventory (StationXML) the instrument response is
                           removed to acceleration, otherwise the samples are taken to be in `units` already
"""
import hashlib, pathlib
from dataclasses import dataclass, field
import numpy as np
from fps_common import InputError

ROOT = pathlib.Path(__file__).resolve().parent.parent
ELCENTRO_CSV = ROOT / "data" / "elcentro_NS.csv"
G = 9.80665
UNIT_TO_G = {"g": 1.0, "m/s2": 1.0 / G, "cm/s2": 0.01 / G}
MSEED_EXT = {".mseed", ".miniseed", ".ms"}


@dataclass
class Waveform:
    t: np.ndarray            # [s], starts at 0
    a_g: np.ndarray          # [g]
    meta: dict = field(default_factory=dict)

    @property
    def duration(self):
        return float(self.t[-1])


def _sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def _load_text(path, units):
    rows = []
    for line in pathlib.Path(path).read_text().splitlines():
        parts = line.replace(",", " ").split()
        if len(parts) < 2:
            continue
        try:
            rows.append((float(parts[0]), float(parts[1])))
        except ValueError:
            continue                                  # header or comment line
    if len(rows) < 2:
        raise InputError(f"{path}: found fewer than 2 numeric 'time acc' rows")
    d = np.array(rows)
    if np.any(np.diff(d[:, 0]) <= 0):
        raise InputError(f"{path}: time column is not strictly increasing")
    return d[:, 0] - d[0, 0], d[:, 1] * UNIT_TO_G[units], {}


def list_mseed_channels(path):
    from obspy import read
    st = read(str(path), headonly=True)
    return sorted({(tr.stats.location, tr.stats.channel) for tr in st})


def _load_mseed(path, channel, location, inventory, units, pre_filt):
    from obspy import read, read_inventory
    st = read(str(path))
    if channel:
        st = st.select(channel=channel)
    if location is not None:
        st = st.select(location=location)
    ids = sorted({tr.id for tr in st})
    if not ids:
        have = ", ".join("%s%s" % (loc + "." if loc else "", ch) for loc, ch in list_mseed_channels(path))
        raise InputError(f"{path}: no trace matches channel={channel!r} location={location!r}; available: {have}")
    if len(ids) > 1:
        raise InputError(f"{path}: several traces match, choose one with --channel/--location: {', '.join(ids)}")
    st.merge(method=1, fill_value=0)
    tr = st[0]
    extra = dict(trace_id=tr.id, starttime=str(tr.stats.starttime), sampling_rate=float(tr.stats.sampling_rate))
    if inventory:
        inv = read_inventory(str(inventory))
        tr.detrend("demean")
        tr.remove_response(inventory=inv, output="ACC", pre_filt=pre_filt)   # -> m/s^2
        a = tr.data / G
        extra.update(inventory=str(pathlib.Path(inventory).resolve()), response_removed=True,
                     pre_filt=list(pre_filt) if pre_filt else None)
    else:
        a = tr.data.astype(float) * UNIT_TO_G[units]
        extra.update(response_removed=False)
    t = np.arange(tr.stats.npts) * tr.stats.delta
    return t, np.asarray(a, float), extra


def load_waveform(source, *, units="g", channel=None, location=None, inventory=None, pre_filt=None,
                  t_start=0.0, pga=None):
    """Return a Waveform in g. `pga` (g) amplitude-scales the record (after the t_start crop); None = native."""
    from fps_ref import scale_to_pga
    if units not in UNIT_TO_G:
        raise InputError(f"unknown units {units!r}; use one of {sorted(UNIT_TO_G)}")
    if source == "elcentro":
        path = ELCENTRO_CSV
        if not path.exists():
            raise InputError(f"{path} missing; run: python reference/load_elcentro.py CLAUDE.md {path}")
        t, a, extra = _load_text(path, "g")
        name = "elcentro_NS"
    else:
        path = pathlib.Path(source).expanduser()
        if not path.exists():
            raise InputError(f"waveform file not found: {path}")
        if inventory and not pathlib.Path(inventory).expanduser().exists():
            raise InputError(f"inventory file not found: {inventory}")
        if path.suffix.lower() in MSEED_EXT:
            t, a, extra = _load_mseed(path, channel, location, inventory, units, pre_filt)
            name = path.stem + ("_" + channel if channel else "")
        else:
            t, a, extra = _load_text(path, units)
            name = path.stem
    if t_start:
        keep = t >= t_start
        if keep.sum() < 2:
            raise InputError(f"t_start={t_start} s is beyond the end of the record ({t[-1]:.2f} s)")
        t, a = t[keep] - t[keep][0], a[keep]
    native = float(np.abs(a).max())
    if native == 0:
        raise InputError(f"{path}: record is all zeros")
    if pga is not None:
        if pga <= 0:
            raise InputError("target PGA must be > 0 g")
        a = scale_to_pga(a, pga)
    meta = dict(name=name, source=str(source) if source == "elcentro" else str(path.resolve()),
                sha256=_sha256(path), units_in=units if source != "elcentro" else "g",
                n=int(len(t)), dt=float(np.median(np.diff(t))), length_s=float(t[-1]), t_start_s=float(t_start),
                pga_native_g=native, pga_target_g=pga, scale_factor=(pga / native) if pga is not None else 1.0,
                pga_used_g=float(np.abs(a).max()), **extra)
    return Waveform(t=np.asarray(t, float), a_g=np.asarray(a, float), meta=meta)
