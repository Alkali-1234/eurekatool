import "server-only"
import { liveProgress } from "./runner"
import type { Task } from "../types"

/** Attach the in-memory progress of active runs (it is only persisted when a run ends). */
export function withLive(t: Task): Task {
  if (!t.runs.some((r) => r.status === "running")) return t
  return { ...t, runs: t.runs.map((r) => (r.status === "running" ? { ...r, progress: liveProgress(r.id) ?? r.progress } : r)) }
}
