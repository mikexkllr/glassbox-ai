import { app, safeStorage } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { DEFAULT_SETTINGS, PROVIDERS, type Provider, type Settings } from '@shared/types'

let cache: Settings | null = null

/**
 * Set when the config file was found holding credentials in clear text. The
 * resealing itself has to wait for `app.ready`, and for whoever reads the
 * settings first: the sync read at startup primes the cache, so a check that
 * lived inside `getSettings` alone would never run.
 */
let needsSealing = false

/** Owner-only. The file holds API keys; nothing else on the machine needs them. */
const FILE_MODE = 0o600

/**
 * Every field that holds a credential. They are kept out of the config file in
 * clear text: `safeStorage` encrypts them against the OS keychain, so reading
 * the file (or a backup of it) is no longer enough to walk off with the keys.
 */
const SECRET_FIELDS = [
  'anthropicApiKey',
  'opencodeZenApiKey',
  'bedrockProxyApiKey',
  'awsAccessKeyId',
  'awsSecretAccessKey'
] as const

/** What actually sits on disk: the open settings plus one sealed blob. */
type Stored = Settings & { secrets?: { v: 1; data: string }; sealCheck?: string }

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

/** Pull the credentials out of a settings object, leaving the rest untouched. */
function splitSecrets(s: Settings): { open: Record<string, unknown>; secret: Record<string, unknown> } {
  const open: Record<string, unknown> = { ...s }
  const secret: Record<string, unknown> = {}
  if (s.apiKeys && Object.keys(s.apiKeys).length > 0) {
    secret.apiKeys = s.apiKeys
    delete open.apiKeys
  }
  for (const field of SECRET_FIELDS) {
    if (s[field]) {
      secret[field] = s[field]
      delete open[field]
    }
  }
  return { open, secret }
}

/**
 * Whether `safeStorage` on this machine can still open what a *previous* launch
 * sealed. That is not a given: the encryption key lives in the OS keychain
 * behind an entry bound to the app's code signature, so an unsigned build —
 * `npm run dev`, or anything built from source without a certificate — gets a
 * fresh key every launch. Encryption appears to work, and yesterday's data is
 * unreadable.
 *
 * So the credentials are only sealed once a canary written by an earlier launch
 * has come back intact. Until then they stay in clear text in an owner-only
 * file, which is worth far more than keys that quietly vanish on restart.
 */
const CANARY = 'glassbox:seal-check:v1'
let sealSurvives = false

function encrypt(text: string): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.encryptString(text).toString('base64')
  } catch {
    return null
  }
}

function decrypt(data: string): string | null {
  try {
    return safeStorage.decryptString(Buffer.from(data, 'base64'))
  } catch {
    return null
  }
}

function seal(secret: Record<string, unknown>): { v: 1; data: string } | null {
  if (Object.keys(secret).length === 0) return null
  const data = encrypt(JSON.stringify(secret))
  return data ? { v: 1, data } : null
}

function unseal(blob: { v: 1; data: string }): Record<string, unknown> | 'locked' {
  const text = decrypt(blob.data)
  if (text === null) return 'locked'
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return 'locked'
  }
}

/**
 * Credentials used to live in one flat field per provider (`anthropicApiKey`,
 * `opencodeZenBaseUrl`, …), which stopped scaling once there were twenty
 * providers. They're keyed maps now; fold any old field into its map so an
 * existing config keeps its keys, and leave the old field in place so a
 * downgrade still finds them.
 */
function migrate(raw: Settings): Settings {
  const apiKeys: Partial<Record<Provider, string>> = { ...(raw.apiKeys ?? {}) }
  const baseUrls: Partial<Record<Provider, string>> = { ...(raw.baseUrls ?? {}) }

  const key = (p: Provider, value?: string) => {
    if (value && !apiKeys[p]) apiKeys[p] = value
  }
  const url = (p: Provider, value?: string) => {
    if (value && !baseUrls[p]) baseUrls[p] = value
  }

  key('anthropic', raw.anthropicApiKey)
  key('opencodezen', raw.opencodeZenApiKey)
  key('bedrock-proxy', raw.bedrockProxyApiKey)
  url('ollama', raw.ollamaBaseUrl)
  url('bedrock-proxy', raw.bedrockProxyEndpoint)

  // `/zen/v1` was the catalog alias, not a protocol endpoint. The router now
  // needs the inference root, so drop the old default and keep only a URL the
  // user actually chose themselves.
  const zen = raw.opencodeZenBaseUrl
  if (zen && !baseUrls.opencodezen && !/opencode\.ai\/(zen|inference)\/v1\/?$/.test(zen)) {
    baseUrls.opencodezen = zen
  }

  // A provider id this build doesn't know (a downgrade, or a hand-edited
  // config) would otherwise reach the UI as an undefined registry entry.
  const provider = PROVIDERS[raw.provider] ? raw.provider : DEFAULT_SETTINGS.provider

  return { ...raw, provider, apiKeys, baseUrls, wires: { ...(raw.wires ?? {}) } }
}

