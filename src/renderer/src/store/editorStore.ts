import { create } from 'zustand'
import * as monaco from 'monaco-editor'

export type EOLType = 'CRLF' | 'LF' | 'CR'

export type BufferKind = 'file' | 'settings' | 'shortcuts' | 'whatsNew' | 'pluginManager' | 'pluginDetail'

export interface Buffer {
  id: string
  kind: BufferKind             // 'file' for normal file/untitled buffers; virtual tabs otherwise
  filePath: string | null      // null = untitled or virtual
  title: string                // display name
  content: string
  isDirty: boolean
  /** Monaco model.getAlternativeVersionId() at the last clean baseline (load/save/reload).
   *  Content change handler compares the live alt-id to this — undoing back to the
   *  baseline clears the dirty flag, like VS Code. Sentinel `-1` keeps the buffer
   *  permanently dirty until next save (used for snapshot-restored dirty buffers). */
  savedVersionId: number
  encoding: string
  /** True when the file on disk started with a BOM (UTF-8 / UTF-16 LE / BE).
   *  Preserved across save round-trips so re-encoding doesn't strip the marker
   *  that consumers like SSMS rely on for .sqlplan UTF-16 detection. */
  hasBom: boolean
  eol: EOLType
  language: string
  mtime: number                // last known on-disk mtime
  viewState: monaco.editor.ICodeEditorViewState | null
  savedViewState: object | null // serialized viewState from session (before model exists)
  model: monaco.editor.ITextModel | null
  bookmarks: number[]          // sorted list of 1-based bookmarked line numbers
  loaded: boolean              // false = ghost buffer (metadata only, no content/model)
  missing: boolean             // true = file no longer exists on disk
  isLargeFile: boolean         // true = file exceeds large file threshold (disables expensive features)
  pluginId: string | null      // set only when kind === 'pluginDetail'; the plugin's unique name
  /** Backup filename (relative to userData/backup/) while the buffer is dirty; null when clean. */
  backupPath: string | null
}

interface EditorState {
  buffers: Buffer[]
  activeId: string | null
  splitActive: boolean
  splitActiveId: string | null

  // Actions
  addBuffer: (buf: Omit<Buffer, 'id' | 'model' | 'kind' | 'pluginId' | 'backupPath' | 'savedVersionId'> & { kind?: BufferKind; pluginId?: string | null; backupPath?: string | null }) => string
  addGhostBuffer: (buf: Omit<Buffer, 'id' | 'model' | 'kind' | 'pluginId' | 'backupPath' | 'savedVersionId'> & { kind?: BufferKind; pluginId?: string | null; backupPath?: string | null }) => string
  hydrateBuffer: (id: string, patch: { content: string; encoding: string; eol: EOLType; mtime: number; hasBom?: boolean }) => void
  removeBuffer: (id: string) => void
  updateBuffer: (id: string, patch: Partial<Buffer>) => void
  setActive: (id: string) => void
  setSplitActive: (id: string) => void
  toggleSplit: () => void
  getActive: () => Buffer | null
  getBuffer: (id: string) => Buffer | null
  findVirtualBuffer: (kind: BufferKind) => Buffer | null
  openVirtualTab: (
    kind: 'settings' | 'shortcuts' | 'whatsNew',
    options?: { activate?: boolean }
  ) => string
  openPluginManagerTab: () => string
  openPluginDetailTab: (pluginId: string, pluginName: string) => string
  closePluginDetailTab: (pluginId: string) => void
}

let _idCounter = 0
function newId(): string {
  return `buf-${++_idCounter}`
}

