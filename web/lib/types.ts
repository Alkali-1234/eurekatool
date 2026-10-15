import type { Params, Script } from "./params"

export type RunStatus = "queued" | "running" | "done" | "failed" | "cancelled" | "interrupted"

export type Progress = { stage: string; done: number; total: number }

export type Run = {
  id: string
  status: RunStatus
  params: Params
  argv: string[]
  command: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
  exitCode?: number | null
  error?: string
  /** "ok" | "infeasible" for rstar; summary for umax */
  summary?: Record<string, unknown>
  progress?: Progress
  files?: string[]
}

export type Task = {
  id: string
  name: string
  script: Script
  params: Params
  createdAt: string
  updatedAt: string
  runs: Run[]
}

export type LibraryEntry = {
  id: string
  name: string
  group: string
  kind: "builtin" | "text" | "mseed" | "xml"
  size?: number
}

export type Library = { waveforms: LibraryEntry[]; inventories: LibraryEntry[] }

export type ServerEvent =
  | { type: "task"; task: Task }
  | { type: "deleted"; id: string }
  | { type: "progress"; taskId: string; runId: string; progress: Progress }
  | { type: "log"; taskId: string; runId: string; line: string }

// ------------------------------------------------------------------ script results (subset used by the UI)
export type Grid = {
  R_m: number[]
  u_max_mm: (number | null)[]
  L_g: (number | null)[]
  a_max_g: (number | null)[]
  a_rms_g: (number | null)[]
  feasible: boolean[]
}

export type WaveformMeta = {
  name: string
  source: string
  sha256: string
  units_in: string
  n: number
  dt: number
  length_s: number
  t_start_s: number
  pga_native_g: number
  pga_target_g: number | null
  scale_factor: number
  pga_used_g: number
  trace_id?: string
  starttime?: string
  sampling_rate?: number
  response_removed?: boolean
  pre_filt?: number[] | null
}

export type Inputs = {
  /** Runs made before the static/kinetic split have only mu. */
  mu?: number
  mu_s?: number
  mu_k?: number
  friction?: "stickslip" | "tanh"
  p: number | null // null = inf (JSON has no Infinity)
  dt: number
  v_eps: number
  duration_s: number
  r_min: number
  r_max: number
  n_r: number
  command: string
  u_min_mm?: number
  u_max_mm?: number
  du_mm?: number
}

export type CapRow = {
  u_cap_mm: number
  status: "ok" | "infeasible"
  r_star_m: number | null
  L_star_g: number | null
  u_max_star_mm: number | null
  a_max_star_g: number | null
  a_rms_star_g: number | null
  n_feasible: number
  at_grid_edge: boolean | null
  /** File with every time step at R* (null when infeasible; absent in runs made before it existed) */
  timeseries_csv?: string | null
}

export type RstarResult = CapRow & {
  ok: true
  warnings: string[]
  inputs: Inputs
  waveform: WaveformMeta
  grid: Grid
  files: Record<string, string>
}

export type UmaxResult = {
  ok: true
  n_caps: number
  n_infeasible: number
  warnings: string[]
  inputs: Inputs
  waveform: WaveformMeta
  table: CapRow[]
  results: (CapRow & { grid: Grid })[]
  files: Record<string, string>
}

export type Preview = {
  ok: true
  meta: WaveformMeta
  t: number[]
  a_g: number[]
  stats: { pga_g: number; t_pga_s: number; a_pga_g: number; rms_g: number; duration_used_s: number; n_plotted: number }
  spectrum: { f: number[]; amp: number[] }
}
