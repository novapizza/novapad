// Pure text-diff algorithms — line-level LCS + hybrid (word→char) inline diff.
// Ported verbatim from exifmaster-pro/components/TextDiff.tsx so the renderer
// component can stay focused on layout/styling. Used by the "Compare with…"
// fullscreen overlay (right-click a tab → pick another tab).

export type DiffOp = { type: 'equal' | 'insert' | 'delete'; value: string }
export type InlineOp = { type: 'equal' | 'del' | 'ins'; text: string }

export interface SideBySideRow {
  type: 'equal' | 'change' | 'insert' | 'delete'
  left: string | null
  right: string | null
  leftNo: number | null
  rightNo: number | null
}

export interface UnifiedDisplayRow {
  type: 'hunk' | 'context' | 'delete' | 'insert'
  text: string
  /** When this row is part of a paired del/ins block, the matched line on the
   *  other side — used to compute inline word/char highlights. */
  pairText?: string
  hunkHeader?: string
  hunkIndex?: number
  canExpand?: boolean
}

export function normalise(line: string, ignoreWs: boolean, ignoreCase: boolean): string {
  let s = line
  if (ignoreWs) s = s.replace(/\s+/g, ' ').trim()
  if (ignoreCase) s = s.toLowerCase()
  return s
}

/** Line-level Longest Common Subsequence diff. O(m*n) memory — safe for
 *  buffers well under 5K lines; for larger inputs the caller should chunk. */
export function lcsLineDiff(oldLines: string[], newLines: string[]): DiffOp[] {
  const m = oldLines.length
  const n = newLines.length
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const ops: DiffOp[] = []
  let i = m,
    j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'equal', value: oldLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'insert', value: newLines[j - 1] })
      j--
    } else {
      ops.unshift({ type: 'delete', value: oldLines[i - 1] })
      i--
    }
  }
  return ops
}

function tokenize(s: string): string[] {
  return s.match(/\w+|\s+|[^\w\s]/g) ?? (s.length ? [s] : [])
}

function lcsStringDiff(
  a: string[],
  b: string[]
): { type: 'equal' | 'delete' | 'insert'; tok: string }[] {
  const m = a.length,
    n = b.length
  // Bail out on very large token sets — fall back to a flat del/ins concat.
  // The caller is comparing single lines; this only fires on pathological cases.
  if (m * n > 40_000) {
    return [
      ...a.map((t) => ({ type: 'delete' as const, tok: t })),
      ...b.map((t) => ({ type: 'insert' as const, tok: t })),
    ]
  }
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const ops: { type: 'equal' | 'delete' | 'insert'; tok: string }[] = []
  let i = m,
    j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ type: 'equal', tok: a[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'insert', tok: b[j - 1] })
      j--
    } else {
      ops.unshift({ type: 'delete', tok: a[i - 1] })
      i--
    }
  }
  return ops
}

function charLevelDiff(a: string, b: string): { left: InlineOp[]; right: InlineOp[] } {
  const ops = lcsStringDiff(a.split(''), b.split(''))
  const left: InlineOp[] = [],
    right: InlineOp[] = []
  for (const op of ops) {
    if (op.type === 'equal') {
      left.push({ type: 'equal', text: op.tok })
      right.push({ type: 'equal', text: op.tok })
    } else if (op.type === 'delete') {
      left.push({ type: 'del', text: op.tok })
    } else {
      right.push({ type: 'ins', text: op.tok })
    }
  }
  return { left, right }
}

/** Hybrid: word-level diff first, then char-level inside each paired del/ins.
 *  Produces nicer inline highlights than pure word or pure char alone. */
