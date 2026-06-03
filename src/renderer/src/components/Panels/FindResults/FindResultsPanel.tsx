import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpRight, X } from 'lucide-react'
import { useSearchStore, FindResultLine, FindResultFile } from '../../../store/searchStore'
import { useEditorStore } from '../../../store/editorStore'
import { useFileOps } from '../../../hooks/useFileOps'
import { editorRegistry } from '../../../utils/editorRegistry'
import { shortcutMod } from '../../../utils/platform'
import { cn } from '../../../lib/utils'
import { useCopy } from '../../Tools/shared'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut
} from '../../ui/context-menu'
import * as monaco from 'monaco-editor'

// ─── Row types for flat virtual list ─────────────────────────────────────────
/** Stable identity for a result line: `${fileIndex}:${resultIndex}`. Streaming only appends files, so keys stay valid. */
type RowKey = `${number}:${number}`

type Row =
  | { kind: 'file-header'; file: FindResultFile; hitCount: number; fileIndex: number }
  | { kind: 'result-line'; file: FindResultFile; result: FindResultLine; fileIndex: number; resultIndex: number; key: RowKey }

/** Keyboard-focus identity for any row: headers are `h:${fileIndex}`, lines reuse RowKey. */
type FocusKey = RowKey | `h:${number}`

/** Right-click target — file headers and result lines get different menu items. */
type CtxTarget = { kind: 'line'; key: RowKey } | { kind: 'header'; fileIndex: number } | null

const keyOfRow = (row: Row): FocusKey => (row.kind === 'file-header' ? `h:${row.fileIndex}` : row.key)

const ROW_HEIGHT_HEADER = 34
const ROW_HEIGHT_LINE = 30

