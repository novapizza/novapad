import { Fragment } from 'react'

export interface ParsedMnemonic {
  letter: string | null
  before: string
  mark: string
  after: string
}

export function parseMnemonic(label: string): ParsedMnemonic {
  let before = ''
  let i = 0
  while (i < label.length) {
    const ch = label[i]
    if (ch === '&') {
      if (label[i + 1] === '&') {
        before += '&'
        i += 2
        continue
      }
      if (i + 1 < label.length) {
        const mark = label[i + 1]
        const after = label.slice(i + 2).replace(/&&/g, '&')
        return { letter: mark.toUpperCase(), before, mark, after }
      }
    }
    before += ch
    i += 1
  }
  return { letter: null, before, mark: '', after: '' }
}

export function stripMnemonic(label: string): string {
  let out = ''
  for (let i = 0; i < label.length; i++) {
    const ch = label[i]
    if (ch === '&') {
      if (label[i + 1] === '&') { out += '&'; i += 1; continue }
      continue
    }
    out += ch
  }
  return out
}

export function MnemonicLabel({ label, show }: { label: string; show: boolean }) {
  const { before, mark, after } = parseMnemonic(label)
  if (!mark) return <Fragment>{before}</Fragment>
  return (
    <Fragment>
      {before}
      {show ? <u>{mark}</u> : mark}
      {after}
    </Fragment>
  )
}
