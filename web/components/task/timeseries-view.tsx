"use client"

import * as React from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"
import { AlertCircleIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AxisCaption, tickNum, tip } from "@/components/task/chart-bits"
import { DataTable, type Column } from "@/components/task/data-table"
import { fileUrl } from "@/lib/api"
import { fixed, fmt } from "@/lib/format"

// Columns of timeseries*.csv (rstar_builder.TIMESERIES_HEADER), read by name.
const COLS = [
  { key: "t_s", label: "t", unit: "s" },
  { key: "ag_g", label: "a_g", unit: "g" },
  { key: "theta_rad", label: "θ", unit: "rad" },
  { key: "theta_dot_rad_s", label: "dθ/dt", unit: "rad/s" },
  { key: "theta_ddot_rad_s2", label: "d²θ/dt²", unit: "rad/s²" },
  { key: "u_mm", label: "u", unit: "mm" },
  { key: "u_dot_m_s", label: "du/dt", unit: "m/s" },
  { key: "u_ddot_m_s2", label: "d²u/dt²", unit: "m/s²" },
  { key: "a_abs_g", label: "a_abs", unit: "g" },
] as const
type Key = (typeof COLS)[number]["key"]
type Series = Record<Key, Float64Array>

type View = { label: string; y: string; lines: { key: Key; name: string; muted?: boolean }[] }
const VIEWS: Record<string, View> = {
  u: { label: "u", y: "u [mm]", lines: [{ key: "u_mm", name: "u" }] },
  theta: { label: "θ", y: "θ [rad]", lines: [{ key: "theta_rad", name: "θ" }] },
  theta_dot: { label: "dθ/dt", y: "dθ/dt [rad/s]", lines: [{ key: "theta_dot_rad_s", name: "dθ/dt" }] },
  theta_ddot: { label: "d²θ/dt²", y: "d²θ/dt² [rad/s²]", lines: [{ key: "theta_ddot_rad_s2", name: "d²θ/dt²" }] },
  acc: {
    label: "Acceleration",
    y: "a [g]",
    lines: [
      { key: "a_abs_g", name: "a_abs (transmitted)" },
      { key: "ag_g", name: "a_g (ground)", muted: true },
    ],
  },
}

const config = {
  a_abs_g: { label: "a_abs", color: "var(--foreground)" },
  ag_g: { label: "a_g", color: "var(--muted-foreground)" },
  ...Object.fromEntries(
    ["u_mm", "theta_rad", "theta_dot_rad_s", "theta_ddot_rad_s2"].map((k) => [k, { color: "var(--foreground)" }])
  ),
} satisfies ChartConfig

function parse(text: string): { s: Series; n: number } {
  const lines = text.trim().split("\n")
  const header = lines[0].trim().split(",")
  const n = lines.length - 1
  const idx = COLS.map((c) => header.indexOf(c.key))
  const missing = COLS.filter((_, j) => idx[j] < 0).map((c) => c.key)
  if (missing.length) throw new Error(`missing columns: ${missing.join(", ")}`)
  const s = Object.fromEntries(COLS.map((c) => [c.key, new Float64Array(n)])) as Series
  for (let i = 0; i < n; i++) {
    const v = lines[i + 1].split(",")
    COLS.forEach((c, j) => (s[c.key][i] = v[idx[j]] === "" ? NaN : Number(v[idx[j]])))
  }
  return { s, n }
}

/** Indices to plot: per bucket, the min and max of every plotted channel (keeps the peaks), in time order. */
function decimate(n: number, cols: Float64Array[], buckets = 800) {
  if (n <= buckets * 2) return Array.from({ length: n }, (_, i) => i)
  const keep = new Set<number>([0, n - 1])
  const size = n / buckets
  for (let b = 0; b < buckets; b++) {
    const lo = Math.floor(b * size), hi = Math.min(n, Math.floor((b + 1) * size))
    for (const c of cols) {
      let iMin = lo, iMax = lo
      for (let i = lo + 1; i < hi; i++) {
        if (c[i] < c[iMin]) iMin = i
        if (c[i] > c[iMax]) iMax = i
      }
      keep.add(iMin).add(iMax)
    }
  }
  return [...keep].sort((a, b) => a - b)
}

const argAbsMax = (c: Float64Array) => {
  let k = 0
  for (let i = 1; i < c.length; i++) if (Math.abs(c[i]) > Math.abs(c[k])) k = i
  return k
}

/** Every simulated time step at R*, read from the CSV the builder wrote: chart per variable plus the full table.
 *  Mount with key={file} so switching files starts from a fresh loading state. */
