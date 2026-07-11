import React from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { THEMES } from '../../utils/themes'
import { EditorMock } from './ThemeMock'

/**
 * In-flow left panel (not a fixed overlay) listing the available themes as a
 * searchable vertical gallery. Rendered as the first child of the Settings row,
 * so opening it pushes the category list + content to the right instead of
 * covering the window chrome.
 */

interface ThemeDrawerProps {
  value: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function ThemeDrawer({ value, onSelect, onClose }: ThemeDrawerProps): React.ReactElement {
  return (
    <div
      className="w-[200px] shrink-0 border-r border-border bg-sidebar-background flex flex-col animate-in slide-in-from-left duration-200"
      data-testid="theme-drawer"
    >
      <div className="flex items-start justify-between px-3 pt-3 pb-2">
        <div>
          <div className="text-base font-semibold text-foreground">Themes</div>
          <div className="text-sm text-muted-foreground">Change your current theme.</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          aria-label="Close"
          data-testid="theme-drawer-close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto editor-scrollbar px-3 py-2 space-y-4">
        {THEMES.map((t) => {
          const selected = value === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-pressed={selected}
              data-testid={`theme-card-${t.id}`}
              className="w-full text-left"
            >
              <EditorMock
                c={t.preview}
                className={cn(
                  'h-24 w-full rounded-lg border transition-all',
                  selected ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-muted-foreground/60'
                )}
              />
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-sm font-medium text-foreground">{t.name}</span>
                {selected && <Check size={14} className="text-primary" />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
