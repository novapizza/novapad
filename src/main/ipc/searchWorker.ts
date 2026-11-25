import { workerData, parentPort } from 'worker_threads'
import * as fs from 'fs'
import * as path from 'path'
import {
  FindInFilesOptions,
  FindResultFile,
  buildRegExp,
  parseFilter,
  collectFilesAsync,
  searchBuffer,
  FIND_IN_FILES_V2_CONCURRENCY
} from './findInFilesLogic'

interface WorkerInput {
  searchId: string
  opts: FindInFilesOptions
  progressEvery: number
}

type WorkerMessage =
  | { type: 'progress'; searchId: string; scanned: number }
  | { type: 'chunk'; searchId: string; file: FindResultFile }
  | { type: 'done'; searchId: string; totalHits: number; totalFiles: number; durationMs: number }
  | { type: 'error'; searchId: string; message: string }

function send(msg: WorkerMessage): void {
  parentPort!.postMessage(msg)
}

async function run(): Promise<void> {
  const { searchId, opts, progressEvery } = workerData as WorkerInput
  const t0 = Date.now()

  console.log(`[Worker][${searchId}] START pattern="${opts.pattern}" dir="${opts.directory}"`)

  const re = buildRegExp(opts)
  if (!re) {
    send({ type: 'error', searchId, message: 'Invalid search pattern' })
    return
  }

  const filterRe = parseFilter(opts.fileFilter)

  let scanned = 0
  let totalHits = 0
  let totalFiles = 0

  const queue: string[] = []
  let done = false
  const waiters: Array<() => void> = []

  // Producer: walk directory and push file paths into the queue
  const producer = (async () => {
    // Skip binary extensions only for a catch-all filter: if the user typed
    // e.g. `*.dat`, they asked for that type and we must not drop it.
    const skipBinary = filterRe.source === '.*'
    for await (const fp of collectFilesAsync(opts.directory, filterRe, opts.isRecursive, skipBinary)) {
      queue.push(fp)
      // Wake one waiting consumer if any
      if (waiters.length > 0) waiters.shift()!()
    }
    done = true
    // Wake all remaining consumers so they can exit
    while (waiters.length > 0) waiters.shift()!()
    console.log(`[Worker][${searchId}] COLLECT done: ${queue.length + scanned} files in ${Date.now() - t0}ms`)
  })()

  // Consumer: pull from queue, read + search each file
  async function consumer(): Promise<void> {
    for (;;) {
      while (queue.length === 0 && !done) {
        await new Promise<void>((resolve) => waiters.push(resolve))
      }
      if (queue.length === 0 && done) return

      const fp = queue.shift()!

      let raw: Buffer | null = null
      try {
        raw = await fs.promises.readFile(fp)
      } catch {
        // unreadable — skip
      }

      scanned++

      if (raw !== null) {
        re.lastIndex = 0
        const results = searchBuffer(raw, re)
        if (results.length > 0) {
          const file: FindResultFile = { filePath: fp, title: path.basename(fp), results }
          send({ type: 'chunk', searchId, file })
          totalHits += results.length
          totalFiles++
        }
      }

      if (scanned % progressEvery === 0) {
        send({ type: 'progress', searchId, scanned })
      }
    }
  }

  const consumers = Array.from({ length: FIND_IN_FILES_V2_CONCURRENCY }, () => consumer())
  await Promise.all([producer, ...consumers])

  const totalMs = Date.now() - t0
  console.log(`[Worker][${searchId}] DONE scanned=${scanned} hits=${totalHits} files=${totalFiles} totalMs=${totalMs}ms`)

  send({ type: 'done', searchId, totalHits, totalFiles, durationMs: totalMs })
}

run().catch((err: Error) => {
  const { searchId } = (workerData as WorkerInput) ?? { searchId: 'unknown' }
  send({ type: 'error', searchId, message: err.message })
})
