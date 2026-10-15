# FPS dish-radius tools

Two scripts for the spherical FPS isolator study (physics and conventions: `CLAUDE.md`).

| Script | What it does | Files written |
|---|---|---|
| `rstar_builder.py` | Grid search of the dish radius R for one waveform and one travel cap `u_cap`. Plots L(R) and highlights R\*. | `grid.csv`, `L_of_R.pdf/.png`, `result.json`, `timeseries.csv` (if R\* exists) |
| `umax_table_builder.py` | R\* for every `u_cap` from `--u-min-mm` to `--u-max-mm` in steps of `--du-mm`. | `table.csv`, `sweep_grid.csv`, `umax_table.pdf/.png`, `result.json`, `timeseries_R<R*>m.csv` per distinct R\* |

Outputs go to `out/<auto-name>_<timestamp>/`, or to `--out DIR`.

## Setup

```bash
python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

`data/elcentro_NS.csv` was decoded from CLAUDE.md Appendix B, with the checksum verified:
`.venv/bin/python reference/load_elcentro.py CLAUDE.md data/elcentro_NS.csv`.

## What is computed

- Simulator: `fps_ref.py` (CLAUDE.md A.2 and §3.7), a batched RK4 over all R values, with two friction models (`--friction`):
  - **`stickslip`** (default): separate static and kinetic friction. A slider at rest stays locked (`a_abs = a_g`) while the friction it needs is `|λ| ≤ μ_s`; otherwise it slides with `μ_k`. Breakaways and stops are located inside the time step, so there is no `v_eps` and no stiffness limit on `dt`.
  - **`tanh`**: the original appendix model, `sgn(v) → tanh(v/v_eps)` with one μ. It is kept unchanged so the older numbers can be reproduced. It needs `μ_s = μ_k`.
- Friction flags: `--mu` sets both coefficients; `--mu-s` / `--mu-k` override it. `μ_k ≤ μ_s` is required.
- With `μ_s > μ_k`, `a_abs` drops at each breakaway (from the static threshold to the kinetic level). The true peak falls between samples, so the reported `a_max` (and `L` for `--p inf`) includes the breakaway values. The peak of `a_abs_g` in the time-series CSV can therefore be slightly below the reported `a_max`.
- Loss: `L_p(R) = (mean_t |a_abs|^p)^(1/p)` in g, where `a_abs` is the transmitted acceleration. `--p 2` (the default) is `a_rms`, the notes' L2 loss. `--p inf` is the peak.
- Feasibility: `u_max(R) <= u_cap`. **R\*** is the minimiser of L over the feasible grid points. If no point is feasible, `status = "infeasible"` and `r_star_m = null`. A radius whose slider runs past the edge of the spherical cap (the simulation diverges) counts as infeasible and produces a warning.
- **Time steps at R\*.** When a feasible R\* exists, every RK4 step at R\* is written to a CSV with columns `t_s, ag_g, theta_rad, theta_dot_rad_s, theta_ddot_rad_s2, u_mm, u_dot_m_s, u_ddot_m_s2, a_abs_g, stuck` (`stuck` = 1 while static friction holds the slider; always 0 for `tanh`). `u` is the signed slider displacement relative to the dish, θ = arcsin(u/R), θ̇ = u̇/(R cos θ), θ̈ = ü/(R cos θ) + u u̇²/(R cos θ)³, `u_ddot` is the relative acceleration (a_abs − a_g) and `a_abs` the transmitted one. The columns are taken from the same batched run as the grid, so max |u| and the RMS of `a_abs` equal the reported `u_max` and `a_rms` exactly. The peak of `a_abs` matches `a_max` too, unless the peak is a breakaway instant between samples (see above). About 1.9 MB per file for 30 s at dt = 0.002 s. `umax_table_builder.py` writes one file per distinct R\* (`timeseries_R0.275246m.csv`); caps that share an R\* share the file.
- `umax_table_builder.py` simulates the R grid once and applies each cap to that sweep. It gives the same R\* as running `rstar_builder.py` once per cap (checked at 30 and 33 mm).
- Defaults: μ_s = μ_k = 0.10, `--friction stickslip`, dt = 0.002 s, v_eps = 1e-3 m/s (tanh only), R = geomspace(0.15, 6.0, 80) (160 for the table), duration = the whole record. **There is no default target PGA**: El Centro runs at its native 0.3188 g unless `--pga` is given.

## Waveform input

| Input | Flags |
|---|---|
| Built-in El Centro NS | `--source elcentro` (default), optionally `--pga 0.349` |
| CSV / text (time, acc) | `--source rec.csv --units g\|m/s2\|cm/s2`. Comma or whitespace separated; header lines are skipped |
| miniSEED with StationXML | `--source x.mseed --inventory x.xml --channel HN2 [--location 20] [--pre-filt 0.05,0.1,40,45]`. The response is removed to ACC after demeaning, as in `plot_hvsc.py` |
| miniSEED already in physical units | `--source PPSI.HNN.mseed --units cm/s2` (the Zenodo BMKG files) |

`--pga` amplitude-scales any source. `--t-start` drops the beginning of the record (the PGA is then taken from what remains). `--duration` sets the simulated length; past the end of the record the ground is at rest.

## Terminal use

```bash
.venv/bin/python rstar_builder.py           # wizard: prompts, progress bar, result panel, terminal plot
.venv/bin/python umax_table_builder.py      # wizard
.venv/bin/python rstar_builder.py --pga 0.349 --u-cap-mm 30 --duration 30
.venv/bin/python umax_table_builder.py --pga 0.349 --u-min-mm 25 --u-max-mm 40 --du-mm 1 --duration 30
```

The wizard prints the equivalent command line, so any interactive run can be repeated exactly. Every option is listed under `--help`.

## Calling from Node (`--json`)

- **stdout**: exactly one JSON object.
- **stderr**: newline-delimited JSON events, `{"event":"start",...}` and `{"event":"progress","stage":"simulate","done":k,"total":n}`, mixed with any plain log lines.
- **Exit code**: `0` ok (an infeasible result is also 0), `2` bad input, `1` internal error. On failure stdout is `{"ok":false,"type":"input"|"internal","error":"..."}`.

`rstar_builder.py --json` returns:
```
{ ok, status: "ok"|"infeasible", r_star_m, L_star_g, u_max_star_mm, a_max_star_g, a_rms_star_g,
  at_grid_edge, n_feasible, u_cap_mm, timeseries_csv, warnings[], inputs{..., command}, waveform{name, sha256, pga_native_g, pga_used_g, ...},
  grid{R_m[], u_max_mm[], L_g[], a_max_g[], a_rms_g[], feasible[]}, files{grid_csv, timeseries_csv, plot_pdf, plot_png, result_json} }
