import fs from "node:fs/promises"
import path from "node:path"
import { UPLOADS_DIR } from "@/lib/server/paths"
import { listLibrary, sanitizeName } from "@/lib/server/waveforms"
import { handle, json } from "@/lib/server/http"

export const dynamic = "force-dynamic"

const MAX_BYTES = 200 * 1024 * 1024
const ALLOWED = /\.(csv|txt|dat|mseed|miniseed|ms|xml)$/i

export const GET = handle(async () => json(await listLibrary()))

/** Multipart upload (field "file", may repeat) into web-data/uploads/. */
export const POST = handle(async (req: Request) => {
  const form = await req.formData()
  const files = form.getAll("file").filter((f): f is File => f instanceof File)
  if (!files.length) return json({ error: "no file in the upload" }, 400)
  await fs.mkdir(UPLOADS_DIR, { recursive: true })
  const saved: string[] = []
  for (const f of files) {
    const name = sanitizeName(f.name)
    if (!ALLOWED.test(name)) return json({ error: `${f.name}: only .csv .txt .dat .mseed .miniseed .ms .xml` }, 400)
    if (f.size > MAX_BYTES) return json({ error: `${f.name}: larger than 200 MB` }, 400)
    let target = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, name)
    // never overwrite: a finished run may refer to the old file
    for (let i = 1; await fs.stat(/*turbopackIgnore: true*/ target).then(() => true, () => false); i++) {
      const ext = path.extname(name)
      target = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, `${path.basename(name, ext)} (${i})${ext}`)
    }
    await fs.writeFile(target, Buffer.from(await f.arrayBuffer()))
    saved.push("upload/" + path.basename(target))
  }
  return json({ saved, library: await listLibrary() }, 201)
})
