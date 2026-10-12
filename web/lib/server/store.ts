import "server-only"
import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import { TASKS_DIR } from "./paths"
import { emit } from "./events"
import type { Run, Task } from "../types"
import { defaultParams, type Params, type Script } from "../params"

// Tasks live in web-data/tasks/<id>/task.json; run outputs in web-data/tasks/<id>/runs/<runId>/.
// An in-memory copy (kept on globalThis so dev hot-reloads share it) is the source of truth while the server runs.

type State = { tasks: Map<string, Task>; loading: Promise<void> | null }
const g = globalThis as unknown as { __fpsStore?: State }
const state: State = g.__fpsStore ?? (g.__fpsStore = { tasks: new Map(), loading: null })

export const taskDir = (id: string) => path.join(TASKS_DIR, id)
export const runDir = (taskId: string, runId: string) => path.join(TASKS_DIR, taskId, "runs", runId)

export const newId = () => {
  const d = new Date()
  const stamp = d.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-")
  return `${stamp}-${crypto.randomBytes(3).toString("hex")}`
}

const validId = (id: string) => /^[\w-]+$/.test(id)

async function load() {
  await fs.mkdir(TASKS_DIR, { recursive: true })
  for (const name of await fs.readdir(TASKS_DIR)) {
    try {
      const t = JSON.parse(await fs.readFile(path.join(TASKS_DIR, name, "task.json"), "utf8")) as Task
      let dirty = false
      for (const r of t.runs) {
        // nothing survives a server restart: a run that was queued or running is gone
        if (r.status === "running" || r.status === "queued") {
          r.status = "interrupted"
          r.finishedAt ??= new Date().toISOString()
          r.error ??= "the server stopped while this run was " + (r.startedAt ? "running" : "queued")
          dirty = true
        }
      }
      state.tasks.set(t.id, t)
      if (dirty) await persist(t)
    } catch {
      /* not a task folder */
    }
  }
}

async function ready() {
  state.loading ??= load()
  await state.loading
}

async function persist(t: Task) {
  const dir = taskDir(t.id)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `task.json.${process.pid}.${Date.now()}.tmp`)
  await fs.writeFile(tmp, JSON.stringify(t, null, 1))
  await fs.rename(tmp, path.join(dir, "task.json"))
}

async function save(t: Task) {
  t.updatedAt = new Date().toISOString()
  await persist(t)
  emit({ type: "task", task: t })
  return t
}

export async function listTasks(): Promise<Task[]> {
  await ready()
  return [...state.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getTask(id: string): Promise<Task | undefined> {
  await ready()
  return validId(id) ? state.tasks.get(id) : undefined
}

export async function createTask(name: string, script: Script, params?: Params): Promise<Task> {
  await ready()
  const now = new Date().toISOString()
  const t: Task = { id: newId(), name, script, params: { ...defaultParams(script), ...params }, createdAt: now,
    updatedAt: now, runs: [] }
  state.tasks.set(t.id, t)
  return save(t)
}

export async function updateTask(id: string, patch: { name?: string; params?: Params }) {
  const t = await getTask(id)
  if (!t) return undefined
  if (patch.name !== undefined) t.name = patch.name
  if (patch.params) t.params = { ...t.params, ...patch.params }
  return save(t)
}

export async function deleteTask(id: string) {
  const t = await getTask(id)
  if (!t) return false
  state.tasks.delete(id)
  await fs.rm(taskDir(id), { recursive: true, force: true })
  emit({ type: "deleted", id })
  return true
}

export async function addRun(id: string, run: Run) {
  const t = await getTask(id)
  if (!t) return undefined
  t.runs.push(run)
  return save(t)
}

export async function updateRun(taskId: string, runId: string, patch: Partial<Run>) {
  const t = await getTask(taskId)
  const r = t?.runs.find((x) => x.id === runId)
  if (!t || !r) return undefined
  Object.assign(r, patch)
  await save(t)
  return r
}

export async function getRun(taskId: string, runId: string) {
  const t = await getTask(taskId)
  return t?.runs.find((x) => x.id === runId)
}
