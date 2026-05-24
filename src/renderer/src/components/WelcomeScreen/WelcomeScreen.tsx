import React, { useEffect, useState } from 'react'
import { FilePlus, FolderOpen, Clock } from 'lucide-react'
import { useConfigStore } from '../../store/configStore'
import { shortcutMod } from '../../utils/platform'

interface WelcomeScreenProps {
  onNewFile: () => void
  onOpenFile: () => void
  onOpenRecent: (paths: string[]) => void
}

export function WelcomeScreen({ onNewFile, onOpenFile, onOpenRecent }: WelcomeScreenProps) {
  const mod = shortcutMod()
  const { maxRecentFiles } = useConfigStore()
  const [recents, setRecents] = useState<string[]>([])

  useEffect(() => {
    window.api.file.getRecents().then((files: string[]) => {
      setRecents(files.slice(0, Math.min(maxRecentFiles, 8)))
    })
  }, [maxRecentFiles])

  return (
    <div className="flex justify-center w-full h-full bg-background pt-[10%]">
      <div className="flex flex-col items-center gap-6">
        <div className="w-24 h-24 mx-auto rounded-2xl bg-muted flex items-center justify-center">
          <span className="text-4xl font-bold font-mono text-muted-foreground leading-none">N+</span>
        </div>

        <div className="min-w-[340px] border border-border rounded-lg overflow-hidden bg-card">
            <button
              className="flex items-center justify-between w-full px-4 py-3 text-base text-foreground bg-transparent border-none cursor-pointer hover:bg-secondary transition-colors"
              onClick={onNewFile}
            >
              <span className="flex items-center gap-2.5">
                <FilePlus size={18} className="text-muted-foreground shrink-0" />
                New File
              </span>
              <span className="text-base text-muted-foreground font-mono tabular-nums">{mod} N</span>
            </button>
            <button
              className="flex items-center justify-between w-full px-4 py-3 text-base text-foreground bg-transparent border-none cursor-pointer hover:bg-secondary transition-colors border-t border-border"
              onClick={onOpenFile}
            >
              <span className="flex items-center gap-2.5">
                <FolderOpen size={18} className="text-muted-foreground shrink-0" />
                Open File…
              </span>
              <span className="text-base text-muted-foreground font-mono tabular-nums">{mod} O</span>
            </button>

            {recents.length > 0 && (
              <>
                <div className="flex items-center gap-2.5 px-4 py-2 text-base uppercase tracking-wider text-muted-foreground border-t border-border">
                  <Clock size={18} className="shrink-0" />
                  <span>Recent</span>
                </div>
                {recents.map((fp) => {
                  const parts = fp.replace(/\\/g, '/').split('/')
                  const name = parts[parts.length - 1]
                  const dir = parts.length > 1 ? parts[parts.length - 2] : ''
                  return (
                    <button
                      key={fp}
                      className="flex items-center w-full px-4 py-2 text-base text-foreground bg-transparent border-none cursor-pointer hover:bg-secondary transition-colors"
                      onClick={() => onOpenRecent([fp])}
                      title={fp}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{name}</span>
                        {dir && <span className="text-base text-muted-foreground truncate">{dir}</span>}
                      </span>
                    </button>
                  )
                })}
              </>
            )}
        </div>
      </div>
    </div>
  )
}
