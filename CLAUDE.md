# FPS seismic isolator — project handoff for Claude Code

EUREKA! ITB 2026 (Physics) · curved *umpak batu* friction-pendulum-style (FPS) isolator
Generated 2026-10-12 from a cloud session. Everything marked **verified** was run in that session; everything marked **from notes** is the owner's own earlier work, copied faithfully and *not* re-checked.

## 0. How to use this file

- Drop it in the repo root as `CLAUDE.md` (or `docs/CONTEXT.md` and point `CLAUDE.md` at it).
- §1–2 are project context and working conventions. §3–4 are the physics. §5 is the seismic input. §6 is what has and has not been verified. §7 is what to do next.
- Appendix A holds runnable code. Every code block starts with a `# FILE: <name>` line; extract them all with:

```bash
python3 - <<'EOF'
import re, pathlib
t = pathlib.Path("FPS_PROJECT_CONTEXT.md").read_text()
f = "`" * 3
for m in re.finditer(f + r"(?:python|bash)\n# FILE: (\S+)\n(.*?)\n" + f, t, re.S):
    pathlib.Path(m.group(1)).write_text(m.group(2) + "\n"); print("wrote", m.group(1))
EOF
```

- Appendix B holds the El Centro record, compressed. **Do not print it into the conversation** (about 3 kB of base64); decode it with `load_elcentro.py`.
- Python needs `numpy`, `sympy` and `obspy` (`pip install numpy sympy obspy`).

## 1. Project snapshot (from notes)

- Team: three members, referred to by initials only: A, K, K.
- Prototype/model geometry is still being designed. The stone (dish) width is a **free design variable**, not a fixed input; a 10 cm dish / 3 cm slider is not a given.
- Working on the L2 loss formulation and on finding the optimal dish radius R.
- Expanded beyond the spherical base (which leaves the L2 loss with one variable) to non-spherical dish profiles: spline / free-form profile, scoped to **1D shaking** for now. The 1D exploration is done (results in §4). A 9-page LaTeX report with figures covered the generalized EOM, the curvature-spline construction and the sphere / ellipse / saturating / free-form comparison. *That report is not in this file; where it disagrees with this file, the report is the owner's source.*
- **Scope decision:** the research's final result is narrowed to a correlation between three variables: `u_cap` (isolator size), `a_max_actual` (isolation effectiveness) and `C_est` (cost estimate). This is meant to close out the objectives in Bab I of the extended abstract.
- **Cost success criterion** (extended abstract): `C_est` must be lower than the repair cost the house would incur without the FPS. Linking `a_max` to damage (fragility curves) is future work, not part of the method.
- **Open decisions** coming out of the 1D work:
  - change the acceleration norm (a p-norm generalization was proposed; p = 2 is current, p = 4–6 suggested over a hard max);
  - add a residual-offset term to the loss;
  - lower μ so geometry rather than friction carries the restoring action.
- **Seismic input decision (2026-10-12):** use the **1940 El Centro NS record, amplitude-scaled to an Indonesian design level** (see §5). The target PGA has **not been chosen yet** (§7, item 1).

## 2. Working conventions (from the owner)

- Explanations: slow, pedagogical, explicit "why" before "how". Step-by-step derivations with intermediate state tables work well. If the owner says the pace is too fast, re-explain from first principles.
- **Before executing tasks, be at least 95% confident about what you are going to do. Plan before you ask, and ask clarifying questions whenever information is missing.**
- **Scientific documents: fit the LaTeX style, black and white only** (no colour in figures).
- The owner works iteratively: proposes their own formula or approach first, then works with Claude to find errors. Validates numerical results with an independent method (for example brute-force grid search next to gradient descent). Does prior-art research before committing to an angle. Runs simulation and experiment tracks in parallel. Ends major sessions with formal deliverables (`.docx`, `.pdf`, `.py`, `.tex`).
- Tools: Python, PyTorch, NumPy/SciPy (`UnivariateSpline`), OpenCV. Fusion 360, 3D printing (PLA), PTFE tape / HDPE friction interfaces. RK4 and Newmark-β time stepping. LaTeX with TikZ, LibreOffice headless for PDF conversion, `pdftoppm` for visual review. Phone camera + OpenCV displacement tracking for the physical prototype.
- Long jobs: launch with `setsid nohup … < /dev/null &` and poll log files.

## 3. FPS physics: derivation

### 3.1 Model and assumptions

A point mass `m` (slider plus the mass it carries) slides on a fixed rigid dish with profile `y = f(x)` in the base frame. `f(0) = 0`, `f'(0) = 0`, `f'' ≥ 0`, `f` even (convex, symmetric). The base moves horizontally with ground acceleration `ẍ_g(t)` (1D; vertical ground motion neglected). Friction is Coulomb with one coefficient `μ` (static = kinetic). `x` is the horizontal displacement of the slider **relative to the base**, so travel `u = |x|`.

