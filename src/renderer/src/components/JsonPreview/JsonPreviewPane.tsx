import React, { Suspense, lazy, useEffect, useState } from 'react'
import {
  Braces, X, Wrench, GitCompare, Code2, Unlink, Network, ShieldCheck, Search,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useEditorStore } from '../../store/editorStore'
import { usePreviewFullscreen } from '../preview/previewFullscreen'
import { FormatTab } from './FormatTab'

// Format is the default tab → bundled with the pane shell so the first render
// has no Suspense flash. Every other tab is code-split into its own chunk and
// only fetched when the user clicks that tab. This keeps the initial pane
// payload to ~Format + shell instead of ~all 8 tabs at once.
const RepairTab = lazy(() => import('./RepairTab'))
const DiagramTab = lazy(() => import('./DiagramTab'))
const ExtractTab = lazy(() => import('./ExtractTab'))
const DiffTab = lazy(() => import('./DiffTab'))
const SchemaTab = lazy(() => import('./SchemaTab'))
const TsTab = lazy(() => import('./TsTab'))
const UnescapeTab = lazy(() => import('./UnescapeTab'))

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

function TabFallback() {
  return (
    <div className="flex items-center justify-center h-full text-[13px] text-muted-foreground">
      Loading…
    </div>
  )
}

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

  // Subscribe to whichever buffer is active in the editor store rather than to
  // editorRegistry.get(). For very large files the editor instance may not be
  // registered at pane-mount time (Monaco is still building the model), and
  // the previous approach silently bailed out leaving content empty. The
  // store-driven subscription re-fires whenever the active model swaps in.
  const activeModel = useEditorStore((s) => {
    const buf = s.buffers.find((b) => b.id === s.activeId)
    return buf?.model ?? null
  })

  useEffect(() => {
    if (!activeModel) {
      setContent('')
      return
    }
    setContent(activeModel.getValue())
    const disposer = activeModel.onDidChangeContent(() => setContent(activeModel.getValue()))
    return () => disposer.dispose()
  }, [activeModel])

  return (
    <section className={sectionClass}>
      <header className="px-3 py-2 border-b border-border flex items-center gap-2 bg-secondary/30">
        <Braces size={14} className="text-muted-foreground" />
        <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-semibold transition-colors whitespace-nowrap ' +
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
        {tab !== 'format' && (
          <Suspense fallback={<TabFallback />}>
            {tab === 'repair' && <RepairTab content={content} />}
            {tab === 'diagram' && <DiagramTab content={content} />}
            {tab === 'extract' && <ExtractTab content={content} />}
            {tab === 'diff' && <DiffTab content={content} />}
            {tab === 'schema' && <SchemaTab content={content} />}
            {tab === 'ts' && <TsTab content={content} />}
            {tab === 'unescape' && <UnescapeTab content={content} />}
          </Suspense>
        )}
      </div>
    </section>
  )
}
