import React, { useEffect, useMemo, useState } from 'react'
import * as monaco from 'monaco-editor'
import { Database, AlertTriangle, X } from 'lucide-react'
import { editorRegistry } from '../../utils/editorRegistry'
import { useUIStore } from '../../store/uiStore'
import { detectDialect, analyzePlan } from '../../lib/plan/ExecutionPlanRouter'
import type { SupportedDialect } from '../../lib/plan/IExecutionPlanAnalyzer'
import type { PlanSummary } from '../../lib/plan/types'
import { PlanTreeRenderer } from './PlanTreeRenderer'
import { usePreviewFullscreen } from '../preview/previewFullscreen'

/**
 * Right-side preview pane for SQL execution plans (.sqlplan or XML with
 * ShowPlanXML content). Modern tree view only — ported from exifmaster-pro
 * minus the AI / classic SSMS view paths.
 */
export const SqlPlanPreviewPane: React.FC = () => {
  const setShowPreview = useUIStore((s) => s.setShowPreview)
  const { sectionClass, Toggle: FullscreenToggle } = usePreviewFullscreen()
  const [xml, setXml] = useState('')
  const [detectedDialect, setDetectedDialect] = useState<SupportedDialect | null>(null)

  // Live-subscribe to the active model so the plan re-parses as the user edits.
  useEffect(() => {
    const editor = editorRegistry.get()
    if (!editor) return

    let modelDisposer: monaco.IDisposable | null = null
    const attach = (model: monaco.editor.ITextModel | null) => {
      modelDisposer?.dispose()
      modelDisposer = null
      if (!model) { setXml(''); return }
      setXml(model.getValue())
      modelDisposer = model.onDidChangeContent(() => setXml(model.getValue()))
    }
    attach(editor.getModel())
    const modelChange = editor.onDidChangeModel(() => attach(editor.getModel()))
    return () => {
      modelChange.dispose()
      modelDisposer?.dispose()
    }
  }, [])

  // Detect dialect + parse on every text change. Memoize so we don't re-run
  // the analyzer for non-content state updates.
  const { summary, error } = useMemo<{ summary: PlanSummary | null; error: string | null }>(() => {
    if (!xml.trim()) return { summary: null, error: null }
    try {
      const dialect = detectDialect(xml)
      setDetectedDialect(dialect)
      if (!dialect) return { summary: null, error: 'Unrecognized execution plan format. Supported: SQL Server (.sqlplan / ShowPlanXML), MySQL JSON EXPLAIN, PostgreSQL EXPLAIN JSON.' }
      const s = analyzePlan(xml, dialect)
      return { summary: s, error: null }
    } catch (err) {
      return { summary: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [xml])

  return (
    <section className={sectionClass}>
      <header className="px-3 py-2 border-b border-border flex items-center gap-2 bg-secondary/30">
        <Database size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          SQL Plan Preview
        </span>
        {detectedDialect && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary uppercase tracking-wider">
            {detectedDialect === 'sqlserver' ? 'SQL Server' : detectedDialect === 'mysql' ? 'MySQL' : 'PostgreSQL'}
          </span>
        )}
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

      <div className="flex-1 overflow-auto p-3">
        {!xml.trim() && (
          <div className="text-xs text-muted-foreground italic">Empty plan — paste or open an .sqlplan / EXPLAIN JSON file.</div>
        )}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-xs">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {summary && (
          <>
            {/* Summary chips */}
            <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                {summary.totalNodes} nodes
              </span>
              <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                cost {summary.totalCost.toFixed(2)}
              </span>
              {summary.redFlags.length > 0 && (
                <span className="px-2 py-0.5 rounded bg-destructive/15 text-destructive">
                  {summary.redFlags.length} red flag{summary.redFlags.length !== 1 ? 's' : ''}
                </span>
              )}
              {summary.missingIndexes.length > 0 && (
                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  {summary.missingIndexes.length} missing index{summary.missingIndexes.length !== 1 ? 'es' : ''}
                </span>
              )}
            </div>

            {/* Multi-statement plans (batches): render each statement as its
                own section with its own tree + red flags. Falls back to the
                single-tree path when only one statement was parsed. */}
            {summary.statements && summary.statements.length > 1 ? (
              summary.statements.map((stmt, i) => (
                <section key={i} className="mb-4 border border-border rounded-md overflow-hidden">
                  <header className="px-2 py-1 bg-secondary/40 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                    <span>Statement {i + 1} of {summary.statements.length}</span>
                    <span className="px-1.5 py-0 rounded bg-background">{stmt.totalNodes} nodes</span>
                    <span className="px-1.5 py-0 rounded bg-background">cost {stmt.totalCost.toFixed(2)}</span>
                    {stmt.redFlags.length > 0 && (
                      <span className="px-1.5 py-0 rounded bg-destructive/15 text-destructive">
                        {stmt.redFlags.length} flag{stmt.redFlags.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </header>
                  {stmt.statementText && (
                    <pre className="px-2 py-1 text-[10px] font-mono text-muted-foreground border-b border-border bg-card whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                      {stmt.statementText}
                    </pre>
                  )}
                  {stmt.redFlags.length > 0 && (
                    <ul className="px-2 py-1 space-y-1 text-[11px] border-b border-border">
                      {stmt.redFlags.map((f, j) => (
                        <li
                          key={j}
                          className={`flex items-start gap-2 p-1.5 rounded border ${
                            f.severity === 'high'
                              ? 'border-destructive/40 bg-destructive/5 text-destructive'
                              : f.severity === 'medium'
                                ? 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                                : 'border-border bg-secondary/40 text-muted-foreground'
                          }`}
                        >
                          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                          <span><strong>{f.type}:</strong> {f.description}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {stmt.planTree && (
                    <div className="p-2 bg-card overflow-x-auto">
                      <PlanTreeRenderer root={stmt.planTree} redFlags={stmt.redFlags} />
                    </div>
                  )}
                </section>
              ))
            ) : (
              <>
                {summary.redFlags.length > 0 && (
                  <ul className="mb-3 space-y-1 text-[11px]">
                    {summary.redFlags.map((f, i) => (
                      <li
                        key={i}
                        className={`flex items-start gap-2 p-2 rounded border ${
                          f.severity === 'high'
                            ? 'border-destructive/40 bg-destructive/5 text-destructive'
                            : f.severity === 'medium'
                              ? 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                              : 'border-border bg-secondary/40 text-muted-foreground'
                        }`}
                      >
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span><strong>{f.type}:</strong> {f.description}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {summary.planTree && (
                  <div className="border border-border rounded-md p-2 bg-card overflow-x-auto">
                    <PlanTreeRenderer root={summary.planTree} redFlags={summary.redFlags} />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
