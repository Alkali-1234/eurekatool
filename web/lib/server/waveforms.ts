import "server-only"
import fs from "node:fs/promises"
import path from "node:path"
import { FPS_ROOT, UPLOADS_DIR, WAVEFORM_DIRS } from "./paths"
import type { Library, LibraryEntry } from "../types"

const WAVE_EXT = new Set([".csv", ".txt", ".dat", ".mseed", ".miniseed", ".ms"])
const MSEED_EXT = new Set([".mseed", ".miniseed", ".ms"])
const MAX_DEPTH = 4

export class PathError extends Error {}

async function walk(dir: string, depth = 0): Promise<string[]> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "__pycache__") continue
    const p = path.join(dir, e.name)
    if (e.isDirectory() && depth < MAX_DEPTH) out.push(...(await walk(p, depth + 1)))
    else if (e.isFile()) out.push(p)
  }
  return out
}

function entry(abs: string, id: string, group: string): LibraryEntry | null {
  const ext = path.extname(abs).toLowerCase()
  const kind = ext === ".xml" ? "xml" : MSEED_EXT.has(ext) ? "mseed" : WAVE_EXT.has(ext) ? "text" : null
  if (!kind) return null
  return { id, name: path.basename(abs), group, kind }
}

export async function listLibrary(): Promise<Library> {
  const waveforms: LibraryEntry[] = [{ id: "elcentro", name: "El Centro NS (built-in)", group: "Built-in", kind: "builtin" }]
  const inventories: LibraryEntry[] = []
  const add = async (abs: string, id: string, group: string) => {
    const e = entry(abs, id, group)
    if (!e) return
    try {
      e.size = (await fs.stat(abs)).size
    } catch {}
    ;(e.kind === "xml" ? inventories : waveforms).push(e)
  }
  for (const d of WAVEFORM_DIRS) {
    const base = path.join(/*turbopackIgnore: true*/ FPS_ROOT, d)
    for (const abs of (await walk(base)).sort()) {
      const rel = path.relative(FPS_ROOT, abs)
      if (rel === path.join("data", "elcentro_NS.csv")) continue // already the built-in
      await add(abs, "repo/" + rel.split(path.sep).join("/"), path.dirname(rel).split(path.sep).join("/"))
    }
  }
  for (const abs of (await walk(UPLOADS_DIR)).sort()) {
    await add(abs, "upload/" + path.relative(UPLOADS_DIR, abs).split(path.sep).join("/"), "Uploads")
  }
  return { waveforms, inventories }
}

function inside(child: string, parent: string) {
  const rel = path.relative(parent, child)
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
}

/**
 * Map a library id to an absolute path. Only files under the configured waveform folders or the uploads folder are
 * accepted (the server has no auth, so a client must not be able to point the scripts at arbitrary files).
 */
export async function resolveId(id: string): Promise<string> {
  let abs: string, roots: string[]
  if (id.startsWith("repo/")) {
    abs = path.resolve(/*turbopackIgnore: true*/ FPS_ROOT, id.slice(5))
    roots = WAVEFORM_DIRS.map((d) => path.resolve(/*turbopackIgnore: true*/ FPS_ROOT, d))
  } else if (id.startsWith("upload/")) {
    abs = path.resolve(/*turbopackIgnore: true*/ UPLOADS_DIR, id.slice(7))
    roots = [UPLOADS_DIR]
  } else throw new PathError(`unknown waveform id: ${id}`)
  let real: string
  try {
    real = await fs.realpath(abs)
  } catch {
    throw new PathError(`file not found: ${id}`)
  }
  const realRoots = await Promise.all(roots.map((r) => fs.realpath(r).catch(() => r)))
  if (!realRoots.some((r) => inside(real, r))) throw new PathError(`not an allowed waveform path: ${id}`)
  return real
}

/** Resolve every path-valued param that is in use; returns a sync resolver for toArgv. */
export async function resolverFor(ids: (string | undefined)[]) {
  const map = new Map<string, string>()
  for (const id of ids) if (id && id !== "elcentro") map.set(id, await resolveId(id))
  return (id: string) => {
    const p = map.get(id)
    if (!p) throw new PathError(`unresolved path: ${id}`)
    return p
  }
}

export function sanitizeName(name: string) {
  const base = path.basename(name).replace(/[^\w.\-() ]+/g, "_").trim()
  return base.replace(/^\.+/, "") || "upload"
}
