import type { SchemaColumn, SchemaModel, SchemaRef, SchemaTable } from './types'

// Lenient Prisma-schema parser. Only inspects `model X { ... }` blocks and the
// fields inside them — datasource / generator / enum / view blocks are skipped.
// Built for visualisation, not validation; malformed input is silently ignored
// where possible so the diagram stays usable on a half-typed schema.

const MODEL_BLOCK_RE = /\bmodel\s+(\w+)\s*\{([\s\S]*?)\}/g
const COMMENT_RE = /\/\/.*$|\/\*[\s\S]*?\*\//gm

interface RelationInfo {
  // The Prisma virtual relation field (e.g. `posts Post[]`) — owns the
  // @relation directive but has no real column. We capture the listed
  // `fields: [..]` and `references: [..]` so we can link them to the actual
  // scalar columns on the model.
  fromFields: string[]
  toRefs: string[]
  toTable: string
}

function stripComments(src: string): string {
  return src.replace(COMMENT_RE, '')
}

function parseRelation(attr: string): { fromFields: string[]; toRefs: string[] } {
  const fields = attr.match(/fields:\s*\[([^\]]*)\]/)?.[1] ?? ''
  const refs = attr.match(/references:\s*\[([^\]]*)\]/)?.[1] ?? ''
  return {
    fromFields: fields.split(',').map((s) => s.trim()).filter(Boolean),
    toRefs: refs.split(',').map((s) => s.trim()).filter(Boolean),
  }
}

export function parsePrisma(source: string): SchemaModel {
  const clean = stripComments(source)
  const tables: SchemaTable[] = []
  const refs: SchemaRef[] = []
  const pendingRelations: Array<{ from: string; info: RelationInfo }> = []

  let match: RegExpExecArray | null
  while ((match = MODEL_BLOCK_RE.exec(clean)) !== null) {
    const tableName = match[1]
    const body = match[2]
    const columns: SchemaColumn[] = []

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('@@')) continue
      // Field row: `name Type[ ] [@id @relation(...) ...]`
      const fieldMatch = line.match(/^(\w+)\s+([\w[\]?]+)\s*(.*)$/)
      if (!fieldMatch) continue
      const [, name, type, rest] = fieldMatch

      const isList = type.endsWith('[]')
      const baseType = type.replace(/[?[\]]+$/g, '')

      const relationMatch = rest.match(/@relation\(([^)]*)\)/)
      if (relationMatch) {
        const info = parseRelation(relationMatch[1])
        // Strip optional/list suffix on the target type to get the model name.
        if (info.fromFields.length && info.toRefs.length) {
          pendingRelations.push({ from: tableName, info: { ...info, toTable: baseType } })
        }
        // A relation virtual field (no scalar column on this side) — skip it
        // so we don't render an unresolved row like `author User`.
        if (info.fromFields.length === 0 || isList) continue
      }

      columns.push({
        name,
        type,
        pk: /@id\b/.test(rest),
        unique: /@unique\b/.test(rest),
        nullable: type.endsWith('?'),
      })
    }

    tables.push({ name: tableName, columns })
  }

  // After all tables are collected, resolve relation FKs onto the scalar
  // columns named in @relation(fields: ...).
  for (const { from, info } of pendingRelations) {
    const fromTable = tables.find((t) => t.name === from)
    if (!fromTable) continue
    for (let i = 0; i < info.fromFields.length; i++) {
      const colName = info.fromFields[i]
      const refColName = info.toRefs[i] ?? info.toRefs[0]
      const col = fromTable.columns.find((c) => c.name === colName)
      if (col) col.fk = { refTable: info.toTable, refCol: refColName }
      refs.push({
        from: { table: from, col: colName },
        to: { table: info.toTable, col: refColName },
      })
    }
  }

  return { tables, refs }
}
