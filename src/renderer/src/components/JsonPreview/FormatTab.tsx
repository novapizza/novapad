import React, { useEffect, useMemo, useState } from 'react'
import { Maximize2, Minimize2 as MinifyIcon, TreePine, Type } from 'lucide-react'
import { CopyButton, ErrorRow, HighlightedJsonOutput, JsonTreeNode } from './shared'

export function FormatTab({ content }: { content: string }) {
  const [indent, setIndent] = useState<2 | 4 | 'tab'>(2)
  // Tree is the default — it's the only view that stays responsive on big
  // JSON (the spine-expansion + pagination renders ~100 rows regardless of
  // payload size). Text view is still available for raw inspection but the
  // pretty-printed string of a multi-megabyte payload stalls the renderer.
  const [view, setView] = useState<'text' | 'tree'>('tree')
  const [mode, setMode] = useState<'beautify' | 'minify'>('beautify')

  const [parsed, setParsed] = useState<unknown>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)

  const indentVal = (): string | number => (indent === 'tab' ? '\t' : indent)

  // Defer parse + stringify off the render path. Without this, JSON.parse on
  // an 18 MB payload runs inside useMemo during commit and freezes the UI
  // for ~3 s before any feedback can paint. requestAnimationFrame lets the
  // "Parsing…" busy state render first; the synchronous parse then blocks
  // afterwards, but at least the user knows work is happening.
  //
  // Stringify is skipped when the user is in Tree view — for 18 MB JSON
  // that saves ~2 s of wasted work since JsonTreeNode reads `parsed`, not
  // the formatted string.
  useEffect(() => {
    if (!content.trim()) {
      setParsed(null)
      setParseError(null)
      setOutput('')
      setBusy(false)
      return
    }
    setBusy(true)
    const handle = requestAnimationFrame(() => {
      try {
        const p = JSON.parse(content)
        setParsed(p)
        setParseError(null)
        if (view === 'text') {
          setOutput(
            mode === 'minify'
              ? JSON.stringify(p)
              : JSON.stringify(p, null, indentVal())
          )
        } else {
          setOutput('')
        }
      } catch (e) {
        setParsed(null)
        setOutput('')
        setParseError(e instanceof Error ? e.message : 'Parse error')
      } finally {
        setBusy(false)
      }
    })
    return () => cancelAnimationFrame(handle)
  }, [content, view, mode, indent])

  const handleMinify = () => setMode('minify')

  const sizeMB = content.length / 1024 / 1024
  const isLarge = content.length > 1_000_000

  // Total count of object keys + array indices across the whole tree. Cheap
  // single-pass walk over the already-parsed value; for an 18 MB payload it
  // takes ~150 ms and runs once per parse. Iterative stack so deep JSON
  // can't blow the call stack.
  const itemCount = useMemo(() => {
    if (parsed === null || typeof parsed !== 'object') return 0
    let n = 0
    const stack: unknown[] = [parsed]
    while (stack.length > 0) {
      const v = stack.pop()
      if (v === null || typeof v !== 'object') continue
      if (Array.isArray(v)) {
        n += v.length
        for (let i = 0; i < v.length; i++) stack.push(v[i])
      } else {
        const entries = Object.values(v as Record<string, unknown>)
        n += entries.length
        for (let i = 0; i < entries.length; i++) stack.push(entries[i])
      }
    }
    return n
  }, [parsed])

  const topLevelLabel = useMemo(() => {
    if (parsed === null || typeof parsed !== 'object') return null
    if (Array.isArray(parsed)) return `${parsed.length.toLocaleString()} items`
    return `${Object.keys(parsed as Record<string, unknown>).length.toLocaleString()} keys`
  }, [parsed])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/10 flex-wrap">
        <div className="flex bg-secondary rounded p-0.5 gap-0.5">
          {([2, 4, 'tab'] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => setIndent(v as typeof indent)}
              className={
                'px-2 py-0.5 text-[11px] font-bold rounded transition-colors ' +
                (indent === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
              }
            >
              {v === 'tab' ? 'Tab' : `${v}sp`}
            </button>
          ))}
        </div>
        <div className="flex bg-secondary rounded p-0.5 gap-0.5">
          <button
            onClick={() => setMode('beautify')}
            className={
              'flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded transition-colors ' +
              (mode === 'beautify' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
            }
          >
            <Maximize2 size={10} /> Beautify
          </button>
          <button
            onClick={handleMinify}
            className={
              'flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded transition-colors ' +
              (mode === 'minify' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
            }
          >
            <MinifyIcon size={10} /> Minify
          </button>
        </div>
        <div className="flex bg-secondary rounded p-0.5 gap-0.5">
          <button
            onClick={() => setView('text')}
            title="Text view"
            className={
              'flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded transition-colors ' +
              (view === 'text' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
            }
          >
            <Type size={10} /> Text
          </button>
          <button
            onClick={() => setView('tree')}
            title="Tree view — only the root spine auto-expands; click chevrons to drill in"
            className={
              'flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded transition-colors ' +
              (view === 'tree' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
            }
          >
            <TreePine size={10} /> Tree
          </button>
        </div>
        {!busy && topLevelLabel && (
          <span
            className="text-[12px] text-primary font-mono font-semibold"
            title={`${itemCount.toLocaleString()} total entries across the tree`}
          >
            {topLevelLabel}
            <span className="opacity-70"> · {itemCount.toLocaleString()} total</span>
          </span>
        )}
        {busy && (
          <span className="text-[12px] text-muted-foreground italic">
            {`Parsing ${sizeMB.toFixed(1)} MB…`}
          </span>
        )}
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </div>
      {parseError && <ErrorRow msg={`Invalid JSON: ${parseError}`} />}
      <div className="flex-1 overflow-auto p-3">
        {busy && parsed === null ? (
          <p className="text-muted-foreground text-[13px] italic">
            {isLarge
              ? `Parsing ${sizeMB.toFixed(1)} MB — this may take a few seconds…`
              : '// Parsing…'}
          </p>
        ) : view === 'tree' ? (
          parsed === null ? (
            <p className="text-muted-foreground text-[13px] italic">{'// Tree will render here once JSON parses…'}</p>
          ) : (
            <JsonTreeNode value={parsed} depth={0} />
          )
        ) : (
          <HighlightedJsonOutput value={output} />
        )}
      </div>
    </div>
  )
}
