import React, { useEffect, useMemo, useState } from 'react'
import { epochToDate, dateToEpoch, getCurrentTimestamps } from '../../../lib/tools/epochConverter'
import { CopyButton, OutputBlock, SegGroup, ToolSection, ToolTextarea, useCopy } from '../shared'

type Mode = 'epochToDate' | 'dateToEpoch'

function listTimeZones(): string[] {
  try {
    // Intl.supportedValuesOf is available in modern Chromium (Electron renderer).
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    if (fn) return fn('timeZone')
  } catch {
    /* fall through */
  }
  return ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Asia/Ho_Chi_Minh']
}

export function EpochPanel(): React.ReactElement {
  const [mode, setMode] = useState<Mode>('epochToDate')
  const [input, setInput] = useState('')
  const [tz, setTz] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  })
  const [now, setNow] = useState(getCurrentTimestamps())
  const { copy, copiedKey } = useCopy()

  // Refresh the "current time" block every second while the panel is mounted.
  useEffect(() => {
    const t = setInterval(() => setNow(getCurrentTimestamps()), 1000)
    return () => clearInterval(t)
  }, [])

  const zones = useMemo(listTimeZones, [])
  const output = mode === 'epochToDate' ? epochToDate(input, tz) : dateToEpoch(input)

  return (
    <div className="space-y-5">
      <ToolSection title="Current time" right={<CopyButton value={now} copy={copy} copiedKey={copiedKey} toastLabel="Timestamps" />}>
        <OutputBlock value={now} />
      </ToolSection>

      <ToolSection title="Direction">
        <SegGroup
          options={[
            { id: 'epochToDate', label: 'Epoch → Date' },
            { id: 'dateToEpoch', label: 'Date → Epoch' }
          ]}
          value={mode}
          onChange={setMode}
        />
      </ToolSection>

      {mode === 'epochToDate' && (
        <ToolSection title="Time zone">
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </ToolSection>
      )}

      <ToolSection title="Input">
        <ToolTextarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'epochToDate' ? '1700000000  (seconds or milliseconds)' : '2024-01-31T12:00:00Z  or  Jan 31 2024'}
        />
      </ToolSection>

      <ToolSection title="Output" right={<CopyButton value={output} copy={copy} copiedKey={copiedKey} toastLabel="Output" />}>
        <OutputBlock value={output} />
      </ToolSection>
    </div>
  )
}
