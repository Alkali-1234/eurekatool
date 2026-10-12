"use client"

import * as React from "react"
import {
  AlertCircleIcon, ChartLineIcon, DownloadIcon, FileArchiveIcon, FileIcon, FileJsonIcon, FileSpreadsheetIcon,
  ImageIcon, TriangleAlertIcon,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataTable, type Column } from "@/components/task/data-table"
import { CapChart, GridCharts, lossLabel } from "@/components/task/result-charts"
import { RunProgress } from "@/components/task/run-progress"
import { StatusBadge } from "@/components/status-badge"
import { api, archiveUrl, fileUrl } from "@/lib/api"
import { fmt } from "@/lib/format"
import { dateTime, duration } from "@/lib/format"
import type { CapRow, Grid, RstarResult, Run, Task, UmaxResult } from "@/lib/types"

const FILE_META: Record<string, { label: string; icon: React.ComponentType }> = {
  "grid.csv": { label: "R grid (grid.csv)", icon: FileSpreadsheetIcon },
  "table.csv": { label: "Cap table (table.csv)", icon: FileSpreadsheetIcon },
  "sweep_grid.csv": { label: "R sweep (sweep_grid.csv)", icon: FileSpreadsheetIcon },
  "L_of_R.pdf": { label: "Figure (PDF)", icon: FileIcon },
  "L_of_R.png": { label: "Figure (PNG)", icon: ImageIcon },
  "umax_table.pdf": { label: "Figure (PDF)", icon: FileIcon },
  "umax_table.png": { label: "Figure (PNG)", icon: ImageIcon },
  "result.json": { label: "Full result (result.json)", icon: FileJsonIcon },
  "log.txt": { label: "Run log (log.txt)", icon: FileIcon },
}

