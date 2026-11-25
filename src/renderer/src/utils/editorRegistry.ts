import * as monaco from 'monaco-editor'
import { useEditorStore } from '../store/editorStore'
import type { ViewName } from './editorViews'

/**
 * Shares the Monaco editor instances with commands, Find, toolbar, AI and the
 * other consumers that act on "the editor". There is one editor per view (main,
 * and sub while Split View is open); `get()` returns the focused view's editor,
 * so every consumer follows focus. The main editor is the fallback whenever the
 * sub view is closed.
 */
const editors: Record<ViewName, monaco.editor.IStandaloneCodeEditor | null> = { main: null, sub: null }

export const editorRegistry = {
  /** Register (or clear, with null) the editor of a view. Defaults to main. */
  set(editor: monaco.editor.IStandaloneCodeEditor | null, view: ViewName = 'main'): void {
    editors[view] = editor
  },
  /** The focused view's editor. */
  get(): monaco.editor.IStandaloneCodeEditor | null {
    const focused = useEditorStore.getState().focusedView
    return editors[focused] ?? editors.main
  },
  /** A specific view's editor. */
  getView(view: ViewName): monaco.editor.IStandaloneCodeEditor | null {
    return editors[view]
  }
}
