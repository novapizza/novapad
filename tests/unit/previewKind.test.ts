import { describe, it, expect } from 'vitest'
import { detectPreviewKind } from '../../src/renderer/src/utils/previewKind'

describe('detectPreviewKind', () => {
  it('routes JSON by language or by a { / [ body sniff on untitled buffers', () => {
    expect(detectPreviewKind('json', null, null)).toBe('json')
    expect(detectPreviewKind('plaintext', null, '{"name":"novapad"}')).toBe('json')
    expect(detectPreviewKind('plaintext', null, '  \n[1,2]')).toBe('json')
  })

  it('returns null for a plaintext buffer, so no preview pane mounts', () => {
    expect(detectPreviewKind('plaintext', null, 'just a plain text line, no braces')).toBeNull()
    expect(detectPreviewKind('plaintext', null, '')).toBeNull()
    expect(detectPreviewKind(undefined, undefined, undefined)).toBeNull()
  })

  it('routes markdown, csv/tsv and sqlplan', () => {
    expect(detectPreviewKind('markdown', 'a.md', '{')).toBe('markdown')
    expect(detectPreviewKind('plaintext', 'C:/x/People.CSV', null)).toBe('csv')
    expect(detectPreviewKind('plaintext', 'x.tsv', null)).toBe('csv')
    expect(detectPreviewKind('csv', null, null)).toBe('csv')
    expect(detectPreviewKind('xml', 'q.sqlplan', null)).toBe('sqlplan')
    expect(detectPreviewKind('xml', 'q.xml', '<ShowPlanXML xmlns="...">')).toBe('sqlplan')
    expect(detectPreviewKind('xml', 'q.xml', '<root/>')).toBeNull()
  })
})
