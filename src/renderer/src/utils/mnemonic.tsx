import { Fragment } from 'react'
import { parseMnemonic } from './mnemonicParse'

export { parseMnemonic, stripMnemonic } from './mnemonicParse'
export type { ParsedMnemonic } from './mnemonicParse'

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
