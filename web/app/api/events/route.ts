import { subscribe } from "@/lib/server/events"
import type { ServerEvent } from "@/lib/types"

export const dynamic = "force-dynamic"

// Server-sent events: every task change, run progress and run log line, for all tasks.
export async function GET(req: Request) {
  const enc = new TextEncoder()
  let cleanup = () => {}
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(enc.encode(s))
        } catch {
          cleanup()
        }
      }
      send("retry: 2000\n\n")
      const off = subscribe((ev: ServerEvent) => send(`data: ${JSON.stringify(ev)}\n\n`))
      const ping = setInterval(() => send(": ping\n\n"), 15_000)
      cleanup = () => {
        off()
        clearInterval(ping)
      }
      req.signal.addEventListener("abort", () => {
        cleanup()
        try {
          controller.close()
        } catch {}
      })
    },
    cancel() {
      cleanup()
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
