import "server-only"
import { PathError } from "./waveforms"
import { RunInputError } from "./runner"

export const json = (data: unknown, status = 200) => Response.json(data, { status })
export const notFound = (what = "not found") => json({ error: what }, 404)

/** Wrap a route handler so thrown errors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args)
    } catch (e) {
      if (e instanceof RunInputError) return json({ error: e.message, fields: e.fields }, 400)
      if (e instanceof PathError) return json({ error: e.message }, 400)
      console.error(e)
      return json({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }
}
