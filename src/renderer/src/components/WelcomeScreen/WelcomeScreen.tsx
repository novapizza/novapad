import React, { useEffect, useState } from 'react'
import { FilePlus, FolderOpen, Search, Settings as SettingsIcon } from 'lucide-react'
import { useConfigStore } from '../../store/configStore'
import { useEditorStore } from '../../store/editorStore'
import { useUIStore } from '../../store/uiStore'
import { shortcutMod } from '../../utils/platform'
import { RELEASE_NOTES } from '../WhatsNewTab/releaseNotes'
import logoUrl from '../../assets/logo-animated.svg'

interface WelcomeScreenProps {
  onNewFile: () => void
  onOpenFile: () => void
  onOpenRecent: (paths: string[]) => void
}

/** Small mono, uppercase section label (Nova Suite "eyebrow"). */
function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70 ${className}`}>
      {children}
    </span>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] px-1.5 py-px rounded-[5px] border border-input text-muted-foreground/80 tabular-nums">
      {children}
    </span>
  )
}

const rowClass =
  'flex items-center gap-3 w-full h-9 px-3.5 rounded-lg text-[13.5px] text-foreground bg-transparent border-none cursor-pointer hover:bg-secondary transition-colors text-left'

export function WelcomeScreen({ onNewFile, onOpenFile, onOpenRecent }: WelcomeScreenProps) {
  const mod = shortcutMod()
  const key = (k: string) => (mod === '⌘' ? `⌘${k}` : `Ctrl+${k}`)
  const { maxRecentFiles } = useConfigStore()
  const [recents, setRecents] = useState<string[]>([])
  const [version, setVersion] = useState<string>('')
  const latest = RELEASE_NOTES[0]

  useEffect(() => {
    window.api.file.getRecents().then((files: string[]) => {
      setRecents(files.slice(0, Math.min(maxRecentFiles, 8)))
    })
  }, [maxRecentFiles])

  useEffect(() => {
    window.api.app.getVersion().then(setVersion).catch(() => setVersion(window.api.appVersion))
  }, [])

  const startActions = [
    { icon: <FilePlus size={17} />, label: 'New File', keys: key('N'), action: onNewFile },
    { icon: <FolderOpen size={17} />, label: 'Open File…', keys: key('O'), action: onOpenFile },
    { icon: <Search size={17} />, label: 'Go to File…', keys: key('E'), action: () => useUIStore.getState().setCommandPalette('files') },
    { icon: <SettingsIcon size={17} />, label: 'Settings', keys: key(','), action: () => useEditorStore.getState().openVirtualTab('settings') }
  ]

  return (
    <div className="flex items-center justify-center w-full h-full bg-background p-10 overflow-auto">
      <div className="w-full max-w-[760px] grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <img src={logoUrl} alt="NovaPad" className="w-[72px] h-[72px] shrink-0" draggable={false} />
            <div className="flex flex-col gap-1">
              <span className="text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] text-foreground">NovaPad</span>
              <span className="text-[13px] text-muted-foreground">
                The editor.{version ? ` Version ${version}` : ''}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Eyebrow className="px-3.5 pb-1.5">Start</Eyebrow>
            {startActions.map((a) => (
              <button key={a.label} type="button" className={rowClass} onClick={a.action}>
                <span className="text-primary shrink-0">{a.icon}</span>
                <span className="flex-1">{a.label}</span>
                <Kbd>{a.keys}</Kbd>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6 md:pt-1.5">
          {recents.length > 0 && (
            <div className="flex flex-col gap-1">
              <Eyebrow className="px-3.5 pb-1.5">Recent</Eyebrow>
              {recents.map((fp) => {
                const parts = fp.replace(/\\/g, '/').split('/')
                const name = parts[parts.length - 1]
                const dir = parts.slice(0, -1).join('/')
                return (
                  <button
                    key={fp}
                    type="button"
                    className="flex flex-col items-start justify-center gap-0.5 w-full h-11 px-3.5 rounded-lg bg-transparent border-none cursor-pointer hover:bg-secondary transition-colors text-left"
                    onClick={() => onOpenRecent([fp])}
                    title={fp}
                  >
                    <span className="text-[13.5px] text-foreground truncate max-w-full">{name}</span>
                    {dir && <span className="font-mono text-[11.5px] text-muted-foreground/70 truncate max-w-full">{dir}</span>}
                  </button>
                )
              })}
            </div>
          )}

          {latest && (
            <button
              type="button"
              onClick={() => useEditorStore.getState().openVirtualTab('whatsNew')}
              className="flex flex-col gap-1.5 px-[18px] py-4 rounded-[14px] border border-border bg-card text-left cursor-pointer hover:bg-secondary transition-colors"
            >
              <Eyebrow className="!text-primary">New in {latest.version}</Eyebrow>
              <span className="text-[13.5px] leading-[1.55] text-foreground">{latest.summary}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