### 3.2 Kinematics

Work in the base frame, which is non-inertial: add the fictitious force `−m ẍ_g x̂`.

- `s = √(1 + f'²)`
- unit tangent `t = (1, f')/s` (its x-component is positive, so the sliding direction has the same sign as `ẋ`)
- unit normal `n = (−f', 1)/s`
- position `(x, f(x))`, so `ÿ = f' ẍ + f'' ẋ²`

### 3.3 Newton's law

Forces on the slider: gravity `(0, −mg)`, normal `N n` (`N ≥ 0`), friction `−μ N σ t` with `σ = sgn(ẋ)`, fictitious `(−m ẍ_g, 0)`.

```
x:  m ẍ            = −N f'/s − μ N σ /s − m ẍ_g
y:  m (f' ẍ + f'' ẋ²) =  N /s − μ N σ f'/s − m g
```

Put `ν = N/(m s)`. Then

```
(a)  ẍ + ẍ_g          = −ν (f' + μσ)
(b)  f' ẍ + f'' ẋ² + g =  ν (1 − μσ f')
```

### 3.4 Solving for ẍ and N

Substitute (a) into (b). The `μσ` terms cancel:

```
−f' ẍ_g − ν f'(f' + μσ) + f'' ẋ² + g = ν (1 − μσ f')
⇒  ν (1 + f'²) = g + f'' ẋ² − f' ẍ_g
⇒  N = m (g + f'' ẋ² − f' ẍ_g) / √(1 + f'²)
```

Put `ν` back into (a):

```
(1 + f'²) ẍ + f' f'' ẋ² + g f' + μ σ ( g + f'' ẋ² − f' ẍ_g ) = −ẍ_g        (EOM)
```

For code:

```
ẍ = [ −ẍ_g − g f' − f' f'' ẋ² − μ σ ( g + f'' ẋ² − f' ẍ_g ) ] / (1 + f'²)
```

**Verified** symbolically (`verify_eom.py`): after solving the two force equations for `ẍ` and `N`, the residual of (EOM) is exactly 0, `N/m` matches the formula above, and `m` cancels from `ẍ`. This agrees with the EOM in the owner's notes.

### 3.5 Consequences

1. **Mass independence.** `m` cancels for *any* convex profile (the `√(1+f'²)` in the normal force cancels the one in the friction generalized force). A uniform radius across all columns is therefore physically correct and also helps torsional self-correction.
2. **Transmitted (absolute) acceleration** of the supported structure:

   ```
   ẍ_abs = ẍ + ẍ_g = −(f' + μσ)(g + f'' ẋ² − f' ẍ_g)/(1 + f'²)
   ```

   For small slope and slow motion (`f''ẋ² ≪ g`, `|f' ẍ_g| ≪ g`): **`ẍ_abs ≈ −g ( f'(x) + μ σ )`**. It is bounded by `g (max|f'| + μ)` regardless of how hard the ground shakes. That bound is the isolation mechanism. While the slider sticks, `ẍ_abs = ẍ_g`.
3. **Design variable.** The profile enters only through the slope function `f'(x)`. The sphere is the linear case `f' = x/R`.
4. **Sphere.** `f = R − √(R² − x²)`, `f' = x/√(R² − x²) = tan θ` with `sin θ = x/R`, `f'' = R²/(R² − x²)^{3/2}`. For `μ = 0` and small amplitude: `ẍ + (g/R) x = −ẍ_g`, so `T = 2π√(R/g)`, independent of mass. **Verified** numerically: `R = 0.75 m` gives `T = 1.73760 s` in the simulator and from the formula.
5. **Peak transmitted acceleration (small angle):** `a_max ≈ g (μ + u_max/R)`. At the turning point, still moving outward, the restoring force and friction both point inward. After reversal friction flips and the magnitude drops to `g (u_max/R − μ)`. **Verified** on one case: bound 0.2083 g against simulated 0.2042 g (R = 0.275 m, §6).
6. **μ and R are coupled.** In `a_max = g (μ + u_max/R)`, μ looks separable, but `u_max` is itself a strong function of μ. Choose them jointly (from notes).
7. **Stick condition.** At relative rest (`ẋ = 0`, `ẍ = 0`), let `λ` be the friction-to-normal ratio the contact must supply. From (a), with `ν = (g − f' ẍ_g)/(1 + f'²)`:

   ```
   λ = −f' − ẍ_g (1 + f'²) / (g − f' ẍ_g),       stick  ⇔  |λ| ≤ μ
   ```

   With no ground motion this is `|f'(x)| ≤ μ`: **the slider rests anywhere in a band** (sphere: `|x| ≲ μR`). **Verified:** in a free-decay run (`μ = 0.02`, `R = 0.75`) the amplitude drops by 30.02 mm per half cycle (prediction `2μR = 30 mm`) and the slider stops at −8.7 mm, inside the 15 mm band.
