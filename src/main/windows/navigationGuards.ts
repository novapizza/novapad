import { app, shell, type WebContents } from 'electron'

/**
 * Navigation hardening for privileged renderer windows.
 *
 * The app is a single-page React/Monaco UI that never performs a legitimate
 * full-page navigation — so any `will-navigate` to a non-app URL is either an
 * accidental in-window link (e.g. a markdown link) or an XSS attempt trying to
 * steer the privileged window somewhere hostile. We block all such navigations;
 * genuine external links (http/https/mailto) are handed to the system browser
 * instead, matching the existing `setWindowOpenHandler` behavior. `<webview>`
 * attachment is denied outright — the app uses none.
 */

function isAppUrl(target: string): boolean {
  try {
    const url = new URL(target)
    // Dev: the Vite renderer dev server (search window appends `?page=search`).
    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
      return target.startsWith(process.env['ELECTRON_RENDERER_URL'])
    }
    // Packaged: only our bundled renderer entry over file://.
    return url.protocol === 'file:' && url.pathname.endsWith('/renderer/index.html')
  } catch {
    return false
  }
}

export function installNavigationGuards(contents: WebContents): void {
  contents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return
    e.preventDefault()
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url)
  })

  // App uses no <webview>; deny attachment defensively.
  contents.on('will-attach-webview', (e) => {
    e.preventDefault()
  })
}
