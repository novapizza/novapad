/**
 * Pure list logic for the recent-files MRU list. Kept free of `electron` imports so it can be
 * unit-tested under vitest (see tests/unit/recentList.test.ts).
 */
export const RECENT_MAX = 15

/** Move `filePath` to the front of `list`, dropping any earlier copy, capped at `max` entries. */
export function mergeRecents(list: string[], filePath: string, max: number = RECENT_MAX): string[] {
  return [filePath, ...list.filter((f) => f !== filePath)].slice(0, max)
}
