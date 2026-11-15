import { describe, it, expect } from 'vitest'
import { isValidNote, normalizeNote, sortNotes, MAX_NOTE_CHARS, type Note } from '../../src/renderer/src/utils/notes'

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n',
  title: '',
  body: '',
  language: 'plaintext',
  color: 'yellow',
  pinned: false,
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

describe('isValidNote', () => {
  it('accepts a complete note', () => {
    expect(isValidNote(note())).toBe(true)
  })

  it('accepts a minimal entry (id, body, timestamps)', () => {
    expect(isValidNote({ id: 'x', body: '', createdAt: 1, updatedAt: 2 })).toBe(true)
  })

  it('rejects null, primitives and entries missing required fields', () => {
    expect(isValidNote(null)).toBe(false)
    expect(isValidNote('note')).toBe(false)
    expect(isValidNote({ id: 'bad-no-timestamps', body: 'dropped' })).toBe(false)
    expect(isValidNote({ id: '', body: 'x', createdAt: 1, updatedAt: 1 })).toBe(false)
    expect(isValidNote({ id: 'x', body: 3, createdAt: 1, updatedAt: 1 })).toBe(false)
    expect(isValidNote({ id: 'x', body: 'x', createdAt: NaN, updatedAt: 1 })).toBe(false)
    expect(isValidNote({ id: 'x', body: 'x', createdAt: 1, updatedAt: Infinity })).toBe(false)
  })

  it('filters a partially-malformed list down to the valid entries', () => {
    const entries: unknown[] = [note({ id: 'good', body: 'survivor' }), { id: 'bad-no-timestamps', body: 'dropped' }, null]
    expect(entries.filter(isValidNote).map((n) => n.body)).toEqual(['survivor'])
  })
})

describe('normalizeNote', () => {
  it('repairs soft fields to defaults', () => {
    const n = normalizeNote({ id: 'x', body: 'b', createdAt: 1, updatedAt: 2 } as Note & Record<string, unknown>)
    expect(n).toEqual({
      id: 'x',
      title: '',
      body: 'b',
      language: 'plaintext',
      color: 'default',
      pinned: false,
      createdAt: 1,
      updatedAt: 2,
    })
  })

  it('keeps valid soft fields and drops unknown colours', () => {
    const kept = normalizeNote(note({ title: 'T', language: 'sql', color: 'pink', pinned: true }) as Note & Record<string, unknown>)
    expect(kept).toMatchObject({ title: 'T', language: 'sql', color: 'pink', pinned: true })
    const badColour = normalizeNote({ ...note(), color: 'chartreuse' } as unknown as Note & Record<string, unknown>)
    expect(badColour.color).toBe('default')
  })

  it('clamps an oversized body to MAX_NOTE_CHARS', () => {
    const n = normalizeNote(note({ body: 'x'.repeat(MAX_NOTE_CHARS + 10) }) as Note & Record<string, unknown>)
    expect(n.body.length).toBe(MAX_NOTE_CHARS)
  })
})

describe('sortNotes', () => {
  it('sorts pinned first, then most recently updated, without mutating the input', () => {
    const input = [
      note({ id: 'old', updatedAt: 1 }),
      note({ id: 'new', updatedAt: 3 }),
      note({ id: 'pinned-old', updatedAt: 0, pinned: true }),
      note({ id: 'mid', updatedAt: 2 }),
    ]
    const snapshot = input.map((n) => n.id)
    expect(sortNotes(input).map((n) => n.id)).toEqual(['pinned-old', 'new', 'mid', 'old'])
    expect(input.map((n) => n.id)).toEqual(snapshot)
  })
})
