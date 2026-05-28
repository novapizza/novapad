import React, { useMemo } from 'react'
import { CopyButton, ErrorRow, HighlightedJsonOutput } from './shared'

export function UnescapeTab({ content }: { content: string }) {
  const { output, error } = useMemo(() => {
    const s = content.trim()
    if (!s) return { output: '', error: null as string | null }
    try {
      // Case 1: full JSON-string literal, wrapped in outer quotes.
      if (s.startsWith('"') && s.endsWith('"')) {
        const inner = JSON.parse(s) as string
        try {
          return { output: JSON.stringify(JSON.parse(inner), null, 2), error: null }
        } catch {
          return { output: inner, error: null }
        }
      }
      // Case 2: raw escaped text without outer quotes.
      const unescaped = s.replace(/\\"/g, '"')
      return { output: JSON.stringify(JSON.parse(unescaped), null, 2), error: null }
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : 'Invalid input' }
    }
  }, [content])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/10">
        <span className="text-[12px] text-muted-foreground">
          Strips backslash-escaping from JSON embedded in logs / API responses.
        </span>
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </div>
      {error && <ErrorRow msg={`Could not parse: ${error}`} />}
      <div className="flex-1 overflow-auto p-3">
        <HighlightedJsonOutput value={output} />
      </div>
    </div>
  )
}

export default UnescapeTab
