/**
 * Theme catalog. A theme is data: a base (light/dark, which drives the `.dark`
 * class + Monaco base), an optional set of CSS-variable token overrides applied
 * on top of that base, the Monaco theme name, and a few colors for the gallery
 * card preview.
 *
 * `dark` (NovaPad, the default) and `light` (NovaPad Light) carry no token
 * overrides — they rely on the static `.dark` / `:root` blocks in tailwind.css.
 * Named themes like `solarized-light` and `dracula` override the tokens. The
 * ids `dark` / `light` predate the NovaPad themes and are kept so saved configs
 * and the View ▸ Toggle Theme action keep working. Adding a theme = one entry here.
 */

export type ThemeBase = 'light' | 'dark'

export interface ThemePreview {
  chrome: string
  bg: string
  text: string
  accent: string
  kw: string
  str: string
  com: string
  num: string
}

export interface ThemeDef {
  id: string
  name: string
  sub: string
  base: ThemeBase
  /** Monaco theme name (registered in monacoThemes.ts). */
  monaco: string
  /** CSS variable overrides ('--x' → 'H S% L%'). Absent → use base defaults. */
  tokens?: Record<string, string>
  /** Colors for the Settings gallery card mock. */
  preview: ThemePreview
}

// Solarized Light — canonical palette mapped onto the app's token set.
const SOLARIZED_LIGHT_TOKENS: Record<string, string> = {
  '--background': '46 42% 88%',
  '--foreground': '194 14% 40%',
  '--card': '44 87% 94%',
  '--card-foreground': '194 14% 40%',
  '--popover': '44 87% 94%',
  '--popover-foreground': '194 14% 40%',
  '--primary': '205 69% 49%',
  '--primary-foreground': '44 87% 97%',
  '--secondary': '46 42% 85%',
  '--secondary-foreground': '194 14% 40%',
  '--muted': '46 42% 86%',
  '--muted-foreground': '186 8% 50%',
  '--accent': '205 69% 49%',
  '--accent-foreground': '44 87% 97%',
  '--destructive': '1 71% 52%',
  '--destructive-foreground': '44 87% 97%',
  '--border': '46 30% 80%',
  '--input': '46 30% 80%',
  '--ring': '205 69% 49%',
  '--toolbar': '46 42% 86%',
  '--toolbar-foreground': '194 14% 40%',
  '--toolbar-border': '46 30% 80%',
  '--tab-active': '44 87% 94%',
  '--tab-inactive': '46 42% 86%',
  '--tab-hover': '46 50% 90%',
  '--tab-foreground': '194 14% 40%',
  '--tab-muted': '186 8% 55%',
  '--statusbar': '205 69% 45%',
  '--statusbar-foreground': '44 87% 97%',
  '--explorer': '46 42% 89%',
  '--explorer-foreground': '194 14% 40%',
  '--explorer-hover': '46 50% 84%',
  '--explorer-active': '205 50% 85%',
  '--gutter': '46 42% 88%',
  '--gutter-foreground': '186 8% 60%',
  '--line-highlight': '46 50% 90%',
  '--sidebar-background': '46 42% 89%',
  '--sidebar-foreground': '194 14% 40%',
  '--sidebar-primary': '205 69% 49%',
  '--sidebar-primary-foreground': '44 87% 97%',
  '--sidebar-accent': '46 50% 84%',
  '--sidebar-accent-foreground': '194 14% 40%',
  '--sidebar-border': '46 30% 80%',
  '--sidebar-ring': '205 69% 49%',
  '--tok-key': '205 69% 45%',
  '--tok-string': '175 59% 35%',
  '--tok-bool': '237 43% 55%',
  '--tok-null': '186 8% 50%',
  '--tok-num': '18 80% 44%',
  '--tok-brace': '196 13% 45%',
  // Sticky-note tints. The :root tints are tuned against a white --card;
  // Solarized's is cream (44 87% 94%), so these are re-tuned onto Solarized's
  // own accent hues to stop them reading as cold patches on a warm surface.
  // Listing them here also enrols them in ALL_TOKEN_KEYS, so switching away
  // from Solarized clears them rather than leaking into the next theme.
  '--note-yellow': '45 60% 85%',
  '--note-green': '68 35% 84%',
  '--note-blue': '205 45% 87%',
  '--note-pink': '331 40% 89%',
  '--note-purple': '237 35% 88%'
}

