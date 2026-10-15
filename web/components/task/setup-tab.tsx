"use client"

import * as React from "react"
import { toast } from "sonner"
import { CopyIcon, RotateCcwIcon, SlidersHorizontalIcon, TargetIcon, TerminalIcon, TriangleAlertIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FieldHeading, ParamField } from "@/components/task/param-field"
import { WaveformCard } from "@/components/task/waveform-card"
import {
  capCount,
  commandLine,
  defaultParams,
  displayPath,
  FRICTION_MODELS,
  toArgv,
  warnings,
  type Params,
  type Script,
} from "@/lib/params"

type Props = {
  script: Script
  params: Params
  errors: Record<string, string>
  onChange: (key: string, value: string) => void
  onChangeMany: (patch: Params) => void
}

const PHYSICS = ["mu_s", "mu_k", "friction", "p", "r_min", "r_max", "n_r", "dt", "v_eps"]
const FRICTION_ITEMS = FRICTION_MODELS.map((m) => ({ value: m, label: m === "stickslip" ? "Stick-slip" : "tanh (regularised)" }))

export function SetupTab({ script, params, errors, onChange, onChangeMany }: Props) {
  const warn = warnings(script, params)
  const cmd = commandLine(script, toArgv(script, params, displayPath))
  const caps =
    script === "umax" && !errors.u_min_mm && !errors.u_max_mm && !errors.du_mm
      ? capCount(Number(params.u_min_mm), Number(params.u_max_mm), Number(params.du_mm))
      : null

  function resetPhysics() {
    const d = defaultParams(script)
    onChangeMany(Object.fromEntries(PHYSICS.map((k) => [k, d[k]])))
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="flex min-w-0 flex-col gap-4">
        <WaveformCard params={params} errors={errors} onChange={onChange} onChangeMany={onChangeMany} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TargetIcon className="size-4" />
              {script === "rstar" ? "Travel cap" : "Travel-cap range"}
            </CardTitle>
            <CardDescription>
              {script === "rstar"
                ? "R is feasible if the peak slider travel u_max(R) ≤ u_cap."
                : caps !== null
                  ? `${caps} cap${caps === 1 ? "" : "s"}; the R grid is simulated once and each cap is applied to it.`
                  : "R* for every u_cap from → to in steps."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {script === "rstar" ? (
              <ParamField k="u_cap_mm" params={params} errors={errors} onChange={onChange} />
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <ParamField k="u_min_mm" params={params} errors={errors} onChange={onChange} />
                <ParamField k="u_max_mm" params={params} errors={errors} onChange={onChange} />
                <ParamField k="du_mm" params={params} errors={errors} onChange={onChange} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontalIcon className="size-4" />
              Physics &amp; grid
            </CardTitle>
            <CardDescription>Static/kinetic friction, loss norm, R grid and time stepping.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" onClick={resetPhysics}>
                <RotateCcwIcon data-icon="inline-start" />
                Defaults
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FieldGroup className="grid grid-cols-2 gap-3">
              {PHYSICS.map((k) =>
                k === "friction" ? (
                  <Field key={k} data-invalid={!!errors.friction || undefined}>
                    <FieldHeading k="friction" />
                    <Select
                      items={FRICTION_ITEMS}
                      value={params.friction || "stickslip"}
                      onValueChange={(v) => v && onChange("friction", v as string)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FRICTION_ITEMS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.friction && <FieldError>{errors.friction}</FieldError>}
                  </Field>
                ) : k === "v_eps" && params.friction !== "tanh" ? null : (
                  <ParamField key={k} k={k} params={params} errors={errors} onChange={onChange} />
                )
              )}
            </FieldGroup>
            {warn.map((w) => (
              <Alert key={w}>
                <TriangleAlertIcon />
                <AlertDescription>{w}</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TerminalIcon className="size-4" />
              Equivalent command
            </CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Copy command"
                onClick={() => {
                  navigator.clipboard?.writeText(cmd).then(
                    () => toast.success("Command copied"),
                    () => toast.error("Clipboard not available")
                  )
                }}
              >
                <CopyIcon />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
              {cmd}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
