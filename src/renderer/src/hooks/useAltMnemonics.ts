import { useEffect, useRef } from 'react'
import { isWindows } from '../utils/platform'

export type MnemonicHandlers = Record<string, () => void>

interface Options {
  scope?: HTMLElement | Document | Window | null
  allowInsideInputs?: boolean
  requireAlt?: boolean
  /**
   * When true, registering this scope suppresses any non-priority scope's
   * handler while it is mounted (used for modal dialogs so they take Alt
   * away from the persistent menu bar).
   */
  priority?: boolean
}

let priorityCount = 0
function changePriority(delta: number) { priorityCount = Math.max(0, priorityCount + delta) }

function isTextInput(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const t = (el as HTMLInputElement).type
    return t === 'text' || t === 'search' || t === 'email' || t === 'password' ||
      t === 'tel' || t === 'url' || t === 'number' || t === '' || t == null
  }
  if (el.isContentEditable) return true
  if (el.classList.contains('monaco-editor')) return true
  return false
}

export function useAltMnemonics(
  enabled: boolean,
  handlers: MnemonicHandlers,
  options: Options = {},
): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const priority = options.priority ?? false

  useEffect(() => {
    if (!enabled || !isWindows()) return
    if (priority) changePriority(+1)
    return () => { if (priority) changePriority(-1) }
  }, [enabled, priority])

  useEffect(() => {
    if (!enabled || !isWindows()) return
    const requireAlt = options.requireAlt ?? true
    const allowInsideInputs = options.allowInsideInputs ?? false
    const scope: HTMLElement | Document | Window =
      (options.scope as HTMLElement | Document | Window | null) || window

    const onKeyDown = (e: Event) => {
      const ke = e as KeyboardEvent
      if (!priority && priorityCount > 0) return
      if (requireAlt) {
        if (!ke.altKey || ke.ctrlKey || ke.metaKey) return
      } else {
        if (ke.ctrlKey || ke.metaKey || ke.altKey) return
      }
      const key = ke.key
      if (!key || key.length !== 1) return
      const upper = key.toUpperCase()
      const handler = handlersRef.current[upper]
      if (!handler) return
      if (!requireAlt && !allowInsideInputs && isTextInput(ke.target)) return
      ke.preventDefault()
      ke.stopPropagation()
      handler()
    }

    ;(scope as EventTarget).addEventListener('keydown', onKeyDown, true)
    return () => {
      ;(scope as EventTarget).removeEventListener('keydown', onKeyDown, true)
    }
  }, [enabled, options.scope, options.requireAlt, options.allowInsideInputs, priority])
}
