import { locateRun, readOutput } from "@/lib/server/files"
import { handle, notFound } from "@/lib/server/http"

export const dynamic = "force-dynamic"

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string; runId: string }> }) => {
  const { id, runId } = await ctx.params
  const loc = await locateRun(id, runId)
  const buf = loc && (await readOutput(loc.dir, "result.json"))
  if (!buf) return notFound("no result for this run")
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/json; charset=utf-8" } })
})
