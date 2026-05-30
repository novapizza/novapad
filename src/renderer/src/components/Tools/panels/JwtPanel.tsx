import React, { useMemo, useState } from 'react'
import { decodeJwt, getTokenStatus, buildAnnotatedPayload, KNOWN_CLAIMS } from '../../../lib/tools/jwtDecoder'
import { CopyButton, ToolSection, ToolTextarea, useCopy } from '../shared'

const SAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

export function JwtPanel(): React.ReactElement {
  const [token, setToken] = useState('')
  const { copy, copiedKey } = useCopy()

  const decoded = useMemo(() => {
    const t = token.trim()
    if (!t) return { error: null as string | null, header: '', payload: '', signature: '', status: null as ReturnType<typeof getTokenStatus> }
    try {
      const d = decodeJwt(t)
      return {
        error: null,
        header: JSON.stringify(d.header, null, 2),
        payload: buildAnnotatedPayload(d.payload),
        signature: d.signature,
        status: getTokenStatus(d.payload)
      }
    } catch (e) {
      return { error: (e as Error).message, header: '', payload: '', signature: '', status: null }
    }
  }, [token])

  return (
    <div className="space-y-5">
      <ToolSection
        title="Token"
        right={
          <button
            type="button"
            onClick={() => setToken(SAMPLE)}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            Load sample
          </button>
        }
      >
        <ToolTextarea rows={4} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste a JWT (header.payload.signature)…" />
      </ToolSection>

      {decoded.error && <p className="text-sm text-destructive">{decoded.error}</p>}

      {!decoded.error && decoded.header && (
        <>
          {decoded.status && (
            <span
              className={`inline-block rounded px-2 py-1 text-xs font-semibold ${
                decoded.status.expired ? 'bg-destructive/15 text-destructive' : 'bg-green-500/15 text-green-600 dark:text-green-400'
              }`}
            >
              {decoded.status.label}
            </span>
          )}

          <ToolSection title="Header" right={<CopyButton value={decoded.header} copy={copy} copiedKey={copiedKey} toastLabel="Header" />}>
            <pre className="max-h-48 overflow-auto rounded border border-border bg-muted/40 p-3 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
              {decoded.header}
            </pre>
          </ToolSection>

          <ToolSection
            title="Payload"
            right={<CopyButton value={decoded.payload} copy={copy} copiedKey={copiedKey} toastLabel="Payload" />}
          >
            <pre className="max-h-72 overflow-auto rounded border border-border bg-muted/40 p-3 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
              {decoded.payload}
            </pre>
            <p className="text-xs text-muted-foreground">
              Standard claims: {Object.entries(KNOWN_CLAIMS).map(([k, v]) => `${k} (${v})`).join(', ')}
            </p>
          </ToolSection>

          <ToolSection title="Signature" right={<CopyButton value={decoded.signature} copy={copy} copiedKey={copiedKey} toastLabel="Signature" />}>
            <code className="block break-all rounded border border-border bg-muted/40 p-3 text-xs font-mono text-muted-foreground">
              {decoded.signature}
            </code>
            <p className="text-xs text-muted-foreground">Signature is not verified — this tool only decodes.</p>
          </ToolSection>
        </>
      )}
    </div>
  )
}