/**
 * `locked` means the file holds sealed credentials we could not open — which
 * before `app.ready` is normal rather than a failure. `plain` means credentials
 * were sitting in the file in clear text and want sealing on the way back out.
 */
function read(): { settings: Settings; locked: boolean; plain: boolean } {
  // `plain` below means: something on disk wants rewriting — credentials in the
  // clear, a missing canary, or both.
  let raw: Stored
  try {
    raw = JSON.parse(fs.readFileSync(configPath(), 'utf8')) as Stored
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, locked: false, plain: false }
  }

  // Did a canary from an earlier launch survive? That is what decides whether
  // sealing is safe here — see the comment on CANARY.
  sealSurvives = raw.sealCheck ? decrypt(raw.sealCheck) === CANARY : false

  let locked = false
  let secrets: Record<string, unknown> = {}
  if (raw.secrets) {
    const opened = unseal(raw.secrets)
    if (opened === 'locked') {
      locked = true
      console.warn(
        '[settings] could not decrypt the stored credentials — the OS keychain no longer ' +
          'holds the key this build used. Re-enter the API key in Settings; it will be saved again.'
      )
    } else secrets = opened
  }

  const { secret: inTheClear } = splitSecrets(raw)
  const merged = migrate({ ...DEFAULT_SETTINGS, ...raw, ...secrets } as Settings)
  delete (merged as Stored).secrets
  delete (merged as Stored).sealCheck
  return { settings: merged, locked, plain: Object.keys(inTheClear).length > 0 || !raw.sealCheck }
}

export async function getSettings(): Promise<Settings> {
  if (!cache) {
    const { settings, locked, plain } = read()
    needsSealing = plain
    if (locked) return settings
    cache = settings
  }
  // First read after the upgrade: the keys are still lying in the file, and by
  // now the app is ready, so safeStorage can seal them. Saving also tightens
  // the file's permissions. Cleared first, so a machine without a keychain
  // writes clear text once rather than on every read.
  // Rewrite when the credentials are still in the clear AND sealing them would
  // actually hold, or simply to drop a first canary and tighten the file mode.
  if (needsSealing) {
    needsSealing = false
    await saveSettings(cache)
  }
  return cache
}

// Sentry must be initialized before the Electron app 'ready' event fires, which
// is earlier than the async settings load can resolve. Read the config file
// synchronously so the telemetry consent flag is available in time.
export function getSettingsSync(): Settings {
  if (cache) return cache
  const { settings, locked, plain } = read()
  needsSealing = plain
  // safeStorage may not be usable this early. Caching a settings object whose
  // credentials failed to open would hand every later caller a keyless config,
  // so only a complete read is kept.
  if (!locked) cache = settings
  return settings
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const merged = migrate({ ...DEFAULT_SETTINGS, ...settings })
  cache = merged
  const { open, secret } = splitSecrets(merged)
  const sealed = sealSurvives ? seal(secret) : null
  const onDisk: Stored = sealed ? ({ ...open, secrets: sealed } as Stored) : { ...merged }
  // Always leave a fresh canary, so the next launch can find out whether this
  // machine keeps the key around. That is what lets a signed build upgrade
  // itself to encrypted storage without anyone doing anything.
  const canary = encrypt(CANARY)
  if (canary) onDisk.sealCheck = canary

  await fs.promises.mkdir(path.dirname(configPath()), { recursive: true })
  await fs.promises.writeFile(configPath(), JSON.stringify(onDisk, null, 2), {
    encoding: 'utf8',
    mode: FILE_MODE
  })
  // `mode` above only applies when the file is created, so an existing config
  // written before this change keeps its old permissions without this.
  await fs.promises.chmod(configPath(), FILE_MODE)
  return merged
}
