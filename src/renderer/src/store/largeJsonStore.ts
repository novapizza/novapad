import { create } from 'zustand'
import { useEditorStore } from './editorStore'

export type LargeJsonMode = 'array' | 'ndjson' | null

/** One overlay change: `undefined` means "no overlay entry" (original record). */
export interface OverlayEdit {
  index: number
  prev: string | null | undefined
  next: string | null | undefined
}

export interface LargeJsonDoc {
  bufferId: string
  /** Worker document id from main; null until `largejson:open` resolves. */
  docId: string | null
  filePath: string
  size: number
  encoding: string
  mode: LargeJsonMode
  recordCount: number
  bytesScanned: number
  indexing: boolean
  indexError: string | null
  openError: string | null
  /** Bumped whenever record offsets may have changed (save / reindex) so row caches drop. */
  version: number
  /** recordIndex → replacement text, or null = deleted. */
  overlay: Map<number, string | null>
  undo: OverlayEdit[]
  redo: OverlayEdit[]
  saving: boolean
  // Search (Records view filter)
  searchQuery: string
  searchOpId: string | null
  searchResults: number[] | null
  searchTotal: number
  searchTruncated: boolean
  searchBusy: boolean
  searchScanned: number
}

interface LargeJsonState {
  docs: Record<string, LargeJsonDoc>
  initDoc: (bufferId: string, init: Pick<LargeJsonDoc, 'filePath' | 'size' | 'encoding'>) => void
  patchDoc: (bufferId: string, patch: Partial<LargeJsonDoc>) => void
  removeDoc: (bufferId: string) => void
  byDocId: (docId: string) => LargeJsonDoc | null
  /** Apply a record replacement (`null` = delete, `undefined` = revert to original). */
  applyEdit: (bufferId: string, index: number, next: string | null | undefined) => void
  undo: (bufferId: string) => void
  redo: (bufferId: string) => void
  clearOverlay: (bufferId: string) => void
  setSearchResults: (bufferId: string, opId: string, patch: Partial<Pick<LargeJsonDoc, 'searchResults' | 'searchTotal' | 'searchTruncated' | 'searchBusy' | 'searchScanned'>>, append?: number[]) => void
}

function syncDirty(bufferId: string, overlay: Map<number, string | null>): void {
  const buf = useEditorStore.getState().getBuffer(bufferId)
  const dirty = overlay.size > 0
  if (buf && buf.isDirty !== dirty) useEditorStore.getState().updateBuffer(bufferId, { isDirty: dirty })
}

function withOverlay(overlay: Map<number, string | null>, index: number, value: string | null | undefined): Map<number, string | null> {
  const next = new Map(overlay)
  if (value === undefined) next.delete(index)
  else next.set(index, value)
  return next
}

export const useLargeJsonStore = create<LargeJsonState>((set, get) => ({
  docs: {},

  initDoc: (bufferId, init) =>
    set((s) => ({
      docs: {
        ...s.docs,
        [bufferId]: {
          bufferId,
          docId: null,
          filePath: init.filePath,
          size: init.size,
          encoding: init.encoding,
          mode: null,
          recordCount: 0,
          bytesScanned: 0,
          indexing: true,
          indexError: null,
          openError: null,
          version: 0,
          overlay: new Map(),
          undo: [],
          redo: [],
          saving: false,
          searchQuery: '',
          searchOpId: null,
          searchResults: null,
          searchTotal: 0,
          searchTruncated: false,
          searchBusy: false,
          searchScanned: 0
        }
      }
    })),

  patchDoc: (bufferId, patch) =>
    set((s) => {
      const doc = s.docs[bufferId]
      if (!doc) return s
      return { docs: { ...s.docs, [bufferId]: { ...doc, ...patch } } }
    }),

  removeDoc: (bufferId) =>
    set((s) => {
      if (!s.docs[bufferId]) return s
      const docs = { ...s.docs }
      delete docs[bufferId]
      return { docs }
    }),

  byDocId: (docId) => Object.values(get().docs).find((d) => d.docId === docId) ?? null,

  applyEdit: (bufferId, index, next) => {
    const doc = get().docs[bufferId]
    if (!doc) return
    const prev = doc.overlay.has(index) ? doc.overlay.get(index) : undefined
    if (prev === next) return
    const overlay = withOverlay(doc.overlay, index, next)
    set((s) => ({
      docs: { ...s.docs, [bufferId]: { ...doc, overlay, undo: [...doc.undo, { index, prev, next }], redo: [] } }
    }))
    syncDirty(bufferId, overlay)
  },

  undo: (bufferId) => {
    const doc = get().docs[bufferId]
    if (!doc || doc.undo.length === 0) return
    const edit = doc.undo[doc.undo.length - 1]
    const overlay = withOverlay(doc.overlay, edit.index, edit.prev)
    set((s) => ({
      docs: { ...s.docs, [bufferId]: { ...doc, overlay, undo: doc.undo.slice(0, -1), redo: [...doc.redo, edit] } }
    }))
    syncDirty(bufferId, overlay)
  },

  redo: (bufferId) => {
    const doc = get().docs[bufferId]
    if (!doc || doc.redo.length === 0) return
    const edit = doc.redo[doc.redo.length - 1]
    const overlay = withOverlay(doc.overlay, edit.index, edit.next)
    set((s) => ({
      docs: { ...s.docs, [bufferId]: { ...doc, overlay, redo: doc.redo.slice(0, -1), undo: [...doc.undo, edit] } }
    }))
    syncDirty(bufferId, overlay)
  },

  clearOverlay: (bufferId) => {
    const doc = get().docs[bufferId]
    if (!doc) return
    const overlay = new Map<number, string | null>()
    set((s) => ({ docs: { ...s.docs, [bufferId]: { ...doc, overlay, undo: [], redo: [] } } }))
    syncDirty(bufferId, overlay)
  },

  setSearchResults: (bufferId, opId, patch, append) =>
    set((s) => {
      const doc = s.docs[bufferId]
      // Ignore chunks from a superseded search.
      if (!doc || doc.searchOpId !== opId) return s
      const searchResults = append ? [...(doc.searchResults ?? []), ...append] : (patch.searchResults ?? doc.searchResults)
      return { docs: { ...s.docs, [bufferId]: { ...doc, ...patch, searchResults } } }
    })
}))
