import type { Library, Preview, Run, Task } from "./types"
import type { Params, Script } from "./params"

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string>) {
    super(message)
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.ok === false) throw new ApiError(body?.error ?? `HTTP ${res.status}`, res.status, body?.fields)
  return body as T
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

export const api = {
  tasks: () => call<Task[]>("/api/tasks"),
  task: (id: string) => call<Task>(`/api/tasks/${id}`),
  createTask: (name: string, script: Script, params?: Params) =>
    call<Task>("/api/tasks", jsonInit("POST", { name, script, params })),
  updateTask: (id: string, patch: { name?: string; params?: Params }) =>
    call<Task>(`/api/tasks/${id}`, jsonInit("PATCH", patch)),
  deleteTask: (id: string) => call<{ ok: true }>(`/api/tasks/${id}`, { method: "DELETE" }),
  duplicateTask: (id: string) => call<Task>(`/api/tasks/${id}/duplicate`, { method: "POST" }),
  run: (id: string) => call<Run>(`/api/tasks/${id}/run`, { method: "POST" }),
  cancel: (id: string) => call<{ cancelled: number }>(`/api/tasks/${id}/cancel`, { method: "POST" }),
  result: <T>(id: string, runId: string) => call<T>(`/api/tasks/${id}/runs/${runId}/result`),
  library: () => call<Library>("/api/waveforms"),
  upload: (files: File[]) => {
    const fd = new FormData()
    for (const f of files) fd.append("file", f)
    return call<{ saved: string[]; library: Library }>("/api/waveforms", { method: "POST", body: fd })
  },
  channels: (source: string) =>
    call<{ channels: { location: string; channel: string }[] }>(
      `/api/waveforms/channels?source=${encodeURIComponent(source)}`
    ),
  preview: (params: Params, signal?: AbortSignal) =>
    call<Preview>("/api/waveforms/preview", { ...jsonInit("POST", { params }), signal }),
}

export const fileUrl = (taskId: string, runId: string, name: string, download = false) =>
  `/api/tasks/${taskId}/runs/${runId}/files/${name}${download ? "?download=1" : ""}`
export const archiveUrl = (taskId: string, runId: string) => `/api/tasks/${taskId}/runs/${runId}/archive`