```

`umax_table_builder.py --json` returns:
```
{ ok, n_caps, n_infeasible, warnings[], inputs{...}, waveform{...},
  table[{u_cap_mm, status, r_star_m, L_star_g, u_max_star_mm, a_max_star_g, a_rms_star_g, n_feasible, at_grid_edge, timeseries_csv}],
  results[{...same fields..., grid{R_m[], u_max_mm[], L_g[], a_max_g[], a_rms_g[], feasible[]}}],   // one per cap
  files{table_csv, sweep_csv, plot_pdf, plot_png, result_json} }
```

`timeseries_csv` is the file name (in the output folder) of that cap's time steps at R\*, or `null` when infeasible; `files.timeseries_csv` is absent then. The time series itself is not in the JSON. NaN values (diverged radii) appear as `null`. Use `.venv/bin/python` as the interpreter. A working example is in `examples/call_from_node.mjs` (`node examples/call_from_node.mjs`).

## Verification (run 2026-10-12)

- `reference/check_ref.py .` passes with the modified `fps_ref.py`: period 1.73760 s, first drop 30.021 mm, rest position −8.665 mm. With stick-slip (2026-10-14) the rest position is −9.923 mm, exactly the last turning point: the old −8.665 mm was creep from the `tanh` regularisation.
- `rstar_builder.py --pga 0.349 --u-cap-mm 30 --duration 30 --friction tanh` gives R\* = 0.2752 m, u_max = 29.82 mm, a_rms = 0.0558 g, a_max = 0.2042 g. This is identical to the verbatim `reference/compare_notes.py` and to CLAUDE.md §6.1. The stick-slip default with μ = 0.10 gives R\* = 0.2884 m, u_max = 29.75 mm, a_rms = 0.0558 g, a_max = 0.1993 g. More stick-slip checks are in CLAUDE.md §6.
- A CSV copy of El Centro in m/s² gives the same R\*. The HVSC HN2 miniSEED loads with PGA 1.679 g (CLAUDE.md §5.5).

**Caveat:** absolute numbers are fps_ref's. The CLAUDE.md §6.1 discrepancy with the notes (a_rms 0.0387 g) is still unresolved. For production tables, use the owner's own record (`--source path`) once that is settled.

## Web GUI (`web/`)

A Next.js app that runs the two builders as **tasks**. A task is one script plus its arguments. You edit the arguments in form fields, inspect the waveform, press **Run / Re-run**, and then view the output table and interactive charts or download the files. Every run is kept, so older runs stay viewable from the run picker.

```bash
cd web
npm install
npm run build && npm start      # production, listens on 0.0.0.0:3000
npm run dev                     # development, same address
```

Open `http://localhost:3000`. From a phone or laptop on the same network, use `http://<this-mac's-LAN-IP>:3000` (`ipconfig getifaddr en0`), or the machine's Tailscale name.

