import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { remarkMathPlugin, REHYPE_MATH_PLUGINS } from '../../src/renderer/src/lib/markdown/math'
import { parseSourceRange, rehypeSourceRange } from '../../src/renderer/src/components/MarkdownPreview/sourceRange'

/** Render like the preview does (math → source-range stamping). */
function render(src: string, singleDollar = true): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkMathPlugin(singleDollar)],
        rehypePlugins: [...REHYPE_MATH_PLUGINS, rehypeSourceRange]
      },
      src
    )
  )
}

describe('markdown math', () => {
  it('typesets inline $…$ and display $$…$$ with KaTeX', () => {
    const html = render('Energy $E = mc^2$ here.\n\n$$\n\\frac{a}{b}\n$$\n')
    expect(html).toContain('class="katex"')
    expect(html).toContain('class="katex-display"')
    expect(html).toContain('<math')
    expect(html).not.toContain('$E')
  })

  it('renders ```math fences as display math', () => {
    expect(render('```math\nx^2\n```\n')).toContain('class="katex-display"')
  })

  it('leaves single dollars as text when the setting is off', () => {
    const html = render('Costs $5 and $10.\n\n$$x$$\n', false)
    expect(html).toContain('Costs $5 and $10.')
    expect(html).toContain('class="katex"') // $$…$$ still works
  })

  it('reads prices as math when single-dollar is on (documented trade-off)', () => {
    expect(render('Costs $5 and $10.')).toContain('class="katex"')
  })

  it('keeps \\$ as a literal dollar', () => {
    const html = render('Costs \\$5 and \\$10.')
    expect(html).toContain('Costs $5 and $10.')
    expect(html).not.toContain('katex')
  })

  it('stamps display math with its full source slice for edit-in-preview', () => {
    const src = 'Intro\n\n$$\n\\sum_{i=1}^n i\n$$\n'
    const html = render(src)
    const m = /<div class="math-block" data-md-src="(\d+-\d+)"/.exec(html)
    expect(m).not.toBeNull()
    const r = parseSourceRange(m![1])!
    expect(src.slice(r.start, r.end)).toBe('$$\n\\sum_{i=1}^n i\n$$')
  })

  it('shows bad LaTeX as an error instead of throwing', () => {
    const html = render('$\\frac{a$')
    expect(html).toContain('katex-error')
  })

  it('does not render \\href (trust is off)', () => {
    const html = render('$\\href{javascript:alert(1)}{x}$')
    expect(html).not.toContain('href="javascript')
  })
})
