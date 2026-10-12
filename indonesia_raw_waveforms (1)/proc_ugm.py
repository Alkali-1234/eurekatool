import sys, numpy as np
from obspy import read, read_inventory, UTCDateTime
d = sys.argv[1]
st = read(f"{d}/GE_UGM_20230630.mseed")
inv = read_inventory(f"{d}/GE_UGM.xml")
st.merge(method=1, fill_value=0)
st.detrend("demean"); st.detrend("linear")
st.taper(0.02)
st.remove_response(inventory=inv, output="ACC", pre_filt=(0.05, 0.1, 40, 45), water_level=None)
t0 = max(tr.stats.starttime for tr in st); t1 = min(tr.stats.endtime for tr in st)
st.trim(t0, t1)
g = 9.80665
out = {}
for tr in st:
    i = np.argmax(np.abs(tr.data))
    print(tr.id, "PGA = %.5f m/s^2 = %.5f g at t=%s (%.1f s after window start)" % (np.abs(tr.data[i]), np.abs(tr.data[i])/g, tr.stats.starttime+i*tr.stats.delta, i*tr.stats.delta))
    out[tr.stats.channel] = tr.data
n = min(len(v) for v in out.values())
t = np.arange(n)/st[0].stats.sampling_rate
np.savez(f"{sys.argv[2]}/ugm_acc.npz", t=t, t0=str(t0), **{k: v[:n] for k, v in out.items()})
print("common window", t0, t1, "n", n)
