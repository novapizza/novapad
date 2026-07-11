import React, { useEffect, useState } from 'react'
import { Eye, Columns2, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'
// Use the real CHANGELOG.md as the demo content, so the illustration previews
// an actual project file rather than mock text.
import changelogRaw from '../../../../../CHANGELOG.md?raw'

/**
 * Animated illustration for the "Preview buttons on the tab bar" release note.
 * Loops through the three states the buttons produce — plain source, inline
 * preview (Eye), and preview-to-the-side (Columns2) — highlighting the matching
 * tab-bar button. The document shown is a live snippet of CHANGELOG.md, in raw
 * (source) and lightly-rendered (preview) form. Honors prefers-reduced-motion.
 */

type DemoState = 'source' | 'inline' | 'side'
const CYCLE: DemoState[] = ['source', 'inline', 'side']

// A snippet of the changelog, starting at the first version heading.
const SNIPPET: string[] = (() => {
  const lines = changelogRaw.split('\n')
  const start = Math.max(0, lines.findIndex((l) => l.startsWith('## [')))
  return lines.slice(start, start + 32)
})()

/** Strip inline markdown tokens for the "rendered" view. */
function stripInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.+?)\]\([^)]+\)/g, '$1')
}

/** Raw markdown source view (monospace). */
function SourceView(): React.ReactElement {
  return (
    <div className="h-full overflow-hidden p-2 font-mono text-[10px] leading-[1.5] text-muted-foreground">
      {SNIPPET.map((line, i) => (
        <div key={i} className="whitespace-pre truncate">{line || ' '}</div>
      ))}
    </div>
  )
}

/** Lightly-rendered markdown view. */
function RenderedView(): React.ReactElement {
  return (
    <div className="h-full overflow-hidden p-2 text-[10px] leading-[1.5] space-y-0.5">
      {SNIPPET.map((line, i) => {
        if (line.startsWith('### ')) {
          return <div key={i} className="font-semibold uppercase tracking-wide text-[9px] text-muted-foreground pt-0.5">{stripInline(line.slice(4))}</div>
        }
        if (line.startsWith('## ')) {
          return <div key={i} className="font-bold text-[13px] text-primary">{stripInline(line.slice(3))}</div>
        }
        if (line.startsWith('# ')) {
          return <div key={i} className="font-bold text-sm text-foreground">{stripInline(line.slice(2))}</div>
        }
        if (/^\s*[-*] /.test(line)) {
          return (
            <div key={i} className="flex gap-1 text-foreground/90">
              <span className="text-primary">•</span>
              <span className="truncate">{stripInline(line.replace(/^\s*[-*] /, ''))}</span>
            </div>
          )
        }
        if (line.trim() === '') return <div key={i} className="h-1" />
        return <div key={i} className="truncate text-muted-foreground">{stripInline(line)}</div>
      })}
    </div>
  )
}

export function PreviewButtonsDemo(): React.ReactElement {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [idx, setIdx] = useState(reduce ? 2 : 0)

  useEffect(() => {
    if (reduce) return
    const t = setInterval(() => setIdx((i) => (i + 1) % CYCLE.length), 2100)
    return () => clearInterval(t)
  }, [reduce])

  const state = CYCLE[idx]

  return (
    <div className="mt-3 select-none rounded-lg border border-border bg-secondary/20 overflow-hidden" aria-hidden="true">
      {/* Fake tab bar */}
      <div className="flex items-stretch h-8 border-b border-border bg-secondary/30 text-xs">
        <div className="flex items-center px-3 bg-background text-foreground border-r border-border font-medium">
          CHANGELOG.md
        </div>
        <div className="flex-1" />
        <button
          className={cn(
            'w-8 flex items-center justify-center transition-colors duration-300',
            state === 'inline' ? 'text-primary bg-primary/10' : 'text-muted-foreground'
          )}
        >
          <Eye size={15} />
        </button>
        <button
          className={cn(
            'w-8 flex items-center justify-center transition-colors duration-300',
            state === 'side' ? 'text-primary bg-primary/10' : 'text-muted-foreground'
          )}
        >
          <Columns2 size={15} />
        </button>
        <button className="w-8 flex items-center justify-center text-muted-foreground border-l border-border">
          <Plus size={15} />
        </button>
      </div>

      {/* Content area — crossfades between the three states */}
      <div className="relative h-64 bg-background">
        {state === 'source' && (
          <div key="source" className="absolute inset-0 animate-in fade-in duration-500">
            <SourceView />
          </div>
        )}
        {state === 'inline' && (
          <div key="inline" className="absolute inset-0 animate-in fade-in duration-500">
            <RenderedView />
          </div>
        )}
        {state === 'side' && (
          <div key="side" className="absolute inset-0 flex animate-in fade-in duration-500">
            <div className="w-1/2 border-r border-border overflow-hidden">
              <SourceView />
            </div>
            <div className="w-1/2 overflow-hidden">
              <RenderedView />
            </div>
          </div>
        )}
      </div>

      {/* Caption */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground">
        <span className={cn('transition-colors', state === 'inline' && 'text-primary')}>Preview (in tab)</span>
        <span>·</span>
        <span className={cn('transition-colors', state === 'side' && 'text-primary')}>Preview to the Side</span>
      </div>
    </div>
  )
}
