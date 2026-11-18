# NovaPad Light vs Claude desktop light theme

**Status:** for review. Nothing has been implemented yet.
**Date:** 2026-11-18

## Why this exists

We put NovaPad Light next to the Claude desktop app's light theme (its Settings screen). Claude's version looks cleaner and calmer. This document lists what is actually different, so we can agree on a direction before changing any tokens.

## How the comparison was made

- Colours were sampled pixel by pixel from one screenshot of each app, taken on Windows at the same zoom.
- Our values were checked against the tokens in `src/renderer/src/styles/tailwind.css`, `tailwind.config.ts` and `src/renderer/src/utils/monacoThemes.ts`.
- The Claude screen is a settings page and ours is an editor, so layout density is only partly comparable. Colours, lines, corners and type are directly comparable.

## Summary

Claude's light theme is almost colourless: pure greys, one surface colour, and a single accent used once per screen. NovaPad Light tints every grey purple, paints the app frame a different colour from the content, and uses fuchsia for most states.

## Differences, biggest first

### 1. Claude's greys are pure grey; ours are tinted purple

Every Claude grey has equal red, green and blue values. Every one of ours leans purple (hue 250, 13–33% saturation). On a white background that reads as slightly lavender or dirty instead of clean.

| Role | Claude | NovaPad Light |
|---|---|---|
| Main text | `#191919` | `#1c1830` (purple-navy) |
| Secondary text | `#666666` | `#5c5671` |
| Hover / quiet fill | `#f2f2f2` | `#f6f5fa` |
| Selected fill | `#e5e5e5` | about `#ebe0f2` (`--explorer-active`, 281 42% 92.5%) |
| Structural border | `#e5e5e5` | `#e2e1e8` |
| Input / search fill | `#f3f3f3` | `#efedf6` |

### 2. Claude's app frame is the same white as its content; ours is a different colour

In Claude, the sidebar and the main area are both `#ffffff`, separated only by a hairline. Our toolbar, tab bar, status bar, explorer and sidebar all use `--toolbar` (`#f6f5fa`), so the frame looks like a separate tinted block around the editor. Claude uses grey only to show a state (hover, selected, input), never to fill an area.

### 3. Claude uses its accent colour once per screen; we use ours everywhere

The only colour on Claude's screen is the blue toggle (`#247de0`). Selection is shown in grey. We use fuchsia `#a21caf` for:

- the active tab's top bar
- the cursor
- text selection
- focus rings
- primary buttons
- `--accent` (a pink hover, 296 48% 94%)
- `--explorer-active` / `--sidebar-accent` (a lilac selected state)

Because hover and selected are both pinkish, the accent no longer stands out where it matters.

### 4. Claude has two weights of line; we have one

Claude uses `#e5e5e5` for structural edges (header, sidebar) and a much fainter `#f3f3f3` between rows. We use `--border` (`#e2e1e8`) everywhere, including between every inactive tab, and inputs get a darker `--input` (83.9% lightness). All our lines look equally important, so the screen feels busier.

### 5. Claude's corners are rounder, and our smallest radius works out to zero

- Claude rounds nav items, the search pill and the segmented control by about 8px.
- Our `--radius` is `0.25rem`. Because `html { font-size: 13px }`, that is 3.25px, which gives:
  - `rounded-lg` = 3.25px
  - `rounded-md` = 1.25px
  - `rounded-sm` = `calc(3.25px - 4px)`, which is negative and renders as square corners.

The last point looks like a bug as well as a style difference (see `borderRadius` in `tailwind.config.ts`).

### 6. Claude's text is larger and uses the system font

Claude uses the Windows system font (Segoe UI) at about 14px, with 15px semibold section headings. We use Inter at 13px for everything. On Windows ClearType, Inter at 13px renders thinner and softer than Segoe UI. Our `-webkit-font-smoothing: antialiased` setting only affects macOS, so it does not help here. Claude also has a clear three-level hierarchy: heading, then `#191919` label, then `#666666` description.

### 7. Claude's scrollbar track is invisible; ours is a coloured stripe

Our scrollbar track is `hsl(var(--muted))`, a lavender stripe the full height of the pane (the global `::-webkit-scrollbar` and `.editor-scrollbar` rules in `tailwind.css`). Claude shows no track, only a thin grey thumb (`#b0b0b0`).

### 8. Claude has more spacing

Claude's settings rows are about 48–56px tall with generous padding. Our chrome is about 30px per tab with tight spacing. An editor should be denser than a settings page, but our tabs and toolbar are tighter than they need to be.

### 9. The editor area itself is close

Both have white backgrounds, and our line highlight (`#f6f6f7`) is almost neutral. The remaining tint is in the Monaco `novapad-light` theme: `editor.foreground` `#1c1830`, line numbers `#8a85a0`, and widget borders `#dedce6`.

## Root causes

