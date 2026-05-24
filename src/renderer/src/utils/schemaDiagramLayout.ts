// ER-diagram layout for SchemaModel — sibling of jsonDiagramLayout. Lays
// tables out in a grid, then routes cubic-bezier edges between specific
// column rows. Kept separate from the JSON layout because the JSON engine is
// strictly parent→child (each node has one parent), whereas FK refs connect
// arbitrary siblings.

import type { SchemaModel } from './schemaParse/types'
import { NODE_WIDTH, NODE_HEADER_H, PRIMITIVE_ROW_H } from './jsonDiagramLayout'

export interface SchemaNode {
  table: string
  /** Original column rows in display order. */
  columns: { name: string; type: string; pk?: boolean; fk?: { refTable: string; refCol: string } }[]
  x: number
  y: number
  width: number
  height: number
}

export interface SchemaEdge {
  /** `${fromTable}.${fromCol}` — used as React key. */
  id: string
  fromTable: string
  toTable: string
  /** Pre-computed SVG cubic-bezier path. */
  path: string
  color: string
}

export interface SchemaLayout {
  nodes: SchemaNode[]
  edges: SchemaEdge[]
  totalWidth: number
  totalHeight: number
  nodeByName: Map<string, SchemaNode>
}

const TABLE_H_GAP = 80
const TABLE_V_GAP = 40
const TABLE_FOOTER_PAD = 8
const EDGE_COLORS = ['#2563eb', '#7c3aed', '#0d9488', '#d97706', '#e11d48', '#6366f1']

function nodeHeight(rows: number): number {
  return NODE_HEADER_H + rows * PRIMITIVE_ROW_H + TABLE_FOOTER_PAD
}

/**
 * Y-coordinate (relative to the node) of a given column row's centre. Used
 * for routing FK edges into the exact row, not the node header.
 */
function rowCentreY(rowIndex: number): number {
  return NODE_HEADER_H + rowIndex * PRIMITIVE_ROW_H + PRIMITIVE_ROW_H / 2
}

export function buildSchemaLayout(model: SchemaModel): SchemaLayout {
  const nodes: SchemaNode[] = model.tables.map((t) => ({
    table: t.name,
    columns: t.columns,
    x: 0,
    y: 0,
    width: NODE_WIDTH,
    height: nodeHeight(t.columns.length),
  }))

  // Grid arrangement: ceil(sqrt(n)) columns, packed top-to-bottom. Within a
  // row the widest node defines the row height; columns are uniform width.
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  const rows: SchemaNode[][] = []
  for (let i = 0; i < nodes.length; i += cols) {
    rows.push(nodes.slice(i, i + cols))
  }

  let cursorY = 0
  for (const row of rows) {
    const rowHeight = Math.max(...row.map((n) => n.height))
    row.forEach((n, j) => {
      n.x = j * (NODE_WIDTH + TABLE_H_GAP)
      n.y = cursorY
    })
    cursorY += rowHeight + TABLE_V_GAP
  }

  const nodeByName = new Map<string, SchemaNode>()
  for (const n of nodes) nodeByName.set(n.table, n)

  const edges: SchemaEdge[] = []
  model.refs.forEach((ref, idx) => {
    const from = nodeByName.get(ref.from.table)
    const to = nodeByName.get(ref.to.table)
    if (!from || !to) return
    const fromColIdx = from.columns.findIndex((c) => c.name === ref.from.col)
    const toColIdx = to.columns.findIndex((c) => c.name === ref.to.col)
    if (fromColIdx === -1 || toColIdx === -1) return

    // Anchor on the right edge of the source row, left edge of the target
    // row. If the target node sits left of the source, swap anchors so the
    // edge enters from the right side of the target instead — keeps the
    // curve from cutting through nodes.
    const fromOnLeft = from.x + from.width / 2 < to.x + to.width / 2
    const px = fromOnLeft ? from.x + from.width : from.x
    const py = from.y + rowCentreY(fromColIdx)
    const cx = fromOnLeft ? to.x : to.x + to.width
    const cy = to.y + rowCentreY(toColIdx)
    const dir = fromOnLeft ? 1 : -1
    const handleLen = Math.max(40, Math.abs(cx - px) / 3)
    const path = `M ${px} ${py} C ${px + dir * handleLen} ${py} ${cx - dir * handleLen} ${cy} ${cx} ${cy}`

    edges.push({
      id: `${ref.from.table}.${ref.from.col}->${ref.to.table}.${ref.to.col}-${idx}`,
      fromTable: ref.from.table,
      toTable: ref.to.table,
      path,
      color: EDGE_COLORS[idx % EDGE_COLORS.length],
    })
  })

  let totalWidth = 0
  let totalHeight = 0
  for (const n of nodes) {
    totalWidth = Math.max(totalWidth, n.x + n.width)
    totalHeight = Math.max(totalHeight, n.y + n.height)
  }

  return { nodes, edges, totalWidth, totalHeight, nodeByName }
}
