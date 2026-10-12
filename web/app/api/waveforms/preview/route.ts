import { z } from "zod"
import { resolverFor } from "@/lib/server/waveforms"
import { runJson } from "@/lib/server/python"
import { handle, json } from "@/lib/server/http"
import { waveformArgv } from "@/lib/params"

export const dynamic = "force-dynamic"

// Small in-memory cache: the form re-requests the same preview often while editing other fields.
const g = globalThis as unknown as { __fpsPreview?: Map<string, { code: number | null; result: unknown }> }
const cache = g.__fpsPreview ?? (g.__fpsPreview = new Map())
const MAX_CACHE = 20

const Body = z.object({ params: z.record(z.string(), z.string().max(4096)) })

export const POST = handle(async (req: Request) => {
  const b = Body.safeParse(await req.json().catch(() => null))
  if (!b.success) return json({ ok: false, error: "invalid body" }, 400)
  const p = b.data.params
  const resolve = await resolverFor([p.source, p.inventory])
  const argv = waveformArgv(p, resolve)
  const key = JSON.stringify(argv)
  let hit = cache.get(key)
  if (!hit) {
    hit = await runJson("waveform_tool.py", ["preview", ...argv])
    if (hit.code === 0) {
      cache.set(key, hit)
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!)
    }
  }
  return json(hit.result, hit.code === 0 ? 200 : 400)
})
