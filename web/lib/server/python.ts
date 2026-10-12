import "server-only"
import { spawn } from "node:child_process"
import { FPS_ROOT, PYTHON, scriptPath } from "./paths"

/** Run a short Python helper that follows the --json contract; resolves to { code, result }. */
export function runJson(file: string, args: string[], timeoutMs = 120_000) {
  return new Promise<{ code: number | null; result: Record<string, unknown> }>((resolve, reject) => {
    const child = spawn(PYTHON, [scriptPath(file), ...args], { cwd: FPS_ROOT, env: { ...process.env, MPLBACKEND: "Agg" } })
    let out = ""
    let err = ""
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs)
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (err = (err + d).slice(-4000)))
    child.on("error", (e) => {
      clearTimeout(timer)
      reject(new Error(`failed to start ${PYTHON}: ${e.message}`))
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      try {
        resolve({ code, result: JSON.parse(out) })
      } catch {
        reject(new Error(`no JSON from ${file} (exit ${code}): ${err.trim().split("\n").pop() ?? ""}`))
      }
    })
  })
}
