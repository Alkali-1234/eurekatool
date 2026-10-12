"""Decode the El Centro NS record embedded in FPS_PROJECT_CONTEXT.md.
Usage: python3 load_elcentro.py [FPS_PROJECT_CONTEXT.md] [OUT.csv]
Writes a 'time,acc_g' CSV (time in s, acceleration in g) and checks its SHA-256."""
import sys, re, zlib, base64, hashlib, pathlib
import numpy as np
EXPECTED = "e45940d6dee1cc55d2293195f133dc8429d0a5214d860ffa2247027f4ed92133"
md = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "FPS_PROJECT_CONTEXT.md").read_text()
fence = "`" * 3
m = re.search("ELCENTRO_B64_" + "BEGIN -->\\s*" + fence + "text\\n(.*?)\\n" + fence, md, re.S)
raw = zlib.decompress(base64.b64decode(m.group(1)))
ai = np.cumsum(np.frombuffer(raw, "<i4").astype(np.int64))          # units of 1e-6 g
csv = "".join("%.2f,%.6f\n" % (k * 0.02, v / 1e6) for k, v in enumerate(ai))
assert hashlib.sha256(csv.encode()).hexdigest() == EXPECTED, "checksum mismatch"
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "elcentro_NS.csv"); out.write_text(csv)
print("wrote %s: %d samples, dt=0.02 s, PGA = %.4f g, checksum OK" % (out, len(ai), np.abs(ai).max() / 1e6))
