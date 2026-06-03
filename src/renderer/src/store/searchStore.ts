import { create } from 'zustand'

export type SearchMode = 'normal' | 'extended' | 'regex'

export interface SearchOptions {
  pattern: string
  replaceText: string
  searchMode: SearchMode
  isCaseSensitive: boolean
  isWholeWord: boolean
  isWrapAround: boolean
  searchBackward: boolean
  inSelection: boolean
  dotMatchesNewline: boolean
}

export interface FindResultLine {
  lineNumber: number   // 1-based
  column: number       // 1-based
  endColumn: number    // 1-based
  lineText: string
  matchText: string
}

export interface FindResultFile {
  filePath: string | null
  title: string
  bufferId?: string    // set for open docs
  results: FindResultLine[]
}

export interface FindResultSet {
  query: string
  scope: string        // 'currentDoc' | 'allOpenDocs' | 'directory:...'
  totalHits: number
  files: FindResultFile[]
  /** End-to-end time for directory search (Find in Files), ms */
  searchDurationMs?: number
  searchEngineLabel?: string
}

export interface SearchProgress {
  scanned: number
}

const MAX_HISTORY = 20

interface SearchState {
  options: SearchOptions
  patternHistory: string[]
  replaceHistory: string[]
  findResults: FindResultSet | null
  /** Bumped whenever a NEW result set begins (setFindResults / initSearch) — not on streaming appends or dismissals. */
  findResultsNonce: number
  markStyleIndex: number
  isSearching: boolean
  searchProgress: SearchProgress | null
  currentSearchId: string | null

  setOptions: (patch: Partial<SearchOptions>) => void
  pushPatternHistory: (p: string) => void
  pushReplaceHistory: (p: string) => void
  setFindResults: (r: FindResultSet | null) => void
  setMarkStyleIndex: (i: number) => void
  setIsSearching: (v: boolean) => void
  setSearchProgress: (p: SearchProgress | null) => void
  setCurrentSearchId: (id: string | null) => void
  /** Reset results to empty state and set isSearching=true before a streaming search */
  initSearch: (query: string, scope: string) => void
  /** Append a single file result (used during streaming) */
  appendFindResultFile: (file: FindResultFile) => void
  /** Append multiple file results in one update (batch flush) */
  appendFindResultFiles: (files: FindResultFile[]) => void
  /** Remove one file's results (panel "Dismiss" action) */
  removeFindResultFile: (fileIndex: number) => void
}

export const useSearchStore = create<SearchState>((set) => ({
  options: {
    pattern: '',
    replaceText: '',
    searchMode: 'normal',
    isCaseSensitive: false,
    isWholeWord: false,
    isWrapAround: true,
    searchBackward: false,
    inSelection: false,
    dotMatchesNewline: false
  },
  patternHistory: [],
  replaceHistory: [],
  findResults: null,
  findResultsNonce: 0,
  markStyleIndex: 0,
  isSearching: false,
  searchProgress: null,
  currentSearchId: null,

  setOptions: (patch) =>
    set((s) => ({ options: { ...s.options, ...patch } })),

  pushPatternHistory: (p) =>
    set((s) => ({
      patternHistory: [p, ...s.patternHistory.filter((x) => x !== p)].slice(0, MAX_HISTORY)
    })),

  pushReplaceHistory: (p) =>
    set((s) => ({
      replaceHistory: [p, ...s.replaceHistory.filter((x) => x !== p)].slice(0, MAX_HISTORY)
    })),

  setFindResults: (r) => set((s) => ({ findResults: r, findResultsNonce: s.findResultsNonce + 1 })),
  setMarkStyleIndex: (i) => set({ markStyleIndex: i }),
  setIsSearching: (v) => set({ isSearching: v }),
  setSearchProgress: (p) => set({ searchProgress: p }),
  setCurrentSearchId: (id) => set({ currentSearchId: id }),

  initSearch: (query, scope) =>
    set((s) => ({
      findResults: { query, scope, totalHits: 0, files: [] },
      findResultsNonce: s.findResultsNonce + 1,
      isSearching: true,
      searchProgress: { scanned: 0 }
    })),

  appendFindResultFile: (file) =>
    set((s) => {
      if (!s.findResults) return s
      return {
        findResults: {
          ...s.findResults,
          totalHits: s.findResults.totalHits + file.results.length,
          files: [...s.findResults.files, file]
        }
      }
    }),

  appendFindResultFiles: (files) =>
    set((s) => {
      if (!s.findResults || files.length === 0) return s
      const addedHits = files.reduce((sum, f) => sum + f.results.length, 0)
      return {
        findResults: {
          ...s.findResults,
          totalHits: s.findResults.totalHits + addedHits,
          files: [...s.findResults.files, ...files]
        }
      }
    }),

  removeFindResultFile: (fileIndex) =>
    set((s) => {
      const removed = s.findResults?.files[fileIndex]
      if (!s.findResults || !removed) return s
      return {
        findResults: {
          ...s.findResults,
          totalHits: s.findResults.totalHits - removed.results.length,
          files: s.findResults.files.filter((_, i) => i !== fileIndex)
        }
      }
    })
})
)
