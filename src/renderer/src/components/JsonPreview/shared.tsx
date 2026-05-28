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

// A single navigable search hit. Each match is identified by the entry it
// lives in (`parent` + `key`) and whether the matching characters are on the
// key side or the value side (`kind`). The ancestor chain is captured at
// collection time so callers can force-expand exactly the path needed to
// reveal this match without expanding unrelated siblings.
export type JsonMatch = {
  ancestors: object[]
  parent: object
  key: string | number
  kind: 'key' | 'value'
}

// Depth-first, pre-order walk that returns an ordered list of search hits.
// Document order is what users expect when stepping through matches with the
// next/prev buttons. Key matches are emitted before the value-side check on
// the same entry so an entry whose key AND value both match yields two hits
// adjacent in the list. `needle` must already be lower-cased by the caller.
export function collectMatches(root: unknown, needle: string): JsonMatch[] {
  const matches: JsonMatch[] = []
  if (!needle || root === null || typeof root !== 'object') return matches
  function walk(v: unknown, chain: object[], parent: object | null, key: string | number | null) {
    if (parent !== null && key !== null && typeof key === 'string' && key.toLowerCase().includes(needle)) {
      matches.push({ ancestors: chain.slice(), parent, key, kind: 'key' })
    }
    if (v === null || typeof v !== 'object') {
      if (parent !== null && key !== null) {
        const s = v === null ? 'null' : typeof v === 'string' ? v : String(v)
        if (s.toLowerCase().includes(needle)) {
          matches.push({ ancestors: chain.slice(), parent, key, kind: 'value' })
        }
      }
      return
    }
    const container = v as object
    const nextChain = chain
    nextChain.push(container)
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) walk(v[i], nextChain, container, i)
    } else {
      for (const [k, vv] of Object.entries(v as Record<string, unknown>)) walk(vv, nextChain, container, k)
    }
    nextChain.pop()
  }
  walk(root, [], null, null)
  return matches
}

// Wraps every case-insensitive occurrence of `needle` inside `text` with a
// <mark> span. Returns the plain string when there's no needle so the common
// non-search render path stays allocation-free.
export function highlightText(text: string, needle: string): React.ReactNode {
  if (!needle) return text
  const lower = text.toLowerCase()
  const parts: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i <= text.length) {
    const idx = lower.indexOf(needle, i)
    if (idx === -1) {
      if (i < text.length) parts.push(text.slice(i))
      break
    }
    if (idx > i) parts.push(text.slice(i, idx))
    parts.push(
      <mark
        key={key++}
        className="bg-yellow-300 dark:bg-yellow-500/50 text-foreground rounded px-0.5"
      >
        {text.slice(idx, idx + needle.length)}
      </mark>
    )
    i = idx + needle.length
  }
  return <>{parts}</>
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
// DOM id for the currently focused search hit. FormatTab uses this id to
// scrollIntoView after the tree re-renders following a next/prev step. The
// id is global because at most one match is "active" at a time.
export const ACTIVE_MATCH_DOM_ID = 'json-active-match'

export type ActiveMatchKey = {
  parent: object | null
  key: string | number
  kind: 'key' | 'value'
}