8. **Travel limit.** The slider must stay inside the dish: `u_max ≤ u_cap = (D_dish − D_slider)/2 − margin`. A radius that wins on acceleration but overruns `u_cap` is not a valid design (from notes).

### 3.6 Numerics

- Friction is regularised, `σ → tanh(ẋ / v_eps)`; RK4; ground acceleration interpolated linearly onto half-steps.
- **Timestep gotcha (from notes):** displacement converges long before acceleration, because regularised friction makes the acceleration channel stiff. At `dt = 0.005 s` `u_max` was converged to 3 digits while `a_rms` was inflated 68 % (0.0651 vs 0.0387). Use `dt = 0.002 s` and never validate convergence on displacement alone.
- Stability: the friction term has stiffness about `μ g / v_eps`; RK4 needs `dt · μ g / v_eps ≲ 2.8`. With `μ = 0.1`, `v_eps = 1e-3 m/s`, `dt = 0.002 s` that product is 1.96.
- **Verified** (`convergence.py` result, §6): with `v_eps = 1e-3`, results are identical for `dt = 2, 1, 0.5 ms`. Results do depend on `v_eps`: `u_max` 29.81 mm at 1e-3 versus 29.48 mm at 1e-4 (R = 0.275 m), 32.03 mm at 1e-2. Use `v_eps ≤ 1e-3`.

## 4. Free-form dish and learnings (from notes, not re-checked)

### 4.1 Curvature-spline parametrisation

Parametrise the **curvature** `κ ≡ f''` rather than the surface: `κ(x) = softplus(θ)` at knots, piecewise-linear in between, integrated once for `f'` and twice for `f`. This structurally guarantees `f'(0) = 0`, `f'` monotone, convexity and odd symmetry, so no penalty terms are needed and θ-space has no infeasible region. Sphere = constant κ, cone = κ spiked at 0, ellipse = κ increasing. Integration smooths knot noise, so a jagged κ still gives a millable `f`.

Closed forms on `[x_i, x_{i+1}]` with `d = x − x_i` and `s_i = (κ_{i+1} − κ_i)/(x_{i+1} − x_i)` (**verified** against numerical quadrature to about 1e-8):

```
f'(x) = f'(x_i) + κ_i d + s_i d²/2
f(x)  = f(x_i) + f'(x_i) d + κ_i d²/2 + s_i d³/6
```

### 4.2 Hard-won results (verbatim in substance)

