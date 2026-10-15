# Decision Record: Table Lens sync with devtool (Oct 2026 upgrade)

Origin: Table Lens in devtool (`devtool/components/TableLens.tsx`) got two feature commits —
`92f8624` (2026-10-13: textarea cell editor, Excel-style fill handle + series fill) and `b933f50`
(2026-10-14: rename/insert columns, paste from Excel, Paste values dialog, shift-click row range,
Save). Linh asked to bring them into NovaPad's CSV preview.

Finding: NovaPad's `CsvViewer/TableLens.tsx` is devtool `0c9cf35` (2026-04-02) plus three NovaPad
tweaks — seeded from `initialCsvText`, CSV-only (no `xlsx` dependency), `h-full` layout. Devtool has
moved on through `1f24f97` "v2" (undo/redo history, find & replace, summary footer, multi-sort,
utils split out), `45afcc6` (empty-filter fix) and the two October commits. The October features
build on v2's `useHistory` snapshot model, so they can't be cherry-picked onto the April copy.

## Decisions (owner: Linh, SA)

1. **Full sync to devtool HEAD, not October-only.** Port the component, its three sub-components
   and the util modules as they are at `b933f50`, then re-apply NovaPad's tweaks. *Why:* October-only
   would mean re-building v2's history layer in a NovaPad-only fork (more code, more drift);
   a full sync keeps the files diff-able against devtool so the next port is mechanical.

2. **Save = write the table into the tab's text, then the normal file save.** Ctrl+S / Save in the
   table serializes it (original delimiter, columns in display order, model EOL, trailing newline
   kept) into the buffer's Monaco model, and NovaPad's `saveBuffer` writes it with the file's
   encoding / EOL / BOM. While the table has unsaved edits the tab is marked dirty, so Save All,
   AutoSave, close-tab and quit prompts all see them. Unmounting the table with unsaved edits
   (tab switch, preview closed) moves them into the text instead of dropping them. If the text was
   edited by hand after the table loaded, a native confirm asks before replacing it. The plugin
   overlay (no tab behind it) saves through a native Save dialog. *Why:* one save path, no data
   loss on tab switch, and Ctrl+Z in the editor can undo a table save. Rejected: live sync on every
   edit (re-serializes the whole table per keystroke, floods the editor undo stack); devtool parity
   via a file dialog (tab and disk drift apart).

3. **Tests: vitest for the pure utils + one Playwright round-trip.** Add `vitest` as a dev
   dependency, port devtool's five unit test files to `tests/unit/`, and add an e2e test that
   edits a cell and saves the CSV to disk. *Why:* fill-series and clipboard parsing are
   combinatorial and cheap to unit-test; the e2e covers the NovaPad-specific write-back.

## Consequences / NovaPad-specific adaptations

- **Shortcut ownership.** `useCommandKeys` dispatches in the capture phase and would steal
  Ctrl+S / Ctrl+F / F2 from the table. Elements may now declare `data-own-shortcuts="Mod+S …"`;
  while focus is inside one, those combos skip the registry. The table root is focusable
  (`tabIndex=-1`) so clicking a cell scopes keys to it instead of `document.body`.
- **No `window.confirm`.** NovaPad routes prompts through `window.api.dialog.confirm` (renderer
  confirm freezes Monaco's message loop), so save warnings and "discard changes?" are async.
- **No `beforeunload`.** In Electron a prevented `beforeunload` silently blocks the window from
  closing; dirty state flows through the tab instead.
- **CSV/TSV only.** XLSX/JSON load and save paths are dropped (no `xlsx` dependency; JSON save is
  lossy). Rows with more fields than the header warn before saving, since saving drops the extras.
- **Seed from the buffer's own model** at mount, not the shared editor instance, so a tab switch
  can't seed the new table with the previous tab's text.
- **Focus returns to the table** when the cell editor, rename box or paste dialog closes. Removing
  the focused textarea drops focus to `<body>`, which is outside the root that scopes keys — found
  by the e2e test (arrows / Ctrl+V stopped working after the first edit).
- **The extra-values warning lives on the writer** (`TableWriter.saveWarning`), not the Save button,
  because the editor's Ctrl+S, Save All and AutoSave also write the table through the bridge.
- **Clipboard e2e uses synthetic events.** The system clipboard is empty under the test runner
  (the existing `json-preview-pane` clipboard test fails the same way there), so the spec dispatches
  `paste` / `copy` on the focused element. Real Ctrl+C / Ctrl+V from Excel needs a manual check.

## Out of scope (follow-ups)

- Table refreshing live when the text is edited while the table is clean (today the table is a
  snapshot from when it opened; the conflict prompt covers the overlap).
- Preserving "quote every field" style on save (Papa quotes only cells that need it).
