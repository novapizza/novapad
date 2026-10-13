// Main-process side of the large-JSON record viewer. Owns one worker per open
// document, bridges request/response calls to the worker's reply protocol, and
// forwards its streamed progress / chunk messages to the renderer.

import { ipcMain, BrowserWindow } from 'electron'
import { Worker } from 'worker_threads'
import * as fs from 'fs'
import * as path from 'path'
import * as chardet from 'chardet'
import { markSelfSaved } from './watchHandlers'

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

interface Doc {
  worker: Worker
  filePath: string
  pending: Map<number, Pending>
  nextReq: number
}

const docs = new Map<string, Doc>()
let nextDocId = 1

/** Encodings the byte-level tokenizer can handle (ASCII-compatible single/multi-byte). */
const SUPPORTED_ENCODINGS = /^(UTF-8|ASCII|ISO-8859-\d+|windows-125\d)$/i

function request<T>(doc: Doc, msg: Record<string, unknown>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const reqId = doc.nextReq++
    doc.pending.set(reqId, { resolve: resolve as (v: unknown) => void, reject })
    doc.worker.postMessage({ ...msg, reqId })
  })
}

function getDoc(docId: string): Doc {
  const doc = docs.get(docId)
  if (!doc) throw new Error('Document is no longer open.')
  return doc
}

function disposeDoc(docId: string): void {
  const doc = docs.get(docId)
  if (!doc) return
  docs.delete(docId)
  for (const p of doc.pending.values()) p.reject(new Error('Document closed.'))
  doc.pending.clear()
  void doc.worker.terminate()
}

export function registerLargeJsonHandlers(win: BrowserWindow): void {
  const send = (channel: string, payload: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }

  ipcMain.handle('largejson:open', async (_event, filePath: string) => {
    try {
      const st = await fs.promises.stat(filePath)
      const fh = await fs.promises.open(filePath, 'r')
      const head = Buffer.alloc(65536)
      let bytesRead = 0
      try {
        bytesRead = (await fh.read(head, 0, head.length, 0)).bytesRead
      } finally {
        await fh.close()
      }
      const encoding = chardet.detect(head.subarray(0, bytesRead)) || 'UTF-8'
      if (!SUPPORTED_ENCODINGS.test(encoding)) {
        return {
          docId: null,
          size: st.size,
          encoding,
          error: `This file is ${encoding}. The record viewer supports UTF-8 files only.`
        }
      }

      const docId = `ljson-${nextDocId++}`
      const workerPath = path.join(__dirname, '../workers/largeJsonWorker.js')
      const worker = new Worker(workerPath, { workerData: { filePath } })
      const doc: Doc = { worker, filePath, pending: new Map(), nextReq: 1 }
      docs.set(docId, doc)

      worker.on('message', (msg: { type: string; reqId?: number; ok?: boolean; data?: unknown; error?: string }) => {
        if (win.isDestroyed()) { disposeDoc(docId); return }
        switch (msg.type) {
          case 'progress':
            send('largejson:progress', { docId, ...msg })
            break
          case 'chunk':
            send('largejson:chunk', { docId, ...msg })
            break
          case 'reply': {
            const p = msg.reqId !== undefined ? doc.pending.get(msg.reqId) : undefined
            if (!p) return
            doc.pending.delete(msg.reqId!)
            if (msg.ok) p.resolve(msg.data)
            else p.reject(new Error(msg.error ?? 'Worker error'))
            break
          }
        }
      })
      worker.on('error', (err) => {
        send('largejson:progress', { docId, type: 'progress', bytesScanned: 0, fileSize: st.size, recordCount: 0, done: true, mode: null, error: `Worker crashed: ${err.message}` })
        disposeDoc(docId)
      })
      worker.on('exit', () => {
        if (docs.has(docId)) disposeDoc(docId)
      })

      return { docId, size: st.size, encoding, error: null }
    } catch (err) {
      return { docId: null, size: 0, encoding: 'UTF-8', error: (err as Error).message }
    }
  })

  ipcMain.handle('largejson:get-records', async (_event, docId: string, start: number, count: number) => {
    try {
      const doc = getDoc(docId)
      const safeCount = Math.max(0, Math.min(Number(count) || 0, 500))
      return await request<{ start: number; records: string[] }>(doc, { type: 'get-records', start: Math.max(0, Number(start) || 0), count: safeCount })
    } catch (err) {
      return { start, records: [], error: (err as Error).message }
    }
  })

  ipcMain.handle('largejson:search', async (_event, docId: string, opId: string, query: string, limit = 10000) => {
    try {
      const doc = getDoc(docId)
      doc.worker.postMessage({ type: 'search', opId, query: String(query), limit: Math.min(Number(limit) || 10000, 100000) })
      return { error: null }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('largejson:extract', async (_event, docId: string, opId: string, dotPath: string, limit = 1000) => {
    try {
      const doc = getDoc(docId)
      doc.worker.postMessage({ type: 'extract', opId, path: String(dotPath), limit: Math.min(Number(limit) || 1000, 20000) })
      return { error: null }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('largejson:extract-to-file', async (_event, docId: string, dotPath: string, outPath: string, format: 'plain' | 'json') => {
    try {
      const doc = getDoc(docId)
      const r = await request<{ count: number }>(doc, { type: 'extract-to-file', path: String(dotPath), outPath, format: format === 'json' ? 'json' : 'plain' })
      return { count: r.count, error: null }
    } catch (err) {
      return { count: 0, error: (err as Error).message }
    }
  })

  ipcMain.handle('largejson:save', async (_event, docId: string, overlay: Array<[number, string | null]>, targetPath: string | null) => {
    try {
      const doc = getDoc(docId)
      const target = targetPath ?? doc.filePath
      // Our own write — the watcher must not report it as an external change.
      markSelfSaved(target)
      const r = await request<{ mtime: number; size: number }>(doc, { type: 'save', overlay, targetPath })
      doc.filePath = target
      return { ...r, error: null }
    } catch (err) {
      return { mtime: 0, size: 0, error: (err as Error).message }
    }
  })

  ipcMain.handle('largejson:reindex', async (_event, docId: string) => {
    try {
      const doc = getDoc(docId)
      await request(doc, { type: 'reindex' })
      return { error: null }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('largejson:cancel', async (_event, docId: string, opId: string) => {
    const doc = docs.get(docId)
    doc?.worker.postMessage({ type: 'cancel', opId })
  })

  ipcMain.handle('largejson:close', async (_event, docId: string) => {
    const doc = docs.get(docId)
    if (!doc) return
    doc.worker.postMessage({ type: 'close' })
    // Give the worker a moment to close its handle, then force-terminate.
    setTimeout(() => disposeDoc(docId), 500)
  })

  win.on('closed', () => {
    for (const id of [...docs.keys()]) disposeDoc(id)
  })
}
