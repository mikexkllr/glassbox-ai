import { app, BrowserWindow, Notification } from 'electron'
import * as Sentry from '@sentry/electron/main'
// electron-updater is CommonJS; the main process is bundled as ESM, so a named
// import fails at runtime ("Named export 'autoUpdater' not found"). Default-import
// the module and destructure instead.
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

/**
 * Wires electron-updater against the GitHub Releases published by CI.
 *
 * The release pipeline (.github/workflows/release.yml) builds a new version on
 * every push to main and publishes the installers + `latest*.yml` feed files to
 * a GitHub Release. electron-updater reads those feeds and pulls down a newer
 * version in the background.
 *
 * Caveats:
 * - No-op in dev (`app.isPackaged` is false) — nothing to update.
 * - macOS auto-update requires a signed + notarized build; an unsigned mac app
 *   cannot apply updates (Squirrel.Mac rejects it) and the check throws noisy
 *   "Could not get code signature" errors. We skip mac until certs exist — the
 *   block below flips on automatically once builds are signed.
 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // re-check every 6h while running

export function setupAutoUpdater(): void {
  if (!app.isPackaged) return

  // Skip macOS until the app is signed + notarized (see caveat above).
  if (process.platform === 'darwin') return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err?.message ?? err)
    Sentry.captureException(err, { extra: { source: 'auto-updater' } })
  })
  autoUpdater.on('checking-for-update', () => console.log('[updater] checking for update…'))
  autoUpdater.on('update-available', (info) =>
    console.log(`[updater] update available: ${info.version}`)
  )
  autoUpdater.on('update-not-available', () => console.log('[updater] up to date'))
  autoUpdater.on('download-progress', (p) =>
    console.log(`[updater] downloading ${Math.round(p.percent)}%`)
  )
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] update downloaded: ${info.version} (installs on quit)`)
    // Let the renderer surface an in-app prompt if it wants to.
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('updater:downloaded', { version: info.version })
    }
    if (Notification.isSupported()) {
      new Notification({
        title: 'Glassbox update ready',
        body: `v${info.version} will install when you quit. ✨`
      }).show()
    }
  })

  const check = () =>
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater]', err)
      Sentry.captureException(err, { extra: { source: 'auto-updater-poll' } })
    })
  check()
  setInterval(check, CHECK_INTERVAL_MS)
}
