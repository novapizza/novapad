import React, { useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { HASH_ALGOS, hashFromFiles, type HashAlgo } from '../../../lib/tools/hashActions'
import { CopyButton, OutputField, SegGroup, ToolSection, ToolTextarea, useCopy } from '../shared'

type Mode = 'text' | 'files'
interface FileResult {
  path: string
  name: string
  size: number
  hex: string | null
  error: string | null
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function HashPanel(): React.ReactElement {
  const toolArgs = useUIStore((s) => s.toolArgs)
  const presetAlgo = (toolArgs?.algo as HashAlgo) ?? 'sha256'
  const presetMode = (toolArgs?.mode as Mode) ?? 'text'
  const presetFiles = (toolArgs?.files as FileResult[] | undefined) ?? []

  const [algo, setAlgo] = useState<HashAlgo>(presetAlgo)
  const [mode, setMode] = useState<Mode>(presetMode)
  const [input, setInput] = useState('')
  const [digests, setDigests] = useState<Record<string, string>>({})
  const { copy, copiedKey } = useCopy()

  // Re-sync when the panel is (re)opened from a menu verb with new args.
  useEffect(() => {
    setAlgo(presetAlgo)
    setMode(presetMode)
  }, [toolArgs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hash the text for all four algorithms whenever the input changes.
  useEffect(() => {
    let cancelled = false
    if (mode !== 'text') return
    if (!input) {
      setDigests({})
      return
    }
    void Promise.all(HASH_ALGOS.map((a) => window.api.tools.hash(a.id, input).then((r) => [a.id, r.hex ?? ''] as const))).then(
      (pairs) => {
        if (!cancelled) setDigests(Object.fromEntries(pairs))
      }
    )
    return () => {
      cancelled = true
    }
  }, [input, mode])

  // File results only ever arrive via the menu verb / "Choose files…" (both
  // re-open the tool with fresh toolArgs), so they come straight from args.
  const files = presetFiles
  const selectedDigest = digests[algo] ?? ''
  const allText = useMemo(
    () => HASH_ALGOS.map((a) => `${a.label}: ${digests[a.id] ?? ''}`).join('\n'),
    [digests]
  )

  return (
    <div className="space-y-5">
      <ToolSection title="Algorithm">
        <SegGroup options={HASH_ALGOS} value={algo} onChange={setAlgo} />
      </ToolSection>

      <ToolSection title="Source">
        <div className="flex items-center gap-2">
          <SegGroup
            options={[
              { id: 'text' as Mode, label: 'Text' },
              { id: 'files' as Mode, label: 'Files' }
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === 'files' && (
            <button
              type="button"
              onClick={() => void hashFromFiles(algo)}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-secondary transition-colors"
            >
              Choose files…
            </button>
          )}
        </div>
      </ToolSection>

      {mode === 'text' ? (
        <>
          <ToolSection title="Input">
            <ToolTextarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type or paste text to hash…" />
          </ToolSection>
          <ToolSection
            title={`Selected — ${HASH_ALGOS.find((a) => a.id === algo)?.label}`}
            right={<CopyButton value={selectedDigest} copy={copy} copiedKey={copiedKey} toastLabel="Digest" />}
          >
            <input
              readOnly
              value={selectedDigest}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="Digest appears here"
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm font-mono text-foreground"
            />
          </ToolSection>
          <ToolSection title="All algorithms" right={<CopyButton value={allText} copy={copy} copiedKey={copiedKey} toastLabel="All digests" />}>
            <div className="space-y-1.5">
              {HASH_ALGOS.map((a) => (
                <OutputField key={a.id} label={a.label} value={digests[a.id] ?? ''} copy={copy} copiedKey={copiedKey} />
              ))}
            </div>
          </ToolSection>
        </>
      ) : (
        <ToolSection title={`Files — ${files.length}`}>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No files yet. Click <span className="text-foreground">Choose files…</span> to hash one or more files.
            </p>
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.path} className="rounded border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground" title={f.path}>
                      {f.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.size)}</span>
                  </div>
                  {f.error ? (
                    <p className="mt-1 text-xs text-destructive">{f.error}</p>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{f.hex}</code>
                      <CopyButton value={f.hex ?? ''} copy={copy} copiedKey={copiedKey} toastLabel="Digest" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ToolSection>
      )}
    </div>
  )
}
