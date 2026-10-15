import { defineConfig } from 'vitest/config'

// Unit tests for pure renderer utilities. E2E specs (tests/*.spec.ts) run under Playwright.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node'
  },
  // Don't pick up the app's PostCSS/Tailwind config — these tests don't touch CSS
  css: { postcss: {} }
})