- FPS period is mass-independent; mass cancels from the EOM (§3.5).
- **Signed loss collapses:** a sum of `R·θ̈` over all time steps tends to zero by symmetry. The L2 norm of absolute horizontal acceleration `ẍ` is the physically meaningful objective, optionally with a displacement-capacity penalty.
- **Smooth-max bug:** a log-sum-exp smooth-max sharing one sharpness parameter across quantities with different units (m/s² vs m) silently inflated results. Fixed with exact `torch.max()`, which is autograd-compatible.
- Optimal R minimises the L2 loss of transmitted acceleration subject to `u = R sin θ ≤ u_cap`.
- Autograd through about 15 000 RK4 steps runs out of memory. Use **batched forward-only simulation** (B candidate surfaces sharing one time loop, about 12× speedup) with a population method (CEM). It doubles as the brute-force cross-check.
- **Key result:** the L2/RMS objective is nearly blind to base geometry once friction dominates. Nine free knots beat the best sphere by only 0.37 % on RMS, because `f'` plateaus near 0.022 while `μ = 0.10` supplies about 4/5 of the transmitted acceleration. Under a **peak** objective the same parametrisation gives −12.6 % (fitted) / −8.4 % (held out). The RMS-optimised profile still reached 0.1237 g peak against 0.1218 g for the peak-optimised one: L2 finds almost the same shape but cannot rank it, so changing the norm improves signal-to-noise, not the optimum's location.
- Under a binding `u_cap` the optimum is a **rounded cone**: `f'` rises fast then plateaus (constant restoring force is the cheapest way to arrest a mass in fixed travel). Two-parameter closed form: `f'(x) = 0.0295 · tanh(x / 7.3 mm)`, `f(x) = s∞ · x₀ · ln cosh(x / x₀)`. About half the peak gain.
- **Ellipse is a dead end** at this scale: the hardening correction is `O((x/a)²)` relative to the linear term, about 0.2 % for `u_cap = 30 mm`, `a ≈ 0.65 m`. Best ellipse ≈ best sphere.
- **Trade-off the objective does not see:** the `f'` plateau removes re-centring. A slider rests wherever `|f'(x)| ≤ μ`, and since `f'` saturates at 0.022 ≪ μ = 0.10, the whole dish is a resting band. On the held-out record the free-form dish parks 37 % further off-centre than the sphere (−9.24 mm vs −6.73 mm). Peak acceleration wants `f'` small and flat; re-centring wants `f' > μ` somewhere. The loss needs a third term for residual offset.
- **Manufacturability:** at `μ = 0.10` the optimal dish is only 0.41 mm deep across 60 mm (the sphere's is 0.60 mm), below PLA-print and stone-cutting tolerance. When friction carries 4/5 of the restoring action, the geometry is nearly a flat plate. This points towards a lower μ so geometry does the work, with μ and profile optimised jointly.
- **Regime used for all of the above:** `μ = 0.10`, `u_cap = 30 mm`, El Centro NS (PGA 0.349 g), **first 30 s for fitting, EW component held out**. Chosen so the cap actually binds; at `μ = 0.05` with a large dish nothing binds and even the 1-variable R sweep is degenerate (`a_rms` falls monotonically out to R = 10 m). Every optimised design sat exactly at `u_cap`, so the optimum is constraint-driven.

## 5. Seismic input

### 5.1 What was decided and why

Open Indonesian accelerograms are all weak (§5.4), and the severe events (Palu 2018, Cianjur 2022, Padang 2009, Lombok 2018) have no open near-field accelerograph data. So the **worst case** is the **El Centro NS record scaled to an Indonesian design-level PGA**. The target PGA is open (§7, item 1); do not invent one.

### 5.2 Scaling procedure

Amplitude scaling only: multiply the whole record by `PGA_target / PGA_record`, time axis unchanged (`scale_to_pga` in `fps_ref.py`).

- This keeps El Centro's spectral *shape*, not an Indonesian design-spectrum shape. If the target is a design spectrum (SNI 1726:2019), the alternative is spectral matching of the record to it. That is an open decision, not made yet.
- Scaling does not change the record's relative frequency content, so it is only meaningful together with the dish's `u_cap`: larger PGA means larger `u_max`, and `u_max > u_cap` marks an infeasible design.

### 5.3 The El Centro record in this file

| Property | Value |
|---|---|
| Source | `https://vibrationdata.com/elcentro.dat` ("Time History Data File for North-South Component", described on the page as corrected data; page is `https://vibrationdata.com/elcentro.htm`) |
| Format | 2 columns, time [s] and acceleration [g], 1560 samples, `dt = 0.02 s` exactly, 0 to 31.18 s |
| Peak | **0.3188 g** at t = 2.02 s (min −0.3188, max +0.2984); mean 0.0000; RMS 0.0612 g |
| SHA-256 of the downloaded file | `9836d860a6943ae728bed3b52e6dbbf0d4f54fd123f52b54e5980fd6e6c9d0aa` |
| Provenance | Only the source page above; not traced to an archive. As far as I know 0.319 g is the PGA usually quoted for the textbook copy of this record, but that was **not verified**. The page says another distribution of the same component is this record multiplied by −1, so check the sign convention against the owner's copy. |

**This is not the same copy as the owner's** (their notes say PGA 0.349 g, first 30 s, with an EW component for hold-out). For production runs, **prefer the owner's own file**. Use the embedded one for cross-checks and for rerunning the scripts here.

### 5.4 Open Indonesian waveform sources (all retrieved this session)

| Source | What it is | Access | Peak acceleration (verified) |
|---|---|---|---|
| **GE.UGM**, GEOFON FDSN `https://geofon.gfz-potsdam.de/fdsnws/dataselect/1/query` (identical bytes from `https://service.iris.edu/fdsnws/dataselect/1/query`) | Station at −7.9125, 110.5231 (Java; the code suggests Universitas Gadjah Mada, Yogyakarta region, not verified), 100 Hz accelerometer `HN?`, in operation from 2023-03-09. Used for the Mw 5.9 event of 2023-06-30 12:57:42 UTC, 76 km deep, about 125 km hypocentral | open, no login; response removed with StationXML (427 567 counts per m/s²) | E 0.0252 g, N 0.0260 g, Z 0.0218 g |
| **Zenodo 3351683**, `https://zenodo.org/record/3351683` (CC-BY-4.0) | BMKG strong-motion records of the **2010-10-25 Mentawai Mw 7.8** tsunami earthquake (Sahakian, Melgar, Muzli 2019, GRL, doi 10.1029/2019GL083989), 7 stations, miniSEED already in cm/s², 40–100 Hz. Files are named `*.HNE/HNN/HNZ.mseed` although the `.chan` file lists `ACE/ACN/ACZ` | open | PPSI 0.0150 / **0.0241** / 0.0112 g; MKBI 0.0034 / 0.0040 / 0.0023 g; SISI 0.0027 / 0.0026 / 0.0016 g; LWLI, LHSI, MNSI, MDSI all ≤ 0.0009 g |
| **USGS NSMP**, 2007-09-13 Mentawai Mw 7.0, `https://escweb.wr.usgs.gov/nsmp-data/data_sets/20070913_0335.html`; zip `https://ca.water.usgs.gov/nsmp/20070913_0335/zips/20070913_0335_uncorr.zip` (SMC format) | **One station only**, PSKI (Sikuai Island, 143 km) | open | 13–15 cm/s² (0.013–0.015 g) from USGS's preliminary corrected table |
| **NZ.HVSC**, GeoNet FDSN `https://service.geonet.org.nz/fdsnws/dataselect/1/query` — **not Indonesian** | Heathcote Valley, Christchurch Mw 6.2, 2011-02-21 23:51 UTC, 200 Hz, location code 20. A deliberately extreme record: steep valley edge, strong site amplification | open | HN1 1.270 g, HN2 1.679 g, **Z 2.203 g** |

**Not usable or not open:**

- BMKG's IA network (400+ stations) is only available through the Waveform Catalog at `https://repogempa.bmkg.go.id` with a username and password (request by email to `inatews@bmkg.go.id`). IRIS returned no IA channels in my queries.
- II.KAPI (Sulawesi) lists `EN?` accelerometer channels in the metadata, but they are not archived at IRIS (HTTP 204); only broadband velocity comes back.
- Palu, Cianjur, Padang: the only open stations are about 90–330 km from the rupture, so no near-field shaking. Lombok 2018 strong-motion records (MASE, TWSI) belong to BMKG's national strong-motion network and are not open.
- The IRIS event service is retired. Use USGS: `https://earthquake.usgs.gov/fdsnws/event/1/query`.

### 5.5 Reproduce the retrieval

`fetch_data.py` (Appendix A.5) downloads everything above and prints the peaks. Expected output, as run on 2026-10-12:

```
GE.UGM  HNE  PGA = 0.02518 g
GE.UGM  HNN  PGA = 0.02600 g
GE.UGM  HNZ  PGA = 0.02182 g
BM.PPSI HNE  peak = 14.683 cm/s^2 = 0.0150 g
BM.PPSI HNN  peak = 23.603 cm/s^2 = 0.0241 g
BM.PPSI HNZ  peak = 11.005 cm/s^2 = 0.0112 g
NZ.HVSC HN1  PGA = 1.270 g
NZ.HVSC HN2  PGA = 1.679 g
NZ.HVSC HNZ  PGA = 2.203 g
```

Processing used for UGM: merge, demean, linear detrend, 2 % taper, `remove_response(output="ACC", pre_filt=(0.05, 0.1, 40, 45), water_level=None)`. For HVSC: demean and `remove_response(output="ACC")` only.

## 6. Verification status

| Check | Result |
|---|---|
| Symbolic derivation of (EOM) and `N` | **Pass**: residual exactly 0; `m` cancels |
| Small-amplitude period, `μ = 0`, `R = 0.75 m` | **Pass**: 1.73760 s (simulator) vs 1.73760 s (`2π√(R/g)`) |
| Friction free decay, `μ = 0.02`, `R = 0.75`, released at 100 mm | **Pass**: peaks 69.94, 39.92, 9.92 mm; drop 30.02 mm vs 30.00 mm predicted; rests at −8.7 mm inside the 15 mm band |
| Spline closed forms vs numerical quadrature | **Pass** to about 1e-8 (one-off check, script not included) |
| Convergence (below) | **Pass**: identical for `dt` = 2, 1, 0.5 ms at `v_eps = 1e-3` |
| Small-angle peak formula `g (μ + u_max/R)` | 0.2083 g vs simulated 0.2042 g (R = 0.275 m) |
| **Reproduce the notes' sphere `a_rms = 0.0387 g`** | **FAIL, unresolved** (below) |

Convergence, sphere `μ = 0.10`, El Centro scaled to 0.349 g, first 30 s:

| `dt` [s] | `v_eps` [m/s] | R = 0.275: `u_max` [mm], `a_rms` [g], `a_max` [g] | R = 1.55: `u_max`, `a_rms`, `a_max` |
|---|---|---|---|
| 0.002 / 0.001 / 0.0005 | 1e-3 | 29.81, 0.0558, 0.2043 | 34.17, 0.0544, 0.1215 |
| 0.002 / 0.001 / 0.0005 | 1e-2 | 32.03, 0.0545, 0.2114 | 34.77, 0.0522, 0.1217 |
| 0.0005 | 3e-2 | 35.42, 0.0513, 0.2200 | 33.08, 0.0469, 0.1196 |
| 0.0002 | 1e-4 | 29.48, 0.0559, 0.2032 | 33.99, 0.0546, 0.1214 |

### 6.1 The unresolved discrepancy

With this session's reference simulator and the embedded record scaled to PGA 0.349 g:

| R [m] | `u_max` [mm] | `a_rms` [g] | `a_max` [g] |
|---|---|---|---|
| 0.15 | 33.94 (> cap) | 0.0595 | 0.2979 |
| 0.275 | 29.82 | 0.0558 | 0.2042 |
| 0.75 (native 0.319 g record) | 27.42 | 0.0515 | 0.1357 |
| 0.75 (scaled to 0.349 g) | 33.64 (> cap) | 0.0546 | 0.1435 |
| 1.55 | 34.17 (> cap) | 0.0544 | 0.1215 |
| 6.00 | 34.17 (> cap) | 0.0544 | 0.1056 |

(The two R = 0.75 rows come from a one-off call of `simulate` / `metrics` from `fps_ref.py` with `mu=0.10`, `T=30.0`; the other rows are the output of `compare_notes.py`.)

The best *feasible* sphere (`u_max ≤ 30 mm`) in my runs is R ≈ 0.275 m with `a_rms ≈ 0.056 g`. The notes imply something different: a sphere of about R ≈ 0.75 m (0.60 mm deep across 60 mm, `R = 0.03² / (2 · 0.0006)`, my arithmetic) with `a_rms = 0.0387 g` that fits within `u_cap`. The results are numerically converged (table above), so this is not a timestep artefact. Candidate causes, **none tested**:

1. **Different record copy.** 0.319 g vs 0.349 g copy; shape and timing of the strongest pulses differ. Largest suspect for `u_max`.
2. **Different definition of `a_rms`.** The ratio `0.0387 / 0.0544 = 0.711 ≈ 1/√2`. This may be a coincidence, but it could mean a different normalisation or averaging window (for example a window about twice as long with a quiet tail). Peak values look similar: my large-R `a_max` is about 0.12 g, close to the 0.1218–0.1237 g peaks in the notes (those are for the free-form profiles, so not a like-for-like comparison).
3. Different friction regularisation or time window.

**First step for the next session:** run the owner's simulator and `fps_ref.py` on the *same* record (the owner's, or the embedded one) with the sphere `R = 0.75 m`, `μ = 0.10`, and compare `u_max`, `a_rms` and `a_max`. Do not trust either simulator's absolute numbers until they agree.

