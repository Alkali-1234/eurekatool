import { createTask, getTask } from "@/lib/server/store"
import { handle, json, notFound } from "@/lib/server/http"

export const dynamic = "force-dynamic"

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const t = await getTask((await ctx.params).id)
  if (!t) return notFound("task not found")
  return json(await createTask(`${t.name} (copy)`, t.script, t.params), 201)
})
