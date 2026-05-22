import React, { useEffect } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'

/**
 * Shared fullscreen affordances for the three right-side preview panes
 * (Markdown, SQL plan, Table Lens). Each pane calls this hook to get:
 *   - `fullscreen` flag (drives the wrapping <section>'s classes)
 *   - `Toggle` element to drop into the pane header next to the close button
 *   - automatic Escape-to-exit while fullscreen is active
 */
export function usePreviewFullscreen() {
  const fullscreen = useUIStore((s) => s.previewFullscreen)
  const toggleFullscreen = useUIStore((s) => s.togglePreviewFullscreen)
  const setFullscreen = useUIStore((s) => s.setPreviewFullscreen)

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, setFullscreen])

  const Toggle = (
    <button
      onClick={toggleFullscreen}
      aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      aria-pressed={fullscreen}
      title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen preview'}
      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
    >
      {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
    </button>
  )

  // Classes applied to the pane's outer <section>. In fullscreen we lift the
  // pane out of the split layout into a fixed overlay covering everything
  // (including the status bar / toolbar) so the user can read at full width.
  const sectionClass = fullscreen
    ? 'fixed inset-0 z-50 flex flex-col h-full overflow-hidden bg-background'
    : 'flex flex-col h-full overflow-hidden bg-background border-l border-border'

  return { fullscreen, sectionClass, Toggle }
}
