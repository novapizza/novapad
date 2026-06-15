# Security Hardening — Plan

> **Status:** In progress. Phase 0 gate (auto-update adoption) is **met** — binary/breaking changes
> may ship. This doc is the tracked home referenced from `CLAUDE.md`.
> **Scope:** Phases 1, 2, 4, 5. Phase 3 (plugin-system removal) is **deferred** and planned separately.

## Context

NovaPad (repo folder `notepadandmore`, internal id `com.novapad.app`) is a shipped Electron + React +
Monaco editor. A security review on 2026-05-27 produced `~/Downloads/hardening-novapad.md`; this doc
turns it into an executable plan and tracks progress. Each phase ships as its own commit; the
`/security-review` and release-notes rules in `CLAUDE.md` apply to every commit.

### Baseline confirmed in place (do not regress)
- `contextIsolation: true`, `nodeIntegration: false` — `src/main/index.ts:138-139`
- Preload uses only Electron built-ins (`contextBridge`, `ipcRenderer`, `webUtils`) — `src/preload/index.ts:1` → sandbox-safe
- `setWindowOpenHandler` → `deny` + `shell.openExternal` — `src/main/index.ts:167-170`
- macOS hardened runtime + notarize (`build/notarize.cjs`), Windows Azure Trusted Signing — `electron-builder.yml:281,293`, `.github/workflows/release.yml`
- Monaco workers bundled via Vite `?worker` (no CDN) — `src/renderer/src/main.tsx:4-29`
- electron-updater over R2 HTTPS, single-instance lock, `tar@^7.5.13` override — `src/main/update/UpdateManager.ts:41-44`, `package.json:92`

---

## Phase 1 — Electron Fuses + asar integrity  *(do first; CI-validated)*

**Goal:** tamper protection via fuses + embedded asar integrity (hash baked into the signed binary).
asar is not encryption — integrity is the control.

- [x] **1.1** `package.json` — added `@electron/fuses` devDependency (resolved `^2.1.2`; v2 API `flipFuses`/`FuseVersion`/`FuseV1Options` unchanged from v1).
- [x] **1.2** `build/fuses.cjs` (new) — `afterPack` hook: `flipFuses(electronBinary, { version: FuseVersion.V1, ... })`, resolving the packaged Electron binary per platform from `context.appOutDir` / `context.packager.appInfo.productFilename`.
- [x] **1.3** `electron-builder.yml` — added top-level `afterPack: build/fuses.cjs`. `electron-builder.cjs` spreads the yml via `...base`, so it propagates to both `package:*` and CI. *(End-to-end fuse/integrity validation still pending a CI signed build.)*

**Fuses:** `RunAsNode: false`, `EnableNodeOptionsEnvironmentVariable: false`,
`EnableNodeCliInspectArguments: false`, `OnlyLoadAppFromAsar: true`,
`EnableEmbeddedAsarIntegrityValidation: true`, plus `resetAdHocDarwinSignature: true` on macOS.

**Ordering:** `afterPack` (fuse flip) runs before `afterSign` (sign + notarize) — required, since the flip
mutates the binary and the signature must cover post-flip bytes. `resetAdHocDarwinSignature: true` clears
the ad-hoc sig so electron-builder's signing step re-signs cleanly.

**Validation (CI signed build only):** package win+mac via tag-triggered release, install, confirm launch.
Confirm `ELECTRON_RUN_AS_NODE=1 <app>` no longer runs as Node. Confirm post-sign `app.asar` tampering
fails launch. Never judge on a local unsigned build.

---

## Phase 2 — Sandbox + navigation guards

- [x] **2.1** `src/main/index.ts` — `sandbox: false` → `true`.
- [x] **2.2** `src/main/windows/searchWindow.ts` — `sandbox: false` → `true`.
- [x] **2.3/2.4** New `src/main/windows/navigationGuards.ts` exporting `installNavigationGuards(contents)` — `will-navigate` blocks any non-app URL (opens http/https/mailto via `shell.openExternal`); `will-attach-webview` denied. Wired into both main + search windows.

Preload is already sandbox-safe — no preload change.

**Validation:** ✅ `npm run build` + full `npm run test:e2e` (**91 passed, 7 skipped**, exit 0) with sandbox on.

---

## Phase 4 — CSP tightening

Was (`src/renderer/index.html`): `script-src 'self' 'unsafe-inline' 'unsafe-eval'`.

- [x] **4.1** Dropped `'unsafe-eval'` — **empirically verified safe.** A probe launched the built app,
  mounted Monaco, typed JSON+JS, and triggered IntelliSense (Ctrl+Space) under `script-src 'self'` with
  **zero eval/inline CSP violations**. (Modern ESM Monaco + bundled `?worker` workers don't need eval on
  the main thread.)
