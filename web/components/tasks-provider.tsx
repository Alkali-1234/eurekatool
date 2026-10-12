"use client"

import * as React from "react"
import { api } from "@/lib/api"
import type { Library, Progress, ServerEvent, Task } from "@/lib/types"

type LogListener = (runId: string, line: string) => void

type Ctx = {
  tasks: Task[] | null
  library: Library | null
  connected: boolean
  /** Live progress of running runs, keyed by run id. */
  progress: Record<string, Progress>
  upsert: (t: Task) => void
  remove: (id: string) => void
  refreshLibrary: () => Promise<Library>
  setLibrary: (l: Library) => void
  onLog: (taskId: string, fn: LogListener) => () => void
}

const TasksContext = React.createContext<Ctx | null>(null)

export function useTasks() {
  const c = React.useContext(TasksContext)
  if (!c) throw new Error("useTasks must be used inside <TasksProvider>")
  return c
}

export function useTask(id: string) {
  const { tasks } = useTasks()
  return tasks?.find((t) => t.id === id)
}

const sortTasks = (ts: Task[]) => [...ts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = React.useState<Task[] | null>(null)
  const [library, setLibrary] = React.useState<Library | null>(null)
  const [progress, setProgress] = React.useState<Record<string, Progress>>({})
  const [connected, setConnected] = React.useState(false)
  const logListeners = React.useRef(new Map<string, Set<LogListener>>())

  const upsert = React.useCallback((t: Task) => {
    setTasks((prev) => sortTasks([...(prev ?? []).filter((x) => x.id !== t.id), t]))
  }, [])
  const remove = React.useCallback((id: string) => setTasks((prev) => prev?.filter((x) => x.id !== id) ?? null), [])

  const refreshLibrary = React.useCallback(async () => {
    const l = await api.library()
    setLibrary(l)
    return l
  }, [])

  React.useEffect(() => {
    let es: EventSource | null = null
    let closed = false
    const load = () =>
      api.tasks().then((ts) => {
        setTasks(sortTasks(ts))
        const p: Record<string, Progress> = {}
        for (const t of ts) for (const r of t.runs) if (r.status === "running" && r.progress) p[r.id] = r.progress
        setProgress(p)
      }).catch(() => setTasks((prev) => prev ?? []))
    load()
    api.library().then(setLibrary, () => {})

    es = new EventSource("/api/events")
    es.onopen = () => {
      setConnected(true)
      if (!closed) load() // resync after a reconnect
    }
    es.onerror = () => setConnected(false)
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data) as ServerEvent
      if (ev.type === "task") {
        upsert(ev.task)
        const ended = ev.task.runs.filter((r) => r.status !== "running").map((r) => r.id)
        if (ended.length)
          setProgress((p) => {
            if (!ended.some((id) => id in p)) return p
            const q = { ...p }
            for (const id of ended) delete q[id]
            return q
          })
      } else if (ev.type === "deleted") remove(ev.id)
      else if (ev.type === "progress") setProgress((p) => ({ ...p, [ev.runId]: ev.progress }))
      else if (ev.type === "log") logListeners.current.get(ev.taskId)?.forEach((fn) => fn(ev.runId, ev.line))
    }
    return () => {
      closed = true
      es?.close()
    }
  }, [upsert, remove])

  const onLog = React.useCallback((taskId: string, fn: LogListener) => {
    const m = logListeners.current
    if (!m.has(taskId)) m.set(taskId, new Set())
    m.get(taskId)!.add(fn)
    return () => void m.get(taskId)?.delete(fn)
  }, [])

  const value = React.useMemo(
    () => ({ tasks, library, connected, progress, upsert, remove, refreshLibrary, setLibrary, onLog }),
    [tasks, library, connected, progress, upsert, remove, refreshLibrary, onLog]
  )
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}
