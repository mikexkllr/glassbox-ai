import { randomUUID } from 'node:crypto'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
  PROVIDERS,
  providerApiKey,
  providerBaseUrl,
  providerWire,
  type Provider,
  type ProviderWire,
  type Settings
} from '@shared/types'
import { openCodeBaseUrl, routeOpenCode } from './opencode.js'

/**
 * OpenCode asks clients to identify themselves and to send a stable session id
 * per conversation so it can route consistently and reuse prompt caches. One id
 * per app run is the closest honest match: a walkthrough is read in one sitting.
 */
const OPENCODE_SESSION = randomUUID()
const USER_AGENT = 'glassbox/0.1.0'

/** The key from Settings, falling back to the provider's env vars. */
function resolveKey(settings: Settings, provider: Provider): string {
  const saved = providerApiKey(settings, provider)
  if (saved) return saved
  for (const name of PROVIDERS[provider].envKeys ?? []) {
    const fromEnv = process.env[name]
    if (fromEnv) return fromEnv
  }
  return ''
}

function requireKey(settings: Settings, provider: Provider): string {
  const key = resolveKey(settings, provider)
  if (key) return key
  const spec = PROVIDERS[provider]
  const env = (spec.envKeys ?? []).join(' or ')
  const where = spec.keyUrl ? ` Get one at ${spec.keyUrl}.` : ''
  throw new Error(
    `No ${spec.label} API key. Add one in Settings${env ? ` or set ${env}` : ''}.${where}`
  )
}

/**
 * Each SDK already defaults to its vendor's host, and reads a `*_BASE_URL`
 * environment variable to override it. Handing it the very same URL would
 * shadow that variable, so a base URL equal to the SDK's own default is left
 * unset instead of passed through.
 */
const SDK_DEFAULT_HOST: Partial<Record<ProviderWire, string>> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  responses: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com'
}

function headersFor(provider: Provider): Record<string, string> {
  const spec = PROVIDERS[provider]
  const extra: Record<string, string> =
    provider === 'opencodego' || provider === 'opencodezen'
      ? { 'x-opencode-session': OPENCODE_SESSION, 'User-Agent': USER_AGENT }
      : {}
  return { ...(spec.headers ?? {}), ...extra }
}

/**
 * Build a LangChain chat model from the user's settings.
 *
 * One factory over the whole provider registry: the wire protocol picks the
 * class, the registry supplies the endpoint, and an OpenAI-compatible provider
 * needs no code here at all. The rest of the agent stays provider-agnostic.
 */
