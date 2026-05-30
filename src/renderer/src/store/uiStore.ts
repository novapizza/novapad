import { create } from 'zustand'
import type { SchemaModel } from '../utils/schemaParse/types'

type Theme = 'light' | 'dark'
export type BottomPanelId = 'findResults' | 'console'
export type MacroStep =
  | { type: 'type'; value: string }
  | { type: 'command'; value: string }

export type UIToggleKey =
  | 'showToolbar'
  | 'showStatusBar'
  | 'showSidebar'
  | 'wordWrap'
  | 'renderWhitespace'
  | 'showEOL'
  | 'showNonPrinting'
  | 'showControlChars'
  | 'indentationGuides'
  | 'columnSelectMode'
  | 'splitView'

interface UIState {
  theme: Theme
  showToolbar: boolean
  showStatusBar: boolean
  showSidebar: boolean
  wordWrap: boolean
  renderWhitespace: boolean
  showEOL: boolean
  showNonPrinting: boolean
  showControlChars: boolean
  indentationGuides: boolean
  columnSelectMode: boolean
  splitView: boolean
  sidebarPanel: 'files' | 'search' | 'plugins'
  workspaceFolder: string | null
  showFindReplace: boolean
  findReplaceMode: 'find' | 'replace' | 'findInFiles'
  findInitialTerm: string
  /**
   * Whether the right-side preview pane is open. The pane's content is
   * decided by the active buffer's type — Markdown gets the rendered HTML,
   * .sqlplan / ShowPlanXML gets the modern execution-plan tree, .csv gets
   * the Table Lens viewer. One flag drives all three so the user-visible
   * state is "preview is open / closed".
   */
  showPreview: boolean
  /**
   * Whether the preview pane is in fullscreen mode (overlays the whole window
   * instead of sharing the split with the editor). Always implies showPreview;
   * resetting showPreview also clears this flag.
   */
  previewFullscreen: boolean
  /** @deprecated kept temporarily for any callers that read it; mirrors showPreview. */
  showMarkdownPreview: boolean
  showAbout: boolean
  showBottomPanel: boolean
  activeBottomPanel: BottomPanelId
  toasts: Array<{ id: string; message: string; level: 'info' | 'warn' | 'error' }>
  isRecording: boolean
  macroSteps: MacroStep[]
  hasMacro: boolean
  csvViewerOpen: boolean
  csvViewerText: string
  csvViewerFileName: string
  /**
   * Fullscreen "Compare with…" overlay state. Triggered from the tab
   * right-click submenu; renders a side-by-side / unified diff between two
   * arbitrary buffers. Kept in uiStore (not editorStore) because the source
   * tabs themselves don't change — this is a transient view.
   */
  compareOpen: boolean
  compareLeft: { title: string; content: string } | null
  compareRight: { title: string; content: string } | null
  /**
   * Fullscreen "Transform → ER Diagram" overlay state. Triggered explicitly
   * by Ctrl+Alt+Shift+K — NOT routed through Ctrl+P preview. Source format
   * (Prisma / DBML / DDL) is detected by content sniff at parse time.
   */
  transformOpen: boolean
  transformModel: SchemaModel | null
  transformKind: 'prisma' | 'dbml' | 'ddl' | null
  transformTitle: string | null
  /** Transient: when set, the Settings tab consumes it on mount/focus and switches
   *  to that category, then clears the value. Used to deep-link from the gear menu
   *  and the native "Keyboard Shortcuts" menu item. */
  pendingSettingsCategory: string | null
  /**
   * Developer Tools panel (UUID/epoch/color/cron/lorem/jwt/url/csp/hash). A
   * single modal hosts every tool; `activeToolId` selects which one is shown.
   * `toolArgs` carries an optional preset for the active tool (e.g. the hash
   * algorithm to pre-select, or file-hash results to display).
   */
  toolsPanelOpen: boolean
  activeToolId: string | null
  toolArgs: Record<string, unknown> | null

  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setShowToolbar: (v: boolean, fromMain?: boolean) => void
  setShowStatusBar: (v: boolean, fromMain?: boolean) => void
  setShowSidebar: (v: boolean, fromMain?: boolean) => void
  setWordWrap: (v: boolean, fromMain?: boolean) => void
  setRenderWhitespace: (v: boolean, fromMain?: boolean) => void
  setShowEOL: (v: boolean, fromMain?: boolean) => void
  setShowNonPrinting: (v: boolean, fromMain?: boolean) => void
  setShowControlChars: (v: boolean, fromMain?: boolean) => void
  setIndentationGuides: (v: boolean, fromMain?: boolean) => void
  setColumnSelectMode: (v: boolean, fromMain?: boolean) => void
  setSplitView: (v: boolean, fromMain?: boolean) => void
  syncToggleToMain: (key: UIToggleKey, value: boolean) => void
  setSidebarPanel: (p: UIState['sidebarPanel']) => void
  setWorkspaceFolder: (path: string | null) => void
  openFind: (mode?: 'find' | 'replace' | 'findInFiles', initialTerm?: string) => void
  closeFind: () => void
  togglePreview: () => void
  setShowPreview: (v: boolean) => void
  togglePreviewFullscreen: () => void
  setPreviewFullscreen: (v: boolean) => void
  /** @deprecated alias of togglePreview / setShowPreview. */
  toggleMarkdownPreview: () => void
  setMarkdownPreview: (v: boolean) => void
  setShowAbout: (v: boolean) => void
  setShowBottomPanel: (v: boolean) => void
  setActiveBottomPanel: (p: BottomPanelId) => void
  addToast: (message: string, level?: 'info' | 'warn' | 'error') => void
  removeToast: (id: string) => void
  startRecording: () => void
  stopRecording: (steps: MacroStep[]) => void
  openCsvViewer: (csvText: string, fileName: string) => void
  closeCsvViewer: () => void
  openCompare: (left: { title: string; content: string }, right: { title: string; content: string }) => void
  closeCompare: () => void
  openTransform: (model: SchemaModel, kind: 'prisma' | 'dbml' | 'ddl', title: string) => void
  closeTransform: () => void
  setPendingSettingsCategory: (cat: string | null) => void
  openTool: (id: string, args?: Record<string, unknown>) => void
  closeTools: () => void
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: 'dark',
  showToolbar: true,
  showStatusBar: true,
  showSidebar: false,
  wordWrap: false,
  renderWhitespace: false,
  showEOL: false,
  showNonPrinting: false,
  showControlChars: false,
  indentationGuides: true,
  columnSelectMode: false,
  splitView: false,
  sidebarPanel: 'files',
  workspaceFolder: null,
  showFindReplace: false,
  findReplaceMode: 'find',
  findInitialTerm: '',
  showPreview: false,
  previewFullscreen: false,
  showMarkdownPreview: false,
  showAbout: false,
  showBottomPanel: false,
  activeBottomPanel: 'findResults',
  toasts: [],
  isRecording: false,
  macroSteps: [],
  hasMacro: false,
  csvViewerOpen: false,
  csvViewerText: '',
  csvViewerFileName: '',
  compareOpen: false,
  compareLeft: null,
  compareRight: null,
  transformOpen: false,
  transformModel: null,
  transformKind: null,
  transformTitle: null,
  pendingSettingsCategory: null,
  toolsPanelOpen: false,
  activeToolId: null,
  toolArgs: null,

