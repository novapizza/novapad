import React, { useMemo, useState } from 'react'
import { highlightTs, jsonToTs, type NamingConvention } from '../../utils/jsonTools'
import { CopyButton, ErrorRow } from './shared'

export function TsTab({ content }: { content: string }) {
  const [naming, setNaming] = useState<NamingConvention>('camel')
  const { output, error } = useMemo(() => {
    if (!content.trim()) return { output: '', error: null as string | null }
    try {
      return { output: jsonToTs(content, naming), error: null }
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : 'Parse error' }
    }
  }, [content, naming])

  const html = useMemo(() => highlightTs(output), [output])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/10">
        <div className="flex bg-secondary rounded p-0.5 gap-0.5">
          {(['standard', 'camel', 'snake'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setNaming(v)}
              className={
                'px-2 py-0.5 text-[11px] font-bold rounded transition-colors capitalize ' +
                (naming === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
              }
            >
              {v}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </div>
      {error && <ErrorRow msg={`Invalid JSON: ${error}`} />}
      <div className="flex-1 overflow-auto p-3">
        {output ? (
          <pre
            className="font-mono text-[13px] whitespace-pre-wrap leading-relaxed text-foreground"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-muted-foreground text-[13px] italic">{'// Interfaces will appear here…'}</p>
        )}
      </div>
    </div>
  )
}

export default TsTab
