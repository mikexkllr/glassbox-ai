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

export interface DiffSummary {
  repoPath: string
  base: string
  feature: string
  mergeBase: string | null
  files: DiffFile[]
  totalAdditions: number
  totalDeletions: number
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type Provider = 'anthropic' | 'opencodezen' | 'ollama' | 'bedrock' | 'bedrock-proxy' | 'vertex'

export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic',
  opencodezen: 'OpenCode Zen',
  ollama: 'Ollama',
  bedrock: 'Bedrock',
  'bedrock-proxy': 'Bedrock (proxy)',
  vertex: 'Vertex'
}

export interface Settings {
  provider: Provider
  model: string
  // Anthropic
  anthropicApiKey?: string
  // OpenCode Zen (OpenAI-compatible gateway)
  opencodeZenApiKey?: string
  opencodeZenBaseUrl?: string
  // Ollama
  ollamaBaseUrl?: string
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
  // Bedrock Converse via a custom endpoint + API key (e.g. a company proxy that
  // speaks the Bedrock Converse API but authenticates with a bearer token).
  bedrockProxyEndpoint?: string
  bedrockProxyApiKey?: string
  // Vertex
  vertexProject?: string
  vertexLocation?: string
  // Investigation budget per section.
  maxFilesPerSection: number
  // Generate the next section in the background while reading the current one.
  prefetchNext: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  model: 'claude-opus-4-8',
  opencodeZenBaseUrl: 'https://opencode.ai/zen/v1',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaNumCtx: 8192,
  ollamaTemperature: 0,
  ollamaTopP: 0.9,
  ollamaTopK: 40,
  ollamaRepeatPenalty: 1.1,
  ollamaNumPredict: -1,
  ollamaKeepAlive: '5m',
  bedrockRegion: 'us-east-1',
  vertexLocation: 'us-central1',
  maxFilesPerSection: 12,
  prefetchNext: false
}

export const PROVIDER_MODELS: Record<Provider, string[]> = {
  anthropic: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  opencodezen: [
    'claude-sonnet-4-5',
    'claude-opus-4-5',
    'claude-haiku-4-5',
    'gpt-5.1',
    'gpt-5.1-codex',
    'gpt-5',
    'gemini-3-pro',
    'qwen3-coder',
    'kimi-k2-thinking'
  ],
  ollama: ['llama3.1', 'qwen2.5-coder', 'deepseek-coder-v2', 'codellama'],
  bedrock: ['anthropic.claude-3-5-sonnet-20241022-v2:0', 'anthropic.claude-3-5-haiku-20241022-v1:0'],
  'bedrock-proxy': [
    'anthropic.claude-sonnet-4-5-20250929-v1:0',
    'anthropic.claude-opus-4-1-20250805-v1:0',
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'anthropic.claude-3-5-haiku-20241022-v1:0'
  ],
  vertex: ['claude-opus-4-8', 'gemini-2.0-flash', 'gemini-1.5-pro']
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

export type ChunkChangeKind = 'added' | 'modified' | 'removed'

export interface WalkChunk extends CodeAnchor {
  id: string
  title: string
  /** What happened to this block. */
  changeKind: ChunkChangeKind
  /** One always-visible line: what changed here (shown even in gist mode). */
  gist: string
  story: ChunkStory
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

export interface QuizQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number
  explanation: string
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
  updatedAt: number
}

// ---------------------------------------------------------------------------
// IPC surface (typed window.glassbox)
// ---------------------------------------------------------------------------

export interface GlassboxApi {
  pickRepo: () => Promise<string | null>
  listBranches: (repoPath: string) => Promise<{ branches: string[]; current: string; defaultBase: string }>
  computeDiff: (repoPath: string, base: string, feature: string) => Promise<DiffSummary>
  readFileContent: (repoPath: string, ref: string, file: string) => Promise<string>

  getSettings: () => Promise<Settings>
  saveSettings: (settings: Settings) => Promise<Settings>
  testModel: () => Promise<{ ok: boolean; message: string }>
  listOllamaModels: (baseUrl: string) => Promise<{ ok: boolean; models: string[]; message?: string }>

  generateOverview: (diff: DiffSummary) => Promise<Overview>
  generateSection: (diff: DiffSummary, plan: SectionPlan) => Promise<WalkthroughSection>
  askWhy: (diff: DiffSummary, question: string, context: string) => Promise<{ answer: string; trail: TrailEntry[] }>
  chat: (diff: DiffSummary, history: ChatMessage[], question: string) => Promise<{ answer: string; trail: TrailEntry[] }>
  explainDeeper: (diff: DiffSummary, anchor: CodeAnchor, current: string) => Promise<{ answer: string; trail: TrailEntry[] }>
  scoreAnswer: (diff: DiffSummary, question: string, reference: string, userAnswer: string) => Promise<ScoreResult>
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
