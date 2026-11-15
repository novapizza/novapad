/**
 * Pure Sticky Notes model: types, limits, validation and derived helpers.
 * Kept free of `window` / IPC so it is unit-testable from node; notesStore
 * re-exports everything here, so callers keep importing from the store.
 */

export type NoteColor = 'default' | 'yellow' | 'green' | 'blue' | 'pink' | 'purple'

const NOTE_COLORS: ReadonlySet<string> = new Set<NoteColor>([
  'default', 'yellow', 'green', 'blue', 'pink', 'purple'
])

export interface Note {
  /** crypto.randomUUID() — stable across restarts. */
  id: string
  /** Explicit title. Empty string means "derive from the first body line". */
  title: string
  body: string
  /** Monaco language id, used only when the note graduates to a tab. */
  language: string
  color: NoteColor
  pinned: boolean
  /** Epoch ms. */
  createdAt: number
  updatedAt: number
}

export interface NotesFile {
  /** Bump only on a breaking shape change; readers tolerate unknown future versions. */
  version: 1
  notes: Note[]
}

/** Hard cap on a single note body. Creation past it is refused; typing is clamped. */
export const MAX_NOTE_CHARS = 100_000
/** Soft cap on note count — warn once, never block. */
export const SOFT_MAX_NOTES = 500
/** Soft cap on the serialized file size — warn once, never block. */
export const SOFT_MAX_TOTAL_BYTES = 5 * 1024 * 1024
/** Display-only truncation of the derived title. */
export const TITLE_DISPLAY_CHARS = 60
/** Debounce before writing notes.json. */
export const SAVE_DEBOUNCE_MS = 500

/** Per-entry defensive guard. Invalid entries are dropped individually — one
 *  bad note must never lose the rest of the file. */
export function isValidNote(v: unknown): v is Note {
  if (!v || typeof v !== 'object') return false
  const n = v as Record<string, unknown>
  if (typeof n.id !== 'string' || !n.id) return false
  if (typeof n.body !== 'string') return false
  if (typeof n.createdAt !== 'number' || !Number.isFinite(n.createdAt)) return false
  if (typeof n.updatedAt !== 'number' || !Number.isFinite(n.updatedAt)) return false
  return true
}

/** Coerce a validated entry into a fully-populated Note, repairing soft fields. */
export function normalizeNote(n: Note & Record<string, unknown>): Note {
  return {
    id: n.id,
    title: typeof n.title === 'string' ? n.title : '',
    body: n.body.length > MAX_NOTE_CHARS ? n.body.slice(0, MAX_NOTE_CHARS) : n.body,
    language: typeof n.language === 'string' && n.language ? n.language : 'plaintext',
    color: typeof n.color === 'string' && NOTE_COLORS.has(n.color) ? (n.color as NoteColor) : 'default',
    pinned: typeof n.pinned === 'boolean' ? n.pinned : false,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt
  }
}

// ---------------------------------------------------------------------------
// Derived helpers — pure, and kept outside the store so NoteCard can call them
// without subscribing to it.
// ---------------------------------------------------------------------------

/** `title` when set, else the first non-empty body line, else 'Empty note'. */
export function displayTitle(note: Note): string {
  if (note.title.trim()) return note.title.trim().slice(0, TITLE_DISPLAY_CHARS)
  const line = note.body.split('\n').find((l) => l.trim().length > 0)
  if (!line) return 'Empty note'
  return line.trim().slice(0, TITLE_DISPLAY_CHARS)
}

/** Pinned first, then most-recently-updated. Returns a new array. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
}
