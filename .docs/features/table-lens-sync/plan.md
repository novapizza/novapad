# Implementation Plan: Table Lens sync with devtool

**Feature:** table-lens-sync
**Date:** 2026-10-15
**Decisions:** [raw/notes.md](./raw/notes.md)
**Source:** devtool `b933f50` (`components/TableLens*.tsx`, `utils/tableLens*.ts`, `tests/tableLens*.test.ts`)

## Files

| NovaPad file | From devtool | NovaPad changes |
|---|---|---|
| `components/CsvViewer/TableLens.tsx` | `components/TableLens.tsx` | seed from `initialCsvText`, CSV/TSV only, `h-full`, host save API, native confirms, root owns shortcuts, no `beforeunload` |
| `components/CsvViewer/TableLensCellEditor.tsx` | same name | Ctrl+S commits the edit and reaches the table |
| `components/CsvViewer/TableLensFillOptions.tsx` | same name | import paths |
| `components/CsvViewer/TableLensPasteDialog.tsx` | same name | import paths |
| `utils/tableLens{Utils,Fill,Columns,Paste,History,Save}.ts` | same names | `Save` trimmed to CSV/TSV + newline / trailing-newline / extra-field handling; others verbatim |
| `components/CsvViewer/tableLensBridge.ts` | — | per-buffer registry of unsaved table edits (`flushTableEdits`, `hasPendingTableEdits`) |
| `components/CsvViewer/TableLensPreviewPane.tsx` | — | keyed `BufferTable` seeds from the buffer model, writes back, marks the tab dirty |
| `components/CsvViewer/CsvViewerOverlay.tsx` | — | Save via native dialog |
| `commands/useCommandKeys.ts` | — | honour `data-own-shortcuts` |
| `hooks/useFileOps.ts` | — | `saveBuffer` / `saveActiveAs` flush table edits first |
| `components/EditorPane/EditorPane.tsx` | — | dirty = text changed **or** table has pending edits |
| `App.tsx` | — | flush table edits before writing quit backups |
| `tests/unit/tableLens*.test.ts`, `vitest.config.ts` | `tests/tableLens*.test.ts` | import paths |
| `tests/table-lens.spec.ts` | — | e2e: edit cell → Ctrl+S → file on disk |

## Save flow

```
Table Ctrl+S ─▶ onSave ─▶ runCommand('file.save') ─▶ saveBuffer(id)
                                                      ├─ flushTableEdits(id)  ── bridge ──▶ writer.serialize()
                                                      │     conflict? native confirm        └─▶ model.pushEditOperations
                                                      └─ window.api.file.write(model text, encoding, eol, bom)
table dirty ──▶ bridge.set(id) + buffer.isDirty = true   (Save All / AutoSave / close / quit see it)
table unmount while dirty ──▶ flushTableEdits(id)        (edits land in the text, tab stays dirty)
```

## Verification

- `pnpm vitest run` — ported unit tests.
- `pnpm run build` then `npx playwright test tests/table-lens.spec.ts`.
- Manual: open a `;`-delimited CSV, edit / fill / paste / add + rename column, Ctrl+S, confirm
  delimiter and line endings preserved on disk; switch tabs with unsaved table edits → tab dirty,
  text updated.
