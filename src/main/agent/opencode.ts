import type { ProviderWire } from '@shared/types'

/**
 * OpenCode's gateways (Zen, pay-as-you-go, and Go, the flat subscription) front
 * several labs at once, and each model is served on the protocol its lab
 * speaks: Claude and Qwen on Anthropic `/messages`, GPT and Grok on OpenAI
 * `/responses`, Gemini on `generate-content`, the rest on OpenAI
 * `/chat/completions`. One key, four shapes.
 *
 * So the wire can't be a property of the provider. The catalog at
 * `{root}/v1/models` declares it per model, and this module reads it, caches
 * it for the session, and falls back to a snapshot taken 2026-11-01 when the
 * gateway can't be reached.
 */

/** Where each protocol hangs off the inference root. */
const WIRE_PATH: Record<Exclude<ProviderWire, 'ollama' | 'azure' | 'bedrock' | 'bedrock-proxy' | 'vertex'>, string> = {
  openai: '/openai/v1',
  responses: '/openai/v1',
  anthropic: '/anthropic/v1',
  google: '/google/v1beta'
}

/** The catalog's name for a protocol -> ours. */
const SHAPE_TO_WIRE: Record<string, ProviderWire> = {
  'chat-completions': 'openai',
  responses: 'responses',
  messages: 'anthropic',
  'generate-content': 'google'
}

/**
 * Enough of the catalog to route without a network call. Only the models that
 * aren't plain `/chat/completions` need listing — that's the fallback for
 * anything unknown, and the overwhelming majority.
 */
const SNAPSHOT: Record<string, ProviderWire> = {
  // Anthropic `/messages`
  'claude-fable-5': 'anthropic',
  'claude-fable-5-1': 'anthropic',
  'claude-haiku-4-5': 'anthropic',
  'claude-haiku-5-5': 'anthropic',
  'claude-opus-4-5': 'anthropic',
  'claude-opus-4-6': 'anthropic',
  'claude-opus-4-7': 'anthropic',
  'claude-opus-4-8': 'anthropic',
  'claude-opus-5': 'anthropic',
  'claude-opus-5-5': 'anthropic',
  'claude-sonnet-4-5': 'anthropic',
  'claude-sonnet-4-6': 'anthropic',
  'claude-sonnet-5': 'anthropic',
  'claude-sonnet-5-5': 'anthropic',
  'qwen3.5-plus': 'anthropic',
  'qwen3.6-plus': 'anthropic',
  'qwen3.7-plus': 'anthropic',
  'qwen3.8-flash': 'anthropic',
  // OpenAI `/responses`
  'gpt-5': 'responses',
  'gpt-5.1': 'responses',
  'gpt-5.2': 'responses',
  'gpt-5.3-codex': 'responses',
  'gpt-5.4': 'responses',
  'gpt-5.5': 'responses',
  'gpt-5.6-luna': 'responses',
  'gpt-5.6-sol': 'responses',
  'gpt-5.6-terra': 'responses',
  'gpt-6-astra': 'responses',
  'gpt-6-luna': 'responses',
  'gpt-6-sol': 'responses',
  'gpt-6.1-sol': 'responses',
  'grok-4.5': 'responses',
  'grok-4.6': 'responses',
  'grok-4.7': 'responses',
  'muse-spark-1.2': 'responses',
  'muse-spark-1.2-contributor': 'responses',
  'muse-spark-1.3': 'responses',
  'muse-spark-1.3-contributor': 'responses',
  'muse-wonder-1.0': 'responses',
  // Gemini
  'gemini-3.5-flash': 'google',
  'gemini-3.6-flash': 'google',
  'gemini-3.7-flash': 'google',
  'gemini-3.8-flash': 'google',
  'gemini-4-argon': 'google'
}

interface Catalog {
  wires: Record<string, ProviderWire>
  fetchedAt: number
}

const CATALOG_TTL_MS = 10 * 60 * 1000
const catalogs = new Map<string, Catalog>()

interface CatalogModel {
  id?: string
  api?: Record<string, { base_url?: string }>
}

/**
 * The gateway's model list. Shared by the router and by the Settings model
 * picker, so a "Load models" click and a routing decision never disagree.
 */
export async function fetchOpenCodeCatalog(root: string): Promise<CatalogModel[]> {
  const res = await fetch(`${root.replace(/\/+$/, '')}/v1/models`, {
    signal: AbortSignal.timeout(8000)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = (await res.json()) as { data?: CatalogModel[] }
  return body.data ?? []
}

async function loadCatalog(root: string): Promise<Catalog> {
  const cached = catalogs.get(root)
  if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) return cached
  const wires: Record<string, ProviderWire> = {}
  try {
    for (const model of await fetchOpenCodeCatalog(root)) {
      const shape = Object.keys(model.api ?? {})[0]
      const wire = shape ? SHAPE_TO_WIRE[shape] : undefined
      if (model.id && wire) wires[model.id] = wire
    }
  } catch {
    // Offline, or the gateway moved. The snapshot still routes the models we
    // know, and anything else falls through to /chat/completions.
  }
  const catalog: Catalog = {
    wires: Object.keys(wires).length ? wires : { ...SNAPSHOT },
    fetchedAt: Date.now()
  }
  catalogs.set(root, catalog)
  return catalog
}

/** Where a given OpenCode model is served, and on which protocol. */
export async function routeOpenCode(
  root: string,
  model: string
): Promise<{ wire: ProviderWire; baseUrl: string }> {
  const { wires } = await loadCatalog(root)
  const wire = wires[model] ?? SNAPSHOT[model] ?? 'openai'
  const path = WIRE_PATH[wire as keyof typeof WIRE_PATH] ?? WIRE_PATH.openai
  return { wire, baseUrl: `${root.replace(/\/+$/, '')}${path}` }
}

/** The per-protocol endpoint for a wire the user pinned by hand. */
export function openCodeBaseUrl(root: string, wire: ProviderWire): string {
  const path = WIRE_PATH[wire as keyof typeof WIRE_PATH] ?? WIRE_PATH.openai
  return `${root.replace(/\/+$/, '')}${path}`
}
