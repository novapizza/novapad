export type PreviewKind = 'markdown' | 'sqlplan' | 'csv' | 'json'

/**
 * Decide which preview component (if any) applies to a buffer. Pass `content`
 * to enable body-sniffing for untitled JSON/SQL-plan buffers; pass null when
 * you only want an extension/language decision (e.g. deciding whether to show
 * the editor's preview toggle without re-running on every keystroke).
 */
export function detectPreviewKind(
  language: string | null | undefined,
  filePath: string | null | undefined,
  content: string | null | undefined
): PreviewKind | null {
  if (language === 'markdown') return 'markdown'
  // .csv / .tsv extension wins (Monaco may load these as plain text).
  const ext = filePath?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (ext === 'csv' || ext === 'tsv') return 'csv'
  if (language === 'csv') return 'csv'
  // .sqlplan files load as XML in Monaco; detect by extension OR by content
  // so any XML buffer containing a SQL Server ShowPlan is also routed here.
  if (ext === 'sqlplan') return 'sqlplan'
  if ((language === 'xml' || language === 'html') && content) {
    const head = content.slice(0, 4096)
    if (/<ShowPlanXML|http:\/\/schemas\.microsoft\.com\/sqlserver\/2004\/07\/showplan/.test(head)) {
      return 'sqlplan'
    }
  }
  // JSON: either Monaco language is json, or buffer body starts with { or [.
  // The body-sniff covers untitled tabs where the user just pasted raw JSON
  // before Magika has refined the language.
  if (language === 'json') return 'json'
  if (content) {
    const head = content.trimStart().slice(0, 1)
    if (head === '{' || head === '[') return 'json'
  }
  return null
}
