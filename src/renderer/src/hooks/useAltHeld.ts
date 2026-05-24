import { useEffect, useState } from 'react'
import { isWindows } from '../utils/platform'

type Subscriber = (value: boolean) => void

const subscribers = new Set<Subscriber>()
let altHeld = false
let installed = false

function broadcast(value: boolean) {
  if (altHeld === value) return
  altHeld = value
  for (const sub of subscribers) sub(value)
}

function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') broadcast(true)
    else if (!e.altKey) broadcast(false)
  }, { capture: true })
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' || !e.altKey) broadcast(false)
  }, { capture: true })
  window.addEventListener('blur', () => broadcast(false))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') broadcast(false)
  })
}

export function useAltHeld(): boolean {
  const [held, setHeld] = useState(altHeld)
  useEffect(() => {
    if (!isWindows()) return
    install()
    subscribers.add(setHeld)
    setHeld(altHeld)
    return () => { subscribers.delete(setHeld) }
  }, [])
  return held
}
