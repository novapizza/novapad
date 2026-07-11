import { useEffect, useState } from 'react'
import { getReleaseNote } from './releaseNotes'
import logoUrl from '../../assets/logo-animated.svg'

export function WhatsNewTab() {
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    void window.api.app
      .getVersion()
      .then((v) => {
        if (!cancelled) setVersion(v)
      })
      .catch(() => {
        if (!cancelled) setVersion('')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Resolve the notes for the running version (exact match, else newest).
  const note = getReleaseNote(version)

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-background" data-testid="whatsnew-tab">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">What's New</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <article className="max-w-[680px] mx-auto px-8 py-10">
          <header className="flex items-center gap-4 mb-6">
            <img src={logoUrl} alt="NovaPad" width={64} height={64} className="rounded-2xl shrink-0" draggable={false} />
            <div>
              <div className="text-3xl font-bold text-foreground leading-tight tracking-tight">NovaPad</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
                Release{version ? ` v${version}` : ''}
              </div>
            </div>
          </header>

          {note ? (
            <>
              <p className="text-base text-foreground leading-relaxed mb-4">{note.summary}</p>

              <h3 className="text-base font-semibold text-foreground mt-8 mb-3">What's New</h3>
              <ul className="space-y-4">
                {note.highlights.map((item) => (
                  <li key={item.title} className="text-base text-foreground leading-relaxed">
                    <span className="font-semibold">{item.title}:</span> {item.body}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-base text-muted-foreground leading-relaxed">
              Release notes for this version aren't available yet.
            </p>
          )}
        </article>
      </div>
    </div>
  )
}
