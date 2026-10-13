import React, { useEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import { X } from 'lucide-react'

interface Props {
  index: number
  initialText: string
  onApply: (text: string) => void
  onCancel: () => void
}

/**
 * Modal editor for a single record. Records are small, so a real Monaco
 * instance is cheap here and gives the user full editing power (add keys,
 * reorder, multi-cursor). Apply validates with JSON.parse before committing.
 */
export const RecordEditor: React.FC<Props> = ({ index, initialText, onApply, onCancel }) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const ed = monaco.editor.create(hostRef.current, {
      value: initialText,
      language: 'json',
      automaticLayout: true,
      minimap: { enabled: false },
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineNumbersMinChars: 3,
      renderLineHighlight: 'none'
    })
    editorRef.current = ed
    ed.focus()
    const sub = ed.onDidChangeModelContent(() => setError(null))
    return () => {
      sub.dispose()
      ed.getModel()?.dispose()
      ed.dispose()
      editorRef.current = null
    }
    // Mount once per record; the parent remounts us with a new key per index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const apply = (): void => {
    const text = editorRef.current?.getValue() ?? ''
    try {
      JSON.parse(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
      return
    }
    onApply(text)
  }

  const format = (): void => {
    const ed = editorRef.current
    if (!ed) return
    try {
      ed.setValue(JSON.stringify(JSON.parse(ed.getValue()), null, 2))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); apply() }
  }

  return (
    <div
      className="absolute inset-0 z-20 bg-black/40 flex items-center justify-center p-6"
      onKeyDown={onKeyDown}
      data-testid="ljson-record-editor"
    >
      <div className="bg-background border border-border rounded-md shadow-xl flex flex-col w-full max-w-4xl h-[80%]">
        <header className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <span className="text-[13px] font-semibold">Edit record {index.toLocaleString()}</span>
          <span className="text-[11px] text-muted-foreground">Ctrl+Enter to apply · Esc to cancel</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={format}
              className="px-2 py-1 text-[12px] rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            >
              Format
            </button>
            <button type="button" onClick={onCancel} aria-label="Close" className="p-1 rounded hover:bg-secondary">
              <X size={14} />
            </button>
          </div>
        </header>
        <div ref={hostRef} className="flex-1 min-h-0" />
        <footer className="flex items-center gap-2 px-3 py-2 border-t border-border">
          {error && <span className="text-[12px] text-destructive font-mono truncate">Invalid JSON: {error}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1 text-[12px] rounded border border-border hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              className="px-3 py-1 text-[12px] rounded bg-primary text-primary-foreground hover:opacity-90"
              data-testid="ljson-apply"
            >
              Apply
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
