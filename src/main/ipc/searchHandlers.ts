import { ipcMain, BrowserWindow } from 'electron'
import { Worker } from 'worker_threads'
import * as path from 'path'
import { FindInFilesOptions } from './findInFilesLogic'

interface StartOpts extends FindInFilesOptions {
  searchId: string
}

const activeWorkers = new Map<string, Worker>()

export function registerSearchHandlers(win: BrowserWindow): void {
  ipcMain.handle('search:find-in-files-start', (_event, opts: StartOpts) => {
    if (!opts.pattern || !opts.directory) {
      return { error: 'Pattern and directory are required' }
    }

    const { searchId } = opts

    const workerPath = path.join(__dirname, '../workers/searchWorker.js')
    let worker: Worker
    try {
      worker = new Worker(workerPath, {
        workerData: { searchId, opts, progressEvery: 150 }
      })
    } catch (err) {
      return { error: `Failed to start search worker: ${(err as Error).message}` }
    }

    activeWorkers.set(searchId, worker)

    worker.on('message', (msg: { type: string; searchId: string }) => {
      if (win.isDestroyed()) {
        worker.terminate()
        activeWorkers.delete(searchId)
        return
      }
      switch (msg.type) {
        case 'chunk':
          win.webContents.send('search:chunk', msg)
          break
        case 'progress':
          win.webContents.send('search:progress', msg)
          break
        case 'done':
          win.webContents.send('search:done', msg)
          activeWorkers.delete(searchId)
          break
        case 'error':
          win.webContents.send('search:done', { type: 'done', searchId, error: (msg as any).message })
          activeWorkers.delete(searchId)
          break
      }
    })

    worker.on('error', (err) => {
      activeWorkers.delete(searchId)
      if (!win.isDestroyed()) {
        win.webContents.send('search:done', { searchId, error: err.message })
      }
    })

    worker.on('exit', () => {
      activeWorkers.delete(searchId)
    })

    return { searchId }
  })

  ipcMain.handle('search:cancel', (_event, searchId: string) => {
    const worker = activeWorkers.get(searchId)
    if (worker) {
      worker.terminate()
      activeWorkers.delete(searchId)
    }
  })

  win.on('closed', () => {
    for (const [, worker] of activeWorkers) {
      worker.terminate()
    }
    activeWorkers.clear()
  })
}
