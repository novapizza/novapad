import React, { useMemo } from 'react'
import { jsonrepair } from 'jsonrepair'
import { CopyButton, ErrorRow, HighlightedJsonOutput } from './shared'

export function RepairTab({ content }: { content: string }) {
  const { output, error } = useMemo(() => {
    if (!content.trim()) return { output: '', error: null as string | null }
    try {
      const fixed = jsonrepair(content)
      const parsed = JSON.parse(fixed)
      return { output: JSON.stringify(parsed, null, 2), error: null }
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : 'Could not repair' }
    }
  }, [content])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/10">
        <span className="text-[12px] text-muted-foreground">
          Auto-fix trailing commas, single quotes, unquoted keys, missing commas…
        </span>
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </div>
      {error && <ErrorRow msg={`Could not repair: ${error}`} />}
      <div className="flex-1 overflow-auto p-3">
        <HighlightedJsonOutput value={output} />
      </div>
    </div>
  )
}

export default RepairTab
