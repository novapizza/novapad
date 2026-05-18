// List operations ported from exifmaster-pro/utils/formatter.ts.
// Only the dedup/clean path is included — that's what Ctrl+Alt+Shift+C
// needs. The compare-mode and SQL-format paths from the original aren't
// wired here.

export interface ListCleanOptions {
  /** Drop duplicate lines. */
  removeDuplicates: boolean
  /** Lexicographic sort. */
  sort: 'none' | 'asc' | 'desc'
  /** Sort using `numeric` collation, so item2 < item10. */
  naturalSort: boolean
  /** Trim each line. */
  trim: boolean
  /** Drop empty / whitespace-only lines after trim. */
  removeEmpty: boolean
  /** When false, dedup + sort treat "Foo" and "foo" as the same line. */
  caseSensitive: boolean
}

export const DEFAULT_CLEAN_OPTIONS: ListCleanOptions = {
  removeDuplicates: true,
  sort: 'none',
  naturalSort: true,
  trim: true,
  removeEmpty: true,
  caseSensitive: false,
}

/**
 * Clean a newline-separated list of items. Preserves the original casing of
 * the first occurrence of each item.
 */
export function processListItems(input: string, options: ListCleanOptions): string {
  if (!input.trim()) return ''

  let items = input.split(/\r?\n/)
  if (options.trim) items = items.map((i) => i.trim())
  if (options.removeEmpty) items = items.filter((i) => i.length > 0)

  if (options.removeDuplicates) {
    if (options.caseSensitive) {
      items = Array.from(new Set(items))
    } else {
      const seen = new Set<string>()
      items = items.filter((i) => {
        const k = i.toLowerCase()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    }
  }

  if (options.sort !== 'none') {
    const collator = {
      numeric: options.naturalSort,
      sensitivity: options.caseSensitive ? ('variant' as const) : ('base' as const),
    }
    items.sort((a, b) =>
      options.sort === 'asc' ? a.localeCompare(b, undefined, collator) : b.localeCompare(a, undefined, collator)
    )
  }

  return items.join('\n')
}
