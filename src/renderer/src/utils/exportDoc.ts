/**
 * Helpers for printing and exporting documents.
 *
 * Two output paths:
 *  - Printing / PDF go through the main process (window.api.print.*), which
 *    renders the HTML in an offscreen window and calls Chromium's print /
 *    printToPDF. These helpers build that HTML.
 *  - Plain file exports (HTML, JSON, schema) save directly from the renderer
 *    via a Blob download — the same mechanism TableLens already uses for CSV.
 */

/** Escape a string for safe interpolation into HTML text/attribute context. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Trigger a client-side download of `text` as a file named `filename`. */
export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const PRINT_PAGE_CSS = `
  @page { margin: 1.6cm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #111;
    background: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc-title {
    font-size: 14px;
    font-weight: 700;
    margin: 0 0 12px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid #ccc;
    word-break: break-all;
  }
`

/**
 * Build a standalone, print-ready HTML document for a plain-text / code buffer.
 * Renders the content in a line-numbered monospace table so long files paginate
 * cleanly and line numbers stay aligned.
 */
export function buildPlainDocumentHtml(opts: {
  title: string
  content: string
  withLineNumbers?: boolean
}): string {
  const { title, content, withLineNumbers = true } = opts
  const lines = content.split(/\r\n|\r|\n/)
  const rows = lines
    .map((line, i) => {
      const num = withLineNumbers
        ? `<td class="ln">${i + 1}</td>`
        : ''
      return `<tr>${num}<td class="code">${escapeHtml(line) || '&nbsp;'}</td></tr>`
    })
    .join('')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
${PRINT_PAGE_CSS}
  table.src { border-collapse: collapse; width: 100%; }
  table.src td { vertical-align: top; padding: 0 0 0 8px; }
  table.src td.ln {
    width: 1%;
    padding: 0 10px 0 0;
    text-align: right;
    color: #999;
    user-select: none;
    border-right: 1px solid #ddd;
    font-variant-numeric: tabular-nums;
  }
  table.src td.code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style></head>
<body>
  <div class="doc-title">${escapeHtml(title)}</div>
  <table class="src">${rows}</table>
</body></html>`
}

/**
 * Wrap already-rendered body HTML (e.g. a Markdown preview's innerHTML) into a
 * standalone document with self-contained styling, suitable for export-to-HTML
 * or print-to-PDF. `bodyHtml` is trusted markup produced by our own renderer.
 */
export function buildStandaloneHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
${PRINT_PAGE_CSS}
  body { max-width: 900px; margin: 0 auto; padding: 24px; }
  h1, h2, h3, h4 { line-height: 1.25; margin-top: 1.4em; }
  h1 { font-size: 1.8em; border-bottom: 1px solid #ddd; padding-bottom: .3em; }
  h2 { font-size: 1.4em; border-bottom: 1px solid #eee; padding-bottom: .3em; }
  pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow-x: auto; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .9em; }
  pre code { background: none; padding: 0; }
  :not(pre) > code { background: #f0f1f2; padding: .15em .35em; border-radius: 4px; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; }
  blockquote { margin: 0; padding-left: 1em; border-left: 3px solid #ddd; color: #555; }
  img { max-width: 100%; }
  a { color: #0366d6; }
</style></head>
<body>${bodyHtml}</body></html>`
}
