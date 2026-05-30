import React, { useCallback, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'

/** Copy-to-clipboard with a transient "copied" flash, shared by every tool panel. */
export function useCopy(): { copy: (text: string, toastLabel?: string) => void; copiedKey: string | null } {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copy = useCallback((text: string, toastLabel?: string) => {
    if (!text) return
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopiedKey(text)
        setTimeout(() => setCopiedKey((k) => (k === text ? null : k)), 1500)
        if (toastLabel) useUIStore.getState().addToast(`${toastLabel} copied`, 'info')
      },
      () => useUIStore.getState().addToast('Could not access the clipboard', 'error')
    )
  }, [])
  return { copy, copiedKey }
}

/** Small icon-only copy button bound to a useCopy() instance. */
export function CopyButton({
  value,
  copy,
  copiedKey,
  title = 'Copy',
  toastLabel
}: {
  value: string
  copy: (text: string, toastLabel?: string) => void
  copiedKey: string | null
  title?: string
  toastLabel?: string
}): React.ReactElement {
  const isCopied = copiedKey === value && !!value
  return (
    <button
      type="button"
      onClick={() => copy(value, toastLabel)}
      disabled={!value}
      title={title}
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40 transition-colors"
    >
      {isCopied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
      {isCopied ? 'Copied' : 'Copy'}
    </button>
  )
}

/** Section title used in tool panels. */
export function ToolSection({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }): React.ReactElement {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        {right}
      </div>
      {children}
    </section>
  )
}

/** A labelled read-only output row with a copy button. */
export function OutputField({
  label,
  value,
  mono = true,
  copy,
  copiedKey
}: {
  label: string
  value: string
  mono?: boolean
  copy: (text: string, toastLabel?: string) => void
  copiedKey: string | null
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className={`flex-1 min-w-0 rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground ${mono ? 'font-mono' : ''}`}
      />
      <CopyButton value={value} copy={copy} copiedKey={copiedKey} toastLabel={label} />
    </div>
  )
}

/** Segmented button group for choosing one of a small set of options. */
export function SegGroup<T extends string>({
  options,
  value,
  onChange
}: {
  options: { id: T; label: string; desc?: string }[]
  value: T
  onChange: (v: T) => void
}): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          title={opt.desc}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            value === opt.id
              ? 'border-primary bg-primary/10 text-primary font-medium'
              : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** Standard textarea styled with theme tokens. */
export function ToolTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>): React.ReactElement {
  const { className, ...rest } = props
  return (
    <textarea
      {...rest}
      className={`w-full rounded border border-input bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-y ${className ?? ''}`}
    />
  )
}

/** Read-only output block (monospace, wraps). */
export function OutputBlock({ value, placeholder }: { value: string; placeholder?: string }): React.ReactElement {
  return (
    <pre className="min-h-[120px] max-h-[50vh] overflow-auto rounded border border-border bg-muted/40 p-3 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
      {value || <span className="text-muted-foreground">{placeholder ?? 'Output appears here'}</span>}
    </pre>
  )
}
