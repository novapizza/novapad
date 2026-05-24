import React, { lazy, Suspense, useEffect, useMemo, useState, startTransition } from 'react'
import * as monaco from 'monaco-editor'
import {
  Braces, X, Copy, Check, AlertCircle, Wrench, Maximize2, Minimize2 as MinifyIcon,
  GitCompare, Code2, Unlink, Network, ShieldCheck, ArrowLeftRight, Search,
  ChevronRight, ChevronDown,
} from 'lucide-react'
import { jsonrepair } from 'jsonrepair'
import { editorRegistry } from '../../utils/editorRegistry'
import { useUIStore } from '../../store/uiStore'
import { useEditorStore } from '../../store/editorStore'
import { usePreviewFullscreen } from '../preview/previewFullscreen'
import {
  extractByPath, formatAsPlainText, formatAsJsonArray,
  computeDiff, countDiffStats, type DiffEntry,
  jsonToTs, type NamingConvention,
  highlightJson, highlightTs,
} from '../../utils/jsonTools'

// JsonDiagram lazy-loaded so the SVG render path (and its layout engine) only
// pulls into the bundle once the user actually opens the Diagram tab.
const JsonDiagram = lazy(() => import('./JsonDiagram'))

// ajv pulled lazily on demand by the Schema tab — saves ~120KB from initial
// pane load when the user is only formatting.
type AjvModule = typeof import('ajv')
type AddFormatsModule = typeof import('ajv-formats')

type JsonTab = 'format' | 'repair' | 'diagram' | 'extract' | 'diff' | 'schema' | 'ts' | 'unescape'

const TABS: Array<{ id: JsonTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'format', label: 'Format', icon: Braces },
  { id: 'repair', label: 'Repair', icon: Wrench },
  { id: 'diagram', label: 'Diagram', icon: Network },
  { id: 'extract', label: 'Extract', icon: Search },
  { id: 'diff', label: 'Diff', icon: GitCompare },
  { id: 'schema', label: 'Schema', icon: ShieldCheck },
  { id: 'ts', label: 'TS', icon: Code2 },
  { id: 'unescape', label: 'Unescape', icon: Unlink },
]

/**
 * JSON Mighty preview pane — opens via Ctrl+P on a JSON buffer. Subscribes to
 * the active Monaco model so its content tracks every keystroke. Renders a
 * tab strip at the top; each tab is a self-contained operation against the
 * current buffer (and, for Diff, optionally a second buffer or pasted JSON).
 */
export const JsonPreviewPane: React.FC = () => {
  const [content, setContent] = useState('')
  const setShowPreview = useUIStore((s) => s.setShowPreview)
  const { sectionClass, Toggle: FullscreenToggle } = usePreviewFullscreen()
  const [tab, setTab] = useState<JsonTab>('format')

  // Mirror MarkdownPreviewPane's content subscription. We re-attach the model
  // listener every time the user switches tabs so the JSON pane always tracks
  // whatever JSON buffer is currently active.
  useEffect(() => {
    const editor = editorRegistry.get()
    if (!editor) return
    let modelDisposer: monaco.IDisposable | null = null
    const attach = (model: monaco.editor.ITextModel | null) => {
      modelDisposer?.dispose()
      modelDisposer = null
      if (!model) {
        setContent('')
        return
      }
      setContent(model.getValue())
      modelDisposer = model.onDidChangeContent(() => setContent(model.getValue()))
    }
    attach(editor.getModel())
    const modelChange = editor.onDidChangeModel(() => attach(editor.getModel()))
    return () => {
      modelChange.dispose()
      modelDisposer?.dispose()
    }
  }, [])

  return (
    <section className={sectionClass}>
      <header className="px-3 py-2 border-b border-border flex items-center gap-2 bg-secondary/30">
        <Braces size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          JSON Mighty Tools
        </span>
        <div className="ml-auto flex items-center gap-1">
          {FullscreenToggle}
          <button
            onClick={() => setShowPreview(false)}
            aria-label="Close preview"
            title="Close preview (Ctrl+P)"
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/* Tab strip — horizontal scroll fallback for narrow panes */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-secondary/10 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors whitespace-nowrap ' +
                (active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary')
              }
            >
              <Icon size={11} />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'format' && <FormatTab content={content} />}
        {tab === 'repair' && <RepairTab content={content} />}
        {tab === 'diagram' && <DiagramTab content={content} />}
        {tab === 'extract' && <ExtractTab content={content} />}
        {tab === 'diff' && <DiffTab content={content} />}
        {tab === 'schema' && <SchemaTab content={content} />}
        {tab === 'ts' && <TsTab content={content} />}
        {tab === 'unescape' && <UnescapeTab content={content} />}
      </div>
    </section>
  )
}

