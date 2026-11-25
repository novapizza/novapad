import fs from 'fs'
import path from 'path'
import { test, expect, sendIPC, tempDir, launchApp, makeUserDataDir } from './fixtures'

/**
 * Split View = Notepad++ two views: a main and a sub view, each with its own
 * tab bar. Move / Clone to Other View from the tab menu; commands act on the
 * focused view; closing a clone in one view keeps it in the other.
 */

const mainBar = '[data-testid="tabbar"]'
const subBar = '[data-testid="tabbar-sub"]'
const mainText = '[data-testid="editor-pane"] .view-lines'
const subText = '[data-testid="split-editor-monaco"] .view-lines'

test('two views: clone, move, focus routing, close a clone, close the split', async ({ electronApp, page }) => {
  const dir = tempDir('e2e-split-')
  const a = path.join(dir, 'alpha.txt')
  const b = path.join(dir, 'beta.txt')
  fs.writeFileSync(a, 'alpha line\n')
  fs.writeFileSync(b, 'beta line\n')

  try {
    await sendIPC(electronApp, 'menu:file-open', [a, b])
    await expect(page.locator(`${mainBar} [data-testid="active-tab"]`)).toHaveAttribute('data-tab-title', 'beta.txt')

    await test.step('View → Split View clones the active file into a sub view', async () => {
      await sendIPC(electronApp, 'ui:toggle-split-view', true)
      await expect(page.locator(subBar)).toBeVisible()
      await expect(page.locator(`${subBar} [data-tab-title]`)).toHaveCount(1)
      await expect(page.locator(`${subBar} [data-testid="active-tab-sub"]`)).toHaveAttribute('data-tab-title', 'beta.txt')
      // Still in the main view too (a clone).
      await expect(page.locator(`${mainBar} [data-tab-title="beta.txt"]`)).toBeVisible()
    })

    await test.step('editing the clone in the sub view shows in the main view', async () => {
      await page.locator(subText).click()
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home')
      await page.keyboard.press('End')
      await page.keyboard.type(' edited')
      await expect(page.locator(mainText)).toContainText('beta line edited')
    })

    await test.step('Move to Other View puts a different file in the sub view', async () => {
      await page.locator(`${mainBar} [data-tab-title="alpha.txt"]`).click({ button: 'right' })
      await page.getByTestId('tab-move-other-view').click()
      await expect(page.locator(`${mainBar} [data-tab-title="alpha.txt"]`)).toHaveCount(0)
      await expect(page.locator(`${subBar} [data-testid="active-tab-sub"]`)).toHaveAttribute('data-tab-title', 'alpha.txt')
      await expect(page.locator(subText)).toContainText('alpha line')
      await expect(page.locator(mainText)).toContainText('beta line edited')
    })

    await test.step('commands act on the focused view', async () => {
      await page.locator(subText).click()
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
      await sendIPC(electronApp, 'editor:command', 'toUpperCase')
      await expect(page.locator(subText)).toContainText('ALPHA LINE')
      await expect(page.locator(mainText)).toContainText('beta line edited') // main untouched
    })

    await test.step('closing the clone in the sub view keeps it in main, without a prompt', async () => {
      const subBeta = page.locator(`${subBar} [data-tab-title="beta.txt"]`)
      await expect(subBeta).toHaveAttribute('data-tab-dirty', 'true')
      await subBeta.click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Close', exact: true }).click()
      await expect(subBeta).toHaveCount(0)
      await expect(page.locator(`${mainBar} [data-tab-title="beta.txt"]`)).toBeVisible()
    })

    await test.step('closing the split moves its tabs back to main', async () => {
      await page.getByTestId('split-close').click()
      await expect(page.getByTestId('split-editor')).toHaveCount(0)
      await expect(page.locator(`${mainBar} [data-tab-title="alpha.txt"]`)).toBeVisible()
      await expect(page.locator(`${mainBar} [data-tab-title="beta.txt"]`)).toBeVisible()
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('two views are restored from the session', async () => {
  const dir = tempDir('e2e-split-session-')
  const a = path.join(dir, 'left.txt')
  const b = path.join(dir, 'right.txt')
  fs.writeFileSync(a, 'left\n')
  fs.writeFileSync(b, 'right\n')
  const userDataDir = makeUserDataDir()
  const file = (filePath: string, view?: string) => ({
    filePath, language: 'plaintext', encoding: 'UTF-8', eol: 'LF', viewState: null, ...(view ? { view } : {})
  })
  fs.writeFileSync(
    path.join(userDataDir, 'config', 'session.json'),
    JSON.stringify({ version: 4, files: [file(a), file(b, 'sub')], virtualTabs: [], activeIndex: 0, subActiveIndex: 1 }),
    'utf8'
  )

  const { app, page } = await launchApp(userDataDir, { restoreSession: true })
  try {
    await expect(page.locator(`${mainBar} [data-testid="active-tab"]`)).toHaveAttribute('data-tab-title', 'left.txt')
    await expect(page.locator(`${subBar} [data-testid="active-tab-sub"]`)).toHaveAttribute('data-tab-title', 'right.txt')
    await expect(page.locator(`${mainBar} [data-tab-title="right.txt"]`)).toHaveCount(0)
    await expect(page.locator(subText)).toContainText('right')
  } finally {
    await app.close()
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 })
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