export function ResultsTab({ task, runId, onRunId }: { task: Task; runId: string | null; onRunId: (id: string) => void }) {
  const runs = [...task.runs].reverse()
  const run = runs.find((r) => r.id === runId) ?? runs[0]

  if (!run)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartLineIcon />
          </EmptyMedia>
          <EmptyTitle>No runs yet</EmptyTitle>
          <EmptyDescription>Set the arguments in Setup, then press Run. Results, charts and downloads appear here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  const runItems = runs.map((r, i) => ({ value: r.id, label: `Run ${runs.length - i} · ${dateTime(r.createdAt)}` }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select items={runItems} value={run.id} onValueChange={(v) => v && onRunId(v as string)}>
          <SelectTrigger className="min-w-0 max-w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {runs.map((r, i) => (
              <SelectItem key={r.id} value={r.id}>
                Run {runs.length - i} · {dateTime(r.createdAt)} · {r.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <StatusBadge status={run.status} />
        {run.startedAt && (
          <span className="text-xs text-muted-foreground">
            {run.status === "running" ? "running for " : "took "}
            {duration(run.startedAt, run.finishedAt)}
          </span>
        )}
        {run.status === "done" && <Downloads task={task} run={run} />}
      </div>

      {(run.status === "running" || run.status === "queued") && <RunProgress run={run} />}
      {(run.status === "failed" || run.status === "interrupted" || run.status === "cancelled") && (
        <Alert variant={run.status === "cancelled" ? "default" : "destructive"}>
          <AlertCircleIcon />
          <AlertTitle>Run {run.status}</AlertTitle>
          <AlertDescription className="break-words">
            {run.error ?? "No details."} {run.status !== "cancelled" && "See the Log tab for the full output."}
          </AlertDescription>
        </Alert>
      )}
      {run.status === "done" && <RunResult key={run.id} task={task} run={run} />}
    </div>
  )
}

function Downloads({ task, run }: { task: Task; run: Run }) {
  const files = (run.files ?? []).filter((f) => f in FILE_META)
  const order = Object.keys(FILE_META)
  files.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="ml-auto" />}>
        <DownloadIcon data-icon="inline-start" />
        Download
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Outputs of this run</DropdownMenuLabel>
          {files.map((f) => {
            const Icon = FILE_META[f].icon
            return (
              <DropdownMenuItem key={f} render={<a href={fileUrl(task.id, run.id, f, true)} download />}>
                <Icon />
                {FILE_META[f].label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<a href={archiveUrl(task.id, run.id)} download />}>
          <FileArchiveIcon />
          Everything (.zip)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function useResult<T>(taskId: string, runId: string) {
  const [state, setState] = React.useState<{ data?: T; error?: string }>({})
  React.useEffect(() => {
    let live = true
    api.result<T>(taskId, runId).then(
      (data) => live && setState({ data }),
      (e) => live && setState({ error: e.message })
    )
    return () => {
      live = false
    }
  }, [taskId, runId])
  return state
}

function RunResult({ task, run }: { task: Task; run: Run }) {
  const { data, error } = useResult<RstarResult | UmaxResult>(task.id, run.id)
  if (error)
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Could not load result.json</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  if (!data)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  return (
    <div className="flex flex-col gap-4">
      {data.warnings.map((w) => (
        <Alert key={w}>
          <TriangleAlertIcon />
          <AlertDescription>{w}</AlertDescription>
        </Alert>
      ))}
      {task.script === "rstar" ? (
        <RstarView task={task} run={run} r={data as RstarResult} />
      ) : (
        <UmaxView task={task} run={run} r={data as UmaxResult} />
      )}
      <p className="text-xs text-muted-foreground">
        Waveform: <span className="font-mono">{data.waveform.trace_id ?? data.waveform.name}</span>, PGA{" "}
        {fmt(data.waveform.pga_used_g)} g{data.waveform.pga_target_g ? " (scaled)" : ""}, simulated {fmt(data.inputs.duration_s)} s · μ ={" "}
        {data.inputs.mu}, p = {data.inputs.p ?? "∞"}, dt = {data.inputs.dt} s, v_eps = {data.inputs.v_eps} m/s, {data.inputs.n_r} radii in [
        {data.inputs.r_min}, {data.inputs.r_max}] m.
      </p>
    </div>
  )
}

function Stat({ label, value, unit, sub }: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode }) {
  return (
    <Card size="sm" className="min-w-0">
      <CardContent className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate font-heading text-xl font-semibold tabular-nums">
          {value}
          {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
        </span>
        {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  )
}

function FigureOrChart({ chart, task, run, stem }: { chart: React.ReactNode; task: Task; run: Run; stem: string }) {
  return (
    <Tabs defaultValue="chart">
      <TabsList>
        <TabsTrigger value="chart">Interactive</TabsTrigger>
        <TabsTrigger value="figure">Script figure</TabsTrigger>
      </TabsList>
      <TabsContent value="chart">{chart}</TabsContent>
      <TabsContent value="figure">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated file, served by the API */}
        <img src={fileUrl(task.id, run.id, `${stem}.png`)} alt="Figure written by the script (black and white)"
          className="mx-auto w-full max-w-3xl rounded-lg border bg-white" />
        <div className="mt-2 flex justify-center gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={fileUrl(task.id, run.id, `${stem}.pdf`)} target="_blank" rel="noreferrer" />}>
            Open PDF
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  )
}

const num = (d = 4) => (v: number | null) => fmt(v, d)

function gridColumns(): Column<{ R: number; u: number | null; arms: number | null; amax: number | null; L: number | null; f: boolean }>[] {
  return [
    { key: "R", header: "R [m]", value: (r) => r.R, render: (r) => fmt(r.R, 5) },
    { key: "u", header: "u_max [mm]", value: (r) => r.u, render: (r) => num(5)(r.u) },
    { key: "arms", header: "a_rms [g]", value: (r) => r.arms, render: (r) => num(5)(r.arms) },
    { key: "amax", header: "a_max [g]", value: (r) => r.amax, render: (r) => num(5)(r.amax) },
    { key: "L", header: "L [g]", value: (r) => r.L, render: (r) => num(5)(r.L) },
    { key: "f", header: "feasible", value: (r) => (r.f ? 1 : 0), render: (r) => (r.f ? "yes" : "no") },
  ]
}

const gridRows = (g: Grid) =>
  g.R_m.map((R, i) => ({ R, u: g.u_max_mm[i], arms: g.a_rms_g[i], amax: g.a_max_g[i], L: g.L_g[i], f: g.feasible[i] }))

function RstarView({ task, run, r }: { task: Task; run: Run; r: RstarResult }) {
  const rows = React.useMemo(() => gridRows(r.grid), [r])
  const cols = React.useMemo(() => gridColumns(), [])
  const ok = r.status === "ok"
  return (
    <>
      {!ok && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Infeasible</AlertTitle>
          <AlertDescription>u_max &gt; {fmt(r.u_cap_mm)} mm for every R on the grid. Raise u_cap, lower the PGA, or widen the R range.</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="R*" value={ok ? fmt(r.r_star_m, 4) : "—"} unit="m" sub={r.at_grid_edge ? "at grid edge" : undefined} />
        <Stat label={`L(R*), ${lossLabel(r.inputs.p)}`} value={ok ? fmt(r.L_star_g, 4) : "—"} unit="g" />
        <Stat label="u_max(R*)" value={ok ? fmt(r.u_max_star_mm, 4) : "—"} unit="mm" sub={`cap ${fmt(r.u_cap_mm)} mm`} />
        <Stat label="a_max(R*)" value={ok ? fmt(r.a_max_star_g, 4) : "—"} unit="g" />
        <Stat label="a_rms(R*)" value={ok ? fmt(r.a_rms_star_g, 4) : "—"} unit="g" />
        <Stat label="Feasible radii" value={`${r.n_feasible} / ${r.grid.R_m.length}`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>L(R) and u_max(R)</CardTitle>
          <CardDescription>Hover for values. Shaded bands: u_max &gt; u_cap.</CardDescription>
        </CardHeader>
        <CardContent>
          <FigureOrChart task={task} run={run} stem="L_of_R"
            chart={<GridCharts grid={r.grid} uCap={r.u_cap_mm} row={r} p={r.inputs.p} />} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Output table</CardTitle>
          <CardDescription>grid.csv: one row per radius. Click a header to sort.</CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" nativeButton={false} render={<a href={fileUrl(task.id, run.id, "grid.csv", true)} download />}>
              <DownloadIcon data-icon="inline-start" />
              CSV
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <DataTable columns={cols} rows={rows} muted={(x) => !x.f} highlight={(x) => x.R === r.r_star_m} />
        </CardContent>
      </Card>
    </>
  )
}

function UmaxView({ task, run, r }: { task: Task; run: Run; r: UmaxResult }) {
  const firstOk = r.table.find((x) => x.status === "ok")?.u_cap_mm ?? r.table[0]?.u_cap_mm
  const [cap, setCap] = React.useState<number | undefined>(firstOk)
  const capIdx = Math.max(0, r.results.findIndex((x) => x.u_cap_mm === cap))
  const capRes = r.results[capIdx]
  const sweepRows = React.useMemo(() => gridRows(capRes.grid), [capRes])
  const gcols = React.useMemo(() => gridColumns(), [])
  const tcols: Column<CapRow>[] = React.useMemo(
    () => [
      { key: "u", header: "u_cap [mm]", value: (x) => x.u_cap_mm, render: (x) => fmt(x.u_cap_mm, 6) },
      { key: "s", header: "status", value: (x) => x.status, align: "left" },
      { key: "R", header: "R* [m]", value: (x) => x.r_star_m, render: (x) => num(5)(x.r_star_m) },
      { key: "L", header: "L* [g]", value: (x) => x.L_star_g, render: (x) => num(5)(x.L_star_g) },
      { key: "um", header: "u_max(R*) [mm]", value: (x) => x.u_max_star_mm, render: (x) => num(5)(x.u_max_star_mm) },
      { key: "am", header: "a_max [g]", value: (x) => x.a_max_star_g, render: (x) => num(5)(x.a_max_star_g) },
      { key: "ar", header: "a_rms [g]", value: (x) => x.a_rms_star_g, render: (x) => num(5)(x.a_rms_star_g) },
      { key: "n", header: "n feasible", value: (x) => x.n_feasible },
      { key: "e", header: "at edge", value: (x) => (x.at_grid_edge === null ? null : x.at_grid_edge ? 1 : 0),
        render: (x) => (x.at_grid_edge === null ? "—" : x.at_grid_edge ? "yes" : "no") },
    ],
    []
  )
  const capItems = r.table.map((x) => ({ value: String(x.u_cap_mm), label: `u_cap = ${fmt(x.u_cap_mm)} mm${x.status !== "ok" ? " (infeasible)" : ""}` }))
  const ok = r.table.filter((x) => x.status === "ok")

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Caps" value={r.n_caps} sub={`${fmt(r.inputs.u_min_mm)} → ${fmt(r.inputs.u_max_mm)} mm, step ${fmt(r.inputs.du_mm)}`} />
        <Stat label="Infeasible caps" value={r.n_infeasible} />
        <Stat label="R* range" value={ok.length ? `${fmt(ok[0].r_star_m, 3)}–${fmt(ok[ok.length - 1].r_star_m, 3)}` : "—"} unit="m" />
        <Stat label="a_max range" value={ok.length ? `${fmt(Math.min(...ok.map((x) => x.a_max_star_g!)), 3)}–${fmt(Math.max(...ok.map((x) => x.a_max_star_g!)), 3)}` : "—"} unit="g" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>R*, L* and a_max vs u_cap</CardTitle>
          <CardDescription>Click a point to inspect that cap&apos;s L(R) below. Hollow points: infeasible caps.</CardDescription>
        </CardHeader>
        <CardContent>
          <FigureOrChart task={task} run={run} stem="umax_table"
            chart={
              <div className="flex flex-col gap-1">
                <CapChart rows={r.table} field="r_star_m" label="R* [m]" selected={cap} onSelect={setCap} />
                <CapChart rows={r.table} field="L_star_g" label={`${lossLabel(r.inputs.p)}(R*) [g]`} selected={cap} onSelect={setCap} />
                <CapChart rows={r.table} field="a_max_star_g" label="a_max,actual [g]" selected={cap} onSelect={setCap} />
              </div>
            } />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Output table</CardTitle>
          <CardDescription>table.csv: R* for every travel cap.</CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" nativeButton={false} render={<a href={fileUrl(task.id, run.id, "table.csv", true)} download />}>
              <DownloadIcon data-icon="inline-start" />
              CSV
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <DataTable columns={tcols} rows={r.table} muted={(x) => x.status !== "ok"} highlight={(x) => x.u_cap_mm === cap} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Grid search for one cap</CardTitle>
          <CardDescription>The R sweep is shared by all caps; only the feasibility mask changes.</CardDescription>
          <CardAction>
            <Select items={capItems} value={String(capRes.u_cap_mm)} onValueChange={(v) => v && setCap(Number(v))}>
              <SelectTrigger size="sm" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {capItems.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <GridCharts grid={capRes.grid} uCap={capRes.u_cap_mm} row={capRes} p={r.inputs.p} />
          <DataTable columns={gcols} rows={sweepRows} muted={(x) => !x.f} highlight={(x) => x.R === capRes.r_star_m} />
        </CardContent>
      </Card>
    </>
  )
}