## 7. Open items and next steps

1. **Choose the target PGA** for "El Centro scaled to the Indonesian design level". Needed from the owner: city / site, soil class under SNI 1726:2019, and the hazard level. SNI 1726:2019 defines the design PGA (`PGA_M`) from the national hazard maps; confirm the level and the lookup tool with the standard itself. Then decide amplitude scaling vs spectral matching (§5.2).
2. **Resolve the discrepancy** in §6.1 before any table is built.
3. **Build the `a_max` / `u_max` table.** Suggested definition: for each target PGA in a list and each `(R, μ)` on a grid, record `u_max` (peak slider displacement) and `a_max_actual` (peak absolute transmitted acceleration), and flag `u_max > u_cap` as infeasible. This feeds the three-variable correlation `u_cap` – `a_max_actual` – `C_est` (§1). `C_est` itself has no model in these notes yet.
4. **Loss and design decisions** in §1: p-norm, residual-offset term, lower μ.
5. Optional: request BMKG IA waveforms for real Indonesian near-field shaking (days to weeks). Use NZ.HVSC (1.7 g horizontal) only as a stress test beyond any design level, not as a design input.

---

## Appendix A: code (every block was run in the originating session)

### A.1 Symbolic check of the EOM

```python
# FILE: verify_eom.py
# Symbolic check: Newton's law for a point mass on y=f(x) with Coulomb friction, base accel ag (1D)
import sympy as sp
x, xd, xdd, ag, g, mu, N, m = sp.symbols('x xd xdd ag g mu N m', real=True)
sg = sp.Symbol('sigma', real=True)            # sgn(xd) = +-1
f1, f2 = sp.symbols('fp fpp', real=True)      # f'(x), f''(x)
s = sp.sqrt(1 + f1**2)
t = sp.Matrix([1, f1]) / s                    # unit tangent (x-component > 0, so sgn(vel_t) = sgn(xd))
n = sp.Matrix([-f1, 1]) / s                   # unit normal (pointing out of the dish)
# relative-frame equations: m*a_rel = N*n - m*g*yhat - m*ag*xhat - mu*N*sg*t
ydd = f1*xdd + f2*xd**2                       # y = f(x)  =>  ydd = f' xdd + f'' xd^2
F = N*n + sp.Matrix([-m*ag, -m*g]) - mu*N*sg*t
eqs = [sp.Eq(m*xdd, F[0]), sp.Eq(m*ydd, F[1])]
sol = sp.solve(eqs, [xdd, N], dict=True)[0]
claimed = sp.Eq((1+f1**2)*xdd + f1*f2*xd**2 + g*f1 + mu*sg*(g + f2*xd**2 - f1*ag), -ag)
resid = sp.simplify(claimed.lhs.subs(xdd, sol[xdd]) - claimed.rhs)
print("residual of project EOM after substituting solved xdd:", resid)
print("normal force N/m =", sp.simplify(sol[N]/m))
print("mass cancels  :", not sol[xdd].has(m))
```

