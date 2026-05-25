export type BeautifyFormat = 'json' | 'xml' | 'sql'

// sql-formatter is ~1.6 MB unminified and only matters when the user actually
// beautifies SQL (Ctrl+Alt+Shift+M on a SQL buffer). Lazy-import so it lands
// in its own chunk and doesn't bloat the initial renderer bundle.
let _sqlFormatterPromise: Promise<typeof import('sql-formatter')> | null = null
function loadSqlFormatter() {
  if (!_sqlFormatterPromise) _sqlFormatterPromise = import('sql-formatter')
  return _sqlFormatterPromise
}

const SQL_LANGS = new Set(['sql', 'mysql', 'pgsql', 'plsql', 'tsql'])
const XML_LANGS = new Set(['xml', 'html', 'xhtml', 'svg'])

/** Map Monaco language ID → sql-formatter dialect. Defaults to 'tsql' because
 *  it understands [bracketed] identifiers, TOP, and @__p_N parameter names
 *  (very common in EF Core / SQL Server logs) where the generic 'sql' dialect
 *  bails out and leaves long single-line output. */
function sqlDialect(language?: string | null): string {
  switch (language) {
    case 'mysql': return 'mysql'
    case 'pgsql': return 'postgresql'
    case 'plsql': return 'plsql'
    case 'tsql': return 'tsql'
    default: return 'tsql'
  }
}

/**
 * Detect and parse EF Core / APM log output containing SQL with parameters.
 * Ported from exifmaster-pro/utils/formatter.ts.
 *
 * Expected format:
 *   [Parameters=["@p1='val1', @p2='guid' (Nullable = false) (DbType = Object)"],
 *    CommandType='"Text"', CommandTimeout='30']"\n""SELECT ... @p1 ..."
 *
 * Returns clean SQL with parameter values inlined, or null if input doesn't match.
 */
export function parseEfCoreLog(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('[Parameters=')) return null

  const paramStart = trimmed.indexOf('["')
  const paramEnd = trimmed.indexOf('"]')
  if (paramStart === -1 || paramEnd === -1) return null

  const paramString = trimmed.substring(paramStart + 2, paramEnd)
  const params = new Map<string, string>()
  const paramRegex = /(@[\w]+)='([^']*)'/g
  let m
  while ((m = paramRegex.exec(paramString)) !== null) params.set(m[1], m[2])

  const closingBracket = trimmed.indexOf(']', paramEnd + 2)
  if (closingBracket === -1) return null

  let sqlPart = trimmed.substring(closingBracket + 1)
  sqlPart = sqlPart.replace(/^["\\n\s]+/, '').replace(/["]+$/, '')
  sqlPart = sqlPart.replace(/\\n/g, '\n')
  if (!sqlPart.trim()) return null

  // Inline parameters, longest-name first (@__p_10 before @__p_1).
  const sorted = [...params.entries()].sort((a, b) => b[0].length - a[0].length)
  for (const [name, value] of sorted) {
    if (!value) continue
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const isNumeric = /^\d+(\.\d+)?$/.test(value)
    const replacement = isNumeric ? value : `'${value}'`
    sqlPart = sqlPart.replace(new RegExp(escaped, 'g'), replacement)
  }
  return sqlPart.trim()
}

export function detectBeautifyFormat(
  text: string,
  language?: string | null
): BeautifyFormat | null {
  if (language === 'json') return 'json'
  if (language && XML_LANGS.has(language)) return 'xml'
  if (language && SQL_LANGS.has(language)) return 'sql'

  const trimmed = text.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
  if (trimmed.startsWith('<')) return 'xml'
  if (
    /^\s*(WITH|SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE|ALTER|DROP|MERGE|TRUNCATE)\b/i.test(
      trimmed
    )
  ) {
    return 'sql'
  }
  return null
}

export async function beautify(
  text: string,
  format: BeautifyFormat,
  indent: string | number,
  language?: string | null
): Promise<string> {
  switch (format) {
    case 'json':
      return beautifyJson(text, indent)
    case 'xml':
      return beautifyXml(text, typeof indent === 'number' ? ' '.repeat(indent) : indent)
    case 'sql':
      return beautifySql(text, typeof indent === 'number' ? ' '.repeat(indent) : indent, language)
  }
}

