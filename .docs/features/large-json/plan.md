# Implementation Plan: Large JSON record viewer

**Feature:** large-json
**Date:** 2026-09-05
**Decisions:** [raw/notes.md](./raw/notes.md)

## Goal

Open, browse, search, extract from, edit and save JSON / NDJSON files up to ~1 GB without ever
holding the file as a string. Files below the threshold keep the current Monaco path unchanged.
Non-JSON files above a hard cap get a clear error instead of the V8 string-length crash.

## Routing (the guard)

`routeFileOpen(filePath, sizeBytes)` in `src/renderer/src/utils/largeFileRouting.ts`:

| Condition | Route |
|---|---|
| ext ∈ {json, ndjson, jsonl} and size ≥ 50 MB | `largeJson` |
| size > 256 MB | `tooLarge` → toast with size + limit + hint |
| otherwise | `normal` (existing code, untouched) |

Applied in `useFileOps.openFiles` and `useFileOps.loadBuffer` (session-restore ghosts) right
after the `stat` call that already runs there.

## Architecture

```
renderer                         main                      worker (one per open doc)
─────────                        ────                      ───────────────────────
LargeJsonTab  ──invoke──▶ largeJsonHandlers ──postMessage──▶ largeJsonWorker
  ├ RecordList (virtual)   (docId → Worker map)             ├ tokenizer: depth-1 record bounds
  ├ RecordTree (JsonTreeNode)   forwards progress/           ├ adaptive sparse index (Float64Array)
  ├ RecordEditor (Monaco)        chunks as events            ├ getRecords(start,count) → raw text[]
  ├ Extract tab                                              ├ search(query) → indices (streamed)
  └ Save / Save As                                           ├ extract(path) → values (streamed)
largeJsonStore (overlay, undo)                               └ save(overlay, target) → temp+rename
```

