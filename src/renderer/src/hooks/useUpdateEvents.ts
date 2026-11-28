import { useEffect } from 'react'
import type { ExternalToast } from 'sonner'
import { toast } from '../components/ui/sonner'
import { useUpdateStore } from '../store/updateStore'

type UpdateToastKind = 'info' | 'success' | 'error'

/** Solid, high-contrast fills. Sonner's rich colors are near-black in dark theme
 *  (info bg is hsl(215 100% 6%)), which made update toasts blend into the editor. */
const UPDATE_TOAST_BG: Record<UpdateToastKind, string> = {
  info: '#2563eb',    // blue-600
  success: '#059669', // emerald-600
  error: '#dc2626'    // red-600
}

/**
 * Update toasts use an opaque fill in both themes (they stack above every
 * overlay via the Toaster's z-index). Inline `style` beats sonner's
 * rich-color attribute selectors.
 */
function updateToast(kind: UpdateToastKind, opts: ExternalToast = {}): ExternalToast {
  const bg = UPDATE_TOAST_BG[kind]
  return {
    richColors: false,
    ...opts,
    style: {
      background: bg,
      borderColor: bg,
      color: '#ffffff',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
      ...opts.style
    },
    classNames: {
      title: '!text-white font-semibold',
      description: '!text-white/90',
      icon: '!text-white',
      closeButton: '!bg-white !text-slate-900 !border-white',
      actionButton: '!bg-white !text-slate-900 font-semibold',
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
