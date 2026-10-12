import path from "node:path"
import type { NextRequest } from "next/server"
import { CONTENT_TYPES, contentDisposition, downloadName, locateRun, readOutput } from "@/lib/server/files"
import { handle, notFound } from "@/lib/server/http"

export const dynamic = "force-dynamic"

export const GET = handle(
  async (req: NextRequest, ctx: { params: Promise<{ id: string; runId: string; name: string }> }) => {
    const { id, runId, name } = await ctx.params
    const loc = await locateRun(id, runId)
    const buf = loc && (await readOutput(loc.dir, name))
    if (!loc || !buf) return notFound("file not found")
    const download = req.nextUrl.searchParams.has("download")
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": CONTENT_TYPES[path.extname(name)] ?? "application/octet-stream",
        "Content-Disposition": contentDisposition(downloadName(loc.task.name, runId, name), !download),
        "Cache-Control": "no-store",
      },
    })
  }
)
