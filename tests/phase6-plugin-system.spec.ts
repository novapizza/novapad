// spec: specs/phase6-plugin-system.md
import fs from 'fs'
import path from 'path'
import type { ElectronApplication } from 'playwright'
import { test, expect, sendIPC, setEditorText } from './fixtures'

/**
 * Plugin system: Plugin Manager tab, plugin loading from <userData>/plugins, and the
 * plugin <-> renderer IPC bridge. Each test has its own userData dir, so plugins written here
 * never touch the developer's real plugins folder.
 *
 * The old Plugin Manager *dialog* (close button, Escape, global Reload button, "Active" column)
 * was replaced by the Plugin Manager tab (src/renderer/src/components/PluginManagerTab) — those
 * checks were dropped; reload is driven through `window.api.plugin.reload()` (plugin:reload).
 */

function writePlugin(userDataDir: string, name: string, pkg: Record<string, unknown>, source: string): void {
  // PluginLoader.pluginsDir = path.join(app.getPath('userData'), 'plugins')
  const dir = path.join(userDataDir, 'plugins', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, ...pkg }))
  fs.writeFileSync(path.join(dir, 'index.js'), source)
}

/**
 * Send a plugin request channel to the renderer and return its `<channel>:reply` payload.
 * The ipcMain listener is registered (and that registration awaited) BEFORE the request goes out.
 */
async function requestReply(electronApp: ElectronApplication, channel: string): Promise<unknown> {
  await electronApp.evaluate(({ ipcMain }, ch) => {
    ;(globalThis as unknown as { __pluginReply: Promise<unknown> }).__pluginReply = new Promise((resolve) => {
      ipcMain.once(`${ch}:reply`, (_e: unknown, val: unknown) => resolve(val))
    })
  }, channel)
  await sendIPC(electronApp, channel)
  return electronApp.evaluate(() => (globalThis as unknown as { __pluginReply: Promise<unknown> }).__pluginReply)
}

test.describe('Plugin system', () => {
  test('PLG-Manager — opens via menu IPC and shows the empty state', async ({ electronApp, page }) => {
    const tab = page.locator('[data-testid="plugin-manager-tab"]')

    await test.step('plugin manager is hidden initially and opens via menu:plugin-manager', async () => {
      await expect(tab).not.toBeVisible()
      await sendIPC(electronApp, 'menu:plugin-manager')
      await expect(tab).toBeVisible({ timeout: 2_000 })
    })

    await test.step('shows the empty state when no plugins are installed', async () => {
      await expect(page.locator('[data-testid="plugin-empty-state"]')).toBeVisible()
      await expect(tab.getByText('No plugins installed.')).toBeVisible()
    })
  })

  test('PLG-Loading — metadata, error states, activate() toast, per-plugin reload', async ({
    electronApp,
    page,
    userDataDir,
  }) => {
    await test.step('install ok / throwing / no-activate / toast plugins and reload once', async () => {
      writePlugin(
        userDataDir,
        'e2e-test-plugin',
        { version: '1.2.3', author: 'Tester', description: 'E2E test plugin' },
        'exports.activate = function(api) {}'
      )
      writePlugin(userDataDir, 'e2e-error-plugin', { version: '1.0.0' }, 'exports.activate = function() { throw new Error("Boom!") }')
      writePlugin(userDataDir, 'e2e-noactivate-plugin', { version: '1.0.0' }, 'module.exports = {}')
      writePlugin(
        userDataDir,
        'e2e-toast-plugin',
        { version: '1.0.0' },
        'exports.activate = function(api) { api.ui.showMessage("Plugin loaded OK", "info") }'
      )
      await page.evaluate(() => (window as unknown as { api: { plugin: { reload: () => Promise<unknown> } } }).api.plugin.reload())
    })

    await test.step('plugin using api.ui.showMessage shows a toast on activate', async () => {
      await expect(page.getByText('Plugin loaded OK')).toBeVisible({ timeout: 4_000 })
    })

    await sendIPC(electronApp, 'menu:plugin-manager')
    const okRow = page.locator('[data-testid="plugin-row-e2e-test-plugin"]')

    await test.step('valid plugin lists its metadata with no error', async () => {
      await expect(okRow).toBeVisible({ timeout: 3_000 })
      await expect(okRow.getByText('v1.2.3')).toBeVisible()
      await expect(okRow.getByText('Tester')).toBeVisible()
      await expect(okRow.getByText('E2E test plugin')).toBeVisible()
      await expect(okRow.getByText('Error', { exact: true })).toHaveCount(0)
      await expect(okRow.getByRole('button', { name: 'Disable' })).toBeAttached() // enabled = active
    })

    await test.step('throwing activate() and missing activate() both show Error', async () => {
      for (const name of ['e2e-error-plugin', 'e2e-noactivate-plugin']) {
        const row = page.locator(`[data-testid="plugin-row-${name}"]`)
        await expect(row).toBeVisible()
        await expect(row.getByText('Error', { exact: true })).toBeVisible()
      }
      await expect(
        page.locator('[data-testid="plugin-row-e2e-noactivate-plugin"] [title="Missing activate() export"]')
      ).toBeVisible()
    })

    await test.step('per-plugin Reload button is re-enabled after reload completes', async () => {
      await okRow.hover()
      const reloadBtn = okRow.getByTitle('Reload')
      await reloadBtn.click()
      await expect(reloadBtn).toBeEnabled({ timeout: 3_000 })
      await expect(okRow).toBeVisible()
    })
  })

  test('PLG-IPC — toast, menu item, insert/get text, get path', async ({ electronApp, page }) => {
    await test.step('editor-get-path replies null for the untitled buffer', async () => {
      const reply = await requestReply(electronApp, 'plugin:editor-get-path')
      expect(reply).toBeNull()
    })

    await test.step('ui:show-toast shows a toast', async () => {
      await sendIPC(electronApp, 'ui:show-toast', 'Hello from plugin!', 'info')
      await expect(page.getByText('Hello from plugin!')).toBeVisible({ timeout: 2_000 })
    })

    await test.step('plugin:add-menu-item is handled without error', async () => {
      await sendIPC(electronApp, 'plugin:add-menu-item', 'my-plugin', 'Do Something')
      await page.waitForTimeout(300)
      await expect(page.getByText(/error/i)).not.toBeVisible()
      await expect(page.locator('.monaco-editor textarea')).toBeVisible()
    })

    await test.step('plugin:insert-text inserts text at the cursor', async () => {
      await page.locator('.monaco-editor textarea').first().focus()
      await sendIPC(electronApp, 'plugin:insert-text', 'test-plugin', 'PLUGIN_INSERTED')
      await expect(page.locator('.monaco-editor .view-line').first()).toContainText('PLUGIN_INSERTED')
    })

    await test.step('plugin:editor-get-text replies with the buffer content', async () => {
      await setEditorText(page, 'hello plugin world')
      await expect(page.locator('.monaco-editor .view-line').first()).toHaveText('hello plugin world')
      const reply = await requestReply(electronApp, 'plugin:editor-get-text')
      expect(reply).toContain('hello plugin world')
    })
  })
})
