import React, { useRef, useEffect } from 'react'
import * as monaco from 'monaco-editor'
import { useEditorStore } from '../../store/editorStore'
import { useUIStore } from '../../store/uiStore'
import { useConfigStore } from '../../store/configStore'
import { monacoThemeFor } from '../../utils/themes'
import { editorRegistry } from '../../utils/editorRegistry'
import { TabBar } from '../TabBar/TabBar'

interface SplitEditorPaneProps {
  onClose: (id: string) => void | Promise<void>
  onNewFile: () => void
  onReload: (id: string) => void
  /** Load a session-restored (ghost) buffer when it becomes active here. */
  loadBuffer: (id: string) => Promise<boolean>
}

/**
 * The sub view of Split View (Notepad++ "other view"): its own tab bar and one
 * Monaco editor showing the sub view's active buffer. Buffers moved here live
 * only here; cloned buffers share their Monaco model with the main view, so
 * edits show in both while cursor and scroll stay independent.
 *
 * Registers as the 'sub' editor in editorRegistry; focusing it makes it the
 * editor that commands, Find and the menus act on. Never disposes a model —
 * models belong to their buffers.
 */
export const SplitEditorPane: React.FC<SplitEditorPaneProps> = ({ onClose, onNewFile, onReload, loadBuffer }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  // Per-buffer cursor/scroll for this view only (a clone's main-view state lives on the buffer).
  const viewStates = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>())
  const shownIdRef = useRef<string | null>(null)

  const theme = useUIStore((s) => s.theme)
  const subActiveId = useEditorStore((s) => s.subActiveId)
  const activeModel = useEditorStore((s) => s.buffers.find((b) => b.id === s.subActiveId)?.model ?? null)
  const activeLoaded = useEditorStore((s) => s.buffers.find((b) => b.id === s.subActiveId)?.loaded ?? true)
  const activeIsReadOnly = useEditorStore((s) => s.buffers.find((b) => b.id === s.subActiveId)?.isReadOnly ?? false)
  const collapseSubView = useEditorStore((s) => s.collapseSubView)

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
      mouseWheelZoom: false,
      padding: { top: 4 }
    })
    editorRef.current = editor
    editorRegistry.set(editor, 'sub')
    // Typing/clicking here makes the sub view the one commands act on.
    const focusSub = editor.onDidFocusEditorText(() => {
      if (useEditorStore.getState().focusedView !== 'sub') useEditorStore.getState().setFocusedView('sub')
    })

    const unsubCfg = useConfigStore.subscribe((c) => {
      editor.updateOptions({
        fontSize: c.fontSize,
        fontFamily: c.fontFamily,
        lineNumbers: c.showLineNumbers ? 'on' : 'off',
        wordWrap: c.wordWrap ? 'on' : 'off',
        tabSize: c.tabSize,
        insertSpaces: c.insertSpaces,
        minimap: { enabled: c.showMinimap }
      })
    })

    const ro = new ResizeObserver(() => editor.layout())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      unsubCfg()
      focusSub.dispose()
      editorRegistry.set(null, 'sub')
      // Disposing an editor that shares a model does NOT dispose the model.
      editor.dispose()
      editorRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Theme is global in Monaco; keep in sync when the app theme flips.
  useEffect(() => {
    if (editorRef.current) monaco.editor.setTheme(monacoThemeFor(theme))
  }, [theme])

  // Ghost buffers restored from the session have no model until loaded.
  useEffect(() => {
    if (subActiveId && !activeLoaded) void loadBuffer(subActiveId)
  }, [subActiveId, activeLoaded, loadBuffer])

  // Show the sub view's active buffer, keeping each buffer's cursor/scroll.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const prev = shownIdRef.current
    if (prev && prev !== subActiveId) viewStates.current.set(prev, editor.saveViewState())
    if (editor.getModel() !== activeModel) editor.setModel(activeModel)
    if (subActiveId && prev !== subActiveId) {
      const vs = viewStates.current.get(subActiveId)
      if (vs) editor.restoreViewState(vs)
    }
    shownIdRef.current = activeModel ? subActiveId : null
    // Forget closed buffers so the map doesn't grow without bound.
    const live = new Set(useEditorStore.getState().buffers.map((b) => b.id))
    for (const id of viewStates.current.keys()) if (!live.has(id)) viewStates.current.delete(id)
  }, [subActiveId, activeModel])

  // Deeplink remote buffers are read-only in every view — an editable clone would bypass the lock.
  useEffect(() => {
    editorRef.current?.updateOptions({
      readOnly: activeIsReadOnly,
      readOnlyMessage: { value: 'Read-only remote file — use File → Save As to edit a local copy' }
    })
  }, [activeIsReadOnly, activeModel])

  return (
    <div className="flex flex-col h-full overflow-hidden border-l border-border" data-testid="split-editor">
      <TabBar view="sub" onClose={onClose} onNewFile={onNewFile} onReload={onReload} onCloseView={collapseSubView} />
      <div ref={containerRef} className="flex-1 w-full" data-testid="split-editor-monaco" />
    </div>
  )
}
