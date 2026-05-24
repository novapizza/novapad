// E2E for the Phase 3 "Transform → ER Diagram" shortcut. Paste a schema in
// any of the three supported flavours (Prisma / DBML / DDL), hit
// Ctrl+Alt+Shift+K, and assert the overlay mounts with the correct kind
// badge + table/ref counts. Also verifies Esc closes and that a non-schema
// buffer surfaces a warning toast instead of opening the overlay.

import { test as base, expect } from './fixtures'
import { _electron as electron, ElectronApplication } from 'playwright'
import path from 'path'

function makeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, E2E_TEST: '1', NODE_ENV: 'test' }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

const test = base.extend<{ electronApp: ElectronApplication }>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: [path.resolve(__dirname, '../out/main/index.js')],
      env: makeEnv(),
      timeout: 15_000,
    })
    await use(app)
    await app.close()
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForSelector('[data-testid="app"]', { timeout: 10_000 })
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.webContents.send('menu:file-new')
    })
    await page.waitForSelector('.monaco-editor textarea', { timeout: 10_000 })
    await use(page)
  },
})

async function pasteIntoEditor(
  page: import('@playwright/test').Page,
  electronApp: ElectronApplication,
  text: string,
): Promise<void> {
  await electronApp.evaluate(({ clipboard }, t) => clipboard.writeText(t as string), text)
  await page.locator('.monaco-editor textarea').first().click({ force: true })
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
}

const PRISMA = `
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DB") }

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}
`.trim()

const DBML = `
Table users {
  id integer [pk]
  email varchar [unique]
}

Table posts {
  id integer [pk]
  title varchar
  user_id integer
}

Ref: posts.user_id > users.id
`.trim()

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

test.describe('Transform → ER Diagram (Ctrl+Alt+Shift+K)', () => {
  test('opens overlay with Prisma schema (2 tables, 1 ref)', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, PRISMA)
    await page.keyboard.press('Control+Alt+Shift+K')

    await expect(page.getByTestId('transform-overlay')).toBeVisible({ timeout: 5_000 })
    // Kind badge shows PRISMA.
    await expect(page.getByTestId('transform-overlay').getByText('Prisma', { exact: true })).toBeVisible()
    // Summary chip: 2 tables · 1 ref.
    const summary = await page.getByTestId('transform-summary').textContent()
    expect(summary).toContain('2 tables')
    expect(summary).toContain('1 ref')
  })

  test('opens overlay with DBML schema', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, DBML)
    await page.keyboard.press('Control+Alt+Shift+K')

    await expect(page.getByTestId('transform-overlay')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('transform-overlay').getByText('DBML', { exact: true })).toBeVisible()
    const summary = await page.getByTestId('transform-summary').textContent()
    expect(summary).toContain('2 tables')
    expect(summary).toContain('1 ref')
  })

  test('opens overlay with DDL schema', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, DDL)
    await page.keyboard.press('Control+Alt+Shift+K')

    await expect(page.getByTestId('transform-overlay')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('transform-overlay').getByText('DDL', { exact: true })).toBeVisible()
    const summary = await page.getByTestId('transform-summary').textContent()
    expect(summary).toContain('2 tables')
    expect(summary).toContain('1 ref')
  })

  test('DDL with inline REFERENCES + ON DELETE CASCADE picks up the FK', async ({ page, electronApp }) => {
    // Regression: earlier parser greedily consumed REFERENCES as part of the
    // column type, leaving the inline-FK regex no match. Real-world DDL
    // (Postgres-style with REFERENCES + ON DELETE) must show the relation.
    const ECOM_DDL = `
CREATE TABLE users (
  id    SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL
);
CREATE TABLE addresses (
  id      SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city    VARCHAR(100) NOT NULL
);
CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id),
  address_id  INT REFERENCES addresses(id),
  total       DECIMAL(10,2) NOT NULL
);
`.trim()
    await pasteIntoEditor(page, electronApp, ECOM_DDL)
    await page.keyboard.press('Control+Alt+Shift+K')
    await expect(page.getByTestId('transform-overlay')).toBeVisible({ timeout: 5_000 })
    const summary = await page.getByTestId('transform-summary').textContent()
    expect(summary).toContain('3 tables')
    // Three FKs: addresses.user_id → users, orders.user_id → users,
    // orders.address_id → addresses.
    expect(summary).toContain('3 refs')
  })

  test('DDL with ALTER TABLE ADD FOREIGN KEY picks up the FK', async ({ page, electronApp }) => {
    const ALTER_DDL = `
CREATE TABLE users ( id INT PRIMARY KEY );
CREATE TABLE posts ( id INT PRIMARY KEY, user_id INT );
ALTER TABLE posts ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);
`.trim()
    await pasteIntoEditor(page, electronApp, ALTER_DDL)
    await page.keyboard.press('Control+Alt+Shift+K')
    await expect(page.getByTestId('transform-overlay')).toBeVisible({ timeout: 5_000 })
    const summary = await page.getByTestId('transform-summary').textContent()
    expect(summary).toContain('2 tables')
    expect(summary).toContain('1 ref')
  })

  test('shows warning toast for non-schema content', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, 'just plain text, no schema here')
    await page.keyboard.press('Control+Alt+Shift+K')

    await expect(page.getByText(/Could not recognise Prisma \/ DBML \/ DDL/i)).toBeVisible({ timeout: 3_000 })
    // Overlay should NOT mount.
    await expect(page.getByTestId('transform-overlay')).toHaveCount(0)
  })

  test('Esc closes the transform overlay', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, DDL)
    await page.keyboard.press('Control+Alt+Shift+K')
    await expect(page.getByTestId('transform-overlay')).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('transform-overlay')).toHaveCount(0)
  })
})
