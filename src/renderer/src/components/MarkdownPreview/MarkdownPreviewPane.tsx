import React, { useEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Eye, X } from 'lucide-react'
import {
  DiagramRenderer,
  bootstrapDiagramRenderers,
  watchDarkMode,
  type RendererHandle,
} from 'merslim'
import { editorRegistry } from '../../utils/editorRegistry'
import { useUIStore } from '../../store/uiStore'
import { usePreviewFullscreen } from '../preview/previewFullscreen'

// Highlight.js stylesheet — dynamically swapped between light/dark via the
// effect below so code blocks match the rest of the editor theme.
import 'highlight.js/styles/github.css'

// ── Mermaid block: ported from exifmaster-pro's MarkdownPreview, trimmed to
//    the essentials (no zoom modal / export toolbar for v1). merslim's
//    <DiagramRenderer/> handles parsing + rendering; we just remount it when
//    dark mode flips so the palette updates.
const MermaidBlock = React.memo(function MermaidBlock({ code }: { code: string }) {
  const [error, setError] = useState('')
  const [themeNonce, setThemeNonce] = useState(0)
  const handleRef = useRef<RendererHandle | null>(null)
  useEffect(() => watchDarkMode(() => setThemeNonce((n) => n + 1)), [])

  if (error) {
    return (
      <div className="my-3 p-2 bg-destructive/10 border border-destructive/30 rounded text-destructive text-xs font-mono">
        Diagram error: {error}
      </div>
    )
  }
  return (
    <div className="my-3 flex justify-center overflow-x-auto rounded p-2">
      <React.Fragment key={themeNonce}>
        <DiagramRenderer source={code} handleRef={handleRef} onError={(msg) => setError(msg)} />
      </React.Fragment>
    </div>
  )
})

// Stable components prop — referential equality matters here to avoid
// remounting every MermaidBlock on each keystroke.
const MARKDOWN_COMPONENTS = {
  code({ className, children }: { className?: string; children?: React.ReactNode }) {
    const lang = /language-(\w+)/.exec(className || '')?.[1]
    const code = String(children).replace(/\n$/, '')
    if (lang === 'mermaid') return <MermaidBlock code={code} />
    return <code className={className}>{children}</code>
  },
}
const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS: [typeof rehypeHighlight, { detect: boolean; ignoreMissing: boolean }][] = [
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
]

/**
 * Live Markdown preview pane. Subscribes to Monaco's active model so the
 * preview tracks every keystroke; re-binds when the user switches tabs.
 */
export const MarkdownPreviewPane: React.FC = () => {
  const [content, setContent] = useState('')
  const setMarkdownPreview = useUIStore((s) => s.setMarkdownPreview)
  const { sectionClass, Toggle: FullscreenToggle } = usePreviewFullscreen()

  useEffect(() => {
    bootstrapDiagramRenderers()
  }, [])

  // Read the editor's current model + watch content changes. Re-runs when the
  // editor instance changes (rare) or when the active model changes (every
  // tab switch). monaco emits onDidChangeModelContent on the model, not the
  // editor, so we also have to re-subscribe whenever the model changes.
  useEffect(() => {
    const editor = editorRegistry.get()
    if (!editor) return

    let modelDisposer: monaco.IDisposable | null = null
    const attach = (model: monaco.editor.ITextModel | null) => {
      modelDisposer?.dispose()
      modelDisposer = null
      if (!model) { setContent(''); return }
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
        <Eye size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Markdown Preview
        </span>
        <div className="ml-auto flex items-center gap-1">
          {FullscreenToggle}
          <button
            onClick={() => setMarkdownPreview(false)}
            aria-label="Close preview"
            title="Close preview (Ctrl+Alt+Shift+M)"
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-4 markdown-body">
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          components={MARKDOWN_COMPONENTS}
        >
          {content}
        </ReactMarkdown>
      </div>
    </section>
  )
}
