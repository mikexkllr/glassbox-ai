// Shared types — the contract between the main process (git + agent) and the renderer (UI).

// ---------------------------------------------------------------------------
// Diff model
// ---------------------------------------------------------------------------

export type DiffLineType = 'add' | 'del' | 'context'

export interface DiffLine {
  type: DiffLineType
  content: string
  /** 1-based line number in the old file (null for added lines). */
  oldLine: number | null
  /** 1-based line number in the new file (null for deleted lines). */
  newLine: number | null
}

export interface DiffHunk {
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export type FileChangeKind = 'added' | 'deleted' | 'modified' | 'renamed'

export interface DiffFile {
  /** Path in the feature branch (or old path if deleted). */
  path: string
  oldPath: string | null
  kind: FileChangeKind
  language: string
  additions: number
  deletions: number
  binary: boolean
  hunks: DiffHunk[]
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

/**
 * One selectable ref in the branch picker. Local branches and remote-tracking
 * branches are both listed (a local `feature` and `origin/feature` are separate
 * entries) so the reader can diff either side explicitly instead of guessing
 * which one git will resolve.
 */
export interface BranchInfo {
  /** The ref as passed to git: `main` or `origin/feature-x`. */
  name: string
  /** Display name with any remote prefix stripped: `feature-x`. */
  short: string
  kind: 'local' | 'remote'
  /** Remote name for remote-tracking refs (`origin`), null for local ones. */
  remote: string | null
  /** True for the branch currently checked out in the working tree. */
  current: boolean
  sha: string
  /** Subject line of the tip commit. */
  subject: string
  /** Tip commit time, unix ms — used for recency sorting and "2d ago". */
  committedAt: number
  /**
   * For a local branch, the remote-tracking ref it's compared against: its
   * configured upstream, or `origin/<name>` when one exists. Null when the
   * branch only exists locally (nothing to be ahead of).
   */
  upstream: string | null
  /** Commits this local branch has that its upstream doesn't. */
  ahead: number
  /** Commits the upstream has that this local branch doesn't. */
  behind: number
  /** For a remote ref: whether a local branch of the same name exists. */
  hasLocal?: boolean
}

/** Result of enumerating a repo's branches, plus how fresh the remote data is. */
export interface BranchList {
  branches: BranchInfo[]
  /** Checked-out branch name, or '' in a detached HEAD. */
  current: string
  defaultBase: string
  /** Whether this listing was preceded by a successful `git fetch`. */
  fetched: boolean
  /** Why the fetch failed (offline, no remote, auth), if it did. */
  fetchError: string | null
  /** Unix ms the listing was produced. */
  fetchedAt: number
}

/**
 * How a journey was started: 'pr' walks a branch-vs-branch diff; 'topic' walks
 * the codebase at one commit, guided by a question ("how does auth work?").
 * Topic journeys reuse the DiffSummary shape with an empty file list so the
 * whole pipeline (IPC, caching, worktrees, sections) works unchanged.
 */
export type JourneyMode = 'pr' | 'topic'

export interface DiffSummary {
  repoPath: string
  base: string
  feature: string
  /** Defaults to 'pr' when absent (older cached sessions). */
  mode?: JourneyMode
  /** The question/topic driving a topic journey. */
  topic?: string
  // Resolved commit SHAs of the two endpoints, captured when the diff was
  // computed. Used to key the walkthrough cache so a moved/different branch
  // regenerates instead of serving a stale or cross-loaded walkthrough.
  baseSha: string
  featureSha: string
  mergeBase: string | null
  files: DiffFile[]
  totalAdditions: number
  totalDeletions: number
}

// ---------------------------------------------------------------------------
// Settings — the provider registry
// ---------------------------------------------------------------------------

export type Provider =
  // Model providers, straight to the source
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'mistral'
  // Gateways — one key, many models
  | 'opencodego'
  | 'opencodezen'
  | 'openrouter'
  | 'github'
  | 'groq'
  | 'cerebras'
  | 'together'
  | 'fireworks'
  // Local & bring-your-own endpoint
  | 'ollama'
  | 'lmstudio'
  | 'custom'
  // Enterprise clouds
  | 'bedrock'
  | 'bedrock-proxy'
  | 'vertex'
  | 'azure'

/**
 * The wire protocol a provider speaks. This — not the provider id — decides
 * which LangChain chat model gets built, which is why most new providers are a
 * single registry entry and no new code: they all speak `openai` at a
 * different base URL.
 */
export type ProviderWire =
  /** POST {baseUrl}/chat/completions */
  | 'openai'
  /** POST {baseUrl}/responses */
  | 'responses'
  /** POST {baseUrl}/messages */
  | 'anthropic'
  /** Gemini generateContent */
  | 'google'
  | 'ollama'
  | 'azure'
  | 'bedrock'
  | 'bedrock-proxy'
  | 'vertex'

/**
 * A gateway that fronts several labs serves each model on the protocol that
 * lab speaks, so the wire can't be a property of the provider alone. 'auto'
 * asks the gateway's own catalog which one to use; anything else pins it.
 */
export type WireChoice = ProviderWire | 'auto'

/** Which heading a provider sits under in the Settings picker. */
export type ProviderGroup = 'lab' | 'gateway' | 'local' | 'cloud'

export const PROVIDER_GROUPS: { id: ProviderGroup; label: string }[] = [
  { id: 'lab', label: 'Model providers' },
  { id: 'gateway', label: 'Gateways — one key, many models' },
  { id: 'local', label: 'Local & custom endpoints' },
  { id: 'cloud', label: 'Enterprise clouds' }
]

export interface ProviderSpec {
  label: string
  wire: ProviderWire
  group: ProviderGroup
  /** One line on what this provider is, shown under the picker. */
  blurb: string
  /** Default API base URL. Every provider with an editable endpoint has one. */
  baseUrl?: string
  /** Env vars consulted, in order, when no key is saved in Settings. */
  envKeys?: string[]
  /** Where to get a key — shown in the key field's hint. */
  keyUrl?: string
  /** Local servers that want no key at all. */
  keyless?: boolean
  /** Suggested model ids. A hint for the picker, never a closed set. */
  models: string[]
  /**
   * This gateway routes each model on its lab's own protocol, so the wire is
   * resolved per model from `{baseUrl}/v1/models` rather than fixed here.
   */
  multiWire?: boolean
  /** Extra request headers this provider asks clients to send. */
  headers?: Record<string, string>
}

/**
 * Everything Glassbox knows about a provider. Adding an OpenAI-compatible
 * service means adding one entry here — the model factory and the Settings
 * screen are both driven off this table.
 */
export const PROVIDERS: Record<Provider, ProviderSpec> = {
  anthropic: {
    label: 'Anthropic',
    wire: 'anthropic',
    group: 'lab',
    blurb: 'Claude, direct from Anthropic. The best results for this kind of code reading.',
    baseUrl: 'https://api.anthropic.com',
    envKeys: ['ANTHROPIC_API_KEY'],
    keyUrl: 'console.anthropic.com/settings/keys',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1', 'claude-opus-4-8']
  },
  openai: {
    label: 'OpenAI',
    wire: 'responses',
    group: 'lab',
    blurb: 'GPT models on the Responses API.',
    baseUrl: 'https://api.openai.com/v1',
    envKeys: ['OPENAI_API_KEY'],
    keyUrl: 'platform.openai.com/api-keys',
    models: ['gpt-6.1-terra', 'gpt-6.1-terra-pro', 'gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra']
  },
  google: {
    label: 'Google Gemini',
    wire: 'google',
    group: 'lab',
    blurb: 'Gemini through AI Studio — a generous free tier to try Glassbox on.',
    baseUrl: 'https://generativelanguage.googleapis.com',
    envKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    keyUrl: 'aistudio.google.com/apikey',
    models: ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.7-flash']
  },
  xai: {
    label: 'xAI',
    wire: 'openai',
    group: 'lab',
    blurb: 'Grok, with a large context window.',
    baseUrl: 'https://api.x.ai/v1',
    envKeys: ['XAI_API_KEY'],
    keyUrl: 'console.x.ai',
    models: ['grok-4.7', 'grok-4.6']
  },
  deepseek: {
    label: 'DeepSeek',
    wire: 'openai',
    group: 'lab',
    blurb: 'Strong coding models at a low price per token.',
    baseUrl: 'https://api.deepseek.com/v1',
    envKeys: ['DEEPSEEK_API_KEY'],
    keyUrl: 'platform.deepseek.com/api_keys',
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  mistral: {
    label: 'Mistral',
    wire: 'openai',
    group: 'lab',
    blurb: 'Mistral and Codestral, hosted in the EU.',
    baseUrl: 'https://api.mistral.ai/v1',
    envKeys: ['MISTRAL_API_KEY'],
    keyUrl: 'console.mistral.ai/api-keys',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'codestral-latest']
  },

  opencodego: {
    label: 'OpenCode Go',
    wire: 'openai',
    group: 'gateway',
    multiWire: true,
    blurb: 'A flat monthly subscription covering ~28 coding models. Built for agents like this one.',
    baseUrl: 'https://opencode.ai/inference/go',
    envKeys: ['OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY'],
    keyUrl: 'opencode.ai/auth',
    models: [
      'kimi-k3.1-pro',
      'gpt-6-luna',
      'claude-haiku-5-5',
      'grok-4.7',
      'gemini-4-argon',
      'glm-5.3',
      'deepseek-v4-pro',
      'qwen3.8-max',
      'minimax-m3',
      'kimi-k3',
      'mimo-v2.6-pro',
      'hy4-preview',
      'longcat-2.0',
      'beam-free'
    ]
  },
  opencodezen: {
    label: 'OpenCode Zen',
    wire: 'openai',
    group: 'gateway',
    multiWire: true,
    blurb: 'OpenCode pay-as-you-go: the full catalog, billed per request, including Opus and GPT.',
    baseUrl: 'https://opencode.ai/inference',
    envKeys: ['OPENCODE_ZEN_API_KEY', 'OPENCODE_API_KEY'],
    keyUrl: 'opencode.ai/auth',
    models: [
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
      'gpt-6.1-sol',
      'gpt-6-luna',
      'gemini-4-argon',
      'grok-4.7',
      'kimi-k3',
      'glm-5.3',
      'minimax-m3',
      'qwen3.8-max',
      'beam-free'
    ]
  },
  openrouter: {
    label: 'OpenRouter',
    wire: 'openai',
    group: 'gateway',
    blurb: 'Several hundred models behind one key, with per-model pricing.',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKeys: ['OPENROUTER_API_KEY'],
    keyUrl: 'openrouter.ai/keys',
    models: [
      'anthropic/claude-opus-5.5',
      'anthropic/claude-sonnet-5.5',
      'openai/gpt-6.1-terra',
      'google/gemini-4-argon',
      'x-ai/grok-4.7',
      'deepseek/deepseek-v4.1-flash',
      'moonshotai/kimi-k3.1-pro',
      'z-ai/glm-5.3'
    ],
    headers: { 'HTTP-Referer': 'https://github.com/mikexkllr/glassbox-ai', 'X-Title': 'Glassbox' }
  },
  github: {
    label: 'GitHub Models',
    wire: 'openai',
    group: 'gateway',
    blurb: 'Free, rate-limited inference for anyone with a GitHub token.',
    baseUrl: 'https://models.github.ai/inference',
    envKeys: ['GITHUB_MODELS_TOKEN', 'GITHUB_TOKEN'],
    keyUrl: 'github.com/settings/personal-access-tokens',
    models: ['openai/gpt-5', 'openai/gpt-5-mini', 'xai/grok-3']
  },
  groq: {
    label: 'Groq',
    wire: 'openai',
    group: 'gateway',
    blurb: 'Open-weight models served fast enough that prefetching whole chapters is cheap.',
    baseUrl: 'https://api.groq.com/openai/v1',
    envKeys: ['GROQ_API_KEY'],
    keyUrl: 'console.groq.com/keys',
    models: ['moonshotai/kimi-k2-instruct', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b']
  },
  cerebras: {
    label: 'Cerebras',
    wire: 'openai',
    group: 'gateway',
    blurb: 'The same open-weight models, faster still.',
    baseUrl: 'https://api.cerebras.ai/v1',
    envKeys: ['CEREBRAS_API_KEY'],
    keyUrl: 'cloud.cerebras.ai',
    models: ['qwen-3-coder-480b', 'llama-3.3-70b']
  },
  together: {
    label: 'Together',
    wire: 'openai',
    group: 'gateway',
    blurb: 'A broad open-weight catalog.',
    baseUrl: 'https://api.together.xyz/v1',
    envKeys: ['TOGETHER_API_KEY'],
    keyUrl: 'api.together.ai/settings/api-keys',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-Coder-480B-A35B-Instruct']
  },
  fireworks: {
    label: 'Fireworks',
    wire: 'openai',
    group: 'gateway',
    blurb: 'Open-weight models with function calling.',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    envKeys: ['FIREWORKS_API_KEY'],
    keyUrl: 'fireworks.ai/account/api-keys',
    models: ['accounts/fireworks/models/kimi-k2-instruct', 'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct']
  },

  ollama: {
    label: 'Ollama',
    wire: 'ollama',
    group: 'local',
    blurb: 'Models on your own machine. Nothing leaves it, and every chapter is free.',
    baseUrl: 'http://localhost:11434',
    keyless: true,
    models: ['qwen3-coder', 'qwen2.5-coder', 'deepseek-coder-v2', 'llama3.1']
  },
  lmstudio: {
    label: 'LM Studio',
    wire: 'openai',
    group: 'local',
    blurb: "LM Studio's local server. Load a model there, then hit Load models.",
    baseUrl: 'http://localhost:1234/v1',
    keyless: true,
    models: []
  },
  custom: {
    label: 'OpenAI-compatible',
    wire: 'openai',
    group: 'local',
    blurb: 'Any endpoint that speaks /chat/completions — vLLM, llama.cpp, LiteLLM, a corporate gateway.',
    baseUrl: 'http://localhost:8000/v1',
    envKeys: ['OPENAI_COMPATIBLE_API_KEY'],
    models: []
  },

  bedrock: {
    label: 'Bedrock',
    wire: 'bedrock',
    group: 'cloud',
    blurb: 'AWS Bedrock with SigV4 credentials.',
    keyless: true,
    models: [
      'anthropic.claude-sonnet-4-5-20250929-v1:0',
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'anthropic.claude-3-5-haiku-20241022-v1:0'
    ]
  },
  'bedrock-proxy': {
    label: 'Bedrock (proxy)',
    wire: 'bedrock-proxy',
    group: 'cloud',
    blurb: 'A gateway that speaks the Bedrock Converse API but authenticates with a bearer token.',
    envKeys: ['AWS_BEARER_TOKEN_BEDROCK'],
    models: [
      'anthropic.claude-sonnet-4-5-20250929-v1:0',
      'anthropic.claude-opus-4-1-20250805-v1:0',
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'anthropic.claude-3-5-haiku-20241022-v1:0'
    ]
  },
  vertex: {
    label: 'Vertex AI',
    wire: 'vertex',
    group: 'cloud',
    blurb: 'Google Cloud, authenticated by your gcloud application-default credentials.',
    keyless: true,
    models: ['claude-opus-4-8', 'gemini-2.0-flash', 'gemini-1.5-pro']
  },
  azure: {
    label: 'Azure OpenAI',
    wire: 'azure',
    group: 'cloud',
    blurb: 'An Azure OpenAI deployment. The model is your deployment name.',
    envKeys: ['AZURE_OPENAI_API_KEY'],
    models: []
  }
}

export const PROVIDER_LABELS = Object.fromEntries(
  (Object.keys(PROVIDERS) as Provider[]).map((p) => [p, PROVIDERS[p].label])
) as Record<Provider, string>

export const PROVIDER_MODELS = Object.fromEntries(
  (Object.keys(PROVIDERS) as Provider[]).map((p) => [p, PROVIDERS[p].models])
) as Record<Provider, string[]>

export interface Settings {
  provider: Provider
  model: string

  /** API key per provider, so switching providers doesn't lose the last key. */
  apiKeys?: Partial<Record<Provider, string>>
  /**
   * Base URL per provider, overriding {@link ProviderSpec.baseUrl}. For the
   * OpenCode gateways this is the inference root — the per-protocol path
   * (`/openai/v1`, `/anthropic/v1`, …) is appended per model.
   */
  baseUrls?: Partial<Record<Provider, string>>
  /** Pin a multi-protocol gateway to one wire instead of asking its catalog. */
  wires?: Partial<Record<Provider, WireChoice>>

  // --- Legacy flat fields. Folded into the maps above when settings load, and
  // --- still written so an older build reading the same config keeps working.
  /** @deprecated use `apiKeys.anthropic` */
  anthropicApiKey?: string
  /** @deprecated use `apiKeys.opencodezen` */
  opencodeZenApiKey?: string
  /** @deprecated use `baseUrls.opencodezen` */
  opencodeZenBaseUrl?: string
  /** @deprecated use `baseUrls.ollama` */
  ollamaBaseUrl?: string
  /** @deprecated use `baseUrls['bedrock-proxy']` */
  bedrockProxyEndpoint?: string
  /** @deprecated use `apiKeys['bedrock-proxy']` */
  bedrockProxyApiKey?: string

  // Ollama sampling controls — genuinely Ollama-only, so not in the registry.
  ollamaNumCtx?: number
  ollamaTemperature?: number
  ollamaTopP?: number
  ollamaTopK?: number
  ollamaRepeatPenalty?: number
  ollamaNumPredict?: number
  ollamaKeepAlive?: string
  // Bedrock
  bedrockRegion?: string
  awsAccessKeyId?: string
  awsSecretAccessKey?: string
  // Vertex
  vertexProject?: string
  vertexLocation?: string
  // Azure OpenAI
  azureEndpoint?: string
  azureApiVersion?: string
  // Investigation budget per section.
  maxFilesPerSection: number
  // Generate the next section in the background while reading the current one.
  prefetchNext: boolean
  // Whether the user consented to anonymous crash reporting via Sentry.
  // undefined = not yet asked, true = opted in, false = declined.
  telemetry?: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  model: 'claude-opus-5-5',
  apiKeys: {},
  baseUrls: {},
  wires: {},
  ollamaNumCtx: 8192,
  ollamaTemperature: 0,
  ollamaTopP: 0.9,
  ollamaTopK: 40,
  ollamaRepeatPenalty: 1.1,
  ollamaNumPredict: -1,
  ollamaKeepAlive: '5m',
  bedrockRegion: 'us-east-1',
  vertexLocation: 'us-central1',
  azureApiVersion: '2024-10-21',
  maxFilesPerSection: 20,
  prefetchNext: false
}

/** The provider's endpoint: the user's override, else the registry default. */
export function providerBaseUrl(settings: Settings, provider: Provider = settings.provider): string {
  const url = settings.baseUrls?.[provider] || PROVIDERS[provider].baseUrl || ''
  return url.replace(/\/+$/, '')
}

/** The key saved in Settings. Environment fallbacks live in the main process. */
export function providerApiKey(settings: Settings, provider: Provider = settings.provider): string {
  return settings.apiKeys?.[provider] ?? ''
}

/** How this provider's model should be reached, if the user pinned it. */
export function providerWire(settings: Settings, provider: Provider = settings.provider): WireChoice {
  const spec = PROVIDERS[provider]
  return settings.wires?.[provider] || (spec.multiWire ? 'auto' : spec.wire)
}

// ---------------------------------------------------------------------------
// Walkthrough — the agent's structured output
// ---------------------------------------------------------------------------

/** A reference into the diff/repo a piece of explanation is anchored to. */
export interface CodeAnchor {
  file: string
  startLine: number
  endLine: number
}

export interface ChunkStory {
  /** What the chunk does. */
  what: string
  /** How it fits into the overall change. */
  fits: string
  /** What calls it / what it calls (call-site context). */
  calledBy: string
  /** A subtle point, edge case, or watch-out worth knowing. Optional. */
  gotcha?: string
}

/** 'context' = not part of a diff — existing code explored in a topic journey. */
export type ChunkChangeKind = 'added' | 'modified' | 'removed' | 'context'

/** A "predict before you read" question about one block, asked while only its code is visible. */
export interface ChunkCheck {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

export interface WalkChunk extends CodeAnchor {
  id: string
  title: string
  /** What happened to this block. */
  changeKind: ChunkChangeKind
  /** One always-visible line: what changed here (shown even in gist mode). */
  gist: string
  story: ChunkStory
  /** The lesson's question for this block. Absent on older cached sessions — lessons fall back to a gist question. */
  check?: ChunkCheck
}

export type SymbolKind = 'variable' | 'function' | 'type' | 'constant' | 'parameter' | 'import' | 'other'

/** Hover explanation for a symbol: what it is, where it came from, what it holds here. */
export interface InlineExplanation {
  symbol: string
  file: string
  line: number
  kind: SymbolKind
  gist: string
  deep: string
}

export interface TraceStep {
  file: string
  line: number
  label: string
  exampleValue?: string
}

/** A value the reader can watch flow through the change. */
export interface TraceableValue {
  id: string
  name: string
  description: string
  steps: TraceStep[]
}

export interface SelfCheck {
  prompt: string
  answer: string
}

export type FindingSeverity = 'bug' | 'smell' | 'nit' | 'question'

/**
 * A potential issue the agent — acting as a reviewer — spotted in a section.
 * It's the quarry for the Bug Hunt: kept hidden behind a vague `hint` until the
 * reader spots it (or reveals it), then the deep `explanation` teaches the why.
 */
export interface ReviewFinding {
  id: string
  file: string
  startLine: number
  endLine: number
  severity: FindingSeverity
  /** Short label, shown once found/revealed. */
  title: string
  /** A vague nudge shown during the hunt — points at the area, not the answer. */
  hint: string
  /** The deep "why this is a problem" explanation, revealed on find. */
  explanation: string
  /** How a reviewer would ask for it to be fixed. Optional. */
  suggestion?: string
}

/**
 * A flag the reader raised while reviewing — either a hit on a {@link ReviewFinding}
 * or their own free-form concern. Feeds the final review draft and the rewards.
 */
export interface UserFinding {
  id: string
  sectionId: string
  file: string
  startLine: number
  endLine: number
  note: string
  severity: FindingSeverity
  /** The ReviewFinding this flag matched, if any. */
  matchedId?: string
  /** 0-100 substance score from the AI for a free-form (unmatched) flag. */
  aiScore?: number
  createdAt: number
}

/** The AI's verdict on a free-form user flag (anti-farming + teaching). */
export interface FindingAssessment {
  score: number // 0-100: how real/substantiated the concern is
  verdict: string // one short line
  reasoning: string // why it is (or isn't) a genuine issue, grounded in the code
  severity: FindingSeverity
}

/**
 * A hands-on "your turn" exercise built from a chapter's code: the reader
 * completes starter code in a tiny editor and the AI scores their attempt
 * against the reference solution. The chapter's coding mini-game.
 */
export interface CodingChallenge {
  id: string
  title: string
  /** The task in plain language: what to implement/complete and why it matters here. */
  brief: string
  /** Language of the snippet, e.g. "typescript" — display only. */
  language: string
  /** Starter code containing a clearly marked gap (e.g. a TODO) the reader fills in. */
  starterCode: string
  /** The reference solution — used to score the attempt, revealed afterwards. */
  referenceSolution: string
  /** 1-3 progressive hints; each one the reader takes shaves the reward. */
  hints: string[]
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface QuizQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

/** What an architecture question probes. */
export type ArchFacet = 'shape' | 'data' | 'flow' | 'boundary' | 'risk'

export interface ArchQuestion {
  id: string
  facet: ArchFacet
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

/**
 * The guess-first warm-up played BEFORE any section: the system at 10,000 feet —
 * its shape, the data structures it moves around, the order things happen in.
 * The point is to commit to a mental model (and find out where it's wrong)
 * before reading a single line of the diff.
 */
export interface ArchChallenge {
  /** What the stages describe, e.g. "one diff, from branch pick to rendered walkthrough". */
  flowLabel?: string
  /** 3-6 stages of the main flow, in the real order — shuffled for the reader to sort. */
  stages: string[]
  /** High-level multiple-choice guesses about the architecture. */
  questions: ArchQuestion[]
}

/** Result of the AI scoring a user's free-text answer. */
export interface ScoreResult {
  score: number // 0-100
  verdict: string // one short line
  good: string // what the user got right
  missing: string // what they missed or got wrong
}

export type ReviewDecision = 'approve' | 'request_changes' | 'comment'

export interface ReviewDraft {
  decision: ReviewDecision
  summary: string
  positives: string[]
  concerns: string[]
  body: string
}

/** One section of the walkthrough — returned by submit_walkthrough_section. */
export interface WalkthroughSection {
  id: string
  title: string
  plainSummaryGist: string
  plainSummaryDeep: string
  files: string[]
  chunks: WalkChunk[]
  inlineExplanations: InlineExplanation[]
  traceableValues: TraceableValue[]
  selfCheck?: SelfCheck
  /** Brilliant-style "aha" insights / gotchas about this code. */
  insights: string[]
  /** Quiz questions to test understanding (and earn coins). */
  quiz: QuizQuestion[]
  /** A hands-on coding exercise built from this section's code. Optional. */
  codingChallenge?: CodingChallenge
  /** Potential issues a reviewer might flag — the quarry for the Bug Hunt. */
  reviewFindings: ReviewFinding[]
  /** Files the agent actually read/grepped to build this section. */
  investigationTrail: TrailEntry[]
}

export interface TrailEntry {
  tool: string
  target: string
  detail?: string
}

/** The big-picture overview + the section plan (cheap first pass). */
export interface Overview {
  title: string
  /** Plain-language: what does this PR do and why. */
  whatGist: string
  whatDeep: string
  why: string
  /** High-level bullet highlights. */
  highlights: string[]
  /** The architecture warm-up shown before the sections. Absent on older cached sessions. */
  archChallenge?: ArchChallenge
  sections: SectionPlan[]
}

export interface SectionPlan {
  id: string
  title: string
  /** One-line teaser of what this section covers. */
  teaser: string
  files: string[]
}

// ---------------------------------------------------------------------------
// Streaming agent events (main -> renderer)
// ---------------------------------------------------------------------------

export type AgentEvent =
  | { kind: 'status'; scope: string; message: string }
  | { kind: 'tool'; scope: string; entry: TrailEntry }
  | { kind: 'token'; scope: string; text: string }
  | { kind: 'done'; scope: string }
  | { kind: 'error'; scope: string; message: string }

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  trail?: TrailEntry[]
}

// ---------------------------------------------------------------------------
// Persisted session (per repo+base+feature)
// ---------------------------------------------------------------------------

export interface PersistedSession {
  key: string
  repoPath: string
  base: string
  feature: string
  overview?: Overview
  sections: Record<string, WalkthroughSection>
  walked: string[]
  /** Flags the reader raised during the Bug Hunt / review. */
  findings: UserFinding[]
  updatedAt: number
}

// ---------------------------------------------------------------------------
// IPC surface (typed window.glassbox)
// ---------------------------------------------------------------------------

export interface GlassboxApi {
  /** The host OS, e.g. 'darwin' | 'win32' | 'linux'. */
  platform: string
  pickRepo: () => Promise<string | null>
  /** Enumerate branches. `doFetch` updates remote-tracking refs first (slow); pass false for an instant local listing. */
  listBranches: (repoPath: string, doFetch?: boolean) => Promise<BranchList>
  computeDiff: (repoPath: string, base: string, feature: string) => Promise<DiffSummary>
  /** Snapshot of the repo pinned to `branch` (freshly fetched; defaults to current HEAD if omitted), seeded with a question/topic (topic journey). */
  computeTopicSnapshot: (repoPath: string, topic: string, branch?: string) => Promise<DiffSummary>
  readFileContent: (repoPath: string, ref: string, file: string) => Promise<string>

  getSettings: () => Promise<Settings>
  saveSettings: (settings: Settings) => Promise<Settings>
  testModel: () => Promise<{ ok: boolean; message: string }>
  /**
   * Ask the provider configured in `settings` what it can serve. Takes the
   * unsaved draft so the picker reflects a key/URL typed a second ago.
   */
  listModels: (settings: Settings) => Promise<{ ok: boolean; models: string[]; message?: string }>

  generateOverview: (diff: DiffSummary) => Promise<Overview>
  generateSection: (diff: DiffSummary, plan: SectionPlan) => Promise<WalkthroughSection>
  askWhy: (diff: DiffSummary, question: string, context: string) => Promise<{ answer: string; trail: TrailEntry[] }>
  chat: (diff: DiffSummary, history: ChatMessage[], question: string, context?: string) => Promise<{ answer: string; trail: TrailEntry[] }>
  explainDeeper: (diff: DiffSummary, anchor: CodeAnchor, current: string) => Promise<{ answer: string; trail: TrailEntry[] }>
  scoreAnswer: (diff: DiffSummary, question: string, reference: string, userAnswer: string) => Promise<ScoreResult>
  /** AI-validate a free-form review flag the user raised (anti-farming + teaching). */
  assessFinding: (diff: DiffSummary, anchor: CodeAnchor, note: string) => Promise<FindingAssessment>
  generateReview: (diff: DiffSummary, decision: ReviewDecision, notes: string) => Promise<ReviewDraft>

  loadSession: (key: string) => Promise<PersistedSession | null>
  saveSession: (session: PersistedSession) => Promise<void>

  onAgentEvent: (cb: (event: AgentEvent) => void) => () => void
}

declare global {
  interface Window {
    glassbox: GlassboxApi
  }
}