### A.2 Reference simulator (independent of the owner's simulator)

```python
# FILE: fps_ref.py
"""Independent reference simulator: 1D slider on a convex dish y=f(x), Coulomb friction, base excitation.
EOM (verified symbolically in verify_eom.py):
 (1+f'^2) xdd + f' f'' xd^2 + g f' + mu*sgn(xd)*(g + f'' xd^2 - f' ag) = -ag
Friction regularised: sgn(v) -> tanh(v/v_eps). Batched over B candidate dishes. RK4, dt=0.002 s.
"""
import numpy as np
G = 9.80665

def sphere(R):
    R = np.asarray(R, float)
    fp  = lambda x: x/np.sqrt(R**2 - x**2)
    fpp = lambda x: R**2/(R**2 - x**2)**1.5
    return fp, fpp

def simulate(fp, fpp, t_rec, a_rec_g, mu, dt=0.002, T=30.0, v_eps=1e-3, B=1, x0=0.0, v0=0.0):
    """a_rec_g: ground accel in g at times t_rec (linear interpolation). Returns dict of time series."""
    n = int(round(T/dt))
    th = np.arange(2*n + 1)*(dt/2)
    ag = np.interp(th, t_rec, a_rec_g, right=0.0)*G          # ground accel [m/s^2] at half steps
    x = np.full(B, x0, float); v = np.full(B, v0, float)
    X = np.empty((n+1, B)); A = np.empty((n+1, B)); X[0] = x
    def acc(x, v, a):
        f1, f2 = fp(x), fpp(x)
        s = np.tanh(v/v_eps)
        return (-a - G*f1 - f1*f2*v*v - mu*s*(G + f2*v*v - f1*a))/(1 + f1*f1)
    A[0] = acc(x, v, ag[0]) + ag[0]
    for k in range(n):
        a0, a1, a2 = ag[2*k], ag[2*k+1], ag[2*k+2]
        k1x, k1v = v, acc(x, v, a0)
        k2x, k2v = v + 0.5*dt*k1v, acc(x + 0.5*dt*k1x, v + 0.5*dt*k1v, a1)
        k3x, k3v = v + 0.5*dt*k2v, acc(x + 0.5*dt*k2x, v + 0.5*dt*k2v, a1)
        k4x, k4v = v + dt*k3v,     acc(x + dt*k3x,     v + dt*k3v,     a2)
        x = x + dt/6*(k1x + 2*k2x + 2*k3x + k4x)
        v = v + dt/6*(k1v + 2*k2v + 2*k3v + k4v)
        X[k+1] = x; A[k+1] = acc(x, v, ag[2*k+2]) + ag[2*k+2]   # absolute (transmitted) accel
    return dict(t=np.arange(n+1)*dt, x=X, a_abs=A)

def metrics(out, T=None):
    A, X = out["a_abs"]/G, out["x"]
    return dict(u_max=np.abs(X).max(0), a_max_g=np.abs(A).max(0), a_rms_g=np.sqrt((A**2).mean(0)))

def scale_to_pga(a_g, pga_target_g):
    """Amplitude scaling only: same shape/frequency content, peak = target (all in g)."""
    return a_g*(pga_target_g/np.abs(a_g).max())
```

