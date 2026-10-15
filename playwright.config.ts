import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testIgnore: ['unit/**'], // vitest unit tests (pnpm test:unit)
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Required — Electron cannot be sandboxed like a browser
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: { screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [{ name: 'electron' }]
})
