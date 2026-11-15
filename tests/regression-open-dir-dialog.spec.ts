// REGRESSION: file:open-dir-dialog IPC must return string | null, not an object.
// Bug: openDirDialog returned a { canceled, filePath } object, so FileBrowserPanel crashed with
// "workspaceFolder.replace is not a function" (Cmd+B → Open Folder → black screen).
// The renderer side (string path renders the tree) is covered in open-folder.spec.ts.

import { test, expect, tempDir } from './fixtures'
import fs from 'fs'

test.use({ app: { seedBuffer: false } })

test('openDirDialog IPC handler returns a string path, not an object', async ({ electronApp, page }) => {
  void page // wait for the window to load before invoking from it
  const dir = tempDir('e2e-ipc-retval-')

  try {
    // Run the REAL handler, with only dialog.showOpenDialog stubbed to "pick" the temp dir.
    const result = await electronApp.evaluate(async ({ dialog, BrowserWindow }, d) => {
      const original = dialog.showOpenDialog.bind(dialog)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
      try {
        const win = BrowserWindow.getAllWindows()[0]
        return await win.webContents.executeJavaScript('window.api.file.openDirDialog()')
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(dialog as any).showOpenDialog = original
      }
    }, dir)

    expect(typeof result).toBe('string')
    expect(result).toBe(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
