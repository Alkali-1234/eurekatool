"use client"

import * as React from "react"
import { toast } from "sonner"
import { CheckIcon, ChevronsUpDownIcon, FileAudioIcon, UploadIcon, WavesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Field, FieldError, FieldGroup } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { FieldHeading, ParamField } from "@/components/task/param-field"
import { WaveformInspector } from "@/components/task/waveform-inspector"
import { useTasks } from "@/components/tasks-provider"
import { api } from "@/lib/api"
import { activeWaveformKeys, isMseed, UNITS, type Params } from "@/lib/params"
import { bytes } from "@/lib/format"
import type { LibraryEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  params: Params
  errors: Record<string, string>
  onChange: (key: string, value: string) => void
  onChangeMany: (patch: Params) => void
}

function groupBy(entries: LibraryEntry[]) {
  const m = new Map<string, LibraryEntry[]>()
  for (const e of entries) m.set(e.group, [...(m.get(e.group) ?? []), e])
  return [...m.entries()]
}

const NONE = "__none__"

export function WaveformCard({ params, errors, onChange, onChangeMany }: Props) {
  const { library, setLibrary } = useTasks()
  const [open, setOpen] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const active = activeWaveformKeys(params)
  const source = params.source
  const current = library?.waveforms.find((w) => w.id === source)
  const mseed = isMseed(source)

  // miniSEED traces for the channel picker
  type Trace = { location: string; channel: string }
  const [chan, setChan] = React.useState<{ source: string; list?: Trace[]; error?: string } | null>(null)
  const channels = chan?.source === source ? (chan.list ?? null) : null
  const chanError = chan?.source === source ? (chan.error ?? null) : null
  React.useEffect(() => {
    if (!mseed) return
    let live = true
    api
      .channels(source)
      .then((r) => live && setChan({ source, list: r.channels }))
      .catch((e) => live && setChan({ source, error: e.message }))
    return () => {
      live = false
    }
  }, [source, mseed])

  // pick the only trace automatically
  React.useEffect(() => {
    if (channels?.length === 1 && !params.channel) {
      onChangeMany({ channel: channels[0].channel, location: channels[0].location })
    }
  }, [channels, params.channel, onChangeMany])

  function pickSource(id: string) {
    setOpen(false)
    if (id === source) return
    const patch: Params = { source: id, channel: "", location: "", inventory: "", pre_filt: "" }
    if (isMseed(id) && library) {
      // suggest a StationXML from the same folder, as the terminal wizard does
      const folder = library.waveforms.find((w) => w.id === id)?.group
      const xmls = library.inventories.filter((x) => x.group === folder)
      if (xmls.length === 1) patch.inventory = xmls[0].id
    }
    if (isMseed(id) && /\.(HN[ENZ12]|ACC)\./i.test(id)) patch.units = "cm/s2" // Zenodo BMKG files are in cm/s²
    onChangeMany(patch)
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      const r = await api.upload([...files])
      setLibrary(r.library)
      const wave = r.saved.find((id) => !id.endsWith(".xml"))
      if (wave) pickSource(wave)
      toast.success(`Uploaded ${r.saved.length} file${r.saved.length > 1 ? "s" : ""}`)
    } catch (e) {
      toast.error("Upload failed", { description: (e as Error).message })
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  const chanValue = params.channel ? `${params.location}|${params.channel}` : null
  const chanItems = (channels ?? []).map((c) => ({
    value: `${c.location}|${c.channel}`,
    label: c.location ? `${c.location}.${c.channel}` : c.channel,
  }))
  if (chanValue && !chanItems.some((c) => c.value === chanValue))
    chanItems.push({ value: chanValue, label: params.location ? `${params.location}.${params.channel}` : params.channel })

  const invItems = [
    { value: NONE, label: "None (samples already in physical units)" },
    ...(library?.inventories ?? []).map((x) => ({ value: x.id, label: x.name })),
  ]
  const unitItems = UNITS.map((u) => ({ value: u, label: u === "m/s2" ? "m/s²" : u === "cm/s2" ? "cm/s²" : "g" }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WavesIcon className="size-4" />
          Waveform
        </CardTitle>
        <CardDescription>Ground acceleration record, optional amplitude scaling and window.</CardDescription>
        <CardAction>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".csv,.txt,.dat,.mseed,.miniseed,.ms,.xml"
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
            Upload
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup className="gap-4">
          <Field data-invalid={!!errors.source || undefined}>
            <FieldHeading k="source" label="Record" />
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger
                render={
                  <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal" />
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileAudioIcon className="text-muted-foreground" />
                  <span className="truncate">{current?.name ?? (source || "Choose a record…")}</span>
                  {current && current.group !== "Built-in" && (
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">{current.group}</span>
                  )}
                </span>
                <ChevronsUpDownIcon className="text-muted-foreground" />
              </PopoverTrigger>
              <PopoverContent className="w-(--anchor-width) min-w-72 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search records…" />
                  <CommandList>
                    <CommandEmpty>No record found.</CommandEmpty>
                    {groupBy(library?.waveforms ?? []).map(([group, items]) => (
                      <CommandGroup key={group} heading={group}>
                        {items.map((w) => (
                          <CommandItem key={w.id} value={`${w.group}/${w.name}`} onSelect={() => pickSource(w.id)}>
                            <span className="truncate">{w.name}</span>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {w.kind === "mseed" ? "miniSEED" : w.kind === "text" ? "text" : ""} {bytes(w.size)}
                            </span>
                            <CheckIcon className={cn("size-4", w.id === source ? "opacity-100" : "opacity-0")} />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.source && <FieldError>{errors.source}</FieldError>}
          </Field>

          {mseed && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!chanError || undefined}>
                <FieldHeading k="channel" label="Trace (location.channel)" />
                <Select
                  items={chanItems}
                  value={chanValue}
                  onValueChange={(v) => {
                    if (!v) return
                    const [location, channel] = (v as string).split("|")
                    onChangeMany({ location, channel })
                  }}
                >
                  <SelectTrigger className="w-full" disabled={!channels && !chanError}>
                    <SelectValue placeholder={channels ? "Choose a trace" : chanError ? "Unreadable" : "Reading…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {chanItems.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {chanError && <FieldError>{chanError}</FieldError>}
              </Field>
              <Field>
                <FieldHeading k="inventory" />
                <Select
                  items={invItems}
                  value={params.inventory || NONE}
                  onValueChange={(v) => onChange("inventory", !v || v === NONE ? "" : (v as string))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {invItems.map((x) => (
                      <SelectItem key={x.value} value={x.value}>
                        {x.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {active.has("units") && (
              <Field>
                <FieldHeading k="units" />
                <Select items={unitItems} value={params.units || "g"} onValueChange={(v) => v && onChange("units", v as string)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {unitItems.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {active.has("pre_filt") && <ParamField k="pre_filt" params={params} errors={errors} onChange={onChange} />}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <ParamField k="pga" params={params} errors={errors} onChange={onChange} />
            <ParamField k="t_start" params={params} errors={errors} onChange={onChange} />
            <ParamField k="duration" params={params} errors={errors} onChange={onChange} />
          </div>
        </FieldGroup>

        <WaveformInspector params={params} disabled={mseed && !params.channel} />
      </CardContent>
    </Card>
  )
}
