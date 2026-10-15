// Shared (client + server) description of the two builders' command-line arguments.
// Params are stored as strings, exactly as they would be typed on the command line; "" means "flag omitted".
// Defaults and rules mirror rstar_builder.py (add_common_args, physics_from_args, r_grid_from_args) and
// umax_table_builder.py (cap_list).

export type Script = "rstar" | "umax"
export type Params = Record<string, string>
export type Group = "waveform" | "physics" | "script"

export const SCRIPTS: Record<Script, { file: string; title: string; short: string; blurb: string }> = {
  rstar: {
    file: "rstar_builder.py",
    title: "R* builder",
    short: "R*",
    blurb: "Grid search of the dish radius R for one waveform and one travel cap u_cap.",
  },
  umax: {
    file: "umax_table_builder.py",
    title: "u_max table",
    short: "Table",
    blurb: "R* for every u_cap from u_min to u_max in steps of du (one sweep, many caps).",
  },
}

export const G = 9.80665
export const RK4_STABILITY = 2.8
export const MAX_CAPS = 10000
export const UNITS = ["g", "m/s2", "cm/s2"] as const
export const FRICTION_MODELS = ["stickslip", "tanh"] as const

export type FieldDef = {
  key: string
  flag: string
  label: string
  unit?: string
  help: string
  group: Group
  kind: "number" | "text" | "select" | "path"
  scripts?: Script[]
  required?: boolean
  placeholder?: string
  /** Per-field check on a non-empty value; returns an error message or null. */
  check?: (v: number) => string | null
  /** Allow the literal "inf" (only the norm order p). */
  allowInf?: boolean
}

const positive = (v: number) => (v > 0 ? null : "must be > 0")
const nonNegative = (v: number) => (v >= 0 ? null : "must be ≥ 0")

export const FIELDS: FieldDef[] = [
  // waveform
  { key: "source", flag: "--source", label: "Waveform", group: "waveform", kind: "path", required: true,
    help: 'Built-in El Centro NS record, or a .csv/.txt/.dat (time, acc) or .mseed file' },
  { key: "units", flag: "--units", label: "Units", group: "waveform", kind: "select",
    help: "Units of the acceleration column (text files, or miniSEED without an inventory)" },
  { key: "channel", flag: "--channel", label: "Channel", group: "waveform", kind: "text", placeholder: "HN1",
    help: "miniSEED channel, e.g. HN1" },
  { key: "location", flag: "--location", label: "Location", group: "waveform", kind: "text", placeholder: "20",
    help: "miniSEED location code, e.g. 20" },
  { key: "inventory", flag: "--inventory", label: "Inventory (StationXML)", group: "waveform", kind: "path",
    help: "StationXML for miniSEED; the instrument response is removed to ACC" },
  { key: "pre_filt", flag: "--pre-filt", label: "Pre-filter", unit: "Hz", group: "waveform", kind: "text",
    placeholder: "0.05,0.1,40,45", help: "Pre-filter corners f1,f2,f3,f4 [Hz] for response removal" },
  { key: "pga", flag: "--pga", label: "Target PGA", unit: "g", group: "waveform", kind: "number",
    placeholder: "native", check: positive,
    help: "Amplitude-scale the record to this PGA [g]; leave blank to use the record as is" },
  { key: "t_start", flag: "--t-start", label: "t start", unit: "s", group: "waveform", kind: "number",
    check: nonNegative, help: "Drop the record before this time [s]" },
  { key: "duration", flag: "--duration", label: "Duration", unit: "s", group: "waveform", kind: "number",
    placeholder: "whole record", check: positive,
    help: "Simulated length [s]; default = whole record. Past the end of the record the ground is at rest" },
  // physics and grid
  { key: "mu_s", flag: "--mu-s", label: "μ_s (static)", group: "physics", kind: "number", check: nonNegative,
    help: "Static friction coefficient: a slider at rest stays locked while the friction it needs is ≤ μ_s" },
  { key: "mu_k", flag: "--mu-k", label: "μ_k (kinetic)", group: "physics", kind: "number", check: nonNegative,
    help: "Kinetic friction coefficient while sliding; must be ≤ μ_s" },
  { key: "friction", flag: "--friction", label: "Friction model", group: "physics", kind: "select",
    help: "stickslip: exact stick/slip with μ_s and μ_k. tanh: the original regularised model (needs μ_s = μ_k, uses v_eps)" },
  { key: "p", flag: "--p", label: "Loss norm p", group: "physics", kind: "number", allowInf: true,
    check: (v) => (v >= 1 ? null : "must be ≥ 1 (or inf)"), help: "Loss norm order (2 = RMS, inf = peak)" },
  { key: "r_min", flag: "--r-min", label: "R min", unit: "m", group: "physics", kind: "number", check: positive,
    help: "Smallest R on the grid [m]" },
  { key: "r_max", flag: "--r-max", label: "R max", unit: "m", group: "physics", kind: "number", check: positive,
    help: "Largest R on the grid [m]" },
  { key: "n_r", flag: "--n-r", label: "R points", group: "physics", kind: "number",
    check: (v) => (Number.isInteger(v) && v >= 2 ? null : "integer ≥ 2"), help: "Number of log-spaced R values" },
  { key: "dt", flag: "--dt", label: "dt", unit: "s", group: "physics", kind: "number", check: positive,
    help: "RK4 time step [s]" },
  { key: "v_eps", flag: "--v-eps", label: "v_eps", unit: "m/s", group: "physics", kind: "number", check: positive,
    help: "Friction regularisation [m/s]: sgn(v) → tanh(v / v_eps). Only used by the tanh friction model" },
  // script-specific
  { key: "u_cap_mm", flag: "--u-cap-mm", label: "u_cap", unit: "mm", group: "script", kind: "number",
    scripts: ["rstar"], required: true, check: positive,
    help: "Travel cap u_cap [mm]; R is feasible if u_max ≤ u_cap" },
  { key: "u_min_mm", flag: "--u-min-mm", label: "u_cap from", unit: "mm", group: "script", kind: "number",
    scripts: ["umax"], required: true, check: positive, help: "Smallest u_cap [mm]" },
  { key: "u_max_mm", flag: "--u-max-mm", label: "u_cap to", unit: "mm", group: "script", kind: "number",
    scripts: ["umax"], required: true, check: positive, help: "Largest u_cap [mm]" },
  { key: "du_mm", flag: "--du-mm", label: "Step", unit: "mm", group: "script", kind: "number",
    scripts: ["umax"], required: true, check: positive, help: "u_cap step [mm]" },
]

