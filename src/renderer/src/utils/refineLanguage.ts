import * as monaco from 'monaco-editor'
import { useEditorStore } from '../store/editorStore'
import { detectLanguageFromBytes } from './magikaDetect'

/**
 * Run Magika in the background on a byte sample and update the buffer's
 * language if a better one is detected. Used on file load, on save, and on
 * paste so syntax highlighting tracks the actual content.
 */
export async function refineLanguageAsync(
  bufferId: string,
  sample: Uint8Array,
  extensionLanguage: string
): Promise<void> {
  if (!sample || sample.byteLength === 0) return
  // The extension already resolved to our dedicated log/trace highlighter —
  // don't let Magika's content guess (which mistakes log lines for `ini`)
  // override it. This was the original bug: same-format logs flickered between
  // `ini` and `plaintext` depending on Magika's per-file confidence.
  if (extensionLanguage === 'log') return
  const detected = await detectLanguageFromBytes(sample)
  if (!detected || detected === extensionLanguage) return
  // Extension is authoritative — don't let a content guess of "plain text"
  // (Magika routinely labels markdown / csv / config files as `txt`) erase a
  // real language the file extension already resolved.
  if (detected === 'plaintext' && extensionLanguage !== 'plaintext') return
  const store = useEditorStore.getState()
  const buf = store.getBuffer(bufferId)
  if (!buf || buf.language === detected) return
  store.updateBuffer(bufferId, { language: detected })
  if (buf.model) monaco.editor.setModelLanguage(buf.model, detected)
}

/** Encode a UTF-8 sample (capped at 16KB) from a string. */
export function sampleFromString(s: string): Uint8Array {
  const enc = new TextEncoder()
  // Slicing the string before encoding keeps us under 16KB even for ASCII;
  // for multibyte content the sample may be slightly smaller than 16KB which
  // is fine — Magika only needs ~few KB to identify content.
  return enc.encode(s.slice(0, 16384))
}
