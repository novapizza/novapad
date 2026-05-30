import React, { useMemo, useState } from 'react'
import {
  parseColor,
  convertAll,
  relativeLuminance,
  contrastRatio,
  wcagGrade,
  toHex6
} from '../../../lib/tools/colorMath'
import { OutputField, ToolSection, useCopy } from '../shared'

function Badge({ ok, label }: { ok: boolean; label: string }): React.ReactElement {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
        ok ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-destructive/15 text-destructive'
      }`}
    >
      {label} {ok ? '✓' : '✗'}
    </span>
  )
}

export function ColorPanel(): React.ReactElement {
  const [input, setInput] = useState('#3b82f6')
  const { copy, copiedKey } = useCopy()

  const rgba = useMemo(() => parseColor(input), [input])
  const converted = useMemo(() => (rgba ? convertAll(rgba) : null), [rgba])

  const contrast = useMemo(() => {
    if (!rgba) return null
    const lum = relativeLuminance(rgba.r, rgba.g, rgba.b)
    const onWhite = contrastRatio(lum, relativeLuminance(255, 255, 255))
    const onBlack = contrastRatio(lum, relativeLuminance(0, 0, 0))
    return { onWhite, onBlack }
  }, [rgba])

  const pickerHex = rgba ? toHex6(rgba.r, rgba.g, rgba.b) : '#000000'

  return (
    <div className="space-y-5">
      <ToolSection title="Color">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={pickerHex}
            onChange={(e) => setInput(e.target.value)}
            className="h-10 w-12 shrink-0 cursor-pointer rounded border border-input bg-background"
            title="Pick a color"
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="#3b82f6, rgb(59 130 246), hsl(217 91% 60%), oklch(…), rebeccapurple"
            className="flex-1 rounded border border-input bg-background px-2 py-2 text-sm font-mono text-foreground"
          />
          <div
            className="h-10 w-16 shrink-0 rounded border border-border"
            style={{ backgroundColor: rgba ? converted?.rgba : 'transparent' }}
          />
        </div>
        {!rgba && input.trim() && <p className="text-xs text-destructive">Could not parse this color.</p>}
      </ToolSection>

      {converted && (
        <ToolSection title="Formats">
          <div className="space-y-1.5">
            <OutputField label="HEX" value={converted.hex} copy={copy} copiedKey={copiedKey} />
            <OutputField label="HEX8" value={converted.hex8} copy={copy} copiedKey={copiedKey} />
            <OutputField label="RGB" value={converted.rgb} copy={copy} copiedKey={copiedKey} />
            <OutputField label="RGBA" value={converted.rgba} copy={copy} copiedKey={copiedKey} />
            <OutputField label="HSL" value={converted.hsl} copy={copy} copiedKey={copiedKey} />
            <OutputField label="HSLA" value={converted.hsla} copy={copy} copiedKey={copiedKey} />
            <OutputField label="OKLCH" value={converted.oklch} copy={copy} copiedKey={copiedKey} />
          </div>
        </ToolSection>
      )}

      {contrast && (
        <ToolSection title="WCAG contrast">
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['on white', contrast.onWhite],
                ['on black', contrast.onBlack]
              ] as const
            ).map(([label, ratio]) => {
              const g = wcagGrade(ratio)
              return (
                <div key={label} className="rounded border border-border p-3">
                  <div className="text-sm text-foreground">
                    {label}: <span className="font-mono font-semibold">{ratio.toFixed(2)}:1</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge ok={g.aa} label="AA" />
                    <Badge ok={g.aaLarge} label="AA Large" />
                    <Badge ok={g.aaa} label="AAA" />
                  </div>
                </div>
              )
            })}
          </div>
        </ToolSection>
      )}
    </div>
  )
}
