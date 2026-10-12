import "server-only"
import path from "node:path"

// The Next app lives in <FPS_ROOT>/web; the Python scripts in <FPS_ROOT>.
export const FPS_ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.FPS_ROOT ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".."))
export const PYTHON = process.env.FPS_PYTHON ?? path.join(/*turbopackIgnore: true*/ FPS_ROOT, ".venv", "bin", "python")
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.FPS_DATA ?? path.join(FPS_ROOT, "web-data"))
export const TASKS_DIR = path.join(DATA_DIR, "tasks")
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads")
export const MAX_CONCURRENT = Math.max(1, Number(process.env.MAX_CONCURRENT ?? 2) || 2)

/** Folders (relative to FPS_ROOT, separated by ":") scanned for waveform and StationXML files. */
export const WAVEFORM_DIRS = (process.env.FPS_WAVEFORM_DIRS ?? "data:indonesia_raw_waveforms (1)/raw:severe_records/raw")
  .split(":")
  .map((d) => d.trim())
  .filter(Boolean)

export const scriptPath = (file: string) => path.join(/*turbopackIgnore: true*/ FPS_ROOT, file)
