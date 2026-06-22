import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { registerIpc } from './ipc.js'
import { setupAutoUpdater } from './updater.js'
import { purgeWorktreeRoot, cleanupWorktrees } from './git/worktree.js'
import { getSettings } from './store/settings.js'
import { SENTRY_DSN, SENTRY_RELEASE } from '@shared/sentry-config'
import * as Sentry from '@sentry/electron/main'

function appIcon(): string | undefined {
  const p = join(app.getAppPath(), 'build', 'icon.png')
  return existsSync(p) ? p : undefined
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0a0c10',
    icon: appIcon(),
    // macOS keeps its inset traffic lights. Windows/Linux use a hidden title bar
    // with the native Window Controls Overlay, so the dark app extends to the top
    // edge instead of sitting under a clashing OS title bar (the "strange border").
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin'
      ? {}
      : { titleBarOverlay: { color: '#0a0c10', symbolColor: '#9aa4b2', height: 48 } }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Register IPC handlers and open the window synchronously so the renderer
  // never fires an invoke before its handler exists.
  registerIpc()
  createWindow()
  setupAutoUpdater()
  void purgeWorktreeRoot() // reclaim disk from worktrees orphaned by a prior crash/force-quit

  // Init Sentry in the background — reads settings from disk but must not
  // delay registerIpc() / createWindow() (that caused a race where the renderer
  // called 'settings:get' before the handler was registered).
  void getSettings().then((settings) => {
    if (settings.telemetry) {
      Sentry.init({ dsn: SENTRY_DSN, release: SENTRY_RELEASE })
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  void cleanupWorktrees() // remove the feature-branch worktrees we created this run
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
