"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CopyIcon, EllipsisVerticalIcon, PlayIcon, RotateCwIcon, SquareIcon, Trash2Icon } from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { useTask, useTasks } from "@/components/tasks-provider"
import { LogTab } from "@/components/task/log-tab"
import { ResultsTab } from "@/components/task/results-tab"
import { RunProgress } from "@/components/task/run-progress"
import { SetupTab } from "@/components/task/setup-tab"
import { api, ApiError } from "@/lib/api"
import { SCRIPTS, paramsEqual, validate, type Params } from "@/lib/params"
import type { Task } from "@/lib/types"

export function TaskPage({ id }: { id: string }) {
  const { tasks, upsert } = useTasks()
  const task = useTask(id)
  const [missing, setMissing] = React.useState(false)

  React.useEffect(() => {
    if (tasks && !task) api.task(id).then(upsert, () => setMissing(true))
  }, [tasks, task, id, upsert])

  if (task) return <TaskView key={task.id} task={task} />
  return (
    <>
      <PageHeader />
      <main className="mx-auto w-full max-w-6xl p-4 md:p-6">
        {missing ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Task not found</EmptyTitle>
              <EmptyDescription>It may have been deleted on another device.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} render={<Link href="/" />}>All tasks</Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-96 w-full" />
          </div>
        )}
      </main>
    </>
  )
}

function TaskView({ task }: { task: Task }) {
  const router = useRouter()
  const { upsert, remove } = useTasks()
  const [draft, setDraft] = React.useState<Params>(task.params)
  const [name, setName] = React.useState(task.name)
  const [tab, setTab] = React.useState<string>(task.runs.length ? "results" : "setup")
  const [runId, setRunId] = React.useState<string | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [serverErrors, setServerErrors] = React.useState<Record<string, string>>({})

  // ---- autosave of the arguments (debounced); flush() before a run
  const saved = React.useRef<Params>(task.params)
  const pending = React.useRef<Promise<unknown> | null>(null)
  const save = React.useCallback(
    async (p: Params) => {
      if (paramsEqual(p, saved.current)) return
      const req = api.updateTask(task.id, { params: p }).then((t) => {
        saved.current = p
        upsert(t)
      })
      pending.current = req
      try {
        await req
      } catch (e) {
        toast.error("Could not save the arguments", { description: (e as Error).message })
      }
    },
    [task.id, upsert]
  )
  React.useEffect(() => {
    const t = setTimeout(() => void save(draft), 600)
    return () => clearTimeout(t)
  }, [draft, save])

  const onChange = React.useCallback((key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setServerErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e))
  }, [])
  const onChangeMany = React.useCallback((patch: Params) => setDraft((d) => ({ ...d, ...patch })), [])

  const errors = { ...validate(task.script, draft), ...serverErrors }
  const nErrors = Object.keys(errors).length
  const lastRun = task.runs.at(-1)
  const active = lastRun && (lastRun.status === "running" || lastRun.status === "queued")
  const changed = !!lastRun && !paramsEqual(lastRun.params, draft)

  // ---- toast when a run of this task ends
  const prevStatus = React.useRef(lastRun?.status)
  React.useEffect(() => {
    const was = prevStatus.current
    prevStatus.current = lastRun?.status
    if ((was === "running" || was === "queued") && lastRun && lastRun.status !== was) {
      if (lastRun.status === "done") toast.success(`${task.name}: run finished`)
      else if (lastRun.status === "failed") toast.error(`${task.name}: run failed`, { description: lastRun.error })
    }
  }, [lastRun, task.name])

  async function run() {
    if (nErrors) {
      setTab("setup")
      toast.error("Fix the highlighted fields first")
      return
    }
    setStarting(true)
    try {
      await save(draft)
      await pending.current?.catch(() => {})
      const r = await api.run(task.id)
      setRunId(r.id)
      setTab("results")
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        setServerErrors(e.fields)
        setTab("setup")
      }
      toast.error("Could not start the run", { description: (e as Error).message })
    } finally {
      setStarting(false)
    }
  }

  async function cancel() {
    try {
      await api.cancel(task.id)
    } catch (e) {
      toast.error("Could not cancel", { description: (e as Error).message })
    }
  }

  async function rename() {
    const n = name.trim()
    if (!n || n === task.name) return setName(task.name)
    try {
      upsert(await api.updateTask(task.id, { name: n }))
    } catch (e) {
      toast.error("Could not rename", { description: (e as Error).message })
      setName(task.name)
    }
  }

  async function duplicate() {
    await save(draft)
    try {
      const t = await api.duplicateTask(task.id)
      upsert(t)
      router.push(`/tasks/${t.id}`)
    } catch (e) {
      toast.error("Could not duplicate", { description: (e as Error).message })
    }
  }

  async function del() {
    try {
      await api.deleteTask(task.id)
      remove(task.id)
      router.push("/")
    } catch (e) {
      toast.error("Could not delete", { description: (e as Error).message })
    }
  }

  const selectedRun = task.runs.find((r) => r.id === runId) ?? lastRun

  return (
    <>
      <PageHeader>
        <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
          {SCRIPTS[task.script].title}
        </Badge>
        <input
          aria-label="Task name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") {
              setName(task.name)
              e.currentTarget.blur()
            }
          }}
          className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1.5 py-1 font-heading text-sm font-medium outline-none hover:bg-muted focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <StatusBadge status={lastRun?.status} className="hidden md:inline-flex" />
        {active ? (
          <Button variant="destructive" size="sm" onClick={cancel}>
            <SquareIcon data-icon="inline-start" />
            Cancel
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="sm" onClick={run} disabled={starting} className={nErrors ? "opacity-70" : undefined} />
              }
            >
              {starting ? <Spinner data-icon="inline-start" /> : lastRun ? <RotateCwIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
              {lastRun ? "Re-run" : "Run"}
            </TooltipTrigger>
            <TooltipContent>
              {nErrors
                ? `${nErrors} field${nErrors > 1 ? "s" : ""} to fix first`
                : `Run ${SCRIPTS[task.script].file} with the current arguments`}
            </TooltipContent>
          </Tooltip>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}>
            <EllipsisVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={duplicate}>
              <CopyIcon />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2Icon />
              Delete task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 md:p-6">
        {active && lastRun && tab !== "results" && <RunProgress run={lastRun} />}
        {changed && !active && (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            The arguments changed since the last run. Press <span className="font-medium text-foreground">Re-run</span> to update the results.
          </p>
        )}
        <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
          <TabsList>
            <TabsTrigger value="setup">
              Setup
              {nErrors > 0 && <span className="ml-1 size-1.5 rounded-full bg-destructive" />}
            </TabsTrigger>
            <TabsTrigger value="results">
              Results
              {task.runs.length > 0 && <span className="ml-1 text-xs text-muted-foreground tabular-nums">{task.runs.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
          </TabsList>
          <TabsContent value="setup" className="pt-2">
            <SetupTab script={task.script} params={draft} errors={errors} onChange={onChange} onChangeMany={onChangeMany} />
          </TabsContent>
          <TabsContent value="results" className="pt-2">
            <ResultsTab task={task} runId={runId} onRunId={setRunId} />
          </TabsContent>
          <TabsContent value="log" className="pt-2">
            <LogTab key={selectedRun?.id} task={task} run={selectedRun} />
          </TabsContent>
        </Tabs>
      </main>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{task.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the task, all {task.runs.length} run{task.runs.length === 1 ? "" : "s"} and their output files from
              the server. A running simulation is stopped first. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={del}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
