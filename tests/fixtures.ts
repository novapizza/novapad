import { test as base, expect, Page } from '@playwright/test'
import { _electron as electron, ElectronApplication } from 'playwright'
import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Shared E2E fixture. Every spec imports `test` / `expect` from here.
 *
 * Each test gets ONE Electron app with its OWN userData directory, so config, notes, plugins
 * and session files never touch the developer's real profile or leak between tests.
 *
 * Per-file options (via `test.use({ app: {...} })`, merged over the defaults):
 *   - seedBuffer      open an Untitled tab and wait for Monaco (default true). E2E mode skips
 *                     session restore, so without it the app sits on the Welcome screen.
 *   - config          extra keys written to config.json before launch
 *   - restoreSession  run session restore and honour argv files (drops E2E_TEST)
 *   - args            extra argv after the app entry, e.g. a file to open
 */

export const APP_ENTRY = path.resolve(__dirname, '../out/main/index.js')
export const IS_MAC = process.platform === 'darwin'
/** Primary modifier for keyboard shortcuts: Meta on macOS, Control elsewhere. */
export const MOD = IS_MAC ? 'Meta' : 'Control'

/** Version `app.getVersion()` reports when launched from out/main (Electron's own: no app package.json sits next to the entry). */
const RUNTIME_VERSION: string = require('electron/package.json').version

export interface AppOptions {
  seedBuffer: boolean
  config: Record<string, unknown>
  restoreSession: boolean
  args: string[]
}

const DEFAULT_APP: AppOptions = { seedBuffer: true, config: {}, restoreSession: false, args: [] }

export interface AppFixtures {
  /** Per-file overrides, merged over DEFAULT_APP: `test.use({ app: { seedBuffer: false } })`. */
  app: Partial<AppOptions>
  /** The merged options. */
  appOptions: AppOptions
  userDataDir: string
  electronApp: ElectronApplication
  page: Page
}

/**
 * Env passed to Electron, with ELECTRON_RUN_AS_NODE forcibly cleared. When that var is set in the
 * parent shell (some IDE/CLI setups, electron-vite tooling), electron.exe boots as plain Node and
 * every test fails with "Process failed to launch!".
 */
export function makeEnv(restoreSession = false): Record<string, string> {
  const env: Record<string, string | undefined> = { ...process.env, NODE_ENV: 'test' }
  delete env.ELECTRON_RUN_AS_NODE
  if (restoreSession) delete env.E2E_TEST
  else env.E2E_TEST = '1'
  return env as Record<string, string>
}

/** Fresh userData dir with config.json seeded. `lastSeenVersion` stops What's New auto-opening. */
export function makeUserDataDir(config: Record<string, unknown> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novapad-e2e-'))
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'config', 'config.json'),
    JSON.stringify({ lastSeenVersion: RUNTIME_VERSION, ...config }, null, 2),
    'utf8'
  )
  return dir
}

/** Launch the built app against a userData dir. Use the fixtures unless a test needs several launches. */
export async function launchApp(
  userDataDir: string,
  opts: { restoreSession?: boolean; args?: string[] } = {}
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [APP_ENTRY, `--user-data-dir=${userDataDir}`, ...(opts.args ?? [])],
    env: makeEnv(opts.restoreSession),
    timeout: 15_000,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('[data-testid="app"]', { timeout: 10_000 })
  return { app, page }
}

/** Open an Untitled tab the way File → New does, and wait for Monaco. */
export async function seedBuffer(app: ElectronApplication, page: Page): Promise<void> {
  await sendIPC(app, 'menu:file-new')
  await page.waitForSelector('.monaco-editor textarea', { timeout: 10_000 })
  await page.waitForSelector('[data-testid="tabbar"] [data-tab-title]', { timeout: 5_000 })
}

/** Send an IPC message from main to the renderer, as a native menu item would. */
export async function sendIPC(app: ElectronApplication, channel: string, ...args: unknown[]): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, { ch, a }) => BrowserWindow.getAllWindows()[0]?.webContents.send(ch, ...(a as unknown[])),
    { ch: channel, a: args }
  )
}

