import React, { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { extractByPath, formatAsJsonArray, formatAsPlainText } from '../../utils/jsonTools'
import { CopyButton, ErrorRow } from './shared'

export function ExtractTab({ content }: { content: string }) {
  const [path, setPath] = useState('')
  const [format, setFormat] = useState<'plain' | 'json'>('plain')

  const { output, count, error } = useMemo(() => {
    if (!content.trim()) return { output: '', count: null as number | null, error: null as string | null }
    if (!path.trim()) return { output: '', count: null, error: null }
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return { output: '', count: null, error: 'Invalid JSON in buffer.' }
    }
    const values = extractByPath(parsed, path)
    if (values.length === 0) return { output: '', count: 0, error: `No values for path "${path}".` }
    return {
      output: format === 'plain' ? formatAsPlainText(values) : formatAsJsonArray(values),
      count: values.length,
      error: null,
    }
  }, [content, path, format])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/10 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="hits.hits._source.id"
            spellCheck={false}
            className="w-full pl-7 pr-2 py-1 rounded border border-border bg-background text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex bg-secondary rounded p-0.5 gap-0.5">
          {(['plain', 'json'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={
                'px-2 py-0.5 text-[11px] font-bold rounded transition-colors ' +
                (format === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
              }
            >
              {f === 'plain' ? 'Plain' : 'JSON'}
            </button>
          ))}
        </div>
        <CopyButton text={output} />
      </div>
      {count !== null && (
        <div className="px-3 py-1 text-[12px] text-primary font-semibold border-b border-border">
          {count} {count === 1 ? 'value' : 'values'} found
        </div>
      )}
      {error && <ErrorRow msg={error} />}
      <div className="flex-1 overflow-auto p-3">
        {output ? (
          <pre className="font-mono text-[13px] whitespace-pre-wrap leading-relaxed text-foreground">{output}</pre>
        ) : (
          <p className="text-muted-foreground text-[13px] italic">
            Enter a dot-notation path. Missing keys are searched deeper, so <code className="font-mono">_source.id</code> works on nested ES hits.
          </p>
        )}
      </div>
    </div>
  )
}

export default ExtractTab
