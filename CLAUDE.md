# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Electron app with hot reload
npm run build        # Compile TypeScript via electron-vite
npm run package      # Package for current platform
npm run package:win  # Build Windows NSIS + portable EXE
npm run package:mac  # Build macOS DMG
```

```bash
npm run build              # Required before first test run
npm run test:e2e           # Build + run all E2E tests
npm run test:e2e:headed    # With visible Electron window
npm run test:e2e:report    # Open HTML report
```

## Security Review — required before every commit & push

Before running `git commit` or `git push`, you MUST run the `/security-review` skill on the
pending changes and resolve (or explicitly justify in the commit message) any findings. This
applies to **all** changes, no exceptions — do not commit or push code that has not passed
security review.

- Run `/security-review` after staging, before the commit.
- For a deeper pre-PR pass, `/ultrareview` (user-triggered, billed) runs a multi-agent cloud
  review of the branch.

> **Enforcement scope:** This rule binds Claude Code sessions. It does **not** automatically
> bind manual `git` commits made outside a Claude session. For hard enforcement on every
> commit/push regardless of who runs it, add a git hook or CI check — tracked in
> `.docs/features/security-hardening/plan.md` (Phase 5).

## Release Notes & Changelog — keep in sync on every commit

Two artifacts must reflect every user-facing change, and both must be updated in the **same
commit** as the change:

1. **In-app "What's New" tab** — driven by a per-version content map in
   `src/renderer/src/components/WhatsNewTab/releaseNotes.tsx`. The top entry of `RELEASE_NOTES`
   is the **in-progress** release (its `version` must equal the current `package.json` version).
2. **`CHANGELOG.md`** (repo root) — a [Keep a Changelog](https://keepachangelog.com/)–style
   history. New entries go under the top-most version heading (`## [Unreleased]` when no bump is
   pending, otherwise the current `package.json` version), grouped by
   `Added` / `Changed` / `Fixed` / `Removed`. The changelog starts at **1.5.8** — do not backfill
   earlier versions.

Whenever you make a commit that changes **user-facing behavior** (features, UX, notable fixes),
you MUST update **both** in the same commit:

- **No version bump:** edit the top `RELEASE_NOTES` entry (add/adjust a `highlights` item) **and**
  add a line under `## [Unreleased]` in `CHANGELOG.md`. Skip purely internal commits (refactors,
  tests, CI, deps) that a user would never notice.
- **`package.json` version was bumped:** add a **new** top entry to `RELEASE_NOTES` with the new
  `version` **and** promote `## [Unreleased]` in `CHANGELOG.md` to a `## [X.Y.Z]` heading (leave a
  fresh empty `## [Unreleased]` above it), moving any items that actually ship under the new
  version. Leave older entries in place in both files.

Rules:
- `RELEASE_NOTES[0].version` must always match `package.json`'s `version`. If they drift, the
  tab falls back to the newest existing entry and ships **stale notes under a new version
  number** — the exact bug this map was built to prevent.
- `CHANGELOG.md`'s newest version heading must also match `package.json`'s `version` once a bump
  lands (an `## [Unreleased]` section may sit above it between releases).
- `releaseNotes.tsx` bodies are `ReactNode`, so write real JSX (bold lead-ins,
  `<span className="font-mono">` for sizes/paths, links). Keep the array sorted newest-first.
  `CHANGELOG.md` is plain Markdown, also newest-first.

> **Enforcement scope:** This rule binds Claude Code sessions, same as Security Review above.
> For hard enforcement, add a CI check asserting `RELEASE_NOTES[0].version === package.json
> version`.

## Cutting a Release

Releases are **tag-triggered**: pushing a `v*.*.*` tag runs `.github/workflows/release.yml`,
which builds, signs (macOS notarization + Azure Trusted Signing for Windows), and publishes
installers to GitHub Releases + the R2 bucket. **Auto-update delivers it to all users** — this is
the outward-facing, hard-to-reverse step, so confirm intent before pushing the tag unless the
user has explicitly asked to release. All signing/publishing secrets live in CI; no local signing
env is needed, and **no local `electron-builder` run is required** (the `release:*` npm scripts are
for manual/macOS-host publishing only).

Steps to release version `X.Y.Z` (trunk-based — commit straight to `master`):

1. Bump `version` in `package.json`.
2. Refresh `releaseNotes.tsx`: add a **new** `RELEASE_NOTES[0]` entry with `version: 'X.Y.Z'`
   covering everything landed since the previous `vX.Y.(Z-1)` tag. If features were appended to
   the prior (already-tagged) entry while its version sat unbumped, **move them** into the new
   entry so each version's notes match what actually shipped under it.
3. Update `CHANGELOG.md`: promote `## [Unreleased]` to `## [X.Y.Z]` (leave a fresh empty
   `## [Unreleased]` above it) and update the compare/tag links at the bottom. The newest heading
   must match `package.json`'s new version and mirror the `releaseNotes.tsx` entry.
