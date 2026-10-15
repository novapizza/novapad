/**
 * Unsaved Table Lens edits, per editor buffer.
 *
 * Table Lens keeps its edits in its own grid state until they are saved. While it has some,
 * the preview pane registers a flush function here and marks the tab dirty, so every path that
 * reads a buffer's text — Save, Save As, Save All, AutoSave, quit backups — can move the table
 * into the text first. See .docs/features/table-lens-sync.
 */

/** Writes the table into the buffer's text. Resolves false when the user declined. */
export type TableFlush = () => Promise<boolean>

const pending = new Map<string, TableFlush>()

export function setPendingTableEdits(bufferId: string, flush: TableFlush | null): void {
  if (flush) pending.set(bufferId, flush)
  else pending.delete(bufferId)
}

export function hasPendingTableEdits(bufferId: string): boolean {
  return pending.has(bufferId)
}

/** Move the buffer's unsaved table edits into its text. True when there was nothing to do or it worked. */
export async function flushTableEdits(bufferId: string): Promise<boolean> {
  const flush = pending.get(bufferId)
  return flush ? flush() : true
}

export async function flushAllTableEdits(): Promise<void> {
  for (const id of [...pending.keys()]) await flushTableEdits(id)
}
