// LaTeX math for react-markdown: `$…$` / `$$…$$` / ```math via remark-math,
// typeset by KaTeX. Shared by the Markdown preview and the AI Assistant chat.
import type { Options as MarkdownOptions } from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
// Fonts referenced by this stylesheet are bundled locally by Vite (font-src 'self').
import 'katex/dist/katex.min.css'

type RemarkPlugin = NonNullable<MarkdownOptions['remarkPlugins']>[number]
type RehypePlugin = NonNullable<MarkdownOptions['rehypePlugins']>[number]

/** Class on the wrapper that gives a display-math block a source position. */
export const MATH_BLOCK_CLASS = 'math-block'

/**
 * remark-math. `singleDollar` off = only `$$…$$` and ```math are math, so text
 * like "costs $5 and $10" is never read as a formula.
 */
export const remarkMathPlugin = (singleDollar: boolean): RemarkPlugin =>
  [remarkMath, { singleDollarTextMath: singleDollar }] as RemarkPlugin

interface HastElement {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  position?: unknown
  children?: HastElement[]
}

const isMathPre = (node: HastElement): boolean =>
  node.type === 'element' &&
  node.tagName === 'pre' &&
  (node.children ?? []).some((c) => {
    const cls = c.properties?.className
    return c.tagName === 'code' && Array.isArray(cls) && cls.includes('language-math')
  })

/**
 * rehype-katex replaces a display-math `<pre>` with KaTeX output that has no
 * source position, so edit-in-preview could not find the block. Wrap the
 * `<pre>` first; the wrapper keeps the position and KaTeX renders inside it.
 */
function rehypeMathBlockWrap() {
  return (tree: HastElement): void => {
    const walk = (node: HastElement): void => {
      node.children?.forEach((child, i) => {
        if (isMathPre(child)) {
          node.children![i] = {
            type: 'element',
            tagName: 'div',
            properties: { className: [MATH_BLOCK_CLASS] },
            position: child.position,
            children: [child],
          }
        } else {
          walk(child)
        }
      })
    }
    walk(tree)
  }
}

/**
 * Must run before rehype-highlight (so ```math isn't treated as code) and
 * before source-range stamping. A formula with a LaTeX error renders as red
 * source text (rehype-katex's fallback) instead of breaking the document.
 * Input can be untrusted (AI replies, downloaded .md): `trust` stays off, so
 * \href, \includegraphics and \htmlClass are not rendered; `maxSize` caps
 * \rule / \kern sizes (em) and `maxExpand` caps macro expansion.
 */
export const REHYPE_MATH_PLUGINS: RehypePlugin[] = [
  rehypeMathBlockWrap as RehypePlugin,
  [rehypeKatex, { strict: 'ignore', trust: false, maxSize: 100, maxExpand: 1000 }] as RehypePlugin,
]

/** Elements whose text a find-in-preview must skip: KaTeX's hidden MathML copy.
 *  (Exports show that MathML instead — see MATH_EXPORT_CSS in utils/exportDoc.ts.) */
export const MATH_HIDDEN_SELECTOR = '.katex-mathml'
