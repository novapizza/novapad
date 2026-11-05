import React, { useLayoutEffect, useRef, useState } from 'react'

const MAX_H = 480

interface Props {
  /** Raw Markdown of the block, LF line endings. */
  initial: string
  /** Offset from the top of the preview content, in px. */
  top: number
  /** Rendered height of the block — the box never starts smaller. */
  minHeight: number
  /** Code blocks: Enter inserts a newline and Ctrl+Enter saves. */
  multiline: boolean
  /** `fromKey` false = focus moved elsewhere, so don't pull it back. */
  onCommit: (text: string, fromKey: boolean) => void
  onCancel: () => void
  /** Ctrl+S / Ctrl+Shift+S: commit, then save the file. */
  onSave: (text: string, saveAs: boolean) => void
}

/**
 * Raw-Markdown editor laid over one preview block. Commits on Enter (or
 * Ctrl+Enter) and on blur; Escape cancels. Lives in the preview's scroll
 * content, so it scrolls with the block it edits.
 */
export function MarkdownBlockEditor({ initial, top, minHeight, multiline, onCommit, onCancel, onSave }: Props) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  // Blur fires after Enter/Escape unmount us — only the first exit counts.
  const done = useRef(false)
  const finish = (fn: () => void): void => {
    if (done.current) return
    done.current = true
    fn()
  }

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  // Grow with the content up to MAX_H, then scroll.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minHeight), MAX_H)}px`
  }, [value, minHeight])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const mod = e.ctrlKey || e.metaKey
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finish(onCancel)
    } else if (e.key === 'Enter' && (mod || (!multiline && !e.shiftKey))) {
      e.preventDefault()
      finish(() => onCommit(value, true))
    } else if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault()
      finish(() => onSave(value, e.shiftKey))
    }
  }

  return (
    <div
      data-md-block-editor
      data-own-shortcuts="*"
      style={{ top }}
      className="absolute left-0 right-0 z-10 rounded-md border-2 border-primary bg-background shadow-xl overflow-hidden"
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => finish(() => onCommit(value, false))}
        aria-label="Edit Markdown block"
        spellCheck={false}
        data-testid="md-block-editor"
        className="block w-full resize-none bg-transparent px-2.5 py-1.5 font-mono text-[13px] leading-relaxed text-foreground outline-none"
      />
      <div className="px-2.5 py-1 border-t border-border bg-secondary/30 text-[11px] text-muted-foreground">
        {multiline ? 'Ctrl+Enter save · Enter new line' : 'Enter save · Shift+Enter new line'} · Esc cancel
      </div>
    </div>
  )
}
