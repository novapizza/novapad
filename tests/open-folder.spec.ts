// Open Folder / File Browser tree (sidebar "files" panel).
//
// Folders are opened the way the native menu does it: `menu:folder-open` with a plain string
// path. The "Open Folder…" button goes through `file:open-dir-dialog`, which is stubbed in MAIN
// (window.api is a frozen contextBridge object, so renderer-side reassignment does nothing).
//
// Context-menu order lives in file-tree-context-menu-order.spec.ts, inline rename/new entries in
// file-tree-inline-edit.spec.ts, delete-without-false-toast in file-tree-watch-suppress.spec.ts.
// Sort order is unit-tested (tests/unit/sortTreeEntries.test.ts).

import { test, expect, sendIPC, stubConfirmDialog, tempDir } from './fixtures'
import type { ElectronApplication, Page } from 'playwright'
import path from 'path'
import fs from 'fs'

const sidebarOf = (page: Page) => page.locator('[data-testid="sidebar"]')

// The Refresh button has no title/aria-label (its label is a Radix Tooltip), so find it by icon.
const refreshButton = (page: Page) => sidebarOf(page).locator('button:has(svg.lucide-refresh-cw)')

// File-tree context menu items are Radix ContextMenuItems rendered into a portal on <body>.
const menuItem = (page: Page, name: string) => page.getByRole('menuitem', { name })

async function showSidebar(electronApp: ElectronApplication, page: Page): Promise<void> {
  await sendIPC(electronApp, 'ui:toggle-sidebar', true)
  await sidebarOf(page).waitFor({ state: 'visible', timeout: 3_000 })
}

/** Point `file:open-dir-dialog` at a fixed answer (no native dialog). */
async function stubOpenDirDialog(electronApp: ElectronApplication, answer: string | null): Promise<void> {
  await electronApp.evaluate(({ ipcMain }, dir) => {
    ipcMain.removeHandler('file:open-dir-dialog')
    ipcMain.handle('file:open-dir-dialog', async () => dir)
  }, answer)
}

const dirs: string[] = []
function mkTemp(): string {
  const d = tempDir('e2e-open-folder-')
  dirs.push(d)
  return d
}
/** A temp dir with an exact basename (spaces, brackets…). */
function mkNamed(name: string): string {
  const d = path.join(mkTemp(), name)
  fs.mkdirSync(d)
  return d
}

test.afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

