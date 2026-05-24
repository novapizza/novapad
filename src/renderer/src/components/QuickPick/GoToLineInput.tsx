import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAltHeld } from '../../hooks/useAltHeld'
import { useAltMnemonics } from '../../hooks/useAltMnemonics'
import { MnemonicLabel } from '../../utils/mnemonic'
import { isWindows } from '../../utils/platform'

interface GoToLineInputProps {
  currentLine: number
  currentCol: number
  onGo: (line: number, column: number) => void
  onClose: () => void
}

export const GoToLineInput: React.FC<GoToLineInputProps> = ({
  currentLine,
  currentCol,
  onGo,
  onClose
}) => {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const altHeld = useAltHeld()

  useAltMnemonics(
    isWindows(),
    { L: () => inputRef.current?.focus() },
    { allowInsideInputs: true, priority: true },
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const dismiss = useCallback(
    (action?: () => void) => {
      action?.()
      onClose()
    },
    [onClose]
  )

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) {
      dismiss()
      return
    }
    // Support "line" or "line:column" format
    const parts = trimmed.split(':')
    const line = parseInt(parts[0], 10)
    const col = parts[1] ? parseInt(parts[1], 10) : 1
    if (isNaN(line) || line < 1) {
      dismiss()
      return
    }
    dismiss(() => onGo(line, isNaN(col) || col < 1 ? 1 : col))
  }, [value, onGo, dismiss])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        dismiss()
      }
    },
    [handleSubmit, dismiss]
  )

  return (
    <>
      <div
        className="fixed top-0 left-0 right-0 bottom-6 z-[9000] bg-black/30"
        onClick={() => dismiss()}
        data-testid="gotoline-backdrop"
      />
      <div
        className="fixed z-[9001] left-1/2 -translate-x-1/2 top-[60px] w-[min(400px,90vw)] bg-popover border border-border rounded-lg shadow-2xl flex flex-col"
        data-testid="gotoline"
      >
        <div className="p-2 flex items-center gap-2">
          <label htmlFor="gotoline-input" className="text-base text-muted-foreground shrink-0">
            <MnemonicLabel label="&Line:" show={altHeld} />
          </label>
          <input
            id="gotoline-input"
            ref={inputRef}
            type="text"
            className="flex-1 bg-input border border-border rounded px-2 py-1 text-base text-popover-foreground outline-none focus:ring-1 focus:ring-ring"
            placeholder={`Go to Line:Column (current ${currentLine}:${currentCol})`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            data-testid="gotoline-input"
          />
        </div>
        <div className="px-3 pb-2 text-sm text-muted-foreground">
          Type a line number or line:column to go to
        </div>
      </div>
    </>
  )
}
