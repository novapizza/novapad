import React, { useMemo, useState } from 'react'
import {
  CRON_FIELDS,
  describeCron,
  getNextRuns,
  validateCron,
  tokenToFieldState,
  fieldStateToToken,
  type FieldMode,
  type FieldState
} from '../../../lib/tools/cronParser'
import { CopyButton, ToolSection, useCopy } from '../shared'

const PRESETS: { label: string; expr: string }[] = [
  { label: 'Every minute', expr: '* * * * *' },
  { label: 'Every 5 min', expr: '*/5 * * * *' },
  { label: 'Hourly', expr: '0 * * * *' },
  { label: 'Daily 00:00', expr: '0 0 * * *' },
  { label: 'Weekdays 9am', expr: '0 9 * * 1-5' },
  { label: 'Mondays', expr: '0 0 * * 1' },
  { label: 'Monthly 1st', expr: '0 0 1 * *' }
]

function splitTokens(expr: string): string[] {
  const parts = expr.trim().split(/\s+/)
  while (parts.length < 5) parts.push('*')
  return parts.slice(0, 5)
}

export function CronPanel(): React.ReactElement {
  const [expr, setExpr] = useState('*/5 * * * *')
  const { copy, copiedKey } = useCopy()

  const tokens = useMemo(() => splitTokens(expr), [expr])
  const error = useMemo(() => validateCron(expr), [expr])
  const description = useMemo(() => (error ? '' : describeCron(expr)), [expr, error])
  const nextRuns = useMemo(() => (error ? [] : getNextRuns(expr, 5)), [expr, error])

  const setFieldToken = (index: number, token: string): void => {
    const next = [...tokens]
    next[index] = token || '*'
    setExpr(next.join(' '))
  }

  return (
    <div className="space-y-5">
      <ToolSection title="Expression" right={<CopyButton value={expr} copy={copy} copiedKey={copiedKey} toastLabel="Cron" />}>
        <input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          spellCheck={false}
          className="w-full rounded border border-input bg-background px-3 py-2 text-base font-mono text-foreground"
        />
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm text-foreground">{description}</p>
        )}
      </ToolSection>

      <ToolSection title="Presets">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.expr}
              type="button"
              onClick={() => setExpr(p.expr)}
              title={p.expr}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </ToolSection>

      <ToolSection title="Fields">
        <div className="space-y-2">
          {CRON_FIELDS.map((field, i) => (
            <CronFieldRow key={field.label} field={field} token={tokens[i]} onChange={(t) => setFieldToken(i, t)} />
          ))}
        </div>
      </ToolSection>

      <ToolSection title="Next runs">
        {nextRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming runs to show.</p>
        ) : (
          <ul className="space-y-1">
            {nextRuns.map((d, i) => (
              <li key={i} className="font-mono text-sm text-foreground">
                {d.toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </ToolSection>
    </div>
  )
}

const MODES: { id: FieldMode; label: string }[] = [
  { id: 'every', label: 'Every' },
  { id: 'specific', label: 'Specific' },
  { id: 'range', label: 'Range' },
  { id: 'interval', label: 'Interval' }
]

function CronFieldRow({
  field,
  token,
  onChange
}: {
  field: (typeof CRON_FIELDS)[number]
  token: string
  onChange: (token: string) => void
}): React.ReactElement {
  const state = tokenToFieldState(token, field)

  const update = (patch: Partial<FieldState>): void => {
    const nextState: FieldState = { ...state, ...patch }
    onChange(fieldStateToToken(nextState, field))
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-border p-2">
      <span className="w-28 shrink-0 text-sm text-muted-foreground">{field.label}</span>
      <select
        value={state.mode}
        onChange={(e) => {
          const mode = e.target.value as FieldMode
          if (mode === 'every') onChange('*')
          else if (mode === 'interval') onChange(`*/${state.interval || 1}`)
          else if (mode === 'range') onChange(`${field.min}-${field.max}`)
          else onChange(String(field.min))
        }}
        className="rounded border border-input bg-background px-2 py-1 text-sm text-foreground"
      >
        {MODES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      {state.mode === 'interval' && (
        <label className="flex items-center gap-1 text-sm text-muted-foreground">
          every
          <input
            type="number"
            min={1}
            max={field.max}
            value={state.interval}
            onChange={(e) => update({ interval: Math.max(1, Number(e.target.value) || 1) })}
            className="w-16 rounded border border-input bg-background px-2 py-1 text-sm font-mono text-foreground"
          />
        </label>
      )}

      {state.mode === 'range' && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <input
            type="number"
            min={field.min}
            max={field.max}
            value={state.rangeStart}
            onChange={(e) => update({ rangeStart: Number(e.target.value) })}
            className="w-16 rounded border border-input bg-background px-2 py-1 text-sm font-mono text-foreground"
          />
          –
          <input
            type="number"
            min={field.min}
            max={field.max}
            value={state.rangeEnd}
            onChange={(e) => update({ rangeEnd: Number(e.target.value) })}
            className="w-16 rounded border border-input bg-background px-2 py-1 text-sm font-mono text-foreground"
          />
        </div>
      )}

      {state.mode === 'specific' && (
        <input
          value={state.specific.join(',')}
          onChange={(e) => {
            const nums = e.target.value
              .split(',')
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => !isNaN(n))
            update({ specific: nums })
          }}
          placeholder={`${field.min}-${field.max}, comma separated`}
          className="flex-1 min-w-[120px] rounded border border-input bg-background px-2 py-1 text-sm font-mono text-foreground"
        />
      )}

      <code className="ml-auto font-mono text-xs text-muted-foreground">{token}</code>
    </div>
  )
}
