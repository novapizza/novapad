import { ipcMain } from 'electron'
import { UpdateManager } from '../update/UpdateManager'

export function registerUpdateHandlers(manager: UpdateManager): void {
  ipcMain.handle('update:check', async () => {
    await manager.checkForUpdates(true)
  })

  ipcMain.handle('update:install', () => {
    manager.quitAndInstall()
  })

  ipcMain.handle('update:capable', () => manager.isCapable())
}
