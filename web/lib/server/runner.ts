import "server-only"
import { spawn, type ChildProcess } from "node:child_process"
import fs from "node:fs"
import fsp from "node:fs/promises"
import { FPS_ROOT, MAX_CONCURRENT, PYTHON, scriptPath } from "./paths"
import { addRun, getTask, newId, runDir, updateRun } from "./store"
import { emit } from "./events"
import { resolverFor } from "./waveforms"
import { SCRIPTS, commandLine, displayPath, toArgv, validate, type Script } from "../params"
import type { Progress, Run } from "../types"

// Runs the builders exactly like examples/call_from_node.mjs: `python <script> --json ... --out <runDir>`.
// stdout = one JSON result, stderr = NDJSON progress events mixed with plain log lines, exit 0 / 1 / 2.

type Job = { taskId: string; runId: string; script: Script; argv: string[]; child?: ChildProcess; cancelled?: boolean }
type State = { queue: Job[]; running: Map<string, Job>; progress: Map<string, Progress> }
const g = globalThis as unknown as { __fpsRunner?: State }
const state: State = g.__fpsRunner ?? (g.__fpsRunner = { queue: [], running: new Map(), progress: new Map() })

// Do not leave simulations running when the server stops; the store marks them "interrupted" on the next start.
const gs = globalThis as unknown as { __fpsExitHook?: boolean }
if (!gs.__fpsExitHook) {
  gs.__fpsExitHook = true
  const killAll = () => state.running.forEach((j) => j.child?.kill("SIGTERM"))
  process.on("exit", killAll)
  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.once(sig, () => {
      killAll()
      process.exit(0)
    })
}

export class RunInputError extends Error {
  constructor(message: string, public fields?: Record<string, string>) {
    super(message)
  }
}

export const liveProgress = (runId: string) => state.progress.get(runId)

export async function enqueueRun(taskId: string): Promise<Run> {
  const task = await getTask(taskId)
  if (!task) throw new RunInputError("task not found")
  if (task.runs.some((r) => r.status === "running" || r.status === "queued"))
    throw new RunInputError("this task already has a run in progress")
  const errors = validate(task.script, task.params)
  if (Object.keys(errors).length)
    throw new RunInputError("fix the highlighted fields: " + Object.keys(errors).join(", "), errors)
  const resolve = await resolverFor([task.params.source, task.params.inventory]).catch((e: Error) => {
    throw new RunInputError(e.message)
  })
  const argv = toArgv(task.script, task.params, resolve)
  const run: Run = {
    id: newId(),
    status: "queued",
    params: { ...task.params },
    argv,
    command: commandLine(task.script, toArgv(task.script, task.params, displayPath)),
    createdAt: new Date().toISOString(),
  }
  await addRun(taskId, run)
  state.queue.push({ taskId, runId: run.id, script: task.script, argv })
  pump()
  return run
}

function pump() {
  while (state.running.size < MAX_CONCURRENT && state.queue.length) {
    const job = state.queue.shift()!
    state.running.set(job.runId, job)
    start(job).catch(async (e: Error) => {
      state.running.delete(job.runId)
      await updateRun(job.taskId, job.runId, { status: "failed", error: e.message, finishedAt: new Date().toISOString() })
      pump()
    })
  }
}

