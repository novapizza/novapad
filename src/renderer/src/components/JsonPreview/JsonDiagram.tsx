import React, { useState, useRef, useMemo, useEffect, useTransition, memo, useCallback } from 'react'
import {
  buildDiagramTree, applyLayout,
  NODE_WIDTH, NODE_HEADER_H, PRIMITIVE_ROW_H, MAX_VISIBLE_ENTRIES,
  type DiagramNode, type DiagramTree,
} from '../../utils/jsonDiagramLayout'

// Ported from exifmaster-pro/components/JsonDiagram.tsx — pan/zoom SVG graph
// with viewport culling and ResizeObserver-driven fit-to-view. Tab colors
// inherited from the layout engine's edge palette; node body uses raw slate
// hex codes (not Tailwind tokens) because they render through <foreignObject>
// where Tailwind's dark-mode-aware classes don't apply.

const DEPTH_HEADER_COLORS = ['#2563eb', '#7c3aed', '#0d9488', '#d97706', '#e11d48', '#6366f1']

function primitiveValueColor(value: unknown): string {
  if (typeof value === 'string') return '#059669'
  if (typeof value === 'number') return '#ea580c'
  if (typeof value === 'boolean') return '#7c3aed'
  return '#94a3b8'
}

const COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB_RE = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/i
const HSL_RE = /^hsla?\(\s*\d+/i

function extractColorValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (COLOR_RE.test(s) || RGB_RE.test(s) || HSL_RE.test(s)) return s
  return null
}

interface TooltipInfo {
  text: string
  vx: number
  vy: number
}

interface NodeProps {
  node: DiagramNode
  collapsed: boolean
  isDark: boolean
  onToggle: (id: string) => void
  onValueHover: (text: string, screenX: number, screenY: number) => void
  onValueLeave: () => void
}

const JsonDiagramNode = memo(function JsonDiagramNode({
  node, collapsed, isDark, onToggle, onValueHover, onValueLeave,
}: NodeProps) {
  const headerColor = DEPTH_HEADER_COLORS[node.depth % DEPTH_HEADER_COLORS.length]
  const displayedEntries = node.primitiveEntries.slice(0, 8)
  const overflow = node.primitiveEntries.length - 8
  const hasChildren = node.children.length > 0

  const kindLabel =
    node.kind === 'array'
      ? `[${node.primitiveEntries.length + node.children.length} items]`
      : node.kind === 'object'
        ? `{${node.primitiveEntries.length + node.children.length} keys}`
        : ''

  const bodyBg = isDark ? '#1e293b' : '#ffffff'
  const bodyBorder = isDark ? '#334155' : '#e2e8f0'
  const rowBorderColor = isDark ? '#1e293b' : '#f1f5f9'
  const overflowColor = isDark ? '#64748b' : '#94a3b8'
  const keyColor = isDark ? '#93c5fd' : '#3b82f6'

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
          pointerEvents: 'all',
        }}
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      >
        <div
          style={{
            background: headerColor,
            padding: '0 10px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: hasChildren ? 'pointer' : 'default',
            flexShrink: 0,
          }}
          onClick={hasChildren ? () => onToggle(node.id) : undefined}
        >
          <span style={{ color: 'white', fontSize: '11px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
            {node.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {kindLabel && <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px' }}>{kindLabel}</span>}
            {hasChildren && (
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '10px' }}>{collapsed ? '▶' : '▼'}</span>
            )}
          </div>
        </div>

        <div style={{ flex: 1, background: bodyBg, overflow: 'hidden' }}>
          {displayedEntries.map(({ key, value }) => {
            const colorVal = extractColorValue(value)
            const displayText = JSON.stringify(value)
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 10px',
                  borderBottom: `1px solid ${rowBorderColor}`,
                  fontSize: '10px',
                  fontFamily: 'JetBrains Mono, monospace',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  onValueHover(displayText, rect.left, rect.bottom + 4)
                }}
                onMouseLeave={onValueLeave}
              >
                {key && <span style={{ color: keyColor, flexShrink: 0 }}>{key}:</span>}
                {colorVal && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: '11px',
                      height: '11px',
                      borderRadius: '3px',
                      background: colorVal,
                      border: '1px solid rgba(0,0,0,0.15)',
                      flexShrink: 0,
                    }}
                  />
                )}
                <span
                  style={{
                    color: primitiveValueColor(value),
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {displayText}
                </span>
              </div>
            )
          })}
          {overflow > 0 && (
            <div style={{ padding: '3px 10px', fontSize: '10px', color: overflowColor, fontStyle: 'italic' }}>
              +{overflow} more…
            </div>
          )}
        </div>
      </div>
    </foreignObject>
  )
})

