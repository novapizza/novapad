import React, { memo, useMemo } from 'react'
import { ChevronDown, ChevronRight, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { JsonTreeNode } from '../JsonPreview/shared'
import { cn } from '../../lib/utils'

export type RowStatus = 'original' | 'edited' | 'deleted'

interface Props {
  index: number
  /** Raw record text after the overlay is applied; undefined while loading. */
  text: string | undefined
  status: RowStatus
  expanded: boolean
  onToggle: (index: number) => void
  onEdit: (index: number) => void
  onDelete: (index: number) => void
  onRevert: (index: number) => void
}

const PREVIEW_CHARS = 160

function preview(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ')
  return oneLine.length > PREVIEW_CHARS ? oneLine.slice(0, PREVIEW_CHARS) + '…' : oneLine
}

export const RecordRow = memo(function RecordRow({ index, text, status, expanded, onToggle, onEdit, onDelete, onRevert }: Props) {
  const parsed = useMemo(() => {
    if (!expanded || text === undefined) return { value: undefined as unknown, error: null as string | null }
    try {
      return { value: JSON.parse(text) as unknown, error: null }
    } catch (e) {
      return { value: undefined, error: e instanceof Error ? e.message : 'Parse error' }
    }
  }, [expanded, text])

  const deleted = status === 'deleted'
  return (
    <div
      className={cn('border-b border-border/60', deleted && 'opacity-50')}
      data-testid="ljson-row"
      data-record-index={index}
      data-record-status={status}
    >
      <div className="flex items-center gap-1 pr-2 group hover:bg-secondary/40">
        <button
          type="button"
          aria-expanded={expanded}
          className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1 text-left"
          onClick={() => onToggle(index)}
        >
          <span className="text-foreground/60 shrink-0">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className="text-[11px] font-mono text-muted-foreground w-[7ch] shrink-0 text-right tabular-nums">
            {index.toLocaleString()}
          </span>
          {status === 'edited' && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary shrink-0">edited</span>
          )}
          {deleted && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive shrink-0">deleted</span>
          )}
          <span className={cn('text-[12px] font-mono truncate text-foreground/90', deleted && 'line-through')}>
            {text === undefined ? <span className="italic text-muted-foreground">loading…</span> : preview(text)}
          </span>
        </button>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
          {status !== 'original' && (
            <button
              type="button"
              title="Revert to original"
              aria-label="Revert record"
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
              onClick={() => onRevert(index)}
            >
              <RotateCcw size={13} />
            </button>
          )}
          {!deleted && (
            <button
              type="button"
              title="Edit record"
              aria-label="Edit record"
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(index)}
            >
              <Pencil size={13} />
            </button>
          )}
          {!deleted && (
            <button
              type="button"
              title="Delete record"
              aria-label="Delete record"
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(index)}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="pl-8 pr-2 pb-2">
          {text === undefined ? (
            <div className="text-[12px] italic text-muted-foreground py-1">Loading…</div>
          ) : parsed.error ? (
            <div className="text-[12px] text-destructive py-1 font-mono">Invalid JSON: {parsed.error}</div>
          ) : (
            <JsonTreeNode value={parsed.value} depth={0} autoExpand />
          )}
        </div>
      )}
    </div>
  )
})
