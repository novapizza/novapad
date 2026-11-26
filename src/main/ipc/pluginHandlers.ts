import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import AdmZip from 'adm-zip'
import { PluginLoader } from '../plugins/PluginLoader'

export function registerPluginHandlers(): void {
  const loader = PluginLoader.getInstance()

  ipcMain.handle('plugin:list', async () => {
    return loader.getPluginList()
  })

  ipcMain.handle('plugin:reload', async () => {
    return loader.reloadAll()
  })

  ipcMain.handle('plugin:detail', async (_e, name: string) => {
    return loader.getPluginDetail(name)
  })

  ipcMain.handle('plugin:enable', async (_e, name: string) => {
    return loader.enablePlugin(name)
  })

  ipcMain.handle('plugin:disable', async (_e, name: string) => {
    return loader.disablePlugin(name)
  })

  ipcMain.handle('plugin:reload-one', async (_e, name: string) => {
    return loader.reloadPlugin(name)
  })

  ipcMain.handle('plugin:uninstall', async (_e, name: string) => {
    return loader.uninstallPlugin(name)
  })

  ipcMain.handle('plugin:settings-schemas', async () => {
    return loader.getSettingsSchemas()
  })

  ipcMain.handle('plugin:install', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'openDirectory', 'showHiddenFiles'],
      title: 'Select Plugin (folder or .zip)',
      filters: [
        { name: 'Plugin Package', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const picked = result.filePaths[0]
    const stat = fs.statSync(picked)
    let sourcePath = picked

    // If the user picked a .zip, extract it to a temp dir and treat that as the source folder.
    if (!stat.isDirectory()) {
      if (!picked.toLowerCase().endsWith('.zip')) {
        throw new Error('Plugin must be a folder or a .zip archive')
      }
      const tempRoot = path.join(app.getPath('temp'), `novapad-plugin-${Date.now()}`)
      fs.mkdirSync(tempRoot, { recursive: true })
      const zip = new AdmZip(picked)
      zip.extractAllTo(tempRoot, true)
      // If the zip wrapped a single top-level folder, drop into it; otherwise use tempRoot directly.
      const entries = fs.readdirSync(tempRoot)
      if (entries.length === 1 && fs.statSync(path.join(tempRoot, entries[0])).isDirectory()) {
        sourcePath = path.join(tempRoot, entries[0])
      } else {
        sourcePath = tempRoot
      }
    }

    // Validate: must have package.json
    const pkgPath = path.join(sourcePath, 'package.json')
    if (!fs.existsSync(pkgPath)) {
      throw new Error('Plugin does not contain a package.json')
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    const pluginName = pkg.name || path.basename(sourcePath)
    const targetPath = path.join(loader.pluginsDir, pluginName)

    // Check for overwrite
    if (fs.existsSync(targetPath)) {
      const confirm = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Overwrite', 'Cancel'],
        defaultId: 1,
        title: 'Plugin Already Exists',
        message: `Plugin "${pluginName}" is already installed. Overwrite?`
      })
      if (confirm.response !== 0) return null

      try { loader.disablePlugin(pluginName) } catch { /* may not be loaded */ }
    }

    return loader.installPlugin(sourcePath)
  })

  // Renderer -> main: plugin API calls forwarded from plugin context
  ipcMain.on('plugin:api-call', (_event, pluginName: string, method: string, args: unknown[]) => {
    loader.dispatchAPICall(pluginName, method, args)
  })
}
