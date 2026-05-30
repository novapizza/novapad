import { ipcMain, dialog, BrowserWindow } from 'electron'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

export type HashAlgo = 'md5' | 'sha1' | 'sha256' | 'sha512'

const ALGOS: HashAlgo[] = ['md5', 'sha1', 'sha256', 'sha512']

function isAlgo(a: unknown): a is HashAlgo {
  return typeof a === 'string' && (ALGOS as string[]).includes(a)
}

export interface HashFileResult {
  path: string
  name: string
  size: number
  hex: string | null
  error: string | null
}

/**
 * Register Tools IPC handlers. All hashing runs here in the main process via
 * Node's `crypto` so MD5 (unavailable in the renderer's SubtleCrypto) is
 * supported and "from files…" can stream large files off-thread without
 * shuttling their bytes into the renderer.
 */
export function registerToolsHandlers(): void {
  // Hash a string. Returns lowercase hex, or an error message.
  ipcMain.handle('tools:hash', async (_event, algo: string, text: string) => {
    if (!isAlgo(algo)) return { hex: null, error: `Unknown algorithm: ${algo}` }
    try {
      const hex = createHash(algo).update(text ?? '', 'utf8').digest('hex')
      return { hex, error: null }
    } catch (err) {
      return { hex: null, error: (err as Error).message }
    }
  })

  // Open a multi-select file picker and hash each chosen file by streaming it.
  // Returns the per-file results plus a `canceled` flag.
  ipcMain.handle('tools:hash-files', async (event, algo: string) => {
    if (!isAlgo(algo)) return { canceled: false, files: [], error: `Unknown algorithm: ${algo}` }
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(win!, {
      title: `Generate ${algo.toUpperCase()} from files`,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'All Files', extensions: ['*'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, files: [], error: null }
    }
    const files: HashFileResult[] = []
    for (const fp of result.filePaths) {
      files.push(await hashFile(fp, algo))
    }
    return { canceled: false, files, error: null }
  })
}

function hashFile(filePath: string, algo: HashAlgo): Promise<HashFileResult> {
  return new Promise((resolve) => {
    let size = 0
    try {
      size = fs.statSync(filePath).size
    } catch {
      // size is best-effort; carry on
    }
    const hash = createHash(algo)
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', (err) => {
      resolve({ path: filePath, name: path.basename(filePath), size, hex: null, error: err.message })
    })
    stream.on('end', () => {
      resolve({ path: filePath, name: path.basename(filePath), size, hex: hash.digest('hex'), error: null })
    })
  })
}