4. `npm run build` to verify the renderer/TSX compiles (ignore the `"use client"` node_modules
   warnings; a real failure shows `RollupError`/`Transform failed`. Note: piping the build
   through `Select-Object -First N` can surface a spurious exit 255 from a broken pipe — confirm
   with a full run if unsure).
5. Run `/security-review` (required before any commit/push).
6. Commit as `chore(release): X.Y.Z` and push to `master`.
7. `git tag -a vX.Y.Z -m "Release X.Y.Z"` and `git push origin vX.Y.Z` — this fires CI.
8. Confirm the run started: `gh run list --workflow=release.yml --limit 3`. A full publish takes
   ~14–16 min.

Tags are annotated and named `vX.Y.Z` (the `v` prefix is required by the workflow's `v*.*.*`
trigger). Do **not** stage `.claude/settings.local.json` into release commits — it's local
session noise.

## E2E Testing (Playwright + Test Agents)

### Test Agents workflow (run once to initialize)
```bash
npx playwright init-agents --loop=claude
```
Then invoke agents via Claude Code prompts:
- `"Run Planner agent"` — explores app, creates `specs/*.md` test plans
- `"Run Generator agent"` — reads specs, writes `tests/*.spec.ts`
- `"Run Healer agent"` — runs failing tests and auto-repairs them

### Architecture
- Tests launch built app (`out/main/index.js`) — always build first
- `E2E_TEST=1` env var bypasses close handler in `src/main/index.ts`
- Session restore is disabled in E2E mode — each test starts clean
- `workers: 1` — one Electron instance at a time
- `testDir: ./tests` — Generator agent writes tests here

### Monaco gotchas
1. Click `.monaco-editor textarea` before `keyboard.type()`
2. Fixture already waits for textarea (~1-2s after React mount)
3. IntelliSense popup: press Escape before asserting if needed
4. Native menu actions: use `app.evaluate()` + `webContents.send(channel)`

## Architecture

This is an Electron + React + Monaco Editor desktop app (Notepad++ clone). The three Electron processes each have distinct roles:

### Main Process (`src/main/`)
Node.js backend. Entry: `src/main/index.ts`.
- `menu.ts` — Full native OS menu (9 sections). Menu actions fire IPC events to the renderer.
- `ipc/fileHandlers.ts` — File I/O via `chardet` (encoding detection) + `iconv-lite` (encoding conversion).
- `ipc/configHandlers.ts` — Read/write app config from `~/.config/notepad-and-more/config/`.
- `ipc/pluginHandlers.ts` — Plugin query/control.
- `plugins/PluginLoader.ts` — Loads plugins from `~/.config/notepad-and-more/plugins/`. Each plugin exports `activate(api)`.
- `sessions/SessionManager.ts` — Saves/restores open files + cursor positions to `session.json`.

### Preload (`src/preload/index.ts`)
Security bridge. Exposes `window.api` to the renderer with a whitelist of allowed IPC channels. Context isolation is enabled; node integration is disabled.

### Renderer (`src/renderer/src/`)
React frontend.
- `App.tsx` — Root component. Wires all menu IPC events to store actions and file ops. Manages layout via `react-resizable-panels`.
- `components/EditorPane/` — Monaco Editor wrapper. Handles buffer switching with view state preservation, and listens to `editor:command` IPC for menu-driven editor operations (line ops, case, comments, zoom).
- `components/TabBar/` — Tabs with drag-to-reorder and right-click context menu.
- `components/StatusBar/` — Cursor position, EOL, encoding, language, dirty state.

### State Management (Zustand)
- `store/editorStore.ts` — Buffers array + active buffer ID. Each `Buffer` holds file path, content, `isDirty`, encoding, EOL, language, Monaco `viewState`, and Monaco `model`.
- `store/uiStore.ts` — Theme, visibility toggles (toolbar/statusbar/sidebar), dialog visibility, toast queue.

### Data Flow
Menu click → IPC to main → main process I/O → IPC to renderer → `useFileOps` hook or store action → React re-render.

File operations live in `src/renderer/src/hooks/useFileOps.ts` (open, save, close, reload). Language-to-extension mapping is in `src/renderer/src/utils/languageDetect.ts`.

## Build System

`electron-vite` compiles three separate bundles:
- **main** — CommonJS, externalizes `node_modules` (except `fast-xml-parser`)
- **preload** — CommonJS, externalizes everything
- **renderer** — ESNext/DOM, React plugin, path alias `@renderer/*` → `src/renderer/src/*`

Compiled output goes to `out/`. Packaged distributable goes to `dist/`.

## Incomplete / Stubbed Features

Several features have menu entries and store state but no UI yet: Find/Replace panel, Preferences dialog, Plugin Manager, UDL Editor, Sidebar panels (files/project/docmap/functions), and Split View.
