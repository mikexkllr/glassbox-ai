import { PROVIDERS, providerApiKey, providerBaseUrl, type Settings } from '@shared/types'
import { fetchOpenCodeCatalog } from './opencode.js'

export interface ModelList {
  ok: boolean
  models: string[]
  message?: string
}

const TIMEOUT = AbortSignal.timeout.bind(null, 8000)

/** The key the lister should send: Settings first, then the provider's env vars. */
function key(settings: Settings): string {
  const saved = providerApiKey(settings)
  if (saved) return saved
  for (const name of PROVIDERS[settings.provider].envKeys ?? []) {
    if (process.env[name]) return process.env[name] as string
  }
  return ''
}

async function json(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: TIMEOUT() })
  if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 401 ? ' — check the API key' : ''}`)
  return res.json()
}

/**
 * Ask the configured provider which models it serves. Every provider that
 * speaks OpenAI, Anthropic or Gemini publishes a catalog endpoint, so the
 * Settings screen can offer a list instead of a text box to guess into.
 */
export async function listModels(settings: Settings): Promise<ModelList> {
  const spec = PROVIDERS[settings.provider]
  if (!spec) return { ok: false, models: [], message: `Unknown provider: ${settings.provider}` }
  const base = providerBaseUrl(settings)

  try {
    // The OpenCode gateways list every model across all four protocols at the
    // inference root, and need no key to do it.
    if (spec.multiWire) {
      const models = await fetchOpenCodeCatalog(base)
      return { ok: true, models: models.flatMap((m) => (m.id ? [m.id] : [])).sort() }
    }

    switch (spec.wire) {
      case 'ollama': {
        const data = (await json(`${base || 'http://localhost:11434'}/api/tags`, {})) as {
          models?: { name: string }[]
        }
        return { ok: true, models: (data.models ?? []).map((m) => m.name).sort() }
      }

      case 'openai':
      case 'responses': {
        const token = key(settings)
        const data = (await json(`${base}/models`, {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(spec.headers ?? {})
        })) as { data?: { id?: string }[] }
        return { ok: true, models: (data.data ?? []).flatMap((m) => (m.id ? [m.id] : [])).sort() }
      }

      case 'anthropic': {
        const token = key(settings)
        if (!token) return { ok: false, models: [], message: 'Add an API key first.' }
        const data = (await json(`${base}/v1/models?limit=100`, {
          'x-api-key': token,
          'anthropic-version': '2023-06-01'
        })) as { data?: { id?: string }[] }
        return { ok: true, models: (data.data ?? []).flatMap((m) => (m.id ? [m.id] : [])) }
      }

      case 'google': {
        const token = key(settings)
        if (!token) return { ok: false, models: [], message: 'Add an API key first.' }
        // As in the model factory: the version belongs to us, not the base URL.
        const root = base.replace(/\/v1(beta)?$/, '') || 'https://generativelanguage.googleapis.com'
        const data = (await json(`${root}/v1beta/models?pageSize=200&key=${token}`, {})) as {
          models?: { name?: string; supportedGenerationMethods?: string[] }[]
        }
        return {
          ok: true,
          models: (data.models ?? [])
            .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
            .flatMap((m) => (m.name ? [m.name.replace(/^models\//, '')] : []))
            .sort()
        }
      }

      default:
        return {
          ok: false,
          models: [],
          message: `${spec.label} has no model catalog — enter the model id yourself.`
        }
    }
  } catch (e) {
    return { ok: false, models: [], message: `${spec.label}: ${(e as Error).message}` }
  }
}
