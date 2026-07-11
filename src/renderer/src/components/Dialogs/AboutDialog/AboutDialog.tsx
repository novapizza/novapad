import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { useAltHeld } from '../../../hooks/useAltHeld'
import { useAltMnemonics } from '../../../hooks/useAltMnemonics'
import { MnemonicLabel } from '../../../utils/mnemonic'
import { isWindows } from '../../../utils/platform'
import logoUrl from '../../../assets/logo-animated.svg'

export function AboutDialog() {
  const { showAbout, setShowAbout } = useUIStore()
  const [version, setVersion] = useState<string>('')
  const altHeld = useAltHeld()
  useAltMnemonics(
    showAbout && isWindows(),
    { O: () => setShowAbout(false) },
    { allowInsideInputs: true, priority: true },
  )

  useEffect(() => {
    if (!showAbout) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAbout(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAbout, setShowAbout])

  useEffect(() => {
    if (!showAbout) return
    window.api.app.getVersion().then(setVersion).catch(() => setVersion(window.api.appVersion))
  }, [showAbout])

  if (!showAbout) return null

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50" onClick={() => setShowAbout(false)}>
      <div
        className="fixed z-[9001] bg-popover border border-border rounded-lg shadow-2xl min-w-[480px] max-w-[90vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">About</span>
          <button
            className="bg-transparent border-none cursor-pointer text-muted-foreground text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-secondary hover:text-foreground"
            onClick={() => setShowAbout(false)}
            title="Close"
          >✕</button>
        </div>
        <div className="px-6 py-4 text-center">
          <img src={logoUrl} alt="NovaPad" width={56} height={56} className="mx-auto mb-2 rounded-lg" draggable={false} />
          <div className="text-lg font-semibold text-foreground">NovaPad</div>
          <div className="text-base text-muted-foreground mt-1">{version ? `Version ${version}` : ' '}</div>
          <p className="text-base text-muted-foreground mt-3 leading-relaxed">
            A cross-platform text editor with full Notepad++ feature parity,
            built on Electron + React + Monaco Editor.
          </p>
          <div className="mt-4">
            <div className="text-base uppercase text-muted-foreground font-semibold tracking-wider mb-2">Built with</div>
            <div className="flex flex-wrap gap-2 justify-center">
              <span className="text-base bg-secondary px-2 py-1 rounded text-foreground">Electron</span>
              <span className="text-base bg-secondary px-2 py-1 rounded text-foreground">React 18</span>
              <span className="text-base bg-secondary px-2 py-1 rounded text-foreground">TypeScript</span>
              <span className="text-base bg-secondary px-2 py-1 rounded text-foreground">Monaco Editor</span>
              <span className="text-base bg-secondary px-2 py-1 rounded text-foreground">Zustand</span>
              <span className="text-base bg-secondary px-2 py-1 rounded text-foreground">Vite</span>
            </div>
          </div>
          <div className="text-base text-muted-foreground mt-3">License: MIT</div>
        </div>
        <div className="flex items-center justify-center gap-2 px-3 py-2 border-t border-border">
          <button
            className="px-3 py-1.5 text-base border-none rounded bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors"
            onClick={() => setShowAbout(false)}
          ><MnemonicLabel label="&OK" show={altHeld} /></button>
        </div>
      </div>
    </div>
  )
}
