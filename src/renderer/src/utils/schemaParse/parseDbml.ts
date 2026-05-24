import type { SchemaColumn, SchemaModel, SchemaRef, SchemaTable } from './types'

// dbdiagram.io DBML parser. Handles:
//   Table users {
//     id integer [pk]
//     email varchar [unique, not null]
//   }
//
//   Ref: posts.user_id > users.id     // many-to-one
//   Ref: posts.user_id - users.id     // one-to-one
//
// Plus inline refs on column rows:
//   user_id integer [ref: > users.id]

const TABLE_BLOCK_RE = /\bTable\s+["`]?([\w.]+)["`]?\s*(?:as\s+\w+\s*)?\{([\s\S]*?)\}/g
const STANDALONE_REF_RE = /^Ref(?:\s+\w+)?\s*:\s*([\w.]+)\.(\w+)\s*[-<>]+\s*([\w.]+)\.(\w+)/gm
const INLINE_REF_RE = /\bref:\s*[-<>]+\s*([\w.]+)\.(\w+)/i
const COMMENT_RE = /\/\/.*$|\/\*[\s\S]*?\*\//gm

function stripComments(src: string): string {
  return src.replace(COMMENT_RE, '')
}

export function parseDbml(source: string): SchemaModel {
  const clean = stripComments(source)
  const tables: SchemaTable[] = []
  const refs: SchemaRef[] = []

  let match: RegExpExecArray | null
  TABLE_BLOCK_RE.lastIndex = 0
  while ((match = TABLE_BLOCK_RE.exec(clean)) !== null) {
    const tableName = match[1]
    const body = match[2]
    const columns: SchemaColumn[] = []

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim()
      if (!line) continue
      // Skip nested directives like `indexes { ... }` and similar — they're
      // single-line attributes inside the table block we don't care about.
      if (line.startsWith('indexes') || line.startsWith('Note:') || line === '}') continue

      // `name type [opts]` — opts is an optional bracketed list.
      const colMatch = line.match(/^(["`]?)(\w+)\1\s+([\w()<>,\s]+?)(?:\s*\[([^\]]*)\])?\s*$/)
      if (!colMatch) continue
      const [, , name, type, opts = ''] = colMatch
      const col: SchemaColumn = {
        name,
        type: type.trim(),
        pk: /\bpk\b/.test(opts) || /\bprimary key\b/i.test(opts),
        unique: /\bunique\b/.test(opts),
        nullable: /\bnot null\b/i.test(opts) ? false : undefined,
      }
      const inlineRef = opts.match(INLINE_REF_RE)
      if (inlineRef) {
        col.fk = { refTable: inlineRef[1], refCol: inlineRef[2] }
        refs.push({
          from: { table: tableName, col: name },
          to: { table: inlineRef[1], col: inlineRef[2] },
        })
      }
      columns.push(col)
    }

    tables.push({ name: tableName, columns })
  }

  // Standalone `Ref:` lines — these can appear before or after table blocks.
  STANDALONE_REF_RE.lastIndex = 0
  let refMatch: RegExpExecArray | null
  while ((refMatch = STANDALONE_REF_RE.exec(clean)) !== null) {
    const [, fromTable, fromCol, toTable, toCol] = refMatch
    refs.push({
      from: { table: fromTable, col: fromCol },
      to: { table: toTable, col: toCol },
    })
    // Best-effort: tag the source column with the FK so the row shows the arrow.
    const t = tables.find((x) => x.name === fromTable)
    const c = t?.columns.find((x) => x.name === fromCol)
    if (c && !c.fk) c.fk = { refTable: toTable, refCol: toCol }
  }

  return { tables, refs }
}