export function TimeseriesView({ taskId, runId, file, uCap }: { taskId: string; runId: string; file: string; uCap: number }) {
  const [state, setState] = React.useState<{ data?: { s: Series; n: number }; error?: string }>({})
  const [view, setView] = React.useState("u")

  React.useEffect(() => {
    const ctl = new AbortController()
    fetch(fileUrl(taskId, runId, file), { cache: "no-store", signal: ctl.signal })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => setState({ data: parse(t) }))
      .catch((e: Error) => e.name !== "AbortError" && setState({ error: e.message }))
    return () => ctl.abort()
  }, [taskId, runId, file])

  const data = state.data
  const v = VIEWS[view]
  const points = React.useMemo(() => {
    if (!data) return []
    const { s, n } = data
    return decimate(n, v.lines.map((l) => s[l.key])).map((i) => {
      const p: Record<string, number> = { t: s.t_s[i] }
      for (const l of v.lines) p[l.key] = s[l.key][i]
      return p
    })
  }, [data, v])
  const peaks = React.useMemo(
    () => (data ? { u: argAbsMax(data.s.u_mm), a: argAbsMax(data.s.a_abs_g) } : null),
    [data]
  )
  const rows = React.useMemo(() => (data ? Array.from({ length: data.n }, (_, i) => i) : []), [data])
  const columns: Column<number>[] = React.useMemo(
    () =>
      COLS.map((c) => ({
        key: c.key,
        header: `${c.label} [${c.unit}]`,
        value: (i: number) => (data ? data.s[c.key][i] : null),
        render: (i: number) => (data ? (c.key === "t_s" ? fixed(data.s.t_s[i], 4) : fmt(data.s[c.key][i], 6)) : "—"),
      })),
    [data]
  )

  if (state.error)
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Could not load {file}</AlertTitle>
        <AlertDescription className="break-words">{state.error}</AlertDescription>
      </Alert>
    )
  if (!data || !peaks)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )

  const { s, n } = data
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {n} time steps of {fmt(s.t_s[1] - s.t_s[0])} s. Peak |u| = {fmt(Math.abs(s.u_mm[peaks.u]))} mm at t ={" "}
        {fixed(s.t_s[peaks.u], 3)} s; peak |a_abs| = {fmt(Math.abs(s.a_abs_g[peaks.a]))} g at t = {fixed(s.t_s[peaks.a], 3)} s;
        u at the end = {fmt(s.u_mm[n - 1])} mm. Highlighted rows: the two peaks.
      </p>
      <Tabs value={view} onValueChange={(x) => setView(x as string)}>
        <TabsList className="h-auto max-w-full flex-wrap">
          {Object.entries(VIEWS).map(([k, x]) => (
            <TabsTrigger key={k} value={k} className="px-2.5">
              {x.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <AxisCaption y={v.y} x="t [s]">
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <LineChart data={points} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="t" type="number" domain={[0, s.t_s[n - 1]]} tickFormatter={tickNum} tickLine={false}
              height={20} />
            <YAxis width={56} tickFormatter={tickNum} tickLine={false} axisLine={false} />
            <ChartTooltip
              cursor={{ stroke: "var(--border)" }}
              content={tip<Record<string, number>>((d) => ({
                rows: [
                  ["t", `${fixed(d.t, 3)} s`],
                  ...v.lines.map((l) => [l.name, `${fmt(d[l.key])} ${COLS.find((c) => c.key === l.key)!.unit}`] as [string, string]),
                ],
              }))}
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            {view === "u" &&
              [uCap, -uCap].map((y) => (
                <ReferenceLine key={y} y={y} stroke="var(--foreground)" strokeDasharray="5 4"
                  label={y > 0 ? { value: `±u_cap = ${fmt(uCap)} mm`, position: "insideTopRight", fontSize: 11,
                    fill: "var(--foreground)" } : undefined} />
              ))}
            {[...v.lines].reverse().map((l) => (
              <Line key={l.key} dataKey={l.key} type="linear" dot={false} isAnimationActive={false}
                stroke={`var(--color-${l.key})`} strokeWidth={l.muted ? 0.8 : 1} strokeOpacity={l.muted ? 0.45 : 1} />
            ))}
          </LineChart>
        </ChartContainer>
      </AxisCaption>
      {v.lines.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
          {v.lines.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4" style={{ background: l.muted ? "var(--muted-foreground)" : "var(--foreground)" }} />
              {l.name}
            </span>
          ))}
        </div>
      )}
      <DataTable columns={columns} rows={rows} highlight={(i) => i === peaks.u || i === peaks.a} />
    </div>
  )
}
