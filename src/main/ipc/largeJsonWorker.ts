// Large-JSON worker: one instance per open document. Never materialises the
// file as a string. Builds an adaptive sparse index of record start offsets
// (depth-1 values of a top-level array, or top-level values for NDJSON), then
// serves record pages, streaming search / extract, and a streaming save that
// splices an edit overlay into the original bytes.
//
// Runs as a worker_thread so the 1–3 s index scan and the multi-second
// search / save passes never block the main process. Bundled by
// scripts/build-worker.mjs into out/workers/largeJsonWorker.js.

import { workerData, parentPort } from 'worker_threads'
import * as fs from 'fs'
import * as path from 'path'
import { extractByPath } from '../../shared/jsonPath'

// ── Protocol ──────────────────────────────────────────────────────────────────

export type LargeJsonMode = 'array' | 'ndjson'

export type WorkerIn =
  | { type: 'get-records'; reqId: number; start: number; count: number }
  | { type: 'search'; opId: string; query: string; limit: number }
  | { type: 'extract'; opId: string; path: string; limit: number }
  | { type: 'extract-to-file'; reqId: number; path: string; outPath: string; format: 'plain' | 'json' }
  | { type: 'save'; reqId: number; overlay: Array<[number, string | null]>; targetPath: string | null }
  | { type: 'cancel'; opId: string }
  | { type: 'reindex'; reqId: number }
  | { type: 'close' }

export type WorkerOut =
  | { type: 'progress'; bytesScanned: number; fileSize: number; recordCount: number; done: boolean; mode: LargeJsonMode | null; error: string | null }
  | { type: 'chunk'; opId: string; kind: 'search' | 'extract'; items: unknown[]; done: boolean; total: number; truncated: boolean; scanned: number; error: string | null }
  | { type: 'reply'; reqId: number; ok: boolean; data?: unknown; error?: string }

