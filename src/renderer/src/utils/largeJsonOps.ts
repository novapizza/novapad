// Renderer-side operations for the large-JSON record viewer: open / save /
// close a document, plus the single global listener that routes worker
// progress and streamed chunks into the store.

import { useEditorStore } from '../store/editorStore'
import { useLargeJsonStore } from '../store/largeJsonStore'
import { useUIStore } from '../store/uiStore'

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

let opCounter = 0
export function newOpId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${++opCounter}`
}

type ChunkMsg = {
  docId: string
  opId: string
  kind: 'search' | 'extract'
  items: unknown[]
  done: boolean
  total: number
  truncated: boolean
  scanned: number
  error: string | null
}

type ProgressMsg = {
  docId: string
  bytesScanned: number
  fileSize: number
  recordCount: number
  done: boolean
  mode: 'array' | 'ndjson' | null
  error: string | null
}

/** Extract results are delivered to whichever panel started the op. */
const extractListeners = new Map<string, (msg: ChunkMsg) => void>()
export function onExtractChunk(opId: string, cb: (msg: ChunkMsg) => void): () => void {
  extractListeners.set(opId, cb)
  return () => extractListeners.delete(opId)
}

let installed = false
/** Idempotent. Call once from App. */
export function installLargeJsonListeners(): () => void {
  if (installed) return () => {}
  installed = true
  const offProgress = window.api.on('largejson:progress', (...args) => {
    const m = args[0] as ProgressMsg
    const store = useLargeJsonStore.getState()
    const doc = store.byDocId(m.docId)
    if (!doc) return
    const wasIndexing = doc.indexing
    store.patchDoc(doc.bufferId, {
      bytesScanned: m.bytesScanned,
      size: m.fileSize || doc.size,
      recordCount: m.recordCount,
      mode: m.mode,
      indexing: !m.done,
      indexError: m.error,
      // Offsets may have moved when a (re)index completes.
      version: m.done && wasIndexing ? doc.version + 1 : doc.version
    })
    if (m.done && m.error) {
      useUIStore.getState().addToast(`${basename(doc.filePath)}: ${m.error}`, 'error')
    }
  })
  const offChunk = window.api.on('largejson:chunk', (...args) => {
    const m = args[0] as ChunkMsg
    if (m.kind === 'extract') {
      extractListeners.get(m.opId)?.(m)
      if (m.done) extractListeners.delete(m.opId)
      return
    }
    const store = useLargeJsonStore.getState()
    const doc = store.byDocId(m.docId)
    if (!doc) return
    store.setSearchResults(
      doc.bufferId,
      m.opId,
      {
        searchBusy: !m.done,
        searchTotal: m.total,
        searchTruncated: m.truncated,
        searchScanned: m.scanned
      },
      m.items as number[]
    )
  })
  return () => {
    offProgress()
    offChunk()
    installed = false
  }
}

/**
 * Open (or convert a ghost buffer into) a large-JSON tab.
 * Returns the buffer id, or null if the worker refused the file.
 */
export async function openLargeJsonBuffer(filePath: string, size: number, existingId?: string): Promise<string | null> {
  const editor = useEditorStore.getState()
  const ui = useUIStore.getState()
  const title = basename(filePath)

  const res = await window.api.largeJson.open(filePath)
  if (res.error || !res.docId) {
    ui.addToast(`Cannot open ${title}: ${res.error ?? 'unknown error'}`, 'error')
    if (existingId) editor.updateBuffer(existingId, { loaded: true, missing: true })
    return null
  }

  let id: string
  if (existingId) {
    id = existingId
    editor.updateBuffer(id, {
      kind: 'largeJson',
      loaded: true,
      missing: false,
      isLargeFile: true,
      language: 'json',
      encoding: res.encoding,
      model: null,
      content: ''
    })
  } else {
    id = editor.addLargeJsonBuffer({ filePath, title, encoding: res.encoding, mtime: 0 })
  }

  useLargeJsonStore.getState().initDoc(id, { filePath, size: res.size || size, encoding: res.encoding })
  useLargeJsonStore.getState().patchDoc(id, { docId: res.docId })
  window.api.watch.add(filePath)
  window.api.file.addRecent(filePath)
  return id
}

/** Stream the overlay into the file (or `targetPath` for Save As). */
export async function saveLargeJson(bufferId: string, targetPath: string | null): Promise<boolean> {
  const store = useLargeJsonStore.getState()
  const ui = useUIStore.getState()
  const doc = store.docs[bufferId]
  if (!doc?.docId) return false
  if (doc.indexing) {
    ui.addToast('Still indexing — try saving again in a moment.', 'warn')
    return false
  }
  if (doc.saving) return false
  if (doc.overlay.size === 0 && !targetPath) return true

  store.patchDoc(bufferId, { saving: true })
  const overlay = Array.from(doc.overlay.entries())
  const res = await window.api.largeJson.save(doc.docId, overlay, targetPath)
  const fresh = useLargeJsonStore.getState()
  if (res.error) {
    fresh.patchDoc(bufferId, { saving: false })
    ui.addToast(`Save failed: ${res.error}`, 'error')
    return false
  }
  const newPath = targetPath ?? doc.filePath
  fresh.clearOverlay(bufferId)
  fresh.patchDoc(bufferId, {
    saving: false,
    filePath: newPath,
    size: res.size,
    // The worker re-indexes right after saving; progress events flip this back.
    indexing: true,
    searchResults: null,
    searchQuery: '',
    searchOpId: null
  })
  const editor = useEditorStore.getState()
  if (targetPath && targetPath !== doc.filePath) {
    window.api.watch.remove(doc.filePath)
    window.api.watch.add(targetPath)
  }
  editor.updateBuffer(bufferId, { isDirty: false, mtime: res.mtime, filePath: newPath, title: basename(newPath) })
  window.api.file.addRecent(newPath)
  return true
}

/** Drop pending edits and rebuild the index from disk (Reload). */
export async function reloadLargeJson(bufferId: string): Promise<void> {
  const store = useLargeJsonStore.getState()
  const doc = store.docs[bufferId]
  if (!doc?.docId) return
  store.clearOverlay(bufferId)
  store.patchDoc(bufferId, { indexing: true, searchResults: null, searchQuery: '', searchOpId: null })
  await window.api.largeJson.reindex(doc.docId)
}

export function closeLargeJsonDoc(bufferId: string): void {
  const store = useLargeJsonStore.getState()
  const doc = store.docs[bufferId]
  if (doc?.docId) void window.api.largeJson.close(doc.docId)
  store.removeDoc(bufferId)
}
