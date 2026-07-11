import * as monaco from 'monaco-editor'
import { LOG_LIGHT_RULES, LOG_DARK_RULES } from './logLanguage'

// Notepad++ color palettes for Markdown and SQL — ported from
// notepad-plus-plus/PowerEditor/src/stylers.model.xml (SQL light),
// installer/themes/DarkModeDefault.xml (SQL dark), and
// bin/userDefineLangs/markdown._preinstalled[_DM].udl.xml (Markdown).
//
// Themes inherit from Monaco's `vs` / `vs-dark` so other languages keep
// their default colors — only Markdown and SQL tokens are remapped.

const LIGHT_RULES: monaco.editor.ITokenThemeRule[] = [
  // ---------- SQL (light) ----------
  { token: 'keyword.sql', foreground: '0000FF', fontStyle: 'bold' },
  { token: 'predefined.sql', foreground: '800080' },
  { token: 'number.sql', foreground: 'FF8000' },
  { token: 'string.sql', foreground: '808080' },
  { token: 'comment.sql', foreground: '008000' },
  { token: 'comment.quote.sql', foreground: '008000' },
  { token: 'operator.sql', foreground: '000080', fontStyle: 'bold' },
  { token: 'identifier.quote.sql', foreground: '808080' },

  // ---------- Markdown (light) ----------
  // Headers (# ## ###), setext underlines (===, ---), list bullets
  // Green to match Notepad++'s comment/header rendering.
  { token: 'keyword.md', foreground: '008000', fontStyle: 'bold' },
  // Bold **text** / __text__
  { token: 'strong.md', foreground: '000080', fontStyle: 'bold' },
  // Italic *text* / _text_
  { token: 'emphasis.md', foreground: '000080', fontStyle: 'italic' },
  // Code blocks / inline code
  { token: 'string.md', foreground: '008000' },
  // [link text](url) and reference links
  { token: 'string.link.md', foreground: '8000FF', fontStyle: 'italic' },
  { token: 'string.target.md', foreground: '8000FF' },
  { token: 'string.escape.md', foreground: '8080FF' },
  // HTML comments inside markdown
  { token: 'comment.md', foreground: '808080', fontStyle: 'italic' },
  // Tables
  { token: 'keyword.table.header.md', foreground: '000080', fontStyle: 'bold' },
  { token: 'keyword.table.left.md', foreground: '8080FF', fontStyle: 'bold' },
  { token: 'keyword.table.middle.md', foreground: '8080FF', fontStyle: 'bold' },
  { token: 'keyword.table.right.md', foreground: '8080FF', fontStyle: 'bold' },

  // ---------- Logs & traces (light) ----------
  ...LOG_LIGHT_RULES
]

const DARK_RULES: monaco.editor.ITokenThemeRule[] = [
  // ---------- SQL (dark — Notepad++ DarkModeDefault) ----------
  { token: 'keyword.sql', foreground: 'DFC47D', fontStyle: 'bold' },
  { token: 'predefined.sql', foreground: 'FF8080', fontStyle: 'bold' },
  { token: 'number.sql', foreground: '8CD0D3' },
  { token: 'string.sql', foreground: 'CC9393' },
  { token: 'comment.sql', foreground: '7F9F7F', fontStyle: 'italic' },
  { token: 'comment.quote.sql', foreground: '7F9F7F', fontStyle: 'italic' },
  { token: 'operator.sql', foreground: '9F9D6D', fontStyle: 'bold' },
  { token: 'identifier.quote.sql', foreground: '808080' },

  // ---------- Markdown (dark — Notepad++ preinstalled_DM) ----------
  // Headers in Notepad++ comment-green for parity with the light theme.
  { token: 'keyword.md', foreground: '7F9F7F', fontStyle: 'bold' },
  { token: 'strong.md', foreground: 'E3CEAB', fontStyle: 'bold' },
  { token: 'emphasis.md', foreground: 'E3CEAB', fontStyle: 'italic' },
  { token: 'string.md', foreground: 'CEDF99' },
  { token: 'string.link.md', foreground: 'EDD6ED', fontStyle: 'italic' },
  { token: 'string.target.md', foreground: 'EDD6ED' },
  { token: 'string.escape.md', foreground: 'DFC47D' },
  { token: 'comment.md', foreground: '7F9F7F', fontStyle: 'italic' },
  { token: 'keyword.table.header.md', foreground: 'E3CEAB', fontStyle: 'bold' },
  { token: 'keyword.table.left.md', foreground: 'DFC47D', fontStyle: 'bold' },
  { token: 'keyword.table.middle.md', foreground: 'DFC47D', fontStyle: 'bold' },
  { token: 'keyword.table.right.md', foreground: 'DFC47D', fontStyle: 'bold' },

  // ---------- Logs & traces (dark — Zenburn-aligned) ----------
  ...LOG_DARK_RULES
]