export function inlineDiff(a: string, b: string): { left: InlineOp[]; right: InlineOp[] } {
  const wordOps = lcsStringDiff(tokenize(a), tokenize(b))
  const left: InlineOp[] = [],
    right: InlineOp[] = []
  let i = 0
  while (i < wordOps.length) {
    const op = wordOps[i]
    if (op.type === 'equal') {
      left.push({ type: 'equal', text: op.tok })
      right.push({ type: 'equal', text: op.tok })
      i++
    } else {
      const dels: string[] = [],
        ins: string[] = []
      while (i < wordOps.length && (wordOps[i].type === 'delete' || wordOps[i].type === 'insert')) {
        if (wordOps[i].type === 'delete') dels.push(wordOps[i].tok)
        else ins.push(wordOps[i].tok)
        i++
      }
      const pairCount = Math.min(dels.length, ins.length)
      for (let k = 0; k < pairCount; k++) {
        const { left: cl, right: cr } = charLevelDiff(dels[k], ins[k])
        left.push(...cl)
        right.push(...cr)
      }
      for (let k = pairCount; k < dels.length; k++) left.push({ type: 'del', text: dels[k] })
      for (let k = pairCount; k < ins.length; k++) right.push({ type: 'ins', text: ins[k] })
    }
  }
  return { left, right }
}

export function buildSideBySide(ops: DiffOp[]): SideBySideRow[] {
  const rows: SideBySideRow[] = []
  let l = 1,
    r = 1
  let i = 0
  while (i < ops.length) {
    const op = ops[i]
    if (op.type === 'equal') {
      rows.push({ type: 'equal', left: op.value, right: op.value, leftNo: l++, rightNo: r++ })
      i++
    } else {
      const deletes: string[] = []
      const inserts: string[] = []
      while (i < ops.length && (ops[i].type === 'delete' || ops[i].type === 'insert')) {
        if (ops[i].type === 'delete') deletes.push(ops[i].value)
        else inserts.push(ops[i].value)
        i++
      }
      const maxLen = Math.max(deletes.length, inserts.length)
      for (let k = 0; k < maxLen; k++) {
        const hasBoth = k < deletes.length && k < inserts.length
        rows.push({
          type: hasBoth ? 'change' : k < deletes.length ? 'delete' : 'insert',
          left: k < deletes.length ? deletes[k] : null,
          right: k < inserts.length ? inserts[k] : null,
          leftNo: k < deletes.length ? l++ : null,
          rightNo: k < inserts.length ? r++ : null,
        })
      }
    }
  }
  return rows
}

export function buildUnifiedDisplayRows(
  ops: DiffOp[],
  context = 3,
  expandedHunks: Set<number> = new Set()
): UnifiedDisplayRow[] {
  const rows: UnifiedDisplayRow[] = []
  const lineNums: { a: number; b: number }[] = []
  let la = 1,
    lb = 1
  for (const op of ops) {
    lineNums.push({ a: la, b: lb })
    if (op.type === 'equal' || op.type === 'delete') la++
    if (op.type === 'equal' || op.type === 'insert') lb++
  }

  let pos = 0
  let hunkIndex = 0
  while (pos < ops.length) {
    let s = pos
    while (s < ops.length && ops[s].type === 'equal') s++
    if (s === ops.length) break
    const availableBefore = s - pos
    let end = s
    let gap = 0
    for (let k = s; k < ops.length; k++) {
      if (ops[k].type !== 'equal') {
        end = k
        gap = 0
      } else {
        gap++
        if (gap > context) break
      }
    }
    let trueTrailing = 0
    for (let k = end + 1; k < ops.length && ops[k].type === 'equal'; k++) trueTrailing++

    const isExpanded = expandedHunks.has(hunkIndex)
    const ctxBefore = isExpanded ? availableBefore : Math.min(context, availableBefore)
    const ctxAfter = isExpanded ? trueTrailing : Math.min(context, trueTrailing)
    const sliceStart = s - ctxBefore
    const sliceEnd = end + ctxAfter + 1
    const hunk = ops.slice(sliceStart, sliceEnd)

    const canExpand = !isExpanded && (availableBefore > context || trueTrailing > context)
    const startA = lineNums[sliceStart].a
    const startB = lineNums[sliceStart].b
    const countA = hunk.filter((o) => o.type !== 'insert').length
    const countB = hunk.filter((o) => o.type !== 'delete').length
    const hunkHeader = `@@ -${startA},${countA} +${startB},${countB} @@`

    rows.push({ type: 'hunk', text: '', hunkHeader, hunkIndex, canExpand })
    for (const op of hunk) {
      if (op.type === 'equal') rows.push({ type: 'context', text: op.value })
      else if (op.type === 'delete') rows.push({ type: 'delete', text: op.value })
      else rows.push({ type: 'insert', text: op.value })
    }
    pos = end + Math.min(context, trueTrailing) + 1
    hunkIndex++
  }

  // Pair adjacent del/ins runs so the inline highlight has a partner to diff against.
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].type !== 'delete') continue
    let di = i
    while (di < rows.length && rows[di].type === 'delete') di++
    let ii2 = di
    while (ii2 < rows.length && rows[ii2].type === 'insert') ii2++
    const pairCount = Math.min(di - i, ii2 - di)
    for (let k = 0; k < pairCount; k++) {
      rows[i + k].pairText = rows[di + k].text
      rows[di + k].pairText = rows[i + k].text
    }
    i = ii2 - 1
  }
  return rows
}

