import React, { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { QuickPick } from '../QuickPick/QuickPick'
import { GoToLineInput } from '../QuickPick/GoToLineInput'
import {
  ENCODINGS,
  LANGUAGES,
  EOLS,
  getEncodingLabel,
  getLanguageLabel,
  getEOLShort
} from '../../constants/registries'

type ActivePicker = 'encoding' | 'language' | 'eol' | 'goto' | null

export const StatusBar: React.FC = () => {
  const { getActive, activeId } = useEditorStore()
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const buf = getActive()

  useEffect(() => {
    const handler = (e: Event) => {
      const { line, col } = (e as CustomEvent).detail
      setCursor({ line, col })
    }
    window.addEventListener('editor:cursor', handler)
    return () => window.removeEventListener('editor:cursor', handler)
  }, [])

  // Close picker on tab switch (BR-006)
  useEffect(() => {
    setActivePicker(null)
  }, [activeId])

  const openPicker = useCallback(
    (picker: ActivePicker) => {
      if (buf) setActivePicker(picker)
    },
    [buf]
  )

  const handleEncodingSelect = useCallback(
    (value: string) => {
      window.dispatchEvent(new CustomEvent('editor:set-encoding', { detail: value }))
      setActivePicker(null)
    },
    []
  )

  const handleLanguageSelect = useCallback(
    (value: string) => {
      window.dispatchEvent(new CustomEvent('editor:set-language-local', { detail: value }))
      setActivePicker(null)
    },
    []
  )

  const handleEOLSelect = useCallback(
    (value: string) => {
      window.dispatchEvent(new CustomEvent('editor:set-eol', { detail: value }))
      setActivePicker(null)
    },
    []
  )

  const handleGoToLine = useCallback(
    (line: number, column: number) => {
      window.dispatchEvent(new CustomEvent('editor:goto-line', { detail: { line, column } }))
      setActivePicker(null)
    },
    []
  )

  const closePicker = useCallback(() => setActivePicker(null), [])

  const itemClass =
    'cursor-pointer hover:bg-[var(--color-statusbar-foreground)]/10 px-1.5 py-0.5 rounded transition-colors'

  return (
    <div
      className="h-7 bg-statusbar text-statusbar-foreground flex items-center px-2 text-base select-none shrink-0"
      data-testid="statusbar"
    >
      {/* Left section: full file path (or the remote source URL for deeplink tabs) */}
      <span
        data-testid="statusbar-filepath"
        className="flex-1 min-w-0 truncate opacity-80 px-1.5"
        title={buf?.sourceUrl ?? buf?.filePath ?? ''}
      >
        {buf?.sourceUrl ?? buf?.filePath ?? ''}
      </span>

      {/* Right section */}
      <div className="flex items-center gap-1">
        <span
          data-testid="cursor-position"
          className={itemClass}
          onClick={() => openPicker('goto')}
          title="Go to Line:Column"
        >
          Ln {cursor.line}, Col {cursor.col}
        </span>

        <span
          className={itemClass}
          onClick={() => openPicker('eol')}
          title="Select End of Line Sequence"
          data-testid="statusbar-eol"
        >
          {getEOLShort(buf?.eol ?? 'LF')}
        </span>

        <span
          className={itemClass}
          onClick={() => openPicker('encoding')}
          title="Select Encoding"
          data-testid="statusbar-encoding"
        >
          {getEncodingLabel(buf?.encoding ?? 'UTF-8')}
        </span>

        <span
          className={itemClass}
          onClick={() => openPicker('language')}
          title="Select Language Mode"
          data-testid="statusbar-language"
        >
          {getLanguageLabel(buf?.language ?? 'plaintext')}
        </span>

        <span className="opacity-70 px-1.5" data-testid="statusbar-state">
          {buf?.isReadOnly ? 'Read-only' : buf?.isDirty ? 'Modified' : buf?.filePath ? 'Saved' : 'New File'}
        </span>
      </div>

      {/* Quick Pick overlays */}
      {activePicker === 'encoding' && (
        <QuickPick
          items={ENCODINGS}
          activeValue={buf?.encoding ?? null}
          placeholder="Select Encoding"
          onSelect={handleEncodingSelect}
          onClose={closePicker}
        />
      )}

      {activePicker === 'language' && (
        <QuickPick
          items={LANGUAGES}
          activeValue={buf?.language ?? null}
          placeholder="Select Language Mode"
          onSelect={handleLanguageSelect}
          onClose={closePicker}
        />
      )}

      {activePicker === 'eol' && (
        <QuickPick
          items={EOLS}
          activeValue={buf?.eol ?? null}
          placeholder="Select End of Line Sequence"
          onSelect={handleEOLSelect}
          onClose={closePicker}
        />
      )}

      {activePicker === 'goto' && (
        <GoToLineInput
          currentLine={cursor.line}
          currentCol={cursor.col}
          onGo={handleGoToLine}
          onClose={closePicker}
        />
      )}
    </div>
  )
}