const TOOLTIP_MAX_W = 320

interface TooltipProps {
  tooltip: TooltipInfo
  containerWidth: number
  containerHeight: number
  isDark: boolean
}

function DiagramTooltip({ tooltip, containerWidth, containerHeight, isDark }: TooltipProps) {
  const x = Math.min(tooltip.vx, containerWidth - TOOLTIP_MAX_W - 8)
  const fitsBelow = tooltip.vy + 80 < containerHeight
  const y = fitsBelow ? tooltip.vy : tooltip.vy - 90
  const bg = isDark ? '#1e293b' : '#ffffff'
  const border = isDark ? '#475569' : '#cbd5e1'
  const textColor = isDark ? '#e2e8f0' : '#1e293b'

  return (
    <foreignObject x={x} y={y} width={TOOLTIP_MAX_W} height={200} style={{ overflow: 'visible', pointerEvents: 'none' }}>
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        style={{
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: '8px',
          padding: '7px 10px',
          fontSize: '11px',
          fontFamily: 'JetBrains Mono, monospace',
          color: textColor,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          wordBreak: 'break-all',
          whiteSpace: 'pre-wrap',
          maxWidth: TOOLTIP_MAX_W + 'px',
          pointerEvents: 'none',
          lineHeight: 1.5,
        }}
      >
        {tooltip.text}
      </div>
    </foreignObject>
  )
}

interface JsonDiagramProps {
  data: unknown
}

