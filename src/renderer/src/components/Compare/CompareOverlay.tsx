import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GitCompare, X, ArrowLeftRight, Columns2, AlignJustify, ChevronUp, ChevronDown,
  WrapText, ChevronsUpDown, Copy, Check,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import {
  diffNormalised, buildSideBySide, buildUnifiedDisplayRows, buildUnifiedPatch,
  inlineDiff, type SideBySideRow, type UnifiedDisplayRow, type InlineOp,
} from '../../utils/textDiff'

/**
 * Fullscreen overlay launched from a tab's right-click → "Compare with…" →
 * pick another open tab. Both buffer contents come in via uiStore; closing
 * the overlay (Esc / X / "Done") just clears that state.
 *
 * Inline highlights and side-by-side / unified algorithms are ported from
 * exifmaster-pro/components/TextDiff.tsx; the input panes are stripped (we
 * already have the two buffers) and styling switched to NovaPad's design
 * tokens so the overlay matches the rest of the app's theme.
 */
type ViewMode = 'sidebyside' | 'unified'

export const CompareOverlay: React.FC = () => {
  const compareLeft = useUIStore((s) => s.compareLeft)
  const compareRight = useUIStore((s) => s.compareRight)
  const closeCompare = useUIStore((s) => s.closeCompare)
  const openCompare = useUIStore((s) => s.openCompare)

  const [ignoreWs, setIgnoreWs] = useState(false)
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [hideEqual, setHideEqual] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('sidebyside')
  const [wordWrap, setWordWrap] = useState(true)
  const [activeHunk, setActiveHunk] = useState(0)
  const [expandedHunks, setExpandedHunks] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState(false)

  // Esc closes the overlay. Mirrors usePreviewFullscreen's pattern but kept
  // local because the Compare overlay isn't tied to the preview state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeCompare()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeCompare])

  if (!compareLeft || !compareRight) return null

  return (
    <CompareView
      left={compareLeft}
      right={compareRight}
      onSwap={() => openCompare(compareRight, compareLeft)}
      onClose={closeCompare}
      ignoreWs={ignoreWs}
      setIgnoreWs={setIgnoreWs}
      ignoreCase={ignoreCase}
      setIgnoreCase={setIgnoreCase}
      hideEqual={hideEqual}
      setHideEqual={setHideEqual}
      viewMode={viewMode}
      setViewMode={setViewMode}
      wordWrap={wordWrap}
      setWordWrap={setWordWrap}
      activeHunk={activeHunk}
      setActiveHunk={setActiveHunk}
      expandedHunks={expandedHunks}
      setExpandedHunks={setExpandedHunks}
      copied={copied}
      setCopied={setCopied}
    />
  )
}

interface CompareViewProps {
  left: { title: string; content: string }
  right: { title: string; content: string }
  onSwap: () => void
  onClose: () => void
  ignoreWs: boolean
  setIgnoreWs: (v: boolean) => void
  ignoreCase: boolean
  setIgnoreCase: (v: boolean) => void
  hideEqual: boolean
  setHideEqual: (v: boolean) => void
  viewMode: ViewMode
  setViewMode: (v: ViewMode) => void
  wordWrap: boolean
  setWordWrap: (v: boolean) => void
  activeHunk: number
  setActiveHunk: (v: number | ((cur: number) => number)) => void
  expandedHunks: Set<number>
  setExpandedHunks: React.Dispatch<React.SetStateAction<Set<number>>>
  copied: boolean
  setCopied: (v: boolean) => void
}

