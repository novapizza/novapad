import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { generateText, type LoremLanguage } from '../../../lib/tools/loremGenerator'
import { CopyButton, OutputBlock, SegGroup, ToolSection, useCopy } from '../shared'

const LANGS: { id: LoremLanguage; label: string }[] = [
  { id: 'english', label: 'English' },
  { id: 'vietnamese', label: 'Tiếng Việt' },
  { id: 'spanish', label: 'Español' },
  { id: 'french', label: 'Français' },
  { id: 'german', label: 'Deutsch' },
  { id: 'japanese', label: '日本語' },
  { id: 'chinese', label: '中文' }
]

export function LoremPanel(): React.ReactElement {
  const [lang, setLang] = useState<LoremLanguage>('english')
  const [words, setWords] = useState(60)
  const [paragraphs, setParagraphs] = useState(3)
  const [text, setText] = useState('')
  const { copy, copiedKey } = useCopy()

  const generate = (): void => setText(generateText(lang, words, paragraphs))
  useEffect(generate, [lang, words, paragraphs]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <ToolSection title="Language">
        <SegGroup options={LANGS} value={lang} onChange={setLang} />
      </ToolSection>

      <div className="grid grid-cols-2 gap-4">
        <ToolSection title={`Total words — ${words}`}>
          <input
            type="range"
            min={5}
            max={500}
            step={5}
            value={words}
            onChange={(e) => setWords(Number(e.target.value))}
            className="w-full accent-[hsl(var(--primary))]"
          />
        </ToolSection>
        <ToolSection title={`Paragraphs — ${paragraphs}`}>
          <input
            type="range"
            min={1}
            max={20}
            value={paragraphs}
            onChange={(e) => setParagraphs(Number(e.target.value))}
            className="w-full accent-[hsl(var(--primary))]"
          />
        </ToolSection>
      </div>

      <ToolSection
        title="Output"
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={generate}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <RefreshCw size={13} /> Regenerate
            </button>
            <CopyButton value={text} copy={copy} copiedKey={copiedKey} toastLabel="Text" />
          </div>
        }
      >
        <OutputBlock value={text} />
      </ToolSection>
    </div>
  )
}
