import * as fs from 'fs'
import * as path from 'path'
import * as iconv from 'iconv-lite'
import * as chardet from 'chardet'

export interface FindInFilesOptions {
  searchId?: string
  pattern: string
  isRegex: boolean
  isCaseSensitive: boolean
  isWholeWord: boolean
  directory: string
  fileFilter: string
  isRecursive: boolean
}

export interface FindResultLine {
  lineNumber: number
  column: number
  endColumn: number
  lineText: string
  matchText: string
}

export interface FindResultFile {
  filePath: string
  title: string
  results: FindResultLine[]
}

export const FIND_IN_FILES_MAX_PER_FILE = 500
/** Yield to the event loop every N directory visits while walking. */
const ASYNC_YIELD_EVERY_DIRS = 64
/** Concurrent file reads in streaming search. */
export const FIND_IN_FILES_V2_CONCURRENCY = 64

export function parseFilter(filter: string): RegExp {
  if (!filter || filter === '*' || filter === '*.*') return /.*/

  const patterns = filter.trim().split(/\s+/).map((f) => {
    const escaped = f
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    return `(${escaped})`
  })

  return new RegExp(patterns.join('|') + '$', 'i')
}

export async function* collectFilesAsync(
  dir: string,
  filterRe: RegExp,
  recursive: boolean
): AsyncGenerator<string> {
  let dirVisits = 0

  async function* walk(current: string): AsyncGenerator<string> {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    dirVisits++
    if (dirVisits % ASYNC_YIELD_EVERY_DIRS === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve))
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

      const full = path.join(current, entry.name)

      if (entry.isDirectory()) {
        if (recursive) yield* walk(full)
      } else if (entry.isFile()) {
        if (filterRe.test(entry.name)) {
          yield full
        }
      }
    }
  }

  yield* walk(dir)
}

/**
 * Fast encoding detection with binary-file guard.
 * Returns null if the file looks binary (should be skipped).
 * Avoids running chardet on the full buffer — uses a 4KB sample instead.
 */
function detectEncodingFast(raw: Buffer): string | null {
  const checkLen = Math.min(raw.length, 4096)
  // Binary check: null byte in first 4KB → skip
  for (let i = 0; i < checkLen; i++) {
    if (raw[i] === 0) return null
  }
  // ASCII fast-path: no byte > 127 in first 1KB → definitely UTF-8
  const asciiLen = Math.min(raw.length, 1024)
  for (let i = 0; i < asciiLen; i++) {
    if (raw[i] > 127) {
      // Has multi-byte chars → run chardet on 4KB sample only
      return chardet.detect(raw.slice(0, 4096)) || 'UTF-8'
    }
  }
  return 'UTF-8'
}

function searchContent(content: string, re: RegExp): FindResultLine[] {
  const results: FindResultLine[] = []
  const maxPer = FIND_IN_FILES_MAX_PER_FILE
  const len = content.length
  let lineStart = 0
  let lineNumber = 1

  while (lineStart <= len && results.length < maxPer) {
    let lineEnd = content.indexOf('\n', lineStart)
    if (lineEnd === -1) lineEnd = len

    // Strip trailing \r for \r\n line endings
    const crAdjust = lineEnd > lineStart && content[lineEnd - 1] === '\r' ? 1 : 0
    const lineText = content.slice(lineStart, lineEnd - crAdjust)

    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(lineText)) !== null) {
      results.push({
        lineNumber,
        column: match.index + 1,
        endColumn: match.index + match[0].length + 1,
        lineText: lineText.length > 500 ? lineText.slice(0, 500) + '…' : lineText,
        matchText: match[0]
      })

      if (match[0].length === 0) {
        re.lastIndex++
      }

      if (!re.global) break
    }

    lineStart = lineEnd + 1
    lineNumber++
  }

  return results
}

export function searchBuffer(raw: Buffer, re: RegExp): FindResultLine[] {
  const encoding = detectEncodingFast(raw)
  if (encoding === null) return []  // binary file

  let content: string
  try {
    content = iconv.decode(raw, encoding)
  } catch {
    return []
  }

  return searchContent(content, re)
}

export function buildRegExp(opts: FindInFilesOptions): RegExp | null {
  try {
    let src = opts.pattern
    if (!opts.isRegex) {
      src = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    if (opts.isWholeWord) {
      src = `\\b${src}\\b`
    }
    const flags = 'g' + (opts.isCaseSensitive ? '' : 'i')
    return new RegExp(src, flags)
  } catch {
    return null
  }
}
