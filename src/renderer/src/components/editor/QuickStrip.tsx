import { PanelLeftClose, PanelLeft } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { SettingsMenu } from './SettingsMenu'
import { NavButtons } from './NavButtons'
import logoUrl from '../../assets/logo-mark.svg'

interface QuickStripProps {
  onToggleSidebar: () => void
}

export function QuickStrip({ onToggleSidebar }: QuickStripProps) {
  const { showSidebar } = useUIStore()

  return (
    <div
      className="h-12 bg-toolbar border-b border-toolbar-border flex items-center px-1 select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      data-testid="quickstrip"
    >
      {/* macOS traffic light spacer */}
      <div className="w-[78px] h-full shrink-0" />

      {/* App icon */}
      <div className="flex items-center gap-2 px-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <img src={logoUrl} alt="NovaPad" className="w-5 h-5 shrink-0" draggable={false} />
        <span className="text-sm font-semibold text-toolbar-foreground tracking-tight">NovaPad</span>
      </div>

      <div className="flex-1" />

      {/* Quick action icons */}
      <div className="flex items-center gap-0.5 mr-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <NavButtons />
        <button
          onClick={onToggleSidebar}
          className="p-2 text-toolbar-foreground hover:bg-secondary rounded-sm transition-colors"
          title={showSidebar ? 'Hide Explorer' : 'Show Explorer'}
          data-testid="quickstrip-sidebar"
        >
          {showSidebar ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        </button>
        <SettingsMenu />
      </div>
    </div>
  )
}
