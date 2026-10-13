import React, { useEffect, useRef, useState } from 'react'
import { Search, Download, Square } from 'lucide-react'
import { CopyButton, ErrorRow } from '../JsonPreview/shared'
import { newOpId, onExtractChunk } from '../../utils/largeJsonOps'
import { useUIStore } from '../../store/uiStore'
import { formatBytes } from '../../utils/largeFileRouting'

const PREVIEW_LIMIT = 1000

interface Props {
  docId: string | null
  indexing: boolean
  fileSize: number
  baseName: string
}

/**
 * Streaming dot-path extraction over every record. Shows the first
 * PREVIEW_LIMIT values inline with a running count; the full result set can
 * be exported to a file without ever passing through the renderer.
 */
export const ExtractPanel: React.FC<Props> = ({ docId, indexing, fileSize, baseName }) => {
  const [path, setPath] = useState('')
  const [format, setFormat] = useState<'plain' | 'json'>('plain')
  const [items, setItems] = useState<string[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [scanned, setScanned] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const opRef = useRef<string | null>(null)
  const addToast = useUIStore((s) => s.addToast)

  useEffect(() => () => {
    if (opRef.current && docId) void window.api.largeJson.cancel(docId, opRef.current)
  }, [docId])

  const run = async (): Promise<void> => {
    if (!docId || !path.trim() || busy) return
    const opId = newOpId('extract')
    opRef.current = opId
    setItems([])
    setTotal(null)
    setScanned(0)
    setError(null)
    setBusy(true)
    onExtractChunk(opId, (m) => {
      if (opRef.current !== opId) return
      if (m.items.length) setItems((prev) => prev.concat(m.items as string[]))
      setScanned(m.scanned)
      if (m.done) {
        setTotal(m.total)
        setBusy(false)
        if (m.error && m.error !== 'cancelled') setError(m.error)
        opRef.current = null
      }
    })
    const r = await window.api.largeJson.extract(docId, opId, path.trim(), PREVIEW_LIMIT)
    if (r.error) {
      setBusy(false)
      setError(r.error)
      opRef.current = null
    }
  }

  const cancel = (): void => {
    if (docId && opRef.current) void window.api.largeJson.cancel(docId, opRef.current)
    setBusy(false)
    opRef.current = null
  }

  const exportToFile = async (): Promise<void> => {
    if (!docId || !path.trim() || exporting) return
    const ext = format === 'json' ? 'json' : 'txt'
    const safePath = path.trim().replace(/[^\w.-]+/g, '_')
    const res = await window.api.file.saveDialog(`${baseName}.${safePath}.${ext}`, ext)
    if (res.canceled || !res.filePath) return
    setExporting(true)
    const r = await window.api.largeJson.extractToFile(docId, path.trim(), res.filePath, format)
    setExporting(false)
    if (r.error) addToast(`Export failed: ${r.error}`, 'error')
    else addToast(`Exported ${r.count.toLocaleString()} value${r.count === 1 ? '' : 's'}.`, 'info')
  }

  const output = format === 'json'
    ? '[\n' + items.map((s) => '  ' + s).join(',\n') + '\n]'
    : items.join('\n')

  return (
    <div className="flex flex-col h-full" data-testid="ljson-extract">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/10 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void run() }}
            placeholder="user.email  ·  Enter to run over every record"
            spellCheck={false}
            disabled={indexing}
            className="w-full pl-7 pr-2 py-1 rounded border border-border bg-background text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            data-testid="ljson-extract-path"
          />
        </div>
        <div className="flex bg-secondary rounded p-0.5 gap-0.5">
          {(['plain', 'json'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={
                'px-2 py-0.5 text-[11px] font-bold rounded transition-colors ' +
                (format === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
              }
            >
              {f === 'plain' ? 'Plain' : 'JSON'}
            </button>
          ))}
        </div>
        {busy ? (
          <button type="button" onClick={cancel} className="flex items-center gap-1 px-2 py-1 text-[12px] rounded border border-border hover:bg-secondary">
            <Square size={11} /> Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void run()}
            disabled={indexing || !path.trim()}
            className="px-3 py-1 text-[12px] rounded bg-primary text-primary-foreground disabled:opacity-50"
            data-testid="ljson-extract-run"
          >
            Run
          </button>
        )}
        <CopyButton text={output} />
        <button
          type="button"
          onClick={() => void exportToFile()}
          disabled={indexing || !path.trim() || exporting}
          title="Stream every matching value to a file"
          className="flex items-center gap-1 px-2 py-1 text-[12px] rounded border border-border hover:bg-secondary disabled:opacity-50"
        >
          <Download size={12} /> {exporting ? 'Exporting…' : 'Export to file'}
        </button>
      </div>

      {(busy || total !== null) && (
        <div className="px-3 py-1 text-[12px] border-b border-border flex items-center gap-3">
          {busy && (
            <span className="text-muted-foreground">
              Scanning… {fileSize ? Math.min(100, Math.round((scanned / fileSize) * 100)) : 0}%
            </span>
          )}
          {total !== null && (
            <span className="text-primary font-semibold" data-testid="ljson-extract-count">
              {total.toLocaleString()} {total === 1 ? 'value' : 'values'} found
              {total > PREVIEW_LIMIT ? ` · showing first ${PREVIEW_LIMIT.toLocaleString()}` : ''}
            </span>
          )}
          {total !== null && total > PREVIEW_LIMIT && (
            <span className="text-muted-foreground">Use “Export to file” for the full set ({formatBytes(fileSize)} scan).</span>
          )}
        </div>
      )}
      {error && <ErrorRow msg={error} />}

      <pre className="flex-1 overflow-auto p-3 text-[12px] font-mono whitespace-pre-wrap break-words" data-testid="ljson-extract-output">
        {items.length === 0 && !busy && total === null ? (
          <span className="text-muted-foreground italic">
            {indexing ? 'Waiting for the index to finish…' : 'Type a dot path and press Enter.'}
          </span>
        ) : output}
      </pre>
    </div>
  )
}