Most of the nine items come from four token decisions:

| Cause | Items it explains |
|---|---|
| Hue 250 is built into every neutral token (`--muted`, `--border`, `--toolbar`, `--tab-*`, `--explorer-*`, `--sidebar-*`, and the Monaco light colours) | 1, 4, 7, 9 |
| The frame tokens differ from `--background` | 2 |
| The accent is used for states, not only for emphasis (`--accent`, `--explorer-active`, `--sidebar-accent`) | 3 |
| `--radius` is small, and 1rem is 13px | 5 |

## Decisions needed from reviewers

1. **Neutral or faintly tinted?** Should NovaPad Light go fully neutral like Claude, or keep a faint brand tint (for example 1–2% saturation)? This one choice sets the values for items 1, 2, 4, 7 and 9.
2. **Where does fuchsia stay?** Our proposal is to keep it for the cursor, focus ring, primary buttons and the active-tab marker, and to show hover and selected states in grey.
3. **Should the frame match the content?** That means toolbar, tab bar, status bar and sidebar on white, separated by hairlines.
4. **Type:** keep Inter, or switch the app UI to the system font? Keep 13px, or move to 14px?
5. **Radius:** raise `--radius` (for example to 6–8px) and fix the `rounded-sm` calculation.

Once these are agreed, the changes are mostly token edits in `tailwind.css` and `monacoThemes.ts`, plus the radius scale in `tailwind.config.ts`.

## Review outcome

First review round, 2026-11-18. The reviewer commented on items 5, 6 and 8; the notes below record what was agreed and what still needs checking.

### Item 6 (type): keep Inter, raise to 14px — agreed

- **Keep Inter.** Inter is bundled with the app (`@fontsource/inter` 400/500/600, imported in `src/renderer/src/main.tsx`), so text renders the same on Windows and macOS. Switching to the system font would mean Segoe UI on Windows and SF Pro on macOS. Text widths would then differ by platform: buttons may need to be wider or narrower, and a tab title may be cut off on one platform but not the other. Each layout would need tuning twice. This replaces the system-font suggestion in item 6.
- **Raise the size to 14px.** Note: 13px is set on `html` (`tailwind.css`), and Tailwind measures all spacing from it, so 1rem = 13px today. Changing it to 14px makes all padding, gaps, heights and rem-based radii about 8% bigger, not just the text.
  - If that is wanted, it also covers most of item 8.
  - If only the text should grow, the text sizes must change without changing `html`. This needs a deliberate choice.

### Item 8 (spacing): more toolbar padding, editor stays compact — agreed

The tab bar and toolbar are a little tight, but high information density is normal for an editor. Plan: add padding to the toolbar and keep the editor content compact. If the base size goes 13→14px, review the result first before adding extra padding on top.

### Item 5 (radius): agreed, mapped to our Tailwind classes

The reviewer's reference values, by component:

| Component | Radius |
|---|---|
| Small buttons | 6px |
| Input fields | 8px |
| Navigation items | 8px |
| Cards / panels | 8–10px |
| Pills | 999px |

The code uses Tailwind size classes rather than component roles (`rounded-lg` ×66, `rounded-md` ×47, `rounded-sm` ×24, `rounded-full` ×24). Proposed mapping, in fixed px so it does not change if the base font size changes:

| Class | Value | Used for |
|---|---|---|
| `rounded-sm` | 6px | small buttons |
| `rounded-md` | 8px | inputs, navigation items |
| `rounded-lg` | 10px | cards, panels |
| `rounded-full` | 999px | pills (already correct) |

Things to check:

- The 24 elements using `rounded-sm` render square today because of the negative `calc`. After the fix they become 6px, which is a visible change to review.
- A class name does not always match the component's role; for example, some `rounded-lg` may be buttons, not panels. Do a quick pass over usages.

### Delivery: ship as a separate "Claude-style" theme

To avoid breaking the current NovaPad Light, build this as a new named theme in `src/renderer/src/utils/themes.ts`, next to Dracula and Solarized Light. Implications:

- **Colours are safe.** Named themes only set CSS variables on `<html>`, so existing themes are unaffected.
- **Bug to fix first.** `ALL_TOKEN_KEYS` (`themes.ts`) is built only from the Solarized and Dracula token lists. If the new theme sets a token neither of them uses (such as `--radius`), switching back to another theme will not clear it. Build the key list from every theme instead.
- **Font size and radius are global today, not per theme.** To keep them inside the new theme only:
  - turn the `html` 13px into a variable;
  - change the radius scale in `tailwind.config.ts` to read per-size variables (`--radius-sm`, `--radius-md`, `--radius-lg`), with defaults equal to today's values.

  With those defaults, existing themes look exactly as they do now.
- **Monaco.** Add a matching Monaco theme (neutral foreground, line numbers and widget borders) in `monacoThemes.ts`, and point the new theme at it.
