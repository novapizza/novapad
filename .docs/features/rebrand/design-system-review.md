# NovaPad — Design System Review & Rebrand Proposal

Review of the current color system and a proposed palette derived from the new
logo (`N_nova_bracket_gradient_thin`). **Nothing is changed yet** — this doc is
for review. Once you pick a direction, the actual token edits are a small,
contained change.

---

## 1. Where colors live today

| Layer | File | Notes |
|---|---|---|
| **Source of truth** — all app-chrome colors | `src/renderer/src/styles/tailwind.css` | HSL CSS variables under `:root` (light) and `.dark`. This is the one place a rebrand mostly touches. |
| Token → Tailwind name mapping | `tailwind.config.ts` | Maps `--primary` → `bg-primary`, etc. (shadcn convention). No literal colors. |
| Editor (Monaco) theme | `src/renderer/src/utils/monacoThemes.ts` | Inherits `vs` / `vs-dark` with `colors: {}` — editor chrome (cursor, selection, line highlight) uses **Monaco defaults**, NOT our accent. SQL/Markdown token colors are Notepad++ ports (hardcoded hex). **Out of scope** for an accent rebrand. |
| JSON preview syntax | `--tok-*` vars in `tailwind.css` | `--tok-key` currently shares the blue hue (215). |
| Markdown preview code (dark) | `tailwind.css` `.hljs-*` rules | Hardcoded Material-ish hex; independent of accent. |
| App icon / installer | `resources/icons/`, `electron-builder.yml`, `src/renderer/index.html` favicon | Logo assets — replaced separately (see §5). |

**Key takeaway:** the entire app accent is a single blue hue — **HSL hue 215** — repeated across ~15 tokens. Rebranding = shifting that hue (and a few saturations/lightnesses) to the logo's magenta/purple.

---

## 2. Current palette (the blue accent)

Every accent token today is hue **215** (blue):

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--primary` / `--accent` / `--ring` | `215 80% 50%` | `215 80% 55%` | buttons, active tab underline, focus rings, links |
| `--statusbar` | `215 80% 50%` | `215 80% 40%` | bottom status bar background (white text) |
| `--sidebar-primary` / `-ring` | `215 80% 50%` | `215 80% 55%` | sidebar active items |
| `--explorer-hover` | `215 60% 90%` | `215 40% 22%` | file-tree hover row |
| `--explorer-active` / `--sidebar-accent` | `215 80% 95%` / `215 60% 90%` | `215 50% 25%` / `215 40% 22%` | file-tree selected row |
| `--line-highlight` | `215 60% 95%` | `215 30% 18%` | current-line background |
| `--tok-key` (JSON) | `215 80% 40%` | `213 95% 78%` | JSON keys in preview |

Neutrals (background, foreground, border, muted, tabs, gutter) are hue **220** — a near-neutral cool gray.

---

## 3. New logo palette (extracted from the SVG)

| Role | Hex | HSL | Tailwind ≈ |
|---|---|---|---|
| **"N" gradient — light** | `#f0abfc` | `292 88% 83%` | fuchsia-300 |
| **"N" gradient — core** | `#e879f9` | `292 91% 73%` | fuchsia-400 |
| **"N" gradient — deep** | `#a855f7` | `271 91% 65%` | purple-500 |
| **Brackets `{ }` — light** | `#c4b5fd` | `252 95% 85%` | violet-300 |
| **Brackets `{ }` — deep** | `#8b5cf6` | `258 90% 66%` | violet-500 |
| **Sparkle** | `#ffd6f5` → `#e879f9` | pink → fuchsia | — |
| **Icon background** | `#221c30 → #171622 → #0c0a12` | `~255 24% 6–15%` | very dark violet-black |
| **Rainbow border** | `#4a9eff→#10c99a→#f2a83a→#f26d70→#a678f0` | blue→teal→amber→coral→purple | accent gradient (optional use) |

**Brand read:** the hero is **fuchsia/magenta (`#e879f9`)** for the "N", supported by **violet (`#8b5cf6`)** in the brackets, on a **dark violet-black** ground.

