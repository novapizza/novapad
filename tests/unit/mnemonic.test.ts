import { describe, it, expect } from 'vitest'
import { parseMnemonic, stripMnemonic } from '../../src/renderer/src/utils/mnemonicParse'

describe('parseMnemonic', () => {
  it('splits around the marked letter and upper-cases it', () => {
    expect(parseMnemonic('&File')).toEqual({ letter: 'F', before: '', mark: 'F', after: 'ile' })
    expect(parseMnemonic('Se&ttings')).toEqual({ letter: 'T', before: 'Se', mark: 't', after: 'tings' })
  })

  it('treats && as a literal ampersand on both sides of the mark', () => {
    expect(parseMnemonic('Date && Time — &Short')).toEqual({
      letter: 'S',
      before: 'Date & Time — ',
      mark: 'S',
      after: 'hort',
    })
    expect(parseMnemonic('Show &Control Characters && Unicode EOL').after).toBe('ontrol Characters & Unicode EOL')
  })

  it('returns no letter when there is no mark (or only a trailing &)', () => {
    expect(parseMnemonic('Plain')).toEqual({ letter: null, before: 'Plain', mark: '', after: '' })
    expect(parseMnemonic('Tom && Jerry').letter).toBeNull()
    expect(parseMnemonic('Trailing&').letter).toBeNull()
  })
})

describe('stripMnemonic', () => {
  it('drops single & and collapses &&', () => {
    expect(stripMnemonic('Sa&ve All')).toBe('Save All')
    expect(stripMnemonic('Date && Time — &Long')).toBe('Date & Time — Long')
  })
})
