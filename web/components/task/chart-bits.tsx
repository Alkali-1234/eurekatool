"use client"

// Small shared pieces for the Recharts plots (tooltip box, number ticks, log ticks).

type Row = [string, React.ReactNode]

export function TipBox({ title, rows }: { title?: React.ReactNode; rows: Row[] }) {
  return (
    <div className="grid min-w-36 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      {title && <div className="font-medium">{title}</div>}
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{k}</span>
          <span className="font-mono tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  )
}

/** Recharts `content` render prop: builds rows from the hovered datum. */
export function tip<T>(build: (d: T) => { title?: React.ReactNode; rows: Row[] } | null) {
  function Tip({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }) {
    if (!active || !payload?.length || !payload[0]?.payload) return null
    const b = build(payload[0].payload as T)
    return b ? <TipBox {...b} /> : null
  }
  return Tip
}

export const tickNum = (v: number) => {
  if (!Number.isFinite(v)) return ""
  const a = Math.abs(v)
  if (a !== 0 && (a < 1e-3 || a >= 1e4)) return v.toExponential(0)
  return Number(v.toPrecision(3)).toString()
}

/** "Nice" ticks (1, 2, 3, 5 × 10^k) between lo and hi, for log axes. */
export function logTicks(lo: number, hi: number, mantissas = [1, 2, 5]) {
  const out: number[] = []
  if (!(lo > 0 && hi > lo)) return out
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const m of mantissas) {
      const v = m * 10 ** e
      if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(Number(v.toPrecision(6)))
    }
  return out
}

/** Hollow circle for infeasible points (the filled one is Recharts' default). */
export function HollowDot(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props
  if (cx === undefined || cy === undefined) return <g />
  return <circle cx={cx} cy={cy} r={3} fill="var(--background)" stroke="var(--muted-foreground)" strokeWidth={1} />
}

export function FilledDot(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props
  if (cx === undefined || cy === undefined) return <g />
  return <circle cx={cx} cy={cy} r={3} fill="var(--foreground)" />
}

export function StarMark(props: { cx?: number; cy?: number; r?: number }) {
  // not `size`: Recharts' Scatter passes its own `size` to custom shapes
  const { cx, cy } = props
  const size = props.r ?? 9
  if (cx === undefined || cy === undefined) return <g />
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? size * 0.45 : size
    const a = (Math.PI / 5) * i - Math.PI / 2
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
  }).join(" ")
  return <polygon points={pts} fill="var(--background)" stroke="var(--foreground)" strokeWidth={1.2} />
}

/** Axis titles outside the SVG, so they never collide with tick labels on narrow screens. */
export function AxisCaption({ y, x, children }: { y?: React.ReactNode; x?: React.ReactNode; children: React.ReactNode }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      {y && <figcaption className="pl-1 text-xs text-muted-foreground">{y}</figcaption>}
      {children}
      {x && <figcaption className="pr-4 text-right text-xs text-muted-foreground">{x}</figcaption>}
    </figure>
  )
}
