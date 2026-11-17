# Decision Notes: LaTeX math in Markdown preview

Date: 2026-11-17

## Core idea

Render LaTeX formulas (`$…$`, `$$…$$`, ```` ```math ````) in the Markdown preview, using
`remark-math` + `rehype-katex` (KaTeX) on top of the existing `react-markdown` pipeline.

## Decisions

### 1. Engine: KaTeX (not MathJax)
Synchronous, ~280 KB JS + 23 KB CSS, fonts bundled locally (~250 KB woff2, loaded per glyph set on
demand). No CSP change: everything is served from `'self'`. MathJax is larger and async, which fights
the debounced synchronous re-render the preview already does.

### 2. Single-dollar inline math: a setting, default **on**
`remark-math` has no "looks like money" rule: `costs $5 and $10` renders `5 and ` as a formula.
Options weighed: always on (GitHub/Obsidian/Typora/VS Code behavior), never (safe for prices, breaks
inline math in files written elsewhere), or a toggle.
**Chosen:** toggle `mdMathSingleDollar` (Settings → Editor, "Treat $…$ as inline math"), default on.
`\$` always gives a literal dollar. Off = only `$$…$$` and ```` ```math ````.

### 3. Also in the AI Assistant chat
Models answer math questions with `$…$`, and the chat already uses react-markdown. Same plugins, same
setting. KaTeX runs with `trust: false`, `maxSize: 100`, `maxExpand: 1000`, so untrusted model output
or downloaded `.md` cannot render links (`\href`), images or custom classes, or blow up layout.

### 4. Edit-in-preview covers formulas
`rehype-katex` replaces a display-math `<pre>` with output that has no source position. A small plugin
(`rehypeMathBlockWrap`) wraps it first in `div.math-block`, which keeps the position, so double-click
edits the whole `$$…$$` block (multi-line editor: Enter = newline, Ctrl+Enter saves). Inline math is
edited with its paragraph.

### 5. Exports use native MathML
Exported HTML/PDF have no KaTeX CSS/fonts. Export CSS hides `.katex-html` and shows the MathML copy
KaTeX already emits; Chromium draws it natively. No fonts embedded, file stays small.

### 6. Find-in-preview skips the hidden MathML copy
Otherwise every formula would produce invisible duplicate matches.
