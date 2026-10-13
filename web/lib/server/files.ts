import "server-only"
import fs from "node:fs/promises"
import path from "node:path"
import { getRun, getTask, runDir } from "./store"

// Only the files the builders write (plus the run log) are served.
export const OUTPUT_FILES = new Set([
  "grid.csv", "table.csv", "sweep_grid.csv", "result.json", "log.txt",
  "L_of_R.pdf", "L_of_R.png", "umax_table.pdf", "umax_table.png", "timeseries.csv",
])
// umax_table_builder.py writes one time series per distinct R*: timeseries_R0.275246m.csv (rarely with _i<index>)
const TIMESERIES_FILE = /^timeseries_R[0-9.e+-]+m(_i\d+)?\.csv$/

export const isOutputFile = (name: string) => OUTPUT_FILES.has(name) || TIMESERIES_FILE.test(name)

export const CONTENT_TYPES: Record<string, string> = {
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".zip": "application/zip",
}

export async function locateRun(taskId: string, runId: string) {
  const task = await getTask(taskId)
  const run = task && (await getRun(taskId, runId))
  if (!task || !run) return null
  return { task, run, dir: runDir(taskId, runId) }
}

export async function readOutput(dir: string, name: string) {
  if (!isOutputFile(name)) return null
  try {
    return await fs.readFile(path.join(dir, name))
  } catch {
    return null
  }
}

/** Filename used for downloads: <task-name>_<run-id>_<file>. */
export function downloadName(taskName: string, runId: string, file: string) {
  const slug = taskName.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "task"
  return `${slug}_${runId}_${file}`
}

export function contentDisposition(name: string, inline: boolean) {
  return `${inline ? "inline" : "attachment"}; filename="${name.replace(/"/g, "")}"`
}
