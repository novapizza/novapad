import { describe, it, expect } from 'vitest'
import { beautify, detectBeautifyFormat } from '../../src/renderer/src/utils/beautify'

describe('detectBeautifyFormat', () => {
  it('trusts the Monaco language first', () => {
    expect(detectBeautifyFormat('anything', 'json')).toBe('json')
    expect(detectBeautifyFormat('anything', 'html')).toBe('xml')
    expect(detectBeautifyFormat('anything', 'pgsql')).toBe('sql')
  })

  it('sniffs plaintext content', () => {
    expect(detectBeautifyFormat('{"broken": ', 'plaintext')).toBe('json')
    expect(detectBeautifyFormat('  [1,2]')).toBe('json')
    expect(detectBeautifyFormat('<root><a>1</a></root>')).toBe('xml')
    expect(detectBeautifyFormat('select a from t')).toBe('sql')
    expect(detectBeautifyFormat('just words')).toBeNull()
    expect(detectBeautifyFormat('   ')).toBeNull()
  })
})

describe('beautify', () => {
  it('reformats minified JSON and rejects invalid JSON', async () => {
    const minified = '{"a":1,"b":[2,3],"c":{"d":"e"}}'
    const out = await beautify(minified, 'json', 2)
    expect(JSON.parse(out)).toEqual(JSON.parse(minified))
    expect(out.split('\n').length).toBeGreaterThan(1)
    await expect(beautify('{"broken": ', 'json', 2)).rejects.toThrow()
  })

  it('reformats a single-line SQL query onto block-keyword lines', async () => {
    const out = await beautify('SELECT a, b FROM users WHERE id = 1 AND active = true', 'sql', 2)
    expect(out.split('\n').length).toBeGreaterThan(1)
    expect(out).toMatch(/^SELECT\b/m)
    expect(out).toMatch(/^FROM\b/m)
    expect(out).toMatch(/^WHERE\b/m)
  })

  it('reformats a single-line XML document with nesting', async () => {
    const out = await beautify('<root><a>1</a><b><c>2</c></b></root>', 'xml', 2)
    expect(out).toBe(['<root>', '  <a>1</a>', '  <b>', '    <c>2</c>', '  </b>', '</root>'].join('\n'))
  })
})
