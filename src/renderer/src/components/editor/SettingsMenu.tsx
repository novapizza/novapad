import { useEffect, useRef, useState } from 'react'
import { Settings as SettingsIcon, Sun, Moon, Keyboard } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useConfigStore } from '../../store/configStore'
import { useEditorStore } from '../../store/editorStore'
import { shortcutMod } from '../../utils/platform'

/**
 * Gear icon in the top-right of the menu/title bar. Clicking opens a small
 * dropdown with the theme toggle, Keyboard Shortcuts, and Settings entries —
 * the only way to reach Settings once the legacy menu has been removed.
 */
export function SettingsMenu() {
  const mod = shortcutMod()
  const { theme } = useUIStore()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggleTheme = () => {
    useUIStore.getState().toggleTheme()
    useConfigStore.getState().setProp('theme', useUIStore.getState().theme)
    setOpen(false)
  }

  const openShortcuts = () => {
    useEditorStore.getState().openVirtualTab('shortcuts')
    setOpen(false)
  }

  const openSettings = () => {
    useEditorStore.getState().openVirtualTab('settings')
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 text-toolbar-foreground hover:bg-secondary rounded-sm transition-colors"
        title="Settings"
        data-testid="settings-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <SettingsIcon size={18} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 min-w-[220px] bg-popover border border-border rounded-md shadow-lg py-1 z-50"
          role="menu"
          data-testid="settings-menu-dropdown"
        >
          <button
            role="menuitem"
            onClick={toggleTheme}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-base text-popover-foreground hover:bg-secondary transition-colors"
            data-testid="settings-menu-theme"
          >
            <span className="w-5 flex justify-center shrink-0">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </span>
            <span className="flex-1 text-left">
              {theme === 'dark' ? 'Toggle Light Mode' : 'Toggle Dark Mode'}
            </span>
          </button>

          <div className="h-px bg-border mx-2 my-1" />

          <button
            role="menuitem"
            onClick={openShortcuts}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-base text-popover-foreground hover:bg-secondary transition-colors"
            data-testid="settings-menu-shortcuts"
          >
            <span className="w-5 flex justify-center shrink-0"><Keyboard size={18} /></span>
            <span className="flex-1 text-left">Keyboard Shortcuts</span>
          </button>

          <button
            role="menuitem"
            onClick={openSettings}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-base text-popover-foreground hover:bg-secondary transition-colors"
            data-testid="settings-menu-settings"
          >
            <span className="w-5 flex justify-center shrink-0"><SettingsIcon size={18} /></span>
            <span className="flex-1 text-left">Settings</span>
            <span className="text-lg text-muted-foreground ml-4 font-mono tabular-nums shrink-0 leading-none">
              {mod}+,
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
