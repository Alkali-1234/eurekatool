"use client"

import { InfoIcon } from "lucide-react"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fieldByKey, type Params } from "@/lib/params"

export function HelpTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" aria-label="Help" className="text-muted-foreground hover:text-foreground" />}
      >
        <InfoIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{text}</TooltipContent>
    </Tooltip>
  )
}

export function FieldHeading({ k, label }: { k: string; label?: React.ReactNode }) {
  const f = fieldByKey[k]
  return (
    <div className="flex items-center gap-1.5">
      <FieldLabel htmlFor={`f-${k}`}>{label ?? f.label}</FieldLabel>
      <HelpTip text={`${f.help} (${f.flag})`} />
    </div>
  )
}

/** A text/number input bound to one CLI flag, with unit addon, help tooltip and validation message. */
export function ParamField({
  k,
  params,
  errors,
  onChange,
  disabled,
}: {
  k: string
  params: Params
  errors: Record<string, string>
  onChange: (key: string, value: string) => void
  disabled?: boolean
}) {
  const f = fieldByKey[k]
  const err = errors[k]
  return (
    <Field data-invalid={!!err || undefined}>
      <FieldHeading k={k} />
      <InputGroup>
        <InputGroupInput
          id={`f-${k}`}
          value={params[k] ?? ""}
          placeholder={f.placeholder}
          inputMode={f.kind === "number" && !f.allowInf ? "decimal" : "text"}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={!!err || undefined}
          onChange={(e) => onChange(k, e.target.value)}
          className="font-mono tabular-nums"
        />
        {f.unit && (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{f.unit}</InputGroupText>
          </InputGroupAddon>
        )}
      </InputGroup>
      {err && <FieldError>{err}</FieldError>}
    </Field>
  )
}
