"use client"

import * as React from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
import { AlertCircleIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AxisCaption,
  logTicks,
  tickNum,
  tip,
} from "@/components/task/chart-bits"
import { api } from "@/lib/api"
import { activeWaveformKeys, validate, type Params } from "@/lib/params"
import { fixed, fmt } from "@/lib/format"
import type { Preview } from "@/lib/types"

const config = {
  a: { label: "a(t)", color: "var(--foreground)" },
} satisfies ChartConfig

/** Waveform subset of the params; the preview only re-fetches when one of these changes. */
function waveformParams(p: Params): Params {
  const keys = activeWaveformKeys(p)
  return Object.fromEntries([...keys].map((k) => [k, p[k] ?? ""]))
}

export function WaveformInspector({
  params,
  disabled,
}: {
  params: Params
  disabled?: boolean
}) {
  const wp = waveformParams(params)
  const key = JSON.stringify(wp)
  const errs = validate("rstar", { ...params, u_cap_mm: "1" })
  const waveErr = Object.keys(errs).some((k) => k in wp)
  const [data, setData] = React.useState<Preview | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (disabled || waveErr) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      api
        .preview(JSON.parse(key), ctl.signal)
        .then((d) => {
          setData(d)
          setError(null)
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message)
        })
        .finally(() => !ctl.signal.aborted && setLoading(false))
    }, 450)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [key, disabled, waveErr])

  const points = React.useMemo(
    () => (data ? data.t.map((t, i) => ({ t, a: data.a_g[i] })) : []),
    [data]
  )
  const spec = React.useMemo(
    () =>
      data
        ? data.spectrum.f
            .map((f, i) => ({ f, amp: data.spectrum.amp[i] }))
            .filter((d) => d.amp > 0)
        : [],
    [data]
  )

  if (disabled)
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Choose a trace to inspect the record.
      </p>
    )

  const m = data?.meta
  const s = data?.stats
  const length = m?.length_s ?? 0
  const dur = s?.duration_used_s ?? length
  const xMax = Math.max(length, dur)

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <h3 className="font-heading text-sm font-medium">Inspect waveform</h3>
        {loading && <Spinner className="size-3.5 text-muted-foreground" />}
        {m && (
          <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
            {m.trace_id ?? m.name}
          </span>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Could not load this record</AlertTitle>
          <AlertDescription className="break-words">{error}</AlertDescription>
        </Alert>
      )}
      {waveErr && (
        <p className="text-xs text-muted-foreground">
          Fix the highlighted waveform fields to refresh the preview.
        </p>
      )}

      {!data && !error ? (
        <Skeleton className="h-56 w-full" />
      ) : data ? (
        <Tabs defaultValue="time">
          <TabsList>
            <TabsTrigger value="time">Time history</TabsTrigger>
            <TabsTrigger value="spectrum">Fourier spectrum</TabsTrigger>
          </TabsList>
          <TabsContent value="time">
            <AxisCaption y="a [g]" x="t [s]">
              <ChartContainer
                config={config}
                className="aspect-auto h-56 w-full sm:h-64"
              >
                <LineChart
                  data={points}
                  margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={[0, xMax]}
                    tickFormatter={tickNum}
                    tickLine={false}
                    height={20}
                  />
                  <YAxis
                    width={52}
                    tickFormatter={tickNum}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={{ stroke: "var(--border)" }}
                    content={tip<{ t: number; a: number }>((d) => ({
                      rows: [
                        ["t", `${fixed(d.t, 3)} s`],
                        ["a", `${fmt(d.a)} g`],
                      ],
                    }))}
                  />
                  {dur < length && (
                    <ReferenceArea
                      x1={dur}
                      x2={length}
                      fill="var(--muted-foreground)"
                      fillOpacity={0.12}
                    />
                  )}
                  {dur > length && (
                    <ReferenceArea
                      x1={length}
                      x2={dur}
                      fill="var(--muted-foreground)"
                      fillOpacity={0.08}
                    />
                  )}
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Line
                    dataKey="a"
                    type="linear"
                    dot={false}
                    isAnimationActive={false}
                    stroke="var(--color-a)"
                    strokeWidth={1}
                  />
                  {s && (
                    <ReferenceDot
                      x={s.t_pga_s}
                      y={s.a_pga_g}
                      r={4}
                      fill="var(--background)"
                      stroke="var(--foreground)"
                      label={{
                        value: `PGA ${fmt(s.pga_g)} g`,
                        position: "right",
                        fontSize: 11,
                        fill: "var(--foreground)",
                      }}
                    />
                  )}
                </LineChart>
              </ChartContainer>
            </AxisCaption>
          </TabsContent>
          <TabsContent value="spectrum">
            <AxisCaption y="|A(f)| [g·s]" x="f [Hz]">
              <ChartContainer
                config={{
                  amp: { label: "|A(f)|", color: "var(--foreground)" },
                }}
                className="aspect-auto h-56 w-full sm:h-64"
              >
                <LineChart
                  data={spec}
                  margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="f"
                    type="number"
                    scale="log"
                    domain={["dataMin", "dataMax"]}
                    allowDataOverflow
                    ticks={
                      spec.length
                        ? logTicks(spec[0].f, spec[spec.length - 1].f)
                        : []
                    }
                    tickFormatter={tickNum}
                    tickLine={false}
                    height={20}
                  />
                  <YAxis
                    dataKey="amp"
                    type="number"
                    scale="log"
                    domain={["auto", "auto"]}
                    allowDataOverflow
                    width={52}
                    tickFormatter={tickNum}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={{ stroke: "var(--border)" }}
                    content={tip<{ f: number; amp: number }>((d) => ({
                      rows: [
                        ["f", `${fmt(d.f)} Hz`],
                        ["|A|", `${fmt(d.amp)} g·s`],
                      ],
                    }))}
                  />
                  <Line
                    dataKey="amp"
                    dot={false}
                    isAnimationActive={false}
                    stroke="var(--color-amp)"
                    strokeWidth={1}
                  />
                </LineChart>
              </ChartContainer>
            </AxisCaption>
          </TabsContent>
        </Tabs>
      ) : null}

      {m && s && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
          <Stat k="PGA used" v={`${fmt(m.pga_used_g)} g`} />
          <Stat k="PGA native" v={`${fmt(m.pga_native_g)} g`} />
          <Stat k="Scale factor" v={`× ${fmt(m.scale_factor)}`} />
          <Stat k="RMS" v={`${fmt(s.rms_g)} g`} />
          <Stat k="Samples" v={`${m.n.toLocaleString()} @ ${fmt(m.dt)} s`} />
          <Stat k="Record length" v={`${fixed(m.length_s, 2)} s`} />
          <Stat k="Simulated (unshaded)" v={`${fixed(dur, 2)} s`} />
          <Stat
            k="Units in"
            v={m.response_removed ? "response removed → ACC" : m.units_in}
          />
          <div className="col-span-2 flex min-w-0 flex-col gap-0.5 sm:col-span-4">
            <dt className="text-muted-foreground">SHA-256 of file</dt>
            <dd className="truncate font-mono" title={m.sha256}>
              {m.sha256}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate font-mono tabular-nums">{v}</dd>
    </div>
  )
}
