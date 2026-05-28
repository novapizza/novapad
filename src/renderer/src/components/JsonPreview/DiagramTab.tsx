import React, { Suspense, lazy, startTransition, useEffect, useState } from 'react'
import { ErrorRow } from './shared'

const JsonDiagram = lazy(() => import('./JsonDiagram'))

export function DiagramTab({ content }: { content: string }) {
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
      <div className="flex items-center justify-center h-full text-[13px] text-muted-foreground">
        Buffer is empty — paste JSON to render diagram.
      </div>
    )
  }
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full text-[13px] text-muted-foreground">
          Loading diagram…
        </div>
      }
    >
      <JsonDiagram data={parsed} />
    </Suspense>
  )
}

export default DiagramTab
