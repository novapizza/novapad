import React, { useMemo, useState } from 'react'
import { AlertCircle, Check, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { highlightJson } from '../../utils/jsonTools'

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        if (!text) return
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      disabled={!text}
      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-secondary hover:bg-secondary/80 text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function ErrorRow({ msg }: { msg: string }) {
  return (
    <div className="mx-3 mt-2 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded text-destructive text-[13px] flex items-start gap-2">
      <AlertCircle size={12} className="mt-0.5 shrink-0" />
      <span className="font-medium break-words">{msg}</span>
    </div>
  )
}

// Skip syntax highlighting beyond this size — the tokenizer produces ~3× the
// input as HTML, then dangerouslySetInnerHTML has to parse it. For an 18 MB
// pretty-printed payload that's 50+ MB of HTML, which freezes the renderer.
// Plain <pre> handles multi-MB text fine, so we fall back to that.
export const HIGHLIGHT_MAX_BYTES = 500_000

export function HighlightedJsonOutput({ value }: { value: string }) {
  const html = useMemo(() => {
    if (!value || value.length > HIGHLIGHT_MAX_BYTES) return null
    return highlightJson(value)
  }, [value])
  if (!value) {
    return <p className="text-muted-foreground text-[13px] italic">{'// Output will appear here…'}</p>
  }
  if (html === null) {
    return (
      <>
        <p className="text-[11px] text-muted-foreground italic mb-1">
          {`Highlighting disabled — payload is ${(value.length / 1024 / 1024).toFixed(1)} MB.`}
        </p>
        <pre className="font-mono text-[13px] whitespace-pre-wrap leading-relaxed text-foreground">
          {value}
        </pre>
      </>
    )
  }
  return (
    <pre
      className="font-mono text-[13px] whitespace-pre-wrap leading-relaxed text-foreground"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// Lazy/collapsing tree renderer for the Format tab. Nodes beyond depth 2 start
// collapsed so a 10k-key payload doesn't try to render 10k DOM rows up front.
// Ported from exifmaster-pro/components/JsonTools.tsx (TreeNode).
function primitiveColorClass(value: unknown): string {
  if (value === null) return 'text-muted-foreground'
  if (typeof value === 'string') return 'text-emerald-500 dark:text-emerald-400'
  if (typeof value === 'number') return 'text-orange-500 dark:text-orange-400'
  if (typeof value === 'boolean') return 'text-purple-500 dark:text-purple-400'
  return 'text-muted-foreground'
}

// Cap the number of child rows mounted at once. A 50k-item array would
// otherwise create 50k <div>s on first expand — even as collapsed
// placeholders that locks up the renderer. Users page through with the
// "Show N more" button below.
const TREE_PAGE_SIZE = 100

// Auto-expansion follows a "single-child spine": a node opens by default only
// when its parent is open AND has exactly one container child (i.e. there are
// no siblings competing for attention). The root always opens. Once we hit a
// container with multiple children (e.g. an array of records), every child
// stays collapsed so we don't render thousands of placeholder rows on first
// paint — clicking a chevron is required to drill further.
export function JsonTreeNode({
  keyName, value, depth, autoExpand = true,
}: { keyName?: string | number; value: unknown; depth: number; autoExpand?: boolean }) {
  const [expanded, setExpanded] = useState(autoExpand)
  const [visibleCount, setVisibleCount] = useState(TREE_PAGE_SIZE)
  const isObj = typeof value === 'object' && value !== null
  const isArr = Array.isArray(value)

  const keyLabel = keyName !== undefined ? (
    <span className="text-blue-600 dark:text-blue-400 text-[13px] font-mono mr-1">
      {typeof keyName === 'number' ? keyName : `"${keyName}"`}:
    </span>
  ) : null

  if (!isObj) {
    return (
      <div className="flex items-baseline gap-1 py-0.5 pl-1">
        {keyLabel}
        <span className={`text-[13px] font-mono ${primitiveColorClass(value)}`}>
          {JSON.stringify(value)}
        </span>
      </div>
    )
  }

  const entries = Object.entries(value as Record<string, unknown>)
  const openBrace = isArr ? '[' : '{'
  const closeBrace = isArr ? ']' : '}'
  const preview = isArr ? `${entries.length} items` : `${entries.length} keys`
  // Pass autoExpand=true to children only when there's exactly one — that's
  // the spine rule. Branches (multi-key objects, arrays of records) stop.
  const childAutoExpand = entries.length === 1
  const visibleEntries = entries.slice(0, visibleCount)
  const remaining = entries.length - visibleEntries.length

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse' : 'Expand'}
        className="flex items-center gap-1 py-0.5 px-1 cursor-pointer hover:bg-secondary/50 rounded group w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-foreground/70 group-hover:text-primary transition-colors shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        {keyLabel}
        <span className="text-foreground text-[13px] font-mono">{openBrace}</span>
        {!expanded && <span className="text-muted-foreground text-[13px] ml-1 italic">{preview}</span>}
        {!expanded && <span className="text-foreground text-[13px] font-mono">{closeBrace}</span>}
      </button>
      {expanded && (
        <div className="ml-3 border-l border-border/60 pl-2">
          {visibleEntries.map(([k, v]) => (
            <JsonTreeNode
              key={k}
              keyName={isArr ? Number(k) : k}
              value={v}
              depth={depth + 1}
              autoExpand={childAutoExpand}
            />
          ))}
          {remaining > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setVisibleCount((c) => c + TREE_PAGE_SIZE)
              }}
              className="text-[12px] text-primary hover:underline italic py-0.5 pl-1 cursor-pointer"
            >
              {`Show ${Math.min(remaining, TREE_PAGE_SIZE)} more (${remaining.toLocaleString()} hidden)`}
            </button>
          )}
          <div className="text-foreground text-[13px] font-mono py-0.5 pl-1">{closeBrace}</div>
        </div>
      )}
    </div>
  )
}
