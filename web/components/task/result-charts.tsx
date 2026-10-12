"use client"

import * as React from "react"
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  Scatter,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  AxisCaption,
  FilledDot,
  HollowDot,
  StarMark,
  logTicks,
  tickNum,
  tip,
} from "@/components/task/chart-bits"
import { fmt } from "@/lib/format"
import type { CapRow, Grid } from "@/lib/types"

export const lossLabel = (p: number | null) =>
  p === null ? "L∞ = a_max" : p === 2 ? "L₂ = a_rms" : `L_${p}`

type Pt = {
  R: number
  L: number | null
  u: number | null
  amax: number | null
  arms: number | null
  feasible: boolean
}

/** Contiguous infeasible runs as [lo, hi] R-intervals split at geometric midpoints (as in rstar_builder.py). */
function infeasibleSpans(R: number[], feas: boolean[]) {
  const edges = [
    R[0],
    ...R.slice(1).map((r, i) => Math.sqrt(r * R[i])),
    R[R.length - 1],
  ]
  const spans: [number, number][] = []
  for (let i = 0; i < R.length; i++) {
    if (feas[i]) continue
    let j = i
    while (j + 1 < R.length && !feas[j + 1]) j++
    spans.push([edges[i], edges[j + 1]])
    i = j
  }
  return spans
}

const config = {
  L: { label: "L(R)", color: "var(--foreground)" },
  u: { label: "u_max(R)", color: "var(--foreground)" },
} satisfies ChartConfig

/** L(R) and u_max(R) on a log R axis, with infeasible bands, the u_cap line and R*. */
export function GridCharts({
  grid,
  uCap,
  row,
  p,
}: {
  grid: Grid
  uCap: number
  row: CapRow
  p: number | null
}) {
  const pts: Pt[] = React.useMemo(
    () =>
      grid.R_m.map((R, i) => ({
        R,
        L: grid.L_g[i],
        u: grid.u_max_mm[i],
        amax: grid.a_max_g[i],
        arms: grid.a_rms_g[i],
        feasible: grid.feasible[i],
      })),
    [grid]
  )
  const lo = grid.R_m[0],
    hi = grid.R_m[grid.R_m.length - 1]
  const spans = React.useMemo(
    () => infeasibleSpans(grid.R_m, grid.feasible),
    [grid]
  )
  const finite = pts.filter((d) => d.L !== null)
  const feas = finite.filter((d) => d.feasible)
  const infeas = finite.filter((d) => !d.feasible)
  const star =
    row.status === "ok"
      ? [{ R: row.r_star_m!, L: row.L_star_g!, u: row.u_max_star_mm! }]
      : []
  const ticks = logTicks(lo, hi, [1, 2, 3, 5])

  const tooltip = tip<Pt>((d) =>
    d.R === undefined
      ? null
      : {
          title: `R = ${fmt(d.R)} m${d.feasible === false ? " (infeasible)" : ""}`,
          rows: [
            ["L", `${fmt(d.L)} g`],
            ["u_max", `${fmt(d.u)} mm`],
            ...(d.amax !== undefined
              ? ([
                  ["a_max", `${fmt(d.amax)} g`],
                  ["a_rms", `${fmt(d.arms)} g`],
                ] as [string, string][])
              : []),
          ],
        }
  )

  const xAxis = () => (
    <XAxis
      dataKey="R"
      type="number"
      scale="log"
      domain={[lo, hi]}
      allowDataOverflow
      ticks={ticks}
      tickFormatter={tickNum}
      tickLine={false}
      height={20}
    />
  )
  const bands = spans.map(([a, b], i) => (
    <ReferenceArea
      key={i}
      x1={a}
      x2={b}
      fill="var(--muted-foreground)"
      fillOpacity={0.1}
      ifOverflow="hidden"
    />
  ))

  return (
    <div className="flex flex-col gap-1">
      <AxisCaption y={`${lossLabel(p)} [g]`} x={undefined}>
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <ComposedChart
            data={finite}
            margin={{ left: 0, right: 16, top: 16, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            {bands}
            {xAxis()}
            <YAxis
              dataKey="L"
              type="number"
              domain={["auto", "auto"]}
              width={56}
              tickFormatter={tickNum}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--border)" }}
              content={tooltip}
            />
            {row.r_star_m !== null && (
              <ReferenceLine
                x={row.r_star_m}
                stroke="var(--muted-foreground)"
                strokeDasharray="2 3"
              />
            )}
            <Line
              dataKey="L"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              stroke="var(--color-L)"
              strokeWidth={1}
            />
            <Scatter
              data={feas}
              dataKey="L"
              shape={<FilledDot />}
              isAnimationActive={false}
            />
            <Scatter
              data={infeas}
              dataKey="L"
              shape={<HollowDot />}
              isAnimationActive={false}
            />
            <Scatter
              data={star}
              dataKey="L"
              shape={<StarMark />}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>
      </AxisCaption>
      <AxisCaption y="u_max [mm]" x="Dish radius R [m]">
        <ChartContainer config={config} className="aspect-auto h-48 w-full">
          <ComposedChart
            data={pts.filter((d) => d.u !== null)}
            margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            {bands}
            {xAxis()}
            <YAxis
              dataKey="u"
              type="number"
              domain={["auto", "auto"]}
              width={56}
              tickFormatter={tickNum}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--border)" }}
              content={tooltip}
            />
            <ReferenceLine
              y={uCap}
              stroke="var(--foreground)"
              strokeDasharray="5 4"
              label={{
                value: `u_cap = ${fmt(uCap)} mm`,
                position: "insideTopRight",
                fontSize: 11,
                fill: "var(--foreground)",
              }}
            />
            {row.r_star_m !== null && (
              <ReferenceLine
                x={row.r_star_m}
                stroke="var(--muted-foreground)"
                strokeDasharray="2 3"
              />
            )}
            <Line
              dataKey="u"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              stroke="var(--color-u)"
              strokeWidth={1}
            />
            <Scatter
              data={feas}
              dataKey="u"
              shape={<FilledDot />}
              isAnimationActive={false}
            />
            <Scatter
              data={infeas}
              dataKey="u"
              shape={<HollowDot />}
              isAnimationActive={false}
            />
            <Scatter
              data={star}
              dataKey="u"
              shape={<StarMark r={8} />}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>
      </AxisCaption>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10">
            <circle cx="5" cy="5" r="3" fill="var(--foreground)" />
          </svg>
          feasible
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10">
            <circle
              cx="5"
              cy="5"
              r="3"
              fill="var(--background)"
              stroke="var(--muted-foreground)"
            />
          </svg>
          infeasible (u_max &gt; u_cap)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-muted-foreground/15" />
          infeasible band
        </span>
        {row.status === "ok" && (
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14">
              <StarMark cx={7} cy={7} r={6} />
            </svg>
            R*
          </span>
        )}
      </div>
    </div>
  )
}

