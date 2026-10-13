import { useCallback, useEffect, useReducer, useRef } from 'react'

const PAGE = 100
const MAX_CACHED = 6000

/**
 * Page-cached access to raw record text. `get(i)` is pure (returns undefined
 * on a miss); call `ensure(indices)` from an effect over the visible range to
 * trigger fetches. The cache is dropped whenever `version` or `docId` changes.
 */
export function useRecordPager(docId: string | null, version: number) {
  const cache = useRef(new Map<number, string>())
  const inflight = useRef(new Set<number>())
  const [, bump] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    cache.current.clear()
    inflight.current.clear()
    bump()
  }, [docId, version])

  const ensure = useCallback(
    (indices: number[]) => {
      if (!docId) return
      const pages = new Set<number>()
      for (const i of indices) {
        if (!cache.current.has(i)) pages.add(Math.floor(i / PAGE))
      }
      for (const page of pages) {
        if (inflight.current.has(page)) continue
        inflight.current.add(page)
        const start = page * PAGE
        void window.api.largeJson.getRecords(docId, start, PAGE).then((r) => {
          inflight.current.delete(page)
          if (r.error || !r.records) return
          if (cache.current.size > MAX_CACHED) cache.current.clear()
          r.records.forEach((t, i) => cache.current.set(start + i, t))
          bump()
        })
      }
    },
    [docId]
  )

  const get = useCallback((index: number): string | undefined => cache.current.get(index), [])

  return { get, ensure }
}
