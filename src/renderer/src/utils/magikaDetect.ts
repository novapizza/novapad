// Renderer-side Magika detection. Runs in the browser context where TF.js uses
// the WebGL backend → GPU-accelerated, orders of magnitude faster than Magika
// in the Electron main process (which falls back to CPU tfjs).

import { Magika } from 'magika'

type MagikaLike = { identifyBytes: (bytes: Uint8Array) => Promise<{ prediction: { output: { label: string } } }> }

let magikaInstance: MagikaLike | null = null
let magikaInitPromise: Promise<MagikaLike> | null = null

async function getMagika(): Promise<MagikaLike> {
  if (magikaInstance) return magikaInstance
  if (!magikaInitPromise) {
    magikaInitPromise = (async () => {
      const m = (await (Magika as unknown as { create: () => Promise<MagikaLike> }).create()) as MagikaLike
      magikaInstance = m
      return m
    })()
  }
  return magikaInitPromise
}

// Magika content-type labels → Monaco language IDs.
const MAGIKA_TO_MONACO: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  csharp: 'csharp',
  cpp: 'cpp',
  c: 'c',
  go: 'go',
  rust: 'rust',
  ruby: 'ruby',
  php: 'php',
  swift: 'swift',
  kotlin: 'kotlin',
  scala: 'scala',
  dart: 'dart',
  lua: 'lua',
  perl: 'perl',
  r: 'r',
  shell: 'shell',
  bash: 'shell',
  zsh: 'shell',
  powershell: 'powershell',
  batch: 'bat',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  markdown: 'markdown',
  latex: 'latex',
  ini: 'ini',
  toml: 'ini',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  txt: 'plaintext',
  csv: 'plaintext',
  tsv: 'plaintext',
  log: 'log',
  rtf: 'plaintext',
  asciidoc: 'plaintext',
}

/**
 * Run Magika on a byte sample and return the Monaco language ID if the
 * detected content type maps to one we support. Returns null otherwise so
 * the caller can keep its existing (extension-based) language.
 */
export async function detectLanguageFromBytes(sample: Uint8Array): Promise<string | null> {
  if (!sample || sample.byteLength === 0) {
    console.log('[magikaDetect] empty sample, skipping')
    return null
  }
  try {
    const magika = await getMagika()
    const result = await magika.identifyBytes(sample)
    const label = result?.prediction?.output?.label?.toLowerCase()
    const mapped = label ? MAGIKA_TO_MONACO[label] : undefined
    console.log('[magikaDetect] label:', label, '→ monaco:', mapped ?? '(unmapped)', 'sampleLen:', sample.byteLength)
    if (mapped) return mapped
  } catch (err) {
    console.warn('[magikaDetect] failed:', err)
  }
  return null
}
