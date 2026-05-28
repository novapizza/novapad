import React, { useEffect, useState } from 'react'
import { Check, ShieldCheck } from 'lucide-react'
import { ErrorRow } from './shared'

// ajv pulled lazily on first mount of this tab — adds ~120KB only when needed.
type AjvModule = typeof import('ajv')
type AddFormatsModule = typeof import('ajv-formats')

interface SchemaError {
  path: string
  message: string
  keyword: string
}

export function SchemaTab({ content }: { content: string }) {
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
          className="w-full h-24 resize-none rounded border border-border bg-background px-2 py-1.5 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleValidate()}
            disabled={busy || !ajvMod}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-[12px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            <ShieldCheck size={12} />
            {busy ? 'Validating…' : 'Validate'}
          </button>
          {result?.schemas && result.schemas.length > 0 && (
            <select
              value={result.selected ?? ''}
              onChange={(e) => handleValidate(e.target.value)}
              className="text-[12px] px-2 py-1 rounded border border-border bg-background"
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
          <p className="text-muted-foreground text-[13px] italic">
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
              <div key={i} className="px-2 py-1.5 bg-red-500/5 border border-red-500/30 rounded text-[13px]">
                <code className="font-mono text-red-600 dark:text-red-400 font-bold">{e.path}</code>
                <span className="ml-2 text-foreground">{e.message}</span>
                <span className="ml-1 text-muted-foreground text-[11px]">({e.keyword})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SchemaTab
