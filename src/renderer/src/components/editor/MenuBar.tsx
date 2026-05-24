import { useState, useRef, useEffect } from 'react'
import {
  FilePlus, FolderOpen, Save, X,
  Undo2, Redo2, Scissors, Copy, Clipboard, SquareDashedMousePointer,
  Search, Replace, FolderSearch,
  PanelLeftClose, PanelLeft,
  RotateCcw, ChevronRight,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useEditorStore } from '../../store/editorStore'
import { usePluginStore } from '../../store/pluginStore'
import { isMacOS, shortcutMod, shortcutAlt } from '../../utils/platform'
import { SettingsMenu } from './SettingsMenu'
import { NavButtons } from './NavButtons'

interface MenuBarProps {
  onNew: () => void
  onOpen: () => void
  onOpenFolder: () => void
  onSave: () => void
  onSaveAs: () => void
  onSaveAll: () => void
  onClose: () => void
  onCloseAll: () => void
  onFind: () => void
  onReplace: () => void
  onFindInFiles: () => void
  onReload: () => void
}

interface MenuItem {
  label: string
  icon?: React.ReactNode
  shortcut?: string
  action?: () => void
  separator?: boolean
  disabled?: boolean
  checked?: boolean
  submenu?: MenuItem[]
}

const editorCmd = (cmd: string) => () =>
  window.dispatchEvent(new CustomEvent('editor:command', { detail: cmd }))