// ── Shared building blocks ─────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        if (!text) return
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      disabled={!text}
      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-secondary hover:bg-secondary/80 text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function ErrorRow({ msg }: { msg: string }) {
  return (
    <div className="mx-3 mt-2 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded text-destructive text-xs flex items-start gap-2">
      <AlertCircle size={12} className="mt-0.5 shrink-0" />
      <span className="font-medium break-words">{msg}</span>
    </div>
  )
}

function HighlightedJsonOutput({ value }: { value: string }) {
  const html = useMemo(() => highlightJson(value), [value])
  if (!value) {
    return <p className="text-muted-foreground text-xs italic">{'// Output will appear here…'}</p>
  }
  return (
    <pre
      className="font-mono text-[12px] whitespace-pre-wrap leading-relaxed text-foreground"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ── Format / Repair tabs ────────────────────────────────────────────────────

function FormatTab({ content }: { content: string }) {
  const [indent, setIndent] = useState<2 | 4 | 'tab'>(2)
  const indentVal = (): string | number => (indent === 'tab' ? '\t' : indent)

  const { output, error } = useMemo(() => {
    if (!content.trim()) return { output: '', error: null as string | null }
    try {
      return { output: JSON.stringify(JSON.parse(content), null, indentVal()), error: null }
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : 'Parse error' }
    }
  }, [content, indent])

  const handleMinify = () => {
    // Minify is a derived view — recomputed on render below via the mode switch.
    setMode('minify')
  }
  const [mode, setMode] = useState<'beautify' | 'minify'>('beautify')
  const finalOutput = useMemo(() => {
    if (mode === 'minify' && content.trim()) {
      try { return JSON.stringify(JSON.parse(content)) } catch { return '' }
    }
    return output
  }, [mode, content, output])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/10 flex-wrap">
        <div className="flex bg-secondary rounded p-0.5 gap-0.5">
          {([2, 4, 'tab'] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => setIndent(v as typeof indent)}
              className={
                'px-2 py-0.5 text-[10px] font-bold rounded transition-colors ' +
                (indent === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
              }
            >
              {v === 'tab' ? 'Tab' : `${v}sp`}
            </button>
          ))}
        </div>
        <div className="flex bg-secondary rounded p-0.5 gap-0.5">
          <button
            onClick={() => setMode('beautify')}
            className={
              'flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded transition-colors ' +
              (mode === 'beautify' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
            }
          >
            <Maximize2 size={10} /> Beautify
          </button>
          <button
            onClick={handleMinify}
            className={
              'flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded transition-colors ' +
              (mode === 'minify' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
            }
          >
            <MinifyIcon size={10} /> Minify
          </button>
        </div>
        <div className="ml-auto">
          <CopyButton text={finalOutput} />
        </div>
      </div>
      {error && <ErrorRow msg={`Invalid JSON: ${error}`} />}
      <div className="flex-1 overflow-auto p-3">
        <HighlightedJsonOutput value={finalOutput} />
      </div>
    </div>
  )
}

function RepairTab({ content }: { content: string }) {
  const { output, error } = useMemo(() => {
    if (!content.trim()) return { output: '', error: null as string | null }
    try {
      const fixed = jsonrepair(content)
      const parsed = JSON.parse(fixed)
      return { output: JSON.stringify(parsed, null, 2), error: null }
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : 'Could not repair' }
    }
  }, [content])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/10">
        <span className="text-[11px] text-muted-foreground">
          Auto-fix trailing commas, single quotes, unquoted keys, missing commas…
        </span>
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </div>
      {error && <ErrorRow msg={`Could not repair: ${error}`} />}
      <div className="flex-1 overflow-auto p-3">
        <HighlightedJsonOutput value={output} />
      </div>
    </div>
  )
}

