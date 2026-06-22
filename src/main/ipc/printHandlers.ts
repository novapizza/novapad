import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import * as fs from 'fs/promises'
import { join } from 'path'

/**
 * Render trusted HTML in a throwaway, hidden BrowserWindow and hand the caller
 * its webContents. The HTML is written to a temp file and loaded via file://
 * (rather than a data: URL) to avoid URL-length limits on large documents and
 * to sidestep CSP/data-URI quirks. Scripts are disabled — the content is
 * static markup only.
 */
async function withRenderedHtml<T>(
  html: string,
  fn: (win: BrowserWindow) => Promise<T>
): Promise<T> {
  const tmpPath = join(app.getPath('temp'), `novapad-print-${process.pid}-${Date.now()}.html`)
  await fs.writeFile(tmpPath, html, 'utf8')
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false
    }
  })
  try {
    await win.loadFile(tmpPath)
    return await fn(win)
  } finally {
    if (!win.isDestroyed()) win.destroy()
    void fs.unlink(tmpPath).catch(() => {})
  }
}

export function registerPrintHandlers(): void {
  // Build a PDF from the supplied HTML and save it via a Save dialog.
  ipcMain.handle('print:to-pdf', async (_e, payload: { html: string; defaultPath?: string }) => {
    const { html, defaultPath } = payload
    try {
      return await withRenderedHtml(html, async (win) => {
        const data = await win.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { marginType: 'default' }
        })
        const { canceled, filePath } = await dialog.showSaveDialog({
          defaultPath: defaultPath || 'document.pdf',
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (canceled || !filePath) return { canceled: true as const }
        await fs.writeFile(filePath, data)
        return { canceled: false as const, filePath }
      })
    } catch (err) {
      return { canceled: true as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Open the system print dialog for the supplied HTML.
  ipcMain.handle('print:document', async (_e, payload: { html: string }) => {
    const { html } = payload
    try {
      return await withRenderedHtml(html, (win) =>
        new Promise<{ success: boolean; error?: string }>((resolve) => {
          win.webContents.print({ printBackground: true }, (success, failureReason) => {
            resolve({ success, error: success ? undefined : failureReason })
          })
        })
      )
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
