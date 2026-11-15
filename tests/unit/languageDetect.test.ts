import { describe, it, expect } from 'vitest'
import { detectLanguage } from '../../src/renderer/src/utils/languageDetect'

describe('detectLanguage', () => {
  it('maps .md to markdown regardless of path style or case', () => {
    expect(detectLanguage('notes.md')).toBe('markdown')
    expect(detectLanguage('C:\\tmp\\untitled-saved.MD')).toBe('markdown')
    expect(detectLanguage('/tmp/dir/x.md')).toBe('markdown')
  })

  it('falls back to plaintext for unknown or missing extensions', () => {
    expect(detectLanguage('Untitled-1')).toBe('plaintext')
    expect(detectLanguage('file.unknownext')).toBe('plaintext')
  })
})