const capConfig = {
  y: { label: "value", color: "var(--foreground)" },
} satisfies ChartConfig

/** One panel of R*(u_cap), L*(u_cap) or a_max(u_cap); infeasible caps are drawn as hollow points on the floor. */
export function CapChart({
  rows,
  field,
  label,
  selected,
  onSelect,
}: {
  rows: CapRow[]
  field: "r_star_m" | "L_star_g" | "a_max_star_g"
  label: string
  selected?: number
  onSelect?: (uCap: number) => void
}) {
  const ok = rows
    .filter((r) => r.status === "ok")
    .map((r) => ({ u: r.u_cap_mm, y: r[field] as number, row: r }))
  const floor = ok.length ? Math.min(...ok.map((d) => d.y)) : 0
  const bad = rows
    .filter((r) => r.status !== "ok")
    .map((r) => ({ u: r.u_cap_mm, y: floor, row: r }))
  const lo = rows[0]?.u_cap_mm ?? 0,
    hi = rows[rows.length - 1]?.u_cap_mm ?? 1
  const sel = ok.find((d) => d.u === selected)
  return (
    <AxisCaption y={label} x="u_cap [mm]">
      <ChartContainer config={capConfig} className="aspect-auto h-44 w-full">
        <ComposedChart
          data={ok}
          margin={{ left: 0, right: 16, top: 12, bottom: 0 }}
          onClick={(s) => {
            const v = (s as { activeLabel?: number | string } | null)
              ?.activeLabel
            if (onSelect && v !== undefined) onSelect(Number(v))
          }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="u"
            type="number"
            domain={[lo, hi === lo ? lo + 1 : hi]}
            tickFormatter={tickNum}
            tickLine={false}
            height={20}
          />
          <YAxis
            dataKey="y"
            type="number"
            domain={["auto", "auto"]}
            width={56}
            tickFormatter={tickNum}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--border)" }}
            content={tip<{ u: number; y: number; row: CapRow }>((d) => ({
              title: `u_cap = ${fmt(d.u)} mm${d.row.status !== "ok" ? " (infeasible)" : ""}`,
              rows:
                d.row.status === "ok"
                  ? [
                      ["R*", `${fmt(d.row.r_star_m)} m`],
                      ["L*", `${fmt(d.row.L_star_g)} g`],
                      ["a_max", `${fmt(d.row.a_max_star_g)} g`],
                      ["u_max(R*)", `${fmt(d.row.u_max_star_mm)} mm`],
                    ]
                  : [["feasible R", "none"]],
            }))}
          />
          {sel && (
            <ReferenceLine
              x={sel.u}
              stroke="var(--muted-foreground)"
              strokeDasharray="2 3"
            />
          )}
          <Line
            dataKey="y"
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            stroke="var(--color-y)"
            strokeWidth={1}
          />
          <Scatter
            data={ok}
            dataKey="y"
            shape={<FilledDot />}
            isAnimationActive={false}
          />
          <Scatter
            data={bad}
            dataKey="y"
            shape={<HollowDot />}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
    </AxisCaption>
  )
}
