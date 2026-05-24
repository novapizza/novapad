import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Network, X, Key, Link } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { buildSchemaLayout, type SchemaLayout, type SchemaNode } from '../../utils/schemaDiagramLayout'
import { NODE_HEADER_H, PRIMITIVE_ROW_H } from '../../utils/jsonDiagramLayout'

// Fullscreen ER-diagram overlay for the Phase 3 Transform shortcut
// (Ctrl+Alt+Shift+K). Distinct from JsonDiagram / preview pane: it does NOT
// route through detectPreviewKind, it's not a sticky preview kind, it has
// its own state in uiStore. Pan/zoom code is structurally similar to
// JsonDiagram but tailored to ER nodes (tables with column rows + FK edges).

const HEADER_PALETTE = ['#2563eb', '#7c3aed', '#0d9488', '#d97706', '#e11d48', '#6366f1']

const KIND_LABEL: Record<'prisma' | 'dbml' | 'ddl', string> = {
  prisma: 'Prisma',
  dbml: 'DBML',
  ddl: 'DDL',
}

interface NodeProps {
  node: SchemaNode
  isDark: boolean
  headerColor: string
}

const SchemaNodeView: React.FC<NodeProps> = React.memo(function SchemaNodeView({ node, isDark, headerColor }) {
  const bodyBg = isDark ? '#1e293b' : '#ffffff'
  const bodyBorder = isDark ? '#334155' : '#e2e8f0'
  const rowBorderColor = isDark ? '#1e293b' : '#f1f5f9'
  const keyColor = isDark ? '#93c5fd' : '#1d4ed8'
  const typeColor = isDark ? '#94a3b8' : '#64748b'
  const fkColor = isDark ? '#fdba74' : '#c2410c'

  return (
    <foreignObject x={node.x} y={node.y} width={node.width} height={node.height} style={{ overflow: 'visible' }}>
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        style={{
          width: node.width + 'px',
          height: node.height + 'px',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '10px',
          border: `1px solid ${bodyBorder}`,
          boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          fontFamily: 'Inter, sans-serif',
        }}
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      >
        <div
          style={{
            background: headerColor,
            padding: '0 10px',
            height: `${NODE_HEADER_H}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span style={{ color: 'white', fontSize: '12px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.table}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px' }}>
            {node.columns.length} {node.columns.length === 1 ? 'col' : 'cols'}
          </span>
        </div>

        <div style={{ flex: 1, background: bodyBg }}>
          {node.columns.map((col) => (
            <div
              key={col.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                height: `${PRIMITIVE_ROW_H}px`,
                borderBottom: `1px solid ${rowBorderColor}`,
                fontSize: '11px',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {col.pk && (
                <span title="Primary key" style={{ color: '#eab308', display: 'flex' }}>
                  <Key size={10} />
                </span>
              )}
              {col.fk && (
                <span title={`FK → ${col.fk.refTable}.${col.fk.refCol}`} style={{ color: fkColor, display: 'flex' }}>
                  <Link size={10} />
                </span>
              )}
              <span style={{ color: keyColor, fontWeight: 600, flexShrink: 0 }}>{col.name}</span>
              <span style={{ color: typeColor, marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%' }}>
                {col.type}
              </span>
            </div>
          ))}
        </div>
      </div>
    </foreignObject>
  )
})

export const TransformOverlay: React.FC = () => {
  const model = useUIStore((s) => s.transformModel)
  const kind = useUIStore((s) => s.transformKind)
  const title = useUIStore((s) => s.transformTitle)
  const closeTransform = useUIStore((s) => s.closeTransform)

  const [pan, setPan] = useState({ x: 40, y: 40 })
  const [zoom, setZoom] = useState(1.0)
  const [isPanning, setIsPanning] = useState(false)
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const pendingFitRef = useRef(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeTransform()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeTransform])

  // Compute layout once per model. Memo guards against pan/zoom re-runs.
  const layout: SchemaLayout | null = useMemo(
    () => (model ? buildSchemaLayout(model) : null),
    [model]
  )

  // Reset view + queue a fit-to-view whenever the model changes.
  useEffect(() => {
    setPan({ x: 40, y: 40 })
    setZoom(1.0)
    pendingFitRef.current = true
  }, [model])

  useEffect(() => {
    if (!pendingFitRef.current || !layout) return
    pendingFitRef.current = false
    const raf = requestAnimationFrame(() => {
      if (!containerRef.current) return
      const { width, height } = containerRef.current.getBoundingClientRect()
      const scaleX = (width - 80) / (layout.totalWidth || 1)
      const scaleY = (height - 80) / (layout.totalHeight || 1)
      const newZoom = Math.min(scaleX, scaleY, 1.0)
      setZoom(Math.max(0.15, newZoom))
      setPan({ x: 40, y: 40 })
    })
    return () => cancelAnimationFrame(raf)
  }, [layout])

  // Non-passive wheel handler — gives us preventDefault so the browser
  // doesn't zoom the whole window while the user spins the wheel.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((z) => Math.min(2.5, Math.max(0.15, z + (e.deltaY > 0 ? -0.08 : 0.08))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ width, height })
    })
    ro.observe(el)
    const rect = el.getBoundingClientRect()
    setContainerSize({ width: rect.width, height: rect.height })
    return () => ro.disconnect()
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as Element).closest('foreignObject')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    isPanningRef.current = true
    setIsPanning(true)
    panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }, [pan.x, pan.y])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current) return
    setPan({
      x: panStartRef.current.px + (e.clientX - panStartRef.current.mx),
      y: panStartRef.current.py + (e.clientY - panStartRef.current.my),
    })
  }, [])

  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false
    setIsPanning(false)
  }, [])

  const handleFit = () => {
    if (!containerRef.current || !layout) return
    const { width, height } = containerRef.current.getBoundingClientRect()
    const scaleX = (width - 80) / (layout.totalWidth || 1)
    const scaleY = (height - 80) / (layout.totalHeight || 1)
    setZoom(Math.max(0.15, Math.min(scaleX, scaleY, 1.0)))
    setPan({ x: 40, y: 40 })
  }

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  if (!model || !kind || !layout) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col h-full overflow-hidden bg-background"
      data-testid="transform-overlay"
    >
      <header className="px-3 py-2 border-b border-border flex items-center gap-2 bg-secondary/30">
        <Network size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Transform
        </span>
        <span className="text-xs font-medium text-foreground/80 ml-1 truncate" title={title ?? ''}>
          {title}
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wider">
          {KIND_LABEL[kind]}
        </span>
        <span className="text-[10px] text-muted-foreground ml-1" data-testid="transform-summary">
          {layout.nodes.length} {layout.nodes.length === 1 ? 'table' : 'tables'} · {layout.edges.length} {layout.edges.length === 1 ? 'ref' : 'refs'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={closeTransform}
            aria-label="Close transform"
            title="Close (Esc)"
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div
        ref={containerRef}
        className="relative flex-1 bg-secondary/20"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
            className="w-7 h-7 bg-background border border-border rounded text-foreground text-xs font-bold hover:bg-secondary flex items-center justify-center shadow-sm"
          >
            +
          </button>
          <button
            onClick={handleFit}
            className="w-7 h-7 bg-background border border-border rounded text-foreground text-[9px] font-bold hover:bg-secondary flex items-center justify-center shadow-sm"
          >
            Fit
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.15, z - 0.1))}
            className="w-7 h-7 bg-background border border-border rounded text-foreground text-xs font-bold hover:bg-secondary flex items-center justify-center shadow-sm"
          >
            -
          </button>
        </div>

        <div
          className="absolute bottom-3 right-3 z-10 text-[10px] text-muted-foreground"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {Math.round(zoom * 100)}%
        </div>

        {layout.nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No tables found in this buffer.
          </div>
        ) : (
          <svg width="100%" height="100%" style={{ overflow: 'visible', display: 'block' }}>
            <defs>
              {/* Arrow markers reuse the edge palette so the colour matches each FK line. */}
              {HEADER_PALETTE.map((c, i) => (
                <marker
                  key={i}
                  id={`schema-arrow-${i}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
                </marker>
              ))}
            </defs>
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {layout.edges.map((edge, idx) => (
                <path
                  key={edge.id}
                  d={edge.path}
                  fill="none"
                  stroke={edge.color}
                  strokeWidth={1.6}
                  strokeOpacity={0.7}
                  markerEnd={`url(#schema-arrow-${HEADER_PALETTE.indexOf(edge.color) % HEADER_PALETTE.length})`}
                />
              ))}
              {layout.nodes.map((node, idx) => (
                <SchemaNodeView
                  key={node.table}
                  node={node}
                  isDark={isDark}
                  headerColor={HEADER_PALETTE[idx % HEADER_PALETTE.length]}
                />
              ))}
            </g>
          </svg>
        )}

        {/* Container-size watcher uses `containerSize` only via ResizeObserver
            side effect — no rendering depends on it directly. Reference here
            keeps the binding alive for the linter. */}
        <span className="hidden" aria-hidden>
          {containerSize.width}x{containerSize.height}
        </span>
      </div>
    </div>
  )
}
