# Quick Open (Ctrl+E file search) — Index & Scope Decision Notes

Date: 2026-11-25

## Findings
- The folder Ctrl+E searched was **not** a NovaPad default — `uiStore.workspaceFolder` starts
  `null`. It came from session restore (`%APPDATA%\NovaPad\config\session.json` →
  `workspaceFolder: C:\Users\LinhNguyen\Desktop\Code`), i.e. a folder opened in an earlier session.
- `file:list-files-recursive` (`main/ipc/fileHandlers.ts`) walks with `collectFilesAsync`, which
  skips only dotfiles and `node_modules`. Cap is 20,000 files.
- Measured on `Desktop\Code`:
  - 168,934 files walked
  - 57,850 (34%) binary by extension (`.o`, `.bc`, `.rlib`, `.jpg`, `.bin`, …)
  - 95,837 (57%) under build dirs (`target/`, `out/`, `dist/`, `bin/`, `obj/`, …)
  - → the 20k cap fills with build output; real sources are often never indexed, and which
    files make it in depends on folder walk order.

## Decisions (confirmed with Linh)

### 1. Index filter — binary extensions + build dirs
- Skip files by **binary extension denylist** (images, objects/libs, archives, office/PDF, fonts,
  media, DBs, wasm/asar/node, installers). Extension-only: zero extra I/O. A content sniff was
  rejected (~2–10 s extra on 20k files).
- Skip well-known **build/cache directories**: `out`, `dist`, `build`, `bin`, `obj`, `target`,
  `__pycache__`, `test-results`, `playwright-report`, `coverage` (final list in plan).
- Apply in the shared walker so **Find in Files** benefits too.
- `.gitignore` support was considered and deferred.

### 2. Folder scope — keep restoring, make it visible
- Keep restoring the last workspace folder (Notepad++ / VS Code behaviour).
- Palette shows the scope: `in: <folder name>` plus a **Close Folder** action.
- No folder at all → blank list with an "Open Folder" hint (existing empty state, keep it).

## Outcome (built 2026-11-25)
- `src/shared/indexExclude.ts` — name-only checks `isBinaryFileName`, `isExcludedDirName`
  (unit: `tests/unit/indexExclude.test.ts`). `build` and `bin` kept on purpose (often hand-written).
- `collectFilesAsync` skips excluded dirs always (below the root) and binary names when
  `skipBinary`. Quick Open passes `true`; Find in Files passes it only for a catch-all filter.
- Measured on `Desktop\Code`: 168,934 → 73,165 (dirs) → **65,561** files (dirs + binary).
  The remainder is real source across ~40 repos, so the 20k cap still applies there — a
  workspace-size issue, not noise. Possible follow-up: raise the cap / score by recency.
- Palette footer `in: <folder> · Change… · Close Folder`; new command `file.closeFolder`, in the
  File menu (custom MenuBar + native menu via `menu:folder-close`).
- E2E: steps added to `tests/command-palette.spec.ts`.
