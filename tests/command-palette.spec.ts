import fs from 'fs'
import path from 'path'
import { test, expect, sendIPC, tempDir, IS_MAC } from './fixtures'

/**
 * Command palette: file mode (Ctrl+E, the old Quick Open — `menu:goto-file`) and command mode
 * (Ctrl+Shift+P — `menu:command-palette`). Driven by the IPCs the native Search menu sends.
 */

test('file mode: opens focused, hints without a folder, Escape closes', async ({ electronApp, page }) => {
  const palette = page.getByTestId('command-palette')

  await test.step('menu:goto-file opens it in file mode with the input focused', async () => {
    await sendIPC(electronApp, 'menu:goto-file')
    await expect(palette).toBeVisible()
    await expect(palette).toHaveAttribute('data-mode', 'files')
    await expect(page.getByTestId('command-palette-input')).toBeFocused()
  })

  await test.step('with no folder open, shows the "open a folder" hint', async () => {
    await expect(page.getByText('No folder is open.')).toBeVisible()
    await expect(page.getByTestId('command-palette-file')).toHaveCount(0)
  })

  await test.step('Escape closes it', async () => {
    await page.getByTestId('command-palette-input').press('Escape')
    await expect(palette).not.toBeVisible()
  })
})

test('file mode: lists, fuzzy-filters and opens files from the open folder', async ({ electronApp, page }) => {
  const dir = tempDir('e2e-palette-')
  fs.writeFileSync(path.join(dir, 'alpha.txt'), 'a')
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'hi')
  fs.mkdirSync(path.join(dir, 'nested'))
  fs.writeFileSync(path.join(dir, 'nested', 'config-loader.ts'), 'c')
  // Never indexed: a binary file and a build-output folder.
  fs.writeFileSync(path.join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  fs.mkdirSync(path.join(dir, 'dist'))
  fs.writeFileSync(path.join(dir, 'dist', 'bundle-alpha.js'), 'x')

  const input = page.getByTestId('command-palette-input')
  const results = page.getByTestId('command-palette-file')
  const palette = page.getByTestId('command-palette')

  try {
    await sendIPC(electronApp, 'menu:folder-open', dir)
    await expect(page.getByTestId('sidebar')).toBeVisible()

    await test.step('fuzzy "cl" surfaces the nested config-loader.ts; Enter opens it', async () => {
      await sendIPC(electronApp, 'menu:goto-file')
      await expect(input).toBeVisible()
      await expect(results).not.toHaveCount(0) // empty query lists files recursively
      await input.fill('cl')
      await expect(results.first()).toContainText('config-loader.ts')
      await input.press('Enter')
      await expect(page.locator('[data-tab-title="config-loader.ts"]')).toBeVisible()
      await expect(palette).not.toBeVisible()
    })

    await test.step('clicking a result opens it', async () => {
      await sendIPC(electronApp, 'menu:goto-file')
      await input.fill('readme')
      const row = results.filter({ hasText: 'readme.txt' }).first()
      await expect(row).toBeVisible()
      await row.click()
      await expect(page.locator('[data-tab-title="readme.txt"]')).toBeVisible()
      await expect(palette).not.toBeVisible()
    })

    await test.step('binary files and build folders are not indexed', async () => {
      await sendIPC(electronApp, 'menu:goto-file')
      await expect(results).toHaveCount(3) // alpha.txt, readme.txt, nested/config-loader.ts
      // Fuzzy matching may still surface a loose hit (e.g. "logo" → nested/config-loader),
      // so assert on the excluded names themselves.
      await input.fill('logo.png')
      await expect(results.filter({ hasText: 'logo.png' })).toHaveCount(0)
      await input.fill('bundle-alpha')
      await expect(results.filter({ hasText: 'bundle-alpha.js' })).toHaveCount(0)
      await input.fill('')
      await expect(results).toHaveCount(3)
    })

    await test.step('shows the searched folder; Close Folder empties the search', async () => {
      await expect(page.getByTestId('command-palette-scope')).toContainText(path.basename(dir))
      await page.getByTestId('command-palette-close-folder').click()
      await expect(page.getByTestId('command-palette-scope')).toHaveCount(0)
      await expect(page.getByText('No folder is open.')).toBeVisible()
      await expect(page.locator('[data-tab-title="readme.txt"]')).toBeVisible() // tabs stay open
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('command mode: lists, filters by label and keywords, switches modes', async ({ electronApp, page }) => {
  const palette = page.getByTestId('command-palette')
  const input = page.getByTestId('command-palette-input')
  const rows = page.getByTestId('command-palette-command')

  await test.step('opens in command mode, prefilled with ">", listing commands', async () => {
    await sendIPC(electronApp, 'menu:command-palette')
    await expect(palette).toHaveAttribute('data-mode', 'commands')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('>')
    await expect(rows).not.toHaveCount(0)
  })

  await test.step('fuzzy-filters by label and shows the platform-formatted binding', async () => {
    await input.fill('>dup')
    await expect(rows.first()).toContainText('Duplicate Line')
    await expect(rows.first()).toContainText(IS_MAC ? '⌘D' : 'Ctrl+D')
  })

  await test.step('matches keywords, not just the label ("charset" finds the encoding commands)', async () => {
    await input.fill('>charset')
    await expect(rows.filter({ hasText: 'Encode in UTF-8' }).first()).toBeVisible()
  })

  await test.step('a query matching nothing says so', async () => {
    await input.fill('>zzzzqqqq')
    await expect(page.getByText('No matching commands')).toBeVisible()
  })

  await test.step('deleting ">" switches to file mode without closing; typing it back returns', async () => {
    await input.fill('')
    await expect(palette).toBeVisible()
    await expect(palette).toHaveAttribute('data-mode', 'files')
    await input.fill('>')
    await expect(palette).toHaveAttribute('data-mode', 'commands')
  })
})

test('command mode: Enter runs the selected command after the palette closes', async ({ electronApp, page }) => {
  await sendIPC(electronApp, 'menu:command-palette')
  const input = page.getByTestId('command-palette-input')
  await expect(input).toBeVisible()

  // Find & Replace opens its own overlay — it must survive the palette's teardown, which is why
  // the palette closes before running the command.
  await input.fill('>Find…')
  await expect(page.getByTestId('command-palette-command').first()).toContainText('Find')
  await input.press('Enter')

  await expect(page.getByTestId('command-palette')).not.toBeVisible()
  await expect(page.getByText('Find Next ↓')).toBeVisible()
})

test('command mode: editor commands are absent when no editor is open', async ({ electronApp, page }) => {
  await sendIPC(electronApp, 'menu:file-close')
  await expect(page.locator('[data-tab-title]')).toHaveCount(0)
  await sendIPC(electronApp, 'menu:command-palette')

  const input = page.getByTestId('command-palette-input')
  await expect(input).toBeVisible()
  await input.fill('>Duplicate Line')
  await expect(page.getByText('No matching commands')).toBeVisible()
})