// ---------- Dracula (dark) ----------
// Official Dracula palette (https://draculatheme.com, MIT). Applied in dark
// mode to match the new logo's magenta/violet identity. Editor background
// (#282a36) is kept in sync with the app chrome in tailwind.css so the editor
// and its surrounding panels read as one surface.
const DRACULA_RULES: monaco.editor.ITokenThemeRule[] = [
  { token: '', foreground: 'f8f8f2', background: '282a36' },
  { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
  { token: 'string', foreground: 'f1fa8c' },
  { token: 'string.key.json', foreground: '8be9fd' },
  { token: 'string.value.json', foreground: 'f1fa8c' },
  { token: 'number', foreground: 'bd93f9' },
  { token: 'constant', foreground: 'bd93f9' },
  { token: 'constant.language', foreground: 'bd93f9' },
  { token: 'regexp', foreground: 'ff5555' },
  { token: 'keyword', foreground: 'ff79c6' },
  { token: 'operator', foreground: 'ff79c6' },
  { token: 'storage', foreground: 'ff79c6' },
  { token: 'type', foreground: '8be9fd', fontStyle: 'italic' },
  { token: 'type.identifier', foreground: '8be9fd' },
  { token: 'namespace', foreground: '8be9fd', fontStyle: 'italic' },
  { token: 'function', foreground: '50fa7b' },
  { token: 'identifier', foreground: 'f8f8f2' },
  { token: 'variable', foreground: 'f8f8f2' },
  { token: 'variable.parameter', foreground: 'ffb86c', fontStyle: 'italic' },
  { token: 'delimiter', foreground: 'f8f8f2' },
  { token: 'delimiter.bracket', foreground: 'f8f8f2' },
  { token: 'tag', foreground: 'ff79c6' },
  { token: 'metatag', foreground: 'ff79c6' },
  { token: 'attribute.name', foreground: '50fa7b', fontStyle: 'italic' },
  { token: 'attribute.value', foreground: 'f1fa8c' },
  // Keep log-file highlighting working under Dracula.
  ...LOG_DARK_RULES
]

const DRACULA_COLORS: monaco.editor.IColors = {
  'editor.background': '#282a36',
  'editor.foreground': '#f8f8f2',
  'editor.lineHighlightBackground': '#44475a40',
  'editor.selectionBackground': '#44475a',
  'editor.selectionHighlightBackground': '#424450',
  'editor.wordHighlightBackground': '#8be9fd30',
  'editor.findMatchBackground': '#ffb86c66',
  'editor.findMatchHighlightBackground': '#ffb86c44',
  'editorCursor.foreground': '#f8f8f0',
  'editorWhitespace.foreground': '#424450',
  'editorLineNumber.foreground': '#6272a4',
  'editorLineNumber.activeForeground': '#f8f8f2',
  'editorIndentGuide.background': '#424450',
  'editorIndentGuide.activeBackground': '#6272a4',
  'editorBracketMatch.background': '#44475a',
  'editorBracketMatch.border': '#bd93f9'
}

let registered = false

export function registerNppThemes(): void {
  if (registered) return
  registered = true

  monaco.editor.defineTheme('npp-light', {
    base: 'vs',
    inherit: true,
    rules: LIGHT_RULES,
    colors: {}
  })

  monaco.editor.defineTheme('npp-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: DARK_RULES,
    colors: {}
  })

  monaco.editor.defineTheme('dracula', {
    base: 'vs-dark',
    inherit: true,
    rules: DRACULA_RULES,
    colors: DRACULA_COLORS
  })
}

export function nppThemeName(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? 'dracula' : 'npp-light'
}
