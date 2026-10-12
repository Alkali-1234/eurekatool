import type { NextRequest } from "next/server"
import { resolveId } from "@/lib/server/waveforms"
import { runJson } from "@/lib/server/python"
import { handle, json } from "@/lib/server/http"

export const dynamic = "force-dynamic"

export const GET = handle(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("source") ?? ""
  const { code, result } = await runJson("waveform_tool.py", ["channels", await resolveId(id)], 60_000)
  return json(result, code === 0 ? 200 : 400)
})
