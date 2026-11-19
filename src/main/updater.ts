import { app, BrowserWindow, Notification } from 'electron'
import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
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
 * - On macOS, updates only run when the build is signed with a Developer ID
 *   (see `hasDeveloperIdSignature` below and docs/signing.md).
 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // re-check every 6h while running
const SIGNATURE_PROBE_TIMEOUT_MS = 10_000

export function setupAutoUpdater(): void {
  if (!app.isPackaged) return
  void begin()
}

async function begin(): Promise<void> {
  if (process.platform === 'darwin' && !(await hasDeveloperIdSignature())) {
    console.log('[updater] macOS build is not Developer ID signed — skipping update checks')
    return
  }

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
      const note = new Notification({
        title: 'Glassbox update ready',
        body: `v${info.version} installs when you quit — or click here to restart now. ✨`
      })
      // Clicking applies it straight away; ignoring it costs nothing, since
      // autoInstallOnAppQuit swaps the app out the next time it closes.
      note.on('click', () => setImmediate(() => autoUpdater.quitAndInstall()))
      note.show()
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

/**
 * Whether the running .app carries a Developer ID signature.
 *
 * macOS updates go through Squirrel.Mac, which refuses to swap in a new version
 * unless the *running* app is properly signed — and it only finds that out after
 * downloading the whole archive, leaving a wasted download and a noisy "Could
 * not get code signature" error behind. So we ask codesign up front. `-d` only
 * reads the signature instead of hashing the bundle, which keeps it at ~30ms,
 * and it prints to stderr.
 *
 * The effect: a notarized release updates itself, while a local unsigned build
 * (`npm run dist:mac:unsigned`) never even checks.
 */
function hasDeveloperIdSignature(): Promise<boolean> {
  // …/Glassbox.app/Contents/MacOS/Glassbox → …/Glassbox.app
  const bundle = resolve(dirname(app.getPath('exe')), '..', '..')
  return new Promise((done) => {
    execFile(
      '/usr/bin/codesign',
      ['-d', '--verbose=2', bundle],
      { timeout: SIGNATURE_PROBE_TIMEOUT_MS },
      (err, _stdout, stderr) => {
        if (err) {
          console.log('[updater] codesign probe failed:', err.message)
          return done(false)
        }
        done(/^Authority=Developer ID Application/m.test(stderr))
      }
    )
  })
}