**Index.** The tokenizer tracks `inString`, `escape`, `depth`. Every value that starts at depth 0
is a record; `[`, `]`, `,` and whitespace at depth 0 are skipped. This handles both a top-level
array and NDJSON with one code path. Record start offsets go into a growing `Float64Array`; when
it exceeds 1 M entries the array is halved and the stride doubled (adaptive sparse index, ≤ 8 MB
for any file). Lookup of record *i*: seek to `starts[floor(i / stride)]`, tokenize forward
`i mod stride` records. A file that yields exactly one record is refused ("single large object
is not supported").

**Encoding.** UTF-8 only (BOM tolerated). `chardet` on a 64 KB head; anything else is refused
with a message. UTF-16 large JSON is a v2 item.

**Edit overlay.** `Map<recordIndex, string | null>` in the renderer store (`null` = deleted).
Undo/redo is a stack of `{index, prev, next}`. `isDirty = overlay.size > 0`. The worker is
stateless regarding edits; the overlay is passed to `save`. Rendering applies the overlay on
top of fetched records. Record *insertion* is not in v1.

**Save.** Worker streams: preamble bytes, then per record either the overlay text or the
original byte range, preserving original inter-record separators; deleted records drop their
separator. Output goes to `<file>.tmp-<pid>` in the same directory, then `rename`. Before
writing, `fs.statfs` checks free space ≥ file size (skipped if unavailable). `markSelfSaved`
suppresses the watcher. After save the doc re-indexes in the background (2–3 s at 1 GB).
Save As writes to the chosen path and rebinds the tab to it.

**Session.** `kind: 'largeJson'` buffers are persisted in `files` with their `filePath` (same
as file buffers) and restored as ghosts; `loadBuffer` re-routes them to the large path.
Backups are automatically skipped because `useBackupSnapshot` requires `model !== null`.

## IPC contract (`largejson:*`)

| Channel | Direction | Payload |
|---|---|---|
| `largejson:open` | invoke | `(filePath)` → `{docId, size, encoding, error}` |
| `largejson:progress` | event | `{docId, bytesScanned, recordCount, done, error?, format}` |
| `largejson:get-records` | invoke | `(docId, start, count)` → `{start, records: string[]}` |
| `largejson:search` | invoke | `(docId, opId, query)` → starts; results via `largejson:chunk` |
| `largejson:extract` | invoke | `(docId, opId, path, limit)` → starts; results via `largejson:chunk` |
| `largejson:chunk` | event | `{docId, opId, kind: 'search'\|'extract', items, done, total?, error?}` |
| `largejson:extract-to-file` | invoke | `(docId, path, outPath, format)` → `{error, count}` |
| `largejson:save` | invoke | `(docId, overlay: [number, string\|null][], targetPath?)` → `{error, mtime, size}` |
| `largejson:cancel` | invoke | `(docId, opId)` |
| `largejson:close` | invoke | `(docId)` |

All `largejson:*` channels are added to the preload allowlists.

## Phases

| # | Phase | Deliverable | Verify |
|---|---|---|---|
| 1 | Guard + side fix | `largeFileRouting.ts`; routing in `useFileOps`; `tooLarge` toast; `magikaSample` copy fix in `fileHandlers.ts` | build; open a 300 MB `.txt` → friendly error, no V8 message |
| 2 | Engine | `src/main/ipc/largeJsonWorker.ts` (tokenizer, index, getRecords, search, extract, save), `largeJsonHandlers.ts`, preload API, worker build entry | build; unit-style smoke via a node script on a generated 60 MB file |
| 3 | Viewer | `BufferKind 'largeJson'`, `addLargeJsonBuffer`, `largeJsonStore`, `LargeJsonTab` (header, virtual record list, per-record tree, indexing progress), TabBar icon, App wiring, session persist/restore | open a 60 MB JSON → tab renders records instantly, count fills in |
| 4 | Editing | `RecordEditor` (mini Monaco), delete, undo/redo, dirty flag, Ctrl+S / Save As routing in `useFileOps`, close-dirty prompt, reindex after save | edit + delete + save → file on disk reflects changes, valid JSON |
| 5 | Search + Extract | streaming search filter with cap, Extract tab (path, count, preview cap, copy, export to file) | search narrows list; extract `a.b` returns values; export writes file |
| 6 | Release | `releaseNotes.tsx`, `CHANGELOG.md`, E2E spec `tests/large-json.spec.ts` (generates its fixture), `/security-review` | tests pass |

## Status (2026-09-05)

All six phases implemented. Verification:

| Check | Result |
|---|---|
| Worker smoke (generated 60 MB: minified, pretty+BOM, NDJSON) | index / page / random access / search / extract / extract-to-file / save with edit+deletes / Save As byte-identical — all pass |
| Worker smoke, 1 GB minified (6.25 M records) | index 4.4 s · search 6.6–7.9 s · extract (JSON.parse every record) 11.7–14 s · save 8.6–9.1 s |
| `tests/large-json.spec.ts` | 2/2 pass: open → count → expand → edit (valid + rejected invalid) → delete → undo/redo → save → file on disk verified → filter → extract; 257 MB `.txt` refused with readable toast |
| Regression `json-preview-pane.spec.ts`, `tab-dblclick-and-json-beautify.spec.ts` | pass |

Not run: `/security-review` (no commit made in this session — run it before committing).

## Non-goals (v1)

Deep single-object JSON, UTF-16 sources, record insertion, sort, Diff / Unescape / TS / Schema /
Repair / Diagram tabs on large files, files over ~2 GB (index and save are untested there).

## Risks

- **Per-record editor loses original formatting** of that one record (re-serialised from the
  editor text as typed). Acceptable: only edited records change bytes.
- **Search is O(file)** per query (1–3 s at 1 GB). Result cap 10 000 records; cancellable.
- **Worker crash** leaves the tab unusable; the tab shows the error and offers Reopen.
