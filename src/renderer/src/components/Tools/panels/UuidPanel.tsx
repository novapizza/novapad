import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { generateIds, formatUuidOutput, type UuidType, type UuidOutputFormat } from '../../../lib/tools/uuid'
import { CopyButton, OutputBlock, SegGroup, ToolSection, useCopy } from '../shared'

const TYPE_OPTIONS: { id: UuidType; label: string; desc: string }[] = [
  { id: 'v4', label: 'UUID v4', desc: 'Random' },
  { id: 'v7', label: 'UUID v7', desc: 'Time-ordered' },
  { id: 'v1', label: 'UUID v1', desc: 'Time-based' },
  { id: 'ulid', label: 'ULID', desc: 'Sortable' }
]

const FORMAT_OPTIONS: { id: UuidOutputFormat; label: string }[] = [
  { id: 'lines', label: 'One per line' },
  { id: 'array', label: 'JSON array' },
  { id: 'sql', label: 'SQL IN (…)' },
  { id: 'csv', label: 'CSV' }
]

export function UuidPanel(): React.ReactElement {
  const [type, setType] = useState<UuidType>('v4')
  const [count, setCount] = useState(10)
  const [format, setFormat] = useState<UuidOutputFormat>('lines')
  const [ids, setIds] = useState<string[]>([])
  const { copy, copiedKey } = useCopy()

  const generate = (): void => setIds(generateIds(type, count))
  // Regenerate whenever the type or count changes.
  useEffect(generate, [type, count]) // eslint-disable-line react-hooks/exhaustive-deps

  const output = formatUuidOutput(ids, format)

  return (
    <div className="space-y-5">
      <ToolSection title="Type">
        <SegGroup options={TYPE_OPTIONS} value={type} onChange={setType} />
      </ToolSection>

      <ToolSection title={`Count — ${count}`}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={100}
            value={Math.min(count, 100)}
            onChange={(e) => setCount(Number(e.target.value))}
            className="flex-1 accent-[hsl(var(--primary))]"
          />
          <input
            type="number"
            min={1}
            max={1000}
            value={count}
            onChange={(e) => setCount(Math.min(Math.max(Number(e.target.value) || 1, 1), 1000))}
            className="w-24 rounded border border-input bg-background px-2 py-1.5 text-sm font-mono text-foreground"
          />
        </div>
        <p className="text-xs text-muted-foreground">Slider goes to 100; type up to 1000 in the box.</p>
      </ToolSection>

      <ToolSection title="Output format">
        <SegGroup options={FORMAT_OPTIONS} value={format} onChange={setFormat} />
      </ToolSection>

      <ToolSection
        title={`Output — ${ids.length} ${type.toUpperCase()}${ids.length !== 1 ? 's' : ''}`}
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={generate}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <RefreshCw size={13} /> Regenerate
            </button>
            <CopyButton value={output} copy={copy} copiedKey={copiedKey} toastLabel="UUIDs" />
          </div>
        }
      >
        <OutputBlock value={output} placeholder="Configure and generate" />
      </ToolSection>
    </div>
  )
}