### A.3 Physics sanity checks

```python
# FILE: check_ref.py
import sys, numpy as np
sys.path.insert(0, sys.argv[1])
from fps_ref import *
# (1) mu=0, small amplitude: period must be 2*pi*sqrt(R/g)
R = 0.75; fp, fpp = sphere(R)
o = simulate(fp, fpp, np.array([0, 1.0]), np.zeros(2), mu=0.0, T=10, x0=0.005)
x = o["x"][:, 0]; t = o["t"]
zc = t[1:][(x[:-1] > 0) & (x[1:] <= 0)]            # downward zero crossings
Tm = np.mean(np.diff(zc)); print("period  sim %.5f s   2*pi*sqrt(R/g) %.5f s" % (Tm, 2*np.pi*np.sqrt(R/G)))
# (2) free decay with friction: amplitude must fall by 2*mu*R per half cycle, stop inside |x| <= mu*R
mu = 0.02; fp, fpp = sphere(R)   # rest band mu*R = 15 mm, so release from 100 mm
o = simulate(fp, fpp, np.array([0, 1.0]), np.zeros(2), mu=mu, T=20, x0=0.10, v_eps=1e-4, dt=0.001)
x = o["x"][:, 0]
pk = [abs(x[i]) for i in range(1, len(x)-1) if abs(x[i]) >= abs(x[i-1]) and abs(x[i]) > abs(x[i+1]) and abs(x[i]) > 1e-4]
print("peaks [mm]:", np.round(np.array(pk[:5])*1e3, 3), " first drop %.3f mm, 2*mu*R (small-angle) = %.3f mm" % ((pk[0]-pk[1])*1e3, 2*mu*R*1e3))
print("rest position %.3f mm, rest band mu*R = %.1f mm" % (x[-1]*1e3, mu*R*1e3))
```