/**
 * Force the app's modal confirms to a fixed answer for the rest of the test.
 *
 * Renderer confirm/alert prompts are served by `dialog.showMessageBox` in the MAIN process (see
 * `src/main/ipc/fileHandlers.ts`) — `window.confirm()` is deliberately unused because it wedges
 * Monaco's render loop. Playwright cannot dismiss a native modal, so tests stub the main-process
 * call. `dialog:confirm` treats button 0 as confirm and `cancelId: 1` as cancel.
 */
export async function stubConfirmDialog(app: ElectronApplication, answer: 'confirm' | 'cancel'): Promise<void> {
  await app.evaluate(async ({ dialog }, response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(dialog as any).showMessageBox = async () => ({ response, checkboxChecked: false })
  }, answer === 'confirm' ? 0 : 1)
}

/**
 * Fire a paste/copy event at the focused element, as Ctrl+V / Ctrl+C would. Returns the text the
 * app put on the (synthetic) clipboard. The system clipboard is empty under the test runner, so
 * tests must not rely on real Ctrl+V / clipboard.writeText.
 */
export async function clipboardEvent(page: Page, type: 'paste' | 'copy' | 'cut', text = ''): Promise<string> {
  return page.evaluate(
    ([type, text]) => {
      const data = new DataTransfer()
      if (text) data.setData('text/plain', text)
      const target = document.activeElement ?? document.body
      target.dispatchEvent(new ClipboardEvent(type, { clipboardData: data, bubbles: true, cancelable: true }))
      return data.getData('text/plain')
    },
    [type, text] as const
  )
}

/** Focus Monaco and paste `text` into it (replacing the selection). */
export async function pasteIntoEditor(page: Page, text: string): Promise<void> {
  await page.locator('.monaco-editor textarea').first().focus()
  await clipboardEvent(page, 'paste', text)
}

/**
 * Replace the active editor's whole text, and wait until the editor shows it.
 *
 * Select-all + paste right after focus is occasionally dropped under load (the paste never lands
 * and the old text stays), so this retries until the rendered lines start with `text`. Retrying is
 * safe: each attempt replaces everything. Whitespace is ignored so word wrap doesn't matter.
 */
export async function setEditorText(page: Page, text: string): Promise<void> {
  const textarea = page.locator('.monaco-editor textarea').first()
  const expected = text.replace(/\s/g, '').slice(0, 60)
  await expect(async () => {
    await textarea.focus()
    await page.keyboard.press(`${MOD}+A`)
    await clipboardEvent(page, 'paste', text)
    if (!expected) return
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Array.from(document.querySelectorAll('.monaco-editor .view-line'))
              .map((l) => l.textContent ?? '')
              .join('')
              .replace(/\s/g, '')
          ),
        { timeout: 1_000 }
      )
      .toMatch(new RegExp('^' + expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }).toPass({ timeout: 10_000 })
}

/** Fresh temp directory for test files (removed with the OS temp dir; tests may delete it early). */
export function tempDir(prefix = 'novapad-e2e-files-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

export const test = base.extend<AppFixtures>({
  app: [{}, { option: true }],

  appOptions: async ({ app }, use) => {
    await use({ ...DEFAULT_APP, ...app })
  },

  userDataDir: async ({ appOptions }, use) => {
    const dir = makeUserDataDir(appOptions.config)
    await use(dir)
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  },

  electronApp: async ({ appOptions, userDataDir }, use) => {
    const electronApp = await electron.launch({
      args: [APP_ENTRY, `--user-data-dir=${userDataDir}`, ...appOptions.args],
      env: makeEnv(appOptions.restoreSession),
      timeout: 15_000,
    })
    await use(electronApp)
    await electronApp.close()
  },

  page: async ({ appOptions, electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('[data-testid="app"]', { timeout: 10_000 })
    if (appOptions.seedBuffer) await seedBuffer(electronApp, page)
    await use(page)
  },
})

export { expect }