---

## 4. Proposed accent — two directions

Both keep the neutral grays but can add a faint violet tint (shift neutral hue 220 → ~258) so the dark theme echoes the logo's purple-black ground.

### Option A — Fuchsia-forward (recommended, matches the hero "N")

Primary hue ≈ **292** (fuchsia). Vivid, distinctive, unmistakably the logo.

| Token | Light | Dark |
|---|---|---|
| `--primary` / `--accent` / `--ring` | `292 72% 50%` | `292 82% 66%` |
| `--statusbar` | `292 72% 46%` | `292 60% 40%` |
| `--sidebar-primary` / `-ring` | `292 72% 50%` | `292 82% 66%` |
| `--explorer-hover` | `292 55% 92%` | `285 35% 22%` |
| `--explorer-active` / `--sidebar-accent` | `292 70% 95%` | `285 45% 26%` |
| `--line-highlight` | `292 60% 96%` | `285 28% 18%` |
| `--tok-key` | `292 60% 45%` | `292 85% 80%` |

### Option B — Violet-forward (matches the brackets, calmer)

Primary hue ≈ **262** (violet). Softer, less "hot" than fuchsia; closer to the current blue's energy.

| Token | Light | Dark |
|---|---|---|
| `--primary` / `--accent` / `--ring` | `262 72% 55%` | `262 80% 70%` |
| `--statusbar` | `262 70% 50%` | `262 55% 42%` |
| (other tokens follow the same hue shift) | | |

> **Contrast note:** the status bar and primary buttons paint **white text on the accent**. Fuchsia/violet need to stay dark enough in light mode (L ≈ 46–50%) for readable white text (WCAG AA ≈ 4.5:1). The values above are tuned for that; the dark-mode accent is intentionally lighter (bg is dark) — I'll verify each with a contrast check before applying.

**A hybrid is also possible:** fuchsia `--primary` for the punchy hero accent + violet `--ring`/hover for a softer secondary — mirroring the logo (fuchsia "N" + violet brackets).

---

## 5. Logo / icon replacement

Provided: `N_nova_bracket_gradient_thin.svg` + `.png` (1024²) in `~/Downloads/files`.

| Target | Current | Action |
|---|---|---|
| macOS app icon | `resources/icons/*.icns` | regenerate `.icns` from the 1024² PNG |
| Windows app icon | `resources/icons/*.ico` | regenerate multi-size `.ico` |
| Linux / general | `resources/icons/*.png` | replace with the new PNG |
| In-app logo (title bar "N+" mark, About, Welcome) | current SVG/mark | swap to the new SVG |
| Favicon (`index.html`) | current | point at the new asset |
| Artifact/build refs | `electron-builder.yml` | verify icon paths still resolve |

I'll enumerate exact icon files and the generation commands (e.g. `iconutil` / an `.ico` tool) when we do this step.

---

## 6. Suggested order

1. **You pick:** Option A / B / hybrid, and whether to add the faint violet tint to neutrals.
2. Apply the token edits to `tailwind.css` (light + dark), run a contrast check on white-on-accent surfaces.
3. Swap logo/icon assets (§5).
4. Verify in-app (light + dark) and rebuild.
5. Add a CHANGELOG `Changed` entry + release-notes highlight (per the repo rule), then this all ships under **1.5.8**.

---

## Open questions

1. **Option A, B, or hybrid?** (My recommendation: **A**, fuchsia-forward — it's the most recognizable tie to the logo.)
2. **Tint the neutrals** violet, or keep them neutral gray? (Recommendation: a *very* subtle tint on dark only — hue 220 → ~250 — so it feels cohesive without going "all purple".)
3. Keep the JSON `--tok-key` on the new accent hue, or leave syntax colors alone? (Recommendation: shift it too, for consistency.)
4. Should the Monaco editor selection/line-highlight also pick up the accent (currently Monaco defaults), or stay neutral? (Recommendation: leave Monaco default — recoloring the editor interior is a larger, riskier change.)
