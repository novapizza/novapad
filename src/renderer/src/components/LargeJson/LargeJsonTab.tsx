import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Braces, Redo2, Save, Search, Undo2, X, Loader2, ListTree } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { useLargeJsonStore } from '../../store/largeJsonStore'
import { formatBytes } from '../../utils/largeFileRouting'
import { newOpId, saveLargeJson } from '../../utils/largeJsonOps'
import { useRecordPager } from './useRecordPager'
import { RecordRow, RowStatus } from './RecordRow'
import { RecordEditor } from './RecordEditor'
import { ExtractPanel } from './ExtractPanel'
import { cn } from '../../lib/utils'

const SEARCH_LIMIT = 10000
const ROW_ESTIMATE = 30

type View = 'records' | 'extract'

/**
 * Tab body for a `kind: 'largeJson'` buffer. Virtualised list of records
 * fetched by page from the worker; per-record expand (tree), edit (Monaco
 * modal) and delete; streaming search filter; Extract tab.
 */
export const LargeJsonTab: React.FC<{ bufferId: string }> = ({ bufferId }) => {
  const doc = useLargeJsonStore((s) => s.docs[bufferId])
  const buf = useEditorStore((s) => s.buffers.find((b) => b.id === bufferId))
  const applyEdit = useLargeJsonStore((s) => s.applyEdit)
  const undo = useLargeJsonStore((s) => s.undo)
  const redo = useLargeJsonStore((s) => s.redo)
  const patchDoc = useLargeJsonStore((s) => s.patchDoc)

  const [view, setView] = useState<View>('records')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<number | null>(null)
  const [searchInput, setSearchInput] = useState('')

  const docId = doc?.docId ?? null
  const version = doc?.version ?? 0
  const pager = useRecordPager(docId, version)

  // Rows = every record, or only search hits while a filter is active.
  const filtered = doc?.searchResults
  const rowCount = filtered ? filtered.length : (doc?.recordCount ?? 0)
  const indexOfRow = useCallback((row: number) => (filtered ? filtered[row] : row), [filtered])

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 12,
    getItemKey: (row) => indexOfRow(row)
  })
  const virtualItems = virtualizer.getVirtualItems()

  // Prefetch the visible pages.
  useEffect(() => {
    pager.ensure(virtualItems.map((v) => indexOfRow(v.index)))
  }, [virtualItems, pager, indexOfRow])

  // Reset local view state when the document changes identity.
  useEffect(() => {
    setExpanded(new Set())
    setEditing(null)
  }, [docId, version])

  const toggle = useCallback((index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const textFor = useCallback(
    (index: number): { text: string | undefined; status: RowStatus } => {
      const ov = doc?.overlay.get(index)
      if (doc?.overlay.has(index)) {
        if (ov === null) return { text: pager.get(index), status: 'deleted' }
        return { text: ov ?? undefined, status: 'edited' }
      }
      return { text: pager.get(index), status: 'original' }
    },
    [doc?.overlay, pager]
  )

  const runSearch = useCallback(
    async (q: string) => {
      if (!docId || !doc) return
      if (doc.searchOpId) void window.api.largeJson.cancel(docId, doc.searchOpId)
      const query = q.trim()
      if (!query) {
        patchDoc(bufferId, { searchQuery: '', searchOpId: null, searchResults: null, searchBusy: false, searchTotal: 0, searchTruncated: false })
        return
      }
      const opId = newOpId('search')
      patchDoc(bufferId, { searchQuery: query, searchOpId: opId, searchResults: [], searchBusy: true, searchTotal: 0, searchTruncated: false, searchScanned: 0 })
      const r = await window.api.largeJson.search(docId, opId, query, SEARCH_LIMIT)
      if (r.error) patchDoc(bufferId, { searchBusy: false })
    },
    [bufferId, doc, docId, patchDoc]
  )

  const clearSearch = (): void => {
    setSearchInput('')
    void runSearch('')
  }

  // Keyboard: Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) for the overlay, Ctrl+S to save.
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (editing !== null) return
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(bufferId) }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(bufferId) }
    else if (k === 's' && !e.shiftKey) { e.preventDefault(); void saveLargeJson(bufferId, null) }
  }

  const baseName = useMemo(() => (buf?.title ?? 'data.json').replace(/\.[^.]+$/, '') || 'data', [buf?.title])

  if (!doc) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-muted-foreground">
        Opening…
      </div>
    )
  }

  const pct = doc.size ? Math.min(100, Math.round((doc.bytesScanned / doc.size) * 100)) : 0
  const editCount = doc.overlay.size

  return (
    <section className="flex flex-col h-full outline-none relative" tabIndex={-1} onKeyDown={onKeyDown} data-testid="ljson-tab">
      {/* Header */}
      <header className="px-3 py-2 border-b border-border flex items-center gap-2 bg-secondary/30 flex-wrap">
        <Braces size={14} className="text-muted-foreground" />
        <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Large JSON</span>
        <span className="text-[12px] text-muted-foreground">
          {formatBytes(doc.size)}
          {doc.mode ? ` · ${doc.mode === 'array' ? 'array of records' : 'NDJSON'}` : ''}
        </span>
        <span className="text-[12px] font-semibold text-foreground" data-testid="ljson-count">
          {doc.indexing ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> Indexing… {pct}% · {doc.recordCount.toLocaleString()} records so far
            </span>
          ) : doc.indexError ? (
            <span className="text-destructive">{doc.indexError}</span>
          ) : (
            `${doc.recordCount.toLocaleString()} records`
          )}
        </span>
        {editCount > 0 && (
          <span className="text-[12px] text-primary font-semibold" data-testid="ljson-edit-count">
            {editCount.toLocaleString()} pending {editCount === 1 ? 'change' : 'changes'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={doc.undo.length === 0}
            onClick={() => undo(bufferId)}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            disabled={doc.redo.length === 0}
            onClick={() => redo(bufferId)}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Redo2 size={14} />
          </button>
          <button
            type="button"
            title="Save (Ctrl+S)"
            aria-label="Save"
            disabled={editCount === 0 || doc.saving || doc.indexing}
            onClick={() => void saveLargeJson(bufferId, null)}
            className="flex items-center gap-1 px-2 py-1 text-[12px] rounded bg-primary text-primary-foreground disabled:opacity-40"
            data-testid="ljson-save"
          >
            {doc.saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {doc.saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {/* View strip */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-secondary/10">
        {([
          { id: 'records' as View, label: 'Records', icon: ListTree },
          { id: 'extract' as View, label: 'Extract', icon: Search }
        ]).map((t) => {
          const Icon = t.icon
          const active = view === t.id
          return (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-semibold transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
              data-testid={`ljson-view-${t.id}`}
            >
              <Icon size={11} />
              {t.label}
            </button>
          )
        })}

        {view === 'records' && (
          <div className="ml-auto flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runSearch(searchInput)
                  if (e.key === 'Escape') clearSearch()
                }}
                placeholder="Filter records… (Enter)"
                spellCheck={false}
                disabled={doc.indexing}
                className="w-full pl-7 pr-7 py-1 rounded border border-border bg-background text-[12px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                data-testid="ljson-search"
              />
              {(searchInput || doc.searchQuery) && (
                <button
                  type="button"
                  aria-label="Clear filter"
                  onClick={clearSearch}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-secondary text-muted-foreground"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {doc.searchQuery && (
              <span className="text-[11px] text-muted-foreground whitespace-nowrap" data-testid="ljson-search-status">
                {doc.searchBusy ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 size={11} className="animate-spin" />
                    {doc.size ? Math.min(100, Math.round((doc.searchScanned / doc.size) * 100)) : 0}%
                  </span>
                ) : (
                  `${doc.searchTotal.toLocaleString()} match${doc.searchTotal === 1 ? '' : 'es'}${doc.searchTruncated ? ' (capped)' : ''}`
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {view === 'extract' ? (
        <div className="flex-1 min-h-0">
          <ExtractPanel docId={docId} indexing={doc.indexing} fileSize={doc.size} baseName={baseName} />
        </div>
      ) : doc.indexError && doc.recordCount === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center text-[13px] text-muted-foreground">
          {doc.indexError}
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-auto" data-testid="ljson-list">
          {rowCount === 0 && !doc.indexing && (
            <div className="p-6 text-center text-[13px] text-muted-foreground">
              {doc.searchQuery ? 'No records match.' : 'No records.'}
            </div>
          )}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualItems.map((v) => {
              const index = indexOfRow(v.index)
              const { text, status } = textFor(index)
              return (
                <div
                  key={v.key}
                  data-index={v.index}
                  ref={virtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
                >
                  <RecordRow
                    index={index}
                    text={text}
                    status={status}
                    expanded={expanded.has(index)}
                    onToggle={toggle}
                    onEdit={setEditing}
                    onDelete={(i) => applyEdit(bufferId, i, null)}
                    onRevert={(i) => applyEdit(bufferId, i, undefined)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {editing !== null && (
        <RecordEditor
          key={editing}
          index={editing}
          initialText={textFor(editing).text ?? ''}
          onApply={(t) => { applyEdit(bufferId, editing, t); setEditing(null) }}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  )
}
