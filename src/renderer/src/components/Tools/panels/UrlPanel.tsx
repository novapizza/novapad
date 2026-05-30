import React, { useMemo, useState } from 'react'
import {
  encodeComponent,
  decodeComponent,
  encodeFullUrl,
  decodeFullUrl,
  parseQueryString
} from '../../../lib/tools/urlEncoder'
import { CopyButton, OutputBlock, SegGroup, ToolSection, ToolTextarea, useCopy } from '../shared'

type Tab = 'component' | 'full' | 'query'
type Dir = 'encode' | 'decode'

export function UrlPanel(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('component')
  const [dir, setDir] = useState<Dir>('encode')
  const [input, setInput] = useState('')
  const { copy, copiedKey } = useCopy()

  const output = useMemo(() => {
    if (tab === 'component') return dir === 'encode' ? encodeComponent(input) : decodeComponent(input)
    if (tab === 'full') return dir === 'encode' ? encodeFullUrl(input) : decodeFullUrl(input)
    return ''
  }, [tab, dir, input])

  const params = useMemo(() => (tab === 'query' ? parseQueryString(input) : []), [tab, input])

  return (
    <div className="space-y-5">
      <ToolSection title="Mode">
        <SegGroup
          options={[
            { id: 'component', label: 'Component', desc: 'encodeURIComponent — encodes all special chars' },
            { id: 'full', label: 'Full URL', desc: 'encodeURI — preserves URL structure' },
            { id: 'query', label: 'Query string', desc: 'Parse a URL or query string into key/value pairs' }
          ]}
          value={tab}
          onChange={setTab}
        />
      </ToolSection>

      {tab !== 'query' && (
        <ToolSection title="Direction">
          <SegGroup
            options={[
              { id: 'encode', label: 'Encode' },
              { id: 'decode', label: 'Decode' }
            ]}
            value={dir}
            onChange={setDir}
          />
        </ToolSection>
      )}

      <ToolSection title="Input">
        <ToolTextarea
          rows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tab === 'query' ? 'https://example.com/?a=1&b=hello%20world' : 'Type or paste text…'}
        />
      </ToolSection>

      {tab !== 'query' ? (
        <ToolSection title="Output" right={<CopyButton value={output} copy={copy} copiedKey={copiedKey} toastLabel="Output" />}>
          <OutputBlock value={output} />
        </ToolSection>
      ) : (
        <ToolSection title={`Parameters — ${params.length}`}>
          {params.length === 0 ? (
            <OutputBlock value="" placeholder="No parameters parsed yet" />
          ) : (
            <div className="overflow-hidden rounded border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Key</th>
                    <th className="px-3 py-2 text-left font-medium">Decoded value</th>
                  </tr>
                </thead>
                <tbody>
                  {params.map((p, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono text-foreground align-top">{p.decodedKey}</td>
                      <td className="px-3 py-1.5 font-mono text-foreground break-all">{p.decodedValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ToolSection>
      )}
    </div>
  )
}
