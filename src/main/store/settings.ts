import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { DEFAULT_SETTINGS, PROVIDERS, type Provider, type Settings } from '@shared/types'

let cache: Settings | null = null

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
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

function read(readFile: () => string): Settings {
  try {
    return migrate({ ...DEFAULT_SETTINGS, ...(JSON.parse(readFile()) as Settings) })
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function getSettings(): Promise<Settings> {
  if (cache) return cache
  cache = read(() => fs.readFileSync(configPath(), 'utf8'))
  return cache
}

// Sentry must be initialized before the Electron app 'ready' event fires, which
// is earlier than the async settings load can resolve. Read the config file
// synchronously (and prime the cache) so the telemetry consent flag is available
// in time.
export function getSettingsSync(): Settings {
  if (cache) return cache
  cache = read(() => fs.readFileSync(configPath(), 'utf8'))
  return cache
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  cache = migrate({ ...DEFAULT_SETTINGS, ...settings })
  await fs.promises.mkdir(path.dirname(configPath()), { recursive: true })
  await fs.promises.writeFile(configPath(), JSON.stringify(cache, null, 2), 'utf8')
  return cache
}
