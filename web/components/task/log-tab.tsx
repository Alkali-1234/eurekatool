"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTasks } from "@/components/tasks-provider"
import { fileUrl } from "@/lib/api"
import type { Run, Task } from "@/lib/types"

/** Command, exit status and the stderr log of one run (live while it runs). */
export function LogTab({ task, run }: { task: Task; run?: Run }) {
  const { onLog } = useTasks()
  const [text, setText] = React.useState("")
  const box = React.useRef<HTMLPreElement>(null)
  const runId = run?.id
  const status = run?.status

  React.useEffect(() => {
    if (!runId) return
    let live = true
    fetch(fileUrl(task.id, runId, "log.txt"), { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => live && setText((cur) => (cur.length > t.length ? cur : t)))
      .catch(() => {})
    const off = onLog(task.id, (rid, line) => rid === runId && setText((cur) => cur + line + "\n"))
    return () => {
      live = false
      off()
    }
  }, [task.id, runId, status, onLog])

  React.useEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [text])

  if (!run) return <p className="text-sm text-muted-foreground">No runs yet.</p>
  return (
    <Card>
      <CardHeader>
        <CardTitle>Run log</CardTitle>
        <CardDescription>
          Exit code {run.exitCode ?? "—"}
          {run.error ? ` · ${run.error}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">$ {run.command}</pre>
        <pre ref={box} className="max-h-[28rem] min-h-24 overflow-auto rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap">
          {text || <span className="text-muted-foreground">(no output on stderr besides progress events)</span>}
        </pre>
      </CardContent>
    </Card>
  )
}
