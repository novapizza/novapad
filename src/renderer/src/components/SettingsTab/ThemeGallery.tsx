import React from 'react'
import { getTheme } from '../../utils/themes'
import { EditorMock } from './ThemeMock'

/**
 * Settings ▸ Appearance theme section: a "Themes" heading and a "Current theme"
 * row. Clicking the row asks SettingsTab to open the ThemeDrawer (which slides in
 * from the left and pushes the category list right).
 */

interface ThemeGalleryProps {
  value: string
  onOpen: () => void
}

export function ThemeGallery({ value, onOpen }: ThemeGalleryProps): React.ReactElement {
  const current = getTheme(value)
  return (
    <section data-testid="theme-gallery">
      <div className="text-base font-semibold text-foreground mb-3">Themes</div>
      <button
        type="button"
        onClick={onOpen}
        data-testid="theme-current-row"
        className="w-full flex items-center gap-4 p-2 rounded-lg bg-secondary/60 hover:bg-secondary transition-colors text-left max-w-[520px]"
      >
        <EditorMock c={current.preview} className="w-44 h-24 rounded-md border border-border shrink-0" />
        <span className="text-sm font-semibold text-foreground w-28 shrink-0">Current theme</span>
        <span className="flex-1 text-base text-foreground">{current.name}</span>
      </button>
    </section>
  )
}
