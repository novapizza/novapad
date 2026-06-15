import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Search } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useFileOps } from '../../hooks/useFileOps'
import { fuzzyFilter } from '../../utils/fuzzyFilter'

interface FileEntry {
  path: string
  name: string
}

const MAX_RESULTS = 50

const norm = (p: string): string => p.replace(/\\/g, '/')

/** Render a file name with the fuzzy-matched character indices bolded. */
function Highlighted({ text, ranges }: { text: string; ranges: number[] }): React.ReactElement {
  if (!ranges.length) return <>{text}</>
  const hit = new Set(ranges)
  return (
    <>
      {Array.from(text).map((ch, i) =>
        hit.has(i) ? (
          <span key={i} className="text-primary font-semibold">
            {ch}
          </span>
        ) : (
          <React.Fragment key={i}>{ch}</React.Fragment>
        )
      )}
    </>
  )
}

export function QuickOpenPalette(): React.ReactElement | null {
  const { quickOpenVisible, setQuickOpenVisible, workspaceFolder } = useUIStore()
  const { openFiles } = useFileOps()

  const [allFiles, setAllFiles] = useState<FileEntry[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false)
  const [truncated, setTruncated] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Load the file list each time the palette opens (folder may have changed).
  useEffect(() => {
    if (!quickOpenVisible) return
    setQuery('')
    setSelected(0)
    setTruncated(false)
    if (!workspaceFolder) {
      setAllFiles([])
      return
    }
    let cancelled = false
    setLoading(true)
    window.api.file
      .listFilesRecursive(workspaceFolder)
      .then((res) => {
        if (cancelled) return
        setAllFiles(res.files)
        setTruncated(res.truncated)
      })
      .catch(() => {
        if (!cancelled) setAllFiles([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [quickOpenVisible, workspaceFolder])

  // Focus the input when opened.
  useEffect(() => {
    if (quickOpenVisible) inputRef.current?.focus()
  }, [quickOpenVisible])

  const results = useMemo(
    () => fuzzyFilter(query, allFiles, MAX_RESULTS),
    [query, allFiles]
  )

  // Keep selection in range as results change.
  useEffect(() => {
    setSelected((s) => (results.length === 0 ? 0 : Math.min(s, results.length - 1)))
  }, [results])

  // Scroll the selected row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const close = (): void => setQuickOpenVisible(false)

  const openAt = (idx: number): void => {
    const match = results[idx]
    if (!match) return
    void openFiles([match.item.path])
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => (results.length === 0 ? 0 : (s + 1) % results.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => (results.length === 0 ? 0 : (s - 1 + results.length) % results.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      openAt(selected)
    }
  }

  if (!quickOpenVisible) return null

  const rootPrefix = workspaceFolder ? norm(workspaceFolder) + '/' : ''
  const relDir = (full: string): string => {
    const n = norm(full)
    const rel = n.startsWith(rootPrefix) ? n.slice(rootPrefix.length) : n
    const slash = rel.lastIndexOf('/')
    return slash >= 0 ? rel.slice(0, slash) : ''
  }

  return (
    <div
      data-testid="quick-open"
      className="fixed inset-0 z-[9000] flex items-start justify-center bg-black/40 pt-[12vh]"
      onClick={close}
    >
      <div
        className="fixed z-[9001] w-[600px] max-w-[90vw] bg-popover border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            data-testid="quick-open-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={workspaceFolder ? 'Search files by name…' : 'Open a folder to search files'}
            className="flex-1 bg-transparent border-none outline-none text-base text-foreground placeholder:text-muted-foreground"
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div ref={listRef} data-testid="quick-open-list" className="max-h-[50vh] overflow-y-auto py-1">
          {!workspaceFolder ? (
            <div className="px-3 py-6 text-center text-base text-muted-foreground">
              No folder is open. Use <span className="font-mono text-sm">File → Open Folder…</span> first.
            </div>
          ) : loading ? (
            <div className="px-3 py-6 text-center text-base text-muted-foreground">Indexing files…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-6 text-center text-base text-muted-foreground">No matching files</div>
          ) : (
            results.map((m, idx) => {
              const dir = relDir(m.item.path)
              return (
                <div
                  key={m.item.path}
                  data-idx={idx}
                  data-testid="quick-open-result"
                  onClick={() => openAt(idx)}
                  onMouseMove={() => setSelected(idx)}
                  className={
                    'flex items-center gap-2 px-3 py-1.5 cursor-pointer text-base ' +
                    (idx === selected ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-explorer-hover')
                  }
                  title={m.item.path}
                >
                  <FileText size={16} className="shrink-0 text-tab-muted" />
                  <span className="truncate">
                    <Highlighted text={m.item.name} ranges={m.matchRanges} />
                  </span>
                  {dir && <span className="truncate text-sm text-muted-foreground">{dir}</span>}
                </div>
              )
            })
          )}
        </div>

        {truncated && (
          <div className="px-3 py-1.5 border-t border-border text-sm text-muted-foreground">
            Showing the first {allFiles.length.toLocaleString()} files — narrow your search to find more.
          </div>
        )}
      </div>
    </div>
  )
}
