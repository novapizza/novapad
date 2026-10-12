# NovaPad

A lightweight, fast, and modern text editor for Windows, macOS, and Linux. Built on Electron + React + Monaco Editor.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- **Monaco-powered editor** — same engine as VS Code, with syntax highlighting for ~70 languages, IntelliSense, bracket-pair colorization, and folding.
- **Auto language detection** — extension-based on load, then refined by [Magika](https://github.com/google/magika) on load, on save, and on paste, so highlighting tracks the actual content (paste minified JSON into a `.txt` and it becomes JSON automatically).
- **Beautify (JSON / SQL / XML)** — `Ctrl+Alt+Shift+M` (`Cmd+Alt+Shift+M` on macOS) pretty-prints the current selection (or whole document). Format auto-detected from buffer language and content.
- **Smart SQL formatter** — EF Core log–aware: paste a captured `info: Microsoft.EntityFrameworkCore...` block and the formatter strips the log scaffolding and pretty-prints the embedded SQL.
- **JSON Mighty preview pane** — `Ctrl+P` on a JSON buffer opens a live, tabbed inspector: Format · Repair (jsonrepair) · Diagram · Extract by path · Diff against another buffer · Schema (ajv-validated) · TS interfaces · Unescape.
- **Schema → ER diagram** — `Ctrl+Alt+Shift+K` transforms a Prisma / DBML / DDL schema in the active buffer into a fullscreen ER diagram with pan/zoom and foreign-key edges.
- **Compare with…** — right-click a tab → *Compare with* → pick another open buffer. Fullscreen diff overlay with side-by-side / unified views, inline word-level highlights, ignore-whitespace / ignore-case toggles, and patch copy-out.
- **Live preview panes** for Markdown (GFM + highlight.js), SQL execution plans (EF Core–aware analyzer), and CSV (virtualized TableLens for huge files). All open with `Ctrl+P`, follow the active buffer, and support fullscreen toggle.
- **Find / Replace / Find in Files** — regex, case, whole-word, and "Match X of Y" counter with vivid highlight.
- **Tab UX**
  - Double-click the tab bar to open a new untitled document.
  - Drag-to-reorder, middle-click to close, right-click for context actions (close others, copy path, *Compare with…*, reveal in file manager).
  - Undo-aware dirty flag — undoing back to the on-disk state clears the dot.
- **File-aware Save dialog** — when you save an untitled buffer, the dialog pre-selects the file type and appends the suggested extension based on the detected language.
- **In-app Settings** — theme, layout, editor options, and a full **Shortcuts editor** that lets you rebind any command and reset to defaults.
- **Welcome screen + What's New tab** — recent files + pinned actions on launch; auto-opened changelog after updates.
- **Plugin system** — VS Code-style extension manager; plugins load from `~/.config/notepad-and-more/plugins/`. Plugins can register commands and contribute menu items.
- **Native OS integration**
  - Registered for `Open With` on Windows and macOS for ~50 text/source extensions, and for the matching MIME types on Linux (rpm/deb).
  - Open files from Explorer / Finder / your Linux file manager; subsequent opens forward to the running instance.
  - Recent Files menu entries on Windows and macOS Dock.
- **Session restore** — buffers, cursor positions, view state, and workspace folder are restored on launch.
- **Auto-update** via electron-updater (GitHub Releases).

## Build from source

Requires Node.js 20+ and [pnpm](https://pnpm.io) 9 (the version is pinned in `package.json`; `corepack enable` picks it up automatically).

> **Use pnpm, not npm.** `.npmrc` sets `omit=optional` to skip an unused ~300 MB TensorFlow binary; under npm that also drops the platform binaries rollup and esbuild need, and the build fails with `Cannot find module '@rollup/rollup-<platform>'`.

```bash
git clone https://github.com/novapizza/novapad
cd novapad
pnpm install

pnpm run dev            # start with hot reload
pnpm run build          # compile (electron-vite)
pnpm run package:win    # produce dist/NovaPad-Setup-<version>.exe
pnpm run package:mac    # produce dist/NovaPad-<version>-mac-<arch>.zip + .dmg
pnpm run package:linux  # produce dist/NovaPad-<version>-linux-<arch>.{AppImage,rpm,deb}
```

### Linux packages

- **rpm / deb** — install with your package manager (`sudo dnf install ./NovaPad-*.rpm` or `sudo apt install ./NovaPad-*.deb`). Adds the app-menu entry, icons, `Open With` for text/source files, and the `novapad://` link handler.
- **AppImage** — single portable file (`chmod +x` and run). No menu entry or file associations unless you integrate it with a tool such as Gear Lever or AppImageLauncher.

Building the rpm/deb on Fedora needs `rpm-build` and `libxcrypt-compat` (electron-builder's bundled `fpm` links against `libcrypt.so.1`). Debian/Ubuntu hosts need `rpm` only if they also build the rpm.

## Tests

End-to-end tests run against the built app via Playwright + Electron driver.

```bash
pnpm run test:e2e          # build + run the full suite
pnpm run test:e2e:headed   # with a visible window
pnpm run test:e2e:report   # open the HTML report from the last run
```

> **Note:** if your shell has `ELECTRON_RUN_AS_NODE=1` exported (some Electron tooling sets this), the test fixture forcibly clears it before launching — otherwise `electron.exe` boots as plain Node and every test fails with "Process failed to launch!".

## Keyboard shortcuts (highlights)

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + N` | New file |
| `Ctrl/Cmd + O` | Open file |
| `Ctrl/Cmd + S` | Save (Save As when untitled) |
| `Ctrl/Cmd + Shift + S` | Save As |
| `Ctrl/Cmd + W` | Close tab |
| `Ctrl/Cmd + F` / `Ctrl/Cmd + H` | Find / Replace |
| `Ctrl/Cmd + Shift + F` | Find in Files |
| `Ctrl/Cmd + P` | Toggle preview pane (JSON / Markdown / SQL plan / CSV) |
| `Ctrl/Cmd + Alt + Shift + M` | Beautify (JSON / SQL / XML) |
| `Ctrl/Cmd + Alt + Shift + K` | Transform schema → ER diagram (Prisma / DBML / DDL) |
| `Ctrl/Cmd + Alt + Shift + C` | Remove duplicate lines |
| `Ctrl/Cmd + Shift + U` / `Ctrl/Cmd + Shift + L` | UPPERCASE / lowercase |
| `Ctrl/Cmd + /` | Toggle line comment |
| `Ctrl/Cmd + D` | Duplicate line |
| `Alt + Up/Down` | Move line up/down |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + Tab` / `Ctrl/Cmd + Shift + Tab` | Next / Previous tab |
| `Alt + Left/Right` | Navigation history back/forward |

The full list is in **Settings → Shortcuts**, where every binding is editable.

## Architecture

Three Electron processes:

- **Main** (`src/main/`) — Node.js backend. Native menu, file I/O with encoding detection (`chardet` + `iconv-lite`), session manager, plugin loader, file watcher, auto-updater.
- **Preload** (`src/preload/index.ts`) — Security bridge. Exposes a whitelist IPC API on `window.api`. Context isolation enabled, node integration disabled.
- **Renderer** (`src/renderer/src/`) — React frontend. Monaco editor wrapper, Zustand stores (`editorStore`, `uiStore`, `configStore`), tab bar, status bar, sidebar.

State boundaries:
- `editorStore` — buffers and active id; each buffer holds path/content/encoding/EOL/language/Monaco model/view state/dirty flag.
- `uiStore` — theme, layout toggles, dialog visibility, toast queue.
- `configStore` — persisted preferences in `~/.config/notepad-and-more/config/config.json`.

## Contributing

Pull requests welcome. Please run `pnpm run build` and the relevant test suite before submitting.

## License

[MIT](LICENSE) © NovaPad contributors
