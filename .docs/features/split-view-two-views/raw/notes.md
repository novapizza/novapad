# Split View → Two Views (Notepad++ style) — Decision Notes

Date: 2026-11-25

## Problem
Split View today (`SplitEditorPane.tsx`) is a read/write *mirror* of the active tab: same Monaco
model, no tab strip, follows every tab switch. It can only ever show the file already on the left.

Notepad++'s primary use case is different: **two views (main + sub), each with its own tab bar**,
so two *different* files sit side by side. Clone is the secondary action. Other gaps:
- Menu/command actions target only the primary editor (`editorRegistry` holds one editor), so
  Find/line ops hit the left pane even when focus is in the right one.
- `splitActive`, `splitActiveId`, `setSplitActive`, `toggleSplit` in `editorStore.ts` are dead
  scaffolding from an earlier attempt — nothing reads them.

## Options considered
| Option | Scope | Cost |
|---|---|---|
| **A. Two views, N++ style** | Own tab strip + active buffer per view; Move/Clone to Other View; commands follow focus; session stores view per tab; optional sync scroll | ~2–3 days |
| B. Mirror + file picker | Dropdown in split header to bind another open buffer | ~0.5 day; no tabs/move, commands still primary-only |
| C. VS Code editor groups | N groups, each with tabs | ~5+ days; overkill for an N++-style editor |

## Decision (confirmed with Linh)
**Option A — two views, Notepad++ style.**

Scope to carry into plan.md:
- Each view has its own tab strip and active buffer (reuse/replace `splitActiveId`).
- Tab context menu: **Move to Other View**, **Clone to Other View**. Current mirror behaviour
  becomes "Clone" (shared model, independent scroll/cursor).
- Commands and menu actions route to the **focused** view's editor (registry → focused editor).
- Session persists which view each tab lives in.
- Open question for plan: closing a cloned buffer in one view — close only that view's tab
  (N++ behaviour) vs both. Default: only that view; model disposed when no view references it.
- Optional follow-up: Synchronize vertical/horizontal scrolling toggle.

## Outcome (built 2026-11-25)
- Closing a clone in one view: **that view only**, no dirty prompt, model kept (N++ behaviour) —
  taken as the default; not separately confirmed.
- `utils/editorViews.ts` (pure, `tests/unit/editorViews.test.ts`): `normalizeViews` runs on every
  editor-store `set`, so existing `activeId` writers needed no changes. `activeId` = focused view.
- `editorRegistry` holds main + sub editors; `get()` = focused. EditorPane's `editor:command`
  handler uses it, so menu edit commands follow focus.
- Sub view = `SplitEditorPane` (sub `TabBar` + Monaco, own per-buffer view state, loads ghosts).
- Session: per-file `view`, `subActiveIndex`, `focusedView`; `activeIndex` now = main view's tab.
- E2E: `tests/split-view.spec.ts` (flow + session restore). Full suite: 77 passed, 2 skipped.
- Not in v1: synchronized scrolling, drag a tab across views, bookmarks/mark gutter in the sub
  view, virtual/large-JSON tabs in the sub view.
