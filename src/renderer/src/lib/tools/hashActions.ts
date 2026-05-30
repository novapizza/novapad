/**
 * Hashing menu verbs, shared by the custom React MenuBar (Win/Linux) and the
 * native-menu IPC path (macOS). Everything runs in the renderer so we can read
 * the Monaco selection and the clipboard; the digest itself is computed in the
 * main process via `window.api.tools.*` (Node crypto — supports MD5).
 */
import { useUIStore } from '../../store/uiStore'
import { editorRegistry } from '../../utils/editorRegistry'

export type HashAlgo = 'md5' | 'sha1' | 'sha256' | 'sha512'

export const HASH_ALGOS: { id: HashAlgo; label: string }[] = [
  { id: 'md5', label: 'MD5' },
  { id: 'sha1', label: 'SHA-1' },
  { id: 'sha256', label: 'SHA-256' },
  { id: 'sha512', label: 'SHA-512' }
]

export function algoLabel(algo: HashAlgo): string {
  return HASH_ALGOS.find((a) => a.id === algo)?.label ?? algo.toUpperCase()
}

/** "Generate…" — open the Hash tool with the algorithm pre-selected, text mode. */
export function openHashGenerator(algo: HashAlgo): void {
  useUIStore.getState().openTool('hash', { algo, mode: 'text' })
}

/** "Generate from files…" — pick files, hash them in main, show results in the panel. */
export async function hashFromFiles(algo: HashAlgo): Promise<void> {
  const res = await window.api.tools.hashFiles(algo)
  if (res.canceled) return
  if (res.error) {
    useUIStore.getState().addToast(res.error, 'error')
    return
  }
  useUIStore.getState().openTool('hash', { algo, mode: 'files', files: res.files })
}

/** Read the current editor selection (or whole buffer if no selection). */
function getEditorSelectionOrBuffer(): string {
  const editor = editorRegistry.get()
  if (!editor) return ''
  const model = editor.getModel()
  if (!model) return ''
  const sel = editor.getSelection()
  if (sel && !sel.isEmpty()) return model.getValueInRange(sel)
  return model.getValue()
}

/** "Generate from selection into clipboard" — hash the selection, copy the hex, toast. */
export async function hashSelectionToClipboard(algo: HashAlgo): Promise<void> {
  const text = getEditorSelectionOrBuffer()
  const ui = useUIStore.getState()
  if (!text) {
    ui.addToast('Nothing to hash — open a file or select some text first.', 'warn')
    return
  }
  const res = await window.api.tools.hash(algo, text)
  if (res.error || !res.hex) {
    ui.addToast(res.error ?? 'Hashing failed', 'error')
    return
  }
  try {
    await navigator.clipboard.writeText(res.hex)
    ui.addToast(`${algoLabel(algo)} copied to clipboard`, 'info')
  } catch {
    ui.addToast('Could not access the clipboard', 'error')
  }
}
