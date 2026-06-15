/**
 * Lightweight fuzzy subsequence matcher for the Quick Open palette.
 *
 * Pure JS, no dependencies. Matches the query characters in order against a
 * target string (subsequence match), scoring matches that are consecutive, at
 * the start of the string, or right after a path/word separator more highly —
 * so "fbp" ranks `FileBrowserPanel.tsx` above an incidental scatter match.
 */

export interface FuzzyMatch<T> {
  item: T
  score: number
  /** Indices into the matched string that were hit — for bold highlighting. */
  matchRanges: number[]
}

const SEPARATORS = new Set(['/', '\\', '.', '-', '_', ' '])

/**
 * Score a single query against a target. Returns null when query is not a
 * subsequence of target. Matching is case-insensitive; an uppercase target
 * char that matches a query char still scores a small camelCase bonus.
 */
function scoreOne(query: string, target: string): { score: number; ranges: number[] } | null {
  if (!query) return { score: 0, ranges: [] }
  const tLower = target.toLowerCase()
  const qLower = query.toLowerCase()

  const ranges: number[] = []
  let score = 0
  let qi = 0
  let prevMatch = -2

  for (let ti = 0; ti < target.length && qi < qLower.length; ti++) {
    if (tLower[ti] !== qLower[qi]) continue

    let bonus = 1
    if (ti === prevMatch + 1) bonus += 5 // consecutive
    if (ti === 0) bonus += 8 // very start
    else if (SEPARATORS.has(target[ti - 1])) bonus += 6 // after separator
    else if (target[ti] >= 'A' && target[ti] <= 'Z') bonus += 4 // camelCase hump

    score += bonus
    ranges.push(ti)
    prevMatch = ti
    qi++
  }

  if (qi < qLower.length) return null // not all query chars consumed
  // Mild penalty for long targets so shorter, tighter matches float up.
  score -= target.length * 0.05
  return { score, ranges }
}

/**
 * Filter + rank `items`. Each item is matched on its `name` (preferred, ranges
 * apply to the name) and falls back to its `path` (ranges then apply to the
 * path — caller can decide whether to render path highlights). Returns matches
 * sorted by descending score, capped to `limit`.
 */
export function fuzzyFilter<T extends { name: string; path: string }>(
  query: string,
  items: T[],
  limit = 50
): FuzzyMatch<T>[] {
  const q = query.trim()
  if (!q) {
    // No query: return the first `limit` items in their natural order.
    return items.slice(0, limit).map((item) => ({ item, score: 0, matchRanges: [] }))
  }

  const matches: FuzzyMatch<T>[] = []
  for (const item of items) {
    const onName = scoreOne(q, item.name)
    if (onName) {
      // Name matches rank above path-only matches.
      matches.push({ item, score: onName.score + 100, matchRanges: onName.ranges })
      continue
    }
    const onPath = scoreOne(q, item.path)
    if (onPath) {
      matches.push({ item, score: onPath.score, matchRanges: [] })
    }
  }

  matches.sort((a, b) => b.score - a.score)
  return matches.slice(0, limit)
}
