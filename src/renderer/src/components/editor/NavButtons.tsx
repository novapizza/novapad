import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useNavigationStore } from '../../store/navigationStore'
import { useEditorStore } from '../../store/editorStore'
import { useNavigation } from '../../hooks/useNavigation'
import { isMacOS } from '../../utils/platform'

/**
 * Back / Forward toolbar icons. Placed to the left of the Toggle Sidebar icon
 * in both MenuBar (Windows) and QuickStrip (macOS) right-strips. Disabled
 * state reflects `canGoBack` / `canGoForward` — re-rendered whenever the
 * stacks change.
 *
 * A Zustand subscription to `buffers` is included so `canGoBack()` / `canGoForward()`
 * (which iterate the back/forward stacks looking for a live file buffer) are
 * re-evaluated when tabs open and close.
 */
export function NavButtons() {
  const { navigate } = useNavigation()
  // Subscribe to stack lengths + buffers so the disabled attributes recompute.
  const backLen = useNavigationStore((s) => s.back.length)
  const forwardLen = useNavigationStore((s) => s.forward.length)
  useEditorStore((s) => s.buffers)

  const nav = useNavigationStore.getState()
  const canBack = backLen > 0 && nav.canGoBack()
  const canForward = forwardLen > 0 && nav.canGoForward()

  const backTitle = isMacOS() ? 'Back (⌃-)' : 'Back (Alt+Left)'
  const forwardTitle = isMacOS() ? 'Forward (⌃⇧-)' : 'Forward (Alt+Right)'

  return (
    <div
      className="flex items-center gap-0.5"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={() => navigate('back')}
        disabled={!canBack}
        title={backTitle}
        data-testid="nav-back"
        className="p-2 text-toolbar-foreground rounded-lg transition-colors hover:text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <ArrowLeft size={18} />
      </button>
      <button
        type="button"
        onClick={() => navigate('forward')}
        disabled={!canForward}
        title={forwardTitle}
        data-testid="nav-forward"
        className="p-2 text-toolbar-foreground rounded-lg transition-colors hover:text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <ArrowRight size={18} />
      </button>
    </div>
  )
}
