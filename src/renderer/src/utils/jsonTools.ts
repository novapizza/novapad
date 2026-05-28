// Pure utilities for the JSON preview pane — diff/TS generation/path extraction/
// syntax highlighting. Kept side-effect-free so they can be reused by other
// tools (Compare overlay, schema preview, etc.). Logic ported from
// exifmaster-pro/components/JsonTools.tsx + utils/jsonExtractor.ts.

// ── Path extraction ─────────────────────────────────────────────────────────

export function extractByPath(data: unknown, path: string): unknown[] {
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return []
  const results: unknown[] = []

  function resolve(node: unknown, remaining: string[]): void {
    if (remaining.length === 0) {
      if (Array.isArray(node)) node.forEach((v) => results.push(v))
      else results.push(node)
      return
    }
    if (Array.isArray(node)) {
      node.forEach((item) => resolve(item, remaining))
      return
    }
    if (node !== null && typeof node === 'object') {
      const key = remaining[0]
      const rest = remaining.slice(1)
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        resolve((node as Record<string, unknown>)[key], rest)
      } else {
        // Key not found at this level → search deeper. Lets users write a short
        // tail path like "_source.id" against a deeply nested ES hit.
        Object.values(node as Record<string, unknown>).forEach((child) => resolve(child, remaining))
      }
    }
  }

  resolve(data, parts)
  return results
}

export function formatAsPlainText(values: unknown[]): string {
  return values.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n')
}

export function formatAsJsonArray(values: unknown[]): string {
  return JSON.stringify(values, null, 2)
}

// ── Diff algorithm (tree-shaped) ────────────────────────────────────────────

export type DiffType = 'added' | 'removed' | 'changed' | 'nested'

export interface DiffEntry {
  key: string
  type: DiffType
  oldVal?: unknown
  newVal?: unknown
  children?: DiffEntry[]
}

export function computeDiff(a: unknown, b: unknown): DiffEntry[] {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return JSON.stringify(a) !== JSON.stringify(b)
      ? [{ key: '', type: 'changed', oldVal: a, newVal: b }]
      : []
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const allKeys = Array.from(new Set([...Object.keys(ao), ...Object.keys(bo)]))
  const result: DiffEntry[] = []

  for (const key of allKeys) {
    const hasA = key in ao
    const hasB = key in bo
    if (hasA && !hasB) {
      result.push({ key, type: 'removed', oldVal: ao[key] })
    } else if (!hasA && hasB) {
      result.push({ key, type: 'added', newVal: bo[key] })
    } else {
      const va = ao[key]
      const vb = bo[key]
      const bothObjects = typeof va === 'object' && va !== null && typeof vb === 'object' && vb !== null
      if (bothObjects) {
        const children = computeDiff(va, vb)
        if (children.length > 0) result.push({ key, type: 'nested', children })
      } else if (JSON.stringify(va) !== JSON.stringify(vb)) {
        result.push({ key, type: 'changed', oldVal: va, newVal: vb })
      }
    }
  }
  return result
}

export function countDiffStats(entries: DiffEntry[]): { added: number; removed: number; changed: number } {
  let added = 0,
    removed = 0,
    changed = 0
  for (const e of entries) {
    if (e.type === 'added') added++
    else if (e.type === 'removed') removed++
    else if (e.type === 'changed') changed++
    else if (e.type === 'nested' && e.children) {
      const s = countDiffStats(e.children)
      added += s.added
      removed += s.removed
      changed += s.changed
    }
  }
  return { added, removed, changed }
}

// ── Side-by-side diff annotation (used by the panel renderer) ───────────────

export type DiffCategory = 'missing' | 'type_mismatch' | 'value_diff'
export type LineHL = 'removed' | 'added' | 'type_mismatch' | null

export interface DiffItem {
  path: string
  category: DiffCategory
  side?: 'left' | 'right'
}

export function findDiffs(a: unknown, b: unknown, path = ''): DiffItem[] {
  if (a === undefined && b === undefined) return []
  if (a === undefined) return [{ path, category: 'missing', side: 'right' }]
  if (b === undefined) return [{ path, category: 'missing', side: 'left' }]

  const tA = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a
  const tB = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b

  if (tA !== tB) return [{ path, category: 'type_mismatch' }]
  if (a === null) return []

  if (tA === 'array') {
    const aa = a as unknown[]
    const bb = b as unknown[]
    const r: DiffItem[] = []
    for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
      r.push(...findDiffs(aa[i], bb[i], `${path}[${i}]`))
    }
    return r
  }
  if (tA === 'object') {
    const ao = a as Record<string, unknown>
    const bo = b as Record<string, unknown>
    const r: DiffItem[] = []
    for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
      r.push(...findDiffs(ao[k], bo[k], path ? `${path}.${k}` : k))
    }
    return r
  }
  return a !== b ? [{ path, category: 'value_diff' }] : []
}

// ── JSON → TypeScript interfaces ────────────────────────────────────────────

export type NamingConvention = 'standard' | 'camel' | 'snake'

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}
function toCamelCase(s: string): string {
  return s.replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase()).replace(/^(.)/, (c: string) => c.toLowerCase())
}
function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').replace(/[-\s]+/g, '_').replace(/^_/, '').toLowerCase()
}
function convertKey(key: string, convention: NamingConvention): string {
  if (convention === 'camel') return toCamelCase(key)
  if (convention === 'snake') return toSnakeCase(key)
  return key
}

