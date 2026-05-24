import type { SchemaColumn, SchemaModel, SchemaRef, SchemaTable } from './types'

// DDL parser ported from exifmaster-pro/utils/dbSchemaParser.ts → parseSql().
// Handles:
//   - CREATE TABLE with balanced-paren body extraction (so DECIMAL(10,2),
//     CHECK(...), default expressions etc. don't break body capture)
//   - column definitions with PRIMARY KEY / NOT NULL / UNIQUE
//   - inline REFERENCES on a column (with optional trailing
//     ON DELETE / ON UPDATE clauses)
//   - standalone FOREIGN KEY (col, ...) REFERENCES other(col, ...)
//   - composite PRIMARY KEY (a, b)
//   - CONSTRAINT name PRIMARY KEY / FOREIGN KEY ...
//   - ALTER TABLE x ADD [CONSTRAINT ...] FOREIGN KEY (col) REFERENCES y(col)
//
// Earlier implementation used a greedy `[\w()]+(?:\s+\w+)*` for the type
// which silently swallowed REFERENCES/PRIMARY/NOT into the column "type"
// string, leaving the constraint-detection regexes (run on the leftover
// "rest") with nothing to match. Fixed by extracting the type as `WORD` or
// `WORD(...)` and re-running constraint detection on the original line.

const LINE_COMMENT_RE = /--[^\n]*/g
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g
const CREATE_TABLE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[]?[\w.]+[`"\]]?)\s*\(/gi
const ALTER_FK_RE =
  /ALTER\s+TABLE\s+([`"\[]?[\w.]+[`"\]]?)\s+ADD\s+(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/gi

function stripIdent(s: string): string {
  return s.trim().replace(/^[`"\[]|[`"\]]$/g, '')
}

function stripComments(src: string): string {
  return src.replace(BLOCK_COMMENT_RE, '').replace(LINE_COMMENT_RE, '')
}

/** Top-level comma split, respecting nested parens — keeps DECIMAL(10, 2) and
 *  `PRIMARY KEY (a, b)` intact as single defs. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let buf = ''
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      if (buf.trim()) parts.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) parts.push(buf.trim())
  return parts
}

function extractParenList(s: string): string[] {
  const m = /\(([^)]+)\)/.exec(s)
  if (!m) return []
  return m[1].split(',').map((c) => stripIdent(c.trim())).filter(Boolean)
}

/** Read characters after the opening `(` until the matching close paren —
 *  the body may contain nested parens for type lengths and CHECK clauses. */
function readBalancedBody(src: string, openIdx: number): { body: string; endIdx: number } {
  let depth = 1
  let i = openIdx
  let body = ''
  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) break
    }
    body += ch
    i++
  }
  return { body, endIdx: i }
}

