"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ActivityIcon, LayoutListIcon, PlusIcon } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/status-badge"
import { useTasks } from "@/components/tasks-provider"
import { useNewTask } from "@/components/new-task-dialog"
import { SCRIPTS } from "@/lib/params"
import { relTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export function AppSidebar() {
  const { tasks, connected } = useTasks()
  const openNew = useNewTask()
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const close = () => setOpenMobile(false)

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 p-3">
        <Link href="/" onClick={close} className="flex items-center gap-2 px-1">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ActivityIcon className="size-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-heading text-sm font-semibold">FPS Runner</span>
            <span className="text-xs text-muted-foreground">Dish-radius tools</span>
          </div>
        </Link>
        <Button
          onClick={() => {
            close()
            openNew()
          }}
          className="w-full"
        >
          <PlusIcon data-icon="inline-start" />
          New task
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={pathname === "/"} render={<Link href="/" onClick={close} />}>
                <LayoutListIcon />
                <span>All tasks</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Tasks</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {tasks === null &&
                [70, 55, 80, 62].map((w, i) => (
                  <SidebarMenuItem key={i} className="flex h-12 items-center gap-2 px-2">
                    <Skeleton className="size-4 rounded-md" />
                    <Skeleton className="h-4" style={{ width: `${w}%` }} />
                  </SidebarMenuItem>
                ))}
              {tasks?.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No tasks yet.</p>}
              {tasks?.map((t) => {
                const last = t.runs.at(-1)
                return (
                  <SidebarMenuItem key={t.id}>
                    <SidebarMenuButton
                      size="lg"
                      isActive={pathname === `/tasks/${t.id}`}
                      render={<Link href={`/tasks/${t.id}`} onClick={close} />}
                    >
                      <StatusDot status={last?.status} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{t.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {SCRIPTS[t.script].title} · {relTime(last?.createdAt ?? t.createdAt)}
                        </span>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-4 pb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("size-2 rounded-full", connected ? "bg-primary" : "bg-destructive")} />
          {connected ? "Live updates on" : "Reconnecting…"}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
