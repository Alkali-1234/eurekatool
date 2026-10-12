"""Re-fetch the open seismic records used in this project and print their peak accelerations.
Needs: pip install obspy numpy  (network access to geofon.gfz-potsdam.de, zenodo.org, service.geonet.org.nz)
Usage: python fetch_data.py OUTDIR
"""
import sys, json, pathlib, urllib.request, numpy as np
from obspy import read, read_inventory
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
G = 9.80665
def get(url, dest):
    dest = out/dest
    if not dest.exists():
        with urllib.request.urlopen(url, timeout=120) as r: dest.write_bytes(r.read())
    return dest

# 1) GE.UGM (Yogyakarta, GEOFON/BMKG), Mw5.9 2023-06-30 12:57:42 UTC, 100 Hz accelerometer HN?
q = "net=GE&sta=UGM&cha=HN?&"
ms = get("https://geofon.gfz-potsdam.de/fdsnws/dataselect/1/query?" + q + "start=2023-06-30T12:57:00&end=2023-06-30T13:02:00", "GE_UGM_20230630.mseed")
xm = get("https://geofon.gfz-potsdam.de/fdsnws/station/1/query?" + q + "level=response&format=xml", "GE_UGM.xml")
st = read(str(ms)); inv = read_inventory(str(xm))
st.merge(method=1, fill_value=0); st.detrend("demean"); st.detrend("linear"); st.taper(0.02)
st.remove_response(inventory=inv, output="ACC", pre_filt=(0.05, 0.1, 40, 45), water_level=None)
for tr in st: print("GE.UGM  %s  PGA = %.5f g" % (tr.stats.channel, np.abs(tr.data).max()/G))

# 2) BMKG strong-motion, 2010 Mentawai Mw7.8 (Zenodo 3351683, CC-BY-4.0; already in cm/s^2)
rec = json.load(urllib.request.urlopen("https://zenodo.org/api/records/3351683", timeout=60))
for f in rec["files"]:
    if f["key"].startswith("PPSI") and f["key"].endswith(".mseed"):
        p = get(f["links"]["self"], f["key"]); tr = read(str(p))[0]
        print("BM.PPSI %s  peak = %.3f cm/s^2 = %.4f g" % (f["key"][5:8], np.abs(tr.data).max(), np.abs(tr.data).max()/980.665))
    elif not (out/f["key"]).exists(): get(f["links"]["self"], f["key"])

# 3) Severe analogue (NOT Indonesian): NZ.HVSC, Christchurch Mw6.2 2011-02-21 23:51 UTC, 200 Hz, loc 20
q = "net=NZ&sta=HVSC&loc=20&cha=HN?&"
ms = get("https://service.geonet.org.nz/fdsnws/dataselect/1/query?" + q + "start=2011-02-21T23:51:30&end=2011-02-21T23:52:30", "NZ_HVSC_2011.mseed")
xm = get("https://service.geonet.org.nz/fdsnws/station/1/query?" + q + "level=response&format=xml&starttime=2011-02-21&endtime=2011-02-22", "NZ_HVSC.xml")
st = read(str(ms)); inv = read_inventory(str(xm)); st.detrend("demean"); st.remove_response(inventory=inv, output="ACC")
for tr in st: print("NZ.HVSC %s  PGA = %.3f g" % (tr.stats.channel, np.abs(tr.data).max()/G))