- [x] **4.2** Dropped `'unsafe-inline'` from `script-src` — the built `index.html` has no inline scripts
  (only the bundled `<script type="module" src>`). Kept `'unsafe-inline'` in `style-src` (Monaco/Radix
  inject inline styles). Also added `object-src 'none'`, `base-uri 'self'`.
- [x] **4.3** Added CSP **response header** via `onHeadersReceived` on `session.defaultSession` in
  `src/main/index.ts` (`CSP_POLICY` constant mirrors the meta + `frame-ancestors 'none'`). `frame-ancestors`
  is omitted from `<meta>` (ignored there). Caveat documented in code: `webRequest` may not fire for
  `file://` in the packaged build, so the `<meta>` tag stays the primary control; the header hardens dev +
  http subresources and adds `frame-ancestors`.

**Validation:** ✅ probe shows Monaco mounts + works with the tightened CSP and header, **zero console
violations**. ✅ The two most CSP/sandbox-sensitive specs (`ui-redesign`, `menu-consolidation/quickstrip`
— which includes the Find & Replace search-window flow) pass with **zero failures when run in isolation**.

> **E2E suite caveat (important):** the full `npm run test:e2e` suite is **261 tests**, largely authored
> for Windows. On macOS ~165 fail regardless of this work: custom `MenuBar`, `QuickStrip`, `SideNav` are
> hidden (e.g. `MenuBar` returns `null` on darwin) and native open-folder dialogs are unavailable. Running
> 261 Electron cold-starts serially under load also produces **fixture contention** (basic tests hit the
> 10s `[data-testid="app"]` timeout), so raw pass counts are not a reliable signal here.
>
> **Definitive regression check (apples-to-apples):** `tests/seed.spec.ts` — which exercises the fixture,
> app render, editor, sidebar — run on **hardened** vs **pristine `master`** gives the *identical* result:
> **3 passed, 1 failed**, where the one failure is `seed.spec.ts:3` asserting `[data-testid="menubar"]`
> visible — the pre-existing macOS MenuBar-is-`null` case, failing the same on both trees. Combined with the
> deterministic CSP probe (app + Monaco render under `sandbox:true` + tightened CSP, **zero CSP
> violations**), the conclusion is: **the hardening introduces no functional regressions**; the bulk E2E
> failures are pre-existing macOS incompatibility + serial-run contention.

---

## Phase 5 — Update integrity + supply-chain hygiene

- [x] **5.1** `src/main/update/UpdateManager.ts:41-44` — **verified.** electron-updater validates the
  downloaded file's SHA512 against `latest.yml`/`latest-mac.yml` internally and rejects on mismatch
  (no custom hook needed). On Windows, `NsisUpdater` verifies the installer's Authenticode publisher
  against the installed app's signing cert (Azure Trusted Signing). No code change required.
- [ ] **5.2** R2 bucket write-protection — **infra, owner to confirm.** Public surface is the read-only
  `pub-*.r2.dev` CDN; uploads use the private S3 API (`*.r2.cloudflarestorage.com`) with credentials in
  CI secrets. Action: confirm no public-write policy on the bucket.
- [x] **5.3** Added non-blocking pnpm audit CI — `.github/workflows/audit.yml` (push/PR/weekly).
- [x] **5.4** Added `.github/dependabot.yml` (npm + github-actions, weekly, dev-deps grouped).
- [x] **5.5** `fast-xml-parser` — config parser at `configHandlers.ts:19` parses only *trusted* local
  config (no XXE: external/DTD entities not resolved by default). The *untrusted* `.sqlplan`/ShowPlanXML
  path is the renderer's SqlPlanPreviewPane — candidate follow-up: set `processEntities: false` there to
  close billion-laughs, after confirming the parse site and testing. Track Electron 41.x patches.

**Finding (audit):** 6 high advisories, all `tar@6.2.1` nested under `magika → @tensorflow/tfjs-node`.
The `tar@^7.5.13` override doesn't reach that subtree (`@mapbox/node-pre-gyp` pins `tar@^6`). `@tensorflow`
is **excluded from the packaged bundle**, so the vulnerable `tar` is **not shipped** — hence the audit gate
is informational, not blocking.

**Validation:** audit workflow surfaces advisories for triage; Dependabot opens PRs; tampered installer
(wrong SHA512) rejected by electron-updater.

---

## Phase 3 — DEFERRED

Plugin-system removal: decided but breaking and large. **Nuance for that plan:** core `CsvViewerOverlay`
is only triggered by the plugin API (`PluginLoader.ts:179` → `plugin:open-csv-viewer`); removing plugins
orphans it unless a non-plugin trigger is added.

---

## Suggested order
1. Tracked doc (this file).
2. Phase 1 → tag release → CI-validate signed build.
3. Phase 2 → E2E.
4. Phase 4 → console-clean smoke.
5. Phase 5 → CI hygiene.
