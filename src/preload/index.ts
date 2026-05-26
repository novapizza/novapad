import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Expose safe IPC API to renderer via window.api
const api = {
  // Platform info
  platform: process.platform,
  appVersion: process.env['npm_package_version'] ?? '1.0.0',

  // File operations
  file: {
    read: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
    write: (filePath: string, content: string, encoding?: string, eol?: string, hasBom?: boolean) =>
      ipcRenderer.invoke('file:write', filePath, content, encoding, eol, hasBom),
    saveDialog: (defaultPath?: string, suggestedExt?: string | null) =>
      ipcRenderer.invoke('file:save-dialog', defaultPath, suggestedExt),
    openDialog: () => ipcRenderer.invoke('file:open-dialog'),
    openDirDialog: () => ipcRenderer.invoke('file:open-dir-dialog'),
    checkMtime: (filePath: string, mtime: number) => ipcRenderer.invoke('file:check-mtime', filePath, mtime),
    stat: (filePath: string) => ipcRenderer.invoke('file:stat', filePath),
    statBatch: (filePaths: string[]) => ipcRenderer.invoke('file:stat-batch', filePaths),
    listDir: (dirPath: string) => ipcRenderer.invoke('file:list-dir', dirPath),
    create: (filePath: string) => ipcRenderer.invoke('file:create', filePath),
    delete: (filePath: string) => ipcRenderer.invoke('file:delete', filePath),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('file:rename', oldPath, newPath),
    reveal: (filePath: string) => ipcRenderer.invoke('file:reveal', filePath),
    addRecent: (filePath: string) => ipcRenderer.send('file:add-recent', filePath),
    mkdir: (dirPath: string) => ipcRenderer.invoke('file:mkdir', dirPath),
    getRecents: () => ipcRenderer.invoke('file:get-recents'),
    // Resolve the absolute disk path of a File object obtained from a
    // drag-and-drop or <input type=file> in the renderer. Replaces the legacy
    // `File.path` property (removed in Electron 32+ when contextIsolation=true).
    pathForFile: (file: File): string => webUtils.getPathForFile(file)
  },

  // Config operations
  config: {
    getDir: () => ipcRenderer.invoke('config:get-dir'),
    read: (name: string) => ipcRenderer.invoke('config:read', name),
    write: (name: string, data: object) => ipcRenderer.invoke('config:write', name, data),
    readRaw: (name: string) => ipcRenderer.invoke('config:read-raw', name),
    writeRaw: (name: string, content: string) => ipcRenderer.invoke('config:write-raw', name, content),
    listUDL: () => ipcRenderer.invoke('config:list-udl'),
    readUDL: (filename: string) => ipcRenderer.invoke('config:read-udl', filename),
    writeUDL: (filename: string, data: object) => ipcRenderer.invoke('config:write-udl', filename, data)
  },

  // Plugin operations
  plugin: {
    list: () => ipcRenderer.invoke('plugin:list'),
    detail: (name: string) => ipcRenderer.invoke('plugin:detail', name),
    enable: (name: string) => ipcRenderer.invoke('plugin:enable', name),
    disable: (name: string) => ipcRenderer.invoke('plugin:disable', name),
    reloadOne: (name: string) => ipcRenderer.invoke('plugin:reload-one', name),
    install: () => ipcRenderer.invoke('plugin:install'),
    uninstall: (name: string) => ipcRenderer.invoke('plugin:uninstall', name),
    settingsSchemas: () => ipcRenderer.invoke('plugin:settings-schemas'),
    reload: () => ipcRenderer.invoke('plugin:reload')
  },

  // Search operations
  search: {
    start: (opts: object) => ipcRenderer.invoke('search:find-in-files-start', opts),
    cancel: (searchId: string) => ipcRenderer.invoke('search:cancel', searchId)
  },

  // File watch operations
  watch: {
    add: (filePath: string) => ipcRenderer.invoke('watch:add', filePath),
    remove: (filePath: string) => ipcRenderer.invoke('watch:remove', filePath)
  },

  // Backup operations (snapshot of dirty/untitled buffers)
  backup: {
    write: (filename: string, content: string) =>
      ipcRenderer.invoke('backup:write', filename, content),
    read: (filename: string) => ipcRenderer.invoke('backup:read', filename),
    delete: (filename: string) => ipcRenderer.invoke('backup:delete', filename),
    getDir: () => ipcRenderer.invoke('backup:get-dir'),
    list: () => ipcRenderer.invoke('backup:list'),
    cleanup: (keep: string[]) => ipcRenderer.invoke('backup:cleanup', keep)
  },

  // App-level metadata
  app: {
    /** Reliable app version from app.getVersion() (preferred over the legacy appVersion constant). */
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version')
  },

  // Auto-update operations
  update: {
    /** Trigger a manual update check. Renderer should show feedback toasts. */
    check: (): Promise<void> => ipcRenderer.invoke('update:check'),
    /** Quit the app and install the downloaded update. */
    install: (): Promise<void> => ipcRenderer.invoke('update:install'),
    /** Query whether auto-update is capable (packaged + writable install dir). */
    capable: (): Promise<boolean> => ipcRenderer.invoke('update:capable')
  },

  // IPC event listeners (main -> renderer)
  // Returns an unsubscribe function — call it in useEffect cleanup to remove
  // exactly this listener without disturbing others on the same channel.
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const allowedChannels = [
      'menu:file-new', 'menu:file-open', 'menu:file-save', 'menu:file-save-as',
      'menu:file-save-all', 'menu:file-close', 'menu:file-close-all', 'menu:file-reload',
      'menu:folder-open', 'menu:find', 'menu:replace', 'menu:find-in-files',
      'menu:settings-open', 'menu:shortcuts-open',
      'menu:whats-new-open',
      'menu:plugin-manager', 'menu:about',
      'editor:command', 'editor:set-option', 'editor:set-language',
      'editor:set-encoding', 'editor:set-eol',
      'ui:toggle-toolbar', 'ui:toggle-statusbar', 'ui:toggle-sidebar',
      'ui:toggle-split-view', 'ui:toggle-theme', 'ui:show-toast',
      'tab:next', 'tab:prev',
      'macro:start-record', 'macro:stop-record', 'macro:playback',
      'session:restore', 'app:before-close',
      'plugin:add-menu-item', 'plugin:insert-text', 'plugin:state-changed',
      'plugin:editor-get-text', 'plugin:editor-get-selection', 'plugin:editor-get-path',
      'plugin:open-csv-viewer',
      'file:externally-changed', 'file:externally-deleted',
      'search:chunk', 'search:progress', 'search:done',
      'menu:check-for-updates',
      'update:checking', 'update:available', 'update:not-available',
      'update:downloading', 'update:downloaded', 'update:error'
    ]
    if (!allowedChannels.includes(channel)) return () => {}
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  off: (channel: string) => {
    const allowedChannels = [
      'menu:file-new', 'menu:file-open', 'menu:file-save', 'menu:file-save-as',
      'menu:file-save-all', 'menu:file-close', 'menu:file-close-all', 'menu:file-reload',
      'menu:folder-open', 'menu:find', 'menu:replace', 'menu:find-in-files',
      'menu:settings-open', 'menu:shortcuts-open',
      'menu:whats-new-open',
      'menu:plugin-manager', 'menu:about',
      'editor:command', 'editor:set-option', 'editor:set-language',
      'editor:set-encoding', 'editor:set-eol',
      'ui:toggle-toolbar', 'ui:toggle-statusbar', 'ui:toggle-sidebar',
      'ui:toggle-split-view', 'ui:toggle-theme', 'ui:show-toast',
      'tab:next', 'tab:prev',
      'macro:start-record', 'macro:stop-record', 'macro:playback',
      'session:restore', 'app:before-close',
      'plugin:add-menu-item', 'plugin:insert-text', 'plugin:state-changed',
      'plugin:editor-get-text', 'plugin:editor-get-selection', 'plugin:editor-get-path',
      'plugin:open-csv-viewer',
      'file:externally-changed', 'file:externally-deleted',
      'search:chunk', 'search:progress', 'search:done',
      'menu:check-for-updates',
      'update:checking', 'update:available', 'update:not-available',
      'update:downloading', 'update:downloaded', 'update:error'
    ]
    if (allowedChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel)
    }
  },

  // Renderer -> main replies
  send: (channel: string, ...args: unknown[]) => {
    const allowedChannels = [
      'app:close-confirmed',
      'app:close-cancelled',
      'app:renderer-ready',
      'plugin:editor-get-text:reply',
      'plugin:editor-get-selection:reply',
      'plugin:editor-get-path:reply',
      'plugin:invoke-menu-click',
      'dev:toggle-devtools',
      'session:save',
      'ui:state-changed'
    ]
    if (allowedChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