const CompareView: React.FC<CompareViewProps> = ({
  left, right, onSwap, onClose,
  ignoreWs, setIgnoreWs, ignoreCase, setIgnoreCase, hideEqual, setHideEqual,
  viewMode, setViewMode, wordWrap, setWordWrap,
  activeHunk, setActiveHunk, expandedHunks, setExpandedHunks,
  copied, setCopied,
}) => {
  const { ops, stats } = useMemo(
    () => diffNormalised(left.content, right.content, ignoreWs, ignoreCase),
    [left.content, right.content, ignoreWs, ignoreCase]
  )

  const sideRows = useMemo(() => {
    const all = buildSideBySide(ops)
    return hideEqual ? all.filter((r) => r.type !== 'equal') : all
  }, [ops, hideEqual])

  const unifiedRows = useMemo(
    () => buildUnifiedDisplayRows(ops, 3, expandedHunks),
    [ops, expandedHunks]
  )
  const unifiedPatch = useMemo(() => buildUnifiedPatch(ops), [ops])

  const hunkCount = useMemo(() => {
    if (viewMode === 'sidebyside') {
      let count = 0
      for (let i = 0; i < sideRows.length; i++) {
        if (sideRows[i].type !== 'equal' && (i === 0 || sideRows[i - 1].type === 'equal')) count++
      }
      return count
    }
    return unifiedRows.filter((r) => r.type === 'hunk').length
  }, [sideRows, unifiedRows, viewMode])

  // Reset active hunk + expansions whenever the diff itself changes.
  useEffect(() => {
    setActiveHunk(0)
    setExpandedHunks(new Set())
  }, [ops, viewMode, setActiveHunk, setExpandedHunks])

  const onExpandHunk = useCallback(
    (idx: number) => {
      setExpandedHunks((prev) => {
        const next = new Set(prev)
        next.add(idx)
        return next
      })
    },
    [setExpandedHunks]
  )

  const handleCopyPatch = () => {
    if (!unifiedPatch) return
    navigator.clipboard.writeText(unifiedPatch)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const hasDiff = stats.added > 0 || stats.removed > 0

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col h-full overflow-hidden bg-background"
      data-testid="compare-overlay"
    >
      {/* Header — both titles + close */}
      <header className="px-3 py-2 border-b border-border flex items-center gap-2 bg-secondary/30">
        <GitCompare size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Compare
        </span>
        <span className="text-xs font-medium text-foreground/80 ml-1 truncate" title={left.title}>
          {left.title}
        </span>
        <ArrowLeftRight size={11} className="text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-foreground/80 truncate" title={right.title}>
          {right.title}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={onSwap}
            aria-label="Swap A and B"
            title="Swap A and B"
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftRight size={14} />
          </button>
          <button
            onClick={onClose}
            aria-label="Close compare"
            title="Close (Esc)"
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/* Options bar */}
      <div className="px-3 py-2 border-b border-border bg-secondary/10 flex flex-wrap items-center gap-2">
        <CheckboxRow label="Ignore whitespace" checked={ignoreWs} onChange={setIgnoreWs} />
        <CheckboxRow label="Ignore case" checked={ignoreCase} onChange={setIgnoreCase} />
        <CheckboxRow label="Hide unchanged" checked={hideEqual} onChange={setHideEqual} />

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setWordWrap(!wordWrap)}
            title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
            className={
              'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-colors border ' +
              (wordWrap
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-background border-border text-muted-foreground hover:text-foreground')
            }
          >
            <WrapText size={11} /> Wrap
          </button>
          <div className="flex bg-secondary rounded p-0.5 gap-0.5">
            <button
              onClick={() => setViewMode('sidebyside')}
              className={
                'flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded transition-colors ' +
                (viewMode === 'sidebyside'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              <Columns2 size={11} /> Side by Side
            </button>
            <button
              onClick={() => setViewMode('unified')}
              className={
                'flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded transition-colors ' +
                (viewMode === 'unified'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              <AlignJustify size={11} /> Unified
            </button>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-3 py-1.5 border-b border-border bg-secondary/5 flex items-center gap-3 text-[11px]">
        <span className="text-emerald-600 dark:text-emerald-400 font-bold" data-testid="compare-stat-added">
          +{stats.added}
        </span>
        <span className="text-red-600 dark:text-red-400 font-bold" data-testid="compare-stat-removed">
          -{stats.removed}
        </span>
        <span className="text-muted-foreground" data-testid="compare-stat-equal">
          {stats.equal} unchanged
        </span>
        {!hasDiff && (
          <span className="text-primary font-semibold ml-1">✓ Files are identical</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {hasDiff && hunkCount > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveHunk((h) => Math.max(0, h - 1))}
                disabled={activeHunk === 0}
                title="Previous change"
                aria-label="Previous change"
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronUp size={12} />
              </button>
              <span className="text-[10px] font-bold text-muted-foreground tabular-nums min-w-[2.5rem] text-center">
                {activeHunk + 1}/{hunkCount}
              </span>
              <button
                onClick={() => setActiveHunk((h) => Math.min(hunkCount - 1, h + 1))}
                disabled={activeHunk === hunkCount - 1}
                title="Next change"
                aria-label="Next change"
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronDown size={12} />
              </button>
            </div>
          )}
          <button
            onClick={handleCopyPatch}
            disabled={!unifiedPatch}
            title="Copy unified patch"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-secondary hover:bg-secondary/80 text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy patch'}
          </button>
        </div>
      </div>

      {/* Diff body */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'sidebyside' ? (
          <SideBySideView
            rows={sideRows}
            activeHunk={activeHunk}
            wordWrap={wordWrap}
            leftTitle={left.title}
            rightTitle={right.title}
          />
        ) : (
          <UnifiedView
            rows={unifiedRows}
            activeHunk={activeHunk}
            wordWrap={wordWrap}
            onExpandHunk={onExpandHunk}
          />
        )}
      </div>
    </div>
  )
}

const CheckboxRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({
  label, checked, onChange,
}) => (
  <label className="flex items-center gap-1.5 cursor-pointer select-none">
    <input
      type="checkbox"
      className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
  </label>
)

// ── Inline span renderer ────────────────────────────────────────────────────

const InlineSpans: React.FC<{ ops: InlineOp[] }> = ({ ops }) => (
  <>
    {ops.map((op, i) => {
      if (op.type === 'equal') return <span key={i}>{op.text}</span>
      if (op.type === 'del') {
        return (
          <mark
            key={i}
            className="bg-red-500/30 text-red-700 dark:text-red-200 rounded-sm px-0.5"
          >
            {op.text}
          </mark>
        )
      }
      return (
        <mark
          key={i}
          className="bg-emerald-500/30 text-emerald-700 dark:text-emerald-200 rounded-sm px-0.5"
        >
          {op.text}
        </mark>
      )
    })}
  </>
)

// ── Side-by-side view ──────────────────────────────────────────────────────

const SideBySideView: React.FC<{
  rows: SideBySideRow[]
  activeHunk: number
  wordWrap: boolean
  leftTitle: string
  rightTitle: string
}> = ({ rows, activeHunk, wordWrap, leftTitle, rightTitle }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const hunkRefs = useRef<(HTMLTableRowElement | null)[]>([])

  // Precompute which row index begins each hunk so we can scroll into view
  // when the user clicks the prev/next change buttons.
  const rowToHunkId = useMemo(() => {
    const map = new Map<number, number>()
    let hunkId = 0
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].type !== 'equal' && (i === 0 || rows[i - 1].type === 'equal')) {
        map.set(i, hunkId++)
      }
    }
    return map
  }, [rows])

  useEffect(() => {
    const el = hunkRefs.current[activeHunk]
    const container = scrollRef.current
    if (!el || !container) return
    container.scrollTo({ top: Math.max(0, el.offsetTop - 48), behavior: 'smooth' })
  }, [activeHunk])

  if (rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground font-semibold">
        No differences to show
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="overflow-auto h-full">
      <table className={'w-full border-collapse font-mono text-[12px] ' + (wordWrap ? 'table-fixed' : '')}>
        <colgroup>
          <col className="w-12" />
          <col className="w-1/2" />
          <col className="w-12" />
          <col className="w-1/2" />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-secondary border-b border-border">
            <th className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground text-right">#</th>
            <th className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground text-left uppercase tracking-wider truncate" title={leftTitle}>
              A · {leftTitle}
            </th>
            <th className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground text-right">#</th>
            <th className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground text-left uppercase tracking-wider truncate" title={rightTitle}>
              B · {rightTitle}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const hunkId = rowToHunkId.get(idx)
            const inline =
              row.type === 'change' && row.left !== null && row.right !== null
                ? inlineDiff(row.left, row.right)
                : null

            const isDelRow = row.type === 'delete' || row.type === 'change'
            const isInsRow = row.type === 'insert' || row.type === 'change'

            return (
              <tr
                key={idx}
                ref={hunkId !== undefined ? (el) => { hunkRefs.current[hunkId] = el } : undefined}
                className="border-b border-border/40"
              >
                <td
                  className={
                    'px-2 py-0.5 text-right select-none border-r text-[10px] ' +
                    (isDelRow
                      ? 'bg-red-500/10 border-red-500/30 text-red-500'
                      : row.left === null
                        ? 'bg-secondary/40 border-border text-muted-foreground/60'
                        : 'border-border/40 text-muted-foreground')
                  }
                >
                  {row.leftNo}
                </td>
                <td
                  className={
                    'px-3 py-0.5 align-top ' +
                    (wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto') +
                    ' ' +
                    (isDelRow
                      ? 'bg-red-500/10 text-red-700 dark:text-red-200'
                      : row.left === null
                        ? 'bg-secondary/40'
                        : 'text-foreground')
                  }
                >
                  {isDelRow && row.left !== null ? (
                    <span>
                      <span className="text-red-500 select-none mr-1">-</span>
                      {inline ? <InlineSpans ops={inline.left} /> : row.left}
                    </span>
                  ) : row.left !== null ? (
                    <span>{row.left}</span>
                  ) : null}
                </td>
                <td
                  className={
                    'px-2 py-0.5 text-right select-none border-r border-l text-[10px] ' +
                    (isInsRow
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                      : row.right === null
                        ? 'bg-secondary/40 border-border text-muted-foreground/60'
                        : 'border-border/40 text-muted-foreground')
                  }
                >
                  {row.rightNo}
                </td>
                <td
                  className={
                    'px-3 py-0.5 align-top ' +
                    (wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto') +
                    ' ' +
                    (isInsRow
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                      : row.right === null
                        ? 'bg-secondary/40'
                        : 'text-foreground')
                  }
                >
                  {isInsRow && row.right !== null ? (
                    <span>
                      <span className="text-emerald-500 select-none mr-1">+</span>
                      {inline ? <InlineSpans ops={inline.right} /> : row.right}
                    </span>
                  ) : row.right !== null ? (
                    <span>{row.right}</span>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Unified view ───────────────────────────────────────────────────────────

const UnifiedView: React.FC<{
  rows: UnifiedDisplayRow[]
  activeHunk: number
  wordWrap: boolean
  onExpandHunk: (idx: number) => void
}> = ({ rows, activeHunk, wordWrap, onExpandHunk }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const hunkRefs = useRef<(HTMLTableRowElement | null)[]>([])

  useEffect(() => {
    const el = hunkRefs.current[activeHunk]
    const container = scrollRef.current
    if (!el || !container) return
    container.scrollTo({ top: Math.max(0, el.offsetTop - 48), behavior: 'smooth' })
  }, [activeHunk])

  if (rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground font-semibold">
        No differences to show
      </div>
    )
  }

  let hunkCounter = -1
  return (
    <div ref={scrollRef} className="overflow-auto h-full">
      <table className={'w-full border-collapse font-mono text-[12px] ' + (wordWrap ? 'table-fixed' : '')}>
        <colgroup>
          <col className="w-8" />
          <col className="w-full" />
        </colgroup>
        <tbody>
          {rows.map((row, i) => {
            if (row.type === 'hunk') {
              hunkCounter++
              const currentHunk = hunkCounter
              return (
                <tr
                  key={i}
                  ref={(el) => { hunkRefs.current[currentHunk] = el }}
                  className="bg-secondary/60 border-b border-border"
                >
                  <td className="px-2 py-0.5 text-muted-foreground select-none text-center text-[10px]">⋯</td>
                  <td className="px-3 py-0.5 text-muted-foreground font-mono text-[11px] font-semibold tracking-tight">
                    <span className="mr-3">{row.hunkHeader}</span>
                    {row.canExpand && (
                      <button
                        onClick={() => onExpandHunk(row.hunkIndex!)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                        title="Show more context"
                      >
                        <ChevronsUpDown size={10} /> more context
                      </button>
                    )}
                  </td>
                </tr>
              )
            }

            if (row.type === 'context') {
              return (
                <tr key={i} className="border-b border-border/40">
                  <td className="px-2 py-0.5 text-muted-foreground/60 select-none text-right text-[10px] border-r border-border/40" />
                  <td
                    className={
                      'px-3 py-0.5 text-foreground ' +
                      (wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre')
                    }
                  >
                    {row.text}
                  </td>
                </tr>
              )
            }

            if (row.type === 'delete') {
              const ops = row.pairText !== undefined ? inlineDiff(row.text, row.pairText).left : null
              return (
                <tr key={i} className="bg-red-500/10 border-b border-red-500/20">
                  <td className="px-2 py-0.5 text-red-500 select-none text-center border-r border-red-500/20">-</td>
                  <td
                    className={
                      'px-3 py-0.5 text-red-700 dark:text-red-200 ' +
                      (wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre')
                    }
                  >
                    {ops ? <InlineSpans ops={ops} /> : row.text}
                  </td>
                </tr>
              )
            }

            // insert
            const ops = row.pairText !== undefined ? inlineDiff(row.pairText, row.text).right : null
            return (
              <tr key={i} className="bg-emerald-500/10 border-b border-emerald-500/20">
                <td className="px-2 py-0.5 text-emerald-500 select-none text-center border-r border-emerald-500/20">+</td>
                <td
                  className={
                    'px-3 py-0.5 text-emerald-700 dark:text-emerald-200 ' +
                    (wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre')
                  }
                >
                  {ops ? <InlineSpans ops={ops} /> : row.text}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
