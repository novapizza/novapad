// Shared output shape for the three schema-DSL parsers (Prisma / DBML / DDL).
// The TransformOverlay renders this directly into an ER diagram — each table
// becomes a node, each `refs` entry becomes a curved edge.

export interface SchemaColumn {
  name: string
  type: string
  pk?: boolean
  fk?: { refTable: string; refCol: string }
  nullable?: boolean
  unique?: boolean
}

export interface SchemaTable {
  name: string
  columns: SchemaColumn[]
}

export interface SchemaRef {
  from: { table: string; col: string }
  to: { table: string; col: string }
}

export interface SchemaModel {
  tables: SchemaTable[]
  refs: SchemaRef[]
}

export type ParseResult =
  | { ok: true; kind: 'prisma' | 'dbml' | 'ddl'; model: SchemaModel }
  | { ok: false; reason: string }