export function jsonToTs(jsonStr: string, convention: NamingConvention = 'camel'): string {
  const root = JSON.parse(jsonStr)
  const defs: string[] = []
  const seen = new Set<string>()

  function inferType(val: unknown, name: string): string {
    if (val === null) return 'null'
    if (typeof val === 'boolean') return 'boolean'
    if (typeof val === 'number') return 'number'
    if (typeof val === 'string') return 'string'
    if (Array.isArray(val)) {
      if (val.length === 0) return 'unknown[]'
      const first = val.find((v) => v !== null)
      if (first === undefined) return 'null[]'
      if (typeof first === 'object' && !Array.isArray(first)) {
        const childName = capitalize(name) + 'Item'
        buildInterface(first as Record<string, unknown>, childName)
        return `${childName}[]`
      }
      return `${inferType(first, name)}[]`
    }
    if (typeof val === 'object') {
      const childName = capitalize(name)
      buildInterface(val as Record<string, unknown>, childName)
      return childName
    }
    return 'unknown'
  }

  function buildInterface(obj: Record<string, unknown>, name: string): void {
    if (seen.has(name)) return
    seen.add(name)
    const lines = Object.entries(obj).map(([k, v]) => {
      const converted = convertKey(k, convention)
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(converted) ? converted : `"${converted}"`
      return `  ${safeKey}: ${inferType(v, k)};`
    })
    defs.push(`export interface ${name} {\n${lines.join('\n')}\n}`)
  }

  if (Array.isArray(root)) {
    if (root.length === 0) return 'export type Root = unknown[];'
    const first = root.find((v) => v !== null && typeof v === 'object' && !Array.isArray(v))
    if (first) {
      buildInterface(first as Record<string, unknown>, 'RootItem')
      defs.push('export type Root = RootItem[];')
    } else {
      return `export type Root = ${inferType(root[0], 'root')}[];`
    }
  } else if (root !== null && typeof root === 'object') {
    buildInterface(root as Record<string, unknown>, 'Root')
  } else {
    return `export type Root = ${inferType(root, 'root')};`
  }
  return defs.join('\n\n')
}

// ── Syntax highlighting (HTML output for <pre dangerouslySetInnerHTML>) ─────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Token classes are defined in styles/tailwind.css and adapt to light/dark
// theme via CSS variables (the inline-color version washed out on the light
// preview background — see Notepad++ palette tokens).
// Linear-scan tokenizer (no regex backtracking, no recursion). Prior versions
// used a single global-replace regex with `(?:X|Y)*` over the string body,
// which made V8's irregexp engine stack-overflow on long string values or
// long runs of escape sequences (RangeError: Maximum call stack size).
export function highlightJson(json: string): string {
  const len = json.length
  let out = ''
  let i = 0
  const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9'
  const isWs = (ch: string): boolean => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'

  while (i < len) {
    const c = json[i]
    if (c === '"') {
      // Scan to end of string (handles \\ and \").
      let j = i + 1
      while (j < len) {
        const cj = json[j]
        if (cj === '\\') {
          j += 2
        } else if (cj === '"') {
          j++
          break
        } else {
          j++
        }
      }
      const raw = json.slice(i, j)
      // Look past whitespace for `:` to classify as key vs value.
      let k = j
      while (k < len && isWs(json[k])) k++
      if (k < len && json[k] === ':') {
        out += `<span class="json-tok-key">${escHtml(raw)}</span>` + escHtml(json.slice(j, k + 1))
        i = k + 1
      } else {
        out += `<span class="json-tok-string">${escHtml(raw)}</span>`
        i = j
      }
    } else if (c === '{' || c === '}' || c === '[' || c === ']') {
      out += `<span class="json-tok-brace">${c}</span>`
      i++
    } else if (c === 't' && json.substr(i, 4) === 'true') {
      out += '<span class="json-tok-bool">true</span>'
      i += 4
    } else if (c === 'f' && json.substr(i, 5) === 'false') {
      out += '<span class="json-tok-bool">false</span>'
      i += 5
    } else if (c === 'n' && json.substr(i, 4) === 'null') {
      out += '<span class="json-tok-null">null</span>'
      i += 4
    } else if (c === '-' || isDigit(c)) {
      let j = i
      if (json[j] === '-') j++
      while (j < len && isDigit(json[j])) j++
      if (j < len && json[j] === '.') {
        j++
        while (j < len && isDigit(json[j])) j++
      }
      if (j < len && (json[j] === 'e' || json[j] === 'E')) {
        j++
        if (j < len && (json[j] === '+' || json[j] === '-')) j++
        while (j < len && isDigit(json[j])) j++
      }
      out += `<span class="json-tok-num">${json.slice(i, j)}</span>`
      i = j
    } else {
      out += escHtml(c)
      i++
    }
  }
  return out
}

export function highlightTs(code: string): string {
  const safe = escHtml(code)
  return safe
    .replace(/\b(export|interface|type)\b/g, '<span class="json-tok-keyword">$1</span>')
    .replace(
      /\b(string|number|boolean|null|unknown|any|void|never|undefined)\b/g,
      '<span class="json-tok-type">$1</span>'
    )
    .replace(/\[\]/g, '<span class="json-tok-num">[]</span>')
    .replace(/(  \w+)(:)/g, '<span class="json-tok-key">$1</span>$2')
}
