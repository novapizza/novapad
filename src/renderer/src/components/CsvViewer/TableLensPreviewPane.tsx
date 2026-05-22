import React, { useEffect, useState } from 'react'
import * as monaco from 'monaco-editor'
import { TableProperties, X } from 'lucide-react'
import { editorRegistry } from '../../utils/editorRegistry'
import { useEditorStore } from '../../store/editorStore'
import { useUIStore } from '../../store/uiStore'
import TableLens from './TableLens'
import { usePreviewFullscreen } from '../preview/previewFullscreen'

/**
 * Right-side preview pane that opens the existing TableLens with the active
 * CSV buffer's content. TableLens treats `initialCsvText` as one-time seed
 * data (it has its own internal grid state), so we re-key the component when
 * the buffer changes or the source content changes substantially.
 */
export const TableLensPreviewPane: React.FC = () => {
  const setShowPreview = useUIStore((s) => s.setShowPreview)
  const { sectionClass, Toggle: FullscreenToggle } = usePreviewFullscreen()
  const activeId = useEditorStore((s) => s.activeId)
  const activeBuffer = useEditorStore((s) => s.buffers.find((b) => b.id === s.activeId))

  // Synchronously seed the CSV text from the active model on first render so
  // TableLens's own auto-load effect (which runs once on mount) sees the
  // content immediately. Without this, the table would briefly show the
  // upload UI and never auto-load (the effect already ran with an empty prop).
  const [csvText, setCsvText] = useState<string>(
    () => editorRegistry.get()?.getModel()?.getValue() ?? activeBuffer?.content ?? ''
  )

  // Tab switches don't unmount this pane on their own — re-snapshot when the
  // active buffer changes. The key= on TableLens below also remounts the
  // table so it parses the new file.
  useEffect(() => {
    const editor = editorRegistry.get()
    if (!editor) return
    const snap = () => setCsvText(editor.getModel()?.getValue() ?? '')
    const modelChange = editor.onDidChangeModel(snap)
    return () => modelChange.dispose()
  }, [activeId])

  const fileName =
    activeBuffer?.filePath?.split(/[\\/]/).pop() ?? activeBuffer?.title ?? 'Untitled.csv'

  return (
    <section className={sectionClass}>
      <header className="px-3 py-2 border-b border-border flex items-center gap-2 bg-secondary/30">
        <TableProperties size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Table Lens
        </span>
        <span className="text-[11px] text-muted-foreground truncate" title={fileName}>
          {fileName}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {FullscreenToggle}
          <button
            onClick={() => setShowPreview(false)}
            aria-label="Close preview"
            title="Close preview (Ctrl+P)"
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        {/* Re-mount when the underlying file changes so initialCsvText is honored. */}
        <TableLens key={activeId ?? 'none'} initialCsvText={csvText} initialFileName={fileName} />
      </div>
    </section>
  )
}
