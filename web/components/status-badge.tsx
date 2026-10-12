import { CircleCheckIcon, CircleDashedIcon, CircleSlashIcon, CircleXIcon, ClockIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { RunStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const META: Record<RunStatus | "new", { label: string; icon: React.ComponentType<{ className?: string }>; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new: { label: "Not run", icon: CircleDashedIcon, variant: "outline" },
  queued: { label: "Queued", icon: ClockIcon, variant: "secondary" },
  running: { label: "Running", icon: Loader2Icon, variant: "default" },
  done: { label: "Done", icon: CircleCheckIcon, variant: "secondary" },
  failed: { label: "Failed", icon: CircleXIcon, variant: "destructive" },
  cancelled: { label: "Cancelled", icon: CircleSlashIcon, variant: "outline" },
  interrupted: { label: "Interrupted", icon: TriangleAlertIcon, variant: "destructive" },
}

export function StatusBadge({ status, className }: { status?: RunStatus; className?: string }) {
  const m = META[status ?? "new"]
  const Icon = m.icon
  return (
    <Badge variant={m.variant} className={className}>
      <Icon data-icon="inline-start" className={cn(status === "running" && "animate-spin")} />
      {m.label}
    </Badge>
  )
}

export function StatusDot({ status }: { status?: RunStatus }) {
  const Icon = META[status ?? "new"].icon
  return (
    <Icon
      className={cn(
        "size-3.5 shrink-0",
        status === "running" && "animate-spin",
        (status === "failed" || status === "interrupted") && "text-destructive",
        (!status || status === "cancelled") && "text-muted-foreground"
      )}
    />
  )
}