export const useEditorStore = create<EditorState>((set, get) => ({
  buffers: [],
  activeId: null,
  splitActive: false,
  splitActiveId: null,

  addBuffer: (buf) => {
    const id = newId()
    // Force plaintext for large files to skip expensive tokenization
    const lang = buf.isLargeFile ? 'plaintext' : (buf.language || 'plaintext')
    const model = monaco.editor.createModel(buf.content, lang)
    // Snapshot-restored buffers come in already dirty (content differs from disk);
    // mark savedVersionId as unreachable so undoing within Monaco can't clear it.
    const savedVersionId = buf.isDirty ? -1 : model.getAlternativeVersionId()
    set((s) => ({
      buffers: [...s.buffers, { ...buf, kind: buf.kind ?? 'file', id, model, savedVersionId, loaded: true, missing: false, savedViewState: buf.savedViewState ?? null, pluginId: buf.pluginId ?? null, backupPath: buf.backupPath ?? null }],
      activeId: s.activeId ?? id
    }))
    return id
  },

  addGhostBuffer: (buf) => {
    const id = newId()
    set((s) => ({
      buffers: [...s.buffers, { ...buf, kind: buf.kind ?? 'file', id, model: null, savedVersionId: 0, pluginId: buf.pluginId ?? null, backupPath: buf.backupPath ?? null }],
      activeId: s.activeId ?? id
    }))
    return id
  },

  hydrateBuffer: (id, patch) => {
    const buf = get().buffers.find((b) => b.id === id)
    if (!buf || buf.loaded) return
    const lang = buf.isLargeFile ? 'plaintext' : (buf.language || 'plaintext')
    const model = monaco.editor.createModel(patch.content, lang)
    const savedVersionId = model.getAlternativeVersionId()
    set((s) => ({
      buffers: s.buffers.map((b) =>
        b.id === id
          ? { ...b, ...patch, model, content: patch.content, loaded: true, isDirty: false, savedVersionId }
          : b
      )
    }))
  },

  removeBuffer: (id) => {
    const buf = get().buffers.find((b) => b.id === id)
    buf?.model?.dispose()
    set((s) => {
      const idx = s.buffers.findIndex((b) => b.id === id)
      const buffers = s.buffers.filter((b) => b.id !== id)
      let activeId = s.activeId
      if (activeId === id) {
        activeId = buffers[Math.max(0, idx - 1)]?.id ?? buffers[0]?.id ?? null
      }
      return { buffers, activeId }
    })
  },

  updateBuffer: (id, patch) => {
    set((s) => ({
      buffers: s.buffers.map((b) => (b.id === id ? { ...b, ...patch } : b))
    }))
  },

  setActive: (id) => set({ activeId: id }),
  setSplitActive: (id) => set({ splitActiveId: id }),
  toggleSplit: () => set((s) => ({ splitActive: !s.splitActive })),

  getActive: () => {
    const s = get()
    return s.buffers.find((b) => b.id === s.activeId) ?? null
  },

  getBuffer: (id) => get().buffers.find((b) => b.id === id) ?? null,

  findVirtualBuffer: (kind) => get().buffers.find((b) => b.kind === kind) ?? null,

  openVirtualTab: (kind, options) => {
    const activate = options?.activate ?? true
    const existing = get().buffers.find((b) => b.kind === kind)
    if (existing) {
      if (activate) set({ activeId: existing.id })
      return existing.id
    }
    const id = newId()
    const title =
      kind === 'settings' ? 'Settings'
      : kind === 'shortcuts' ? 'Keyboard Shortcuts'
      : "What's New"
    set((s) => ({
      buffers: [
        ...s.buffers,
        {
          id,
          kind,
          pluginId: null,
          filePath: null,
          title,
          content: '',
          isDirty: false,
          savedVersionId: 0,
          encoding: 'UTF-8',
          hasBom: false,
          eol: 'LF',
          language: 'plaintext',
          mtime: 0,
          viewState: null,
          savedViewState: null,
          model: null,
          bookmarks: [],
          loaded: true,
          missing: false,
          isLargeFile: false,
          backupPath: null
        }
      ],
      ...(activate ? { activeId: id } : {})
    }))
    return id
  },

  openPluginManagerTab: () => {
    const existing = get().buffers.find((b) => b.kind === 'pluginManager')
    if (existing) {
      set({ activeId: existing.id })
      return existing.id
    }
    const id = newId()
    set((s) => ({
      buffers: [
        ...s.buffers,
        {
          id,
          kind: 'pluginManager' as const,
          pluginId: null,
          filePath: null,
          title: 'Extensions',
          content: '',
          isDirty: false,
          savedVersionId: 0,
          encoding: 'UTF-8',
          hasBom: false,
          eol: 'LF',
          language: 'plaintext',
          mtime: 0,
          viewState: null,
          savedViewState: null,
          model: null,
          bookmarks: [],
          loaded: true,
          missing: false,
          isLargeFile: false,
          backupPath: null
        }
      ],
      activeId: id
    }))
    return id
  },

  openPluginDetailTab: (pluginId, pluginName) => {
    const existing = get().buffers.find((b) => b.kind === 'pluginDetail' && b.pluginId === pluginId)
    if (existing) {
      set({ activeId: existing.id })
      return existing.id
    }
    const id = newId()
    set((s) => ({
      buffers: [
        ...s.buffers,
        {
          id,
          kind: 'pluginDetail' as const,
          pluginId,
          filePath: null,
          title: pluginName,
          content: '',
          isDirty: false,
          savedVersionId: 0,
          encoding: 'UTF-8',
          hasBom: false,
          eol: 'LF',
          language: 'plaintext',
          mtime: 0,
          viewState: null,
          savedViewState: null,
          model: null,
          bookmarks: [],
          loaded: true,
          missing: false,
          isLargeFile: false,
          backupPath: null
        }
      ],
      activeId: id
    }))
    return id
  },

  closePluginDetailTab: (pluginId) => {
    const buf = get().buffers.find((b) => b.kind === 'pluginDetail' && b.pluginId === pluginId)
    if (buf) get().removeBuffer(buf.id)
  }
}))
