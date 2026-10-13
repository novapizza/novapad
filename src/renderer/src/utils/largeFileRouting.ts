/**
 * Decides which open path a file takes based on its size and extension.
 *
 * - `normal`    — the existing Monaco path (file:read → iconv → model). Unchanged.
 * - `largeJson` — the record viewer (never materialises the file as a string).
 * - `tooLarge`  — refused with a friendly message. V8 cannot create a string
 *                 longer than 0x1fffffe8 (~512 Mi) chars, and Monaco is unusable
 *                 long before that, so the cap sits well below the hard wall.
 */

export type OpenRoute = 'normal' | 'largeJson' | 'tooLarge'

/** JSON-ish files at or above this size go to the record viewer. */
export const LARGE_JSON_THRESHOLD = 50 * 1024 * 1024 // 50 MB

/** Any other file above this size is refused. */
export const MAX_OPEN_BYTES = 256 * 1024 * 1024 // 256 MB

const JSON_EXTS = new Set(['json', 'ndjson', 'jsonl'])

export function isJsonLikePath(filePath: string): boolean {
  const ext = filePath.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return !!ext && JSON_EXTS.has(ext)
}

export function routeFileOpen(filePath: string, sizeBytes: number): OpenRoute {
  if (isJsonLikePath(filePath) && sizeBytes >= LARGE_JSON_THRESHOLD) return 'largeJson'
  if (sizeBytes > MAX_OPEN_BYTES) return 'tooLarge'
  return 'normal'
}

export function formatBytes(n: number): string {
  const trim = (s: string): string => s.replace(/\.0+$/, '')
  if (n >= 1024 ** 3) return `${trim((n / 1024 ** 3).toFixed(2))} GB`
  if (n >= 1024 ** 2) return `${trim((n / 1024 ** 2).toFixed(1))} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

export function tooLargeMessage(filePath: string, sizeBytes: number): string {
  const name = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
  return (
    `"${name}" is ${formatBytes(sizeBytes)} — larger than the ${formatBytes(MAX_OPEN_BYTES)} limit. ` +
    `Large .json / .ndjson files open in the record viewer; other formats are not supported yet.`
  )
}
