import React, { useCallback, useEffect, useRef, useState } from 'react'
import { TableProperties, X } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { useUIStore } from '../../store/uiStore'
import { runCommand } from '../../commands/registry'
import TableLens, { type TableWriter } from './TableLens'
import { hasPendingTableEdits, setPendingTableEdits } from './tableLensBridge'
import { usePreviewFullscreen } from '../preview/previewFullscreen'

/**
 * Right-side preview pane that opens TableLens on the active CSV buffer. TableLens treats
 * `initialCsvText` as one-time seed data (it has its own grid state), so the table is re-keyed
 * per buffer. Edits flow back into the buffer's text on Save — see BufferTable.
 */
export const TableLensPreviewPane: React.FC = () => {
  const setShowPreview = useUIStore((s) => s.setShowPreview)
  const { sectionClass, Toggle: FullscreenToggle } = usePreviewFullscreen()
  const activeId = useEditorStore((s) => s.activeId)
  const activeBuffer = useEditorStore((s) => s.buffers.find((b) => b.id === s.activeId))

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
        {/* Re-mount per buffer so initialCsvText is honored. */}
        {activeId && <BufferTable key={activeId} bufferId={activeId} fileName={fileName} />}
      </div>
    </section>
  )
}

/** Tab is dirty when its text differs from the last save, or the table holds unsaved edits. */
function syncDirty(bufferId: string): void {
  const { getBuffer, updateBuffer } = useEditorStore.getState()
  const buf = getBuffer(bufferId)
  if (!buf) return
  const textDirty = buf.model ? buf.model.getAlternativeVersionId() !== buf.savedVersionId : buf.isDirty
  const isDirty = textDirty || hasPendingTableEdits(bufferId)
  if (isDirty !== buf.isDirty) updateBuffer(bufferId, { isDirty })
}

/**
 * TableLens bound to one editor buffer.
 *
 * - Seeds from the buffer's own model, read once at mount — the shared editor instance may
 *   still be showing the previous tab's model mid tab-switch.
 * - While the table has unsaved edits it registers a flush with tableLensBridge and marks the
 *   tab dirty, so Save / Save All / AutoSave / quit move the table into the text first.
 * - Ctrl+S in the table runs the normal Save command (which flushes, then writes to disk).
 * - Unmounting with unsaved edits (tab switch, preview closed) moves them into the text.
 */
const BufferTable: React.FC<{ bufferId: string; fileName: string }> = ({ bufferId, fileName }) => {
  const [seed] = useState(() => {
    const model = useEditorStore.getState().getBuffer(bufferId)?.model
    return {
      text: model?.getValue() ?? useEditorStore.getState().getBuffer(bufferId)?.content ?? '',
      version: model?.getAlternativeVersionId() ?? null
    }
  })
  // Model version the table last matched — any other version means the text was edited by hand
  const syncedVersion = useRef(seed.version)
  const tableRef = useRef<TableWriter | null>(null)

  /** Replace the buffer's text with the table. Resolves false when nothing was written. */
  const writeBack = useCallback(
    async (table: TableWriter, unmounting: boolean): Promise<boolean> => {
      const buf = useEditorStore.getState().getBuffer(bufferId)
      const model = buf?.model
      if (!buf || !model || model.isDisposed()) return false
      if (model.getAlternativeVersionId() !== syncedVersion.current) {
        const ok = await window.api.dialog.confirm(
          `Replace the text of '${buf.title}' with the table?`,
          'The file was also edited as text after Table Lens opened it — those text edits will be replaced.' +
            (unmounting ? ' Cancel discards the table edits instead.' : ''),
          'Replace text'
        )
        if (!ok || model.isDisposed()) return false
      }
      const warning = table.saveWarning()
      if (
        warning &&
        !(await window.api.dialog.confirm(
          `Save the table into '${buf.title}'?`,
          warning + (unmounting ? ' Cancel discards the table edits instead.' : ''),
          'Save'
        ))
      ) return false
      if (model.isDisposed()) return false
      const { text, markSaved } = await table.serialize(model.getEOL())
      if (model.isDisposed()) return false
      if (text !== model.getValue()) {
        // Its own undo step, so Ctrl+Z in the editor can take a table save back
        model.pushStackElement()
        model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null)
        model.pushStackElement()
      }
      syncedVersion.current = model.getAlternativeVersionId()
      // The table reports clean (onUnsavedChange(null)) once it re-renders, which clears the bridge
      markSaved()
      syncDirty(bufferId)
      return true
    },
    [bufferId]
  )

  const onUnsavedChange = useCallback(
    (table: TableWriter | null) => {
      tableRef.current = table
      setPendingTableEdits(bufferId, table && (() => writeBack(table, false)))
      syncDirty(bufferId)
    },
    [bufferId, writeBack]
  )

  const onSave = useCallback((saveAs: boolean) => {
    runCommand(saveAs ? 'file.saveAs' : 'file.save')
  }, [])

  useEffect(
    () => () => {
      const table = tableRef.current
      if (!table) return
      // markSaved is a no-op once unmounted, so clear the bridge here rather than wait for it
      void writeBack(table, true).finally(() => {
        setPendingTableEdits(bufferId, null)
        syncDirty(bufferId)
      })
    },
    [bufferId, writeBack]
  )

  return (
    <TableLens
      initialCsvText={seed.text}
      initialFileName={fileName}
      onSave={onSave}
      onUnsavedChange={onUnsavedChange}
    />
  )
}
