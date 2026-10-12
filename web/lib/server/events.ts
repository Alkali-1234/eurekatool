import "server-only"
import { EventEmitter } from "node:events"
import type { ServerEvent } from "../types"

const g = globalThis as unknown as { __fpsBus?: EventEmitter }
export const bus: EventEmitter = g.__fpsBus ?? (g.__fpsBus = new EventEmitter().setMaxListeners(0))

export const emit = (ev: ServerEvent) => bus.emit("event", ev)
export function subscribe(fn: (ev: ServerEvent) => void) {
  bus.on("event", fn)
  return () => void bus.off("event", fn)
}
