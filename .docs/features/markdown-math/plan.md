# Plan: LaTeX math in Markdown preview

Decisions: see `raw/notes.md`. Status: implemented 2026-11-17.

## Changes

| File | Change |
|---|---|
| `src/renderer/src/lib/markdown/math.ts` (new) | `remarkMathPlugin(singleDollar)`, `REHYPE_MATH_PLUGINS` (block wrap + KaTeX), KaTeX CSS import |
| `components/MarkdownPreview/MarkdownPreviewPane.tsx` | Math plugins before highlight; setting-driven remark arrays; search skips `.katex-mathml`; math blocks open the multi-line editor |
| `components/MarkdownPreview/sourceRange.ts` | `div.math-block` is an editable block |
| `components/AiAssistant/AiMessage.tsx` | Same math plugins |
| `store/configStore.ts`, `SettingsTab.tsx` | `mdMathSingleDollar` (default `true`) + checkbox under Editor |
| `utils/exportDoc.ts` | Export CSS: hide KaTeX HTML, show native MathML |
| `styles/tailwind.css` | Wide display formulas scroll horizontally |
| deps | `katex@0.16.22`, `remark-math@6.0.0`, `rehype-katex@7.0.1` (pinned) |

## Tests

- Unit `tests/unit/markdownMath.test.ts`: inline/display/```math, setting off, `\$`, block source
  range, bad LaTeX, `\href` blocked.
- E2E `tests/md-preview-edit.spec.ts`: step "LaTeX renders; double-click a formula edits its $$ block".