test('Open folder renders tree', async ({ electronApp, page }) => {
  const sidebar = sidebarOf(page)
  await showSidebar(electronApp, page)

  await test.step('folder with a file and a subdir: header shows basename only, tree lists both', async () => {
    const dir = mkNamed('my-notepad-test')
    fs.writeFileSync(path.join(dir, 'hello.txt'), 'hello world')
    fs.mkdirSync(path.join(dir, 'subdir'))
    await sendIPC(electronApp, 'menu:folder-open', dir)

    await expect(sidebar.getByText('my-notepad-test', { exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(sidebar.getByText(dir, { exact: true })).toHaveCount(0)
    await expect(sidebar.getByText('hello.txt')).toBeVisible()
    await expect(sidebar.getByText('subdir')).toBeVisible()
  })

  await test.step('empty folder shows "Empty folder"', async () => {
    const dir = mkNamed('empty-one')
    await sendIPC(electronApp, 'menu:folder-open', dir)
    await expect(sidebar.getByText('empty-one', { exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(sidebar.getByText('Empty folder')).toBeVisible()
  })

  await test.step('folder with only subdirectories lists them, no "Empty folder"', async () => {
    const dir = mkNamed('dirs-only')
    for (const d of ['a', 'b', 'c']) fs.mkdirSync(path.join(dir, d))
    await sendIPC(electronApp, 'menu:folder-open', dir)
    await expect(sidebar.getByText('a', { exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(sidebar.getByText('b', { exact: true })).toBeVisible()
    await expect(sidebar.getByText('c', { exact: true })).toBeVisible()
    await expect(sidebar.getByText('Empty folder')).toHaveCount(0)
  })

  await test.step('folder with 200 files renders', async () => {
    const dir = mkNamed('two-hundred')
    for (let i = 1; i <= 200; i++) fs.writeFileSync(path.join(dir, `file-${String(i).padStart(3, '0')}.txt`), '')
    await sendIPC(electronApp, 'menu:folder-open', dir)
    await expect(sidebar.getByText('two-hundred', { exact: true })).toBeVisible({ timeout: 5_000 })
    await expect(sidebar.getByText('file-001.txt')).toBeVisible({ timeout: 5_000 })
  })

  await test.step('folder names with spaces and special characters render unescaped', async () => {
    for (const name of ['my test folder', 'test-[proj](v1)']) {
      await sendIPC(electronApp, 'menu:folder-open', mkNamed(name))
      await expect(sidebar.getByText(name, { exact: true })).toBeVisible({ timeout: 3_000 })
    }
  })

  await test.step('opening a second folder replaces the first', async () => {
    const a = mkNamed('folder-a')
    const b = mkNamed('folder-b')
    fs.writeFileSync(path.join(a, 'file-a.txt'), 'a')
    fs.writeFileSync(path.join(b, 'file-b.txt'), 'b')
    await sendIPC(electronApp, 'menu:folder-open', a)
    await expect(sidebar.getByText('file-a.txt')).toBeVisible({ timeout: 3_000 })
    await sendIPC(electronApp, 'menu:folder-open', b)
    await expect(sidebar.getByText('folder-b', { exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(sidebar.getByText('file-b.txt')).toBeVisible()
    await expect(sidebar.getByText('file-a.txt')).toHaveCount(0)
  })

  // REGRESSION: file:open-dir-dialog once returned { canceled, filePath } instead of a string, and
  // FileBrowserPanel crashed on workspaceFolder.replace() (black screen). A plain string path —
  // what the native menu sends — must render the header and tree without unmounting the app.
  await test.step('string path renders header and tree without crashing (regression)', async () => {
    const dir = mkTemp()
    fs.writeFileSync(path.join(dir, 'sample.txt'), 'hello')
    await sendIPC(electronApp, 'menu:folder-open', dir)
    await expect(sidebar.getByText(path.basename(dir), { exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(sidebar.getByText('sample.txt')).toBeVisible()
    await expect(page.locator('[data-testid="app"]')).toBeVisible()
  })
})

test('Empty state, then Open Folder button (cancel, then success)', async ({ electronApp, page }) => {
  const sidebar = sidebarOf(page)
  const openButton = sidebar.getByRole('button', { name: 'Open Folder…' })
  const emptyText = sidebar.getByText('Open a folder to browse files.')

  await test.step('no workspace: Open Folder… button and hint, no Refresh button', async () => {
    await showSidebar(electronApp, page)
    await expect(openButton).toBeVisible()
    await expect(emptyText).toBeVisible()
    await expect(refreshButton(page)).toHaveCount(0)
    await expect(page.locator('[data-testid="app"]')).toBeVisible()
  })

  await test.step('cancelled dialog leaves the empty state', async () => {
    await stubOpenDirDialog(electronApp, null)
    await openButton.click()
    await page.waitForTimeout(300)
    await expect(emptyText).toBeVisible()
    await expect(refreshButton(page)).toHaveCount(0)
  })

  await test.step('chosen folder sets the workspace and renders the tree', async () => {
    const dir = mkTemp()
    fs.writeFileSync(path.join(dir, 'stub-file.txt'), 'stub')
    await stubOpenDirDialog(electronApp, dir)
    await openButton.click()
    await expect(sidebar.getByText(path.basename(dir), { exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(sidebar.getByText('stub-file.txt')).toBeVisible()
    await expect(refreshButton(page)).toBeVisible()
  })
})

test('Expand, collapse, re-expand', async ({ electronApp, page }) => {
  const sidebar = sidebarOf(page)
  const dir = mkTemp()
  fs.mkdirSync(path.join(dir, 'level1', 'level2', 'level3'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'level1', 'level2', 'level3', 'deep.txt'), 'deep')
  fs.mkdirSync(path.join(dir, 'subdir'))
  fs.writeFileSync(path.join(dir, 'subdir', 'inner.txt'), 'inner')

  await showSidebar(electronApp, page)
  await sendIPC(electronApp, 'menu:folder-open', dir)

  await test.step('nested folders expand one level per click', async () => {
    await expect(sidebar.getByText('level1')).toBeVisible({ timeout: 3_000 })
    await expect(sidebar.getByText('deep.txt')).toHaveCount(0)
    await sidebar.getByText('level1').click()
    await expect(sidebar.getByText('level2')).toBeVisible({ timeout: 3_000 })
    await expect(sidebar.getByText('deep.txt')).toHaveCount(0)
    await sidebar.getByText('level2').click()
    await expect(sidebar.getByText('level3')).toBeVisible({ timeout: 3_000 })
    await expect(sidebar.getByText('deep.txt')).toHaveCount(0)
    await sidebar.getByText('level3').click()
    await expect(sidebar.getByText('deep.txt')).toBeVisible({ timeout: 3_000 })
  })

  await test.step('clicking a directory expands it', async () => {
    await expect(sidebar.getByText('inner.txt')).toHaveCount(0)
    await sidebar.getByText('subdir').click()
    await expect(sidebar.getByText('inner.txt')).toBeVisible({ timeout: 3_000 })
  })

  await test.step('clicking it again collapses it', async () => {
    await sidebar.getByText('subdir').click()
    await expect(sidebar.getByText('inner.txt')).toHaveCount(0)
  })

  await test.step('re-expanding shows the cached children straight away', async () => {
    await sidebar.getByText('subdir').click()
    await expect(sidebar.getByText('inner.txt')).toBeVisible({ timeout: 1_000 })
  })
})

test('Refresh picks up added file and deleted subdirectory', async ({ electronApp, page }) => {
  const sidebar = sidebarOf(page)
  const dir = mkTemp()
  fs.writeFileSync(path.join(dir, 'initial.txt'), 'initial')
  fs.mkdirSync(path.join(dir, 'subdir'))
  fs.writeFileSync(path.join(dir, 'subdir', 'inner.txt'), 'inner')

  await showSidebar(electronApp, page)
  await sendIPC(electronApp, 'menu:folder-open', dir)
  await expect(sidebar.getByText('initial.txt')).toBeVisible({ timeout: 3_000 })

  await test.step('file added on disk appears after Refresh', async () => {
    fs.writeFileSync(path.join(dir, 'added.txt'), 'added')
    await refreshButton(page).click()
    await expect(sidebar.getByText('added.txt')).toBeVisible({ timeout: 3_000 })
    await expect(sidebar.getByText('initial.txt')).toBeVisible()
  })

  await test.step('expanded subdirectory deleted on disk disappears after Refresh', async () => {
    await sidebar.getByText('subdir').click()
    await expect(sidebar.getByText('inner.txt')).toBeVisible({ timeout: 3_000 })
    fs.rmSync(path.join(dir, 'subdir'), { recursive: true, force: true })
    await refreshButton(page).click()
    await expect(sidebar.getByText('subdir')).toHaveCount(0, { timeout: 3_000 })
    await expect(page.locator('[data-testid="app"]')).toBeVisible()
  })
})

test('Tree open keeps existing tabs', async ({ electronApp, page }) => {
  const sidebar = sidebarOf(page)
  const dir = mkTemp()
  fs.writeFileSync(path.join(dir, 'test.txt'), 'hello world')
  const untitled = page.locator('[data-tab-title="new 1"]')

  await test.step('opening a folder does not close the existing tab', async () => {
    await expect(untitled).toBeVisible()
    await page.locator('.monaco-editor textarea').first().click({ force: true })
    await page.keyboard.type('existing content')
    await showSidebar(electronApp, page)
    await sendIPC(electronApp, 'menu:folder-open', dir)
    await expect(sidebar.getByText('test.txt')).toBeVisible({ timeout: 3_000 })
    await expect(untitled).toBeVisible()
    await expect(page.locator('[data-testid="editor-pane"]')).toBeVisible()
  })

  await test.step('clicking a file opens it in a new tab alongside the existing one', async () => {
    await sidebar.getByText('test.txt').click()
    await expect(page.locator('[data-tab-title="test.txt"]')).toBeVisible({ timeout: 5_000 })
    await expect(untitled).toBeVisible()
  })
})

test('Cancelling "Delete" confirm leaves file intact', async ({ electronApp, page }) => {
  const sidebar = sidebarOf(page)
  const dir = mkTemp()
  fs.writeFileSync(path.join(dir, 'keep-me.txt'), 'keep')

  await showSidebar(electronApp, page)
  await sendIPC(electronApp, 'menu:folder-open', dir)
  await expect(sidebar.getByText('keep-me.txt')).toBeVisible({ timeout: 3_000 })

  // The confirm is a native main-process message box; answer it with Cancel.
  await stubConfirmDialog(electronApp, 'cancel')
  await sidebar.getByText('keep-me.txt').click({ button: 'right' })
  await menuItem(page, 'Delete').click()
  await page.waitForTimeout(300)

  await expect(sidebar.getByText('keep-me.txt')).toBeVisible()
  expect(fs.existsSync(path.join(dir, 'keep-me.txt'))).toBe(true)
})
