import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { Settings } from '@shared/types'

/**
 * Build a LangChain chat model from the user's settings.
 * One factory, four providers — the rest of the agent is provider-agnostic.
 */
export async function makeModel(settings: Settings): Promise<BaseChatModel> {
  switch (settings.provider) {
    case 'anthropic': {
      const { ChatAnthropic } = await import('@langchain/anthropic')
      const apiKey = settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('No Anthropic API key. Add one in Settings or set ANTHROPIC_API_KEY.')
      return new ChatAnthropic({
        model: settings.model,
        apiKey,
        temperature: 0,
        maxTokens: 8000
      })
    }
    case 'opencodezen': {
      const { ChatOpenAI } = await import('@langchain/openai')
      const apiKey = settings.opencodeZenApiKey || process.env.OPENCODE_ZEN_API_KEY || process.env.OPENCODE_API_KEY
      if (!apiKey) throw new Error('No OpenCode Zen API key. Add one in Settings (get it at opencode.ai/auth).')
      return new ChatOpenAI({
        model: settings.model,
        apiKey,
        temperature: 0,
        configuration: { baseURL: settings.opencodeZenBaseUrl || 'https://opencode.ai/zen/v1' }
      })
    }
    case 'ollama': {
      const { ChatOllama } = await import('@langchain/ollama')
      return new ChatOllama({
        model: settings.model,
        baseUrl: settings.ollamaBaseUrl || 'http://localhost:11434',
        temperature: settings.ollamaTemperature ?? 0,
        numCtx: settings.ollamaNumCtx ?? 8192,
        topP: settings.ollamaTopP ?? 0.9,
        topK: settings.ollamaTopK ?? 40,
        repeatPenalty: settings.ollamaRepeatPenalty ?? 1.1,
        numPredict: settings.ollamaNumPredict ?? -1,
        keepAlive: settings.ollamaKeepAlive || '5m'
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
      const apiKey = settings.bedrockProxyApiKey || process.env.AWS_BEARER_TOKEN_BEDROCK
      if (!settings.bedrockProxyEndpoint) throw new Error('No Bedrock proxy endpoint. Add the Converse API URL in Settings.')
      if (!apiKey) throw new Error('No Bedrock proxy API key. Add one in Settings or set AWS_BEARER_TOKEN_BEDROCK.')
      const region = settings.bedrockRegion || 'us-east-1'
      // Force the bearer-token auth scheme so the SDK skips SigV4 signing (which
      // would otherwise overwrite our Authorization header with a signature).
      const client = new BedrockRuntimeClient({
        region,
        endpoint: settings.bedrockProxyEndpoint,
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
      throw new Error(`Unknown provider: ${settings.provider}`)
  }
}
