import fs from "node:fs/promises"
import path from "node:path"
import JSZip from "jszip"
import { contentDisposition, downloadName, isOutputFile, locateRun } from "@/lib/server/files"
import { handle, notFound } from "@/lib/server/http"

export const dynamic = "force-dynamic"

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string; runId: string }> }) => {
  const { id, runId } = await ctx.params
  const loc = await locateRun(id, runId)
  if (!loc) return notFound("run not found")
  const zip = new JSZip()
  const folder = zip.folder(runId)!
  const names = (await fs.readdir(loc.dir).catch(() => [] as string[])).filter(isOutputFile)
  for (const n of names) folder.file(n, await fs.readFile(path.join(loc.dir, n)))
  folder.file("command.txt", loc.run.command + "\n")
  const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })
  return new Response(buf as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(downloadName(loc.task.name, runId, "outputs.zip"), false),
    },
  })
})
