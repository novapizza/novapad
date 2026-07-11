# Theme System — Review & Custom-Theme Roadmap

Review of how theme switching works today and what it would take to support
**custom / user-defined themes** later. No code changes here — this is analysis.

---

## 1. How it works today

Theme is a **binary** value — `'light' | 'dark'` — wired through four layers:

| Layer | Where | Role |
|---|---|---|
| State | `store/uiStore.ts` (`theme`, `setTheme`, `toggleTheme`) | in-memory current theme |
| Persistence | `store/configStore.ts` (`theme`, default `dark`) | saved to `config.json`, restored on launch |
| App chrome colors | `App.tsx` toggles the `.dark` class on `<html>` → CSS variables in `styles/tailwind.css` (`:root` = light, `.dark` = dark) | all UI colors |
| Editor colors | `EditorPane`/`SplitEditorPane` call `nppThemeName(theme)` → Monaco theme (`utils/monacoThemes.ts`) | editor syntax + chrome |

Switch points: **Settings ▸ Theme** dropdown (`SettingsTab.tsx`) and the **native menu** (`ui:toggle-theme` IPC). Both call `setTheme` + persist.

Monaco theme mapping (`nppThemeName`): `dark → 'dracula'`, `light → 'npp-light'`.

### Current colors
- **Dark:** Dracula-family neutrals (`#282a36`) + **violet** accent; editor uses the `dracula` Monaco theme.
- **Light:** light neutrals + the original **blue** accent (hue 215); editor uses `npp-light`.
  (The two themes are intentionally distinct: dark = purple, light = blue.)

---

## 2. Is it ready for custom themes?

**Foundation is good, but the current design is hard-coded to exactly two themes.**

**Strengths (already theming-friendly):**
- All chrome colors are **CSS variables** (one HSL token set) — a theme is essentially "a set of values for these ~30 tokens". This is the ideal base.
- Monaco is decoupled: themes are registered via `defineTheme` and selected by name.
- There's already a **user-file pattern** to mirror — `userDefineLangs/` in the config dir (UDL). Custom themes could live in `themes/` the same way.
- Persistence is a single config key.

**Gaps that block custom themes today:**
1. **`Theme` is a 2-value union** (`'light' | 'dark'`) used everywhere — needs to become a theme **id** (string).
2. **CSS variables are static** — two literal blocks (`:root`, `.dark`). Arbitrary themes can't be expressed as classes; they need **runtime injection** of CSS custom properties.
3. **Monaco theme map is hard-coded** (`nppThemeName` if/else) — each custom theme needs a Monaco theme registered (generated from its tokens).
4. **UI is a toggle/2-option dropdown** — no registry or picker for N themes.
5. **No theme definition format** — nothing describes a theme as data.

---

## 3. Proposed architecture for custom themes (future)

A theme becomes **data**:

```ts
interface ThemeDef {
  id: string                 // 'dracula', 'light-blue', 'my-theme'
  name: string               // shown in the picker
  base: 'light' | 'dark'     // drives base defaults (e.g. Monaco vs/vs-dark, shadows)
  tokens: Record<string, string>   // CSS var -> HSL triplet, e.g. { '--primary': '262 72% 55%', ... }
  monaco?: { rules: [...]; colors: {...} }  // optional editor overrides
}
```

- **Registry**: built-in themes (`Light`, `Dracula`, …) + user themes loaded from
  `userData/themes/*.json` (same loader pattern as UDL). 
- **`applyTheme(def)`**: set each token as a CSS custom property on `documentElement`
  (`style.setProperty('--primary', def.tokens['--primary'])`), toggle a `base` class for
  base-dependent CSS, and `monaco.editor.defineTheme(def.id, …)` + `setTheme(def.id)`.
- **Settings**: replace the 2-option dropdown with a list of all registered themes (+ an
  "Open themes folder" / duplicate-current action to author new ones).
- **Persist** the selected theme **id** (migrate the old `'light'|'dark'` value).
- Ship a small **theme editor** later (optional) — since a theme is just token values, a
  color-picker grid over the token list is enough.

**Effort estimate:** medium. The CSS-variable foundation means most of the work is
(a) making theme an id + runtime CSS injection, (b) a registry + loader, (c) the picker UI.
No visual rework of components is needed — they already read the tokens.

---

## 4. Open questions

1. ~~Light accent — blue or violet?~~ **Resolved:** light = blue (old), dark = purple.
2. **Do you want custom themes now**, or just confirm the architecture is ready and defer?
   (Recommendation: defer — ship 1.5.8 with the two polished themes, build the custom-theme
   system as its own release once the rebrand is out.)
3. If custom themes later: **built-in set** to ship (e.g. Light, Dracula, plus a couple like
   Solarized / High-Contrast)?
