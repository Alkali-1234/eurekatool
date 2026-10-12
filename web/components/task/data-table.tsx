"use client"

import * as React from "react"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type Column<T> = {
  key: string
  header: React.ReactNode
  value: (row: T) => number | string | null
  render?: (row: T) => React.ReactNode
  align?: "left" | "right"
}

const PAGE = 200

/** Sortable table with a sticky header, for the builders' CSV outputs. */
export function DataTable<T>({
  columns,
  rows,
  muted,
  highlight,
  className,
}: {
  columns: Column<T>[]
  rows: T[]
  muted?: (row: T) => boolean
  highlight?: (row: T) => boolean
  className?: string
}) {
  const [sort, setSort] = React.useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [limit, setLimit] = React.useState(PAGE)

  const sorted = React.useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    return [...rows].sort((a, b) => {
      const x = col.value(a), y = col.value(b)
      if (x === y) return 0
      if (x === null) return 1 // nulls last whatever the direction
      if (y === null) return -1
      return (x < y ? -1 : 1) * sort.dir
    })
  }, [rows, columns, sort])

  const toggle = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null))

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="max-h-[28rem] overflow-auto rounded-xl border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_var(--border)]">
            <TableRow>
              {columns.map((c) => {
                const Icon = sort?.key !== c.key ? ArrowUpDownIcon : sort.dir === 1 ? ArrowUpIcon : ArrowDownIcon
                return (
                  <TableHead key={c.key} className={cn(c.align !== "left" && "text-right")}>
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-foreground",
                        c.align !== "left" && "flex-row-reverse"
                      )}
                    >
                      {c.header}
                      <Icon className={cn("size-3", sort?.key !== c.key && "opacity-40")} />
                    </button>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.slice(0, limit).map((r, i) => (
              <TableRow
                key={i}
                data-state={highlight?.(r) ? "selected" : undefined}
                className={cn(muted?.(r) && "text-muted-foreground", highlight?.(r) && "font-medium")}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn("font-mono tabular-nums", c.align !== "left" && "text-right")}>
                    {c.render ? c.render(r) : (c.value(r) ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {sorted.length > limit && (
        <Button variant="ghost" size="sm" className="self-center" onClick={() => setLimit((l) => l + PAGE * 5)}>
          Show more ({sorted.length - limit} hidden)
        </Button>
      )}
    </div>
  )
}
