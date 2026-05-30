import React, { useEffect } from 'react'
import { useUIStore } from '../../store/uiStore'
import { TOOLS, TOOL_GROUPS, getTool } from './tools'

/**
 * Unified Developer Tools modal. A category sidebar on the left selects which
 * tool renders on the right; the active tool is driven by `uiStore.activeToolId`
 * so menu items can deep-link straight to a specific tool.
 */
export function ToolsPanel(): React.ReactElement | null {
  const { toolsPanelOpen, activeToolId, openTool, closeTools } = useUIStore()

  useEffect(() => {
    if (!toolsPanelOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeTools()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toolsPanelOpen, closeTools])

  if (!toolsPanelOpen) return null

  const active = getTool(activeToolId) ?? TOOLS[0]
  const ActiveComponent = active.Component

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50" onClick={closeTools}>
      <div
        className="fixed z-[9001] flex h-[82vh] w-[min(960px,92vw)] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tools</span>
          <button
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
            onClick={closeTools}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <nav className="w-56 shrink-0 overflow-y-auto border-r border-border bg-background/50 py-2">
            {TOOL_GROUPS.map((group) => (
              <div key={group} className="mb-2">
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
                {TOOLS.filter((t) => t.group === group).map((t) => {
                  const Icon = t.icon
                  const isActive = t.id === active.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => openTool(t.id)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                      }`}
                    >
                      <Icon size={16} className="shrink-0" />
                      <span className="truncate">{t.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <active.icon size={18} className="text-primary" />
                <h2 className="text-base font-semibold text-foreground">{active.label}</h2>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{active.description}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ActiveComponent />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
