import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  parseSourceRange,
  rehypeSourceRange,
  stripSourceRanges
} from '../../src/renderer/src/components/MarkdownPreview/sourceRange'

/** Render like the preview does and return [tag, source slice] per stamped block. */
function stamped(src: string): [string, string][] {
  const html = renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSourceRange] }, src)
  )
  return [...html.matchAll(/<(\w+)[^>]*? data-md-src="(\d+-\d+)"/g)].map((m) => {
    const r = parseSourceRange(m[2])!
    return [m[1], src.slice(r.start, r.end)]
  })
}

describe('rehypeSourceRange', () => {
  it('maps each editable block back to its exact source slice', () => {
    const src =
      '# Title\n\nPara with **bold** and `code`.\n\n| A | B |\n|---|--:|\n| 1 | 2 |\n\n' +
      '- one\n- two\n\n> quoted\n> text\n\n```js\nconst x = 1\n```\n\n---\n'
    expect(stamped(src)).toEqual([
      ['h1', '# Title'],
      ['p', 'Para with **bold** and `code`.'],
      ['tr', '| A | B |'],
      ['tr', '| 1 | 2 |'],
      ['li', '- one'],
      ['li', '- two'],
      ['blockquote', '> quoted\n> text'],
      ['p', 'quoted\n> text'],
      ['pre', '```js\nconst x = 1\n```'],
      ['hr', '---']
    ])
  })

  it('does not stamp inline marks or table cells', () => {
    const tags = stamped('a **b** [c](d)\n\n| x |\n|---|\n| y |\n').map(([t]) => t)
    expect(tags).not.toContain('strong')
    expect(tags).not.toContain('a')
    expect(tags).not.toContain('td')
    expect(tags).not.toContain('th')
  })

  it('offsets stay correct with CRLF line endings', () => {
    expect(stamped('# One\r\n\r\nTwo\r\nlines\r\n')).toEqual([
      ['h1', '# One'],
      ['p', 'Two\r\nlines']
    ])
  })
})

describe('parseSourceRange / stripSourceRanges', () => {
  it('parses valid ranges and rejects junk', () => {
    expect(parseSourceRange('3-10')).toEqual({ start: 3, end: 10 })
    expect(parseSourceRange('10-3')).toBeNull()
    expect(parseSourceRange('x')).toBeNull()
    expect(parseSourceRange(null)).toBeNull()
  })

  it('strips the attributes from exported HTML', () => {
    expect(stripSourceRanges('<h1 data-md-src="0-7">Title</h1>')).toBe('<h1>Title</h1>')
  })
})
