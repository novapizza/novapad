import React, { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, ChevronUp, Maximize2, Minimize2 as MinifyIcon,
  Search as SearchIcon, TreePine, Type, X,
} from 'lucide-react'
import {
  ACTIVE_MATCH_DOM_ID, CopyButton, ErrorRow, HighlightedJsonOutput, JsonTreeNode, collectMatches,
} from './shared'

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
  // Search is committed on Enter rather than running on every keystroke.
  // `searchInput` is the live input value; `query` is the committed needle
  // that actually drives the walk + active-match navigation. Splitting them
  // keeps typing snappy on huge payloads (no walk per character) and lines
  // up with the Ctrl+F idiom users expect.
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)

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

  // Ordered list of search hits. Recomputed only when the parse result or
  // committed query changes — typing into the input does not trigger this
  // walk. Skipped entirely in Text view since highlighting only flows
  // through JsonTreeNode.
  const needle = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (view !== 'tree' || !needle || parsed === null || typeof parsed !== 'object') {
      return []
    }
    return collectMatches(parsed, needle)
  }, [parsed, needle, view])
  const matchCount = matches.length
  // Clamp activeIdx if the match set shrank (e.g. the file changed under us
  // while a query was committed). If there are no matches at all, fall back
  // to 0 so the counter shows "0 / 0".
  const safeActiveIdx = matchCount === 0 ? 0 : Math.min(activeIdx, matchCount - 1)
  const activeMatch = matchCount > 0 ? matches[safeActiveIdx] : null
  // Force-expand only the active match's ancestor chain. Other matches stay
  // collapsed in the tree — the user reaches them by clicking next/prev.
  const forceExpandSet = useMemo(() => {
    return new Set<object>(activeMatch ? activeMatch.ancestors : [])
  }, [activeMatch])
  const activeKey = activeMatch
    ? { parent: activeMatch.parent, key: activeMatch.key, kind: activeMatch.kind }
    : null

  // Scroll the focused match into view after the tree commits the new
  // expand state. The element with ACTIVE_MATCH_DOM_ID is rendered by
  // whichever JsonTreeNode matches (parent + key); if its ancestors aren't
  // yet expanded the id won't be in the DOM, which is why this runs after
  // render rather than during.
  useEffect(() => {
    if (!activeMatch) return
    const el = document.getElementById(ACTIVE_MATCH_DOM_ID)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeMatch])

  function commitSearch() {
    const trimmed = searchInput.trim()
    if (!trimmed) {
      setQuery('')
      setActiveIdx(0)
      return
    }
    if (trimmed.toLowerCase() === needle && matchCount > 0) {
      // Same query — step to next match (wrap at the end).
      setActiveIdx((i) => (i + 1) % matchCount)
    } else {
      // New query — commit it and reset to the first match.
      setQuery(trimmed)
      setActiveIdx(0)
    }
  }

  function stepPrev() {
    if (matchCount === 0) return
    setActiveIdx((i) => (i - 1 + matchCount) % matchCount)
  }

  function stepNext() {
    if (matchCount === 0) return
    setActiveIdx((i) => (i + 1) % matchCount)
  }

  function clearSearch() {
    setSearchInput('')
    setQuery('')
    setActiveIdx(0)
  }

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
        {view === 'tree' && (
          <div className="ml-auto flex items-center gap-1 bg-secondary rounded px-2 py-0.5 min-w-[200px] focus-within:ring-1 focus-within:ring-primary">
            <SearchIcon size={11} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (e.shiftKey) stepPrev()
                  else commitSearch()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  clearSearch()
                }
              }}
              placeholder="Search — Enter to find"
              aria-label="Search nodes"
              className="bg-transparent outline-none text-[12px] font-mono text-foreground placeholder:text-muted-foreground flex-1 min-w-0"
            />
            {needle && (
              <span
                className="text-[11px] text-muted-foreground tabular-nums shrink-0"
                title={`${matchCount.toLocaleString()} match${matchCount === 1 ? '' : 'es'}`}
              >
                {matchCount === 0 ? '0 / 0' : `${(safeActiveIdx + 1).toLocaleString()} / ${matchCount.toLocaleString()}`}
              </span>
            )}
            <button
              type="button"
              onClick={stepPrev}
              disabled={matchCount === 0}
              aria-label="Previous match"
              title="Previous match (Shift+Enter)"
              className="p-0.5 rounded hover:bg-background/60 text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronUp size={11} />
            </button>
            <button
              type="button"
              onClick={stepNext}
              disabled={matchCount === 0}
              aria-label="Next match"
              title="Next match (Enter)"
              className="p-0.5 rounded hover:bg-background/60 text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronDown size={11} />
            </button>
            {(searchInput || query) && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                title="Clear search (Esc)"
                className="p-0.5 rounded hover:bg-background/60 text-muted-foreground hover:text-foreground shrink-0"
              >
                <X size={11} />
              </button>
            )}
          </div>
        )}
        <div className={view === 'tree' ? '' : 'ml-auto'}>
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
            <JsonTreeNode
              value={parsed}
              depth={0}
              search={needle}
              forceExpandSet={forceExpandSet}
              activeKey={activeKey}
              parentRef={null}
            />
          )
        ) : (
          <HighlightedJsonOutput value={output} />
        )}
      </div>
    </div>
  )
}
