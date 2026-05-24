import { parsePrisma } from './parsePrisma'
import { parseDbml } from './parseDbml'
import { parseDdl } from './parseDdl'
import type { ParseResult, SchemaModel } from './types'

export type { ParseResult, SchemaModel, SchemaTable, SchemaColumn, SchemaRef } from './types'

// Content sniff — picks the parser by signature rather than relying on file
// extension or Magika output. This is the Phase 3 entry point: callers pass
// raw buffer content, get back a SchemaModel or a typed failure reason.
//
// Per the plan we deliberately DO NOT extend `detectPreviewKind` or refine
// the buffer's language — the Transform overlay is a one-shot user action
// (Ctrl+Alt+Shift+K), not a sticky preview kind.
const PRISMA_MODEL_RE = /\bmodel\s+\w+\s*\{/m
const PRISMA_HEAD_RE = /\b(datasource|generator)\s+\w+\s*\{/m
const DBML_TABLE_RE = /\bTable\s+["`]?[\w.]+["`]?\s*(?:as\s+\w+\s*)?\{/m
const DBML_REF_RE = /(?:^|\n)\s*Ref(?:\s+\w+)?\s*:|\[ref:\s*[-<>]/m
const DDL_CREATE_RE = /\bCREATE\s+TABLE\b/i

export function parseSchema(content: string): ParseResult {
  const head = content.slice(0, 64 * 1024) // cap to first 64KB for cheap sniffing
  if (!head.trim()) {
    return { ok: false, reason: 'Buffer is empty.' }
  }

  // Prisma: model blocks plus a datasource / generator header.
  if (PRISMA_MODEL_RE.test(head) && PRISMA_HEAD_RE.test(head)) {
    return { ok: true, kind: 'prisma', model: parsePrisma(content) }
  }
  // DBML: Table blocks plus at least one Ref: line or inline [ref:].
  if (DBML_TABLE_RE.test(head) && DBML_REF_RE.test(head)) {
    return { ok: true, kind: 'dbml', model: parseDbml(content) }
  }
  // DBML w/o explicit refs — still recognisable from `Table foo {` syntax,
  // distinct from DDL `CREATE TABLE foo (`. Falls below the Prisma + DDL
  // checks so unambiguous formats win.
  if (DBML_TABLE_RE.test(head) && !DDL_CREATE_RE.test(head)) {
    return { ok: true, kind: 'dbml', model: parseDbml(content) }
  }
  // DDL: CREATE TABLE statements.
  if (DDL_CREATE_RE.test(head)) {
    const model = parseDdl(content)
    if (model.tables.length === 0) {
      return { ok: false, reason: 'Could not parse any CREATE TABLE statements.' }
    }
    return { ok: true, kind: 'ddl', model }
  }
  // Bare `model X {` (Prisma without the datasource header — common in
  // snippet form) — accept as a last resort.
  if (PRISMA_MODEL_RE.test(head)) {
    return { ok: true, kind: 'prisma', model: parsePrisma(content) }
  }

  return {
    ok: false,
    reason: 'Could not recognise Prisma / DBML / DDL in this buffer.',
  }
}

export function isSchemaEmpty(model: SchemaModel): boolean {
  return model.tables.length === 0
}
