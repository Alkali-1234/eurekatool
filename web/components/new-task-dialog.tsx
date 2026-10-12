"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { SigmaIcon, TableIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useTasks } from "@/components/tasks-provider"
import { api } from "@/lib/api"
import { SCRIPTS, type Script } from "@/lib/params"
import { cn } from "@/lib/utils"

const ICONS: Record<Script, React.ComponentType<{ className?: string }>> = { rstar: SigmaIcon, umax: TableIcon }

export function NewTaskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter()
  const { upsert } = useTasks()
  const [script, setScript] = React.useState<Script>("rstar")
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const t = await api.createTask(name.trim() || `${SCRIPTS[script].title} ${new Date().toLocaleString()}`, script)
      upsert(t)
      onOpenChange(false)
      router.push(`/tasks/${t.id}`)
    } catch (err) {
      toast.error("Could not create the task", { description: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={create} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>
              A task is one run configuration of a script. You can edit the arguments and re-run it afterwards.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Script</FieldLabel>
              <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(SCRIPTS) as Script[]).map((s) => {
                  const Icon = ICONS[s]
                  const on = s === script
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setScript(s)}
                      className={cn(
                        "flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        on && "border-primary bg-primary/5 hover:bg-primary/5"
                      )}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <Icon className="size-4" />
                        {SCRIPTS[s].title}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">{SCRIPTS[s].file}</span>
                      <span className="text-xs text-muted-foreground">{SCRIPTS[s].blurb}</span>
                    </button>
                  )
                })}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="task-name">Name</FieldLabel>
              <Input
                id="task-name"
                autoFocus
                placeholder={script === "rstar" ? "e.g. El Centro 0.349 g, u_cap 30 mm" : "e.g. Table 25–40 mm, HVSC HN2"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Shared open state so both the sidebar and the empty states can open the dialog. */
const NewTaskContext = React.createContext<() => void>(() => {})
export const useNewTask = () => React.useContext(NewTaskContext)

export function NewTaskProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [n, setN] = React.useState(0)
  const openDialog = React.useCallback(() => {
    setN((k) => k + 1) // fresh form state each time
    setOpen(true)
  }, [])
  return (
    <NewTaskContext.Provider value={openDialog}>
      {children}
      <NewTaskDialog key={n} open={open} onOpenChange={setOpen} />
    </NewTaskContext.Provider>
  )
}