export function JsonTreeNode({
  keyName,
  value,
  depth,
  autoExpand = true,
  search = '',
  forceExpandSet,
  activeKey,
  parentRef = null,
}: {
  keyName?: string | number
  value: unknown
  depth: number
  autoExpand?: boolean
  // Lower-cased search needle. Used purely for highlighting every needle
  // occurrence inside the displayed key/value strings — does not affect
  // expand/collapse on its own (force-expand is driven by forceExpandSet,
  // which holds the ancestors of the currently active match).
  search?: string
  // Containers (object/array refs) that should force-expand because they
  // lie on the path to the active match. Empty/undefined when no match is
  // active.
  forceExpandSet?: Set<object>
  // The currently focused match — used to tag a single row with the active
  // DOM id and a focus ring so FormatTab can scrollIntoView.
  activeKey?: ActiveMatchKey | null
  // Immediate parent container ref, forwarded by the parent recursion. Used
  // to identify whether this entry is the active match (parent + key must
  // both match).
  parentRef?: object | null
}) {
  const [expanded, setExpanded] = useState(autoExpand)
  const [visibleCount, setVisibleCount] = useState(TREE_PAGE_SIZE)
  const isObj = typeof value === 'object' && value !== null
  const isArr = Array.isArray(value)

  const searchActive = search.length > 0
  const inMatchPath = isObj && !!forceExpandSet?.has(value as object)
  // Force-expand wins over the local toggle while a path-to-active-match
  // node is reached so the active hit is always visible. Clear the search
  // (or step away) to collapse again.
  const effectiveExpanded = inMatchPath || expanded
  // This row is the active match when its parent + entry key both match the
  // navigated location. Both key-side and value-side matches at the same
  // entry land on the same DOM row, which is what we want for scroll-to.
  const isActive = !!activeKey
    && activeKey.parent === parentRef
    && activeKey.key === keyName

  const keyText = keyName === undefined ? null : (typeof keyName === 'number' ? String(keyName) : `"${keyName}"`)
  const keyLabel = keyText !== null ? (
    <span className="text-blue-600 dark:text-blue-400 text-[13px] font-mono mr-1">
      {searchActive && typeof keyName === 'string' ? highlightText(keyText, search) : keyText}:
    </span>
  ) : null

  if (!isObj) {
    const rendered = JSON.stringify(value)
    return (
      <div
        id={isActive ? ACTIVE_MATCH_DOM_ID : undefined}
        className={
          'flex items-baseline gap-1 py-0.5 pl-1 ' +
          (isActive ? 'ring-2 ring-primary rounded' : '')
        }
      >
        {keyLabel}
        <span className={`text-[13px] font-mono ${primitiveColorClass(value)}`}>
          {searchActive ? highlightText(rendered, search) : rendered}
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
  // When this container sits on the path to the active match, find which
  // child index needs to be visible and bump pagination past it. Cheap O(N)
  // scan only walks while inMatchPath is true and the active match's next
  // step lies inside this container; untouched subtrees take the short path.
  let lastMatchIdx = -1
  if (inMatchPath && activeKey) {
    // The next ancestor on the path is the child whose value is in
    // forceExpandSet (interior container on the path) or the leaf whose
    // (parent, key) matches activeKey (the active match itself).
    for (let i = 0; i < entries.length; i++) {
      const [k, v] = entries[i]
      const entryKey: string | number = isArr ? Number(k) : k
      if (activeKey.parent === value && activeKey.key === entryKey) {
        lastMatchIdx = i
        break
      }
      if (v !== null && typeof v === 'object' && forceExpandSet?.has(v as object)) {
        lastMatchIdx = i
        break
      }
    }
  }
  const effectiveVisibleCount = Math.max(visibleCount, lastMatchIdx + 1)
  const visibleEntries = entries.slice(0, effectiveVisibleCount)
  const remaining = entries.length - visibleEntries.length

  return (
    <div>
      <button
        type="button"
        aria-expanded={effectiveExpanded}
        aria-label={effectiveExpanded ? 'Collapse' : 'Expand'}
        id={isActive ? ACTIVE_MATCH_DOM_ID : undefined}
        className={
          'flex items-center gap-1 py-0.5 px-1 cursor-pointer hover:bg-secondary/50 rounded group w-full text-left ' +
          (isActive ? 'ring-2 ring-primary' : '')
        }
        onClick={() => setExpanded(!effectiveExpanded)}
      >
        <span className="text-foreground/70 group-hover:text-primary transition-colors shrink-0">
          {effectiveExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        {keyLabel}
        <span className="text-foreground text-[13px] font-mono">{openBrace}</span>
        {!effectiveExpanded && <span className="text-muted-foreground text-[13px] ml-1 italic">{preview}</span>}
        {!effectiveExpanded && <span className="text-foreground text-[13px] font-mono">{closeBrace}</span>}
      </button>
      {effectiveExpanded && (
        <div className="ml-3 border-l border-border/60 pl-2">
          {visibleEntries.map(([k, v]) => (
            <JsonTreeNode
              key={k}
              keyName={isArr ? Number(k) : k}
              value={v}
              depth={depth + 1}
              autoExpand={childAutoExpand}
              search={search}
              forceExpandSet={forceExpandSet}
              activeKey={activeKey}
              parentRef={value as object}
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
