import { describe, it, expect } from 'vitest'
import { mergeRecents, RECENT_MAX } from '../../src/main/recentList'

// Moved from e2e phase5-recent-files.spec.ts (Scenarios 34, 35): recent-files MRU list logic.
describe('mergeRecents', () => {
  it('prepends a new path', () => {
    expect(mergeRecents(['/a', '/b'], '/c')).toEqual(['/c', '/a', '/b'])
  })

  it('caps the list at 15 entries, dropping the oldest', () => {
    expect(RECENT_MAX).toBe(15)
    let list: string[] = []
    for (let i = 0; i < 16; i++) list = mergeRecents(list, `/file-${i}`)
    expect(list).toHaveLength(15)
    expect(list[0]).toBe('/file-15')
    expect(list).not.toContain('/file-0')
  })

  it('moves a re-opened path to the front without duplicating it', () => {
    const list = mergeRecents(['/other', '/recent', '/x'], '/recent')
    expect(list).toEqual(['/recent', '/other', '/x'])
    expect(list.filter((f) => f === '/recent')).toHaveLength(1)
  })

  it('honours a custom max', () => {
    expect(mergeRecents(['/a', '/b', '/c'], '/d', 2)).toEqual(['/d', '/a'])
  })
})
