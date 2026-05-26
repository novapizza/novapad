import * as fs from 'fs'
import * as path from 'path'
import { app, BrowserWindow } from 'electron'
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'

const AUTO_INSTALL_GRACE_MS = 30_000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export class UpdateManager {
  private win: BrowserWindow
  private manualCheckInFlight = false
  private updateDownloaded = false
  private installTimer: ReturnType<typeof setTimeout> | null = null
  private checkInterval: ReturnType<typeof setInterval> | null = null
  private enabled = false

  constructor(win: BrowserWindow) {
    this.win = win
  }

  async init(): Promise<void> {
    if (process.env['E2E_TEST'] === '1') {
      this.log('info', 'disabled (E2E mode)')
      return
    }
    if (!app.isPackaged) {
      this.log('info', 'disabled (unpackaged)')
      return
    }
    if (!(await this.canWriteInstallDir())) {
      this.log('info', 'disabled (no write access to install dir — manual installer required)')
      return
    }

    this.enabled = true
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    // Override the embedded app-update.yml endpoint so electron-updater fetches
    // latest.yml from the public R2 CDN URL, not the private S3 API used for uploads.
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: 'https://pub-d2278ebfc6e74887b1c58c069c7119e7.r2.dev',
    })

    autoUpdater.logger = {
      info: (msg: unknown) => this.log('info', String(msg)),
      warn: (msg: unknown) => this.log('warn', String(msg)),
      error: (msg: unknown) => this.log('error', String(msg)),
      debug: (msg: string) => this.log('debug', msg),
    }

    this.wireEvents()
    this.wireWindowEvents()

    // Delay initial check so the window is fully visible before network activity.
    setTimeout(() => void this.checkForUpdates(false), 5_000)
    this.checkInterval = setInterval(() => void this.checkForUpdates(false), CHECK_INTERVAL_MS)
  }

  private async canWriteInstallDir(): Promise<boolean> {
    // NSIS installs live under Program Files and self-elevate via UAC — electron-updater
    // handles that path. Only block auto-update for portable builds where the exe is in
    // a read-only location (PORTABLE_EXECUTABLE_DIR is set by electron-builder for portables).
    if (!process.env['PORTABLE_EXECUTABLE_DIR']) return true
    try {
      await fs.promises.access(path.dirname(app.getPath('exe')), fs.constants.W_OK)
      return true
    } catch {
      return false
    }
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', msg: string, data?: unknown): void {
    const ts = new Date().toISOString()
    const suffix = data !== undefined ? ` ${JSON.stringify(data)}` : ''
    const line = `${ts} [update:${level}] ${msg}${suffix}`
    if (level === 'error' || level === 'warn') {
      console.error(line)
    } else {
      console.log(line)
    }
  }

  private send(channel: string, payload?: unknown): void {
    if (this.win.isDestroyed()) return
    this.win.webContents.send(channel, payload)
  }

  private wireWindowEvents(): void {
    this.win.on('show', () => this.cancelAutoInstall())
    this.win.on('hide', () => {
      if (this.updateDownloaded) this.scheduleAutoInstall()
    })
    this.win.on('close', () => {
      if (this.checkInterval !== null) {
        clearInterval(this.checkInterval)
        this.checkInterval = null
      }
      this.cancelAutoInstall()
    })
  }

  private scheduleAutoInstall(): void {
    if (!this.win.isDestroyed() && this.win.isVisible()) {
      this.cancelAutoInstall()
      return
    }
    if (this.installTimer !== null) return
    this.log('info', `silent install scheduled in ${AUTO_INSTALL_GRACE_MS / 1000}s`)
    this.installTimer = setTimeout(() => {
      this.installTimer = null
      this.log('info', 'silent auto-install: window hidden past grace period')
      autoUpdater.quitAndInstall(true, false)
    }, AUTO_INSTALL_GRACE_MS)
  }

  private cancelAutoInstall(): void {
    if (this.installTimer === null) return
    clearTimeout(this.installTimer)
    this.installTimer = null
    this.log('info', 'auto-install cancelled (window shown)')
  }

  private wireEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.log('info', 'checking-for-update', { manual: this.manualCheckInFlight })
      this.send('update:checking', { manual: this.manualCheckInFlight })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.log('info', 'update-available', { version: info.version, manual: this.manualCheckInFlight })
      this.send('update:available', { version: info.version, manual: this.manualCheckInFlight })
    })

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.log('info', 'update-not-available', { version: info.version, manual: this.manualCheckInFlight })
      this.send('update:not-available', { version: info.version, manual: this.manualCheckInFlight })
      this.manualCheckInFlight = false
    })

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      const pct = Math.round(progress.percent)
      if (pct % 10 === 0) {
        this.log('info', 'download-progress', {
          percent: pct,
          bytesPerSecond: Math.round(progress.bytesPerSecond),
          transferred: progress.transferred,
          total: progress.total,
        })
      }
      this.send('update:downloading', { percent: progress.percent })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.log('info', 'update-downloaded', { version: info.version })
      this.updateDownloaded = true
      this.send('update:downloaded', { version: info.version })
      this.manualCheckInFlight = false
      this.scheduleAutoInstall()
    })

    autoUpdater.on('error', (err: Error) => {
      this.log('error', 'update-error', { message: err.message, manual: this.manualCheckInFlight })
      this.send('update:error', { message: err.message, manual: this.manualCheckInFlight })
      this.manualCheckInFlight = false
    })
  }

  async checkForUpdates(manual: boolean): Promise<void> {
    if (!this.enabled) return
    this.log('info', 'checkForUpdates called', { manual })
    this.manualCheckInFlight = manual
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      this.manualCheckInFlight = false
      void err
    }
  }

  isCapable(): boolean {
    return this.enabled
  }

  quitAndInstall(): void {
    if (!this.enabled) return
    this.cancelAutoInstall()
    this.log('info', 'quitAndInstall called (manual)')
    autoUpdater.quitAndInstall(false, true)
  }
}
