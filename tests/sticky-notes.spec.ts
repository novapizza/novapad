// Feature: sticky-notes — see .docs/features/sticky-notes/{prd,spec,plan}.md
//
// Runs against the shared fixture's isolated userData dir, so it never touches the developer's
// real notes.json / config.json. Pure note validation / normalisation / sorting lives in
// tests/unit/notesStore.test.ts.
import fs from 'fs'
import path from 'path'
import type { Page } from '@playwright/test'
import { test, expect, sendIPC, stubConfirmDialog, MOD } from './fixtures'

const notesPanel = (page: Page) => page.locator('[data-testid="notes-panel"]')
const cards = (page: Page) => notesPanel(page).locator('[data-testid="note-card"]')
const noteBody = (page: Page) => notesPanel(page).locator('[data-testid="note-body"]')
const viewLines = (page: Page) => page.locator('.monaco-editor .view-lines')

async function openNotes(page: Page): Promise<void> {
  await page.keyboard.press(`${MOD}+Shift+N`)
  await notesPanel(page).waitFor({ state: 'visible', timeout: 3_000 })
}

/** + New, type `text`, optionally collapse with Escape. */
async function newNote(page: Page, text: string, collapse = true): Promise<void> {
  await notesPanel(page).locator('[data-testid="notes-new"]').click()
  await noteBody(page).pressSequentially(text)
  if (collapse) await page.keyboard.press('Escape')
}

