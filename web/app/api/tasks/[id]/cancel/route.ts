import { cancelTask } from "@/lib/server/runner"
import { handle, json } from "@/lib/server/http"

export const dynamic = "force-dynamic"

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) =>
  json({ cancelled: await cancelTask((await ctx.params).id) })
)
