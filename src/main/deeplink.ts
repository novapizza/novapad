import { app, dialog, net, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/**
 * novapad:// deeplink handling.
 *
 * Supported forms:
 *   novapad://open?url=<https-url>[&line=N][&col=M]     — fetch, read-only tab
 *   novapad://preview?url=<https-url>[&line=N][&col=M]  — as open, preview pane on
 *   novapad://new?title=…&content=…&lang=…              — new editable tab, inline content
 *                     (content is URL-encoded; use &contentBase64=… for large/unicode payloads)
 *
 * For open/preview the target is fetched in the main process and shipped to the
 * renderer as a read-only buffer — a deeplink can never touch a file on disk.
 * Deeplinks are untrusted input (any web page can trigger the scheme), so the
 * target must be https, credential-free, and its host either on the persisted
 * allowlist or explicitly confirmed by the user in a dialog. `new` carries its
 * content inline (no fetch, no disk, no host) so it needs no allowlist.
 */

export const DEEPLINK_SCHEME = 'novapad'

/** Remote files above this are rejected — deeplink targets are documents, not archives. */
const MAX_FETCH_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 5
/** Inline `new` content cap (after base64 decode) — guards against a huge URL DoS. */
const MAX_NEW_CONTENT_BYTES = 5 * 1024 * 1024

const ALLOWLIST_FILE = 'deeplink.json'

export interface DeeplinkPayload {
  fileName: string
  content: string
  sourceUrl: string
  line?: number
  col?: number
  /** true for the `preview` verb — renderer opens the preview pane after loading. */
  preview?: boolean
}

export interface NewPayload {
  title: string
  content: string
  /** Sanitized language hint; renderer validates it against Monaco and falls back if unknown. */
  language: string | null
}

interface DeeplinkDeps {
  /** Queue-aware sender — must buffer messages until the renderer attaches listeners. */
  sendToRenderer: (channel: string, ...args: unknown[]) => void
  getWindow: () => BrowserWindow | null
}

let deps: DeeplinkDeps | null = null

export function initDeeplink(d: DeeplinkDeps): void {
  deps = d
}

/** Pull novapad:// args out of a process argv array (Windows/Linux delivery path). */
export function extractDeeplinkArgs(argv: string[]): string[] {
  return argv.filter((a) => typeof a === 'string' && a.toLowerCase().startsWith(`${DEEPLINK_SCHEME}://`))
}

export type DeeplinkAction =
  | { verb: 'open' | 'preview'; target: URL; line?: number; col?: number }
  | { verb: 'new'; title: string; content: string; language: string | null }

function positiveInt(raw: string | null): number | undefined {
  if (!raw) return undefined
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 1 && n <= 10_000_000 ? n : undefined
}

/** Strip path-like / C0-control chars so a link-supplied title is safe to display. */
function sanitizeTitle(raw: string | null): string {
  if (!raw) return 'untitled'
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\\/\0-\x1f]/g, '').trim().slice(0, 128)
  return cleaned || 'untitled'
}

/** Accept only plausible Monaco language ids; the renderer re-validates. */
function sanitizeLang(raw: string | null): string | null {
  if (!raw) return null
  return /^[a-z0-9+#._-]{1,30}$/i.test(raw) ? raw.toLowerCase() : null
}

/** Parse + validate. Returns null for anything that isn't a well-formed verb. */
export function parseDeeplink(raw: string): DeeplinkAction | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== `${DEEPLINK_SCHEME}:`) return null
  // novapad://open?... parses the verb as the authority; tolerate a path form too.
  const verb = (u.host || u.pathname.replace(/^\/+/, '')).toLowerCase()

  if (verb === 'open' || verb === 'preview') {
    const rawTarget = u.searchParams.get('url')
    if (!rawTarget) return null
    let target: URL
    try {
      target = new URL(rawTarget)
    } catch {
      return null
    }
    // https only: no local paths (file:), no cleartext, no embedded credentials.
    if (target.protocol !== 'https:') return null
    if (target.username || target.password) return null
    return { verb, target, line: positiveInt(u.searchParams.get('line')), col: positiveInt(u.searchParams.get('col')) }
  }

  if (verb === 'new') {
    const b64 = u.searchParams.get('contentBase64')
    let content: string
    if (b64) {
      let buf: Buffer
      try {
        buf = Buffer.from(b64, 'base64')
      } catch {
        return null
      }
      if (buf.length > MAX_NEW_CONTENT_BYTES) return null
      content = buf.toString('utf8')
    } else {
      content = u.searchParams.get('content') ?? ''
      if (Buffer.byteLength(content, 'utf8') > MAX_NEW_CONTENT_BYTES) return null
    }
    // Inline content is display-only text; reject embedded NULs (binary payload).
    // eslint-disable-next-line no-control-regex
    if (/\x00/.test(content)) return null
    return { verb: 'new', title: sanitizeTitle(u.searchParams.get('title')), content, language: sanitizeLang(u.searchParams.get('lang')) }
  }

  return null
}

// --- Host allowlist (userData/config/deeplink.json) ---------------------------

function allowlistPath(): string {
  return path.join(app.getPath('userData'), 'config', ALLOWLIST_FILE)
}

function loadAllowedHosts(): Set<string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(allowlistPath(), 'utf8'))
    if (Array.isArray(parsed?.allowedHosts)) {
      return new Set(parsed.allowedHosts.filter((h: unknown) => typeof h === 'string').map((h: string) => h.toLowerCase()))
    }
  } catch {
    // Missing or corrupt file — treat as empty allowlist.
  }
  return new Set()
}

