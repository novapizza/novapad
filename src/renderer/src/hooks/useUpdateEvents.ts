import { useEffect } from 'react'
import type { ExternalToast } from 'sonner'
import { toast } from '../components/ui/sonner'
import { useUpdateStore } from '../store/updateStore'

type UpdateToastKind = 'info' | 'success' | 'error'

interface UpdateToastPalette {
  bg: string
  fg: string
  /** Left stripe + icon colour (inverted info card only). */
  accent?: string
  /** Fill for the close/action buttons: the opposite of `bg`. */
  buttonBg: string
  buttonFg: string
}

const SLATE_900 = '#0f172a'
const SLATE_50 = '#f8fafc'

/**
 * Info is an inverted card: it flips against the app theme (~18:1 vs the app
 * background in both), with a blue stripe. A solid blue fill only managed
 * ~4-5:1 and read like the app's own accent. Success/error stay solid fills.
 * Sonner's rich colours were near-black in dark theme, hence custom fills.
 */
function paletteFor(kind: UpdateToastKind, dark: boolean): UpdateToastPalette {
  switch (kind) {
    case 'info':
      return dark
        ? { bg: SLATE_50, fg: SLATE_900, accent: '#2563eb', buttonBg: SLATE_900, buttonFg: '#ffffff' }
        : { bg: SLATE_900, fg: '#ffffff', accent: '#3b82f6', buttonBg: '#ffffff', buttonFg: SLATE_900 }
    case 'success':
      return { bg: '#059669', fg: '#ffffff', buttonBg: '#ffffff', buttonFg: SLATE_900 }
    case 'error':
      return { bg: '#dc2626', fg: '#ffffff', buttonBg: '#ffffff', buttonFg: SLATE_900 }
  }
}

/** The app toggles dark mode with a `dark` class on <html> (Tailwind). */
function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark')
}

/**
 * Opaque, theme-aware update toasts (they stack above every overlay via the
 * Toaster's z-index). Inline `style` beats sonner's rich-colour selectors;
 * title/description inherit the toast colour so the palette drives them.
 */
function updateToast(kind: UpdateToastKind, opts: ExternalToast = {}): ExternalToast {
  const p = paletteFor(kind, isDarkTheme())
  return {
    richColors: false,
    ...opts,
    style: {
      background: p.bg,
      borderColor: p.accent ?? p.bg,
      color: p.fg,
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
      ...(p.accent ? { borderLeft: `4px solid ${p.accent}` } : {}),
      // Read by the classNames below (classes are static; colours are not).
      ['--update-accent' as string]: p.accent ?? p.fg,
      ['--update-bg' as string]: p.bg,
      ['--update-fg' as string]: p.fg,
      ...opts.style
    },
    actionButtonStyle: { background: p.buttonBg, color: p.buttonFg, ...opts.actionButtonStyle },
    classNames: {
      title: '!text-inherit font-semibold',
      description: '!text-inherit opacity-90',
      icon: '!text-[var(--update-accent)]',
      closeButton: '!bg-[var(--update-bg)] !text-[var(--update-fg)] !border-[var(--update-fg)]',
      actionButton: 'font-semibold',
      ...opts.classNames
    }
  }
}

/**
 * Subscribes to auto-update events from the main process and drives:
 *   - updateStore status transitions
 *   - sonner toast notifications (manual checks get verbose feedback;
 *     silent startup checks suppress "no update found" and error toasts)
 *   - "Restart now" action toast when the update is downloaded
 */
export function useUpdateEvents(): void {
  const { setStatus, setVersion, setProgress, setError } = useUpdateStore()

  useEffect(() => {
    const CHECKING_TOAST_ID = 'update-checking'
    const DOWNLOADED_TOAST_ID = 'update-downloaded'

    const unsubs = [
      window.api.on('update:checking', (...args) => {
        const { manual } = (args[0] ?? {}) as { manual?: boolean }
        console.debug('[update] checking', { manual })
        setStatus('checking')
        setError(null)
        if (manual) {
          toast.info('Looking for updates…', updateToast('info', { id: CHECKING_TOAST_ID }))
        }
      }),

      window.api.on('update:available', (...args) => {
        const { version, manual } = (args[0] ?? {}) as { version?: string; manual?: boolean }
        console.debug('[update] available', { version, manual })
        setStatus('available')
        setVersion(version ?? null)
        toast.dismiss(CHECKING_TOAST_ID)
        toast.info(
          version ? `Version ${version} found — downloading in the background` : 'New version found — downloading…',
          updateToast('info', { description: 'We\'ll let you know when it\'s ready to install.' })
        )
      }),

      window.api.on('update:not-available', (...args) => {
        const { manual } = (args[0] ?? {}) as { manual?: boolean }
        console.debug('[update] not-available', { manual })
        setStatus('idle')
        toast.dismiss(CHECKING_TOAST_ID)
        if (manual) {
          toast.success("You're on the latest version", updateToast('success'))
        }
      }),

      window.api.on('update:downloading', (...args) => {
        const { percent } = (args[0] ?? {}) as { percent?: number }
        if (typeof percent === 'number' && percent % 10 < 1) {
          console.debug('[update] downloading', { percent: Math.round(percent) })
        }
        setStatus('downloading')
        if (typeof percent === 'number') setProgress(percent)
      }),

      window.api.on('update:downloaded', (...args) => {
        const { version } = (args[0] ?? {}) as { version?: string }
        console.debug('[update] downloaded', { version })
        setStatus('downloaded')
        setVersion(version ?? null)
        toast.success(
          version ? `NovaPad ${version} is ready` : 'Update ready to install',
          updateToast('success', {
            id: DOWNLOADED_TOAST_ID,
            description: 'Restart now to get the latest features and fixes.',
            duration: Infinity,
            action: {
              label: 'Restart & update',
              onClick: () => {
                void window.api.update.install()
              }
            }
          })
        )
      }),

      window.api.on('update:error', (...args) => {
        const { message, manual } = (args[0] ?? {}) as { message?: string; manual?: boolean }
        console.warn('[update] error', { message, manual })
        setStatus('error')
        setError(message ?? 'Unknown update error')
        toast.dismiss(CHECKING_TOAST_ID)
        if (manual) {
          toast.error("Couldn't check for updates", updateToast('error', {
            description: 'Please check your internet connection and try again.'
          }))
        }
      }),

      // Manual check while auto-update is off (dev build, portable copy in a
      // read-only folder, Linux rpm/deb): say why instead of doing nothing.
      window.api.on('update:disabled', (...args) => {
        const { reason } = (args[0] ?? {}) as { reason?: string | null }
        console.debug('[update] disabled', { reason })
        toast.info("Automatic updates aren't available", updateToast('info', {
          description: reason ?? 'This copy of NovaPad cannot check for updates.'
        }))
      }),
    ]

    return () => unsubs.forEach((unsub) => unsub())
  }, [setStatus, setVersion, setProgress, setError])
}