**How it runs the scripts.** Route handlers in `web/app/api/` start `.venv/bin/python <script> --json ... --out web-data/tasks/<task>/runs/<run>/`, using the `--json` contract above (as in `examples/call_from_node.mjs`). Progress events go to the browser over server-sent events. The Python scripts are unchanged. `waveform_tool.py` is the only addition: it powers the waveform inspector (`channels PATH`, `preview <waveform flags>`) through the same `waveform_from_args`, so the preview is exactly what a run simulates.

**Time steps at R\*.** The results page has a *Time steps at R\** card (for a table run, it follows the selected cap). It charts u, θ, dθ/dt, d²θ/dt² or the transmitted vs ground acceleration (a peak-preserving subset of the points), lists every step in a sortable table, and links the CSV.

**Storage.** `web-data/tasks/<id>/task.json` holds the task and its run history, and each run folder holds `grid.csv` / `table.csv` / `sweep_grid.csv`, the `timeseries*.csv` files, the PDF/PNG figure, `result.json` and `log.txt`. Uploaded records go to `web-data/uploads/`. Uploads are never overwritten, so old runs stay reproducible. If the server stops mid-run, the run is killed and shows as *interrupted* after a restart.

**Waveform library.** The source picker lists built-in El Centro, every `.csv/.txt/.dat/.mseed` under `data/`, `indonesia_raw_waveforms (1)/raw/` and `severe_records/raw/`, and uploads. `.xml` files are offered as StationXML inventories. The server only accepts paths inside those folders.

| Env var | Default | Meaning |
|---|---|---|
| `FPS_ROOT` | parent of `web/` | where the Python scripts live |
| `FPS_PYTHON` | `$FPS_ROOT/.venv/bin/python` | interpreter |
| `FPS_DATA` | `$FPS_ROOT/web-data` | tasks and uploads |
| `FPS_WAVEFORM_DIRS` | `data:indonesia_raw_waveforms (1)/raw:severe_records/raw` | library folders, relative to `FPS_ROOT`, `:`-separated |
| `MAX_CONCURRENT` | `2` | simulations run at the same time; the rest are queued |

**Docker (VPS).** `docker compose up --build` builds one image with Node, the Python venv and the scripts, and serves on port 3000 with task data in the `fps-data` volume.

**No login.** Anyone who can reach port 3000 can run simulations, upload files and delete tasks. That is fine on a home LAN or a tailnet. On a VPS, keep the port closed to the internet (firewall, Tailscale, or an SSH tunnel), or put an authenticating reverse proxy in front.
