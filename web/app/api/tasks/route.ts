import { z } from "zod"
import { createTask, listTasks } from "@/lib/server/store"
import { withLive } from "@/lib/server/live"
import { handle, json } from "@/lib/server/http"

export const dynamic = "force-dynamic"

export const GET = handle(async () => json((await listTasks()).map(withLive)))

const Body = z.object({
  name: z.string().trim().min(1).max(200),
  script: z.enum(["rstar", "umax"]),
  params: z.record(z.string(), z.string()).optional(),
})

export const POST = handle(async (req: Request) => {
  const b = Body.safeParse(await req.json().catch(() => null))
  if (!b.success) return json({ error: "invalid body: " + b.error.issues.map((i) => i.message).join("; ") }, 400)
  return json(await createTask(b.data.name, b.data.script, b.data.params), 201)
})
