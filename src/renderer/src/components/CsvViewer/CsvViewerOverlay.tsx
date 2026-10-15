import { useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import TableLens, { type TableWriter } from './TableLens'
import { useUIStore } from '../../store/uiStore'
import { isWindows } from '../../utils/platform'

interface CsvViewerOverlayProps {
  csvText: string
  fileName: string
}

export function CsvViewerOverlay({ csvText, fileName }: CsvViewerOverlayProps): JSX.Element {
  const closeCsvViewer = useUIStore((s) => s.closeCsvViewer)
  const addToast = useUIStore((s) => s.addToast)

  const unsavedRef = useRef<TableWriter | null>(null)

  const close = useCallback(async (): Promise<void> => {
    if (
      unsavedRef.current &&
      !(await window.api.dialog.confirm('Close the table without saving?', 'Your table edits will be lost.', 'Close without saving'))
    ) return
    closeCsvViewer()
  }, [closeCsvViewer])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Inside the table, Escape is the table's own (cancel edit / deselect cell)
      if (e.key === 'Escape' && !(e.target as HTMLElement | null)?.closest?.('[data-own-shortcuts]')) void close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  // Plugin data has no tab behind it, so Save always asks where to write the file
  const saveTable = async (_saveAs: boolean, table: TableWriter): Promise<void> => {
    const warning = table.saveWarning()
    if (warning && !(await window.api.dialog.confirm(`Save ${fileName || 'the table'}?`, warning, 'Save'))) return
    const ext = /\.(tsv|tab)$/i.test(fileName) ? 'tsv' : 'csv'
    const res = await window.api.file.saveDialog(fileName || `table.${ext}`, ext)
    if (res.canceled || !res.filePath) return
    const { text, markSaved } = await table.serialize(isWindows() ? '\r\n' : '\n')
    const result = await window.api.file.write(res.filePath, text, 'UTF-8', isWindows() ? 'CRLF' : 'LF')
    if (result.error) {
      addToast(`Save failed: ${result.error}`, 'error')
      return
    }
    markSaved()
    addToast(`Saved ${res.filePath.split(/[\\/]/).pop()}`, 'info')
  }

  return (
    <div className="absolute inset-0 bg-background z-20 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <span className="text-sm font-medium text-foreground">{fileName || 'Table Lens'}</span>
        <button
          onClick={() => void close()}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Close (Esc)"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <TableLens
          initialCsvText={csvText}
          initialFileName={fileName}
          onSave={saveTable}
          onUnsavedChange={(table) => { unsavedRef.current = table }}
        />
      </div>
    </div>
  )
}
