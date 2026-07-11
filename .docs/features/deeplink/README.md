# NovaPad Deeplinks (`novapad://`)

Open a remote text file (md, json, log, …) in NovaPad as a **read-only tab** by clicking a
link — the primary use case is internal tools posting file links into Slack.

## URL formats

```
novapad://open?url=<https-url>[&line=N][&col=M]      # fetch → read-only tab
novapad://preview?url=<https-url>[&line=N][&col=M]   # same, opens the preview pane
novapad://new?title=…&content=…&lang=…               # new editable tab, inline content
```

### `open` / `preview`

| Param | Required | Notes |
|---|---|---|
| `url` | yes | `https://` only. URL-encode it when embedding in another URL. |
| `line`, `col` | no | 1-based cursor position to jump to after opening. |

`preview` behaves exactly like `open` (fetch, read-only) but also opens the right-side
preview pane. The pane is chosen automatically from the file type (markdown / json / csv /
SQL plan); if the file isn't previewable it opens in the editor with a notice.

Example:

```
novapad://open?url=https%3A%2F%2Ftools.company.io%2Freports%2Fanalysis.md&line=42
novapad://preview?url=https%3A%2F%2Ftools.company.io%2Freports%2Fanalysis.md
```

### `new` — inline content ("Send to NovaPad")

Opens a **new editable, untitled tab** whose content is carried in the URL — no server
fetch, no host, no allowlist prompt. Use it when a web app wants to hand text to NovaPad.

| Param | Required | Notes |
|---|---|---|
| `content` | one of | URL-encoded text (use `%0A` for newlines). |
| `contentBase64` | one of | base64 of UTF-8 text — preferred for large or unicode-heavy payloads. Wins over `content` if both present. |
| `title` | no | Tab name; `/`, `\`, and control chars are stripped. Its extension drives syntax highlighting when `lang` is absent. Defaults to `untitled`. |
| `lang` | no | Monaco language id (e.g. `json`, `typescript`). Ignored if unknown. |

The tab opens **dirty** (unsaved) so the user is prompted before it can be lost. Content is
capped at 5 MB after decode. Example:

```
novapad://new?title=snippet.json&lang=json&content=%7B%22ok%22%3Atrue%7D
```

## Behavior

- The file is downloaded in NovaPad's main process (**10 MB cap, 15 s timeout**) and shown
  in a read-only tab with syntax highlighting from the file extension. Content is decoded
  as UTF-8; binary files are rejected.
- **First time a host is seen**, NovaPad shows a confirmation dialog (Open / Cancel /
  Always Allow). "Always Allow" persists the host to
  `<userData>/config/deeplink.json` (`{ "allowedHosts": [...] }`).
- Redirects are followed only to https URLs on already-trusted hosts.
- The tab is view-only: **File → Save As** creates a normal editable local copy. Deeplink
  tabs are not restored across app restarts.
- Same `url` clicked twice focuses the existing tab instead of opening a duplicate.

## For tool teams: posting links in Slack

Slack does not reliably linkify custom schemes, so post a normal `https://` link to a tiny
**handoff page** your team hosts, which redirects to the `novapad://` URL:

```html
<!-- open-in-novapad.html — host anywhere on the internal network -->
<!doctype html>
<meta charset="utf-8">
<title>Opening in NovaPad…</title>
<p id="msg">Opening in NovaPad…</p>
<script>
  const target = new URLSearchParams(location.search).get('url')
  const params = new URLSearchParams(location.search)
  if (target && /^https:\/\//.test(target)) {
    const deeplink = new URL('novapad://open')
    deeplink.searchParams.set('url', target)
    for (const k of ['line', 'col']) if (params.get(k)) deeplink.searchParams.set(k, params.get(k))
    location.href = deeplink.toString()
    document.getElementById('msg').innerHTML =
      'If nothing happened, NovaPad may not be installed. <a href="https://github.com/novapizza/notepadandmore/releases/latest">Download it here</a>.'
  } else {
    document.getElementById('msg').textContent = 'Missing or invalid ?url= parameter (https only).'
  }
</script>
```

Then a Slack message links to:

```
https://tools.company.io/open-in-novapad.html?url=https%3A%2F%2Ftools.company.io%2Freports%2Fanalysis.md&line=42
```

Requirements for the file server: reachable from the user's machine (VPN/LAN), serves the
file over **https without authentication**, response is text (no NUL bytes) and ≤ 10 MB.

## Security model

Deeplinks are untrusted input — any web page can fire `novapad://`. Controls:

- `https:` targets only; URLs with embedded credentials are rejected; no local paths.
- Per-host allowlist with an explicit user confirmation dialog for unknown hosts.
- Redirects re-validated against the trusted host set.
- Content is only ever displayed as text in a read-only Monaco buffer — never executed,
  rendered, or written to disk without an explicit Save As.

## Implementation map

- `src/main/deeplink.ts` — parse/validate, allowlist, fetch, dispatch.
- `src/main/index.ts` — protocol registration, `open-url` (macOS), argv extraction
  (Windows/Linux cold start + `second-instance`), renderer-ready message queue.
- `electron-builder.yml` — `protocols:` section (macOS plist + NSIS registry).
- Renderer: `deeplink:open` IPC → `useFileOps.openRemoteFile` → read-only buffer
  (`Buffer.isReadOnly` / `Buffer.sourceUrl`), lock icon in TabBar, "Read-only" in StatusBar.
  `preview` sets `payload.preview` and the handler flips `showPreview` after the tab binds.
- Renderer: `deeplink:new` IPC → `useFileOps.openInlineContent` → new editable dirty buffer
  (no fetch, no `sourceUrl`).

## Testing without a packaged build

OS-level scheme registration needs an installed build, but on macOS dev you can trigger a
running dev app via `open "novapad://open?url=..."` after the first launch registers the
handler; on Windows run the packaged portable exe once. The dispatch layer can also be
tested by sending the `deeplink:open` IPC payload directly (E2E).