export default function JsonDiagram({ data }: JsonDiagramProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set<string>())
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const [zoom, setZoom] = useState(1.0)
  const [isPanning, setIsPanning] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 })
  const [isPending, startTransition] = useTransition()
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const pendingFitRef = useRef(false)

  const diagramTree = useMemo<DiagramTree>(() => buildDiagramTree(data), [data])
  const layout = useMemo(() => applyLayout(diagramTree, collapsedIds), [diagramTree, collapsedIds])

  // IDs of every node that *has* children — used to start the diagram fully
  // collapsed so big JSON only renders top-level cards on first paint. Without
  // this, a 5k-node payload mounts 5k <foreignObject>s up front and freezes
  // the renderer for seconds. User drills in by clicking the ▶ chevrons.
  const initialCollapsedIds = useMemo(() => {
    const ids = new Set<string>()
    const walk = (n: DiagramNode) => {
      if (n.children.length > 0) {
        ids.add(n.id)
        for (const c of n.children) walk(c)
      }
    }
    for (const top of diagramTree.topNodes) walk(top)
    return ids
  }, [diagramTree])

  useEffect(() => {
    startTransition(() => {
      setCollapsedIds(new Set(initialCollapsedIds))
      setPan({ x: 40, y: 40 })
      setZoom(1.0)
    })
    pendingFitRef.current = true
  }, [data, initialCollapsedIds])

  useEffect(() => {
    if (!pendingFitRef.current) return
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

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

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

  const toggleNode = useCallback(
    (id: string) => {
      startTransition(() => {
        setCollapsedIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      })
    },
    [startTransition]
  )

  const handleValueHover = useCallback((text: string, screenX: number, screenY: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setTooltip({ text, vx: screenX - rect.left, vy: screenY - rect.top })
  }, [])

  const handleValueLeave = useCallback(() => setTooltip(null), [])

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('foreignObject')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    isPanningRef.current = true
    setIsPanning(true)
    setTooltip(null)
    panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanningRef.current) return
    setPan({
      x: panStartRef.current.px + (e.clientX - panStartRef.current.mx),
      y: panStartRef.current.py + (e.clientY - panStartRef.current.my),
    })
  }

  const handlePointerUp = () => {
    isPanningRef.current = false
    setIsPanning(false)
  }

  const handleFit = () => {
    if (!containerRef.current) return
    const { width, height } = containerRef.current.getBoundingClientRect()
    const scaleX = (width - 80) / (layout.totalWidth || 1)
    const scaleY = (height - 80) / (layout.totalHeight || 1)
    const newZoom = Math.min(scaleX, scaleY, 1.0)
    setZoom(Math.max(0.15, newZoom))
    setPan({ x: 40, y: 40 })
  }

  const MAX_NODE_HEIGHT = NODE_HEADER_H + MAX_VISIBLE_ENTRIES * PRIMITIVE_ROW_H + 12

  const cullRect = useMemo(() => {
    const vpLeft = -pan.x / zoom
    const vpTop = -pan.y / zoom
    const vpRight = (containerSize.width - pan.x) / zoom
    const vpBottom = (containerSize.height - pan.y) / zoom
    return {
      left: vpLeft - NODE_WIDTH,
      top: vpTop - MAX_NODE_HEIGHT,
      right: vpRight + NODE_WIDTH,
      bottom: vpBottom + MAX_NODE_HEIGHT,
    }
  }, [pan.x, pan.y, zoom, containerSize.width, containerSize.height, MAX_NODE_HEIGHT])

  const visibleNodes = useMemo(
    () =>
      layout.nodes.filter(
        (n) =>
          n.x + n.width > cullRect.left &&
          n.x < cullRect.right &&
          n.y + n.height > cullRect.top &&
          n.y < cullRect.bottom
      ),
    [layout.nodes, cullRect]
  )

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])

  const visibleEdges = useMemo(
    () => layout.edges.filter((e) => visibleNodeIds.has(e.fromId) || visibleNodeIds.has(e.toId)),
    [layout.edges, visibleNodeIds]
  )

  return (
    <div className="flex flex-col h-full">
      {layout.nodes.length > 200 && (
        <div className="mb-2 mx-3 mt-2 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded text-amber-600 dark:text-amber-300 text-[13px]">
          <span className="font-bold">⚠ Large dataset</span> — {layout.nodes.length} nodes. Collapse branches for smoother panning.
        </div>
      )}
      <div
        ref={containerRef}
        className="relative flex-1 bg-secondary/20 border border-border rounded overflow-hidden"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="bg-background border border-border rounded px-3 py-1.5 text-[13px] text-muted-foreground shadow-md">
              Computing layout…
            </div>
          </div>
        )}

        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
            className="w-7 h-7 bg-background border border-border rounded text-foreground text-[13px] font-bold hover:bg-secondary flex items-center justify-center shadow-sm"
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
            className="w-7 h-7 bg-background border border-border rounded text-foreground text-[13px] font-bold hover:bg-secondary flex items-center justify-center shadow-sm"
          >
            -
          </button>
        </div>

        <div
          className="absolute bottom-3 right-3 z-10 text-[11px] text-muted-foreground"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {Math.round(zoom * 100)}%
        </div>

        <svg width="100%" height="100%" style={{ overflow: 'visible', display: 'block' }}>
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {visibleEdges.map((edge) => (
              <path
                key={`${edge.fromId}->${edge.toId}`}
                d={edge.path}
                fill="none"
                stroke={edge.color}
                strokeWidth={1.5}
                strokeOpacity={0.55}
              />
            ))}
            {visibleNodes.map((node) => (
              <JsonDiagramNode
                key={node.id}
                node={node}
                collapsed={collapsedIds.has(node.id)}
                isDark={isDark}
                onToggle={toggleNode}
                onValueHover={handleValueHover}
                onValueLeave={handleValueLeave}
              />
            ))}
          </g>
          {tooltip && (
            <DiagramTooltip
              tooltip={tooltip}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
              isDark={isDark}
            />
          )}
        </svg>
      </div>
    </div>
  )
}