// ── Diagram tab ────────────────────────────────────────────────────────────

function DiagramTab({ content }: { content: string }) {
  const [parsed, setParsed] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!content.trim()) {
      setParsed(null)
      setError(null)
      return
    }
    try {
      const p = JSON.parse(content)
      startTransition(() => {
        setParsed(p)
        setError(null)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }, [content])

  if (error) {
    return (
      <div className="p-3">
        <ErrorRow msg={`Invalid JSON: ${error}`} />
      </div>
    )
  }
  if (parsed === null) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Buffer is empty — paste JSON to render diagram.
      </div>
    )
  }
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          Loading diagram…
        </div>
      }
    >
      <JsonDiagram data={parsed} />
    </Suspense>
  )
}

// ── Extract tab ────────────────────────────────────────────────────────────

function ExtractTab({ content }: { content: string }) {
  const [path, setPath] = useState('')
  const [format, setFormat] = useState<'plain' | 'json'>('plain')

  const { output, count, error } = useMemo(() => {
    if (!content.trim()) return { output: '', count: null as number | null, error: null as string | null }
    if (!path.trim()) return { output: '', count: null, error: null }
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return { output: '', count: null, error: 'Invalid JSON in buffer.' }
    }
    const values = extractByPath(parsed, path)
    if (values.length === 0) return { output: '', count: 0, error: `No values for path "${path}".` }
    return {
      output: format === 'plain' ? formatAsPlainText(values) : formatAsJsonArray(values),
      count: values.length,
      error: null,
    }
  }, [content, path, format])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/10 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="hits.hits._source.id"
            spellCheck={false}
            className="w-full pl-7 pr-2 py-1 rounded border border-border bg-background text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex bg-secondary rounded p-0.5 gap-0.5">
          {(['plain', 'json'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={
                'px-2 py-0.5 text-[10px] font-bold rounded transition-colors ' +
                (format === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
              }
            >
              {f === 'plain' ? 'Plain' : 'JSON'}
            </button>
          ))}
        </div>
        <CopyButton text={output} />
      </div>
      {count !== null && (
        <div className="px-3 py-1 text-[11px] text-primary font-semibold border-b border-border">
          {count} {count === 1 ? 'value' : 'values'} found
        </div>
      )}
      {error && <ErrorRow msg={error} />}
      <div className="flex-1 overflow-auto p-3">
        {output ? (
          <pre className="font-mono text-[12px] whitespace-pre-wrap leading-relaxed text-foreground">{output}</pre>
        ) : (
          <p className="text-muted-foreground text-xs italic">
            Enter a dot-notation path. Missing keys are searched deeper, so <code className="font-mono">_source.id</code> works on nested ES hits.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Diff tab ───────────────────────────────────────────────────────────────

function DiffTab({ content }: { content: string }) {
  const [otherText, setOtherText] = useState('')
  const [otherSource, setOtherSource] = useState<'paste' | string>('paste')
  const [swap, setSwap] = useState(false)

  // Buffers that COULD be the "B" side — any open JSON file other than the
  // active one (which is what `content` already mirrors).
  const buffers = useEditorStore((s) => s.buffers)
  const activeId = useEditorStore((s) => s.activeId)
  const candidateBuffers = useMemo(
    () => buffers.filter((b) => b.kind === 'file' && b.id !== activeId && b.language === 'json'),
    [buffers, activeId]
  )

  const otherContent = useMemo(() => {
    if (otherSource === 'paste') return otherText
    const buf = buffers.find((b) => b.id === otherSource)
    return buf?.model?.getValue() ?? buf?.content ?? ''
  }, [otherSource, otherText, buffers])

  const { entries, error } = useMemo(() => {
    if (!content.trim() || !otherContent.trim()) {
      return { entries: null as DiffEntry[] | null, error: null as string | null }
    }
    try {
      const a = JSON.parse(swap ? otherContent : content)
      const b = JSON.parse(swap ? content : otherContent)
      return { entries: computeDiff(a, b), error: null }
    } catch (e) {
      return { entries: null, error: e instanceof Error ? e.message : 'Invalid JSON' }
    }
  }, [content, otherContent, swap])

  const stats = entries ? countDiffStats(entries) : null

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border bg-secondary/10 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={otherSource}
            onChange={(e) => setOtherSource(e.target.value)}
            className="text-[11px] px-2 py-1 rounded border border-border bg-background"
          >
            <option value="paste">Paste B below…</option>
            {candidateBuffers.map((b) => (
              <option key={b.id} value={b.id}>
                Compare with: {b.title}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSwap((s) => !s)}
            title="Swap A and B"
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-secondary hover:bg-secondary/80"
          >
            <ArrowLeftRight size={11} /> {swap ? 'A↔B (swapped)' : 'Swap'}
          </button>
        </div>
        {otherSource === 'paste' && (
          <textarea
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Paste JSON to compare against the current buffer…"
            spellCheck={false}
            className="w-full h-24 resize-none rounded border border-border bg-background px-2 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}
      </div>
      {error && <ErrorRow msg={`Invalid JSON: ${error}`} />}
      {stats && (
        <div className="px-3 py-1.5 text-[11px] border-b border-border flex items-center gap-3 bg-secondary/5">
          <span className="font-bold">
            {stats.added + stats.removed + stats.changed} difference{stats.added + stats.removed + stats.changed !== 1 ? 's' : ''}
          </span>
          <span className="text-emerald-500">+{stats.added}</span>
          <span className="text-red-500">-{stats.removed}</span>
          <span className="text-amber-500">~{stats.changed}</span>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {entries === null ? (
          <p className="p-3 text-xs text-muted-foreground italic">
            {otherSource === 'paste'
              ? 'Paste a second JSON document above to see the diff.'
              : 'Pick another open JSON tab above.'}
          </p>
        ) : entries.length === 0 ? (
          <p className="p-3 text-xs text-emerald-500 font-semibold">JSON documents are identical.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {entries.map((entry, i) => (
              <DiffRow key={i} entry={entry} depth={0} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DiffRow({ entry, depth }: { entry: DiffEntry; depth: number }) {
  const [expanded, setExpanded] = useState(true)
  const indent = depth * 16 + 8

  const formatVal = (v: unknown) => {
    if (typeof v === 'object' && v !== null) {
      const s = JSON.stringify(v)
      return s.length > 80 ? s.slice(0, 80) + '…' : s
    }
    return JSON.stringify(v)
  }

  if (entry.type === 'nested') {
    return (
      <div>
        <div
          className="flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-secondary/50 text-xs font-mono"
          onClick={() => setExpanded(!expanded)}
          style={{ paddingLeft: indent }}
        >
          <span className="text-muted-foreground">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
          <span className="text-primary font-bold">&quot;{entry.key}&quot;</span>
          <span className="text-muted-foreground ml-1">{`{ changes inside }`}</span>
        </div>
        {expanded && entry.children?.map((child, i) => <DiffRow key={i} entry={child} depth={depth + 1} />)}
      </div>
    )
  }

  const colorCls =
    entry.type === 'added'
      ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500 text-emerald-600 dark:text-emerald-400'
      : entry.type === 'removed'
        ? 'bg-red-500/10 border-l-2 border-l-red-500 text-red-600 dark:text-red-400'
        : 'bg-amber-500/10 border-l-2 border-l-amber-500 text-amber-600 dark:text-amber-400'

  return (
    <div className={`py-1 px-2 text-xs font-mono ${colorCls}`} style={{ paddingLeft: indent }}>
      <span className="font-bold">&quot;{entry.key}&quot;</span>
      {entry.type === 'changed' && (
        <span className="ml-2">
          <span className="line-through opacity-70">{formatVal(entry.oldVal)}</span>
          <span className="mx-1.5 text-muted-foreground">→</span>
          <span>{formatVal(entry.newVal)}</span>
        </span>
      )}
      {entry.type === 'added' && <span className="ml-2">{formatVal(entry.newVal)}</span>}
      {entry.type === 'removed' && <span className="ml-2 line-through opacity-70">{formatVal(entry.oldVal)}</span>}
    </div>
  )
}

// ── Schema tab ──────────────────────────────────────────────────────────────

interface SchemaError {
  path: string
  message: string
  keyword: string
}

function SchemaTab({ content }: { content: string }) {
  const [schemaText, setSchemaText] = useState('')
  const [result, setResult] = useState<{ valid: boolean; errors: SchemaError[]; schemas?: string[]; selected?: string } | null>(null)
  const [topError, setTopError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ajvMod, setAjvMod] = useState<{ Ajv: AjvModule['default']; addFormats: AddFormatsModule['default'] } | null>(null)

  // Lazy-load ajv on first interaction with this tab.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [a, f] = await Promise.all([import('ajv'), import('ajv-formats')])
      if (cancelled) return
      setAjvMod({ Ajv: a.default, addFormats: f.default })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleValidate = (overrideSchemaName?: string) => {
    setTopError(null)
    setResult(null)
    if (!ajvMod) {
      setTopError('Schema validator still loading…')
      return
    }
    let schemaParsed: unknown
    try {
      schemaParsed = JSON.parse(schemaText.trim())
    } catch {
      setTopError('Schema is not valid JSON.')
      return
    }
    let payloadParsed: unknown
    try {
      payloadParsed = JSON.parse(content.trim())
    } catch {
      setTopError('Buffer content is not valid JSON.')
      return
    }
    const sp = schemaParsed as Record<string, unknown>
    const isOpenApi = !!(sp.openapi || sp.swagger)
    const availableSchemas: string[] = []
    let resolvedSchema: unknown = schemaParsed

    if (isOpenApi) {
      const components = sp.components as { schemas?: Record<string, unknown> } | undefined
      const defs = components?.schemas ?? (sp.definitions as Record<string, unknown> | undefined) ?? {}
      availableSchemas.push(...Object.keys(defs))
      const chosen = overrideSchemaName ?? availableSchemas[0] ?? ''
      if (!chosen) {
        setTopError('No schemas found in components.schemas / definitions.')
        return
      }
      const picked = (defs as Record<string, unknown>)[chosen]
      if (!picked) {
        setTopError(`Schema "${chosen}" not found in spec.`)
        return
      }
      // Inline definitions so $refs in the picked schema can resolve.
      resolvedSchema = { ...(picked as object), components: sp.components, definitions: sp.definitions }
    }

    setBusy(true)
    try {
      const ajv = new ajvMod.Ajv({ allErrors: true, strict: false })
      ajvMod.addFormats(ajv)
      const validate = ajv.compile(resolvedSchema as object)
      const valid = validate(payloadParsed) as boolean
      const errors: SchemaError[] = (validate.errors ?? []).map((e) => ({
        path: e.instancePath || '(root)',
        message: e.message ?? 'Unknown error',
        keyword: e.keyword,
      }))
      setResult({
        valid,
        errors,
        schemas: isOpenApi ? availableSchemas : undefined,
        selected: isOpenApi ? overrideSchemaName ?? availableSchemas[0] : undefined,
      })
    } catch (e) {
      setTopError(`Schema compilation failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border bg-secondary/10 flex flex-col gap-2">
        <textarea
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          placeholder="Paste JSON Schema or OpenAPI/Swagger spec here…"
          spellCheck={false}
          className="w-full h-24 resize-none rounded border border-border bg-background px-2 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleValidate()}
            disabled={busy || !ajvMod}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            <ShieldCheck size={12} />
            {busy ? 'Validating…' : 'Validate'}
          </button>
          {result?.schemas && result.schemas.length > 0 && (
            <select
              value={result.selected ?? ''}
              onChange={(e) => handleValidate(e.target.value)}
              className="text-[11px] px-2 py-1 rounded border border-border bg-background"
            >
              {result.schemas.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {topError && <ErrorRow msg={topError} />}
      <div className="flex-1 overflow-auto p-3">
        {!result ? (
          <p className="text-muted-foreground text-xs italic">
            Paste a JSON Schema or OpenAPI spec and click Validate. Buffer content is the payload.
          </p>
        ) : result.valid ? (
          <p className="text-emerald-500 font-semibold text-sm flex items-center gap-2">
            <Check size={14} /> Valid — payload matches schema.
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-red-500 font-semibold text-sm">{result.errors.length} validation error(s):</p>
            {result.errors.map((e, i) => (
              <div key={i} className="px-2 py-1.5 bg-red-500/5 border border-red-500/30 rounded text-xs">
                <code className="font-mono text-red-600 dark:text-red-400 font-bold">{e.path}</code>
                <span className="ml-2 text-foreground">{e.message}</span>
                <span className="ml-1 text-muted-foreground text-[10px]">({e.keyword})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── TS Types tab ───────────────────────────────────────────────────────────

function TsTab({ content }: { content: string }) {
  const [naming, setNaming] = useState<NamingConvention>('camel')
  const { output, error } = useMemo(() => {
    if (!content.trim()) return { output: '', error: null as string | null }
    try {
      return { output: jsonToTs(content, naming), error: null }
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : 'Parse error' }
    }
  }, [content, naming])

  const html = useMemo(() => highlightTs(output), [output])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/10">
        <div className="flex bg-secondary rounded p-0.5 gap-0.5">
          {(['standard', 'camel', 'snake'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setNaming(v)}
              className={
                'px-2 py-0.5 text-[10px] font-bold rounded transition-colors capitalize ' +
                (naming === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
              }
            >
              {v}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </div>
      {error && <ErrorRow msg={`Invalid JSON: ${error}`} />}
      <div className="flex-1 overflow-auto p-3">
        {output ? (
          <pre
            className="font-mono text-[12px] whitespace-pre-wrap leading-relaxed text-foreground"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-muted-foreground text-xs italic">{'// Interfaces will appear here…'}</p>
        )}
      </div>
    </div>
  )
}

// ── Unescape tab ───────────────────────────────────────────────────────────

function UnescapeTab({ content }: { content: string }) {
  const { output, error } = useMemo(() => {
    const s = content.trim()
    if (!s) return { output: '', error: null as string | null }
    try {
      // Case 1: full JSON-string literal, wrapped in outer quotes.
      if (s.startsWith('"') && s.endsWith('"')) {
        const inner = JSON.parse(s) as string
        try {
          return { output: JSON.stringify(JSON.parse(inner), null, 2), error: null }
        } catch {
          return { output: inner, error: null }
        }
      }
      // Case 2: raw escaped text without outer quotes.
      const unescaped = s.replace(/\\"/g, '"')
      return { output: JSON.stringify(JSON.parse(unescaped), null, 2), error: null }
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : 'Invalid input' }
    }
  }, [content])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/10">
        <span className="text-[11px] text-muted-foreground">
          Strips backslash-escaping from JSON embedded in logs / API responses.
        </span>
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </div>
      {error && <ErrorRow msg={`Could not parse: ${error}`} />}
      <div className="flex-1 overflow-auto p-3">
        <HighlightedJsonOutput value={output} />
      </div>
    </div>
  )
}
