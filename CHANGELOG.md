# Changelog

All notable, user-facing changes to NovaPad are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This log starts at **1.5.8**; for earlier releases see the Git history and the
per-version notes in `src/renderer/src/components/WhatsNewTab/releaseNotes.tsx`.

## [Unreleased]

## [1.5.8]

### Added
- **Deeplinks (`novapad://`)** — open files in NovaPad from a link (e.g. posted in Slack).
  Three verbs:
  - `open?url=<https>[&line=N][&col=M]` — fetch a remote file into a **read-only** tab.
  - `preview?url=<https>[&line=N][&col=M]` — same as `open`, then open the preview pane.
  - `new?title=…&content=…&lang=…` (or `contentBase64=…`) — new **editable** tab from inline content.

  Targets are `https`-only and credential-free; unknown hosts require confirmation (with an
  "Always Allow" allowlist persisted to `deeplink.json`). Fetches are capped at 10 MB / 15 s and
  redirects are re-validated against the trusted hosts. See `.docs/features/deeplink/README.md`.
- **Preview toggle buttons on the tab bar** — for previewable files (Markdown, JSON, CSV, SQL plan),
  two buttons next to `+`: **Preview** (replaces the editor in the current tab) and
  **Open Preview to the Side** (same as `Ctrl/Cmd+P`).
- **Theme picker & Solarized Light.** Settings ▸ Appearance shows a **Current theme** row that
  opens a slide-in picker with visual theme cards; selecting one previews it live. A new
  **Solarized Light** theme joins **Dark** (Dracula) and **Light** (Blue). The gear menu's old
  "Toggle Dark Mode" entry is now **Themes**, which opens the picker.

### Changed
- **Rebrand — new logo & app icon.** New NovaPad "`{ N }`" mark (magenta/violet on a dark
  ground) replaces the old "N+" placeholder across the title bar, tab icons, Welcome screen,
  About dialog, and What's New. Regenerated the macOS/Windows/Linux app icons (`.icns` / `.ico`
  / PNG set). The Welcome / About / What's New logos use an animated (SMIL) SVG.
- **New dark theme derived from the logo.** Light mode keeps its familiar **blue** accent; dark
  mode adopts a **Dracula**-based palette (editor + surrounding chrome kept in one tone) with a
  **violet** accent. JSON preview syntax colors follow each theme.
- **What's New now activates on first launch of a new version** when the workspace is empty
  (it opens in the background when a session with files was restored, as before). Its header
  gained the app name and a larger logo.
- **Zoom now zooms the whole window** (UI + editor) via Zoom In / Out / Reset
  (`Ctrl/Cmd` `+` / `-` / `0`) and works everywhere, including the Welcome screen and
  virtual tabs. The level is remembered across launches. `Ctrl`+mouse-wheel no longer zooms
  the editor font, matching VS Code / Cursor defaults.

### Fixed
- **Zoom In / Out / Reset did nothing unless a file was open in the editor** — they only drove
  Monaco's per-editor font zoom. They now control whole-window zoom and always work.
- **Settings page reset its selected category** when you switched to another tab and back — the
  active category is now preserved.

[Unreleased]: https://github.com/novapizza/notepadandmore/compare/v1.5.8...HEAD
[1.5.8]: https://github.com/novapizza/notepadandmore/releases/tag/v1.5.8
