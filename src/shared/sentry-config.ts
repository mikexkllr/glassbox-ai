// The DSN is a public identifier, not a secret — it ships inside every client
// and is visible in this repository. It only lets a client *send* events.
// Get yours at: https://sentry.io → Your Project → Settings → Client Keys (DSN)
export const SENTRY_DSN = 'https://a3eb68f8deff3c1565f8aadd74bdbb87@o4511155358334976.ingest.de.sentry.io/4511608016142416'

// Injected by electron-vite from package.json (see `define` in
// electron.vite.config.ts). Pinning a literal here meant every crash from every
// release arrived tagged as the same version, which makes a regression
// impossible to place.
declare const __APP_VERSION__: string
const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev'

export const SENTRY_RELEASE = `glassbox@${version}`
export const APP_VERSION = version
