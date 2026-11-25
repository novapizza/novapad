import { describe, it, expect } from 'vitest'
import { isBinaryFileName, isExcludedDirName } from '../../src/shared/indexExclude'

describe('isBinaryFileName', () => {
  it('flags binary extensions, case-insensitively', () => {
    for (const n of ['logo.png', 'photo.JPG', 'lib.o', 'crate.rlib', 'app.exe', 'x.dll', 'a.zip', 'f.woff2', 'v.mp4', 'd.sqlite', 'm.wasm', 'app.asar', 'doc.pdf', 'b.bc', 'c.rmeta']) {
      expect(isBinaryFileName(n), n).toBe(true)
    }
  })

  it('keeps text files, dotfiles and extension-less files', () => {
    for (const n of ['main.ts', 'README.md', 'data.json', 'Makefile', 'LICENSE', 'Dockerfile', '.env', 'notes.txt', 'query.sql', 'icon.svg', 'deps.d']) {
      expect(isBinaryFileName(n), n).toBe(false)
    }
  })
})

describe('isExcludedDirName', () => {
  it('skips build and cache output folders', () => {
    for (const n of ['node_modules', 'out', 'dist', 'target', 'obj', '__pycache__', 'test-results', 'playwright-report', 'coverage']) {
      expect(isExcludedDirName(n), n).toBe(true)
    }
  })

  it('keeps source-ish folders that are often hand-written', () => {
    for (const n of ['src', 'build', 'bin', 'docs', 'Output', 'scripts']) {
      expect(isExcludedDirName(n), n).toBe(false)
    }
  })
})
