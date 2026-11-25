# Split View → Two Views — Plan

Decision: Option A (see `raw/notes.md`). Notepad++ model: a **main** view and a **sub** view,
each with its own tab bar and active tab. A buffer lives in one view or in both (a clone).

## Data model (`store/editorStore.ts`)
- `Buffer.view: 'main' | 'sub' | 'both'` (default `'main'`). Clone = `'both'`: one buffer, one
  Monaco model, two editors (independent cursor/scroll).
- `mainActiveId`, `subActiveId`, `focusedView: 'main' | 'sub'`.
- **`activeId` keeps its meaning for every existing consumer: the buffer the user is working in
  = the focused view's active buffer.** Save, Close, status bar, commands, AI, previews all keep
  reading `activeId` and so follow focus with no change.
- Remove dead `splitActive` / `splitActiveId` / `setSplitActive` / `toggleSplit`.
- Every store write passes through a pure normalizer (`utils/editorViews.ts`, unit-tested):
  - an explicit `activeId` change activates that buffer in its view (focus follows; for a clone,
    the focused view);
  - each view's active id is kept inside that view, falling back to the left neighbour;
  - an empty sub view collapses (all back to main); focus never sits on an empty view.
  This covers the ~8 places in the store that write `activeId` without touching each one.
- New buffers open in the focused view (file kinds only; virtual tabs always main).

## Actions
- `moveToOtherView(id)`, `cloneToOtherView(id)` — file buffers only (`kind === 'file'`).
- `closeInView(id, view)` — on a clone, drops that view only (no dirty prompt, model kept);
  otherwise the existing `closeBuffer` path runs (dirty confirm, watcher, dispose).
- `setFocusedView(view)`; `collapseSubView()`.

## UI
- `TabBar` gets a `view` prop: filters to that view's buffers, highlights that view's active tab,
  context menu adds **Move to Other View** / **Clone to Other View**; Close Others/All act on
  that view only.
- `SubViewPane` (replaces `SplitEditorPane`): sub `TabBar` + one Monaco editor bound to
  `subActiveId`'s model, its own per-buffer view-state map, loads ghost buffers on activation.
- Main column renders `mainActiveId` (EditorPane prop + virtual-tab overlays).
- Focus: each editor's `onDidFocusEditorText` sets `focusedView` and the registry's focused
  editor. `editorRegistry` holds both editors; `get()` returns the focused one, so the 18
  registry consumers (commands, Find, toolbar, AI…) act on the focused view.
  EditorPane's `editor:command` IPC handler also uses the focused editor.
- View → Split View toggle: on = clone the active file into the sub view (today's behaviour,
  now with tabs); off = collapse the sub view into main. `uiStore.splitView` mirrors
  "sub view has buffers" so the menu checkbox stays right.

## Session
- Per file: `view`. Top level: `subActiveIndex`, `focusedView`. Old sessions → all main.

## Out of scope (v1)
- Synchronized scrolling (N++ "Synchronize Vertical/Horizontal Scrolling") — follow-up.
- Sub view shows file buffers only; bookmarks gutter / mark highlights render in main only.
- Drag a tab between views.

## Tests
- Unit: `tests/unit/editorViews.test.ts` — normalizer + move/clone/close rules.
- E2E: one flow in `tests/split-view.spec.ts` (or extend an existing split spec): clone, move,
  two different files side by side, focus routes a command to the sub view, close a clone.