function post(msg: WorkerOut): void {
  parentPort!.postMessage(msg)
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

const B_QUOTE = 0x22, B_BSLASH = 0x5c, B_LBRACE = 0x7b, B_RBRACE = 0x7d, B_LBRACK = 0x5b, B_RBRACK = 0x5d
const B_COMMA = 0x2c, B_SP = 0x20, B_LF = 0x0a, B_CR = 0x0d, B_TAB = 0x09

function isWs(b: number): boolean {
  return b === B_SP || b === B_LF || b === B_CR || b === B_TAB
}

type RecKind = 'container' | 'string' | 'scalar'

/**
 * Byte-level state machine that emits (start, end) offsets of records.
 * Resumable across chunks: offsets are absolute, state lives on the instance.
 * `feed` returns false when the callback asked to stop or a syntax error was hit.
 */
class Tokenizer {
  mode: LargeJsonMode | null = null
  recordDepth = 0
  depth = 0
  inStr = false
  esc = false
  inRecord = false
  recKind: RecKind = 'scalar'
  recStart = -1
  error: string | null = null

  /** A tokenizer positioned at a record boundary (used to resume from an index anchor). */
  static atBoundary(mode: LargeJsonMode): Tokenizer {
    const t = new Tokenizer()
    t.mode = mode
    t.recordDepth = mode === 'array' ? 1 : 0
    t.depth = t.recordDepth
    return t
  }

  feed(buf: Buffer, base: number, from: number, onRecord: (start: number, end: number) => boolean | void): boolean {
    let i = from
    const n = buf.length
    while (i < n) {
      const b = buf[i]

      if (this.inStr) {
        if (this.esc) this.esc = false
        else if (b === B_BSLASH) this.esc = true
        else if (b === B_QUOTE) {
          this.inStr = false
          if (this.inRecord && this.recKind === 'string') {
            this.inRecord = false
            if (onRecord(this.recStart, base + i + 1) === false) return false
          }
        }
        i++
        continue
      }

      if (this.inRecord && this.recKind === 'scalar') {
        if (b === B_COMMA || b === B_RBRACK || b === B_RBRACE || isWs(b)) {
          this.inRecord = false
          if (onRecord(this.recStart, base + i) === false) return false
          // fall through: b still needs normal handling
        } else {
          i++
          continue
        }
      }

      if (this.mode === null) {
        if (isWs(b)) { i++; continue }
        if (b === B_LBRACK) {
          this.mode = 'array'
          this.recordDepth = 1
          this.depth = 1
          i++
          continue
        }
        this.mode = 'ndjson'
        this.recordDepth = 0
        this.depth = 0
        // fall through: b begins the first record
      }

      switch (b) {
        case B_QUOTE:
          if (!this.inRecord && this.depth === this.recordDepth) {
            this.inRecord = true; this.recKind = 'string'; this.recStart = base + i
          }
          this.inStr = true
          break
        case B_LBRACE:
        case B_LBRACK:
          if (!this.inRecord && this.depth === this.recordDepth) {
            this.inRecord = true; this.recKind = 'container'; this.recStart = base + i
          }
          this.depth++
          break
        case B_RBRACE:
        case B_RBRACK:
          this.depth--
          if (this.depth < 0) {
            this.error = `Unexpected '${String.fromCharCode(b)}' at byte ${base + i}`
            return false
          }
          if (this.inRecord && this.recKind === 'container' && this.depth === this.recordDepth) {
            this.inRecord = false
            if (onRecord(this.recStart, base + i + 1) === false) return false
          }
          break
        case B_COMMA:
        case B_SP: case B_LF: case B_CR: case B_TAB:
          break
        default:
          if (!this.inRecord && this.depth === this.recordDepth) {
            this.inRecord = true; this.recKind = 'scalar'; this.recStart = base + i
          }
      }
      i++
    }
    return true
  }

  /** At EOF a scalar record with no trailing delimiter ends at the file end. */
  finish(fileSize: number, onRecord: (start: number, end: number) => boolean | void): void {
    if (this.inRecord && this.recKind === 'scalar') {
      this.inRecord = false
      onRecord(this.recStart, fileSize)
    }
  }
}

// ── Sliding-window scanner ───────────────────────────────────────────────────

const CHUNK = 4 * 1024 * 1024

interface ScanOpts {
  from: number
  tok: Tokenizer
  /** Return false to stop scanning. `view`/`viewBase` let the callback slice record bytes. */
  onRecord: (start: number, end: number, view: Buffer, viewBase: number) => boolean | void
  /** Bytes at/after this absolute offset must stay available to onRecord (e.g. save's copy cursor). */
  keepFrom?: () => number
  needBytes: boolean
  onChunk?: (pos: number) => void
  isCancelled?: () => boolean
}

type ScanResult = 'done' | 'stopped' | 'cancelled' | 'error'

async function scan(fh: fs.promises.FileHandle, fileSize: number, o: ScanOpts): Promise<ScanResult> {
  let pos = o.from
  let carry: Buffer | null = null
  let carryBase = 0
  const tok = o.tok

  while (pos < fileSize) {
    if (o.isCancelled?.()) return 'cancelled'
    const want = Math.min(CHUNK, fileSize - pos)
    const chunk = Buffer.allocUnsafe(want)
    const { bytesRead } = await fh.read(chunk, 0, want, pos)
    if (bytesRead === 0) break
    const fresh = bytesRead === want ? chunk : chunk.subarray(0, bytesRead)

    let buf: Buffer
    let base: number
    let from: number
    if (carry) {
      buf = Buffer.concat([carry, fresh])
      base = carryBase
      from = carry.length
    } else {
      buf = fresh
      base = pos
      from = 0
    }

    const ok = tok.feed(buf, base, from, (s, e) => o.onRecord(s, e, buf, base))
    pos += bytesRead
    if (!ok) return tok.error ? 'error' : 'stopped'
    o.onChunk?.(pos)

    if (o.needBytes) {
      let keep = tok.inRecord ? tok.recStart : Infinity
      if (o.keepFrom) keep = Math.min(keep, o.keepFrom())
      if (keep < pos) {
        carry = buf.subarray(keep - base)
        carryBase = keep
      } else {
        carry = null
      }
    } else {
      carry = null
    }
  }

  let stopped = false
  tok.finish(fileSize, (s, e) => {
    const view = carry ?? Buffer.alloc(0)
    const r = o.onRecord(s, e, view, carry ? carryBase : s)
    if (r === false) stopped = true
  })
  return stopped ? 'stopped' : 'done'
}

// ── Adaptive sparse index ────────────────────────────────────────────────────

const MAX_ENTRIES = 1 << 20 // 1 M anchors ≈ 8 MB

class SparseIndex {
  starts = new Float64Array(1 << 16)
  n = 0
  stride = 1
  total = 0

  push(offset: number): void {
    if (this.total % this.stride === 0) {
      if (this.n === this.starts.length) {
        if (this.n >= MAX_ENTRIES) this.compact()
        else {
          const grown = new Float64Array(this.starts.length * 2)
          grown.set(this.starts)
          this.starts = grown
        }
      }
      this.starts[this.n++] = offset
    }
    this.total++
  }

  /** Keep every other anchor; doubles the stride. Kept entry j ↔ record j·(2·stride). */
  private compact(): void {
    const half = Math.ceil(this.n / 2)
    for (let j = 0; j < half; j++) this.starts[j] = this.starts[2 * j]
    this.n = half
    this.stride *= 2
  }

  anchorFor(recordIdx: number): { offset: number; recordNo: number } {
    const a = Math.min(Math.floor(recordIdx / this.stride), this.n - 1)
    return { offset: this.starts[a], recordNo: a * this.stride }
  }
}

// ── Document ─────────────────────────────────────────────────────────────────

class Doc {
  filePath: string
  fh: fs.promises.FileHandle | null = null
  fileSize = 0
  /** 3 when the file starts with a UTF-8 BOM, else 0. Full scans start here. */
  contentStart = 0
  index = new SparseIndex()
  mode: LargeJsonMode | null = null
  indexing = false
  indexed = false
  indexError: string | null = null
  cancelled = new Set<string>()
  indexGen = 0

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async open(): Promise<void> {
    this.fh = await fs.promises.open(this.filePath, 'r')
    this.fileSize = (await this.fh.stat()).size
    const head = Buffer.alloc(3)
    const { bytesRead } = await this.fh.read(head, 0, 3, 0)
    this.contentStart = bytesRead === 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf ? 3 : 0
  }

  async close(): Promise<void> {
    if (this.fh) {
      await this.fh.close().catch(() => {})
      this.fh = null
    }
  }

  progress(done: boolean, bytes: number, error: string | null = null): void {
    post({
      type: 'progress',
      bytesScanned: bytes,
      fileSize: this.fileSize,
      recordCount: this.index.total,
      done,
      mode: this.mode,
      error
    })
  }

  async buildIndex(): Promise<void> {
    const gen = ++this.indexGen
    this.indexing = true
    this.indexed = false
    this.indexError = null
    this.index = new SparseIndex()
    this.mode = null
    const tok = new Tokenizer()
    let lastReport = 0
    this.progress(false, 0)

    const res = await scan(this.fh!, this.fileSize, {
      from: this.contentStart,
      tok,
      needBytes: false,
      onRecord: (s) => {
        this.index.push(s)
      },
      onChunk: (pos) => {
        if (gen !== this.indexGen) return
        this.mode = tok.mode
        if (pos - lastReport >= 8 * 1024 * 1024) {
          lastReport = pos
          this.progress(false, pos)
        }
      },
      isCancelled: () => gen !== this.indexGen
    })
    if (gen !== this.indexGen) return

    this.mode = tok.mode
    this.indexing = false
    if (res === 'error') {
      this.indexError = tok.error ?? 'Malformed JSON'
    } else if (tok.inStr || tok.inRecord || (tok.mode === 'array' && tok.depth !== 0)) {
      this.indexError = 'File ends inside a value — the JSON is truncated or malformed.'
    } else if (this.index.total <= 1) {
      this.indexError =
        'Only one top-level value was found. The record viewer needs an array of records or NDJSON; a single large object is not supported yet.'
    }
    this.indexed = this.indexError === null
    this.progress(true, this.fileSize, this.indexError)
  }

  /** Fetch `count` records starting at record index `start`, as UTF-8 strings. */
  async getRecords(start: number, count: number): Promise<string[]> {
    if (!this.mode || this.index.n === 0 || start >= this.index.total || count <= 0) return []
    const end = Math.min(start + count, this.index.total)
    const anchor = this.index.anchorFor(start)
    const tok = Tokenizer.atBoundary(this.mode)
    const out: string[] = []
    let recNo = anchor.recordNo
    await scan(this.fh!, this.fileSize, {
      from: anchor.offset,
      tok,
      needBytes: true,
      onRecord: (s, e, view, base) => {
        if (recNo >= start) out.push(view.toString('utf8', s - base, e - base))
        recNo++
        return recNo < end
      }
    })
    return out
  }

  async search(opId: string, query: string, limit: number): Promise<void> {
    if (!this.mode) return
    const needle = query.toLowerCase()
    // Full scans re-run mode detection from the top of the file.
    const tok = new Tokenizer()
    let idx = 0
    let items: number[] = []
    let total = 0
    let truncated = false
    let lastFlush = 0
    const flush = (done: boolean, error: string | null = null, scanned = this.fileSize): void => {
      post({ type: 'chunk', opId, kind: 'search', items, done, total, truncated, scanned, error })
      items = []
    }
    const res = await scan(this.fh!, this.fileSize, {
      from: this.contentStart,
      tok,
      needBytes: true,
      isCancelled: () => this.cancelled.has(opId),
      onRecord: (s, e, view, base) => {
        const text = view.toString('utf8', s - base, e - base)
        if (text.toLowerCase().includes(needle)) {
          items.push(idx)
          total++
          if (total >= limit) { truncated = true; idx++; return false }
        }
        idx++
      },
      onChunk: (pos) => {
        if (items.length >= 500 || pos - lastFlush >= 32 * 1024 * 1024) {
          lastFlush = pos
          flush(false, null, pos)
        }
      }
    })
    this.cancelled.delete(opId)
    if (res === 'cancelled') { flush(true, 'cancelled'); return }
    flush(true, res === 'error' ? (tok.error ?? 'Malformed JSON') : null)
  }

  async extract(opId: string, dotPath: string, limit: number): Promise<void> {
    if (!this.mode) return
    const tok = new Tokenizer()
    let items: string[] = []
    let total = 0
    let parseErrors = 0
    let lastFlush = 0
    const flush = (done: boolean, error: string | null = null, scanned = this.fileSize): void => {
      post({ type: 'chunk', opId, kind: 'extract', items, done, total, truncated: total > limit, scanned, error })
      items = []
    }
    const res = await scan(this.fh!, this.fileSize, {
      from: this.contentStart,
      tok,
      needBytes: true,
      isCancelled: () => this.cancelled.has(opId),
      onRecord: (s, e, view, base) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(view.toString('utf8', s - base, e - base))
        } catch {
          parseErrors++
          return
        }
        for (const v of extractByPath(parsed, dotPath)) {
          total++
          if (total <= limit) items.push(typeof v === 'string' ? v : JSON.stringify(v))
        }
      },
      onChunk: (pos) => {
        if (items.length >= 200 || pos - lastFlush >= 32 * 1024 * 1024) {
          lastFlush = pos
          flush(false, null, pos)
        }
      }
    })
    this.cancelled.delete(opId)
    if (res === 'cancelled') { flush(true, 'cancelled'); return }
    const err = res === 'error'
      ? (tok.error ?? 'Malformed JSON')
      : parseErrors > 0 ? `${parseErrors} record(s) could not be parsed and were skipped.` : null
    flush(true, err)
  }

  async extractToFile(dotPath: string, outPath: string, format: 'plain' | 'json'): Promise<number> {
    if (!this.mode) return 0
    const tok = new Tokenizer()
    const out = await fs.promises.open(outPath, 'w')
    let pending: string[] = []
    let pendingBytes = 0
    let count = 0
    // Writes are chained so they land in order even though scan's callbacks are sync.
    let chain: Promise<unknown> = Promise.resolve()
    const flush = (): void => {
      if (pending.length === 0) return
      const text = pending.join('')
      pending = []
      pendingBytes = 0
      chain = chain.then(() => out.write(text))
    }
    const push = (s: string): void => {
      pending.push(s)
      pendingBytes += s.length
    }
    try {
      if (format === 'json') push('[\n')
      await scan(this.fh!, this.fileSize, {
        from: this.contentStart,
        tok,
        needBytes: true,
        onRecord: (s, e, view, base) => {
          let parsed: unknown
          try { parsed = JSON.parse(view.toString('utf8', s - base, e - base)) } catch { return }
          for (const v of extractByPath(parsed, dotPath)) {
            if (format === 'json') push((count > 0 ? ',\n' : '') + '  ' + JSON.stringify(v))
            else push((typeof v === 'string' ? v : JSON.stringify(v)) + '\n')
            count++
          }
        },
        onChunk: () => {
          if (pendingBytes >= 4 * 1024 * 1024) flush()
        }
      })
      if (format === 'json') push('\n]\n')
      flush()
      await chain
    } finally {
      await out.close()
    }
    return count
  }

  /**
   * Stream base + overlay to a temp file, then rename over the target.
   * Overlay: recordIndex → replacement text, or null to delete the record.
   * Original inter-record separators are preserved; a deleted record drops
   * the separator in front of it (or, for the first kept record, uses the
   * preamble). Returns the new mtime/size.
   */
  async save(overlayList: Array<[number, string | null]>, targetPath: string | null): Promise<{ mtime: number; size: number }> {
    if (!this.mode || !this.indexed) throw new Error('Document is not indexed yet.')
    const overlay = new Map<number, string | null>(overlayList)
    const target = targetPath ?? this.filePath
    const dir = path.dirname(target)

    // Free-space precheck (skipped where statfs is unavailable).
    try {
      const sf = await (fs.promises as unknown as { statfs?: (p: string) => Promise<{ bavail: number; bsize: number }> }).statfs?.(dir)
      if (sf && sf.bavail * sf.bsize < this.fileSize * 1.05) {
        throw new Error(`Not enough free space in ${dir} to write a ${Math.round(this.fileSize / 1024 / 1024)} MB file.`)
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Not enough free space')) throw e
    }

    const tmp = path.join(dir, `${path.basename(target)}.tmp-${process.pid}`)
    const out = await fs.promises.open(tmp, 'w')
    const pending: Buffer[] = []
    let pendingBytes = 0
    const queue = (b: Buffer): void => { pending.push(b); pendingBytes += b.length }
    const flush = async (): Promise<void> => {
      if (pending.length === 0) return
      const joined = pending.length === 1 ? pending[0] : Buffer.concat(pending)
      pending.length = 0
      pendingBytes = 0
      await out.write(joined)
    }

    // Preamble = everything before the first record (BOM, '[', whitespace).
    // Found with a tiny scan so it can be written first regardless of which
    // records at the head are deleted.
    let firstStart = -1
    await scan(this.fh!, this.fileSize, {
      from: this.contentStart,
      tok: new Tokenizer(),
      needBytes: false,
      onRecord: (s) => { firstStart = s; return false }
    })
    if (firstStart < 0) throw new Error('No records found.')
    {
      const pre = Buffer.alloc(firstStart)
      await this.fh!.read(pre, 0, pre.length, 0)
      queue(pre)
    }

    const tok = new Tokenizer()
    let recNo = 0
    let lastEnd = 0        // end of the previous record (absolute); copy cursor
    let written = 0        // kept/replaced records written so far

    let flushPromise: Promise<void> = Promise.resolve()
    try {
      const res = await scan(this.fh!, this.fileSize, {
        from: this.contentStart,
        tok,
        needBytes: true,
        keepFrom: () => lastEnd,
        onRecord: (s, e, view, base) => {
          const rep = overlay.get(recNo)
          if (rep !== null) {
            // Separator between the previous original record and this one.
            // The first written record needs none (preamble already out) —
            // this also drops the separators of any deleted head records.
            if (written > 0) queue(Buffer.from(view.subarray(lastEnd - base, s - base)))
            if (rep === undefined) queue(Buffer.from(view.subarray(s - base, e - base)))
            else queue(Buffer.from(rep, 'utf8'))
            written++
          }
          lastEnd = e
          recNo++
        },
        onChunk: () => {
          if (pendingBytes >= 4 * 1024 * 1024) {
            const batch = pending.splice(0, pending.length)
            pendingBytes = 0
            const joined = Buffer.concat(batch)
            flushPromise = flushPromise.then(() => out.write(joined).then(() => undefined))
          }
        }
      })
      if (res === 'error') throw new Error(tok.error ?? 'Malformed JSON')
      // Epilogue: everything after the last record (e.g. "\n]\n").
      if (lastEnd < this.fileSize) {
        const tail = Buffer.alloc(this.fileSize - lastEnd)
        await this.fh!.read(tail, 0, tail.length, lastEnd)
        queue(tail)
      }
      await flushPromise
      await flush()
      await out.close()

      // Release our handle before replacing the file (Windows).
      await this.close()
      await fs.promises.rename(tmp, target)
    } catch (err) {
      await out.close().catch(() => {})
      await fs.promises.rm(tmp, { force: true }).catch(() => {})
      if (!this.fh) await this.open().catch(() => {})
      throw err
    }

    this.filePath = target
    await this.open()
    const st = await this.fh!.stat()
    return { mtime: st.mtimeMs, size: st.size }
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { filePath } = workerData as { filePath: string }
  const doc = new Doc(filePath)
  try {
    await doc.open()
  } catch (err) {
    post({ type: 'progress', bytesScanned: 0, fileSize: 0, recordCount: 0, done: true, mode: null, error: (err as Error).message })
    return
  }

  parentPort!.on('message', (msg: WorkerIn) => {
    void handle(doc, msg)
  })

  await doc.buildIndex()
}

async function handle(doc: Doc, msg: WorkerIn): Promise<void> {
  const reply = (reqId: number, ok: boolean, data?: unknown, error?: string): void =>
    post({ type: 'reply', reqId, ok, data, error })
  try {
    switch (msg.type) {
      case 'get-records': {
        const records = await doc.getRecords(msg.start, msg.count)
        reply(msg.reqId, true, { start: msg.start, records })
        break
      }
      case 'search':
        await doc.search(msg.opId, msg.query, msg.limit)
        break
      case 'extract':
        await doc.extract(msg.opId, msg.path, msg.limit)
        break
      case 'extract-to-file': {
        const count = await doc.extractToFile(msg.path, msg.outPath, msg.format)
        reply(msg.reqId, true, { count })
        break
      }
      case 'save': {
        const r = await doc.save(msg.overlay, msg.targetPath)
        reply(msg.reqId, true, r)
        // Offsets moved; rebuild the index in the background. Progress events
        // tell the renderer when records are browsable again.
        void doc.buildIndex()
        break
      }
      case 'reindex':
        reply(msg.reqId, true)
        void doc.buildIndex()
        break
      case 'cancel':
        doc.cancelled.add(msg.opId)
        break
      case 'close':
        await doc.close()
        process.exit(0)
    }
  } catch (err) {
    if ('reqId' in msg) reply(msg.reqId, false, undefined, (err as Error).message)
  }
}

void main()
