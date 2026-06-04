import type { ReactNode } from 'react'

/**
 * Per-version "What's New" content map.
 *
 * Each release gets its own entry here. The WhatsNewTab looks up the running
 * app version (window.api.app.getVersion()) and renders the matching entry —
 * so shipping new notes is just adding an object to the TOP of RELEASE_NOTES,
 * no component edits required.
 *
 * IMPORTANT — add a new entry for every release. Bodies are ReactNode, so use
 * JSX freely (bold lead-ins, <span className="font-mono"> for sizes/paths,
 * links, etc.). Keep the array sorted newest-first; getReleaseNote() treats
 * RELEASE_NOTES[0] as the latest.
 */

export interface ReleaseHighlight {
  /** Bold lead-in label, rendered with a trailing colon. */
  title: string
  /** Free-form description. JSX allowed. */
  body: ReactNode
}

export interface ReleaseNote {
  /** Must match the value app.getVersion() reports for this release. */
  version: string
  /** One-paragraph intro shown above the highlight list. */
  summary: ReactNode
  highlights: ReleaseHighlight[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.5.0',
    summary: (
      <>
        Search leveled up. The Find Results panel now behaves like VSCode&apos;s search tree —
        keyboard navigation, inline file actions, and Notepad++-style line copying — and every
        search mode picks up the text you have selected.
      </>
    ),
    highlights: [
      {
        title: 'New Encoding menu',
        body: (
          <>
            A dedicated <span className="font-mono text-sm">Encoding</span> menu joins the menu bar.
            Set the active document&apos;s encoding —{' '}
            <span className="font-mono text-sm">UTF-8</span>,{' '}
            <span className="font-mono text-sm">UTF-8 with BOM</span>,{' '}
            <span className="font-mono text-sm">UTF-16 LE/BE</span>,{' '}
            <span className="font-mono text-sm">Windows-1252</span>, or{' '}
            <span className="font-mono text-sm">ISO-8859-1</span> — and convert line endings between{' '}
            <strong>Windows (CRLF)</strong>, <strong>Unix (LF)</strong>, and{' '}
            <strong>Macintosh (CR)</strong>, all from the menu. It stays in sync with the
            click-to-change encoding and EOL controls in the status bar.
          </>
        )
      },
      {
        title: 'Menu bar cleanup',
        body: (
          <>
            Removed the <span className="font-mono text-sm">Macro</span> menu, which was a
            non-functional placeholder. Macro recording was never wired up, so the menu only ever
            showed disabled entries — it&apos;s gone until the feature actually ships.
          </>
        )
      },
      {
        title: 'Copy from Find Results',
        body: (
          <>
            Select result lines in the Find Results panel — click,{' '}
            <span className="font-mono text-sm">Ctrl/⌘+Click</span> to toggle,{' '}
            <span className="font-mono text-sm">Shift+Click</span> for a range — and copy their full
            line text with <span className="font-mono text-sm">Ctrl/⌘+C</span>, or right-click for{' '}
            <strong>Copy Selected</strong>, <strong>Copy All</strong>, and{' '}
            <strong>Select All</strong>, just like Notepad++.
          </>
        )
      },
      {
        title: 'Search shortcuts respect your selection',
        body: (
          <>
            The selected text now prefills the search field for{' '}
            <span className="font-mono text-sm">Find in Files</span> (
            <span className="font-mono text-sm">Ctrl/⌘+Shift+F</span>) and when switching modes
            while the dialog is already open — not just for Find. Plus a new{' '}
            <span className="font-mono text-sm">Search → Mark...</span> menu entry (
            <span className="font-mono text-sm">Ctrl+M</span> on Windows/Linux) opens the Mark tab
            directly.
          </>
        )
      },
      {
        title: 'Find Results panel, VSCode style',
        body: (
          <>
            Navigate results with the <span className="font-mono text-sm">arrow keys</span> — ↑/↓
            move through rows, ←/→ collapse/expand file groups, <span className="font-mono text-sm">Enter</span>{' '}
            opens the hit. Hover a file header for inline <strong>Open file</strong> and{' '}
            <strong>Dismiss</strong> actions, and the right-click menu gained{' '}
            <strong>Copy Path</strong>, <strong>Open File</strong>, and <strong>Dismiss</strong>.
          </>
        )
      }
    ]
  },
  {
    version: '1.4.0',
    summary: (
      <>
        A new <span className="font-mono text-sm">Tools</span> menu turns NovaPad into a handy
        developer toolbox — hashing plus a set of everyday encoders, converters, and generators,
        all without leaving the editor.
      </>
    ),
    highlights: [
      {
        title: 'New Tools menu',
        body: (
          <>
            A built-in developer toolbox: <span className="font-mono text-sm">MD5</span> /
            <span className="font-mono text-sm"> SHA-1</span> /
            <span className="font-mono text-sm"> SHA-256</span> /
            <span className="font-mono text-sm"> SHA-512</span> hashing (of typed text, picked
            files, or the current selection straight to the clipboard), plus a unified panel with a
            UUID/ULID generator, epoch &amp; color converters, a cron builder, a Lorem Ipsum
            generator, and JWT / URL / CSP utilities. Find it under <span className="font-mono text-sm">Tools</span>.
          </>
        )
      }
    ]
  },
  {
    version: '1.3.0',
    summary: (
      <>
        A big maintenance and polish drop. The installer is dramatically smaller, your unsaved
        scratch tabs survive a crash, file associations actually work, and the plugin system grew
        up. Less ceremony, more editing.
      </>
    ),
    highlights: [
      {
        title: 'Slimmer installer',
        body: (
          <>
            A round of bundle-excludes (TensorFlow, Monaco, Magika, and friends) shrank both
            builds — the Windows NSIS dropped from
            <span className="font-mono text-sm"> 254&nbsp;MB</span> to
            <span className="font-mono text-sm"> 93&nbsp;MB</span> (-63%), and the macOS dmg
            slimmed down by the same cuts. Your bandwidth and your SSD both said thanks.
          </>
        )
      },
      {
        title: 'Notepad++-style snapshot & restore',
        body: (
          <>
            Unsaved buffers are persisted to disk and brought back exactly as you left them after a
            relaunch — even untitled scratch tabs, even after a crash.
          </>
        )
      },
      {
        title: 'File associations & Open With',
        body: (
          <>
            Register the app as a handler for common text formats. Windows "Open with / Edit with"
            and macOS "Open With → NovaPad" both surface NovaPad in the OS file menu.
          </>
        )
      },
      {
        title: 'Auto-update',
        body: (
          <>
            Built on electron-updater — new versions land in the background and prompt you to
            restart, no more manual installer hunts.
          </>
        )
      },
      {
        title: 'Plugin Manager, redesigned',
        body: (
          <>
            Plugins now live in a full VS&nbsp;Code-style page (not a tiny dialog), with a dedicated
            detail view per plugin.
          </>
        )
      },
      {
        title: 'Smarter file detection',
        body: (
          <>
            Google's Magika ML model identifies file types by content, not extension — so a
            mislabeled
            <span className="font-mono text-sm"> .txt</span> still gets the right syntax
            highlighting.
          </>
        )
      },
      {
        title: 'TableLens CSV viewer',
        body: (
          <>
            Open a<span className="font-mono text-sm"> .csv</span> and get a real table view with
            sorting and column sizing — no more squinting at commas.
          </>
        )
      },
      {
        title: 'Beautify everywhere',
        body: (
          <>
            Format JSON, SQL, and XML alongside the existing formatters. Paste detection now figures
            out the language for you.
          </>
        )
      },
      {
        title: 'Quality of life',
        body: (
          <>
            Full file path in the status bar, double-click the tab strip to open a new document, and
            a pile of dialog and session-restore fixes you'll only notice because nothing breaks.
          </>
        )
      }
    ]
  }
]

/**
 * Resolve the release note to display for a given app version.
 *
 * Exact version match first. When there's no entry for the running version
 * (a release that forgot to add notes, or test mode where getVersion() returns
 * the Electron binary version), fall back to the newest entry so the tab is
 * never blank. Returns undefined only if the map is empty.
 */
export function getReleaseNote(version: string): ReleaseNote | undefined {
  if (RELEASE_NOTES.length === 0) return undefined
  return RELEASE_NOTES.find((note) => note.version === version) ?? RELEASE_NOTES[0]
}