// Dracula — the pre-1.6.8 dark chrome, now an optional theme. Hue ~231 chrome
// kept in sync with the Monaco 'dracula' editor theme (editor.background #282a36).
const DRACULA_TOKENS: Record<string, string> = {
  '--background': '231 15% 18%',
  '--foreground': '60 30% 96%',
  '--card': '232 14% 21%',
  '--card-foreground': '60 30% 96%',
  '--popover': '232 14% 21%',
  '--popover-foreground': '60 30% 96%',
  '--primary': '262 80% 70%',
  '--primary-foreground': '0 0% 100%',
  '--secondary': '232 14% 26%',
  '--secondary-foreground': '60 30% 96%',
  '--muted': '232 14% 24%',
  '--muted-foreground': '225 20% 62%',
  '--accent': '262 80% 70%',
  '--accent-foreground': '0 0% 100%',
  '--destructive': '0 62% 55%',
  '--destructive-foreground': '0 0% 100%',
  '--border': '232 14% 27%',
  '--input': '232 14% 27%',
  '--ring': '262 80% 70%',
  '--toolbar': '231 15% 16%',
  '--toolbar-foreground': '60 20% 88%',
  '--toolbar-border': '232 14% 25%',
  '--tab-active': '231 15% 18%',
  '--tab-inactive': '231 15% 14%',
  '--tab-hover': '231 15% 20%',
  '--tab-foreground': '60 30% 96%',
  '--tab-muted': '225 15% 58%',
  '--statusbar': '262 55% 45%',
  '--statusbar-foreground': '0 0% 100%',
  '--explorer': '231 15% 15%',
  '--explorer-foreground': '60 20% 86%',
  '--explorer-hover': '232 14% 24%',
  '--explorer-active': '232 14% 31%',
  '--gutter': '231 15% 16%',
  '--gutter-foreground': '225 15% 45%',
  '--line-highlight': '232 14% 26%',
  '--sidebar-background': '231 15% 15%',
  '--sidebar-foreground': '60 20% 86%',
  '--sidebar-primary': '262 80% 70%',
  '--sidebar-primary-foreground': '0 0% 100%',
  '--sidebar-accent': '232 14% 24%',
  '--sidebar-accent-foreground': '60 30% 96%',
  '--sidebar-border': '232 14% 25%',
  '--sidebar-ring': '262 80% 70%',
  '--tok-key': '191 97% 77%',
  '--tok-string': '65 92% 76%',
  '--tok-bool': '326 100% 74%',
  '--tok-null': '225 27% 65%',
  '--tok-num': '265 89% 78%',
  '--tok-brace': '60 30% 90%',
  '--note-yellow': '48 25% 28%',
  '--note-green': '142 22% 26%',
  '--note-blue': '210 30% 29%',
  '--note-pink': '335 25% 30%',
  '--note-purple': '265 28% 31%'
}

export const THEMES: ThemeDef[] = [
  {
    id: 'dark',
    name: 'NovaPad',
    sub: 'Default',
    base: 'dark',
    monaco: 'novapad-dark',
    preview: { chrome: '#100e17', bg: '#0b0a10', text: '#edeaf7', accent: '#f0abfc', kw: '#f0abfc', str: '#9be3b4', com: '#6b6585', num: '#fcd34d' }
  },
  {
    id: 'light',
    name: 'NovaPad Light',
    sub: 'Light',
    base: 'light',
    monaco: 'novapad-light',
    preview: { chrome: '#f6f5fa', bg: '#ffffff', text: '#1c1830', accent: '#a21caf', kw: '#a21caf', str: '#237a46', com: '#8a85a0', num: '#b45309' }
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    sub: 'Warm',
    base: 'light',
    monaco: 'solarized-light',
    tokens: SOLARIZED_LIGHT_TOKENS,
    preview: { chrome: '#eee8d5', bg: '#fdf6e3', text: '#657b83', accent: '#268bd2', kw: '#859900', str: '#2aa198', com: '#93a1a1', num: '#cb4b16' }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    sub: 'Optional',
    base: 'dark',
    monaco: 'dracula',
    tokens: DRACULA_TOKENS,
    preview: { chrome: '#21222c', bg: '#282a36', text: '#f8f8f2', accent: '#bd93f9', kw: '#ff79c6', str: '#f1fa8c', com: '#6272a4', num: '#bd93f9' }
  }
]

/** Every token any theme may override — used to fully reset before applying. */
const ALL_TOKEN_KEYS: string[] = [...new Set([...Object.keys(SOLARIZED_LIGHT_TOKENS), ...Object.keys(DRACULA_TOKENS)])]

export function getTheme(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** Monaco theme name for a given app theme id. */
export function monacoThemeFor(id: string): string {
  return getTheme(id).monaco
}

/**
 * Apply a theme to the document: toggle the `.dark` base class and set/clear the
 * CSS-variable overrides on <html>. (Monaco's theme is applied separately by the
 * editor panes via monacoThemeFor.)
 */
export function applyTheme(id: string): void {
  const def = getTheme(id)
  const root = document.documentElement
  root.classList.toggle('dark', def.base === 'dark')
  for (const key of ALL_TOKEN_KEYS) {
    const v = def.tokens?.[key]
    if (v) root.style.setProperty(key, v)
    else root.style.removeProperty(key)
  }
}
