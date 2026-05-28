import React, { useMemo, useState } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronRight } from 'lucide-react'
import { computeDiff, countDiffStats, type DiffEntry } from '../../utils/jsonTools'
import { useEditorStore } from '../../store/editorStore'
import { ErrorRow } from './shared'

export function DiffTab({ content }: { content: string }) {
  const [otherText, setOtherText] = useState('')
  const [otherSource, setOtherSource] = useState<'paste' | string>('paste')
  const [swap, setSwap] = useState(false)

  // Buffers that COULD be the "B" side — any open JSON file other than the
  // active one (which is what `content` already mirrors).
  const buffers = useEditorStore((s) => s.buffers)
  const activeId = useEditorStore((s) => s.activeId)
  const candidateBuffers = useMemo(
    () => buffers.filter((b) => b.kind === 'file' && b.id !== activeId && b.language === 'json'),
    [buffers, activeId]
  )

  const otherContent = useMemo(() => {
    if (otherSource === 'paste') return otherText
    const buf = buffers.find((b) => b.id === otherSource)
    return buf?.model?.getValue() ?? buf?.content ?? ''
  }, [otherSource, otherText, buffers])

  const { entries, error } = useMemo(() => {
    if (!content.trim() || !otherContent.trim()) {
      return { entries: null as DiffEntry[] | null, error: null as string | null }
    }
    try {
      const a = JSON.parse(swap ? otherContent : content)
      const b = JSON.parse(swap ? content : otherContent)
      return { entries: computeDiff(a, b), error: null }
    } catch (e) {
      return { entries: null, error: e instanceof Error ? e.message : 'Invalid JSON' }
    }
  }, [content, otherContent, swap])

  const stats = entries ? countDiffStats(entries) : null

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border bg-secondary/10 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={otherSource}
            onChange={(e) => setOtherSource(e.target.value)}
            className="text-[12px] px-2 py-1 rounded border border-border bg-background"
          >
            <option value="paste">Paste B below…</option>
            {candidateBuffers.map((b) => (
              <option key={b.id} value={b.id}>
                Compare with: {b.title}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSwap((s) => !s)}
            title="Swap A and B"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-secondary hover:bg-secondary/80"
          >
            <ArrowLeftRight size={11} /> {swap ? 'A↔B (swapped)' : 'Swap'}
          </button>
        </div>
        {otherSource === 'paste' && (
          <textarea
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Paste JSON to compare against the current buffer…"
            spellCheck={false}
            className="w-full h-24 resize-none rounded border border-border bg-background px-2 py-1.5 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}
      </div>
      {error && <ErrorRow msg={`Invalid JSON: ${error}`} />}
      {stats && (
        <div className="px-3 py-1.5 text-[12px] border-b border-border flex items-center gap-3 bg-secondary/5">
          <span className="font-bold">
            {stats.added + stats.removed + stats.changed} difference{stats.added + stats.removed + stats.changed !== 1 ? 's' : ''}
          </span>
          <span className="text-emerald-500">+{stats.added}</span>
          <span className="text-red-500">-{stats.removed}</span>
          <span className="text-amber-500">~{stats.changed}</span>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {entries === null ? (
          <p className="p-3 text-[13px] text-muted-foreground italic">
            {otherSource === 'paste'
              ? 'Paste a second JSON document above to see the diff.'
              : 'Pick another open JSON tab above.'}
          </p>
        ) : entries.length === 0 ? (
          <p className="p-3 text-[13px] text-emerald-500 font-semibold">JSON documents are identical.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {entries.map((entry, i) => (
              <DiffRow key={i} entry={entry} depth={0} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DiffRow({ entry, depth }: { entry: DiffEntry; depth: number }) {
  // Collapse deep diffs by default — top two levels expanded so changes are
  // visible at a glance; nested children stay collapsed until clicked to keep
  // big diffs from rendering thousands of rows up front.
  const [expanded, setExpanded] = useState(depth < 2)
  const indent = depth * 16 + 8

  const formatVal = (v: unknown) => {
    if (typeof v === 'object' && v !== null) {
      const s = JSON.stringify(v)
      return s.length > 80 ? s.slice(0, 80) + '…' : s
    }
    return JSON.stringify(v)
  }

  if (entry.type === 'nested') {
    return (
      <div>
        <div
          className="flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-secondary/50 text-[13px] font-mono"
          onClick={() => setExpanded(!expanded)}
          style={{ paddingLeft: indent }}
        >
          <span className="text-muted-foreground">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
          <span className="text-primary font-bold">&quot;{entry.key}&quot;</span>
          <span className="text-muted-foreground ml-1">{`{ changes inside }`}</span>
        </div>
        {expanded && entry.children?.map((child, i) => <DiffRow key={i} entry={child} depth={depth + 1} />)}
      </div>
    )
  }

  const colorCls =
    entry.type === 'added'
      ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500 text-emerald-600 dark:text-emerald-400'
      : entry.type === 'removed'
        ? 'bg-red-500/10 border-l-2 border-l-red-500 text-red-600 dark:text-red-400'
        : 'bg-amber-500/10 border-l-2 border-l-amber-500 text-amber-600 dark:text-amber-400'

  return (
    <div className={`py-1 px-2 text-[13px] font-mono ${colorCls}`} style={{ paddingLeft: indent }}>
      <span className="font-bold">&quot;{entry.key}&quot;</span>
      {entry.type === 'changed' && (
        <span className="ml-2">
          <span className="line-through opacity-70">{formatVal(entry.oldVal)}</span>
          <span className="mx-1.5 text-muted-foreground">→</span>
          <span>{formatVal(entry.newVal)}</span>
        </span>
      )}
      {entry.type === 'added' && <span className="ml-2">{formatVal(entry.newVal)}</span>}
      {entry.type === 'removed' && <span className="ml-2 line-through opacity-70">{formatVal(entry.oldVal)}</span>}
    </div>
  )
}

export default DiffTab