  setTheme: (t) => set({ theme: t }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  syncToggleToMain: (key, value) => {
    window.api.send('ui:state-changed', { key, value })
  },
  setShowToolbar: (v, fromMain) => {
    set({ showToolbar: v })
    if (!fromMain) get().syncToggleToMain('showToolbar', v)
  },
  setShowStatusBar: (v, fromMain) => {
    set({ showStatusBar: v })
    if (!fromMain) get().syncToggleToMain('showStatusBar', v)
  },
  setShowSidebar: (v, fromMain) => {
    set({ showSidebar: v })
    if (!fromMain) get().syncToggleToMain('showSidebar', v)
  },
  setWordWrap: (v, fromMain) => {
    set({ wordWrap: v })
    if (!fromMain) get().syncToggleToMain('wordWrap', v)
  },
  setRenderWhitespace: (v, fromMain) => {
    set({ renderWhitespace: v })
    if (!fromMain) get().syncToggleToMain('renderWhitespace', v)
  },
  setShowEOL: (v, fromMain) => {
    set({ showEOL: v })
    if (!fromMain) get().syncToggleToMain('showEOL', v)
  },
  setShowNonPrinting: (v, fromMain) => {
    set({ showNonPrinting: v })
    if (!fromMain) get().syncToggleToMain('showNonPrinting', v)
  },
  setShowControlChars: (v, fromMain) => {
    set({ showControlChars: v })
    if (!fromMain) get().syncToggleToMain('showControlChars', v)
  },
  setIndentationGuides: (v, fromMain) => {
    set({ indentationGuides: v })
    if (!fromMain) get().syncToggleToMain('indentationGuides', v)
  },
  setColumnSelectMode: (v, fromMain) => {
    set({ columnSelectMode: v })
    if (!fromMain) get().syncToggleToMain('columnSelectMode', v)
  },
  setSplitView: (v, fromMain) => {
    set({ splitView: v })
    if (!fromMain) get().syncToggleToMain('splitView', v)
  },
  setSidebarPanel: (p) => set({ sidebarPanel: p }),
  setWorkspaceFolder: (path) => set({ workspaceFolder: path }),
  openFind: (mode = 'find', initialTerm = '') => set({ showFindReplace: true, findReplaceMode: mode, findInitialTerm: initialTerm }),
  closeFind: () => set({ showFindReplace: false }),
  togglePreview: () =>
    set((s) => ({
      showPreview: !s.showPreview,
      showMarkdownPreview: !s.showPreview,
      previewFullscreen: s.showPreview ? false : s.previewFullscreen,
    })),
  setShowPreview: (v) =>
    set((s) => ({ showPreview: v, showMarkdownPreview: v, previewFullscreen: v ? s.previewFullscreen : false })),
  togglePreviewFullscreen: () =>
    set((s) => ({
      previewFullscreen: !s.previewFullscreen,
      showPreview: s.previewFullscreen ? s.showPreview : true,
      showMarkdownPreview: s.previewFullscreen ? s.showMarkdownPreview : true,
    })),
  setPreviewFullscreen: (v) =>
    set((s) => ({
      previewFullscreen: v,
      showPreview: v ? true : s.showPreview,
      showMarkdownPreview: v ? true : s.showMarkdownPreview,
    })),
  toggleMarkdownPreview: () =>
    set((s) => ({
      showPreview: !s.showPreview,
      showMarkdownPreview: !s.showPreview,
      previewFullscreen: s.showPreview ? false : s.previewFullscreen,
    })),
  setMarkdownPreview: (v) =>
    set((s) => ({ showPreview: v, showMarkdownPreview: v, previewFullscreen: v ? s.previewFullscreen : false })),
  setShowAbout: (v) => set({ showAbout: v }),
  setShowBottomPanel: (v) => set({ showBottomPanel: v }),
  setActiveBottomPanel: (p) => set({ activeBottomPanel: p }),

  addToast: (message, level = 'info') => {
    const id = Date.now().toString()
    set((s) => ({ toasts: [...s.toasts, { id, message, level }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  startRecording: () => set({ isRecording: true, macroSteps: [] }),
  stopRecording: (steps) => set({ isRecording: false, macroSteps: steps, hasMacro: steps.length > 0 }),
  openCsvViewer: (csvText, fileName) => set({ csvViewerOpen: true, csvViewerText: csvText, csvViewerFileName: fileName }),
  closeCsvViewer: () => set({ csvViewerOpen: false, csvViewerText: '', csvViewerFileName: '' }),
  openCompare: (left, right) => set({ compareOpen: true, compareLeft: left, compareRight: right }),
  closeCompare: () => set({ compareOpen: false, compareLeft: null, compareRight: null }),
  openTransform: (model, kind, title) =>
    set({ transformOpen: true, transformModel: model, transformKind: kind, transformTitle: title }),
  closeTransform: () =>
    set({ transformOpen: false, transformModel: null, transformKind: null, transformTitle: null }),
  setPendingSettingsCategory: (cat) => set({ pendingSettingsCategory: cat }),
  openTool: (id, args) => set({ toolsPanelOpen: true, activeToolId: id, toolArgs: args ?? null }),
  closeTools: () => set({ toolsPanelOpen: false, toolArgs: null })
}))
