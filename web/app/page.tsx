"use client"

import Link from "next/link"
import { ActivityIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { useTasks } from "@/components/tasks-provider"
import { useNewTask } from "@/components/new-task-dialog"
import { SCRIPTS, displayPath } from "@/lib/params"
import { fmt, relTime } from "@/lib/format"
import type { Task } from "@/lib/types"

function resultSummary(t: Task) {
  const r = [...t.runs].reverse().find((x) => x.status === "done")
  const s = r?.summary
  if (!s) return <span className="text-muted-foreground">—</span>
  if (t.script === "rstar")
    return s.status === "ok" ? (
      <span className="tabular-nums">
        R* = {fmt(s.r_star_m as number)} m · L = {fmt(s.L_star_g as number)} g
      </span>
    ) : (
      <span className="text-destructive">infeasible</span>
    )
  return (
    <span className="tabular-nums">
      {s.n_caps as number} caps{(s.n_infeasible as number) > 0 && `, ${s.n_infeasible} infeasible`}
    </span>
  )
}

export default function Home() {
  const { tasks } = useTasks()
  const openNew = useNewTask()

  return (
    <>
      <PageHeader>
        <h1 className="truncate font-heading text-sm font-medium">All tasks</h1>
        <div className="ml-auto">
          <Button size="sm" onClick={openNew}>
            <PlusIcon data-icon="inline-start" />
            New task
          </Button>
        </div>
      </PageHeader>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6">
        {tasks === null ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ActivityIcon />
              </EmptyMedia>
              <EmptyTitle>No tasks yet</EmptyTitle>
              <EmptyDescription>
                Create a task to run <code className="font-mono">rstar_builder.py</code> or{" "}
                <code className="font-mono">umax_table_builder.py</code> with your own arguments.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={openNew}>
                <PlusIcon data-icon="inline-start" />
                New task
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead className="hidden sm:table-cell">Script</TableHead>
                  <TableHead className="hidden lg:table-cell">Waveform</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Latest result</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((t) => {
                  const last = t.runs.at(-1)
                  return (
                    <TableRow key={t.id} className="relative">
                      <TableCell className="max-w-56 font-medium">
                        <Link href={`/tasks/${t.id}`} className="block truncate after:absolute after:inset-0">
                          {t.name}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline">{SCRIPTS[t.script].title}</Badge>
                      </TableCell>
                      <TableCell className="hidden max-w-56 truncate text-muted-foreground lg:table-cell">
                        {t.params.source === "elcentro" ? "El Centro NS" : displayPath(t.params.source).split("/").pop()}
                        {t.params.pga ? ` → ${t.params.pga} g` : ""}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={last?.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{resultSummary(t)}</TableCell>
                      <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                        {relTime(t.updatedAt)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </>
  )
}
