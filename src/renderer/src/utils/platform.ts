/**
 * macOS detection for UI shortcut labels. Prefer `window.api.platform` from preload
 * (Node process.platform at app runtime). Fall back to User-Agent when the value is
 * missing or unknown so labels stay correct if the preload API shape changes.
 */
export function isMacOS(): boolean {
  const p = typeof window !== 'undefined' ? window.api?.platform : undefined
  if (p === 'darwin') return true
  if (p === 'win32' || p === 'linux' || p === 'freebsd' || p === 'openbsd') return false
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent ?? ''
    if (/Macintosh|Mac OS X|MacIntel/i.test(ua)) return true
  }
  return false
}

/** Primary modifier label for shortcuts (⌘ on macOS, Ctrl elsewhere). */
export function shortcutMod(): '⌘' | 'Ctrl' {
  return isMacOS() ? '⌘' : 'Ctrl'
}

/** Alt / Option key label for shortcuts. */
export function shortcutAlt(): '⌥' | 'Alt' {
  return isMacOS() ? '⌥' : 'Alt'
}

export function isWindows(): boolean {
  const p = typeof window !== 'undefined' ? window.api?.platform : undefined
  if (p === 'win32') return true
  if (p === 'darwin' || p === 'linux' || p === 'freebsd' || p === 'openbsd') return false
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent ?? ''
    if (/Windows/i.test(ua)) return true
  }
  return false
}
