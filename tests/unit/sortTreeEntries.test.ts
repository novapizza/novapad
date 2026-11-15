import { describe, it, expect } from 'vitest'
import { sortTreeEntries } from '../../src/renderer/src/utils/sortTreeEntries'

// Moved from e2e open-folder.spec.ts (Scenario A-3): File Browser tree ordering.
describe('sortTreeEntries', () => {
  it('puts directories before files, then sorts alphabetically', () => {
    const entries = [
      { name: 'zebra.txt', isDir: false },
      { name: 'banana', isDir: true },
      { name: 'apple.txt', isDir: false },
      { name: 'alpha', isDir: true },
    ]
    expect(sortTreeEntries(entries).map((e) => e.name)).toEqual(['alpha', 'banana', 'apple.txt', 'zebra.txt'])
  })

  it('does not mutate its input and keeps extra fields', () => {
    const entries = [
      { name: 'b', isDir: false, path: '/x/b' },
      { name: 'a', isDir: false, path: '/x/a' },
    ]
    const sorted = sortTreeEntries(entries)
    expect(entries.map((e) => e.name)).toEqual(['b', 'a'])
    expect(sorted[0]).toEqual({ name: 'a', isDir: false, path: '/x/a' })
  })
})
