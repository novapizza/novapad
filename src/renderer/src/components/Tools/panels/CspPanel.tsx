import React, { useMemo, useState } from 'react'
import { evaluateCsp, severityLabel, Severity, DIRECTIVE_DESCRIPTIONS, type Finding } from '../../../lib/tools/cspEvaluator'
import { ToolSection, ToolTextarea } from '../shared'

const SAMPLE = "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.example.com; object-src 'none'"

function severityClasses(s: Severity): string {
  if (s <= Severity.HIGH) return 'bg-destructive/15 text-destructive border-destructive/30'
  if (s <= Severity.SYNTAX) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
  if (s <= Severity.HIGH_MAYBE) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
  if (s <= Severity.STRICT_CSP) return 'bg-primary/15 text-primary border-primary/30'
  if (s <= Severity.MEDIUM_MAYBE) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
  return 'bg-secondary text-muted-foreground border-border'
}

export function CspPanel(): React.ReactElement {
  const [input, setInput] = useState('')

  const result = useMemo(() => {
    if (!input.trim()) return null
    try {
      return evaluateCsp(input)
    } catch {
      return null
    }
  }, [input])

  const findings: Finding[] = result?.findings ?? []
  const highCount = findings.filter((f) => f.severity <= Severity.HIGH).length
  const directives = result ? Object.entries(result.csp.directives) : []

  return (
    <div className="space-y-5">
      <ToolSection
        title="Content-Security-Policy"
        right={
          <button
            type="button"
            onClick={() => setInput(SAMPLE)}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            Load sample
          </button>
        }
      >
        <ToolTextarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste a CSP header value…" />
      </ToolSection>

      {result && (
        <>
          <div className="flex items-center gap-3">
            <span
              className={`rounded px-2 py-1 text-sm font-semibold ${
                highCount > 0 ? 'bg-destructive/15 text-destructive' : findings.length > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-green-500/15 text-green-600 dark:text-green-400'
              }`}
            >
              {highCount > 0 ? `${highCount} high-severity issue${highCount !== 1 ? 's' : ''}` : findings.length > 0 ? 'Minor issues' : 'No issues found'}
            </span>
            <span className="text-sm text-muted-foreground">{findings.length} finding{findings.length !== 1 ? 's' : ''} total</span>
          </div>

          <ToolSection title="Findings">
            {findings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No security findings.</p>
            ) : (
              <div className="space-y-2">
                {findings.map((f, i) => (
                  <div key={i} className={`rounded border p-3 ${severityClasses(f.severity)}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider">{severityLabel(f.severity)}</span>
                      <code className="font-mono text-xs">{f.directive}</code>
                      {f.value && <code className="font-mono text-xs opacity-80">{f.value}</code>}
                    </div>
                    <p className="mt-1 text-sm text-foreground">{f.description}</p>
                  </div>
                ))}
              </div>
            )}
          </ToolSection>

          <ToolSection title="Parsed directives">
            <div className="overflow-hidden rounded border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {directives.map(([name, values]) => (
                    <tr key={name} className="border-b border-border last:border-0 align-top">
                      <td className="px-3 py-2 font-mono text-foreground">
                        {name}
                        {DIRECTIVE_DESCRIPTIONS[name] && (
                          <div className="text-xs font-sans text-muted-foreground">{DIRECTIVE_DESCRIPTIONS[name]}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground break-all">{(values ?? []).join(' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ToolSection>
        </>
      )}
    </div>
  )
}