export const fieldsFor = (script: Script) => FIELDS.filter((f) => !f.scripts || f.scripts.includes(script))
export const fieldByKey = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<string, FieldDef>

export function defaultParams(script: Script): Params {
  return {
    source: "elcentro", units: "g", channel: "", location: "", inventory: "", pre_filt: "",
    pga: "", t_start: "0", duration: "",
    mu_s: "0.1", mu_k: "0.1", friction: "stickslip", p: "2", r_min: "0.15", r_max: "6", n_r: script === "umax" ? "160" : "80", dt: "0.002",
    v_eps: "0.001",
    ...(script === "rstar" ? { u_cap_mm: "30" } : { u_min_mm: "25", u_max_mm: "40", du_mm: "1" }),
  }
}

/** Tasks saved before the static/kinetic split have one "mu": it becomes μ_s = μ_k (the friction model is the default). */
export function migrateParams(p: Params): Params {
  if (!("mu" in p)) return p
  const { mu, ...rest } = p
  return { ...rest, mu_s: rest.mu_s ?? mu, mu_k: rest.mu_k ?? mu }
}

export const isMseed = (path: string) => /\.(mseed|miniseed|ms)$/i.test(path)

/** Which waveform fields make sense for the chosen source (hidden ones are not sent). */
export function activeWaveformKeys(p: Params): Set<string> {
  const keys = new Set(["source", "pga", "t_start", "duration"])
  if (p.source && p.source !== "elcentro") {
    if (isMseed(p.source)) {
      keys.add("channel").add("location").add("inventory")
      if (p.inventory) keys.add("pre_filt")
      else keys.add("units")
    } else keys.add("units")
  }
  return keys
}

function num(s: string | undefined): number | null {
  if (s === undefined || s.trim() === "") return null
  const t = s.trim()
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return NaN
  return Number(t)
}

