/**
 * File Browser ordering: directories before files, then by name (locale-aware).
 * Pure so it can be unit-tested (tests/unit/sortTreeEntries.test.ts). Returns a new array.
 */
export function sortTreeEntries<T extends { name: string; isDir: boolean }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
