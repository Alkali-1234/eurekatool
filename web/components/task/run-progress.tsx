"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { useTasks } from "@/components/tasks-provider"
import type { Run } from "@/lib/types"

function useNow(active: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

const secs = (s: number) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`)

/** Progress of the RK4 time loop (NDJSON events from the script), with a simple ETA. */
export function RunProgress({ run, compact }: { run: Run; compact?: boolean }) {
  const { progress } = useTasks()
  const p = progress[run.id] ?? run.progress
  const now = useNow(run.status === "running")
  const frac = p && p.total ? p.done / p.total : 0
  const elapsed = run.startedAt ? (now - new Date(run.startedAt).getTime()) / 1000 : 0
  const eta = frac > 0.02 ? (elapsed / frac) * (1 - frac) : null
  const label =
    run.status === "queued"
      ? "Waiting for a free worker…"
      : !p
        ? "Loading waveform…"
        : frac >= 1
          ? "Writing CSV and figures…"
          : `Simulating ${run.params.n_r} radii · step ${p.done.toLocaleString()} / ${p.total.toLocaleString()}`

  const bar = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <Spinner className="size-3.5" />
        <span className="truncate">{label}</span>
        <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {run.status === "running" && `${Math.round(frac * 100)} %`}
          {eta !== null && frac < 1 && ` · ~${secs(eta)} left`}
        </span>
      </div>
      <Progress value={run.status === "queued" ? null : Math.round(frac * 100)} />
    </div>
  )
  if (compact) return bar
  return (
    <Card>
      <CardContent>{bar}</CardContent>
    </Card>
  )
}
