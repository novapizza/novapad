import { Search } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { shortcutMod } from '../../utils/platform'

/**
 * Centered search field in the title strip (QuickStrip on macOS, MenuBar on
 * Windows/Linux). Opens the palette in file mode; typing `>` switches it to
 * commands, same as Mod+E / Mod+Shift+P.
 */
export function CommandBar() {
  const mod = shortcutMod()
  return (
    <button
      type="button"
      onClick={() => useUIStore.getState().setCommandPalette('files')}
      className="flex items-center gap-2 w-full max-w-[440px] h-[30px] px-2.5 rounded-lg border border-input bg-secondary text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      aria-label="Search files and commands"
      data-testid="command-bar"
    >
      <Search size={15} className="shrink-0" />
      <span className="flex-1 text-left truncate">Search files, &gt; for commands</span>
      <kbd className="font-mono text-[11px] px-1.5 py-px rounded-[5px] border border-input text-muted-foreground/70">
        {mod === '⌘' ? '⌘E' : 'Ctrl+E'}
      </kbd>
    </button>
  )
}