function beautifyJson(text: string, indent: string | number): string {
  return JSON.stringify(JSON.parse(text), null, indent)
}

function beautifyXml(text: string, indent: string): string {
  const tokens: string[] = []
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const t = m[0]
    if (t.startsWith('<')) tokens.push(t)
    else if (t.trim()) tokens.push(t.trim())
  }

  if (!tokens.some((t) => t.startsWith('<'))) {
    throw new Error('No XML tags detected')
  }

  const out: string[] = []
  let depth = 0

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const isTag = t.startsWith('<')
    const isClose = isTag && t.startsWith('</')
    const isMeta = isTag && (t.startsWith('<?') || t.startsWith('<!'))
    const isSelfClose = isTag && !isClose && !isMeta && /\/\s*>$/.test(t)
    const isOpen = isTag && !isClose && !isMeta && !isSelfClose

    if (
      isOpen &&
      i + 2 < tokens.length &&
      !tokens[i + 1].startsWith('<') &&
      tokens[i + 2].startsWith('</')
    ) {
      out.push(indent.repeat(depth) + t + tokens[i + 1] + tokens[i + 2])
      i += 2
      continue
    }

    if (isClose) depth = Math.max(0, depth - 1)
    out.push(indent.repeat(depth) + t)
    if (isOpen) depth++
  }

  return out.join('\n')
}

const SQL_BLOCK_KEYWORDS = [
  'WITH',
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP BY',
  'HAVING',
  'ORDER BY',
  'LIMIT',
  'OFFSET',
  'UNION ALL',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'INSERT INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE FROM',
  'CREATE TABLE',
  'ALTER TABLE',
  'DROP TABLE',
  'INNER JOIN',
  'LEFT OUTER JOIN',
  'RIGHT OUTER JOIN',
  'FULL OUTER JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'CROSS JOIN',
  'JOIN',
  'ON',
  'AND',
  'OR'
].sort((a, b) => b.length - a.length)

/**
 * Smart SQL beautifier.
 *  1. If the input looks like an EF Core / APM log line, extract clean SQL
 *     and inline parameter values first.
 *  2. Pretty-print with `sql-formatter` (dialect-aware, industry-grade).
 *  3. If that throws, fall back to the heuristic block-keyword formatter so
 *     the user still gets *something* readable.
 */
async function beautifySql(text: string, indent: string, language?: string | null): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Empty SQL')

  const sqlSource = parseEfCoreLog(trimmed) ?? trimmed
  const { format: prettyPrintSql } = await loadSqlFormatter()

  try {
    return prettyPrintSql(sqlSource, {
      language: sqlDialect(language) as Parameters<typeof prettyPrintSql>[1]['language'],
      tabWidth: indent.length || 2,
      useTabs: indent.startsWith('\t'),
      keywordCase: 'upper',
      linesBetweenQueries: 2,
    })
  } catch {
    return beautifySqlLegacy(sqlSource, indent)
  }
}

/** Original heuristic formatter — fallback when sql-formatter rejects input. */
function beautifySqlLegacy(text: string, indent: string): string {
  const placeholders: string[] = []
  const stringOrCommentRe =
    /'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*"|--[^\n]*|\/\*[\s\S]*?\*\//g
  let working = text.replace(stringOrCommentRe, (s) => {
    placeholders.push(s)
    return `PH${placeholders.length - 1}`
  })

  working = working.replace(/\s+/g, ' ').trim()

  for (const kw of SQL_BLOCK_KEYWORDS) {
    const re = new RegExp(`\\b${kw.replace(/ /g, '\\s+')}\\b`, 'gi')
    working = working.replace(re, `\n${kw.toUpperCase()}`)
  }

  working = working.replace(/\s*\(\s*/g, ' (').replace(/\s*\)\s*/g, ') ')

  const rawLines = working
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const out: string[] = []
  let depth = 0
  for (const line of rawLines) {
    const startsWithClose = line.startsWith(')')
    const lineDepth = startsWithClose ? Math.max(0, depth - 1) : depth
    out.push(indent.repeat(lineDepth) + line)
    const opens = (line.match(/\(/g) || []).length
    const closes = (line.match(/\)/g) || []).length
    depth = Math.max(0, depth + opens - closes)
  }

  return out
    .join('\n')
    .replace(/PH(\d+)/g, (_, idx) => placeholders[Number(idx)])
}