function persistAllowedHost(host: string): void {
  const hosts = loadAllowedHosts()
  hosts.add(host.toLowerCase())
  try {
    const dir = path.dirname(allowlistPath())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(allowlistPath(), JSON.stringify({ allowedHosts: [...hosts].sort() }, null, 2), 'utf8')
  } catch (err) {
    console.error('[deeplink] failed to persist allowlist:', err)
  }
}

// --- Fetch --------------------------------------------------------------------

function fetchRemoteText(target: URL, allowedHosts: Set<string>): Promise<string> {
  return new Promise((resolve, reject) => {
    // Redirects may only land on https hosts the user already trusts for this
    // request (allowlist + the confirmed original host).
    const hostOk = (host: string): boolean => allowedHosts.has(host.toLowerCase())
    let redirects = 0
    let settled = false
    const chunks: Buffer[] = []
    let received = 0

    const req = net.request({ url: target.toString(), redirect: 'manual' })
    const fail = (msg: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      req.abort()
      reject(new Error(msg))
    }
    const timer = setTimeout(() => fail(`Timed out after ${FETCH_TIMEOUT_MS / 1000}s`), FETCH_TIMEOUT_MS)

    req.on('redirect', (_status, _method, redirectUrl) => {
      redirects++
      if (redirects > MAX_REDIRECTS) return fail('Too many redirects')
      let u: URL
      try {
        u = new URL(redirectUrl)
      } catch {
        return fail('Invalid redirect URL')
      }
      if (u.protocol !== 'https:' || !hostOk(u.host)) {
        return fail(`Blocked redirect to untrusted location: ${u.host || redirectUrl}`)
      }
      req.followRedirect()
    })

    req.on('response', (res) => {
      if (res.statusCode !== 200) return fail(`Server responded with HTTP ${res.statusCode}`)
      const declared = Number(res.headers['content-length'])
      if (Number.isFinite(declared) && declared > MAX_FETCH_BYTES) {
        return fail(`File is larger than ${MAX_FETCH_BYTES / 1024 / 1024} MB`)
      }
      res.on('data', (chunk: Buffer) => {
        if (settled) return
        received += chunk.length
        if (received > MAX_FETCH_BYTES) return fail(`File is larger than ${MAX_FETCH_BYTES / 1024 / 1024} MB`)
        chunks.push(chunk)
      })
      res.on('end', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const buf = Buffer.concat(chunks)
        // Deeplink targets are text documents; refuse obvious binaries.
        if (buf.subarray(0, 8192).includes(0)) {
          reject(new Error('The linked file is not a text file'))
          return
        }
        resolve(buf.toString('utf8'))
      })
      res.on('error', () => fail('Connection error while downloading'))
    })

    req.on('error', (err) => fail(err.message || 'Network request failed'))
    req.end()
  })
}

// --- Entry point ----------------------------------------------------------------

/** Display filename derived from the URL path — for the tab title only, never a disk path. */
function fileNameFromUrl(target: URL): string {
  let base = target.pathname.split('/').filter(Boolean).pop() ?? ''
  try {
    base = decodeURIComponent(base)
  } catch {
    // keep the encoded form
  }
  // Strip anything path-like or unprintable so the name is safe to display.
  // eslint-disable-next-line no-control-regex
  base = base.replace(/[\\/\0-\x1f]/g, '').trim().slice(0, 128)
  return base || 'untitled.txt'
}

function notify(message: string, level: 'info' | 'warn' | 'error'): void {
  deps?.sendToRenderer('ui:show-toast', message, level)
}

function focusWindow(): void {
  const win = deps?.getWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.focus()
  }
}

/**
 * Handle one novapad:// URL end-to-end. open/preview: parse → allowlist/confirm
 * → fetch → ship read-only buffer. new: parse → ship inline editable buffer (no
 * fetch, no allowlist). Never throws; failures surface as toasts.
 */
export function handleDeeplinkUrl(raw: string): void {
  void (async () => {
    try {
      await app.whenReady()
      const parsed = parseDeeplink(raw)
      if (!parsed) {
        console.warn('[deeplink] rejected malformed URL:', raw.slice(0, 200))
        notify('Ignored an invalid or unsupported deeplink.', 'warn')
        return
      }

      // `new` carries content inline — no host, no fetch, no confirmation.
      if (parsed.verb === 'new') {
        const payload: NewPayload = { title: parsed.title, content: parsed.content, language: parsed.language }
        deps?.sendToRenderer('deeplink:new', payload)
        focusWindow()
        return
      }

      const { target, line, col } = parsed
      const allowed = loadAllowedHosts()
      if (!allowed.has(target.host.toLowerCase())) {
        const win = deps?.getWindow() ?? undefined
        const options: Electron.MessageBoxOptions = {
          type: 'question',
          buttons: ['Open', 'Cancel', `Always Allow ${target.host}`],
          defaultId: 0,
          cancelId: 1,
          message: `Open file from ${target.host}?`,
          detail:
            `A link wants NovaPad to download and display:\n\n${target.toString()}\n\n` +
            'The file opens read-only. Only continue if you trust this server.'
        }
        const { response } = win
          ? await dialog.showMessageBox(win, options)
          : await dialog.showMessageBox(options)
        if (response === 1) return
        if (response === 2) persistAllowedHost(target.host)
      }
      allowed.add(target.host.toLowerCase())

      const content = await fetchRemoteText(target, allowed)
      const payload: DeeplinkPayload = {
        fileName: fileNameFromUrl(target),
        content,
        sourceUrl: target.toString(),
        line,
        col,
        preview: parsed.verb === 'preview'
      }
      deps?.sendToRenderer('deeplink:open', payload)
      focusWindow()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[deeplink] failed:', msg)
      notify(`Couldn't open link: ${msg}`, 'error')
    }
  })()
}
