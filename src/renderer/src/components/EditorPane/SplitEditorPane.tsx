import React, { useRef, useEffect } from 'react'
import * as monaco from 'monaco-editor'
import { Columns2, X } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { useUIStore } from '../../store/uiStore'
import { useConfigStore } from '../../store/configStore'
import { monacoThemeFor } from '../../utils/themes'

/**
 * Second editor view shown when Split View is enabled. It is a *mirror* of the
 * active buffer: it binds to the same Monaco ITextModel as the primary editor,
 * so edits in either view appear live in both (Notepad++ "clone to other
 * view"). Scroll position and cursor are independent.
 *
 * Deliberately does NOT register itself in editorRegistry — the registry holds
 * the single primary editor that menu commands act on. This pane shares the
 * model only; it never owns it, so disposing this editor leaves the model (and
 * the primary view) untouched.
 */
export const SplitEditorPane: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const theme = useUIStore((s) => s.theme)
  const setSplitView = useUIStore((s) => s.setSplitView)
  // Track the active buffer's model so the mirror follows tab switches.
  const activeModel = useEditorStore((s) => {
    const buf = s.buffers.find((b) => b.id === s.activeId)
    return buf?.model ?? null
  })
  const activeIsReadOnly = useEditorStore((s) => s.buffers.find((b) => b.id === s.activeId)?.isReadOnly ?? false)

  useEffect(() => {
    if (!containerRef.current) return
    const cfg = useConfigStore.getState()
    const editor = monaco.editor.create(containerRef.current, {
      theme: monacoThemeFor(theme),
      fontSize: cfg.fontSize,
      fontFamily: cfg.fontFamily,
      lineNumbers: cfg.showLineNumbers ? 'on' : 'off',
      minimap: { enabled: cfg.showMinimap },
      scrollBeyondLastLine: false,
      wordWrap: cfg.wordWrap ? 'on' : 'off',
      tabSize: cfg.tabSize,
      insertSpaces: cfg.insertSpaces,
      contextmenu: false,
      padding: { top: 4 },
    })
    editorRef.current = editor

    const ro = new ResizeObserver(() => editor.layout())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      // Disposing an editor that shares a model does NOT dispose the model.
      editor.dispose()
      editorRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Theme is global in Monaco; keep in sync when the app theme flips.
  useEffect(() => {
    if (editorRef.current) monaco.editor.setTheme(monacoThemeFor(theme))
  }, [theme])

  // Bind to (or release) the active buffer's model.
  useEffect(() => {
    editorRef.current?.setModel(activeModel)
  }, [activeModel])

  // Mirror the primary pane's read-only state (deeplink remote buffers) — the
  // mirror shares the model, so an editable mirror would bypass the lock.
  useEffect(() => {
    editorRef.current?.updateOptions({
      readOnly: activeIsReadOnly,
      readOnlyMessage: { value: 'Read-only remote file — use File → Save As to edit a local copy' }
    })
  }, [activeIsReadOnly, activeModel])

  return (
    <div className="flex flex-col h-full overflow-hidden border-l border-border" data-testid="split-editor">
      <header className="px-3 py-1.5 border-b border-border flex items-center gap-2 bg-secondary/30 shrink-0">
        <Columns2 size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Split View
        </span>
        <button
          onClick={() => setSplitView(false)}
          aria-label="Close split view"
          title="Close split view"
          className="ml-auto p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </header>
      <div ref={containerRef} className="flex-1 w-full" />
    </div>
  )
}