export function MenuBar({
  onNew, onOpen, onOpenFolder, onSave, onSaveAs, onSaveAll,
  onClose, onCloseAll, onFind, onReplace, onFindInFiles, onReload,
}: MenuBarProps) {
  // macOS uses native menu — hide custom MenuBar
  if (isMacOS()) return null

  const mod = shortcutMod()
  const alt = shortcutAlt()

  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [hoveredSubmenu, setHoveredSubmenu] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const {
    showToolbar, showStatusBar, showSidebar,
    wordWrap, renderWhitespace, indentationGuides, columnSelectMode,
    setShowToolbar, setShowStatusBar, setShowSidebar,
    setWordWrap, setRenderWhitespace, setIndentationGuides, setColumnSelectMode,
  } = useUIStore()
  const dynamicMenuItems = usePluginStore((s) => s.dynamicMenuItems)

  // Group dynamic menu items by plugin name into submenus so the custom menu
  // mirrors the native Plugins submenu (plugin name → its items).
  const dynamicPluginMenu: MenuItem[] = (() => {
    const byPlugin = new Map<string, MenuItem[]>()
    for (const { pluginName, label } of dynamicMenuItems) {
      if (!byPlugin.has(pluginName)) byPlugin.set(pluginName, [])
      byPlugin.get(pluginName)!.push({
        label,
        action: () => window.api.send('plugin:invoke-menu-click', pluginName, label),
      })
    }
    return Array.from(byPlugin.entries()).map(([pluginName, items]) => ({
      label: pluginName,
      submenu: items,
    }))
  })()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null)
        setHoveredSubmenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const menuItems: Record<string, MenuItem[]> = {
    File: [
      { label: 'New File', icon: <FilePlus size={18} />, shortcut: `${mod}+N`, action: onNew },
      { label: 'Open File...', icon: <FolderOpen size={18} />, shortcut: `${mod}+O`, action: onOpen },
      { label: 'Open Folder...', shortcut: `${mod}+Shift+O`, action: onOpenFolder },
      { label: 'Save', icon: <Save size={18} />, shortcut: `${mod}+S`, action: onSave },
      { label: 'Save As...', shortcut: `${mod}+Shift+S`, action: onSaveAs },
      { label: 'Save All', shortcut: `${mod}+${alt}+S`, action: onSaveAll },
      { separator: true, label: '' },
      { label: 'Reload from Disk', icon: <RotateCcw size={18} />, shortcut: `${mod}+R`, action: onReload },
      { separator: true, label: '' },
      { label: 'Close File', icon: <X size={18} />, shortcut: `${mod}+W`, action: onClose },
      { label: 'Close All Files', action: onCloseAll },
    ],
    Edit: [
      { label: 'Undo', icon: <Undo2 size={18} />, shortcut: `${mod}+Z`, action: () => window.dispatchEvent(new CustomEvent('editor:undo')) },
      { label: 'Redo', icon: <Redo2 size={18} />, shortcut: `${mod}+Y`, action: () => window.dispatchEvent(new CustomEvent('editor:redo')) },
      { separator: true, label: '' },
      { label: 'Cut', icon: <Scissors size={18} />, shortcut: `${mod}+X`, action: () => document.execCommand('cut') },
      { label: 'Copy', icon: <Copy size={18} />, shortcut: `${mod}+C`, action: () => document.execCommand('copy') },
      { label: 'Paste', icon: <Clipboard size={18} />, shortcut: `${mod}+V`, action: () => document.execCommand('paste') },
      { separator: true, label: '' },
      { label: 'Select All', icon: <SquareDashedMousePointer size={18} />, shortcut: `${mod}+A`, action: () => document.execCommand('selectAll') },
      { label: 'Begin/End Select', shortcut: `${mod}+Shift+B`, disabled: true, action: editorCmd('beginEndSelect') },
      { label: 'Begin/End Select in Column Mode', shortcut: `${mod}+Shift+${alt}+B`, disabled: true, action: editorCmd('beginEndSelectColumn') },
      { separator: true, label: '' },
      {
        label: 'Line Operations', submenu: [
          { label: 'Duplicate Line', shortcut: `${mod}+D`, action: editorCmd('duplicateLine') },
          { label: 'Delete Line', shortcut: `${mod}+Shift+K`, action: editorCmd('deleteLine') },
          { label: 'Move Line Up', shortcut: `${alt}+Up`, action: editorCmd('moveLineUp') },
          { label: 'Move Line Down', shortcut: `${alt}+Down`, action: editorCmd('moveLineDown') },
          { separator: true, label: '' },
          { label: 'Sort Lines Ascending', action: editorCmd('sortLinesAsc') },
          { label: 'Sort Lines Descending', action: editorCmd('sortLinesDesc') },
        ],
      },
      {
        label: 'Convert Case (UPPER/lower)', submenu: [
          { label: 'UPPERCASE', shortcut: `${mod}+Shift+U`, action: editorCmd('toUpperCase') },
          { label: 'lowercase', shortcut: `${mod}+Shift+L`, action: editorCmd('toLowerCase') },
          { label: 'Title Case', action: editorCmd('toTitleCase') },
        ],
      },
      { separator: true, label: '' },
      { label: 'Toggle Comment', shortcut: `${mod}+/`, action: editorCmd('toggleComment') },
      { label: 'Toggle Block Comment', shortcut: `${mod}+Shift+/`, action: editorCmd('toggleBlockComment') },
      { separator: true, label: '' },
      { label: 'Trim Trailing Whitespace', action: editorCmd('trimTrailingWhitespace') },
      { label: 'Beautify', shortcut: `${mod}+${alt}+Shift+M`, action: editorCmd('beautify') },
      { label: 'Transform schema', shortcut: `${mod}+${alt}+Shift+K`, action: editorCmd('transformToDiagram') },
      { label: 'Remove Duplicates', shortcut: `${mod}+${alt}+Shift+C`, action: editorCmd('removeDuplicates') },
      { label: 'Indent Selection', shortcut: 'Tab', action: editorCmd('indentSelection') },
      { label: 'Outdent Selection', shortcut: 'Shift+Tab', action: editorCmd('outdentSelection') },
    ],
    Search: [
      { label: 'Find...', icon: <Search size={18} />, shortcut: `${mod}+F`, action: onFind },
      { label: 'Replace...', icon: <Replace size={18} />, shortcut: `${mod}+H`, action: onReplace },
      { label: 'Find in Files...', icon: <FolderSearch size={18} />, shortcut: `${mod}+Shift+F`, action: onFindInFiles },
      { separator: true, label: '' },
      { label: 'Go to Line...', shortcut: `${mod}+G`, action: editorCmd('goToLine') },
      { separator: true, label: '' },
      { label: 'Toggle Bookmark', shortcut: `${mod}+F2`, disabled: true },
      { label: 'Next Bookmark', shortcut: 'F2', disabled: true },
      { label: 'Previous Bookmark', shortcut: 'Shift+F2', disabled: true },
      { label: 'Clear All Bookmarks', disabled: true },
    ],
    View: [
      { label: showToolbar ? 'Hide Toolbar' : 'Show Toolbar', action: () => setShowToolbar(!showToolbar) },
      { label: showStatusBar ? 'Hide Status Bar' : 'Show Status Bar', action: () => setShowStatusBar(!showStatusBar) },
      { label: showSidebar ? 'Hide Sidebar' : 'Show Sidebar', icon: showSidebar ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />, shortcut: `${mod}+B`, action: () => setShowSidebar(!showSidebar) },
      { label: 'Preview', shortcut: `${mod}+P`, action: editorCmd('togglePreview') },
      { separator: true, label: '' },
      {
        label: 'Word Wrap', shortcut: `${alt}+Z`, checked: wordWrap,
        action: () => {
          const v = !wordWrap
          setWordWrap(v)
          window.dispatchEvent(new CustomEvent('editor:set-option-local', { detail: { wordWrap: v ? 'on' : 'off' } }))
        },
      },
      {
        label: 'Show Whitespace', checked: renderWhitespace,
        action: () => {
          const v = !renderWhitespace
          setRenderWhitespace(v)
          window.dispatchEvent(new CustomEvent('editor:set-option-local', { detail: { renderWhitespace: v ? 'all' : 'none' } }))
        },
      },
      {
        label: 'Show Indentation Guides', checked: indentationGuides,
        action: () => {
          const v = !indentationGuides
          setIndentationGuides(v)
          window.dispatchEvent(new CustomEvent('editor:set-option-local', { detail: { guides: { indentation: v } } }))
        },
      },
      {
        label: 'Column Select Mode', checked: columnSelectMode,
        action: () => {
          const v = !columnSelectMode
          setColumnSelectMode(v)
          window.dispatchEvent(new CustomEvent('editor:set-option-local', { detail: { columnSelection: v } }))
        },
      },
      { separator: true, label: '' },
      { label: 'Zoom In', shortcut: `${mod}+=`, action: editorCmd('zoomIn') },
      { label: 'Zoom Out', shortcut: `${mod}+-`, action: editorCmd('zoomOut') },
      { label: 'Reset Zoom', shortcut: `${mod}+0`, action: editorCmd('zoomReset') },
      { separator: true, label: '' },
      { label: 'Split View', disabled: true },
    ],
    Macro: [
      { label: 'Start Recording', shortcut: `${mod}+Shift+R`, disabled: true },
      { label: 'Stop Recording', shortcut: `${mod}+Shift+R`, disabled: true },
      { label: 'Playback', shortcut: `${mod}+Shift+P`, disabled: true },
      { separator: true, label: '' },
      { label: 'Saved Macros', disabled: true },
    ],
    Plugins: [
      {
        label: 'Plugin Manager...',
        action: () => useEditorStore.getState().openPluginManagerTab()
      },
      ...(dynamicPluginMenu.length > 0
        ? [{ separator: true, label: '' } as MenuItem, ...dynamicPluginMenu]
        : []),
    ],
    Window: [
      { label: 'Minimize', action: () => window.dispatchEvent(new CustomEvent('window:minimize')) },
      { label: 'Zoom', action: () => window.dispatchEvent(new CustomEvent('window:zoom')) },
      { separator: true, label: '' },
      { label: 'Next Tab', shortcut: `${mod}+Tab`, action: () => window.dispatchEvent(new CustomEvent('tab:next-local')) },
      { label: 'Previous Tab', shortcut: `${mod}+Shift+Tab`, action: () => window.dispatchEvent(new CustomEvent('tab:prev-local')) },
    ],
    Help: [
      { label: 'About NovaPad', action: () => useUIStore.getState().setShowAbout(true) },
      { separator: true, label: '' },
      { label: 'Check for Updates...', action: () => { void window.api.update.check() } },
      { separator: true, label: '' },
      { label: 'Open DevTools', shortcut: 'F12', action: () => window.api.send('dev:toggle-devtools') },
    ],
  }

  const topMenus = ['File', 'Edit', 'Search', 'View', 'Macro', 'Plugins', 'Window', 'Help']

  const renderMenuItems = (items: MenuItem[], parentLabel: string) => (
    items.map((item, i) => {
      if (item.separator) {
        return <div key={`${parentLabel}-sep-${i}`} className="h-px bg-border mx-2 my-1" />
      }
      if (item.submenu) {
        const subKey = `${parentLabel}-${item.label}`
        return (
          <div
            key={item.label}
            className="relative"
            onMouseEnter={() => setHoveredSubmenu(subKey)}
            onMouseLeave={() => setHoveredSubmenu(null)}
          >
            <div className="w-full flex items-center gap-2.5 px-3 py-2 text-base text-popover-foreground hover:bg-secondary transition-colors cursor-default">
              <span className="w-5 flex justify-center shrink-0">{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              <ChevronRight size={18} className="text-muted-foreground shrink-0" />
            </div>
            {hoveredSubmenu === subKey && (
              <div className="absolute left-full top-0 ml-0.5 min-w-[220px] bg-popover border border-border rounded-md shadow-lg py-1 z-50">
                {renderMenuItems(item.submenu, subKey)}
              </div>
            )}
          </div>
        )
      }
      return (
        <button
          key={item.label}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-base text-popover-foreground transition-colors ${
            item.disabled ? 'opacity-40 pointer-events-none' : 'hover:bg-secondary'
          }`}
          disabled={item.disabled}
          onClick={() => {
            if (!item.disabled) {
              item.action?.()
              setActiveMenu(null)
              setHoveredSubmenu(null)
            }
          }}
        >
          <span className="w-5 flex justify-center shrink-0">
            {item.checked !== undefined ? (
              <span className="text-base">{item.checked ? '✓' : ''}</span>
            ) : (
              item.icon
            )}
          </span>
          <span className="flex-1 text-left">{item.label}</span>
          {item.shortcut && (
            <span className="text-base text-muted-foreground ml-4 font-mono tabular-nums shrink-0">{item.shortcut}</span>
          )}
        </button>
      )
    })
  )

  return (
    <div
      ref={menuRef}
      className="h-9 bg-toolbar border-b border-toolbar-border flex items-center px-1 select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      data-testid="menubar"
    >
      {/* Menu items */}
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {topMenus.map((label) => (
          <div key={label} className="relative">
            <button
              className={`px-3 py-1.5 text-base text-toolbar-foreground hover:bg-secondary rounded-sm transition-colors ${
                activeMenu === label ? 'bg-secondary' : ''
              }`}
              onMouseEnter={() => activeMenu && setActiveMenu(label)}
              onClick={() => {
                setActiveMenu(activeMenu === label ? null : label)
                setHoveredSubmenu(null)
              }}
            >
              {label}
            </button>

            {/* Dropdown */}
            {activeMenu === label && menuItems[label] && (
              <div className="absolute top-full left-0 mt-0.5 min-w-[260px] bg-popover border border-border rounded-md shadow-lg py-1 z-50">
                {renderMenuItems(menuItems[label], label)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex-1" />

      {/* Right-side quick icons */}
      <div className="flex items-center gap-0.5 mr-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <NavButtons />
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="p-2 text-toolbar-foreground hover:bg-secondary rounded-sm transition-colors"
          title={showSidebar ? 'Hide Explorer' : 'Show Explorer'}
        >
          {showSidebar ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        </button>
        <SettingsMenu />
      </div>
    </div>
  )
}