async function start(job: Job) {
  const dir = runDir(job.taskId, job.runId)
  await fsp.mkdir(dir, { recursive: true })
  const log = fs.createWriteStream(`${dir}/log.txt`, { flags: "a" })
  log.on("error", () => {}) // the task may be deleted while running
  const args = [scriptPath(SCRIPTS[job.script].file), "--json", ...job.argv, "--out", dir]
  const child = spawn(PYTHON, args, { cwd: FPS_ROOT, env: { ...process.env, PYTHONUNBUFFERED: "1", MPLBACKEND: "Agg" } })
  job.child = child
  await updateRun(job.taskId, job.runId, { status: "running", startedAt: new Date().toISOString() })

  let out = ""
  let errBuf = ""
  const tail: string[] = []
  child.stdout.on("data", (d) => (out += d))
  child.stderr.on("data", (d) => {
    errBuf += d
    let i
    while ((i = errBuf.indexOf("\n")) >= 0) {
      const line = errBuf.slice(0, i)
      errBuf = errBuf.slice(i + 1)
      handleLine(job, line, log, tail)
    }
  })

  await new Promise<void>((resolve) => {
    let finished = false
    const finish = async (code: number | null, signal: NodeJS.Signals | null) => {
      if (finished) return
      finished = true
      if (errBuf) handleLine(job, errBuf, log, tail)
      log.end()
      state.running.delete(job.runId)
      const prog = state.progress.get(job.runId)
      state.progress.delete(job.runId)
      let result: Record<string, unknown> | null = null
      try {
        result = JSON.parse(out)
      } catch {}
      const patch: Partial<Run> = { finishedAt: new Date().toISOString(), exitCode: code, progress: prog }
      if (job.cancelled) {
        patch.status = "cancelled"
        patch.error = "cancelled by user"
      } else if (code === 0 && result?.ok) {
        patch.status = "done"
        patch.summary = summarize(job.script, result)
      } else {
        patch.status = "failed"
        patch.error =
          (result?.error as string | undefined) ??
          (signal ? `killed by ${signal}` : `exit ${code}, no JSON on stdout`) +
            (tail.length ? ` — ${tail[tail.length - 1]}` : "")
      }
      patch.files = await fsp.readdir(dir).catch(() => [])
      await updateRun(job.taskId, job.runId, patch)
      resolve()
      pump()
    }
    child.on("error", (e) => {
      handleLine(job, `failed to start ${PYTHON}: ${e.message}`, log, tail)
      void finish(null, null)
    })
    child.on("close", (code, signal) => void finish(code, signal))
  })
}

function handleLine(job: Job, line: string, log: fs.WriteStream, tail: string[]) {
  if (!line.trim()) return
  try {
    const ev = JSON.parse(line)
    if (ev && typeof ev === "object" && "event" in ev) {
      if (ev.event === "progress") {
        const p: Progress = { stage: ev.stage, done: ev.done, total: ev.total }
        state.progress.set(job.runId, p)
        emit({ type: "progress", taskId: job.taskId, runId: job.runId, progress: p })
      } else if (ev.event === "start") {
        const p: Progress = { stage: "simulate", done: 0, total: ev.steps ?? 1 }
        state.progress.set(job.runId, p)
        emit({ type: "progress", taskId: job.taskId, runId: job.runId, progress: p })
      }
      return
    }
  } catch {
    /* plain log line */
  }
  log.write(line + "\n")
  tail.push(line)
  if (tail.length > 20) tail.shift()
  emit({ type: "log", taskId: job.taskId, runId: job.runId, line })
}

function summarize(script: Script, r: Record<string, unknown>) {
  if (script === "rstar") {
    const { status, r_star_m, L_star_g, u_max_star_mm, a_max_star_g, a_rms_star_g, n_feasible } = r
    return { status, r_star_m, L_star_g, u_max_star_mm, a_max_star_g, a_rms_star_g, n_feasible }
  }
  return { n_caps: r.n_caps, n_infeasible: r.n_infeasible }
}

export async function cancelTask(taskId: string) {
  let n = 0
  for (const job of state.queue.filter((j) => j.taskId === taskId)) {
    state.queue.splice(state.queue.indexOf(job), 1)
    await updateRun(taskId, job.runId, { status: "cancelled", error: "cancelled before it started",
      finishedAt: new Date().toISOString() })
    n++
  }
  for (const job of state.running.values()) {
    if (job.taskId !== taskId) continue
    job.cancelled = true
    job.child?.kill("SIGTERM")
    n++
  }
  return n
}
