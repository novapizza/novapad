// Edit-in-preview plumbing: map a rendered Markdown block back to the exact
// slice of source text it came from, so a double-click can edit that slice.

/** Block elements that can be edited. Inline marks (strong, a, code…) resolve
 *  to their enclosing block; table cells resolve to their row. */
const EDITABLE_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'tr', 'pre', 'blockquote', 'hr'])

/** Rendered as `data-md-src="start-end"` (offsets into the source string). */
export const SOURCE_ATTR = 'data-md-src'

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  position?: { start: { offset?: number }; end: { offset?: number } }
  children?: HastNode[]
}

/** Rehype plugin: stamps each editable block with its source offset range. */
export function rehypeSourceRange() {
  return (tree: HastNode): void => {
    const walk = (node: HastNode): void => {
      if (node.type === 'element' && node.tagName && EDITABLE_TAGS.has(node.tagName)) {
        const start = node.position?.start.offset
        const end = node.position?.end.offset
        if (start !== undefined && end !== undefined) {
          node.properties = { ...node.properties, dataMdSrc: `${start}-${end}` }
        }
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}

export interface SourceRange {
  start: number
  end: number
}

export function parseSourceRange(value: string | null | undefined): SourceRange | null {
  const m = /^(\d+)-(\d+)$/.exec(value ?? '')
  if (!m) return null
  const start = Number(m[1])
  const end = Number(m[2])
  return end >= start ? { start, end } : null
}

/**
 * The block a double-click on `target` should edit. A paragraph inside a
 * blockquote edits the whole quote — its own range would start after the
 * first `> ` but include the markers of later lines, which reads oddly.
 */
export function findEditableBlock(target: Element, root: Element): HTMLElement | null {
  const sel = `[${SOURCE_ATTR}]`
  const block =
    target.closest<HTMLElement>(`blockquote${sel}`) ?? target.closest<HTMLElement>(sel)
  return block && root.contains(block) ? block : null
}

/** Strip the source-range attributes from exported HTML. */
export function stripSourceRanges(html: string): string {
  return html.replace(/ data-md-src="\d+-\d+"/g, '')
}
