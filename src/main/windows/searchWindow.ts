import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import { installNavigationGuards } from './navigationGuards'

let searchWin: BrowserWindow | null = null

export function openSearchWindow(mainWindow: BrowserWindow, mode: string): void {
  if (searchWin && !searchWin.isDestroyed()) {
    searchWin.show()
    searchWin.focus()
    // Give the window a moment to ensure it's ready before sending
    if (searchWin.webContents.isLoading()) {
      searchWin.webContents.once('did-finish-load', () => {
        searchWin?.webContents.send('search:open', { mode })
      })
    } else {
      searchWin.webContents.send('search:open', { mode })
    }
    return
  }

  const preloadPath = join(__dirname, '../../preload/index.js')

  searchWin = new BrowserWindow({
    width: 600,
    height: 440,
    minWidth: 480,
    minHeight: 340,
    title: 'Find & Replace',
    resizable: true,
    minimizable: false,
    maximizable: false,
    // parent causes modal-like behavior on macOS, omit for non-blocking float
    alwaysOnTop: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  searchWin.setMenu(null)
  installNavigationGuards(searchWin.webContents)

  // Hide instead of close so state is preserved
  searchWin.on('close', (e) => {
    e.preventDefault()
    searchWin?.hide()
  })

  // Destroy when main window closes
  mainWindow.once('closed', () => {
    searchWin?.destroy()
    searchWin = null
  })

  // Load the search page using query param on main index.html
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    searchWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?page=search`)
  } else {
    searchWin.loadFile(join(__dirname, '../renderer/index.html'), { query: { page: 'search' } })
  }

  searchWin.webContents.once('did-finish-load', () => {
    searchWin?.webContents.send('search:open', { mode })
  })
}

export function closeSearchWindow(): void {
  searchWin?.hide()
}

export function getSearchWindow(): BrowserWindow | null {
  return searchWin && !searchWin.isDestroyed() ? searchWin : null
}
