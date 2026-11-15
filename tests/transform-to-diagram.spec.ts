// E2E for the Phase 3 "Transform → ER Diagram" shortcut (Ctrl+Alt+Shift+K): a non-schema buffer
// surfaces a warning toast, a DDL buffer mounts the overlay with the kind badge + table/ref
// counts, and Esc closes it. Per-flavour parsing (Prisma / DBML / DDL, inline REFERENCES,
// ALTER TABLE) is unit-tested in tests/unit/schemaParse.test.ts.
import { test, expect, setEditorText, MOD } from './fixtures'

const DDL = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`.trim()

const SHORTCUT = `${MOD}+Alt+Shift+K`

test.describe('Transform → ER Diagram (Ctrl+Alt+Shift+K)', () => {
  test('non-schema toast, then DDL overlay, Esc closes', async ({ page }) => {
    const overlay = page.getByTestId('transform-overlay')

    await test.step('shows a warning toast for non-schema content', async () => {
      await setEditorText(page, 'just plain text, no schema here')
      // The shortcut can be lost while the paste's language refine is in flight (see the DDL step),
      // and plain text gives no status-bar change to wait for. Re-pressing only re-shows the toast.
      await expect(async () => {
        await page.keyboard.press(SHORTCUT)
        await expect(page.getByText(/Could not recognise Prisma \/ DBML \/ DDL/i)).toBeVisible({ timeout: 1_500 })
      }).toPass({ timeout: 8_000 })
      await expect(overlay).toHaveCount(0)
    })

    await test.step('opens the overlay for a DDL schema (2 tables, 1 ref)', async () => {
      await setEditorText(page, DDL)
      // Paste kicks off an async Magika language refine (→ SQL); a shortcut pressed while it is in
      // flight is lost, so wait for it to land first.
      await expect(page.getByTestId('statusbar-language')).toHaveText('SQL', { timeout: 5_000 })
      await page.keyboard.press(SHORTCUT)
      await expect(overlay).toBeVisible({ timeout: 5_000 })
      await expect(overlay.getByText('DDL', { exact: true })).toBeVisible()
      await expect(page.getByTestId('transform-summary')).toContainText('2 tables')
      await expect(page.getByTestId('transform-summary')).toContainText('1 ref')
    })

    await test.step('Esc closes the transform overlay', async () => {
      await page.keyboard.press('Escape')
      await expect(overlay).toHaveCount(0)
    })
  })
})