export async function makeModel(settings: Settings): Promise<BaseChatModel> {
  const provider = settings.provider
  const spec = PROVIDERS[provider]
  if (!spec) throw new Error(`Unknown provider: ${provider}`)

  // A gateway serves each model on its lab's own protocol. Resolve which one
  // before dispatching, so `wire` below is always a single concrete shape.
  let wire = providerWire(settings)
  const configured = providerBaseUrl(settings)
  let baseUrl = configured
  if (spec.multiWire) {
    if (wire === 'auto') {
      const route = await routeOpenCode(configured, settings.model)
      wire = route.wire
      baseUrl = route.baseUrl
    } else {
      baseUrl = openCodeBaseUrl(configured, wire)
    }
  }
  /** The endpoint to hand the SDK — blank where the SDK's own default is right. */
  const endpoint = baseUrl && baseUrl === SDK_DEFAULT_HOST[wire as ProviderWire] ? '' : baseUrl

  switch (wire as ProviderWire) {
    case 'anthropic': {
      const { ChatAnthropic } = await import('@langchain/anthropic')
      // The Anthropic SDK posts to `{baseURL}/v1/messages`, so like Gemini it
      // wants the host root. OpenCode's catalog quotes the versioned endpoint;
      // pass that through and the version appears twice and 404s.
      const root = endpoint.replace(/\/v1$/, '')
      return new ChatAnthropic({
        model: settings.model,
        apiKey: requireKey(settings, provider),
        ...(root ? { anthropicApiUrl: root } : {}),
        clientOptions: { defaultHeaders: headersFor(provider) },
        temperature: 0,
        maxTokens: 8000
      })
    }

    case 'openai':
    case 'responses': {
      const { ChatOpenAI } = await import('@langchain/openai')
      // Local servers (LM Studio, llama.cpp, vLLM) ignore the key but the SDK
      // insists on one, so send a placeholder rather than failing the build.
      const apiKey = spec.keyless
        ? resolveKey(settings, provider) || 'not-needed'
        : requireKey(settings, provider)
      if (!baseUrl) throw new Error(`No ${spec.label} base URL. Add the endpoint in Settings.`)
      return new ChatOpenAI({
        model: settings.model,
        apiKey,
        temperature: 0,
        useResponsesApi: wire === 'responses',
        configuration: {
          ...(endpoint ? { baseURL: endpoint } : {}),
          defaultHeaders: headersFor(provider)
        }
      })
    }

    case 'google': {
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai')
      // The Gemini SDK builds `{baseUrl}/{apiVersion}/{model}:{task}` itself, so
      // it wants the host root. OpenCode's catalog quotes the full versioned
      // endpoint — hand over the root or the version lands in the path twice.
      const root = endpoint.replace(/\/v1(beta)?$/, '')
      return new ChatGoogleGenerativeAI({
        model: settings.model,
        apiKey: requireKey(settings, provider),
        ...(root ? { baseUrl: root } : {}),
        temperature: 0
      })
    }

    case 'ollama': {
      const { ChatOllama } = await import('@langchain/ollama')
      return new ChatOllama({
        model: settings.model,
        baseUrl: baseUrl || 'http://localhost:11434',
        temperature: settings.ollamaTemperature ?? 0,
        numCtx: settings.ollamaNumCtx ?? 8192,
        topP: settings.ollamaTopP ?? 0.9,
        topK: settings.ollamaTopK ?? 40,
        repeatPenalty: settings.ollamaRepeatPenalty ?? 1.1,
        numPredict: settings.ollamaNumPredict ?? -1,
        keepAlive: settings.ollamaKeepAlive || '5m'
      })
    }

    case 'azure': {
      const { AzureChatOpenAI } = await import('@langchain/openai')
      if (!settings.azureEndpoint) {
        throw new Error('No Azure endpoint. Add your resource URL in Settings.')
      }
      return new AzureChatOpenAI({
        // On Azure the "model" is the deployment name.
        azureOpenAIApiDeploymentName: settings.model,
        azureOpenAIEndpoint: settings.azureEndpoint,
        azureOpenAIApiKey: requireKey(settings, provider),
        azureOpenAIApiVersion: settings.azureApiVersion || '2024-10-21',
        temperature: 0
      })
    }

    case 'bedrock': {
      const { ChatBedrockConverse } = await import('@langchain/aws')
      return new ChatBedrockConverse({
        model: settings.model,
        region: settings.bedrockRegion || 'us-east-1',
        temperature: 0,
        ...(settings.awsAccessKeyId && settings.awsSecretAccessKey
          ? {
              credentials: {
                accessKeyId: settings.awsAccessKeyId,
                secretAccessKey: settings.awsSecretAccessKey
              }
            }
          : {})
      })
    }

    case 'bedrock-proxy': {
      // Bedrock Converse API behind a custom endpoint (e.g. a company proxy)
      // authenticated with a bearer API key instead of AWS SigV4 credentials.
      const { ChatBedrockConverse } = await import('@langchain/aws')
      const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime')
      if (!baseUrl) throw new Error('No Bedrock proxy endpoint. Add the Converse API URL in Settings.')
      const apiKey = requireKey(settings, provider)
      const region = settings.bedrockRegion || 'us-east-1'
      // Force the bearer-token auth scheme so the SDK skips SigV4 signing (which
      // would otherwise overwrite our Authorization header with a signature).
      const client = new BedrockRuntimeClient({
        region,
        endpoint: baseUrl,
        token: { token: apiKey },
        authSchemePreference: ['httpBearerAuth']
      })
      return new ChatBedrockConverse({ model: settings.model, region, client, temperature: 0, maxTokens: 8000 })
    }

    case 'vertex': {
      const { ChatVertexAI } = await import('@langchain/google-vertexai')
      return new ChatVertexAI({
        model: settings.model,
        location: settings.vertexLocation || 'us-central1',
        ...(settings.vertexProject ? { authOptions: { projectId: settings.vertexProject } } : {}),
        temperature: 0
      })
    }

    default:
      throw new Error(`Unknown wire protocol for ${spec.label}: ${wire}`)
  }
}
