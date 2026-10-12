import { z } from "zod"
import { deleteTask, getTask, updateTask } from "@/lib/server/store"
import { cancelTask } from "@/lib/server/runner"
import { withLive } from "@/lib/server/live"
import { handle, json, notFound } from "@/lib/server/http"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const t = await getTask((await ctx.params).id)
  return t ? json(withLive(t)) : notFound("task not found")
})

const Patch = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  params: z.record(z.string(), z.string().max(4096)).optional(),
})

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const b = Patch.safeParse(await req.json().catch(() => null))
  if (!b.success) return json({ error: "invalid body" }, 400)
  const t = await updateTask((await ctx.params).id, b.data)
  return t ? json(withLive(t)) : notFound("task not found")
})

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  await cancelTask(id)
  return (await deleteTask(id)) ? json({ ok: true }) : notFound("task not found")
})