// ─── Highlight match text within a line ──────────────────────────────────────
function HighlightedLine({
  lineText,
  column,
  endColumn
}: {
  lineText: string
  column: number
  endColumn: number
}) {
  const before = lineText.slice(0, column - 1)
  const match = lineText.slice(column - 1, endColumn - 1)
  const after = lineText.slice(endColumn - 1)

  const MAX = 200
  const trimmed = lineText.length > MAX
  const displayBefore = trimmed ? before.slice(-60) : before
  const displayAfter = trimmed ? after.slice(0, 60) : after

  return (
    <span className="text-foreground whitespace-pre truncate text-base">
      {trimmed && before.length > 60 && <span className="text-muted-foreground">…</span>}
      {displayBefore}
      <span className="bg-yellow-500/30 rounded-sm text-foreground">{match}</span>
      {displayAfter}
      {trimmed && after.length > 60 && <span className="text-muted-foreground">…</span>}
    </span>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export function FindResultsPanel() {
  const { findResults, findResultsNonce, isSearching, searchProgress, removeFindResultFile } = useSearchStore()
  const { buffers, setActive } = useEditorStore()
  const { openFiles } = useFileOps()

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const rows = useMemo<Row[]>(() => {
    if (!findResults) return []
    const out: Row[] = []
    for (let i = 0; i < findResults.files.length; i++) {
      const file = findResults.files[i]
      const key = file.filePath ?? file.title
      out.push({ kind: 'file-header', file, hitCount: file.results.length, fileIndex: i })
      if (!collapsed.has(key)) {
        for (let r = 0; r < file.results.length; r++) {
          out.push({ kind: 'result-line', file, result: file.results[r], fileIndex: i, resultIndex: r, key: `${i}:${r}` })
        }
      }
    }
    return out
  }, [findResults, collapsed])

  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => rows[i].kind === 'file-header' ? ROW_HEIGHT_HEADER : ROW_HEIGHT_LINE,
    overscan: 10,
  })

  // ─── Selection & focus (view-local; cleared when a new search starts) ───────
  const [selected, setSelected] = useState<Set<RowKey>>(new Set())
  const [anchorKey, setAnchorKey] = useState<RowKey | null>(null)
  const [ctxTarget, setCtxTarget] = useState<CtxTarget>(null)
  const [focusKey, setFocusKey] = useState<FocusKey | null>(null)

  // findResultsNonce only bumps for a brand-new result set (not streaming appends or dismissals).
  useEffect(() => {
    setSelected(new Set())
    setAnchorKey(null)
    setCtxTarget(null)
    setFocusKey(null)
  }, [findResultsNonce])

  const rowIndexByKey = useMemo(() => {
    const m = new Map<FocusKey, number>()
    rows.forEach((r, i) => m.set(keyOfRow(r), i))
    return m
  }, [rows])

  /** Visible result-line keys in display order (collapsed files excluded) — drives shift-range. */
  const visibleResultKeys = useMemo<RowKey[]>(
    () => rows.flatMap((r) => (r.kind === 'result-line' ? [r.key] : [])),
    [rows]
  )

  /** Every result-line key in file+line order, regardless of collapse — drives Copy All / Select All / output order. */
  const allKeys = useMemo<RowKey[]>(
    () =>
      findResults
        ? findResults.files.flatMap((f, fi) => f.results.map((_, ri) => `${fi}:${ri}` as RowKey))
        : [],
    [findResults]
  )

  // ─── Copy helpers (raw line text only, newline-joined, Notepad++ style) ─────
  const { copy } = useCopy()

  const buildText = useCallback(
    (keys: RowKey[]): string => {
      if (!findResults) return ''
      const order = new Map(allKeys.map((k, i) => [k, i]))
      return keys
        .slice()
        .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
        .map((key) => {
          const [fi, ri] = key.split(':').map(Number)
          return findResults.files[fi]?.results[ri]?.lineText
        })
        .filter((t): t is string => t != null)
        .join('\n')
    },
    [findResults, allKeys]
  )

  const copyKeys = useCallback(
    (keys: RowKey[]) => {
      const text = buildText(keys)
      if (!text) return
      copy(text, `${keys.length} line${keys.length !== 1 ? 's' : ''}`)
    },
    [buildText, copy]
  )

  const copySelected = useCallback(() => copyKeys([...selected]), [copyKeys, selected])
  const copyAll = useCallback(() => copyKeys(allKeys), [copyKeys, allKeys])
  const selectAll = useCallback(() => setSelected(new Set(allKeys)), [allKeys])

  const handleNavigate = useCallback(
    async (file: FindResultFile, lineNumber: number, column: number) => {
      if (file.bufferId) {
        setActive(file.bufferId)
      } else if (file.filePath) {
        const existing = buffers.find((b) => b.filePath === file.filePath)
        if (existing) {
          setActive(existing.id)
        } else {
          await openFiles([file.filePath])
        }
      }

      setTimeout(() => {
        const editor = editorRegistry.get()
        if (!editor) return
        const range = new monaco.Range(lineNumber, column, lineNumber, column)
        editor.setPosition({ lineNumber, column })
        editor.revealLineInCenter(lineNumber)
        editor.setSelection(range)
        editor.focus()
      }, 50)
    },
    [buffers, setActive, openFiles]
  )

  /** Open a file from its header row (jump to the first hit). */
  const openFile = useCallback(
    (file: FindResultFile) => {
      const first = file.results[0]
      void handleNavigate(file, first?.lineNumber ?? 1, first?.column ?? 1)
    },
    [handleNavigate]
  )

  /** Remove one file from the results and remap the view-local keys (indices above it shift down). */
  const dismissFile = useCallback(
    (fi: number) => {
      const remapLine = (key: RowKey | null): RowKey | null => {
        if (!key) return null
        const [f, r] = key.split(':').map(Number)
        if (f === fi) return null
        return f > fi ? (`${f - 1}:${r}` as RowKey) : key
      }
      setSelected((prev) => new Set([...prev].map(remapLine).filter((k): k is RowKey => k != null)))
      setAnchorKey((k) => remapLine(k))
      setCtxTarget(null)
      setFocusKey((k) => {
        if (!k) return null
        if (k.startsWith('h:')) {
          const f = Number(k.slice(2))
          if (f === fi) return null
          return f > fi ? `h:${f - 1}` : k
        }
        return remapLine(k as RowKey)
      })
      removeFindResultFile(fi)
    },
    [removeFindResultFile]
  )

  const handleRowClick = useCallback(
    (e: React.MouseEvent, row: Extract<Row, { kind: 'result-line' }>) => {
      const meta = e.metaKey || e.ctrlKey
      setFocusKey(row.key)
      if (e.shiftKey && anchorKey) {
        // Range select over visible rows between the anchor and the clicked row; no navigation.
        const a = visibleResultKeys.indexOf(anchorKey)
        const b = visibleResultKeys.indexOf(row.key)
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a]
          setSelected(new Set(visibleResultKeys.slice(lo, hi + 1)))
        }
        parentRef.current?.focus({ preventScroll: true })
      } else if (meta) {
        // Toggle membership; no navigation.
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(row.key)) next.delete(row.key)
          else next.add(row.key)
          return next
        })
        setAnchorKey(row.key)
        parentRef.current?.focus({ preventScroll: true })
      } else {
        // Plain click: select this row and navigate (existing behavior).
        setSelected(new Set([row.key]))
        setAnchorKey(row.key)
        void handleNavigate(row.file, row.result.lineNumber, row.result.column)
      }
    },
    [anchorKey, visibleResultKeys, handleNavigate]
  )

  /** Move keyboard focus to rows[i] (clamped) and keep it scrolled into view. */
  const focusRowAt = useCallback(
    (i: number): Row => {
      const idx = Math.max(0, Math.min(rows.length - 1, i))
      const row = rows[idx]
      setFocusKey(keyOfRow(row))
      virtualizer.scrollToIndex(idx)
      return row
    },
    [rows, virtualizer]
  )

  // Scoped to the panel container (fires only when it has DOM focus) so Monaco's own keys are untouched.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const k = e.key.toLowerCase()
        if (k === 'c' && selected.size > 0) {
          e.preventDefault()
          copySelected()
        } else if (k === 'a' && allKeys.length > 0) {
          e.preventDefault()
          selectAll()
        }
        return
      }

      // ── VSCode-style tree navigation ──
      if (rows.length === 0) return
      const idx = focusKey != null ? (rowIndexByKey.get(focusKey) ?? -1) : -1
      const focusedRow = idx >= 0 ? rows[idx] : null

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          e.preventDefault()
          const next = focusRowAt(idx === -1 ? 0 : idx + (e.key === 'ArrowDown' ? 1 : -1))
          if (next.kind === 'result-line') {
            if (e.shiftKey && anchorKey) {
              const a = visibleResultKeys.indexOf(anchorKey)
              const b = visibleResultKeys.indexOf(next.key)
              if (a !== -1 && b !== -1) {
                const [lo, hi] = a < b ? [a, b] : [b, a]
                setSelected(new Set(visibleResultKeys.slice(lo, hi + 1)))
              }
            } else {
              setSelected(new Set([next.key]))
              setAnchorKey(next.key)
            }
          }
          break
        }
        case 'ArrowRight': {
          if (!focusedRow) break
          e.preventDefault()
          if (focusedRow.kind === 'file-header') {
            const ck = focusedRow.file.filePath ?? focusedRow.file.title
            if (collapsed.has(ck)) toggleCollapse(ck)
            else if (focusedRow.hitCount > 0) focusRowAt(idx + 1) // step into the first hit
          }
          break
        }
        case 'ArrowLeft': {
          if (!focusedRow) break
          e.preventDefault()
          if (focusedRow.kind === 'file-header') {
            const ck = focusedRow.file.filePath ?? focusedRow.file.title
            if (!collapsed.has(ck)) toggleCollapse(ck)
          } else {
            // Jump back to the parent file header.
            const headerIdx = rowIndexByKey.get(`h:${focusedRow.fileIndex}`)
            if (headerIdx != null) focusRowAt(headerIdx)
          }
          break
        }
        case 'Enter': {
          if (!focusedRow) break
          e.preventDefault()
          if (focusedRow.kind === 'file-header') openFile(focusedRow.file)
          else void handleNavigate(focusedRow.file, focusedRow.result.lineNumber, focusedRow.result.column)
          break
        }
      }
    },
    [selected, copySelected, selectAll, allKeys, rows, focusKey, rowIndexByKey, focusRowAt, anchorKey, visibleResultKeys, collapsed, toggleCollapse, openFile, handleNavigate]
  )

  return (
    <div className="flex flex-col bg-background h-full overflow-hidden">
      <div className="flex items-center px-2.5 py-[3px] bg-background border-b border-border shrink-0 min-h-[24px]">
        <div className="flex items-center gap-2 overflow-hidden">
          {findResults && (
            <span className="text-base text-muted-foreground whitespace-nowrap truncate">
              &ldquo;{findResults.query}&rdquo; — {findResults.totalHits} hit{findResults.totalHits !== 1 ? 's' : ''} in{' '}
              {findResults.files.length} file{findResults.files.length !== 1 ? 's' : ''} · {findResults.scope}
              {findResults.searchDurationMs != null && !isSearching && (
                <>
                  {' '}
                  <span className="text-muted-foreground opacity-90">
                    · {findResults.searchEngineLabel ?? 'Search'}{' '}
                    {findResults.searchDurationMs >= 1000
                      ? `${(findResults.searchDurationMs / 1000).toFixed(2)}s`
                      : `${findResults.searchDurationMs}ms`}
                  </span>
                </>
              )}
            </span>
          )}
          {isSearching && searchProgress && (
            <span className="text-base text-primary whitespace-nowrap shrink-0">
              {searchProgress.scanned > 0
                ? `Scanning ${searchProgress.scanned} files…`
                : 'Collecting files…'}
            </span>
          )}
        </div>
      </div>

      <div
        data-testid="find-results-list"
        className="flex-1 overflow-y-auto overflow-x-hidden text-base font-mono editor-scrollbar focus:outline-none"
        ref={parentRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {!findResults || findResults.files.length === 0 ? (
          <div className="p-4 text-muted-foreground font-sans text-base">{isSearching ? 'Searching…' : 'No results.'}</div>
        ) : (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vItem) => {
                  const row = rows[vItem.index]

                  if (row.kind === 'file-header') {
                    const key = row.file.filePath ?? row.file.title
                    const isCollapsed = collapsed.has(key)
                    const isFocused = focusKey === `h:${row.fileIndex}`
                    return (
                      <div
                        key={vItem.key}
                        data-testid="find-result-header"
                        data-file-index={row.fileIndex}
                        style={{ position: 'absolute', top: vItem.start, left: 0, right: 0, height: ROW_HEIGHT_HEADER }}
                        className={cn(
                          'group flex items-center gap-1.5 px-2.5 bg-explorer cursor-pointer sticky top-0 z-[1] hover:bg-explorer-hover select-none',
                          isFocused && 'ring-1 ring-inset ring-primary/60'
                        )}
                        onClick={() => {
                          toggleCollapse(key)
                          setFocusKey(`h:${row.fileIndex}`)
                          parentRef.current?.focus({ preventScroll: true })
                        }}
                        onContextMenu={() => setCtxTarget({ kind: 'header', fileIndex: row.fileIndex })}
                        title={row.file.filePath ?? row.file.title}
                      >
                        <span className="text-base text-muted-foreground w-3 shrink-0">{isCollapsed ? '▶' : '▼'}</span>
                        <span className="text-primary font-semibold text-base truncate flex-1">{row.file.filePath ?? row.file.title}</span>
                        <span className={cn('text-muted-foreground text-base shrink-0 group-hover:hidden', isFocused && 'hidden')}>
                          ({row.hitCount} hit{row.hitCount !== 1 ? 's' : ''})
                        </span>
                        {/* VSCode-style inline actions — replace the hit badge on hover/focus */}
                        <div className={cn('items-center gap-0.5 shrink-0', isFocused ? 'flex' : 'hidden group-hover:flex')}>
                          <button
                            data-testid="find-result-open"
                            title="Open file"
                            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                            onClick={(e) => {
                              e.stopPropagation()
                              openFile(row.file)
                            }}
                          >
                            <ArrowUpRight size={16} />
                          </button>
                          <button
                            data-testid="find-result-dismiss"
                            title="Dismiss"
                            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                            onClick={(e) => {
                              e.stopPropagation()
                              dismissFile(row.fileIndex)
                            }}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    )
                  }

                  // result-line
                  const isSel = selected.has(row.key)
                  const isFocused = focusKey === row.key
                  return (
                    <div
                      key={vItem.key}
                      data-testid="find-result-line"
                      data-key={row.key}
                      style={{ position: 'absolute', top: vItem.start, left: 0, right: 0, height: ROW_HEIGHT_LINE }}
                      className={cn(
                        'flex items-baseline px-2.5 pl-[26px] cursor-pointer border-b border-transparent select-none',
                        isSel ? 'bg-primary/20' : 'hover:bg-explorer-hover',
                        isFocused && 'ring-1 ring-inset ring-primary/60'
                      )}
                      onClick={(e) => handleRowClick(e, row)}
                      onMouseDown={(e) => {
                        if (e.shiftKey) e.preventDefault()
                      }}
                      onContextMenu={() => setCtxTarget({ kind: 'line', key: row.key })}
                      title={`${row.file.filePath ?? row.file.title}:${row.result.lineNumber}:${row.result.column}`}
                    >
                      <span className="text-muted-foreground min-w-[48px] text-right mr-2 shrink-0 text-base pt-px">{row.result.lineNumber}</span>
                      <HighlightedLine
                        lineText={row.result.lineText}
                        column={row.result.column}
                        endColumn={row.result.endColumn}
                      />
                    </div>
                  )
                })}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              {(() => {
                const ctxFile =
                  ctxTarget == null
                    ? null
                    : ctxTarget.kind === 'header'
                      ? findResults.files[ctxTarget.fileIndex]
                      : findResults.files[Number(ctxTarget.key.split(':')[0])]
                return (
                  <>
                    {ctxTarget?.kind === 'line' && !selected.has(ctxTarget.key) ? (
                      <ContextMenuItem onSelect={() => copyKeys([ctxTarget.key])}>
                        Copy
                        <ContextMenuShortcut>{shortcutMod()}+C</ContextMenuShortcut>
                      </ContextMenuItem>
                    ) : (
                      <ContextMenuItem disabled={selected.size === 0} onSelect={copySelected}>
                        Copy Selected{selected.size > 0 ? ` (${selected.size})` : ''}
                        <ContextMenuShortcut>{shortcutMod()}+C</ContextMenuShortcut>
                      </ContextMenuItem>
                    )}
                    <ContextMenuItem disabled={allKeys.length === 0} onSelect={copyAll}>
                      Copy All
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={!ctxFile?.filePath}
                      onSelect={() => ctxFile?.filePath && copy(ctxFile.filePath, 'Path')}
                    >
                      Copy Path
                    </ContextMenuItem>
                    {ctxTarget?.kind === 'header' && ctxFile && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => openFile(ctxFile)}>Open File</ContextMenuItem>
                        <ContextMenuItem onSelect={() => dismissFile(ctxTarget.fileIndex)}>Dismiss</ContextMenuItem>
                      </>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem disabled={allKeys.length === 0} onSelect={selectAll}>
                      Select All
                      <ContextMenuShortcut>{shortcutMod()}+A</ContextMenuShortcut>
                    </ContextMenuItem>
                  </>
                )
              })()}
            </ContextMenuContent>
          </ContextMenu>
        )}
      </div>
    </div>
  )
}