export function buildUnifiedPatch(ops: DiffOp[], context = 3): string {
  const lines: string[] = []
  const lineNums: { a: number; b: number }[] = []
  let la = 1,
    lb = 1
  for (const op of ops) {
    lineNums.push({ a: la, b: lb })
    if (op.type === 'equal' || op.type === 'delete') la++
    if (op.type === 'equal' || op.type === 'insert') lb++
  }

  let hunkStart = 0
  while (hunkStart < ops.length) {
    let s = hunkStart
    while (s < ops.length && ops[s].type === 'equal') s++
    if (s === ops.length) break
    const ctxBefore = Math.min(context, s - hunkStart)
    let end = s
    let trailing = 0
    for (let k = s; k < ops.length; k++) {
      if (ops[k].type !== 'equal') {
        end = k
        trailing = 0
      } else {
        trailing++
        if (trailing > context) break
      }
    }
    const sliceStart = s - ctxBefore
    const sliceEnd = end + Math.min(context, trailing) + 1
    const hunk = ops.slice(sliceStart, sliceEnd)

    const startA = lineNums[sliceStart].a
    const startB = lineNums[sliceStart].b
    const countA = hunk.filter((op) => op.type !== 'insert').length
    const countB = hunk.filter((op) => op.type !== 'delete').length
    lines.push(`@@ -${startA},${countA} +${startB},${countB} @@`)
    for (const op of hunk) {
      if (op.type === 'equal') lines.push(' ' + op.value)
      else if (op.type === 'delete') lines.push('-' + op.value)
      else lines.push('+' + op.value)
    }
    hunkStart = sliceEnd
  }
  return lines.join('\n')
}

/** Apply normalisation to inputs, then diff, then remap onto the original
 *  un-normalised lines so the displayed text matches the user's content. */
export function diffNormalised(
  left: string,
  right: string,
  ignoreWs: boolean,
  ignoreCase: boolean
): { ops: DiffOp[]; stats: { added: number; removed: number; equal: number } } {
  const leftLines = left.split(/\r?\n/)
  const rightLines = right.split(/\r?\n/)
  const normLeft = leftLines.map((line) => normalise(line, ignoreWs, ignoreCase))
  const normRight = rightLines.map((line) => normalise(line, ignoreWs, ignoreCase))
  const normOps = lcsLineDiff(normLeft, normRight)

  const remapped: DiffOp[] = []
  let ll = 0,
    rr = 0
  for (const op of normOps) {
    if (op.type === 'equal') {
      remapped.push({ type: 'equal', value: leftLines[ll] ?? '' })
      ll++
      rr++
    } else if (op.type === 'delete') {
      remapped.push({ type: 'delete', value: leftLines[ll] ?? '' })
      ll++
    } else {
      remapped.push({ type: 'insert', value: rightLines[rr] ?? '' })
      rr++
    }
  }

  const added = remapped.filter((o) => o.type === 'insert').length
  const removed = remapped.filter((o) => o.type === 'delete').length
  const equal = remapped.filter((o) => o.type === 'equal').length
  return { ops: remapped, stats: { added, removed, equal } }
}
