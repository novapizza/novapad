import { _electron as electron, ElectronApplication, Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const APP_ENTRY = path.resolve(__dirname, '../out/main/index.js')

/**
 * Allocate a fresh per-test userData directory so config seeding and
 * lastSeenVersion writes do not pollute the developer's real config.
 *
 * Returns the absolute path; callers are responsible for passing it as
 * Electron's --user-data-dir flag (see launchIsolated below).
 */
export function freshUserDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novapad-whatsnew-'))
  // Mirror the path layout configHandlers.ts and SessionManager.ts use:
  //   <userData>/config/{config.json, session.json}
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
  return dir
}

/**
 * Seed the config.json file inside an isolated userData dir.
 * Pass an object — it will be JSON-stringified.
 */
export function seedConfig(userDataDir: string, config: Record<string, unknown>): void {
  const configPath = path.join(userDataDir, 'config', 'config.json')
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
}

/**
 * Read the config.json back from an isolated userData dir (after the test
 * triggers writes). Returns null if the file does not exist.
 */
export function readConfig(userDataDir: string): Record<string, unknown> | null {
  const configPath = path.join(userDataDir, 'config', 'config.json')
  if (!fs.existsSync(configPath)) return null
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

/** Seed session.json inside an isolated userData dir. */
export function seedSession(userDataDir: string, session: Record<string, unknown>): void {
  const sessionPath = path.join(userDataDir, 'config', 'session.json')
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf8')
}

export interface IsolatedAppOptions {
  /** The temp userData dir to use. Defaults to a fresh one (callers should keep the path if they need to inspect config later). */
  userDataDir: string
  /**
   * When true, leave E2E_TEST=1 so session restore is skipped (default).
   * When false, drop E2E_TEST so SessionManager.restore() runs — needed
   * for tests that exercise session restore (Tests 6, 10).
   */
  skipSessionRestore?: boolean
  /**
   * Extra argv after the app entry, e.g. a file path to simulate Explorer's
   * "Open with NovaPad" on cold launch. Only read when skipSessionRestore is
   * false — main ignores argv paths under E2E_TEST.
   */
  extraArgs?: string[]
}

/** Launch Electron with an isolated userData dir. */
export async function launchIsolated(opts: IsolatedAppOptions): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string | undefined> = { ...process.env, NODE_ENV: 'test' }
  if (opts.skipSessionRestore !== false) {
    env.E2E_TEST = '1'
  } else {
    delete env.E2E_TEST
  }

  const app = await electron.launch({
    args: [APP_ENTRY, `--user-data-dir=${opts.userDataDir}`, ...(opts.extraArgs ?? [])],
    env: env as Record<string, string>,
    timeout: 15_000,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('[data-testid="app"]', { timeout: 10_000 })
  return { app, page }
}

/**
 * Read the version that this launched Electron instance reports via
 * app.getVersion(). In test mode this is typically the Electron binary
 * version (NOT the project's package.json version) because Electron's
 * package.json discovery from out/main/index.js falls back to its own
 * bundled metadata when no app-side package.json is colocated with the
 * entry script. Tests should compare against this runtime value rather
 * than the project's package.json — the auto-open code just uses
 * whatever app.getVersion() returns.
 */
export async function getRuntimeAppVersion(app: ElectronApplication): Promise<string> {
  return await app.evaluate(({ app }) => app.getVersion())
}

/**
 * The auto-open trigger fires from a useEffect that runs after the
 * configStore.loaded reactive flag flips to true and after an async
 * window.api.app.getVersion() invoke resolves. Tests need to wait for
 * that microtask chain to settle before asserting state.
 *
 * Polls the tab bar for the whats-new tab to appear (or for a deadline).
 * Returns true if the tab appeared within the deadline.
 */
export async function waitForAutoOpenSettle(page: Page, timeoutMs = 3000): Promise<boolean> {
  try {
    await page.waitForSelector('[data-tab-kind="whatsNew"]', { timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}

/**
 * For tests asserting the auto-open did NOT fire — give the same
 * effect chain a chance to run, then check the tab bar is empty.
 * A short fixed wait is necessary because there is no negative-event
 * to await (you can't "wait for a thing not to happen" otherwise).
 */
export async function waitForAutoOpenIdle(page: Page): Promise<void> {
  // 600ms is enough for: configStore.load() resolve → loaded effect →
  // app.getVersion() invoke RTT → openVirtualTab call. Empirically the
  // positive case fires in ~50–200 ms in launchIsolated.
  await page.waitForTimeout(600)
}
