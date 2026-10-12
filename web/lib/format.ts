export function fmt(v: number | null | undefined, digits = 4) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—"
  const a = Math.abs(v)
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2)
  return Number(v.toPrecision(digits)).toString()
}

export function fixed(v: number | null | undefined, d: number) {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d)
}

export function relTime(iso?: string) {
  if (!iso) return ""
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 45) return "just now"
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

export function dateTime(iso?: string) {
  if (!iso) return ""
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function duration(a?: string, b?: string) {
  if (!a) return ""
  const s = ((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 1000
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`
}

export const bytes = (n?: number) =>
  n === undefined ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} kB` : `${(n / 1048576).toFixed(1)} MB`