export function parseDdl(source: string): SchemaModel {
  const clean = stripComments(source)
  const tables: SchemaTable[] = []
  const refs: SchemaRef[] = []

  CREATE_TABLE_RE.lastIndex = 0
  let createMatch: RegExpExecArray | null
  while ((createMatch = CREATE_TABLE_RE.exec(clean)) !== null) {
    const tableName = stripIdent(createMatch[1]).split('.').pop()!
    const openIdx = createMatch.index + createMatch[0].length
    const { body, endIdx } = readBalancedBody(clean, openIdx)
    // Resume scanning past this table's body. Without this, the next CREATE
    // TABLE inside the same string could be missed when its name contains the
    // previous body's text by coincidence.
    CREATE_TABLE_RE.lastIndex = endIdx

    const columns: SchemaColumn[] = []
    const tableLevelPks: string[] = []
    const tableLevelFks: { col: string; refTable: string; refCol: string }[] = []

    for (const part of splitTopLevel(body)) {
      const line = part.trim()
      if (!line) continue

      // Table-level PRIMARY KEY (a, b)
      if (/^PRIMARY\s+KEY/i.test(line)) {
        tableLevelPks.push(...extractParenList(line))
        continue
      }

      // Table-level FOREIGN KEY (a) REFERENCES other(id)
      if (/^FOREIGN\s+KEY/i.test(line)) {
        const colM = /FOREIGN\s+KEY\s*\(([^)]+)\)/i.exec(line)
        const refM = /REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/i.exec(line)
        if (colM && refM) {
          const fromCols = colM[1].split(',').map((s) => stripIdent(s.trim()))
          const toTable = stripIdent(refM[1]).split('.').pop()!
          const toCols = refM[2].split(',').map((s) => stripIdent(s.trim()))
          for (let i = 0; i < fromCols.length; i++) {
            tableLevelFks.push({
              col: fromCols[i],
              refTable: toTable,
              refCol: toCols[i] ?? toCols[0],
            })
          }
        }
        continue
      }

      // CONSTRAINT <name> { PRIMARY KEY | FOREIGN KEY | UNIQUE | CHECK } ...
      if (/^CONSTRAINT\b/i.test(line)) {
        if (/PRIMARY\s+KEY/i.test(line)) {
          tableLevelPks.push(...extractParenList(line.replace(/.*PRIMARY\s+KEY/i, '')))
        } else if (/FOREIGN\s+KEY/i.test(line)) {
          const colM = /FOREIGN\s+KEY\s*\(([^)]+)\)/i.exec(line)
          const refM = /REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/i.exec(line)
          if (colM && refM) {
            const fromCols = colM[1].split(',').map((s) => stripIdent(s.trim()))
            const toTable = stripIdent(refM[1]).split('.').pop()!
            const toCols = refM[2].split(',').map((s) => stripIdent(s.trim()))
            for (let i = 0; i < fromCols.length; i++) {
              tableLevelFks.push({
                col: fromCols[i],
                refTable: toTable,
                refCol: toCols[i] ?? toCols[0],
              })
            }
          }
        }
        continue
      }

      // Other table-level constraints we don't visualise.
      if (/^(UNIQUE|CHECK|INDEX|KEY)\b/i.test(line)) continue

      // Column definition: name TYPE[(args)] [...constraints]
      // - Type may be `INT` / `VARCHAR(255)` / `DECIMAL(10, 2)`.
      // - Constraints follow in any order: PRIMARY KEY, NOT NULL, UNIQUE,
      //   DEFAULT …, REFERENCES other(col) [ON DELETE …] [ON UPDATE …]
      const colMatch = /^([`"\[]?\w+[`"\]]?)\s+(\w+(?:\s*\([^)]*\))?)/i.exec(line)
      if (!colMatch) continue
      const colName = stripIdent(colMatch[1])
      const reservedAtColStart = ['PRIMARY', 'FOREIGN', 'UNIQUE', 'INDEX', 'KEY', 'CONSTRAINT', 'CHECK']
      if (reservedAtColStart.includes(colName.toUpperCase())) continue

      const type = colMatch[2].trim()
      // IMPORTANT: detect constraints on the FULL line, not the leftover
      // after the type match. Earlier implementation truncated to `rest` here
      // which silently dropped any `REFERENCES …` that followed the type.
      const upper = line.toUpperCase()
      const isPk = /\bPRIMARY\s+KEY\b/.test(upper)
      const isUnique = /\bUNIQUE\b/.test(upper)
      const isNullable = !/\bNOT\s+NULL\b/.test(upper) && !isPk

      const col: SchemaColumn = { name: colName, type, pk: isPk, unique: isUnique, nullable: isNullable }

      // Inline REFERENCES on the column line — anywhere after the type.
      const inlineRef = /REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/i.exec(line)
      if (inlineRef) {
        const refTable = stripIdent(inlineRef[1]).split('.').pop()!
        const refCol = stripIdent(inlineRef[2].split(',')[0].trim())
        col.fk = { refTable, refCol }
        tableLevelFks.push({ col: colName, refTable, refCol })
      }
      if (isPk) tableLevelPks.push(colName)

      columns.push(col)
    }

    // Apply table-level PK / FK markers onto the column rows we just built.
    for (const pk of tableLevelPks) {
      const c = columns.find((x) => x.name === pk)
      if (c) c.pk = true
    }
    for (const { col, refTable, refCol } of tableLevelFks) {
      const c = columns.find((x) => x.name === col)
      if (c && !c.fk) c.fk = { refTable, refCol }
    }

    tables.push({ name: tableName, columns })

    for (const { col, refTable, refCol } of tableLevelFks) {
      refs.push({
        from: { table: tableName, col },
        to: { table: refTable, col: refCol },
      })
    }
  }

  // Standalone ALTER TABLE ... ADD [CONSTRAINT ...] FOREIGN KEY ... REFERENCES ...
  ALTER_FK_RE.lastIndex = 0
  let alterMatch: RegExpExecArray | null
  while ((alterMatch = ALTER_FK_RE.exec(clean)) !== null) {
    const fromTable = stripIdent(alterMatch[1]).split('.').pop()!
    const fromCols = alterMatch[2].split(',').map((s) => stripIdent(s.trim()))
    const toTable = stripIdent(alterMatch[3]).split('.').pop()!
    const toCols = alterMatch[4].split(',').map((s) => stripIdent(s.trim()))
    const table = tables.find((t) => t.name === fromTable)
    for (let i = 0; i < fromCols.length; i++) {
      const fromCol = fromCols[i]
      const toCol = toCols[i] ?? toCols[0]
      refs.push({
        from: { table: fromTable, col: fromCol },
        to: { table: toTable, col: toCol },
      })
      const c = table?.columns.find((x) => x.name === fromCol)
      if (c && !c.fk) c.fk = { refTable: toTable, refCol: toCol }
    }
  }

  return { tables, refs }
}