test.describe('Sticky Notes', () => {
  test('Notes-Layout — toggle, stacking below Explorer, own dismiss, empty state', async ({ page, electronApp }) => {
    const sidebar = page.locator('[data-testid="sidebar"]')

    await test.step('Mod+Shift+N opens Notes in a hidden sidebar', async () => {
      await openNotes(page)
      await expect(sidebar).toBeVisible()
      await expect(sidebar.getByText('Notes', { exact: true })).toBeVisible()
    })

    await test.step('empty state names where notes are stored and warns they are unencrypted', async () => {
      await expect(notesPanel(page).getByText('No notes yet')).toBeVisible()
      await expect(notesPanel(page).getByText(/unencrypted/)).toBeVisible()
      await expect(notesPanel(page).getByText('notes.json')).toBeVisible()
    })

    await test.step('pressing Mod+Shift+N again round-trips back to a hidden sidebar', async () => {
      // Notes opened the sidebar, so collapsing Notes returns to the prior layout.
      await page.keyboard.press(`${MOD}+Shift+N`)
      await expect(sidebar).not.toBeVisible()
    })

    await test.step('Notes stacks below the File Explorer instead of replacing it', async () => {
      await sendIPC(electronApp, 'ui:toggle-sidebar', true)
      await expect(sidebar.getByText('File Browser')).toBeVisible()
      await openNotes(page)
      await expect(sidebar.getByText('File Browser')).toBeVisible()
      await expect(sidebar.getByText('Notes', { exact: true })).toBeVisible()
      // Collapsing Notes leaves the Explorer where it was — Notes is not what opened the sidebar.
      await page.keyboard.press(`${MOD}+Shift+N`)
      await expect(notesPanel(page)).toHaveCount(0)
      await expect(sidebar).toBeVisible()
      await expect(sidebar.getByText('File Browser')).toBeVisible()
    })

    await test.step('the Notes view has its own dismiss button that does not close the Explorer', async () => {
      await openNotes(page)
      // The ✕ next to the NOTES header, not the Explorer's.
      await sidebar.locator('button:right-of(:text-is("Notes"))').first().click()
      await expect(notesPanel(page)).toHaveCount(0)
      await expect(sidebar.getByText('File Browser')).toBeVisible()
    })
  })

  test('Notes-Lifecycle — new, Tab, Esc, empty discard', async ({ page, electronApp, userDataDir }) => {
    await openNotes(page)

    await test.step('an untouched empty note is discarded rather than persisted', async () => {
      await notesPanel(page).locator('[data-testid="notes-new"]').click()
      await expect(cards(page)).toHaveCount(1)
      await notesPanel(page).locator('[data-testid="notes-filter"]').click() // blur without typing
      await expect(cards(page)).toHaveCount(0)
      await expect(notesPanel(page).getByText('No notes yet')).toBeVisible()
    })

    await test.step('+ New creates a note, typing persists it to notes.json', async () => {
      await newNote(page, 'deploy checklist', false)
      const notesFile = path.join(userDataDir, 'config', 'notes.json')
      await expect(async () => {
        const parsed = JSON.parse(fs.readFileSync(notesFile, 'utf8'))
        expect(parsed.version).toBe(1)
        expect(parsed.notes.map((n: { body: string }) => n.body)).toContain('deploy checklist')
      }).toPass({ timeout: 5_000 })
      // The derived title is the first non-empty body line.
      await page.keyboard.press('Escape')
      await expect(notesPanel(page).getByText('deploy checklist')).toBeVisible()
    })

    await test.step('Tab inserts a literal tab instead of moving focus', async () => {
      await newNote(page, 'a', false)
      await page.keyboard.press('Tab')
      await noteBody(page).pressSequentially('b')
      await expect(noteBody(page)).toHaveValue('a\tb')
      await expect(noteBody(page)).toBeFocused()
      await page.keyboard.press('Escape')
    })

    await test.step('Esc collapses the note but keeps the text, and does not close other overlays', async () => {
      await newNote(page, 'kept text', false)
      // Find & Replace listens for Escape on window (bubble phase), so the textarea's
      // stopPropagation has to shield it.
      const findDialog = page.getByText('Find & Replace', { exact: true })
      await sendIPC(electronApp, 'menu:find')
      await expect(findDialog).toBeVisible()
      // Find & Replace focuses its input on open, which can steal focus back after the click
      await expect(async () => {
        await noteBody(page).click()
        await expect(noteBody(page)).toBeFocused({ timeout: 500 })
      }).toPass({ timeout: 5_000 })
      await page.keyboard.press('Escape')
      await expect(noteBody(page)).toHaveCount(0)
      await expect(notesPanel(page).getByText('kept text')).toBeVisible()
      await expect(findDialog).toBeVisible()
    })
  })

  test('Notes-List — filter, pinned sort, delete via native dialog', async ({ page, electronApp }) => {
    await openNotes(page)
    await newNote(page, 'alpha note')
    await newNote(page, 'beta note')
    await expect(cards(page)).toHaveCount(2)
    const filter = notesPanel(page).locator('[data-testid="notes-filter"]')

    await test.step('filter matches body text and shows a distinct empty state', async () => {
      await filter.fill('alpha')
      await expect(cards(page)).toHaveCount(1)
      await filter.fill('gamma')
      await expect(notesPanel(page).getByText('No matching notes')).toBeVisible()
      await filter.fill('')
      await expect(cards(page)).toHaveCount(2)
    })

    await test.step('pinned notes sort above unpinned ones', async () => {
      // Newest-updated first: "beta note" leads.
      await expect(cards(page).first()).toContainText('beta note')
      await cards(page).nth(1).locator('button[aria-label="Note actions"]').click()
      await page.getByRole('menuitem', { name: 'Pin to top' }).click()
      await expect(cards(page).first()).toContainText('alpha note')
    })

    await test.step('delete goes through the native dialog — Cancel keeps the note', async () => {
      /** The overflow menu unmounts behind a CSS exit animation; clicking the trigger while that
       *  layer is still up is swallowed as an outside-dismiss. Wait it out, as a human would. */
      const chooseDelete = async () => {
        await expect(page.getByRole('menuitem')).toHaveCount(0)
        await cards(page).first().locator('button[aria-label="Note actions"]').click()
        await page.getByRole('menuitem', { name: 'Delete' }).click()
      }
      // Cancel keeps the note — and must not re-expand it either.
      await stubConfirmDialog(electronApp, 'cancel')
      await chooseDelete()
      await expect(cards(page)).toHaveCount(2)
      await expect(noteBody(page)).toHaveCount(0)
      // Confirm removes it.
      await stubConfirmDialog(electronApp, 'confirm')
      await chooseDelete()
      await expect(cards(page)).toHaveCount(1)
      await expect(cards(page).first()).toContainText('beta note')
    })
  })

  test('Notes-Bridges — Insert at Cursor, Send Selection, Open as Tab', async ({ page }) => {
    const editor = page.locator('.monaco-editor textarea').first()

    await test.step('Insert at Cursor drops the body into the document as one undo step', async () => {
      await editor.click({ force: true })
      await page.keyboard.type('start')
      await openNotes(page)
      await newNote(page, 'INSERTED', false)
      await notesPanel(page).getByRole('button', { name: 'Insert at Cursor' }).click()
      await expect(viewLines(page)).toContainText('startINSERTED')
      // Focus returns to the editor; a single undo reverts only the insert, not the typed text.
      await page.keyboard.press(`${MOD}+Z`)
      await expect(viewLines(page)).not.toContainText('INSERTED')
      await expect(viewLines(page)).toContainText('start')
      // Collapse the note so the next step's note is the only expanded one.
      await noteBody(page).click()
      await page.keyboard.press('Escape')
      await expect(noteBody(page)).toHaveCount(0)
    })

    await test.step('Send Selection to Note copies the selection without touching the document', async () => {
      await editor.click({ force: true })
      await page.keyboard.press(`${MOD}+A`)
      await page.keyboard.type('const answer = 42')
      await page.keyboard.press(`${MOD}+A`)
      await editor.click({ button: 'right', force: true })
      await page.getByRole('menuitem', { name: 'Send Selection to Note' }).click()
      await expect(noteBody(page)).toHaveValue('const answer = 42')
      await expect(viewLines(page)).toContainText('const answer = 42')
    })

    await test.step('Open as Tab creates an untitled buffer and keeps the note', async () => {
      await notesPanel(page).getByRole('button', { name: 'Open as Tab' }).click()
      await expect(page.locator('[data-tab-title="const answer = 42"]')).toBeVisible()
      await expect(cards(page)).toHaveCount(2)
    })
  })

  test('Notes-Persistence — malformed and partially-malformed notes.json', async ({ userDataDir, page }) => {
    const notesFile = path.join(userDataDir, 'config', 'notes.json')
    /** Write notes.json and reload the renderer so load() re-reads it. */
    const reloadWith = async (contents: string) => {
      fs.writeFileSync(notesFile, contents, 'utf8')
      await page.reload()
      await page.waitForSelector('[data-testid="app"]', { timeout: 10_000 })
      if (!(await notesPanel(page).isVisible())) await openNotes(page)
    }

    await test.step('a malformed notes.json loads empty, does not crash, and is left on disk', async () => {
      const garbage = '{ this is not json'
      await reloadWith(garbage)
      await expect(notesPanel(page).getByText('No notes yet')).toBeVisible()
      // The unreadable file must not have been overwritten with an empty list.
      expect(fs.readFileSync(notesFile, 'utf8')).toBe(garbage)
    })

    await test.step('a partially-malformed notes.json keeps the valid entries', async () => {
      await reloadWith(
        JSON.stringify({
          version: 1,
          notes: [
            { id: 'good', title: '', body: 'survivor', language: 'plaintext', color: 'yellow', pinned: false, createdAt: 1, updatedAt: 2 },
            { id: 'bad-no-timestamps', body: 'dropped' },
            null,
          ],
        })
      )
      await expect(notesPanel(page).getByText('survivor')).toBeVisible()
      await expect(cards(page)).toHaveCount(1)
    })
  })
})