Run: `python3 check_ref.py .` (the argument is the directory containing `fps_ref.py`).

### A.4 Convergence study and notes comparison

```python
# FILE: compare_notes.py
import sys, numpy as np
sys.path.insert(0, sys.argv[1])
from fps_ref import *
d = np.loadtxt(sys.argv[2], delimiter="," if sys.argv[2].endswith(".csv") else None); t, a = d[:, 0], d[:, 1]
a = scale_to_pga(a, 0.349)                       # project regime: PGA 0.349 g
Rs = np.geomspace(0.15, 6.0, 80)
fp, fpp = sphere(Rs)
o = simulate(fp, fpp, t, a, mu=0.10, dt=0.002, T=30.0, v_eps=1e-3, B=len(Rs))
m = metrics(o)
ok = m["u_max"] <= 0.030
print("R scan: %d values, feasible (u_max<=30mm): %d" % (len(Rs), ok.sum()))
i = np.where(ok)[0]
j = i[np.argmin(m["a_rms_g"][i])]
print("best feasible sphere: R=%.3f m  u_max=%.2f mm  a_rms=%.4f g  a_max=%.4f g" % (Rs[j], m["u_max"][j]*1e3, m["a_rms_g"][j], m["a_max_g"][j]))
for k in (0, 10, 20, 30, 40, 50, 60, 79):
    print("  R=%5.2f  u_max=%7.2f mm  a_rms=%.4f g  a_max=%.4f g%s" % (Rs[k], m["u_max"][k]*1e3, m["a_rms_g"][k], m["a_max_g"][k], "" if ok[k] else "   (> u_cap)"))
print("small-angle bound g(mu+u_max/R) at best R: %.4f g" % (0.10 + m["u_max"][j]/Rs[j]))
```

```python
# FILE: convergence.py
import sys, time, numpy as np
sys.path.insert(0, sys.argv[1])
from fps_ref import *
d = np.loadtxt(sys.argv[2], delimiter="," if sys.argv[2].endswith(".csv") else None); t, a = d[:, 0], d[:, 1]
a = scale_to_pga(a, 0.349)
Rs = np.array([0.275, 1.55]); fp, fpp = sphere(Rs)
print("   dt      v_eps   | R=0.275: u_max[mm] a_rms[g] a_max[g] | R=1.55: u_max[mm] a_rms[g] a_max[g]")
for dt, ve in [(0.002, 1e-3), (0.001, 1e-3), (0.0005, 1e-3), (0.002, 1e-2), (0.001, 1e-2), (0.0005, 1e-2), (0.0005, 3e-2), (0.0002, 1e-4)]:
    t0 = time.time(); o = simulate(fp, fpp, t, a, mu=0.10, dt=dt, T=30.0, v_eps=ve, B=2); m = metrics(o)
    print("  %.4f  %.0e  |  %6.2f  %.4f  %.4f  |  %6.2f  %.4f  %.4f   (%.0fs)" % (dt, ve, m["u_max"][0]*1e3, m["a_rms_g"][0], m["a_max_g"][0], m["u_max"][1]*1e3, m["a_rms_g"][1], m["a_max_g"][1], time.time()-t0))
```

Run: `python3 load_elcentro.py` once, then `python3 compare_notes.py . elcentro_NS.csv` and `python3 convergence.py . elcentro_NS.csv` (first argument as in A.3; second a `time,g` CSV or a whitespace `time g` file).

### A.5 Retrieve the open seismic records

```python
# FILE: fetch_data.py
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
```

### A.6 Decode the embedded El Centro record

```python
# FILE: load_elcentro.py
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
```

## Appendix B: El Centro NS record (compressed; do not print)

Encoding: the 1560 accelerations in units of 1e-6 g as int32, first-difference encoded, zlib level 9, base64. Lossless for the downloaded file (checked: every value is an exact multiple of 1e-6 g, and the time grid is exactly `0.02 k`). `load_elcentro.py` verifies the SHA-256 of the decoded CSV (`time,acc_g`, formats `%.2f,%.6f`) equals `e45940d6dee1cc55d2293195f133dc8429d0a5214d860ffa2247027f4ed92133`.

<!-- ELCENTRO_B64_BEGIN -->
```text
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
```
<!-- ELCENTRO_B64_END -->
