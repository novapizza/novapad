import { describe, it, expect } from 'vitest'
import {
  routeFileOpen,
  formatBytes,
  tooLargeMessage,
  isJsonLikePath,
  LARGE_JSON_THRESHOLD,
  MAX_OPEN_BYTES,
} from '../../src/renderer/src/utils/largeFileRouting'

const MB = 1024 * 1024

describe('routeFileOpen', () => {
  it('sends JSON-like files at or above 50 MB to the record viewer', () => {
    expect(routeFileOpen('a/big.json', LARGE_JSON_THRESHOLD)).toBe('largeJson')
    expect(routeFileOpen('big.NDJSON', 52 * MB)).toBe('largeJson')
    expect(routeFileOpen('big.jsonl', 300 * MB)).toBe('largeJson') // never refused: no string is built
  })

  it('keeps small JSON and mid-size other files on the normal path', () => {
    expect(routeFileOpen('small.json', LARGE_JSON_THRESHOLD - 1)).toBe('normal')
    expect(routeFileOpen('log.txt', MAX_OPEN_BYTES)).toBe('normal')
  })

  it('refuses non-JSON files over the 256 MB cap', () => {
    expect(routeFileOpen('huge.txt', 257 * MB)).toBe('tooLarge')
    expect(routeFileOpen('noext', MAX_OPEN_BYTES + 1)).toBe('tooLarge')
  })

  it('recognises JSON-like extensions case-insensitively', () => {
    expect(isJsonLikePath('C:\\x\\Data.JSON')).toBe(true)
    expect(isJsonLikePath('data.json.txt')).toBe(false)
    expect(isJsonLikePath('json')).toBe(false)
  })
})

describe('formatBytes', () => {
  it('formats B / KB / MB / GB and trims trailing zeros', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(256 * MB)).toBe('256 MB')
    expect(formatBytes(1.5 * MB)).toBe('1.5 MB')
    expect(formatBytes(1024 * MB)).toBe('1 GB')
    expect(formatBytes(1.25 * 1024 * MB)).toBe('1.25 GB')
  })
})

describe('tooLargeMessage', () => {
  it('names the file (basename, either slash style) and both sizes, with no V8 error text', () => {
    const msg = tooLargeMessage('C:\\tmp\\dir/huge.txt', 257 * MB)
    expect(msg).toMatch(/^"huge\.txt" is 257 MB — larger than the 256 MB limit\./)
    expect(msg).toContain('record viewer')
    expect(msg).not.toContain('0x1fffffe8')
  })
})