/** Field errors keyed by field key (empty object = valid). */
export function validate(script: Script, p: Params): Record<string, string> {
  const err: Record<string, string> = {}
  const active = activeWaveformKeys(p)
  for (const f of fieldsFor(script)) {
    if (f.group === "waveform" && !active.has(f.key)) continue
    const raw = (p[f.key] ?? "").trim()
    if (raw === "") {
      if (f.required) err[f.key] = "required"
      continue
    }
    if (f.kind !== "number") continue
    if (f.allowInf && raw.toLowerCase() === "inf") continue
    const v = num(raw)
    if (v === null || Number.isNaN(v)) err[f.key] = "not a number"
    else if (f.check) {
      const e = f.check(v)
      if (e) err[f.key] = e
    }
  }
  if (p.pre_filt && active.has("pre_filt")) {
    const parts = p.pre_filt.split(",").map((s) => num(s))
    if (parts.length !== 4 || parts.some((v) => v === null || Number.isNaN(v)))
      err.pre_filt = "four comma-separated frequencies, e.g. 0.05,0.1,40,45"
  }
  const mus = num(p.mu_s), muk = num(p.mu_k)
  if (!err.mu_s && !err.mu_k && mus !== null && muk !== null && muk > mus) err.mu_k = "must be ≤ μ_s"
  if (p.friction === "tanh" && !err.mu_s && !err.mu_k && mus !== muk) err.friction = "tanh needs μ_s = μ_k"
  const rmin = num(p.r_min), rmax = num(p.r_max)
  if (!err.r_min && !err.r_max && rmin !== null && rmax !== null && !(rmin < rmax)) err.r_max = "must be > R min"
  const dt = num(p.dt), dur = num(p.duration)
  if (!err.duration && dur !== null && dt !== null && !Number.isNaN(dt) && dur <= dt)
    err.duration = "must be longer than one time step"
  if (script === "umax" && !err.u_min_mm && !err.u_max_mm && !err.du_mm) {
    const lo = num(p.u_min_mm), hi = num(p.u_max_mm), du = num(p.du_mm)
    if (lo !== null && hi !== null && hi < lo) err.u_max_mm = "must be ≥ u_cap from"
    else if (lo !== null && hi !== null && du !== null && du > 0 && capCount(lo, hi, du) > MAX_CAPS)
      err.du_mm = `more than ${MAX_CAPS} caps; increase the step`
  }
  return err
}

export function capCount(lo: number, hi: number, du: number) {
  return Math.floor((hi - lo) / du + 1e-9) + 1
}

/** Non-blocking warnings that mirror the script's own (RK4 stability, cap count). */
export function warnings(script: Script, p: Params): string[] {
  const w: string[] = []
  const dt = num(p.dt), mu = num(p.mu_k), ve = num(p.v_eps)
  if (p.friction === "tanh" && dt && mu !== null && ve && !Number.isNaN(dt * mu * ve)) {
    const k = (dt * mu * G) / ve
    if (k > RK4_STABILITY)
      w.push(`dt·μ·g/v_eps = ${k.toFixed(2)} > ${RK4_STABILITY}: the RK4 friction term may be unstable (CLAUDE.md §3.6)`)
  }
  return w
}

/**
 * Build the CLI flags (without --json / --out). `resolve` maps a library id (source / inventory) to the path that
 * should appear on the command line: absolute on the server, a readable relative path for display.
 */
export function toArgv(script: Script, p: Params, resolve: (id: string) => string = (id) => id): string[] {
  const argv: string[] = []
  const active = activeWaveformKeys(p)
  for (const f of fieldsFor(script)) {
    if (f.group === "waveform" && !active.has(f.key)) continue
    const v = (p[f.key] ?? "").trim()
    if (v === "") continue
    if (f.key === "units" && v === "g") continue                // argparse default
    if (f.key === "t_start" && Number(v) === 0) continue        // argparse default
    if (f.key === "v_eps" && p.friction !== "tanh") continue    // only the tanh model reads it
    argv.push(f.flag, f.kind === "path" && v !== "elcentro" ? resolve(v) : v)
  }
  return argv
}

/** Waveform-only flags, for waveform_tool.py preview. */
export function waveformArgv(p: Params, resolve: (id: string) => string = (id) => id): string[] {
  const all = toArgv("rstar", { ...p, u_cap_mm: "1" }, resolve)
  const keep = new Set(FIELDS.filter((f) => f.group === "waveform").map((f) => f.flag).concat("--duration"))
  const out: string[] = []
  for (let i = 0; i < all.length; i += 2) if (keep.has(all[i])) out.push(all[i], all[i + 1])
  return out
}

export function shellQuote(s: string) {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`
}

export function commandLine(script: Script, argv: string[]) {
  return ["python", SCRIPTS[script].file, ...argv].map(shellQuote).join(" ")
}

/** Display path of a library id ("repo/<rel>" -> "<rel>", "upload/<name>" -> "web-data/uploads/<name>"). */
export function displayPath(id: string) {
  if (id.startsWith("repo/")) return id.slice(5)
  if (id.startsWith("upload/")) return "web-data/uploads/" + id.slice(7)
  return id
}

export function paramsEqual(a: Params, b: Params) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if ((a[k] ?? "").trim() !== (b[k] ?? "").trim()) return false
  return true
}
