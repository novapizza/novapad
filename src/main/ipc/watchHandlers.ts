import { ipcMain, BrowserWindow } from 'electron'
import chokidar, { FSWatcher } from 'chokidar'

const watchers = new Map<string, FSWatcher>()

// File paths we've just saved ourselves. The watcher fires a 'change' event
// when we write to disk — we don't want to show "externally changed" for our
// own saves. file:write populates this set; the watcher drains it.
const suppressNextChange = new Set<string>()

/** Called by file:write to ignore the next change event for the saved path. */
export function markSelfSaved(filePath: string): void {
  suppressNextChange.add(filePath)
}

export function registerWatchHandlers(win: BrowserWindow): void {
  ipcMain.handle('watch:add', (_event, filePath: string) => {
    if (watchers.has(filePath)) return
    const watcher = chokidar.watch(filePath, {
      persistent: false,
      ignoreInitial: true,
      usePolling: false,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
    })
    watcher.on('change', () => {
      if (suppressNextChange.delete(filePath)) return
      win.webContents.send('file:externally-changed', filePath)
    })
    watcher.on('unlink', () => {
      win.webContents.send('file:externally-deleted', filePath)
      const w = watchers.get(filePath)
      if (w) {
        void w.close()
        watchers.delete(filePath)
      }
    })
    // Without an 'error' listener chokidar lets the underlying fs.watch error
    // bubble up as an uncaught exception. On Windows that fires as EPERM when
    // an external tool (git checkout, atomic-replace editors) swaps the file
    // out from under us, crashing the main process with a JS error dialog.
    watcher.on('error', (err) => {
      console.error('[watch] error for', filePath, err)
      const w = watchers.get(filePath)
      if (w) {
        void w.close()
        watchers.delete(filePath)
      }
    })
    watchers.set(filePath, watcher)
  })

  ipcMain.handle('watch:remove', (_event, filePath: string) => {
    const w = watchers.get(filePath)
    if (w) {
      w.close()
      watchers.delete(filePath)
    }
  })
}

export function closeAllWatchers(): void {
  for (const w of watchers.values()) w.close()
  watchers.clear()
}
